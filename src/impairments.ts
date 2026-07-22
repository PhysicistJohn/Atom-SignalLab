/**
 * Receiver / channel impairment model for complex I/Q — the real-world variation
 * a deployed receiver adds on top of the clean analytic envelope.
 *
 * This is ADDITIVE: the frozen `synthesizeAnalyticComplexIq` generators and their
 * goldens are untouched. `synthesizeImpairedComplexIq` post-processes the clean
 * cf32le bytes through a seeded impairment chain, so a caller that wants realistic
 * I/Q (for training a classifier, or exercising a receiver) can get it, while the
 * default clean path stays deterministic and byte-frozen.
 *
 * Impairments modelled (superset of the scalar path's AWGN + Rayleigh):
 *   multipath (tapped delay) · carrier frequency offset · phase noise (Wiener) ·
 *   IQ gain/phase imbalance · DC offset · PA soft-saturation · AWGN (target SNR).
 * The chain is fully seeded, so a given (input, impairments, seed) is reproducible.
 */

import { decodeCf32leChannels } from '@atomos/dsp';
import type { ReceiverImpairmentPreset } from './contracts.js';
import {
  ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE,
  synthesizeAnalyticComplexIq,
  type AnalyticComplexIqSynthesisInput,
} from './complex-iq.js';

export interface MultipathTap {
  /** integer sample delay (>= 1) */
  readonly delay: number;
  readonly gainInPhase: number;
  readonly gainQuadrature: number;
}

export interface ReceiverImpairments {
  /** additive white Gaussian noise target SNR in dB; omit for noiseless */
  readonly snrDb?: number;
  /** residual carrier frequency offset in cycles/sample */
  readonly carrierFrequencyOffset?: number;
  /** per-sample Wiener phase-noise standard deviation (radians) */
  readonly phaseNoiseStd?: number;
  /** IQ gain imbalance (fractional, applied +g to I and -g to Q) */
  readonly iqGainImbalance?: number;
  /** IQ quadrature phase error (radians) */
  readonly iqPhaseImbalance?: number;
  /** DC offset added to I / Q */
  readonly dcInPhase?: number;
  readonly dcQuadrature?: number;
  /** multipath taps (a direct path of unit gain at delay 0 is implicit) */
  readonly multipath?: readonly MultipathTap[];
  /** PA soft-saturation knee as a fraction of peak (0..1]; omit for linear */
  readonly paSaturation?: number;
}

export const DEFAULT_IMPAIRMENT_SEED = 0x51_9a_1b_07;

/**
 * Resolve the Studio's compact, reproducible receiver scenarios into the
 * composable numeric chain. Values are intentionally material rather than
 * pathological: each effect is visible to analysis while the composite case
 * remains a plausible stressed receiver instead of destroying the waveform.
 */
export function receiverImpairmentsForPreset(
  preset: ReceiverImpairmentPreset,
  sampleRateHz: number,
): ReceiverImpairments {
  const carrierFrequencyOffset = 2_500 / sampleRateHz;
  switch (preset) {
    case 'clean': return {};
    case 'awgn': return { snrDb: 18 };
    case 'multipath': return { multipath: [
      { delay: 3, gainInPhase: 0.42, gainQuadrature: 0.16 },
      { delay: 11, gainInPhase: -0.2, gainQuadrature: 0.11 },
    ] };
    case 'carrier-offset': return { carrierFrequencyOffset };
    case 'phase-noise': return { phaseNoiseStd: 0.004 };
    case 'iq-imbalance': return { iqGainImbalance: 0.08, iqPhaseImbalance: 6 * Math.PI / 180 };
    case 'dc-offset': return { dcInPhase: 0.08, dcQuadrature: -0.05 };
    case 'pa-compression': return { paSaturation: 0.55 };
    case 'composite': return {
      snrDb: 22,
      carrierFrequencyOffset: carrierFrequencyOffset * 0.4,
      phaseNoiseStd: 0.0015,
      iqGainImbalance: 0.035,
      iqPhaseImbalance: 2.5 * Math.PI / 180,
      dcInPhase: 0.025,
      dcQuadrature: -0.018,
      multipath: [
        { delay: 3, gainInPhase: 0.24, gainQuadrature: 0.08 },
        { delay: 9, gainInPhase: -0.1, gainQuadrature: 0.06 },
      ],
      paSaturation: 0.72,
    };
  }
}

/** Deterministic PRNG (mulberry32) — no global RNG, fully reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianSource(rand: () => number): () => number {
  return () => {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

function decodeCf32le(bytes: Uint8Array): { re: Float64Array; im: Float64Array } {
  const { real, imaginary } = decodeCf32leChannels(bytes);
  return { re: real, im: imaginary };
}

function encodeCf32le(re: Float64Array, im: Float64Array): Uint8Array {
  const n = re.length;
  // renormalise to fit the unit disk the wire format expects (the classifier
  // amplitude-normalises anyway, so absolute scale carries no information).
  let peak = 0;
  for (let k = 0; k < n; k++) peak = Math.max(peak, Math.hypot(re[k]!, im[k]!));
  const scale = peak > 0 ? 0.98 / peak : 1;
  const bytes = new Uint8Array(n * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer);
  for (let k = 0; k < n; k++) {
    view.setFloat32(k * 8, Math.fround(re[k]! * scale), true);
    view.setFloat32(k * 8 + 4, Math.fround(im[k]! * scale), true);
  }
  return bytes;
}

/**
 * Apply the seeded impairment chain to numeric I/Q channels in place-safe copies.
 * Order: multipath → CFO + phase noise → IQ imbalance → DC → PA saturation → AWGN.
 */
