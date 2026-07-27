import { fftForwardUnscaledInPlace } from '@atomos/dsp';

export const NR_FR1_TEST_MODEL_PROFILES = [
  'nr-fr1-tm1.1',
  'nr-fr1-tm3.1',
  'nr-fr1-tm3.1a',
  'nr-fr1-tm3.1b',
] as const;

export type NrFr1TestModelProfile = typeof NR_FR1_TEST_MODEL_PROFILES[number];
export type NrFr1TestModelModulation = 'qpsk' | '64qam' | '256qam' | '1024qam';

const RESOURCE_BLOCK_COUNT = 106;
const SUBCARRIERS_PER_RESOURCE_BLOCK = 12;
const ACTIVE_SUBCARRIER_COUNT = 1_272 as const;
const SLOTS_PER_FRAME = 10;
const SYMBOLS_PER_SLOT = 14;
const SYMBOLS_PER_FRAME = 140 as const;
const FFT_SIZE = 2_048;
const LONG_CP_SAMPLES = 160;
const SHORT_CP_SAMPLES = 144;
const SAMPLE_RATE_HZ = 30_720_000;
const FRAME_SAMPLE_COUNT = 307_200;
const PHYSICAL_CELL_ID = 1;
const GOLD_SEQUENCE_OFFSET = 1_600;
const MAX_GOLD_INITIALIZATION = 0x7fff_ffff;
const PDCCH_DATA_BITS_PER_SLOT = 108;
const PDSCH_RNTI_0_RESOURCE_ELEMENTS_PER_SLOT = 16_068;
const PDSCH_RNTI_2_RESOURCE_ELEMENTS_PER_SLOT = 396;
const DMRS_SYMBOLS = Object.freeze([2, 11] as const);

export const NR_RESOURCE_ELEMENT_KIND = Object.freeze({
  unused: 0,
  pdcchData: 1,
  pdcchDmrs: 2,
  pdschRnti0Data: 3,
  pdschRnti2Data: 4,
  pdschDmrs: 5,
} as const);

export type NrResourceElementKindName = keyof typeof NR_RESOURCE_ELEMENT_KIND;
export type NrResourceElementKind =
  typeof NR_RESOURCE_ELEMENT_KIND[NrResourceElementKindName];

export interface NrComplexSymbol {
  readonly real: number;
  readonly imaginary: number;
}

export interface NrSplitComplexSequence {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
}

export const NR_FR1_TEST_MODEL_DEFINITIONS = Object.freeze({
  'nr-fr1-tm1.1': Object.freeze({
    model: 'NR-FR1-TM1.1' as const,
    clause: '4.9.2.2.1' as const,
    modulation: 'qpsk' as const,
    bitsPerSymbol: 2 as const,
  }),
  'nr-fr1-tm3.1': Object.freeze({
    model: 'NR-FR1-TM3.1' as const,
    clause: '4.9.2.2.5' as const,
    modulation: '64qam' as const,
    bitsPerSymbol: 6 as const,
  }),
  'nr-fr1-tm3.1a': Object.freeze({
    model: 'NR-FR1-TM3.1a' as const,
    clause: '4.9.2.2.6' as const,
    modulation: '256qam' as const,
    bitsPerSymbol: 8 as const,
  }),
  'nr-fr1-tm3.1b': Object.freeze({
    model: 'NR-FR1-TM3.1b' as const,
    clause: '4.9.2.2.6A' as const,
    modulation: '1024qam' as const,
    bitsPerSymbol: 10 as const,
  }),
});

