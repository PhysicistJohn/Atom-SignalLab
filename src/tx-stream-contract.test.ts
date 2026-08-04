import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SYNTHESIZED_SIGNAL_PROFILES } from './contracts.js';
import {
  loadTxStreamContract,
  TX_STREAM_CONTRACT_ID,
  TX_STREAM_CONTRACT_SHA256,
  TX_STREAM_CONTRACT_VERSION,
  txStreamChunkReceiptSchema,
  txStreamContractDocumentSchema,
  txStreamGeneratorBindingSha256,
} from './tx-stream-contract.js';

const CONTRACT_URL = new URL(
  '../contracts/signal-lab-tx-stream-v1.json',
  import.meta.url,
);

describe('tx-stream v1 contract document', () => {
  it('is byte-frozen at the pinned SHA-256', async () => {
    const bytes = await readFile(CONTRACT_URL);
    const { createHash } = await import('node:crypto');
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe(TX_STREAM_CONTRACT_SHA256);
  });

  it('loads through the fail-closed hash-pinned loader', async () => {
    const document = await loadTxStreamContract();
    expect(document.contractId).toBe(TX_STREAM_CONTRACT_ID);
    expect(document.contractVersion).toBe(TX_STREAM_CONTRACT_VERSION);
    expect(document.scope).toBe('host-tooling-tx-sample-stream');
    expect(document.emissionResponsibility).toBe('operator-and-hardware');
  });

  it('refuses drifted contract bytes', async () => {
    const original = await readFile(CONTRACT_URL, 'utf8');
    const drifted = original.replace('chunked-pull-single-chunk-in-flight',
      'chunked-pull-many-chunks-in-flight');
    expect(drifted).not.toBe(original);
    const dir = await mkdtemp(join(tmpdir(), 'tx-stream-contract-'));
    const driftedPath = join(dir, 'drifted.json');
    await writeFile(driftedPath, drifted, 'utf8');
    await expect(loadTxStreamContract(pathToFileURL(driftedPath)))
      .rejects.toThrow(/does not match the pinned/);
  });

  it('keeps the measurement edge bounded and trio v7 untouched', async () => {
    const document = await loadTxStreamContract();
    const relation = document.relationToMeasurementBridge;
    expect(relation.measurementEdgeUnchanged)
      .toMatch(/bounded single-buffer measurement acquisition/);
    expect(relation.trioLivenessScoping)
      .toMatch(/operator-launched host-tool subprocess outside trio composition/);
    expect(relation.driverEvolutionIntact)
      .toMatch(/new instrument\/API contract version/);
    expect(relation.stimulusSinkUnchanged)
      .toMatch(/firmwareStimulusSinkStatus/);
  });

  it('publishes the ci16le convention from live TX evidence', async () => {
    const document = await loadTxStreamContract();
    const convention = document.ci16leConvention;
    expect(convention.scale).toBe(32768);
    expect(convention.clip).toEqual([-32767, 32767]);
    expect(convention.disclosure).toMatch(/le:S16\/16>>0/);
    expect(convention.disclosure).toMatch(/RX-direction ADC format/);
    expect(document.p210DeviceEnvelope.txScanFormat).toBe('le:S16/16>>0');
    expect(document.p210DeviceEnvelope.txRfBandwidthHzMax).toBe(40_000_000);
  });

  it('carries the full non-claim list verbatim-consistently', async () => {
    const document = await loadTxStreamContract();
    const joined = document.nonClaims.join('\n');
    expect(joined).toMatch(/calibrated output level, EVM, frequency error/);
    expect(joined).toMatch(/radiated\/OTA behavior/);
    expect(joined).toMatch(/regulatory authorization/);
    expect(joined).toMatch(/standardsCompliance remains not-claimed/);
    expect(joined).toMatch(/waveform repetition at the DAC/);
    expect(document.qualificationPassthrough.hardwareReadyLimitation)
      .toMatch(/never claims DAC behavior, analog reconstruction, antenna coupling, calibrated RF emission, RF conformance, product qualification, or certification/);
  });

  it('mandates the recipe splatter/ramp disclosures', async () => {
    const document = await loadTxStreamContract();
    const joined = document.recipeDisclosureRequirements.join('\n');
    expect(joined).toMatch(/hard edges/);
    expect(joined).toMatch(/no power ramp is modeled/);
    expect(joined).toMatch(/wideband splatter/);
    expect(joined).toMatch(/not representative of a conformant transmitter/);
  });

  it('publishes capability rows for all 44 closed profiles in producer order', async () => {
    const document = await loadTxStreamContract();
    expect(document.profileCapability).toHaveLength(SYNTHESIZED_SIGNAL_PROFILES.length);
    for (const [index, row] of document.profileCapability.entries()) {
      expect(row.profileId).toBe(SYNTHESIZED_SIGNAL_PROFILES[index]);
    }
    const oneShots = document.profileCapability.filter((row) => !row.streamable);
    expect(oneShots.map((row) => row.profileId)).toEqual([
      'bluetooth-classic-connected',
      'bluetooth-le-advertising',
    ]);
    for (const refusal of oneShots) {
      expect(refusal.refusal?.code).toBe('TX_STREAM_ONE_SHOT_NOT_STREAMABLE');
      expect(refusal.refusal?.guidance).toMatch(/longdwell/);
    }
    // Guard consistency: the admitted minimum is exactly the smaller of the
    // native rate (always admitted) and the global-floor-lifted 0.95-Nyquist
    // derived guard; rate-flexible profiles admit any rate at or above their
    // signal bandwidth and the global floor.
    for (const row of document.profileCapability) {
      if (!row.streamable || row.minStreamRateHz === undefined) continue;
      const expected = row.nativeSampleRateHz === null
        ? Math.max(1_000_000, row.signalBandwidthHz)
        : Math.min(
          row.nativeSampleRateHz,
          Math.max(1_000_000, Math.ceil(row.signalBandwidthHz / 0.95)),
        );
      expect(row.minStreamRateHz).toBe(expected);
    }
  });

  it('publishes exactly the v1 recipe set', async () => {
    const document = await loadTxStreamContract();
    expect(document.recipes.map((recipe) => recipe.recipeId)).toEqual([
      'gsm-900-xcch-cycle-v1',
      'lte-band3-operational-v1',
      'nr-n78-tdd-pattern-v1',
      'wifi-ofdm-ppdu-stream-v1',
      'fm-broadcast-mpx-v1',
      'am-voice-v1',
    ]);
    // No v1 recipe is streamable to the P210 device sink at its pinned rate:
    // the GSM recipe's 1.3 MHz rate sits below the device-window floor and the
    // rest exceed the device-window ceiling. Device streaming uses profiles at
    // device-admitted rates; the GSM row documents this explicitly.
    for (const recipe of document.recipes) {
      expect(recipe.streamableOverLink).toBe(false);
    }
    const gsm = document.recipes[0]!;
    expect(gsm.schedule).toMatch(/below the P210 device-window floor/);
    expect(gsm.schedule).toMatch(/file\/stdio-only/);
  });

  it('derives the generator binding from the contract hash', () => {
    const binding = txStreamGeneratorBindingSha256(TX_STREAM_CONTRACT_SHA256);
    expect(binding).toMatch(/^[a-f0-9]{64}$/);
    expect(binding).not.toBe(TX_STREAM_CONTRACT_SHA256);
    expect(txStreamGeneratorBindingSha256(TX_STREAM_CONTRACT_SHA256)).toBe(binding);
  });

  it('re-validates the whole document through the runtime schema', async () => {
    const bytes = await readFile(CONTRACT_URL, 'utf8');
    expect(() => txStreamContractDocumentSchema.parse(JSON.parse(bytes))).not.toThrow();
  });
});

