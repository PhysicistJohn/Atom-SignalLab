import { describe, expect, it } from 'vitest';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';
import {
  applyReceiverImpairments,
  synthesizeImpairedComplexIq,
  type ReceiverImpairments,
} from './impairments.js';

const INPUT = { profile: 'fm', sampleRateHz: 2_000_000, bandwidthHz: 300_000, sampleCount: 2048 } as const;
const IMP: ReceiverImpairments = {
  snrDb: 20,
  carrierFrequencyOffset: 0.002,
  phaseNoiseStd: 0.01,
  iqGainImbalance: 0.05,
  iqPhaseImbalance: 0.06,
  dcInPhase: 0.02,
  multipath: [{ delay: 3, gainInPhase: 0.3, gainQuadrature: 0.1 }],
};

function reOf(bytes: Uint8Array): Float32Array {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.byteLength / 8;
  const re = new Float32Array(n);
  for (let k = 0; k < n; k++) re[k] = v.getFloat32(k * 8, true);
  return re;
}

describe('receiver impairment model', () => {
  it('produces cf32le of the same geometry as the clean generator', () => {
    const clean = synthesizeAnalyticComplexIq(INPUT);
    const impaired = synthesizeImpairedComplexIq(INPUT, IMP, 123);
    expect(impaired.byteLength).toBe(clean.byteLength);
    expect(impaired.byteLength).toBe(INPUT.sampleCount * 8);
  });

  it('actually changes the signal', () => {
    const clean = reOf(synthesizeAnalyticComplexIq(INPUT));
    const impaired = reOf(synthesizeImpairedComplexIq(INPUT, IMP, 123));
    let diff = 0;
    for (let k = 0; k < clean.length; k++) diff = Math.max(diff, Math.abs(clean[k]! - impaired[k]!));
    expect(diff).toBeGreaterThan(0.05);
  });

  it('is deterministic for a given seed and varies with the seed', () => {
    const a = synthesizeImpairedComplexIq(INPUT, IMP, 42);
    const b = synthesizeImpairedComplexIq(INPUT, IMP, 42);
    const c = synthesizeImpairedComplexIq(INPUT, IMP, 43);
    expect(Array.from(a)).toEqual(Array.from(b)); // same seed -> identical bytes
    expect(Array.from(a)).not.toEqual(Array.from(c)); // different seed -> different noise
  });

  it('keeps samples inside the unit disk (valid wire format)', () => {
    const bytes = synthesizeImpairedComplexIq(INPUT, IMP, 7);
    const v = new DataView(bytes.buffer);
    let maxMag = 0;
    for (let k = 0; k < bytes.byteLength / 8; k++) {
      maxMag = Math.max(maxMag, Math.hypot(v.getFloat32(k * 8, true), v.getFloat32(k * 8 + 4, true)));
    }
    expect(maxMag).toBeLessThanOrEqual(1);
  });

  it('does not perturb the clean generator (goldens preserved)', () => {
    // synthesizeAnalyticComplexIq must return byte-identical output before and
    // after an impaired call — the impaired path only reads it.
    const before = Array.from(synthesizeAnalyticComplexIq(INPUT));
    synthesizeImpairedComplexIq(INPUT, IMP, 99);
    const after = Array.from(synthesizeAnalyticComplexIq(INPUT));
    expect(after).toEqual(before);
  });

  it('adds AWGN that scales with SNR (lower SNR -> more residual)', () => {
    const clean = reOf(synthesizeAnalyticComplexIq(INPUT));
    const rms = (imp: ReceiverImpairments) => {
      const x = reOf(synthesizeImpairedComplexIq(INPUT, imp, 5));
      let s = 0;
      for (let k = 0; k < x.length; k++) s += (x[k]! - clean[k]!) ** 2;
      return Math.sqrt(s / x.length);
    };
    expect(rms({ snrDb: 5 })).toBeGreaterThan(rms({ snrDb: 30 }));
  });
});
