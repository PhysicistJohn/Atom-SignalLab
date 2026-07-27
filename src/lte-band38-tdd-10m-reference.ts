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

export const LTE_BAND38_TDD_10M_PROFILE = 'lte-band38-tdd-10m' as const;
export const LTE_BAND38_TDD_10M_CHANNEL_BANDWIDTH_HZ = 10_000_000 as const;
export const LTE_BAND38_TDD_10M_SAMPLE_RATE_HZ = 15_360_000 as const;
export const LTE_BAND38_TDD_10M_RESOURCE_BLOCKS = 50 as const;
export const LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS = 600 as const;
export const LTE_BAND38_TDD_10M_FFT_SIZE = 1_024 as const;
export const LTE_BAND38_TDD_10M_FRAME_SAMPLES = 153_600 as const;
export const LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID = 1 as const;
export const LTE_BAND38_TDD_10M_REFERENCE_IDENTITIES = Object.freeze({
  gridCf64leSha256:
    'd3b9953d87987d209c65081efdb6acca211e5c06af42a50021fad09f1888718c',
  timeCf64leSha256:
    'c7a28fa76fb489f4ff57516a1941058bdce9273bcdaa56eaa816d01d663957a2',
} as const);

const SUBFRAMES_PER_FRAME = 10;
const SYMBOLS_PER_SLOT = 7;
const SYMBOLS_PER_SUBFRAME = 14;
const SYMBOLS_PER_FRAME = 140;
const FIRST_SYMBOL_CP_SAMPLES = 80;
const OTHER_SYMBOL_CP_SAMPLES = 72;
const DWPTS_SYMBOLS = 10;
const QPSK_COMPONENT = Math.SQRT1_2;
const TDD_DIRECTIONS = 'DSUUUDSUUU' as const;
const TDD_MI = Object.freeze([2, 1, 0, 0, 0, 2, 1, 0, 0, 0] as const);

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

