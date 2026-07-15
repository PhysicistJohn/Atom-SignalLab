import { z } from 'zod';
import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MEASUREMENT_FREQUENCY_STEP_HZ,
  MIN_MEASUREMENT_FREQUENCY_HZ,
  replayChannelConfigurationSchema,
  synthesizedSignalProfileSchema,
  waveformDescriptorSchema,
} from './contracts.js';

export const ATOMIZER_MEASUREMENT_CONTRACT_ID = 'tinysa-signal-lab-atomizer-measurement' as const;
export const ATOMIZER_MEASUREMENT_CONTRACT_VERSION = 1 as const;
export const ATOMIZER_MEASUREMENT_PROTOCOL = 'signal-lab-measurement-bridge' as const;
export const MEASUREMENT_GENERATOR_ARTIFACTS = Object.freeze([
  'atomizer-bridge.js',
  'canonical-timing.js',
  'catalog.js',
  'contracts.js',
  'measurement-bridge.js',
  'measurement-contract.js',
  'measurement-service.js',
  'source-provenance.js',
  'waveforms.js',
] as const);

export { MAX_MEASUREMENT_FREQUENCY_HZ } from './contracts.js';
export const MAX_SPECTRUM_POINTS = 4_096 as const;
export const MAX_DETECTED_POWER_POINTS = 4_096 as const;
export const MIN_SAMPLE_PERIOD_SECONDS = 0.000_001 as const;
export const MAX_SAMPLE_PERIOD_SECONDS = 10 as const;

export const MEASUREMENT_BRIDGE_LIMITS = Object.freeze({
  maxRequestLineBytes: 65_536,
  maxResponseLineBytes: 1_048_576,
  maxQueuedRequests: 32,
  maxSessionRequests: 10_000,
  reservedShutdownRequests: 1,
  requestTimeoutMs: 5_000,
} as const);

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

export const measurementSourceIdentitySchema = z.object({
  driverId: z.literal('signal-lab'),
  sourceKind: z.literal('signal-lab-simulation'),
  execution: z.literal('signal-lab-simulation'),
  transport: z.literal(ATOMIZER_MEASUREMENT_PROTOCOL),
  contractId: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_ID),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  contractSha256: sha256Schema,
  catalogSha256: sha256Schema,
  generatorSha256: sha256Schema,
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

export const measurementCapabilitySchema = z.discriminatedUnion('kind', [
  sweptSpectrumCapabilitySchema,
  detectedPowerCapabilitySchema,
]);
export type MeasurementCapability = z.infer<typeof measurementCapabilitySchema>;

export const MEASUREMENT_CAPABILITIES: readonly MeasurementCapability[] = Object.freeze([
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
]);

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
  if (status.profiles.some((profile, index) => status.catalog[index]?.id !== profile)) {
    context.addIssue({ code: 'custom', path: ['catalog'], message: 'Catalog ordering must exactly match the closed profile list' });
  }
  if (status.waveform.id !== status.profile) {
    context.addIssue({ code: 'custom', path: ['waveform'], message: 'The status waveform must describe the selected profile' });
  }
});
export type MeasurementSourceStatus = z.infer<typeof measurementSourceStatusSchema>;

const measurementBaseSchema = z.object({
  measurementId: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  configurationRevision: opaqueIdSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  capturedAt: isoInstantSchema,
  elapsedSeconds: z.number().finite().nonnegative().max(60),
  complete: z.literal(true),
  qualification: z.literal('synthetic-visual-projection'),
  provenance: measurementSourceIdentitySchema,
});

