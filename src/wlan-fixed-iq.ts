import {
  fftForwardUnscaledInPlace,
  writeUnitBoundedCf32le,
} from '@atomos/dsp';
import {
  WIFI_HE_SAMPLE_RATE_HZ,
  buildWifiHeFixedPpdu,
} from './wlan-he-fixed-iq.js';

export * from './wlan-he-fixed-iq.js';

/**
 * Fixed WLAN catalog surface.
 *
 * This module deliberately separates a reproducible digital-baseband result
 * from an IEEE, Wi-Fi Alliance, regulatory, or RF-transmitter compliance
 * claim.  A complete packet can be exact at its declared digital interface
 * while pulse shaping, spectral mask, EVM, power, spurious emissions, channel
 * access, interoperability, and product certification remain untested.
 */
export const WLAN_FIXED_PROFILE_IDS = [
  'wifi-hr-dsss-11m',
  'wifi-ofdm-20m',
  'wifi6-he-su',
  'wifi6-he-er-su',
  'wifi6-he-mu',
  'wifi6-he-tb',
] as const;

export type WlanFixedProfileId = typeof WLAN_FIXED_PROFILE_IDS[number];
export type WlanImplementedFixedProfileId = WlanFixedProfileId;

export type WlanDigitalBasebandQualification =
  | 'independently-verified-digital-baseband'
  | 'reference-generated-digital-baseband'
  | 'blocked-no-exact-artifact';

export interface WlanFixedProfileImplementationStatus {
  readonly profile: WlanFixedProfileId;
  readonly governingBody: 'IEEE Standards Association / IEEE 802.11 Working Group';
  readonly specification: 'IEEE 802.11-2024';
  readonly clauses: readonly string[];
  readonly implemented: boolean;
  readonly qualification: WlanDigitalBasebandQualification;
  readonly exactScope: string;
  readonly qualificationBlockers: readonly string[];
}

const IEEE_BODY = 'IEEE Standards Association / IEEE 802.11 Working Group' as const;
const IEEE_SPECIFICATION = 'IEEE 802.11-2024' as const;

