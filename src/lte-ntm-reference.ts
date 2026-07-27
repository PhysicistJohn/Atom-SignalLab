import { fftForwardUnscaledInPlace } from '@atomos/dsp';
import {
  generateLteGoldSequence,
  type SplitComplexSequence,
} from './lte-etm1-reference.js';

export const LTE_NTM_PROFILES = Object.freeze([
  'lte-ntm',
  'lte-nbiot-guard-isolated-component',
  'lte-nbiot-inband-isolated-component',
] as const);
export type LteNtmProfile = (typeof LTE_NTM_PROFILES)[number];

export const LTE_NTM_SAMPLE_RATE_HZ = 1_920_000 as const;
export const LTE_NTM_NARROWBAND_GRID_HZ = 180_000 as const;
export const LTE_NTM_ACTIVE_SUBCARRIERS = 12 as const;
export const LTE_NTM_FFT_SIZE = 128 as const;
export const LTE_NTM_FRAME_SAMPLES = 19_200 as const;
export const LTE_NTM_CELL_ID = 103 as const;
export const LTE_NTM_HOST_CELL_ID = 1 as const;

export const LTE_NTM_REFERENCE_IDENTITIES = Object.freeze({
  'lte-ntm': Object.freeze({
    gridCf64leSha256:
      '53d00ddff5eb67c3de5581232af49cb0d674e7430f67c2064ab0c6fb779cf7ef',
    timeCf64leSha256:
      'aa48d18506ef4330c7230ece9c3b644455ff0eb60d92389e1cecb11bfc3b6b7f',
  }),
  'lte-nbiot-guard-isolated-component': Object.freeze({
    gridCf64leSha256:
      '53d00ddff5eb67c3de5581232af49cb0d674e7430f67c2064ab0c6fb779cf7ef',
    timeCf64leSha256:
      'aa48d18506ef4330c7230ece9c3b644455ff0eb60d92389e1cecb11bfc3b6b7f',
  }),
  'lte-nbiot-inband-isolated-component': Object.freeze({
    gridCf64leSha256:
      'a74bd00f7b68e319df6e8e0f04415e99ec6802aaf4ae8a5d36ca7af5c6e2d773',
    timeCf64leSha256:
      '87927c1676dcca1ca8bf2dbca0dd0d25d706ac4f92172f64823a1586943f2a9e',
  }),
} as const);

export const LTE_NTM_RESOURCE_ELEMENT_KIND = Object.freeze({
  unused: 0,
  nrs: 1,
  npss: 2,
  nsss: 3,
  npbch: 4,
  npdcch: 5,
  npdsch: 6,
  reserved: 7,
  hostCrsReserved: 8,
} as const);
export type LteNtmResourceElementKindName =
  keyof typeof LTE_NTM_RESOURCE_ELEMENT_KIND;

const SYMBOLS_PER_SUBFRAME = 14;
const SYMBOLS_PER_FRAME = 140;
const RE_PER_SUBFRAME = SYMBOLS_PER_SUBFRAME * LTE_NTM_ACTIVE_SUBCARRIERS;
const SYMBOLS_PER_SLOT = 7;
const FIRST_SYMBOL_CP_SAMPLES = 10;
const OTHER_SYMBOL_CP_SAMPLES = 9;
const QPSK_COMPONENT = Math.SQRT1_2;
const NPDSCH_RNTI = 1_000;
const NPSS_FACTORS = Object.freeze([1, 1, 1, 1, -1, -1, 1, 1, 1, -1, 1]);

export interface LteNtmReferenceFrame {
  readonly metadata: {
    readonly profileId: LteNtmProfile;
    readonly fixedWaveform:
      | 'TS-36.141-N-TM'
      | 'TS-36.141-N-TM-guardband-isolated-component'
      | 'TS-36.141-N-TM-inband-isolated-component';
    readonly specification: '3GPP TS 36.141 V19.1.0';
    readonly physicalSpecification: '3GPP TS 36.211 V19.3.0';
    readonly clauses: readonly string[];
    readonly deploymentMode:
      | 'standalone'
      | 'guardband-isolated-component'
      | 'inband-different-pci-isolated-component';
    readonly compositeHostIncluded: false;
    readonly physicalCellId: typeof LTE_NTM_CELL_ID;
    readonly hostPhysicalCellId: typeof LTE_NTM_HOST_CELL_ID | null;
    readonly antennaPort: 1_000;
    readonly subcarrierSpacingHz: 15_000;
    readonly cyclicPrefix: 'normal';
    readonly sampleRateHz: typeof LTE_NTM_SAMPLE_RATE_HZ;
    readonly sampleCount: typeof LTE_NTM_FRAME_SAMPLES;
    readonly qualification: 'fixed-digital-candidate';
    readonly standardsComplianceClaimed: false;
    readonly rfConformanceClaimed: false;
    readonly productCertificationClaimed: false;
    readonly resourceElementCounts:
      Readonly<Record<LteNtmResourceElementKindName, number>>;
  };
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly kinds: Uint8Array;
    readonly symbolCount: typeof SYMBOLS_PER_FRAME;
    readonly subcarrierCount: typeof LTE_NTM_ACTIVE_SUBCARRIERS;
  };
  readonly timeDomain: SplitComplexSequence & {
    readonly sampleCount: typeof LTE_NTM_FRAME_SAMPLES;
  };
}

