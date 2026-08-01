import { z } from 'zod';
import { base64ToBytes, bytesToBase64, sha256HexOfBytes } from './platform-bytes.js';
import {
  ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE,
  ANALYTIC_COMPLEX_IQ_PROFILES,
  MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_BYTES,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
  MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
  MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
} from './complex-iq.js';
import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MEASUREMENT_FREQUENCY_STEP_HZ,
  MIN_MEASUREMENT_FREQUENCY_HZ,
  receiverImpairmentPresetSchema,
  replayChannelConfigurationSchema,
  synthesizedSignalProfileSchema,
  waveformDescriptorSchema,
  type SynthesizedSignalProfile,
} from './contracts.js';
import { waveformCatalog } from './catalog.js';
import {
  fixedDigitalProfileBinding,
  isFixedDigitalProfile,
} from './fixed-digital-profile-binding.js';

export const ATOMIZER_MEASUREMENT_CONTRACT_ID = 'tinysa-signal-lab-atomizer-measurement' as const;
export const ATOMIZER_MEASUREMENT_CONTRACT_VERSION = 2 as const;
export const ATOMIZER_MEASUREMENT_PROTOCOL = 'signal-lab-measurement-bridge' as const;

export { MAX_MEASUREMENT_FREQUENCY_HZ } from './contracts.js';
export const MAX_SPECTRUM_POINTS = 4_096 as const;
export const MAX_DETECTED_POWER_POINTS = 4_096 as const;
export const MAX_COMPLEX_IQ_SAMPLES = MAX_ANALYTIC_COMPLEX_IQ_SAMPLES;
export const COMPLEX_IQ_BYTES_PER_SAMPLE = ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE;
export const MAX_COMPLEX_IQ_BYTES = MAX_ANALYTIC_COMPLEX_IQ_BYTES;
export const MIN_COMPLEX_IQ_SAMPLE_RATE_HZ = MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ;
export const MAX_COMPLEX_IQ_SAMPLE_RATE_HZ = MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ;
export const MIN_COMPLEX_IQ_BANDWIDTH_HZ = MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ;
export const MAX_COMPLEX_IQ_BANDWIDTH_HZ = MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ;
export const COMPLEX_IQ_SAMPLE_FORMAT = 'cf32le' as const;
export const COMPLEX_IQ_ENCODING = 'base64' as const;
export const MIN_SAMPLE_PERIOD_SECONDS = 0.000_001 as const;
export const MAX_SAMPLE_PERIOD_SECONDS = 10 as const;

export const measurementBridgeClaimsSchema = z.object({
  usbEmulated: z.literal(false),
  firmwareExecuted: z.literal(false),
  rfEmitted: z.literal(false),
}).strict();
export type MeasurementBridgeClaims = z.infer<typeof measurementBridgeClaimsSchema>;

export const MEASUREMENT_BRIDGE_CLAIMS: MeasurementBridgeClaims = Object.freeze({
  usbEmulated: false,
  firmwareExecuted: false,
  rfEmitted: false,
});

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const opaqueIdSchema = z.string().uuid();
const isoInstantSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const finitePowerSchema = z.number().finite().min(-1_000).max(1_000);
const frequencySchema = z.number().finite().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ);
const maximumComplexIqBase64Characters = 4 * Math.ceil(MAX_COMPLEX_IQ_BYTES / 3);
const canonicalBase64Schema = z.string()
  .min(12)
  .max(maximumComplexIqBase64Characters)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

/**
 * Immutable build identity for the closed all-auto catalog. Per-session custom
 * builder selections are configuration state and intentionally do not mutate
 * source identity.
 */
export const DEFAULT_WAVEFORM_CATALOG_SHA256 =
  sha256HexOfBytes(JSON.stringify(waveformCatalog));

export const measurementSourceIdentitySchema = z.object({
  driverId: z.literal('signal-lab'),
  sourceKind: z.literal('signal-lab-simulation'),
  execution: z.literal('signal-lab-simulation'),
  transport: z.literal(ATOMIZER_MEASUREMENT_PROTOCOL),
  contractId: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_ID),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  contractSha256: sha256Schema,
  catalogSha256: sha256Schema,
  generatorContractBindingSha256: sha256Schema,
  claims: measurementBridgeClaimsSchema,
}).strict();
export type MeasurementSourceIdentity = z.infer<typeof measurementSourceIdentitySchema>;

export const sweptSpectrumCapabilitySchema = z.object({
  kind: z.literal('swept-spectrum'),
  minimumFrequencyHz: z.literal(MIN_MEASUREMENT_FREQUENCY_HZ),
  maximumFrequencyHz: z.literal(MAX_MEASUREMENT_FREQUENCY_HZ),
  minimumPoints: z.literal(2),
  maximumPoints: z.literal(MAX_SPECTRUM_POINTS),
  frequencyUnit: z.literal('Hz'),
  powerUnit: z.literal('dBm'),
  qualification: z.literal('synthetic-visual-projection'),
}).strict();

export const detectedPowerCapabilitySchema = z.object({
  kind: z.literal('detected-power-timeseries'),
  minimumFrequencyHz: z.literal(MIN_MEASUREMENT_FREQUENCY_HZ),
  maximumFrequencyHz: z.literal(MAX_MEASUREMENT_FREQUENCY_HZ),
  frequencyStepHz: z.literal(MEASUREMENT_FREQUENCY_STEP_HZ),
  frequencyUnit: z.literal('Hz'),
  minimumPoints: z.literal(1),
  maximumPoints: z.literal(MAX_DETECTED_POWER_POINTS),
  minimumSamplePeriodSeconds: z.literal(MIN_SAMPLE_PERIOD_SECONDS),
  maximumSamplePeriodSeconds: z.literal(MAX_SAMPLE_PERIOD_SECONDS),
  powerUnit: z.literal('dBm'),
  qualification: z.literal('synthetic-visual-projection'),
}).strict();

