/**
 * Corpus-only content-varying WLAN I/Q synthesis.
 *
 * This module deliberately sits beside, rather than inside, the fixed WLAN
 * catalog path.  It creates deterministic non-qualified ACK PPDUs for corpus
 * generation only; it neither changes nor makes a claim about any fixed
 * artifact, measurement receipt, RF behavior, or CSMA/backoff behavior.
 *
 * Version 1 repeats one seeded PPDU cyclically.  The time origin is supplied
 * independently by the corpus generator, while the content seed controls the
 * locally administered ACK receiver address, FCS, and a non-zero scrambler
 * state.  Packet geometry, PHY rate, PLCP/SIGNAL fields, training, and
 * duration remain fixed.
 */
import {
  fftForwardUnscaledInPlace,
  writeUnitBoundedCf32le,
} from '@atomos/dsp';
import {
  WIFI_ERP_OFDM_SAMPLE_RATE_HZ,
  WIFI_ERP_OFDM_SAMPLE_COUNT,
  WIFI_HR_DSSS_CHIP_COUNT,
  WIFI_HR_DSSS_CHIP_RATE_HZ,
  WIFI_HR_DSSS_PLCP_BIT_COUNT,
  buildLegacyDataBits,
  buildWifiErpOfdmFixedPpdu,
  convolutionalEncodeRateOneHalf,
  crc16CcittOnesComplementTransmitOrder,
  crc32Ieee,
  encodeCck11MbpsSymbol,
  interleaveLegacyOfdmBits,
  mapLegacyOfdmBpskSymbol,
  scrambleHrDsssFeedthrough,
  scrambleLegacyOfdmBits,
  type SplitComplexSequence,
} from './wlan-fixed-iq.js';
import {
  corpusContentWord,
  validateCorpusContentSeed,
} from './corpus-content-prng.js';
import {
  buildWifiHeFixedPpdu,
  crc8AmpduDelimiter,
  type WifiHeFixedPpdu,
  type WifiHeRu,
} from './wlan-he-fixed-iq.js';

export const WLAN_CORPUS_PROFILES = [
  'wifi-hr-dsss-11m',
  'wifi-ofdm-20m',
  'wifi6-he-su',
  'wifi6-he-er-su',
  'wifi6-he-mu',
  'wifi6-he-tb',
] as const;

export type WlanCorpusProfile = typeof WLAN_CORPUS_PROFILES[number];
type WlanHeCorpusProfile = Exclude<
  WlanCorpusProfile,
  'wifi-hr-dsss-11m' | 'wifi-ofdm-20m'
>;

export interface WlanCorpusContentIqInput {
  readonly profile: WlanCorpusProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  /** Stable corpus-content seed, independent of phase/time-origin draws. */
  readonly contentSeed: number;
  /** Logical corpus row that domains packet fields independently of time. */
  readonly contentRowIndex: number;
  /** Absolute native sample coordinate for exact chunked synthesis. */
  readonly startSampleIndex?: number;
}

export interface WlanCorpusPacketDetails {
  readonly profile: WlanCorpusProfile;
  readonly psdu: Uint8Array;
  /** One PSDU per PPDU user; a legacy ACK has exactly one. */
  readonly userPsdus: readonly Uint8Array[];
  readonly scramblerInitialState: number;
  /** One non-zero scrambler state per PPDU user. */
  readonly userScramblerInitialStates: readonly number[];
  readonly periodSamples: number;
  readonly dataStartSample: number;
  readonly dataSampleCount: number;
}

const MAX_SAMPLES_PER_CALL = 65_536;
const MAX_START_SAMPLE_INDEX = 0x7fff_ffff;
const HR_DSSS_BARKER_11 = Object.freeze([1, -1, 1, 1, -1, 1, 1, 1, -1, -1, -1]);

function isLegacyWlanCorpusProfile(
  profile: WlanCorpusProfile,
): profile is 'wifi-hr-dsss-11m' | 'wifi-ofdm-20m' {
  return profile === 'wifi-hr-dsss-11m' || profile === 'wifi-ofdm-20m';
}

