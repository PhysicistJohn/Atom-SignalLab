import { createHash } from 'node:crypto';
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
import {
  SYNTHESIZED_SIGNAL_PROFILES,
  type SynthesizedSignalProfile,
} from './contracts.js';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';
import { FIXED_DIGITAL_PROFILE_BINDINGS } from './fixed-digital-profile-binding.js';
import { AtomizerMeasurementService, MeasurementServiceError } from './measurement-service.js';

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
      'configure_custom_waveform',
      'acquire_spectrum',
      'acquire_detected_power',
      'acquire_iq',
      'shutdown',
    ]);
    expect(document.claims).toEqual(MEASUREMENT_BRIDGE_CLAIMS);
    expect(document.semantics.detectedPowerTuning).toBe('required-safe-integer-center-hz-returned-exactly-and-receiver-filtered-at-that-tune');
    expect(document.semantics.complexIqAvailability).toBe('all-42-closed-catalog-profiles-with-31-fixed-content-bound-3-operator-builders-and-8-mathematical-references');
    expect(document.semantics.complexIqCentering).toBe('requested-center-hz-is-the-complex-envelope-reference-and-profile-components-may-have-baseband-offsets');
    expect(document.semantics.complexIqBandwidth).toBe('profile-dependent-safe-integer-hz-no-greater-than-sample-rate-analytic-and-builder-paths-use-the-disclosed-low-pass-while-content-bound-paths-require-exact-native-bandwidth-without-filtering');
    expect(document.semantics.complexIqUndersampling).toBe('only-operator-builder-engineering-profiles-may-be-deterministically-aliased-fixed-content-bound-profiles-reject-nonnative-sample-rate');
    expect(document.semantics.complexIqChannel).toBe('selected-seeded-receiver-impairment-preset-is-applied-to-complex-iq-and-declared-on-every-result');
    expect(document.semantics.scalarMeasurementQualification).toBe('synthetic-visual-projection-not-a-conformance-vector');
    expect(document.semantics.complexIqMeasurementQualification).toBe('profile-dependent-analytic-laboratory-standards-derived-engineering-or-independently-verified-declared-digital-scope-never-rf-or-broad-conformance');
    expect(() => measurementBridgeContractDocumentSchema.parse({ ...document, undeclared: true })).toThrow();
    expect(() => measurementBridgeContractDocumentSchema.parse({
      ...document,
      commands: document.commands.map((command, index) => index === 0
        ? { ...command, stateChange: true }
        : command),
    })).toThrow();
    expect(() => measurementBridgeContractDocumentSchema.parse({
      ...document,
      commands: document.commands.map((command, index) => index === 4
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
    expect(initial.profiles).toHaveLength(42);
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
    expect(() => service.configureChannel({ channel: {
      model: 'awgn', noiseFloorDbm: -108, seed: 1, fadingRateHz: 2,
      receiverImpairment: 'unbounded-custom-chain',
    } })).toThrow();
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
      receiverImpairment: 'clean',
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

  it('applies the selected seeded receiver impairment to I/Q and declares it exactly', () => {
    const cleanService = deterministicService();
    const impairedService = deterministicService();
    const channel = {
      model: 'awgn' as const,
      noiseFloorDbm: -108,
      seed: 407,
      fadingRateHz: 2,
      receiverImpairment: 'composite' as const,
    };
    impairedService.configureChannel({ channel });
    const request = {
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      bandwidthHz: 500_000,
      sampleCount: 2_048,
      sampleFormat: 'cf32le' as const,
    };
    const clean = cleanService.acquireIq(request);
    const impaired = impairedService.acquireIq(request);

    expect(impaired).toMatchObject({
      qualification: 'receiver-impaired-complex-baseband',
      representation: 'normalized-complex-envelope',
      normalization: 'peak-to-0.98',
      receiverImpairment: 'composite',
      channelApplication: 'receiver-impairment-preset',
    });
    expect(impaired.samplesSha256).not.toBe(clean.samplesSha256);

    const replay = deterministicService();
    replay.configureChannel({ channel });
    expect(replay.acquireIq(request).samplesSha256).toBe(impaired.samplesSha256);
  });

  it('advances successive I/Q captures in time and keeps the maximum response below the NDJSON line ceiling', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'fm' });
    const params = {
      centerHz: 915_000_000,
      sampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MIN_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: MAX_COMPLEX_IQ_SAMPLES,
      sampleFormat: 'cf32le' as const,
    };
    // Successive captures are successive moments of the same signal — a Run
    // must render a moving waveform, never one bit-frozen buffer (synthesis
    // determinism per capture coordinate is pinned in complex-iq.test.ts).
    const first = service.acquireIq(params);
    const second = service.acquireIq(params);
    expect(second.sequence).toBe(first.sequence + 1);
    expect(first.samplesBase64).not.toBe(second.samplesBase64);
    expect(first.samplesSha256).not.toBe(second.samplesSha256);
    expect(first.byteLength).toBe(MAX_COMPLEX_IQ_SAMPLES * COMPLEX_IQ_BYTES_PER_SAMPLE);
    expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(1_048_576);
  });

  it('reports the exact clean qualification boundary and rejects relabeling for all 31 fixed standards-linked profiles', () => {
    const service = deterministicService();
    const bindings = Object.entries(FIXED_DIGITAL_PROFILE_BINDINGS);
    expect(bindings).toHaveLength(31);
    for (const [profile, binding] of bindings) {
      service.selectProfile({ profile });
      const request = {
        centerHz: binding.centerHz,
        sampleRateHz: binding.sampleRateHz,
        bandwidthHz: binding.bandwidthHz,
        sampleCount: 1_024,
        sampleFormat: 'cf32le',
      } as const;
      const iq = service.acquireIq(request);
      expect(iq).toMatchObject({
        centerHz: binding.centerHz,
        sampleRateHz: binding.sampleRateHz,
        bandwidthHz: binding.bandwidthHz,
        qualification: 'independently-verified-digital-baseband',
        representation: 'source-preserved-complex-envelope',
        normalization: 'none',
      });
      expect(iq.byteLength).toBe(1_024 * COMPLEX_IQ_BYTES_PER_SAMPLE);
      expect(() => service.acquireIq({
        ...request,
        centerHz: binding.centerHz + 1,
      })).toThrow(/requires center .*relabel/i);
      expect(() => service.acquireIq({
        ...request,
        sampleRateHz: binding.sampleRateHz + 1,
      })).toThrow(/requires .*samples\/s/i);
      expect(() => service.acquireIq({
        ...request,
        bandwidthHz: binding.bandwidthHz - 1,
      })).toThrow(/requires .*bandwidth/i);
    }

    service.selectProfile({ profile: 'cw' });
    expect(service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      bandwidthHz: 1_000_000,
      sampleCount: 1,
      sampleFormat: 'cf32le',
    })).toMatchObject({ qualification: 'analytic-complex-baseband' });

    // The single-carrier references are visual analytic lab waveforms, so their
    // I/Q must report 'analytic-complex-baseband' too — this is the exact
    // qualification the Atomizer admission layer expects for a 'visual' source,
    // and a mismatch rejects the capture (regression guard for reference I/Q).
    service.selectProfile({ profile: 'ref-256qam' });
    expect(service.acquireIq({
      centerHz: 100_000_000,
      sampleRateHz: 56_000_000,
      bandwidthHz: 40_000_000,
      sampleCount: 2_048,
      sampleFormat: 'cf32le',
    })).toMatchObject({ qualification: 'analytic-complex-baseband' });
  });

  it('returns the direct source bytes and hashes for all 31 fixed bindings, including both one-shot bounds and replays', () => {
    const bindings = Object.entries(FIXED_DIGITAL_PROFILE_BINDINGS);
    expect(bindings).toHaveLength(31);
    for (const [profile, binding] of bindings) {
      const service = deterministicService();
      service.selectProfile({ profile });
      const captureSamples = 'captureSamples' in binding
        ? binding.captureSamples
        : undefined;
      const sampleCount = Math.min(1_024, captureSamples ?? 1_024);
      const request = {
        centerHz: binding.centerHz,
        sampleRateHz: binding.sampleRateHz,
        bandwidthHz: binding.bandwidthHz,
        sampleCount,
        sampleFormat: 'cf32le' as const,
      };
      const direct = synthesizeAnalyticComplexIq({
        profile: profile as SynthesizedSignalProfile,
        sampleRateHz: binding.sampleRateHz,
        bandwidthHz: binding.bandwidthHz,
        sampleCount,
        startSampleIndex: 0,
      });
      const directBytes = Buffer.from(
        direct.buffer,
        direct.byteOffset,
        direct.byteLength,
      );
      const expectedSha256 = createHash('sha256')
        .update(directBytes)
        .digest('hex');
      const first = service.acquireIq(request);
      expect(Buffer.from(first.samplesBase64, 'base64'), profile)
        .toEqual(directBytes);
      expect(first.samplesSha256, profile).toBe(expectedSha256);

      if (binding.replay === 'one-shot') {
        if (captureSamples === undefined) {
          throw new Error(`${profile} one-shot binding has no capture bound`);
        }
        const second = service.acquireIq(request);
        expect(second.samplesBase64, profile).toBe(first.samplesBase64);
        expect(second.samplesSha256, profile).toBe(expectedSha256);
        expect(() => service.acquireIq({
          ...request,
          sampleCount: captureSamples + 1,
        })).toThrow(/one-shot capture contains only/i);
        const third = service.acquireIq(request);
        expect(third.sequence, profile).toBe(second.sequence + 1);
        expect(third.samplesBase64, profile).toBe(first.samplesBase64);
      }
    }
  });

  it('uses a cumulative I/Q cursor independent of scalar sequences and resets it on configuration change', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'fm' });
    const request1024 = {
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      bandwidthHz: 100_000,
      sampleCount: 1_024,
      sampleFormat: 'cf32le' as const,
    };
    service.acquireIq(request1024);
    service.acquireDetectedPower({
      centerFrequencyHz: 98_000_000,
      points: 8,
      samplePeriodSeconds: 0.001,
    });
    const request256 = { ...request1024, sampleCount: 256 };
    const continued = service.acquireIq(request256);
    const expectedContinued = synthesizeAnalyticComplexIq({
      profile: 'fm',
      sampleRateHz: request256.sampleRateHz,
      bandwidthHz: request256.bandwidthHz,
      sampleCount: request256.sampleCount,
      startSampleIndex: 1_024,
    });
    expect(Buffer.from(continued.samplesBase64, 'base64')).toEqual(Buffer.from(
      expectedContinued.buffer,
      expectedContinued.byteOffset,
      expectedContinued.byteLength,
    ));

    service.selectProfile({ profile: 'fm' });
    const reset = service.acquireIq(request256);
    const expectedReset = synthesizeAnalyticComplexIq({
      profile: 'fm',
      sampleRateHz: request256.sampleRateHz,
      bandwidthHz: request256.bandwidthHz,
      sampleCount: request256.sampleCount,
      startSampleIndex: 0,
    });
    expect(Buffer.from(reset.samplesBase64, 'base64')).toEqual(Buffer.from(
      expectedReset.buffer,
      expectedReset.byteOffset,
      expectedReset.byteLength,
    ));
  });

  it('rejects invalid fixed-artifact geometry without consuming a measurement sequence', () => {
    const service = deterministicService();
    const lteBinding = FIXED_DIGITAL_PROFILE_BINDINGS['lte-etm1.1'];
    service.selectProfile({ profile: 'lte-etm1.1' });
    const lteRequest = {
      centerHz: lteBinding.centerHz,
      sampleRateHz: lteBinding.sampleRateHz,
      bandwidthHz: lteBinding.bandwidthHz,
      sampleCount: 1_024,
      sampleFormat: 'cf32le' as const,
    };
    const first = service.acquireIq(lteRequest);
    expect(() => service.acquireIq({
      ...lteRequest,
      centerHz: lteBinding.centerHz + 1,
    })).toThrow(/requires center .*relabel/i);
    expect(() => service.acquireIq({
      ...lteRequest,
      sampleRateHz: lteBinding.sampleRateHz + 1,
    })).toThrow(/requires .*samples\/s/i);
    expect(() => service.acquireIq({
      ...lteRequest,
      bandwidthHz: lteBinding.bandwidthHz - 1,
    })).toThrow(/requires .*bandwidth/i);
    const second = service.acquireIq(lteRequest);
    expect(second.sequence).toBe(first.sequence + 1);

    const bluetoothBinding = FIXED_DIGITAL_PROFILE_BINDINGS['bluetooth-classic-connected'];
    service.selectProfile({ profile: 'bluetooth-classic-connected' });
    const bluetoothRequest = {
      centerHz: bluetoothBinding.centerHz,
      sampleRateHz: bluetoothBinding.sampleRateHz,
      bandwidthHz: bluetoothBinding.bandwidthHz,
      sampleCount: 1_024,
      sampleFormat: 'cf32le' as const,
    };
    expect(() => service.acquireIq({
      ...bluetoothRequest,
      sampleCount: bluetoothBinding.captureSamples + 1,
    })).toThrow(/one-shot capture contains only/i);
    const third = service.acquireIq(bluetoothRequest);
    expect(third.sequence).toBe(second.sequence + 1);
  });

  it('preserves independently verified exact LTE and NR test-model bytes and fails closed on transforms', () => {
    const service = deterministicService();
    const profiles = [
      ['lte-etm1.1', 1_840_000_000, 15_360_000, 10_000_000],
      ['lte-etm3.1', 1_840_000_000, 15_360_000, 10_000_000],
      ['lte-etm3.1a', 1_840_000_000, 15_360_000, 10_000_000],
      ['lte-etm3.1b', 1_840_000_000, 15_360_000, 10_000_000],
      ['nr-fr1-tm1.1', 1_842_500_000, 30_720_000, 20_000_000],
      ['nr-fr1-tm3.1', 1_842_500_000, 30_720_000, 20_000_000],
      ['nr-fr1-tm3.1a', 1_842_500_000, 30_720_000, 20_000_000],
      ['nr-fr1-tm3.1b', 1_842_500_000, 30_720_000, 20_000_000],
    ] as const;
    for (const [profile, centerHz, sampleRateHz, bandwidthHz] of profiles) {
      service.selectProfile({ profile });
      const request = {
        centerHz,
        sampleRateHz,
        bandwidthHz,
        sampleCount: 4_096,
        sampleFormat: 'cf32le' as const,
      };
      expect(service.acquireIq(request)).toMatchObject({
        qualification: 'independently-verified-digital-baseband',
        representation: 'source-preserved-complex-envelope',
        normalization: 'none',
        receiverImpairment: 'clean',
        channelApplication: 'not-applied',
      });
      expect(() => service.acquireIq({ ...request, sampleRateHz: sampleRateHz * 2 }))
        .toThrow(/requires .*samples\/s/i);
      expect(() => service.acquireIq({ ...request, bandwidthHz: bandwidthHz - 1_000_000 }))
        .toThrow(/requires .*bandwidth/i);
    }

    service.selectProfile({ profile: 'lte-etm1.1' });
    service.configureChannel({
      channel: {
        model: 'awgn',
        noiseFloorDbm: -108,
        seed: 407,
        fadingRateHz: 2,
        receiverImpairment: 'awgn',
      },
    });
    expect(service.acquireIq({
      centerHz: 1_840_000_000,
      sampleRateHz: 15_360_000,
      bandwidthHz: 10_000_000,
      sampleCount: 4_096,
      sampleFormat: 'cf32le',
    })).toMatchObject({
      qualification: 'receiver-impaired-complex-baseband',
      representation: 'normalized-complex-envelope',
      normalization: 'peak-to-0.98',
    });
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
    let rejection: unknown;
    try {
      service.dispatch(request('status', {}) as MeasurementBridgeRequest);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(MeasurementServiceError);
    expect((rejection as MeasurementServiceError).code).toBe('SERVICE_CLOSED');
  });

  it('continues exact producer state and sequence in a replacement process generation', () => {
    const continuation = {
      sessionId: '10000000-0000-4000-8000-000000000001',
      configurationRevision: '20000000-0000-4000-8000-000000000002',
      updatedAt: '2026-07-14T20:00:00.123Z',
      profile: 'fm' as const,
      channel: { model: 'rayleigh' as const, noiseFloorDbm: -120, seed: 19, fadingRateHz: 4 },
      sequence: 10_000,
      iqSampleCursor: 12_345,
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
    const continuedIq = service.acquireIq({
      centerHz: 100_000_000,
      sampleRateHz: 2_000_000,
      bandwidthHz: 100_000,
      sampleCount: 64,
      sampleFormat: 'cf32le',
    });
    const expectedIq = synthesizeAnalyticComplexIq({
      profile: 'fm',
      sampleRateHz: 2_000_000,
      bandwidthHz: 100_000,
      sampleCount: 64,
      startSampleIndex: continuation.iqSampleCursor,
    });
    expect(continuedIq.sequence).toBe(10_002);
    expect(Buffer.from(continuedIq.samplesBase64, 'base64')).toEqual(Buffer.from(
      expectedIq.buffer,
      expectedIq.byteOffset,
      expectedIq.byteLength,
    ));
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
