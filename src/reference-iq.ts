import type { SynthesizedSignalProfile } from './contracts.js';
import { filterAndEncodeInterleavedSamples } from './complex-iq.js';

/**
 * Genuine single-carrier PSK/QAM reference waveforms.
 *
 * Each profile is a deterministic, seeded stream of unit-average-power
 * constellation symbols at a fixed 7 Msym/s symbol rate, root-raised-cosine
 * pulse-shaped (beta = 0.35, +-8 symbol span) and lightly dithered with seeded
 * complex AWGN at ~40 dB SNR. The output is a real transmit baseband: the same
 * blind constant-modulus (CMA) equalizer the Atomizer app runs on a capture
 * recovers the clean symbol constellation from it (Atom-Classifier
 * `src/embedding/recover.ts`; verified in reference-iq.test.ts).
 *
 * The generator is fully parametric in sampleRateHz so an operator can widen
 * the capture; the symbol rate stays at 7 MHz regardless. Symbols and noise are
 * both indexed by their absolute sample/symbol coordinate, so a streaming
 * capture that advances `startSampleIndex` evolves the same continuous signal
 * and a repeated capture at one coordinate is bit-identical.
 */

// PSK (QPSK, 8PSK) plus square QAM (16/64/256). BPSK is deliberately excluded:
// its constellation is one-dimensional, so a blind constant-modulus equalizer is
// under-constrained on it and cannot resolve a clean 2-point constellation the way
// it does for these — shipping it as a reference would only ever show a smear.
export const REFERENCE_COMPLEX_IQ_PROFILES = [
  'ref-qpsk', 'ref-8psk', 'ref-16qam', 'ref-64qam', 'ref-256qam',
] as const;
export type ReferenceComplexIqProfile = typeof REFERENCE_COMPLEX_IQ_PROFILES[number];

export const REFERENCE_SYMBOL_RATE_HZ = 7_000_000 as const;
export const REFERENCE_RRC_ROLLOFF = 0.35 as const;
export const REFERENCE_RRC_SPAN_SYMBOLS = 8 as const;
export const REFERENCE_SNR_DB = 40 as const;
export const DEFAULT_REFERENCE_IQ_SEED = 907 as const;

/**
 * Transmit scale applied after the unit-average-power signal is assembled. The
 * cf32le contract is unit-disk bounded, and a dense-QAM RRC envelope has a
 * high peak-to-average ratio, so the whole signal (symbols + noise together,
 * which preserves SNR) is scaled well inside the unit disk. The producer's
 * final packing clamp is then only a numerical safety net, essentially never
 * engaged, so the constellation geometry survives to the wire intact.
 */
const REFERENCE_TX_SCALE = 0.25;
const SYMBOL_INDEX_BIAS = 64;
const NOISE_INDEX_BIAS = 0x2000_0000;
const NOISE_LANE_A = 0x6e6f_6973;
const NOISE_LANE_B = 0x656e_6f69;

export interface ReferenceComplexIqSynthesisInput {
  readonly profile: ReferenceComplexIqProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
  readonly seed?: number;
}

export function isReferenceComplexIqProfile(
  profile: SynthesizedSignalProfile,
): profile is ReferenceComplexIqProfile {
  return REFERENCE_COMPLEX_IQ_PROFILES.some((candidate) => candidate === profile);
}

interface ConstellationPlan {
  readonly bitsPerSymbol: number;
  readonly lane: number;
  point(state: number): readonly [number, number];
}

/**
 * Produce a clean single-carrier reference envelope in interleaved cf32le,
 * reusing the shared bandwidth low-pass + unit-disk packing so it matches every
 * other complex-I/Q generator on the wire.
 */
export function synthesizeReferenceComplexIq(input: ReferenceComplexIqSynthesisInput): Uint8Array {
  const seed = input.seed ?? DEFAULT_REFERENCE_IQ_SEED;
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffff_ffff) {
    throw new RangeError('Reference complex-I/Q seed must be an integer from 1 through 0xffffffff');
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  const plan = constellationPlan(input.profile);
  const beta = REFERENCE_RRC_ROLLOFF;
  const span = REFERENCE_RRC_SPAN_SYMBOLS;
  const samplesPerSymbol = input.sampleRateHz / REFERENCE_SYMBOL_RATE_HZ;
  const pulseNorm = rootRaisedCosinePowerNormalization(beta, span);
  // Unit average signal power by construction, so the AWGN standard deviation
  // per component is fixed for a target SNR and stays continuous while
  // streaming (it never depends on the block).
  const noiseStdDev = Math.sqrt(0.5 * 10 ** (-REFERENCE_SNR_DB / 10));

  const analytic = new Float64Array(input.sampleCount * 2);
  for (let index = 0; index < input.sampleCount; index += 1) {
    const absoluteSample = startSampleIndex + index;
    const symbolCoordinate = absoluteSample / samplesPerSymbol;
    const centerSymbol = Math.floor(symbolCoordinate);
    let inPhase = 0;
    let quadrature = 0;
    for (let symbolIndex = centerSymbol - span; symbolIndex <= centerSymbol + span + 1; symbolIndex += 1) {
      const tau = symbolCoordinate - symbolIndex;
      if (Math.abs(tau) > span) continue;
      const weight = pulseNorm * rootRaisedCosine(tau, beta);
      const [symbolInPhase, symbolQuadrature] = plan.point(
        hash32(seed, symbolIndex + SYMBOL_INDEX_BIAS, plan.lane) & ((1 << plan.bitsPerSymbol) - 1),
      );
      inPhase += weight * symbolInPhase;
      quadrature += weight * symbolQuadrature;
    }
    const [noiseInPhase, noiseQuadrature] = seededComplexGaussian(seed, absoluteSample);
    analytic[index * 2] = REFERENCE_TX_SCALE * (inPhase + noiseStdDev * noiseInPhase);
    analytic[index * 2 + 1] = REFERENCE_TX_SCALE * (quadrature + noiseStdDev * noiseQuadrature);
  }

  return filterAndEncodeInterleavedSamples(analytic, {
    sampleRateHz: input.sampleRateHz,
    bandwidthHz: input.bandwidthHz,
    sampleCount: input.sampleCount,
  });
}