interface MutableGrid {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
  readonly kinds: Uint8Array;
}

interface Complex {
  readonly real: number;
  readonly imaginary: number;
}

export function isLteNtmProfile(profile: string): profile is LteNtmProfile {
  return (LTE_NTM_PROFILES as readonly string[]).includes(profile);
}

/**
 * Generates the fixed ten-subframe N-TM physical-input fixture in TS 36.141
 * 6.1.3-6.1.6. The two component profiles deliberately omit their E-TM 1.1
 * host; they therefore make no composite placement or relative-power claim.
 */
export function generateLteNtmReferenceFrame(
  profile: LteNtmProfile = 'lte-ntm',
): LteNtmReferenceFrame {
  if (!isLteNtmProfile(profile)) {
    throw new RangeError(`Unknown LTE N-TM profile ${String(profile)}`);
  }
  const inband = profile === 'lte-nbiot-inband-isolated-component';
  const real = new Float64Array(SYMBOLS_PER_FRAME * LTE_NTM_ACTIVE_SUBCARRIERS);
  const imaginary = new Float64Array(real.length);
  const kinds = new Uint8Array(real.length);
  const grid = { real, imaginary, kinds };

  for (let subframe = 0; subframe < 10; subframe += 1) {
    if (subframe === 0) mapNpbch(grid);
    else if (subframe === 1) mapNpdcch(grid, inband);
    else if (subframe === 5) mapNpss(grid, inband);
    else if (subframe === 9) mapNsss(grid, inband);
    else mapNpdsch(grid, subframe, inband);

    if (subframe !== 5 && subframe !== 9) mapNrs(grid, subframe);
    if (inband) reserveHostCrsLocations(grid, subframe);
  }

  const deploymentMode = profile === 'lte-ntm'
    ? 'standalone'
    : profile === 'lte-nbiot-guard-isolated-component'
      ? 'guardband-isolated-component'
      : 'inband-different-pci-isolated-component';
  const fixedWaveform = profile === 'lte-ntm'
    ? 'TS-36.141-N-TM'
    : profile === 'lte-nbiot-guard-isolated-component'
      ? 'TS-36.141-N-TM-guardband-isolated-component'
      : 'TS-36.141-N-TM-inband-isolated-component';
  const timeDomain = renderOfdmFrame(real, imaginary);
  return {
    metadata: {
      profileId: profile,
      fixedWaveform,
      specification: '3GPP TS 36.141 V19.1.0',
      physicalSpecification: '3GPP TS 36.211 V19.3.0',
      clauses: profile === 'lte-ntm'
        ? ['TS 36.141 6.1.3 and 6.1.4', 'TS 36.211 10.2.3-10.2.8']
        : profile === 'lte-nbiot-guard-isolated-component'
          ? [
              'TS 36.141 6.1.3-6.1.5 (N-TM component only)',
              'TS 36.211 10.2.3-10.2.8',
            ]
          : [
              'TS 36.141 6.1.3-6.1.4 and 6.1.6 (N-TM component only)',
              'TS 36.211 10.2.3-10.2.8',
            ],
      deploymentMode,
      compositeHostIncluded: false,
      physicalCellId: LTE_NTM_CELL_ID,
      hostPhysicalCellId: inband ? LTE_NTM_HOST_CELL_ID : null,
      antennaPort: 1_000,
      subcarrierSpacingHz: 15_000,
      cyclicPrefix: 'normal',
      sampleRateHz: LTE_NTM_SAMPLE_RATE_HZ,
      sampleCount: LTE_NTM_FRAME_SAMPLES,
      qualification: 'fixed-digital-candidate',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
      resourceElementCounts: countKinds(kinds),
    },
    grid: {
      real,
      imaginary,
      kinds,
      symbolCount: SYMBOLS_PER_FRAME,
      subcarrierCount: LTE_NTM_ACTIVE_SUBCARRIERS,
    },
    timeDomain: {
      ...timeDomain,
      sampleCount: LTE_NTM_FRAME_SAMPLES,
    },
  };
}

