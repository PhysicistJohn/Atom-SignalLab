import { fftForwardUnscaledInPlace } from '@atomos/dsp';
import {
  generateNrGoldSequence,
  generateNrPn23Bits,
  mapNrQamBits,
  type NrComplexSymbol,
} from './nr-fr1-test-model-reference.js';

export const NR_N78_TDD_100M_PROFILE = 'nr-n78-tdd-100m' as const;

const RESOURCE_BLOCK_COUNT = 273;
const SUBCARRIERS_PER_RESOURCE_BLOCK = 12;
const ACTIVE_SUBCARRIER_COUNT = 3_276 as const;
const RADIO_FRAMES_PER_ARTIFACT = 2;
const SLOTS_PER_RADIO_FRAME = 20;
const SLOTS_PER_ARTIFACT = 40;
const SYMBOLS_PER_SLOT = 14;
const SYMBOLS_PER_ARTIFACT = 560 as const;
const FFT_SIZE = 4_096;
const LONG_CP_SAMPLES = 352;
const SHORT_CP_SAMPLES = 288;
const SAMPLE_RATE_HZ = 122_880_000;
const ARTIFACT_SAMPLE_COUNT = 2_457_600;
const PHYSICAL_CELL_ID = 1;
const PDCCH_DATA_BITS_PER_ACTIVE_SLOT = 108;
const FULL_SLOT_RNTI_0_DATA_RE = 42_120;
const PARTIAL_SLOT_RNTI_0_DATA_RE = 17_820;
const FULL_SLOT_RNTI_2_DATA_RE = 396;
const PARTIAL_SLOT_RNTI_2_DATA_RE = 126;
const FULL_SLOT_DMRS_SYMBOLS = Object.freeze([2, 11] as const);
const PARTIAL_SLOT_DMRS_SYMBOLS = Object.freeze([2] as const);

export const NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND = Object.freeze({
  inactive: 0,
  pdcchData: 1,
  pdcchDmrs: 2,
  pdschRnti0Data: 3,
  pdschRnti2Data: 4,
  pdschDmrs: 5,
} as const);

export type NrN78Tdd100mResourceElementKindName =
  keyof typeof NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND;
export type NrN78Tdd100mResourceElementKind =
  typeof NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND[
    NrN78Tdd100mResourceElementKindName
  ];

export const NR_N78_TDD_100M_BINDING = Object.freeze({
  testModelSpecification:
    '3GPP TS 38.141-1 V19.4.0 (Release 19)' as const,
  rfSpecification: '3GPP TS 38.104 V19.4.0 (Release 19)' as const,
  physicalLayerSpecification:
    '3GPP TS 38.211 V19.4.0 (Release 19)' as const,
  tddSpecification:
    '3GPP TS 38.213 V19.3.0 and TS 38.331 V19.1.0 (Release 19)' as const,
  model: 'NR-FR1-TM1.1' as const,
  operatingBand: 'n78' as const,
  duplex: 'tdd' as const,
  downlinkCenterHz: 3_500_010_000 as const,
  downlinkNrArfcn: 633_334 as const,
  channelBandwidthHz: 100_000_000 as const,
  nominalGridBandwidthHz: 98_280_000 as const,
  physicalCellId: PHYSICAL_CELL_ID,
  subcarrierSpacingHz: 30_000 as const,
  resourceBlockCount: RESOURCE_BLOCK_COUNT,
  activeSubcarrierCount: ACTIVE_SUBCARRIER_COUNT,
  fftSize: FFT_SIZE,
  sampleRateHz: SAMPLE_RATE_HZ,
  radioFrameDurationMs: 10 as const,
  radioFramesPerArtifact: RADIO_FRAMES_PER_ARTIFACT,
  artifactDurationMs: 20 as const,
  artifactSampleCount: ARTIFACT_SAMPLE_COUNT,
  slotsPerRadioFrame: SLOTS_PER_RADIO_FRAME,
  slotsPerArtifact: SLOTS_PER_ARTIFACT,
  symbolsPerSlot: SYMBOLS_PER_SLOT,
  cyclicPrefix: 'normal' as const,
  windowingPercent: 0 as const,
  tddPattern: Object.freeze({
    referenceSubcarrierSpacingKhz: 30 as const,
    periodicityMs: 5 as const,
    nrofDownlinkSlots: 7 as const,
    nrofDownlinkSymbols: 6 as const,
    nrofUplinkSlots: 2 as const,
    nrofUplinkSymbols: 4 as const,
    repetitionsPerRadioFrame: 2 as const,
    repetitionsPerArtifact: 4 as const,
  }),
});

