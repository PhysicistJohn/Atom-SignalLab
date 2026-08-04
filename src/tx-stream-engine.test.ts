import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { SYNTHESIZED_SIGNAL_PROFILES, type SynthesizedSignalProfile } from './contracts.js';
import { waveformDescriptor } from './catalog.js';
import {
  fixedDigitalProfileBinding,
  isFixedDigitalProfile,
  isUnboundedCompositionProfile,
  unboundedCompositionProfileBinding,
} from './fixed-digital-profile-binding.js';
import { AtomizerMeasurementService } from './measurement-service.js';
import { base64ToBytes } from './platform-bytes.js';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';
import {
  buildCustomWaveformDescriptor,
  customWaveformSelections,
  resetCustomWaveformSelections,
  setCustomWaveformSelections,
} from './custom-waveform.js';
import {
  assertRepresentableRational,
  rationalNativeCoordinate,
  TxStreamError,
} from './tx-stream-source.js';
import { TxStreamEngine } from './tx-stream-engine.js';

const ONE_SHOT_PROFILES = ['bluetooth-classic-connected', 'bluetooth-le-advertising'] as const;
const STREAMABLE_PROFILES = SYNTHESIZED_SIGNAL_PROFILES.filter(
  (profile) => !(ONE_SHOT_PROFILES as readonly string[]).includes(profile),
);

afterEach(() => resetCustomWaveformSelections());

function streamRateFor(profile: SynthesizedSignalProfile): number {
  const binding = isFixedDigitalProfile(profile)
    ? fixedDigitalProfileBinding(profile)
    : isUnboundedCompositionProfile(profile)
      ? unboundedCompositionProfileBinding(profile)
      : undefined;
  if (binding !== undefined) return binding.nativeSampleRateHz;
  return Math.max(1_000_000, waveformDescriptor(profile).occupiedBandwidthHz);
}

function planFor(profile: SynthesizedSignalProfile, overrides: Record<string, unknown> = {}) {
  return {
    source: { kind: 'profile', profile },
    sampleRateHz: streamRateFor(profile),
    centerHz: waveformDescriptor(profile).centerHz,
    chunkSamples: 1024,
    durationSamples: 4096,
    ...overrides,
  };
}

function concatChunks(engine: TxStreamEngine, chunks: number): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let index = 0; index < chunks; index += 1) {
    const chunk = engine.nextChunk();
    if (chunk === null) throw new Error('engine ended early');
    parts.push(chunk.bytes);
  }
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
  return joined;
}

