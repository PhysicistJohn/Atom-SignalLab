import {
  fftForwardUnscaledInPlace,
  writeUnitBoundedCf32le,
} from '@atomos/dsp';

export const WIFI_HE_SAMPLE_RATE_HZ = 20_000_000 as const;
export const WIFI_HE_FFT_SIZE = 256 as const;
export const WIFI_HE_GUARD_INTERVAL_SAMPLES = 64 as const;
export const WIFI_HE_LTF_TYPE = 4 as const;
export const WIFI_HE_SCRAMBLER_INITIAL_STATE = 93 as const;
export const WIFI_HE_SU_CF32LE_SHA256 =
  '640fd2bfe140511d14ac9f9583ceadbe86e904e2759fb154bc5fc1fc002e7453' as const;
export const WIFI_HE_ER_SU_CF32LE_SHA256 =
  '9b183de8f31f5002c3d03fbe39bf4d68477e67a69b04e06ba4008e6ffceec74f' as const;
export const WIFI_HE_MU_CF32LE_SHA256 =
  '5f403d8407c1d02177c59dd03333599c4ebf658af9a936fa790ccd8930b63392' as const;
export const WIFI_HE_TB_CF32LE_SHA256 =
  'b465c7a7a56c537b17d7f2e0aa7dd996591d7e5a3b1bcdc2503bb167becdf789' as const;

export const WIFI_HE_FIXED_PROFILE_IDS = [
  'wifi6-he-su',
  'wifi6-he-er-su',
  'wifi6-he-mu',
  'wifi6-he-tb',
] as const;

export type WifiHeFixedProfileId = typeof WIFI_HE_FIXED_PROFILE_IDS[number];
export type WifiHeRu = '242' | '106-left' | '106-right';

export interface HeSplitComplexSequence {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
}

export interface WifiHeFixedUser {
  readonly staId: number;
  readonly ru: WifiHeRu;
  readonly psdu: Uint8Array;
  readonly mpdu: Uint8Array;
  readonly scramblerInitialState: number;
  readonly dataUncodedBits: Uint8Array;
  readonly dataScrambledBits: Uint8Array;
  readonly dataCodedBits: Uint8Array;
  readonly dataInterleavedBits: Uint8Array;
  readonly frequencyDomainSymbols: readonly HeSplitComplexSequence[];
}

export interface WifiHeFixedTrigger {
  readonly frame: Uint8Array;
  readonly frameWithoutFcs: Uint8Array;
  readonly commonInfo: Uint8Array;
  readonly userInfo: Uint8Array;
  readonly aid12: 1;
  readonly ulLength: number;
  readonly bandwidthMHz: 20;
  readonly giMicroseconds: 3.2;
  readonly heLtfType: 4;
  readonly ruAllocation: 54;
  readonly ru: '106-right';
  readonly coding: 'BCC';
  readonly mcs: 0;
  readonly nss: 1;
}

export interface WifiHeFixedPpdu {
  readonly profile: WifiHeFixedProfileId;
  readonly sampleRateHz: typeof WIFI_HE_SAMPLE_RATE_HZ;
  readonly fftSize: typeof WIFI_HE_FFT_SIZE;
  readonly guardIntervalSamples: typeof WIFI_HE_GUARD_INTERVAL_SAMPLES;
  readonly heLtfType: typeof WIFI_HE_LTF_TYPE;
  readonly modulation: 'BPSK';
  readonly codeRate: '1/2';
  readonly mcs: 0;
  readonly lSigLength: number;
  readonly lSigUncodedBits: Uint8Array;
  readonly heSigAUncodedBits: Uint8Array;
  readonly heSigACodedBits: Uint8Array;
  readonly heSigAFrequencyDomainSymbols: readonly HeSplitComplexSequence[];
  readonly heSigBUncodedBits: Uint8Array | undefined;
  readonly heSigBCodedBits: Uint8Array | undefined;
  readonly heSigBFrequencyDomainSymbols: readonly HeSplitComplexSequence[];
  readonly heStfFrequencyDomain: HeSplitComplexSequence;
  readonly heLtfFrequencyDomain: HeSplitComplexSequence;
  readonly users: readonly WifiHeFixedUser[];
  readonly combinedDataFrequencyDomainSymbols: readonly HeSplitComplexSequence[];
  readonly trigger: WifiHeFixedTrigger | undefined;
  readonly timeDomain: HeSplitComplexSequence;
  readonly cf32le: Uint8Array;
  readonly metadata: {
    readonly channelBandwidthMHz: 20;
    readonly dataOfdmSymbols: number;
    readonly heSigASymbols: 2 | 4;
    readonly heSigBSymbols: number;
    readonly heStfSamples: 80 | 160;
    readonly heLtfSymbols: 1;
    readonly heLtfSamples: 320;
    readonly packetExtensionSamples: 0;
    readonly totalSamples: number;
    readonly packetDurationMicroseconds: number;
    readonly bssColor: 1;
    readonly qualification: 'independently-verified-digital-baseband';
    readonly disclosure: string;
  };
}

interface HeUserConfig {
  readonly staId: number;
  readonly ru: WifiHeRu;
  readonly mpduOctets: number;
  readonly uplink: boolean;
  readonly scramblerInitialState: number;
}

interface HeProfileConfig {
  readonly profile: WifiHeFixedProfileId;
  readonly users: readonly HeUserConfig[];
  readonly heSigASymbols: 2 | 4;
  readonly heSigBSymbols: number;
  readonly heStfSamples: 80 | 160;
  readonly dataSymbols: number;
  readonly lSigLength: number;
  readonly erSu: boolean;
  readonly tb: boolean;
}

const LEGACY_DATA_CARRIERS = Object.freeze([
  -26, -25, -24, -23, -22,
  -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8,
  -6, -5, -4, -3, -2, -1,
  1, 2, 3, 4, 5, 6,
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  22, 23, 24, 25, 26,
]);

const PRE_HE_DATA_CARRIERS = Object.freeze([
  -28, -27,
  ...LEGACY_DATA_CARRIERS,
  27, 28,
]);

