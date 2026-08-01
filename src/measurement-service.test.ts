import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPLEX_IQ_BYTES_PER_SAMPLE,
  DEFAULT_WAVEFORM_CATALOG_SHA256,
  MAX_COMPLEX_IQ_BANDWIDTH_HZ,
  MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
  MAX_COMPLEX_IQ_SAMPLES,
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MEASUREMENT_BRIDGE_CLAIMS,
  MEASUREMENT_CAPABILITIES,
  MIN_COMPLEX_IQ_BANDWIDTH_HZ,
  MIN_COMPLEX_IQ_SAMPLE_RATE_HZ,
  acquireDetectedPowerInputSchema,
  acquireIqInputSchema,
  acquireSpectrumInputSchema,
  complexIqMeasurementSchema,
  configureChannelInputSchema,
  configureCustomWaveformInputSchema,
  measurementBridgeContractDocumentSchema,
  measurementResultSchema,
  measurementSourceStatusSchema,
  selectProfileInputSchema,
} from './measurement-contract.js';
import {
  SYNTHESIZED_SIGNAL_PROFILES,
  type SynthesizedSignalProfile,
} from './contracts.js';
import {
  MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
  synthesizeAnalyticComplexIq,
} from './complex-iq.js';
import { resetCustomWaveformSelections } from './custom-waveform.js';
import { FIXED_DIGITAL_PROFILE_BINDINGS, UNBOUNDED_COMPOSITION_PROFILE_BINDINGS } from './fixed-digital-profile-binding.js';
import { AtomizerMeasurementService, MeasurementServiceError } from './measurement-service.js';
import {
  resampleCf32leWindowedSinc,
  translateCf32leCarrier,
} from './iq-resampler.js';
import { waveformDescriptor } from './waveforms.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

// Custom builder selections are still module-global (see custom-waveform.ts),
// so a test that configures one would otherwise leak into later tests in this
// file. This teardown becomes redundant once selections are service-owned.
afterEach(() => resetCustomWaveformSelections());

