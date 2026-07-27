import { fftForwardUnscaledInPlace } from '@atomos/dsp';
import {
  LTE_RESOURCE_ELEMENT_KIND,
  applyLteSingleAntennaPortIdentityStage,
  generateLteGoldSequence,
  generateLtePrimarySynchronizationSignal,
  generateLteSecondarySynchronizationSignal,
  type LteComplexSymbol,
  type LteResourceElementKind,
  type LteResourceElementKindName,
  type SplitComplexSequence,
} from './lte-etm1-reference.js';

export const LTE_BAND3_FDD_20M_PROFILE = 'lte-band3-fdd-20m' as const;
export const LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ = 20_000_000 as const;
export const LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ = 30_720_000 as const;
export const LTE_BAND3_FDD_20M_RESOURCE_BLOCKS = 100 as const;
export const LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS = 1_200 as const;
export const LTE_BAND3_FDD_20M_FFT_SIZE = 2_048 as const;
export const LTE_BAND3_FDD_20M_FRAME_SAMPLES = 307_200 as const;
export const LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID = 1 as const;
export const LTE_BAND3_FDD_20M_REFERENCE_IDENTITIES = Object.freeze({
  gridCf64leSha256: '85b51eff674bb9812f5189f09e0f35fadb4751f91f74e8ab57c2b3e029a121c5',
  timeCf64leSha256: '6bd14a12dc6d4fe3e4fc3cdb4b1ee07fc554c8cc2e642eb0f2f5167991028541',
});

const SUBFRAMES_PER_FRAME = 10;
const SLOTS_PER_SUBFRAME = 2;
const SYMBOLS_PER_SLOT = 7;
const SYMBOLS_PER_SUBFRAME = 14;
const SYMBOLS_PER_FRAME = 140;
const FIRST_SYMBOL_CP_SAMPLES = 160;
const OTHER_SYMBOL_CP_SAMPLES = 144;
const QPSK_COMPONENT = Math.SQRT1_2;
const PDCCH_AMPLITUDE = 10 ** (1.195 / 20);
const PDCCH_DATA_QUADRUPLETS = 180;
const PDCCH_AVAILABLE_REGS = 187;

const PCFICH_CFI_ONE_BITS = Uint8Array.of(
  0, 1, 1, 0, 1, 1, 0, 1,
  1, 0, 1, 1, 0, 1, 1, 0,
  1, 1, 0, 1, 1, 0, 1, 1,
  0, 1, 1, 0, 1, 1, 0, 1,
);

const PDCCH_INTER_COLUMN_PERMUTATION = Object.freeze([
  1, 17, 9, 25, 5, 21, 13, 29,
  3, 19, 11, 27, 7, 23, 15, 31,
  0, 16, 8, 24, 4, 20, 12, 28,
  2, 18, 10, 26, 6, 22, 14, 30,
] as const);

const PHICH_ORTHOGONAL_SEQUENCES = Object.freeze({
  0: Object.freeze([
    Object.freeze({ real: 1, imaginary: 0 }),
    Object.freeze({ real: 1, imaginary: 0 }),
    Object.freeze({ real: 1, imaginary: 0 }),
    Object.freeze({ real: 1, imaginary: 0 }),
  ]),
  4: Object.freeze([
    Object.freeze({ real: 0, imaginary: 1 }),
    Object.freeze({ real: 0, imaginary: 1 }),
    Object.freeze({ real: 0, imaginary: 1 }),
    Object.freeze({ real: 0, imaginary: 1 }),
  ]),
} as const);