const LEGACY_PILOT_CARRIERS = Object.freeze([-21, -7, 7, 21]);
const LEGACY_PILOT_POLARITY = Object.freeze([
  1, 1, 1, 1, -1, -1, -1, 1, -1, -1, -1, -1, 1, 1, -1, 1,
  -1, -1, 1, 1, -1, 1, 1, -1, 1, 1, 1, 1, 1, 1, -1, 1,
  1, 1, -1, 1, 1, -1, -1, 1, 1, 1, -1, 1, -1, -1, -1, 1,
  -1, 1, -1, -1, 1, -1, -1, 1, 1, 1, 1, 1, -1, -1, 1, 1,
  -1, -1, 1, -1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, -1, -1,
  -1, 1, -1, -1, 1, -1, 1, 1, 1, 1, -1, 1, -1, 1, -1, 1,
  -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, 1, 1, 1, -1,
  -1, 1, -1, -1, -1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1,
]);

const LEGACY_SHORT_TRAINING_SHIFTED = Object.freeze([
  0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, -1, 0, 0, 0,
  1, 0, 0, 0, -1, 0, 0, 0,
  -1, 0, 0, 0, 1, 0, 0, 0,
  0, 0, 0, 0, -1, 0, 0, 0,
  -1, 0, 0, 0, 1, 0, 0, 0,
  1, 0, 0, 0, 1, 0, 0, 0,
  1, 0, 0, 0, 0, 0, 0, 0,
]);

const LEGACY_LONG_TRAINING_SHIFTED = Object.freeze([
  0, 0, 0, 0, 0, 0,
  1, 1, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, 1, 1, 1, -1,
  -1, 1, 1, -1, 1, -1, 1, 1, 1, 1,
  0,
  1, -1, -1, 1, 1, -1, 1, -1, 1, -1, -1, -1, -1, -1, 1,
  1, -1, -1, 1, -1, 1, -1, 1, 1, 1, 1,
  0, 0, 0, 0, 0,
]);

const HE_STF_M = Object.freeze([
  -1, -1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1, -1, 1,
]);

// IEEE P802.11ax/D1.0 Equation (28-39), retained unchanged in the
// published 802.11ax HE 20 MHz 4x HE-LTF definition. Indices are -122:122.
export const WIFI_HE_LTF_4X_20MHZ = Object.freeze([
  -1, -1, 1, -1, 1, -1, 1, 1, 1, -1, 1, 1, 1, -1, -1, 1,
  -1, -1, -1, -1, -1, 1, 1, -1, -1, -1, -1, 1, 1, -1, 1, -1,
  1, 1, 1, 1, -1, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1,
  -1, 1, -1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, -1,
  1, -1, -1, 1, 1, -1, 1, -1, -1, -1, -1, 1, -1, 1, -1, -1,
  -1, -1, -1, -1, 1, 1, -1, -1, -1, -1, -1, 1, -1, -1, 1, 1,
  1, -1, 1, 1, 1, -1, 1, -1, 1, -1, -1, -1, -1, -1, 1, 1,
  1, -1, -1, -1, 1, -1, 1, 1, 1, 0, 0, 0, -1, 1, -1, 1,
  -1, 1, 1, -1, 1, 1, 1, -1, -1, 1, -1, -1, 1, -1, 1, -1,
  1, 1, 1, -1, 1, 1, 1, -1, -1, 1, -1, -1, -1, -1, -1, 1,
  1, -1, -1, -1, -1, -1, -1, 1, -1, 1, -1, -1, -1, -1, 1, -1,
  1, 1, -1, -1, 1, -1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1,
  1, 1, 1, -1, 1, 1, -1, -1, -1, -1, 1, -1, -1, 1, 1, -1,
  1, -1, -1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, -1,
  1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, -1, -1, -1, 1,
  -1, 1, -1, 1, 1,
]);

const HE_PILOTS_106_LEFT = Object.freeze([-116, -90, -48, -22]);
const HE_PILOTS_106_RIGHT = Object.freeze([22, 48, 90, 116]);
const HE_PILOTS_242 = Object.freeze([-116, -90, -48, -22, 22, 48, 90, 116]);
const HE_PILOT_VALUES_106 = Object.freeze([1, 1, 1, -1]);
const HE_PILOT_VALUES_242 = Object.freeze([1, 1, 1, -1, -1, 1, 1, 1]);

const HE_PROFILE_CONFIGS: Readonly<Record<WifiHeFixedProfileId, HeProfileConfig>> =
  Object.freeze({
    'wifi6-he-su': Object.freeze({
      profile: 'wifi6-he-su',
      users: Object.freeze([
        Object.freeze({
          staId: 1,
          ru: '242',
          mpduOctets: 432,
          uplink: false,
          scramblerInitialState: WIFI_HE_SCRAMBLER_INITIAL_STATE,
        }),
      ]),
      heSigASymbols: 2,
      heSigBSymbols: 0,
      heStfSamples: 80,
      dataSymbols: 30,
      lSigLength: 379,
      erSu: false,
      tb: false,
    }),
    'wifi6-he-er-su': Object.freeze({
      profile: 'wifi6-he-er-su',
      users: Object.freeze([
        Object.freeze({
          staId: 1,
          ru: '106-right',
          mpduOctets: 108,
          uplink: false,
          scramblerInitialState: WIFI_HE_SCRAMBLER_INITIAL_STATE,
        }),
      ]),
      heSigASymbols: 4,
      heSigBSymbols: 0,
      heStfSamples: 80,
      dataSymbols: 18,
      lSigLength: 242,
      erSu: true,
      tb: false,
    }),
    'wifi6-he-mu': Object.freeze({
      profile: 'wifi6-he-mu',
      users: Object.freeze([
        Object.freeze({
          staId: 1,
          ru: '106-left',
          mpduOctets: 108,
          uplink: false,
          scramblerInitialState: WIFI_HE_SCRAMBLER_INITIAL_STATE,
        }),
        Object.freeze({
          staId: 2,
          ru: '106-right',
          mpduOctets: 108,
          uplink: false,
          scramblerInitialState: 71,
        }),
      ]),
      heSigASymbols: 2,
      heSigBSymbols: 3,
      heStfSamples: 80,
      dataSymbols: 18,
      lSigLength: 245,
      erSu: false,
      tb: false,
    }),
    'wifi6-he-tb': Object.freeze({
      profile: 'wifi6-he-tb',
      users: Object.freeze([
        Object.freeze({
          staId: 1,
          ru: '106-right',
          mpduOctets: 108,
          uplink: true,
          scramblerInitialState: WIFI_HE_SCRAMBLER_INITIAL_STATE,
        }),
      ]),
      heSigASymbols: 2,
      heSigBSymbols: 0,
      heStfSamples: 160,
      dataSymbols: 18,
      lSigLength: 238,
      erSu: false,
      tb: true,
    }),
  });