/**
 * Derive the seeded MAC content and immutable packet geometry for inspection
 * and tests.  The FCS is recomputed for the seeded ACK receiver address.
 */
export function deriveWlanCorpusPacketDetails(
  profile: WlanCorpusProfile,
  contentSeed: number,
  contentRowIndex: number,
): WlanCorpusPacketDetails {
  validateCorpusArguments(profile, contentSeed, contentRowIndex);
  const userPsdus = isLegacyWlanCorpusProfile(profile)
    ? [buildSeededAckPsdu(profile, contentSeed, contentRowIndex)]
    : buildSeededHePsdus(profile, contentSeed, contentRowIndex);
  const userScramblerInitialStates = userPsdus.map((_psdu, ordinal) => (
    1 + (corpusContentWord(contentSeed, profile, contentRowIndex, 0x2000 + ordinal) % 127)
  ));
  const psdu = userPsdus[0]!;
  const scramblerInitialState = userScramblerInitialStates[0]!;
  if (profile === 'wifi-hr-dsss-11m') {
    return Object.freeze({
      profile,
      psdu,
      userPsdus: Object.freeze(userPsdus),
      scramblerInitialState,
      userScramblerInitialStates: Object.freeze(userScramblerInitialStates),
      periodSamples: WIFI_HR_DSSS_CHIP_COUNT,
      dataStartSample: WIFI_HR_DSSS_PLCP_BIT_COUNT * 11,
      dataSampleCount: psdu.length * 8,
    });
  }
  if (profile === 'wifi-ofdm-20m') {
    return Object.freeze({
      profile,
      psdu,
      userPsdus: Object.freeze(userPsdus),
      scramblerInitialState,
      userScramblerInitialStates: Object.freeze(userScramblerInitialStates),
      periodSamples: WIFI_ERP_OFDM_SAMPLE_COUNT,
      // 160 STS + 160 LTS + one 80-sample SIGNAL symbol.
      dataStartSample: 400,
      dataSampleCount: 480,
    });
  }
  const fixed = buildWifiHeFixedPpdu(profile);
  return Object.freeze({
    profile,
    psdu,
    userPsdus: Object.freeze(userPsdus),
    scramblerInitialState,
    userScramblerInitialStates: Object.freeze(userScramblerInitialStates),
    periodSamples: fixed.metadata.totalSamples,
    dataStartSample: heDataStartSample(fixed),
    dataSampleCount: fixed.metadata.dataOfdmSymbols * 320,
  });
}

/**
 * Return bounded cf32le captures.  Whole and split calls are byte-identical
 * at a common (profile, seed, row, absolute-coordinate) tuple.
 */
export function synthesizeWlanCorpusContentIq(input: WlanCorpusContentIqInput): Uint8Array {
  const validated = validateInput(input);
  const details = deriveWlanCorpusPacketDetails(
    validated.profile,
    validated.contentSeed,
    validated.contentRowIndex,
  );
  const source = validated.profile === 'wifi-hr-dsss-11m'
    ? renderHrDsssAck(details)
    : validated.profile === 'wifi-ofdm-20m'
      ? renderErpOfdmAck(details)
      : renderHePpdu(details);
  if (source.byteLength !== details.periodSamples * 8) {
    throw new Error(`${validated.profile} corpus PPDU has an unexpected native period`);
  }
  return sliceCyclicCf32le(source, validated.startSampleIndex, validated.sampleCount);
}

