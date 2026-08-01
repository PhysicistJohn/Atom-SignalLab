import { describe, expect, it } from 'vitest';
import {
  corpusContentBit,
  corpusContentWord,
  validateCorpusContentSeed,
} from './corpus-content-prng.js';

describe('corpus content PRNG', () => {
  it('is deterministic and partition-safe at low and high absolute indices', () => {
    expect(corpusContentWord(20260731, 'gsm-normal-burst', 0, 0))
      .toBe(corpusContentWord(20260731, 'gsm-normal-burst', 0, 0));
    expect(corpusContentWord(20260731, 'gsm-normal-burst', 0x1_0000_0000 + 17, 4))
      .toBe(corpusContentWord(20260731, 'gsm-normal-burst', 0x1_0000_0000 + 17, 4));
  });

  it('domains seed, profile, index, and lane independently', () => {
    const baseline = corpusContentWord(20260731, 'gsm-normal-burst', 91, 2);
    expect(corpusContentWord(20260732, 'gsm-normal-burst', 91, 2)).not.toBe(baseline);
    expect(corpusContentWord(20260731, 'wifi-ofdm-20m', 91, 2)).not.toBe(baseline);
    expect(corpusContentWord(20260731, 'gsm-normal-burst', 92, 2)).not.toBe(baseline);
    expect(corpusContentWord(20260731, 'gsm-normal-burst', 91, 3)).not.toBe(baseline);
  });

  it('returns binary bits and validates its contract', () => {
    for (let index = 0; index < 64; index += 1) {
      expect([0, 1]).toContain(corpusContentBit(1, 'test', index, 7));
    }
    expect(validateCorpusContentSeed(1)).toBe(1);
    expect(validateCorpusContentSeed(0xffff_ffff)).toBe(0xffff_ffff);
    expect(() => validateCorpusContentSeed(0)).toThrow(RangeError);
    expect(() => corpusContentWord(1, '', 0)).toThrow(RangeError);
    expect(() => corpusContentWord(1, 'test', -1)).toThrow(RangeError);
    expect(() => corpusContentWord(1, 'test', 0, -1)).toThrow(RangeError);
  });
});