export const iqProfileTransportSchema = z.object({
  profileId: synthesizedSignalProfileSchema,
  /**
   * Null means the profile is generated directly at the requested transport
   * rate and has no immutable native-rate artifact.
   */
  nativeSampleRateHz: z.number().safe().int().positive().nullable(),
  signalBandwidthHz: z.number().safe().int().positive(),
  profileReferenceCenterHz: z.number().safe().int()
    .min(MIN_MEASUREMENT_FREQUENCY_HZ)
    .max(MAX_MEASUREMENT_FREQUENCY_HZ),
  nativeCarrierOffsetHz: z.number().safe().int(),
  /**
   * Smallest symmetric capture about the native RF tune center which contains
   * the complete native signal support. Null for rate-flexible generators.
   */
  nativeMinimumCaptureBandwidthHz: z.number().safe().int().positive().nullable(),
  replay: z.enum(['continuous', 'cyclic', 'one-shot', 'unbounded']),
  /** Native-domain period used for modular FIR support and exact replay. */
  nativePeriodSamples: z.number().safe().int().positive().optional(),
  /** Native-domain limit. Output limits are derived from the rate ratio. */
  maxOneShotSamples: z.number().safe().int().positive().optional(),
  derivedTransportSupported: z.boolean(),
}).strict().superRefine((profile, context) => {
  if ((profile.replay === 'one-shot') !== (profile.maxOneShotSamples !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['maxOneShotSamples'],
      message: 'Only one-shot profiles declare a native-domain sample limit',
    });
  }
  if ((profile.replay === 'cyclic') !== (profile.nativePeriodSamples !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['nativePeriodSamples'],
      message: 'Only cyclic artifact profiles declare a native-domain period',
    });
  }
  if ((profile.nativeSampleRateHz === null) !== (profile.replay === 'continuous')) {
    context.addIssue({
      code: 'custom',
      path: ['replay'],
      message: 'Only rate-flexible generators use continuous replay',
    });
  }
  if (profile.nativeSampleRateHz === null && profile.derivedTransportSupported) {
    context.addIssue({
      code: 'custom',
      path: ['derivedTransportSupported'],
      message: 'A rate-flexible generator has no native artifact to derive',
    });
  }
  if (profile.nativeSampleRateHz === null && profile.nativeCarrierOffsetHz !== 0) {
    context.addIssue({
      code: 'custom',
      path: ['nativeCarrierOffsetHz'],
      message: 'A rate-flexible generator has no native artifact carrier offset',
    });
  }
  if ((profile.nativeSampleRateHz === null)
    !== (profile.nativeMinimumCaptureBandwidthHz === null)) {
    context.addIssue({
      code: 'custom',
      path: ['nativeMinimumCaptureBandwidthHz'],
      message: 'Only fixed native artifacts declare a native minimum capture bandwidth',
    });
  }
  if (profile.nativeSampleRateHz !== null) {
    const expectedMinimumCaptureBandwidthHz =
      2 * Math.abs(profile.nativeCarrierOffsetHz) + profile.signalBandwidthHz;
    if (profile.nativeMinimumCaptureBandwidthHz !== expectedMinimumCaptureBandwidthHz) {
      context.addIssue({
        code: 'custom',
        path: ['nativeMinimumCaptureBandwidthHz'],
        message: 'Native minimum capture bandwidth must symmetrically contain the offset signal support',
      });
    }
    if (expectedMinimumCaptureBandwidthHz > profile.nativeSampleRateHz) {
      context.addIssue({
        code: 'custom',
        path: ['nativeMinimumCaptureBandwidthHz'],
        message: 'Native minimum capture bandwidth may not exceed the native sample rate',
      });
    }
  }
  if (profile.nativeSampleRateHz !== null && (
    Math.abs(profile.nativeCarrierOffsetHz) + profile.signalBandwidthHz / 2
    > profile.nativeSampleRateHz / 2
  )) {
    context.addIssue({
      code: 'custom',
      path: ['nativeCarrierOffsetHz'],
      message: 'Native carrier offset plus half the signal bandwidth must fit below native Nyquist',
    });
  }
  const rfReferenceCenterHz = profile.profileReferenceCenterHz
    - profile.nativeCarrierOffsetHz;
  if (rfReferenceCenterHz < MIN_MEASUREMENT_FREQUENCY_HZ
    || rfReferenceCenterHz > MAX_MEASUREMENT_FREQUENCY_HZ) {
    context.addIssue({
      code: 'custom',
      path: ['profileReferenceCenterHz'],
      message: 'Canonical RF reference center must be within the admitted RF range',
    });
  }
});
export type IqProfileTransport = z.infer<typeof iqProfileTransportSchema>;

export function iqProfileTransportsForCatalog(
  catalog: readonly z.input<typeof waveformDescriptorSchema>[],
): readonly IqProfileTransport[] {
  const admittedCatalog = z.array(waveformDescriptorSchema)
    .length(ANALYTIC_COMPLEX_IQ_PROFILES.length)
    .parse(catalog);
  for (const [index, descriptor] of admittedCatalog.entries()) {
    if (descriptor.id !== ANALYTIC_COMPLEX_IQ_PROFILES[index]) {
      throw new Error('I/Q transport catalog must exactly match the closed profile order');
    }
  }
  return Object.freeze(admittedCatalog.map((descriptor) => {
    if (!isFixedDigitalProfile(descriptor.id)) {
      return iqProfileTransportSchema.parse({
        profileId: descriptor.id,
        nativeSampleRateHz: null,
        signalBandwidthHz: descriptor.occupiedBandwidthHz,
        profileReferenceCenterHz: descriptor.centerHz,
        nativeCarrierOffsetHz: 0,
        nativeMinimumCaptureBandwidthHz: null,
        replay: 'continuous',
        derivedTransportSupported: false,
      });
    }
    const binding = fixedDigitalProfileBinding(descriptor.id);
    return iqProfileTransportSchema.parse({
      profileId: descriptor.id,
      nativeSampleRateHz: binding.nativeSampleRateHz,
      signalBandwidthHz: binding.signalBandwidthHz,
      profileReferenceCenterHz: binding.profileReferenceCenterHz,
      nativeCarrierOffsetHz: binding.nativeCarrierOffsetHz,
      nativeMinimumCaptureBandwidthHz:
        2 * Math.abs(binding.nativeCarrierOffsetHz) + binding.signalBandwidthHz,
      replay: binding.replay,
      ...binding.replay === 'one-shot'
        ? { maxOneShotSamples: binding.captureSamples }
        : { nativePeriodSamples: binding.nativePeriodSamples },
      derivedTransportSupported: true,
    });
  }));
}

export const IQ_PROFILE_TRANSPORTS: readonly IqProfileTransport[] =
  iqProfileTransportsForCatalog(waveformCatalog);

export const complexIqCapabilitySchema = z.object({
  kind: z.literal('complex-iq'),
  minimumCenterFrequencyHz: z.literal(MIN_MEASUREMENT_FREQUENCY_HZ),
  maximumCenterFrequencyHz: z.literal(MAX_MEASUREMENT_FREQUENCY_HZ),
  frequencyStepHz: z.literal(MEASUREMENT_FREQUENCY_STEP_HZ),
  frequencyUnit: z.literal('Hz'),
  minimumSampleRateHz: z.literal(MIN_COMPLEX_IQ_SAMPLE_RATE_HZ),
  maximumSampleRateHz: z.literal(MAX_COMPLEX_IQ_SAMPLE_RATE_HZ),
  minimumBandwidthHz: z.literal(MIN_COMPLEX_IQ_BANDWIDTH_HZ),
  maximumBandwidthHz: z.literal(MAX_COMPLEX_IQ_BANDWIDTH_HZ),
  bandwidthMode: z.literal('independent'),
  minimumSamples: z.literal(1),
  maximumSamples: z.literal(MAX_COMPLEX_IQ_SAMPLES),
  sampleFormat: z.literal(COMPLEX_IQ_SAMPLE_FORMAT),
  encoding: z.literal(COMPLEX_IQ_ENCODING),
  layout: z.literal('interleaved-iq'),
  byteOrder: z.literal('little-endian'),
  timingQualification: z.literal('simulation-exact'),
  qualification: z.literal('profile-dependent-complex-baseband'),
  profiles: z.array(synthesizedSignalProfileSchema)
    .length(ANALYTIC_COMPLEX_IQ_PROFILES.length)
    .readonly(),
  iqProfiles: z.array(iqProfileTransportSchema)
    .length(ANALYTIC_COMPLEX_IQ_PROFILES.length)
    .readonly(),
}).strict().superRefine((capability, context) => {
  validateComplexIqProfileOrder(capability.profiles, context);
  for (const [index, profile] of capability.iqProfiles.entries()) {
    if (profile.profileId !== ANALYTIC_COMPLEX_IQ_PROFILES[index]) {
      context.addIssue({
        code: 'custom',
        path: ['iqProfiles', index, 'profileId'],
        message: 'I/Q profile transports must exactly match the closed catalog in producer order',
      });
      break;
    }
  }
});