export const NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES = Object.freeze({
  'nr-fr1-tm1.1': Object.freeze({
    gridCf64leSha256: '4b4e57c8607d01a7f806c9af2c77b772a27e184b3ddfe6a5f53ba908d4cb729a',
    timeCf64leSha256: 'ddb5109ba014d7f46063db1ea0ba2bb876f1e3dd340e497a6199a187f6eeedbd',
  }),
  'nr-fr1-tm3.1': Object.freeze({
    gridCf64leSha256: '6001f1954a8e72311ec00cf26ce10c58747a67663b393a5c784b5744559ad5b5',
    timeCf64leSha256: '7e22fa841cb004f5e3e4f427bedaba2c007ff450d174ac1bd9a7d86bd721a7b7',
  }),
  'nr-fr1-tm3.1a': Object.freeze({
    gridCf64leSha256: 'b057197485f72d506e099d7b46d28a22ba4f3c21b8dcf719895c8f19419c9bd7',
    timeCf64leSha256: 'd7ff785a52b7145f93b84ce34a80f830f7ab9dcb9d21651a332b62cd35e305dd',
  }),
  'nr-fr1-tm3.1b': Object.freeze({
    gridCf64leSha256: '12c2afee698973e4324e500d6cf64971b1f363e1264077bcd872fcdcb20b2dca',
    timeCf64leSha256: '656f92a64b205e642e4c6292a472baad3e06334488ba6e2e86d0fd440e678413',
  }),
});

export const NR_FR1_20MHZ_N3_FDD_BINDING = Object.freeze({
  specification: '3GPP TS 38.141-1 V19.4.0 (Release 19)' as const,
  rfSpecification: '3GPP TS 38.104 V19.4.0 (Release 19)' as const,
  physicalLayerSpecification: '3GPP TS 38.211 Release 19' as const,
  operatingBand: 'n3' as const,
  duplex: 'fdd' as const,
  downlinkCenterHz: 1_842_500_000 as const,
  downlinkNrArfcn: 368_500 as const,
  channelBandwidthHz: 20_000_000 as const,
  nominalGridBandwidthHz: 19_080_000 as const,
  physicalCellId: PHYSICAL_CELL_ID,
  subcarrierSpacingHz: 15_000 as const,
  resourceBlockCount: RESOURCE_BLOCK_COUNT,
  activeSubcarrierCount: ACTIVE_SUBCARRIER_COUNT,
  fftSize: FFT_SIZE,
  sampleRateHz: SAMPLE_RATE_HZ,
  frameDurationMs: 10 as const,
  frameSampleCount: FRAME_SAMPLE_COUNT,
  slotsPerFrame: SLOTS_PER_FRAME,
  symbolsPerSlot: SYMBOLS_PER_SLOT,
  cyclicPrefix: 'normal' as const,
  windowingPercent: 0 as const,
});

export interface NrFr1TestModelRequirement {
  readonly requirement: string;
  readonly specification: string;
  readonly clauses: readonly string[];
  readonly implementationEvidence: string;
  readonly independentVerification:
    | 'py3gpp-0.6.0-exhaustive-frame-oracle'
    | 'py3gpp-0.6.0-exhaustive-frame-and-ocudu-f0c8467560ea894d16e50207b3db60fd5ff19c01-exhaustive-1024qam-oracle';
}

