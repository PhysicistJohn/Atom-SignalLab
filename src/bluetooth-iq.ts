import {
  synthesizedSignalProfileSchema,
  type SynthesizedSignalProfile,
} from './contracts.js';

export const BLUETOOTH_ANALYTIC_IQ_PROFILES = Object.freeze([
  'bluetooth-classic-connected',
  'bluetooth-le-advertising',
] as const);
export type BluetoothAnalyticIqProfile = typeof BLUETOOTH_ANALYTIC_IQ_PROFILES[number];

/**
 * The packet bits are standards-derived fixed vectors. The analytic GFSK
 * projection remains an engineering I/Q source because it has not passed the
 * Bluetooth SIG RF-PHY qualification test suite.
 */
export const BLUETOOTH_ANALYTIC_IQ_QUALIFICATION =
  'standards-derived-engineering-projection' as const;
export const BLUETOOTH_ANALYTIC_IQ_DISCLOSURE =
  'Deterministic fixed-packet Bluetooth digital vectors with packet fields, HEC/CRC, whitening, and required header FEC checked against Bluetooth Core 6.3 sample data. The BR profile is Basic Rate GFSK only (not EDR): one DH1 packet in one 625 us connection-state slot on pinned RF channel 8. The LE profile is one LE 1M legacy ADV_NONCONN_IND event on primary advertising channel 38. The seed input is retained for API compatibility but cannot alter either vector. The normalized analytic BT=0.5 GFSK projection is not a calibrated RF emission, a Bluetooth SIG RF-PHY qualification result, a product qualification, or an interoperability claim. Sample rates below 80 MHz produce a deterministic discrete-time alias projection of the declared carrier offset.' as const;
export const BLUETOOTH_ANALYTIC_IQ_FORMAT = 'interleaved-f32-iq' as const;

export const BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ = 2_441_000_000 as const;
export const MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ = 1_000_000 as const;
export const BLUETOOTH_ANALYTIC_IQ_ALIAS_FREE_MINIMUM_SAMPLE_RATE_HZ = 80_000_000 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ = 245_760_000 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES = 65_536 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_START_SECONDS = 60 as const;
export const MIN_BLUETOOTH_ANALYTIC_IQ_SEED = 1 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_SEED = 0xffff_ffff as const;

const SYMBOL_RATE_HZ = 1_000_000;
const GAUSSIAN_BT = 0.5;
const GAUSSIAN_SYMBOL_RADIUS = 8;
const GAUSSIAN_STANDARD_DEVIATION_SYMBOLS =
  Math.sqrt(Math.log(2)) / (2 * Math.PI * GAUSSIAN_BT);
const BR_SLOT_SECONDS = 625e-6;
const BR_CHANNEL_INDEX = 8;
const BR_CHANNEL_CENTER_HZ = 2_402_000_000 + BR_CHANNEL_INDEX * 1_000_000;
const BR_FREQUENCY_DEVIATION_HZ = 160_000;
const BR_LAP = 0x000000;
const BR_UAP = 0x47;
const BR_CLK_6_1 = 0x3f;
const LE_CHANNEL_INDEX = 38;
const LE_CHANNEL_CENTER_HZ = 2_426_000_000;
const LE_FREQUENCY_DEVIATION_HZ = 250_000;
const LE_ADVERTISING_ACCESS_ADDRESS = 0x8e89bed6;
const LE_ADVERTISING_CRC_INIT = 0x555555;
const TWO_PI = 2 * Math.PI;

/**
 * SHA-256 of the UTF-8 transmission-order bit string, including the access
 * code/address and excluding inactive time in the surrounding capture.
 */
export const BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256 =
  '1cca8205c60ed91bb732054ef51d3a28fbe38639aad2bf5e985e64754412cc16' as const;
export const BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256 =
  '56c0fffc7d1dacdc9651f883e080f7a77a19712370dae0a785ab2f70b15417c1' as const;

