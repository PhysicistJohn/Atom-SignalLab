import { fftForwardUnscaledInPlace } from '@atomos/dsp';
import {
  LTE_RESOURCE_ELEMENT_KIND,
  applyLteSingleAntennaPortIdentityStage,
  generateLteEtm11ReferenceFrame,
  generateLteGoldSequence,
  type LteComplexSymbol,
  type LteEtm11ReferenceMetadata,
  type LteResourceElementKindName,
  type SplitComplexSequence,
} from './lte-etm1-reference.js';

export const LTE_ETM3_REFERENCE_PROFILES = [
  'lte-etm3.1',
  'lte-etm3.1a',
  'lte-etm3.1b',
] as const;

export type LteEtm3ReferenceProfile = typeof LTE_ETM3_REFERENCE_PROFILES[number];
export type LteEtm3Modulation = '64qam' | '256qam' | '1024qam';

const ACTIVE_SUBCARRIER_COUNT = 600;
const SYMBOLS_PER_SUBFRAME = 14;
const SYMBOLS_PER_FRAME = 140;
const FFT_SIZE = 1_024;
const FIRST_SYMBOL_CP_SAMPLES = 80;
const OTHER_SYMBOL_CP_SAMPLES = 72;
const FRAME_SAMPLE_COUNT = 153_600;
const PHYSICAL_CELL_ID = 1;

export const LTE_ETM3_REFERENCE_DEFINITIONS = Object.freeze({
  'lte-etm3.1': Object.freeze({
    model: 'E-TM3.1' as const,
    clause: 'TS 36.141 V19.1.0 clause 6.1.1.4 and Table 6.1.1.4-1' as const,
    modulation: '64qam' as const,
    bitsPerSymbol: 6 as const,
  }),
  'lte-etm3.1a': Object.freeze({
    model: 'E-TM3.1a' as const,
    clause: 'TS 36.141 V19.1.0 clause 6.1.1.4a and Table 6.1.1.4-1' as const,
    modulation: '256qam' as const,
    bitsPerSymbol: 8 as const,
  }),
  'lte-etm3.1b': Object.freeze({
    model: 'E-TM3.1b' as const,
    clause: 'TS 36.141 V19.1.0 clause 6.1.1.4b and Table 6.1.1.4-1' as const,
    modulation: '1024qam' as const,
    bitsPerSymbol: 10 as const,
  }),
});

/**
 * Deterministic regression identities for the complete 140x600 cf64le grid
 * and 153600-sample cf64le time-domain frame. They bind this implementation;
 * independent-oracle status is tracked separately and may never be inferred
 * from these hashes alone.
 */
export const LTE_ETM3_REFERENCE_IDENTITIES = Object.freeze({
  'lte-etm3.1': Object.freeze({
    gridCf64leSha256: 'eb2539306a3747869f8bec00699261aa38c799997b3fd09e7c5a9b647fdb045f',
    timeCf64leSha256: '8d9ba4aaae567c9c23cad21362accaeae72b878cfbc173325df684eaae8498ab',
  }),
  'lte-etm3.1a': Object.freeze({
    gridCf64leSha256: '77444abb636cae2c195e14b8fac0891e2b9f8249e69cf42c4c6df06a50c063ac',
    timeCf64leSha256: '349e9b9944a9416665756c6ce69a3118ff49665e6c93a7af4cf473a0533e6782',
  }),
  'lte-etm3.1b': Object.freeze({
    gridCf64leSha256: '114512e5557a1a12a7a3ea4150ed87e0294aeba96bacdbcf33a0ef9c988468f2',
    timeCf64leSha256: '6c70c146796bec2b487aeca1e0f5b59a1f868becbdfecc86a931192b5ec18c73',
  }),
});

export interface LteEtm3ReferenceMetadata {
  readonly profileId: LteEtm3ReferenceProfile;
  readonly model: 'E-TM3.1' | 'E-TM3.1a' | 'E-TM3.1b';
  readonly qualification: 'standards-derived-digital-candidate-not-independently-verified';
  readonly complianceClaimed: false;
  readonly specification: '3GPP TS 36.141 V19.1.0';
  readonly clause: string;
  readonly modulation: LteEtm3Modulation;
  readonly bitsPerPdschSymbol: 6 | 8 | 10;
  readonly physicalCellId: 1;
  readonly channelBandwidthHz: 10_000_000;
  readonly resourceBlockCount: 50;
  readonly sampleRateHz: 15_360_000;
  readonly sampleCount: 153_600;
  readonly inheritedPhysicalChannelConfiguration: LteEtm11ReferenceMetadata['physicalChannelConfiguration'];
  readonly resourceElementCounts: Readonly<Record<LteResourceElementKindName, number>>;
  readonly transformation: 'replace-only-pdsch-qpsk-with-specified-qam';
}

