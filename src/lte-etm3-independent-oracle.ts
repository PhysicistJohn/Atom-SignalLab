/**
 * Independent full-frame LTE E-TM3 digital oracle.
 *
 * This module deliberately has no imports. In particular it does not use the
 * SignalLab Gold generator, QAM mapper, resource-grid mapper, or DSP FFT. Its
 * only input is a freshly generated, pinned external E-TM1.1 resource grid.
 */

export const LTE_ETM3_INDEPENDENT_ORACLE_PROFILES = Object.freeze([
  'lte-etm3.1',
  'lte-etm3.1a',
  'lte-etm3.1b',
] as const);
export type LteEtm3IndependentOracleProfile =
  (typeof LTE_ETM3_INDEPENDENT_ORACLE_PROFILES)[number];

export const LTE_ETM3_INDEPENDENT_GRID_ELEMENTS = 84_000 as const;
export const LTE_ETM3_INDEPENDENT_FRAME_SAMPLES = 153_600 as const;
export const LTE_ETM3_INDEPENDENT_PDSCH_ELEMENTS = 74_436 as const;

const SUBCARRIERS = 600;
const SYMBOLS_PER_SUBFRAME = 14;
const SYMBOLS_PER_FRAME = 140;
const FFT_SIZE = 1_024;
const PHYSICAL_CELL_ID = 1;
const GOLD_OFFSET = 1_600;

const PROFILE_BITS = Object.freeze({
  'lte-etm3.1': 6,
  'lte-etm3.1a': 8,
  'lte-etm3.1b': 10,
} as const);

export interface LteEtm3IndependentOracleFrame {
  readonly profile: LteEtm3IndependentOracleProfile;
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly pdschMask: Uint8Array;
  };
  readonly timeDomain: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
  };
}

export function generateIndependentLteEtm3Oracle(
  profile: LteEtm3IndependentOracleProfile,
  externalEtm11GridReal: ArrayLike<number>,
  externalEtm11GridImaginary: ArrayLike<number>,
): LteEtm3IndependentOracleFrame {
  const bitsPerSymbol = PROFILE_BITS[profile];
  if (bitsPerSymbol === undefined) {
    throw new RangeError(`Unsupported independent E-TM3 profile ${String(profile)}`);
  }
  if (
    externalEtm11GridReal.length !== LTE_ETM3_INDEPENDENT_GRID_ELEMENTS
    || externalEtm11GridImaginary.length !== LTE_ETM3_INDEPENDENT_GRID_ELEMENTS
  ) {
    throw new RangeError('Independent E-TM3 oracle requires one 140x600 E-TM1.1 grid');
  }

  const real = Float64Array.from(externalEtm11GridReal);
  const imaginary = Float64Array.from(externalEtm11GridImaginary);
  const pdschMask = buildIndependentPdschMask();

  for (let subframe = 0; subframe < 10; subframe += 1) {
    const first = subframe * SYMBOLS_PER_SUBFRAME * SUBCARRIERS;
    const last = first + SYMBOLS_PER_SUBFRAME * SUBCARRIERS;
    let pdschCount = 0;
    for (let index = first; index < last; index += 1) {
      if (pdschMask[index] === 1) pdschCount += 1;
    }
    const bits = generateIndependentGold(
      subframe * 512 + PHYSICAL_CELL_ID,
      pdschCount * bitsPerSymbol,
    );
    let bitOffset = 0;
    for (let index = first; index < last; index += 1) {
      if (pdschMask[index] !== 1) continue;
      real[index] = independentQamAxis(bits, bitOffset, 0, bitsPerSymbol);
      imaginary[index] = independentQamAxis(bits, bitOffset, 1, bitsPerSymbol);
      bitOffset += bitsPerSymbol;
    }
    if (bitOffset !== bits.length) {
      throw new Error(`Independent E-TM3 subframe ${subframe} did not consume its bits`);
    }
  }

  const timeDomain = renderIndependentOfdm(real, imaginary);
  return {
    profile,
    grid: { real, imaginary, pdschMask },
    timeDomain,
  };
}