function constellationPlan(profile: ReferenceComplexIqProfile): ConstellationPlan {
  switch (profile) {
    case 'ref-qpsk':
      return {
        bitsPerSymbol: 2, lane: 0x7170_736b,
        point: (state) => [(state & 1 ? -1 : 1) * Math.SQRT1_2, (state & 2 ? -1 : 1) * Math.SQRT1_2],
      };
    case 'ref-8psk':
      return {
        bitsPerSymbol: 3, lane: 0x3870_736b,
        point: (state) => {
          const angle = 2 * Math.PI * state / 8;
          return [Math.cos(angle), Math.sin(angle)];
        },
      };
    case 'ref-16qam':
      return squareQamPlan(4, 0x3136_716d);
    case 'ref-64qam':
      return squareQamPlan(8, 0x3634_716d);
    case 'ref-256qam':
      return squareQamPlan(16, 0x3235_716d);
  }
}

/** Gray-free natural square M-QAM at unit average power (levels {+-1,+-3,...}). */
function squareQamPlan(levelsPerAxis: number, lane: number): ConstellationPlan {
  const bitsPerAxis = Math.round(Math.log2(levelsPerAxis));
  const axisMask = levelsPerAxis - 1;
  // E[level^2] over {+-1,...,+-(L-1)} is (L^2-1)/3 per axis; unit total power
  // divides by sqrt(2 * that).
  const scale = 1 / Math.sqrt(2 * (levelsPerAxis * levelsPerAxis - 1) / 3);
  const level = (index: number): number => 2 * index - (levelsPerAxis - 1);
  return {
    bitsPerSymbol: bitsPerAxis * 2,
    lane,
    point: (state) => [
      scale * level(state & axisMask),
      scale * level((state >> bitsPerAxis) & axisMask),
    ],
  };
}

/**
 * Root-raised-cosine impulse response in symbol-normalized time (T = 1), with
 * the two removable singularities handled analytically.
 */
function rootRaisedCosine(tau: number, beta: number): number {
  if (Math.abs(tau) < 1e-9) return 1 - beta + 4 * beta / Math.PI;
  const fourBetaTau = 4 * beta * tau;
  if (Math.abs(Math.abs(fourBetaTau) - 1) < 1e-9) {
    return (beta / Math.SQRT2) * (
      (1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * beta))
      + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * beta))
    );
  }
  const numerator = Math.sin(Math.PI * tau * (1 - beta)) + fourBetaTau * Math.cos(Math.PI * tau * (1 + beta));
  const denominator = Math.PI * tau * (1 - fourBetaTau * fourBetaTau);
  return numerator / denominator;
}

/**
 * Scale factor that makes the pulse-shaped signal unit average power for a
 * unit-average-power symbol stream: the shaped power is sum_k h(tau - k)^2,
 * which for a near-Nyquist RRC is nearly flat in the fractional offset tau, so
 * averaging over a few phases pins it accurately.
 */
function rootRaisedCosinePowerNormalization(beta: number, span: number): number {
  const phases = [0, 0.2, 0.4, 0.6, 0.8];
  let total = 0;
  for (const phase of phases) {
    let power = 0;
    for (let k = -span - 1; k <= span + 1; k += 1) {
      const tau = phase - k;
      if (Math.abs(tau) > span) continue;
      const h = rootRaisedCosine(tau, beta);
      power += h * h;
    }
    total += power;
  }
  return 1 / Math.sqrt(total / phases.length);
}

/** Seeded unit-variance complex Gaussian at an absolute sample coordinate. */
function seededComplexGaussian(seed: number, absoluteSample: number): readonly [number, number] {
  const index = absoluteSample + NOISE_INDEX_BIAS;
  const uniformA = (hash32(seed, index, NOISE_LANE_A) + 0.5) / 0x1_0000_0000;
  const uniformB = (hash32(seed, index, NOISE_LANE_B) + 0.5) / 0x1_0000_0000;
  const radius = Math.sqrt(-2 * Math.log(uniformA));
  const angle = 2 * Math.PI * uniformB;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

/**
 * Counter-based integer hash (identical construction to the GERAN generator):
 * a stateless, streaming-safe PRNG keyed by (seed, absolute index, lane).
 */
function hash32(seed: number, index: number, lane: number): number {
  const low = index >>> 0;
  const high = Math.floor(index / 0x1_0000_0000) >>> 0;
  let value = (seed ^ lane ^ Math.imul(low, 0x9e37_79b1) ^ Math.imul(high, 0x85eb_ca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}