const cache = new Map<WifiHeFixedProfileId, WifiHeFixedPpdu>();

export function buildWifiHeFixedPpdu(profile: WifiHeFixedProfileId): WifiHeFixedPpdu {
  const existing = cache.get(profile);
  if (existing !== undefined) return existing;

  const config = HE_PROFILE_CONFIGS[profile];
  const lSigUncodedBits = buildLegacySignalBitsForLength(config.lSigLength);
  const lSigCodedBits = convolutionalEncodeRateOneHalf(lSigUncodedBits);
  const lSigInterleavedBits = interleaveRectangular(
    lSigCodedBits,
    16,
    3,
    1,
  );
  const lSigFrequency = mapLegacyHeSignalSymbol(
    lSigInterleavedBits,
    0,
    config.erSu,
  );
  const rlSigFrequency = mapLegacyHeSignalSymbol(
    lSigInterleavedBits,
    1,
    config.erSu,
  );

  const heSigAUncodedBits = buildHeSigABits(config);
  const heSigACodedBits = convolutionalEncodeRateOneHalf(heSigAUncodedBits);
  const heSigAFrequencyDomainSymbols = buildHeSigAFrequencySymbols(
    config,
    heSigACodedBits,
  );
  const heSigB = buildHeSigB(config);

  const heStfFrequencyDomain = buildHeStfFrequency(config);
  const heLtfFrequencyDomain = buildHeLtfFrequency(config);
  const users = config.users.map((user, index) => buildHeUser(config, user, index));
  const combinedDataFrequencyDomainSymbols = combineUserFrequencySymbols(
    users,
    config.dataSymbols,
  );
  const trigger = config.tb ? buildHeTbTrigger(config) : undefined;

  const timeDomain = renderHePpdu(
    config,
    lSigFrequency,
    rlSigFrequency,
    heSigAFrequencyDomainSymbols,
    heSigB.frequencySymbols,
    heStfFrequencyDomain,
    heLtfFrequencyDomain,
    combinedDataFrequencyDomainSymbols,
  );
  const cf32le = encodeCf32le(timeDomain);
  const totalSamples = timeDomain.real.length;
  const durationMicroseconds = totalSamples / 20;
  if (!Number.isInteger(durationMicroseconds)) {
    throw new Error(`${profile} duration is not an integer number of microseconds`);
  }
  if (legacyLengthForHeDuration(durationMicroseconds, config.profile) !== config.lSigLength) {
    throw new Error(`${profile} L-SIG length does not describe the rendered duration`);
  }

  const artifact: WifiHeFixedPpdu = Object.freeze({
    profile,
    sampleRateHz: WIFI_HE_SAMPLE_RATE_HZ,
    fftSize: WIFI_HE_FFT_SIZE,
    guardIntervalSamples: WIFI_HE_GUARD_INTERVAL_SAMPLES,
    heLtfType: WIFI_HE_LTF_TYPE,
    modulation: 'BPSK',
    codeRate: '1/2',
    mcs: 0,
    lSigLength: config.lSigLength,
    lSigUncodedBits,
    heSigAUncodedBits,
    heSigACodedBits,
    heSigAFrequencyDomainSymbols,
    heSigBUncodedBits: heSigB.uncodedBits,
    heSigBCodedBits: heSigB.codedBits,
    heSigBFrequencyDomainSymbols: heSigB.frequencySymbols,
    heStfFrequencyDomain,
    heLtfFrequencyDomain,
    users: Object.freeze(users),
    combinedDataFrequencyDomainSymbols,
    trigger,
    timeDomain,
    cf32le,
    metadata: Object.freeze({
      channelBandwidthMHz: 20,
      dataOfdmSymbols: config.dataSymbols,
      heSigASymbols: config.heSigASymbols,
      heSigBSymbols: config.heSigBSymbols,
      heStfSamples: config.heStfSamples,
      heLtfSymbols: 1,
      heLtfSamples: 320,
      packetExtensionSamples: 0,
      totalSamples,
      packetDurationMicroseconds: durationMicroseconds,
      bssColor: 1,
      qualification: 'independently-verified-digital-baseband',
      disclosure:
        'Clause-derived, fixed ideal 20 Msample/s HE digital baseband. Independent tests demodulate the rendered samples, decode BCC fields and data, validate CRC/FCS and A-MPDU structure, and check the exact HE tone grids. This content-bound result does not establish RF EVM/spectral-mask/power compliance, MAC channel access, interoperability, certification, or regulatory approval.',
    }),
  });
  cache.set(profile, artifact);
  return artifact;
}

export function buildWifiHeSuFixedPpdu(): WifiHeFixedPpdu {
  return buildWifiHeFixedPpdu('wifi6-he-su');
}

export function buildWifiHeErSuFixedPpdu(): WifiHeFixedPpdu {
  return buildWifiHeFixedPpdu('wifi6-he-er-su');
}

export function buildWifiHeMuFixedPpdu(): WifiHeFixedPpdu {
  return buildWifiHeFixedPpdu('wifi6-he-mu');
}

export function buildWifiHeTbFixedPpdu(): WifiHeFixedPpdu {
  return buildWifiHeFixedPpdu('wifi6-he-tb');
}

export function heSigCrc4(bits: Uint8Array): Uint8Array {
  let remainder = 0x0f;
  for (const bit of bits) {
    requireBit(bit);
    const feedback = ((remainder >>> 3) & 1) ^ bit;
    remainder = (remainder << 1) & 0x0f;
    if (feedback === 1) remainder ^= 0x03;
  }
  remainder ^= 0x0f;
  return Uint8Array.from([
    (remainder >>> 3) & 1,
    (remainder >>> 2) & 1,
    (remainder >>> 1) & 1,
    remainder & 1,
  ]);
}

export function crc8AmpduDelimiter(firstTwoOctets: Uint8Array): number {
  if (firstTwoOctets.length !== 2) {
    throw new RangeError('An A-MPDU delimiter CRC protects exactly two octets');
  }
  let remainder = 0xff;
  for (const byte of firstTwoOctets) {
    for (let bit = 0; bit < 8; bit += 1) {
      const feedback = (remainder & 1) ^ ((byte >>> bit) & 1);
      remainder >>>= 1;
      if (feedback === 1) remainder ^= 0xe0;
    }
  }
  return (remainder ^ 0xff) & 0xff;
}