export function renderIndependentEtm3Ofdm(
  gridReal: ArrayLike<number>,
  gridImaginary: ArrayLike<number>,
): { readonly real: Float64Array; readonly imaginary: Float64Array } {
  if (
    gridReal.length !== LTE_ETM3_INDEPENDENT_GRID_ELEMENTS
    || gridImaginary.length !== LTE_ETM3_INDEPENDENT_GRID_ELEMENTS
  ) {
    throw new RangeError('Independent E-TM3 OFDM requires one 140x600 grid');
  }
  return renderIndependentOfdm(
    Float64Array.from(gridReal),
    Float64Array.from(gridImaginary),
  );
}

/**
 * Independently derive the E-TM full-allocation PDSCH RE set:
 * CFI=1 excludes l=0; one-port CRS, PSS/SSS and PBCH are then removed.
 */
export function buildIndependentPdschMask(): Uint8Array {
  const mask = new Uint8Array(LTE_ETM3_INDEPENDENT_GRID_ELEMENTS);
  let count = 0;
  for (let subframe = 0; subframe < 10; subframe += 1) {
    for (let symbol = 1; symbol < SYMBOLS_PER_SUBFRAME; symbol += 1) {
      for (let subcarrier = 0; subcarrier < SUBCARRIERS; subcarrier += 1) {
        if (isCrs(symbol, subcarrier)) continue;
        if (
          (subframe === 0 || subframe === 5)
          && (symbol === 5 || symbol === 6)
          && isCentral72(subcarrier)
        ) {
          continue;
        }
        if (
          subframe === 0
          && symbol >= 7
          && symbol <= 10
          && isCentral72(subcarrier)
        ) {
          continue;
        }
        const index = (
          subframe * SYMBOLS_PER_SUBFRAME + symbol
        ) * SUBCARRIERS + subcarrier;
        mask[index] = 1;
        count += 1;
      }
    }
  }
  if (count !== LTE_ETM3_INDEPENDENT_PDSCH_ELEMENTS) {
    throw new Error(`Independent PDSCH geometry produced ${count} RE`);
  }
  return mask;
}

function isCrs(symbol: number, subcarrier: number): boolean {
  if (symbol === 4 || symbol === 11) return subcarrier % 6 === 4;
  if (symbol === 7) return subcarrier % 6 === 1;
  return false;
}

function isCentral72(subcarrier: number): boolean {
  return subcarrier >= 264 && subcarrier <= 335;
}

/**
 * TS 36.211 clause 7.2, implemented as two 31-cell circular LFSRs.
 * This is intentionally separate from generateLteGoldSequence.
 */
export function generateIndependentEtm3Gold(
  cInit: number,
  length: number,
): Uint8Array {
  return generateIndependentGold(cInit, length);
}

function generateIndependentGold(cInit: number, length: number): Uint8Array {
  if (!Number.isSafeInteger(cInit) || cInit < 0 || cInit >= 2 ** 31) {
    throw new RangeError('Independent LTE Gold c_init is outside 31 bits');
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('Independent LTE Gold length must be non-negative');
  }
  const x1 = new Uint8Array(31);
  const x2 = new Uint8Array(31);
  x1[0] = 1;
  for (let bit = 0; bit < 31; bit += 1) {
    x2[bit] = Math.floor(cInit / 2 ** bit) % 2;
  }
  const output = new Uint8Array(length);
  for (let n = 0; n < GOLD_OFFSET + length; n += 1) {
    const position = n % 31;
    if (n >= GOLD_OFFSET) {
      output[n - GOLD_OFFSET] = x1[position]! ^ x2[position]!;
    }
    const nextX1 = x1[(n + 3) % 31]! ^ x1[position]!;
    const nextX2 = x2[(n + 3) % 31]!
      ^ x2[(n + 2) % 31]!
      ^ x2[(n + 1) % 31]!
      ^ x2[position]!;
    x1[position] = nextX1;
    x2[position] = nextX2;
  }
  return output;
}

/**
 * Direct recursive form of TS 36.211 clauses 7.1.4-7.1.6.
 */