export interface LteBand3Fdd20mReferenceFrame {
  readonly metadata: {
    readonly profileId: typeof LTE_BAND3_FDD_20M_PROFILE;
    readonly fixedWaveform: 'E-TM1.1';
    readonly specification: '3GPP TS 36.141 V19.1.0';
    readonly clause: '6.1.1.1, Table 6.1.1.1-1, and 6.1.2';
    readonly operatingBand: 3;
    readonly downlinkCenterHz: 1_840_000_000;
    readonly channelBandwidthHz: typeof LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ;
    readonly duplex: 'fdd';
    readonly physicalCellId: typeof LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID;
    readonly frameNumberModuloFour: 0;
    readonly resourceBlockCount: typeof LTE_BAND3_FDD_20M_RESOURCE_BLOCKS;
    readonly subcarrierSpacingHz: 15_000;
    readonly cyclicPrefix: 'normal';
    readonly antennaPorts: readonly [0];
    readonly sampleRateHz: typeof LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ;
    readonly sampleCount: typeof LTE_BAND3_FDD_20M_FRAME_SAMPLES;
    readonly physicalChannelConfiguration: {
      readonly cfi: 1;
      readonly phichNg: '1/6';
      readonly phichGroupCount: 3;
      readonly phichPerGroup: 2;
      readonly phichSequenceIndices: readonly [0, 4];
      readonly pdcchCount: 10;
      readonly ccesPerPdcch: 2;
      readonly pdcchAvailableRegs: typeof PDCCH_AVAILABLE_REGS;
      readonly pdcchAllocatedRegs: typeof PDCCH_DATA_QUADRUPLETS;
      readonly pdcchNilRegs: 7;
      readonly pdschResourceBlockCount: typeof LTE_BAND3_FDD_20M_RESOURCE_BLOCKS;
      readonly pdschRnti: 0;
    };
    readonly relativeEpreDb: {
      readonly synchronizationSignals: 0;
      readonly pbch: 0;
      readonly pcfich: 0;
      readonly phichBpskSymbol: -3.010;
      readonly phichGroup: 0;
      readonly pdcchReg: 1.195;
      readonly pdschPa: 0;
    };
    readonly qualification: 'fixed-digital-candidate';
    readonly standardsComplianceClaimed: false;
    readonly rfConformanceClaimed: false;
    readonly productCertificationClaimed: false;
    readonly resourceElementCounts: Readonly<Record<LteResourceElementKindName, number>>;
  };
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly kinds: Uint8Array;
    readonly symbolCount: typeof SYMBOLS_PER_FRAME;
    readonly subcarrierCount: typeof LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS;
  };
  readonly timeDomain: SplitComplexSequence & {
    readonly sampleCount: typeof LTE_BAND3_FDD_20M_FRAME_SAMPLES;
  };
}

interface MutableGrid {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
  readonly kinds: Uint8Array;
}

interface ControlReg {
  readonly representativeSubcarrier: number;
  readonly subcarriers: readonly [number, number, number, number];
}

/**
 * Fixed 20 MHz FDD E-TM1.1 digital frame, placed at a legal Band-3 downlink
 * center frequency. The frequency placement is metadata; the returned samples
 * are complex baseband and contain no RF-chain model.
 */
export function generateLteBand3Fdd20mReferenceFrame(): LteBand3Fdd20mReferenceFrame {
  const real = new Float64Array(
    SYMBOLS_PER_FRAME * LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS,
  );
  const imaginary = new Float64Array(real.length);
  const kinds = new Uint8Array(real.length);
  const grid = { real, imaginary, kinds };

  mapCellSpecificReferenceSignals(grid);
  mapSynchronizationSignals(grid);
  mapPbch(grid);
  for (let subframe = 0; subframe < SUBFRAMES_PER_FRAME; subframe += 1) {
    mapControlRegion(grid, subframe);
    mapPdsch(grid, subframe);
  }
  const timeDomain = renderOfdmFrame(real, imaginary);

  return {
    metadata: {
      profileId: LTE_BAND3_FDD_20M_PROFILE,
      fixedWaveform: 'E-TM1.1',
      specification: '3GPP TS 36.141 V19.1.0',
      clause: '6.1.1.1, Table 6.1.1.1-1, and 6.1.2',
      operatingBand: 3,
      downlinkCenterHz: 1_840_000_000,
      channelBandwidthHz: LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ,
      duplex: 'fdd',
      physicalCellId: LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
      frameNumberModuloFour: 0,
      resourceBlockCount: LTE_BAND3_FDD_20M_RESOURCE_BLOCKS,
      subcarrierSpacingHz: 15_000,
      cyclicPrefix: 'normal',
      antennaPorts: [0],
      sampleRateHz: LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ,
      sampleCount: LTE_BAND3_FDD_20M_FRAME_SAMPLES,
      physicalChannelConfiguration: {
        cfi: 1,
        phichNg: '1/6',
        phichGroupCount: 3,
        phichPerGroup: 2,
        phichSequenceIndices: [0, 4],
        pdcchCount: 10,
        ccesPerPdcch: 2,
        pdcchAvailableRegs: PDCCH_AVAILABLE_REGS,
        pdcchAllocatedRegs: PDCCH_DATA_QUADRUPLETS,
        pdcchNilRegs: 7,
        pdschResourceBlockCount: LTE_BAND3_FDD_20M_RESOURCE_BLOCKS,
        pdschRnti: 0,
      },
      relativeEpreDb: {
        synchronizationSignals: 0,
        pbch: 0,
        pcfich: 0,
        phichBpskSymbol: -3.010,
        phichGroup: 0,
        pdcchReg: 1.195,
        pdschPa: 0,
      },
      qualification: 'fixed-digital-candidate',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
      resourceElementCounts: countResourceElementKinds(kinds),
    },
    grid: {
      real,
      imaginary,
      kinds,
      symbolCount: SYMBOLS_PER_FRAME,
      subcarrierCount: LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS,
    },
    timeDomain: {
      ...timeDomain,
      sampleCount: LTE_BAND3_FDD_20M_FRAME_SAMPLES,
    },
  };
}