export const measurementCapabilitySchema = z.discriminatedUnion('kind', [
  sweptSpectrumCapabilitySchema,
  detectedPowerCapabilitySchema,
  complexIqCapabilitySchema,
]);
export type MeasurementCapability = z.infer<typeof measurementCapabilitySchema>;

export function measurementCapabilitiesForCatalog(
  catalog: readonly z.input<typeof waveformDescriptorSchema>[],
): readonly MeasurementCapability[] {
  const iqProfiles = iqProfileTransportsForCatalog(catalog);
  return Object.freeze([
    sweptSpectrumCapabilitySchema.parse({
    kind: 'swept-spectrum',
    minimumFrequencyHz: 1,
    maximumFrequencyHz: MAX_MEASUREMENT_FREQUENCY_HZ,
    minimumPoints: 2,
    maximumPoints: MAX_SPECTRUM_POINTS,
    frequencyUnit: 'Hz',
    powerUnit: 'dBm',
    qualification: 'synthetic-visual-projection',
    }),
    detectedPowerCapabilitySchema.parse({
    kind: 'detected-power-timeseries',
    minimumFrequencyHz: MIN_MEASUREMENT_FREQUENCY_HZ,
    maximumFrequencyHz: MAX_MEASUREMENT_FREQUENCY_HZ,
    frequencyStepHz: MEASUREMENT_FREQUENCY_STEP_HZ,
    frequencyUnit: 'Hz',
    minimumPoints: 1,
    maximumPoints: MAX_DETECTED_POWER_POINTS,
    minimumSamplePeriodSeconds: MIN_SAMPLE_PERIOD_SECONDS,
    maximumSamplePeriodSeconds: MAX_SAMPLE_PERIOD_SECONDS,
    powerUnit: 'dBm',
    qualification: 'synthetic-visual-projection',
    }),
    complexIqCapabilitySchema.parse({
    kind: 'complex-iq',
    minimumCenterFrequencyHz: MIN_MEASUREMENT_FREQUENCY_HZ,
    maximumCenterFrequencyHz: MAX_MEASUREMENT_FREQUENCY_HZ,
    frequencyStepHz: MEASUREMENT_FREQUENCY_STEP_HZ,
    frequencyUnit: 'Hz',
    minimumSampleRateHz: MIN_COMPLEX_IQ_SAMPLE_RATE_HZ,
    maximumSampleRateHz: MAX_COMPLEX_IQ_SAMPLE_RATE_HZ,
    minimumBandwidthHz: MIN_COMPLEX_IQ_BANDWIDTH_HZ,
    maximumBandwidthHz: MAX_COMPLEX_IQ_BANDWIDTH_HZ,
    bandwidthMode: 'independent',
    minimumSamples: 1,
    maximumSamples: MAX_COMPLEX_IQ_SAMPLES,
    sampleFormat: COMPLEX_IQ_SAMPLE_FORMAT,
    encoding: COMPLEX_IQ_ENCODING,
    layout: 'interleaved-iq',
    byteOrder: 'little-endian',
    timingQualification: 'simulation-exact',
    qualification: 'profile-dependent-complex-baseband',
    profiles: ANALYTIC_COMPLEX_IQ_PROFILES,
      iqProfiles,
    }),
  ]);
}

export const MEASUREMENT_CAPABILITIES: readonly MeasurementCapability[] =
  measurementCapabilitiesForCatalog(waveformCatalog);

function validateComplexIqProfileOrder(
  profiles: readonly SynthesizedSignalProfile[],
  context: z.RefinementCtx,
): void {
  for (const [index, profile] of profiles.entries()) {
    if (profile !== ANALYTIC_COMPLEX_IQ_PROFILES[index]) {
      context.addIssue({
        code: 'custom',
        path: ['profiles', index],
        message: 'Complex-I/Q profile registry must exactly match the closed catalog in producer order',
      });
      break;
    }
  }
}

export const measurementSourceStatusSchema = z.object({
  kind: z.literal('status'),
  sessionId: opaqueIdSchema,
  configurationRevision: opaqueIdSchema,
  updatedAt: isoInstantSchema,
  available: z.literal(true),
  active: z.literal(true),
  profile: synthesizedSignalProfileSchema,
  profiles: z.array(synthesizedSignalProfileSchema).length(synthesizedSignalProfileSchema.options.length),
  waveform: waveformDescriptorSchema,
  catalog: z.array(waveformDescriptorSchema).length(synthesizedSignalProfileSchema.options.length),
  channel: replayChannelConfigurationSchema,
  capabilities: z.array(measurementCapabilitySchema).length(MEASUREMENT_CAPABILITIES.length),
  identity: measurementSourceIdentitySchema,
}).strict().superRefine((status, context) => {
  if (new Set(status.profiles).size !== status.profiles.length) {
    context.addIssue({ code: 'custom', path: ['profiles'], message: 'Profile identifiers must be unique' });
  }
  const closedOrderMatches = status.profiles.every(
    (profile, index) => profile === synthesizedSignalProfileSchema.options[index],
  );
  if (!closedOrderMatches) {
    context.addIssue({ code: 'custom', path: ['profiles'], message: 'Profile ordering must exactly match the closed profile list' });
  }
  const catalogOrderMatches = status.profiles.every(
    (profile, index) => status.catalog[index]?.id === profile,
  );
  if (!catalogOrderMatches) {
    context.addIssue({ code: 'custom', path: ['catalog'], message: 'Catalog ordering must exactly match the closed profile list' });
  }
  if (status.waveform.id !== status.profile) {
    context.addIssue({ code: 'custom', path: ['waveform'], message: 'The status waveform must describe the selected profile' });
  } else {
    const catalogWaveform = status.catalog.find(
      (descriptor) => descriptor.id === status.profile,
    );
    if (catalogWaveform === undefined
      || JSON.stringify(status.waveform) !== JSON.stringify(catalogWaveform)) {
      context.addIssue({
        code: 'custom',
        path: ['waveform'],
        message: 'The selected status waveform must be byte-for-byte equivalent to its live catalog descriptor',
      });
    }
  }
  if (closedOrderMatches && catalogOrderMatches) {
    const expectedCapabilities = measurementCapabilitiesForCatalog(status.catalog);
    if (JSON.stringify(status.capabilities) !== JSON.stringify(expectedCapabilities)) {
      context.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'Capabilities must atomically describe the same live catalog geometry',
      });
    }
    const complexCapability = status.capabilities.find(
      (capability) => capability.kind === 'complex-iq',
    );
    if (complexCapability?.kind === 'complex-iq') {
      for (const [index, transport] of complexCapability.iqProfiles.entries()) {
        if (transport.nativeSampleRateHz !== null) continue;
        const descriptor = status.catalog[index];
        if (descriptor === undefined
          || transport.profileId !== descriptor.id
          || transport.signalBandwidthHz !== descriptor.occupiedBandwidthHz
          || transport.profileReferenceCenterHz !== descriptor.centerHz) {
          context.addIssue({
            code: 'custom',
            path: ['capabilities', 2, 'iqProfiles', index],
            message: 'Every rate-flexible I/Q transport must share signal bandwidth and reference center with the same live catalog descriptor',
          });
        }
      }
    }
  }
  if (status.identity.catalogSha256 !== DEFAULT_WAVEFORM_CATALOG_SHA256) {
    context.addIssue({
      code: 'custom',
      path: ['identity', 'catalogSha256'],
      message: 'Catalog identity hash must bind the immutable all-auto default catalog',
    });
  }
});
export type MeasurementSourceStatus = z.infer<typeof measurementSourceStatusSchema>;