const REQUIREMENT_LEDGER = Object.freeze([
  Object.freeze({
    requirement: 'One 10 ms FDD radio frame, 15 kHz SCS, normal CP, 106 RB in a 20 MHz n3 carrier',
    specification: '3GPP TS 38.141-1 V19.4.0, TS 38.104 V19.4.0, and TS 38.211 Release 19',
    clauses: Object.freeze([
      '38.141-1 4.9.2.2',
      '38.104 Tables 5.2-1, 5.3.2-1, 5.3.5-1, and 5.4.2.3-1',
      '38.211 4.2-4.4 and 5.3',
    ]),
    implementationEvidence: 'The grid and time-domain geometry are fixed, fail closed, and exhaustively compared with a py3gpp OFDM oracle.',
    independentVerification: 'py3gpp-0.6.0-exhaustive-frame-oracle',
  }),
  Object.freeze({
    requirement: 'One non-interleaved, aggregation-level-1 PDCCH in six REGs over symbols 0 and 1 of every slot',
    specification: '3GPP TS 38.141-1 V19.4.0 and TS 38.211 Release 19',
    clauses: Object.freeze([
      '38.141-1 Tables 4.9.2.2-2 and clause 4.9.2.3.1',
      '38.211 7.3.2, 7.3.2.3, 7.3.2.5, and 7.4.1.3',
    ]),
    implementationEvidence: 'Every PDCCH data and DM-RS RE in all ten slots is independently regenerated and compared.',
    independentVerification: 'py3gpp-0.6.0-exhaustive-frame-oracle',
  }),
  Object.freeze({
    requirement: 'Two full-band PDSCH users, RNTI 2 on PRBs 0-2 from symbol 2 and RNTI 0 on PRBs 3-105 from symbol 0',
    specification: '3GPP TS 38.141-1 V19.4.0 and TS 38.211 Release 19',
    clauses: Object.freeze([
      '38.141-1 Tables 4.9.2.2-3, 4.9.2.2-4, 4.9.2.2.1-1, and 4.9.2.3.2-1',
      '38.211 7.3.1 and 7.4.1.1',
    ]),
    implementationEvidence: 'All data and DM-RS REs in all ten slots are independently regenerated and compared.',
    independentVerification: 'py3gpp-0.6.0-exhaustive-frame-oracle',
  }),
  Object.freeze({
    requirement: 'QPSK, 64QAM, 256QAM, and 1024QAM mappings selected by the four test-model clauses',
    specification: '3GPP TS 38.141-1 V19.4.0 and TS 38.211 Release 19',
    clauses: Object.freeze([
      '38.141-1 4.9.2.2.1, 4.9.2.2.5, 4.9.2.2.6, and 4.9.2.2.6A',
      '38.211 5.1.3, 5.1.5, 5.1.6, and 5.1.7',
    ]),
    implementationEvidence: 'Every constellation point occurs in and is compared across the full py3gpp frame oracles; all 1,024 1024QAM input words are additionally compared with the pinned OCUDU mapper.',
    independentVerification: 'py3gpp-0.6.0-exhaustive-frame-and-ocudu-f0c8467560ea894d16e50207b3db60fd5ff19c01-exhaustive-1024qam-oracle',
  }),
] as const satisfies readonly NrFr1TestModelRequirement[]);

export interface NrFr1TestModelMetadata {
  readonly profileId: NrFr1TestModelProfile;
  readonly model: 'NR-FR1-TM1.1' | 'NR-FR1-TM3.1' | 'NR-FR1-TM3.1a' | 'NR-FR1-TM3.1b';
  readonly qualification: 'independently-verified-fixed-digital-baseband';
  readonly standardsComplianceClaimed: false;
  readonly rfConformanceClaimed: false;
  readonly productCertificationClaimed: false;
  readonly qualificationScope: string;
  readonly specification: typeof NR_FR1_20MHZ_N3_FDD_BINDING.specification;
  readonly clause: string;
  readonly modulation: NrFr1TestModelModulation;
  readonly bitsPerPdschSymbol: 2 | 6 | 8 | 10;
  readonly operatingBand: 'n3';
  readonly downlinkCenterHz: 1_842_500_000;
  readonly channelBandwidthHz: 20_000_000;
  readonly nominalGridBandwidthHz: 19_080_000;
  readonly physicalCellId: 1;
  readonly duplex: 'fdd';
  readonly cyclicPrefix: 'normal';
  readonly subcarrierSpacingHz: 15_000;
  readonly resourceBlockCount: 106;
  readonly activeSubcarrierCount: 1_272;
  readonly sampleRateHz: 30_720_000;
  readonly sampleCount: 307_200;
  readonly pdcch: {
    readonly symbols: readonly [0, 1];
    readonly resourceBlocks: readonly [0, 1, 2];
    readonly cceCount: 1;
    readonly regCount: 6;
    readonly rnti: 0;
    readonly antennaPort: 2000;
  };
  readonly pdsch: {
    readonly mappingType: 'A';
    readonly dmrsTypeAPosition: 2;
    readonly dmrsAdditionalPosition: 1;
    readonly dmrsConfigurationType: 1;
    readonly dmrsMaxLength: 1;
    readonly dmrsSymbols: readonly [2, 11];
    readonly cdmGroupsWithoutData: 1;
    readonly antennaPort: 1000;
    readonly rnti0ResourceBlocks: readonly [3, 105];
    readonly rnti0SymbolAllocation: readonly [0, 14];
    readonly rnti2ResourceBlocks: readonly [0, 2];
    readonly rnti2SymbolAllocation: readonly [2, 12];
  };
  readonly pn23: {
    readonly polynomial: 'x^23+x^18+1 (reciprocal SSRG form x^23+x^5+1)';
    readonly initialState: 'all-ones';
    readonly continuity: 'independent-per-channel-and-pdsch-user-across-slot-boundaries';
  };
  readonly resourceElementCounts: Readonly<Record<NrResourceElementKindName, number>>;
  readonly requirementLedger: readonly NrFr1TestModelRequirement[];
  readonly excludedScope: readonly string[];
}