export function applyReceiverImpairments(
  inRe: Float64Array,
  inIm: Float64Array,
  impairments: ReceiverImpairments,
  seed: number = DEFAULT_IMPAIRMENT_SEED,
): { re: Float64Array; im: Float64Array } {
  const n = inRe.length;
  const rand = mulberry32(seed >>> 0);
  const gauss = gaussianSource(rand);

  let re = Float64Array.from(inRe);
  let im = Float64Array.from(inIm);

  // multipath: tapped delay line (implicit unit direct path at delay 0)
  if (impairments.multipath && impairments.multipath.length > 0) {
    const outRe = Float64Array.from(re);
    const outIm = Float64Array.from(im);
    for (const tap of impairments.multipath) {
      const d = Math.max(1, Math.floor(tap.delay));
      for (let k = d; k < n; k++) {
        outRe[k]! += tap.gainInPhase * re[k - d]! - tap.gainQuadrature * im[k - d]!;
        outIm[k]! += tap.gainInPhase * im[k - d]! + tap.gainQuadrature * re[k - d]!;
      }
    }
    re = outRe;
    im = outIm;
  }

  // carrier frequency offset + Wiener phase noise
  const cfo = impairments.carrierFrequencyOffset ?? 0;
  const pnStd = impairments.phaseNoiseStd ?? 0;
  if (cfo !== 0 || pnStd > 0) {
    let walk = 0;
    for (let k = 0; k < n; k++) {
      const angle = 2 * Math.PI * cfo * k + walk;
      walk += pnStd > 0 ? gauss() * pnStd : 0;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const r = re[k]! * c - im[k]! * s;
      const q = re[k]! * s + im[k]! * c;
      re[k] = r;
      im[k] = q;
    }
  }

  // IQ gain + quadrature phase imbalance
  const g = impairments.iqGainImbalance ?? 0;
  const phi = impairments.iqPhaseImbalance ?? 0;
  if (g !== 0 || phi !== 0) {
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    for (let k = 0; k < n; k++) {
      const i = (1 + g) * re[k]!;
      const q = (1 - g) * (im[k]! * cosPhi + re[k]! * sinPhi);
      re[k] = i;
      im[k] = q;
    }
  }

  // DC offset
  const dcI = impairments.dcInPhase ?? 0;
  const dcQ = impairments.dcQuadrature ?? 0;
  if (dcI !== 0 || dcQ !== 0) {
    for (let k = 0; k < n; k++) {
      re[k]! += dcI;
      im[k]! += dcQ;
    }
  }

  // PA soft-saturation (AM/AM tanh compression above the knee)
  if (impairments.paSaturation !== undefined && impairments.paSaturation > 0) {
    let peak = 0;
    for (let k = 0; k < n; k++) peak = Math.max(peak, Math.hypot(re[k]!, im[k]!));
    const knee = impairments.paSaturation * (peak || 1);
    for (let k = 0; k < n; k++) {
      const mag = Math.hypot(re[k]!, im[k]!);
      if (mag > 1e-12) {
        const compressed = knee * Math.tanh(mag / knee);
        const ratio = compressed / mag;
        re[k]! *= ratio;
        im[k]! *= ratio;
      }
    }
  }

  // AWGN at the requested SNR (measured on the current signal power)
  if (impairments.snrDb !== undefined) {
    let power = 0;
    for (let k = 0; k < n; k++) power += re[k]! * re[k]! + im[k]! * im[k]!;
    power = power / n + 1e-30;
    const noise = Math.sqrt(power / 10 ** (impairments.snrDb / 10) / 2);
    for (let k = 0; k < n; k++) {
      re[k]! += gauss() * noise;
      im[k]! += gauss() * noise;
    }
  }

  return { re, im };
}

/**
 * Synthesize a clean analytic complex-I/Q buffer, then apply the seeded receiver
 * impairment chain. Returns interleaved cf32le bytes, exactly like the clean
 * generator, so it is a drop-in for any consumer of `synthesizeAnalyticComplexIq`.
 */
export function synthesizeImpairedComplexIq(
  input: AnalyticComplexIqSynthesisInput,
  impairments: ReceiverImpairments,
  seed: number = DEFAULT_IMPAIRMENT_SEED,
): Uint8Array {
  const clean = synthesizeAnalyticComplexIq(input);
  const { re, im } = decodeCf32le(clean);
  const impaired = applyReceiverImpairments(re, im, impairments, seed);
  return encodeCf32le(impaired.re, impaired.im);
}
