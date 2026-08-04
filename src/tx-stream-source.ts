/**
 * Tx stream window synthesis over SignalLab's public generator surfaces.
 *
 * This module composes the same public entry points the measurement service
 * uses (synthesizeAnalyticComplexIq, the binding registries, the Blackman
 * windowed-sinc resampler, and the exact complex rotator) without importing
 * or modifying measurement-service internals: the frozen measurement path and
 * the streaming path stay independently accountable. Every window is a pure
 * function of the absolute output sample coordinate, so any partition of a
 * stream into consecutive chunks is byte-identical to the whole.
 *
 * Source bytes only: no propagation channel and no receiver impairment are
 * applied here or anywhere in the stream surface. Streamed qualification is
 * the source qualification of the profile or recipe at the chosen rate.
 */
import {
  ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
  synthesizeAnalyticComplexIq,
} from './complex-iq.js';
import {
  customWaveformDescriptor,
  customWaveformSelections,
  customWaveformStandard,
  isCustomWaveformProfile,
  setCustomWaveformSelections,
  type CustomWaveformSelections,
} from './custom-waveform.js';
import {
  fixedDigitalProfileBinding,
  isFixedDigitalProfile,
  isUnboundedCompositionProfile,
  unboundedCompositionProfileBinding,
  type NativeRateProfileBinding,
} from './fixed-digital-profile-binding.js';
import {
  iqResamplerSupport,
  IQ_RESAMPLER_ALGORITHM,
  IQ_RESAMPLER_NYQUIST_GUARD,
  IQ_RESAMPLER_ZERO_CROSSINGS,
  resampleCf32leWindowedSinc,
  translateCf32leCarrier,
} from './iq-resampler.js';
import { waveformDescriptor } from './catalog.js';
import {
  TX_STREAM_ONE_SHOT_REFUSAL_CODE,
  type TxStreamBoundaryPolicy,
  type TxStreamOperation,
  type TxStreamPayloadKind,
  type TxStreamQualification,
} from './tx-stream-contract.js';
import type { SynthesizedSignalProfile } from './contracts.js';

/**
 * Mirrors the measurement service's derived-support ceiling (declared there
 * for bounded captures). Re-declared for frozen-path isolation: the streaming
 * surface validates its own windows against the same bound without reaching
 * into the service module.
 */
export const TX_STREAM_MAX_DERIVED_SOURCE_SUPPORT_SAMPLES = 8_388_608 as const;

export type TxStreamErrorCode =
  | typeof TX_STREAM_ONE_SHOT_REFUSAL_CODE
  | 'TX_STREAM_RECIPE_UNKNOWN'
  | 'TX_STREAM_SINK_FAULT';

export class TxStreamError extends Error {
  readonly code: TxStreamErrorCode;

  constructor(code: TxStreamErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'TxStreamError';
  }
}

/**
 * Phase-2 seam: timeline recipes register a runtime here. The Phase-1 engine
 * consults the registry and refuses unknown ids; the registry stays empty
 * until recipe runtimes are installed by tx-stream-recipes.ts.
 */
export interface TxStreamRecipeRuntime {
  readonly recipeId: string;
  readonly sampleRateHz: number;
  readonly signalBandwidthHz: number;
  readonly profileReferenceCenterHz: number;
  readonly qualification: TxStreamQualification;
  readonly disclosure: string;
  readonly contentSeedDefault: number;
  /**
   * Smallest complete schedule period eligible for a device-loop (cyclic)
   * buffer, or null when the timeline has no finite period (device looping
   * then needs an operator-declared period).
   */
  readonly deviceLoopPeriodSamples: number | null;
  synthesizeWindow(input: {
    contentSeed: number;
    startSample: bigint;
    sampleCount: number;
  }): Uint8Array;
}

const recipeRegistry = new Map<string, TxStreamRecipeRuntime>();

export function registerTxStreamRecipe(runtime: TxStreamRecipeRuntime): void {
  if (recipeRegistry.has(runtime.recipeId)) {
    throw new Error(`Tx stream recipe ${runtime.recipeId} is already registered`);
  }
  recipeRegistry.set(runtime.recipeId, runtime);
}

export function txStreamRecipeRuntime(
  recipeId: string,
): TxStreamRecipeRuntime | undefined {
  return recipeRegistry.get(recipeId);
}

export function registeredTxStreamRecipeIds(): readonly string[] {
  return [...recipeRegistry.keys()];
}