function resourceIndex(symbol: number, subcarrier: number): number {
  return symbol * LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS + subcarrier;
}

function setElement(
  grid: MutableGrid,
  symbol: number,
  subcarrier: number,
  value: LteComplexSymbol,
  kind: LteResourceElementKind,
): void {
  if (
    symbol < 0
    || symbol >= SYMBOLS_PER_FRAME
    || subcarrier < 0
    || subcarrier >= LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS
  ) {
    throw new RangeError(`Resource element (${subcarrier}, ${symbol}) is outside the LTE grid`);
  }
  const index = resourceIndex(symbol, subcarrier);
  if (grid.kinds[index] !== LTE_RESOURCE_ELEMENT_KIND.unused) {
    throw new Error(`Resource-element collision at (${subcarrier}, ${symbol})`);
  }
  grid.real[index] = value.real;
  grid.imaginary[index] = value.imaginary;
  grid.kinds[index] = kind;
}

function reserveElement(grid: MutableGrid, symbol: number, subcarrier: number): void {
  const index = resourceIndex(symbol, subcarrier);
  if (grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.unused) {
    grid.kinds[index] = LTE_RESOURCE_ELEMENT_KIND.reserved;
  }
}

function mapCellSpecificReferenceSignals(grid: MutableGrid): void {
  for (let slot = 0; slot < SUBFRAMES_PER_FRAME * SLOTS_PER_SUBFRAME; slot += 1) {
    for (const symbolWithinSlot of [0, 4] as const) {
      const cInit = (2 ** 10)
        * (7 * (slot + 1) + symbolWithinSlot + 1)
        * (2 * LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID + 1)
        + 2 * LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID
        + 1;
      const sequence = generateLteGoldSequence(cInit, 440);
      const frequencyOffset = symbolWithinSlot === 0 ? 0 : 3;
      const globalSymbol = slot * SYMBOLS_PER_SLOT + symbolWithinSlot;
      for (let m = 0; m < 2 * LTE_BAND3_FDD_20M_RESOURCE_BLOCKS; m += 1) {
        const sequenceIndex = m + 110 - LTE_BAND3_FDD_20M_RESOURCE_BLOCKS;
        const subcarrier =
          6 * m + ((frequencyOffset + LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID) % 6);
        setElement(grid, globalSymbol, subcarrier, {
          real: QPSK_COMPONENT * (1 - 2 * sequence[2 * sequenceIndex]!),
          imaginary: QPSK_COMPONENT * (1 - 2 * sequence[2 * sequenceIndex + 1]!),
        }, LTE_RESOURCE_ELEMENT_KIND.crs);
      }
    }
  }
}

