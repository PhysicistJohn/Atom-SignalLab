import {
  SYNTHESIZED_SIGNAL_PROFILES,
  synthesizedSignalProfileSchema,
  type SynthesizedSignalProfile,
} from './contracts.js';
import {
  isGeranComplexIqProfile,
  synthesizeGeranComplexIq,
} from './geran-iq.js';
import {
  isStandardsEngineeringComplexIqProfile,
  synthesizeStandardsEngineeringComplexIq,
} from './ofdm-iq.js';
import {
  isBluetoothAnalyticIqProfile,
  synthesizeBluetoothAnalyticSamples,
} from './bluetooth-iq.js';
import {
  DEFAULT_REFERENCE_IQ_SEED,
  isReferenceComplexIqProfile,
  synthesizeReferenceComplexIq,
} from './reference-iq.js';

export const LAB_ANALYTIC_COMPLEX_IQ_PROFILES = ['cw', 'am', 'fm'] as const;
export type LabAnalyticComplexIqProfile = typeof LAB_ANALYTIC_COMPLEX_IQ_PROFILES[number];

/** Every profile in the closed catalog has an installed deterministic analytic
 * complex-envelope generator. The standards-labelled members remain
 * engineering projections; membership is never a conformance claim. */
export const ANALYTIC_COMPLEX_IQ_PROFILES = SYNTHESIZED_SIGNAL_PROFILES;
export type AnalyticComplexIqProfile = typeof ANALYTIC_COMPLEX_IQ_PROFILES[number];
export type ComplexIqGeneratorBasis = 'analytic-laboratory' | 'standards-derived-engineering-projection';

export function complexIqGeneratorBasis(profile: SynthesizedSignalProfile): ComplexIqGeneratorBasis {
  const admitted = synthesizedSignalProfileSchema.parse(profile);
  // The single-carrier references are deterministic analytic lab waveforms (like
  // cw/am/fm), not standards-derived engineering projections. They carry the
  // 'visual' catalog qualification, so their measurements must report the
  // 'analytic-complex-baseband' basis the admission layer expects for a visual
  // source (see expectedMeasurementQualification in the Atomizer instrument
  // manager) — otherwise a reference I/Q capture is rejected as a qualification
  // mismatch.
  const isAnalyticLab = LAB_ANALYTIC_COMPLEX_IQ_PROFILES.some((candidate) => candidate === admitted)
    || isReferenceComplexIqProfile(admitted);
  return isAnalyticLab ? 'analytic-laboratory' : 'standards-derived-engineering-projection';
}

/** Hard producer bounds, shared with the bridge contract to prevent drift. */
export const MAX_ANALYTIC_COMPLEX_IQ_SAMPLES = 65_536 as const;
export const ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE = 8 as const;
export const MAX_ANALYTIC_COMPLEX_IQ_BYTES = MAX_ANALYTIC_COMPLEX_IQ_SAMPLES * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE;
export const MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ = 1_000_000 as const;
export const MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ = 245_760_000 as const;
export const MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ = 1_000 as const;
export const MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ = 245_760_000 as const;

export const ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ = 25_000 as const;
export const ANALYTIC_IQ_AM_MODULATION_INDEX = 0.72 as const;
export const ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ = 25_000 as const;
export const ANALYTIC_IQ_FM_DEVIATION_HZ = 75_000 as const;
export const DEFAULT_STANDARDS_ENGINEERING_COMPLEX_IQ_SEED = 407 as const;

export interface AnalyticComplexIqSynthesisInput {
  readonly profile: SynthesizedSignalProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  /**
   * Absolute sample coordinate of the first output sample. Successive
   * captures pass their running cursor here so complex-I/Q evolves in time
   * exactly like every other acquisition kind (a repeated capture with the
   * same coordinate remains bit-identical). Defaults to 0.
   */
  readonly startSampleIndex?: number;
}

/**
 * Produce a clean, normalized complex envelope in interleaved cf32le.
 *
 * `bandwidthHz` is the two-sided steady-state -3 dB bandwidth of a causal,
 * real-coefficient, first-order low-pass: its edges are at
 * `+-bandwidthHz / 2` relative to the requested center. The recurrence is
 * initialized from the first unfiltered sample, so constant envelopes (CW)
 * remain exact and no synthetic zero-fill transient is introduced. Each
 * output is a convex combination of the current input and previous output,
 * which keeps the normalized analytic envelope inside the unit disk using
 * constant memory and O(sampleCount) work.
 *
 * CW, AM, and FM are closed-form laboratory signals. Every standards-labelled
 * catalog entry dispatches to an explicitly non-conformance engineering
 * projection: GERAN burst/modulation synthesis, a bounded LTE/NR/WLAN
 * representative-grid projection, or Bluetooth GFSK/FHSS-style synthesis.
 * Those outputs are neither packet-decodable nor standards test vectors.
 */
