/**
 * Pull-based Tx stream engine.
 *
 * One engine produces one deterministic sample stream: every output sample is
 * a pure function of the plan and its absolute output sample coordinate, so
 * any partition of the stream into consecutive chunks is byte-identical to
 * the whole, and a stream resumed from any disclosed coordinate reproduces
 * the tail exactly. Chunks are bounded (at most 65,536 samples), exactly one
 * chunk is in flight between the engine and a sink, and all geometry
 * validation fails closed before any synthesis.
 *
 * This engine is host tooling, not a measurement capability: it never calls
 * AtomizerMeasurementService, never changes the bounded acquireIq surface,
 * and its receipts create no RF claim.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MIN_MEASUREMENT_FREQUENCY_HZ,
  type SynthesizedSignalProfile,
} from './contracts.js';
import {
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
  MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
} from './complex-iq.js';
import {
  fixedDigitalProfileBinding,
  isFixedDigitalProfile,
  isUnboundedCompositionProfile,
  unboundedCompositionProfileBinding,
} from './fixed-digital-profile-binding.js';
import { waveformDescriptor } from './catalog.js';
import {
  buildCustomWaveformDescriptor,
  customWaveformStandard,
  isCustomWaveformProfile,
  type CustomWaveformSelections,
} from './custom-waveform.js';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  assertRepresentableRational,
  rationalNativeCoordinate,
  minimumDerivedStreamRateHz,
  synthesizeStreamWindow,
  txStreamRecipeRuntime,
  TxStreamError,
  type StreamSourceWindow,
} from './tx-stream-source.js';
import { registerTxStreamRecipes } from './tx-stream-recipes.js';
import {
  TX_STREAM_CONTRACT_ID,
  TX_STREAM_CONTRACT_SHA256,
  TX_STREAM_CONTRACT_VERSION,
  TX_STREAM_ONE_SHOT_REFUSAL_CODE,
  txStreamChunkReceiptSchema,
  txStreamGeneratorBindingSha256,
  txStreamManifestSchema,
  txStreamProfileSourceSchema,
  txStreamRecipeSourceSchema,
  type TxStreamChunkReceipt,
  type TxStreamManifest,
  type TxStreamQualification,
} from './tx-stream-contract.js';

const txStreamPlanSourceSchema = z.discriminatedUnion('kind', [
  txStreamProfileSourceSchema,
  txStreamRecipeSourceSchema,
]);

export const txStreamPlanSchema = z.object({
  source: txStreamPlanSourceSchema,
  sampleRateHz: z.number().safe().int()
    .min(MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ)
    .max(MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ),
  /** Output RF placement metadata only; never artifact identity. */
  centerHz: z.number().safe().int()
    .min(MIN_MEASUREMENT_FREQUENCY_HZ)
    .max(MAX_MEASUREMENT_FREQUENCY_HZ),
  chunkSamples: z.number().int().min(1).max(MAX_ANALYTIC_COMPLEX_IQ_SAMPLES)
    .default(16_384),
  durationSamples: z.number().safe().int().positive().optional(),
  chunkHashing: z.boolean().default(true),
}).strict();
export type TxStreamPlanInput = z.input<typeof txStreamPlanSchema>;
export type TxStreamPlan = z.output<typeof txStreamPlanSchema>;

export interface TxStreamChunk {
  readonly bytes: Uint8Array;
  readonly receipt: TxStreamChunkReceipt;
}

export interface TxStreamEngineDependencies {
  readonly uuid?: () => string;
  readonly now?: () => Date;
}

interface ResolvedProfileSource {
  readonly kind: 'profile';
  readonly profile: SynthesizedSignalProfile;
  readonly selections?: CustomWaveformSelections;
  readonly nativeSampleRateHz: number;
  readonly signalBandwidthHz: number;
  readonly qualification: TxStreamQualification;
  readonly disclosure: string;
}