function index(subframe: number, symbol: number, subcarrier: number): number {
  return (subframe * SYMBOLS_PER_SUBFRAME + symbol)
    * LTE_NTM_ACTIVE_SUBCARRIERS + subcarrier;
}

function setElement(
  grid: MutableGrid,
  subframe: number,
  symbol: number,
  subcarrier: number,
  value: Complex,
  kind: number,
): void {
  const resource = index(subframe, symbol, subcarrier);
  if (
    grid.kinds[resource] !== LTE_NTM_RESOURCE_ELEMENT_KIND.unused
    && grid.kinds[resource] !== LTE_NTM_RESOURCE_ELEMENT_KIND.reserved
  ) {
    throw new Error(`N-TM RE collision at ${subframe}/${symbol}/${subcarrier}`);
  }
  grid.real[resource] = value.real;
  grid.imaginary[resource] = value.imaginary;
  grid.kinds[resource] = kind;
}

function reserve(
  grid: MutableGrid,
  subframe: number,
  symbol: number,
  subcarrier: number,
  kind: number = LTE_NTM_RESOURCE_ELEMENT_KIND.reserved,
): void {
  const resource = index(subframe, symbol, subcarrier);
  if (grid.kinds[resource] === LTE_NTM_RESOURCE_ELEMENT_KIND.unused) {
    grid.kinds[resource] = kind;
  }
}

function qpskSequence(cInit: number, bitCount: number): Complex[] {
  const bits = generateLteGoldSequence(cInit, bitCount);
  const output: Complex[] = [];
  for (let bit = 0; bit < bitCount; bit += 2) {
    output.push({
      real: QPSK_COMPONENT * (1 - 2 * bits[bit]!),
      imaginary: QPSK_COMPONENT * (1 - 2 * bits[bit + 1]!),
    });
  }
  return output;
}

function assumedNrsLocation(symbol: number, subcarrier: number): boolean {
  return (symbol === 5 || symbol === 6 || symbol === 12 || symbol === 13)
    && subcarrier % 3 === LTE_NTM_CELL_ID % 3;
}

function hostCrsLocation(symbol: number, subcarrier: number): boolean {
  return (symbol === 4 || symbol === 7 || symbol === 8 || symbol === 11)
    && subcarrier % 3 === LTE_NTM_HOST_CELL_ID % 3;
}

function mapNpbch(grid: MutableGrid): void {
  const symbols = qpskSequence(LTE_NTM_CELL_ID, 200);
  const rotation = generateLteGoldSequence(
    (LTE_NTM_CELL_ID + 1) * 512 + LTE_NTM_CELL_ID,
    200,
  );
  let input = 0;
  for (let symbol = 3; symbol < SYMBOLS_PER_SUBFRAME; symbol += 1) {
    for (let subcarrier = 0; subcarrier < LTE_NTM_ACTIVE_SUBCARRIERS; subcarrier += 1) {
      const reserved = symbol !== 3 && symbol !== 9 && symbol !== 10
        && subcarrier % 3 === LTE_NTM_CELL_ID % 3;
      if (reserved) {
        reserve(grid, 0, symbol, subcarrier);
        continue;
      }
      const base = symbols[input]!;
      const first = rotation[2 * input]!;
      const second = rotation[2 * input + 1]!;
      const value = first === 0
        ? second === 0
          ? base
          : { real: -base.real, imaginary: -base.imaginary }
        : second === 0
          ? { real: -base.imaginary, imaginary: base.real }
          : { real: base.imaginary, imaginary: -base.real };
      setElement(
        grid,
        0,
        symbol,
        subcarrier,
        value,
        LTE_NTM_RESOURCE_ELEMENT_KIND.npbch,
      );
      input += 1;
    }
  }
  if (input !== 100) throw new Error(`NPBCH mapped ${input} symbols`);
}

function mapNpdcch(grid: MutableGrid, inband: boolean): void {
  mapNarrowbandQpskChannel(
    grid,
    1,
    inband,
    generateLteGoldSequence(512 + LTE_NTM_CELL_ID, inband ? 200 : 304),
    LTE_NTM_RESOURCE_ELEMENT_KIND.npdcch,
  );
}