export interface NrFr1TestModelFrame {
  readonly metadata: NrFr1TestModelMetadata;
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly kinds: Uint8Array;
    readonly symbolCount: 140;
    readonly subcarrierCount: 1_272;
  };
  readonly timeDomain: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly sampleCount: 307_200;
  };
}

/**
 * Generates one fixed Release 19 NR-FR1 test-model frame.
 *
 * The return value is a deterministic digital-baseband reference artifact. It
 * is not an RF conformance verdict and it does not certify any transmitter,
 * signal generator, or product.
 */
export function generateNrFr1TestModelFrame(
  profile: NrFr1TestModelProfile,
): NrFr1TestModelFrame {
  const definition = NR_FR1_TEST_MODEL_DEFINITIONS[profile];
  if (definition === undefined) {
    throw new RangeError(`Unsupported NR FR1 test-model profile: ${profile}`);
  }

  const real = new Float64Array(SYMBOLS_PER_FRAME * ACTIVE_SUBCARRIER_COUNT);
  const imaginary = new Float64Array(real.length);
  const kinds = new Uint8Array(real.length);

  const pdcchPn23 = generateNrPn23Bits(PDCCH_DATA_BITS_PER_SLOT * SLOTS_PER_FRAME);
  const rnti0Pn23 = generateNrPn23Bits(
    PDSCH_RNTI_0_RESOURCE_ELEMENTS_PER_SLOT * definition.bitsPerSymbol * SLOTS_PER_FRAME,
  );
  const rnti2Pn23 = generateNrPn23Bits(
    PDSCH_RNTI_2_RESOURCE_ELEMENTS_PER_SLOT * definition.bitsPerSymbol * SLOTS_PER_FRAME,
  );

  for (let slot = 0; slot < SLOTS_PER_FRAME; slot += 1) {
    mapPdcch(real, imaginary, kinds, slot, pdcchPn23);
    mapPdschUser(
      real,
      imaginary,
      kinds,
      slot,
      0,
      definition.modulation,
      definition.bitsPerSymbol,
      rnti0Pn23,
    );
    mapPdschUser(
      real,
      imaginary,
      kinds,
      slot,
      2,
      definition.modulation,
      definition.bitsPerSymbol,
      rnti2Pn23,
    );
    mapPdschDmrs(real, imaginary, kinds, slot);
  }

  for (let index = 0; index < kinds.length; index += 1) {
    if (kinds[index] === NR_RESOURCE_ELEMENT_KIND.unused) {
      throw new Error(`${profile} left resource element ${index} unallocated`);
    }
  }

  const timeDomain = renderNrOfdmFrame(real, imaginary);
  return {
    metadata: {
      profileId: profile,
      model: definition.model,
      qualification: 'independently-verified-fixed-digital-baseband',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
      qualificationScope: 'One content-addressable, fixed, impairment-free, single-port digital-baseband frame at the pinned n3/20 MHz/15 kHz/PCI1 geometry, exhaustively compared with py3gpp 0.6.0 and the pinned OCUDU mapper. No RF or product verdict is implied.',
      specification: NR_FR1_20MHZ_N3_FDD_BINDING.specification,
      clause: definition.clause,
      modulation: definition.modulation,
      bitsPerPdschSymbol: definition.bitsPerSymbol,
      operatingBand: 'n3',
      downlinkCenterHz: 1_842_500_000,
      channelBandwidthHz: 20_000_000,
      nominalGridBandwidthHz: 19_080_000,
      physicalCellId: 1,
      duplex: 'fdd',
      cyclicPrefix: 'normal',
      subcarrierSpacingHz: 15_000,
      resourceBlockCount: 106,
      activeSubcarrierCount: 1_272,
      sampleRateHz: 30_720_000,
      sampleCount: FRAME_SAMPLE_COUNT,
      pdcch: {
        symbols: Object.freeze([0, 1] as const),
        resourceBlocks: Object.freeze([0, 1, 2] as const),
        cceCount: 1,
        regCount: 6,
        rnti: 0,
        antennaPort: 2000,
      },
      pdsch: {
        mappingType: 'A',
        dmrsTypeAPosition: 2,
        dmrsAdditionalPosition: 1,
        dmrsConfigurationType: 1,
        dmrsMaxLength: 1,
        dmrsSymbols: DMRS_SYMBOLS,
        cdmGroupsWithoutData: 1,
        antennaPort: 1000,
        rnti0ResourceBlocks: Object.freeze([3, 105] as const),
        rnti0SymbolAllocation: Object.freeze([0, 14] as const),
        rnti2ResourceBlocks: Object.freeze([0, 2] as const),
        rnti2SymbolAllocation: Object.freeze([2, 12] as const),
      },
      pn23: {
        polynomial: 'x^23+x^18+1 (reciprocal SSRG form x^23+x^5+1)',
        initialState: 'all-ones',
        continuity: 'independent-per-channel-and-pdsch-user-across-slot-boundaries',
      },
      resourceElementCounts: countResourceElementKinds(kinds),
      requirementLedger: REQUIREMENT_LEDGER,
      excludedScope: Object.freeze([
        'Any carrier bandwidth, SCS, duplex mode, band, cell identity, layer count, antenna port, or frame duration other than the pinned binding.',
        'The special rank-2 NR-FR1-TM1.1 waveform used specifically by the TAE requirement.',
        'Windowing, phase compensation for a nonzero RF carrier, resampling, filtering, clipping, impairments, and RF upconversion.',
        'Conducted or radiated RF conformance, calibration, measurement uncertainty, analyzer verdicts, regulatory approval, and product certification.',
      ]),
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

/**
 * ITU-T O.150 PN23 data source used by TS 38.141-1 clause 4.9.2.3.
 *
 * O.150 names the polynomial x^23+x^18+1. The reciprocal
 * x^23+x^5+1 is used by the simple/Fibonacci shift-register orientation
 * exposed by common waveform tools. With the last register selected as the
 * output, both describe the same standardized sequence orientation.
 */
export function generateNrPn23Bits(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('NR PN23 length must be a non-negative safe integer');
  }
  const state = new Uint8Array(23);
  state.fill(1);
  const output = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = state[22]!;
    const feedback = state[17]! ^ state[22]!;
    for (let register = 22; register > 0; register -= 1) {
      state[register] = state[register - 1]!;
    }
    state[0] = feedback;
  }
  return output;
}

/** TS 38.211 clause 5.2.1 length-31 Gold sequence. */
export function generateNrGoldSequence(cInit: number, length: number): Uint8Array {
  if (!Number.isSafeInteger(cInit) || cInit < 0 || cInit > MAX_GOLD_INITIALIZATION) {
    throw new RangeError('NR Gold-sequence c_init must be an integer from 0 through 2^31-1');
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('NR Gold-sequence length must be a non-negative safe integer');
  }
  const stateLength = GOLD_SEQUENCE_OFFSET + length + 31;
  const x1 = new Uint8Array(stateLength);
  const x2 = new Uint8Array(stateLength);
  x1[0] = 1;
  for (let index = 0; index < 31; index += 1) {
    x2[index] = Math.floor(cInit / (2 ** index)) & 1;
  }
  for (let index = 0; index < GOLD_SEQUENCE_OFFSET + length; index += 1) {
    x1[index + 31] = x1[index + 3]! ^ x1[index]!;
    x2[index + 31] = x2[index + 3]! ^ x2[index + 2]! ^ x2[index + 1]! ^ x2[index]!;
  }
  const sequence = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    sequence[index] = x1[index + GOLD_SEQUENCE_OFFSET]! ^ x2[index + GOLD_SEQUENCE_OFFSET]!;
  }
  return sequence;
}