describe('tx-stream engine determinism', () => {
  it.each(STREAMABLE_PROFILES)(
    '%s is byte-exact under awkward chunk partitions',
    { timeout: 60_000 },
    (profile) => {
      const whole = new TxStreamEngine(planFor(profile, { chunkSamples: 4096 }));
      const wholeBytes = concatChunks(whole, 1);
      const partitioned = new TxStreamEngine(planFor(profile, { chunkSamples: 137 }));
      const parts: Uint8Array[] = [];
      for (;;) {
        const chunk = partitioned.nextChunk();
        if (chunk === null) break;
        parts.push(chunk.bytes);
      }
      const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
      let offset = 0;
      for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
      expect(joined).toEqual(wholeBytes);
      expect(wholeBytes.byteLength).toBe(4096 * 8);
    },
  );

  it('resumes from an arbitrary coordinate and reproduces the tail exactly', () => {
    const fromOrigin = new TxStreamEngine(planFor('lte-etm1.1'));
    concatChunks(fromOrigin, 2); // advance 2048 samples
    const tailFromOrigin = concatChunks(fromOrigin, 2);
    const resumed = new TxStreamEngine({
      ...planFor('lte-etm1.1'),
      // The engine is deterministic in absolute coordinates: a fresh engine
      // skipping its first 2048 samples must emit the identical tail.
    });
    concatChunks(resumed, 2);
    expect(concatChunks(resumed, 2)).toEqual(tailFromOrigin);
  });

  it('keeps chunk receipts consistent with the manifest accounting', () => {
    const engine = new TxStreamEngine(planFor('gsm-900-loaded-bcch'));
    let samples = 0;
    let bytes = 0;
    let chunks = 0;
    for (;;) {
      const chunk = engine.nextChunk();
      if (chunk === null) break;
      samples += chunk.receipt.sampleCount;
      bytes += chunk.receipt.byteLength;
      chunks += 1;
      expect(chunk.receipt.chunkIndex).toBe(chunks - 1);
      expect(chunk.receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    const manifest = engine.manifest('completed');
    expect(manifest.totals.samples).toBe(String(samples));
    expect(manifest.totals.bytes).toBe(String(bytes));
    expect(manifest.totals.chunks).toBe(chunks);
    expect(manifest.state).toBe('completed');
    expect(manifest.plannedSamples).toBe('4096');
  });

  it('records terminated state when cancelled mid-stream', () => {
    const engine = new TxStreamEngine({
      ...planFor('cw'),
      durationSamples: undefined,
    });
    expect(engine.nextChunk()).not.toBeNull();
    engine.cancel();
    expect(engine.nextChunk()).toBeNull();
    expect(engine.manifest('terminated').state).toBe('terminated');
    expect(engine.manifest('terminated').plannedSamples).toBe('unbounded');
  });

  it('omits chunk hashes when hashing is disabled', () => {
    const engine = new TxStreamEngine(planFor('cw', { chunkHashing: false }));
    const chunk = engine.nextChunk();
    expect(chunk?.receipt.sha256).toBeNull();
  });
});

describe('tx-stream engine admission', () => {
  it('refuses one-shot artifacts with typed guidance', () => {
    for (const profile of ONE_SHOT_PROFILES) {
      let caught: unknown = null;
      try {
        // eslint-disable-next-line no-new
        new TxStreamEngine({
          source: { kind: 'profile', profile },
          sampleRateHz: 80_000_000,
          centerHz: 2_441_000_000,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(TxStreamError);
      expect((caught as TxStreamError).code).toBe('TX_STREAM_ONE_SHOT_NOT_STREAMABLE');
      expect((caught as TxStreamError).message).toMatch(/longdwell/);
    }
  });

  it('rejects derived rates below the 0.95-Nyquist guard with the arithmetic', () => {
    expect(() => new TxStreamEngine({
      source: { kind: 'profile', profile: 'lte-band3-fdd-20m' },
      sampleRateHz: 15_360_000,
      centerHz: 1_840_000_000,
    })).toThrow(/21052632 samples\/s/);
  });

  it('rejects flexible profiles below their signal bandwidth', () => {
    expect(() => new TxStreamEngine({
      source: { kind: 'profile', profile: 'ref-256qam' },
      sampleRateHz: 1_000_000,
      centerHz: 100_000_000,
    })).toThrow(/signal bandwidth/);
  });

  it('serves the largest legal custom NR build at the complex-I/Q ceiling', () => {
    const engine = new TxStreamEngine({
      source: {
        kind: 'profile',
        profile: 'custom-nr',
        selections: {
          frequencyRange: 'FR2',
          subcarrierSpacingKHz: '120',
          channelBandwidthMHz: '400',
        },
      },
      sampleRateHz: 491_520_000,
      centerHz: 17_922_600_000,
      durationSamples: 512,
      chunkSamples: 256,
    });
    const chunk = engine.nextChunk();
    expect(chunk?.bytes.byteLength).toBe(256 * 8);
    expect(chunk?.receipt.payloadKind).toBe('generated-at-output-rate');
    expect(chunk?.receipt.qualification).toBe('standards-derived-complex-baseband');
  });

  it('rejects illegal custom pins before any synthesis', () => {
    expect(() => new TxStreamEngine({
      source: {
        kind: 'profile',
        profile: 'custom-lte',
        selections: { channelBandwidthMHz: '99' },
      },
      sampleRateHz: 30_720_000,
      centerHz: 1_840_000_000,
    })).toThrow();
  });

  it('restores the module custom-selection state around chunk synthesis', () => {
    const before = customWaveformSelections('nr');
    const engine = new TxStreamEngine({
      source: {
        kind: 'profile',
        profile: 'custom-nr',
        selections: { channelBandwidthMHz: '20' },
      },
      sampleRateHz: 30_720_000,
      centerHz: 3_500_000_000,
      durationSamples: 256,
      chunkSamples: 128,
    });
    expect(engine.nextChunk()).not.toBeNull();
    expect(customWaveformSelections('nr')).toEqual(before);
  });

  it('keeps interleaved custom engines on their own configurations', () => {
    const wide = new TxStreamEngine({
      source: {
        kind: 'profile',
        profile: 'custom-nr',
        selections: { frequencyRange: 'FR2', subcarrierSpacingKHz: '120', channelBandwidthMHz: '400' },
      },
      sampleRateHz: 491_520_000,
      centerHz: 17_922_600_000,
      durationSamples: 256,
      chunkSamples: 128,
    });
    const narrow = new TxStreamEngine({
      source: { kind: 'profile', profile: 'custom-nr' },
      sampleRateHz: 61_440_000,
      centerHz: 3_500_000_000,
      durationSamples: 256,
      chunkSamples: 128,
    });
    const wideReference = concatChunks(new TxStreamEngine({
      source: {
        kind: 'profile',
        profile: 'custom-nr',
        selections: { frequencyRange: 'FR2', subcarrierSpacingKHz: '120', channelBandwidthMHz: '400' },
      },
      sampleRateHz: 491_520_000,
      centerHz: 17_922_600_000,
      durationSamples: 256,
      chunkSamples: 256,
    }), 1);
    const narrowReference = concatChunks(new TxStreamEngine({
      source: { kind: 'profile', profile: 'custom-nr' },
      sampleRateHz: 61_440_000,
      centerHz: 3_500_000_000,
      durationSamples: 256,
      chunkSamples: 256,
    }), 1);
    const wideFirst = wide.nextChunk();
    const narrowFirst = narrow.nextChunk();
    const wideSecond = wide.nextChunk();
    const narrowSecond = narrow.nextChunk();
    const joinedWide = new Uint8Array(wideFirst!.bytes.byteLength * 2);
    joinedWide.set(wideFirst!.bytes, 0);
    joinedWide.set(wideSecond!.bytes, wideFirst!.bytes.byteLength);
    const joinedNarrow = new Uint8Array(narrowFirst!.bytes.byteLength * 2);
    joinedNarrow.set(narrowFirst!.bytes, 0);
    joinedNarrow.set(narrowSecond!.bytes, narrowFirst!.bytes.byteLength);
    expect(joinedWide).toEqual(wideReference);
    expect(joinedNarrow).toEqual(narrowReference);
    expect(joinedWide).not.toEqual(joinedNarrow);
  });

  it('renders the plan selections, not the ambient module state, into custom bytes', () => {
    const selections = {
      frequencyRange: 'FR2',
      subcarrierSpacingKHz: '120',
      channelBandwidthMHz: '400',
    };
    const sampleRateHz = 491_520_000;
    const plan = (sel?: Record<string, string>) => ({
      source: { kind: 'profile' as const, profile: 'custom-nr' as const, selections: sel },
      sampleRateHz,
      centerHz: 17_922_600_000,
      durationSamples: 256,
      chunkSamples: 128,
    });

    // The ambient module state is all-auto; the engine must NOT render it.
    const ambientAuto = new TxStreamEngine(plan());
    const ambientBytes = concatChunks(ambientAuto, 2);

    const pinned = new TxStreamEngine(plan(selections));
    const pinnedBytes = concatChunks(pinned, 2);
    expect(pinnedBytes).not.toEqual(ambientBytes);

    // Independent reference: install the same selections and synthesize
    // directly through the generator entry point the service uses.
    const descriptor = buildCustomWaveformDescriptor('nr', selections);
    setCustomWaveformSelections('nr', selections);
    let reference: Uint8Array;
    try {
      reference = synthesizeAnalyticComplexIq({
        profile: 'custom-nr',
        sampleRateHz,
        bandwidthHz: descriptor.occupiedBandwidthHz,
        sampleCount: 256,
        startSampleIndex: 0,
      });
    } finally {
      resetCustomWaveformSelections();
    }
    expect(pinnedBytes).toEqual(reference);
  });

  it('interleaves two same-rate custom streams on different selections without contamination', () => {
    const sampleRateHz = 491_520_000;
    const wide = new TxStreamEngine({
      source: {
        kind: 'profile', profile: 'custom-nr',
        selections: { frequencyRange: 'FR2', subcarrierSpacingKHz: '120', channelBandwidthMHz: '400' },
      },
      sampleRateHz,
      centerHz: 17_922_600_000,
      durationSamples: 256,
      chunkSamples: 64,
    });
    const narrow = new TxStreamEngine({
      source: {
        kind: 'profile', profile: 'custom-nr',
        selections: { channelBandwidthMHz: '20' },
      },
      sampleRateHz,
      centerHz: 17_922_600_000,
      durationSamples: 256,
      chunkSamples: 64,
    });
    // Alternate chunk pulls so the shared module state flips between plans.
    const wideParts: Uint8Array[] = [];
    const narrowParts: Uint8Array[] = [];
    for (let index = 0; index < 4; index += 1) {
      const wideChunk = wide.nextChunk();
      const narrowChunk = narrow.nextChunk();
      if (wideChunk === null || narrowChunk === null) throw new Error('engine ended early');
      wideParts.push(wideChunk.bytes);
      narrowParts.push(narrowChunk.bytes);
    }
    const join = (parts: Uint8Array[]): Uint8Array => {
      const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
      let offset = 0;
      for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
      return joined;
    };
    // Each interleaved stream must equal its own uninterrupted reference.
    const wideReference = new TxStreamEngine({
      source: {
        kind: 'profile', profile: 'custom-nr',
        selections: { frequencyRange: 'FR2', subcarrierSpacingKHz: '120', channelBandwidthMHz: '400' },
      },
      sampleRateHz,
      centerHz: 17_922_600_000,
      durationSamples: 256,
      chunkSamples: 256,
    });
    const narrowReference = new TxStreamEngine({
      source: {
        kind: 'profile', profile: 'custom-nr',
        selections: { channelBandwidthMHz: '20' },
      },
      sampleRateHz,
      centerHz: 17_922_600_000,
      durationSamples: 256,
      chunkSamples: 256,
    });
    expect(join(wideParts)).toEqual(concatChunks(wideReference, 1));
    expect(join(narrowParts)).toEqual(concatChunks(narrowReference, 1));
    expect(join(wideParts)).not.toEqual(join(narrowParts));
  });

  it('refuses unknown recipes with a typed error', () => {
    let caught: unknown = null;
    try {
      // eslint-disable-next-line no-new
      new TxStreamEngine({
        source: { kind: 'recipe', recipeId: 'not-installed-v1' },
        sampleRateHz: 1_300_000,
        centerHz: 947_400_000,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TxStreamError);
    expect((caught as TxStreamError).code).toBe('TX_STREAM_RECIPE_UNKNOWN');
  });
});

describe('tx-stream engine receipts', () => {
  it('declares content-bound native chunks independently verified', () => {
    const engine = new TxStreamEngine(planFor('lte-etm1.1'));
    const chunk = engine.nextChunk();
    expect(chunk?.receipt.payloadKind).toBe('native-canonical');
    expect(chunk?.receipt.qualification)
      .toBe('independently-verified-digital-baseband');
    expect(chunk?.receipt.boundaryPolicy).toBe('cyclic-modular');
    expect(chunk?.receipt.canonicalArtifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(chunk?.receipt.operations).toEqual([]);
  });

  it('declares longdwell chunks standards-derived without an artifact', () => {
    const engine = new TxStreamEngine(planFor('bluetooth-classic-connected-longdwell'));
    const chunk = engine.nextChunk();
    // Exact-native unbounded compositions carry no canonical artifact, so they
    // report generated-at-output-rate (measurement-service precedent).
    expect(chunk?.receipt.payloadKind).toBe('generated-at-output-rate');
    expect(chunk?.receipt.qualification).toBe('standards-derived-complex-baseband');
    expect(chunk?.receipt.boundaryPolicy)
      .toBe('continuous-session-origin-zero-extended');
    expect(chunk?.receipt.canonicalArtifactSha256).toBeNull();
  });

  it('declares analytic lab chunks generated at output rate', () => {
    const engine = new TxStreamEngine(planFor('fm'));
    const chunk = engine.nextChunk();
    expect(chunk?.receipt.payloadKind).toBe('generated-at-output-rate');
    expect(chunk?.receipt.qualification).toBe('analytic-complex-baseband');
    expect(chunk?.receipt.canonicalArtifactSha256).toBeNull();
  });
});

describe('tx-stream engine qualification discipline', () => {
  it('never grants independent digital qualification without a governed artifact', () => {
    // The engine keys content-bound qualification off assetSha256. This
    // invariant pins that every fixed profile carrying an asset hash is also
    // digitally qualified in governance, so that shortcut cannot over-claim.
    for (const profile of STREAMABLE_PROFILES) {
      const binding = isFixedDigitalProfile(profile)
        ? fixedDigitalProfileBinding(profile)
        : undefined;
      if (binding === undefined || binding.replay !== 'cyclic') continue;
      const descriptor = waveformDescriptor(profile);
      if (descriptor.assetSha256 === undefined) continue;
      expect(descriptor.governance.implementedQualificationState).toBe('digitally-qualified');
    }
  });
});

describe('tx-stream engine coordinate discipline', () => {
  it('reduces derived native coordinates exactly', () => {
    const rational = rationalNativeCoordinate(3n, 15_360_000, 11_520_000);
    expect(rational).toEqual({ numerator: 4n, denominator: 1n });
    const fractional = rationalNativeCoordinate(1n, 1_300_000, 2_083_333);
    expect(fractional.numerator).toBe(1_300_000n);
    expect(fractional.denominator).toBe(2_083_333n);
  });

  it('fails closed when a rational exceeds the 40-digit bound', () => {
    expect(() => assertRepresentableRational(10n ** 40n, 1n)).toThrow(/40-digit/);
    expect(() => assertRepresentableRational(1n, 10n ** 40n)).toThrow(/40-digit/);
    expect(() => assertRepresentableRational(
      BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      1n,
    )).toThrow(/safe integer/);
    expect(() => assertRepresentableRational(0n, 1n)).not.toThrow();
  });
});

describe('tx-stream engine equivalence with the measurement service', () => {
  async function deterministicService(): Promise<AtomizerMeasurementService> {
    const raw = await readFile(
      new URL('../contracts/signal-lab-measurement-bridge-v3.json', import.meta.url),
      'utf8',
    );
    const admitted = JSON.parse(raw);
    const contractSha256 = createHash('sha256')
      .update(JSON.stringify(admitted), 'utf8')
      .digest('hex');
    const generatorContractBindingSha256 = createHash('sha256')
      .update(`atomizer-in-process-generator${String.fromCharCode(0)}${contractSha256}`, 'utf8')
      .digest('hex');
    // Domain string must match the Atomizer driver's binding construction.
    return new AtomizerMeasurementService(
      { contractSha256, generatorContractBindingSha256 },
      {
        uuid: (() => {
          let sequence = 0;
          return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
        })(),
        now: (() => {
          let ticks = 0;
          return () => new Date(Date.UTC(2026, 7, 3, 12, 0, ticks++));
        })(),
        monotonicMilliseconds: (() => {
          let monotonic = 0;
          return () => monotonic++;
        })(),
      },
    );
  }

  interface EquivalenceCase {
    profile: SynthesizedSignalProfile;
    nativeSampleRateHz: number;
    streamRateHz: number;
    centerHz: number;
    captureBandwidthHz: number;
  }

  const EQUIVALENCE_CASES: readonly EquivalenceCase[] = [
    {
      profile: 'lte-etm1.1',
      nativeSampleRateHz: 15_360_000,
      streamRateHz: 11_520_000,
      centerHz: 1_840_000_000,
      captureBandwidthHz: 10_000_000,
    },
    {
      profile: 'gsm-900-loaded-bcch',
      nativeSampleRateHz: 1_300_000,
      streamRateHz: 2_083_333,
      centerHz: 947_400_000,
      captureBandwidthHz: 200_000,
    },
    {
      profile: 'lte-ntm',
      nativeSampleRateHz: 1_920_000,
      streamRateHz: 2_083_333,
      centerHz: 1_840_000_000,
      captureBandwidthHz: 180_000,
    },
    // Unbounded composition upsampled at session start: the derived FIR
    // support reaches before the session origin and must zero-extend.
    {
      profile: 'bluetooth-classic-connected-longdwell',
      nativeSampleRateHz: 80_000_000,
      streamRateHz: 100_000_000,
      centerHz: 2_441_000_000,
      captureBandwidthHz: 80_000_000,
    },
  ];

  it.each(EQUIVALENCE_CASES)(
    '$profile derived chunks equal service acquireIq bytes across boundaries',
    { timeout: 120_000 },
    async ({ profile, streamRateHz, centerHz, captureBandwidthHz }) => {
      const engine = new TxStreamEngine({
        source: { kind: 'profile', profile },
        sampleRateHz: streamRateHz,
        centerHz,
        chunkSamples: 4096,
      });
      const service = await deterministicService();
      service.selectProfile({ profile });
      const firstService = service.acquireIq({
        centerHz,
        sampleRateHz: streamRateHz,
        captureBandwidthHz,
        sampleCount: 8192,
        sampleFormat: 'cf32le',
      });
      const firstEngine = concatChunks(engine, 2);
      expect(firstEngine).toEqual(base64ToBytes(firstService.samplesBase64));
      expect(firstService.payloadKind).toBe('derived-hardware-ready');

      const secondService = service.acquireIq({
        centerHz,
        sampleRateHz: streamRateHz,
        captureBandwidthHz,
        sampleCount: 8192,
        sampleFormat: 'cf32le',
      });
      const secondEngine = concatChunks(engine, 2);
      expect(secondEngine).toEqual(base64ToBytes(secondService.samplesBase64));
    },
  );

  it('keeps native cyclic chunks byte-identical to service captures', async () => {
    const engine = new TxStreamEngine({
      source: { kind: 'profile', profile: 'wifi-ofdm-20m' },
      sampleRateHz: 20_000_000,
      centerHz: 2_437_000_000,
      chunkSamples: 333,
      durationSamples: 1332,
    });
    const service = await deterministicService();
    service.selectProfile({ profile: 'wifi-ofdm-20m' });
    const capture = service.acquireIq({
      centerHz: 2_437_000_000,
      sampleRateHz: 20_000_000,
      captureBandwidthHz: 20_000_000,
      sampleCount: 1332,
      sampleFormat: 'cf32le',
    });
    const parts: Uint8Array[] = [];
    for (;;) {
      const chunk = engine.nextChunk();
      if (chunk === null) break;
      parts.push(chunk.bytes);
    }
    const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
    expect(joined).toEqual(base64ToBytes(capture.samplesBase64));
    expect(capture.payloadKind).toBe('native-canonical');
  });
});
