import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  WIFI_ERP_OFDM_CF32LE_SHA256,
  WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT,
  WIFI_ERP_OFDM_SAMPLE_COUNT,
  WIFI_ERP_OFDM_SAMPLE_RATE_HZ,
  WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES,
  WIFI_FIXED_ACK_PSDU_HEX,
  WIFI_HR_DSSS_CF32LE_SHA256,
  WIFI_HR_DSSS_CHIP_COUNT,
  WIFI_HR_DSSS_CHIP_RATE_HZ,
  WIFI_HE_FIXED_PROFILE_IDS,
  WIFI_HE_SAMPLE_RATE_HZ,
  WLAN_FIXED_PROFILE_IDS,
  WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS,
  buildLegacySignalBits,
  buildWifiErpOfdmFixedPpdu,
  buildWifiHrDsssFixedPpdu,
  buildWifiHeFixedPpdu,
  convolutionalEncodeRateOneHalf,
  crc16CcittOnesComplementTransmitOrder,
  crc32Ieee,
  encodeCck11MbpsSymbol,
  interleaveLegacyOfdmBits,
  scrambleHrDsssFeedthrough,
  scrambleLegacyOfdmBits,
  synthesizeWlanFixedCatalogIq,
  type SplitComplexSequence,
} from './wlan-fixed-iq.js';

describe('fixed WLAN governance boundary', () => {
  it('exhaustively accounts for the six closed fixed catalog profiles', () => {
    expect(Object.keys(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS).sort())
      .toEqual([...WLAN_FIXED_PROFILE_IDS].sort());
    for (const profile of WLAN_FIXED_PROFILE_IDS) {
      const status = WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS[profile];
      expect(status.profile).toBe(profile);
      expect(status.governingBody).toBe('IEEE Standards Association / IEEE 802.11 Working Group');
      expect(status.specification).toBe('IEEE 802.11-2024');
      expect(status.qualificationBlockers.length).toBeGreaterThan(0);
      expect(status.exactScope.length).toBeGreaterThan(20);
    }
  });

  it('promotes all six complete fixed artifacts at their independently tested digital interface', () => {
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi-ofdm-20m'])
      .toMatchObject({ implemented: true, qualification: 'independently-verified-digital-baseband' });
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi-hr-dsss-11m'])
      .toMatchObject({ implemented: true, qualification: 'independently-verified-digital-baseband' });
    for (const profile of ['wifi6-he-su', 'wifi6-he-er-su', 'wifi6-he-mu', 'wifi6-he-tb'] as const) {
      expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS[profile])
        .toMatchObject({ implemented: true, qualification: 'independently-verified-digital-baseband' });
    }
  });

  it('uses the exact governing clauses for HR-DSSS, ERP-OFDM, HE, and triggered HE', () => {
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi-hr-dsss-11m'].clauses).toEqual(['16']);
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi-ofdm-20m'].clauses).toEqual(['18', '17']);
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi6-he-su'].clauses).toEqual(['27']);
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi6-he-er-su'].clauses).toEqual(['27']);
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi6-he-mu'].clauses).toEqual(['27']);
    expect(WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS['wifi6-he-tb'].clauses).toEqual(['26', '27']);
  });
});

describe('fixed IEEE 802.11 ACK PSDU', () => {
  it('is a complete ACK control MPDU with a valid little-endian IEEE CRC-32 FCS', () => {
    const bytes = hexBytes(WIFI_FIXED_ACK_PSDU_HEX);
    expect(bytes).toHaveLength(14);
    expect([...bytes.subarray(0, 2)]).toEqual([0xd4, 0x00]);
    expect(bytes[4]! & 0x03).toBe(0x02); // locally administered unicast RA
    const expectedFcs = crc32Ieee(bytes.subarray(0, 10));
    const actualFcs = bytes[10]!
      | (bytes[11]! << 8)
      | (bytes[12]! << 16)
      | (bytes[13]! << 24);
    expect(actualFcs >>> 0).toBe(expectedFcs);
  });

  it('matches the published CRC-32 check value for ASCII 123456789', () => {
    expect(crc32Ieee(new TextEncoder().encode('123456789'))).toBe(0xcbf4_3926);
  });
});