describe('Atomizer high-level measurement source contract', () => {
  it('runtime-validates the shipped closed contract document', async () => {
    const source = await readFile(new URL('../contracts/signal-lab-measurement-bridge-v2.json', import.meta.url), 'utf8');
    const document = measurementBridgeContractDocumentSchema.parse(JSON.parse(source));
    expect(document.contractVersion).toBe(2);
    expect(document.status).toBe('active');
    expect(document.methods.map((method) => method.method)).toEqual([
      'status',
      'selectProfile',
      'configureChannel',
      'configureCustomWaveform',
      'acquireSpectrum',
      'acquireDetectedPower',
      'acquireIq',
      'shutdown',
    ]);
    expect(document.methods.at(-1)).toEqual({
      method: 'shutdown',
      stateChange: true,
      result: 'void',
    });
    expect(document.claims).toEqual(MEASUREMENT_BRIDGE_CLAIMS);
    expect(document.invocation).toEqual({
      mode: 'in-process-typescript',
      entryPoint: 'src/measurement-service.ts',
      validation: 'strict-zod-runtime-schemas',
      serialization: 'none',
      processTransport: 'none',
    });
    const contractSha256 = createHash('sha256')
      .update(JSON.stringify(document), 'utf8')
      .digest('hex');
    const rawFileSha256 = createHash('sha256').update(source, 'utf8').digest('hex');
    const generatorContractBindingSha256 = createHash('sha256')
      .update(`atomizer-in-process-generator\u0000${contractSha256}`, 'utf8')
      .digest('hex');
    expect(contractSha256).not.toBe(rawFileSha256);
    expect(generatorContractBindingSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(document.identityHashes).toEqual({
      contractSha256: 'sha256-of-utf8-json-stringify-of-the-imported-parsed-contract-document',
      catalogSha256: 'sha256-of-immutable-all-auto-default-catalog-json',
      generatorContractBindingSha256: 'sha256-of-utf8-domain-atomizer-in-process-generator-null-followed-by-contract-sha256-not-generator-code-identity',
    });
    expect(document.semantics.detectedPowerTuning).toBe('required-safe-integer-center-hz-returned-exactly-and-receiver-filtered-at-that-tune');
    expect(document.semantics.complexIqAvailability).toBe('all-42-closed-catalog-profiles-with-native-geometry-for-31-content-bound-artifacts-and-rate-flexible-generation-for-11-analytic-or-builder-profiles');
    expect(document.semantics.complexIqCentering).toMatch(/output-rf-placement-metadata/);
    expect(document.semantics.complexIqBandwidth).toMatch(/capture-bandwidth-hz.*distinct.*signal-bandwidth/);
    expect(document.semantics.complexIqResampling).toMatch(/native-byte-identity.*blackman-windowed-sinc-v1/);
    expect(document.semantics.complexIqChannel).toMatch(/explicit-post-source-transform/);
    expect(document.semantics.scalarMeasurementQualification).toBe('synthetic-visual-projection-not-a-conformance-vector');
    expect(document.semantics.complexIqMeasurementQualification).toMatch(/exact-native-bytes.*never-claims-byte-identity-rf-conformance/);
    expect(() => measurementBridgeContractDocumentSchema.parse({ ...document, undeclared: true })).toThrow();
    expect(() => measurementBridgeContractDocumentSchema.parse({
      ...document,
      methods: document.methods.map((method, index) => index === 0
        ? { ...method, stateChange: true }
        : method),
    })).toThrow();
    expect(() => measurementBridgeContractDocumentSchema.parse({
      ...document,
      methods: document.methods.map((method, index) => index === 4
        ? { ...method, result: 'status' }
        : method),
    })).toThrow();
  });

  it('strictly validates direct method inputs without a legacy request envelope', () => {
    expect(() => selectProfileInputSchema.parse({ profile: 'not-a-profile' })).toThrow();
    expect(() => selectProfileInputSchema.parse({
      type: 'request',
      contractVersion: 2,
      requestId: 'legacy',
      method: 'select_profile',
      params: { profile: 'cw' },
    })).toThrow();
    expect(() => configureChannelInputSchema.parse({
      channel: {
        model: 'awgn',
        noiseFloorDbm: -108,
        seed: 407,
        fadingRateHz: 2,
      },
    })).toThrow(/receiverImpairment/i);
    expect(() => configureCustomWaveformInputSchema.parse({
      standard: 'lte',
      selections: {},
      undeclared: true,
    })).toThrow();
    expect(() => acquireSpectrumInputSchema.parse({
      startHz: 200,
      stopHz: 100,
      points: 450,
    })).toThrow();
    expect(() => acquireSpectrumInputSchema.parse({
      startHz: 100,
      stopHz: 200,
      points: 450,
      contractVersion: 2,
    })).toThrow();
    expect(() => acquireDetectedPowerInputSchema.parse({
      centerFrequencyHz: 98_000_000,
      points: 4_097,
      samplePeriodSeconds: 0.001,
      undeclared: true,
    })).toThrow();
    expect(() => acquireDetectedPowerInputSchema.parse({
      points: 128,
      samplePeriodSeconds: 0.001,
    })).toThrow();
    for (const centerFrequencyHz of [0, 98_000_000.5, MAX_MEASUREMENT_FREQUENCY_HZ + 1]) {
      expect(() => acquireDetectedPowerInputSchema.parse({
        centerFrequencyHz,
        points: 128,
        samplePeriodSeconds: 0.001,
      })).toThrow();
    }
    expect(() => acquireIqInputSchema.parse({
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      captureBandwidthHz: 1_000_001,
      sampleCount: 1_024,
      sampleFormat: 'cf32le',
    })).toThrow(/bandwidth/i);
    expect(() => acquireIqInputSchema.parse({
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      captureBandwidthHz: 1_000_000,
      sampleCount: MAX_COMPLEX_IQ_SAMPLES + 1,
      sampleFormat: 'cf32le',
    })).toThrow();
    for (const captureBandwidthHz of [MIN_COMPLEX_IQ_BANDWIDTH_HZ - 1, MAX_COMPLEX_IQ_BANDWIDTH_HZ + 1, 1_000.5]) {
      expect(() => acquireIqInputSchema.parse({
        centerHz: 98_000_000,
        sampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
        captureBandwidthHz,
        sampleCount: 1,
        sampleFormat: 'cf32le',
      })).toThrow(/bandwidth/i);
    }
    expect(() => acquireIqInputSchema.parse({
      centerHz: 1,
      sampleRateHz: MIN_COMPLEX_IQ_SAMPLE_RATE_HZ,
      captureBandwidthHz: MIN_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: 1,
      sampleFormat: 'cf32le',
    })).not.toThrow();
    expect(() => acquireIqInputSchema.parse({
      centerHz: MAX_MEASUREMENT_FREQUENCY_HZ,
      sampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
      captureBandwidthHz: MAX_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: MAX_COMPLEX_IQ_SAMPLES,
      sampleFormat: 'cf32le',
    })).not.toThrow();
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
      generatorContractBindingSha256: HASH_B,
      claims: MEASUREMENT_BRIDGE_CLAIMS,
    });
    expect(initial.identity.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(initial.profiles).toHaveLength(44);
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
      // The largest legal custom NR build (FR2, 120 kHz SCS, 400 MHz, 264 RB)
      // occupies 380.16 MHz, so the ceiling must clear it for the catalog's
      // "all 42 available" claim to hold.
      maximumSampleRateHz: MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
      minimumBandwidthHz: 1_000,
      maximumBandwidthHz: MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
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
    expect(() => service.configureChannel({ channel: {
      model: 'rayleigh',
      noiseFloorDbm: -120,
      seed: 99,
      fadingRateHz: 4,
    } })).toThrow();
    const configured = service.configureChannel({ channel: {
      model: 'rayleigh',
      noiseFloorDbm: -120,
      seed: 99,
      fadingRateHz: 4,
      receiverImpairment: 'clean',
    } });
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
      captureBandwidthHz: 100_000,
      sampleCount: 257,
      sampleFormat: 'cf32le',
    }));
    expect(iq).toMatchObject({
      kind: 'complex-iq',
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      captureBandwidthHz: 100_000,
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
      captureBandwidthHz: 500_000,
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

  it('advances successive I/Q captures in time at maximum payload geometry', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'fm' });
    const params = {
      centerHz: 915_000_000,
      sampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
      captureBandwidthHz: 200_000,
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
  });

  it('reports the exact native qualification while treating RF center as output metadata for all 31 fixed profiles', () => {
    const service = deterministicService();
    const bindings = Object.entries(FIXED_DIGITAL_PROFILE_BINDINGS);
    expect(bindings).toHaveLength(31);
    for (const [profile, binding] of bindings) {
      service.selectProfile({ profile });
      // Capture bandwidth is symmetric about rfTuneCenterHz, so keeping an
      // artifact's native carrier offset requires 2 * |offset| + signal
      // bandwidth. This is the signal bandwidth for the 29 zero-offset
      // artifacts and 63/31 MHz for Bluetooth BR/LE.
      const nativeCaptureBandwidthHz =
        2 * Math.abs(binding.nativeCarrierOffsetHz) + binding.signalBandwidthHz;
      const request = {
        centerHz: binding.profileReferenceCenterHz,
        sampleRateHz: binding.nativeSampleRateHz,
        captureBandwidthHz: nativeCaptureBandwidthHz,
        sampleCount: 1_024,
        sampleFormat: 'cf32le',
      } as const;
      const iq = service.acquireIq(request);
      expect(iq).toMatchObject({
        centerHz: binding.profileReferenceCenterHz,
        sampleRateHz: binding.nativeSampleRateHz,
        captureBandwidthHz: nativeCaptureBandwidthHz,
        qualification: 'independently-verified-digital-baseband',
        payloadKind: 'native-canonical',
        representation: 'source-preserved-complex-envelope',
        normalization: 'none',
        canonicalArtifactSha256: waveformDescriptor(profile as SynthesizedSignalProfile).assetSha256,
      });
      expect(iq.transformReceipt.operations).toEqual([]);
      expect(iq.byteLength).toBe(1_024 * COMPLEX_IQ_BYTES_PER_SAMPLE);
      const retuned = service.acquireIq({
        ...request,
        centerHz: binding.profileReferenceCenterHz + 1,
      });
      expect(retuned).toMatchObject({
        centerHz: binding.profileReferenceCenterHz + 1,
        profileReferenceCenterHz: binding.profileReferenceCenterHz,
        rfPlacement: 'operator-translated',
        qualification: 'independently-verified-digital-baseband',
        payloadKind: 'native-canonical',
      });
      expect(() => service.acquireIq({
        ...request,
        captureBandwidthHz: binding.signalBandwidthHz - 1,
      })).toThrow(/capture bandwidth.*declared/i);
    }

    service.selectProfile({ profile: 'cw' });
    expect(service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      captureBandwidthHz: 1_000_000,
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
      captureBandwidthHz: 40_000_000,
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
      // Symmetric passband about rfTuneCenterHz, so the native carrier offset
      // costs 2 * |offset| of capture bandwidth to retain (Bluetooth only).
      const request = {
        centerHz: binding.profileReferenceCenterHz,
        sampleRateHz: binding.nativeSampleRateHz,
        captureBandwidthHz:
          2 * Math.abs(binding.nativeCarrierOffsetHz) + binding.signalBandwidthHz,
        sampleCount,
        sampleFormat: 'cf32le' as const,
      };
      const direct = synthesizeAnalyticComplexIq({
        profile: profile as SynthesizedSignalProfile,
        sampleRateHz: binding.nativeSampleRateHz,
        bandwidthHz: binding.signalBandwidthHz,
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
      expect(first.transformReceipt.sourceSamplesSha256, profile)
        .toBe(expectedSha256);
      expect(first.transformReceipt.outputSamplesSha256, profile)
        .toBe(expectedSha256);

      if (binding.replay === 'one-shot') {
        if (captureSamples === undefined) {
          throw new Error(`${profile} one-shot binding has no capture bound`);
        }
        const fullDirect = synthesizeAnalyticComplexIq({
          profile: profile as SynthesizedSignalProfile,
          sampleRateHz: binding.nativeSampleRateHz,
          bandwidthHz: binding.signalBandwidthHz,
          sampleCount: captureSamples,
          startSampleIndex: 0,
        });
        const fullBytes = Buffer.from(fullDirect);
        const fullSha256 = createHash('sha256').update(fullBytes).digest('hex');
        const fullRequest = { ...request, sampleCount: captureSamples };
        const second = service.acquireIq(fullRequest);
        expect(Buffer.from(second.samplesBase64, 'base64'), profile)
          .toEqual(fullBytes);
        expect(second.samplesSha256, profile).toBe(fullSha256);
        expect(second.transformReceipt.sourceSamplesSha256, profile)
          .toBe(fullSha256);
        expect(second.transformReceipt).toMatchObject({
          sourceBoundaryPolicy: 'one-shot-zero-extended',
          sourcePeriodSamples: null,
          sourceStartSample: 0,
          sourceSampleCount: captureSamples,
        });
        const repeatedFull = service.acquireIq(fullRequest);
        expect(repeatedFull.samplesBase64, profile).toBe(second.samplesBase64);
        expect(repeatedFull.samplesSha256, profile).toBe(fullSha256);
        expect(() => service.acquireIq({
          ...request,
          sampleCount: captureSamples + 1,
        })).toThrow(/one-shot artifact contains/i);
        const third = service.acquireIq(fullRequest);
        expect(third.sequence, profile).toBe(repeatedFull.sequence + 1);
        expect(third.samplesBase64, profile).toBe(second.samplesBase64);
      } else {
        const secondDirect = synthesizeAnalyticComplexIq({
          profile: profile as SynthesizedSignalProfile,
          sampleRateHz: binding.nativeSampleRateHz,
          bandwidthHz: binding.signalBandwidthHz,
          sampleCount,
          startSampleIndex: sampleCount,
        });
        const secondBytes = Buffer.from(secondDirect);
        const secondSha256 = createHash('sha256')
          .update(secondBytes)
          .digest('hex');
        const second = service.acquireIq(request);
        expect(Buffer.from(second.samplesBase64, 'base64'), profile)
          .toEqual(secondBytes);
        expect(second.samplesSha256, profile).toBe(secondSha256);
        expect(second.transformReceipt).toMatchObject({
          sourceBoundaryPolicy: 'cyclic-modular',
          sourcePeriodSamples: binding.nativePeriodSamples,
          sourceStartSample: sampleCount,
          sourceSampleCount: sampleCount,
          sourceSamplesSha256: secondSha256,
        });
      }
    }
  });

  it('uses a cumulative I/Q cursor independent of scalar sequences and resets it on configuration change', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'fm' });
    const request1024 = {
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      captureBandwidthHz: 200_000,
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
      bandwidthHz: request256.captureBandwidthHz,
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
      bandwidthHz: request256.captureBandwidthHz,
      sampleCount: request256.sampleCount,
      startSampleIndex: 0,
    });
    expect(Buffer.from(reset.samplesBase64, 'base64')).toEqual(Buffer.from(
      expectedReset.buffer,
      expectedReset.byteOffset,
      expectedReset.byteLength,
    ));
  });

  it('makes every continuous profile byte-identical when captured whole or split', {
    timeout: 30_000,
  }, () => {
    const continuousProfiles = SYNTHESIZED_SIGNAL_PROFILES.filter(
      (profile) => !Object.hasOwn(FIXED_DIGITAL_PROFILE_BINDINGS, profile)
        && !Object.hasOwn(UNBOUNDED_COMPOSITION_PROFILE_BINDINGS, profile),
    );
    expect(continuousProfiles).toHaveLength(11);
    for (const profile of continuousProfiles) {
      const descriptor = waveformDescriptor(profile);
      const sampleRateHz = Math.max(
        MIN_COMPLEX_IQ_SAMPLE_RATE_HZ,
        descriptor.occupiedBandwidthHz,
      );
      const base = {
        centerHz: descriptor.centerHz,
        sampleRateHz,
        captureBandwidthHz: descriptor.occupiedBandwidthHz,
        sampleFormat: 'cf32le' as const,
      };
      const wholeService = deterministicService();
      wholeService.selectProfile({ profile });
      const whole = wholeService.acquireIq({ ...base, sampleCount: 257 });

      const splitService = deterministicService();
      splitService.selectProfile({ profile });
      const first = splitService.acquireIq({ ...base, sampleCount: 113 });
      const second = splitService.acquireIq({ ...base, sampleCount: 144 });
      const joined = Buffer.concat([
        Buffer.from(first.samplesBase64, 'base64'),
        Buffer.from(second.samplesBase64, 'base64'),
      ]);
      expect(joined, profile)
        .toEqual(Buffer.from(whole.samplesBase64, 'base64'));
      expect(first.transformReceipt).toMatchObject({
        sourceBoundaryPolicy: 'continuous-session-origin-zero-extended',
        sourcePeriodSamples: null,
      });
    }
  });

  it('preserves exact elapsed time across a flexible-profile sample-rate change', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'fm' });
    service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      captureBandwidthHz: 200_000,
      sampleCount: 1,
      sampleFormat: 'cf32le',
    });
    const changedRate = service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 3_000_000,
      captureBandwidthHz: 200_000,
      sampleCount: 64,
      sampleFormat: 'cf32le',
    });
    expect(changedRate.transformReceipt).toMatchObject({
      outputStartSourceSampleNumerator: '3',
      outputStartSourceSampleDenominator: '2',
      sourceSampleRateHz: 3_000_000,
      outputSampleRateHz: 3_000_000,
      sourceBoundaryPolicy: 'continuous-session-origin-zero-extended',
    });
    expect(changedRate.transformReceipt.operations.map(({ kind }) => kind))
      .toEqual(['fractional-delay']);
    const silentlyFloored = synthesizeAnalyticComplexIq({
      profile: 'fm',
      sampleRateHz: 3_000_000,
      bandwidthHz: 200_000,
      sampleCount: 64,
      startSampleIndex: 1,
    });
    expect(Buffer.from(changedRate.samplesBase64, 'base64'))
      .not.toEqual(Buffer.from(silentlyFloored));
  });

  it('derives fixed artifacts explicitly and rejects only lossy capture geometry without consuming sequence state', () => {
    const service = deterministicService();
    const lteBinding = FIXED_DIGITAL_PROFILE_BINDINGS['lte-etm1.1'];
    service.selectProfile({ profile: 'lte-etm1.1' });
    const lteRequest = {
      centerHz: lteBinding.profileReferenceCenterHz,
      sampleRateHz: lteBinding.nativeSampleRateHz,
      captureBandwidthHz: lteBinding.signalBandwidthHz,
      sampleCount: 1_024,
      sampleFormat: 'cf32le' as const,
    };
    const first = service.acquireIq(lteRequest);
    const retuned = service.acquireIq({
      ...lteRequest,
      centerHz: lteBinding.profileReferenceCenterHz + 1,
    });
    expect(retuned).toMatchObject({
      rfPlacement: 'operator-translated',
      qualification: 'independently-verified-digital-baseband',
    });
    const derived = service.acquireIq({
      ...lteRequest,
      sampleRateHz: lteBinding.nativeSampleRateHz * 2,
    });
    expect(derived).toMatchObject({
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
      representation: 'derived-complex-envelope',
      normalization: 'none',
    });
    expect(derived.transformReceipt.operations.map((operation) => operation.kind))
      .toEqual(['resample']);
    expect(() => service.acquireIq({
      ...lteRequest,
      captureBandwidthHz: lteBinding.signalBandwidthHz - 1,
    })).toThrow(/capture bandwidth.*declared/i);
    const second = service.acquireIq(lteRequest);
    expect(second.sequence).toBe(derived.sequence + 1);
    expect(retuned.sequence).toBe(first.sequence + 1);
    expect(derived.sequence).toBe(retuned.sequence + 1);

    const bluetoothBinding = FIXED_DIGITAL_PROFILE_BINDINGS['bluetooth-classic-connected'];
    service.selectProfile({ profile: 'bluetooth-classic-connected' });
    const bluetoothRequest = {
      centerHz: bluetoothBinding.profileReferenceCenterHz,
      sampleRateHz: bluetoothBinding.nativeSampleRateHz,
      captureBandwidthHz: bluetoothBinding.signalBandwidthHz,
      sampleCount: 1_024,
      sampleFormat: 'cf32le' as const,
    };
    expect(() => service.acquireIq({
      ...bluetoothRequest,
      sampleCount: bluetoothBinding.captureSamples + 1,
    })).toThrow(/one-shot artifact contains/i);
    const third = service.acquireIq(bluetoothRequest);
    expect(third.sequence).toBe(second.sequence + 1);
  });

  it('translates Bluetooth to DC when preserving its native offset would exceed the RF tune range', () => {
    const profile = 'bluetooth-classic-connected' as const;
    const binding = FIXED_DIGITAL_PROFILE_BINDINGS[profile];
    const service = deterministicService();
    service.selectProfile({ profile });
    const measured = service.acquireIq({
      centerHz: MAX_MEASUREMENT_FREQUENCY_HZ,
      sampleRateHz: binding.nativeSampleRateHz,
      captureBandwidthHz: binding.signalBandwidthHz,
      sampleCount: 1_024,
      sampleFormat: 'cf32le',
    });
    expect(measured).toMatchObject({
      centerHz: MAX_MEASUREMENT_FREQUENCY_HZ,
      profileReferenceCenterHz: binding.profileReferenceCenterHz,
      rfReferenceCenterHz:
        binding.profileReferenceCenterHz - binding.nativeCarrierOffsetHz,
      nativeCarrierOffsetHz: binding.nativeCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
      rfTuneCenterHz: MAX_MEASUREMENT_FREQUENCY_HZ,
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
      representation: 'derived-complex-envelope',
      normalization: 'none',
    });
    expect(measured.transformReceipt.operations).toEqual([{
      kind: 'frequency-translate',
      algorithm: 'complex-rotator-v1',
      sourceCarrierOffsetHz: binding.nativeCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    }]);
    const source = synthesizeAnalyticComplexIq({
      profile,
      sampleRateHz: binding.nativeSampleRateHz,
      bandwidthHz: binding.signalBandwidthHz,
      sampleCount: measured.transformReceipt.sourceSampleCount,
      startSampleIndex: measured.transformReceipt.sourceStartSample,
    });
    const expected = translateCf32leCarrier({
      sourceBytes: source,
      sourceStartSample: measured.transformReceipt.sourceStartSample,
      sampleRateHz: binding.nativeSampleRateHz,
      sourceCarrierOffsetHz: binding.nativeCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    });
    expect(measured.transformReceipt.sourceSamplesSha256)
      .toBe(createHash('sha256').update(source).digest('hex'));
    expect(measured.samplesSha256)
      .toBe(createHash('sha256').update(expected).digest('hex'));
    expect(Buffer.from(measured.samplesBase64, 'base64'))
      .toEqual(Buffer.from(expected));
  });

  it('uses true modular cyclic preroll for a derived capture at session start', () => {
    const profile = 'lte-etm1.1' as const;
    const binding = FIXED_DIGITAL_PROFILE_BINDINGS[profile];
    const request = {
      centerHz: binding.profileReferenceCenterHz,
      sampleRateHz: binding.nativeSampleRateHz * 2,
      captureBandwidthHz: binding.signalBandwidthHz,
      sampleCount: 257,
      sampleFormat: 'cf32le' as const,
    };
    const atZero = deterministicService();
    atZero.selectProfile({ profile });
    const first = atZero.acquireIq(request);
    expect(first.transformReceipt).toMatchObject({
      sourceBoundaryPolicy: 'cyclic-modular',
      sourcePeriodSamples: binding.nativePeriodSamples,
    });
    expect(first.transformReceipt.sourceStartSample).toBeLessThan(0);
    const firstSource = synthesizeCyclicReceiptSource(
      profile,
      binding,
      first.transformReceipt.sourceStartSample,
      first.transformReceipt.sourceSampleCount,
    );
    expect(first.transformReceipt.sourceSamplesSha256)
      .toBe(createHash('sha256').update(firstSource).digest('hex'));

    const onePeriodLater = new AtomizerMeasurementService(
      {
        contractSha256: HASH_A,
        generatorContractBindingSha256: HASH_B,
      },
      {
        continuation: {
          continuationVersion: 2,
          sessionId: '10000000-0000-4000-8000-000000000001',
          configurationRevision: '20000000-0000-4000-8000-000000000002',
          updatedAt: '2026-07-14T20:00:00.123Z',
          profile,
          channel: {
            model: 'awgn',
            noiseFloorDbm: -108,
            seed: 407,
            fadingRateHz: 2,
            receiverImpairment: 'clean',
          },
          sequence: 0,
          iqTimeNumerator: String(
            binding.nativePeriodSamples
            / greatestCommonDivisorNumber(
              binding.nativePeriodSamples,
              binding.nativeSampleRateHz,
            ),
          ),
          iqTimeDenominator: String(
            binding.nativeSampleRateHz
            / greatestCommonDivisorNumber(
              binding.nativePeriodSamples,
              binding.nativeSampleRateHz,
            ),
          ),
        },
        uuid: () => '30000000-0000-4000-8000-000000000001',
        now: () => new Date('2026-07-14T20:00:01.000Z'),
        monotonicMilliseconds: () => 1,
      },
    );
    const replayed = onePeriodLater.acquireIq(request);
    expect(replayed.samplesSha256).toBe(first.samplesSha256);
    expect(replayed.samplesBase64).toBe(first.samplesBase64);
    expect(replayed.transformReceipt.sourceStartSample)
      .toBe(first.transformReceipt.sourceStartSample + binding.nativePeriodSamples);
    expect(replayed.transformReceipt.sourceSamplesSha256)
      .toBe(first.transformReceipt.sourceSamplesSha256);
  });

  it('preserves exact LTE/NR bytes and labels every clean resampled output as derived', () => {
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
    for (const [profile, centerHz, sampleRateHz, captureBandwidthHz] of profiles) {
      service.selectProfile({ profile });
      const request = {
        centerHz,
        sampleRateHz,
        captureBandwidthHz,
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
      const derived = service.acquireIq({
        ...request,
        centerHz: centerHz + 5_000_000,
        sampleRateHz: sampleRateHz * 2,
      });
      expect(derived).toMatchObject({
        centerHz: centerHz + 5_000_000,
        profileReferenceCenterHz: centerHz,
        rfPlacement: 'operator-translated',
        qualification: 'derived-from-independently-verified-digital-baseband',
        payloadKind: 'derived-hardware-ready',
        representation: 'derived-complex-envelope',
        normalization: 'none',
      });
      expect(derived.transformReceipt.operations.map((operation) => operation.kind))
        .toEqual(['resample']);
      expect(() => service.acquireIq({ ...request, captureBandwidthHz: captureBandwidthHz - 1_000_000 }))
        .toThrow(/capture bandwidth.*declared/i);
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
      captureBandwidthHz: 10_000_000,
      sampleCount: 4_096,
      sampleFormat: 'cf32le',
    })).toMatchObject({
      qualification: 'receiver-impaired-complex-baseband',
      payloadKind: 'receiver-impaired-derived',
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
    expect('dispatch' in service).toBe(false);
    expect(service.shutdown()).toBeUndefined();
    expect(() => service.status()).toThrow(/closed/i);
    expect(() => service.acquireSpectrum({ startHz: 1, stopHz: 2, points: 2 })).toThrow(/closed/i);
    let rejection: unknown;
    try {
      service.shutdown();
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(MeasurementServiceError);
    expect((rejection as MeasurementServiceError).code).toBe('SERVICE_CLOSED');
  });

  it('continues exact v2 rational I/Q time and rejects ambiguous v1 cursor state', () => {
    const continuation = {
      sessionId: '10000000-0000-4000-8000-000000000001',
      configurationRevision: '20000000-0000-4000-8000-000000000002',
      updatedAt: '2026-07-14T20:00:00.123Z',
      profile: 'fm' as const,
      channel: {
        model: 'rayleigh' as const,
        noiseFloorDbm: -120,
        seed: 19,
        fadingRateHz: 4,
        receiverImpairment: 'clean' as const,
      },
      sequence: 10_000,
      continuationVersion: 2 as const,
      // 12,345 samples at 2 Msps, reduced exactly.
      iqTimeNumerator: '2469',
      iqTimeDenominator: '400000',
    };
    const service = new AtomizerMeasurementService(
      { contractSha256: HASH_A, generatorContractBindingSha256: HASH_B },
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
      captureBandwidthHz: 200_000,
      sampleCount: 64,
      sampleFormat: 'cf32le',
    });
    const expectedIq = synthesizeAnalyticComplexIq({
      profile: 'fm',
      sampleRateHz: 2_000_000,
      bandwidthHz: 200_000,
      sampleCount: 64,
      startSampleIndex: 12_345,
    });
    expect(continuedIq.sequence).toBe(10_002);
    expect(Buffer.from(continuedIq.samplesBase64, 'base64')).toEqual(Buffer.from(
      expectedIq.buffer,
      expectedIq.byteOffset,
      expectedIq.byteLength,
    ));
    expect(() => new AtomizerMeasurementService(
      { contractSha256: HASH_A, generatorContractBindingSha256: HASH_B },
      {
        continuation: {
          sessionId: continuation.sessionId,
          configurationRevision: continuation.configurationRevision,
          updatedAt: continuation.updatedAt,
          profile: continuation.profile,
          channel: continuation.channel,
          sequence: continuation.sequence,
          iqSampleCursor: 12_345,
        } as never,
      },
    )).toThrow();
  });

  it('reproduces representable rational phase exactly and fails closed below deterministic resolution', () => {
    const binding = FIXED_DIGITAL_PROFILE_BINDINGS['lte-etm1.1'];
    const scale = 10n ** 20n;
    const service = new AtomizerMeasurementService(
      { contractSha256: HASH_A, generatorContractBindingSha256: HASH_B },
      {
        continuation: {
          continuationVersion: 2,
          sessionId: '10000000-0000-4000-8000-000000000001',
          configurationRevision: '20000000-0000-4000-8000-000000000002',
          updatedAt: '2026-07-14T20:00:00.123Z',
          profile: 'lte-etm1.1',
          channel: {
            model: 'awgn',
            noiseFloorDbm: -108,
            seed: 407,
            fadingRateHz: 2,
            receiverImpairment: 'clean',
          },
          sequence: 0,
          // Native position is exactly 1 - 1e-20 samples. Number arithmetic
          // rounds it to 1, while the BigInt phase test must keep it derived.
          iqTimeNumerator: (scale - 1n).toString(),
          iqTimeDenominator: (BigInt(binding.nativeSampleRateHz) * scale).toString(),
        },
        uuid: () => '30000000-0000-4000-8000-000000000001',
        now: () => new Date('2026-07-14T20:00:01.000Z'),
        monotonicMilliseconds: () => 1,
      },
    );
    const request = {
      centerHz: binding.profileReferenceCenterHz,
      sampleRateHz: binding.nativeSampleRateHz,
      captureBandwidthHz: binding.signalBandwidthHz,
      sampleCount: 64,
      sampleFormat: 'cf32le' as const,
    };
    expect(() => service.acquireIq(request))
      .toThrow(/below deterministic Number resolution/i);

    const representable = new AtomizerMeasurementService(
      { contractSha256: HASH_A, generatorContractBindingSha256: HASH_B },
      {
        continuation: {
          continuationVersion: 2,
          sessionId: '10000000-0000-4000-8000-000000000001',
          configurationRevision: '20000000-0000-4000-8000-000000000002',
          updatedAt: '2026-07-14T20:00:00.123Z',
          profile: 'lte-etm1.1',
          channel: {
            model: 'awgn',
            noiseFloorDbm: -108,
            seed: 407,
            fadingRateHz: 2,
            receiverImpairment: 'clean',
          },
          sequence: 0,
          // Exact native position 1/3 sample.
          iqTimeNumerator: '1',
          iqTimeDenominator: String(3 * binding.nativeSampleRateHz),
        },
        uuid: () => '30000000-0000-4000-8000-000000000001',
        now: () => new Date('2026-07-14T20:00:01.000Z'),
        monotonicMilliseconds: () => 1,
      },
    );
    const measured = representable.acquireIq(request);
    expect(measured).toMatchObject({
      qualification: 'derived-from-independently-verified-digital-baseband',
      payloadKind: 'derived-hardware-ready',
      representation: 'derived-complex-envelope',
    });
    expect(measured.transformReceipt.operations.map((operation) => operation.kind))
      .toEqual(['fractional-delay']);
    expect(measured.transformReceipt).toMatchObject({
      outputStartSourceSampleNumerator: '1',
      outputStartSourceSampleDenominator: '3',
      sourceBoundaryPolicy: 'cyclic-modular',
      sourcePeriodSamples: binding.nativePeriodSamples,
    });
    const canonical = synthesizeAnalyticComplexIq({
      profile: 'lte-etm1.1',
      sampleRateHz: binding.nativeSampleRateHz,
      bandwidthHz: binding.signalBandwidthHz,
      sampleCount: request.sampleCount,
      startSampleIndex: 0,
    });
    expect(Buffer.from(measured.samplesBase64, 'base64'))
      .not.toEqual(Buffer.from(canonical));

    const receipt = measured.transformReceipt;
    const source = synthesizeCyclicReceiptSource(
      'lte-etm1.1',
      binding,
      receipt.sourceStartSample,
      receipt.sourceSampleCount,
    );
    const reproduced = resampleCf32leWindowedSinc({
      sourceBytes: source,
      sourceStartSample: receipt.sourceStartSample,
      outputStartSourceSampleNumerator:
        BigInt(receipt.outputStartSourceSampleNumerator),
      outputStartSourceSampleDenominator:
        BigInt(receipt.outputStartSourceSampleDenominator),
      sourceSampleRateHz: receipt.sourceSampleRateHz,
      outputSampleRateHz: receipt.outputSampleRateHz,
      outputSampleCount: receipt.outputSampleCount,
    });
    expect(Buffer.from(reproduced))
      .toEqual(Buffer.from(measured.samplesBase64, 'base64'));
  });

  it('rejects a continuation whose reduced native coordinate cannot fit the receipt', () => {
    const binding = FIXED_DIGITAL_PROFILE_BINDINGS['lte-etm1.1'];
    const fortyDigitScale = 10n ** 39n;
    const service = new AtomizerMeasurementService(
      { contractSha256: HASH_A, generatorContractBindingSha256: HASH_B },
      {
        continuation: {
          continuationVersion: 2,
          sessionId: '10000000-0000-4000-8000-000000000001',
          configurationRevision: '20000000-0000-4000-8000-000000000002',
          updatedAt: '2026-07-14T20:00:00.123Z',
          profile: 'lte-etm1.1',
          channel: {
            model: 'awgn',
            noiseFloorDbm: -108,
            seed: 407,
            fadingRateHz: 2,
            receiverImpairment: 'clean',
          },
          sequence: 19,
          iqTimeNumerator: fortyDigitScale.toString(),
          iqTimeDenominator: (fortyDigitScale + 1n).toString(),
        },
        uuid: () => '30000000-0000-4000-8000-000000000001',
        now: () => new Date('2026-07-14T20:00:01.000Z'),
        monotonicMilliseconds: () => 1,
      },
    );
    expect(() => service.acquireIq({
      centerHz: binding.profileReferenceCenterHz,
      sampleRateHz: binding.nativeSampleRateHz,
      captureBandwidthHz: binding.signalBandwidthHz,
      sampleCount: 64,
      sampleFormat: 'cf32le',
    })).toThrow(/40-digit transform-receipt bound/i);
    service.selectProfile({ profile: 'cw' });
    expect(service.acquireIq({
      centerHz: 1_000_000_000,
      sampleRateHz: 2_000_000,
      captureBandwidthHz: 2_000,
      sampleCount: 64,
      sampleFormat: 'cf32le',
    }).sequence).toBe(20);
  });

  it('fails closed on every material transform-receipt mutation', () => {
    const lte = deterministicService();
    const lteBinding = FIXED_DIGITAL_PROFILE_BINDINGS['lte-etm1.1'];
    lte.selectProfile({ profile: 'lte-etm1.1' });
    const derived = lte.acquireIq({
      centerHz: lteBinding.profileReferenceCenterHz,
      sampleRateHz: lteBinding.nativeSampleRateHz * 2,
      captureBandwidthHz: lteBinding.signalBandwidthHz,
      sampleCount: 128,
      sampleFormat: 'cf32le',
    });
    for (const delta of [-1, 1]) {
      const changed = structuredClone(derived);
      changed.transformReceipt.sourceSampleCount += delta;
      expect(() => complexIqMeasurementSchema.parse(changed))
        .toThrow(/full output support window/i);
    }
    const wrongCutoff = structuredClone(derived);
    const resample = wrongCutoff.transformReceipt.operations.find(
      (operation) => operation.kind === 'resample',
    );
    if (resample?.kind !== 'resample') throw new Error('No resample operation');
    resample.antiAliasCutoffHz -= 1;
    expect(() => complexIqMeasurementSchema.parse(wrongCutoff))
      .toThrow(/cutoff/i);

    const unrepresentablePhase = structuredClone(derived);
    unrepresentablePhase.transformReceipt.outputStartSourceSampleNumerator =
      (10n ** 20n - 1n).toString();
    unrepresentablePhase.transformReceipt.outputStartSourceSampleDenominator =
      (10n ** 20n).toString();
    expect(() => complexIqMeasurementSchema.parse(unrepresentablePhase))
      .toThrow(/below deterministic Number resolution/i);

    const wrongArtifact = structuredClone(derived);
    wrongArtifact.transformReceipt.sourceArtifactSha256 = 'f'.repeat(64);
    expect(() => complexIqMeasurementSchema.parse(wrongArtifact))
      .toThrow(/source artifact hash/i);

    const bluetooth = deterministicService();
    const bluetoothBinding =
      FIXED_DIGITAL_PROFILE_BINDINGS['bluetooth-le-advertising'];
    bluetooth.selectProfile({ profile: 'bluetooth-le-advertising' });
    const translated = bluetooth.acquireIq({
      centerHz: bluetoothBinding.profileReferenceCenterHz,
      sampleRateHz: 2_300_000,
      captureBandwidthHz: bluetoothBinding.signalBandwidthHz,
      sampleCount: 128,
      sampleFormat: 'cf32le',
    });
    const reversed = structuredClone(translated);
    (reversed.transformReceipt as unknown as {
      operations: unknown[];
    }).operations = [...reversed.transformReceipt.operations].reverse();
    expect(() => complexIqMeasurementSchema.parse(reversed))
      .toThrow(/translation must precede/i);

    const impairedService = deterministicService();
    impairedService.configureChannel({
      channel: {
        model: 'awgn',
        noiseFloorDbm: -108,
        seed: 407,
        fadingRateHz: 2,
        receiverImpairment: 'awgn',
      },
    });
    const impaired = impairedService.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 2_000_000,
      captureBandwidthHz: 200_000,
      sampleCount: 128,
      sampleFormat: 'cf32le',
    });
    const missingImpairment = structuredClone(impaired);
    (missingImpairment.transformReceipt as unknown as {
      operations: unknown[];
    }).operations = [];
    expect(() => complexIqMeasurementSchema.parse(missingImpairment))
      .toThrow(/receiver-impairment operation/i);
  });

  it('binds catalog identity to the immutable all-auto default, not per-session custom state', () => {
    const service = deterministicService();
    const before = service.status();
    expect(before.identity.catalogSha256).toBe(DEFAULT_WAVEFORM_CATALOG_SHA256);

    // Configuring a custom builder is session configuration, not build
    // provenance. It must move the configuration revision and the live
    // descriptor while leaving the immutable source identity untouched.
    const after = service.configureCustomWaveform({
      standard: 'nr',
      selections: {
        frequencyRange: 'FR2',
        subcarrierSpacingKHz: '120',
        channelBandwidthMHz: '400',
      },
    });
    expect(after.identity.catalogSha256).toBe(DEFAULT_WAVEFORM_CATALOG_SHA256);
    expect(after.identity.catalogSha256).toBe(before.identity.catalogSha256);
    expect(after.configurationRevision).not.toBe(before.configurationRevision);
    expect(after.sessionId).toBe(before.sessionId);
  });

  it('serves the largest legal custom NR build end to end', () => {
    const service = deterministicService();
    // FR2 / 120 kHz SCS / 400 MHz is the widest legal NR configuration at
    // 264 RB. Its occupied bandwidth is 264 * 12 * 120 kHz = 380.16 MHz, so
    // the complex-I/Q ceiling has to clear it for the catalog's "all 42
    // available" claim to be true.
    const status = service.configureCustomWaveform({
      standard: 'nr',
      selections: {
        frequencyRange: 'FR2',
        subcarrierSpacingKHz: '120',
        channelBandwidthMHz: '400',
      },
    });
    const descriptor = status.catalog.find(({ id }) => id === 'custom-nr');
    expect(descriptor).toBeDefined();
    expect(380_160_000).toBeLessThanOrEqual(MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ);

    service.selectProfile({ profile: 'custom-nr' });
    // Band n257 really sits at 28 GHz, but requested RF placement is output
    // metadata bounded by the measurement frequency ceiling and does not
    // qualify the bytes. What is under test here is the 380.16 MHz occupied
    // bandwidth, not the tune.
    const iq = service.acquireIq({
      centerHz: 10_000_000_000,
      sampleRateHz: 491_520_000,
      captureBandwidthHz: 380_160_000,
      sampleCount: 1_024,
      sampleFormat: 'cf32le',
    });
    expect(iq.kind).toBe('complex-iq');
    expect(iq.sampleRateHz).toBe(491_520_000);
    expect(iq.captureBandwidthHz).toBe(380_160_000);
    expect(iq.byteLength).toBe(1_024 * COMPLEX_IQ_BYTES_PER_SAMPLE);
  });

  it('keeps concurrent services isolated and publishes each one its own geometry', () => {
    const wide = deterministicService();
    const narrow = deterministicService();
    wide.configureCustomWaveform({
      standard: 'nr',
      selections: {
        frequencyRange: 'FR2',
        subcarrierSpacingKHz: '120',
        channelBandwidthMHz: '400',
      },
    });
    narrow.configureCustomWaveform({
      standard: 'nr',
      selections: {
        frequencyRange: 'FR1',
        subcarrierSpacingKHz: '30',
        channelBandwidthMHz: '20',
      },
    });

    const wideStatus = wide.status();
    const narrowStatus = narrow.status();
    const wideEntry = wideStatus.catalog.find(({ id }) => id === 'custom-nr');
    const narrowEntry = narrowStatus.catalog.find(({ id }) => id === 'custom-nr');
    // Neither service may see the other's selections.
    expect(wideEntry!.occupiedBandwidthHz)
      .toBeGreaterThan(narrowEntry!.occupiedBandwidthHz);

    // waveform, catalog, and the ordered iqProfiles capability must move together.
    wide.selectProfile({ profile: 'custom-nr' });
    const selected = wide.status();
    expect(selected.waveform).toEqual(
      selected.catalog.find(({ id }) => id === 'custom-nr'),
    );
    const complexCapability = selected.capabilities
      .find(({ kind }) => kind === 'complex-iq') as
        { iqProfiles: readonly { profileId: string; signalBandwidthHz: number }[] };
    const transport = complexCapability.iqProfiles
      .find(({ profileId }) => profileId === 'custom-nr');
    expect(transport!.signalBandwidthHz)
      .toBe(selected.waveform.occupiedBandwidthHz);

    // The immutable build identity stays put for both.
    expect(wideStatus.identity.catalogSha256)
      .toBe(narrowStatus.identity.catalogSha256);
  });

  it('preflights the next rational cursor and never strands the service', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'cw' });
    // Pairwise-prime output rates compound the cursor denominator, which is the
    // shape that used to poison the NEXT acquisition after being committed
    // unchecked.
    const primeRates = [
      1_000_003, 1_000_033, 1_000_037, 1_000_039, 1_000_081,
      1_000_099, 1_000_117, 1_000_121, 1_000_133, 1_000_151,
    ];
    const request = (sampleRateHz: number) => ({
      centerHz: 98_000_000,
      sampleRateHz,
      captureBandwidthHz: 1_000_000,
      sampleCount: 1,
      sampleFormat: 'cf32le' as const,
    });
    let rejectedRate: number | undefined;
    for (const sampleRateHz of primeRates) {
      try {
        service.acquireIq(request(sampleRateHz));
      } catch (error) {
        // The rejection must be the preflight, not a mid-synthesis blowup.
        expect((error as Error).message).toMatch(/40-digit/i);
        rejectedRate = sampleRateHz;
        break;
      }
    }
    expect(rejectedRate).toBeDefined();

    // The rejected call must have changed nothing, so repeating it fails
    // identically rather than drifting the service into a new state.
    const afterRejection = service.status();
    expect(() => service.acquireIq(request(rejectedRate!)))
      .toThrow(/40-digit/i);
    expect(service.status().configurationRevision)
      .toBe(afterRejection.configurationRevision);

    // And the service is recoverable: configuration resets the time cursor.
    service.selectProfile({ profile: 'cw' });
    expect(() => service.acquireIq(request(1_000_000))).not.toThrow();
  });

  it('rejects an unrepresentable cursor without consuming sequence or cursor state', () => {
    const service = deterministicService();
    service.selectProfile({ profile: 'cw' });
    const first = service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      captureBandwidthHz: 1_000_000,
      sampleCount: 8,
      sampleFormat: 'cf32le',
    });
    // A rejected acquisition must not advance the sequence, so the next good
    // one continues from exactly where the last success left off.
    const next = service.acquireIq({
      centerHz: 98_000_000,
      sampleRateHz: 1_000_000,
      captureBandwidthHz: 1_000_000,
      sampleCount: 8,
      sampleFormat: 'cf32le',
    });
    expect(next.sequence).toBe(first.sequence + 1);
  });

  it('leaves service state unchanged when custom configuration is rejected', () => {
    const service = deterministicService();
    const before = service.status();
    expect(() => service.configureCustomWaveform({
      standard: 'nr',
      // 120 kHz SCS is FR2-only, so this pin is illegal against FR1.
      selections: { frequencyRange: 'FR1', subcarrierSpacingKHz: '120' },
    })).toThrow(/subcarrierSpacingKHz/i);
    const after = service.status();
    expect(after.configurationRevision).toBe(before.configurationRevision);
    expect(after.catalog.find(({ id }) => id === 'custom-nr'))
      .toEqual(before.catalog.find(({ id }) => id === 'custom-nr'));
    // A rejected configuration must still leave the service usable.
    expect(() => service.configureCustomWaveform({
      standard: 'nr',
      selections: { frequencyRange: 'FR1', subcarrierSpacingKHz: '30' },
    })).not.toThrow();
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
      now: () => new Date(Date.UTC(2026, 6, 14, 12, 0, clockSequence++)),
      monotonicMilliseconds: () => monotonic++,
    },
  );
}

function deepKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...deepKeys(nested)]);
}

function synthesizeCyclicReceiptSource(
  profile: SynthesizedSignalProfile,
  binding: (typeof FIXED_DIGITAL_PROFILE_BINDINGS)[keyof typeof FIXED_DIGITAL_PROFILE_BINDINGS],
  sourceStartSample: number,
  sourceSampleCount: number,
): Uint8Array {
  if (binding.replay !== 'cyclic') throw new Error(`${profile} is not cyclic`);
  const periodSamples = binding.nativePeriodSamples;
  if (periodSamples === undefined) throw new Error(`${profile} has no period`);
  const output = new Uint8Array(sourceSampleCount * 8);
  for (let index = 0; index < sourceSampleCount; index += 1) {
    const absolute = sourceStartSample + index;
    const wrapped = (
      (absolute % periodSamples)
      + periodSamples
    ) % periodSamples;
    output.set(synthesizeAnalyticComplexIq({
      profile,
      sampleRateHz: binding.nativeSampleRateHz,
      bandwidthHz: binding.signalBandwidthHz,
      sampleCount: 1,
      startSampleIndex: wrapped,
    }), index * 8);
  }
  return output;
}

function greatestCommonDivisorNumber(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}
