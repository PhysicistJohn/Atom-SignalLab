import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  replayChannelConfigurationSchema,
  synthesizedSignalProfileSchema,
  type ReplayChannelConfiguration,
  type SynthesizedSignalProfile,
} from './contracts.js';
import {
  ATOMIZER_MEASUREMENT_CONTRACT_ID,
  ATOMIZER_MEASUREMENT_CONTRACT_VERSION,
  ATOMIZER_MEASUREMENT_PROTOCOL,
  MEASUREMENT_BRIDGE_CLAIMS,
  MEASUREMENT_CAPABILITIES,
  acquireDetectedPowerRequestSchema,
  acquireSpectrumRequestSchema,
  configureChannelRequestSchema,
  detectedPowerMeasurementSchema,
  measurementSourceIdentitySchema,
  measurementSourceStatusSchema,
  selectProfileRequestSchema,
  sweptSpectrumMeasurementSchema,
  type DetectedPowerMeasurement,
  type MeasurementBridgeRequest,
  type MeasurementResult,
  type MeasurementSourceIdentity,
  type MeasurementSourceStatus,
  type SweptSpectrumMeasurement,
} from './measurement-contract.js';
import {
  DEFAULT_REPLAY_CHANNEL,
  synthesizeSpectrum,
  synthesizeZeroSpan,
  waveformCatalog,
  waveformDescriptor,
} from './waveforms.js';

export interface MeasurementBuildIdentity {
  contractSha256: string;
  generatorSha256: string;
}

export interface MeasurementServiceDependencies {
  uuid?: () => string;
  now?: () => Date;
  monotonicMilliseconds?: () => number;
  continuation?: MeasurementServiceContinuation;
}