const BR_ACCESS_CODE_BITS = bitsFromTransmissionHex('57e7041e34000000d5');
const BR_HEADER_DATA_BITS = Object.freeze([
  ...leastSignificantBits(0b011, 3), // LT_ADDR
  ...leastSignificantBits(0b0100, 4), // TYPE = DH1
  0, // FLOW
  1, // ARQN
  0, // SEQN
]);
const BR_HEC_BITS = bluetoothBrHecBits(BR_HEADER_DATA_BITS, BR_UAP);
const BR_HEADER_WITH_HEC_BITS = Object.freeze([...BR_HEADER_DATA_BITS, ...BR_HEC_BITS]);
const BR_PAYLOAD_DATA_BITS = bytesToLeastSignificantBits([
  0x2e, // LLID=2, FLOW=1, LENGTH=5
  0x01, 0x02, 0x03, 0x04, 0x05,
]);
const BR_CRC_BITS = bluetoothBrCrcBits(BR_PAYLOAD_DATA_BITS, BR_UAP);
const BR_PAYLOAD_WITH_CRC_BITS = Object.freeze([...BR_PAYLOAD_DATA_BITS, ...BR_CRC_BITS]);

/**
 * The Core Part G DH1 sample is explicitly published without whitening. This
 * frozen intermediate is useful as an independent, human-auditable anchor.
 */
export const BLUETOOTH_BR_DH1_CORE_SAMPLE_UNWHITENED_HEADER_BITS =
  '111111000000000111000000111000000111111000000000000000' as const;
export const BLUETOOTH_BR_DH1_CORE_SAMPLE_UNWHITENED_PAYLOAD_BITS =
  '0111010010000000010000001100000000100000101000001110110000110110' as const;

const BR_WHITENED_HEADER_AND_PAYLOAD = bluetoothBrWhitenBits(
  [...BR_HEADER_WITH_HEC_BITS, ...BR_PAYLOAD_WITH_CRC_BITS],
  BR_CLK_6_1,
);
const BR_TRANSMISSION_BITS = Object.freeze([
  ...BR_ACCESS_CODE_BITS,
  ...repeatEachBitThreeTimes(BR_WHITENED_HEADER_AND_PAYLOAD.slice(0, 18)),
  ...BR_WHITENED_HEADER_AND_PAYLOAD.slice(18),
]);

const LE_PREAMBLE_BITS = bytesToLeastSignificantBits([0xaa]);
const LE_ACCESS_ADDRESS_BITS = bytesToLeastSignificantBits([0xd6, 0xbe, 0x89, 0x8e]);
const LE_PDU_BITS = bytesToLeastSignificantBits([
  0x42, 0x09, // ADV_NONCONN_IND header: TxAdd=1, Length=9
  0xa6, 0xa5, 0xa4, 0xa3, 0xa2, 0xc1, // AdvA = C1:A2:A3:A4:A5:A6
  0x01, 0x02, 0x03, // AdvData
]);
const LE_CRC_BITS = bluetoothLeCrcBits(LE_PDU_BITS, LE_ADVERTISING_CRC_INIT);
const LE_WHITENED_PDU_AND_CRC = bluetoothLeWhitenBits(
  [...LE_PDU_BITS, ...LE_CRC_BITS],
  LE_CHANNEL_INDEX,
);
const LE_TRANSMISSION_BITS = Object.freeze([
  ...LE_PREAMBLE_BITS,
  ...LE_ACCESS_ADDRESS_BITS,
  ...LE_WHITENED_PDU_AND_CRC,
]);

export const BLUETOOTH_BR_DH1_FIXED_VECTOR = Object.freeze({
  vector: 'Bluetooth Core 6.3 BR DH1 fixed connection-slot capture' as const,
  digitalValidation: 'official-sample-matched' as const,
  packetType: 'DH1' as const,
  encryption: false,
  lap: BR_LAP,
  uap: BR_UAP,
  clock6To1: BR_CLK_6_1,
  channelIndex: BR_CHANNEL_INDEX,
  channelCenterHz: BR_CHANNEL_CENTER_HZ,
  slotDurationSeconds: BR_SLOT_SECONDS,
  packetDurationSeconds: BR_TRANSMISSION_BITS.length / SYMBOL_RATE_HZ,
  inactiveTailSeconds: BR_SLOT_SECONDS - BR_TRANSMISSION_BITS.length / SYMBOL_RATE_HZ,
  headerFec: 'rate-1/3 repetition' as const,
  payloadFec: 'none (DH1)' as const,
  payloadHeaderOctet: 0x2e,
  payloadOctets: Object.freeze([0x01, 0x02, 0x03, 0x04, 0x05] as const),
  hec: 0x06,
  crcOctets: Object.freeze([0x37, 0x6c] as const),
  accessCodeBits: BR_ACCESS_CODE_BITS,
  headerDataBits: BR_HEADER_DATA_BITS,
  hecBits: BR_HEC_BITS,
  headerWithHecBits: BR_HEADER_WITH_HEC_BITS,
  payloadWithCrcBits: BR_PAYLOAD_WITH_CRC_BITS,
  transmissionBits: BR_TRANSMISSION_BITS,
  transmissionBitsSha256: BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256,
  hashEncoding: 'sha256(utf8(transmission-order 0/1 bit string))' as const,
});

