/**
 * Corpus-only TS 45.003 xCCH block codec.
 *
 * This intentionally has no catalog, bridge, or measurement integration. It
 * implements the published xCCH bit ordering, FIRE parity, rate-1/2
 * convolutional coding, diagonal interleaving, and normal-burst stealing-bit
 * mapping so corpus variants can change an L2 block without mutating the
 * retained fixed-vector path.
 */

export const GERAN_XCCH_L2_BYTES = 23 as const;
export const GERAN_XCCH_L2_BITS = GERAN_XCCH_L2_BYTES * 8;
export const GERAN_XCCH_FIRE_BITS = 40 as const;
export const GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS = GERAN_XCCH_L2_BITS + GERAN_XCCH_FIRE_BITS;
export const GERAN_XCCH_FLUSH_BITS = 4 as const;
export const GERAN_XCCH_CODED_BITS = (GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS + GERAN_XCCH_FLUSH_BITS) * 2;
export const GERAN_XCCH_BURSTS_PER_BLOCK = 4 as const;
export const GERAN_XCCH_INTERLEAVED_BITS_PER_BURST = GERAN_XCCH_CODED_BITS / GERAN_XCCH_BURSTS_PER_BLOCK;
export const GERAN_XCCH_ENCODED_BITS_PER_BURST = GERAN_XCCH_INTERLEAVED_BITS_PER_BURST + 2;

const FIRE_MASK = (1n << 40n) - 1n;
const FIRE_HIGH_BIT = 1n << 39n;
const FIRE_POLYNOMIAL = 0x0004_8200_09n;
const VITERBI_INFINITY = 1_000_000;

/**
 * Encode exactly one 23-octet xCCH L2 block to four 116-bit eB strings.
 *
 * The L2 octets use the TS 45.003 packed-bit order (least-significant bit of
 * each octet first). Each returned eB string retains both stealing flags at
 * positions 57 and 58; they are always one for xCCH.
 */
export function encodeGeranXcchL2Block(l2Data: Uint8Array): readonly string[] {
  assertL2Block(l2Data);
  const uncoded = unpackLsbFirst(l2Data);
  const protectedBits = [...uncoded, ...fireParity(uncoded)];
  const coded = convolutionalEncode(protectedBits);
  const interleaved = interleave(coded);
  return Object.freeze(mapToEncodedBursts(interleaved));
}

/**
 * Decode four xCCH eB strings back to their verified 23-octet L2 block.
 *
 * This is a hard-decision Viterbi decoder used to prove encoder round trips
 * and to reject an invalid FIRE parity field. It is deliberately scoped to
 * noiseless corpus construction and is not a receiver implementation.
 */
export function decodeGeranXcchEncodedBursts(encodedBursts: readonly string[]): Uint8Array {
  const interleaved = unmapEncodedBursts(encodedBursts);
  const coded = deinterleave(interleaved);
  const decoded = convolutionalDecode(coded);
  const information = decoded.slice(0, GERAN_XCCH_L2_BITS);
  const expectedParity = fireParity(information);
  for (let index = 0; index < GERAN_XCCH_FIRE_BITS; index += 1) {
    if (decoded[GERAN_XCCH_L2_BITS + index] !== expectedParity[index]) {
      throw new Error('GERAN xCCH FIRE parity check failed');
    }
  }
  return packLsbFirst(information);
}

function assertL2Block(l2Data: Uint8Array): void {
  if (!(l2Data instanceof Uint8Array) || l2Data.byteLength !== GERAN_XCCH_L2_BYTES) {
    throw new RangeError(`GERAN xCCH L2 block must be exactly ${GERAN_XCCH_L2_BYTES} bytes`);
  }
}

function unpackLsbFirst(data: Uint8Array): number[] {
  const bits: number[] = [];
  for (const octet of data) {
    for (let bit = 0; bit < 8; bit += 1) bits.push((octet >>> bit) & 1);
  }
  return bits;
}

function packLsbFirst(bits: Uint8Array): Uint8Array {
  if (bits.length !== GERAN_XCCH_L2_BITS) {
    throw new Error(`GERAN xCCH information field must contain ${GERAN_XCCH_L2_BITS} bits`);
  }
  const data = new Uint8Array(GERAN_XCCH_L2_BYTES);
  for (let index = 0; index < bits.length; index += 1) {
    data[Math.floor(index / 8)]! |= bits[index]! << (index % 8);
  }
  return data;
}