export const NR_N78_TDD_100M_REFERENCE_IDENTITIES = Object.freeze({
  gridCf64leSha256:
    'd23c6b425b73d7b4791c775da400ae55a72d552dd1ab31b4c8b09ee453d86bf7',
  kindsU8Sha256:
    '16dfc38e275993cc5b80289840e5a4b159dc6c1be071978a2e81924568fb5b8b',
  timeCf64leSha256:
    '9ae9d7dab86355efec45deaf52bf4e5e3d0576ef396a89599e4f763405f534f2',
});

export interface NrN78Tdd100mRequirement {
  readonly requirement: string;
  readonly specification: string;
  readonly clauses: readonly string[];
  readonly implementationEvidence: string;
  readonly independentVerification:
    'py3gpp-0.6.0-exhaustive-active-grid-and-complete-20ms-oracle';
}

const REQUIREMENT_LEDGER = Object.freeze([
  Object.freeze({
    requirement:
      'Two consecutive 10 ms n78 TDD radio frames at 100 MHz, 30 kHz SCS, normal CP, and 273 RB',
    specification:
      '3GPP TS 38.141-1 V19.4.0, TS 38.104 V19.4.0, and TS 38.211 V19.4.0',
    clauses: Object.freeze([
      '38.141-1 4.9.2.2 and 4.9.2.2.1',
      '38.104 Tables 5.2-1, 5.3.2-1, 5.3.5-1, 5.4.2.1-1, and 5.4.2.3-1',
      '38.211 4.2-4.4 and 5.3',
    ]),
    implementationEvidence:
      'The complete 1,834,560-RE grid and 2,457,600-sample, 20 ms artifact are content addressed and exhaustively compared with a separately implemented py3gpp/NumPy oracle.',
    independentVerification:
      'py3gpp-0.6.0-exhaustive-active-grid-and-complete-20ms-oracle',
  }),
  Object.freeze({
    requirement:
      'The prescribed 30 kHz FR1-TDD test-model pattern: seven full DL slots, six DL symbols in the mixed slot, four UL symbols, and two full UL slots per 5 ms period',
    specification:
      '3GPP TS 38.141-1 V19.4.0, TS 38.213 V19.3.0, and TS 38.331 V19.1.0',
    clauses: Object.freeze([
      '38.141-1 Table 4.9.2.2-1',
      '38.213 11.1',
      '38.331 TDD-UL-DL-ConfigCommon and TDD-UL-DL-Pattern',
    ]),
    implementationEvidence:
      'Only the seven full DL slots and first six symbols of the mixed slot carry the downlink test model in each of four 5 ms periods; every other sample is exactly zero.',
    independentVerification:
      'py3gpp-0.6.0-exhaustive-active-grid-and-complete-20ms-oracle',
  }),
  Object.freeze({
    requirement:
      'NR-FR1-TM1.1 PDCCH/PDSCH allocation, QPSK mapping, PN23 data, scrambling, and DM-RS',
    specification:
      '3GPP TS 38.141-1 V19.4.0 and TS 38.211 V19.4.0',
    clauses: Object.freeze([
      '38.141-1 Tables 4.9.2.2-2 through 4.9.2.2-4 and 4.9.2.2.1-1',
      '38.141-1 4.9.2.3.1 and 4.9.2.3.2',
      '38.211 5.1.3, 5.2.1, 7.3.1, 7.3.2, 7.4.1.1, and 7.4.1.3',
    ]),
    implementationEvidence:
      'Every active resource element, including each partial DL slot, is independently regenerated and compared; PN23 and slot numbering reset at each 10 ms radio-frame boundary.',
    independentVerification:
      'py3gpp-0.6.0-exhaustive-active-grid-and-complete-20ms-oracle',
  }),
] as const satisfies readonly NrN78Tdd100mRequirement[]);