/** TS 38.211 clauses 5.1.3, 5.1.5, 5.1.6, and 5.1.7. */
export function mapNrQamBits(
  bits: Uint8Array,
  modulation: NrFr1TestModelModulation,
): readonly NrComplexSymbol[] {
  const bitsPerSymbol = bitsPerQamSymbol(modulation);
  if (bits.length === 0 || bits.length % bitsPerSymbol !== 0) {
    throw new RangeError(`${modulation} mapping requires a nonzero multiple of ${bitsPerSymbol} bits`);
  }
  for (const bit of bits) {
    if (bit !== 0 && bit !== 1) {
      throw new RangeError(`${modulation} mapping accepts binary bits only`);
    }
  }
  const constellationSize = 2 ** bitsPerSymbol;
  const normalization = Math.sqrt((2 / 3) * (constellationSize - 1));
  const output: NrComplexSymbol[] = [];
  for (let offset = 0; offset < bits.length; offset += bitsPerSymbol) {
    output.push(Object.freeze({
      real: qamAxis(bits, offset, 0, bitsPerSymbol / 2) / normalization,
      imaginary: qamAxis(bits, offset, 1, bitsPerSymbol / 2) / normalization,
    }));
  }
  return Object.freeze(output);
}

function mapPdcch(
  real: Float64Array,
  imaginary: Float64Array,
  kinds: Uint8Array,
  slot: number,
  framePn23: Uint8Array,
): void {
  const pnOffset = slot * PDCCH_DATA_BITS_PER_SLOT;
  const source = framePn23.subarray(pnOffset, pnOffset + PDCCH_DATA_BITS_PER_SLOT);
  const scrambling = generateNrGoldSequence(PHYSICAL_CELL_ID, source.length);
  const scrambled = xorBits(source, scrambling);
  const dataSymbols = mapNrQamBits(scrambled, 'qpsk');
  let dataSymbolIndex = 0;
  for (let symbol = 0; symbol < 2; symbol += 1) {
    for (let resourceBlock = 0; resourceBlock < 3; resourceBlock += 1) {
      for (let re = 0; re < SUBCARRIERS_PER_RESOURCE_BLOCK; re += 1) {
        if (re % 4 === 1) continue;
        const value = dataSymbols[dataSymbolIndex++]!;
        setResourceElement(
          real,
          imaginary,
          kinds,
          slot,
          symbol,
          resourceBlock,
          re,
          value,
          NR_RESOURCE_ELEMENT_KIND.pdcchData,
        );
      }
    }
  }
  if (dataSymbolIndex !== dataSymbols.length) {
    throw new Error(`PDCCH slot ${slot} mapped ${dataSymbolIndex} of ${dataSymbols.length} symbols`);
  }

  for (let symbol = 0; symbol < 2; symbol += 1) {
    const cInit = (
      (SYMBOLS_PER_SLOT * slot + symbol + 1)
      * (2 * PHYSICAL_CELL_ID + 1)
      * (2 ** 17)
      + 2 * PHYSICAL_CELL_ID
    ) % (2 ** 31);
    const dmrs = mapNrQamBits(generateNrGoldSequence(cInit, 18), 'qpsk');
    let dmrsIndex = 0;
    for (let resourceBlock = 0; resourceBlock < 3; resourceBlock += 1) {
      for (const re of [1, 5, 9]) {
        setResourceElement(
          real,
          imaginary,
          kinds,
          slot,
          symbol,
          resourceBlock,
          re,
          dmrs[dmrsIndex++]!,
          NR_RESOURCE_ELEMENT_KIND.pdcchDmrs,
        );
      }
    }
  }
}