export interface LteEtm3ReferenceFrame {
  readonly metadata: LteEtm3ReferenceMetadata;
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly kinds: Uint8Array;
    readonly symbolCount: 140;
    readonly subcarrierCount: 600;
  };
  readonly timeDomain: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly sampleCount: 153_600;
  };
}

/**
 * Generate a fixed 10 MHz, FDD, normal-CP E-TM3.1/3.1a/3.1b frame.
 *
 * TS 36.141 defines these three models with the same physical-channel table as
 * E-TM1.1, replacing every full-allocation QPSK PDSCH PRB with 64QAM, 256QAM,
 * or 1024QAM respectively. The fixed physical-channel inputs remain all-zero,
 * so the PDSCH mapper consumes the exact TS 36.211 scrambling sequence.
 */
export function generateLteEtm3ReferenceFrame(
  profile: LteEtm3ReferenceProfile,
): LteEtm3ReferenceFrame {
  const definition = LTE_ETM3_REFERENCE_DEFINITIONS[profile];
  if (definition === undefined) throw new RangeError(`Unsupported LTE E-TM3 reference profile: ${profile}`);

  const etm11 = generateLteEtm11ReferenceFrame();
  const real = etm11.grid.real.slice();
  const imaginary = etm11.grid.imaginary.slice();
  const kinds = etm11.grid.kinds.slice();

  for (let subframe = 0; subframe < 10; subframe += 1) {
    const firstGridIndex = subframe * SYMBOLS_PER_SUBFRAME * ACTIVE_SUBCARRIER_COUNT;
    const lastGridIndex = firstGridIndex + SYMBOLS_PER_SUBFRAME * ACTIVE_SUBCARRIER_COUNT;
    const pdschIndices: number[] = [];
    for (let index = firstGridIndex; index < lastGridIndex; index += 1) {
      if (kinds[index] === LTE_RESOURCE_ELEMENT_KIND.pdsch) pdschIndices.push(index);
    }
    const scrambling = generateLteGoldSequence(
      subframe * (2 ** 9) + PHYSICAL_CELL_ID,
      pdschIndices.length * definition.bitsPerSymbol,
    );
    const symbols = applyLteSingleAntennaPortIdentityStage(
      mapLteQamBits(scrambling, definition.modulation),
    );
    if (symbols.length !== pdschIndices.length) {
      throw new Error(`${profile} PDSCH symbol geometry does not fill its eligible resource elements`);
    }
    for (let symbol = 0; symbol < pdschIndices.length; symbol += 1) {
      const gridIndex = pdschIndices[symbol]!;
      real[gridIndex] = symbols[symbol]!.real;
      imaginary[gridIndex] = symbols[symbol]!.imaginary;
    }
  }

  const timeDomain = renderLteOfdmFrame(real, imaginary);
  return {
    metadata: {
      profileId: profile,
      model: definition.model,
      qualification: 'standards-derived-digital-candidate-not-independently-verified',
      complianceClaimed: false,
      specification: '3GPP TS 36.141 V19.1.0',
      clause: definition.clause,
      modulation: definition.modulation,
      bitsPerPdschSymbol: definition.bitsPerSymbol,
      physicalCellId: 1,
      channelBandwidthHz: 10_000_000,
      resourceBlockCount: 50,
      sampleRateHz: 15_360_000,
      sampleCount: FRAME_SAMPLE_COUNT,
      inheritedPhysicalChannelConfiguration: etm11.metadata.physicalChannelConfiguration,
      resourceElementCounts: etm11.metadata.resourceElementCounts,
      transformation: 'replace-only-pdsch-qpsk-with-specified-qam',
    },
    grid: {
      real,
      imaginary,
      kinds,
      symbolCount: SYMBOLS_PER_FRAME,
      subcarrierCount: ACTIVE_SUBCARRIER_COUNT,
    },
    timeDomain: {
      ...timeDomain,
      sampleCount: FRAME_SAMPLE_COUNT,
    },
  };
}