function buildHeSigABits(config: HeProfileConfig): Uint8Array {
  const bits = new Uint8Array(52);
  if (config.profile === 'wifi6-he-su' || config.profile === 'wifi6-he-er-su') {
    bits[0] = 1; // HE SU / reserved-one for HE ER SU.
    bits[1] = 0; // Beam Change.
    bits[2] = 0; // DL.
    setUnsignedLsb(bits, 3, 4, 0); // MCS 0.
    bits[7] = 0; // No DCM.
    setUnsignedLsb(bits, 8, 6, 1); // BSS Color 1.
    bits[14] = 1;
    setUnsignedLsb(bits, 15, 4, 0); // Spatial reuse disallowed.
    setUnsignedLsb(bits, 19, 2, config.erSu ? 1 : 0);
    setUnsignedLsb(bits, 21, 2, 3); // 4x HE-LTF, 3.2 us GI.
    setUnsignedLsb(bits, 23, 3, 0); // One space-time stream.
    setUnsignedLsb(bits, 26, 7, 127); // No TXOP duration information.
    bits[33] = 0; // BCC.
    bits[34] = 1; // Reserved-one for BCC.
    bits[35] = 0; // No STBC.
    bits[36] = 0; // No TxBF.
    setUnsignedLsb(bits, 37, 2, 0); // Pre-FEC padding factor 4.
    bits[39] = 0; // No PE disambiguity.
    bits[40] = 1;
    bits[41] = 0; // No Doppler.
  } else if (config.profile === 'wifi6-he-mu') {
    bits[0] = 0; // DL.
    setUnsignedLsb(bits, 1, 3, 0); // HE-SIG-B MCS 0.
    bits[4] = 0; // HE-SIG-B DCM disabled.
    setUnsignedLsb(bits, 5, 6, 1);
    setUnsignedLsb(bits, 11, 4, 0);
    setUnsignedLsb(bits, 15, 3, 0); // 20 MHz.
    setUnsignedLsb(bits, 18, 4, config.heSigBSymbols - 1);
    bits[22] = 0; // No HE-SIG-B compression.
    setUnsignedLsb(bits, 23, 2, 3); // 4x HE-LTF, 3.2 us GI.
    bits[25] = 0;
    setUnsignedLsb(bits, 26, 7, 127);
    bits[33] = 1;
    setUnsignedLsb(bits, 34, 3, 0); // One HE-LTF symbol.
    bits[37] = 1; // Reserved-one because every user uses BCC.
    bits[38] = 0;
    setUnsignedLsb(bits, 39, 2, 0);
    bits[41] = 0;
  } else {
    bits[0] = 0; // HE TB.
    setUnsignedLsb(bits, 1, 6, 1);
    setUnsignedLsb(bits, 7, 16, 0);
    bits[23] = 1;
    setUnsignedLsb(bits, 24, 2, 0);
    setUnsignedLsb(bits, 26, 7, 127);
    bits.fill(1, 33, 42); // Values copied from the Basic Trigger Common Info.
  }
  bits.set(heSigCrc4(bits.subarray(0, 42)), 42);
  return bits;
}

function buildHeSigAFrequencySymbols(
  config: HeProfileConfig,
  coded: Uint8Array,
): readonly HeSplitComplexSequence[] {
  if (coded.length !== 104) throw new Error('HE-SIG-A must contain 104 coded bits');
  const first = coded.subarray(0, 52);
  const second = coded.subarray(52);
  const firstInterleaved = interleaveRectangular(first, 13, 4, 1);
  const secondInterleaved = interleaveRectangular(second, 13, 4, 1);
  if (!config.erSu) {
    return Object.freeze([
      mapPreHeBpskSymbol(firstInterleaved, 2, false, false, false),
      mapPreHeBpskSymbol(secondInterleaved, 3, false, false, false),
    ]);
  }
  return Object.freeze([
    mapPreHeBpskSymbol(firstInterleaved, 2, false, false, false),
    mapPreHeBpskSymbol(first, 3, false, true, false),
    mapPreHeBpskSymbol(secondInterleaved, 4, false, false, false),
    mapPreHeBpskSymbol(second, 5, false, false, false),
  ]);
}

function buildHeSigB(config: HeProfileConfig): {
  readonly uncodedBits: Uint8Array | undefined;
  readonly codedBits: Uint8Array | undefined;
  readonly frequencySymbols: readonly HeSplitComplexSequence[];
} {
  if (config.profile !== 'wifi6-he-mu') {
    return Object.freeze({
      uncodedBits: undefined,
      codedBits: undefined,
      frequencySymbols: Object.freeze([]),
    });
  }

  const commonInformation = new Uint8Array(8);
  setUnsignedLsb(commonInformation, 0, 8, 0x60); // Two 106-tone RUs, one user in each.
  const commonUncoded = concatenateBits(
    commonInformation,
    heSigCrc4(commonInformation),
    new Uint8Array(6),
  );
  const commonCoded = convolutionalEncodeRateOneHalf(commonUncoded);

  const userInformation = new Uint8Array(42);
  for (let user = 0; user < 2; user += 1) {
    const offset = user * 21;
    setUnsignedLsb(userInformation, offset, 11, config.users[user]!.staId);
    setUnsignedLsb(userInformation, offset + 11, 3, 0);
    userInformation[offset + 14] = 0;
    setUnsignedLsb(userInformation, offset + 15, 4, 0);
    userInformation[offset + 19] = 0;
    userInformation[offset + 20] = 0;
  }
  const userUncoded = concatenateBits(
    userInformation,
    heSigCrc4(userInformation),
    new Uint8Array(6),
    new Uint8Array(8),
  );
  const userCoded = convolutionalEncodeRateOneHalf(userUncoded);
  const uncodedBits = concatenateBits(commonUncoded, userUncoded);
  const codedBits = concatenateBits(commonCoded, userCoded);

  const frequencySymbols: HeSplitComplexSequence[] = [];
  for (let symbol = 0; symbol < 3; symbol += 1) {
    const source = codedBits.subarray(symbol * 52, (symbol + 1) * 52);
    const interleaved = interleaveRectangular(source, 13, 4, 1);
    frequencySymbols.push(mapPreHeBpskSymbol(
      interleaved,
      symbol + 4,
      true,
      false,
      false,
    ));
  }
  return Object.freeze({
    uncodedBits,
    codedBits,
    frequencySymbols: Object.freeze(frequencySymbols),
  });
}

