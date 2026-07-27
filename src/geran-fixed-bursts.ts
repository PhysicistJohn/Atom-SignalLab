/**
 * Fixed, transmission-order GERAN modulator inputs.
 *
 * Geometry and training sequences are from 3GPP TS 45.002 V19.0.0,
 * clauses 5.2.3.1, 5.2.3.2, 5.2.3.3 and 5.2.3a. The four xCCH eB vectors
 * are the independently encoded/decoded dummy L2 block printed by the
 * pinned libosmocore coding oracle identified below. The higher-order
 * profiles intentionally stop at the TS 45.002 modulator-input boundary:
 * their encrypted fields are frozen all-zero inputs, not a claim that a
 * TS 45.003 channel encoder for those formats has been qualified here.
 */

export const GERAN_LIBOSMOCORE_ORACLE = Object.freeze({
  repository: 'https://gitea.osmocom.org/osmocom/libosmocore',
  commit: 'a9ea438f2d3ee85167bc7ec90ae3c010e47ded92',
  codingSourceSha256: '98ad47a01b09fa8b9a66bdf51be5d622a3b9672a6dc63260e31c9c88588198d7',
  mappingSourceSha256: '82eb0428a40030139a8423bbbc504b4d00c08cef0e8d353f6d052b2c67992a38',
  testSourceSha256: 'bbc33be9692c8f3777807c6c3b26335ddd3861187a1c7f6454cdb7b7fc0dbb6b',
  testOutputSha256: '41ec1663f121fb5ad98a6210222a484e4c890be144859e025cfddbe4172e4514',
  l2DummyFrameHex: '0303010000000000000000000000000000000000000000',
  function: 'gsm0503_xcch_encode/gsm0503_xcch_decode',
} as const);

export const GERAN_GMSK_TSC0_SET1 = '00100101110000100010010111' as const;
export const GERAN_GMSK_TSC0_SET2 = '01100010001001001111010111' as const;

/**
 * TS 45.002 table 3a TSC0, written as transmission-order 8PSK input bits.
 * Each semicolon-delimited group in the specification contributes one symbol.
 */
export const GERAN_8PSK_TSC0 = joinGroups(
  '111;111;001;111;111;001;111;001;001;001;111;111;111;111;001;111;111;111;001;111;111;001;111;001;001;001',
);

/** TS 45.002 higher-symbol-rate TSC0 rows, in transmission order. */
export const GERAN_HIGHER_QPSK_TSC0 = joinGroups(
  '00;11;00;00;11;00;00;00;11;00;11;11;11;11;11;11;11;00;00;11;00;11;11;11;11;00;00;11;11;11;00',
);
export const GERAN_HIGHER_16QAM_TSC0 = joinGroups(
  '0011;1111;0011;0011;1111;0011;0011;0011;1111;0011;1111;1111;1111;1111;1111;1111;1111;0011;0011;1111;0011;1111;1111;1111;1111;0011;0011;1111;1111;1111;0011',
);
export const GERAN_HIGHER_32QAM_TSC0 = joinGroups(
  '10010;00000;10010;10010;00000;10010;10010;10010;00000;10010;00000;00000;00000;00000;00000;00000;00000;10010;10010;00000;10010;00000;00000;00000;00000;10010;10010;00000;00000;00000;10010',
);

/**
 * TS 45.002 clause 5.2.6 dummy-burst mixed bits. The three zero tail bits
 * at either end are added below.
 */
export const GERAN_DUMMY_MIXED_BITS =
  '1111101101110110000010100100111000001001000100000001111100011100010111000101110001010111010010100011001100111001111010011111000100101111101010' as const;

/**
 * Four xCCH encoded-burst (eB) vectors printed by the pinned libosmocore
 * coding test for the fixed 23-octet dummy L2 frame above. eB[57] and eB[58]
 * are the two stealing flags; physical normal-burst mapping puts the first
 * before TSC0 and the second after TSC0.
 */