export function synthesizeAnalyticComplexIq(input: AnalyticComplexIqSynthesisInput): Uint8Array {
  const profile = analyticComplexIqProfile(input.profile);
  if (!Number.isSafeInteger(input.sampleRateHz)
    || input.sampleRateHz < MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ
    || input.sampleRateHz > MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ) {
    throw new RangeError(`Analytic complex-I/Q sample rate must be a safe integer from ${MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ} through ${MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ} Hz`);
  }
  if (!Number.isSafeInteger(input.bandwidthHz)
    || input.bandwidthHz < MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ
    || input.bandwidthHz > MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ) {
    throw new RangeError(`Analytic complex-I/Q bandwidth must be a safe integer from ${MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ} through ${MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ} Hz`);
  }
  if (input.bandwidthHz > input.sampleRateHz) {
    throw new RangeError('Analytic complex-I/Q bandwidth may not exceed its sample rate');
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_ANALYTIC_COMPLEX_IQ_SAMPLES) {
    throw new RangeError(`Analytic complex-I/Q sample count must be a safe integer from 1 through ${MAX_ANALYTIC_COMPLEX_IQ_SAMPLES}`);
  }
  const byteLength = input.sampleCount * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE;
  if (!Number.isSafeInteger(byteLength) || byteLength > MAX_ANALYTIC_COMPLEX_IQ_BYTES) {
    throw new RangeError(`Analytic complex-I/Q payload may not exceed ${MAX_ANALYTIC_COMPLEX_IQ_BYTES} bytes`);
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex) || startSampleIndex < 0
    || !Number.isSafeInteger(startSampleIndex + input.sampleCount)) {
    throw new RangeError('Analytic complex-I/Q start sample index must be a non-negative safe integer');
  }

  if (isGeranComplexIqProfile(profile)) {
    return synthesizeGeranComplexIq({
      ...input,
      profile,
      seed: DEFAULT_STANDARDS_ENGINEERING_COMPLEX_IQ_SEED,
      startSampleIndex,
    });
  }
  if (isStandardsEngineeringComplexIqProfile(profile)) {
    return synthesizeStandardsEngineeringComplexIq({ ...input, profile, startSample: startSampleIndex });
  }
  if (isBluetoothAnalyticIqProfile(profile)) {
    const analytic = synthesizeBluetoothAnalyticSamples({
      profile,
      sampleRateHz: input.sampleRateHz,
      sampleCount: input.sampleCount,
      seed: DEFAULT_STANDARDS_ENGINEERING_COMPLEX_IQ_SEED,
      startSampleIndex,
    });
    return filterAndEncodeInterleavedSamples(analytic, input);
  }
  if (isReferenceComplexIqProfile(profile)) {
    return synthesizeReferenceComplexIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
      seed: DEFAULT_REFERENCE_IQ_SEED,
    });
  }
  if (!isLabAnalyticComplexIqProfile(profile)) {
    throw new Error(`Closed complex-I/Q profile ${profile satisfies never} has no installed generator`);
  }

  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const feedForward = lowPassFeedForwardCoefficient(input.bandwidthHz, input.sampleRateHz);
  let previousInPhase = 0;
  let previousQuadrature = 0;
  for (let index = 0; index < input.sampleCount; index += 1) {
    const timeSeconds = (startSampleIndex + index) / input.sampleRateHz;
    const [rawInPhase, rawQuadrature] = analyticSample(profile, timeSeconds);
    const inPhase = index === 0
      ? rawInPhase
      : previousInPhase + feedForward * (rawInPhase - previousInPhase);
    const quadrature = index === 0
      ? rawQuadrature
      : previousQuadrature + feedForward * (rawQuadrature - previousQuadrature);
    previousInPhase = inPhase;
    previousQuadrature = quadrature;
    writeUnitBoundedCf32le(view, index * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE, inPhase, quadrature);
  }
  return bytes;
}

export function isAnalyticComplexIqProfile(profile: SynthesizedSignalProfile): profile is AnalyticComplexIqProfile {
  return ANALYTIC_COMPLEX_IQ_PROFILES.some((candidate) => candidate === profile);
}