export interface NrN78Tdd100mFrame {
  readonly metadata: {
    readonly profileId: typeof NR_N78_TDD_100M_PROFILE;
    readonly model: 'NR-FR1-TM1.1';
    readonly qualification:
      'independently-verified-fixed-digital-baseband';
    readonly standardsComplianceClaimed: false;
    readonly rfConformanceClaimed: false;
    readonly productCertificationClaimed: false;
    readonly qualificationScope: string;
    readonly binding: typeof NR_N78_TDD_100M_BINDING;
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
      readonly modulation: 'qpsk';
      readonly dmrsTypeAPosition: 2;
      readonly dmrsAdditionalPosition: 1;
      readonly dmrsConfigurationType: 1;
      readonly dmrsMaxLength: 1;
      readonly fullSlotDmrsSymbols: readonly [2, 11];
      readonly partialSlotDmrsSymbols: readonly [2];
      readonly cdmGroupsWithoutData: 1;
      readonly antennaPort: 1000;
      readonly rnti0ResourceBlocks: readonly [3, 272];
      readonly rnti0FullSlotSymbolAllocation: readonly [0, 14];
      readonly rnti0PartialSlotSymbolAllocation: readonly [0, 6];
      readonly rnti2ResourceBlocks: readonly [0, 2];
      readonly rnti2FullSlotSymbolAllocation: readonly [2, 12];
      readonly rnti2PartialSlotSymbolAllocation: readonly [2, 4];
    };
    readonly pn23: {
      readonly polynomial:
        'x^23+x^18+1 (reciprocal SSRG form x^23+x^5+1)';
      readonly initialState: 'all-ones';
      readonly continuity:
        'independent-per-channel-and-pdsch-user-across-active-downlink-allocations-with-all-ones-reset-at-each-radio-frame';
    };
    readonly resourceElementCounts:
      Readonly<Record<NrN78Tdd100mResourceElementKindName, number>>;
    readonly requirementLedger: readonly NrN78Tdd100mRequirement[];
    readonly excludedScope: readonly string[];
  };
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly kinds: Uint8Array;
    readonly symbolCount: 560;
    readonly subcarrierCount: 3_276;
  };
  readonly timeDomain: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly sampleCount: 2_457_600;
  };
}

/**
 * Generate the content-addressable, impairment-free, two-radio-frame
 * NR-FR1-TM1.1 artifact at the exact n78/100 MHz/30 kHz/TDD binding above.
 *
 * This is a digital-baseband reference artifact, not an RF measurement,
 * regulatory approval, product certification, or universal n78 deployment
 * configuration.
 */
