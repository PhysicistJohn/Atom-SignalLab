import { z } from 'zod';
import { bytesToBase64, sha256HexOfBytes } from './platform-bytes.js';
import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MIN_MEASUREMENT_FREQUENCY_HZ,
  replayChannelConfigurationSchema,
  synthesizedSignalProfileSchema,
  type ReplayChannelConfiguration,
  type SynthesizedSignalProfile,
} from './contracts.js';
import {
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
  complexIqGeneratorBasis,
  isAnalyticComplexIqProfile,
  synthesizeAnalyticComplexIq,
} from './complex-iq.js';
import {
  fixedDigitalProfileBinding,
  isFixedDigitalProfile,
  type FixedDigitalProfileBinding,
} from './fixed-digital-profile-binding.js';
import {
  applyReceiverImpairmentsToCf32le,
  receiverImpairmentsForPreset,
} from './impairments.js';
import {
  IQ_RESAMPLER_ALGORITHM,
  IQ_RESAMPLER_ZERO_CROSSINGS,
  iqResamplerSupport,
  resampleCf32leWindowedSinc,
  translateCf32leCarrier,
} from './iq-resampler.js';
import {
  buildCustomWaveformDescriptor,
  customWaveformStandard,
  isCustomWaveformProfile,
  type CustomWaveformSelections,
  type CustomWaveformStandard,
} from './custom-waveform.js';
import {
  ATOMIZER_MEASUREMENT_CONTRACT_ID,
  ATOMIZER_MEASUREMENT_CONTRACT_VERSION,
  ATOMIZER_MEASUREMENT_PROTOCOL,
  MEASUREMENT_BRIDGE_CLAIMS,
  MEASUREMENT_CAPABILITIES,
  acquireDetectedPowerInputSchema,
  acquireIqInputSchema,
  measurementCapabilitiesForCatalog,
  acquireSpectrumInputSchema,
  complexIqMeasurementSchema,
  configureChannelInputSchema,
  configureCustomWaveformInputSchema,
  detectedPowerMeasurementSchema,
  measurementSourceIdentitySchema,
  measurementSourceStatusSchema,
  selectProfileInputSchema,
  sweptSpectrumMeasurementSchema,
  type DetectedPowerMeasurement,
  type ComplexIqMeasurement,
  type MeasurementSourceIdentity,
  type MeasurementSourceStatus,
  type SweptSpectrumMeasurement,
} from './measurement-contract.js';
import type { WaveformDescriptor } from './contracts.js';
import {
  DEFAULT_REPLAY_CHANNEL,
  synthesizeSpectrum,
  synthesizeZeroSpan,
  waveformCatalog,
  waveformDescriptor,
} from './waveforms.js';

export interface MeasurementBuildIdentity {
  contractSha256: string;
  generatorContractBindingSha256: string;
}

export interface MeasurementServiceDependencies {
  uuid?: () => string;
  now?: () => Date;
  monotonicMilliseconds?: () => number;
  continuation?: MeasurementServiceContinuationInput;
}