function mapPdschUser(
  real: Float64Array,
  imaginary: Float64Array,
  kinds: Uint8Array,
  slot: number,
  rnti: 0 | 2,
  modulation: NrFr1TestModelModulation,
  bitsPerSymbol: 2 | 6 | 8 | 10,
  framePn23: Uint8Array,
): void {
  const resourceElementCount = rnti === 0
    ? PDSCH_RNTI_0_RESOURCE_ELEMENTS_PER_SLOT
    : PDSCH_RNTI_2_RESOURCE_ELEMENTS_PER_SLOT;
  const bitsPerSlot = resourceElementCount * bitsPerSymbol;
  const pnOffset = slot * bitsPerSlot;
  const source = framePn23.subarray(pnOffset, pnOffset + bitsPerSlot);
  const cInit = rnti * (2 ** 15) + PHYSICAL_CELL_ID;
  const scrambled = xorBits(source, generateNrGoldSequence(cInit, source.length));
  const dataSymbols = mapNrQamBits(scrambled, modulation);

  const firstSymbol = rnti === 0 ? 0 : 2;
  const firstResourceBlock = rnti === 0 ? 3 : 0;
  const lastResourceBlock = rnti === 0 ? 105 : 2;
  const kind = rnti === 0
    ? NR_RESOURCE_ELEMENT_KIND.pdschRnti0Data
    : NR_RESOURCE_ELEMENT_KIND.pdschRnti2Data;
  let dataSymbolIndex = 0;
  for (let symbol = firstSymbol; symbol < SYMBOLS_PER_SLOT; symbol += 1) {
    const carriesDmrs = symbol === DMRS_SYMBOLS[0] || symbol === DMRS_SYMBOLS[1];
    for (let resourceBlock = firstResourceBlock; resourceBlock <= lastResourceBlock; resourceBlock += 1) {
      for (let re = 0; re < SUBCARRIERS_PER_RESOURCE_BLOCK; re += 1) {
        if (carriesDmrs && re % 2 === 0) continue;
        const value = dataSymbols[dataSymbolIndex++]!;
        setResourceElement(
          real,
          imaginary,
          kinds,
          slot,
          symbol,
          resourceBlock,
          re,
          value,
          kind,
        );
      }
    }
  }
  if (dataSymbolIndex !== dataSymbols.length) {
    throw new Error(`PDSCH RNTI ${rnti} slot ${slot} mapped ${dataSymbolIndex} of ${dataSymbols.length} symbols`);
  }
}