function validateInput(input: WlanCorpusContentIqInput): Required<WlanCorpusContentIqInput> {
  validateCorpusArguments(input.profile, input.contentSeed, input.contentRowIndex);
  if (!Number.isSafeInteger(input.sampleRateHz) || input.sampleRateHz < 1) {
    throw new RangeError('WLAN corpus sampleRateHz must be a positive safe integer');
  }
  if (!Number.isSafeInteger(input.bandwidthHz) || input.bandwidthHz < 1) {
    throw new RangeError('WLAN corpus bandwidthHz must be a positive safe integer');
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_SAMPLES_PER_CALL) {
    throw new RangeError(`WLAN corpus sampleCount must be an integer from 1 through ${MAX_SAMPLES_PER_CALL}`);
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex)
    || startSampleIndex < 0
    || startSampleIndex > MAX_START_SAMPLE_INDEX
    || startSampleIndex + input.sampleCount - 1 > MAX_START_SAMPLE_INDEX) {
    throw new RangeError('WLAN corpus startSampleIndex is outside the supported range');
  }
  const requiredRate = input.profile === 'wifi-hr-dsss-11m'
    ? WIFI_HR_DSSS_CHIP_RATE_HZ
    : WIFI_ERP_OFDM_SAMPLE_RATE_HZ;
  if (input.sampleRateHz !== requiredRate || input.bandwidthHz !== requiredRate) {
    throw new RangeError(`${input.profile} corpus path requires ${requiredRate} Hz sample rate and bandwidth`);
  }
  return { ...input, startSampleIndex };
}

function validateCorpusArguments(
  profile: WlanCorpusProfile,
  contentSeed: number,
  contentRowIndex: number,
): void {
  if (!(WLAN_CORPUS_PROFILES as readonly string[]).includes(profile)) {
    throw new RangeError(`${profile} has no WLAN corpus generator`);
  }
  validateCorpusContentSeed(contentSeed);
  if (!Number.isSafeInteger(contentRowIndex) || contentRowIndex < 0) {
    throw new RangeError('WLAN corpus contentRowIndex must be a non-negative safe integer');
  }
}

function buildSeededAckPsdu(
  profile: WlanCorpusProfile,
  contentSeed: number,
  contentRowIndex: number,
): Uint8Array {
  const withoutFcs = Uint8Array.from([
    0xd4, 0x00, // ACK control frame, protocol version zero.
    0x00, 0x00, // Duration/ID.
    0x02, 0x00, 0x00, 0x00, 0x00, 0x01, // Locally administered unicast RA.
  ]);
  // Preserve the locally administered/unicast first octet; only the remaining
  // receiver-address octets carry corpus content.
  for (let octet = 1; octet < 6; octet += 1) {
    withoutFcs[4 + octet] = corpusContentWord(
      contentSeed,
      profile,
      contentRowIndex,
      0x1000 + octet,
    ) & 0xff;
  }
  const fcs = crc32Ieee(withoutFcs);
  return Uint8Array.from([
    ...withoutFcs,
    fcs & 0xff,
    (fcs >>> 8) & 0xff,
    (fcs >>> 16) & 0xff,
    (fcs >>> 24) & 0xff,
  ]);
}

/** Vary only QoS payload octets and the resulting FCS; fixed MAC headers stay intact. */
function buildSeededHePsdus(
  profile: WlanHeCorpusProfile,
  contentSeed: number,
  contentRowIndex: number,
): Uint8Array[] {
  const fixed = buildWifiHeFixedPpdu(profile);
  return fixed.users.map((user, ordinal) => {
    const mpdu = buildSeededHeMpdu(
      user.mpdu,
      profile,
      contentSeed,
      contentRowIndex,
      ordinal,
    );
    const psdu = buildSingleMpduAmpdu(mpdu);
    if (psdu.length !== user.psdu.length) {
      throw new Error(`${profile} seeded user ${ordinal} changed fixed PSDU geometry`);
    }
    return psdu;
  });
}