const measurementServiceContinuationBaseSchema = z.object({
  sessionId: z.string().uuid(),
  configurationRevision: z.string().uuid(),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    .refine((value) => Number.isFinite(Date.parse(value))),
  profile: synthesizedSignalProfileSchema,
  channel: replayChannelConfigurationSchema,
  sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

const measurementServiceContinuationV2Schema = measurementServiceContinuationBaseSchema.extend({
  continuationVersion: z.literal(2),
  /** Exact elapsed I/Q time in seconds as a reduced non-negative rational. */
  iqTimeNumerator: z.string().regex(/^(?:0|[1-9][0-9]{0,39})$/),
  iqTimeDenominator: z.string().regex(/^[1-9][0-9]{0,39}$/),
}).strict();

export const measurementServiceContinuationSchema = measurementServiceContinuationV2Schema;
export type MeasurementServiceContinuation = z.output<typeof measurementServiceContinuationSchema>;
export type MeasurementServiceContinuationInput = z.input<typeof measurementServiceContinuationSchema>;

export class MeasurementServiceError extends Error {
  readonly code: 'SERVICE_CLOSED' | 'IQ_PROFILE_UNAVAILABLE';

  constructor(code: 'SERVICE_CLOSED' | 'IQ_PROFILE_UNAVAILABLE', message: string) {
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
  #iqTimeNumerator = 0n;
  #iqTimeDenominator = 1n;
  #closed = false;
  /**
   * Custom builder selections are owned by this service instance. They are
   * deliberately not module-global: two services in one process must be able to
   * hold different LTE/NR/Wi-Fi configurations without contaminating each
   * other, and a service's published geometry must be its own.
   */
  readonly #customSelections =
    new Map<CustomWaveformStandard, CustomWaveformSelections>();
  readonly #uuid: () => string;
  readonly #now: () => Date;
  readonly #monotonicMilliseconds: () => number;

  constructor(buildIdentity: MeasurementBuildIdentity, dependencies: MeasurementServiceDependencies = {}) {
    this.#uuid = dependencies.uuid ?? (() => crypto.randomUUID());
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
      this.#setIqTimeCursor(
        BigInt(continuation.iqTimeNumerator),
        BigInt(continuation.iqTimeDenominator),
      );
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
      generatorContractBindingSha256:
        buildIdentity.generatorContractBindingSha256,
      claims: MEASUREMENT_BRIDGE_CLAIMS,
    });
  }

  status(): MeasurementSourceStatus {
    this.#requireOpen();
    const liveCatalog = this.#liveCatalog();
    return measurementSourceStatusSchema.parse({
      kind: 'status',
      sessionId: this.sessionId,
      configurationRevision: this.#configurationRevision,
      updatedAt: this.#updatedAt,
      available: true,
      active: true,
      profile: this.#profile,
      profiles: synthesizedSignalProfileSchema.options,
      waveform: this.#liveDescriptor(this.#profile),
      catalog: liveCatalog,
      channel: this.#channel,
      capabilities: measurementCapabilitiesForCatalog(liveCatalog),
      identity: this.identity,
    });
  }

  selectProfile(input: unknown): MeasurementSourceStatus {
    this.#requireOpen();
    const request = selectProfileInputSchema.parse(input);
    this.#profile = request.profile;
    this.#replaceConfigurationRevision();
    return this.status();
  }

  configureChannel(input: unknown): MeasurementSourceStatus {
    this.#requireOpen();
    const request = configureChannelInputSchema.parse(input);
    this.#channel = structuredClone(request.channel);
    this.#replaceConfigurationRevision();
    return this.status();
  }

  /**
   * Apply operator selections to a custom wideband builder. The constraint
   * resolver re-validates every pinned value against the standard's lattice
   * (an illegal pin throws and leaves the previous configuration intact), so
   * a custom waveform can never leave what the standard allows.
   */
  configureCustomWaveform(input: unknown): MeasurementSourceStatus {
    this.#requireOpen();
    const request = configureCustomWaveformInputSchema.parse(input);
    // Build and validate the entire candidate before committing anything, so an
    // illegal or unrepresentable selection leaves this service's selections,
    // revision, and cursor exactly as they were.
    const candidate = new Map(this.#customSelections);
    candidate.set(request.standard, Object.freeze({ ...request.selections }));
    const candidateCatalog = this.#liveCatalog(candidate);
    measurementCapabilitiesForCatalog(candidateCatalog);
    this.#customSelections.set(
      request.standard,
      Object.freeze({ ...request.selections }),
    );
    this.#replaceConfigurationRevision();
    return this.status();
  }

  acquireSpectrum(input: unknown): SweptSpectrumMeasurement {
    this.#requireOpen();
    const request = acquireSpectrumInputSchema.parse(input);
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
      qualification: 'synthetic-visual-projection',
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
    const request = acquireDetectedPowerInputSchema.parse(input);
    const started = this.#monotonicMilliseconds();
    const sequence = this.#nextSequence();
    const powerDbm = synthesizeZeroSpan({
      profile: this.#profile,
      tuneFrequencyHz: request.centerFrequencyHz,
      points: request.points,
      sweepIndex: sequence - 1,
      samplePeriodSeconds: request.samplePeriodSeconds,
      channel: this.#channel,
    });
    return detectedPowerMeasurementSchema.parse({
      ...this.#measurementBase(sequence, started),
      qualification: 'synthetic-visual-projection',
      kind: 'detected-power-timeseries',
      centerFrequencyHz: request.centerFrequencyHz,
      points: request.points,
      samplePeriodSeconds: request.samplePeriodSeconds,
      powerDbm,
    });
  }

  acquireIq(input: unknown): ComplexIqMeasurement {
    this.#requireOpen();
    const request = acquireIqInputSchema.parse(input);
    if (!isAnalyticComplexIqProfile(this.#profile)) {
      throw new MeasurementServiceError(
        'IQ_PROFILE_UNAVAILABLE',
        `${this.#profile} has no truthful complex-I/Q generator installed`,
      );
    }
    this.#assertNextIqCursorRepresentable(
      request.sampleCount,
      request.sampleRateHz,
    );
    const fixedBinding = isFixedDigitalProfile(this.#profile)
      ? fixedDigitalProfileBinding(this.#profile)
      : undefined;
    const oneShotReplay = fixedBinding?.replay === 'one-shot';
    if (oneShotReplay && !oneShotOutputFits(
      fixedBinding.captureSamples!,
      fixedBinding.nativeSampleRateHz,
      request.sampleCount,
      request.sampleRateHz,
    )) {
      const maximumOutputSamples = Math.floor(
        fixedBinding.captureSamples! * request.sampleRateHz
        / fixedBinding.nativeSampleRateHz,
      );
      throw new RangeError(
        `${this.#profile} one-shot artifact contains `
        + `${fixedBinding.captureSamples} native samples, permitting at most `
        + `${maximumOutputSamples} output samples at ${request.sampleRateHz} samples/s`,
      );
    }
    const started = this.#monotonicMilliseconds();
    const sequence = this.#nextSequenceCandidate();
    const receiverImpairment = this.#channel.receiverImpairment;
    const generatorBasis = complexIqGeneratorBasis(this.#profile);
    const descriptor = this.#liveDescriptor(this.#profile);
    const profileReferenceCenterHz = fixedBinding?.profileReferenceCenterHz
      ?? descriptor.centerHz;
    const nativeSampleRateHz = fixedBinding?.nativeSampleRateHz
      ?? request.sampleRateHz;
    const signalBandwidthHz = fixedBinding?.signalBandwidthHz
      ?? descriptor.occupiedBandwidthHz;
    const minimumLosslessDerivedRateHz = Math.ceil(signalBandwidthHz / 0.95);
    if (fixedBinding === undefined && request.sampleRateHz < signalBandwidthHz) {
      throw new RangeError(
        `${this.#profile} output sample rate must be at least its declared `
        + `${signalBandwidthHz} Hz signal bandwidth`,
      );
    }
    if (request.captureBandwidthHz < signalBandwidthHz) {
      throw new RangeError(
        `${this.#profile} capture bandwidth must be at least its declared `
        + `${signalBandwidthHz} Hz signal bandwidth`,
      );
    }
    const nativeCursor: ReturnType<typeof rationalNativeSamplePosition> = oneShotReplay
      ? {
          integerPosition: 0,
          coordinateNumerator: '0',
          coordinateDenominator: '1',
        }
      : rationalNativeSamplePosition(
          this.#iqTimeNumerator,
          this.#iqTimeDenominator,
          nativeSampleRateHz,
        );
    const outputStartSourceSampleNumerator =
      BigInt(nativeCursor.coordinateNumerator);
    const outputStartSourceSampleDenominator =
      BigInt(nativeCursor.coordinateDenominator);
    const integerNativePhase = nativeCursor.integerPosition !== undefined;
    const nativeRfTuneCenterHz = request.centerHz
      - (fixedBinding?.nativeCarrierOffsetHz ?? 0);
    const nativeRfTuneCenterAdmitted =
      nativeRfTuneCenterHz >= MIN_MEASUREMENT_FREQUENCY_HZ
      && nativeRfTuneCenterHz <= MAX_MEASUREMENT_FREQUENCY_HZ;
    // Capture bandwidth is a symmetric passband about `rfTuneCenterHz`, so
    // retaining the artifact's native carrier offset costs
    // `2 * |offset| + signalBandwidth` of it. A request too narrow to hold that
    // span cannot be served natively; it takes the derived path below, which
    // translates the carrier to DC and records a frequency-translate receipt.
    // Zero-offset artifacts reduce to the signal-bandwidth floor already
    // enforced above, so this only constrains offset profiles (Bluetooth).
    const nativeMinimumCaptureBandwidthHz = fixedBinding === undefined
      ? signalBandwidthHz
      : 2 * Math.abs(fixedBinding.nativeCarrierOffsetHz) + signalBandwidthHz;
    const nativeOffsetSpanCaptured =
      request.captureBandwidthHz >= nativeMinimumCaptureBandwidthHz;
    const exactNative = fixedBinding !== undefined
      && request.sampleRateHz === nativeSampleRateHz
      && integerNativePhase
      && nativeRfTuneCenterAdmitted
      && nativeOffsetSpanCaptured;
    if (fixedBinding !== undefined
      && !exactNative
      && request.sampleRateHz < nativeSampleRateHz
      && request.sampleRateHz < minimumLosslessDerivedRateHz) {
      throw new RangeError(
        `${this.#profile} derived output sample rate must be at least `
        + `${minimumLosslessDerivedRateHz} samples/s so the resampler's 0.95-Nyquist `
        + `anti-alias passband contains the ${signalBandwidthHz} Hz signal bandwidth`,
      );
    }

    let sourceStartSample: number;
    let sourceSamples: Uint8Array;
    let cleanSamples: Uint8Array;
    const operations: Array<
      | {
          kind: 'resample';
          algorithm: typeof IQ_RESAMPLER_ALGORITHM;
          sourceSampleRateHz: number;
          outputSampleRateHz: number;
          antiAliasCutoffHz: number;
          zeroCrossings: typeof IQ_RESAMPLER_ZERO_CROSSINGS;
        }
      | {
          kind: 'fractional-delay';
          algorithm: typeof IQ_RESAMPLER_ALGORITHM;
          sampleRateHz: number;
          phaseNumerator: string;
          phaseDenominator: string;
          antiAliasCutoffHz: number;
          zeroCrossings: typeof IQ_RESAMPLER_ZERO_CROSSINGS;
        }
      | {
          kind: 'frequency-translate';
          algorithm: 'complex-rotator-v1';
          sourceCarrierOffsetHz: number;
          outputCarrierOffsetHz: number;
        }
      | {
          kind: 'receiver-impairment';
          algorithm: 'signal-lab-receiver-impairment-v1';
          preset: Exclude<typeof receiverImpairment, 'clean'>;
          seed: number;
        }
    > = [];

    if (fixedBinding === undefined) {
      if (integerNativePhase) {
        sourceStartSample = nativeCursor.integerPosition!;
        sourceSamples = synthesizeFlexibleNativeWindow(
          this.#profile,
          request.sampleRateHz,
          signalBandwidthHz,
          sourceStartSample,
          request.sampleCount,
        );
        cleanSamples = sourceSamples;
      } else {
        const support = iqResamplerSupport({
          outputStartSourceSampleNumerator,
          outputStartSourceSampleDenominator,
          sourceSampleRateHz: request.sampleRateHz,
          outputSampleRateHz: request.sampleRateHz,
          outputSampleCount: request.sampleCount,
        });
        sourceStartSample = support.sourceStartSample;
        const sourceSampleCount =
          support.sourceEndSample - support.sourceStartSample + 1;
        sourceSamples = synthesizeFlexibleNativeWindow(
          this.#profile,
          request.sampleRateHz,
          signalBandwidthHz,
          sourceStartSample,
          sourceSampleCount,
        );
        cleanSamples = resampleCf32leWindowedSinc({
          sourceBytes: sourceSamples,
          sourceStartSample,
          outputStartSourceSampleNumerator,
          outputStartSourceSampleDenominator,
          sourceSampleRateHz: request.sampleRateHz,
          outputSampleRateHz: request.sampleRateHz,
          outputSampleCount: request.sampleCount,
        });
        operations.push({
          kind: 'fractional-delay',
          algorithm: IQ_RESAMPLER_ALGORITHM,
          sampleRateHz: request.sampleRateHz,
          phaseNumerator: nativeCursor.phaseNumerator!,
          phaseDenominator: nativeCursor.phaseDenominator!,
          antiAliasCutoffHz: support.antiAliasCutoffHz,
          zeroCrossings: IQ_RESAMPLER_ZERO_CROSSINGS,
        });
      }
    } else if (exactNative) {
      sourceStartSample = nativeCursor.integerPosition!;
      sourceSamples = synthesizeFixedNativeWindow(
        this.#profile,
        fixedBinding,
        sourceStartSample,
        request.sampleCount,
      );
      cleanSamples = sourceSamples;
    } else {
      const needsFir = nativeSampleRateHz !== request.sampleRateHz
        || !integerNativePhase;
      const support = needsFir
        ? iqResamplerSupport({
            outputStartSourceSampleNumerator,
            outputStartSourceSampleDenominator,
            sourceSampleRateHz: nativeSampleRateHz,
            outputSampleRateHz: request.sampleRateHz,
            outputSampleCount: request.sampleCount,
          })
        : undefined;
      sourceStartSample = support?.sourceStartSample
        ?? nativeCursor.integerPosition!;
      const sourceSampleCount = support === undefined
        ? request.sampleCount
        : support.sourceEndSample - support.sourceStartSample + 1;
      sourceSamples = synthesizeFixedNativeWindow(
        this.#profile,
        fixedBinding,
        sourceStartSample,
        sourceSampleCount,
      );
      const resamplerSource = fixedBinding.nativeCarrierOffsetHz === 0
        ? sourceSamples
        : translateCf32leCarrier({
            sourceBytes: sourceSamples,
            sourceStartSample,
            sampleRateHz: nativeSampleRateHz,
            sourceCarrierOffsetHz: fixedBinding.nativeCarrierOffsetHz,
            outputCarrierOffsetHz: 0,
          });
      if (fixedBinding.nativeCarrierOffsetHz !== 0) {
        operations.push({
          kind: 'frequency-translate',
          algorithm: 'complex-rotator-v1',
          sourceCarrierOffsetHz: fixedBinding.nativeCarrierOffsetHz,
          outputCarrierOffsetHz: 0,
        });
      }
      cleanSamples = support === undefined
        ? resamplerSource
        : resampleCf32leWindowedSinc({
            sourceBytes: resamplerSource,
            sourceStartSample,
            outputStartSourceSampleNumerator,
            outputStartSourceSampleDenominator,
            sourceSampleRateHz: nativeSampleRateHz,
            outputSampleRateHz: request.sampleRateHz,
            outputSampleCount: request.sampleCount,
          });
      if (nativeSampleRateHz !== request.sampleRateHz) {
        operations.push({
          kind: 'resample',
          algorithm: IQ_RESAMPLER_ALGORITHM,
          sourceSampleRateHz: nativeSampleRateHz,
          outputSampleRateHz: request.sampleRateHz,
          antiAliasCutoffHz: support!.antiAliasCutoffHz,
          zeroCrossings: IQ_RESAMPLER_ZERO_CROSSINGS,
        });
      } else if (!integerNativePhase) {
        operations.push({
          kind: 'fractional-delay',
          algorithm: IQ_RESAMPLER_ALGORITHM,
          sampleRateHz: nativeSampleRateHz,
          phaseNumerator: nativeCursor.phaseNumerator!,
          phaseDenominator: nativeCursor.phaseDenominator!,
          antiAliasCutoffHz: support!.antiAliasCutoffHz,
          zeroCrossings: IQ_RESAMPLER_ZERO_CROSSINGS,
        });
      }
    }

    const impairmentSeed = (
      this.#channel.seed ^ Math.imul(sequence, 0x9e37_79b1)
    ) >>> 0;
    const samples = receiverImpairment === 'clean'
      ? cleanSamples
      : applyReceiverImpairmentsToCf32le(
          cleanSamples,
          receiverImpairmentsForPreset(receiverImpairment, request.sampleRateHz),
          impairmentSeed,
        );
    if (receiverImpairment !== 'clean') {
      operations.push({
        kind: 'receiver-impairment',
        algorithm: 'signal-lab-receiver-impairment-v1',
        preset: receiverImpairment,
        seed: impairmentSeed,
      });
    }
    const samplesBytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    const sourceBytes = new Uint8Array(
      sourceSamples.buffer,
      sourceSamples.byteOffset,
      sourceSamples.byteLength,
    );
    const sourceSamplesSha256 = sha256HexOfBytes(sourceBytes);
    const samplesSha256 = sha256HexOfBytes(samplesBytes);
    const outputCarrierOffsetHz = fixedBinding === undefined
      ? 0
      : exactNative
        ? fixedBinding.nativeCarrierOffsetHz
        : 0;
    const cleanContentBound = receiverImpairment === 'clean'
      && generatorBasis === 'content-bound-digital-baseband'
      && exactNative;
    const cleanDerivedContentBound = receiverImpairment === 'clean'
      && generatorBasis === 'content-bound-digital-baseband'
      && !exactNative;
    const qualification = receiverImpairment !== 'clean'
      ? 'receiver-impaired-complex-baseband' as const
      : generatorBasis === 'analytic-laboratory'
        ? 'analytic-complex-baseband' as const
        : cleanContentBound
          ? descriptor.governance.claims.digitalQualification === 'qualified'
            ? 'independently-verified-digital-baseband' as const
            : 'reference-generated-digital-baseband' as const
          : cleanDerivedContentBound
            ? descriptor.governance.claims.digitalQualification === 'qualified'
              ? 'derived-from-independently-verified-digital-baseband' as const
              : 'standards-derived-complex-baseband' as const
          : 'standards-derived-complex-baseband' as const;
    const measurement = complexIqMeasurementSchema.parse({
      ...this.#measurementBase(sequence, started),
      kind: 'complex-iq',
      centerHz: request.centerHz,
      profileReferenceCenterHz,
      rfReferenceCenterHz: fixedBinding === undefined
        ? profileReferenceCenterHz
        : profileReferenceCenterHz - fixedBinding.nativeCarrierOffsetHz,
      rfPlacement: request.centerHz === profileReferenceCenterHz
        ? 'profile-reference'
        : 'operator-translated',
      nativeCarrierOffsetHz: fixedBinding?.nativeCarrierOffsetHz ?? 0,
      outputCarrierOffsetHz,
      rfTuneCenterHz: request.centerHz - outputCarrierOffsetHz,
      sampleRateHz: request.sampleRateHz,
      nativeSampleRateHz,
      captureBandwidthHz: request.captureBandwidthHz,
      signalBandwidthHz,
      sampleFormat: request.sampleFormat,
      sampleCount: request.sampleCount,
      byteLength: samples.byteLength,
      encoding: 'base64',
      layout: 'interleaved-iq',
      byteOrder: 'little-endian',
      samplesBase64: bytesToBase64(samplesBytes),
      samplesSha256,
      timingQualification: 'simulation-exact',
      qualification,
      payloadKind: receiverImpairment !== 'clean'
        ? 'receiver-impaired-derived'
        : fixedBinding === undefined
          ? 'generated-at-output-rate'
          : exactNative
            ? 'native-canonical'
            : 'derived-hardware-ready',
      representation: cleanContentBound
        ? 'source-preserved-complex-envelope'
        : cleanDerivedContentBound
          ? 'derived-complex-envelope'
        : 'normalized-complex-envelope',
      normalization: cleanContentBound || cleanDerivedContentBound
        ? 'none'
        : receiverImpairment === 'clean'
          ? 'unit-peak'
          : 'peak-to-0.98',
      receiverImpairment,
      channelApplication: receiverImpairment === 'clean' ? 'not-applied' : 'receiver-impairment-preset',
      canonicalArtifactSha256: fixedBinding === undefined
        ? null
        : descriptor.assetSha256!,
      transformReceipt: {
        receiptVersion: 1,
        sourceArtifactSha256: fixedBinding === undefined
          ? null
          : descriptor.assetSha256!,
        sourceStartSample,
        sourceSampleCount: sourceSamples.byteLength / 8,
        sourceBoundaryPolicy: fixedBinding === undefined
          ? 'continuous-session-origin-zero-extended'
          : fixedBinding.replay === 'cyclic'
            ? 'cyclic-modular'
            : 'one-shot-zero-extended',
        sourcePeriodSamples: fixedBinding?.replay === 'cyclic'
          ? fixedBinding.nativePeriodSamples!
          : null,
        outputStartSourceSampleNumerator: nativeCursor.coordinateNumerator,
        outputStartSourceSampleDenominator: nativeCursor.coordinateDenominator,
        sourceSampleRateHz: nativeSampleRateHz,
        outputSampleRateHz: request.sampleRateHz,
        sourceCarrierOffsetHz: fixedBinding?.nativeCarrierOffsetHz ?? 0,
        outputCarrierOffsetHz,
        outputSampleCount: request.sampleCount,
        sourceSamplesSha256,
        outputSamplesSha256: samplesSha256,
        operations,
      },
    });
    this.#commitSequence(sequence);
    if (!oneShotReplay) {
      this.#advanceIqTimeCursor(request.sampleCount, request.sampleRateHz);
    }
    return measurement;
  }

  shutdown(): void {
    this.#requireOpen();
    this.#closed = true;
  }

  /**
   * This service's descriptor for a profile. Custom builders resolve from this
   * instance's own selections rather than any process-wide live state.
   */
  #liveDescriptor(
    profile: SynthesizedSignalProfile,
    selections: ReadonlyMap<CustomWaveformStandard, CustomWaveformSelections> =
      this.#customSelections,
  ): WaveformDescriptor {
    if (!isCustomWaveformProfile(profile)) return waveformDescriptor(profile);
    const standard = customWaveformStandard(profile);
    return buildCustomWaveformDescriptor(
      standard,
      selections.get(standard) ?? {},
    );
  }

  /**
   * The immutable catalog with this service's custom entries substituted in, so
   * `status().waveform` and `status().catalog` can never disagree.
   */
  #liveCatalog(
    selections: ReadonlyMap<CustomWaveformStandard, CustomWaveformSelections> =
      this.#customSelections,
  ): readonly WaveformDescriptor[] {
    return waveformCatalog.map((descriptor) => (
      isCustomWaveformProfile(descriptor.id)
        ? this.#liveDescriptor(descriptor.id, selections)
        : descriptor
    ));
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
      provenance: this.identity,
    };
  }

  #replaceConfigurationRevision(): void {
    this.#configurationRevision = this.#nextOpaqueId('configuration revision');
    this.#updatedAt = this.#nextInstant();
    this.#setIqTimeCursor(0n, 1n);
  }

  #setIqTimeCursor(numerator: bigint, denominator: bigint): void {
    if (numerator < 0n || denominator <= 0n) {
      throw new RangeError('I/Q time cursor must be a non-negative rational');
    }
    const divisor = greatestCommonDivisor(numerator, denominator);
    this.#iqTimeNumerator = numerator / divisor;
    this.#iqTimeDenominator = denominator / divisor;
  }

  /**
   * Prove the cursor this acquisition would COMMIT stays usable before any
   * bytes are synthesized. The current coordinate is checked during synthesis,
   * but the enlarged one was previously committed unchecked, so a run of legal
   * acquisitions at pairwise-prime rates could compound the denominator until
   * the next otherwise-valid acquisition threw, stranding the service until a
   * configuration reset. Fail closed here instead: no synthesis, no sequence
   * increment, no cursor change.
   */
  #assertNextIqCursorRepresentable(
    sampleCount: number,
    sampleRateHz: number,
  ): void {
    const numerator = this.#iqTimeNumerator * BigInt(sampleRateHz)
      + BigInt(sampleCount) * this.#iqTimeDenominator;
    const denominator = this.#iqTimeDenominator * BigInt(sampleRateHz);
    const divisor = greatestCommonDivisor(numerator, denominator);
    const nextNumerator = numerator / divisor;
    const nextDenominator = denominator / divisor;
    // Worst case for the receipt coordinate is the widest supported rate.
    const probeNumerator =
      nextNumerator * BigInt(MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ);
    const probeDivisor =
      greatestCommonDivisor(probeNumerator, nextDenominator);
    if ((probeNumerator / probeDivisor).toString().length > 40
      || (nextDenominator / probeDivisor).toString().length > 40) {
      throw new RangeError(
        'Exact I/Q acquisition would advance the time cursor past the 40-digit '
        + 'transform-receipt bound; the acquisition was rejected without '
        + 'changing sequence or cursor state',
      );
    }
  }

  #advanceIqTimeCursor(sampleCount: number, sampleRateHz: number): void {
    this.#setIqTimeCursor(
      this.#iqTimeNumerator * BigInt(sampleRateHz)
        + BigInt(sampleCount) * this.#iqTimeDenominator,
      this.#iqTimeDenominator * BigInt(sampleRateHz),
    );
  }

  #nextSequenceCandidate(): number {
    if (this.#sequence >= Number.MAX_SAFE_INTEGER) throw new Error('Measurement sequence is exhausted');
    return this.#sequence + 1;
  }

  #commitSequence(sequence: number): void {
    if (sequence !== this.#sequence + 1) {
      throw new Error('Measurement sequence commit is not monotonic');
    }
    this.#sequence = sequence;
  }

  #nextSequence(): number {
    const sequence = this.#nextSequenceCandidate();
    this.#commitSequence(sequence);
    return sequence;
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
  return sha256HexOfBytes(value);
}

