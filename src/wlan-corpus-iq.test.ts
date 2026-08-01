import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildWifiErpOfdmFixedPpdu,
  buildWifiHeFixedPpdu,
  crc32Ieee,
} from './wlan-fixed-iq.js';
import {
  WLAN_CORPUS_PROFILES,
  deriveWlanCorpusPacketDetails,
  synthesizeWlanCorpusContentIq,
} from './wlan-corpus-iq.js';

const SEED = 20_260_731;
const INPUTS = {
  'wifi-hr-dsss-11m': { sampleRateHz: 11_000_000, bandwidthHz: 11_000_000 },
  'wifi-ofdm-20m': { sampleRateHz: 20_000_000, bandwidthHz: 20_000_000 },
  'wifi6-he-su': { sampleRateHz: 20_000_000, bandwidthHz: 20_000_000 },
  'wifi6-he-er-su': { sampleRateHz: 20_000_000, bandwidthHz: 20_000_000 },
  'wifi6-he-mu': { sampleRateHz: 20_000_000, bandwidthHz: 20_000_000 },
  'wifi6-he-tb': { sampleRateHz: 20_000_000, bandwidthHz: 20_000_000 },
} as const;
const HE_CORPUS_PROFILES = [
  'wifi6-he-su',
  'wifi6-he-er-su',
  'wifi6-he-mu',
  'wifi6-he-tb',
] as const;