function buildHeUser(
  profile: HeProfileConfig,
  config: HeUserConfig,
  ordinal: number,
): WifiHeFixedUser {
  const mpdu = buildFixedQosDataMpdu(config.mpduOctets, config.uplink, ordinal);
  const psdu = buildSingleMpduAmpdu(mpdu);
  const expectedPsduOctets = config.ru === '242' ? 436 : 112;
  if (psdu.length !== expectedPsduOctets) {
    throw new Error(`${profile.profile} PSDU length changed`);
  }

  const nDbps = config.ru === '242' ? 117 : 51;
  const nCbps = config.ru === '242' ? 234 : 102;
  const dataUncodedBits = new Uint8Array(profile.dataSymbols * nDbps);
  if (16 + psdu.length * 8 + 6 !== dataUncodedBits.length) {
    throw new Error(`${profile.profile} fixed A-MPDU no longer exactly fills its HE data symbols`);
  }
  dataUncodedBits.set(bytesBitsLeastSignificantFirst(psdu), 16);
  const dataScrambledBits = scrambleBits(dataUncodedBits, config.scramblerInitialState);
  const tailStart = 16 + psdu.length * 8;
  dataScrambledBits.fill(0, tailStart, tailStart + 6);
  const dataCodedBits = convolutionalEncodeRateOneHalf(dataScrambledBits);
  const nCol = config.ru === '242' ? 26 : 17;
  const nRow = config.ru === '242' ? 9 : 6;
  const dataInterleavedBits = interleaveRectangular(
    dataCodedBits,
    nCol,
    nRow,
    profile.dataSymbols,
  );
  if (dataInterleavedBits.length !== profile.dataSymbols * nCbps) {
    throw new Error(`${profile.profile} coded bit geometry changed`);
  }

  const pilotOffset = profile.tb
    ? 4
    : 2 + profile.heSigASymbols + profile.heSigBSymbols;
  const frequencyDomainSymbols: HeSplitComplexSequence[] = [];
  for (let symbol = 0; symbol < profile.dataSymbols; symbol += 1) {
    frequencyDomainSymbols.push(mapHeDataSymbol(
      dataInterleavedBits.subarray(symbol * nCbps, (symbol + 1) * nCbps),
      config.ru,
      symbol,
      pilotOffset,
    ));
  }

  return Object.freeze({
    staId: config.staId,
    ru: config.ru,
    psdu,
    mpdu,
    scramblerInitialState: config.scramblerInitialState,
    dataUncodedBits,
    dataScrambledBits,
    dataCodedBits,
    dataInterleavedBits,
    frequencyDomainSymbols: Object.freeze(frequencyDomainSymbols),
  });
}

function buildFixedQosDataMpdu(
  octets: number,
  uplink: boolean,
  ordinal: number,
): Uint8Array {
  if (octets < 30) throw new RangeError('QoS Data MPDU must fit its header and FCS');
  const bodyWithoutFcs = new Uint8Array(octets - 4);
  bodyWithoutFcs[0] = 0x88;
  bodyWithoutFcs[1] = uplink ? 0x01 : 0x02;
  const ap = Uint8Array.from([0x02, 0, 0, 0, 0, 0x02]);
  const sta = Uint8Array.from([0x02, 0, 0, 0, 0, ordinal + 1]);
  bodyWithoutFcs.set(uplink ? ap : sta, 4);
  bodyWithoutFcs.set(uplink ? sta : ap, 10);
  bodyWithoutFcs.set(ap, 16);
  bodyWithoutFcs[22] = (ordinal << 4) & 0xf0;
  bodyWithoutFcs[23] = 0;
  bodyWithoutFcs[24] = 0;
  bodyWithoutFcs[25] = 0;
  for (let index = 26; index < bodyWithoutFcs.length; index += 1) {
    bodyWithoutFcs[index] = (0x31 + index * 17 + ordinal * 73) & 0xff;
  }
  return appendFcs(bodyWithoutFcs);
}

function buildSingleMpduAmpdu(mpdu: Uint8Array): Uint8Array {
  if (mpdu.length > 0x3fff) throw new RangeError('HE A-MPDU MPDU length exceeds 14 bits');
  const delimiterPrefix = Uint8Array.from([
    mpdu.length & 0xff,
    ((mpdu.length >>> 8) & 0x3f) | 0x80,
  ]);
  const delimiter = Uint8Array.from([
    ...delimiterPrefix,
    crc8AmpduDelimiter(delimiterPrefix),
    0x4e,
  ]);
  const padding = new Uint8Array((4 - ((delimiter.length + mpdu.length) % 4)) % 4);
  return concatenateBytes(delimiter, mpdu, padding);
}

function buildHeTbTrigger(config: HeProfileConfig): WifiHeFixedTrigger {
  let common = 0n;
  common |= BigInt(config.lSigLength & 0x0fff) << 4n;
  common |= 2n << 20n; // Final HE Trigger encoding for 4x HE-LTF + 3.2 us GI.
  common |= 20n << 28n; // 0 dBm AP transmit power: encoded value is dBm + 20.
  common |= 0x01ffn << 54n;
  const commonInfo = new Uint8Array(8);
  for (let octet = 0; octet < 8; octet += 1) {
    commonInfo[octet] = Number((common >> BigInt(octet * 8)) & 0xffn);
  }

  let user = 0;
  user |= 1;
  user |= 54 << 12;
  const userInfo = Uint8Array.from([
    user & 0xff,
    (user >>> 8) & 0xff,
    (user >>> 16) & 0xff,
    (user >>> 24) & 0xff,
    0x7f,
    0x00,
  ]);
  const frameWithoutFcs = concatenateBytes(
    Uint8Array.from([0x24, 0x00]),
    Uint8Array.from([0x68, 0x01]),
    Uint8Array.from([0x02, 0, 0, 0, 0, 0x01]),
    Uint8Array.from([0x02, 0, 0, 0, 0, 0x02]),
    commonInfo,
    userInfo,
  );
  return Object.freeze({
    frame: appendFcs(frameWithoutFcs),
    frameWithoutFcs,
    commonInfo,
    userInfo,
    aid12: 1,
    ulLength: config.lSigLength,
    bandwidthMHz: 20,
    giMicroseconds: 3.2,
    heLtfType: 4,
    ruAllocation: 54,
    ru: '106-right',
    coding: 'BCC',
    mcs: 0,
    nss: 1,
  });
}