const measurementCorrelationBaseSchema = z.object({
  measurementId: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  configurationRevision: opaqueIdSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  capturedAt: isoInstantSchema,
  elapsedSeconds: z.number().finite().nonnegative().max(60),
  complete: z.literal(true),
  provenance: measurementSourceIdentitySchema,
});

const scalarMeasurementBaseSchema = measurementCorrelationBaseSchema.extend({
  qualification: z.literal('synthetic-visual-projection'),
});

export const sweptSpectrumMeasurementSchema = scalarMeasurementBaseSchema.extend({
  kind: z.literal('swept-spectrum'),
  startHz: z.number().safe().int().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ),
  stopHz: z.number().safe().int().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ),
  points: z.number().int().min(2).max(MAX_SPECTRUM_POINTS),
  frequencyHz: z.array(frequencySchema).min(2).max(MAX_SPECTRUM_POINTS),
  powerDbm: z.array(finitePowerSchema).min(2).max(MAX_SPECTRUM_POINTS),
}).strict().superRefine((measurement, context) => {
  if (measurement.stopHz <= measurement.startHz) {
    context.addIssue({ code: 'custom', path: ['stopHz'], message: 'Stop frequency must exceed start frequency' });
  }
  if (measurement.frequencyHz.length !== measurement.points || measurement.powerDbm.length !== measurement.points) {
    context.addIssue({ code: 'custom', path: ['points'], message: 'Point count must match both measurement arrays' });
  }
  if (measurement.frequencyHz[0] !== measurement.startHz || measurement.frequencyHz.at(-1) !== measurement.stopHz) {
    context.addIssue({ code: 'custom', path: ['frequencyHz'], message: 'Frequency endpoints must match the requested range' });
  }
  for (let index = 1; index < measurement.frequencyHz.length; index++) {
    if (measurement.frequencyHz[index]! <= measurement.frequencyHz[index - 1]!) {
      context.addIssue({ code: 'custom', path: ['frequencyHz', index], message: 'Frequency points must be strictly increasing' });
      break;
    }
  }
});
export type SweptSpectrumMeasurement = z.infer<typeof sweptSpectrumMeasurementSchema>;

export const detectedPowerMeasurementSchema = scalarMeasurementBaseSchema.extend({
  kind: z.literal('detected-power-timeseries'),
  centerFrequencyHz: z.number().safe().int().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ),
  points: z.number().int().min(1).max(MAX_DETECTED_POWER_POINTS),
  samplePeriodSeconds: z.number().finite().min(MIN_SAMPLE_PERIOD_SECONDS).max(MAX_SAMPLE_PERIOD_SECONDS),
  powerDbm: z.array(finitePowerSchema).min(1).max(MAX_DETECTED_POWER_POINTS),
}).strict().superRefine((measurement, context) => {
  if (measurement.powerDbm.length !== measurement.points) {
    context.addIssue({ code: 'custom', path: ['points'], message: 'Point count must match the detected-power array' });
  }
});
export type DetectedPowerMeasurement = z.infer<typeof detectedPowerMeasurementSchema>;

export const iqTransformOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('resample'),
    algorithm: z.literal('blackman-windowed-sinc-v1'),
    sourceSampleRateHz: z.number().safe().int().positive(),
    outputSampleRateHz: z.number().safe().int().positive(),
    antiAliasCutoffHz: z.number().finite().positive(),
    zeroCrossings: z.literal(16),
  }).strict(),
  z.object({
    kind: z.literal('fractional-delay'),
    algorithm: z.literal('blackman-windowed-sinc-v1'),
    sampleRateHz: z.number().safe().int().positive(),
    phaseNumerator: z.string().regex(/^[1-9][0-9]{0,39}$/),
    phaseDenominator: z.string().regex(/^[1-9][0-9]{0,39}$/),
    antiAliasCutoffHz: z.number().finite().positive(),
    zeroCrossings: z.literal(16),
  }).strict(),
  z.object({
    kind: z.literal('frequency-translate'),
    algorithm: z.literal('complex-rotator-v1'),
    sourceCarrierOffsetHz: z.number().safe().int(),
    outputCarrierOffsetHz: z.number().safe().int(),
  }).strict(),
  z.object({
    kind: z.literal('receiver-impairment'),
    algorithm: z.literal('signal-lab-receiver-impairment-v1'),
    preset: receiverImpairmentPresetSchema.exclude(['clean']),
    seed: z.number().int().min(0).max(0xffff_ffff),
  }).strict(),
]);
export type IqTransformOperation = z.infer<typeof iqTransformOperationSchema>;