export const BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR = Object.freeze({
  vector: 'Bluetooth Core 6.3 LE 1M ADV_NONCONN_IND fixed event capture' as const,
  digitalValidation: 'official-complete-packet-match' as const,
  phy: 'LE 1M' as const,
  pduType: 'ADV_NONCONN_IND' as const,
  txAdd: 1,
  advA: 'C1:A2:A3:A4:A5:A6' as const,
  advDataOctets: Object.freeze([0x01, 0x02, 0x03] as const),
  channelIndex: LE_CHANNEL_INDEX,
  channelCenterHz: LE_CHANNEL_CENTER_HZ,
  eventStartSeconds: 0,
  eventDurationSeconds: LE_TRANSMISSION_BITS.length / SYMBOL_RATE_HZ,
  accessAddress: LE_ADVERTISING_ACCESS_ADDRESS,
  crcInit: LE_ADVERTISING_CRC_INIT,
  preambleBits: LE_PREAMBLE_BITS,
  accessAddressBits: LE_ACCESS_ADDRESS_BITS,
  pduBits: LE_PDU_BITS,
  crcBits: LE_CRC_BITS,
  whitenedPduAndCrcBits: LE_WHITENED_PDU_AND_CRC,
  transmissionBits: LE_TRANSMISSION_BITS,
  transmissionBitsSha256: BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256,
  hashEncoding: 'sha256(utf8(transmission-order 0/1 bit string))' as const,
});

export const BLUETOOTH_ANALYTIC_IQ_MODELS = Object.freeze({
  'bluetooth-classic-connected': Object.freeze({
    qualification: BLUETOOTH_ANALYTIC_IQ_QUALIFICATION,
    digitalValidation: BLUETOOTH_BR_DH1_FIXED_VECTOR.digitalValidation,
    schedule: 'one-fixed-dh1-packet-in-one-625us-slot' as const,
    referenceCenterHz: BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
    channelIndex: BR_CHANNEL_INDEX,
    channelCenterHz: BR_CHANNEL_CENTER_HZ,
    slotSeconds: BR_SLOT_SECONDS,
    packetDurationSeconds: BLUETOOTH_BR_DH1_FIXED_VECTOR.packetDurationSeconds,
    symbolRateHz: SYMBOL_RATE_HZ,
    frequencyDeviationHz: BR_FREQUENCY_DEVIATION_HZ,
    modulationIndex: 2 * BR_FREQUENCY_DEVIATION_HZ / SYMBOL_RATE_HZ,
    gaussianBt: GAUSSIAN_BT,
    transmissionBitsSha256: BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256,
  }),
  'bluetooth-le-advertising': Object.freeze({
    qualification: BLUETOOTH_ANALYTIC_IQ_QUALIFICATION,
    digitalValidation: BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.digitalValidation,
    schedule: 'one-fixed-le-1m-adv-nonconn-ind-event' as const,
    referenceCenterHz: BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
    channelIndex: LE_CHANNEL_INDEX,
    channelCenterHz: LE_CHANNEL_CENTER_HZ,
    packetDurationSeconds: BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.eventDurationSeconds,
    symbolRateHz: SYMBOL_RATE_HZ,
    frequencyDeviationHz: LE_FREQUENCY_DEVIATION_HZ,
    modulationIndex: 2 * LE_FREQUENCY_DEVIATION_HZ / SYMBOL_RATE_HZ,
    gaussianBt: GAUSSIAN_BT,
    transmissionBitsSha256: BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256,
  }),
});

export interface BluetoothAnalyticIqSynthesisInput {
  readonly profile: SynthesizedSignalProfile;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  /**
   * Retained and validated for compatibility with the shared synthesis API.
   * Fixed Bluetooth vectors are deliberately seed-invariant.
   */
  readonly seed: number;
  /** Absolute sample coordinate, retained so independently requested slices agree. */
  readonly startSampleIndex?: number;
}

interface FixedPacketSegment {
  readonly startSample: number;
  readonly endSample: number;
  readonly channelCenterHz: number;
  readonly frequencyDeviationHz: number;
  readonly bits: readonly number[];
}