function buildHeStfFrequency(config: HeProfileConfig): HeSplitComplexSequence {
  const real = new Float64Array(256);
  const imaginary = new Float64Array(256);
  const allowed = new Set(config.users.flatMap((user) => [...ruTones(user.ru)]));
  if (!config.tb) {
    for (let index = 0; index < HE_STF_M.length; index += 1) {
      const carrier = -112 + index * 16;
      if (carrier === 0 || !allowed.has(carrier)) continue;
      const value = HE_STF_M[index]! / Math.sqrt(2);
      real[carrierToFftBin(carrier, 256)] = value;
      imaginary[carrierToFftBin(carrier, 256)] = value;
    }
  } else {
    const values = [...HE_STF_M, 0, ...HE_STF_M.map((value) => -value)];
    for (let index = 0; index < values.length; index += 1) {
      const carrier = -120 + index * 8;
      if (!allowed.has(carrier)) continue;
      const value = values[index]! / Math.sqrt(2);
      real[carrierToFftBin(carrier, 256)] = value;
      imaginary[carrierToFftBin(carrier, 256)] = value;
    }
  }
  return Object.freeze({ real, imaginary });
}

function buildHeLtfFrequency(config: HeProfileConfig): HeSplitComplexSequence {
  const real = new Float64Array(256);
  const imaginary = new Float64Array(256);
  const allowed = new Set(config.users.flatMap((user) => [...ruTones(user.ru)]));
  for (let carrier = -122; carrier <= 122; carrier += 1) {
    if (!allowed.has(carrier)) continue;
    real[carrierToFftBin(carrier, 256)] = WIFI_HE_LTF_4X_20MHZ[carrier + 122]!;
  }
  return Object.freeze({ real, imaginary });
}

function mapHeDataSymbol(
  bits: Uint8Array,
  ru: WifiHeRu,
  symbol: number,
  pilotOffset: number,
): HeSplitComplexSequence {
  const tones = ruTones(ru);
  const pilots = ruPilots(ru);
  const pilotSet = new Set(pilots);
  const dataCarriers = tones.filter((carrier) => !pilotSet.has(carrier));
  if (bits.length !== dataCarriers.length) {
    throw new RangeError(`${ru} MCS 0 symbol requires ${dataCarriers.length} bits`);
  }
  const real = new Float64Array(256);
  const imaginary = new Float64Array(256);
  for (let index = 0; index < dataCarriers.length; index += 1) {
    const bit = bits[index]!;
    requireBit(bit);
    real[carrierToFftBin(dataCarriers[index]!, 256)] = bit === 0 ? -1 : 1;
  }
  const psi = ru === '242' ? HE_PILOT_VALUES_242 : HE_PILOT_VALUES_106;
  const polarity = LEGACY_PILOT_POLARITY[
    (symbol + pilotOffset) % LEGACY_PILOT_POLARITY.length
  ]!;
  for (let index = 0; index < pilots.length; index += 1) {
    real[carrierToFftBin(pilots[index]!, 256)] =
      polarity * psi[(symbol + index) % psi.length]!;
  }
  return Object.freeze({ real, imaginary });
}

function combineUserFrequencySymbols(
  users: readonly WifiHeFixedUser[],
  count: number,
): readonly HeSplitComplexSequence[] {
  const output: HeSplitComplexSequence[] = [];
  for (let symbol = 0; symbol < count; symbol += 1) {
    const real = new Float64Array(256);
    const imaginary = new Float64Array(256);
    for (const user of users) {
      const source = user.frequencyDomainSymbols[symbol]!;
      for (let index = 0; index < 256; index += 1) {
        real[index] = real[index]! + source.real[index]!;
        imaginary[index] = imaginary[index]! + source.imaginary[index]!;
      }
    }
    output.push(Object.freeze({ real, imaginary }));
  }
  return Object.freeze(output);
}

function mapPreHeBpskSymbol(
  bits: Uint8Array,
  pilotIndex: number,
  invertUpperHalf: boolean,
  quadratureBpsk: boolean,
  erExtraToneBoost: boolean,
): HeSplitComplexSequence {
  if (bits.length !== 52) throw new RangeError('HE preamble BPSK symbol requires 52 bits');
  const real = new Float64Array(64);
  const imaginary = new Float64Array(64);
  for (let index = 0; index < PRE_HE_DATA_CARRIERS.length; index += 1) {
    const bit = bits[index]!;
    requireBit(bit);
    let value = bit === 0 ? -1 : 1;
    // HE-SIG-B PAPR reduction uses Γ=1 for mapped data indices 0…25
    // and Γ=(-1)^m for mapped indices 26…51.
    if (invertUpperHalf && index >= 26 && index % 2 === 1) value = -value;
    const carrier = PRE_HE_DATA_CARRIERS[index]!;
    const boost = erExtraToneBoost && Math.abs(carrier) >= 27 ? Math.sqrt(2) : 1;
    if (quadratureBpsk) {
      imaginary[carrierToFftBin(carrier, 64)] = value * boost;
    } else {
      real[carrierToFftBin(carrier, 64)] = value * boost;
    }
  }
  const polarity = LEGACY_PILOT_POLARITY[pilotIndex % LEGACY_PILOT_POLARITY.length]!;
  const pilotValues = [polarity, polarity, polarity, -polarity];
  for (let pilot = 0; pilot < LEGACY_PILOT_CARRIERS.length; pilot += 1) {
    real[carrierToFftBin(LEGACY_PILOT_CARRIERS[pilot]!, 64)] = pilotValues[pilot]!;
  }
  return Object.freeze({ real, imaginary });
}