function independentQamAxis(
  bits: Uint8Array,
  symbolOffset: number,
  axis: 0 | 1,
  bitsPerSymbol: 6 | 8 | 10,
): number {
  const axisBits = bitsPerSymbol / 2;
  const normalizationSquared = bitsPerSymbol === 6
    ? 42
    : bitsPerSymbol === 8
      ? 170
      : 682;
  const nestedMagnitude = (axisBit: number): number => {
    if (axisBit === axisBits) return 1;
    const polarity = 1 - 2 * bits[symbolOffset + axis + 2 * axisBit]!;
    return 2 ** (axisBits - axisBit) - polarity * nestedMagnitude(axisBit + 1);
  };
  const sign = 1 - 2 * bits[symbolOffset + axis]!;
  return sign * nestedMagnitude(1) / Math.sqrt(normalizationSquared);
}

function renderIndependentOfdm(
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): { readonly real: Float64Array; readonly imaginary: Float64Array } {
  const real = new Float64Array(LTE_ETM3_INDEPENDENT_FRAME_SAMPLES);
  const imaginary = new Float64Array(LTE_ETM3_INDEPENDENT_FRAME_SAMPLES);
  let output = 0;
  for (let symbol = 0; symbol < SYMBOLS_PER_FRAME; symbol += 1) {
    const binsReal = new Float64Array(FFT_SIZE);
    const binsImaginary = new Float64Array(FFT_SIZE);
    const gridOffset = symbol * SUBCARRIERS;
    for (let subcarrier = 0; subcarrier < SUBCARRIERS; subcarrier += 1) {
      const bin = subcarrier < 300
        ? FFT_SIZE - 300 + subcarrier
        : subcarrier - 299;
      binsReal[bin] = gridReal[gridOffset + subcarrier]!;
      binsImaginary[bin] = gridImaginary[gridOffset + subcarrier]!;
    }
    inverseRadix2InPlace(binsReal, binsImaginary);
    const cp = symbol % 7 === 0 ? 80 : 72;
    real.set(binsReal.subarray(FFT_SIZE - cp), output);
    imaginary.set(binsImaginary.subarray(FFT_SIZE - cp), output);
    output += cp;
    real.set(binsReal, output);
    imaginary.set(binsImaginary, output);
    output += FFT_SIZE;
  }
  if (output !== LTE_ETM3_INDEPENDENT_FRAME_SAMPLES) {
    throw new Error(`Independent OFDM renderer produced ${output} samples`);
  }
  return { real, imaginary };
}

/**
 * Independent radix-2 decimation-in-time inverse FFT. It shares no code with
 * @atomos/dsp and uses the direct positive-exponent inverse convention.
 */
function inverseRadix2InPlace(real: Float64Array, imaginary: Float64Array): void {
  const length = real.length;
  if (
    imaginary.length !== length
    || length < 1
    || (length & (length - 1)) !== 0
  ) {
    throw new RangeError('Independent inverse FFT requires equal power-of-two arrays');
  }
  for (let source = 1, target = 0; source < length; source += 1) {
    let bit = length >> 1;
    while ((target & bit) !== 0) {
      target ^= bit;
      bit >>= 1;
    }
    target ^= bit;
    if (source < target) {
      const realValue = real[source]!;
      const imaginaryValue = imaginary[source]!;
      real[source] = real[target]!;
      imaginary[source] = imaginary[target]!;
      real[target] = realValue;
      imaginary[target] = imaginaryValue;
    }
  }
  for (let span = 2; span <= length; span *= 2) {
    const half = span / 2;
    const angle = 2 * Math.PI / span;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < length; start += span) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < half; offset += 1) {
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd]!;
        const oddImaginary = imaginary[odd]!;
        const rotatedReal =
          twiddleReal * oddReal - twiddleImaginary * oddImaginary;
        const rotatedImaginary =
          twiddleReal * oddImaginary + twiddleImaginary * oddReal;
        const evenReal = real[even]!;
        const evenImaginary = imaginary[even]!;
        real[even] = evenReal + rotatedReal;
        imaginary[even] = evenImaginary + rotatedImaginary;
        real[odd] = evenReal - rotatedReal;
        imaginary[odd] = evenImaginary - rotatedImaginary;
        const nextReal =
          twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  for (let index = 0; index < length; index += 1) {
    real[index] = real[index]! / length;
    imaginary[index] = imaginary[index]! / length;
  }
}