/** TS 36.211 V19.3.0 clauses 7.1.4, 7.1.5, and 7.1.6 QAM mapping. */
export function mapLteQamBits(
  bits: Uint8Array,
  modulation: LteEtm3Modulation,
): readonly LteComplexSymbol[] {
  const bitsPerSymbol = modulation === '64qam' ? 6 : modulation === '256qam' ? 8 : 10;
  if (bits.length % bitsPerSymbol !== 0) {
    throw new RangeError(`${modulation} mapping requires a multiple of ${bitsPerSymbol} bits`);
  }
  for (const bit of bits) {
    if (bit !== 0 && bit !== 1) throw new RangeError(`${modulation} mapping accepts binary bits only`);
  }
  const constellationSize = 2 ** bitsPerSymbol;
  const normalization = Math.sqrt((2 / 3) * (constellationSize - 1));
  const output: LteComplexSymbol[] = [];
  for (let offset = 0; offset < bits.length; offset += bitsPerSymbol) {
    output.push(Object.freeze({
      real: qamAxis(bits, offset, 0, bitsPerSymbol / 2) / normalization,
      imaginary: qamAxis(bits, offset, 1, bitsPerSymbol / 2) / normalization,
    }));
  }
  return Object.freeze(output);
}

function qamAxis(
  bits: Uint8Array,
  symbolOffset: number,
  axisOffset: 0 | 1,
  axisBitCount: number,
): number {
  let magnitude = 1;
  for (let axisBit = axisBitCount - 1; axisBit >= 1; axisBit -= 1) {
    const bit = bits[symbolOffset + axisOffset + 2 * axisBit]!;
    magnitude = 2 ** (axisBitCount - axisBit) - (1 - 2 * bit) * magnitude;
  }
  return (1 - 2 * bits[symbolOffset + axisOffset]!) * magnitude;
}

function renderLteOfdmFrame(
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): SplitComplexSequence {
  if (
    gridReal.length !== SYMBOLS_PER_FRAME * ACTIVE_SUBCARRIER_COUNT
    || gridImaginary.length !== gridReal.length
  ) {
    throw new RangeError('LTE E-TM3 OFDM rendering requires a 140 by 600 resource grid');
  }
  const real = new Float64Array(FRAME_SAMPLE_COUNT);
  const imaginary = new Float64Array(FRAME_SAMPLE_COUNT);
  let sampleOffset = 0;
  for (let symbol = 0; symbol < SYMBOLS_PER_FRAME; symbol += 1) {
    const symbolReal = new Float64Array(FFT_SIZE);
    const symbolImaginary = new Float64Array(FFT_SIZE);
    const gridOffset = symbol * ACTIVE_SUBCARRIER_COUNT;
    for (let subcarrier = 0; subcarrier < ACTIVE_SUBCARRIER_COUNT; subcarrier += 1) {
      const fftBin = subcarrier < ACTIVE_SUBCARRIER_COUNT / 2
        ? FFT_SIZE - ACTIVE_SUBCARRIER_COUNT / 2 + subcarrier
        : subcarrier - ACTIVE_SUBCARRIER_COUNT / 2 + 1;
      symbolReal[fftBin] = gridReal[gridOffset + subcarrier]!;
      symbolImaginary[fftBin] = -gridImaginary[gridOffset + subcarrier]!;
    }
    fftForwardUnscaledInPlace(symbolReal, symbolImaginary);
    for (let sample = 0; sample < FFT_SIZE; sample += 1) {
      symbolReal[sample] = symbolReal[sample]! / FFT_SIZE;
      symbolImaginary[sample] = -symbolImaginary[sample]! / FFT_SIZE;
    }
    const cyclicPrefixLength =
      symbol % 7 === 0 ? FIRST_SYMBOL_CP_SAMPLES : OTHER_SYMBOL_CP_SAMPLES;
    const prefixStart = FFT_SIZE - cyclicPrefixLength;
    real.set(symbolReal.subarray(prefixStart), sampleOffset);
    imaginary.set(symbolImaginary.subarray(prefixStart), sampleOffset);
    sampleOffset += cyclicPrefixLength;
    real.set(symbolReal, sampleOffset);
    imaginary.set(symbolImaginary, sampleOffset);
    sampleOffset += FFT_SIZE;
  }
  if (sampleOffset !== FRAME_SAMPLE_COUNT) {
    throw new Error(`LTE E-TM3 OFDM renderer produced ${sampleOffset} samples`);
  }
  return { real, imaginary };
}