export interface StreamSourceWindowRequest {
  readonly profile: SynthesizedSignalProfile;
  /** custom-* only: validated by the builder before any synthesis. */
  readonly selections?: Readonly<Record<string, string>>;
  readonly sampleRateHz: number;
  /** Absolute output sample coordinate of the first output sample. */
  readonly startSample: bigint;
  readonly sampleCount: number;
}

export interface StreamSourceWindow {
  readonly bytes: Uint8Array;
  readonly payloadKind: TxStreamPayloadKind;
  readonly boundaryPolicy: TxStreamBoundaryPolicy;
  readonly qualification: TxStreamQualification;
  readonly canonicalArtifactSha256: string | null;
  readonly nativeSampleRateHz: number;
  readonly sourceCarrierOffsetHz: number;
  /** Carrier offset after any frequency translation (0 at DC). */
  readonly outputCarrierOffsetHz: number;
  readonly operations: readonly TxStreamOperation[];
  readonly disclosure: string;
}

/** Smallest derived output rate whose 0.95-Nyquist passband contains the signal. */
export function minimumDerivedStreamRateHz(signalBandwidthHz: number): number {
  return Math.ceil(signalBandwidthHz / IQ_RESAMPLER_NYQUIST_GUARD);
}

/**
 * Synthesize one stream chunk. Throws RangeError on inadmissible geometry and
 * TxStreamError(TX_STREAM_ONE_SHOT_NOT_STREAMABLE) for one-shot artifacts.
 *
 * Custom profiles: the plan's validated selections are installed in the
 * builder's module state for the entire synthesis of this window (descriptor
 * resolution AND generator dispatch read that state) and restored afterwards,
 * so the emitted bytes always render the plan's disclosed configuration.
 */
export function synthesizeStreamWindow(
  request: StreamSourceWindowRequest,
): StreamSourceWindow {
  if (!Number.isSafeInteger(request.sampleCount)
    || request.sampleCount < 1
    || request.sampleCount > MAX_ANALYTIC_COMPLEX_IQ_SAMPLES) {
    throw new RangeError(`Tx stream chunk must request from 1 through ${MAX_ANALYTIC_COMPLEX_IQ_SAMPLES} samples`);
  }
  if (!Number.isSafeInteger(request.sampleRateHz) || request.sampleRateHz < 1) {
    throw new RangeError('Tx stream sample rate must be a positive safe integer');
  }
  if (request.startSample < 0n) {
    throw new RangeError('Tx stream start sample must be non-negative');
  }

  const binding: NativeRateProfileBinding | undefined = isFixedDigitalProfile(request.profile)
    ? fixedDigitalProfileBinding(request.profile)
    : isUnboundedCompositionProfile(request.profile)
      ? unboundedCompositionProfileBinding(request.profile)
      : undefined;

  if (binding?.replay === 'one-shot') {
    throw new TxStreamError(
      TX_STREAM_ONE_SHOT_REFUSAL_CODE,
      `${request.profile} is a bounded one-shot artifact and cannot be streamed; `
      + 'stream the matching bluetooth longdwell composition profile instead',
    );
  }

  if (isCustomWaveformProfile(request.profile)) {
    return withCustomSelections(request.profile, request.selections, () => (
      synthesizeStreamWindowResolved(request, binding)
    ));
  }
  return synthesizeStreamWindowResolved(request, binding);
}

function synthesizeStreamWindowResolved(
  request: StreamSourceWindowRequest,
  binding: NativeRateProfileBinding | undefined,
): StreamSourceWindow {
  const descriptor = isCustomWaveformProfile(request.profile)
    ? customWaveformDescriptor(request.profile)
    : waveformDescriptor(request.profile);
  const disclosure = descriptor.disclosure;

  if (binding === undefined) {
    return synthesizeFlexibleWindow(request, disclosure);
  }
  if (binding.replay === 'one-shot') {
    throw new TxStreamError(
      TX_STREAM_ONE_SHOT_REFUSAL_CODE,
      `${request.profile} is a bounded one-shot artifact and cannot be streamed; `
      + 'stream the matching bluetooth longdwell composition profile instead',
    );
  }
  if (request.sampleRateHz === binding.nativeSampleRateHz) {
    return synthesizeNativeWindow(request, binding, disclosure);
  }
  return synthesizeDerivedWindow(request, binding, disclosure);
}

/**
 * Install the plan's validated selections for the duration of `body` and
 * restore the prior state afterwards, even on throw. setCustomWaveformSelections
 * validates every pin before installing, so illegal selections reject before
 * any synthesis. The bracket spans descriptor resolution AND generator
 * dispatch: both read the module state.
 */
