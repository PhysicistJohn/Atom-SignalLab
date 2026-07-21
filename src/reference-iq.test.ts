import { describe, expect, it } from 'vitest';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';
import {
  REFERENCE_COMPLEX_IQ_PROFILES,
  isReferenceComplexIqProfile,
  synthesizeReferenceComplexIq,
} from './reference-iq.js';
// Verify against the SAME blind recovery the Atomizer app runs on a capture
// (Atom-Classifier `src/embedding/recover.ts`) — no known-order / decision-directed
// shortcut. If a reference resolves here, it resolves the same way in the app.
import { recoverConstellation } from '../../Atom-Classifier/src/embedding/recover.js';

const SAMPLE_RATE_HZ = 56_000_000;
const BANDWIDTH_HZ = 56_000_000;
const SAMPLE_COUNT = 65_536;

function decodeCf32le(bytes: Uint8Array): { re: Float64Array; im: Float64Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.byteLength / 8;
  const re = new Float64Array(count);
  const im = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    re[index] = view.getFloat32(index * 8, true);
    im[index] = view.getFloat32(index * 8 + 4, true);
  }
  return { re, im };
}

describe('single-carrier reference waveform recovery', () => {
  it('routes every reference profile through the reference generator', () => {
    for (const profile of REFERENCE_COMPLEX_IQ_PROFILES) {
      expect(isReferenceComplexIqProfile(profile)).toBe(true);
    }
    expect(isReferenceComplexIqProfile('cw')).toBe(false);
    expect(isReferenceComplexIqProfile('nr-fr1-tm1.1')).toBe(false);
  });

  it('recovers a clean constellation from each reference profile with the app blind CMA equalizer', { timeout: 60_000 }, () => {
    for (const profile of REFERENCE_COMPLEX_IQ_PROFILES) {
      const bytes = synthesizeAnalyticComplexIq({
        profile,
        sampleRateHz: SAMPLE_RATE_HZ,
        bandwidthHz: BANDWIDTH_HZ,
        sampleCount: SAMPLE_COUNT,
      });
      // The dispatch and the direct generator must agree byte-for-byte.
      expect(bytes).toEqual(synthesizeReferenceComplexIq({
        profile,
        sampleRateHz: SAMPLE_RATE_HZ,
        bandwidthHz: BANDWIDTH_HZ,
        sampleCount: SAMPLE_COUNT,
        seed: 907,
      }));

      // Blind: no symbol rate, no modulation order — exactly what the app knows.
      const { re, im } = decodeCf32le(bytes);
      const recovered = recoverConstellation(re, im);

      expect(recovered.symbolsRe.length, `${profile} symbol count`).toBeGreaterThan(1_000);
      expect(recovered.residualIsi, `${profile} residual ISI`).toBeLessThan(0.22);
      expect(recovered.snrDb, `${profile} recovered SNR`).toBeGreaterThan(10);
    }
  });
});