export function generateNrN78Tdd100mFrame(): NrN78Tdd100mFrame {
  const real = new Float64Array(
    SYMBOLS_PER_ARTIFACT * ACTIVE_SUBCARRIER_COUNT,
  );
  const imaginary = new Float64Array(real.length);
  const kinds = new Uint8Array(real.length);

  const activeSlotsWithinRadioFrame =
    activeDownlinkSlotsWithinRadioFrame();
  for (
    let radioFrame = 0;
    radioFrame < RADIO_FRAMES_PER_ARTIFACT;
    radioFrame += 1
  ) {
    const pdcchBits = generateNrPn23Bits(
      PDCCH_DATA_BITS_PER_ACTIVE_SLOT
      * activeSlotsWithinRadioFrame.length,
    );
    const rnti0Bits = generateNrPn23Bits(
      2 * activeSlotsWithinRadioFrame.reduce(
        (sum, slotWithinRadioFrame) => sum
          + rnti0DataResourceElements(
            activeDlSymbolCount(slotWithinRadioFrame),
          ),
        0,
      ),
    );
    const rnti2Bits = generateNrPn23Bits(
      2 * activeSlotsWithinRadioFrame.reduce(
        (sum, slotWithinRadioFrame) => sum
          + rnti2DataResourceElements(
            activeDlSymbolCount(slotWithinRadioFrame),
          ),
        0,
      ),
    );

    let pdcchBitOffset = 0;
    let rnti0BitOffset = 0;
    let rnti2BitOffset = 0;
    for (const slotWithinRadioFrame of activeSlotsWithinRadioFrame) {
      const globalSlot =
        radioFrame * SLOTS_PER_RADIO_FRAME + slotWithinRadioFrame;
      const downlinkSymbols =
        activeDlSymbolCount(slotWithinRadioFrame);
      pdcchBitOffset = mapPdcch(
        real,
        imaginary,
        kinds,
        globalSlot,
        slotWithinRadioFrame,
        pdcchBits,
        pdcchBitOffset,
      );
      rnti0BitOffset = mapPdschUser(
        real,
        imaginary,
        kinds,
        globalSlot,
        downlinkSymbols,
        0,
        rnti0Bits,
        rnti0BitOffset,
      );
      rnti2BitOffset = mapPdschUser(
        real,
        imaginary,
        kinds,
        globalSlot,
        downlinkSymbols,
        2,
        rnti2Bits,
        rnti2BitOffset,
      );
      mapPdschDmrs(
        real,
        imaginary,
        kinds,
        globalSlot,
        slotWithinRadioFrame,
        downlinkSymbols,
      );
    }
    if (
      pdcchBitOffset !== pdcchBits.length
      || rnti0BitOffset !== rnti0Bits.length
      || rnti2BitOffset !== rnti2Bits.length
    ) {
      throw new Error(
        `NR n78 radio frame ${radioFrame} PN23 data sources were not consumed exactly`,
      );
    }
  }

  for (
    let symbol = 0;
    symbol < SYMBOLS_PER_ARTIFACT;
    symbol += 1
  ) {
    const slot = Math.floor(symbol / SYMBOLS_PER_SLOT);
    const localSymbol = symbol % SYMBOLS_PER_SLOT;
    const expectedActive = localSymbol < dlSymbolCount(slot);
    const offset = symbol * ACTIVE_SUBCARRIER_COUNT;
    for (
      let subcarrier = 0;
      subcarrier < ACTIVE_SUBCARRIER_COUNT;
      subcarrier += 1
    ) {
      const kind = kinds[offset + subcarrier]!;
      if (
        (expectedActive
          && kind === NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.inactive)
        || (!expectedActive
          && kind !== NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.inactive)
      ) {
        throw new Error(
          `NR n78 TDD allocation mismatch at slot ${slot}, symbol ${localSymbol}, subcarrier ${subcarrier}`,
        );
      }
    }
  }

  const timeDomain = renderOfdmArtifact(real, imaginary);
  return {
    metadata: {
      profileId: NR_N78_TDD_100M_PROFILE,
      model: 'NR-FR1-TM1.1',
      qualification: 'independently-verified-fixed-digital-baseband',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
      qualificationScope:
        'One content-addressable, fixed, impairment-free, single-port, two-radio-frame (20 ms) NR-FR1-TM1.1 digital-baseband artifact at the pinned n78/100 MHz/30 kHz/PCI1 and TS 38.141-1 Table 4.9.2.2-1 TDD geometry, exhaustively compared with a separately implemented py3gpp 0.6.0 oracle. No RF or product verdict is implied.',
      binding: NR_N78_TDD_100M_BINDING,
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
        modulation: 'qpsk',
        dmrsTypeAPosition: 2,
        dmrsAdditionalPosition: 1,
        dmrsConfigurationType: 1,
        dmrsMaxLength: 1,
        fullSlotDmrsSymbols: FULL_SLOT_DMRS_SYMBOLS,
        partialSlotDmrsSymbols: PARTIAL_SLOT_DMRS_SYMBOLS,
        cdmGroupsWithoutData: 1,
        antennaPort: 1000,
        rnti0ResourceBlocks: Object.freeze([3, 272] as const),
        rnti0FullSlotSymbolAllocation: Object.freeze([0, 14] as const),
        rnti0PartialSlotSymbolAllocation: Object.freeze([0, 6] as const),
        rnti2ResourceBlocks: Object.freeze([0, 2] as const),
        rnti2FullSlotSymbolAllocation: Object.freeze([2, 12] as const),
        rnti2PartialSlotSymbolAllocation: Object.freeze([2, 4] as const),
      },
      pn23: {
        polynomial:
          'x^23+x^18+1 (reciprocal SSRG form x^23+x^5+1)',
        initialState: 'all-ones',
        continuity:
          'independent-per-channel-and-pdsch-user-across-active-downlink-allocations-with-all-ones-reset-at-each-radio-frame',
      },
      resourceElementCounts: countResourceElementKinds(kinds),
      requirementLedger: REQUIREMENT_LEDGER,
      excludedScope: Object.freeze([
        'Any carrier bandwidth, SCS, TDD pattern, band, cell identity, layer count, antenna port, or frame duration other than the pinned binding.',
        'Any waveform other than NR-FR1-TM1.1, including the special rank-2 form used for TAE.',
        'Windowing, nonzero-carrier phase compensation, resampling, filtering, clipping, impairments, RF upconversion, or power-amplifier behavior.',
        'Conducted or radiated RF conformance, calibration, measurement uncertainty, analyzer verdicts, regulatory approval, and product certification.',
      ]),
    },
    grid: {
      real,
      imaginary,
      kinds,
      symbolCount: SYMBOLS_PER_ARTIFACT,
      subcarrierCount: ACTIVE_SUBCARRIER_COUNT,
    },
    timeDomain: {
      ...timeDomain,
      sampleCount: ARTIFACT_SAMPLE_COUNT,
    },
  };
}

