import { describe, expect, it } from 'vitest';
import {
  iqResamplerSupport,
  resampleCf32leWindowedSinc,
  translateCf32leCarrier,
} from './iq-resampler.js';
import { AtomizerMeasurementService } from './measurement-service.js';
import { base64ToBytes } from './platform-bytes.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('deterministic hardware-ready I/Q transforms', () => {
  it('frequency-translates against absolute native sample coordinates', () => {
    const sampleRateHz = 80_000_000;
    const sourceCarrierOffsetHz = -15_000_000;
    const sourceStartSample = 37;
    const source = tone(
      sourceStartSample,
      2_048,
      sampleRateHz,
      sourceCarrierOffsetHz,
    );
    const translated = translateCf32leCarrier({
      sourceBytes: source,
      sourceStartSample,
      sampleRateHz,
      sourceCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    });
    const view = new DataView(translated.buffer);
    for (const index of [0, 1, 17, 511, 2_047]) {
      expect(view.getFloat32(index * 8, true)).toBeCloseTo(1, 5);
      expect(view.getFloat32(index * 8 + 4, true)).toBeCloseTo(0, 5);
    }
  });

  it('frequency translation is byte-identical whether processed whole or split', () => {
    const sampleRateHz = 80_000_000;
    const sourceCarrierOffsetHz = -31_000_000;
    const sourceStartSample = 37;
    const sampleCount = 2_049;
    const split = 733;
    const source = tone(
      sourceStartSample,
      sampleCount,
      sampleRateHz,
      sourceCarrierOffsetHz,
    );
    const whole = translateCf32leCarrier({
      sourceBytes: source,
      sourceStartSample,
      sampleRateHz,
      sourceCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    });
    const first = translateCf32leCarrier({
      sourceBytes: source.subarray(0, split * 8),
      sourceStartSample,
      sampleRateHz,
      sourceCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    });
    const second = translateCf32leCarrier({
      sourceBytes: source.subarray(split * 8),
      sourceStartSample: sourceStartSample + split,
      sampleRateHz,
      sourceCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    });
    const joined = new Uint8Array(whole.byteLength);
    joined.set(first);
    joined.set(second, first.byteLength);
    expect(joined).toEqual(whole);
  });

  it('preserves source Nyquist at equal and upsampled rates', () => {
    for (const outputSampleRateHz of [10_000_000, 20_000_000]) {
      const support = iqResamplerSupport({
        outputStartSourceSampleNumerator: 1n,
        outputStartSourceSampleDenominator: 3n,
        sourceSampleRateHz: 10_000_000,
        outputSampleRateHz,
        outputSampleCount: 64,
      });
      expect(support.normalizedCutoff).toBe(0.5);
      expect(support.antiAliasCutoffHz).toBe(5_000_000);
    }
  });

  it('fails closed before support synthesis when exact phase conversion is non-finite', () => {
    const scale = 10n ** 400n;
    expect(() => iqResamplerSupport({
      outputStartSourceSampleNumerator: scale,
      outputStartSourceSampleDenominator: 3n * scale,
      sourceSampleRateHz: 10_000_000,
      outputSampleRateHz: 10_000_000,
      outputSampleCount: 64,
    })).toThrow(/below deterministic Number resolution/i);
  });

  it('uses zero extension at one-shot boundaries instead of renormalizing missing taps', () => {
    const geometry = {
      outputStartSourceSampleNumerator: 1n,
      outputStartSourceSampleDenominator: 4n,
      sourceSampleRateHz: 10_000_000,
      outputSampleRateHz: 10_000_000,
      outputSampleCount: 1,
    };
    const support = iqResamplerSupport(geometry);
    const atStart = constantCf32(
      support.sourceEndSample - support.sourceStartSample + 1,
      0,
    );
    const atStartView = new DataView(atStart.buffer);
    for (let nativeIndex = 0; nativeIndex <= support.sourceEndSample; nativeIndex += 1) {
      atStartView.setFloat32((nativeIndex - support.sourceStartSample) * 8, 1, true);
    }
    const first = resampleCf32leWindowedSinc({
      ...geometry,
      sourceBytes: atStart,
      sourceStartSample: support.sourceStartSample,
    });
    const firstAmplitude = new DataView(first.buffer).getFloat32(0, true);
    expect(firstAmplitude).toBeGreaterThan(1.05);
    expect(firstAmplitude).toBeLessThan(1.25);

    const endGeometry = {
      ...geometry,
      outputStartSourceSampleNumerator: 39n,
    };
    const endSupport = iqResamplerSupport(endGeometry);
    const oneShotWithZeroPad = constantCf32(
      endSupport.sourceEndSample - endSupport.sourceStartSample + 1,
      0,
    );
    const paddedView = new DataView(oneShotWithZeroPad.buffer);
    for (let index = 0; index <= 10; index += 1) {
      paddedView.setFloat32((index - endSupport.sourceStartSample) * 8, 1, true);
    }
    const last = resampleCf32leWindowedSinc({
      ...endGeometry,
      sourceBytes: oneShotWithZeroPad,
      sourceStartSample: endSupport.sourceStartSample,
    });
    const lastAmplitude = new DataView(last.buffer).getFloat32(0, true);
    expect(lastAmplitude).toBeGreaterThan(1.05);
    expect(lastAmplitude).toBeLessThan(1.25);
  });

  it('attenuates content beyond the output Nyquist guard while retaining passband content', () => {
    const geometry = {
      outputStartSourceSampleNumerator: 1_000n,
      outputStartSourceSampleDenominator: 1n,
      sourceSampleRateHz: 10_000_000,
      outputSampleRateHz: 2_000_000,
      outputSampleCount: 256,
    };
    const support = iqResamplerSupport(geometry);
    const sampleCount = support.sourceEndSample - support.sourceStartSample + 1;
    const low = resampleCf32leWindowedSinc({
      ...geometry,
      sourceStartSample: support.sourceStartSample,
      sourceBytes: tone(
        support.sourceStartSample,
        sampleCount,
        geometry.sourceSampleRateHz,
        200_000,
      ),
    });
    const rejected = resampleCf32leWindowedSinc({
      ...geometry,
      sourceStartSample: support.sourceStartSample,
      sourceBytes: tone(
        support.sourceStartSample,
        sampleCount,
        geometry.sourceSampleRateHz,
        2_000_000,
      ),
    });
    expect(rms(low)).toBeGreaterThan(0.9);
    expect(rms(rejected)).toBeLessThan(0.02);
  });

  it.each([
    ['bluetooth-classic-connected', 2_410_000_000, -31_000_000],
    ['bluetooth-le-advertising', 2_426_000_000, -15_000_000],
  ] as const)('translates %s to DC before a 2.3 Msps hardware-ready resample', (
    profile,
    profileReferenceCenterHz,
    nativeCarrierOffsetHz,
  ) => {
    const service = deterministicService();
    service.selectProfile({ profile });
    const derived = service.acquireIq({
      centerHz: profileReferenceCenterHz,
      sampleRateHz: 2_300_000,
      captureBandwidthHz: 1_000_000,
      sampleCount: 256,
      sampleFormat: 'cf32le',
    });
    expect(derived).toMatchObject({
      profileReferenceCenterHz,
      rfReferenceCenterHz: 2_441_000_000,
      rfPlacement: 'profile-reference',
      nativeCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
      rfTuneCenterHz: profileReferenceCenterHz,
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
      representation: 'derived-complex-envelope',
      normalization: 'none',
    });
    expect(derived.transformReceipt.operations).toMatchObject([
      {
        kind: 'frequency-translate',
        algorithm: 'complex-rotator-v1',
        sourceCarrierOffsetHz: nativeCarrierOffsetHz,
        outputCarrierOffsetHz: 0,
      },
      {
        kind: 'resample',
        algorithm: 'blackman-windowed-sinc-v1',
        sourceSampleRateHz: 80_000_000,
        outputSampleRateHz: 2_300_000,
      },
    ]);
    expect(rms(base64ToBytes(derived.samplesBase64))).toBeGreaterThan(0.1);
  });

  it('keeps Bluetooth native bytes center-independent and rejects a lossy derived boundary', () => {
    const reference = deterministicService();
    reference.selectProfile({ profile: 'bluetooth-le-advertising' });
    // LE sits at a -15 MHz native offset, so a symmetric passband about
    // rfTuneCenterHz must be at least 2 * 15 + 1 = 31 MHz to hold it natively.
    const native = reference.acquireIq({
      centerHz: 2_426_000_000,
      sampleRateHz: 80_000_000,
      captureBandwidthHz: 31_000_000,
      sampleCount: 2_048,
      sampleFormat: 'cf32le',
    });
    const retuned = deterministicService();
    retuned.selectProfile({ profile: 'bluetooth-le-advertising' });
    const sameBytes = retuned.acquireIq({
      centerHz: 915_000_000,
      sampleRateHz: 80_000_000,
      captureBandwidthHz: 31_000_000,
      sampleCount: 2_048,
      sampleFormat: 'cf32le',
    });
    expect(sameBytes.samplesSha256).toBe(native.samplesSha256);
    expect(native).toMatchObject({
      qualification: 'independently-verified-digital-baseband',
      payloadKind: 'native-canonical',
      nativeCarrierOffsetHz: -15_000_000,
      outputCarrierOffsetHz: -15_000_000,
      rfTuneCenterHz: 2_441_000_000,
    });
    expect(sameBytes).toMatchObject({
      qualification: 'independently-verified-digital-baseband',
      rfPlacement: 'operator-translated',
      rfTuneCenterHz: 930_000_000,
    });

    // A request wide enough for the 1 MHz signal but too narrow to hold the
    // offset span cannot be served natively. It translates the carrier to DC,
    // which changes the bytes and downgrades the claim, and the receipt must
    // record that translation rather than silently keeping the native label.
    const translated = deterministicService();
    translated.selectProfile({ profile: 'bluetooth-le-advertising' });
    const dcCentered = translated.acquireIq({
      centerHz: 2_426_000_000,
      sampleRateHz: 80_000_000,
      captureBandwidthHz: 1_000_000,
      sampleCount: 2_048,
      sampleFormat: 'cf32le',
    });
    expect(dcCentered).toMatchObject({
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
      nativeCarrierOffsetHz: -15_000_000,
      outputCarrierOffsetHz: 0,
      rfTuneCenterHz: 2_426_000_000,
    });
    expect(dcCentered.samplesSha256).not.toBe(native.samplesSha256);
    expect(dcCentered.transformReceipt.operations).toMatchObject([
      {
        kind: 'frequency-translate',
        algorithm: 'complex-rotator-v1',
        sourceCarrierOffsetHz: -15_000_000,
        outputCarrierOffsetHz: 0,
      },
    ]);

    const lossy = deterministicService();
    lossy.selectProfile({ profile: 'bluetooth-le-advertising' });
    expect(() => lossy.acquireIq({
      centerHz: 2_426_000_000,
      sampleRateHz: 1_000_000,
      captureBandwidthHz: 1_000_000,
      sampleCount: 100,
      sampleFormat: 'cf32le',
    })).toThrow(/at least 1052632 samples\/s.*0\.95-Nyquist/i);

    const admitted = deterministicService();
    admitted.selectProfile({ profile: 'bluetooth-le-advertising' });
    expect(admitted.acquireIq({
      centerHz: 2_426_000_000,
      sampleRateHz: 1_052_632,
      captureBandwidthHz: 1_000_000,
      sampleCount: 100,
      sampleFormat: 'cf32le',
    })).toMatchObject({
      sampleRateHz: 1_052_632,
      signalBandwidthHz: 1_000_000,
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
    });
  });
});