export function isLabAnalyticComplexIqProfile(
  profile: SynthesizedSignalProfile,
): profile is LabAnalyticComplexIqProfile {
  return LAB_ANALYTIC_COMPLEX_IQ_PROFILES.some((candidate) => candidate === profile);
}

function analyticComplexIqProfile(value: SynthesizedSignalProfile): AnalyticComplexIqProfile {
  const profile = synthesizedSignalProfileSchema.parse(value);
  if (!isAnalyticComplexIqProfile(profile)) {
    throw new RangeError(`${profile} has no truthful complex-I/Q generator installed`);
  }
  return profile;
}

function analyticSample(profile: LabAnalyticComplexIqProfile, timeSeconds: number): readonly [number, number] {
  switch (profile) {
    case 'cw':
      return [1, 0];
    case 'am': {
      // DSB full-carrier AM, normalized so its maximum envelope is exactly 1.
      const message = Math.cos(2 * Math.PI * ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ * timeSeconds);
      return [(1 + ANALYTIC_IQ_AM_MODULATION_INDEX * message) / (1 + ANALYTIC_IQ_AM_MODULATION_INDEX), 0];
    }
    case 'fm': {
      // The selected catalog profile has beta = deviation / modulation rate = 3.
      const modulationIndex = ANALYTIC_IQ_FM_DEVIATION_HZ / ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ;
      const phase = modulationIndex * Math.sin(2 * Math.PI * ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ * timeSeconds);
      return [Math.cos(phase), Math.sin(phase)];
    }
  }
}

export function filterAndEncodeInterleavedSamples(
  analytic: Float32Array | Float64Array,
  input: Pick<AnalyticComplexIqSynthesisInput, 'sampleRateHz' | 'bandwidthHz' | 'sampleCount'>,
): Uint8Array {
  if (analytic.length !== input.sampleCount * 2) {
    throw new Error('Complex-I/Q engineering generator returned invalid interleaved sample geometry');
  }
  const bytes = new Uint8Array(input.sampleCount * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const feedForward = lowPassFeedForwardCoefficient(input.bandwidthHz, input.sampleRateHz);
  let previousInPhase = 0;
  let previousQuadrature = 0;
  for (let index = 0; index < input.sampleCount; index += 1) {
    const rawInPhase = analytic[index * 2]!;
    const rawQuadrature = analytic[index * 2 + 1]!;
    const inPhase = index === 0
      ? rawInPhase
      : previousInPhase + feedForward * (rawInPhase - previousInPhase);
    const quadrature = index === 0
      ? rawQuadrature
      : previousQuadrature + feedForward * (rawQuadrature - previousQuadrature);
    previousInPhase = inPhase;
    previousQuadrature = quadrature;
    writeUnitBoundedCf32le(view, index * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE, inPhase, quadrature);
  }
  return bytes;
}

/**
 * Feed-forward coefficient for y[n] = y[n-1] + alpha * (x[n] - y[n-1]).
 *
 * Solving the exact discrete-time response for -3 dB at
 * omega = pi * bandwidth / sampleRate yields the stable form below. It avoids
 * subtracting nearly equal values at the admitted 1 kHz / 245.76 Msps corner.
 * The admitted bandwidth is never greater than the sample rate, so alpha is
 * finite and strictly between zero and one.
 */
function lowPassFeedForwardCoefficient(bandwidthHz: number, sampleRateHz: number): number {
  const sineHalfEdge = Math.sin(Math.PI * bandwidthHz / (2 * sampleRateHz));
  return 2 * sineHalfEdge / (Math.sqrt(1 + sineHalfEdge * sineHalfEdge) + sineHalfEdge);
}

function writeUnitBoundedCf32le(
  view: DataView,
  byteOffset: number,
  inPhase: number,
  quadrature: number,
): void {
  let boundedInPhase = Math.fround(inPhase);
  let boundedQuadrature = Math.fround(quadrature);
  const magnitudeSquared = boundedInPhase * boundedInPhase + boundedQuadrature * boundedQuadrature;
  if (magnitudeSquared > 1) {
    // Leave one float32 epsilon of headroom so component rounding cannot push
    // a mathematically unit-bounded sample outside the unit disk on the wire.
    const scale = (1 - 2 ** -23) / Math.sqrt(magnitudeSquared);
    boundedInPhase = Math.fround(boundedInPhase * scale);
    boundedQuadrature = Math.fround(boundedQuadrature * scale);
  }
  view.setFloat32(byteOffset, boundedInPhase, true);
  view.setFloat32(byteOffset + 4, boundedQuadrature, true);
}