export const iqTransformReceiptSchema = z.object({
  receiptVersion: z.literal(1),
  sourceArtifactSha256: sha256Schema.nullable(),
  /** FIR support window in native-domain sample coordinates. */
  sourceStartSample: z.number().safe().int(),
  /** Number of native-domain samples in the FIR/source support window. */
  sourceSampleCount: z.number().safe().int().positive(),
  sourceBoundaryPolicy: z.enum([
    'continuous-session-origin-zero-extended',
    'cyclic-modular',
    'one-shot-zero-extended',
  ]),
  /** Native cyclic period; null for continuous and one-shot sources. */
  sourcePeriodSamples: z.number().safe().int().positive().nullable(),
  /** Exact native-domain coordinate of output sample zero, as a reduced rational. */
  outputStartSourceSampleNumerator: z.string().regex(/^(?:0|[1-9][0-9]{0,39})$/),
  outputStartSourceSampleDenominator: z.string().regex(/^[1-9][0-9]{0,39}$/),
  sourceSampleRateHz: z.number().safe().int().positive(),
  outputSampleRateHz: z.number().safe().int().positive(),
  sourceCarrierOffsetHz: z.number().safe().int(),
  outputCarrierOffsetHz: z.number().safe().int(),
  outputSampleCount: z.number().safe().int().min(1).max(MAX_COMPLEX_IQ_SAMPLES),
  sourceSamplesSha256: sha256Schema,
  outputSamplesSha256: sha256Schema,
  operations: z.array(iqTransformOperationSchema).max(3).readonly(),
}).strict().superRefine((receipt, context) => {
  if ((receipt.sourceBoundaryPolicy === 'cyclic-modular')
    !== (receipt.sourcePeriodSamples !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['sourcePeriodSamples'],
      message: 'Only cyclic modular sources declare a native period',
    });
  }
  if (receipt.sourceBoundaryPolicy === 'continuous-session-origin-zero-extended'
    && receipt.sourceArtifactSha256 !== null) {
    context.addIssue({
      code: 'custom',
      path: ['sourceArtifactSha256'],
      message: 'Continuous generated sources do not identify a canonical artifact',
    });
  }
  if (receipt.sourceBoundaryPolicy !== 'continuous-session-origin-zero-extended'
    && receipt.sourceArtifactSha256 === null) {
    context.addIssue({
      code: 'custom',
      path: ['sourceArtifactSha256'],
      message: 'Cyclic and one-shot source windows require a canonical artifact identity',
    });
  }
  const startNumerator = BigInt(receipt.outputStartSourceSampleNumerator);
  const startDenominator = BigInt(receipt.outputStartSourceSampleDenominator);
  if (greatestCommonDivisorForSchema(startNumerator, startDenominator) !== 1n) {
    context.addIssue({
      code: 'custom',
      path: ['outputStartSourceSampleNumerator'],
      message: 'Output-start native coordinate must be a reduced rational',
    });
  }
  const integerStart = startNumerator / startDenominator;
  if (integerStart < BigInt(receipt.sourceStartSample)
    || integerStart >= (
      BigInt(receipt.sourceStartSample) + BigInt(receipt.sourceSampleCount)
    )) {
    context.addIssue({
      code: 'custom',
      path: ['sourceStartSample'],
      message: 'Native FIR/source support window must contain output sample zero',
    });
  }
  const resamples = receipt.operations.filter((operation) => operation.kind === 'resample');
  if ((receipt.sourceSampleRateHz !== receipt.outputSampleRateHz) !== (resamples.length === 1)) {
    context.addIssue({
      code: 'custom',
      path: ['operations'],
      message: 'Exactly one resample operation is required if and only if sample rates differ',
    });
  }
  if (resamples.length > 1) {
    context.addIssue({ code: 'custom', path: ['operations'], message: 'At most one resampling operation is permitted' });
  }
  const resample = resamples[0];
  if (resample !== undefined && (
    resample.sourceSampleRateHz !== receipt.sourceSampleRateHz
    || resample.outputSampleRateHz !== receipt.outputSampleRateHz
  )) {
    context.addIssue({ code: 'custom', path: ['operations'], message: 'Resample operation rates must match the receipt geometry' });
  }
  if (resample !== undefined) {
    const expectedCutoffHz = receipt.outputSampleRateHz < receipt.sourceSampleRateHz
      ? 0.5 * receipt.outputSampleRateHz * 0.95
      : 0.5 * receipt.sourceSampleRateHz;
    if (!nearlyEqualForSchema(resample.antiAliasCutoffHz, expectedCutoffHz)) {
      context.addIssue({
        code: 'custom',
        path: ['operations'],
        message: 'Resample cutoff must preserve source Nyquist unless downsampling, where it must be 95% of output Nyquist',
      });
    }
  }
  const fractionalDelays = receipt.operations.filter((operation) => operation.kind === 'fractional-delay');
  if (fractionalDelays.length > 1) {
    context.addIssue({ code: 'custom', path: ['operations'], message: 'At most one fractional-delay operation is permitted' });
  }
  const fractionalDelay = fractionalDelays[0];
  const phaseNumerator = startNumerator % startDenominator;
  if (fractionalDelay !== undefined && (
    receipt.sourceSampleRateHz !== receipt.outputSampleRateHz
    || fractionalDelay.sampleRateHz !== receipt.sourceSampleRateHz
    || BigInt(fractionalDelay.phaseNumerator) !== phaseNumerator
    || BigInt(fractionalDelay.phaseDenominator) !== startDenominator
    || !nearlyEqualForSchema(
      fractionalDelay.antiAliasCutoffHz,
      receipt.sourceSampleRateHz / 2,
    )
  )) {
    context.addIssue({ code: 'custom', path: ['operations'], message: 'Fractional delay is only valid at one unchanged receipt sample rate' });
  }
  if (receipt.sourceSampleRateHz === receipt.outputSampleRateHz
    && ((phaseNumerator !== 0n) !== (fractionalDelays.length === 1))) {
    context.addIssue({
      code: 'custom',
      path: ['operations'],
      message: 'At an unchanged sample rate, fractional delay is required if and only if output starts at fractional native phase',
    });
  }
  const firOperation = resample ?? fractionalDelay;
  if (firOperation !== undefined) {
    const coordinateDenominator =
      startDenominator * BigInt(receipt.outputSampleRateHz);
    const initialCoordinateNumerator =
      startNumerator * BigInt(receipt.outputSampleRateHz);
    const coordinateStep =
      BigInt(receipt.sourceSampleRateHz) * startDenominator;
    for (let outputIndex = 0; outputIndex < receipt.outputSampleCount; outputIndex += 1) {
      const coordinateNumerator =
        initialCoordinateNumerator + BigInt(outputIndex) * coordinateStep;
      if (!isRepresentableFractionForSchema(
        coordinateNumerator % coordinateDenominator,
        coordinateDenominator,
      )) {
        context.addIssue({
          code: 'custom',
          path: ['outputStartSourceSampleNumerator'],
          message: 'Exact fractional-delay phase is below deterministic Number resolution',
        });
        break;
      }
    }
  }
  if (firOperation === undefined) {
    if (phaseNumerator !== 0n
      || BigInt(receipt.sourceStartSample) !== integerStart
      || receipt.sourceSampleCount !== receipt.outputSampleCount) {
      context.addIssue({
        code: 'custom',
        path: ['sourceStartSample'],
        message: 'Without resampling, source support must exactly equal the integer-aligned output window',
      });
    }
  } else {
    const cutoffHz = firOperation.antiAliasCutoffHz;
    const radius = Math.ceil(
      16 / (2 * (cutoffHz / receipt.sourceSampleRateHz)),
    );
    const requiredStart = integerStart - BigInt(radius);
    const lastNumerator =
      startNumerator * BigInt(receipt.outputSampleRateHz)
      + BigInt(receipt.outputSampleCount - 1)
        * BigInt(receipt.sourceSampleRateHz)
        * startDenominator;
    const lastDenominator =
      startDenominator * BigInt(receipt.outputSampleRateHz);
    const requiredEnd = (
      lastNumerator + lastDenominator - 1n
    ) / lastDenominator + BigInt(radius);
    const requiredCount = requiredEnd - requiredStart + 1n;
    if (BigInt(receipt.sourceStartSample) !== requiredStart
      || BigInt(receipt.sourceSampleCount) !== requiredCount) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSampleCount'],
        message: 'FIR source support must exactly equal the deterministic full output support window',
      });
    }
  }
  const translations = receipt.operations.filter((operation) => operation.kind === 'frequency-translate');
  const expectedTranslationCount =
    receipt.sourceCarrierOffsetHz === receipt.outputCarrierOffsetHz ? 0 : 1;
  if (translations.length !== expectedTranslationCount) {
    context.addIssue({
      code: 'custom',
      path: ['operations'],
      message: 'Exactly one frequency translation is required if and only if carrier offsets differ',
    });
  }
  const translation = translations[0];
  if (translation !== undefined && (
    translation.sourceCarrierOffsetHz !== receipt.sourceCarrierOffsetHz
    || translation.outputCarrierOffsetHz !== receipt.outputCarrierOffsetHz
  )) {
    context.addIssue({ code: 'custom', path: ['operations'], message: 'Frequency-translation offsets must match the receipt' });
  }
});
export type IqTransformReceipt = z.infer<typeof iqTransformReceiptSchema>;

function isRepresentableFractionForSchema(
  remainder: bigint,
  denominator: bigint,
): boolean {
  if (remainder === 0n) return true;
  const smaller = remainder <= denominator - remainder
    ? remainder
    : denominator - remainder;
  const delta = Number(smaller) / Number(denominator);
  return Number.isFinite(delta) && delta !== 0 && 1 - delta !== 1;
}