const MAX_DERIVED_SOURCE_SUPPORT_SAMPLES = 8_388_608;

function synthesizeFixedNativeWindow(
  profile: SynthesizedSignalProfile,
  binding: FixedDigitalProfileBinding,
  sourceStartSample: number,
  sourceSampleCount: number,
): Uint8Array {
  if (!Number.isSafeInteger(sourceStartSample)) {
    throw new RangeError('Native source start sample must be a safe integer');
  }
  if (!Number.isSafeInteger(sourceSampleCount)
    || sourceSampleCount < 1
    || sourceSampleCount > MAX_DERIVED_SOURCE_SUPPORT_SAMPLES) {
    throw new RangeError(
      `Derived I/Q transform requires from 1 through ${MAX_DERIVED_SOURCE_SUPPORT_SAMPLES} native support samples`,
    );
  }
  if (!Number.isSafeInteger(sourceStartSample + sourceSampleCount - 1)) {
    throw new RangeError('Native source support window exceeds the safe integer range');
  }
  const output = new Uint8Array(sourceSampleCount * 8);
  if (binding.replay === 'cyclic') {
    const periodSamples = binding.nativePeriodSamples!;
    let generated = 0;
    while (generated < sourceSampleCount) {
      const wrappedStart = positiveModulo(
        sourceStartSample + generated,
        periodSamples,
      );
      const chunkSamples = Math.min(
        65_536,
        sourceSampleCount - generated,
        periodSamples - wrappedStart,
      );
      const chunk = synthesizeAnalyticComplexIq({
        profile,
        sampleRateHz: binding.nativeSampleRateHz,
        bandwidthHz: binding.signalBandwidthHz,
        sampleCount: chunkSamples,
        startSampleIndex: wrappedStart,
      });
      output.set(chunk, generated * 8);
      generated += chunkSamples;
    }
    return output;
  }

  const availableStart = Math.max(0, sourceStartSample);
  const availableEnd = Math.min(
    binding.captureSamples!,
    sourceStartSample + sourceSampleCount,
  );
  let generated = availableStart;
  while (generated < availableEnd) {
    const chunkSamples = Math.min(65_536, availableEnd - generated);
    const chunk = synthesizeAnalyticComplexIq({
      profile,
      sampleRateHz: binding.nativeSampleRateHz,
      bandwidthHz: binding.signalBandwidthHz,
      sampleCount: chunkSamples,
      startSampleIndex: generated,
    });
    output.set(chunk, (generated - sourceStartSample) * 8);
    generated += chunkSamples;
  }
  return output;
}