interface ResolvedRecipeSource {
  readonly kind: 'recipe';
  readonly recipeId: string;
  readonly contentSeed: number;
  readonly nativeSampleRateHz: number;
  readonly signalBandwidthHz: number;
  readonly qualification: TxStreamQualification;
  readonly disclosure: string;
}

type ResolvedSource = ResolvedProfileSource | ResolvedRecipeSource;

export class TxStreamEngine {
  readonly streamId: string;
  readonly plan: TxStreamPlan;

  readonly #source: ResolvedSource;
  readonly #generatorBindingSha256: string;
  readonly #startedAtIso: string;
  readonly #uuid: () => string;
  readonly #now: () => Date;
  #produced = 0n;
  #chunks = 0;
  #cancelled = false;

  constructor(planInput: unknown, dependencies: TxStreamEngineDependencies = {}) {
    this.#uuid = dependencies.uuid ?? (() => randomUUID());
    this.#now = dependencies.now ?? (() => new Date());
    this.plan = txStreamPlanSchema.parse(planInput);
    registerTxStreamRecipes();
    this.#source = resolveSource(this.plan);
    this.streamId = this.#uuid();
    this.#startedAtIso = isoInstant(this.#now());
    this.#generatorBindingSha256 =
      txStreamGeneratorBindingSha256(TX_STREAM_CONTRACT_SHA256);
  }

  /** True when the stream was cancelled before its planned end. */
  isCancelled(): boolean {
    return this.#cancelled;
  }

  cancel(): void {
    this.#cancelled = true;
  }

  /** Samples produced so far (absolute output coordinate of the next chunk). */
  get producedSamples(): bigint {
    return this.#produced;
  }