export const GERAN_XCCH_EB_BITS = Object.freeze([
  '10000001000010000000010000000000000000000010100001000000111010000100000010000001000000101000010100000000000001000000',
  '00000001001000000001000000001000000100001010000100000000011000000100000010000101000000000000000000001000000000001000',
  '00000000001000000001000010000000000000101000010100001010011001000000101000000001001010000000000000100000010100001000',
  '01010000001000000000000010000001000000000000000000001000011000010010000000010000001000000001000000000001000000000000',
] as const);

export const GERAN_XCCH_NORMAL_BURSTS = Object.freeze(
  GERAN_XCCH_EB_BITS.map((encodedBurst) =>
    `000${encodedBurst.slice(0, 58)}${GERAN_GMSK_TSC0_SET1}${encodedBurst.slice(58)}000`),
);

export const GERAN_GMSK_DUMMY_BURST = `000${GERAN_DUMMY_MIXED_BITS}000` as const;

const AQPSK_SUBCHANNEL_A = GERAN_XCCH_NORMAL_BURSTS[0]!;
const AQPSK_SUBCHANNEL_B =
  `${AQPSK_SUBCHANNEL_A.slice(0, 61)}${GERAN_GMSK_TSC0_SET2}${AQPSK_SUBCHANNEL_A.slice(87)}`;

export const GERAN_AQPSK_NORMAL_BURST = interleaveBits(AQPSK_SUBCHANNEL_A, AQPSK_SUBCHANNEL_B);
export const GERAN_8PSK_NORMAL_BURST =
  `111111111${zeroBits(174)}${GERAN_8PSK_TSC0}${zeroBits(174)}111111111`;
export const GERAN_HIGHER_QPSK_BURST =
  `00011110${zeroBits(138)}${GERAN_HIGHER_QPSK_TSC0}${zeroBits(138)}00011110`;
export const GERAN_HIGHER_16QAM_BURST =
  `0001011001101101${zeroBits(276)}${GERAN_HIGHER_16QAM_TSC0}${zeroBits(276)}0001011001101101`;
export const GERAN_HIGHER_32QAM_BURST =
  `11110111100111001110${zeroBits(345)}${GERAN_HIGHER_32QAM_TSC0}${zeroBits(345)}11110111100111001110`;

export type GeranFixedBurstProfile =
  | 'gsm-900-loaded-bcch'
  | 'gsm-normal-burst'
  | 'gsm-qpsk-higher-symbol-rate-burst'
  | 'gsm-aqpsk-normal-burst'
  | 'gsm-8psk-normal-burst'
  | 'gsm-16qam-higher-symbol-rate-burst'
  | 'gsm-32qam-higher-symbol-rate-burst';

export type GeranDigitalValidation =
  | 'libosmocore-xcch-encode-decode-oracle'
  | 'ts-equation-and-symbol-roundtrip-only-unpromoted';

export interface GeranFixedBurstVector {
  readonly profile: GeranFixedBurstProfile;
  readonly format:
    | 'normal-gmsk'
    | 'normal-aqpsk'
    | 'normal-8psk'
    | 'higher-qpsk'
    | 'higher-16qam'
    | 'higher-32qam';
  readonly bitsPerSymbol: 1 | 2 | 3 | 4 | 5;
  readonly activeSymbols: 148 | 177;
  readonly tailBitsPerSide: number;
  readonly encryptedBitsPerSide: number;
  readonly trainingBits: string;
  readonly bits: string;
  /** SHA-256 of the transmission-order bit string encoded as UTF-8 '0'/'1'. */
  readonly bitSha256: string;
  readonly digitalValidation: GeranDigitalValidation;
  readonly channelCodingClaim: 'pinned-xcch-dummy-frame' | 'none-modulator-input-only';
}

function vector(
  value: GeranFixedBurstVector,
): Readonly<GeranFixedBurstVector> {
  assertVectorGeometry(value);
  return Object.freeze(value);
}