function withCustomSelections<T>(
  profile: SynthesizedSignalProfile,
  selections: Readonly<Record<string, string>> | undefined,
  body: () => T,
): T {
  if (!isCustomWaveformProfile(profile)) {
    throw new RangeError('Custom selections require a custom profile');
  }
  const standard = customWaveformStandard(profile);
  const previous = customWaveformSelections(standard);
  try {
    setCustomWaveformSelections(standard, { ...(selections ?? {}) });
    return body();
  } finally {
    setCustomWaveformSelections(standard, previous);
  }
}

/** Rate-flexible profiles generate directly at the stream rate. */
function synthesizeFlexibleWindow(
  request: StreamSourceWindowRequest,
  disclosure: string,
): StreamSourceWindow {
  // Custom selections are already installed by withCustomSelections, so the
  // module-state descriptor read here renders the plan's configuration.
  const descriptor = isCustomWaveformProfile(request.profile)
    ? customWaveformDescriptor(request.profile)
    : waveformDescriptor(request.profile);
  const signalBandwidthHz = descriptor.occupiedBandwidthHz;
  if (request.sampleRateHz < signalBandwidthHz) {
    throw new RangeError(
      `${request.profile} stream sample rate must be at least its declared `
      + `${signalBandwidthHz} Hz signal bandwidth`,
    );
  }
  const bytes = synthesizeChunked(
    (windowStart, windowSamples) => synthesizeAnalyticComplexIq({
      profile: request.profile,
      sampleRateHz: request.sampleRateHz,
      bandwidthHz: signalBandwidthHz,
      sampleCount: windowSamples,
      startSampleIndex: windowStart,
    }),
    request.startSample,
    request.sampleCount,
  );
  const qualification: TxStreamQualification = isCustomWaveformProfile(request.profile)
    ? 'standards-derived-complex-baseband'
    : 'analytic-complex-baseband';
  return Object.freeze({
    bytes,
    payloadKind: 'generated-at-output-rate',
    boundaryPolicy: 'continuous-session-origin-zero-extended',
    qualification,
    canonicalArtifactSha256: null,
    nativeSampleRateHz: request.sampleRateHz,
    sourceCarrierOffsetHz: 0,
    outputCarrierOffsetHz: 0,
    operations: Object.freeze([]),
    disclosure,
  });
}

/** Exact native-rate replay: cyclic modular wrap or unbounded passthrough. */
function synthesizeNativeWindow(
  request: StreamSourceWindowRequest,
  binding: Exclude<NativeRateProfileBinding, { replay: 'one-shot' }>,
  disclosure: string,
): StreamSourceWindow {
  assertSafeCoordinate(request.startSample, binding.nativeSampleRateHz, binding.nativeSampleRateHz);
  const bytes = binding.replay === 'cyclic'
    ? synthesizeCyclicWindow(
      request.profile,
      binding,
      Number(request.startSample),
      request.sampleCount,
    )
    : synthesizeChunked(
      (windowStart, windowSamples) => synthesizeAnalyticComplexIq({
        profile: request.profile,
        sampleRateHz: binding.nativeSampleRateHz,
        bandwidthHz: binding.signalBandwidthHz,
        sampleCount: windowSamples,
        startSampleIndex: windowStart,
      }),
      request.startSample,
      request.sampleCount,
    );
  const artifactSha256 = artifactHashFor(request.profile);
  const isContentBound = artifactSha256 !== null;
  return Object.freeze({
    bytes,
    // Exact-native unbounded compositions carry no canonical artifact, so they
    // report generated-at-output-rate exactly like the measurement service does
    // for unbounded exact-native acquisitions; content-bound artifacts keep
    // native-canonical with their artifact identity.
    payloadKind: binding.replay === 'unbounded'
      ? 'generated-at-output-rate'
      : 'native-canonical',
    boundaryPolicy: binding.replay === 'cyclic'
      ? 'cyclic-modular'
      : 'continuous-session-origin-zero-extended',
    qualification: isContentBound
      ? 'independently-verified-digital-baseband'
      : 'standards-derived-complex-baseband',
    canonicalArtifactSha256: artifactSha256,
    nativeSampleRateHz: binding.nativeSampleRateHz,
    sourceCarrierOffsetHz: binding.nativeCarrierOffsetHz,
    outputCarrierOffsetHz: binding.nativeCarrierOffsetHz,
    operations: Object.freeze([]),
    disclosure,
  });
}