function mapSynchronizationSignals(grid: MutableGrid): void {
  const pss = generateLtePrimarySynchronizationSignal(
    LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
  );
  mapCentralSynchronizationSequence(grid, 6, pss, LTE_RESOURCE_ELEMENT_KIND.pss);
  mapCentralSynchronizationSequence(grid, 76, pss, LTE_RESOURCE_ELEMENT_KIND.pss);
  mapCentralSynchronizationSequence(
    grid,
    5,
    generateLteSecondarySynchronizationSignal(
      LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
      0,
    ),
    LTE_RESOURCE_ELEMENT_KIND.sss,
  );
  mapCentralSynchronizationSequence(
    grid,
    75,
    generateLteSecondarySynchronizationSignal(
      LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
      5,
    ),
    LTE_RESOURCE_ELEMENT_KIND.sss,
  );
}

function mapCentralSynchronizationSequence(
  grid: MutableGrid,
  symbol: number,
  sequence: SplitComplexSequence,
  kind: LteResourceElementKind,
): void {
  const firstPssSubcarrier = LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS / 2 - 31;
  for (let edge = firstPssSubcarrier - 5; edge < firstPssSubcarrier; edge += 1) {
    reserveElement(grid, symbol, edge);
  }
  for (let index = 0; index < 62; index += 1) {
    setElement(grid, symbol, firstPssSubcarrier + index, {
      real: sequence.real[index]!,
      imaginary: sequence.imaginary[index]!,
    }, kind);
  }
  for (let edge = firstPssSubcarrier + 62; edge < firstPssSubcarrier + 67; edge += 1) {
    reserveElement(grid, symbol, edge);
  }
}

function mapPbch(grid: MutableGrid): void {
  const scrambledBits = generateLteGoldSequence(
    LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
    480,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(scrambledBits));
  const firstCentralSubcarrier = LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS / 2 - 36;
  const reservedResidueA = LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID % 6;
  const reservedResidueB = (reservedResidueA + 3) % 6;
  let symbolIndex = 0;
  for (let l = 0; l < 4; l += 1) {
    const globalSymbol = SYMBOLS_PER_SLOT + l;
    for (
      let subcarrier = firstCentralSubcarrier;
      subcarrier < firstCentralSubcarrier + 72;
      subcarrier += 1
    ) {
      const residue = subcarrier % 6;
      if (
        (l === 0 || l === 1)
        && (residue === reservedResidueA || residue === reservedResidueB)
      ) {
        reserveElement(grid, globalSymbol, subcarrier);
      } else {
        setElement(
          grid,
          globalSymbol,
          subcarrier,
          symbols[symbolIndex]!,
          LTE_RESOURCE_ELEMENT_KIND.pbch,
        );
        symbolIndex += 1;
      }
    }
  }
  if (symbolIndex !== 240) {
    throw new Error(`PBCH mapping produced ${symbolIndex} symbols instead of 240`);
  }
}

function mapControlRegion(grid: MutableGrid, subframe: number): void {
  const globalSymbol = subframe * SYMBOLS_PER_SUBFRAME;
  const allRegs = controlRegs();
  for (
    let subcarrier = 0;
    subcarrier < LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS;
    subcarrier += 1
  ) {
    const residue = subcarrier % 6;
    if (
      residue === LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID % 6
      || residue === (LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID + 3) % 6
    ) {
      reserveElement(grid, globalSymbol, subcarrier);
    }
  }

  const pcfichRepresentatives = new Set<number>();
  const firstRepresentative =
    6 * (LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID
      % (2 * LTE_BAND3_FDD_20M_RESOURCE_BLOCKS));
  for (let index = 0; index < 4; index += 1) {
    pcfichRepresentatives.add(
      (
        firstRepresentative
        + 6 * Math.floor(index * LTE_BAND3_FDD_20M_RESOURCE_BLOCKS / 2)
      ) % LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS,
    );
  }
  const pcfichRegs = allRegs.filter(
    (reg) => pcfichRepresentatives.has(reg.representativeSubcarrier),
  );
  if (pcfichRegs.length !== 4) throw new Error('PCFICH mapping did not select four REGs');
  mapPcfich(grid, subframe, globalSymbol, pcfichRegs);

  const regsAfterPcfich = allRegs.filter(
    (reg) => !pcfichRepresentatives.has(reg.representativeSubcarrier),
  );
  const phichRegIndicesByGroup = [0, 1, 2].map((mappingUnit) =>
    [0, 1, 2].map((quadruplet) =>
      (
        LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID
        + mappingUnit
        + Math.floor(quadruplet * regsAfterPcfich.length / 3)
      ) % regsAfterPcfich.length));
  const phichRepresentatives = new Set<number>();
  for (const indices of phichRegIndicesByGroup) {
    for (const index of indices) {
      phichRepresentatives.add(regsAfterPcfich[index]!.representativeSubcarrier);
    }
  }
  if (phichRepresentatives.size !== 9) {
    throw new Error('PHICH mapping did not select nine unique REGs');
  }
  mapPhich(grid, subframe, globalSymbol, regsAfterPcfich, phichRegIndicesByGroup);

  const pdcchRegs = regsAfterPcfich.filter(
    (reg) => !phichRepresentatives.has(reg.representativeSubcarrier),
  );
  if (pdcchRegs.length !== PDCCH_AVAILABLE_REGS) {
    throw new Error(
      `PDCCH mapping found ${pdcchRegs.length} REGs instead of ${PDCCH_AVAILABLE_REGS}`,
    );
  }
  mapPdcch(grid, subframe, globalSymbol, pdcchRegs);
}