export const WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS = Object.freeze({
  'wifi-hr-dsss-11m': Object.freeze({
    profile: 'wifi-hr-dsss-11m',
    governingBody: IEEE_BODY,
    specification: IEEE_SPECIFICATION,
    clauses: Object.freeze(['16']),
    implemented: true,
    qualification: 'independently-verified-digital-baseband',
    exactScope:
      'Complete long-preamble 11 Mb/s HR-DSSS PPDU at the 11 Mchip/s complex-chip interface: scrambled PLCP preamble/header, CCITT CRC-16, a valid ACK PSDU with IEEE CRC-32 FCS, and all 11 Mb/s CCK chips. The chip sequence has no transmit pulse-shaping or RF claim.',
    qualificationBlockers: Object.freeze([
      'The independent oracle is a separately structured in-repository exhaustive chip decoder, not an organizationally independent certification laboratory.',
      'The 11 Msample/s output is a complex-chip sequence before pulse shaping, not an RF waveform or spectral-mask/EVM result.',
      'Wi-Fi Alliance interoperability/product certification and jurisdictional radio approval are outside this artifact.',
    ]),
  } satisfies WlanFixedProfileImplementationStatus),
  'wifi-ofdm-20m': Object.freeze({
    profile: 'wifi-ofdm-20m',
    governingBody: IEEE_BODY,
    specification: IEEE_SPECIFICATION,
    clauses: Object.freeze(['18', '17']),
    implemented: true,
    qualification: 'independently-verified-digital-baseband',
    exactScope:
      'Complete 20 Msample/s 6 Mb/s 2.4 GHz ERP-OFDM transmit artifact: L-STF, L-LTF, L-SIG, valid ACK PSDU/FCS, SERVICE/tail/pad, scrambling, BCC, interleaving, BPSK mapping, pilots, 64-point OFDM, cyclic prefixes, and the following 6 us no-transmission signal-extension interval. Qualification is content-bound to the fixed artifact.',
    qualificationBlockers: Object.freeze([
      'The ideal unwindowed complex baseband does not test RF spectral mask, EVM, power, frequency accuracy, spurious emissions, or receiver requirements.',
      'The fixed PPDU does not establish MAC channel-access behavior, interoperability, Wi-Fi Alliance certification, or regulatory approval.',
    ]),
  } satisfies WlanFixedProfileImplementationStatus),
  'wifi6-he-su': Object.freeze({
    profile: 'wifi6-he-su',
    governingBody: IEEE_BODY,
    specification: IEEE_SPECIFICATION,
    clauses: Object.freeze(['27']),
    implemented: true,
    qualification: 'independently-verified-digital-baseband',
    exactScope:
      'Complete fixed 20 MHz HE SU PPDU at 20 Msample/s: legacy preamble, L-SIG/RL-SIG, HE-SIG-A, HE-STF, one 4x HE-LTF, and 30 HE data symbols. Its pinned TXVECTOR uses one 242-tone RU, MCS 0 BPSK/BCC 1/2, NSS 1, 3.2 us GI, no DCM/STBC/beamforming/Doppler, no packet extension, and a 436-octet single-MPDU A-MPDU PSDU. Qualification is content-bound to the fixed artifact.',
    qualificationBlockers: Object.freeze([
      'The ideal unwindowed digital baseband does not test RF spectral mask, EVM, transmit power, frequency accuracy, spurious emissions, or receiver requirements.',
      'The fixed PPDU does not establish MAC channel-access behavior, interoperability, Wi-Fi Alliance certification, or jurisdictional radio approval.',
    ]),
  } satisfies WlanFixedProfileImplementationStatus),
  'wifi6-he-er-su': Object.freeze({
    profile: 'wifi6-he-er-su',
    governingBody: IEEE_BODY,
    specification: IEEE_SPECIFICATION,
    clauses: Object.freeze(['27']),
    implemented: true,
    qualification: 'independently-verified-digital-baseband',
    exactScope:
      'Complete fixed 20 MHz HE ER SU PPDU at 20 Msample/s: legacy preamble with extended-range L-SIG tones, L-SIG/RL-SIG, repeated HE-SIG-A with the required QBPSK symbol, HE-STF, one 4x HE-LTF, and 18 HE data symbols. Its pinned TXVECTOR uses the right 106-tone RU, MCS 0 BPSK/BCC 1/2, NSS 1, 3.2 us GI, no DCM/STBC/beamforming/Doppler, no packet extension, and a 112-octet single-MPDU A-MPDU PSDU.',
    qualificationBlockers: Object.freeze([
      'The ideal unwindowed digital baseband does not test RF spectral mask, EVM, transmit power, frequency accuracy, spurious emissions, or receiver requirements.',
      'The fixed PPDU does not establish MAC channel-access behavior, interoperability, Wi-Fi Alliance certification, or jurisdictional radio approval.',
    ]),
  } satisfies WlanFixedProfileImplementationStatus),
  'wifi6-he-mu': Object.freeze({
    profile: 'wifi6-he-mu',
    governingBody: IEEE_BODY,
    specification: IEEE_SPECIFICATION,
    clauses: Object.freeze(['27']),
    implemented: true,
    qualification: 'independently-verified-digital-baseband',
    exactScope:
      'Complete fixed 20 MHz downlink HE MU PPDU at 20 Msample/s: legacy preamble, L-SIG/RL-SIG, HE-SIG-A, a three-symbol HE-SIG-B common/user encoding, HE-STF, one 4x HE-LTF, and 18 HE data symbols. The pinned allocation has STA-ID 1 on the left 106-tone RU and STA-ID 2 on the right 106-tone RU; both use MCS 0 BPSK/BCC 1/2, NSS 1, 3.2 us GI, no DCM/STBC/beamforming/Doppler, no packet extension, and independent 112-octet single-MPDU A-MPDU PSDUs.',
    qualificationBlockers: Object.freeze([
      'The ideal unwindowed digital baseband does not test RF spectral mask, EVM, transmit power, frequency accuracy, spurious emissions, or receiver requirements.',
      'The fixed PPDU does not establish scheduling policy, MAC channel access, interoperability, Wi-Fi Alliance certification, or jurisdictional radio approval.',
    ]),
  } satisfies WlanFixedProfileImplementationStatus),
  'wifi6-he-tb': Object.freeze({
    profile: 'wifi6-he-tb',
    governingBody: IEEE_BODY,
    specification: IEEE_SPECIFICATION,
    clauses: Object.freeze(['26', '27']),
    implemented: true,
    qualification: 'independently-verified-digital-baseband',
    exactScope:
      'Complete fixed nominal 20 MHz HE TB PPDU for one STA at 20 Msample/s, paired with the complete valid Basic Trigger frame that determines its TXVECTOR. AID 1 is assigned RU allocation 54 (right 106-tone RU), MCS 0 BPSK/BCC 1/2, NSS 1, 4x HE-LTF, 3.2 us GI, no DCM/STBC/Doppler, no packet extension, and an 18-symbol 112-octet single-MPDU A-MPDU PSDU; nominal carrier-frequency and timing offsets are zero.',
    qualificationBlockers: Object.freeze([
      'The ideal unwindowed digital baseband does not test RF spectral mask, EVM, transmit power, trigger-response timing tolerance, frequency-error tolerance, spurious emissions, or receiver requirements.',
      'The fixed Trigger/response pair does not establish the full AP/STA exchange, MAC channel access, interoperability, Wi-Fi Alliance certification, or jurisdictional radio approval.',
    ]),
  } satisfies WlanFixedProfileImplementationStatus),
} as const satisfies Readonly<Record<WlanFixedProfileId, WlanFixedProfileImplementationStatus>>);

export const WIFI_FIXED_ACK_PSDU_WITH_FCS = buildFixedAckPsdu();
export const WIFI_FIXED_ACK_PSDU_HEX = bytesToHex(WIFI_FIXED_ACK_PSDU_WITH_FCS);

export const WIFI_ERP_OFDM_SAMPLE_RATE_HZ = 20_000_000 as const;
export const WIFI_ERP_OFDM_FFT_SIZE = 64 as const;
export const WIFI_ERP_OFDM_CYCLIC_PREFIX_SAMPLES = 16 as const;
export const WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT = 880 as const;
export const WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES = 120 as const;
export const WIFI_ERP_OFDM_SAMPLE_COUNT = 1_000 as const;
export const WIFI_ERP_OFDM_SCRAMBLER_INITIAL_STATE = 93 as const;
export const WIFI_ERP_OFDM_CF32LE_SHA256 =
  'c035c7661b7c2b5b1ad6bcfb65dda903f6ef92bc230c0c54b332f974cb92a1c8' as const;