/** Derived rate: exact rational native coordinate, FIR support, resample. */
function synthesizeDerivedWindow(
  request: StreamSourceWindowRequest,
  binding: Exclude<NativeRateProfileBinding, { replay: 'one-shot' }>,
  disclosure: string,
): StreamSourceWindow {
  // Mirror the measurement service's conjunction: a rate below the native
  // artifact must also clear the 0.95-Nyquist guard; upsampling is lossless
  // and admitted even between the native rate and the guard floor.
  if (request.sampleRateHz < binding.nativeSampleRateHz
    && request.sampleRateHz < minimumDerivedStreamRateHz(binding.signalBandwidthHz)) {
    throw new RangeError(
      `${request.profile} derived stream rate below its native `
      + `${binding.nativeSampleRateHz} samples/s must be at least `
      + `${minimumDerivedStreamRateHz(binding.signalBandwidthHz)} samples/s so the `
      + `resampler's 0.95-Nyquist anti-alias passband contains the `
      + `${binding.signalBandwidthHz} Hz signal bandwidth`,
    );
  }
  const rational = rationalNativeCoordinate(
    request.startSample,
    binding.nativeSampleRateHz,
    request.sampleRateHz,
  );
  assertRepresentableRational(rational.numerator, rational.denominator);
  const support = iqResamplerSupport({
    outputStartSourceSampleNumerator: rational.numerator,
    outputStartSourceSampleDenominator: rational.denominator,
    sourceSampleRateHz: binding.nativeSampleRateHz,
    outputSampleRateHz: request.sampleRateHz,
    outputSampleCount: request.sampleCount,
  });
  const supportSamples = support.sourceEndSample - support.sourceStartSample + 1;
  if (supportSamples > TX_STREAM_MAX_DERIVED_SOURCE_SUPPORT_SAMPLES) {
    throw new RangeError(
      `Derived stream chunk requires ${supportSamples} native support samples, `
      + `exceeding the admitted ${TX_STREAM_MAX_DERIVED_SOURCE_SUPPORT_SAMPLES}`,
    );
  }

  const nativeWindow = binding.replay === 'cyclic'
    ? synthesizeCyclicWindow(
      request.profile,
      binding,
      support.sourceStartSample,
      supportSamples,
    )
    : synthesizeChunked(
      (windowStart, windowSamples) => synthesizeAnalyticComplexIq({
        profile: request.profile,
        sampleRateHz: binding.nativeSampleRateHz,
        bandwidthHz: binding.signalBandwidthHz,
        sampleCount: windowSamples,
        startSampleIndex: windowStart,
      }),
      BigInt(support.sourceStartSample),
      supportSamples,
    );

  const operations: TxStreamOperation[] = [];
  let prepared = nativeWindow;
  if (binding.nativeCarrierOffsetHz !== 0) {
    prepared = translateCf32leCarrier({
      sourceBytes: prepared,
      sourceStartSample: support.sourceStartSample,
      sampleRateHz: binding.nativeSampleRateHz,
      sourceCarrierOffsetHz: binding.nativeCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    });
    operations.push({
      kind: 'frequency-translate',
      algorithm: 'complex-rotator-v1',
      sourceCarrierOffsetHz: binding.nativeCarrierOffsetHz,
      outputCarrierOffsetHz: 0,
    });
  }
  const bytes = resampleCf32leWindowedSinc({
    sourceBytes: prepared,
    sourceStartSample: support.sourceStartSample,
    outputStartSourceSampleNumerator: rational.numerator,
    outputStartSourceSampleDenominator: rational.denominator,
    sourceSampleRateHz: binding.nativeSampleRateHz,
    outputSampleRateHz: request.sampleRateHz,
    outputSampleCount: request.sampleCount,
  });
  operations.push({
    kind: 'resample',
    algorithm: IQ_RESAMPLER_ALGORITHM,
    sourceSampleRateHz: binding.nativeSampleRateHz,
    outputSampleRateHz: request.sampleRateHz,
    antiAliasCutoffHz: support.antiAliasCutoffHz,
    zeroCrossings: IQ_RESAMPLER_ZERO_CROSSINGS,
  });

  const artifactSha256 = artifactHashFor(request.profile);
  const translated = binding.nativeCarrierOffsetHz !== 0;
  return Object.freeze({
    bytes,
    payloadKind: 'derived-hardware-ready',
    boundaryPolicy: binding.replay === 'cyclic'
      ? 'cyclic-modular'
      : 'continuous-session-origin-zero-extended',
    qualification: artifactSha256 !== null
      ? 'derived-from-independently-verified-digital-baseband'
      : 'standards-derived-complex-baseband',
    canonicalArtifactSha256: artifactSha256,
    nativeSampleRateHz: binding.nativeSampleRateHz,
    sourceCarrierOffsetHz: binding.nativeCarrierOffsetHz,
    outputCarrierOffsetHz: translated ? 0 : binding.nativeCarrierOffsetHz,
    operations: Object.freeze(operations),
    disclosure,
  });
}