export const sweptSpectrumMeasurementSchema = measurementBaseSchema.extend({
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

export const detectedPowerMeasurementSchema = measurementBaseSchema.extend({
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

export const measurementResultSchema = z.discriminatedUnion('kind', [
  sweptSpectrumMeasurementSchema,
  detectedPowerMeasurementSchema,
]);
export type MeasurementResult = z.infer<typeof measurementResultSchema>;

export const statusRequestSchema = z.object({
  type: z.literal('request'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  method: z.literal('status'),
  params: z.object({}).strict(),
}).strict();

export const selectProfileRequestSchema = z.object({
  type: z.literal('request'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  method: z.literal('select_profile'),
  params: z.object({ profile: synthesizedSignalProfileSchema }).strict(),
}).strict();

export const configureChannelRequestSchema = z.object({
  type: z.literal('request'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  method: z.literal('configure_channel'),
  params: z.object({ channel: replayChannelConfigurationSchema }).strict(),
}).strict();

export const acquireSpectrumRequestSchema = z.object({
  type: z.literal('request'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  method: z.literal('acquire_spectrum'),
  params: z.object({
    startHz: z.number().safe().int().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ),
    stopHz: z.number().safe().int().positive().max(MAX_MEASUREMENT_FREQUENCY_HZ),
    points: z.number().int().min(2).max(MAX_SPECTRUM_POINTS),
  }).strict().superRefine((params, context) => {
    if (params.stopHz <= params.startHz) {
      context.addIssue({ code: 'custom', path: ['stopHz'], message: 'Stop frequency must exceed start frequency' });
    }
  }),
}).strict();

export const acquireDetectedPowerRequestSchema = z.object({
  type: z.literal('request'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  method: z.literal('acquire_detected_power'),
  params: z.object({
    centerFrequencyHz: z.number().safe().int().min(MIN_MEASUREMENT_FREQUENCY_HZ).max(MAX_MEASUREMENT_FREQUENCY_HZ),
    points: z.number().int().min(1).max(MAX_DETECTED_POWER_POINTS),
    samplePeriodSeconds: z.number().finite().min(MIN_SAMPLE_PERIOD_SECONDS).max(MAX_SAMPLE_PERIOD_SECONDS),
  }).strict(),
}).strict();

export const shutdownRequestSchema = z.object({
  type: z.literal('request'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  method: z.literal('shutdown'),
  params: z.object({}).strict(),
}).strict();

export const measurementBridgeRequestSchema = z.discriminatedUnion('method', [
  statusRequestSchema,
  selectProfileRequestSchema,
  configureChannelRequestSchema,
  acquireSpectrumRequestSchema,
  acquireDetectedPowerRequestSchema,
  shutdownRequestSchema,
]);
export type MeasurementBridgeRequest = z.infer<typeof measurementBridgeRequestSchema>;

export const measurementBridgeLimitsSchema = z.object({
  maxRequestLineBytes: z.literal(MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes),
  maxResponseLineBytes: z.literal(MEASUREMENT_BRIDGE_LIMITS.maxResponseLineBytes),
  maxQueuedRequests: z.literal(MEASUREMENT_BRIDGE_LIMITS.maxQueuedRequests),
  maxSessionRequests: z.literal(MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests),
  reservedShutdownRequests: z.literal(MEASUREMENT_BRIDGE_LIMITS.reservedShutdownRequests),
  requestTimeoutMs: z.literal(MEASUREMENT_BRIDGE_LIMITS.requestTimeoutMs),
}).strict();

export const measurementBridgeReadySchema = z.object({
  type: z.literal('ready'),
  protocol: z.literal(ATOMIZER_MEASUREMENT_PROTOCOL),
  contractId: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_ID),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  service: z.literal('tinysa-signal-lab'),
  sessionId: opaqueIdSchema,
  identity: measurementSourceIdentitySchema,
  capabilities: z.array(measurementCapabilitySchema).length(MEASUREMENT_CAPABILITIES.length),
  limits: measurementBridgeLimitsSchema,
}).strict();
export type MeasurementBridgeReady = z.infer<typeof measurementBridgeReadySchema>;

export const shutdownResultSchema = z.object({ kind: z.literal('shutdown'), closed: z.literal(true) }).strict();
export const measurementBridgeSuccessResultSchema = z.union([
  measurementSourceStatusSchema,
  measurementResultSchema,
  shutdownResultSchema,
]);

export const measurementBridgeErrorCodeSchema = z.enum([
  'INVALID_ENCODING',
  'INVALID_JSON',
  'INVALID_REQUEST',
  'LINE_TOO_LARGE',
  'LINE_TERMINATOR_REQUIRED',
  'DUPLICATE_REQUEST_ID',
  'SESSION_REQUEST_LIMIT',
  'OVERLOADED',
  'REQUEST_TIMEOUT',
  'SERVICE_CLOSED',
  'SHUTTING_DOWN',
  'RESPONSE_TOO_LARGE',
  'INTERNAL_ERROR',
]);
export type MeasurementBridgeErrorCode = z.infer<typeof measurementBridgeErrorCodeSchema>;

export const measurementBridgeSuccessResponseSchema = z.object({
  type: z.literal('response'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64),
  ok: z.literal(true),
  result: measurementBridgeSuccessResultSchema,
}).strict();

export const measurementBridgeErrorResponseSchema = z.object({
  type: z.literal('response'),
  contractVersion: z.literal(ATOMIZER_MEASUREMENT_CONTRACT_VERSION),
  requestId: z.string().min(1).max(64).nullable(),
  ok: z.literal(false),
  error: z.object({
    code: measurementBridgeErrorCodeSchema,
    message: z.string().min(1).max(256),
  }).strict(),
}).strict();

export const measurementBridgeResponseSchema = z.discriminatedUnion('ok', [
  measurementBridgeSuccessResponseSchema,
  measurementBridgeErrorResponseSchema,
]);
export type MeasurementBridgeResponse = z.infer<typeof measurementBridgeResponseSchema>;

export const measurementBridgeMessageSchema = z.union([
  measurementBridgeReadySchema,
  measurementBridgeResponseSchema,
]);

function documentedCommandSchema<
  Method extends 'status' | 'select_profile' | 'configure_channel' | 'acquire_spectrum' | 'acquire_detected_power' | 'shutdown',
  Result extends 'status' | 'swept-spectrum' | 'detected-power-timeseries' | 'shutdown',
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
  owner: z.literal('TinySA_SignalLab'),
  purpose: z.literal('high-level-synthetic-measurement-source-for-atomizer'),
  framing: z.object({
    encoding: z.literal('utf-8'),
    format: z.literal('ndjson'),
    lineTerminator: z.literal('lf'),
    firstMessage: z.literal('ready'),
    stdout: z.literal('protocol-messages-only'),
    stderr: z.literal('diagnostics-only'),
  }).strict(),
  commands: z.tuple([
    documentedCommandSchema('status', false, 'status'),
    documentedCommandSchema('select_profile', true, 'status'),
    documentedCommandSchema('configure_channel', true, 'status'),
    documentedCommandSchema('acquire_spectrum', false, 'swept-spectrum'),
    documentedCommandSchema('acquire_detected_power', false, 'detected-power-timeseries'),
    documentedCommandSchema('shutdown', true, 'shutdown'),
  ]),
  limits: measurementBridgeLimitsSchema,
  semantics: z.object({
    replies: z.literal('one-response-per-admitted-input-line-and-no-request-id-executes-twice'),
    inputBudget: z.literal('every-lf-line-and-final-fragment-including-malformed-input-counts-toward-max-session-requests-with-one-additional-valid-shutdown-line-reserved'),
    backpressure: z.literal('input-pauses-at-thirty-three-total-pending-reply-obligations'),
    ordering: z.literal('accepted-normal-requests-execute-serially-and-reserved-shutdown-runs-after-active-work-before-queued-normal-work'),
    retry: z.literal('none'),
    selectedProfileVisibility: z.literal('status-only-never-copied-into-measurement-results'),
    configurationRevision: z.literal('opaque-and-replaced-after-every-accepted-configuration-change'),
    detectedPowerTuning: z.literal('required-safe-integer-center-hz-returned-exactly-and-receiver-filtered-at-that-tune'),
    measurementQualification: z.literal('synthetic-visual-projection-not-a-conformance-vector'),
  }).strict(),
  identityHashes: z.object({
    contractSha256: z.literal('sha256-of-the-exact-loaded-contract-json-bytes'),
    catalogSha256: z.literal('sha256-of-the-runtime-canonical-catalog-json'),
    generatorSha256: z.literal('sha256-length-framed-aggregate-of-every-shipped-runtime-javascript-artifact'),
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

export function successResponse(requestId: string, result: z.infer<typeof measurementBridgeSuccessResultSchema>): MeasurementBridgeResponse {
  return measurementBridgeSuccessResponseSchema.parse({
    type: 'response',
    contractVersion: ATOMIZER_MEASUREMENT_CONTRACT_VERSION,
    requestId,
    ok: true,
    result,
  });
}

export function errorResponse(requestId: string | null, code: MeasurementBridgeErrorCode, message: string): MeasurementBridgeResponse {
  return measurementBridgeErrorResponseSchema.parse({
    type: 'response',
    contractVersion: ATOMIZER_MEASUREMENT_CONTRACT_VERSION,
    requestId,
    ok: false,
    error: { code, message },
  });
}
