import { describe, expect, it } from 'vitest';

import {
  BROADCAST_CORPUS_BANDWIDTH_HZ,
  BROADCAST_CORPUS_SAMPLE_RATE_HZ,
  broadcastCorpusSampleAt,
  planBroadcastCorpusRow,
  synthesizeBroadcastCorpusContentIq,
} from './broadcast-corpus-iq.js';

const FS = BROADCAST_CORPUS_SAMPLE_RATE_HZ;

function synthesize(profile: 'fm-broadcast-mpx' | 'am-voice', sampleCount: number,
                    startSampleIndex = 0, contentSeed = 20260802, contentRowIndex = 0) {
  return synthesizeBroadcastCorpusContentIq({
    profile,
    sampleRateHz: FS,
    bandwidthHz: BROADCAST_CORPUS_BANDWIDTH_HZ[profile],
    sampleCount,
    startSampleIndex,
    contentSeed,
    contentRowIndex,
  });
}

function decode(bytes: Uint8Array): Array<[number, number]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Array<[number, number]> = [];
  for (let index = 0; index < bytes.length; index += 8) {
    out.push([view.getFloat32(index, true), view.getFloat32(index + 4, true)]);
  }
  return out;
}

describe('broadcast corpus synthesis', () => {
  it('matches the independent closed-form oracle sample-for-sample', () => {
    for (const profile of ['fm-broadcast-mpx', 'am-voice'] as const) {
      const plan = planBroadcastCorpusRow(profile, 987654321, 7);
      const bytes = synthesize(profile, 64, 123_456, 987654321, 7);
      const samples = decode(bytes);
      for (let index = 0; index < samples.length; index += 1) {
        const [expectedI, expectedQ] = broadcastCorpusSampleAt(plan, FS, 123_456 + index);
        expect(samples[index]![0]).toBeCloseTo(expectedI, 6);
        expect(samples[index]![1]).toBeCloseTo(expectedQ, 6);
      }
    }
  });

  it('is split-invariant: two halves equal the whole, byte for byte', () => {
    for (const profile of ['fm-broadcast-mpx', 'am-voice'] as const) {
      const whole = synthesize(profile, 4096, 50_000);
      const first = synthesize(profile, 2048, 50_000);
      const second = synthesize(profile, 2048, 52_048);
      const stitched = new Uint8Array(whole.length);
      stitched.set(first, 0);
      stitched.set(second, first.length);
      expect(Buffer.from(stitched).equals(Buffer.from(whole))).toBe(true);
    }
  });

  it('FM has a constant unit envelope and bounded instantaneous frequency', () => {
    const plan = planBroadcastCorpusRow('fm-broadcast-mpx', 20260802, 3);
    let previousPhase: number | null = null;
    for (let index = 0; index < 40_000; index += 1) {
      const [inPhase, quadrature] = broadcastCorpusSampleAt(plan, FS, index);
      const envelope = Math.hypot(inPhase, quadrature);
      expect(Math.abs(envelope - 1)).toBeLessThan(1e-9);
      const phase = Math.atan2(quadrature, inPhase);
      if (previousPhase !== null) {
        let delta = phase - previousPhase;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        const instantaneousHz = (delta * FS) / (2 * Math.PI);
        expect(Math.abs(instantaneousHz)).toBeLessThanOrEqual(75_000 * 1.0001);
      }
      previousPhase = phase;
    }
  });

  it('AM stays a positive real envelope bounded by 1', () => {
    const plan = planBroadcastCorpusRow('am-voice', 20260802, 11);
    for (let index = 0; index < 40_000; index += 1) {
      const [inPhase, quadrature] = broadcastCorpusSampleAt(plan, FS, index);
      expect(quadrature).toBe(0);
      expect(inPhase).toBeGreaterThan(0);
      expect(inPhase).toBeLessThanOrEqual(1);
    }
  });

  it('draws distinct content per row and per seed', () => {
    for (const profile of ['fm-broadcast-mpx', 'am-voice'] as const) {
      const rowA = Buffer.from(synthesize(profile, 1024, 0, 20260802, 0));
      const rowB = Buffer.from(synthesize(profile, 1024, 0, 20260802, 1));
      const otherSeed = Buffer.from(synthesize(profile, 1024, 0, 555, 0));
      expect(rowA.equals(rowB)).toBe(false);
      expect(rowA.equals(otherSeed)).toBe(false);
    }
  });

  it('rejects wrong bindings and invalid coordinates', () => {
    expect(() => synthesizeBroadcastCorpusContentIq({
      profile: 'fm-broadcast-mpx', sampleRateHz: FS, bandwidthHz: 200_000,
      sampleCount: 8, startSampleIndex: 0, contentSeed: 1, contentRowIndex: 0,
    })).toThrow(RangeError);
    expect(() => synthesizeBroadcastCorpusContentIq({
      profile: 'am-voice', sampleRateHz: 1_000_000,
      bandwidthHz: BROADCAST_CORPUS_BANDWIDTH_HZ['am-voice'],
      sampleCount: 8, startSampleIndex: 0, contentSeed: 1, contentRowIndex: 0,
    })).toThrow(RangeError);
    expect(() => synthesize('fm-broadcast-mpx', 1_000_000)).toThrow(RangeError);
    expect(() => synthesize('am-voice', 8, -1)).toThrow(RangeError);
  });
});