/**
 * Produce the fixed packet captures as normalized analytic
 * `[I0, Q0, I1, Q1, ...]` float32 samples.
 *
 * Packet symbols are exact and seed-invariant. GFSK uses the BT=0.5
 * unit-area Gaussian impulse response convolved with the rectangular NRZ
 * symbol stream, followed by continuous phase integration. Inactive time is
 * exact complex zero. Carrier offsets are relative to 2.441 GHz.
 */
export function synthesizeBluetoothAnalyticSamples(
  input: BluetoothAnalyticIqSynthesisInput,
): Float32Array {
  const profile = bluetoothAnalyticIqProfile(input.profile);
  validateInput(input);
  const startSample = input.startSampleIndex ?? 0;
  const endSample = startSample + input.sampleCount;
  const segment = fixedPacketSegment(profile, startSample, endSample, input.sampleRateHz);
  const output = new Float32Array(input.sampleCount * 2);
  if (!segment) return output;

  let phase = phaseAtSample(segment, Math.max(startSample, segment.startSample), input.sampleRateHz);
  for (let relativeIndex = 0; relativeIndex < input.sampleCount; relativeIndex += 1) {
    const absoluteIndex = startSample + relativeIndex;
    if (absoluteIndex < segment.startSample || absoluteIndex >= segment.endSample) continue;
    writeUnitComplex(output, relativeIndex * 2, phase);
    phase = advancePhase(
      phase,
      instantaneousFrequencyHz(segment, absoluteIndex - segment.startSample, input.sampleRateHz),
      input.sampleRateHz,
    );
  }
  return output;
}

/** Bluetooth BR HEC, returning bits in over-air transmission order. */
export function bluetoothBrHecBits(
  tenHeaderBits: readonly number[],
  uap: number,
): readonly number[] {
  validateBits(tenHeaderBits, 10, 'BR header');
  validateUnsignedInteger(uap, 8, 'BR UAP');
  return Object.freeze(crcShiftLeft(tenHeaderBits, uap, 8, 0xa7));
}

/** Bluetooth BR CRC-CCITT, returning bits in over-air transmission order. */
export function bluetoothBrCrcBits(
  payloadBits: readonly number[],
  uap: number,
): readonly number[] {
  validateBits(payloadBits, undefined, 'BR payload');
  validateUnsignedInteger(uap, 8, 'BR UAP');
  return Object.freeze(crcShiftLeft(payloadBits, uap, 16, 0x1021));
}

/**
 * Bluetooth BR whitening, initialized with CLK6-1 and the mandatory MSB one.
 * Header and payload must be supplied in one call to preserve LFSR continuity.
 */
export function bluetoothBrWhitenBits(
  headerAndPayloadBits: readonly number[],
  clock6To1: number,
): readonly number[] {
  validateBits(headerAndPayloadBits, undefined, 'BR whitening input');
  validateUnsignedInteger(clock6To1, 6, 'BR CLK6-1');
  let lfsr = 0x40 | clock6To1;
  return Object.freeze(headerAndPayloadBits.map((bit) => {
    const whiteningBit = (lfsr >>> 6) & 1;
    lfsr = ((lfsr << 1) & 0x7f) ^ (whiteningBit === 1 ? 0x11 : 0);
    return bit ^ whiteningBit;
  }));
}

/** Bluetooth LE 24-bit CRC, returning bits in over-air transmission order. */
export function bluetoothLeCrcBits(
  pduBits: readonly number[],
  crcInit: number,
): readonly number[] {
  validateBits(pduBits, undefined, 'LE PDU');
  validateUnsignedInteger(crcInit, 24, 'LE CRCInit');
  return Object.freeze(crcShiftLeft(pduBits, crcInit, 24, 0x00065b));
}

/** Bluetooth LE data whitening for the supplied physical channel index. */
export function bluetoothLeWhitenBits(
  pduAndCrcBits: readonly number[],
  channelIndex: number,
): readonly number[] {
  validateBits(pduAndCrcBits, undefined, 'LE whitening input');
  if (!Number.isSafeInteger(channelIndex) || channelIndex < 0 || channelIndex > 39) {
    throw new RangeError('LE physical channel index must be an integer from 0 through 39');
  }
  let lfsr = channelIndex | 0x40;
  return Object.freeze(pduAndCrcBits.map((bit) => {
    const whiteningBit = lfsr & 1;
    lfsr = (lfsr >>> 1) ^ (whiteningBit === 1 ? 0x44 : 0);
    return bit ^ whiteningBit;
  }));
}