/**
 * Cyclic artifact replay with exact modular wrapping, chunked so no generator
 * call exceeds the per-call sample bound and no chunk crosses a period
 * boundary. Mirrors the measurement service's native-window algorithm on the
 * same public entry point.
 */
function synthesizeCyclicWindow(
  profile: SynthesizedSignalProfile,
  binding: NativeRateProfileBinding,
  sourceStartSample: number,
  sourceSampleCount: number,
): Uint8Array {
  if (binding.replay !== 'cyclic') {
    throw new RangeError('Cyclic window synthesis requires a cyclic binding');
  }
  validateNativeWindowGeometry(sourceStartSample, sourceSampleCount);
  const periodSamples = binding.nativePeriodSamples;
  const output = new Uint8Array(sourceSampleCount * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE);
  let generated = 0;
  while (generated < sourceSampleCount) {
    const wrappedStart = positiveModulo(sourceStartSample + generated, periodSamples);
    const chunkSamples = Math.min(
      MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
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
    output.set(chunk, generated * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE);
    generated += chunkSamples;
  }
  return output;
}

/**
 * Chunked generation for session-origin timelines (rate-flexible and
 * unbounded). Negative coordinates before the session origin are explicit
 * zero extension; positive time is unbounded. The generator callback renders
 * `sampleCount` samples at an absolute coordinate, so sub-window offsets are
 * exact and split==whole holds across every internal boundary.
 */
function synthesizeChunked(
  generateWindow: (startSampleIndex: number, sampleCount: number) => Uint8Array,
  startSample: bigint,
  sampleCount: number,
): Uint8Array {
  // Negative window starts are admitted: support before the session origin is
  // explicit zero extension (the loop below never calls the generator there).
  if (startSample < BigInt(Number.MIN_SAFE_INTEGER)
    || startSample + BigInt(sampleCount) - 1n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Tx stream window coordinate exceeds the safe integer range');
  }
  validateNativeWindowGeometry(Number(startSample), sampleCount);
  const output = new Uint8Array(sampleCount * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE);
  const start = Number(startSample);
  let generated = Math.max(0, start);
  const availableEnd = start + sampleCount;
  while (generated < availableEnd) {
    const chunkSamples = Math.min(MAX_ANALYTIC_COMPLEX_IQ_SAMPLES, availableEnd - generated);
    const chunk = generateWindow(generated, chunkSamples);
    if (chunk.byteLength !== chunkSamples * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE) {
      throw new Error('Tx stream generator returned a window with unexpected byte geometry');
    }
    output.set(chunk, (generated - start) * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE);
    generated += chunkSamples;
  }
  return output;
}

function validateNativeWindowGeometry(
  sourceStartSample: number,
  sourceSampleCount: number,
): void {
  if (!Number.isSafeInteger(sourceStartSample)
    || !Number.isSafeInteger(sourceSampleCount)
    || sourceSampleCount < 1
    || sourceSampleCount > TX_STREAM_MAX_DERIVED_SOURCE_SUPPORT_SAMPLES
    || !Number.isSafeInteger(sourceStartSample + sourceSampleCount - 1)) {
    throw new RangeError('Tx stream native source window exceeds the admitted geometry');
  }
}

function artifactHashFor(profile: SynthesizedSignalProfile): string | null {
  const descriptor = waveformDescriptor(profile);
  return descriptor.assetSha256 ?? null;
}

export function rationalNativeCoordinate(
  outputStartSample: bigint,
  nativeSampleRateHz: number,
  outputSampleRateHz: number,
): { numerator: bigint; denominator: bigint } {
  const numerator = outputStartSample * BigInt(nativeSampleRateHz);
  const denominator = BigInt(outputSampleRateHz);
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

/**
 * Fail-closed representability probe mirroring the measurement service's
 * 40-digit receipt bound, applied to stream coordinates before synthesis.
 */
export function assertRepresentableRational(
  numerator: bigint,
  denominator: bigint,
): void {
  const bound = 10n ** 40n;
  if (numerator >= bound || denominator >= bound) {
    throw new RangeError('Tx stream coordinate exceeds the 40-digit representability bound');
  }
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Tx stream native coordinate exceeds the safe integer range');
  }
}

function assertSafeCoordinate(
  startSample: bigint,
  nativeSampleRateHz: number,
  outputSampleRateHz: number,
): void {
  const rational = rationalNativeCoordinate(startSample, nativeSampleRateHz, outputSampleRateHz);
  assertRepresentableRational(rational.numerator, rational.denominator);
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
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