export const complexIqMeasurementSchema = measurementCorrelationBaseSchema.extend({
  kind: z.literal('complex-iq'),
  /** Requested output RF placement; metadata only, never artifact identity. */
  centerHz: z.number().safe().int().min(MIN_MEASUREMENT_FREQUENCY_HZ).max(MAX_MEASUREMENT_FREQUENCY_HZ),
  profileReferenceCenterHz: z.number().safe().int().min(MIN_MEASUREMENT_FREQUENCY_HZ).max(MAX_MEASUREMENT_FREQUENCY_HZ),
  rfReferenceCenterHz: z.number().safe().int().min(MIN_MEASUREMENT_FREQUENCY_HZ).max(MAX_MEASUREMENT_FREQUENCY_HZ),
  rfPlacement: z.enum(['profile-reference', 'operator-translated']),
  nativeCarrierOffsetHz: z.number().safe().int(),
  outputCarrierOffsetHz: z.number().safe().int(),
  rfTuneCenterHz: z.number().safe().int().min(MIN_MEASUREMENT_FREQUENCY_HZ).max(MAX_MEASUREMENT_FREQUENCY_HZ),
  /** Output/transport sample rate, which may differ from the native artifact. */
  sampleRateHz: z.number().safe().int().min(MIN_COMPLEX_IQ_SAMPLE_RATE_HZ).max(MAX_COMPLEX_IQ_SAMPLE_RATE_HZ),
  nativeSampleRateHz: z.number().safe().int().positive(),
  /** Output/capture bandwidth setting; not the signal/channel bandwidth. */
  captureBandwidthHz: z.number().safe().int().min(MIN_COMPLEX_IQ_BANDWIDTH_HZ).max(MAX_COMPLEX_IQ_BANDWIDTH_HZ),
  signalBandwidthHz: z.number().safe().int().positive(),
  sampleFormat: z.literal(COMPLEX_IQ_SAMPLE_FORMAT),
  sampleCount: z.number().int().min(1).max(MAX_COMPLEX_IQ_SAMPLES),
  byteLength: z.number().int().min(COMPLEX_IQ_BYTES_PER_SAMPLE).max(MAX_COMPLEX_IQ_BYTES),
  encoding: z.literal(COMPLEX_IQ_ENCODING),
  layout: z.literal('interleaved-iq'),
  byteOrder: z.literal('little-endian'),
  samplesBase64: canonicalBase64Schema,
  samplesSha256: sha256Schema,
  timingQualification: z.literal('simulation-exact'),
  qualification: z.enum([
    'analytic-complex-baseband',
    'standards-derived-complex-baseband',
    'reference-generated-digital-baseband',
    'independently-verified-digital-baseband',
    'derived-from-independently-verified-digital-baseband',
    'receiver-impaired-complex-baseband',
  ]),
  payloadKind: z.enum([
    'native-canonical',
    'derived-hardware-ready',
    'generated-at-output-rate',
    'receiver-impaired-derived',
  ]),
  representation: z.enum([
    'normalized-complex-envelope',
    'source-preserved-complex-envelope',
    'derived-complex-envelope',
  ]),
  normalization: z.enum(['unit-peak', 'none', 'peak-to-0.98']),
  receiverImpairment: receiverImpairmentPresetSchema,
  channelApplication: z.enum(['not-applied', 'receiver-impairment-preset']),
  canonicalArtifactSha256: sha256Schema.nullable(),
  transformReceipt: iqTransformReceiptSchema,
}).strict().superRefine((measurement, context) => {
  if ((measurement.centerHz === measurement.profileReferenceCenterHz)
    !== (measurement.rfPlacement === 'profile-reference')) {
    context.addIssue({
      code: 'custom',
      path: ['rfPlacement'],
      message: 'RF placement must state whether the output center matches the profile reference',
    });
  }
  if (measurement.rfTuneCenterHz + measurement.outputCarrierOffsetHz !== measurement.centerHz) {
    context.addIssue({
      code: 'custom',
      path: ['rfTuneCenterHz'],
      message: 'RF tune center plus output carrier offset must equal the requested RF signal center',
    });
  }
  if (measurement.rfReferenceCenterHz + measurement.nativeCarrierOffsetHz
    !== measurement.profileReferenceCenterHz) {
    context.addIssue({
      code: 'custom',
      path: ['rfReferenceCenterHz'],
      message: 'Canonical RF reference plus native carrier offset must equal the profile signal center',
    });
  }
  if ((measurement.receiverImpairment === 'clean') !== (measurement.channelApplication === 'not-applied')) {
    context.addIssue({
      code: 'custom',
      path: ['channelApplication'],
      message: 'Clean I/Q must declare not-applied; every non-clean receiver preset must declare receiver-impairment-preset',
    });
  }
  const digitallyBound = measurement.qualification === 'reference-generated-digital-baseband'
    || measurement.qualification === 'independently-verified-digital-baseband';
  if (digitallyBound && (
    measurement.receiverImpairment !== 'clean'
    || measurement.representation !== 'source-preserved-complex-envelope'
    || measurement.normalization !== 'none'
  )) {
    context.addIssue({
      code: 'custom',
      path: ['qualification'],
      message: 'A content-bound digital-baseband qualification requires clean, source-preserved, unnormalized bytes',
    });
  }
  if (measurement.qualification === 'derived-from-independently-verified-digital-baseband' && (
    measurement.receiverImpairment !== 'clean'
    || measurement.payloadKind !== 'derived-hardware-ready'
    || measurement.representation !== 'derived-complex-envelope'
    || measurement.normalization !== 'none'
    || measurement.canonicalArtifactSha256 === null
    || !measurement.transformReceipt.operations.some((operation) =>
      operation.kind === 'resample'
      || operation.kind === 'fractional-delay'
      || operation.kind === 'frequency-translate')
  )) {
    context.addIssue({
      code: 'custom',
      path: ['qualification'],
      message: 'Derived digital qualification requires clean, unscaled resampling lineage to a canonical artifact',
    });
  }
  if (measurement.qualification === 'independently-verified-digital-baseband' && (
    measurement.payloadKind !== 'native-canonical'
    || measurement.sampleRateHz !== measurement.nativeSampleRateHz
    || measurement.transformReceipt.operations.length !== 0
    || measurement.transformReceipt.sourceSamplesSha256 !== measurement.samplesSha256
  )) {
    context.addIssue({
      code: 'custom',
      path: ['qualification'],
      message: 'Independent digital qualification applies only to exact native bytes without transforms',
    });
  }
  if (measurement.transformReceipt.sourceArtifactSha256
    !== measurement.canonicalArtifactSha256) {
    context.addIssue({
      code: 'custom',
      path: ['transformReceipt', 'sourceArtifactSha256'],
      message: 'Receipt source artifact hash must equal the measurement canonical artifact hash',
    });
  }
  if (measurement.transformReceipt.sourceCarrierOffsetHz !== measurement.nativeCarrierOffsetHz
    || measurement.transformReceipt.outputCarrierOffsetHz !== measurement.outputCarrierOffsetHz) {
    context.addIssue({
      code: 'custom',
      path: ['transformReceipt'],
      message: 'Receipt carrier offsets must match the measurement carrier offsets',
    });
  }
  const impairmentOperations = measurement.transformReceipt.operations
    .filter((operation) => operation.kind === 'receiver-impairment');
  const expectedImpairmentOperationCount =
    measurement.receiverImpairment === 'clean' ? 0 : 1;
  if (impairmentOperations.length !== expectedImpairmentOperationCount) {
    context.addIssue({
      code: 'custom',
      path: ['transformReceipt', 'operations'],
      message: 'Exactly one receiver-impairment operation is required if and only if the result is impaired',
    });
  }
  const impairmentOperation = impairmentOperations[0];
  if (impairmentOperation !== undefined
    && impairmentOperation.preset !== measurement.receiverImpairment) {
    context.addIssue({
      code: 'custom',
      path: ['transformReceipt', 'operations'],
      message: 'Receiver-impairment operation preset must match the measurement',
    });
  }
  if (measurement.payloadKind === 'native-canonical' && (
    measurement.transformReceipt.operations.length !== 0
    || measurement.transformReceipt.sourceSamplesSha256 !== measurement.samplesSha256
    || measurement.transformReceipt.outputSamplesSha256 !== measurement.samplesSha256
    || measurement.nativeCarrierOffsetHz !== measurement.outputCarrierOffsetHz
  )) {
    context.addIssue({
      code: 'custom',
      path: ['payloadKind'],
      message: 'Native-canonical payloads require identical source/output bytes, offsets, and no operations',
    });
  }
  if (measurement.payloadKind === 'derived-hardware-ready' && (
    measurement.receiverImpairment !== 'clean'
    || measurement.transformReceipt.operations.length === 0
    || !measurement.transformReceipt.operations.some((operation) =>
      operation.kind === 'resample'
      || operation.kind === 'fractional-delay'
      || operation.kind === 'frequency-translate')
  )) {
    context.addIssue({
      code: 'custom',
      path: ['payloadKind'],
      message: 'Clean derived hardware-ready payloads require at least one declared transport transform',
    });
  }
  if (measurement.payloadKind === 'generated-at-output-rate' && (
    measurement.canonicalArtifactSha256 !== null
    || measurement.nativeSampleRateHz !== measurement.sampleRateHz
    || measurement.transformReceipt.operations.some((operation) =>
      operation.kind !== 'fractional-delay')
  )) {
    context.addIssue({
      code: 'custom',
      path: ['payloadKind'],
      message: 'Generated-at-output-rate payloads have no canonical artifact and permit only an explicit same-rate fractional delay',
    });
  }
  const operationKinds = measurement.transformReceipt.operations
    .map((operation) => operation.kind);
  const translationIndex = operationKinds.indexOf('frequency-translate');
  const resampleIndex = operationKinds.findIndex((kind) =>
    kind === 'resample' || kind === 'fractional-delay');
  if (translationIndex >= 0 && resampleIndex >= 0 && translationIndex > resampleIndex) {
    context.addIssue({
      code: 'custom',
      path: ['transformReceipt', 'operations'],
      message: 'Frequency translation must precede resampling',
    });
  }
  const impairmentIndex = operationKinds.indexOf('receiver-impairment');
  if (impairmentIndex >= 0 && impairmentIndex !== operationKinds.length - 1) {
    context.addIssue({
      code: 'custom',
      path: ['transformReceipt', 'operations'],
      message: 'Receiver impairment must be the final transform operation',
    });
  }
  if ((measurement.qualification === 'receiver-impaired-complex-baseband')
    !== (measurement.receiverImpairment !== 'clean')) {
    context.addIssue({
      code: 'custom',
      path: ['qualification'],
      message: 'Every receiver-impaired result must be explicitly downgraded, and a clean result cannot use the impaired qualification',
    });
  }
  if ((measurement.payloadKind === 'receiver-impaired-derived')
    !== (measurement.receiverImpairment !== 'clean')) {
    context.addIssue({
      code: 'custom',
      path: ['payloadKind'],
      message: 'Receiver-impaired bytes must never be labeled native-canonical or clean-derived',
    });
  }
  if (measurement.captureBandwidthHz > measurement.sampleRateHz) {
    context.addIssue({ code: 'custom', path: ['captureBandwidthHz'], message: 'Complex-I/Q capture bandwidth may not exceed its output sample rate' });
  }
  const minimumSymmetricCaptureBandwidthHz =
    2 * Math.abs(measurement.outputCarrierOffsetHz)
    + measurement.signalBandwidthHz;
  if (measurement.captureBandwidthHz < minimumSymmetricCaptureBandwidthHz) {
    context.addIssue({
      code: 'custom',
      path: ['captureBandwidthHz'],
      message: 'Complex-I/Q capture bandwidth must symmetrically contain the complete signal support about rfTuneCenterHz',
    });
  }
  const expectedByteLength = measurement.sampleCount * COMPLEX_IQ_BYTES_PER_SAMPLE;
  if (measurement.byteLength !== expectedByteLength) {
    context.addIssue({ code: 'custom', path: ['byteLength'], message: 'cf32le requires exactly eight bytes per complex sample' });
  }
  const bytes = base64ToBytes(measurement.samplesBase64);
  if (bytesToBase64(bytes) !== measurement.samplesBase64) {
    context.addIssue({ code: 'custom', path: ['samplesBase64'], message: 'I/Q payload must use canonical RFC 4648 base64' });
  }
  if (bytes.byteLength !== measurement.byteLength) {
    context.addIssue({ code: 'custom', path: ['samplesBase64'], message: 'Decoded I/Q payload length must match byteLength' });
  }
  if (sha256HexOfBytes(bytes) !== measurement.samplesSha256) {
    context.addIssue({ code: 'custom', path: ['samplesSha256'], message: 'I/Q payload hash must match the exact decoded bytes' });
  }
  if (measurement.transformReceipt.outputSamplesSha256 !== measurement.samplesSha256
    || measurement.transformReceipt.outputSampleRateHz !== measurement.sampleRateHz
    || measurement.transformReceipt.outputSampleCount !== measurement.sampleCount
    || measurement.transformReceipt.sourceSampleRateHz !== measurement.nativeSampleRateHz) {
    context.addIssue({
      code: 'custom',
      path: ['transformReceipt'],
      message: 'Transform receipt output and native geometry must match the measurement',
    });
  }
});
export type ComplexIqMeasurement = z.infer<typeof complexIqMeasurementSchema>;