export const measurementServiceContinuationSchema = z.object({
  sessionId: z.string().uuid(),
  configurationRevision: z.string().uuid(),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    .refine((value) => Number.isFinite(Date.parse(value))),
  profile: synthesizedSignalProfileSchema,
  channel: replayChannelConfigurationSchema,
  sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();
export type MeasurementServiceContinuation = z.infer<typeof measurementServiceContinuationSchema>;

export class MeasurementServiceError extends Error {
  readonly code: 'SERVICE_CLOSED';

  constructor(code: 'SERVICE_CLOSED', message: string) {
    super(message);
    this.name = 'MeasurementServiceError';
    this.code = code;
  }
}

/**
 * Stateful high-level synthetic measurement source.
 *
 * Selected profile and channel state are intentionally present only in
 * status. Acquisitions carry observables, opaque state correlation, and
 * source provenance; they never copy the selected profile or waveform label.
 */
export class AtomizerMeasurementService {
  readonly sessionId: string;
  readonly identity: MeasurementSourceIdentity;

  #configurationRevision: string;
  #updatedAt: string;
  #profile: SynthesizedSignalProfile = 'cw';
  #channel: ReplayChannelConfiguration = structuredClone(DEFAULT_REPLAY_CHANNEL);
  #sequence = 0;
  #closed = false;
  readonly #uuid: () => string;
  readonly #now: () => Date;
  readonly #monotonicMilliseconds: () => number;

  constructor(buildIdentity: MeasurementBuildIdentity, dependencies: MeasurementServiceDependencies = {}) {
    this.#uuid = dependencies.uuid ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
    this.#monotonicMilliseconds = dependencies.monotonicMilliseconds ?? (() => performance.now());
    const continuation = dependencies.continuation
      ? measurementServiceContinuationSchema.parse(dependencies.continuation)
      : undefined;
    this.sessionId = continuation?.sessionId ?? this.#nextOpaqueId('session');
    this.#configurationRevision = continuation?.configurationRevision ?? this.#nextOpaqueId('configuration revision');
    this.#updatedAt = continuation?.updatedAt ?? this.#nextInstant();
    if (continuation) {
      this.#profile = continuation.profile;
      this.#channel = structuredClone(continuation.channel);
      this.#sequence = continuation.sequence;
    }
    this.identity = measurementSourceIdentitySchema.parse({
      driverId: 'signal-lab',
      sourceKind: 'signal-lab-simulation',
      execution: 'signal-lab-simulation',
      transport: ATOMIZER_MEASUREMENT_PROTOCOL,
      contractId: ATOMIZER_MEASUREMENT_CONTRACT_ID,
      contractVersion: ATOMIZER_MEASUREMENT_CONTRACT_VERSION,
      contractSha256: buildIdentity.contractSha256,
      catalogSha256: sha256Hex(JSON.stringify(waveformCatalog)),
      generatorSha256: buildIdentity.generatorSha256,
      claims: MEASUREMENT_BRIDGE_CLAIMS,
    });
  }

  status(): MeasurementSourceStatus {
    this.#requireOpen();
    return measurementSourceStatusSchema.parse({
      kind: 'status',
      sessionId: this.sessionId,
      configurationRevision: this.#configurationRevision,
      updatedAt: this.#updatedAt,
      available: true,
      active: true,
      profile: this.#profile,
      profiles: synthesizedSignalProfileSchema.options,
      waveform: waveformDescriptor(this.#profile),
      catalog: waveformCatalog,
      channel: this.#channel,
      capabilities: MEASUREMENT_CAPABILITIES,
      identity: this.identity,
    });
  }

  selectProfile(input: unknown): MeasurementSourceStatus {
    this.#requireOpen();
    const request = selectProfileRequestSchema.shape.params.parse(input);
    this.#profile = request.profile;
    this.#replaceConfigurationRevision();
    return this.status();
  }

  configureChannel(input: unknown): MeasurementSourceStatus {
    this.#requireOpen();
    const request = configureChannelRequestSchema.shape.params.parse(input);
    this.#channel = structuredClone(request.channel);
    this.#replaceConfigurationRevision();
    return this.status();
  }

  acquireSpectrum(input: unknown): SweptSpectrumMeasurement {
    this.#requireOpen();
    const request = acquireSpectrumRequestSchema.shape.params.parse(input);
    const started = this.#monotonicMilliseconds();
    const sequence = this.#nextSequence();
    const powerDbm = synthesizeSpectrum({
      profile: this.#profile,
      startHz: request.startHz,
      stopHz: request.stopHz,
      points: request.points,
      sweepIndex: sequence - 1,
      channel: this.#channel,
    });
    const frequencyHz = Array.from({ length: request.points }, (_unused, index) =>
      request.startHz + (request.stopHz - request.startHz) * index / (request.points - 1));
    return sweptSpectrumMeasurementSchema.parse({
      ...this.#measurementBase(sequence, started),
      kind: 'swept-spectrum',
      startHz: request.startHz,
      stopHz: request.stopHz,
      points: request.points,
      frequencyHz,
      powerDbm,
    });
  }

  acquireDetectedPower(input: unknown): DetectedPowerMeasurement {
    this.#requireOpen();
    const request = acquireDetectedPowerRequestSchema.shape.params.parse(input);
    const started = this.#monotonicMilliseconds();
    const sequence = this.#nextSequence();
    const powerDbm = synthesizeZeroSpan({
      profile: this.#profile,
      points: request.points,
      sweepIndex: sequence - 1,
      channel: this.#channel,
    });
    return detectedPowerMeasurementSchema.parse({
      ...this.#measurementBase(sequence, started),
      kind: 'detected-power-timeseries',
      centerFrequencyHz: waveformDescriptor(this.#profile).centerHz,
      points: request.points,
      samplePeriodSeconds: request.samplePeriodSeconds,
      powerDbm,
    });
  }

  dispatch(request: MeasurementBridgeRequest): MeasurementSourceStatus | MeasurementResult | { kind: 'shutdown'; closed: true } {
    this.#requireOpen();
    switch (request.method) {
      case 'status': return this.status();
      case 'select_profile': return this.selectProfile(request.params);
      case 'configure_channel': return this.configureChannel(request.params);
      case 'acquire_spectrum': return this.acquireSpectrum(request.params);
      case 'acquire_detected_power': return this.acquireDetectedPower(request.params);
      case 'shutdown':
        this.#closed = true;
        return { kind: 'shutdown', closed: true };
    }
  }

  #measurementBase(sequence: number, started: number) {
    const elapsedSeconds = Math.max(0, (this.#monotonicMilliseconds() - started) / 1_000);
    return {
      measurementId: this.#nextOpaqueId('measurement'),
      sessionId: this.sessionId,
      configurationRevision: this.#configurationRevision,
      sequence,
      capturedAt: this.#nextInstant(),
      elapsedSeconds,
      complete: true as const,
      qualification: 'synthetic-visual-projection' as const,
      provenance: this.identity,
    };
  }

  #replaceConfigurationRevision(): void {
    this.#configurationRevision = this.#nextOpaqueId('configuration revision');
    this.#updatedAt = this.#nextInstant();
  }

  #nextSequence(): number {
    if (this.#sequence >= Number.MAX_SAFE_INTEGER) throw new Error('Measurement sequence is exhausted');
    this.#sequence += 1;
    return this.#sequence;
  }

  #nextOpaqueId(label: string): string {
    const value = this.#uuid();
    if (!zUuid(value)) throw new Error(`Generated ${label} is not an opaque UUID`);
    return value;
  }

  #nextInstant(): string {
    const value = this.#now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error('Measurement clock returned an invalid instant');
    return value.toISOString();
  }

  #requireOpen(): void {
    if (this.#closed) throw new MeasurementServiceError('SERVICE_CLOSED', 'The measurement source session is closed');
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