  /**
   * Pull the next chunk. Returns null at the planned end or after cancel.
   * Throws before any state change when geometry is inadmissible.
   */
  nextChunk(): TxStreamChunk | null {
    if (this.#cancelled) return null;
    if (this.plan.durationSamples !== undefined
      && this.#produced >= BigInt(this.plan.durationSamples)) {
      return null;
    }
    const remaining = this.plan.durationSamples === undefined
      ? this.plan.chunkSamples
      : Number(BigInt(this.plan.durationSamples) - this.#produced);
    const sampleCount = Math.min(this.plan.chunkSamples, remaining);

    // Preflight the chunk's end coordinate before any synthesis so an
    // unrepresentable state rejects with no bytes produced and no cursor
    // change (pattern of the measurement service's cursor preflight).
    this.#assertStreamCoordinatesRepresentable(this.#produced + BigInt(sampleCount));

    const receipt = this.#produceChunk(this.#produced, sampleCount);
    this.#produced += BigInt(sampleCount);
    this.#chunks += 1;
    return receipt;
  }

  manifest(
    state: TxStreamManifest['state'],
    deviceCounters: { underruns?: number; overruns?: number } = {},
  ): TxStreamManifest {
    return txStreamManifestSchema.parse({
      streamId: this.streamId,
      contractId: TX_STREAM_CONTRACT_ID,
      contractVersion: TX_STREAM_CONTRACT_VERSION,
      contractSha256: TX_STREAM_CONTRACT_SHA256,
      source: this.plan.source,
      sampleRateHz: this.plan.sampleRateHz,
      centerHz: this.plan.centerHz,
      sampleFormat: 'cf32le',
      chunkSamples: this.plan.chunkSamples,
      plannedSamples: this.plan.durationSamples === undefined
        ? 'unbounded'
        : String(this.plan.durationSamples),
      generatorBindingSha256: this.#generatorBindingSha256,
      qualificationClass: this.#source.qualification,
      disclosure: this.#source.disclosure,
      totals: {
        chunks: this.#chunks,
        samples: this.#produced.toString(),
        bytes: (this.#produced * 8n).toString(),
        underruns: deviceCounters.underruns ?? 0,
        overruns: deviceCounters.overruns ?? 0,
      },
      state,
      startedAt: this.#startedAtIso,
      closedAt: isoInstant(this.#now()),
    });
  }

  #produceChunk(startSample: bigint, sampleCount: number): TxStreamChunk {
    const source = this.#source;
    if (source.kind === 'recipe') {
      const runtime = txStreamRecipeRuntime(source.recipeId);
      if (runtime === undefined) {
        throw new TxStreamError(
          'TX_STREAM_RECIPE_UNKNOWN',
          `Tx stream recipe ${source.recipeId} is not registered`,
        );
      }
      const bytes = runtime.synthesizeWindow({
        contentSeed: source.contentSeed,
        startSample,
        sampleCount,
      });
      if (bytes.byteLength !== sampleCount * 8) {
        throw new Error(
          `Tx stream recipe ${source.recipeId} produced ${bytes.byteLength} bytes `
          + `for ${sampleCount} samples; expected ${sampleCount * 8}`,
        );
      }
      const receipt = txStreamChunkReceiptSchema.parse({
        streamId: this.streamId,
        chunkIndex: this.#chunks,
        startSample: startSample.toString(),
        sampleCount,
        byteLength: bytes.byteLength,
        sampleFormat: 'cf32le',
        sha256: this.plan.chunkHashing ? sha256HexOfBytes(bytes) : null,
        qualification: source.qualification,
        payloadKind: 'generated-at-output-rate',
        boundaryPolicy: 'unbounded-generated',
        canonicalArtifactSha256: null,
        nativeSampleRateHz: source.nativeSampleRateHz,
        outputSampleRateHz: this.plan.sampleRateHz,
        sourceCarrierOffsetHz: 0,
        outputCarrierOffsetHz: 0,
        operations: [],
      });
      return { bytes, receipt };
    }

    const window: StreamSourceWindow = synthesizeStreamWindow({
      profile: source.profile,
      selections: source.selections,
      sampleRateHz: this.plan.sampleRateHz,
      startSample,
      sampleCount,
    });
    const receipt = txStreamChunkReceiptSchema.parse({
      streamId: this.streamId,
      chunkIndex: this.#chunks,
      startSample: startSample.toString(),
      sampleCount,
      byteLength: window.bytes.byteLength,
      sampleFormat: 'cf32le',
      sha256: this.plan.chunkHashing ? sha256HexOfBytes(window.bytes) : null,
      qualification: window.qualification,
      payloadKind: window.payloadKind,
      boundaryPolicy: window.boundaryPolicy,
      canonicalArtifactSha256: window.canonicalArtifactSha256,
      nativeSampleRateHz: window.nativeSampleRateHz,
      outputSampleRateHz: this.plan.sampleRateHz,
      sourceCarrierOffsetHz: window.sourceCarrierOffsetHz,
      outputCarrierOffsetHz: window.outputCarrierOffsetHz,
      operations: window.operations,
    });
    return { bytes: window.bytes, receipt };
  }

  #assertStreamCoordinatesRepresentable(endSample: bigint): void {
    const source = this.#source;
    if (source.kind === 'recipe') {
      if (endSample >= 10n ** 40n) {
        throw new RangeError('Tx stream coordinate exceeds the 40-digit representability bound');
      }
      return;
    }
    const rational = rationalNativeCoordinate(
      endSample,
      source.nativeSampleRateHz,
      this.plan.sampleRateHz,
    );
    assertRepresentableRational(rational.numerator, rational.denominator);
  }
}

function resolveSource(plan: TxStreamPlan): ResolvedSource {
  const source = plan.source;
  if (source.kind === 'recipe') {
    const runtime = txStreamRecipeRuntime(source.recipeId);
    if (runtime === undefined) {
      throw new TxStreamError(
        'TX_STREAM_RECIPE_UNKNOWN',
        `Tx stream recipe ${source.recipeId} is not registered`,
      );
    }
    if (plan.sampleRateHz !== runtime.sampleRateHz) {
      throw new RangeError(
        `Tx stream recipe ${source.recipeId} pins its sample rate to `
        + `${runtime.sampleRateHz} Hz; received ${plan.sampleRateHz} Hz`,
      );
    }
    return {
      kind: 'recipe',
      recipeId: source.recipeId,
      contentSeed: source.contentSeed ?? runtime.contentSeedDefault,
      nativeSampleRateHz: runtime.sampleRateHz,
      signalBandwidthHz: runtime.signalBandwidthHz,
      qualification: runtime.qualification,
      disclosure: runtime.disclosure,
    };
  }

  const profile = source.profile;
  const selections: CustomWaveformSelections | undefined = isCustomWaveformProfile(profile)
    ? Object.freeze({ ...(source.selections ?? {}) })
    : undefined;
  const binding = isFixedDigitalProfile(profile)
    ? fixedDigitalProfileBinding(profile)
    : isUnboundedCompositionProfile(profile)
      ? unboundedCompositionProfileBinding(profile)
      : undefined;

  if (binding?.replay === 'one-shot') {
    throw new TxStreamError(
      TX_STREAM_ONE_SHOT_REFUSAL_CODE,
      `${profile} is a bounded one-shot artifact and cannot be streamed; `
      + 'stream the matching bluetooth longdwell composition profile instead',
    );
  }

  // buildCustomWaveformDescriptor resolves and validates every pin before any
  // synthesis is admitted; illegal selections reject here, fail-closed.
  const descriptor = isCustomWaveformProfile(profile)
    ? buildCustomWaveformDescriptor(customWaveformStandard(profile), selections ?? {})
    : waveformDescriptor(profile);
  const signalBandwidthHz = binding?.signalBandwidthHz ?? descriptor.occupiedBandwidthHz;
  const nativeSampleRateHz = binding?.nativeSampleRateHz ?? plan.sampleRateHz;

  if (binding === undefined) {
    if (plan.sampleRateHz < signalBandwidthHz) {
      throw new RangeError(
        `${profile} stream sample rate must be at least its declared `
        + `${signalBandwidthHz} Hz signal bandwidth`,
      );
    }
  } else if (plan.sampleRateHz < binding.nativeSampleRateHz
    && plan.sampleRateHz < minimumDerivedStreamRateHz(signalBandwidthHz)) {
    // Service conjunction: rates below the native artifact must clear the
    // 0.95-Nyquist guard; upsampling is lossless and admitted.
    throw new RangeError(
      `${profile} derived stream rate below its native `
      + `${binding.nativeSampleRateHz} samples/s must be at least `
      + `${minimumDerivedStreamRateHz(signalBandwidthHz)} samples/s so the `
      + `resampler's 0.95-Nyquist anti-alias passband contains the `
      + `${signalBandwidthHz} Hz signal bandwidth`,
    );
  }

  const artifactSha256 = descriptor.assetSha256 ?? null;
  const derived = binding !== undefined
    && plan.sampleRateHz !== binding.nativeSampleRateHz;
  const qualification: TxStreamQualification = binding === undefined
    ? (isCustomWaveformProfile(profile)
      ? 'standards-derived-complex-baseband'
      : 'analytic-complex-baseband')
    : derived
      ? (artifactSha256 !== null
        ? 'derived-from-independently-verified-digital-baseband'
        : 'standards-derived-complex-baseband')
      : (artifactSha256 !== null
        ? 'independently-verified-digital-baseband'
        : 'standards-derived-complex-baseband');

  return {
    kind: 'profile',
    profile,
    selections,
    nativeSampleRateHz,
    signalBandwidthHz,
    qualification,
    disclosure: descriptor.disclosure,
  };
}

function isoInstant(date: Date): string {
  return date.toISOString().replace(/(\d{3})\d*Z$/, '$1Z');
}