export const WIFI_HR_DSSS_CHIP_RATE_HZ = 11_000_000 as const;
export const WIFI_HR_DSSS_PLCP_BIT_COUNT = 192 as const;
export const WIFI_HR_DSSS_CHIP_COUNT = 2_224 as const;
export const WIFI_HR_DSSS_CF32LE_SHA256 =
  'e356f1009fd814d667952673ed230320bcd463369bcf2eb219eb69ca2b3595e8' as const;

export interface SplitComplexSequence {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
}

export interface WifiErpOfdmFixedPpdu {
  readonly profile: 'wifi-ofdm-20m';
  readonly sampleRateHz: typeof WIFI_ERP_OFDM_SAMPLE_RATE_HZ;
  readonly dataRateBitsPerSecond: 6_000_000;
  readonly modulation: 'BPSK';
  readonly codeRate: '1/2';
  readonly fftSize: typeof WIFI_ERP_OFDM_FFT_SIZE;
  readonly cyclicPrefixSamples: typeof WIFI_ERP_OFDM_CYCLIC_PREFIX_SAMPLES;
  readonly psdu: Uint8Array;
  readonly signalUncodedBits: Uint8Array;
  readonly signalCodedBits: Uint8Array;
  readonly signalInterleavedBits: Uint8Array;
  readonly dataUncodedBits: Uint8Array;
  readonly dataScrambledBits: Uint8Array;
  readonly dataCodedBits: Uint8Array;
  readonly dataInterleavedBits: Uint8Array;
  readonly frequencyDomainSymbols: readonly SplitComplexSequence[];
  readonly timeDomain: SplitComplexSequence;
  readonly cf32le: Uint8Array;
  readonly metadata: {
    readonly psduOctets: 14;
    readonly ofdmDataSymbols: 6;
    readonly signalOfdmSymbols: 1;
    readonly shortTrainingSamples: 160;
    readonly longTrainingSamples: 160;
    readonly ppduSamples: typeof WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT;
    readonly signalExtensionSamples: typeof WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES;
    readonly totalSamples: typeof WIFI_ERP_OFDM_SAMPLE_COUNT;
    readonly packetDurationMicroseconds: 44;
    readonly signalExtensionMicroseconds: 6;
    readonly transmitArtifactDurationMicroseconds: 50;
    readonly qualification: 'independently-verified-digital-baseband';
    readonly disclosure: string;
  };
}

export interface WifiHrDsssFixedPpdu {
  readonly profile: 'wifi-hr-dsss-11m';
  readonly chipRateHz: typeof WIFI_HR_DSSS_CHIP_RATE_HZ;
  readonly psduDataRateBitsPerSecond: 11_000_000;
  readonly psdu: Uint8Array;
  readonly signal: 0x6e;
  readonly service: 0x80;
  readonly lengthMicroseconds: 11;
  readonly headerCrc: 0x3cc4;
  readonly unscrambledBits: Uint8Array;
  readonly scrambledBits: Uint8Array;
  readonly chips: SplitComplexSequence;
  readonly cf32le: Uint8Array;
  readonly metadata: {
    readonly psduOctets: 14;
    readonly longPlcpBits: typeof WIFI_HR_DSSS_PLCP_BIT_COUNT;
    readonly longPlcpChips: 2_112;
    readonly cckSymbols: 14;
    readonly cckChips: 112;
    readonly totalChips: typeof WIFI_HR_DSSS_CHIP_COUNT;
    readonly packetDurationMicroseconds: number;
    readonly qualification: 'independently-verified-digital-baseband';
    readonly disclosure: string;
  };
}