function mapPdschDmrs(
  real: Float64Array,
  imaginary: Float64Array,
  kinds: Uint8Array,
  slot: number,
): void {
  for (const symbol of DMRS_SYMBOLS) {
    const cInit = (
      (SYMBOLS_PER_SLOT * slot + symbol + 1)
      * (2 * PHYSICAL_CELL_ID + 1)
      * (2 ** 17)
      + 2 * PHYSICAL_CELL_ID
    ) % (2 ** 31);
    const dmrs = mapNrQamBits(
      generateNrGoldSequence(cInit, RESOURCE_BLOCK_COUNT * 12),
      'qpsk',
    );
    let dmrsIndex = 0;
    for (let resourceBlock = 0; resourceBlock < RESOURCE_BLOCK_COUNT; resourceBlock += 1) {
      for (let re = 0; re < SUBCARRIERS_PER_RESOURCE_BLOCK; re += 2) {
        setResourceElement(
          real,
          imaginary,
          kinds,
          slot,
          symbol,
          resourceBlock,
          re,
          dmrs[dmrsIndex++]!,
          NR_RESOURCE_ELEMENT_KIND.pdschDmrs,
        );
      }
    }
    if (dmrsIndex !== dmrs.length) {
      throw new Error(`PDSCH DM-RS slot ${slot} symbol ${symbol} geometry mismatch`);
    }
  }
}