export const GERAN_FIXED_BURST_VECTORS: Readonly<Record<GeranFixedBurstProfile, Readonly<GeranFixedBurstVector>>> =
  Object.freeze({
    'gsm-900-loaded-bcch': vector({
      profile: 'gsm-900-loaded-bcch',
      format: 'normal-gmsk',
      bitsPerSymbol: 1,
      activeSymbols: 148,
      tailBitsPerSide: 3,
      encryptedBitsPerSide: 58,
      trainingBits: GERAN_GMSK_TSC0_SET1,
      bits: GERAN_XCCH_NORMAL_BURSTS[0]!,
      bitSha256: '214f926e6a302ba5ddfce7aad66055c0ea49db7f7fd002a2b988f55bb239044e',
      digitalValidation: 'libosmocore-xcch-encode-decode-oracle',
      channelCodingClaim: 'pinned-xcch-dummy-frame',
    }),
    'gsm-normal-burst': vector({
      profile: 'gsm-normal-burst',
      format: 'normal-gmsk',
      bitsPerSymbol: 1,
      activeSymbols: 148,
      tailBitsPerSide: 3,
      encryptedBitsPerSide: 58,
      trainingBits: GERAN_GMSK_TSC0_SET1,
      bits: GERAN_XCCH_NORMAL_BURSTS[0]!,
      bitSha256: '214f926e6a302ba5ddfce7aad66055c0ea49db7f7fd002a2b988f55bb239044e',
      digitalValidation: 'libosmocore-xcch-encode-decode-oracle',
      channelCodingClaim: 'pinned-xcch-dummy-frame',
    }),
    'gsm-qpsk-higher-symbol-rate-burst': vector({
      profile: 'gsm-qpsk-higher-symbol-rate-burst',
      format: 'higher-qpsk',
      bitsPerSymbol: 2,
      activeSymbols: 177,
      tailBitsPerSide: 8,
      encryptedBitsPerSide: 138,
      trainingBits: GERAN_HIGHER_QPSK_TSC0,
      bits: GERAN_HIGHER_QPSK_BURST,
      bitSha256: '089781fd4c1ce505c7dffb8ce4a5ec26a788a8bb0b1c94b3a11d8c4de6457a72',
      digitalValidation: 'ts-equation-and-symbol-roundtrip-only-unpromoted',
      channelCodingClaim: 'none-modulator-input-only',
    }),
    'gsm-aqpsk-normal-burst': vector({
      profile: 'gsm-aqpsk-normal-burst',
      format: 'normal-aqpsk',
      bitsPerSymbol: 2,
      activeSymbols: 148,
      tailBitsPerSide: 6,
      encryptedBitsPerSide: 116,
      trainingBits: interleaveBits(GERAN_GMSK_TSC0_SET1, GERAN_GMSK_TSC0_SET2),
      bits: GERAN_AQPSK_NORMAL_BURST,
      bitSha256: 'e658442c4f50a49546fe1c64b2b4c232c5a6ff94b3355be8758ce1993cca0ad6',
      digitalValidation: 'ts-equation-and-symbol-roundtrip-only-unpromoted',
      channelCodingClaim: 'none-modulator-input-only',
    }),
    'gsm-8psk-normal-burst': vector({
      profile: 'gsm-8psk-normal-burst',
      format: 'normal-8psk',
      bitsPerSymbol: 3,
      activeSymbols: 148,
      tailBitsPerSide: 9,
      encryptedBitsPerSide: 174,
      trainingBits: GERAN_8PSK_TSC0,
      bits: GERAN_8PSK_NORMAL_BURST,
      bitSha256: '0ed4adae27afa5d6676da3db08e47adf649422d0a8ee2b9a15f474359ace58e1',
      digitalValidation: 'ts-equation-and-symbol-roundtrip-only-unpromoted',
      channelCodingClaim: 'none-modulator-input-only',
    }),
    'gsm-16qam-higher-symbol-rate-burst': vector({
      profile: 'gsm-16qam-higher-symbol-rate-burst',
      format: 'higher-16qam',
      bitsPerSymbol: 4,
      activeSymbols: 177,
      tailBitsPerSide: 16,
      encryptedBitsPerSide: 276,
      trainingBits: GERAN_HIGHER_16QAM_TSC0,
      bits: GERAN_HIGHER_16QAM_BURST,
      bitSha256: 'c5c8051deb7358208f8791038b1af33dde68e7773ea64467e18e37a872e6b89b',
      digitalValidation: 'ts-equation-and-symbol-roundtrip-only-unpromoted',
      channelCodingClaim: 'none-modulator-input-only',
    }),
    'gsm-32qam-higher-symbol-rate-burst': vector({
      profile: 'gsm-32qam-higher-symbol-rate-burst',
      format: 'higher-32qam',
      bitsPerSymbol: 5,
      activeSymbols: 177,
      tailBitsPerSide: 20,
      encryptedBitsPerSide: 345,
      trainingBits: GERAN_HIGHER_32QAM_TSC0,
      bits: GERAN_HIGHER_32QAM_BURST,
      bitSha256: 'b46c7e5c3352086bc0c51f3f820c62c03ddea38c7a85540946523b002f54cb89',
      digitalValidation: 'ts-equation-and-symbol-roundtrip-only-unpromoted',
      channelCodingClaim: 'none-modulator-input-only',
    }),
  });