function buildSeededHeMpdu(
  fixedMpdu: Uint8Array,
  profile: WlanHeCorpusProfile,
  contentSeed: number,
  contentRowIndex: number,
  ordinal: number,
): Uint8Array {
  const headerOctets = 26;
  if (fixedMpdu.length < headerOctets + 4) {
    throw new Error(`${profile} fixed MPDU is too short for a QoS header and FCS`);
  }
  const bodyWithoutFcs = fixedMpdu.subarray(0, -4).slice();
  for (let octet = headerOctets; octet < bodyWithoutFcs.length; octet += 1) {
    bodyWithoutFcs[octet] = corpusContentWord(
      contentSeed,
      profile,
      contentRowIndex,
      0x3000 + ordinal * 0x400 + octet - headerOctets,
    ) & 0xff;
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

/** Render the variable ERP DATA field over the untouched fixed preamble/SIGNAL/extension. */
function renderErpOfdmAck(details: WlanCorpusPacketDetails): Uint8Array {
  const fixed = buildWifiErpOfdmFixedPpdu();
  const source = fixed.cf32le.slice();
  const dataUncodedBits = buildLegacyDataBits(details.psdu, fixed.dataUncodedBits.length);
  const dataScrambledBits = scrambleLegacyOfdmBits(dataUncodedBits, details.scramblerInitialState);
  const tailStart = 16 + details.psdu.length * 8;
  dataScrambledBits.fill(0, tailStart, tailStart + 6);
  const dataCodedBits = convolutionalEncodeRateOneHalf(dataScrambledBits);
  const dataInterleavedBits = interleaveLegacyOfdmBits(
    dataCodedBits,
    fixed.metadata.ofdmDataSymbols,
  );
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  for (let symbol = 0; symbol < fixed.metadata.ofdmDataSymbols; symbol += 1) {
    const frequency = mapLegacyOfdmBpskSymbol(
      dataInterleavedBits.subarray(symbol * 48, (symbol + 1) * 48),
      symbol + 1,
    );
    writeLegacyOfdmSymbol(view, details.dataStartSample + symbol * 80, inverseFft(frequency));
  }
  return source;
}

/**
 * Replace only HE data-resource elements in the fixed PPDU.  The baseline
 * byte copy intentionally preserves every training, SIG, RU allocation,
 * pilot, and timing sample; seeded BCC data bits occupy data carriers only.
 */
function renderHePpdu(details: WlanCorpusPacketDetails): Uint8Array {
  if (isLegacyWlanCorpusProfile(details.profile)) {
    throw new Error(`${details.profile} is not an HE corpus PPDU`);
  }
  const fixed = buildWifiHeFixedPpdu(details.profile);
  if (fixed.users.length !== details.userPsdus.length
    || fixed.users.length !== details.userScramblerInitialStates.length) {
    throw new Error(`${details.profile} seeded user count does not match the fixed PPDU`);
  }
  const userFrequencySymbols = fixed.users.map((user, ordinal) => buildHeUserFrequencySymbols(
    fixed,
    user,
    details.userPsdus[ordinal]!,
    details.userScramblerInitialStates[ordinal]!,
  ));
  const dataFrequency = combineHeUserFrequencySymbols(
    userFrequencySymbols,
    fixed.metadata.dataOfdmSymbols,
  );
  const dataStartSample = heDataStartSample(fixed);
  const expectedEnd = dataStartSample + dataFrequency.length * 320;
  if (expectedEnd !== fixed.metadata.totalSamples) {
    throw new Error(`${details.profile} corpus data layout no longer fills the fixed PPDU`);
  }
  const activeToneCount = new Set(fixed.users.flatMap((user) => ruTones(user.ru))).size;
  const dataScale = 1 / Math.sqrt(activeToneCount);
  const source = fixed.cf32le.slice();
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  for (let symbol = 0; symbol < dataFrequency.length; symbol += 1) {
    writeHeOfdmSymbol(view, dataStartSample + symbol * 320, inverseFft(dataFrequency[symbol]!), dataScale);
  }
  return source;
}

function buildHeUserFrequencySymbols(
  fixed: WifiHeFixedPpdu,
  fixedUser: WifiHeFixedPpdu['users'][number],
  psdu: Uint8Array,
  scramblerInitialState: number,
): readonly SplitComplexSequence[] {
  const dataSymbols = fixed.metadata.dataOfdmSymbols;
  const nDbps = fixedUser.dataUncodedBits.length / dataSymbols;
  const nCbps = fixedUser.dataInterleavedBits.length / dataSymbols;
  if (!Number.isSafeInteger(nDbps) || !Number.isSafeInteger(nCbps)) {
    throw new Error(`${fixed.profile} corpus user geometry is invalid`);
  }
  const dataUncodedBits = new Uint8Array(dataSymbols * nDbps);
  if (16 + psdu.length * 8 + 6 !== dataUncodedBits.length) {
    throw new Error(`${fixed.profile} seeded A-MPDU no longer fills its fixed HE data symbols`);
  }
  dataUncodedBits.set(bytesBitsLeastSignificantFirst(psdu), 16);
  const dataScrambledBits = scrambleHeBits(dataUncodedBits, scramblerInitialState);
  const tailStart = 16 + psdu.length * 8;
  dataScrambledBits.fill(0, tailStart, tailStart + 6);
  const dataCodedBits = convolutionalEncodeRateOneHalf(dataScrambledBits);
  const columns = fixedUser.ru === '242' ? 26 : 17;
  const rows = fixedUser.ru === '242' ? 9 : 6;
  const dataInterleavedBits = interleaveRectangular(dataCodedBits, columns, rows, dataSymbols);
  if (dataInterleavedBits.length !== dataSymbols * nCbps) {
    throw new Error(`${fixed.profile} seeded HE BCC geometry changed`);
  }
  return Object.freeze(Array.from({ length: dataSymbols }, (_unused, symbol) => (
    mapSeededHeDataSymbol(
      fixedUser.frequencyDomainSymbols[symbol]!,
      dataInterleavedBits.subarray(symbol * nCbps, (symbol + 1) * nCbps),
      fixedUser.ru,
    )
  )));
}

function combineHeUserFrequencySymbols(
  users: readonly (readonly SplitComplexSequence[])[],
  dataSymbols: number,
): readonly SplitComplexSequence[] {
  return Object.freeze(Array.from({ length: dataSymbols }, (_unused, symbol) => {
    const real = new Float64Array(256);
    const imaginary = new Float64Array(256);
    for (const user of users) {
      const source = user[symbol]!;
      for (let bin = 0; bin < 256; bin += 1) {
        real[bin] = real[bin]! + source.real[bin]!;
        imaginary[bin] = imaginary[bin]! + source.imaginary[bin]!;
      }
    }
    return Object.freeze({ real, imaginary });
  }));
}

function mapSeededHeDataSymbol(
  baseline: SplitComplexSequence,
  bits: Uint8Array,
  ru: WifiHeRu,
): SplitComplexSequence {
  const pilots = new Set(ruPilots(ru));
  const dataCarriers = ruTones(ru).filter((carrier) => !pilots.has(carrier));
  if (bits.length !== dataCarriers.length) {
    throw new RangeError(`${ru} MCS 0 symbol requires ${dataCarriers.length} bits`);
  }
  const real = Float64Array.from(baseline.real);
  const imaginary = Float64Array.from(baseline.imaginary);
  for (let index = 0; index < dataCarriers.length; index += 1) {
    const bit = bits[index]!;
    if (bit !== 0 && bit !== 1) throw new RangeError(`Expected BCC bit, received ${bit}`);
    const bin = carrierToFftBin(dataCarriers[index]!, 256);
    real[bin] = bit === 0 ? -1 : 1;
    imaginary[bin] = 0;
  }
  return Object.freeze({ real, imaginary });
}

function heDataStartSample(fixed: WifiHeFixedPpdu): number {
  return 160 + 160 + 80 + 80
    + fixed.metadata.heSigASymbols * 80
    + fixed.metadata.heSigBSymbols * 80
    + fixed.metadata.heStfSamples
    + 320;
}

function writeHeOfdmSymbol(
  destination: DataView,
  sampleOffset: number,
  body: SplitComplexSequence,
  scale: number,
): void {
  if (body.real.length !== 256 || body.imaginary.length !== 256) {
    throw new RangeError('HE OFDM body must contain 256 samples');
  }
  for (let sample = 192; sample < 256; sample += 1) {
    writeUnitBoundedCf32le(
      destination,
      (sampleOffset + sample - 192) * 8,
      body.real[sample]! * scale,
      body.imaginary[sample]! * scale,
    );
  }
  for (let sample = 0; sample < 256; sample += 1) {
    writeUnitBoundedCf32le(
      destination,
      (sampleOffset + 64 + sample) * 8,
      body.real[sample]! * scale,
      body.imaginary[sample]! * scale,
    );
  }
}

function scrambleHeBits(bits: Uint8Array, initialState: number): Uint8Array {
  if (!Number.isSafeInteger(initialState) || initialState < 1 || initialState > 127) {
    throw new RangeError('HE scrambler initial state must be from 1 through 127');
  }
  let state = initialState;
  const output = new Uint8Array(bits.length);
  for (let index = 0; index < bits.length; index += 1) {
    const bit = bits[index]!;
    if (bit !== 0 && bit !== 1) throw new RangeError(`Expected bit, received ${bit}`);
    const feedback = Number((state & 64) !== 0) ^ Number((state & 8) !== 0);
    output[index] = feedback ^ bit;
    state = ((state << 1) & 0x7e) | feedback;
  }
  return output;
}

function interleaveRectangular(
  bits: Uint8Array,
  columns: number,
  rows: number,
  symbolCount: number,
): Uint8Array {
  const bitsPerSymbol = columns * rows;
  if (!Number.isSafeInteger(symbolCount)
    || symbolCount < 1
    || bits.length !== bitsPerSymbol * symbolCount) {
    throw new RangeError('BCC interleaver input does not match its rectangular geometry');
  }
  const output = new Uint8Array(bits.length);
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    const offset = symbol * bitsPerSymbol;
    for (let outputIndex = 0; outputIndex < bitsPerSymbol; outputIndex += 1) {
      const inputIndex = columns * (outputIndex % rows) + Math.floor(outputIndex / rows);
      output[offset + outputIndex] = bits[offset + inputIndex]!;
    }
  }
  return output;
}

const HE_PILOTS_106_LEFT = Object.freeze([-116, -90, -48, -22]);
const HE_PILOTS_106_RIGHT = Object.freeze([22, 48, 90, 116]);
const HE_PILOTS_242 = Object.freeze([-116, -90, -48, -22, 22, 48, 90, 116]);

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
  return Array.from({ length: last - first + 1 }, (_unused, index) => first + index);
}

