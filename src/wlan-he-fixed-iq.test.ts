import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WIFI_HE_FIXED_PROFILE_IDS,
  WIFI_HE_LTF_4X_20MHZ,
  buildWifiHeFixedPpdu,
  crc8AmpduDelimiter,
  type HeSplitComplexSequence,
  type WifiHeFixedPpdu,
  type WifiHeFixedProfileId,
  type WifiHeRu,
} from './wlan-he-fixed-iq.js';

const PRE_HE_DATA_CARRIERS = [
  -28, -27,
  -26, -25, -24, -23, -22,
  -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8,
  -6, -5, -4, -3, -2, -1,
  1, 2, 3, 4, 5, 6,
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  22, 23, 24, 25, 26,
  27, 28,
] as const;

const LEGACY_DATA_CARRIERS = PRE_HE_DATA_CARRIERS.slice(2, 50);
const HE_STF_M = [-1, -1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1, -1, 1] as const;
const LTF_SEQUENCE_SHA256 =
  'cda08b96c57a3872ae3870f9ec4a89c91b6e4acca38fe210ec0192dd40f66c2b';
const DIRECT_DFT_TWIDDLES = new Map<number, {
  readonly cosine: Float64Array;
  readonly sine: Float64Array;
}>();

const EXPECTED = Object.freeze({
  'wifi6-he-su': Object.freeze({
    samples: 10_640,
    microseconds: 532,
    lSigLength: 379,
    heSigASymbols: 2,
    heSigBSymbols: 0,
    heStfSamples: 80,
    rus: ['242'] as const,
  }),
  'wifi6-he-er-su': Object.freeze({
    samples: 6_960,
    microseconds: 348,
    lSigLength: 242,
    heSigASymbols: 4,
    heSigBSymbols: 0,
    heStfSamples: 80,
    rus: ['106-right'] as const,
  }),
  'wifi6-he-mu': Object.freeze({
    samples: 7_040,
    microseconds: 352,
    lSigLength: 245,
    heSigASymbols: 2,
    heSigBSymbols: 3,
    heStfSamples: 80,
    rus: ['106-left', '106-right'] as const,
  }),
  'wifi6-he-tb': Object.freeze({
    samples: 6_880,
    microseconds: 344,
    lSigLength: 238,
    heSigASymbols: 2,
    heSigBSymbols: 0,
    heStfSamples: 160,
    rus: ['106-right'] as const,
  }),
});