export const measurementResultSchema = z.discriminatedUnion('kind', [
  sweptSpectrumMeasurementSchema,
  detectedPowerMeasurementSchema,
  complexIqMeasurementSchema,
]);
export type MeasurementResult = z.infer<typeof measurementResultSchema>;

export const selectProfileInputSchema = z.object({
  profile: synthesizedSignalProfileSchema,
}).strict();
export type SelectProfileInput = z.infer<typeof selectProfileInputSchema>;

export const configureChannelInputSchema = z.object({
  channel: replayChannelConfigurationSchema,
}).strict();
export type ConfigureChannelInput = z.infer<typeof configureChannelInputSchema>;

export const customWaveformStandardSchema = z.enum(['lte', 'nr', 'wifi']);
/**
 * Operator selections for a custom wideband builder: parameter key -> option
 * string ('auto' or a legal value). Legality is enforced by the constraint
 * resolver in custom-waveform.ts, which re-validates on the service side.
 */
export const customWaveformSelectionsSchema = z.record(
  z.string().min(1).max(48).regex(/^[A-Za-z][A-Za-z0-9]*$/),
  z.string().min(1).max(48),
).refine((selections) => Object.keys(selections).length <= 32, { message: 'Too many custom-waveform selections' });

export const configureCustomWaveformInputSchema = z.object({
  standard: customWaveformStandardSchema,
  selections: customWaveformSelectionsSchema,
}).strict();
export type ConfigureCustomWaveformInput =
  z.infer<typeof configureCustomWaveformInputSchema>;

export const acquireSpectrumInputSchema = z.object({
  startHz: z.number().safe().int().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ),
  stopHz: z.number().safe().int().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ),
  points: z.number().int().min(2).max(MAX_SPECTRUM_POINTS),
}).strict().superRefine((input, context) => {
  if (input.stopHz <= input.startHz) {
    context.addIssue({
      code: 'custom',
      path: ['stopHz'],
      message: 'Stop frequency must exceed start frequency',
    });
  }
});
export type AcquireSpectrumInput = z.infer<typeof acquireSpectrumInputSchema>;