describe('tx-stream chunk receipt consistency', () => {
  const base = {
    streamId: '00000000-0000-4000-8000-000000000001',
    chunkIndex: 0,
    startSample: '0',
    sampleCount: 1024,
    byteLength: 8192,
    sampleFormat: 'cf32le',
    sha256: null,
    canonicalArtifactSha256: 'a'.repeat(64),
    nativeSampleRateHz: 15_360_000,
    outputSampleRateHz: 15_360_000,
    sourceCarrierOffsetHz: 0,
    outputCarrierOffsetHz: 0,
    operations: [],
  } as const;

  it('admits an exact native content-bound chunk', () => {
    const parsed = txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'independently-verified-digital-baseband',
      payloadKind: 'native-canonical',
      boundaryPolicy: 'cyclic-modular',
    });
    expect(parsed.payloadKind).toBe('native-canonical');
  });

  it('rejects independent qualification once any transform is declared', () => {
    expect(() => txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'independently-verified-digital-baseband',
      payloadKind: 'native-canonical',
      boundaryPolicy: 'cyclic-modular',
      nativeSampleRateHz: 30_720_000,
      outputSampleRateHz: 15_360_000,
      operations: [{
        kind: 'resample',
        algorithm: 'blackman-windowed-sinc-v1',
        sourceSampleRateHz: 30_720_000,
        outputSampleRateHz: 15_360_000,
        antiAliasCutoffHz: 0.5 * 15_360_000 * 0.95,
        zeroCrossings: 16,
      }],
    })).toThrow(/Independent digital qualification/);
  });

  it('rejects derived lineage without a canonical artifact', () => {
    expect(() => txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
      boundaryPolicy: 'cyclic-modular',
      canonicalArtifactSha256: null,
      operations: [{
        kind: 'resample',
        algorithm: 'blackman-windowed-sinc-v1',
        sourceSampleRateHz: 30_720_000,
        outputSampleRateHz: 15_360_000,
        antiAliasCutoffHz: 0.5 * 15_360_000 * 0.95,
        zeroCrossings: 16,
      }],
      nativeSampleRateHz: 30_720_000,
    })).toThrow(/Derived digital qualification/);
  });

  it('rejects generated-at-output-rate chunks claiming an artifact', () => {
    expect(() => txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'analytic-complex-baseband',
      payloadKind: 'generated-at-output-rate',
      boundaryPolicy: 'continuous-session-origin-zero-extended',
    })).toThrow(/no canonical artifact/);
  });

  it('requires a resample operation exactly when rates differ', () => {
    expect(() => txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
      boundaryPolicy: 'cyclic-modular',
      nativeSampleRateHz: 30_720_000,
    })).toThrow(/Exactly one resample operation/);
  });

  it('requires frequency translation exactly when offsets differ, before resampling', () => {
    const resample = {
      kind: 'resample',
      algorithm: 'blackman-windowed-sinc-v1',
      sourceSampleRateHz: 80_000_000,
      outputSampleRateHz: 90_000_000,
      antiAliasCutoffHz: 0.5 * 80_000_000,
      zeroCrossings: 16,
    } as const;
    expect(() => txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'standards-derived-complex-baseband',
      payloadKind: 'derived-hardware-ready',
      boundaryPolicy: 'continuous-session-origin-zero-extended',
      canonicalArtifactSha256: null,
      nativeSampleRateHz: 80_000_000,
      outputSampleRateHz: 90_000_000,
      sourceCarrierOffsetHz: -31_000_000,
      outputCarrierOffsetHz: 0,
      operations: [resample],
    })).toThrow(/frequency translation/i);
    expect(() => txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'standards-derived-complex-baseband',
      payloadKind: 'derived-hardware-ready',
      boundaryPolicy: 'continuous-session-origin-zero-extended',
      canonicalArtifactSha256: null,
      nativeSampleRateHz: 80_000_000,
      outputSampleRateHz: 90_000_000,
      sourceCarrierOffsetHz: -31_000_000,
      outputCarrierOffsetHz: 0,
      operations: [resample, {
        kind: 'frequency-translate',
        algorithm: 'complex-rotator-v1',
        sourceCarrierOffsetHz: -31_000_000,
        outputCarrierOffsetHz: 0,
      }],
    })).toThrow(/must precede resampling/);
  });

  it('ties cyclic-modular boundaries to canonical artifact identity', () => {
    expect(() => txStreamChunkReceiptSchema.parse({
      ...base,
      qualification: 'standards-derived-complex-baseband',
      payloadKind: 'native-canonical',
      boundaryPolicy: 'continuous-session-origin-zero-extended',
    })).toThrow(/Cyclic modular chunks carry a canonical artifact identity/);
  });
});