export function isBluetoothAnalyticIqProfile(
  profile: SynthesizedSignalProfile,
): profile is BluetoothAnalyticIqProfile {
  return BLUETOOTH_ANALYTIC_IQ_PROFILES.some((candidate) => candidate === profile);
}

function bluetoothAnalyticIqProfile(value: SynthesizedSignalProfile): BluetoothAnalyticIqProfile {
  const profile = synthesizedSignalProfileSchema.parse(value);
  if (!isBluetoothAnalyticIqProfile(profile)) {
    throw new RangeError(`${profile} has no Bluetooth analytic complex-baseband engineering projection`);
  }
  return profile;
}

function validateInput(input: BluetoothAnalyticIqSynthesisInput): void {
  if (!Number.isSafeInteger(input.sampleRateHz)
    || input.sampleRateHz < MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ
    || input.sampleRateHz > MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ) {
    throw new RangeError(`Bluetooth analytic sample rate must be a safe integer from ${MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ} through ${MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ} Hz`);
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES) {
    throw new RangeError(`Bluetooth analytic sample count must be a safe integer from 1 through ${MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES}`);
  }
  if (!Number.isSafeInteger(input.seed)
    || input.seed < MIN_BLUETOOTH_ANALYTIC_IQ_SEED
    || input.seed > MAX_BLUETOOTH_ANALYTIC_IQ_SEED) {
    throw new RangeError(`Bluetooth analytic seed must be a safe integer from ${MIN_BLUETOOTH_ANALYTIC_IQ_SEED} through ${MAX_BLUETOOTH_ANALYTIC_IQ_SEED}`);
  }
  const startSample = input.startSampleIndex ?? 0;
  const maximumStartSample = input.sampleRateHz * MAX_BLUETOOTH_ANALYTIC_IQ_START_SECONDS;
  if (!Number.isSafeInteger(startSample) || startSample < 0 || startSample > maximumStartSample) {
    throw new RangeError(`Bluetooth analytic start sample must be a safe integer covering at most ${MAX_BLUETOOTH_ANALYTIC_IQ_START_SECONDS} seconds`);
  }
  if (!Number.isSafeInteger(startSample + input.sampleCount)) {
    throw new RangeError('Bluetooth analytic sample geometry exceeds safe integer coordinates');
  }
}

function fixedPacketSegment(
  profile: BluetoothAnalyticIqProfile,
  requestedStart: number,
  requestedEnd: number,
  sampleRateHz: number,
): FixedPacketSegment | undefined {
  const isBr = profile === 'bluetooth-classic-connected';
  const bits = isBr ? BR_TRANSMISSION_BITS : LE_TRANSMISSION_BITS;
  const segment: FixedPacketSegment = {
    startSample: 0,
    endSample: firstSampleAtOrAfter(bits.length / SYMBOL_RATE_HZ, sampleRateHz),
    channelCenterHz: isBr ? BR_CHANNEL_CENTER_HZ : LE_CHANNEL_CENTER_HZ,
    frequencyDeviationHz: isBr ? BR_FREQUENCY_DEVIATION_HZ : LE_FREQUENCY_DEVIATION_HZ,
    bits,
  };
  return segment.endSample <= requestedStart || segment.startSample >= requestedEnd
    ? undefined
    : segment;
}

function phaseAtSample(
  segment: FixedPacketSegment,
  absoluteSample: number,
  sampleRateHz: number,
): number {
  let phase = 0;
  const localTarget = absoluteSample - segment.startSample;
  for (let localSample = 0; localSample < localTarget; localSample += 1) {
    phase = advancePhase(
      phase,
      instantaneousFrequencyHz(segment, localSample, sampleRateHz),
      sampleRateHz,
    );
  }
  return phase;
}

