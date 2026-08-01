import { describe, expect, it } from 'vitest';
import {
  GERAN_FIXED_BURST_VECTORS,
  GERAN_GMSK_DUMMY_BURST,
  GERAN_GMSK_TSC0_SET1,
} from './geran-fixed-bursts.js';
import {
  GERAN_CORPUS_PROFILES,
  geranCorpusScheduledBurstBits,
  synthesizeGeranCorpusAnalyticSamples,
  synthesizeGeranCorpusContentIq,
} from './geran-corpus-iq.js';
import { decodeGeranXcchEncodedBursts } from './geran-xcch-corpus-codec.js';

const FIXED_INPUT = {
  contentSeed: 20_260_731,
  contentRowIndex: 17,
  sampleRateHz: 1_300_000,
  sampleCount: 6_000,
};

describe('corpus-only GERAN I/Q synthesis', () => {
  it('changes only the allowed data fields while preserving fixed geometry and training', () => {
    for (const profile of GERAN_CORPUS_PROFILES) {
      const first = geranCorpusScheduledBurstBits({ ...FIXED_INPUT, profile, slotIndex: 0 })!;
      const repeated = geranCorpusScheduledBurstBits({ ...FIXED_INPUT, profile, slotIndex: 0 })!;
      const changed = geranCorpusScheduledBurstBits({
        ...FIXED_INPUT, profile, contentRowIndex: FIXED_INPUT.contentRowIndex + 1, slotIndex: 0,
      })!;
      expect(first).toBe(repeated);
      expect(changed).not.toBe(first);
      if (profile === 'gsm-900-loaded-bcch' || profile === 'gsm-normal-burst') {
        expect(first).toHaveLength(148);
        expect(first.slice(0, 3)).toBe('000');
        expect(first.slice(3 + 58, 3 + 58 + 26)).toBe(GERAN_GMSK_TSC0_SET1);
        expect(first.slice(-3)).toBe('000');
      } else {
        const fixed = GERAN_FIXED_BURST_VECTORS[profile];
        const leftStart = fixed.tailBitsPerSide;
        const trainingStart = leftStart + fixed.encryptedBitsPerSide;
        expect(first.slice(0, leftStart)).toBe(fixed.bits.slice(0, leftStart));
        expect(first.slice(trainingStart, trainingStart + fixed.trainingBits.length)).toBe(fixed.trainingBits);
        expect(first.slice(-fixed.tailBitsPerSide)).toBe(fixed.bits.slice(-fixed.tailBitsPerSide));
      }
    }
  });

  it('keeps the loaded schedule and a complete xCCH block decodable', () => {
    expect(geranCorpusScheduledBurstBits({
      ...FIXED_INPUT, profile: 'gsm-900-loaded-bcch', slotIndex: 1,
    })).toBe(GERAN_GMSK_DUMMY_BURST);
    expect(geranCorpusScheduledBurstBits({
      ...FIXED_INPUT, profile: 'gsm-normal-burst', slotIndex: 1,
    })).toBeUndefined();
    const encodedBursts = [0, 8, 16, 24].map((slotIndex) => {
      const physical = geranCorpusScheduledBurstBits({
        ...FIXED_INPUT, profile: 'gsm-normal-burst', slotIndex,
      })!;
      return `${physical.slice(3, 61)}${physical.slice(87, 145)}`;
    });
    expect(decodeGeranXcchEncodedBursts(encodedBursts)).toHaveLength(23);
  });

  it('is deterministic, analytically chunk-exact, and content-distinct at fixed phase', () => {
    for (const profile of GERAN_CORPUS_PROFILES) {
      const input = { ...FIXED_INPUT, profile, sampleCount: 1_024 };
      const whole = synthesizeGeranCorpusAnalyticSamples(input);
      const prefix = synthesizeGeranCorpusAnalyticSamples({ ...input, sampleCount: 512 });
      const suffix = synthesizeGeranCorpusAnalyticSamples({ ...input, sampleCount: 512, startSampleIndex: 512 });
      const changed = synthesizeGeranCorpusAnalyticSamples({
        ...input, contentRowIndex: input.contentRowIndex + 1,
      });
      expect([...whole]).toEqual([...prefix, ...suffix]);
      expect(changed).not.toEqual(whole);
      expect(whole.every((value) => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    }
  });

  it('emits bounded cf32le with the corpus-only content seed path', () => {
    const bytes = synthesizeGeranCorpusContentIq({
      ...FIXED_INPUT,
      profile: 'gsm-normal-burst',
      bandwidthHz: 200_000,
      sampleCount: 2_048,
    });
    expect(bytes.byteLength).toBe(2_048 * 8);
  });
});