export const GERAN_XCCH_NORMAL_BURST_SHA256 = Object.freeze([
  '214f926e6a302ba5ddfce7aad66055c0ea49db7f7fd002a2b988f55bb239044e',
  '08fa784ce92926917b0ebbd8f291ab12bd9f4f2ff1543f281c68d4c3ff35304d',
  '905e838a9a1ad9b5263fe8b5b1d64da3af0b9e9f5ec141938cd3fbffa1fd26b1',
  'd11f29dafdc70f3e0d857fa82e1a72196d56b804a9bfac5951bc98f21c13d1b5',
] as const);

export const GERAN_GMSK_DUMMY_BURST_SHA256 =
  '72bb16900a7243fdeb3813546e7a4125780f91d9fa07db4d78476453e7e8e6c3' as const;

export interface GeranScheduledBurst {
  readonly profile: GeranFixedBurstProfile;
  readonly slotIndex: number;
  readonly timeslot: number;
  readonly frameIndex: number;
  readonly kind: 'normal-xcch' | 'dummy' | 'fixed-modulator-input';
  readonly bitsPerSymbol: 1 | 2 | 3 | 4 | 5;
  readonly activeSymbols: 148 | 177;
  readonly bits: string;
  readonly bitSha256: string;
}

/**
 * Deterministic fixed schedule used by the analytic generator.
 *
 * The loaded profile transmits an independently encoded xCCH normal burst in
 * TS0 (cycling the four bursts of one block) and the exact TS 45.002 dummy
 * burst in TS1..TS7. The six burst profiles transmit only in TS0. This is a
 * concrete valid-burst schedule, not a universal BCCH/51-multiframe model.
 */
export function geranScheduledBurst(
  profile: GeranFixedBurstProfile,
  slotIndex: number,
): GeranScheduledBurst | undefined {
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) {
    throw new RangeError('GERAN slot index must be a non-negative safe integer');
  }
  const timeslot = slotIndex % 8;
  const frameIndex = Math.floor(slotIndex / 8);
  if (profile === 'gsm-900-loaded-bcch') {
    if (timeslot === 0) {
      const burstIndex = frameIndex % GERAN_XCCH_NORMAL_BURSTS.length;
      return Object.freeze({
        profile,
        slotIndex,
        timeslot,
        frameIndex,
        kind: 'normal-xcch',
        bitsPerSymbol: 1,
        activeSymbols: 148,
        bits: GERAN_XCCH_NORMAL_BURSTS[burstIndex]!,
        bitSha256: GERAN_XCCH_NORMAL_BURST_SHA256[burstIndex]!,
      });
    }
    return Object.freeze({
      profile,
      slotIndex,
      timeslot,
      frameIndex,
      kind: 'dummy',
      bitsPerSymbol: 1,
      activeSymbols: 148,
      bits: GERAN_GMSK_DUMMY_BURST,
      bitSha256: GERAN_GMSK_DUMMY_BURST_SHA256,
    });
  }
  if (timeslot !== 0) return undefined;
  if (profile === 'gsm-normal-burst') {
    const burstIndex = frameIndex % GERAN_XCCH_NORMAL_BURSTS.length;
    return Object.freeze({
      profile,
      slotIndex,
      timeslot,
      frameIndex,
      kind: 'normal-xcch',
      bitsPerSymbol: 1,
      activeSymbols: 148,
      bits: GERAN_XCCH_NORMAL_BURSTS[burstIndex]!,
      bitSha256: GERAN_XCCH_NORMAL_BURST_SHA256[burstIndex]!,
    });
  }
  const fixed = GERAN_FIXED_BURST_VECTORS[profile];
  return Object.freeze({
    profile,
    slotIndex,
    timeslot,
    frameIndex,
    kind: 'fixed-modulator-input',
    bitsPerSymbol: fixed.bitsPerSymbol,
    activeSymbols: fixed.activeSymbols,
    bits: fixed.bits,
    bitSha256: fixed.bitSha256,
  });
}