describe('corpus-only WLAN ACK PPDUs', () => {
  it('derives deterministic non-qualified packet content and non-zero scramblers', () => {
    for (const profile of WLAN_CORPUS_PROFILES) {
      const first = deriveWlanCorpusPacketDetails(profile, SEED, 7);
      const repeated = deriveWlanCorpusPacketDetails(profile, SEED, 7);
      const changed = deriveWlanCorpusPacketDetails(profile, SEED, 8);
      expect(first).toEqual(repeated);
      expect(first.psdu).not.toEqual(changed.psdu);
      expect(first.userPsdus).toHaveLength(profile === 'wifi6-he-mu' ? 2 : 1);
      for (const state of first.userScramblerInitialStates) {
        expect(state).toBeGreaterThanOrEqual(1);
        expect(state).toBeLessThanOrEqual(127);
      }
      if (profile === 'wifi-hr-dsss-11m' || profile === 'wifi-ofdm-20m') {
        expect(first.psdu).toHaveLength(14);
        expect([...first.psdu.subarray(0, 4)]).toEqual([0xd4, 0x00, 0x00, 0x00]);
        expect(first.psdu[4]).toBe(0x02);
        expect(first.psdu[4]! & 0x03).toBe(0x02);
        expectFcs(first.psdu);
      } else {
        for (const psdu of first.userPsdus) expectAmpduFcs(psdu);
      }
    }
  });

  it('is chunk-exact, bounded, and content-distinct at a fixed phase', () => {
    for (const profile of WLAN_CORPUS_PROFILES) {
      const input = {
        profile,
        ...INPUTS[profile],
        contentSeed: SEED,
        contentRowIndex: 11,
        startSampleIndex: 937,
      };
      const whole = synthesizeWlanCorpusContentIq({ ...input, sampleCount: 4_096 });
      const prefix = synthesizeWlanCorpusContentIq({ ...input, sampleCount: 1_231 });
      const suffix = synthesizeWlanCorpusContentIq({
        ...input,
        startSampleIndex: input.startSampleIndex + 1_231,
        sampleCount: 2_865,
      });
      expect(Buffer.concat([prefix, suffix])).toEqual(Buffer.from(whole));
      expect(isBoundedCf32le(whole)).toBe(true);

      const hashes = new Set<number>();
      for (let row = 0; row < 8; row += 1) {
        const bytes = synthesizeWlanCorpusContentIq({
          ...input,
          contentRowIndex: row,
          startSampleIndex: 0,
          sampleCount: 4_096,
        });
        hashes.add(Number.parseInt(createHash('sha256').update(bytes).digest('hex').slice(0, 12), 16));
      }
      expect(hashes.size).toBe(8);
    }
  });

  it('keeps ERP-OFDM training, SIGNAL, and signal extension byte-identical', () => {
    const fixed = buildWifiErpOfdmFixedPpdu().cf32le;
    const corpus = synthesizeWlanCorpusContentIq({
      profile: 'wifi-ofdm-20m',
      ...INPUTS['wifi-ofdm-20m'],
      contentSeed: SEED,
      contentRowIndex: 3,
      startSampleIndex: 0,
      sampleCount: 1_000,
    });
    // 160 STS + 160 LTS + 80 SIGNAL samples precede the six DATA symbols.
    expect(corpus.subarray(0, 400 * 8)).toEqual(fixed.subarray(0, 400 * 8));
    // The following six-microsecond signal extension remains quiet/fixed.
    expect(corpus.subarray(880 * 8)).toEqual(fixed.subarray(880 * 8));
    expect(corpus.subarray(400 * 8, 880 * 8)).not.toEqual(fixed.subarray(400 * 8, 880 * 8));
  });

  it('keeps every HE non-data sample and QoS header byte-identical', () => {
    for (const profile of HE_CORPUS_PROFILES) {
      const fixed = buildWifiHeFixedPpdu(profile);
      const details = deriveWlanCorpusPacketDetails(profile, SEED, 3);
      const corpus = synthesizeWlanCorpusContentIq({
        profile,
        ...INPUTS[profile],
        contentSeed: SEED,
        contentRowIndex: 3,
        startSampleIndex: 0,
        sampleCount: details.periodSamples,
      });
      expect(corpus.subarray(0, details.dataStartSample * 8))
        .toEqual(fixed.cf32le.subarray(0, details.dataStartSample * 8));
      expect(corpus.subarray(details.dataStartSample * 8)).not.toEqual(
        fixed.cf32le.subarray(details.dataStartSample * 8),
      );
      for (let ordinal = 0; ordinal < fixed.users.length; ordinal += 1) {
        const mpdu = ampduMpdu(details.userPsdus[ordinal]!);
        expect(mpdu.subarray(0, 26)).toEqual(fixed.users[ordinal]!.mpdu.subarray(0, 26));
        expectFcs(mpdu);
      }
    }
  });

  it('rejects invalid corpus content and non-native WLAN bindings', () => {
    expect(() => synthesizeWlanCorpusContentIq({
      profile: 'wifi-ofdm-20m',
      ...INPUTS['wifi-ofdm-20m'],
      sampleCount: 1,
      contentSeed: 0,
      contentRowIndex: 0,
    })).toThrow(/seed/i);
    expect(() => synthesizeWlanCorpusContentIq({
      profile: 'wifi-hr-dsss-11m',
      sampleRateHz: 20_000_000,
      bandwidthHz: 20_000_000,
      sampleCount: 1,
      contentSeed: SEED,
      contentRowIndex: 0,
    })).toThrow(/requires/i);
  });
});

function isBoundedCf32le(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.byteLength; offset += 8) {
    const real = view.getFloat32(offset, true);
    const imaginary = view.getFloat32(offset + 4, true);
    if (!Number.isFinite(real) || !Number.isFinite(imaginary) || Math.hypot(real, imaginary) > 1 + 1e-6) {
      return false;
    }
  }
  return true;
}

function expectAmpduFcs(psdu: Uint8Array): void {
  expectFcs(ampduMpdu(psdu));
}

function ampduMpdu(psdu: Uint8Array): Uint8Array {
  const length = psdu[0]! | ((psdu[1]! & 0x3f) << 8);
  expect(psdu[3]).toBe(0x4e);
  return psdu.subarray(4, 4 + length);
}

function expectFcs(frame: Uint8Array): void {
  const fcsOffset = frame.length - 4;
  const recordedFcs = frame[fcsOffset]!
    | (frame[fcsOffset + 1]! << 8)
    | (frame[fcsOffset + 2]! << 16)
    | (frame[fcsOffset + 3]! << 24);
  expect(recordedFcs >>> 0).toBe(crc32Ieee(frame.subarray(0, fcsOffset)));
}