function instantaneousFrequencyHz(
  segment: FixedPacketSegment,
  localSample: number,
  sampleRateHz: number,
): number {
  const carrierOffsetHz = segment.channelCenterHz - BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ;
  // Integrate phase with the exact frequency at the center of this discrete
  // sample interval. The fixed 80-sample/symbol qualified lane makes the
  // remaining integration approximation far below the declared PHY limits.
  const symbolCoordinate = (localSample + 0.5) * SYMBOL_RATE_HZ / sampleRateHz;
  let weightedSymbols = 0;
  let weightTotal = 0;
  const nearestSymbol = Math.floor(symbolCoordinate);
  for (let symbol = nearestSymbol - GAUSSIAN_SYMBOL_RADIUS;
    symbol <= nearestSymbol + GAUSSIAN_SYMBOL_RADIUS;
    symbol += 1) {
    const weight = normalCdf(
      (symbolCoordinate - symbol) / GAUSSIAN_STANDARD_DEVIATION_SYMBOLS,
    ) - normalCdf(
      (symbolCoordinate - symbol - 1) / GAUSSIAN_STANDARD_DEVIATION_SYMBOLS,
    );
    const boundedSymbol = Math.max(0, Math.min(segment.bits.length - 1, symbol));
    const nrzSymbol = segment.bits[boundedSymbol] === 0 ? -1 : 1;
    weightedSymbols += nrzSymbol * weight;
    weightTotal += weight;
  }
  if (!(weightTotal > 0) || !Number.isFinite(weightTotal)) {
    throw new Error('Bluetooth GFSK Gaussian pulse lost its finite unit-area support');
  }
  return carrierOffsetHz + segment.frequencyDeviationHz * weightedSymbols / weightTotal;
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

// Abramowitz-Stegun 7.1.26. The qualified artifact is compared sample by
// sample with a separately structured oracle and also measured against the
// Core modulation-index/minimum-deviation limits.
function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * magnitude);
  const polynomial =
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-magnitude * magnitude));
}

function crcShiftLeft(
  bits: readonly number[],
  initialValue: number,
  width: number,
  polynomialWithoutLeadingTerm: number,
): number[] {
  let state = initialValue;
  const mask = 2 ** width - 1;
  for (const bit of bits) {
    const feedback = ((state >>> (width - 1)) & 1) ^ bit;
    state = ((state * 2) & mask) ^ (feedback === 1 ? polynomialWithoutLeadingTerm : 0);
  }
  return Array.from({ length: width }, (_unused, index) => (
    Math.floor(state / 2 ** (width - 1 - index)) & 1
  ));
}

function bytesToLeastSignificantBits(bytes: readonly number[]): readonly number[] {
  return Object.freeze(bytes.flatMap((byte) => {
    validateUnsignedInteger(byte, 8, 'octet');
    return leastSignificantBits(byte, 8);
  }));
}

function leastSignificantBits(value: number, width: number): number[] {
  return Array.from({ length: width }, (_unused, index) => (value >>> index) & 1);
}

function bitsFromTransmissionHex(hex: string): readonly number[] {
  if (!/^[a-f0-9]+$/i.test(hex)) throw new Error('Transmission-order hexadecimal vector is malformed');
  return Object.freeze([...hex].flatMap((nibble) => (
    [...Number.parseInt(nibble, 16).toString(2).padStart(4, '0')].map(Number)
  )));
}

function repeatEachBitThreeTimes(bits: readonly number[]): readonly number[] {
  return Object.freeze(bits.flatMap((bit) => [bit, bit, bit]));
}

function validateBits(bits: readonly number[], exactLength: number | undefined, label: string): void {
  if (exactLength !== undefined && bits.length !== exactLength) {
    throw new RangeError(`${label} must contain exactly ${exactLength} bits`);
  }
  if (bits.some((bit) => bit !== 0 && bit !== 1)) {
    throw new RangeError(`${label} must contain only numeric zero and one bits`);
  }
}

function validateUnsignedInteger(value: number, width: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** width) {
    throw new RangeError(`${label} must be an unsigned ${width}-bit integer`);
  }
}

function advancePhase(phase: number, frequencyHz: number, sampleRateHz: number): number {
  const next = phase + TWO_PI * frequencyHz / sampleRateHz;
  return next - TWO_PI * Math.floor(next / TWO_PI);
}

function writeUnitComplex(output: Float32Array, offset: number, phase: number): void {
  let inPhase = Math.fround(Math.cos(phase));
  let quadrature = Math.fround(Math.sin(phase));
  const magnitudeSquared = inPhase * inPhase + quadrature * quadrature;
  if (magnitudeSquared > 1) {
    const scale = (1 - 2 ** -23) / Math.sqrt(magnitudeSquared);
    inPhase = Math.fround(inPhase * scale);
    quadrature = Math.fround(quadrature * scale);
  }
  output[offset] = inPhase;
  output[offset + 1] = quadrature;
}

function firstSampleAtOrAfter(timeSeconds: number, sampleRateHz: number): number {
  const coordinate = timeSeconds * sampleRateHz;
  const nearest = Math.round(coordinate);
  return Math.abs(coordinate - nearest) <= 1e-7 ? nearest : Math.ceil(coordinate);
}