describe('IEEE 802.11-2024 Clauses 18/17 fixed ERP-OFDM PPDU', () => {
  const ppdu = buildWifiErpOfdmFixedPpdu();

  it('pins a complete 44 us packet and 6 us 2.4 GHz signal-extension interval', () => {
    expect(ppdu).toMatchObject({
      profile: 'wifi-ofdm-20m',
      sampleRateHz: 20_000_000,
      dataRateBitsPerSecond: 6_000_000,
      modulation: 'BPSK',
      codeRate: '1/2',
      fftSize: 64,
      cyclicPrefixSamples: 16,
      metadata: {
        psduOctets: 14,
        ofdmDataSymbols: 6,
        signalOfdmSymbols: 1,
        shortTrainingSamples: 160,
        longTrainingSamples: 160,
        ppduSamples: 880,
        signalExtensionSamples: 120,
        totalSamples: 1_000,
        packetDurationMicroseconds: 44,
        signalExtensionMicroseconds: 6,
        transmitArtifactDurationMicroseconds: 50,
        qualification: 'independently-verified-digital-baseband',
      },
    });
    expect(ppdu.timeDomain.real).toHaveLength(WIFI_ERP_OFDM_SAMPLE_COUNT);
    expect(ppdu.timeDomain.imaginary).toHaveLength(WIFI_ERP_OFDM_SAMPLE_COUNT);
    expect(ppdu.cf32le).toHaveLength(WIFI_ERP_OFDM_SAMPLE_COUNT * 8);
  });

  it('renders the required 2.4 GHz signal extension as exactly 6 us without transmission', () => {
    expect(WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT).toBe(880);
    expect(WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES).toBe(120);
    expect(WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT + WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES)
      .toBe(WIFI_ERP_OFDM_SAMPLE_COUNT);
    expect([...ppdu.timeDomain.real.subarray(WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT)])
      .toEqual(new Array(WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES).fill(0));
    expect([...ppdu.timeDomain.imaginary.subarray(WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT)])
      .toEqual(new Array(WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES).fill(0));
  });

  it('constructs the L-SIG RATE/reserved/LENGTH/parity/tail fields exactly', () => {
    expect(bitsText(ppdu.signalUncodedBits.subarray(0, 4))).toBe('1101');
    expect(ppdu.signalUncodedBits[4]).toBe(0);
    expect(bitsToUnsignedLsbFirst(ppdu.signalUncodedBits.subarray(5, 17))).toBe(14);
    expect(xorBits(ppdu.signalUncodedBits.subarray(0, 18))).toBe(0);
    expect([...ppdu.signalUncodedBits.subarray(18)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(buildLegacySignalBits(14)).toEqual(ppdu.signalUncodedBits);
  });

  it('applies the Clause 17 rate-1/2 BCC and BPSK interleaver as bijections', () => {
    expect(ppdu.signalCodedBits).toEqual(convolutionalEncodeRateOneHalf(ppdu.signalUncodedBits));
    expect(ppdu.signalInterleavedBits).toEqual(interleaveLegacyOfdmBits(ppdu.signalCodedBits, 1));
    expect(inverseLegacyBpskInterleave(ppdu.signalInterleavedBits)).toEqual(ppdu.signalCodedBits);
    expect(inverseLegacyBpskInterleave(ppdu.dataInterleavedBits)).toEqual(ppdu.dataCodedBits);
    expect(new Set(interleaverPermutation())).toHaveLength(48);
  });

  it('decodes every coded bit through an independently structured hard Viterbi decoder', () => {
    expect(viterbiDecodeRateOneHalf(ppdu.signalCodedBits)).toEqual(ppdu.signalUncodedBits);
    const recoveredScrambled = viterbiDecodeRateOneHalf(ppdu.dataCodedBits);
    expect(recoveredScrambled).toEqual(ppdu.dataScrambledBits);

    const descrambled = scrambleLegacyOfdmBits(
      recoveredScrambled,
      93,
    );
    const recoveredPsdu = bitsToBytesLsbFirst(descrambled.subarray(16, 16 + ppdu.psdu.length * 8));
    expect(recoveredPsdu).toEqual(ppdu.psdu);
  });

  it('has exact SERVICE/PSDU/tail/pad geometry and terminates the BCC before pad', () => {
    expect(ppdu.dataUncodedBits).toHaveLength(144);
    expect([...ppdu.dataUncodedBits.subarray(0, 16)]).toEqual(new Array(16).fill(0));
    expect(bitsToBytesLsbFirst(ppdu.dataUncodedBits.subarray(16, 128))).toEqual(ppdu.psdu);
    expect([...ppdu.dataScrambledBits.subarray(128, 134)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(ppdu.dataUncodedBits.subarray(134)).toEqual(new Uint8Array(10));
    expect(ppdu.dataCodedBits).toHaveLength(288);
    expect(ppdu.dataInterleavedBits).toHaveLength(288);
  });

  it('maps exactly 48 BPSK data tones, four pilots, and 12 nulls per OFDM symbol', () => {
    expect(ppdu.frequencyDomainSymbols).toHaveLength(7);
    for (const frequency of ppdu.frequencyDomainSymbols) {
      const occupied = nonzeroBins(frequency);
      expect(occupied).toHaveLength(52);
      expect(occupied).not.toContain(0);
      for (let bin = 27; bin <= 37; bin += 1) expect(occupied).not.toContain(bin);
      for (const bin of occupied) {
        expect(Math.abs(frequency.real[bin]!)).toBe(1);
        expect(frequency.imaginary[bin]).toBe(0);
      }
    }
    const expectedPilotPatterns = [
      [1, 1, 1, -1],
      [1, 1, 1, -1],
      [1, 1, 1, -1],
      [1, 1, 1, -1],
      [-1, -1, -1, 1],
      [-1, -1, -1, 1],
      [-1, -1, -1, 1],
    ];
    for (let symbol = 0; symbol < ppdu.frequencyDomainSymbols.length; symbol += 1) {
      const frequency = ppdu.frequencyDomainSymbols[symbol]!;
      expect([-21, -7, 7, 21].map((carrier) => frequency.real[carrier < 0 ? 64 + carrier : carrier]))
        .toEqual(expectedPilotPatterns[symbol]);
    }
  });

  it('repeats the ten L-STF short symbols and two L-LTF long symbols exactly', () => {
    for (let sample = 16; sample < 160; sample += 1) {
      expect(ppdu.timeDomain.real[sample]).toBeCloseTo(ppdu.timeDomain.real[sample % 16]!, 14);
      expect(ppdu.timeDomain.imaginary[sample])
        .toBeCloseTo(ppdu.timeDomain.imaginary[sample % 16]!, 14);
    }
    for (let sample = 0; sample < 32; sample += 1) {
      expect(ppdu.timeDomain.real[160 + sample]).toBeCloseTo(ppdu.timeDomain.real[224 + sample]!, 14);
      expect(ppdu.timeDomain.imaginary[160 + sample])
        .toBeCloseTo(ppdu.timeDomain.imaginary[224 + sample]!, 14);
    }
    for (let sample = 0; sample < 64; sample += 1) {
      expect(ppdu.timeDomain.real[192 + sample]).toBeCloseTo(ppdu.timeDomain.real[256 + sample]!, 14);
      expect(ppdu.timeDomain.imaginary[192 + sample])
        .toBeCloseTo(ppdu.timeDomain.imaginary[256 + sample]!, 14);
    }
  });

  it('has exact 16-sample cyclic prefixes and independently DFT-recovers every L-SIG/DATA tone', () => {
    for (let symbol = 0; symbol < 7; symbol += 1) {
      const symbolStart = 320 + symbol * 80;
      for (let prefix = 0; prefix < 16; prefix += 1) {
        expect(ppdu.timeDomain.real[symbolStart + prefix])
          .toBeCloseTo(ppdu.timeDomain.real[symbolStart + 64 + prefix]!, 14);
        expect(ppdu.timeDomain.imaginary[symbolStart + prefix])
          .toBeCloseTo(ppdu.timeDomain.imaginary[symbolStart + 64 + prefix]!, 14);
      }
      const recovered = directDft64(
        ppdu.timeDomain.real.subarray(symbolStart + 16, symbolStart + 80),
        ppdu.timeDomain.imaginary.subarray(symbolStart + 16, symbolStart + 80),
      );
      const expected = ppdu.frequencyDomainSymbols[symbol]!;
      for (let bin = 0; bin < 64; bin += 1) {
        expect(recovered.real[bin]).toBeCloseTo(expected.real[bin]!, 11);
        expect(recovered.imaginary[bin]).toBeCloseTo(expected.imaginary[bin]!, 11);
      }
    }
  });

  it('pins the full cf32le artifact by SHA-256', () => {
    const hash = sha256(ppdu.cf32le);
    if (WIFI_ERP_OFDM_CF32LE_SHA256.startsWith('TO_BE_FILLED')) {
      // This branch only exists to make an intentional first-run hash update
      // visible while developing the immutable content-addressed artifact.
      expect.fail(`Replace ERP-OFDM artifact placeholder with ${hash}`);
    }
    expect(hash).toBe(WIFI_ERP_OFDM_CF32LE_SHA256);
  });
});

describe('IEEE 802.11-2024 Clause 16 fixed HR-DSSS PPDU', () => {
  const ppdu = buildWifiHrDsssFixedPpdu();

  it('pins the complete mandatory long PLCP and 11 Mb/s CCK PSDU chip geometry', () => {
    expect(ppdu).toMatchObject({
      profile: 'wifi-hr-dsss-11m',
      chipRateHz: 11_000_000,
      psduDataRateBitsPerSecond: 11_000_000,
      signal: 0x6e,
      service: 0x80,
      lengthMicroseconds: 11,
      headerCrc: 0x3cc4,
      metadata: {
        psduOctets: 14,
        longPlcpBits: 192,
        longPlcpChips: 2_112,
        cckSymbols: 14,
        cckChips: 112,
        totalChips: 2_224,
        qualification: 'independently-verified-digital-baseband',
      },
    });
    expect(ppdu.chips.real).toHaveLength(WIFI_HR_DSSS_CHIP_COUNT);
    expect(ppdu.chips.imaginary).toHaveLength(WIFI_HR_DSSS_CHIP_COUNT);
    expect(ppdu.cf32le).toHaveLength(WIFI_HR_DSSS_CHIP_COUNT * 8);
  });

  it('constructs SYNC, SFD, SIGNAL, SERVICE, LENGTH and transmitted CRC bits exactly', () => {
    expect([...ppdu.unscrambledBits.subarray(0, 128)]).toEqual(new Array(128).fill(1));
    expect(bitsToUnsignedLsbFirst(ppdu.unscrambledBits.subarray(128, 144))).toBe(0xf3a0);
    expect(bitsToUnsignedLsbFirst(ppdu.unscrambledBits.subarray(144, 152))).toBe(0x6e);
    expect(bitsToUnsignedLsbFirst(ppdu.unscrambledBits.subarray(152, 160))).toBe(0x80);
    expect(bitsToUnsignedLsbFirst(ppdu.unscrambledBits.subarray(160, 176))).toBe(11);
    expect(bitsText(ppdu.unscrambledBits.subarray(176, 192))).toBe('0011110011000100');
    expect(bitsToBytesLsbFirst(ppdu.unscrambledBits.subarray(192))).toEqual(ppdu.psdu);
  });

  it('matches the normative published CCITT CRC-16 example exactly', () => {
    const publishedProtectedBits = bitString(
      '01010000' // SIGNAL 0x0a in transmit order
      + '00000000' // SERVICE
      + '0000001100000000', // LENGTH 192 in transmit order
    );
    expect(crc16CcittOnesComplementTransmitOrder(publishedProtectedBits)).toBe(0x5b57);
  });

  it('sets LENGTH extension so the receiver reconstructs exactly 14 octets', () => {
    const reconstructed = Math.floor(ppdu.lengthMicroseconds * 11 / 8)
      - ((ppdu.service >>> 7) & 1);
    expect(reconstructed).toBe(14);
    expect(ppdu.lengthMicroseconds).toBe(Math.ceil(14 * 8 / 11));
    expect(ppdu.lengthMicroseconds - 14 * 8 / 11).toBeGreaterThanOrEqual(8 / 11);
  });

  it('uses a self-synchronizing z^-7 + z^-4 + 1 feedthrough scrambler continuously', () => {
    expect(ppdu.scrambledBits).toEqual(scrambleHrDsssFeedthrough(ppdu.unscrambledBits, 0x6c));
    const independentlyRecovered = independentlyDescrambleHrDsss(ppdu.scrambledBits);
    expect(independentlyRecovered.subarray(7)).toEqual(ppdu.unscrambledBits.subarray(7));

    const splitScramble = new Uint8Array(ppdu.scrambledBits.length);
    const state = seedState(0x6c);
    splitScramble.set(independentlyScrambleHrDsss(ppdu.unscrambledBits.subarray(0, 192), state), 0);
    splitScramble.set(independentlyScrambleHrDsss(ppdu.unscrambledBits.subarray(192), state), 192);
    expect(splitScramble).toEqual(ppdu.scrambledBits);
  });

  it('spreads every long-PLCP DBPSK bit with the exact Barker-11 sequence', () => {
    const barker = [1, -1, 1, 1, -1, 1, 1, 1, -1, -1, -1];
    let previousPhase: readonly [number, number] = [1, 0];
    for (let bit = 0; bit < 192; bit += 1) {
      const firstChip: readonly [number, number] = [
        ppdu.chips.real[bit * 11]!,
        ppdu.chips.imaginary[bit * 11]!,
      ];
      const differential = firstChip[0] * previousPhase[0] + firstChip[1] * previousPhase[1];
      expect(differential).toBe(ppdu.scrambledBits[bit] === 0 ? 1 : -1);
      for (let chip = 0; chip < 11; chip += 1) {
        expect(ppdu.chips.real[bit * 11 + chip]).toBe(firstChip[0] * barker[chip]!);
        expect(ppdu.chips.imaginary[bit * 11 + chip]).toBe(firstChip[1] * barker[chip]!);
      }
      previousPhase = firstChip;
    }
  });

  it('exhaustively matches all 256 CCK words, four preceding phases, and even/odd cover phases', () => {
    for (let byte = 0; byte < 256; byte += 1) {
      const bits = Uint8Array.from({ length: 8 }, (_, bit) => (byte >>> bit) & 1);
      for (let precedingPhase = 0; precedingPhase < 4; precedingPhase += 1) {
        for (let parity = 0; parity < 2; parity += 1) {
          const actual = encodeCck11MbpsSymbol(bits, precedingPhase, parity);
          const expected = independentCck11MbpsSymbol(bits, precedingPhase, parity);
          expect(actual.phaseQuarterTurns).toBe(expected.phaseQuarterTurns);
          expect(actual.chips.real).toEqual(expected.chips.real);
          expect(actual.chips.imaginary).toEqual(expected.chips.imaginary);
          for (let chip = 0; chip < 8; chip += 1) {
            expect(actual.chips.real[chip]! ** 2 + actual.chips.imaginary[chip]! ** 2).toBe(1);
          }
        }
      }
    }
  });

  it('recovers every fixed CCK octet by exhaustive maximum-correlation decoding', () => {
    let precedingPhase = phaseOfLastBarkerSymbol(ppdu);
    const recoveredScrambledBits = new Uint8Array(ppdu.psdu.length * 8);
    const cckOffset = 192 * 11;
    for (let symbol = 0; symbol < ppdu.psdu.length; symbol += 1) {
      const received = {
        real: ppdu.chips.real.subarray(cckOffset + symbol * 8, cckOffset + (symbol + 1) * 8),
        imaginary: ppdu.chips.imaginary.subarray(cckOffset + symbol * 8, cckOffset + (symbol + 1) * 8),
      };
      const decoded = exhaustiveIndependentCckDecode(received, precedingPhase, symbol);
      recoveredScrambledBits.set(decoded.bits, symbol * 8);
      precedingPhase = decoded.phaseQuarterTurns;
      expect(decoded.correlation).toBe(8);
    }
    expect(recoveredScrambledBits).toEqual(ppdu.scrambledBits.subarray(192));

    const allRecovered = independentlyDescrambleHrDsss(ppdu.scrambledBits, seedState(0x6c));
    expect(bitsToBytesLsbFirst(allRecovered.subarray(192))).toEqual(ppdu.psdu);
  });

  it('pins the full chip-rate cf32le artifact by SHA-256', () => {
    const hash = sha256(ppdu.cf32le);
    if (WIFI_HR_DSSS_CF32LE_SHA256.startsWith('TO_BE_FILLED')) {
      expect.fail(`Replace HR-DSSS artifact placeholder with ${hash}`);
    }
    expect(hash).toBe(WIFI_HR_DSSS_CF32LE_SHA256);
  });
});

describe('fixed WLAN catalog adapter fail-closed behavior', () => {
  it('returns exact cyclic slices for all six implemented artifacts', () => {
    const artifacts = [
      {
        profile: 'wifi-ofdm-20m' as const,
        sampleRateHz: WIFI_ERP_OFDM_SAMPLE_RATE_HZ,
        full: buildWifiErpOfdmFixedPpdu().cf32le,
      },
      {
        profile: 'wifi-hr-dsss-11m' as const,
        sampleRateHz: WIFI_HR_DSSS_CHIP_RATE_HZ,
        full: buildWifiHrDsssFixedPpdu().cf32le,
      },
      ...WIFI_HE_FIXED_PROFILE_IDS.map((profile) => ({
        profile,
        sampleRateHz: WIFI_HE_SAMPLE_RATE_HZ,
        full: buildWifiHeFixedPpdu(profile).cf32le,
      })),
    ];
    for (const { profile, sampleRateHz, full } of artifacts) {
      const fullSamples = full.length / 8;
      const actual = synthesizeWlanFixedCatalogIq({
        profile,
        sampleRateHz,
        bandwidthHz: sampleRateHz,
        sampleCount: 9,
        startSampleIndex: fullSamples - 4,
      });
      const expected = new Uint8Array(9 * 8);
      expected.set(full.subarray((fullSamples - 4) * 8), 0);
      expected.set(full.subarray(0, 5 * 8), 4 * 8);
      expect(actual).toEqual(expected);
    }
  });

  it('rejects resampling and invalid bounds without weakening content identity', () => {
    expect(() => synthesizeWlanFixedCatalogIq({
      profile: 'wifi-ofdm-20m',
      sampleRateHz: 40_000_000,
      bandwidthHz: 20_000_000,
      sampleCount: 1,
    })).toThrow(/requires 20000000 samples\/s/);
    expect(() => synthesizeWlanFixedCatalogIq({
      profile: 'wifi-hr-dsss-11m',
      sampleRateHz: 22_000_000,
      bandwidthHz: 11_000_000,
      sampleCount: 1,
    })).toThrow(/requires 11000000 samples\/s/);
    expect(() => synthesizeWlanFixedCatalogIq({
      profile: 'wifi6-he-mu',
      sampleRateHz: 40_000_000,
      bandwidthHz: 20_000_000,
      sampleCount: 1,
    })).toThrow(/requires 20000000 samples\/s/);
    expect(() => synthesizeWlanFixedCatalogIq({
      profile: 'wifi6-he-su',
      sampleRateHz: 20_000_000,
      bandwidthHz: 10_000_000,
      sampleCount: 1,
    })).toThrow(/requires the fixed 20000000 Hz digital-interface bandwidth/);
    expect(() => synthesizeWlanFixedCatalogIq({
      profile: 'wifi-ofdm-20m',
      sampleRateHz: 20_000_000,
      bandwidthHz: 20_000_000,
      sampleCount: 65_537,
    })).toThrow(/65536/);
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hexBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new RangeError('Expected even-length hexadecimal');
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function bitsText(bits: Uint8Array): string {
  return [...bits].join('');
}

function bitString(value: string): Uint8Array {
  if (!/^[01]+$/.test(value)) throw new RangeError('Expected a bit string');
  return Uint8Array.from(value, (bit) => Number(bit));
}

function bitsToUnsignedLsbFirst(bits: Uint8Array): number {
  return bits.reduce((value, bit, index) => value + (bit << index), 0);
}

function bitsToBytesLsbFirst(bits: Uint8Array): Uint8Array {
  if (bits.length % 8 !== 0) throw new RangeError('Bit count must be octet-aligned');
  return Uint8Array.from({ length: bits.length / 8 }, (_, byte) =>
    bitsToUnsignedLsbFirst(bits.subarray(byte * 8, (byte + 1) * 8)));
}

function xorBits(bits: Uint8Array): number {
  return bits.reduce((parity, bit) => parity ^ bit, 0);
}

function interleaverPermutation(): number[] {
  return Array.from({ length: 48 }, (_, k) => 16 * k - 47 * Math.floor(16 * k / 48));
}

function inverseLegacyBpskInterleave(interleaved: Uint8Array): Uint8Array {
  if (interleaved.length % 48 !== 0) throw new RangeError('Coded bits must contain whole symbols');
  const output = new Uint8Array(interleaved.length);
  for (let symbol = 0; symbol < interleaved.length / 48; symbol += 1) {
    for (let k = 0; k < 48; k += 1) {
      const source = 16 * k - 47 * Math.floor(16 * k / 48);
      output[symbol * 48 + source] = interleaved[symbol * 48 + k]!;
    }
  }
  return output;
}

function viterbiDecodeRateOneHalf(coded: Uint8Array): Uint8Array {
  if (coded.length % 2 !== 0) throw new RangeError('Rate-1/2 code requires pairs');
  const inputBits = coded.length / 2;
  let metrics = new Float64Array(128);
  metrics.fill(Number.POSITIVE_INFINITY);
  metrics[0] = 0;
  const previousState = new Uint8Array(inputBits * 128);
  const previousBit = new Uint8Array(inputBits * 128);

  for (let step = 0; step < inputBits; step += 1) {
    const nextMetrics = new Float64Array(128);
    nextMetrics.fill(Number.POSITIVE_INFINITY);
    for (let state = 0; state < 128; state += 1) {
      if (!Number.isFinite(metrics[state]!)) continue;
      for (let bit = 0; bit <= 1; bit += 1) {
        const nextState = ((state << 1) & 0x7e) | bit;
        const expected0 = parity(stateTransitionRegister(state, bit) & 0o155);
        const expected1 = parity(stateTransitionRegister(state, bit) & 0o117);
        const distance = Number(expected0 !== coded[step * 2])
          + Number(expected1 !== coded[step * 2 + 1]);
        const metric = metrics[state]! + distance;
        if (metric < nextMetrics[nextState]!) {
          nextMetrics[nextState] = metric;
          previousState[step * 128 + nextState] = state;
          previousBit[step * 128 + nextState] = bit;
        }
      }
    }
    metrics = nextMetrics;
  }
  let state = 0;
  let bestMetric = metrics[0]!;
  for (let candidate = 1; candidate < 128; candidate += 1) {
    if (metrics[candidate]! < bestMetric) {
      bestMetric = metrics[candidate]!;
      state = candidate;
    }
  }
  expect(bestMetric).toBe(0);
  const bits = new Uint8Array(inputBits);
  for (let step = inputBits - 1; step >= 0; step -= 1) {
    bits[step] = previousBit[step * 128 + state]!;
    state = previousState[step * 128 + state]!;
  }
  return bits;
}

function stateTransitionRegister(state: number, bit: number): number {
  return ((state << 1) & 0x7e) | bit;
}

function parity(value: number): number {
  let result = 0;
  for (let bit = 0; bit < 8; bit += 1) result ^= (value >>> bit) & 1;
  return result;
}

function nonzeroBins(sequence: SplitComplexSequence): number[] {
  return Array.from({ length: sequence.real.length }, (_, index) => index)
    .filter((index) => sequence.real[index] !== 0 || sequence.imaginary[index] !== 0);
}

function directDft64(real: Float64Array, imaginary: Float64Array): SplitComplexSequence {
  if (real.length !== 64 || imaginary.length !== 64) throw new RangeError('Direct DFT requires 64 samples');
  const outputReal = new Float64Array(64);
  const outputImaginary = new Float64Array(64);
  for (let bin = 0; bin < 64; bin += 1) {
    let accumulatedReal = 0;
    let accumulatedImaginary = 0;
    for (let sample = 0; sample < 64; sample += 1) {
      const angle = -2 * Math.PI * bin * sample / 64;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      accumulatedReal += real[sample]! * cosine - imaginary[sample]! * sine;
      accumulatedImaginary += real[sample]! * sine + imaginary[sample]! * cosine;
    }
    outputReal[bin] = accumulatedReal;
    outputImaginary[bin] = accumulatedImaginary;
  }
  return { real: outputReal, imaginary: outputImaginary };
}

interface MutableScramblerState {
  readonly stages: number[];
}

function seedState(seed: number): MutableScramblerState {
  return {
    stages: [
      (seed >>> 6) & 1,
      (seed >>> 5) & 1,
      (seed >>> 4) & 1,
      (seed >>> 3) & 1,
      (seed >>> 2) & 1,
      (seed >>> 1) & 1,
      seed & 1,
    ],
  };
}

function independentlyScrambleHrDsss(
  input: Uint8Array,
  state: MutableScramblerState,
): Uint8Array {
  const output = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const next = input[index]! ^ state.stages[3]! ^ state.stages[6]!;
    output[index] = next;
    state.stages.unshift(next);
    state.stages.pop();
  }
  return output;
}

function independentlyDescrambleHrDsss(
  input: Uint8Array,
  state: MutableScramblerState = seedState(0),
): Uint8Array {
  const output = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    output[index] = input[index]! ^ state.stages[3]! ^ state.stages[6]!;
    state.stages.unshift(input[index]!);
    state.stages.pop();
  }
  return output;
}

function independentCck11MbpsSymbol(
  bits: Uint8Array,
  previousPhase: number,
  symbolIndex: number,
): { phaseQuarterTurns: number; chips: SplitComplexSequence } {
  const phaseTable = new Map([
    ['00', 0],
    ['01', 1],
    ['11', 2],
    ['10', 3],
  ]);
  const binaryPhaseTable = new Map([
    ['00', 0],
    ['01', 1],
    ['10', 2],
    ['11', 3],
  ]);
  const dibit = (offset: number) => `${bits[offset]}${bits[offset + 1]}`;
  const phi1 = (previousPhase + phaseTable.get(dibit(0))! + 2 * (symbolIndex & 1)) & 3;
  const phi2 = binaryPhaseTable.get(dibit(2))!;
  const phi3 = binaryPhaseTable.get(dibit(4))!;
  const phi4 = binaryPhaseTable.get(dibit(6))!;
  const unit = (phase: number): readonly [number, number] => {
    const normalized = ((phase % 4) + 4) % 4;
    if (normalized === 0) return [1, 0];
    if (normalized === 1) return [0, 1];
    if (normalized === 2) return [-1, 0];
    return [0, -1];
  };
  const phases = [
    phi1 + phi2 + phi3 + phi4,
    phi1 + phi3 + phi4,
    phi1 + phi2 + phi4,
    phi1 + phi4 + 2,
    phi1 + phi2 + phi3,
    phi1 + phi3,
    phi1 + phi2 + 2,
    phi1,
  ];
  const values = phases.map(unit);
  return {
    phaseQuarterTurns: phi1,
    chips: {
      real: Float64Array.from(values, (value) => value[0]),
      imaginary: Float64Array.from(values, (value) => value[1]),
    },
  };
}

function exhaustiveIndependentCckDecode(
  received: SplitComplexSequence,
  precedingPhase: number,
  symbolIndex: number,
): {
    readonly bits: Uint8Array;
    readonly phaseQuarterTurns: number;
    readonly correlation: number;
  } {
  let bestByte = 0;
  let bestPhase = 0;
  let bestCorrelation = Number.NEGATIVE_INFINITY;
  for (let byte = 0; byte < 256; byte += 1) {
    const bits = Uint8Array.from({ length: 8 }, (_, bit) => (byte >>> bit) & 1);
    const candidate = independentCck11MbpsSymbol(bits, precedingPhase, symbolIndex);
    let correlation = 0;
    for (let chip = 0; chip < 8; chip += 1) {
      correlation += received.real[chip]! * candidate.chips.real[chip]!
        + received.imaginary[chip]! * candidate.chips.imaginary[chip]!;
    }
    if (correlation > bestCorrelation) {
      bestByte = byte;
      bestPhase = candidate.phaseQuarterTurns;
      bestCorrelation = correlation;
    }
  }
  return {
    bits: Uint8Array.from({ length: 8 }, (_, bit) => (bestByte >>> bit) & 1),
    phaseQuarterTurns: bestPhase,
    correlation: bestCorrelation,
  };
}

function phaseOfLastBarkerSymbol(ppdu: ReturnType<typeof buildWifiHrDsssFixedPpdu>): number {
  const firstChip = 191 * 11;
  const real = ppdu.chips.real[firstChip]!;
  const imaginary = ppdu.chips.imaginary[firstChip]!;
  if (real === 1) return 0;
  if (imaginary === 1) return 1;
  if (real === -1) return 2;
  if (imaginary === -1) return 3;
  throw new Error('Last Barker symbol is not on an exact quadrature phase');
}