function deterministicService(): AtomizerMeasurementService {
  let uuidSequence = 0;
  let clockSequence = 0;
  let monotonic = 0;
  return new AtomizerMeasurementService(
    { contractSha256: HASH_A, generatorContractBindingSha256: HASH_B },
    {
      uuid: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}`,
      now: () => new Date(Date.UTC(2026, 6, 27, 12, 0, clockSequence++)),
      monotonicMilliseconds: () => monotonic++,
    },
  );
}

function tone(
  startSample: number,
  sampleCount: number,
  sampleRateHz: number,
  offsetHz: number,
): Uint8Array {
  const bytes = new Uint8Array(sampleCount * 8);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < sampleCount; index += 1) {
    const angle = 2 * Math.PI * offsetHz * (startSample + index) / sampleRateHz;
    view.setFloat32(index * 8, Math.fround(Math.cos(angle)), true);
    view.setFloat32(index * 8 + 4, Math.fround(Math.sin(angle)), true);
  }
  return bytes;
}

function constantCf32(sampleCount: number, value: number): Uint8Array {
  const bytes = new Uint8Array(sampleCount * 8);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < sampleCount; index += 1) {
    view.setFloat32(index * 8, value, true);
    view.setFloat32(index * 8 + 4, 0, true);
  }
  return bytes;
}

function rms(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let power = 0;
  const sampleCount = bytes.byteLength / 8;
  for (let index = 0; index < sampleCount; index += 1) {
    const inPhase = view.getFloat32(index * 8, true);
    const quadrature = view.getFloat32(index * 8 + 4, true);
    power += inPhase * inPhase + quadrature * quadrature;
  }
  return Math.sqrt(power / sampleCount);
}