export function nrN78Tdd100mDownlinkSymbolCount(slot: number): 0 | 6 | 14 {
  if (
    !Number.isSafeInteger(slot)
    || slot < 0
    || slot >= SLOTS_PER_ARTIFACT
  ) {
    throw new RangeError('NR n78 slot must be an integer from 0 through 39');
  }
  return dlSymbolCount(slot);
}

function dlSymbolCount(slot: number): 0 | 6 | 14 {
  const patternSlot = slot % 10;
  return patternSlot < 7 ? 14 : patternSlot === 7 ? 6 : 0;
}

function activeDownlinkSlotsWithinRadioFrame(): readonly number[] {
  return Object.freeze(
    Array.from(
      { length: SLOTS_PER_RADIO_FRAME },
      (_, slot) => slot,
    ).filter((slot) => dlSymbolCount(slot) > 0),
  );
}

function activeDlSymbolCount(slot: number): 6 | 14 {
  const count = dlSymbolCount(slot);
  if (count === 0) {
    throw new Error(`NR n78 slot ${slot} has no downlink symbols`);
  }
  return count;
}

function rnti0DataResourceElements(downlinkSymbols: 6 | 14): number {
  return downlinkSymbols === 14
    ? FULL_SLOT_RNTI_0_DATA_RE
    : PARTIAL_SLOT_RNTI_0_DATA_RE;
}

function rnti2DataResourceElements(downlinkSymbols: 6 | 14): number {
  return downlinkSymbols === 14
    ? FULL_SLOT_RNTI_2_DATA_RE
    : PARTIAL_SLOT_RNTI_2_DATA_RE;
}