function mapLegacyHeSignalSymbol(
  bits: Uint8Array,
  pilotIndex: number,
  erExtraToneBoost: boolean,
): HeSplitComplexSequence {
  if (bits.length !== 48) {
    throw new RangeError('HE L-SIG/RL-SIG requires 48 interleaved coded bits');
  }
  const real = new Float64Array(64);
  const imaginary = new Float64Array(64);
  for (let index = 0; index < LEGACY_DATA_CARRIERS.length; index += 1) {
    const bit = bits[index]!;
    requireBit(bit);
    real[carrierToFftBin(LEGACY_DATA_CARRIERS[index]!, 64)] = bit === 0 ? -1 : 1;
  }
  const extraValues = [-1, -1, -1, 1] as const;
  for (let index = 0; index < 4; index += 1) {
    const carrier = PRE_HE_DATA_CARRIERS[index < 2 ? index : index + 48]!;
    real[carrierToFftBin(carrier, 64)] =
      extraValues[index]! * (erExtraToneBoost ? Math.sqrt(2) : 1);
  }
  const polarity = LEGACY_PILOT_POLARITY[pilotIndex % LEGACY_PILOT_POLARITY.length]!;
  const pilotValues = [polarity, polarity, polarity, -polarity];
  for (let pilot = 0; pilot < LEGACY_PILOT_CARRIERS.length; pilot += 1) {
    real[carrierToFftBin(LEGACY_PILOT_CARRIERS[pilot]!, 64)] = pilotValues[pilot]!;
  }
  return Object.freeze({ real, imaginary });
}

function renderHePpdu(
  config: HeProfileConfig,
  lSig: HeSplitComplexSequence,
  rlSig: HeSplitComplexSequence,
  heSigA: readonly HeSplitComplexSequence[],
  heSigB: readonly HeSplitComplexSequence[],
  heStf: HeSplitComplexSequence,
  heLtf: HeSplitComplexSequence,
  data: readonly HeSplitComplexSequence[],
): HeSplitComplexSequence {
  const sampleCount =
    160 + 160 + 80 + 80
    + heSigA.length * 80
    + heSigB.length * 80
    + config.heStfSamples
    + 320
    + data.length * 320;
  const real = new Float64Array(sampleCount);
  const imaginary = new Float64Array(sampleCount);
  let offset = 0;

  const epsilon = Math.sqrt(52 / 56);
  const erTrainingBoost = config.erSu ? Math.sqrt(2) : 1;
  const shortFrequency = legacyShortTrainingFrequency();
  const shortBody = inverseFft(shortFrequency);
  const shortScale = epsilon * erTrainingBoost / Math.sqrt(12);
  for (let sample = 0; sample < 160; sample += 1) {
    real[offset] = shortBody.real[sample % 16]! * shortScale;
    imaginary[offset] = shortBody.imaginary[sample % 16]! * shortScale;
    offset += 1;
  }

  const longBody = inverseFft(shiftedRealSpectrum(LEGACY_LONG_TRAINING_SHIFTED));
  const longScale = epsilon * erTrainingBoost / Math.sqrt(52);
  offset = appendCyclicPrefixAndBody(real, imaginary, offset, longBody, 32, longScale);
  real.set(Float64Array.from(longBody.real, (value) => value * longScale), offset);
  imaginary.set(Float64Array.from(longBody.imaginary, (value) => value * longScale), offset);
  offset += 64;

  const preHeScale = 1 / Math.sqrt(56);
  for (const frequency of [lSig, rlSig, ...heSigA, ...heSigB]) {
    offset = appendCyclicPrefixAndBody(
      real,
      imaginary,
      offset,
      inverseFft(frequency),
      16,
      preHeScale,
    );
  }

  const stfBody = inverseFft(heStf);
  const stfNonzero = countNonzeroComplex(heStf);
  const stfScale = (config.erSu ? Math.sqrt(2) : 1) / Math.sqrt(stfNonzero);
  for (let sample = 0; sample < config.heStfSamples; sample += 1) {
    real[offset] = stfBody.real[sample]! * stfScale;
    imaginary[offset] = stfBody.imaginary[sample]! * stfScale;
    offset += 1;
  }

  const activeToneCount = new Set(config.users.flatMap((user) => [...ruTones(user.ru)])).size;
  const ltfScale = (config.erSu ? Math.sqrt(2) : 1) / Math.sqrt(activeToneCount);
  offset = appendCyclicPrefixAndBody(
    real,
    imaginary,
    offset,
    inverseFft(heLtf),
    64,
    ltfScale,
  );
  const dataScale = 1 / Math.sqrt(activeToneCount);
  for (const frequency of data) {
    offset = appendCyclicPrefixAndBody(
      real,
      imaginary,
      offset,
      inverseFft(frequency),
      64,
      dataScale,
    );
  }
  if (offset !== sampleCount) throw new Error(`${config.profile} renderer produced ${offset} samples`);
  return Object.freeze({ real, imaginary });
}

function appendCyclicPrefixAndBody(
  outputReal: Float64Array,
  outputImaginary: Float64Array,
  offset: number,
  body: HeSplitComplexSequence,
  cyclicPrefixSamples: number,
  scale: number,
): number {
  const bodyLength = body.real.length;
  for (let sample = bodyLength - cyclicPrefixSamples; sample < bodyLength; sample += 1) {
    outputReal[offset] = body.real[sample]! * scale;
    outputImaginary[offset] = body.imaginary[sample]! * scale;
    offset += 1;
  }
  for (let sample = 0; sample < bodyLength; sample += 1) {
    outputReal[offset] = body.real[sample]! * scale;
    outputImaginary[offset] = body.imaginary[sample]! * scale;
    offset += 1;
  }
  return offset;
}

function legacyLengthForHeDuration(
  txTimeMicroseconds: number,
  profile: WifiHeFixedProfileId,
): number {
  const m = profile === 'wifi6-he-mu' || profile === 'wifi6-he-er-su' ? 1 : 2;
  return ((txTimeMicroseconds - 20) / 4) * 3 - 3 - m;
}

function buildLegacySignalBitsForLength(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 1 || length > 4_095) {
    throw new RangeError('HE L-SIG length must be a 12-bit positive integer');
  }
  const bits = new Uint8Array(24);
  bits.set([1, 1, 0, 1], 0);
  for (let bit = 0; bit < 12; bit += 1) bits[5 + bit] = (length >>> bit) & 1;
  let parity = 0;
  for (let bit = 0; bit < 17; bit += 1) parity ^= bits[bit]!;
  bits[17] = parity;
  return bits;
}