function mapNpdsch(grid: MutableGrid, subframe: number, inband: boolean): void {
  const bitCount = inband ? 200 : 304;
  const cInit = (NPDSCH_RNTI << 14) + subframe * 512 + LTE_NTM_CELL_ID;
  mapNarrowbandQpskChannel(
    grid,
    subframe,
    inband,
    generateLteGoldSequence(cInit, bitCount),
    LTE_NTM_RESOURCE_ELEMENT_KIND.npdsch,
  );
}

function mapNarrowbandQpskChannel(
  grid: MutableGrid,
  subframe: number,
  inband: boolean,
  bits: Uint8Array,
  kind: number,
): void {
  let input = 0;
  for (let symbol = inband ? 3 : 0; symbol < SYMBOLS_PER_SUBFRAME; symbol += 1) {
    for (let subcarrier = 0; subcarrier < LTE_NTM_ACTIVE_SUBCARRIERS; subcarrier += 1) {
      if (
        assumedNrsLocation(symbol, subcarrier)
        || (inband && hostCrsLocation(symbol, subcarrier))
      ) {
        reserve(
          grid,
          subframe,
          symbol,
          subcarrier,
          inband && hostCrsLocation(symbol, subcarrier)
            ? LTE_NTM_RESOURCE_ELEMENT_KIND.hostCrsReserved
            : LTE_NTM_RESOURCE_ELEMENT_KIND.reserved,
        );
        continue;
      }
      setElement(grid, subframe, symbol, subcarrier, {
        real: QPSK_COMPONENT * (1 - 2 * bits[2 * input]!),
        imaginary: QPSK_COMPONENT * (1 - 2 * bits[2 * input + 1]!),
      }, kind);
      input += 1;
    }
  }
  if (2 * input !== bits.length) {
    throw new Error(`Narrowband channel consumed ${2 * input}/${bits.length} bits`);
  }
}

function mapNrs(grid: MutableGrid, subframe: number): void {
  for (let slotWithinSubframe = 0; slotWithinSubframe < 2; slotWithinSubframe += 1) {
    const ns = 2 * subframe + slotWithinSubframe;
    for (let localReferenceSymbol = 0; localReferenceSymbol < 2; localReferenceSymbol += 1) {
      const l = localReferenceSymbol === 0 ? 5 : 6;
      const cInit = 1_024 * (7 * (ns + 1) + l + 1)
        * (2 * LTE_NTM_CELL_ID + 1) + 2 * LTE_NTM_CELL_ID + 1;
      const sequence = generateLteGoldSequence(cInit, 222);
      const globalSymbol = slotWithinSubframe * SYMBOLS_PER_SLOT + l;
      const offset = localReferenceSymbol === 0
        ? LTE_NTM_CELL_ID % 6
        : (3 + LTE_NTM_CELL_ID) % 6;
      for (let m = 0; m < 2; m += 1) {
        setElement(grid, subframe, globalSymbol, 6 * m + offset, {
          real: QPSK_COMPONENT * (1 - 2 * sequence[2 * (m + 109)]!),
          imaginary: QPSK_COMPONENT * (1 - 2 * sequence[2 * (m + 109) + 1]!),
        }, LTE_NTM_RESOURCE_ELEMENT_KIND.nrs);
      }
    }
  }
}

function mapNpss(grid: MutableGrid, inband: boolean): void {
  for (let symbol = 3; symbol < SYMBOLS_PER_SUBFRAME; symbol += 1) {
    const factor = NPSS_FACTORS[symbol - 3]!;
    for (let subcarrier = 0; subcarrier < 11; subcarrier += 1) {
      if (inband && hostCrsLocation(symbol, subcarrier)) {
        reserve(
          grid,
          5,
          symbol,
          subcarrier,
          LTE_NTM_RESOURCE_ELEMENT_KIND.hostCrsReserved,
        );
        continue;
      }
      const phase = -Math.PI * 5 * subcarrier * (subcarrier + 1) / 11;
      setElement(grid, 5, symbol, subcarrier, {
        real: factor * Math.cos(phase),
        imaginary: factor * Math.sin(phase),
      }, LTE_NTM_RESOURCE_ELEMENT_KIND.npss);
    }
  }
}