function dmrsSymbols(downlinkSymbols: 6 | 14): readonly (2 | 11)[] {
  return downlinkSymbols === 14
    ? FULL_SLOT_DMRS_SYMBOLS
    : PARTIAL_SLOT_DMRS_SYMBOLS;
}

function mapPdcch(
  real: Float64Array,
  imaginary: Float64Array,
  kinds: Uint8Array,
  globalSlot: number,
  slotWithinRadioFrame: number,
  frameBits: Uint8Array,
  bitOffset: number,
): number {
  const source = frameBits.subarray(
    bitOffset,
    bitOffset + PDCCH_DATA_BITS_PER_ACTIVE_SLOT,
  );
  if (source.length !== PDCCH_DATA_BITS_PER_ACTIVE_SLOT) {
    throw new Error(
      `NR n78 PDCCH global slot ${globalSlot} exhausted its data source`,
    );
  }
  const scrambled = xorBits(
    source,
    generateNrGoldSequence(PHYSICAL_CELL_ID, source.length),
  );
  const dataSymbols = mapNrQamBits(scrambled, 'qpsk');
  let dataSymbolIndex = 0;
  for (let symbol = 0; symbol < 2; symbol += 1) {
    for (let resourceBlock = 0; resourceBlock < 3; resourceBlock += 1) {
      for (
        let re = 0;
        re < SUBCARRIERS_PER_RESOURCE_BLOCK;
        re += 1
      ) {
        if (re % 4 === 1) continue;
        setResourceElement(
          real,
          imaginary,
          kinds,
          globalSlot,
          symbol,
          resourceBlock,
          re,
          dataSymbols[dataSymbolIndex++]!,
          NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdcchData,
        );
      }
    }
  }
  if (dataSymbolIndex !== dataSymbols.length) {
    throw new Error(
      `NR n78 PDCCH global slot ${globalSlot} symbol count mismatch`,
    );
  }

  for (let symbol = 0; symbol < 2; symbol += 1) {
    const cInit = (
      (SYMBOLS_PER_SLOT * slotWithinRadioFrame + symbol + 1)
      * (2 * PHYSICAL_CELL_ID + 1)
      * (2 ** 17)
      + 2 * PHYSICAL_CELL_ID
    ) % (2 ** 31);
    const dmrs = mapNrQamBits(
      generateNrGoldSequence(cInit, 18),
      'qpsk',
    );
    let dmrsIndex = 0;
    for (let resourceBlock = 0; resourceBlock < 3; resourceBlock += 1) {
      for (const re of [1, 5, 9]) {
        setResourceElement(
          real,
          imaginary,
          kinds,
          globalSlot,
          symbol,
          resourceBlock,
          re,
          dmrs[dmrsIndex++]!,
          NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdcchDmrs,
        );
      }
    }
  }
  return bitOffset + PDCCH_DATA_BITS_PER_ACTIVE_SLOT;
}