function controlRegs(): readonly ControlReg[] {
  const regs: ControlReg[] = [];
  const excludedA = LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID % 6;
  const excludedB = (excludedA + 3) % 6;
  for (
    let representativeSubcarrier = 0;
    representativeSubcarrier < LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS;
    representativeSubcarrier += 6
  ) {
    const available: number[] = [];
    for (let offset = 0; offset < 6; offset += 1) {
      if (offset !== excludedA && offset !== excludedB) {
        available.push(representativeSubcarrier + offset);
      }
    }
    regs.push({
      representativeSubcarrier,
      subcarriers: [available[0]!, available[1]!, available[2]!, available[3]!],
    });
  }
  return regs;
}

function mapPcfich(
  grid: MutableGrid,
  subframe: number,
  globalSymbol: number,
  regs: readonly ControlReg[],
): void {
  const cInit = (subframe + 1)
    * (2 * LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID + 1)
    * (2 ** 9)
    + LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID;
  const scrambling = generateLteGoldSequence(cInit, PCFICH_CFI_ONE_BITS.length);
  const scrambled = Uint8Array.from(
    PCFICH_CFI_ONE_BITS,
    (bit, index) => bit ^ scrambling[index]!,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(scrambled));
  for (let regIndex = 0; regIndex < regs.length; regIndex += 1) {
    for (let element = 0; element < 4; element += 1) {
      setElement(
        grid,
        globalSymbol,
        regs[regIndex]!.subcarriers[element]!,
        symbols[4 * regIndex + element]!,
        LTE_RESOURCE_ELEMENT_KIND.pcfich,
      );
    }
  }
}

function mapPhich(
  grid: MutableGrid,
  subframe: number,
  globalSymbol: number,
  regsAfterPcfich: readonly ControlReg[],
  regIndicesByGroup: readonly (readonly number[])[],
): void {
  const cInit = (subframe + 1)
    * (2 * LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID + 1)
    * (2 ** 9)
    + LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID;
  const scrambling = generateLteGoldSequence(cInit, 12);
  for (const regIndices of regIndicesByGroup) {
    const groupSymbols: LteComplexSymbol[] = [];
    for (let index = 0; index < 12; index += 1) {
      const scramblingSign = 1 - 2 * scrambling[index]!;
      const bpskReal = QPSK_COMPONENT * scramblingSign;
      const bpskImaginary = QPSK_COMPONENT * scramblingSign;
      let real = 0;
      let imaginary = 0;
      for (const sequenceIndex of [0, 4] as const) {
        const orthogonal = PHICH_ORTHOGONAL_SEQUENCES[sequenceIndex][index % 4]!;
        real += QPSK_COMPONENT
          * (bpskReal * orthogonal.real - bpskImaginary * orthogonal.imaginary);
        imaginary += QPSK_COMPONENT
          * (bpskReal * orthogonal.imaginary + bpskImaginary * orthogonal.real);
      }
      groupSymbols.push({ real, imaginary });
    }
    const transmitSymbols = applyLteSingleAntennaPortIdentityStage(groupSymbols);
    for (let quadruplet = 0; quadruplet < 3; quadruplet += 1) {
      const reg = regsAfterPcfich[regIndices[quadruplet]!]!;
      for (let element = 0; element < 4; element += 1) {
        setElement(
          grid,
          globalSymbol,
          reg.subcarriers[element]!,
          transmitSymbols[4 * quadruplet + element]!,
          LTE_RESOURCE_ELEMENT_KIND.phich,
        );
      }
    }
  }
}