function carrierToFftBin(carrier: number, fftSize: number): number {
  if (!Number.isSafeInteger(carrier) || carrier < -fftSize / 2 || carrier >= fftSize / 2) {
    throw new RangeError(`Carrier ${carrier} is outside the ${fftSize}-point FFT`);
  }
  return carrier < 0 ? fftSize + carrier : carrier;
}

/** Render a complete seeded HR-DSSS ACK PPDU at the complex-chip interface. */
function renderHrDsssAck(details: WlanCorpusPacketDetails): Uint8Array {
  const signal = 0x6e;
  const service = 0x80;
  const lengthMicroseconds = 11;
  const protectedHeaderBits = concatenateBits(
    byteBitsLeastSignificantFirst(signal),
    byteBitsLeastSignificantFirst(service),
    uint16BitsLeastSignificantFirst(lengthMicroseconds),
  );
  const headerCrc = crc16CcittOnesComplementTransmitOrder(protectedHeaderBits);
  const unscrambledBits = concatenateBits(
    new Uint8Array(128).fill(1),
    uint16BitsLeastSignificantFirst(0xf3a0),
    protectedHeaderBits,
    uint16BitsMostSignificantFirst(headerCrc),
    bytesBitsLeastSignificantFirst(details.psdu),
  );
  if (unscrambledBits.length !== WIFI_HR_DSSS_PLCP_BIT_COUNT + details.psdu.length * 8) {
    throw new Error('Seeded HR-DSSS ACK geometry changed');
  }
  const scrambledBits = scrambleHrDsssFeedthrough(
    unscrambledBits,
    details.scramblerInitialState,
  );
  const bytes = new Uint8Array(WIFI_HR_DSSS_CHIP_COUNT * 8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let chipOffset = 0;
  let referencePhaseQuarterTurns = 0;
  for (let bitIndex = 0; bitIndex < WIFI_HR_DSSS_PLCP_BIT_COUNT; bitIndex += 1) {
    if (scrambledBits[bitIndex] === 1) {
      referencePhaseQuarterTurns = (referencePhaseQuarterTurns + 2) & 3;
    }
    const phase = quarterTurn(referencePhaseQuarterTurns);
    for (const barkerChip of HR_DSSS_BARKER_11) {
      writeUnitBoundedCf32le(view, chipOffset * 8, barkerChip * phase[0], barkerChip * phase[1]);
      chipOffset += 1;
    }
  }
  const psduBits = scrambledBits.subarray(WIFI_HR_DSSS_PLCP_BIT_COUNT);
  for (let symbol = 0; symbol < details.psdu.length; symbol += 1) {
    const encoded = encodeCck11MbpsSymbol(
      psduBits.subarray(symbol * 8, (symbol + 1) * 8),
      referencePhaseQuarterTurns,
      symbol,
    );
    referencePhaseQuarterTurns = encoded.phaseQuarterTurns;
    for (let chip = 0; chip < 8; chip += 1) {
      writeUnitBoundedCf32le(
        view,
        chipOffset * 8,
        encoded.chips.real[chip]!,
        encoded.chips.imaginary[chip]!,
      );
      chipOffset += 1;
    }
  }
  if (chipOffset !== WIFI_HR_DSSS_CHIP_COUNT) {
    throw new Error(`Seeded HR-DSSS renderer produced ${chipOffset} chips`);
  }
  return bytes;
}

function writeLegacyOfdmSymbol(
  destination: DataView,
  sampleOffset: number,
  body: SplitComplexSequence,
): void {
  for (let sample = 48; sample < 64; sample += 1) {
    writeUnitBoundedCf32le(destination, (sampleOffset + sample - 48) * 8, body.real[sample]!, body.imaginary[sample]!);
  }
  for (let sample = 0; sample < 64; sample += 1) {
    writeUnitBoundedCf32le(destination, (sampleOffset + 16 + sample) * 8, body.real[sample]!, body.imaginary[sample]!);
  }
}

function inverseFft(frequency: SplitComplexSequence): SplitComplexSequence {
  const real = Float64Array.from(frequency.real);
  const imaginary = Float64Array.from(frequency.imaginary, (value) => -value);
  fftForwardUnscaledInPlace(real, imaginary);
  for (let sample = 0; sample < real.length; sample += 1) {
    real[sample] = real[sample]! / real.length;
    imaginary[sample] = -imaginary[sample]! / real.length;
  }
  return Object.freeze({ real, imaginary });
}

function sliceCyclicCf32le(source: Uint8Array, startSampleIndex: number, sampleCount: number): Uint8Array {
  const periodSamples = source.byteLength / 8;
  const output = new Uint8Array(sampleCount * 8);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const sourceSample = (startSampleIndex + sample) % periodSamples;
    output.set(source.subarray(sourceSample * 8, sourceSample * 8 + 8), sample * 8);
  }
  return output;
}

function byteBitsLeastSignificantFirst(value: number): Uint8Array {
  const bits = new Uint8Array(8);
  for (let bit = 0; bit < 8; bit += 1) bits[bit] = (value >>> bit) & 1;
  return bits;
}

function bytesBitsLeastSignificantFirst(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);
  for (let byte = 0; byte < bytes.length; byte += 1) {
    bits.set(byteBitsLeastSignificantFirst(bytes[byte]!), byte * 8);
  }
  return bits;
}

function uint16BitsLeastSignificantFirst(value: number): Uint8Array {
  const bits = new Uint8Array(16);
  for (let bit = 0; bit < 16; bit += 1) bits[bit] = (value >>> bit) & 1;
  return bits;
}

function uint16BitsMostSignificantFirst(value: number): Uint8Array {
  const bits = new Uint8Array(16);
  for (let bit = 0; bit < 16; bit += 1) bits[bit] = (value >>> (15 - bit)) & 1;
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

function quarterTurn(turns: number): readonly [number, number] {
  switch (turns & 3) {
    case 0: return [1, 0];
    case 1: return [0, 1];
    case 2: return [-1, 0];
    default: return [0, -1];
  }
}