function mapNsss(grid: MutableGrid, inband: boolean): void {
  for (let sequenceIndex = 0; sequenceIndex < 132; sequenceIndex += 1) {
    const symbol = 3 + Math.floor(sequenceIndex / LTE_NTM_ACTIVE_SUBCARRIERS);
    const subcarrier = sequenceIndex % LTE_NTM_ACTIVE_SUBCARRIERS;
    if (inband && hostCrsLocation(symbol, subcarrier)) {
      reserve(
        grid,
        9,
        symbol,
        subcarrier,
        LTE_NTM_RESOURCE_ELEMENT_KIND.hostCrsReserved,
      );
      continue;
    }
    const nPrime = sequenceIndex % 131;
    const phase = -Math.PI * 106 * nPrime * (nPrime + 1) / 131;
    setElement(grid, 9, symbol, subcarrier, {
      real: Math.cos(phase),
      imaginary: Math.sin(phase),
    }, LTE_NTM_RESOURCE_ELEMENT_KIND.nsss);
  }
}

function reserveHostCrsLocations(grid: MutableGrid, subframe: number): void {
  for (let symbol = 0; symbol < SYMBOLS_PER_SUBFRAME; symbol += 1) {
    for (let subcarrier = 0; subcarrier < LTE_NTM_ACTIVE_SUBCARRIERS; subcarrier += 1) {
      if (hostCrsLocation(symbol, subcarrier)) {
        reserve(
          grid,
          subframe,
          symbol,
          subcarrier,
          LTE_NTM_RESOURCE_ELEMENT_KIND.hostCrsReserved,
        );
      }
    }
  }
}

function renderOfdmFrame(
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): SplitComplexSequence {
  const real = new Float64Array(LTE_NTM_FRAME_SAMPLES);
  const imaginary = new Float64Array(LTE_NTM_FRAME_SAMPLES);
  let output = 0;
  for (let symbol = 0; symbol < SYMBOLS_PER_FRAME; symbol += 1) {
    const symbolReal = new Float64Array(LTE_NTM_FFT_SIZE);
    const symbolImaginary = new Float64Array(LTE_NTM_FFT_SIZE);
    const gridOffset = symbol * LTE_NTM_ACTIVE_SUBCARRIERS;
    for (let subcarrier = 0; subcarrier < LTE_NTM_ACTIVE_SUBCARRIERS; subcarrier += 1) {
      const bin = subcarrier < 6
        ? LTE_NTM_FFT_SIZE - 6 + subcarrier
        : subcarrier - 6;
      symbolReal[bin] = gridReal[gridOffset + subcarrier]!;
      symbolImaginary[bin] = -gridImaginary[gridOffset + subcarrier]!;
    }
    fftForwardUnscaledInPlace(symbolReal, symbolImaginary);
    for (let sample = 0; sample < LTE_NTM_FFT_SIZE; sample += 1) {
      symbolReal[sample] = symbolReal[sample]! / LTE_NTM_FFT_SIZE;
      symbolImaginary[sample] = -symbolImaginary[sample]! / LTE_NTM_FFT_SIZE;
    }
    const cp = symbol % SYMBOLS_PER_SLOT === 0
      ? FIRST_SYMBOL_CP_SAMPLES
      : OTHER_SYMBOL_CP_SAMPLES;
    for (let sampleWithCp = 0; sampleWithCp < LTE_NTM_FFT_SIZE + cp; sampleWithCp += 1) {
      const usefulSample = (sampleWithCp - cp + LTE_NTM_FFT_SIZE)
        % LTE_NTM_FFT_SIZE;
      const phase = 2 * Math.PI * (sampleWithCp - cp) * 0.5 / LTE_NTM_FFT_SIZE;
      const cosine = Math.cos(phase);
      const sine = Math.sin(phase);
      const baseReal = symbolReal[usefulSample]!;
      const baseImaginary = symbolImaginary[usefulSample]!;
      real[output] = baseReal * cosine - baseImaginary * sine;
      imaginary[output] = baseReal * sine + baseImaginary * cosine;
      output += 1;
    }
  }
  if (output !== LTE_NTM_FRAME_SAMPLES) {
    throw new Error(`N-TM OFDM rendered ${output} samples`);
  }
  return { real, imaginary };
}

function countKinds(
  kinds: Uint8Array,
): Readonly<Record<LteNtmResourceElementKindName, number>> {
  const names = Object.keys(
    LTE_NTM_RESOURCE_ELEMENT_KIND,
  ) as LteNtmResourceElementKindName[];
  const byKind = new Map<number, LteNtmResourceElementKindName>(
    names.map((name) => [LTE_NTM_RESOURCE_ELEMENT_KIND[name], name]),
  );
  const counts = Object.fromEntries(names.map((name) => [name, 0])) as
    Record<LteNtmResourceElementKindName, number>;
  for (const kind of kinds) {
    const name = byKind.get(kind);
    if (name === undefined) throw new Error(`Unknown N-TM RE kind ${kind}`);
    counts[name] += 1;
  }
  return Object.freeze(counts);
}