function mapPdschUser(
  real: Float64Array,
  imaginary: Float64Array,
  kinds: Uint8Array,
  slot: number,
  downlinkSymbols: 6 | 14,
  rnti: 0 | 2,
  frameBits: Uint8Array,
  bitOffset: number,
): number {
  const resourceElementCount = rnti === 0
    ? rnti0DataResourceElements(downlinkSymbols)
    : rnti2DataResourceElements(downlinkSymbols);
  const bitCount = resourceElementCount * 2;
  const source = frameBits.subarray(bitOffset, bitOffset + bitCount);
  if (source.length !== bitCount) {
    throw new Error(
      `NR n78 PDSCH RNTI ${rnti} slot ${slot} exhausted its data source`,
    );
  }
  const cInit = rnti * (2 ** 15) + PHYSICAL_CELL_ID;
  const scrambled = xorBits(
    source,
    generateNrGoldSequence(cInit, source.length),
  );
  const dataSymbols = mapNrQamBits(scrambled, 'qpsk');
  const firstSymbol = rnti === 0 ? 0 : 2;
  const firstResourceBlock = rnti === 0 ? 3 : 0;
  const lastResourceBlock = rnti === 0 ? 272 : 2;
  const kind = rnti === 0
    ? NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdschRnti0Data
    : NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdschRnti2Data;
  const activeDmrsSymbols = dmrsSymbols(downlinkSymbols);
  let dataSymbolIndex = 0;
  for (
    let symbol = firstSymbol;
    symbol < downlinkSymbols;
    symbol += 1
  ) {
    const carriesDmrs = activeDmrsSymbols.some(
      (dmrsSymbol) => dmrsSymbol === symbol,
    );
    for (
      let resourceBlock = firstResourceBlock;
      resourceBlock <= lastResourceBlock;
      resourceBlock += 1
    ) {
      for (
        let re = 0;
        re < SUBCARRIERS_PER_RESOURCE_BLOCK;
        re += 1
      ) {
        if (carriesDmrs && re % 2 === 0) continue;
        setResourceElement(
          real,
          imaginary,
          kinds,
          slot,
          symbol,
          resourceBlock,
          re,
          dataSymbols[dataSymbolIndex++]!,
          kind,
        );
      }
    }
  }
  if (dataSymbolIndex !== dataSymbols.length) {
    throw new Error(
      `NR n78 PDSCH RNTI ${rnti} slot ${slot} mapped ${dataSymbolIndex} of ${dataSymbols.length} symbols`,
    );
  }
  return bitOffset + bitCount;
}

function mapPdschDmrs(
  real: Float64Array,
  imaginary: Float64Array,
  kinds: Uint8Array,
  globalSlot: number,
  slotWithinRadioFrame: number,
  downlinkSymbols: 6 | 14,
): void {
  for (const symbol of dmrsSymbols(downlinkSymbols)) {
    const cInit = (
      (SYMBOLS_PER_SLOT * slotWithinRadioFrame + symbol + 1)
      * (2 * PHYSICAL_CELL_ID + 1)
      * (2 ** 17)
      + 2 * PHYSICAL_CELL_ID
    ) % (2 ** 31);
    const symbols = mapNrQamBits(
      generateNrGoldSequence(cInit, RESOURCE_BLOCK_COUNT * 12),
      'qpsk',
    );
    let dmrsIndex = 0;
    for (
      let resourceBlock = 0;
      resourceBlock < RESOURCE_BLOCK_COUNT;
      resourceBlock += 1
    ) {
      for (
        let re = 0;
        re < SUBCARRIERS_PER_RESOURCE_BLOCK;
        re += 2
      ) {
        setResourceElement(
          real,
          imaginary,
          kinds,
          globalSlot,
          symbol,
          resourceBlock,
          re,
          symbols[dmrsIndex++]!,
          NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdschDmrs,
        );
      }
    }
    if (dmrsIndex !== symbols.length) {
      throw new Error(
        `NR n78 PDSCH DM-RS global slot ${globalSlot} geometry mismatch`,
      );
    }
  }
}