export const acquireDetectedPowerInputSchema = z.object({
  centerFrequencyHz: z.number().safe().int()
    .min(MIN_MEASUREMENT_FREQUENCY_HZ)
    .max(MAX_MEASUREMENT_FREQUENCY_HZ),
  points: z.number().int().min(1).max(MAX_DETECTED_POWER_POINTS),
  samplePeriodSeconds: z.number().finite()
    .min(MIN_SAMPLE_PERIOD_SECONDS)
    .max(MAX_SAMPLE_PERIOD_SECONDS),
}).strict();
export type AcquireDetectedPowerInput =
  z.infer<typeof acquireDetectedPowerInputSchema>;

export const acquireIqInputSchema = z.object({
  centerHz: z.number().safe().int()
    .min(MIN_MEASUREMENT_FREQUENCY_HZ)
    .max(MAX_MEASUREMENT_FREQUENCY_HZ),
  sampleRateHz: z.number().safe().int()
    .min(MIN_COMPLEX_IQ_SAMPLE_RATE_HZ)
    .max(MAX_COMPLEX_IQ_SAMPLE_RATE_HZ),
  captureBandwidthHz: z.number().safe().int()
    .min(MIN_COMPLEX_IQ_BANDWIDTH_HZ)
    .max(MAX_COMPLEX_IQ_BANDWIDTH_HZ),
  sampleCount: z.number().int().min(1).max(MAX_COMPLEX_IQ_SAMPLES),
  sampleFormat: z.literal(COMPLEX_IQ_SAMPLE_FORMAT),
}).strict().superRefine((input, context) => {
  if (input.captureBandwidthHz > input.sampleRateHz) {
    context.addIssue({
      code: 'custom',
      path: ['captureBandwidthHz'],
      message: 'Complex-I/Q capture bandwidth may not exceed its output sample rate',
    });
  }
});
export type AcquireIqInput = z.infer<typeof acquireIqInputSchema>;

function documentedMethodSchema<
  Method extends 'status' | 'selectProfile' | 'configureChannel' | 'configureCustomWaveform' | 'acquireSpectrum' | 'acquireDetectedPower' | 'acquireIq' | 'shutdown',
  Result extends 'status' | 'swept-spectrum' | 'detected-power-timeseries' | 'complex-iq' | 'void',
>(method: Method, stateChange: boolean, result: Result) {
  return z.object({
    method: z.literal(method),
    stateChange: z.literal(stateChange),
    result: z.literal(result),
  }).strict();
}

/** Runtime schema for the byte-addressed public JSON contract shipped beside the bridge. */
export const measurementBridgeContractDocumentSchema = z.object({
  documentType: z.literal('contract-manifest'),
  contractId: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_ID),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  status: z.literal('active'),
  owner: z.literal('Atom-SignalLab'),
  purpose: z.literal('high-level-synthetic-measurement-source-for-atomizer'),
  invocation: z.object({
    mode: z.literal('in-process-typescript'),
    entryPoint: z.literal('src/measurement-service.ts'),
    validation: z.literal('strict-zod-runtime-schemas'),
    serialization: z.literal('none'),
    processTransport: z.literal('none'),
  }).strict(),
  methods: z.tuple([
    documentedMethodSchema('status', false, 'status'),
    documentedMethodSchema('selectProfile', true, 'status'),
    documentedMethodSchema('configureChannel', true, 'status'),
    documentedMethodSchema('configureCustomWaveform', true, 'status'),
    documentedMethodSchema('acquireSpectrum', false, 'swept-spectrum'),
    documentedMethodSchema('acquireDetectedPower', false, 'detected-power-timeseries'),
    documentedMethodSchema('acquireIq', false, 'complex-iq'),
    documentedMethodSchema('shutdown', true, 'void'),
  ]),
  semantics: z.object({
    invocation: z.literal('one-synchronous-schema-validated-service-call-produces-one-return-value-or-throws-without-serialization'),
    ordering: z.literal('the-owning-atomizer-session-serializes-stateful-service-calls'),
    retry: z.literal('none'),
    selectedProfileVisibility: z.literal('status-only-never-copied-into-measurement-results'),
    configurationRevision: z.literal('opaque-and-replaced-after-every-accepted-configuration-change'),
    detectedPowerTuning: z.literal('required-safe-integer-center-hz-returned-exactly-and-receiver-filtered-at-that-tune'),
    complexIqEncoding: z.literal('canonical-base64-of-interleaved-cf32le-with-exact-byte-geometry-and-sha256'),
    complexIqCentering: z.literal('requested-center-hz-is-output-rf-placement-metadata-independent-of-canonical-digital-artifact-identity-and-profile-reference-center-is-retained-separately'),
    complexIqBandwidth: z.literal('capture-bandwidth-hz-is-an-output-setting-distinct-from-the-profile-signal-bandwidth-and-never-implies-an-undeclared-digital-filter'),
    complexIqResampling: z.literal('native-byte-identity-is-preserved-when-rate-phase-and-tune-admit-it-blackman-windowed-sinc-v1-preserves-source-nyquist-at-equal-or-upsampled-rates-and-uses-95-percent-output-nyquist-only-when-downsampling-with-an-explicit-transform-receipt'),
    complexIqFlexibleGeneration: z.literal('rate-flexible-generators-use-profile-signal-bandwidth-as-an-intrinsic-source-parameter-and-preserve-exact-elapsed-time-across-rate-changes-with-an-explicit-same-rate-fractional-delay'),
    complexIqFrequencyPlacement: z.literal('native-carrier-offset-profile-signal-center-canonical-rf-reference-output-carrier-offset-and-output-rf-tune-center-are-distinct-and-every-frequency-translation-precedes-resampling-in-the-receipt'),
    complexIqChannel: z.literal('receiver-impairment-is-required-in-every-v2-channel-configuration-with-clean-explicit-and-every-non-clean-seeded-preset-an-explicit-post-source-transform-declared-on-the-result'),
    complexIqAvailability: z.literal('all-42-closed-catalog-profiles-with-native-geometry-for-31-content-bound-artifacts-and-rate-flexible-generation-for-11-analytic-or-builder-profiles'),
    complexIqReplay: z.literal('every-profile-declares-continuous-cyclic-or-one-shot-policy-cyclic-artifacts-declare-and-modularly-wrap-their-native-period-and-one-shot-limits-are-native-domain-samples-with-zero-extension-only-for-fir-support'),
    scalarMeasurementQualification: z.literal('synthetic-visual-projection-not-a-conformance-vector'),
    complexIqMeasurementQualification: z.literal('independent-digital-qualification-applies-only-to-exact-native-bytes-derived-output-retains-lineage-but-never-claims-byte-identity-rf-conformance-or-product-certification'),
  }).strict(),
  identityHashes: z.object({
    contractSha256: z.literal('sha256-of-utf8-json-stringify-of-the-imported-parsed-contract-document'),
    catalogSha256: z.literal('sha256-of-immutable-all-auto-default-catalog-json'),
    generatorContractBindingSha256: z.literal('sha256-of-utf8-domain-atomizer-in-process-generator-null-followed-by-contract-sha256-not-generator-code-identity'),
  }).strict(),
  claims: measurementBridgeClaimsSchema,
  prohibitedIdentityFields: z.tuple([
    z.literal('usbMatch'),
    z.literal('vendorId'),
    z.literal('productId'),
    z.literal('serialPath'),
    z.literal('firmwareVersion'),
    z.literal('firmwareRevision'),
    z.literal('usbIdentityVerified'),
  ]),
}).strict();
export type MeasurementBridgeContractDocument = z.infer<typeof measurementBridgeContractDocumentSchema>;

function greatestCommonDivisorForSchema(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function nearlyEqualForSchema(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-12);
}