function synthesizeFlexibleNativeWindow(
  profile: SynthesizedSignalProfile,
  sampleRateHz: number,
  signalBandwidthHz: number,
  sourceStartSample: number,
  sourceSampleCount: number,
): Uint8Array {
  if (!Number.isSafeInteger(sourceStartSample)
    || !Number.isSafeInteger(sourceSampleCount)
    || sourceSampleCount < 1
    || sourceSampleCount > MAX_DERIVED_SOURCE_SUPPORT_SAMPLES
    || !Number.isSafeInteger(sourceStartSample + sourceSampleCount - 1)) {
    throw new RangeError('Flexible source support window exceeds the admitted geometry');
  }
  const output = new Uint8Array(sourceSampleCount * 8);
  // Time zero is the explicit origin of a generated session. FIR support
  // before that origin is zero extension; positive time remains unbounded.
  let generated = Math.max(0, sourceStartSample);
  const availableEnd = sourceStartSample + sourceSampleCount;
  while (generated < availableEnd) {
    const chunkSamples = Math.min(65_536, availableEnd - generated);
    const chunk = synthesizeAnalyticComplexIq({
      profile,
      sampleRateHz,
      bandwidthHz: signalBandwidthHz,
      sampleCount: chunkSamples,
      startSampleIndex: generated,
    });
    output.set(chunk, (generated - sourceStartSample) * 8);
    generated += chunkSamples;
  }
  return output;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function oneShotOutputFits(
  nativeSampleLimit: number,
  nativeSampleRateHz: number,
  outputSampleCount: number,
  outputSampleRateHz: number,
): boolean {
  return BigInt(outputSampleCount) * BigInt(nativeSampleRateHz)
    <= BigInt(nativeSampleLimit) * BigInt(outputSampleRateHz);
}

function rationalNativeSamplePosition(
  timeNumerator: bigint,
  timeDenominator: bigint,
  nativeSampleRateHz: number,
): {
  readonly integerPosition?: number;
  readonly coordinateNumerator: string;
  readonly coordinateDenominator: string;
  readonly phaseNumerator?: string;
  readonly phaseDenominator?: string;
} {
  const nativeNumerator = timeNumerator * BigInt(nativeSampleRateHz);
  const coordinateDivisor = greatestCommonDivisor(nativeNumerator, timeDenominator);
  const coordinateNumerator = nativeNumerator / coordinateDivisor;
  const coordinateDenominator = timeDenominator / coordinateDivisor;
  if (coordinateNumerator.toString().length > 40
    || coordinateDenominator.toString().length > 40) {
    throw new RangeError(
      'Exact I/Q native sample coordinate exceeds the 40-digit transform-receipt bound',
    );
  }
  const quotient = nativeNumerator / timeDenominator;
  const remainder = nativeNumerator % timeDenominator;
  if (quotient > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('I/Q native sample cursor exceeds the safe integer range');
  }
  if (remainder === 0n) {
    return {
      integerPosition: Number(quotient),
      coordinateNumerator: coordinateNumerator.toString(),
      coordinateDenominator: coordinateDenominator.toString(),
    };
  }
  const divisor = greatestCommonDivisor(remainder, timeDenominator);
  return {
    coordinateNumerator: coordinateNumerator.toString(),
    coordinateDenominator: coordinateDenominator.toString(),
    phaseNumerator: (remainder / divisor).toString(),
    phaseDenominator: (timeDenominator / divisor).toString(),
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