export interface LteBand38Tdd10mReferenceFrame {
  readonly metadata: {
    readonly profileId: typeof LTE_BAND38_TDD_10M_PROFILE;
    readonly fixedWaveform: 'TS-36.211-valid-downlink-physical-input-fixture';
    readonly specifications: readonly [
      '3GPP TS 36.211 V19.3.0',
      '3GPP TS 36.213 V19.3.0',
    ];
    readonly clauses: readonly [
      'TS 36.211 4.2 Tables 4.2-1/4.2-2 and clauses 6.2-6.12',
      'TS 36.213 6.9 Table 6.9-1',
    ];
    readonly operatingBand: 38;
    readonly downlinkCenterHz: 2_595_000_000;
    readonly channelBandwidthHz: typeof LTE_BAND38_TDD_10M_CHANNEL_BANDWIDTH_HZ;
    readonly duplex: 'tdd';
    readonly ulDlConfiguration: 0;
    readonly specialSubframeConfiguration: 7;
    readonly subframeDirections: typeof TDD_DIRECTIONS;
    readonly dwPtsSymbols: typeof DWPTS_SYMBOLS;
    readonly guardPeriodSymbols: 2;
    readonly upPtsSymbols: 2;
    readonly srsUpPtsAdd: false;
    readonly miBySubframe: typeof TDD_MI;
    readonly physicalCellId: typeof LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID;
    readonly resourceBlockCount: typeof LTE_BAND38_TDD_10M_RESOURCE_BLOCKS;
    readonly subcarrierSpacingHz: 15_000;
    readonly cyclicPrefix: 'normal';
    readonly sampleRateHz: typeof LTE_BAND38_TDD_10M_SAMPLE_RATE_HZ;
    readonly sampleCount: typeof LTE_BAND38_TDD_10M_FRAME_SAMPLES;
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
    readonly subcarrierCount: typeof LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
  };
  readonly timeDomain: SplitComplexSequence & {
    readonly sampleCount: typeof LTE_BAND38_TDD_10M_FRAME_SAMPLES;
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
 * Fixed, downlink-only Band-38 frame-structure-type-2 artifact. It selects
 * UL/DL config 0 and normal-CP SSP config 7 explicitly. Uplink subframes,
 * GP, and UpPTS are zero because this API returns only the eNB downlink port.
 */
export function generateLteBand38Tdd10mReferenceFrame(): LteBand38Tdd10mReferenceFrame {
  const real = new Float64Array(
    SYMBOLS_PER_FRAME * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS,
  );
  const imaginary = new Float64Array(real.length);
  const kinds = new Uint8Array(real.length);
  const grid = { real, imaginary, kinds };

  mapCellSpecificReferenceSignals(grid);
  mapSynchronizationSignals(grid);
  mapPbch(grid);
  for (let subframe = 0; subframe < SUBFRAMES_PER_FRAME; subframe += 1) {
    if (TDD_DIRECTIONS[subframe] !== 'U') {
      const mi = TDD_MI[subframe]!;
      if (mi === 0) {
        throw new Error(`TDD control multiplier is zero in active subframe ${subframe}`);
      }
      mapControlRegion(grid, subframe, mi);
      mapPdsch(grid, subframe);
    }
  }
  const timeDomain = renderOfdmFrame(real, imaginary);
  return {
    metadata: {
      profileId: LTE_BAND38_TDD_10M_PROFILE,
      fixedWaveform: 'TS-36.211-valid-downlink-physical-input-fixture',
      specifications: [
        '3GPP TS 36.211 V19.3.0',
        '3GPP TS 36.213 V19.3.0',
      ],
      clauses: [
        'TS 36.211 4.2 Tables 4.2-1/4.2-2 and clauses 6.2-6.12',
        'TS 36.213 6.9 Table 6.9-1',
      ],
      operatingBand: 38,
      downlinkCenterHz: 2_595_000_000,
      channelBandwidthHz: LTE_BAND38_TDD_10M_CHANNEL_BANDWIDTH_HZ,
      duplex: 'tdd',
      ulDlConfiguration: 0,
      specialSubframeConfiguration: 7,
      subframeDirections: TDD_DIRECTIONS,
      dwPtsSymbols: DWPTS_SYMBOLS,
      guardPeriodSymbols: 2,
      upPtsSymbols: 2,
      srsUpPtsAdd: false,
      miBySubframe: TDD_MI,
      physicalCellId: LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID,
      resourceBlockCount: LTE_BAND38_TDD_10M_RESOURCE_BLOCKS,
      subcarrierSpacingHz: 15_000,
      cyclicPrefix: 'normal',
      sampleRateHz: LTE_BAND38_TDD_10M_SAMPLE_RATE_HZ,
      sampleCount: LTE_BAND38_TDD_10M_FRAME_SAMPLES,
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
      subcarrierCount: LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS,
    },
    timeDomain: {
      ...timeDomain,
      sampleCount: LTE_BAND38_TDD_10M_FRAME_SAMPLES,
    },
  };
}

function activeSymbolCount(subframe: number): number {
  const direction = TDD_DIRECTIONS[subframe];
  return direction === 'D' ? SYMBOLS_PER_SUBFRAME : direction === 'S' ? DWPTS_SYMBOLS : 0;
}

function resourceIndex(symbol: number, subcarrier: number): number {
  return symbol * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS + subcarrier;
}

function setElement(
  grid: MutableGrid,
  symbol: number,
  subcarrier: number,
  value: LteComplexSymbol,
  kind: LteResourceElementKind,
): void {
  const index = resourceIndex(symbol, subcarrier);
  if (
    symbol < 0
    || symbol >= SYMBOLS_PER_FRAME
    || subcarrier < 0
    || subcarrier >= LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS
  ) {
    throw new RangeError(`Resource element (${subcarrier}, ${symbol}) is outside the LTE grid`);
  }
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
  for (let subframe = 0; subframe < SUBFRAMES_PER_FRAME; subframe += 1) {
    const activeSymbols = activeSymbolCount(subframe);
    if (activeSymbols === 0) continue;
    const referenceSymbols = activeSymbols === SYMBOLS_PER_SUBFRAME
      ? [0, 4, 7, 11]
      : [0, 4, 7];
    for (const symbolWithinSubframe of referenceSymbols) {
      const slot = 2 * subframe + Math.floor(symbolWithinSubframe / SYMBOLS_PER_SLOT);
      const symbolWithinSlot = symbolWithinSubframe % SYMBOLS_PER_SLOT;
      const cInit = (2 ** 10)
        * (7 * (slot + 1) + symbolWithinSlot + 1)
        * (2 * LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID + 1)
        + 2 * LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID
        + 1;
      const sequence = generateLteGoldSequence(cInit, 440);
      const frequencyOffset = symbolWithinSlot === 0 ? 0 : 3;
      const globalSymbol = subframe * SYMBOLS_PER_SUBFRAME + symbolWithinSubframe;
      for (let m = 0; m < 2 * LTE_BAND38_TDD_10M_RESOURCE_BLOCKS; m += 1) {
        const sequenceIndex = m + 110 - LTE_BAND38_TDD_10M_RESOURCE_BLOCKS;
        const subcarrier =
          6 * m + ((frequencyOffset + LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID) % 6);
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
    LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID,
  );
  for (const subframe of [1, 6] as const) {
    mapCentralSynchronizationSequence(
      grid,
      subframe * SYMBOLS_PER_SUBFRAME + 2,
      pss,
      LTE_RESOURCE_ELEMENT_KIND.pss,
    );
  }
  for (const subframe of [0, 5] as const) {
    mapCentralSynchronizationSequence(
      grid,
      subframe * SYMBOLS_PER_SUBFRAME + 13,
      generateLteSecondarySynchronizationSignal(
        LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID,
        subframe,
      ),
      LTE_RESOURCE_ELEMENT_KIND.sss,
    );
  }
}

function mapCentralSynchronizationSequence(
  grid: MutableGrid,
  symbol: number,
  sequence: SplitComplexSequence,
  kind: LteResourceElementKind,
): void {
  const firstSubcarrier = LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS / 2 - 31;
  for (let edge = firstSubcarrier - 5; edge < firstSubcarrier; edge += 1) {
    reserveElement(grid, symbol, edge);
  }
  for (let index = 0; index < 62; index += 1) {
    setElement(grid, symbol, firstSubcarrier + index, {
      real: sequence.real[index]!,
      imaginary: sequence.imaginary[index]!,
    }, kind);
  }
  for (let edge = firstSubcarrier + 62; edge < firstSubcarrier + 67; edge += 1) {
    reserveElement(grid, symbol, edge);
  }
}

function mapPbch(grid: MutableGrid): void {
  const bits = generateLteGoldSequence(LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID, 480);
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(bits));
  const firstSubcarrier = LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS / 2 - 36;
  const residueA = LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID % 6;
  const residueB = (residueA + 3) % 6;
  let symbolIndex = 0;
  for (let l = 0; l < 4; l += 1) {
    const globalSymbol = SYMBOLS_PER_SLOT + l;
    for (
      let subcarrier = firstSubcarrier;
      subcarrier < firstSubcarrier + 72;
      subcarrier += 1
    ) {
      const residue = subcarrier % 6;
      if ((l < 2) && (residue === residueA || residue === residueB)) {
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
  if (symbolIndex !== 240) throw new Error('PBCH did not map 240 symbols');
}

function mapControlRegion(grid: MutableGrid, subframe: number, mi: 1 | 2): void {
  const globalSymbol = subframe * SYMBOLS_PER_SUBFRAME;
  const allRegs = controlRegs();
  for (
    let subcarrier = 0;
    subcarrier < LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
    subcarrier += 1
  ) {
    const residue = subcarrier % 6;
    if (
      residue === LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID % 6
      || residue === (LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID + 3) % 6
    ) {
      reserveElement(grid, globalSymbol, subcarrier);
    }
  }

  const pcfichRepresentatives = new Set<number>();
  const firstRepresentative =
    6 * (LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID
      % (2 * LTE_BAND38_TDD_10M_RESOURCE_BLOCKS));
  for (let index = 0; index < 4; index += 1) {
    pcfichRepresentatives.add(
      (
        firstRepresentative
        + 6 * Math.floor(index * LTE_BAND38_TDD_10M_RESOURCE_BLOCKS / 2)
      ) % LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS,
    );
  }
  const pcfichRegs = allRegs.filter(
    (reg) => pcfichRepresentatives.has(reg.representativeSubcarrier),
  );
  mapPcfich(grid, subframe, globalSymbol, pcfichRegs);

  const afterPcfich = allRegs.filter(
    (reg) => !pcfichRepresentatives.has(reg.representativeSubcarrier),
  );
  const phichGroupCount = 2 * mi;
  const phichIndices = Array.from({ length: phichGroupCount }, (_value, group) =>
    [0, 1, 2].map((quadruplet) =>
      (
        LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID
        + group
        + Math.floor(quadruplet * afterPcfich.length / 3)
      ) % afterPcfich.length));
  const phichRepresentatives = new Set<number>();
  for (const group of phichIndices) {
    for (const index of group) {
      phichRepresentatives.add(afterPcfich[index]!.representativeSubcarrier);
    }
  }
  if (phichRepresentatives.size !== phichGroupCount * 3) {
    throw new Error('PHICH REG mapping collided');
  }
  mapPhich(grid, subframe, globalSymbol, afterPcfich, phichIndices);

  const pdcchRegs = afterPcfich.filter(
    (reg) => !phichRepresentatives.has(reg.representativeSubcarrier),
  );
  const usefulRegs = Math.floor(pdcchRegs.length / 9) * 9;
  mapPdcch(grid, subframe, globalSymbol, pdcchRegs, usefulRegs);
}

function controlRegs(): readonly ControlReg[] {
  const regs: ControlReg[] = [];
  const excludedA = LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID % 6;
  const excludedB = (excludedA + 3) % 6;
  for (
    let representativeSubcarrier = 0;
    representativeSubcarrier < LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
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
    * (2 * LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID + 1)
    * (2 ** 9)
    + LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID;
  const scrambling = generateLteGoldSequence(cInit, PCFICH_CFI_ONE_BITS.length);
  const bits = Uint8Array.from(
    PCFICH_CFI_ONE_BITS,
    (bit, index) => bit ^ scrambling[index]!,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(bits));
  for (let reg = 0; reg < 4; reg += 1) {
    for (let element = 0; element < 4; element += 1) {
      setElement(
        grid,
        globalSymbol,
        regs[reg]!.subcarriers[element]!,
        symbols[4 * reg + element]!,
        LTE_RESOURCE_ELEMENT_KIND.pcfich,
      );
    }
  }
}

function mapPhich(
  grid: MutableGrid,
  subframe: number,
  globalSymbol: number,
  afterPcfich: readonly ControlReg[],
  groupIndices: readonly (readonly number[])[],
): void {
  const cInit = (subframe + 1)
    * (2 * LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID + 1)
    * (2 ** 9)
    + LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID;
  const scrambling = generateLteGoldSequence(cInit, 12);
  for (const indices of groupIndices) {
    const groupSymbols: LteComplexSymbol[] = [];
    for (let index = 0; index < 12; index += 1) {
      const sign = 1 - 2 * scrambling[index]!;
      const bpskReal = QPSK_COMPONENT * sign;
      const bpskImaginary = QPSK_COMPONENT * sign;
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
    const symbols = applyLteSingleAntennaPortIdentityStage(groupSymbols);
    for (let quadruplet = 0; quadruplet < 3; quadruplet += 1) {
      const reg = afterPcfich[indices[quadruplet]!]!;
      for (let element = 0; element < 4; element += 1) {
        setElement(
          grid,
          globalSymbol,
          reg.subcarriers[element]!,
          symbols[4 * quadruplet + element]!,
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
  usefulRegs: number,
): void {
  const bits = generateLteGoldSequence(
    subframe * (2 ** 9) + LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID,
    usefulRegs * 8,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(bits));
  const interleaved = interleavePdcchQuadrupletIndices(regs.length);
  let nilRegs = 0;
  for (let output = 0; output < regs.length; output += 1) {
    const input = interleaved[
      (output + LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID) % interleaved.length
    ]!;
    const reg = regs[output]!;
    if (input >= usefulRegs) {
      nilRegs += 1;
      for (const subcarrier of reg.subcarriers) {
        reserveElement(grid, globalSymbol, subcarrier);
      }
    } else {
      for (let element = 0; element < 4; element += 1) {
        setElement(
          grid,
          globalSymbol,
          reg.subcarriers[element]!,
          symbols[4 * input + element]!,
          LTE_RESOURCE_ELEMENT_KIND.pdcch,
        );
      }
    }
  }
  if (nilRegs !== regs.length - usefulRegs) {
    throw new Error('PDCCH NIL mapping changed');
  }
}

function interleavePdcchQuadrupletIndices(count: number): readonly number[] {
  const columns = 32;
  const rows = Math.ceil(count / columns);
  const dummy = rows * columns - count;
  const matrix: Array<number | null> = [
    ...Array.from({ length: dummy }, () => null),
    ...Array.from({ length: count }, (_value, index) => index),
  ];
  const output: number[] = [];
  for (const column of PDCCH_INTER_COLUMN_PERMUTATION) {
    for (let row = 0; row < rows; row += 1) {
      const value = matrix[row * columns + column];
      if (value !== null && value !== undefined) output.push(value);
    }
  }
  return output;
}

function mapPdsch(grid: MutableGrid, subframe: number): void {
  const firstSymbol = subframe * SYMBOLS_PER_SUBFRAME;
  const endSymbol = firstSymbol + activeSymbolCount(subframe);
  const indices: number[] = [];
  for (let symbol = firstSymbol + 1; symbol < endSymbol; symbol += 1) {
    for (
      let subcarrier = 0;
      subcarrier < LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
      subcarrier += 1
    ) {
      const index = resourceIndex(symbol, subcarrier);
      if (grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.unused) {
        indices.push(index);
      }
    }
  }
  const bits = generateLteGoldSequence(
    subframe * (2 ** 9) + LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID,
    indices.length * 2,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(bits));
  for (let index = 0; index < indices.length; index += 1) {
    const gridIndex = indices[index]!;
    grid.real[gridIndex] = symbols[index]!.real;
    grid.imaginary[gridIndex] = symbols[index]!.imaginary;
    grid.kinds[gridIndex] = LTE_RESOURCE_ELEMENT_KIND.pdsch;
  }
}

function qpskSymbols(bits: Uint8Array): readonly LteComplexSymbol[] {
  if (bits.length % 2 !== 0) throw new RangeError('QPSK needs an even bit count');
  const symbols: LteComplexSymbol[] = [];
  for (let index = 0; index < bits.length; index += 2) {
    symbols.push({
      real: QPSK_COMPONENT * (1 - 2 * bits[index]!),
      imaginary: QPSK_COMPONENT * (1 - 2 * bits[index + 1]!),
    });
  }
  return symbols;
}

function renderOfdmFrame(
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): SplitComplexSequence {
  const real = new Float64Array(LTE_BAND38_TDD_10M_FRAME_SAMPLES);
  const imaginary = new Float64Array(LTE_BAND38_TDD_10M_FRAME_SAMPLES);
  let output = 0;
  for (let symbol = 0; symbol < SYMBOLS_PER_FRAME; symbol += 1) {
    const symbolReal = new Float64Array(LTE_BAND38_TDD_10M_FFT_SIZE);
    const symbolImaginary = new Float64Array(LTE_BAND38_TDD_10M_FFT_SIZE);
    const gridOffset = symbol * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
    for (
      let subcarrier = 0;
      subcarrier < LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
      subcarrier += 1
    ) {
      const bin = subcarrier < LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS / 2
        ? LTE_BAND38_TDD_10M_FFT_SIZE
          - LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS / 2
          + subcarrier
        : subcarrier - LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS / 2 + 1;
      symbolReal[bin] = gridReal[gridOffset + subcarrier]!;
      symbolImaginary[bin] = -gridImaginary[gridOffset + subcarrier]!;
    }
    fftForwardUnscaledInPlace(symbolReal, symbolImaginary);
    for (let sample = 0; sample < LTE_BAND38_TDD_10M_FFT_SIZE; sample += 1) {
      symbolReal[sample] =
        symbolReal[sample]! / LTE_BAND38_TDD_10M_FFT_SIZE;
      symbolImaginary[sample] =
        -symbolImaginary[sample]! / LTE_BAND38_TDD_10M_FFT_SIZE;
    }
    const cp = symbol % SYMBOLS_PER_SLOT === 0
      ? FIRST_SYMBOL_CP_SAMPLES
      : OTHER_SYMBOL_CP_SAMPLES;
    real.set(symbolReal.subarray(LTE_BAND38_TDD_10M_FFT_SIZE - cp), output);
    imaginary.set(
      symbolImaginary.subarray(LTE_BAND38_TDD_10M_FFT_SIZE - cp),
      output,
    );
    output += cp;
    real.set(symbolReal, output);
    imaginary.set(symbolImaginary, output);
    output += LTE_BAND38_TDD_10M_FFT_SIZE;
  }
  if (output !== LTE_BAND38_TDD_10M_FRAME_SAMPLES) {
    throw new Error('TDD OFDM frame geometry changed');
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
  const byKind = new Map<number, LteResourceElementKindName>(
    names.map((name) => [LTE_RESOURCE_ELEMENT_KIND[name], name]),
  );
  for (const kind of kinds) {
    const name = byKind.get(kind);
    if (name === undefined) throw new Error(`Unknown LTE RE kind ${kind}`);
    counts[name] += 1;
  }
  return Object.freeze(counts);
}