export interface WlanFixedCatalogIqInput {
  readonly profile: WlanFixedProfileId;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

const OFDM_DATA_CARRIERS = Object.freeze([
  -26, -25, -24, -23, -22,
  -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8,
  -6, -5, -4, -3, -2, -1,
  1, 2, 3, 4, 5, 6,
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  22, 23, 24, 25, 26,
]);

const OFDM_PILOT_CARRIERS = Object.freeze([-21, -7, 7, 21]);
const OFDM_PILOT_POLARITY = Object.freeze([
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

const BARKER_11 = Object.freeze([1, -1, 1, 1, -1, 1, 1, 1, -1, -1, -1]);

let cachedErpOfdm: WifiErpOfdmFixedPpdu | undefined;
let cachedHrDsss: WifiHrDsssFixedPpdu | undefined;

export function isWlanFixedProfileId(value: string): value is WlanFixedProfileId {
  return (WLAN_FIXED_PROFILE_IDS as readonly string[]).includes(value);
}

export function isWlanImplementedFixedProfileId(
  value: WlanFixedProfileId,
): value is WlanImplementedFixedProfileId {
  return WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS[value].implemented;
}

export function wlanFixedProfileImplementationStatus(
  profile: WlanFixedProfileId,
): WlanFixedProfileImplementationStatus {
  return WLAN_FIXED_PROFILE_IMPLEMENTATION_STATUS[profile];
}

export function buildWifiErpOfdmFixedPpdu(): WifiErpOfdmFixedPpdu {
  if (cachedErpOfdm !== undefined) return cachedErpOfdm;

  const psdu = Uint8Array.from(WIFI_FIXED_ACK_PSDU_WITH_FCS);
  const signalUncodedBits = buildLegacySignalBits(psdu.length);
  const signalCodedBits = convolutionalEncodeRateOneHalf(signalUncodedBits);
  const signalInterleavedBits = interleaveLegacyOfdmBits(signalCodedBits, 1);

  const ofdmDataSymbolCount = Math.ceil((16 + 8 * psdu.length + 6) / 24);
  if (ofdmDataSymbolCount !== 6) throw new Error('Fixed ERP-OFDM ACK must occupy six data symbols');
  const dataUncodedBits = buildLegacyDataBits(psdu, ofdmDataSymbolCount * 24);
  const dataScrambledBits = scrambleLegacyOfdmBits(
    dataUncodedBits,
    WIFI_ERP_OFDM_SCRAMBLER_INITIAL_STATE,
  );
  const tailStart = 16 + psdu.length * 8;
  dataScrambledBits.fill(0, tailStart, tailStart + 6);
  const dataCodedBits = convolutionalEncodeRateOneHalf(dataScrambledBits);
  const dataInterleavedBits = interleaveLegacyOfdmBits(dataCodedBits, ofdmDataSymbolCount);

  const signalFrequency = mapLegacyOfdmBpskSymbol(signalInterleavedBits, 0);
  const dataFrequency: SplitComplexSequence[] = [];
  for (let symbol = 0; symbol < ofdmDataSymbolCount; symbol += 1) {
    dataFrequency.push(mapLegacyOfdmBpskSymbol(
      dataInterleavedBits.subarray(symbol * 48, (symbol + 1) * 48),
      symbol + 1,
    ));
  }

  const shortTrainingFrequency = legacyShortTrainingFrequency();
  const longTrainingFrequency = shiftedRealSpectrum(LEGACY_LONG_TRAINING_SHIFTED);
  const shortTrainingBody = inverseFft(shortTrainingFrequency);
  const longTrainingBody = inverseFft(longTrainingFrequency);
  const timeReal = new Float64Array(WIFI_ERP_OFDM_SAMPLE_COUNT);
  const timeImaginary = new Float64Array(WIFI_ERP_OFDM_SAMPLE_COUNT);
  let outputOffset = 0;

  for (let sample = 0; sample < 160; sample += 1) {
    timeReal[outputOffset] = shortTrainingBody.real[sample % 16]!;
    timeImaginary[outputOffset] = shortTrainingBody.imaginary[sample % 16]!;
    outputOffset += 1;
  }
  timeReal.set(longTrainingBody.real.subarray(32), outputOffset);
  timeImaginary.set(longTrainingBody.imaginary.subarray(32), outputOffset);
  outputOffset += 32;
  timeReal.set(longTrainingBody.real, outputOffset);
  timeImaginary.set(longTrainingBody.imaginary, outputOffset);
  outputOffset += 64;
  timeReal.set(longTrainingBody.real, outputOffset);
  timeImaginary.set(longTrainingBody.imaginary, outputOffset);
  outputOffset += 64;

  for (const frequency of [signalFrequency, ...dataFrequency]) {
    const body = inverseFft(frequency);
    timeReal.set(body.real.subarray(48), outputOffset);
    timeImaginary.set(body.imaginary.subarray(48), outputOffset);
    outputOffset += 16;
    timeReal.set(body.real, outputOffset);
    timeImaginary.set(body.imaginary, outputOffset);
    outputOffset += 64;
  }
  if (outputOffset !== WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT) {
    throw new Error(`Fixed ERP-OFDM renderer produced ${outputOffset} samples`);
  }

  const timeDomain = Object.freeze({ real: timeReal, imaginary: timeImaginary });
  const cf32le = encodeCf32le(timeDomain);
  cachedErpOfdm = Object.freeze({
    profile: 'wifi-ofdm-20m',
    sampleRateHz: WIFI_ERP_OFDM_SAMPLE_RATE_HZ,
    dataRateBitsPerSecond: 6_000_000,
    modulation: 'BPSK',
    codeRate: '1/2',
    fftSize: WIFI_ERP_OFDM_FFT_SIZE,
    cyclicPrefixSamples: WIFI_ERP_OFDM_CYCLIC_PREFIX_SAMPLES,
    psdu,
    signalUncodedBits,
    signalCodedBits,
    signalInterleavedBits,
    dataUncodedBits,
    dataScrambledBits,
    dataCodedBits,
    dataInterleavedBits,
    frequencyDomainSymbols: Object.freeze([signalFrequency, ...dataFrequency]),
    timeDomain,
    cf32le,
    metadata: Object.freeze({
      psduOctets: 14,
      ofdmDataSymbols: 6,
      signalOfdmSymbols: 1,
      shortTrainingSamples: 160,
      longTrainingSamples: 160,
      ppduSamples: WIFI_ERP_OFDM_PPDU_SAMPLE_COUNT,
      signalExtensionSamples: WIFI_ERP_OFDM_SIGNAL_EXTENSION_SAMPLES,
      totalSamples: WIFI_ERP_OFDM_SAMPLE_COUNT,
      packetDurationMicroseconds: 44,
      signalExtensionMicroseconds: 6,
      transmitArtifactDurationMicroseconds: 50,
      qualification: 'independently-verified-digital-baseband',
      disclosure:
        'Content-addressed ideal 20 Msample/s digital baseband for one fixed 2.4 GHz ERP-OFDM PPDU followed by its 6 us no-transmission signal-extension interval. Its coding and interleaving are independently checked against gr-ieee802-11. No RF, spectral-mask, EVM, MAC channel-access, interoperability, certification, or regulatory claim is made.',
    }),
  });
  return cachedErpOfdm;
}

export function buildWifiHrDsssFixedPpdu(): WifiHrDsssFixedPpdu {
  if (cachedHrDsss !== undefined) return cachedHrDsss;

  const psdu = Uint8Array.from(WIFI_FIXED_ACK_PSDU_WITH_FCS);
  const signal = 0x6e as const;
  const exactLength = psdu.length * 8 / 11;
  const lengthMicroseconds = Math.ceil(exactLength);
  const lengthExtension = lengthMicroseconds - exactLength >= 8 / 11 ? 1 : 0;
  const service = (lengthExtension << 7) as 0x80;
  if (lengthMicroseconds !== 11 || service !== 0x80) {
    throw new Error('Fixed HR-DSSS ACK length-extension geometry changed');
  }

  const protectedHeaderBits = concatenateBits(
    byteBitsLeastSignificantFirst(signal),
    byteBitsLeastSignificantFirst(service),
    uint16BitsLeastSignificantFirst(lengthMicroseconds),
  );
  const headerCrc = crc16CcittOnesComplementTransmitOrder(protectedHeaderBits);
  if (headerCrc !== 0x3cc4) {
    throw new Error(`Fixed HR-DSSS PLCP CRC changed to 0x${headerCrc.toString(16)}`);
  }
  const headerCrcBits = uint16BitsMostSignificantFirst(headerCrc);
  const unscrambledBits = concatenateBits(
    new Uint8Array(128).fill(1),
    uint16BitsLeastSignificantFirst(0xf3a0),
    protectedHeaderBits,
    headerCrcBits,
    bytesBitsLeastSignificantFirst(psdu),
  );
  if (unscrambledBits.length !== WIFI_HR_DSSS_PLCP_BIT_COUNT + psdu.length * 8) {
    throw new Error('Fixed HR-DSSS bit geometry changed');
  }
  const scrambledBits = scrambleHrDsssFeedthrough(unscrambledBits, 0x6c);

  const real = new Float64Array(WIFI_HR_DSSS_CHIP_COUNT);
  const imaginary = new Float64Array(WIFI_HR_DSSS_CHIP_COUNT);
  let chipOffset = 0;
  let referencePhaseQuarterTurns = 0;
  for (let bitIndex = 0; bitIndex < WIFI_HR_DSSS_PLCP_BIT_COUNT; bitIndex += 1) {
    if (scrambledBits[bitIndex] === 1) {
      referencePhaseQuarterTurns = (referencePhaseQuarterTurns + 2) & 3;
    }
    const phase = quarterTurn(referencePhaseQuarterTurns);
    for (const barkerChip of BARKER_11) {
      real[chipOffset] = barkerChip * phase[0];
      imaginary[chipOffset] = barkerChip * phase[1];
      chipOffset += 1;
    }
  }

  const psduBits = scrambledBits.subarray(WIFI_HR_DSSS_PLCP_BIT_COUNT);
  for (let symbol = 0; symbol < psdu.length; symbol += 1) {
    const bits = psduBits.subarray(symbol * 8, (symbol + 1) * 8);
    const encoded = encodeCck11MbpsSymbol(bits, referencePhaseQuarterTurns, symbol);
    referencePhaseQuarterTurns = encoded.phaseQuarterTurns;
    real.set(encoded.chips.real, chipOffset);
    imaginary.set(encoded.chips.imaginary, chipOffset);
    chipOffset += 8;
  }
  if (chipOffset !== WIFI_HR_DSSS_CHIP_COUNT) {
    throw new Error(`Fixed HR-DSSS renderer produced ${chipOffset} chips`);
  }

  const chips = Object.freeze({ real, imaginary });
  const cf32le = encodeCf32le(chips);
  cachedHrDsss = Object.freeze({
    profile: 'wifi-hr-dsss-11m',
    chipRateHz: WIFI_HR_DSSS_CHIP_RATE_HZ,
    psduDataRateBitsPerSecond: 11_000_000,
    psdu,
    signal,
    service,
    lengthMicroseconds,
    headerCrc,
    unscrambledBits,
    scrambledBits,
    chips,
    cf32le,
    metadata: Object.freeze({
      psduOctets: 14,
      longPlcpBits: WIFI_HR_DSSS_PLCP_BIT_COUNT,
      longPlcpChips: 2_112,
      cckSymbols: 14,
      cckChips: 112,
      totalChips: WIFI_HR_DSSS_CHIP_COUNT,
      packetDurationMicroseconds:
        WIFI_HR_DSSS_PLCP_BIT_COUNT + psdu.length * 8 / 11,
      qualification: 'independently-verified-digital-baseband',
      disclosure:
        'Content-addressed long-PLCP bit and 11 Mchip/s complex-chip sequence for one fixed 11 Mb/s CCK PPDU. A separately structured test oracle exhaustively decodes every Barker and CCK chip, recovers every octet, and checks the CRCs. The output stops at the ideal chip interface and deliberately carries no pulse-shaping, spectral-mask, EVM, RF, channel-access, interoperability, certification, or regulatory claim.',
    }),
  });
  return cachedHrDsss;
}

export function synthesizeWlanFixedCatalogIq(input: WlanFixedCatalogIqInput): Uint8Array {
  if (!isWlanFixedProfileId(input.profile)) {
    throw new RangeError(`Unknown fixed WLAN profile ${input.profile satisfies never}`);
  }
  if (!Number.isSafeInteger(input.sampleRateHz) || input.sampleRateHz < 1) {
    throw new RangeError('Fixed WLAN sample rate must be a positive safe integer');
  }
  if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 1 || input.sampleCount > 65_536) {
    throw new RangeError('Fixed WLAN sample count must be a safe integer from 1 through 65536');
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex) || startSampleIndex < 0
    || !Number.isSafeInteger(startSampleIndex + input.sampleCount)) {
    throw new RangeError('Fixed WLAN start sample index must be a non-negative safe integer');
  }
  const artifact = input.profile === 'wifi-ofdm-20m'
    ? buildWifiErpOfdmFixedPpdu()
    : input.profile === 'wifi-hr-dsss-11m'
      ? buildWifiHrDsssFixedPpdu()
      : buildWifiHeFixedPpdu(input.profile);
  const requiredRate = input.profile === 'wifi-hr-dsss-11m'
    ? WIFI_HR_DSSS_CHIP_RATE_HZ
    : input.profile === 'wifi-ofdm-20m'
      ? WIFI_ERP_OFDM_SAMPLE_RATE_HZ
      : WIFI_HE_SAMPLE_RATE_HZ;
  if (input.sampleRateHz !== requiredRate) {
    throw new RangeError(`${input.profile} exact artifact requires ${requiredRate} samples/s; resampling would invalidate its content hash`);
  }
  const requiredBandwidth = input.profile === 'wifi-hr-dsss-11m'
    ? WIFI_HR_DSSS_CHIP_RATE_HZ
    : WIFI_ERP_OFDM_SAMPLE_RATE_HZ;
  if (input.bandwidthHz !== requiredBandwidth) {
    throw new RangeError(`${input.profile} exact artifact requires the fixed ${requiredBandwidth} Hz digital-interface bandwidth; filtering would invalidate its content hash`);
  }
  const source = artifact.cf32le;
  const sourceSamples = source.byteLength / 8;
  const output = new Uint8Array(input.sampleCount * 8);
  for (let outputSample = 0; outputSample < input.sampleCount; outputSample += 1) {
    const sourceSample = (startSampleIndex + outputSample) % sourceSamples;
    output.set(source.subarray(sourceSample * 8, sourceSample * 8 + 8), outputSample * 8);
  }
  return output;
}

export function crc32Ieee(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

export function crc16CcittOnesComplementTransmitOrder(bits: Uint8Array): number {
  let remainder = 0xffff;
  for (const bit of bits) {
    requireBit(bit);
    const feedback = ((remainder >>> 15) & 1) ^ bit;
    remainder = (remainder << 1) & 0xffff;
    if (feedback === 1) remainder ^= 0x1021;
  }
  return (remainder ^ 0xffff) & 0xffff;
}

export function scrambleHrDsssFeedthrough(bits: Uint8Array, seed: number): Uint8Array {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0x7f) {
    throw new RangeError('HR-DSSS scrambler seed must be a seven-bit integer');
  }
  const state = [
    (seed >>> 6) & 1,
    (seed >>> 5) & 1,
    (seed >>> 4) & 1,
    (seed >>> 3) & 1,
    (seed >>> 2) & 1,
    (seed >>> 1) & 1,
    seed & 1,
  ];
  const output = new Uint8Array(bits.length);
  for (let index = 0; index < bits.length; index += 1) {
    const input = bits[index]!;
    requireBit(input);
    const scrambled = input ^ state[3]! ^ state[6]!;
    output[index] = scrambled;
    for (let stage = 6; stage > 0; stage -= 1) state[stage] = state[stage - 1]!;
    state[0] = scrambled;
  }
  return output;
}

export function descrambleHrDsssFeedthrough(bits: Uint8Array): Uint8Array {
  const output = new Uint8Array(bits.length);
  const state = new Uint8Array(7);
  for (let index = 0; index < bits.length; index += 1) {
    const input = bits[index]!;
    requireBit(input);
    output[index] = input ^ state[3]! ^ state[6]!;
    for (let stage = 6; stage > 0; stage -= 1) state[stage] = state[stage - 1]!;
    state[0] = input;
  }
  return output;
}

export interface Cck11MbpsSymbol {
  readonly phaseQuarterTurns: number;
  readonly chips: SplitComplexSequence;
}

export function encodeCck11MbpsSymbol(
  bits: Uint8Array,
  previousPhaseQuarterTurns: number,
  symbolIndex: number,
): Cck11MbpsSymbol {
  if (bits.length !== 8) throw new RangeError('11 Mb/s CCK requires exactly eight input bits');
  for (const bit of bits) requireBit(bit);
  if (!Number.isSafeInteger(previousPhaseQuarterTurns)) {
    throw new RangeError('CCK preceding phase must be an integer number of quarter turns');
  }
  if (!Number.isSafeInteger(symbolIndex) || symbolIndex < 0) {
    throw new RangeError('CCK symbol index must be a non-negative safe integer');
  }
  const phi1Delta = dqpskQuarterTurns(bits[0]!, bits[1]!) + (symbolIndex % 2 === 1 ? 2 : 0);
  const phi1 = (previousPhaseQuarterTurns + phi1Delta) & 3;
  const phi2 = qpskBinaryQuarterTurns(bits[2]!, bits[3]!);
  const phi3 = qpskBinaryQuarterTurns(bits[4]!, bits[5]!);
  const phi4 = qpskBinaryQuarterTurns(bits[6]!, bits[7]!);
  const chipPhases = [
    phi1 + phi2 + phi3 + phi4,
    phi1 + phi3 + phi4,
    phi1 + phi2 + phi4,
    phi1 + phi4 + 2,
    phi1 + phi2 + phi3,
    phi1 + phi3,
    phi1 + phi2 + 2,
    phi1,
  ];
  const real = new Float64Array(8);
  const imaginary = new Float64Array(8);
  for (let chip = 0; chip < 8; chip += 1) {
    const value = quarterTurn(chipPhases[chip]!);
    real[chip] = value[0];
    imaginary[chip] = value[1];
  }
  return Object.freeze({
    phaseQuarterTurns: phi1,
    chips: Object.freeze({ real, imaginary }),
  });
}

export function buildLegacySignalBits(psduLength: number): Uint8Array {
  if (!Number.isSafeInteger(psduLength) || psduLength < 1 || psduLength > 4_095) {
    throw new RangeError('Legacy OFDM PSDU length must be a safe integer from 1 through 4095');
  }
  const bits = new Uint8Array(24);
  bits.set([1, 1, 0, 1], 0); // RATE 1101: 6 Mb/s BPSK 1/2.
  bits[4] = 0;
  for (let bit = 0; bit < 12; bit += 1) bits[5 + bit] = (psduLength >>> bit) & 1;
  let parity = 0;
  for (let bit = 0; bit < 17; bit += 1) parity ^= bits[bit]!;
  bits[17] = parity;
  return bits;
}

export function buildLegacyDataBits(psdu: Uint8Array, totalDataBits: number): Uint8Array {
  const required = 16 + psdu.length * 8 + 6;
  if (!Number.isSafeInteger(totalDataBits) || totalDataBits < required || totalDataBits % 24 !== 0) {
    throw new RangeError('Legacy 6 Mb/s DATA bit count must fit SERVICE/PSDU/tail and be a multiple of 24');
  }
  const bits = new Uint8Array(totalDataBits);
  bits.set(bytesBitsLeastSignificantFirst(psdu), 16);
  return bits;
}

export function scrambleLegacyOfdmBits(bits: Uint8Array, initialState: number): Uint8Array {
  if (!Number.isSafeInteger(initialState) || initialState < 1 || initialState > 127) {
    throw new RangeError('Legacy OFDM scrambler initial state must be from 1 through 127');
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

export function convolutionalEncodeRateOneHalf(bits: Uint8Array): Uint8Array {
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

export function interleaveLegacyOfdmBits(
  bits: Uint8Array,
  symbolCount: number,
): Uint8Array {
  if (!Number.isSafeInteger(symbolCount) || symbolCount < 1 || bits.length !== symbolCount * 48) {
    throw new RangeError('Legacy BPSK interleaver requires 48 coded bits per OFDM symbol');
  }
  const output = new Uint8Array(bits.length);
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    const offset = symbol * 48;
    for (let k = 0; k < 48; k += 1) {
      const permutation = 16 * k - 47 * Math.floor(16 * k / 48);
      output[offset + k] = bits[offset + permutation]!;
    }
  }
  return output;
}

export function mapLegacyOfdmBpskSymbol(
  interleavedBits: Uint8Array,
  pilotPolarityIndex: number,
): SplitComplexSequence {
  if (interleavedBits.length !== 48) {
    throw new RangeError('Legacy OFDM BPSK symbol requires 48 interleaved bits');
  }
  if (!Number.isSafeInteger(pilotPolarityIndex) || pilotPolarityIndex < 0) {
    throw new RangeError('Legacy OFDM pilot polarity index must be a non-negative safe integer');
  }
  const real = new Float64Array(64);
  const imaginary = new Float64Array(64);
  for (let index = 0; index < OFDM_DATA_CARRIERS.length; index += 1) {
    const bit = interleavedBits[index]!;
    requireBit(bit);
    real[carrierToFftBin(OFDM_DATA_CARRIERS[index]!)] = bit === 0 ? -1 : 1;
  }
  const polarity = OFDM_PILOT_POLARITY[pilotPolarityIndex % OFDM_PILOT_POLARITY.length]!;
  const pilotValues = [polarity, polarity, polarity, -polarity];
  for (let pilot = 0; pilot < OFDM_PILOT_CARRIERS.length; pilot += 1) {
    real[carrierToFftBin(OFDM_PILOT_CARRIERS[pilot]!)] = pilotValues[pilot]!;
  }
  return Object.freeze({ real, imaginary });
}

function buildFixedAckPsdu(): Uint8Array {
  const withoutFcs = Uint8Array.from([
    0xd4, 0x00, // ACK control frame, protocol version zero.
    0x00, 0x00, // Duration/ID.
    0x02, 0x00, 0x00, 0x00, 0x00, 0x01, // Locally administered unicast RA.
  ]);
  const fcs = crc32Ieee(withoutFcs);
  return Uint8Array.from([
    ...withoutFcs,
    fcs & 0xff,
    (fcs >>> 8) & 0xff,
    (fcs >>> 16) & 0xff,
    (fcs >>> 24) & 0xff,
  ]);
}

function legacyShortTrainingFrequency(): SplitComplexSequence {
  const scale = Math.sqrt(13 / 6);
  const real = new Float64Array(64);
  const imaginary = new Float64Array(64);
  for (let shiftedIndex = 0; shiftedIndex < 64; shiftedIndex += 1) {
    const sign = LEGACY_SHORT_TRAINING_SHIFTED[shiftedIndex]!;
    const carrier = shiftedIndex - 32;
    const fftBin = carrierToFftBin(carrier);
    real[fftBin] = sign * scale;
    imaginary[fftBin] = sign * scale;
  }
  return Object.freeze({ real, imaginary });
}

function shiftedRealSpectrum(values: readonly number[]): SplitComplexSequence {
  if (values.length !== 64) throw new RangeError('Shifted legacy OFDM spectrum must contain 64 bins');
  const real = new Float64Array(64);
  const imaginary = new Float64Array(64);
  for (let shiftedIndex = 0; shiftedIndex < 64; shiftedIndex += 1) {
    real[carrierToFftBin(shiftedIndex - 32)] = values[shiftedIndex]!;
  }
  return Object.freeze({ real, imaginary });
}

function inverseFft(frequency: SplitComplexSequence): SplitComplexSequence {
  if (frequency.real.length !== 64 || frequency.imaginary.length !== 64) {
    throw new RangeError('Legacy OFDM IFFT requires 64 bins');
  }
  const real = Float64Array.from(frequency.real);
  const imaginary = Float64Array.from(frequency.imaginary, (value) => -value);
  fftForwardUnscaledInPlace(real, imaginary);
  for (let sample = 0; sample < 64; sample += 1) {
    real[sample] = real[sample]! / 64;
    imaginary[sample] = -imaginary[sample]! / 64;
  }
  return Object.freeze({ real, imaginary });
}

function encodeCf32le(sequence: SplitComplexSequence): Uint8Array {
  if (sequence.real.length !== sequence.imaginary.length) {
    throw new RangeError('Split-complex channels must have equal lengths');
  }
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

function bytesBitsLeastSignificantFirst(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);
  for (let byte = 0; byte < bytes.length; byte += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      bits[byte * 8 + bit] = (bytes[byte]! >>> bit) & 1;
    }
  }
  return bits;
}

function byteBitsLeastSignificantFirst(value: number): Uint8Array {
  const bits = new Uint8Array(8);
  for (let bit = 0; bit < 8; bit += 1) bits[bit] = (value >>> bit) & 1;
  return bits;
}

function uint16BitsLeastSignificantFirst(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError('Value must be an unsigned 16-bit integer');
  }
  const bits = new Uint8Array(16);
  for (let bit = 0; bit < 16; bit += 1) bits[bit] = (value >>> bit) & 1;
  return bits;
}

function uint16BitsMostSignificantFirst(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError('Value must be an unsigned 16-bit integer');
  }
  const bits = new Uint8Array(16);
  for (let bit = 0; bit < 16; bit += 1) bits[bit] = (value >>> (15 - bit)) & 1;
  return bits;
}