function renderNrOfdmFrame(
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): NrSplitComplexSequence {
  if (
    gridReal.length !== SYMBOLS_PER_FRAME * ACTIVE_SUBCARRIER_COUNT
    || gridImaginary.length !== gridReal.length
  ) {
    throw new RangeError('NR OFDM rendering requires a 140 by 1272 resource grid');
  }
  const real = new Float64Array(FRAME_SAMPLE_COUNT);
  const imaginary = new Float64Array(FRAME_SAMPLE_COUNT);
  let sampleOffset = 0;
  for (let symbol = 0; symbol < SYMBOLS_PER_FRAME; symbol += 1) {
    const symbolReal = new Float64Array(FFT_SIZE);
    const symbolImaginary = new Float64Array(FFT_SIZE);
    const gridOffset = symbol * ACTIVE_SUBCARRIER_COUNT;
    for (let subcarrier = 0; subcarrier < ACTIVE_SUBCARRIER_COUNT; subcarrier += 1) {
      const fftBin = (388 + subcarrier - FFT_SIZE / 2 + FFT_SIZE) % FFT_SIZE;
      symbolReal[fftBin] = gridReal[gridOffset + subcarrier]!;
      symbolImaginary[fftBin] = -gridImaginary[gridOffset + subcarrier]!;
    }
    fftForwardUnscaledInPlace(symbolReal, symbolImaginary);
    for (let sample = 0; sample < FFT_SIZE; sample += 1) {
      symbolReal[sample] = symbolReal[sample]! / FFT_SIZE;
      symbolImaginary[sample] = -symbolImaginary[sample]! / FFT_SIZE;
    }
    const symbolWithinSlot = symbol % SYMBOLS_PER_SLOT;
    const cyclicPrefixLength =
      symbolWithinSlot === 0 || symbolWithinSlot === 7 ? LONG_CP_SAMPLES : SHORT_CP_SAMPLES;
    const prefixStart = FFT_SIZE - cyclicPrefixLength;
    real.set(symbolReal.subarray(prefixStart), sampleOffset);
    imaginary.set(symbolImaginary.subarray(prefixStart), sampleOffset);
    sampleOffset += cyclicPrefixLength;
    real.set(symbolReal, sampleOffset);
    imaginary.set(symbolImaginary, sampleOffset);
    sampleOffset += FFT_SIZE;
  }
  if (sampleOffset !== FRAME_SAMPLE_COUNT) {
    throw new Error(`NR OFDM renderer produced ${sampleOffset} samples instead of ${FRAME_SAMPLE_COUNT}`);
  }
  return { real, imaginary };
}

function setResourceElement(
  real: Float64Array,
  imaginary: Float64Array,
  kinds: Uint8Array,
  slot: number,
  symbol: number,
  resourceBlock: number,
  re: number,
  value: NrComplexSymbol,
  kind: NrResourceElementKind,
): void {
  const gridSymbol = slot * SYMBOLS_PER_SLOT + symbol;
  const subcarrier = resourceBlock * SUBCARRIERS_PER_RESOURCE_BLOCK + re;
  const index = gridSymbol * ACTIVE_SUBCARRIER_COUNT + subcarrier;
  if (kinds[index] !== NR_RESOURCE_ELEMENT_KIND.unused) {
    throw new Error(`NR resource-element collision at slot ${slot}, symbol ${symbol}, RB ${resourceBlock}, RE ${re}`);
  }
  real[index] = value.real;
  imaginary[index] = value.imaginary;
  kinds[index] = kind;
}

function xorBits(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length !== right.length) throw new RangeError('Bitwise XOR inputs must have equal lengths');
  const output = new Uint8Array(left.length);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = left[index]! ^ right[index]!;
  }
  return output;
}

function bitsPerQamSymbol(modulation: NrFr1TestModelModulation): 2 | 6 | 8 | 10 {
  return modulation === 'qpsk'
    ? 2
    : modulation === '64qam'
      ? 6
      : modulation === '256qam'
        ? 8
        : 10;
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

function countResourceElementKinds(
  kinds: Uint8Array,
): Readonly<Record<NrResourceElementKindName, number>> {
  const counts: Record<NrResourceElementKindName, number> = {
    unused: 0,
    pdcchData: 0,
    pdcchDmrs: 0,
    pdschRnti0Data: 0,
    pdschRnti2Data: 0,
    pdschDmrs: 0,
  };
  const names = Object.keys(NR_RESOURCE_ELEMENT_KIND) as NrResourceElementKindName[];
  const namesByKind = new Map<number, NrResourceElementKindName>(
    names.map((name) => [NR_RESOURCE_ELEMENT_KIND[name], name]),
  );
  for (const kind of kinds) {
    const name = namesByKind.get(kind);
    if (name === undefined) throw new Error(`Unknown NR resource-element kind ${kind}`);
    counts[name] += 1;
  }
  return Object.freeze(counts);
}