/** FIRE parity with the TS 45.003 polynomial and all-one final remainder. */
function fireParity(information: ArrayLike<number>): number[] {
  if (information.length !== GERAN_XCCH_L2_BITS) {
    throw new Error(`GERAN xCCH FIRE input must contain ${GERAN_XCCH_L2_BITS} bits`);
  }
  let crc = 0n;
  for (let index = 0; index < information.length; index += 1) {
    const bit = BigInt(information[index]! & 1);
    crc ^= bit << 39n;
    crc = crc & FIRE_HIGH_BIT
      ? ((crc << 1n) ^ FIRE_POLYNOMIAL) & FIRE_MASK
      : (crc << 1n) & FIRE_MASK;
  }
  crc ^= FIRE_MASK;
  const result: number[] = [];
  for (let bit = 39n; bit >= 0n; bit -= 1n) {
    result.push(Number((crc >> bit) & 1n));
  }
  return result;
}

function convolutionalEncode(input: readonly number[]): Uint8Array {
  if (input.length !== GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS) {
    throw new Error(`GERAN xCCH convolutional input must contain ${GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS} bits`);
  }
  const result = new Uint8Array(GERAN_XCCH_CODED_BITS);
  let state = 0;
  let offset = 0;
  for (const bit of [...input, ...Array<number>(GERAN_XCCH_FLUSH_BITS).fill(0)]) {
    const step = convolutionalStep(state, bit);
    result[offset] = step.output0;
    result[offset + 1] = step.output1;
    offset += 2;
    state = step.nextState;
  }
  if (state !== 0 || offset !== result.length) {
    throw new Error('GERAN xCCH convolutional encoder did not terminate cleanly');
  }
  return result;
}

function convolutionalDecode(coded: Uint8Array): Uint8Array {
  if (coded.length !== GERAN_XCCH_CODED_BITS) {
    throw new Error(`GERAN xCCH coded block must contain ${GERAN_XCCH_CODED_BITS} bits`);
  }
  const steps = GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS + GERAN_XCCH_FLUSH_BITS;
  let metrics = new Int32Array(16);
  metrics.fill(VITERBI_INFINITY);
  metrics[0] = 0;
  const predecessorStates = Array.from({ length: steps }, () => {
    const value = new Int16Array(16);
    value.fill(-1);
    return value;
  });
  const predecessorBits = Array.from({ length: steps }, () => {
    const value = new Int8Array(16);
    value.fill(-1);
    return value;
  });

  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    const nextMetrics = new Int32Array(16);
    nextMetrics.fill(VITERBI_INFINITY);
    const allowedBits = stepIndex < GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS ? [0, 1] : [0];
    for (let state = 0; state < 16; state += 1) {
      const metric = metrics[state]!;
      if (metric === VITERBI_INFINITY) continue;
      for (const bit of allowedBits) {
        const transition = convolutionalStep(state, bit);
        const observedOffset = stepIndex * 2;
        const distance = Number(coded[observedOffset]! !== transition.output0)
          + Number(coded[observedOffset + 1]! !== transition.output1);
        const candidateMetric = metric + distance;
        if (candidateMetric < nextMetrics[transition.nextState]!) {
          nextMetrics[transition.nextState] = candidateMetric;
          predecessorStates[stepIndex]![transition.nextState] = state;
          predecessorBits[stepIndex]![transition.nextState] = bit;
        }
      }
    }
    metrics = nextMetrics;
  }

  if (metrics[0] === VITERBI_INFINITY) {
    throw new Error('GERAN xCCH Viterbi decoder found no terminating path');
  }
  const decoded = new Uint8Array(steps);
  let state = 0;
  for (let stepIndex = steps - 1; stepIndex >= 0; stepIndex -= 1) {
    const bit = predecessorBits[stepIndex]![state]!;
    const previous = predecessorStates[stepIndex]![state]!;
    if (bit < 0 || previous < 0) {
      throw new Error('GERAN xCCH Viterbi traceback is incomplete');
    }
    decoded[stepIndex] = bit;
    state = previous;
  }
  if (state !== 0 || decoded.slice(GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS).some((bit) => bit !== 0)) {
    throw new Error('GERAN xCCH Viterbi decoder did not recover the terminating zeros');
  }
  return decoded.slice(0, GERAN_XCCH_CONVOLUTIONAL_INPUT_BITS);
}