function interleaveRectangular(
  bits: Uint8Array,
  columns: number,
  rows: number,
  symbolCount: number,
): Uint8Array {
  const codedBitsPerSymbol = columns * rows;
  if (
    !Number.isSafeInteger(symbolCount)
    || symbolCount < 1
    || bits.length !== codedBitsPerSymbol * symbolCount
  ) {
    throw new RangeError('BCC interleaver input does not match its rectangular geometry');
  }
  const output = new Uint8Array(bits.length);
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    const offset = symbol * codedBitsPerSymbol;
    for (let outputIndex = 0; outputIndex < codedBitsPerSymbol; outputIndex += 1) {
      const inputIndex =
        columns * (outputIndex % rows) + Math.floor(outputIndex / rows);
      output[offset + outputIndex] = bits[offset + inputIndex]!;
    }
  }
  return output;
}

function scrambleBits(bits: Uint8Array, initialState: number): Uint8Array {
  if (!Number.isSafeInteger(initialState) || initialState < 1 || initialState > 127) {
    throw new RangeError('HE scrambler initial state must be from 1 through 127');
  }
  let state = initialState;
  const output = new Uint8Array(bits.length);
  for (let index = 0; index < bits.length; index += 1) {
    const bit = bits[index]!;
    requireBit(bit);
    const feedback = Number((state & 64) !== 0) ^ Number((state & 8) !== 0);
    output[index] = feedback ^ bit;
    state = ((state << 1) & 0x7e) | feedback;
  }
  return output;
}

function convolutionalEncodeRateOneHalf(bits: Uint8Array): Uint8Array {
  let state = 0;
  const output = new Uint8Array(bits.length * 2);
  for (let index = 0; index < bits.length; index += 1) {
    const bit = bits[index]!;
    requireBit(bit);
    state = ((state << 1) & 0x7e) | bit;
    output[index * 2] = parity8(state & 0o155);
    output[index * 2 + 1] = parity8(state & 0o117);
  }
  return output;
}

function legacyShortTrainingFrequency(): HeSplitComplexSequence {
  const scale = Math.sqrt(13 / 6);
  const real = new Float64Array(64);
  const imaginary = new Float64Array(64);
  for (let shiftedIndex = 0; shiftedIndex < 64; shiftedIndex += 1) {
    const sign = LEGACY_SHORT_TRAINING_SHIFTED[shiftedIndex]!;
    const bin = carrierToFftBin(shiftedIndex - 32, 64);
    real[bin] = sign * scale;
    imaginary[bin] = sign * scale;
  }
  return Object.freeze({ real, imaginary });
}

function shiftedRealSpectrum(values: readonly number[]): HeSplitComplexSequence {
  const real = new Float64Array(values.length);
  const imaginary = new Float64Array(values.length);
  for (let shiftedIndex = 0; shiftedIndex < values.length; shiftedIndex += 1) {
    real[carrierToFftBin(shiftedIndex - values.length / 2, values.length)] =
      values[shiftedIndex]!;
  }
  return Object.freeze({ real, imaginary });
}

function inverseFft(frequency: HeSplitComplexSequence): HeSplitComplexSequence {
  if (frequency.real.length !== frequency.imaginary.length) {
    throw new RangeError('IFFT split-complex channels must have equal lengths');
  }
  const size = frequency.real.length;
  const real = Float64Array.from(frequency.real);
  const imaginary = Float64Array.from(frequency.imaginary, (value) => -value);
  fftForwardUnscaledInPlace(real, imaginary);
  for (let sample = 0; sample < size; sample += 1) {
    real[sample] = real[sample]! / size;
    imaginary[sample] = -imaginary[sample]! / size;
  }
  return Object.freeze({ real, imaginary });
}

function ruTones(ru: WifiHeRu): number[] {
  if (ru === '106-left') return integerRange(-122, -17);
  if (ru === '106-right') return integerRange(17, 122);
  return [...integerRange(-122, -2), ...integerRange(2, 122)];
}

function ruPilots(ru: WifiHeRu): readonly number[] {
  if (ru === '106-left') return HE_PILOTS_106_LEFT;
  if (ru === '106-right') return HE_PILOTS_106_RIGHT;
  return HE_PILOTS_242;
}

function integerRange(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function countNonzeroComplex(sequence: HeSplitComplexSequence): number {
  let count = 0;
  for (let index = 0; index < sequence.real.length; index += 1) {
    if (sequence.real[index] !== 0 || sequence.imaginary[index] !== 0) count += 1;
  }
  return count;
}

function encodeCf32le(sequence: HeSplitComplexSequence): Uint8Array {
  const bytes = new Uint8Array(sequence.real.length * 8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let sample = 0; sample < sequence.real.length; sample += 1) {
    writeUnitBoundedCf32le(
      view,
      sample * 8,
      sequence.real[sample]!,
      sequence.imaginary[sample]!,
    );
  }
  return bytes;
}

function appendFcs(bytes: Uint8Array): Uint8Array {
  const fcs = crc32Ieee(bytes);
  return Uint8Array.from([
    ...bytes,
    fcs & 0xff,
    (fcs >>> 8) & 0xff,
    (fcs >>> 16) & 0xff,
    (fcs >>> 24) & 0xff,
  ]);
}

function crc32Ieee(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function bytesBitsLeastSignificantFirst(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);
  for (let octet = 0; octet < bytes.length; octet += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      bits[octet * 8 + bit] = (bytes[octet]! >>> bit) & 1;
    }
  }
  return bits;
}

function concatenateBits(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function concatenateBytes(...parts: readonly Uint8Array[]): Uint8Array {
  return concatenateBits(...parts);
}

function setUnsignedLsb(
  destination: Uint8Array,
  offset: number,
  width: number,
  value: number,
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** width) {
    throw new RangeError(`Value ${value} does not fit ${width} bits`);
  }
  for (let bit = 0; bit < width; bit += 1) {
    destination[offset + bit] = (value >>> bit) & 1;
  }
}

function parity8(value: number): number {
  let parity = 0;
  for (let bit = 0; bit < 8; bit += 1) parity ^= (value >>> bit) & 1;
  return parity;
}

function carrierToFftBin(carrier: number, fftSize: number): number {
  if (!Number.isSafeInteger(carrier) || carrier < -fftSize / 2 || carrier >= fftSize / 2) {
    throw new RangeError(`Carrier ${carrier} is outside the ${fftSize}-point FFT`);
  }
  return carrier < 0 ? fftSize + carrier : carrier;
}

function requireBit(value: number): void {
  if (value !== 0 && value !== 1) throw new RangeError(`Expected bit, received ${value}`);
}