function renderOfdmArtifact(
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): { readonly real: Float64Array; readonly imaginary: Float64Array } {
  if (
    gridReal.length !== SYMBOLS_PER_ARTIFACT * ACTIVE_SUBCARRIER_COUNT
    || gridImaginary.length !== gridReal.length
  ) {
    throw new RangeError(
      'NR n78 OFDM rendering requires a 560 by 3276 resource grid',
    );
  }
  const real = new Float64Array(ARTIFACT_SAMPLE_COUNT);
  const imaginary = new Float64Array(ARTIFACT_SAMPLE_COUNT);
  const lowerGuardBins = (FFT_SIZE - ACTIVE_SUBCARRIER_COUNT) / 2;
  let sampleOffset = 0;
  for (
    let symbol = 0;
    symbol < SYMBOLS_PER_ARTIFACT;
    symbol += 1
  ) {
    const localSymbol = symbol % SYMBOLS_PER_SLOT;
    const cyclicPrefixLength = localSymbol === 0
      ? LONG_CP_SAMPLES
      : SHORT_CP_SAMPLES;
    const slot = Math.floor(symbol / SYMBOLS_PER_SLOT);
    if (localSymbol >= dlSymbolCount(slot)) {
      sampleOffset += cyclicPrefixLength + FFT_SIZE;
      continue;
    }

    const symbolReal = new Float64Array(FFT_SIZE);
    const symbolImaginary = new Float64Array(FFT_SIZE);
    const gridOffset = symbol * ACTIVE_SUBCARRIER_COUNT;
    for (
      let subcarrier = 0;
      subcarrier < ACTIVE_SUBCARRIER_COUNT;
      subcarrier += 1
    ) {
      const fftBin = (
        lowerGuardBins + subcarrier - FFT_SIZE / 2 + FFT_SIZE
      ) % FFT_SIZE;
      symbolReal[fftBin] = gridReal[gridOffset + subcarrier]!;
      symbolImaginary[fftBin] = -gridImaginary[gridOffset + subcarrier]!;
    }
    fftForwardUnscaledInPlace(symbolReal, symbolImaginary);
    for (let sample = 0; sample < FFT_SIZE; sample += 1) {
      symbolReal[sample] = symbolReal[sample]! / FFT_SIZE;
      symbolImaginary[sample] = -symbolImaginary[sample]! / FFT_SIZE;
    }
    const prefixStart = FFT_SIZE - cyclicPrefixLength;
    real.set(symbolReal.subarray(prefixStart), sampleOffset);
    imaginary.set(symbolImaginary.subarray(prefixStart), sampleOffset);
    sampleOffset += cyclicPrefixLength;
    real.set(symbolReal, sampleOffset);
    imaginary.set(symbolImaginary, sampleOffset);
    sampleOffset += FFT_SIZE;
  }
  if (sampleOffset !== ARTIFACT_SAMPLE_COUNT) {
    throw new Error(
      `NR n78 OFDM renderer produced ${sampleOffset} samples instead of ${ARTIFACT_SAMPLE_COUNT}`,
    );
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
  kind: NrN78Tdd100mResourceElementKind,
): void {
  const gridSymbol = slot * SYMBOLS_PER_SLOT + symbol;
  const subcarrier = resourceBlock * SUBCARRIERS_PER_RESOURCE_BLOCK + re;
  const index = gridSymbol * ACTIVE_SUBCARRIER_COUNT + subcarrier;
  if (
    kinds[index]
    !== NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.inactive
  ) {
    throw new Error(
      `NR n78 resource-element collision at slot ${slot}, symbol ${symbol}, RB ${resourceBlock}, RE ${re}`,
    );
  }
  real[index] = value.real;
  imaginary[index] = value.imaginary;
  kinds[index] = kind;
}

function xorBits(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length !== right.length) {
    throw new RangeError('Bitwise XOR inputs must have equal lengths');
  }
  const output = new Uint8Array(left.length);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = left[index]! ^ right[index]!;
  }
  return output;
}

function countResourceElementKinds(
  kinds: Uint8Array,
): Readonly<Record<NrN78Tdd100mResourceElementKindName, number>> {
  const counts: Record<NrN78Tdd100mResourceElementKindName, number> = {
    inactive: 0,
    pdcchData: 0,
    pdcchDmrs: 0,
    pdschRnti0Data: 0,
    pdschRnti2Data: 0,
    pdschDmrs: 0,
  };
  const names = Object.keys(
    NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND,
  ) as NrN78Tdd100mResourceElementKindName[];
  const namesByKind = new Map<number, NrN78Tdd100mResourceElementKindName>(
    names.map((name) => [
      NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND[name],
      name,
    ]),
  );
  for (const kind of kinds) {
    const name = namesByKind.get(kind);
    if (name === undefined) {
      throw new Error(`Unknown NR n78 resource-element kind ${kind}`);
    }
    counts[name] += 1;
  }
  return Object.freeze(counts);
}
