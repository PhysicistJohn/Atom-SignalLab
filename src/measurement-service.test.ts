import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  COMPLEX_IQ_BYTES_PER_SAMPLE,
  MAX_COMPLEX_IQ_BANDWIDTH_HZ,
  MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
  MAX_COMPLEX_IQ_SAMPLES,
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MEASUREMENT_BRIDGE_CLAIMS,
  MEASUREMENT_CAPABILITIES,
  MIN_COMPLEX_IQ_BANDWIDTH_HZ,
  MIN_COMPLEX_IQ_SAMPLE_RATE_HZ,
  acquireDetectedPowerRequestSchema,
  acquireIqRequestSchema,
  acquireSpectrumRequestSchema,
  complexIqMeasurementSchema,
  measurementBridgeContractDocumentSchema,
  measurementResultSchema,
  measurementSourceStatusSchema,
  selectProfileRequestSchema,
  type MeasurementBridgeRequest,
} from './measurement-contract.js';
import { SYNTHESIZED_SIGNAL_PROFILES } from './contracts.js';
import { AtomizerMeasurementService } from './measurement-service.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('Atomizer high-level measurement source contract', () => {
  it('runtime-validates the shipped closed contract document', async () => {
    const source = await readFile(new URL('../contracts/signal-lab-measurement-bridge-v1.json', import.meta.url), 'utf8');
    const document = measurementBridgeContractDocumentSchema.parse(JSON.parse(source));
    expect(document.contractVersion).toBe(1);
    expect(document.status).toBe('active');
    expect(document.commands.map((command) => command.method)).toEqual([
      'status',
      'select_profile',
      'configure_channel',
      'acquire_spectrum',
      'acquire_detected_power',
      'acquire_iq',
      'shutdown',
    ]);
    expect(document.claims).toEqual(MEASUREMENT_BRIDGE_CLAIMS);
    expect(document.semantics.detectedPowerTuning).toBe('required-safe-integer-center-hz-returned-exactly-and-receiver-filtered-at-that-tune');
    expect(document.semantics.complexIqAvailability).toBe('all-closed-catalog-profiles-with-standards-labelled-results-explicitly-non-conformance');
    expect(document.semantics.complexIqCentering).toBe('requested-center-hz-is-the-complex-envelope-reference-and-profile-components-may-have-baseband-offsets');
    expect(document.semantics.complexIqBandwidth).toBe('independent-safe-integer-hz-no-greater-than-sample-rate-two-sided-minus-3db-span-of-bounded-first-order-real-coefficient-low-pass-initialized-from-first-sample');
    expect(document.semantics.complexIqUndersampling).toBe('wideband-standards-engineering-profiles-may-be-deterministically-aliased-below-their-catalogued-occupied-support');
    expect(document.semantics.scalarMeasurementQualification).toBe('synthetic-visual-projection-not-a-conformance-vector');
    expect(document.semantics.complexIqMeasurementQualification).toBe('profile-dependent-analytic-laboratory-or-standards-derived-engineering-not-a-conformance-vector');
    expect(() => measurementBridgeContractDocumentSchema.parse({ ...document, undeclared: true })).toThrow();
    expect(() => measurementBridgeContractDocumentSchema.parse({
      ...document,
      commands: document.commands.map((command, index) => index === 0
        ? { ...command, stateChange: true }
        : command),
    })).toThrow();
    expect(() => measurementBridgeContractDocumentSchema.parse({
      ...document,
      commands: document.commands.map((command, index) => index === 3
        ? { ...command, result: 'status' }
        : command),
    })).toThrow();
  });

  it('rejects unknown versions, fields, ranges, and profile substitutions at the request boundary', () => {
    expect(() => selectProfileRequestSchema.parse(request('select_profile', { profile: 'not-a-profile' }))).toThrow();
    expect(() => acquireSpectrumRequestSchema.parse(request('acquire_spectrum', { startHz: 200, stopHz: 100, points: 450 }))).toThrow();
    expect(() => acquireSpectrumRequestSchema.parse({ ...request('acquire_spectrum', { startHz: 100, stopHz: 200, points: 450 }), contractVersion: 2 })).toThrow();
    expect(() => acquireDetectedPowerRequestSchema.parse({
      ...request('acquire_detected_power', { centerFrequencyHz: 98_000_000, points: 4_097, samplePeriodSeconds: 0.001 }),
      undeclared: true,
    })).toThrow();
    expect(() => acquireDetectedPowerRequestSchema.parse(request('acquire_detected_power', {
      points: 128,
      samplePeriodSeconds: 0.001,
    }))).toThrow();
    for (const centerFrequencyHz of [0, 98_000_000.5, MAX_MEASUREMENT_FREQUENCY_HZ + 1]) {
      expect(() => acquireDetectedPowerRequestSchema.parse(request('acquire_detected_power', {
        centerFrequencyHz,
        points: 128,
        samplePeriodSeconds: 0.001,
      }))).toThrow();
    }
    expect(() => acquireIqRequestSchema.parse(request('acquire_iq', {
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      bandwidthHz: 1_000_001,
      sampleCount: 1_024,
      sampleFormat: 'cf32le',
    }))).toThrow(/bandwidth/i);
    expect(() => acquireIqRequestSchema.parse(request('acquire_iq', {
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      bandwidthHz: 1_000_000,
      sampleCount: MAX_COMPLEX_IQ_SAMPLES + 1,
      sampleFormat: 'cf32le',
    }))).toThrow();
    for (const bandwidthHz of [MIN_COMPLEX_IQ_BANDWIDTH_HZ - 1, MAX_COMPLEX_IQ_BANDWIDTH_HZ + 1, 1_000.5]) {
      expect(() => acquireIqRequestSchema.parse(request('acquire_iq', {
        centerHz: 98_000_000,
        sampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
        bandwidthHz,
        sampleCount: 1,
        sampleFormat: 'cf32le',
      }))).toThrow(/bandwidth/i);
    }
    expect(() => acquireIqRequestSchema.parse(request('acquire_iq', {
      centerHz: 1,
      sampleRateHz: MIN_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MIN_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: 1,
      sampleFormat: 'cf32le',
    }))).not.toThrow();
    expect(() => acquireIqRequestSchema.parse(request('acquire_iq', {
      centerHz: MAX_MEASUREMENT_FREQUENCY_HZ,
      sampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MAX_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: MAX_COMPLEX_IQ_SAMPLES,
      sampleFormat: 'cf32le',
    }))).not.toThrow();
  });

  it('publishes opaque session/configuration identity and changes revisions only through admitted configuration calls', () => {
    const service = deterministicService();
    const initial = measurementSourceStatusSchema.parse(service.status());
    expect(initial.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(initial.configurationRevision).toMatch(/^[0-9a-f-]{36}$/);
    expect(initial.configurationRevision).not.toContain(initial.profile);
    expect(initial.identity).toMatchObject({
      driverId: 'signal-lab',
      sourceKind: 'signal-lab-simulation',
      execution: 'signal-lab-simulation',
      transport: 'signal-lab-measurement-bridge',
      contractSha256: HASH_A,
      generatorSha256: HASH_B,
      claims: MEASUREMENT_BRIDGE_CLAIMS,
    });
    expect(initial.identity.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(initial.profiles).toHaveLength(34);
    expect(initial.capabilities).toEqual(MEASUREMENT_CAPABILITIES);
    expect(initial.capabilities.find(({ kind }) => kind === 'detected-power-timeseries')).toEqual({
      kind: 'detected-power-timeseries',
      minimumFrequencyHz: 1,
      maximumFrequencyHz: MAX_MEASUREMENT_FREQUENCY_HZ,
      frequencyStepHz: 1,
      frequencyUnit: 'Hz',
      minimumPoints: 1,
      maximumPoints: 4_096,
      minimumSamplePeriodSeconds: 0.000_001,
      maximumSamplePeriodSeconds: 10,
      powerUnit: 'dBm',
      qualification: 'synthetic-visual-projection',
    });
    expect(initial.capabilities.find(({ kind }) => kind === 'complex-iq')).toMatchObject({
      kind: 'complex-iq',
      minimumSampleRateHz: 1_000_000,
      maximumSampleRateHz: 245_760_000,
      minimumBandwidthHz: 1_000,
      maximumBandwidthHz: 245_760_000,
      bandwidthMode: 'independent',
      maximumSamples: MAX_COMPLEX_IQ_SAMPLES,
      sampleFormat: 'cf32le',
      encoding: 'base64',
      qualification: 'profile-dependent-complex-baseband',
      profiles: SYNTHESIZED_SIGNAL_PROFILES,
    });

    expect(() => service.configureChannel({ channel: { model: 'awgn', noiseFloorDbm: -999, seed: 1, fadingRateHz: 2 } })).toThrow();
    expect(service.status().configurationRevision).toBe(initial.configurationRevision);

    const selected = service.selectProfile({ profile: 'fm' });
    expect(selected.profile).toBe('fm');
    expect(selected.configurationRevision).not.toBe(initial.configurationRevision);
    expect(selected.configurationRevision).not.toContain('fm');
    const configured = service.configureChannel({ channel: { model: 'rayleigh', noiseFloorDbm: -120, seed: 99, fadingRateHz: 4 } });
    expect(configured.configurationRevision).not.toBe(selected.configurationRevision);
    expect(configured.channel.model).toBe('rayleigh');
  });

  it('returns bounded complex I/Q plus scalar observables without copying the selected profile', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'am' });
    const status = service.status();
    const spectrum = measurementResultSchema.parse(service.acquireSpectrum({
      startHz: 97_750_000,
      stopHz: 98_250_000,
      points: 101,
    }));
    expect(spectrum.kind).toBe('swept-spectrum');
    if (spectrum.kind !== 'swept-spectrum') throw new Error('Expected a swept spectrum');
    expect(spectrum.frequencyHz).toHaveLength(101);
    expect(spectrum.powerDbm).toHaveLength(101);
    expect(spectrum.frequencyHz[0]).toBe(97_750_000);
    expect(spectrum.frequencyHz.at(-1)).toBe(98_250_000);
    expect(spectrum.configurationRevision).toBe(status.configurationRevision);

    const detected = measurementResultSchema.parse(service.acquireDetectedPower({
      centerFrequencyHz: 98_012_345,
      points: 128,
      samplePeriodSeconds: 0.000_1,
    }));
    expect(detected.kind).toBe('detected-power-timeseries');
    if (detected.kind !== 'detected-power-timeseries') throw new Error('Expected detected power');
    expect(detected.powerDbm).toHaveLength(128);
    expect(detected.centerFrequencyHz).toBe(98_012_345);
    expect(detected.sequence).toBe(spectrum.sequence + 1);

    const iq = complexIqMeasurementSchema.parse(service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      bandwidthHz: 100_000,
      sampleCount: 257,
      sampleFormat: 'cf32le',
    }));
    expect(iq).toMatchObject({
      kind: 'complex-iq',
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      bandwidthHz: 100_000,
      sampleFormat: 'cf32le',
      sampleCount: 257,
      byteLength: 257 * COMPLEX_IQ_BYTES_PER_SAMPLE,
      encoding: 'base64',
      layout: 'interleaved-iq',
      byteOrder: 'little-endian',
      timingQualification: 'simulation-exact',
      qualification: 'analytic-complex-baseband',
      representation: 'normalized-complex-envelope',
      normalization: 'unit-peak',
      channelApplication: 'not-applied',
    });
    expect(Buffer.from(iq.samplesBase64, 'base64').byteLength).toBe(iq.byteLength);
    expect(iq.sequence).toBe(detected.sequence + 1);

    for (const measurement of [spectrum, detected, iq]) {
      expect(measurement.provenance.claims).toEqual(MEASUREMENT_BRIDGE_CLAIMS);
      const keys = deepKeys(measurement);
      expect(keys).not.toContain('profile');
      expect(keys).not.toContain('waveform');
      expect(keys).not.toContain('channel');
      expect(keys).not.toContain('usbMatch');
      expect(keys).not.toContain('vendorId');
      expect(keys).not.toContain('productId');
      expect(keys).not.toContain('serialPath');
      expect(keys).not.toContain('firmwareVersion');
      expect(keys).not.toContain('firmwareRevision');
      expect(keys).not.toContain('usbIdentityVerified');
    }
  });

  it('produces deterministic bounded bytes and keeps the maximum response below the NDJSON line ceiling', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'fm' });
    const params = {
      centerHz: 915_000_000,
      sampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MIN_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: MAX_COMPLEX_IQ_SAMPLES,
      sampleFormat: 'cf32le' as const,
    };
    const first = service.acquireIq(params);
    const second = service.acquireIq(params);
    expect(first.samplesBase64).toBe(second.samplesBase64);
    expect(first.samplesSha256).toBe(second.samplesSha256);
    expect(first.byteLength).toBe(MAX_COMPLEX_IQ_SAMPLES * COMPLEX_IQ_BYTES_PER_SAMPLE);
    expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(1_048_576);
  });

  it('generates explicitly standards-derived I/Q for every non-laboratory family', () => {
    const service = deterministicService();
    const representatives = [
      'gsm-8psk-normal-burst',
      'lte-etm1.1',
      'nr-fr1-tm1.1',
      'wifi6-he-su',
      'bluetooth-le-advertising',
    ] as const;
    const hashes = new Set<string>();
    for (const profile of representatives) {
      service.selectProfile({ profile });
      const iq = service.acquireIq({
        centerHz: service.status().waveform.centerHz,
        sampleRateHz: 122_880_000,
        bandwidthHz: 100_000_000,
        sampleCount: 2_048,
        sampleFormat: 'cf32le',
      });
      expect(iq.qualification).toBe('standards-derived-complex-baseband');
      expect(iq.byteLength).toBe(2_048 * COMPLEX_IQ_BYTES_PER_SAMPLE);
      hashes.add(iq.samplesSha256);
    }
    expect(hashes.size).toBe(representatives.length);

    service.selectProfile({ profile: 'cw' });
    expect(service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      bandwidthHz: 1_000_000,
      sampleCount: 1,
      sampleFormat: 'cf32le',
    })).toMatchObject({ qualification: 'analytic-complex-baseband' });
  });

  it('uses and publishes the exact admitted detected-power sample period', () => {
    const requestedPeriod = 1 / 3_200;
    const hiddenLegacyPeriod = 1 / 9_000;
    const requested = deterministicService();
    const legacy = deterministicService();
    requested.selectProfile({ profile: 'am' });
    legacy.selectProfile({ profile: 'am' });

    const measured = requested.acquireDetectedPower({ centerFrequencyHz: 98_000_000, points: 450, samplePeriodSeconds: requestedPeriod });
    const legacyClock = legacy.acquireDetectedPower({ centerFrequencyHz: 98_000_000, points: 450, samplePeriodSeconds: hiddenLegacyPeriod });

    expect(measured.samplePeriodSeconds).toBe(requestedPeriod);
    expect(measured.powerDbm).not.toEqual(legacyClock.powerDbm);
  });

  it('closes explicitly and never substitutes a fresh session after shutdown', () => {
    const service = deterministicService();
    expect(service.dispatch(request('shutdown', {}) as MeasurementBridgeRequest)).toEqual({ kind: 'shutdown', closed: true });
    expect(() => service.status()).toThrow(/closed/i);
    expect(() => service.acquireSpectrum({ startHz: 1, stopHz: 2, points: 2 })).toThrow(/closed/i);
  });

  it('continues exact producer state and sequence in a replacement process generation', () => {
    const continuation = {
      sessionId: '10000000-0000-4000-8000-000000000001',
      configurationRevision: '20000000-0000-4000-8000-000000000002',
      updatedAt: '2026-07-14T20:00:00.123Z',
      profile: 'fm' as const,
      channel: { model: 'rayleigh' as const, noiseFloorDbm: -120, seed: 19, fadingRateHz: 4 },
      sequence: 10_000,
    };
    const service = new AtomizerMeasurementService(
      { contractSha256: HASH_A, generatorSha256: HASH_B },
      {
        continuation,
        uuid: () => '30000000-0000-4000-8000-000000000001',
        now: () => new Date('2026-07-14T20:00:01.000Z'),
        monotonicMilliseconds: () => 1,
      },
    );

    expect(service.status()).toMatchObject({
      sessionId: continuation.sessionId,
      configurationRevision: continuation.configurationRevision,
      updatedAt: continuation.updatedAt,
      profile: continuation.profile,
      channel: continuation.channel,
    });
    expect(service.acquireSpectrum({ startHz: 99_000_000, stopHz: 101_000_000, points: 3 }))
      .toMatchObject({
        sessionId: continuation.sessionId,
        configurationRevision: continuation.configurationRevision,
        sequence: 10_001,
      });
  });
});

function deterministicService(): AtomizerMeasurementService {
  let uuidSequence = 0;
  let clockSequence = 0;
  let monotonic = 0;
  return new AtomizerMeasurementService(
    { contractSha256: HASH_A, generatorSha256: HASH_B },
    {
      uuid: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}`,
      now: () => new Date(Date.UTC(2026, 6, 14, 12, 0, clockSequence++)),
      monotonicMilliseconds: () => monotonic++,
    },
  );
}

function request(method: string, params: unknown) {
  return { type: 'request' as const, contractVersion: 1 as const, requestId: `request-${method}`, method, params };
}

function deepKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...deepKeys(nested)]);
}