function concatenateBits(...parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dqpskQuarterTurns(firstBit: number, secondBit: number): number {
  const pattern = `${firstBit}${secondBit}`;
  switch (pattern) {
    case '00': return 0;
    case '01': return 1;
    case '11': return 2;
    case '10': return 3;
    default: throw new Error(`Invalid DQPSK pattern ${pattern}`);
  }
}

function qpskBinaryQuarterTurns(firstBit: number, secondBit: number): number {
  const pattern = `${firstBit}${secondBit}`;
  switch (pattern) {
    case '00': return 0;
    case '01': return 1;
    case '10': return 2;
    case '11': return 3;
    default: throw new Error(`Invalid QPSK pattern ${pattern}`);
  }
}

function quarterTurn(value: number): readonly [number, number] {
  switch (((value % 4) + 4) % 4) {
    case 0: return [1, 0];
    case 1: return [0, 1];
    case 2: return [-1, 0];
    case 3: return [0, -1];
    default: throw new Error('Unreachable quarter-turn state');
  }
}

function parity8(value: number): number {
  let parity = 0;
  for (let bit = 0; bit < 8; bit += 1) parity ^= (value >>> bit) & 1;
  return parity;
}

function carrierToFftBin(carrier: number): number {
  if (!Number.isSafeInteger(carrier) || carrier < -32 || carrier > 31) {
    throw new RangeError('Legacy OFDM carrier must be from -32 through 31');
  }
  return carrier < 0 ? 64 + carrier : carrier;
}

function requireBit(value: number): void {
  if (value !== 0 && value !== 1) throw new RangeError(`Expected bit, received ${value}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