function mapPdcch(
  grid: MutableGrid,
  subframe: number,
  globalSymbol: number,
  regs: readonly ControlReg[],
): void {
  const scrambling = generateLteGoldSequence(
    subframe * (2 ** 9) + LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
    PDCCH_DATA_QUADRUPLETS * 8,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(
    qpskSymbols(scrambling, PDCCH_AMPLITUDE),
  );
  const interleavedQuadruplets = interleavePdcchQuadrupletIndices(
    PDCCH_AVAILABLE_REGS,
  );
  let nilRegCount = 0;
  for (let outputIndex = 0; outputIndex < regs.length; outputIndex += 1) {
    const reg = regs[outputIndex]!;
    const inputQuadruplet = interleavedQuadruplets[
      (outputIndex + LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID)
      % interleavedQuadruplets.length
    ]!;
    if (inputQuadruplet >= PDCCH_DATA_QUADRUPLETS) {
      nilRegCount += 1;
      for (const subcarrier of reg.subcarriers) {
        reserveElement(grid, globalSymbol, subcarrier);
      }
      continue;
    }
    for (let element = 0; element < 4; element += 1) {
      setElement(
        grid,
        globalSymbol,
        reg.subcarriers[element]!,
        symbols[4 * inputQuadruplet + element]!,
        LTE_RESOURCE_ELEMENT_KIND.pdcch,
      );
    }
  }
  if (nilRegCount !== 7) {
    throw new Error(`PDCCH mapping retained ${nilRegCount} NIL REGs instead of 7`);
  }
}

function interleavePdcchQuadrupletIndices(count: number): readonly number[] {
  const columnCount = 32;
  const rowCount = Math.ceil(count / columnCount);
  const dummyCount = rowCount * columnCount - count;
  const matrix: Array<number | null> = [
    ...Array.from({ length: dummyCount }, () => null),
    ...Array.from({ length: count }, (_value, index) => index),
  ];
  const output: number[] = [];
  for (const originalColumn of PDCCH_INTER_COLUMN_PERMUTATION) {
    for (let row = 0; row < rowCount; row += 1) {
      const value = matrix[row * columnCount + originalColumn];
      if (value !== null && value !== undefined) output.push(value);
    }
  }
  if (output.length !== count) {
    throw new Error('PDCCH sub-block interleaver lost quadruplets');
  }
  return output;
}

function mapPdsch(grid: MutableGrid, subframe: number): void {
  const startSymbol = subframe * SYMBOLS_PER_SUBFRAME;
  const eligibleIndices: number[] = [];
  for (
    let symbol = startSymbol + 1;
    symbol < startSymbol + SYMBOLS_PER_SUBFRAME;
    symbol += 1
  ) {
    for (
      let subcarrier = 0;
      subcarrier < LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS;
      subcarrier += 1
    ) {
      const index = resourceIndex(symbol, subcarrier);
      if (grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.unused) {
        eligibleIndices.push(index);
      }
    }
  }
  const scrambling = generateLteGoldSequence(
    subframe * (2 ** 9) + LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
    2 * eligibleIndices.length,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(scrambling));
  for (let index = 0; index < eligibleIndices.length; index += 1) {
    const gridIndex = eligibleIndices[index]!;
    grid.real[gridIndex] = symbols[index]!.real;
    grid.imaginary[gridIndex] = symbols[index]!.imaginary;
    grid.kinds[gridIndex] = LTE_RESOURCE_ELEMENT_KIND.pdsch;
  }
}

function qpskSymbols(
  bits: Uint8Array,
  amplitude = 1,
): readonly LteComplexSymbol[] {
  if (bits.length % 2 !== 0) {
    throw new RangeError('QPSK mapping requires an even bit count');
  }
  const symbols: LteComplexSymbol[] = [];
  for (let index = 0; index < bits.length; index += 2) {
    symbols.push({
      real: amplitude * QPSK_COMPONENT * (1 - 2 * bits[index]!),
      imaginary: amplitude * QPSK_COMPONENT * (1 - 2 * bits[index + 1]!),
    });
  }
  return symbols;
}

function renderOfdmFrame(
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): SplitComplexSequence {
  const real = new Float64Array(LTE_BAND3_FDD_20M_FRAME_SAMPLES);
  const imaginary = new Float64Array(LTE_BAND3_FDD_20M_FRAME_SAMPLES);
  let sampleOffset = 0;
  for (let symbol = 0; symbol < SYMBOLS_PER_FRAME; symbol += 1) {
    const symbolReal = new Float64Array(LTE_BAND3_FDD_20M_FFT_SIZE);
    const symbolImaginary = new Float64Array(LTE_BAND3_FDD_20M_FFT_SIZE);
    const gridOffset = symbol * LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS;
    for (
      let subcarrier = 0;
      subcarrier < LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS;
      subcarrier += 1
    ) {
      const fftBin = subcarrier < LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS / 2
        ? LTE_BAND3_FDD_20M_FFT_SIZE
          - LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS / 2
          + subcarrier
        : subcarrier - LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS / 2 + 1;
      symbolReal[fftBin] = gridReal[gridOffset + subcarrier]!;
      symbolImaginary[fftBin] = -gridImaginary[gridOffset + subcarrier]!;
    }
    fftForwardUnscaledInPlace(symbolReal, symbolImaginary);
    for (let sample = 0; sample < LTE_BAND3_FDD_20M_FFT_SIZE; sample += 1) {
      symbolReal[sample] =
        symbolReal[sample]! / LTE_BAND3_FDD_20M_FFT_SIZE;
      symbolImaginary[sample] =
        -symbolImaginary[sample]! / LTE_BAND3_FDD_20M_FFT_SIZE;
    }
    const cyclicPrefixLength =
      symbol % SYMBOLS_PER_SLOT === 0
        ? FIRST_SYMBOL_CP_SAMPLES
        : OTHER_SYMBOL_CP_SAMPLES;
    const prefixStart = LTE_BAND3_FDD_20M_FFT_SIZE - cyclicPrefixLength;
    real.set(symbolReal.subarray(prefixStart), sampleOffset);
    imaginary.set(symbolImaginary.subarray(prefixStart), sampleOffset);
    sampleOffset += cyclicPrefixLength;
    real.set(symbolReal, sampleOffset);
    imaginary.set(symbolImaginary, sampleOffset);
    sampleOffset += LTE_BAND3_FDD_20M_FFT_SIZE;
  }
  if (sampleOffset !== LTE_BAND3_FDD_20M_FRAME_SAMPLES) {
    throw new Error(
      `OFDM renderer produced ${sampleOffset} samples instead of `
      + LTE_BAND3_FDD_20M_FRAME_SAMPLES,
    );
  }
  return { real, imaginary };
}

function countResourceElementKinds(
  kinds: Uint8Array,
): Readonly<Record<LteResourceElementKindName, number>> {
  const counts: Record<LteResourceElementKindName, number> = {
    unused: 0,
    crs: 0,
    pss: 0,
    sss: 0,
    pbch: 0,
    pcfich: 0,
    phich: 0,
    pdcch: 0,
    pdsch: 0,
    reserved: 0,
  };
  const names = Object.keys(LTE_RESOURCE_ELEMENT_KIND) as LteResourceElementKindName[];
  const nameByKind = new Map<number, LteResourceElementKindName>(
    names.map((name) => [LTE_RESOURCE_ELEMENT_KIND[name], name] as const),
  );
  for (const kind of kinds) {
    const name = nameByKind.get(kind);
    if (name === undefined) throw new Error(`Unknown LTE resource-element kind ${kind}`);
    counts[name] += 1;
  }
  return Object.freeze(counts);
}