function convolutionalStep(state: number, input: number): {
  readonly nextState: number;
  readonly output0: 0 | 1;
  readonly output1: 0 | 1;
} {
  const bit = input & 1;
  const source = (state << 1) | bit;
  return {
    nextState: source & 0x0f,
    // TS 45.003 Annex B: G0 = 1 + D3 + D4; G1 = 1 + D + D3 + D4.
    output0: parity(source & 0b1_1001),
    output1: parity(source & 0b1_1011),
  };
}

function parity(value: number): 0 | 1 {
  let folded = value;
  folded ^= folded >>> 4;
  folded ^= folded >>> 2;
  folded ^= folded >>> 1;
  return (folded & 1) as 0 | 1;
}

function interleave(coded: Uint8Array): Uint8Array {
  const result = new Uint8Array(GERAN_XCCH_CODED_BITS);
  for (let index = 0; index < GERAN_XCCH_CODED_BITS; index += 1) {
    const burst = index & 3;
    const position = 2 * ((49 * index) % 57) + ((index & 7) >> 2);
    result[burst * GERAN_XCCH_INTERLEAVED_BITS_PER_BURST + position] = coded[index]!;
  }
  return result;
}

function deinterleave(interleaved: Uint8Array): Uint8Array {
  const result = new Uint8Array(GERAN_XCCH_CODED_BITS);
  for (let index = 0; index < GERAN_XCCH_CODED_BITS; index += 1) {
    const burst = index & 3;
    const position = 2 * ((49 * index) % 57) + ((index & 7) >> 2);
    result[index] = interleaved[burst * GERAN_XCCH_INTERLEAVED_BITS_PER_BURST + position]!;
  }
  return result;
}

function mapToEncodedBursts(interleaved: Uint8Array): string[] {
  const bursts: string[] = [];
  for (let burst = 0; burst < GERAN_XCCH_BURSTS_PER_BLOCK; burst += 1) {
    const offset = burst * GERAN_XCCH_INTERLEAVED_BITS_PER_BURST;
    const encoded = new Uint8Array(GERAN_XCCH_ENCODED_BITS_PER_BURST);
    encoded.set(interleaved.slice(offset, offset + 57), 0);
    encoded[57] = 1;
    encoded[58] = 1;
    encoded.set(interleaved.slice(offset + 57, offset + GERAN_XCCH_INTERLEAVED_BITS_PER_BURST), 59);
    bursts.push(bitsToString(encoded));
  }
  return bursts;
}

function unmapEncodedBursts(encodedBursts: readonly string[]): Uint8Array {
  if (!Array.isArray(encodedBursts) || encodedBursts.length !== GERAN_XCCH_BURSTS_PER_BLOCK) {
    throw new RangeError(`GERAN xCCH block must contain ${GERAN_XCCH_BURSTS_PER_BLOCK} encoded bursts`);
  }
  const interleaved = new Uint8Array(GERAN_XCCH_CODED_BITS);
  for (let burst = 0; burst < GERAN_XCCH_BURSTS_PER_BLOCK; burst += 1) {
    const encoded = encodedBursts[burst];
    if (typeof encoded !== 'string' || encoded.length !== GERAN_XCCH_ENCODED_BITS_PER_BURST || !/^[01]+$/.test(encoded)) {
      throw new RangeError(`GERAN xCCH encoded burst ${burst} must be a ${GERAN_XCCH_ENCODED_BITS_PER_BURST}-bit binary string`);
    }
    if (encoded[57] !== '1' || encoded[58] !== '1') {
      throw new RangeError(`GERAN xCCH encoded burst ${burst} must retain both stealing flags`);
    }
    const offset = burst * GERAN_XCCH_INTERLEAVED_BITS_PER_BURST;
    for (let bit = 0; bit < 57; bit += 1) {
      interleaved[offset + bit] = Number(encoded[bit]!);
      interleaved[offset + 57 + bit] = Number(encoded[59 + bit]!);
    }
  }
  return interleaved;
}

function bitsToString(bits: Uint8Array): string {
  return Array.from(bits, (bit) => String(bit)).join('');
}