describe('IEEE 802.11-2024 Clause 27 fixed HE PPDUs', () => {
  it('uses a local direct DFT and imports no production FFT primitive', () => {
    const source = readFileSync(
      new URL('./wlan-he-fixed-iq.test.ts', import.meta.url),
      'utf8',
    );
    const productionDspPackage = ['@atomos', 'dsp'].join('/');
    const productionFftSymbol = ['fftForward', 'UnscaledInPlace'].join('');
    expect(source).not.toContain(productionDspPackage);
    expect(source).not.toContain(productionFftSymbol);
    const implementation = forwardDft.toString();
    expect(implementation).toContain('frequencyBin');
    expect(implementation).toContain('timeSample');
    expect(implementation).toContain('Math.cos');
    expect(implementation).toContain('Math.sin');
  });

  it('constructs four concrete complete 20 MHz PPDUs with exact field timing', () => {
    for (const profile of WIFI_HE_FIXED_PROFILE_IDS) {
      const ppdu = buildWifiHeFixedPpdu(profile);
      const expected = EXPECTED[profile];
      expect(ppdu).toMatchObject({
        profile,
        sampleRateHz: 20_000_000,
        fftSize: 256,
        guardIntervalSamples: 64,
        heLtfType: 4,
        modulation: 'BPSK',
        codeRate: '1/2',
        mcs: 0,
        lSigLength: expected.lSigLength,
        metadata: {
          channelBandwidthMHz: 20,
          dataOfdmSymbols: profile === 'wifi6-he-su' ? 30 : 18,
          heSigASymbols: expected.heSigASymbols,
          heSigBSymbols: expected.heSigBSymbols,
          heStfSamples: expected.heStfSamples,
          heLtfSymbols: 1,
          heLtfSamples: 320,
          packetExtensionSamples: 0,
          totalSamples: expected.samples,
          packetDurationMicroseconds: expected.microseconds,
          bssColor: 1,
          qualification: 'independently-verified-digital-baseband',
        },
      });
      expect(ppdu.users.map((user) => user.ru)).toEqual(expected.rus);
      expect(ppdu.timeDomain.real).toHaveLength(expected.samples);
      expect(ppdu.timeDomain.imaginary).toHaveLength(expected.samples);
      expect(ppdu.cf32le).toHaveLength(expected.samples * 8);
      expect(
        ((expected.microseconds - 20) / 4) * 3
          - 3
          - (profile === 'wifi6-he-mu' || profile === 'wifi6-he-er-su' ? 1 : 2),
      ).toBe(expected.lSigLength);
    }
  });

  it('DFT-recovers and independently decodes L-SIG and RL-SIG from every rendered PPDU', () => {
    for (const profile of WIFI_HE_FIXED_PROFILE_IDS) {
      const ppdu = buildWifiHeFixedPpdu(profile);
      const lSig = recoverPreHeSymbol(ppdu, 320);
      const rlSig = recoverPreHeSymbol(ppdu, 400);
      const recovered: Uint8Array[] = [];
      for (const frequency of [lSig, rlSig]) {
        expect(PRE_HE_DATA_CARRIERS.slice(0, 2).map((carrier) =>
          signOf(frequency.real[bin(carrier, 64)]!))).toEqual([-1, -1]);
        expect(PRE_HE_DATA_CARRIERS.slice(50).map((carrier) =>
          signOf(frequency.real[bin(carrier, 64)]!))).toEqual([-1, 1]);
        const mapped = Uint8Array.from(
          LEGACY_DATA_CARRIERS,
          (carrier) => hardBit(frequency.real[bin(carrier, 64)]!),
        );
        const coded = inverseRectangularInterleave(mapped, 16, 3);
        const bits = viterbiDecodeTerminated(coded);
        recovered.push(bits);
        expect([...bits.subarray(0, 4)]).toEqual([1, 1, 0, 1]);
        expect(bits[4]).toBe(0);
        expect(unsignedLsb(bits.subarray(5, 17))).toBe(ppdu.lSigLength);
        expect(xor(bits.subarray(0, 18))).toBe(0);
        expect([...bits.subarray(18)]).toEqual([0, 0, 0, 0, 0, 0]);
      }
      expect(recovered[1]).toEqual(recovered[0]);
      if (profile === 'wifi6-he-er-su') {
        const normalMagnitude = Math.abs(lSig.real[bin(-26, 64)]!);
        const extraMagnitude = Math.abs(lSig.real[bin(-28, 64)]!);
        expect(extraMagnitude / normalMagnitude).toBeCloseTo(Math.sqrt(2), 11);
      }
    }
  });

  it('DFT-recovers HE-SIG-A, reverses ER repetition/QBPSK, and validates every field and CRC', () => {
    for (const profile of WIFI_HE_FIXED_PROFILE_IDS) {
      const ppdu = buildWifiHeFixedPpdu(profile);
      const symbols = Array.from(
        { length: ppdu.metadata.heSigASymbols },
        (_, symbol) => recoverPreHeSymbol(ppdu, 480 + symbol * 80),
      );
      let coded: Uint8Array;
      if (profile === 'wifi6-he-er-su') {
        const a1 = inverseRectangularInterleave(preHeHardBits(symbols[0]!, false), 13, 4);
        const a2 = preHeHardBits(symbols[1]!, true);
        const a3 = inverseRectangularInterleave(preHeHardBits(symbols[2]!, false), 13, 4);
        const a4 = preHeHardBits(symbols[3]!, false);
        expect(a2).toEqual(a1);
        expect(a4).toEqual(a3);
        coded = concatenate(a1, a3);
      } else {
        coded = concatenate(...symbols.map((symbol) =>
          inverseRectangularInterleave(preHeHardBits(symbol, false), 13, 4)));
      }
      const bits = viterbiDecodeTerminated(coded);
      expect(bits).toHaveLength(52);
      expect(bits.subarray(42, 46)).toEqual(independentHeSigCrc4(bits.subarray(0, 42)));
      expect([...bits.subarray(46)]).toEqual([0, 0, 0, 0, 0, 0]);
      expect(bits).toEqual(ppdu.heSigAUncodedBits);
      expectHeSigAFields(profile, bits, ppdu);
    }
  });

  it('decodes the real three-symbol HE-SIG-B common and two-user blocks in the MU PPDU', () => {
    const ppdu = buildWifiHeFixedPpdu('wifi6-he-mu');
    const sigBStart = 480 + ppdu.metadata.heSigASymbols * 80;
    const mapped = concatenate(...Array.from({ length: 3 }, (_, symbol) => {
      const hard = preHeHardBits(recoverPreHeSymbol(ppdu, sigBStart + symbol * 80), false);
      for (let index = 26; index < 52; index += 2) {
        hard[index + 1] = hard[index + 1]! ^ 1;
      }
      return inverseRectangularInterleave(hard, 13, 4);
    }));
    expect(mapped).toHaveLength(156);

    const common = viterbiDecodeTerminated(mapped.subarray(0, 36));
    const users = viterbiDecodeTerminated(mapped.subarray(36));
    expect(common).toHaveLength(18);
    expect(users).toHaveLength(60);
    expect(unsignedLsb(common.subarray(0, 8))).toBe(0x60);
    expect(common.subarray(8, 12)).toEqual(independentHeSigCrc4(common.subarray(0, 8)));
    expect([...common.subarray(12)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(users.subarray(42, 46)).toEqual(independentHeSigCrc4(users.subarray(0, 42)));
    expect([...users.subarray(46, 52)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...users.subarray(52)]).toEqual(new Array(8).fill(0));
    for (let user = 0; user < 2; user += 1) {
      const field = users.subarray(user * 21, (user + 1) * 21);
      expect(unsignedLsb(field.subarray(0, 11))).toBe(user + 1);
      expect(unsignedLsb(field.subarray(11, 14))).toBe(0);
      expect(field[14]).toBe(0);
      expect(unsignedLsb(field.subarray(15, 19))).toBe(0);
      expect(field[19]).toBe(0);
      expect(field[20]).toBe(0);
    }
    expect(concatenate(common, users)).toEqual(ppdu.heSigBUncodedBits);
  });

  it('DFT-demodulates, deinterleaves, Viterbi-decodes, and descrambles every HE Data user', () => {
    for (const profile of WIFI_HE_FIXED_PROFILE_IDS) {
      const ppdu = buildWifiHeFixedPpdu(profile);
      const dataStart = heDataStart(ppdu);
      for (const user of ppdu.users) {
        const dataCarriers = ruDataCarriers(user.ru);
        const rows = user.ru === '242' ? 9 : 6;
        const columns = user.ru === '242' ? 26 : 17;
        const interleaved = concatenate(...Array.from(
          { length: ppdu.metadata.dataOfdmSymbols },
          (_, symbol) => {
            const frequency = recoverHeSymbol(ppdu, dataStart + symbol * 320);
            return Uint8Array.from(
              dataCarriers,
              (carrier) => hardBit(frequency.real[bin(carrier, 256)]!),
            );
          },
        ));
        const coded = inverseRectangularInterleave(interleaved, columns, rows);
        const scrambled = viterbiDecodeTerminated(coded);
        const tailStart = 16 + user.psdu.length * 8;
        expect([...scrambled.subarray(tailStart, tailStart + 6)])
          .toEqual([0, 0, 0, 0, 0, 0]);
        const descrambled = independentScramble(scrambled, user.scramblerInitialState);
        expect([...descrambled.subarray(0, 16)]).toEqual(new Array(16).fill(0));
        const psdu = bitsToBytes(descrambled.subarray(16, 16 + user.psdu.length * 8));
        expect(psdu).toEqual(user.psdu);
        validateSingleMpduAmpdu(psdu, user.mpdu);
      }
    }
  });

  it('matches the published EOF A-MPDU delimiter CRC check vector', () => {
    const protectedOctets = Uint8Array.from([0x01, 0x00]);
    expect(independentDelimiterCrc(protectedOctets)).toBe(0x79);
    expect(crc8AmpduDelimiter(protectedOctets)).toBe(0x79);
  });

  it('checks the HE-STF periodicities and the exact rendered HE-LTF/RU grids', () => {
    const ltfHash = sha256(Uint8Array.from(
      WIFI_HE_LTF_4X_20MHZ,
      (value) => value < 0 ? 0xff : value,
    ));
    expect(ltfHash).toBe(LTF_SEQUENCE_SHA256);

    for (const profile of WIFI_HE_FIXED_PROFILE_IDS) {
      const ppdu = buildWifiHeFixedPpdu(profile);
      const stfStart = 480
        + ppdu.metadata.heSigASymbols * 80
        + ppdu.metadata.heSigBSymbols * 80;
      const period = profile === 'wifi6-he-tb' ? 32 : 16;
      for (let sample = period; sample < ppdu.metadata.heStfSamples; sample += 1) {
        expect(ppdu.timeDomain.real[stfStart + sample])
          .toBeCloseTo(ppdu.timeDomain.real[stfStart + sample % period]!, 13);
        expect(ppdu.timeDomain.imaginary[stfStart + sample])
          .toBeCloseTo(ppdu.timeDomain.imaginary[stfStart + sample % period]!, 13);
      }
      const stfFrequency = recoverPeriodicHeStf(ppdu, stfStart, period);
      expectStfGrid(profile, stfFrequency);

      const ltfFrequency = recoverHeSymbol(ppdu, stfStart + ppdu.metadata.heStfSamples);
      const allowed = new Set(ppdu.users.flatMap((user) => ruTones(user.ru)));
      for (let carrier = -128; carrier < 128; carrier += 1) {
        const recovered = ltfFrequency.real[bin(carrier, 256)]!;
        const expected = carrier >= -122 && carrier <= 122 && allowed.has(carrier)
          ? WIFI_HE_LTF_4X_20MHZ[carrier + 122]!
          : 0;
        if (expected === 0) {
          expect(Math.abs(recovered)).toBeLessThan(1e-11);
        } else {
          expect(signOf(recovered)).toBe(expected);
        }
        expect(Math.abs(ltfFrequency.imaginary[bin(carrier, 256)]!)).toBeLessThan(1e-11);
      }
    }
  });

  it('parses the concrete Basic Trigger that completely determines the HE TB TXVECTOR', () => {
    const ppdu = buildWifiHeFixedPpdu('wifi6-he-tb');
    const trigger = ppdu.trigger;
    expect(trigger).toBeDefined();
    if (trigger === undefined) return;
    expect(trigger.frame).toHaveLength(34);
    expect(trigger.frameWithoutFcs).toHaveLength(30);
    expect([...trigger.frame.subarray(0, 4)]).toEqual([0x24, 0x00, 0x68, 0x01]);
    expect(independentCrc32(trigger.frameWithoutFcs)).toBe(
      unsignedLsbBytes(trigger.frame.subarray(30, 34)),
    );

    const common = unsignedLsbBigInt(trigger.commonInfo);
    expect(Number(common & 0xfn)).toBe(0);
    expect(Number((common >> 4n) & 0xfffn)).toBe(ppdu.lSigLength);
    expect(Number((common >> 18n) & 0x3n)).toBe(0);
    expect(Number((common >> 20n) & 0x3n)).toBe(2);
    expect(Number((common >> 23n) & 0x7n)).toBe(0);
    expect(Number((common >> 28n) & 0x3fn)).toBe(20);
    expect(Number((common >> 34n) & 0x3n)).toBe(0);
    expect(Number((common >> 36n) & 0x1n)).toBe(0);
    expect(Number((common >> 37n) & 0xffffn)).toBe(0);
    expect(Number((common >> 54n) & 0x1ffn)).toBe(0x1ff);

    const user = unsignedLsbBigInt(trigger.userInfo.subarray(0, 5));
    expect(Number(user & 0xfffn)).toBe(1);
    expect(Number((user >> 12n) & 0xffn)).toBe(54);
    expect(Number((user >> 20n) & 1n)).toBe(0);
    expect(Number((user >> 21n) & 0xfn)).toBe(0);
    expect(Number((user >> 25n) & 1n)).toBe(0);
    expect(Number((user >> 26n) & 0x7n)).toBe(0);
    expect(Number((user >> 29n) & 0x7n)).toBe(0);
    expect(Number((user >> 32n) & 0x7fn)).toBe(0x7f);
    expect(trigger.userInfo[5]).toBe(0);
    expect(trigger).toMatchObject({
      aid12: 1,
      bandwidthMHz: 20,
      giMicroseconds: 3.2,
      heLtfType: 4,
      ruAllocation: 54,
      ru: '106-right',
      coding: 'BCC',
      mcs: 0,
      nss: 1,
    });
  });

  it('pins the four complete cf32le artifacts by content hash', () => {
    const hashes = Object.fromEntries(WIFI_HE_FIXED_PROFILE_IDS.map((profile) => [
      profile,
      sha256(buildWifiHeFixedPpdu(profile).cf32le),
    ]));
    expect(hashes).toEqual({
      'wifi6-he-su': '640fd2bfe140511d14ac9f9583ceadbe86e904e2759fb154bc5fc1fc002e7453',
      'wifi6-he-er-su': '9b183de8f31f5002c3d03fbe39bf4d68477e67a69b04e06ba4008e6ffceec74f',
      'wifi6-he-mu': '5f403d8407c1d02177c59dd03333599c4ebf658af9a936fa790ccd8930b63392',
      'wifi6-he-tb': 'b465c7a7a56c537b17d7f2e0aa7dd996591d7e5a3b1bcdc2503bb167becdf789',
    });
  });
});

function expectHeSigAFields(
  profile: WifiHeFixedProfileId,
  bits: Uint8Array,
  ppdu: WifiHeFixedPpdu,
): void {
  if (profile === 'wifi6-he-su' || profile === 'wifi6-he-er-su') {
    expect(bits[0]).toBe(1);
    expect(bits[1]).toBe(0);
    expect(bits[2]).toBe(0);
    expect(unsignedLsb(bits.subarray(3, 7))).toBe(0);
    expect(bits[7]).toBe(0);
    expect(unsignedLsb(bits.subarray(8, 14))).toBe(1);
    expect(bits[14]).toBe(1);
    expect(unsignedLsb(bits.subarray(15, 19))).toBe(0);
    expect(unsignedLsb(bits.subarray(19, 21))).toBe(profile === 'wifi6-he-er-su' ? 1 : 0);
    expect(unsignedLsb(bits.subarray(21, 23))).toBe(3);
    expect(unsignedLsb(bits.subarray(23, 26))).toBe(0);
    expect(unsignedLsb(bits.subarray(26, 33))).toBe(127);
    expect([...bits.subarray(33, 42)]).toEqual([0, 1, 0, 0, 0, 0, 0, 1, 0]);
    return;
  }
  if (profile === 'wifi6-he-mu') {
    expect(unsignedLsb(bits.subarray(0, 5))).toBe(0);
    expect(unsignedLsb(bits.subarray(5, 11))).toBe(1);
    expect(unsignedLsb(bits.subarray(11, 18))).toBe(0);
    expect(unsignedLsb(bits.subarray(18, 22))).toBe(2);
    expect(bits[22]).toBe(0);
    expect(unsignedLsb(bits.subarray(23, 25))).toBe(3);
    expect(bits[25]).toBe(0);
    expect(unsignedLsb(bits.subarray(26, 33))).toBe(127);
    expect(bits[33]).toBe(1);
    expect(unsignedLsb(bits.subarray(34, 37))).toBe(0);
    expect(bits[37]).toBe(1);
    expect([...bits.subarray(38, 42)]).toEqual([0, 0, 0, 0]);
    expect(ppdu.heSigBFrequencyDomainSymbols).toHaveLength(3);
    return;
  }
  expect(bits[0]).toBe(0);
  expect(unsignedLsb(bits.subarray(1, 7))).toBe(1);
  expect(unsignedLsb(bits.subarray(7, 23))).toBe(0);
  expect(bits[23]).toBe(1);
  expect(unsignedLsb(bits.subarray(24, 26))).toBe(0);
  expect(unsignedLsb(bits.subarray(26, 33))).toBe(127);
  expect([...bits.subarray(33, 42)]).toEqual(new Array(9).fill(1));
}

function validateSingleMpduAmpdu(psdu: Uint8Array, expectedMpdu: Uint8Array): void {
  const length = psdu[0]! | ((psdu[1]! & 0x3f) << 8);
  expect(length).toBe(expectedMpdu.length);
  expect((psdu[1]! >>> 6) & 1).toBe(0);
  expect((psdu[1]! >>> 7) & 1).toBe(1);
  expect(psdu[2]).toBe(independentDelimiterCrc(psdu.subarray(0, 2)));
  expect(psdu[3]).toBe(0x4e);
  expect(psdu.subarray(4, 4 + length)).toEqual(expectedMpdu);
  expect([...psdu.subarray(4 + length)]).toEqual(
    new Array((4 - ((4 + length) % 4)) % 4).fill(0),
  );
  const mpduBody = expectedMpdu.subarray(0, -4);
  expect(independentCrc32(mpduBody)).toBe(unsignedLsbBytes(expectedMpdu.subarray(-4)));
  expect(expectedMpdu[0]).toBe(0x88);
}

function recoverPreHeSymbol(ppdu: WifiHeFixedPpdu, start: number): HeSplitComplexSequence {
  return forwardDft(
    ppdu.timeDomain.real.subarray(start + 16, start + 80),
    ppdu.timeDomain.imaginary.subarray(start + 16, start + 80),
  );
}

function recoverHeSymbol(ppdu: WifiHeFixedPpdu, start: number): HeSplitComplexSequence {
  return forwardDft(
    ppdu.timeDomain.real.subarray(start + 64, start + 320),
    ppdu.timeDomain.imaginary.subarray(start + 64, start + 320),
  );
}

function recoverPeriodicHeStf(
  ppdu: WifiHeFixedPpdu,
  start: number,
  period: number,
): HeSplitComplexSequence {
  const real = Float64Array.from(
    { length: 256 },
    (_, sample) => ppdu.timeDomain.real[start + sample % period]!,
  );
  const imaginary = Float64Array.from(
    { length: 256 },
    (_, sample) => ppdu.timeDomain.imaginary[start + sample % period]!,
  );
  return forwardDft(real, imaginary);
}

function forwardDft(realInput: Float64Array, imaginaryInput: Float64Array): HeSplitComplexSequence {
  if (realInput.length !== imaginaryInput.length || realInput.length === 0) {
    throw new RangeError('Direct DFT inputs must have equal non-zero lengths');
  }
  const length = realInput.length;
  let twiddles = DIRECT_DFT_TWIDDLES.get(length);
  if (twiddles === undefined) {
    const cosine = new Float64Array(length * length);
    const sine = new Float64Array(length * length);
    for (let frequencyBin = 0; frequencyBin < length; frequencyBin += 1) {
      for (let timeSample = 0; timeSample < length; timeSample += 1) {
        const index = frequencyBin * length + timeSample;
        const angle = 2 * Math.PI * frequencyBin * timeSample / length;
        cosine[index] = Math.cos(angle);
        sine[index] = Math.sin(angle);
      }
    }
    twiddles = { cosine, sine };
    DIRECT_DFT_TWIDDLES.set(length, twiddles);
  }

  const real = new Float64Array(length);
  const imaginary = new Float64Array(length);
  for (let frequencyBin = 0; frequencyBin < length; frequencyBin += 1) {
    let realSum = 0;
    let imaginarySum = 0;
    const rowOffset = frequencyBin * length;
    for (let timeSample = 0; timeSample < length; timeSample += 1) {
      const cosine = twiddles.cosine[rowOffset + timeSample]!;
      const sine = twiddles.sine[rowOffset + timeSample]!;
      const inputReal = realInput[timeSample]!;
      const inputImaginary = imaginaryInput[timeSample]!;
      realSum += inputReal * cosine + inputImaginary * sine;
      imaginarySum += inputImaginary * cosine - inputReal * sine;
    }
    real[frequencyBin] = realSum;
    imaginary[frequencyBin] = imaginarySum;
  }
  return { real, imaginary };
}

function preHeHardBits(
  frequency: HeSplitComplexSequence,
  quadrature: boolean,
): Uint8Array {
  return Uint8Array.from(PRE_HE_DATA_CARRIERS, (carrier) =>
    hardBit((quadrature ? frequency.imaginary : frequency.real)[bin(carrier, 64)]!));
}

function expectStfGrid(
  profile: WifiHeFixedProfileId,
  frequency: HeSplitComplexSequence,
): void {
  const allowed = new Set(buildWifiHeFixedPpdu(profile).users.flatMap((user) => ruTones(user.ru)));
  const expected = new Map<number, number>();
  if (profile === 'wifi6-he-tb') {
    const values = [...HE_STF_M, 0, ...HE_STF_M.map((value) => -value)];
    for (let index = 0; index < values.length; index += 1) {
      const carrier = -120 + index * 8;
      if (allowed.has(carrier) && values[index] !== 0) expected.set(carrier, values[index]!);
    }
  } else {
    for (let index = 0; index < HE_STF_M.length; index += 1) {
      const carrier = -112 + index * 16;
      if (carrier !== 0 && allowed.has(carrier)) expected.set(carrier, HE_STF_M[index]!);
    }
  }
  for (let carrier = -128; carrier < 128; carrier += 1) {
    const real = frequency.real[bin(carrier, 256)]!;
    const imaginary = frequency.imaginary[bin(carrier, 256)]!;
    const value = expected.get(carrier);
    if (value === undefined) {
      expect(Math.hypot(real, imaginary)).toBeLessThan(1e-10);
    } else {
      expect(signOf(real)).toBe(value);
      expect(signOf(imaginary)).toBe(value);
      expect(Math.abs(real)).toBeCloseTo(Math.abs(imaginary), 11);
    }
  }
}

function heDataStart(ppdu: WifiHeFixedPpdu): number {
  return 480
    + ppdu.metadata.heSigASymbols * 80
    + ppdu.metadata.heSigBSymbols * 80
    + ppdu.metadata.heStfSamples
    + ppdu.metadata.heLtfSamples;
}

function ruTones(ru: WifiHeRu): number[] {
  if (ru === '106-left') return range(-122, -17);
  if (ru === '106-right') return range(17, 122);
  return [...range(-122, -2), ...range(2, 122)];
}

function ruDataCarriers(ru: WifiHeRu): number[] {
  const pilots = new Set(ru === '242'
    ? [-116, -90, -48, -22, 22, 48, 90, 116]
    : ru === '106-left'
      ? [-116, -90, -48, -22]
      : [22, 48, 90, 116]);
  return ruTones(ru).filter((carrier) => !pilots.has(carrier));
}

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function inverseRectangularInterleave(
  interleaved: Uint8Array,
  columns: number,
  rows: number,
): Uint8Array {
  const perSymbol = columns * rows;
  if (interleaved.length % perSymbol !== 0) throw new RangeError('Incomplete symbol');
  const output = new Uint8Array(interleaved.length);
  for (let symbol = 0; symbol < interleaved.length / perSymbol; symbol += 1) {
    const offset = symbol * perSymbol;
    for (let outputIndex = 0; outputIndex < perSymbol; outputIndex += 1) {
      const inputIndex = columns * (outputIndex % rows) + Math.floor(outputIndex / rows);
      output[offset + inputIndex] = interleaved[offset + outputIndex]!;
    }
  }
  return output;
}

function viterbiDecodeTerminated(coded: Uint8Array): Uint8Array {
  if (coded.length % 2 !== 0) throw new RangeError('Rate-1/2 code requires bit pairs');
  const steps = coded.length / 2;
  let metrics = new Float64Array(64);
  metrics.fill(Number.POSITIVE_INFINITY);
  metrics[0] = 0;
  const predecessor = new Uint8Array(steps * 64);
  const decision = new Uint8Array(steps * 64);
  for (let step = 0; step < steps; step += 1) {
    const next = new Float64Array(64);
    next.fill(Number.POSITIVE_INFINITY);
    for (let state = 0; state < 64; state += 1) {
      if (!Number.isFinite(metrics[state]!)) continue;
      for (let input = 0; input <= 1; input += 1) {
        const register = ((state << 1) & 0x7e) | input;
        const nextState = register & 0x3f;
        const distance =
          Number(parity(register & 0o155) !== coded[step * 2])
          + Number(parity(register & 0o117) !== coded[step * 2 + 1]);
        const candidate = metrics[state]! + distance;
        if (candidate < next[nextState]!) {
          next[nextState] = candidate;
          predecessor[step * 64 + nextState] = state;
          decision[step * 64 + nextState] = input;
        }
      }
    }
    metrics = next;
  }
  expect(metrics[0]).toBe(0);
  const output = new Uint8Array(steps);
  let state = 0;
  for (let step = steps - 1; step >= 0; step -= 1) {
    output[step] = decision[step * 64 + state]!;
    state = predecessor[step * 64 + state]!;
  }
  expect(state).toBe(0);
  return output;
}

function independentHeSigCrc4(bits: Uint8Array): Uint8Array {
  let register = [1, 1, 1, 1];
  for (const bit of bits) {
    const feedback = register[0]! ^ bit;
    register = [
      register[1]!,
      register[2]!,
      register[3]! ^ feedback,
      feedback,
    ];
  }
  return Uint8Array.from(register, (bit) => bit ^ 1);
}

function independentScramble(bits: Uint8Array, seed: number): Uint8Array {
  const state = Array.from({ length: 7 }, (_, index) => (seed >>> (6 - index)) & 1);
  const output = new Uint8Array(bits.length);
  for (let index = 0; index < bits.length; index += 1) {
    const feedback = state[0]! ^ state[3]!;
    output[index] = bits[index]! ^ feedback;
    state.shift();
    state.push(feedback);
  }
  return output;
}

function independentDelimiterCrc(bytes: Uint8Array): number {
  let register = 0xff;
  for (const byte of bytes) {
    for (let bit = 0; bit < 8; bit += 1) {
      const feedback = (register & 1) ^ ((byte >>> bit) & 1);
      register >>>= 1;
      if (feedback !== 0) register ^= 0xe0;
    }
  }
  return register ^ 0xff;
}

function independentCrc32(bytes: Uint8Array): number {
  let register = 0xffff_ffff;
  for (const byte of bytes) {
    register ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const lsb = register & 1;
      register >>>= 1;
      if (lsb !== 0) register ^= 0xedb8_8320;
    }
  }
  return (register ^ 0xffff_ffff) >>> 0;
}

function bitsToBytes(bits: Uint8Array): Uint8Array {
  if (bits.length % 8 !== 0) throw new RangeError('Expected octet-aligned bits');
  return Uint8Array.from(
    { length: bits.length / 8 },
    (_, octet) => unsignedLsb(bits.subarray(octet * 8, (octet + 1) * 8)),
  );
}

function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function hardBit(value: number): number {
  if (Math.abs(value) < 1e-12) throw new RangeError('Cannot decide a null tone');
  return value > 0 ? 1 : 0;
}

function signOf(value: number): number {
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : -1;
}

function unsignedLsb(bits: Uint8Array): number {
  return bits.reduce((value, bit, index) => value + bit * 2 ** index, 0);
}

function unsignedLsbBytes(bytes: Uint8Array): number {
  return bytes.reduce((value, byte, index) => value + byte * 2 ** (index * 8), 0) >>> 0;
}

function unsignedLsbBigInt(bytes: Uint8Array): bigint {
  return bytes.reduce(
    (value, byte, index) => value | (BigInt(byte) << BigInt(index * 8)),
    0n,
  );
}

function xor(bits: Uint8Array): number {
  return bits.reduce((value, bit) => value ^ bit, 0);
}

function parity(value: number): number {
  let result = 0;
  for (let bit = 0; bit < 8; bit += 1) result ^= (value >>> bit) & 1;
  return result;
}

function bin(carrier: number, fftSize: number): number {
  return carrier < 0 ? fftSize + carrier : carrier;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