function assertVectorGeometry(value: GeranFixedBurstVector): void {
  assertBits(`${value.profile} burst`, value.bits, value.activeSymbols * value.bitsPerSymbol);
  assertBits(`${value.profile} training`, value.trainingBits);
  if (value.format === 'normal-aqpsk') {
    const first = deinterleaveBits(value.bits, 0);
    const second = deinterleaveBits(value.bits, 1);
    assertNormalGmskFields(`${value.profile} subchannel A`, first, GERAN_GMSK_TSC0_SET1);
    assertNormalGmskFields(`${value.profile} subchannel B`, second, GERAN_GMSK_TSC0_SET2);
    if (value.trainingBits !== interleaveBits(GERAN_GMSK_TSC0_SET1, GERAN_GMSK_TSC0_SET2)) {
      throw new Error(`${value.profile} AQPSK training-sequence declaration drifted`);
    }
    return;
  }

  const expectedTail = value.bits.slice(0, value.tailBitsPerSide);
  if (value.bits.slice(-value.tailBitsPerSide) !== expectedTail) {
    throw new Error(`${value.profile} tail fields differ`);
  }
  const trainingStart = value.tailBitsPerSide + value.encryptedBitsPerSide;
  if (value.bits.slice(trainingStart, trainingStart + value.trainingBits.length) !== value.trainingBits) {
    throw new Error(`${value.profile} training field is not at the TS 45.002 boundary`);
  }
  if (value.format === 'normal-gmsk') {
    assertNormalGmskFields(value.profile, value.bits, GERAN_GMSK_TSC0_SET1);
  }
}

function assertNormalGmskFields(label: string, value: string, training: string): void {
  assertBits(label, value, 148);
  if (!value.startsWith('000') || !value.endsWith('000')) {
    throw new Error(`${label} must have three zero GMSK tail bits on each side`);
  }
  if (value.slice(61, 87) !== training) {
    throw new Error(`${label} does not contain the selected 26-bit training sequence`);
  }
}

function assertBits(label: string, value: string, expectedLength?: number): void {
  if (!/^[01]+$/.test(value)) throw new Error(`${label} must contain only binary digits`);
  if (expectedLength !== undefined && value.length !== expectedLength) {
    throw new Error(`${label} must contain ${expectedLength} bits; received ${value.length}`);
  }
}

function zeroBits(length: number): string {
  return '0'.repeat(length);
}

function joinGroups(value: string): string {
  return value.replaceAll(';', '');
}

function interleaveBits(first: string, second: string): string {
  if (first.length !== second.length) throw new Error('GERAN interleave inputs must have equal length');
  let result = '';
  for (let index = 0; index < first.length; index += 1) {
    result += first[index]! + second[index]!;
  }
  return result;
}

function deinterleaveBits(value: string, lane: 0 | 1): string {
  let result = '';
  for (let index = lane; index < value.length; index += 2) result += value[index]!;
  return result;
}
