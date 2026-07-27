import { fftForwardUnscaledInPlace } from '@atomos/dsp';

const RESOURCE_BLOCK_COUNT = 50;
const SUBCARRIERS_PER_RESOURCE_BLOCK = 12;
const ACTIVE_SUBCARRIER_COUNT = RESOURCE_BLOCK_COUNT * SUBCARRIERS_PER_RESOURCE_BLOCK;
const SUBFRAMES_PER_FRAME = 10;
const SLOTS_PER_SUBFRAME = 2;
const SYMBOLS_PER_SLOT = 7;
const SYMBOLS_PER_SUBFRAME = SLOTS_PER_SUBFRAME * SYMBOLS_PER_SLOT;
const SYMBOLS_PER_FRAME = SUBFRAMES_PER_FRAME * SYMBOLS_PER_SUBFRAME;
const FFT_SIZE = 1_024;
const FIRST_SYMBOL_CP_SAMPLES = 80;
const OTHER_SYMBOL_CP_SAMPLES = 72;
const SAMPLE_RATE_HZ = 15_360_000;
const FRAME_SAMPLE_COUNT = 153_600;
const PHYSICAL_CELL_ID = 1;
const GOLD_SEQUENCE_OFFSET = 1_600;
const MAX_PHYSICAL_CELL_ID = 503;
const MAX_GOLD_INITIALIZATION = 0x7fff_ffff;
const QPSK_COMPONENT = Math.SQRT1_2;
const PDCCH_AMPLITUDE = 10 ** (1.065 / 20);

export const LTE_RESOURCE_ELEMENT_KIND = Object.freeze({
  unused: 0,
  crs: 1,
  pss: 2,
  sss: 3,
  pbch: 4,
  pcfich: 5,
  phich: 6,
  pdcch: 7,
  pdsch: 8,
  reserved: 9,
} as const);

export type LteResourceElementKindName = keyof typeof LTE_RESOURCE_ELEMENT_KIND;
export type LteResourceElementKind =
  typeof LTE_RESOURCE_ELEMENT_KIND[LteResourceElementKindName];

export type LteEtm11RequirementStatus = 'implemented' | 'unsupported';

export interface LteEtm11RequirementLedgerEntry {
  readonly requirement: string;
  readonly status: LteEtm11RequirementStatus;
  readonly specification: string;
  readonly clauses: readonly string[];
  readonly implementationEvidence: string;
  readonly independentVerification: 'not-performed';
}

export interface SplitComplexSequence {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
}

export interface LteComplexSymbol {
  readonly real: number;
  readonly imaginary: number;
}

export interface LteEtm11ReferenceGrid extends SplitComplexSequence {
  readonly kinds: Uint8Array;
  readonly symbolCount: typeof SYMBOLS_PER_FRAME;
  readonly subcarrierCount: typeof ACTIVE_SUBCARRIER_COUNT;
}

export interface LteEtm11TimeDomainFrame extends SplitComplexSequence {
  readonly sampleCount: typeof FRAME_SAMPLE_COUNT;
}

export interface LteEtm11ReferenceMetadata {
  readonly profileId: typeof LTE_ETM1_1_10MHZ_FDD_PILOT.profileId;
  readonly qualification: typeof LTE_ETM1_1_10MHZ_FDD_PILOT.qualification;
  readonly complianceClaimed: false;
  readonly physicalCellId: typeof PHYSICAL_CELL_ID;
  readonly frameNumberModuloFour: 0;
  readonly radioFrameDurationMs: 10;
  readonly duplex: 'fdd';
  readonly cyclicPrefix: 'normal';
  readonly antennaPorts: readonly [0];
  readonly resourceBlockCount: typeof RESOURCE_BLOCK_COUNT;
  readonly subcarrierSpacingHz: 15_000;
  readonly activeSubcarrierCount: typeof ACTIVE_SUBCARRIER_COUNT;
  readonly fftSize: typeof FFT_SIZE;
  readonly sampleRateHz: typeof SAMPLE_RATE_HZ;
  readonly sampleCount: typeof FRAME_SAMPLE_COUNT;
  readonly physicalChannelConfiguration: {
    readonly controlSymbolCount: 1;
    readonly cfi: 1;
    readonly phichNg: '1/6';
    readonly phichGroupCount: 2;
    readonly phichPerGroup: 2;
    readonly phichSequenceIndices: readonly [0, 4];
    readonly pdcchCount: 5;
    readonly ccesPerPdcch: 2;
    readonly pdschResourceBlockCount: 50;
    readonly pdschRnti: 0;
  };
  readonly relativeEpreDb: {
    readonly synchronizationSignals: 0;
    readonly pbch: 0;
    readonly pcfich: 0;
    readonly phichBpskSymbol: -3.010;
    readonly phichGroup: 0;
    readonly pdcchReg: 1.065;
    readonly pdschPa: 0;
  };
  readonly cyclicPrefixSamplesBySymbol: Uint8Array;
  readonly amplitudeConvention: string;
  readonly resourceElementCounts: Readonly<Record<LteResourceElementKindName, number>>;
  readonly requirementLedger: readonly LteEtm11RequirementLedgerEntry[];
  readonly unsupportedScope: readonly string[];
}

export interface LteEtm11ReferenceFrame {
  readonly metadata: LteEtm11ReferenceMetadata;
  readonly grid: LteEtm11ReferenceGrid;
  readonly timeDomain: LteEtm11TimeDomainFrame;
}

const REQUIREMENT_LEDGER = Object.freeze([
  Object.freeze({
    requirement: '50-RB, 15 kHz, normal-CP, frame-structure-type-1 resource grid',
    status: 'implemented',
    specification: '3GPP TS 36.104 V19.2.0 and TS 36.211 V19.3.0',
    clauses: Object.freeze(['36.104 5.6', '36.211 4.1', '36.211 6.2.1-6.2.4', '36.211 6.12']),
    implementationEvidence: 'The tested 10 MHz-to-50-RB binding, exact grid dimensions, and one 10 ms radio frame are covered by geometry tests.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: 'Cell-specific reference signal on antenna port 0',
    status: 'implemented',
    specification: '3GPP TS 36.211 V19.3.0',
    clauses: Object.freeze(['6.10.1', '6.10.1.1', '6.10.1.2', '7.2']),
    implementationEvidence: 'Gold sequence, QPSK reference symbols, and port-0 resource mapping are exposed and tested.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: 'Primary and secondary synchronization signals',
    status: 'implemented',
    specification: '3GPP TS 36.211 V19.3.0',
    clauses: Object.freeze(['6.11', '6.11.1', '6.11.2']),
    implementationEvidence: 'PSS and SSS sequence helpers and their FDD subframe mappings are covered by known-value tests.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: 'E-TM1.1 PBCH all-zero input-bit construction for frame number modulo four equal to zero',
    status: 'implemented',
    specification: '3GPP TS 36.141 V19.1.0 and TS 36.211 V19.3.0',
    clauses: Object.freeze([
      '36.141 6.1.2',
      '36.211 6.3.3.1',
      '36.211 6.3.4.1',
      '36.211 6.6.1-6.6.4',
    ]),
    implementationEvidence: 'The prescribed 480 zero bits are scrambled, QPSK modulated, passed through the explicit one-layer/single-port identity stage, and mapped around four-port CRS reservations.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: 'CFI=1 PCFICH',
    status: 'implemented',
    specification: '3GPP TS 36.212 V19.3.0 and TS 36.211 V19.3.0',
    clauses: Object.freeze([
      '36.212 5.3.4',
      '36.212 5.3.4.1',
      '36.211 6.3.3.1',
      '36.211 6.3.4.1',
      '36.211 6.7',
    ]),
    implementationEvidence: 'The fixed 32-bit CFI codeword is scrambled, QPSK modulated, passed through the explicit one-layer/single-port identity stage, and mapped to four REGs.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: 'Two PHICH groups with sequence indices 0 and 4 and all-zero HI bits',
    status: 'implemented',
    specification: '3GPP TS 36.141 V19.1.0, TS 36.211 V19.3.0, and TS 36.212 V19.3.0',
    clauses: Object.freeze([
      '36.141 6.1.1.1',
      '36.141 6.1.2.6',
      '36.211 6.3.3.1',
      '36.211 6.3.4.1',
      '36.211 6.9',
      '36.212 5.3.5',
      '36.212 5.3.5.1',
    ]),
    implementationEvidence: 'Normal-duration PHICH scrambling, orthogonal spreading, group summation, explicit one-layer/single-port identity processing, and REG mapping are implemented.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: 'Five two-CCE all-zero PDCCHs occupying all 90 available REGs',
    status: 'implemented',
    specification: '3GPP TS 36.141 V19.1.0 and TS 36.211 V19.3.0',
    clauses: Object.freeze([
      '36.141 6.1.1.1',
      '36.141 6.1.2.7',
      '36.211 6.3.3.1',
      '36.211 6.3.4.1',
      '36.211 6.8',
    ]),
    implementationEvidence: 'All-zero multiplexing, scrambling, QPSK, explicit one-layer/single-port identity processing, symbol-quadruplet interleaving, cyclic shift, and REG mapping are implemented.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: 'Full-allocation QPSK PDSCH with prescribed all-zero input bits and n_RNTI=0',
    status: 'implemented',
    specification: '3GPP TS 36.141 V19.1.0 and TS 36.211 V19.3.0',
    clauses: Object.freeze(['36.141 6.1.1.1', '36.141 6.1.2', '36.211 6.3', '36.211 6.4']),
    implementationEvidence: 'Every PDSCH-eligible RE is populated using the subframe-specific Gold sequence, QPSK mapping, and explicit one-layer/single-port identity stage.',
    independentVerification: 'not-performed',
  }),
  Object.freeze({
    requirement: '15.36 Msample/s OFDM rendering with 1024-point IFFT and 80/72-sample normal cyclic prefixes',
    status: 'implemented',
    specification: '3GPP TS 36.211 V19.3.0',
    clauses: Object.freeze(['6.12']),
    implementationEvidence: 'A fixed 1/N inverse-DFT convention and exact cyclic-prefix sample counts produce 153600 complex samples.',
    independentVerification: 'not-performed',
  }),
] as const satisfies readonly LteEtm11RequirementLedgerEntry[]);

export const LTE_ETM1_1_10MHZ_FDD_PILOT = Object.freeze({
  profileId: 'lte-etm1.1-10mhz-fdd-release19-candidate',
  qualification: 'standards-derived-digital-candidate-not-independently-verified',
  complianceClaimed: false,
  physicalCellId: PHYSICAL_CELL_ID,
  frameNumberModuloFour: 0,
  radioFrameDurationMs: 10,
  resourceBlockCount: RESOURCE_BLOCK_COUNT,
  subcarrierSpacingHz: 15_000,
  sampleRateHz: SAMPLE_RATE_HZ,
  sampleCount: FRAME_SAMPLE_COUNT,
  physicalChannelConfiguration: Object.freeze({
    controlSymbolCount: 1,
    cfi: 1,
    phichNg: '1/6',
    phichGroupCount: 2,
    phichPerGroup: 2,
    phichSequenceIndices: Object.freeze([0, 4] as const),
    pdcchCount: 5,
    ccesPerPdcch: 2,
    pdschResourceBlockCount: RESOURCE_BLOCK_COUNT,
    pdschRnti: 0,
  }),
  relativeEpreDb: Object.freeze({
    synchronizationSignals: 0,
    pbch: 0,
    pcfich: 0,
    phichBpskSymbol: -3.010,
    phichGroup: 0,
    pdcchReg: 1.065,
    pdschPa: 0,
  }),
  requirementLedger: REQUIREMENT_LEDGER,
  unsupportedScope: Object.freeze([
    'Any physical-layer cell identity other than the E-TM1.1 value N_ID_cell=1.',
    'Any bandwidth, duplex mode, cyclic-prefix mode, antenna-port count, or radio-frame duration other than this fixed profile.',
    'Protocol-decodable BCH, DCI, or transport-block payload generation; E-TM1.1 prescribes all-zero bits at the physical-channel inputs instead.',
    'Conducted-RF and radiated conformance, transmitter impairments, calibration, measurement uncertainty, and test-equipment verdicts.',
    'A 3GPP-compliance claim before comparison with an independent trusted vector or standards-qualified analyzer.',
  ]),
} as const);

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

/**
 * Generate the binary pseudo-random sequence in TS 36.211 clause 7.2.
 */
export function generateLteGoldSequence(cInit: number, length: number): Uint8Array {
  if (!Number.isSafeInteger(cInit) || cInit < 0 || cInit > MAX_GOLD_INITIALIZATION) {
    throw new RangeError('LTE Gold-sequence c_init must be an integer from 0 through 2^31-1');
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('LTE Gold-sequence length must be a non-negative safe integer');
  }

  const stateLength = GOLD_SEQUENCE_OFFSET + length + 31;
  const x1 = new Uint8Array(stateLength);
  const x2 = new Uint8Array(stateLength);
  x1[0] = 1;
  for (let index = 0; index < 31; index += 1) {
    x2[index] = (cInit >>> index) & 1;
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

/**
 * Generate the 62 complex PSS elements for a valid LTE physical-layer cell ID.
 */
export function generateLtePrimarySynchronizationSignal(
  physicalCellId: number = PHYSICAL_CELL_ID,
): SplitComplexSequence {
  requirePhysicalCellId(physicalCellId);
  const root = [25, 29, 34][physicalCellId % 3]!;
  const real = new Float64Array(62);
  const imaginary = new Float64Array(62);
  for (let index = 0; index < 62; index += 1) {
    const argument = index <= 30
      ? -Math.PI * root * index * (index + 1) / 63
      : -Math.PI * root * (index + 1) * (index + 2) / 63;
    real[index] = Math.cos(argument);
    imaginary[index] = Math.sin(argument);
  }
  return { real, imaginary };
}

/**
 * Generate the 62 real-valued SSS elements for subframe 0 or 5.
 */
export function generateLteSecondarySynchronizationSignal(
  physicalCellId: number = PHYSICAL_CELL_ID,
  subframe: 0 | 5 = 0,
): SplitComplexSequence {
  requirePhysicalCellId(physicalCellId);
  if (subframe !== 0 && subframe !== 5) {
    throw new RangeError('LTE SSS is defined here only for FDD subframes 0 and 5');
  }

  const identityGroup = Math.floor(physicalCellId / 3);
  const identityWithinGroup = physicalCellId % 3;
  const qPrime = Math.floor(identityGroup / 30);
  const q = Math.floor((identityGroup + qPrime * (qPrime + 1) / 2) / 30);
  const mPrime = identityGroup + q * (q + 1) / 2;
  const m0 = mPrime % 31;
  const m1 = (m0 + Math.floor(mPrime / 31) + 1) % 31;

  const sTilde = binaryMSequence([0, 0, 0, 0, 1], (state, index) =>
    state[index + 2]! ^ state[index]!);
  const cTilde = binaryMSequence([0, 0, 0, 0, 1], (state, index) =>
    state[index + 3]! ^ state[index]!);
  const zTilde = binaryMSequence([0, 0, 0, 0, 1], (state, index) =>
    state[index + 4]! ^ state[index + 2]! ^ state[index + 1]! ^ state[index]!);

  const real = new Float64Array(62);
  const imaginary = new Float64Array(62);
  for (let n = 0; n < 31; n += 1) {
    const c0 = cTilde[(n + identityWithinGroup) % 31]!;
    const c1 = cTilde[(n + identityWithinGroup + 3) % 31]!;
    const s0 = sTilde[(n + m0) % 31]!;
    const s1 = sTilde[(n + m1) % 31]!;
    const z0 = zTilde[(n + (m0 % 8)) % 31]!;
    const z1 = zTilde[(n + (m1 % 8)) % 31]!;
    if (subframe === 0) {
      real[2 * n] = s0 * c0;
      real[2 * n + 1] = s1 * c1 * z0;
    } else {
      real[2 * n] = s1 * c0;
      real[2 * n + 1] = s0 * c1 * z1;
    }
  }
  return { real, imaginary };
}

/**
 * Build the fixed Release-19 LTE E-TM1.1 digital reference candidate.
 *
 * This deliberately has no profile parameters. TS 36.141 clause 6.1.2 fixes
 * N_ID_cell=1 for the single-carrier E-TM case represented here, and accepting
 * an arbitrary cell ID would silently stop being this E-TM1.1 profile.
 */
export function generateLteEtm11ReferenceFrame(): LteEtm11ReferenceFrame {
  const gridReal = new Float64Array(SYMBOLS_PER_FRAME * ACTIVE_SUBCARRIER_COUNT);
  const gridImaginary = new Float64Array(gridReal.length);
  const kinds = new Uint8Array(gridReal.length);
  const grid = { real: gridReal, imaginary: gridImaginary, kinds };

  mapCellSpecificReferenceSignals(grid);
  mapSynchronizationSignals(grid);
  mapPbch(grid);
  for (let subframe = 0; subframe < SUBFRAMES_PER_FRAME; subframe += 1) {
    mapControlRegion(grid, subframe);
    mapPdsch(grid, subframe);
  }

  const timeDomain = renderOfdmFrame(gridReal, gridImaginary);
  const cyclicPrefixSamplesBySymbol = new Uint8Array(SYMBOLS_PER_FRAME);
  for (let symbol = 0; symbol < SYMBOLS_PER_FRAME; symbol += 1) {
    cyclicPrefixSamplesBySymbol[symbol] =
      symbol % SYMBOLS_PER_SLOT === 0 ? FIRST_SYMBOL_CP_SAMPLES : OTHER_SYMBOL_CP_SAMPLES;
  }

  return {
    metadata: {
      profileId: LTE_ETM1_1_10MHZ_FDD_PILOT.profileId,
      qualification: LTE_ETM1_1_10MHZ_FDD_PILOT.qualification,
      complianceClaimed: false,
      physicalCellId: PHYSICAL_CELL_ID,
      frameNumberModuloFour: 0,
      radioFrameDurationMs: 10,
      duplex: 'fdd',
      cyclicPrefix: 'normal',
      antennaPorts: [0],
      resourceBlockCount: RESOURCE_BLOCK_COUNT,
      subcarrierSpacingHz: 15_000,
      activeSubcarrierCount: ACTIVE_SUBCARRIER_COUNT,
      fftSize: FFT_SIZE,
      sampleRateHz: SAMPLE_RATE_HZ,
      sampleCount: FRAME_SAMPLE_COUNT,
      physicalChannelConfiguration: LTE_ETM1_1_10MHZ_FDD_PILOT.physicalChannelConfiguration,
      relativeEpreDb: LTE_ETM1_1_10MHZ_FDD_PILOT.relativeEpreDb,
      cyclicPrefixSamplesBySymbol,
      amplitudeConvention:
        'Complex grid EPRE ratios are preserved; the time-domain inverse DFT uses a fixed 1/1024 scale and no clipping or adaptive normalization.',
      resourceElementCounts: countResourceElementKinds(kinds),
      requirementLedger: REQUIREMENT_LEDGER,
      unsupportedScope: LTE_ETM1_1_10MHZ_FDD_PILOT.unsupportedScope,
    },
    grid: {
      real: gridReal,
      imaginary: gridImaginary,
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

interface MutableGrid {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
  readonly kinds: Uint8Array;
}

type ComplexValue = LteComplexSymbol;

/**
 * Makes the Release-19 single-layer/single-antenna-port stage explicit.
 *
 * TS 36.141 E-TM1.1 selects one layer and says that precoding is not used.
 * The invoked TS 36.211 single-port layer-mapping and precoding equations are
 * therefore the identity. Keeping this as a checked operation prevents those
 * normative stages from being silently omitted from the implementation.
 */
export function applyLteSingleAntennaPortIdentityStage(
  symbols: readonly LteComplexSymbol[],
): readonly LteComplexSymbol[] {
  return Object.freeze(symbols.map((symbol, index) => {
    if (!Number.isFinite(symbol.real) || !Number.isFinite(symbol.imaginary)) {
      throw new TypeError(`LTE single-port identity-stage symbol ${index} must be finite`);
    }
    return Object.freeze({
      real: symbol.real,
      imaginary: symbol.imaginary,
    });
  }));
}

interface ControlReg {
  readonly representativeSubcarrier: number;
  readonly subcarriers: readonly [number, number, number, number];
}

function binaryMSequence(
  initial: readonly [number, number, number, number, number],
  recurrence: (state: Uint8Array, index: number) => number,
): Int8Array {
  const state = new Uint8Array(31);
  state.set(initial);
  for (let index = 0; index < 26; index += 1) {
    state[index + 5] = recurrence(state, index);
  }
  return Int8Array.from(state, (value) => 1 - 2 * value);
}

function requirePhysicalCellId(physicalCellId: number): void {
  if (!Number.isSafeInteger(physicalCellId) || physicalCellId < 0 || physicalCellId > MAX_PHYSICAL_CELL_ID) {
    throw new RangeError(`LTE physical-layer cell identity must be an integer from 0 through ${MAX_PHYSICAL_CELL_ID}`);
  }
}

function resourceIndex(symbol: number, subcarrier: number): number {
  return symbol * ACTIVE_SUBCARRIER_COUNT + subcarrier;
}

function setElement(
  grid: MutableGrid,
  symbol: number,
  subcarrier: number,
  value: ComplexValue,
  kind: LteResourceElementKind,
): void {
  if (symbol < 0 || symbol >= SYMBOLS_PER_FRAME
    || subcarrier < 0 || subcarrier >= ACTIVE_SUBCARRIER_COUNT) {
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
        * (2 * PHYSICAL_CELL_ID + 1)
        + 2 * PHYSICAL_CELL_ID
        + 1;
      const sequence = generateLteGoldSequence(cInit, 2 * 220);
      const frequencyOffset = symbolWithinSlot === 0 ? 0 : 3;
      const globalSymbol = slot * SYMBOLS_PER_SLOT + symbolWithinSlot;
      for (let m = 0; m < 2 * RESOURCE_BLOCK_COUNT; m += 1) {
        const sequenceIndex = m + 110 - RESOURCE_BLOCK_COUNT;
        const subcarrier = 6 * m + ((frequencyOffset + PHYSICAL_CELL_ID) % 6);
        setElement(grid, globalSymbol, subcarrier, {
          real: QPSK_COMPONENT * (1 - 2 * sequence[2 * sequenceIndex]!),
          imaginary: QPSK_COMPONENT * (1 - 2 * sequence[2 * sequenceIndex + 1]!),
        }, LTE_RESOURCE_ELEMENT_KIND.crs);
      }
    }
  }
}

function mapSynchronizationSignals(grid: MutableGrid): void {
  const pss = generateLtePrimarySynchronizationSignal();
  for (const { symbol, subframe } of [
    { symbol: 6, subframe: 0 as const },
    { symbol: 76, subframe: 5 as const },
  ]) {
    mapCentralSynchronizationSequence(grid, symbol, pss, LTE_RESOURCE_ELEMENT_KIND.pss);
    void subframe;
  }

  for (const { symbol, subframe } of [
    { symbol: 5, subframe: 0 as const },
    { symbol: 75, subframe: 5 as const },
  ]) {
    const sss = generateLteSecondarySynchronizationSignal(PHYSICAL_CELL_ID, subframe);
    mapCentralSynchronizationSequence(grid, symbol, sss, LTE_RESOURCE_ELEMENT_KIND.sss);
  }
}

function mapCentralSynchronizationSequence(
  grid: MutableGrid,
  symbol: number,
  sequence: SplitComplexSequence,
  kind: LteResourceElementKind,
): void {
  for (let edge = 264; edge <= 268; edge += 1) reserveElement(grid, symbol, edge);
  for (let index = 0; index < 62; index += 1) {
    setElement(grid, symbol, 269 + index, {
      real: sequence.real[index]!,
      imaginary: sequence.imaginary[index]!,
    }, kind);
  }
  for (let edge = 331; edge <= 335; edge += 1) reserveElement(grid, symbol, edge);
}

function mapPbch(grid: MutableGrid): void {
  const scrambledBits = generateLteGoldSequence(PHYSICAL_CELL_ID, 480);
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(scrambledBits));
  let symbolIndex = 0;
  const reservedResidueA = PHYSICAL_CELL_ID % 6;
  const reservedResidueB = (reservedResidueA + 3) % 6;

  for (let l = 0; l < 4; l += 1) {
    const globalSymbol = SYMBOLS_PER_SLOT + l;
    for (let subcarrier = 264; subcarrier <= 335; subcarrier += 1) {
      const residue = subcarrier % 6;
      if ((l === 0 || l === 1)
        && (residue === reservedResidueA || residue === reservedResidueB)) {
        reserveElement(grid, globalSymbol, subcarrier);
        continue;
      }
      setElement(grid, globalSymbol, subcarrier, symbols[symbolIndex]!, LTE_RESOURCE_ELEMENT_KIND.pbch);
      symbolIndex += 1;
    }
  }
  if (symbolIndex !== 240) {
    throw new Error(`PBCH mapping produced ${symbolIndex} symbols instead of 240`);
  }
}

function mapControlRegion(grid: MutableGrid, subframe: number): void {
  const globalSymbol = subframe * SYMBOLS_PER_SUBFRAME;
  const allRegs = controlRegs();
  for (let subcarrier = 0; subcarrier < ACTIVE_SUBCARRIER_COUNT; subcarrier += 1) {
    const residue = subcarrier % 6;
    if (residue === PHYSICAL_CELL_ID % 6 || residue === (PHYSICAL_CELL_ID + 3) % 6) {
      reserveElement(grid, globalSymbol, subcarrier);
    }
  }

  const pcfichRepresentatives = new Set<number>();
  const firstRepresentative = 6 * (PHYSICAL_CELL_ID % (2 * RESOURCE_BLOCK_COUNT));
  for (let index = 0; index < 4; index += 1) {
    pcfichRepresentatives.add(
      (firstRepresentative + 6 * Math.floor(index * RESOURCE_BLOCK_COUNT / 2))
      % ACTIVE_SUBCARRIER_COUNT,
    );
  }
  const pcfichRegs = allRegs.filter((reg) => pcfichRepresentatives.has(reg.representativeSubcarrier));
  if (pcfichRegs.length !== 4) throw new Error('PCFICH mapping did not select four REGs');
  mapPcfich(grid, subframe, globalSymbol, pcfichRegs);

  const regsAfterPcfich = allRegs.filter((reg) => !pcfichRepresentatives.has(reg.representativeSubcarrier));
  const phichRegIndicesByGroup: readonly (readonly number[])[] = [0, 1].map((mappingUnit) =>
    [0, 1, 2].map((quadruplet) =>
      (PHYSICAL_CELL_ID + mappingUnit + quadruplet * regsAfterPcfich.length / 3)
      % regsAfterPcfich.length));
  const phichRepresentatives = new Set<number>();
  for (const indices of phichRegIndicesByGroup) {
    for (const index of indices) {
      phichRepresentatives.add(regsAfterPcfich[index]!.representativeSubcarrier);
    }
  }
  if (phichRepresentatives.size !== 6) throw new Error('PHICH mapping did not select six unique REGs');
  mapPhich(grid, subframe, globalSymbol, regsAfterPcfich, phichRegIndicesByGroup);

  const pdcchRegs = regsAfterPcfich.filter(
    (reg) => !phichRepresentatives.has(reg.representativeSubcarrier),
  );
  if (pdcchRegs.length !== 90) {
    throw new Error(`PDCCH mapping found ${pdcchRegs.length} REGs instead of 90`);
  }
  mapPdcch(grid, subframe, globalSymbol, pdcchRegs);
}

function controlRegs(): readonly ControlReg[] {
  const regs: ControlReg[] = [];
  const excludedA = PHYSICAL_CELL_ID % 6;
  const excludedB = (excludedA + 3) % 6;
  for (let representativeSubcarrier = 0;
    representativeSubcarrier < ACTIVE_SUBCARRIER_COUNT;
    representativeSubcarrier += 6) {
    const available: number[] = [];
    for (let offset = 0; offset < 6; offset += 1) {
      if (offset !== excludedA && offset !== excludedB) {
        available.push(representativeSubcarrier + offset);
      }
    }
    if (available.length !== 4) throw new Error('A first-symbol LTE REG must contain four REs');
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
  const cInit = (subframe + 1) * (2 * PHYSICAL_CELL_ID + 1) * (2 ** 9) + PHYSICAL_CELL_ID;
  const scrambling = generateLteGoldSequence(cInit, PCFICH_CFI_ONE_BITS.length);
  const scrambled = Uint8Array.from(
    PCFICH_CFI_ONE_BITS,
    (bit, index) => bit ^ scrambling[index]!,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(scrambled));
  for (let regIndex = 0; regIndex < regs.length; regIndex += 1) {
    const reg = regs[regIndex]!;
    for (let element = 0; element < 4; element += 1) {
      setElement(
        grid,
        globalSymbol,
        reg.subcarriers[element]!,
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
  const cInit = (subframe + 1) * (2 * PHYSICAL_CELL_ID + 1) * (2 ** 9) + PHYSICAL_CELL_ID;
  const scrambling = generateLteGoldSequence(cInit, 12);
  // The table value -3.010 dB is the three-decimal representation of 1/2
  // power. LTE BPSK is the diagonal (±1 ± j)/sqrt(2) constellation in
  // TS 36.211 clause 7.1.1; another 1/sqrt(2) supplies the E-TM per-PHICH
  // power, and summing sequence 0 with sequence 4 produces 0 dB group EPRE.
  const individualPhichAmplitude = QPSK_COMPONENT;

  for (const regIndices of regIndicesByGroup) {
    const groupSymbols: ComplexValue[] = [];
    for (let index = 0; index < 12; index += 1) {
      let real = 0;
      let imaginary = 0;
      const scramblingSign = 1 - 2 * scrambling[index]!;
      const bpskReal = QPSK_COMPONENT * scramblingSign;
      const bpskImaginary = QPSK_COMPONENT * scramblingSign;
      for (const sequenceIndex of [0, 4] as const) {
        const orthogonal = PHICH_ORTHOGONAL_SEQUENCES[sequenceIndex][index % 4]!;
        real += individualPhichAmplitude
          * (bpskReal * orthogonal.real - bpskImaginary * orthogonal.imaginary);
        imaginary += individualPhichAmplitude
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
    subframe * (2 ** 9) + PHYSICAL_CELL_ID,
    720,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(
    qpskSymbols(scrambling, PDCCH_AMPLITUDE),
  );
  const interleavedQuadruplets = interleavePdcchQuadrupletIndices(regs.length);

  for (let outputIndex = 0; outputIndex < regs.length; outputIndex += 1) {
    const reg = regs[outputIndex]!;
    const inputQuadruplet = interleavedQuadruplets[
      (outputIndex + PHYSICAL_CELL_ID) % interleavedQuadruplets.length
    ]!;
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
}

function interleavePdcchQuadrupletIndices(count: number): readonly number[] {
  const columnCount = 32;
  const rowCount = Math.ceil(count / columnCount);
  const dummyCount = rowCount * columnCount - count;
  const matrix: Array<number | null> = [
    ...Array.from({ length: dummyCount }, () => null),
    ...Array.from({ length: count }, (_, index) => index),
  ];
  const output: number[] = [];
  for (const originalColumn of PDCCH_INTER_COLUMN_PERMUTATION) {
    for (let row = 0; row < rowCount; row += 1) {
      const value = matrix[row * columnCount + originalColumn];
      if (value !== null && value !== undefined) output.push(value);
    }
  }
  if (output.length !== count) throw new Error('PDCCH sub-block interleaver lost quadruplets');
  return output;
}

function mapPdsch(grid: MutableGrid, subframe: number): void {
  const startSymbol = subframe * SYMBOLS_PER_SUBFRAME;
  const eligibleIndices: number[] = [];
  for (let symbol = startSymbol + 1; symbol < startSymbol + SYMBOLS_PER_SUBFRAME; symbol += 1) {
    for (let subcarrier = 0; subcarrier < ACTIVE_SUBCARRIER_COUNT; subcarrier += 1) {
      const index = resourceIndex(symbol, subcarrier);
      if (grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.unused) eligibleIndices.push(index);
    }
  }
  const scrambling = generateLteGoldSequence(
    subframe * (2 ** 9) + PHYSICAL_CELL_ID,
    2 * eligibleIndices.length,
  );
  const symbols = applyLteSingleAntennaPortIdentityStage(qpskSymbols(scrambling));
  for (let index = 0; index < eligibleIndices.length; index += 1) {
    const gridIndex = eligibleIndices[index]!;
    const value = symbols[index]!;
    grid.real[gridIndex] = value.real;
    grid.imaginary[gridIndex] = value.imaginary;
    grid.kinds[gridIndex] = LTE_RESOURCE_ELEMENT_KIND.pdsch;
  }
}

function qpskSymbols(bits: Uint8Array, amplitude = 1): readonly ComplexValue[] {
  if (bits.length % 2 !== 0) throw new RangeError('QPSK mapping requires an even bit count');
  const symbols: ComplexValue[] = [];
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
      symbol % SYMBOLS_PER_SLOT === 0 ? FIRST_SYMBOL_CP_SAMPLES : OTHER_SYMBOL_CP_SAMPLES;
    const prefixStart = FFT_SIZE - cyclicPrefixLength;
    real.set(symbolReal.subarray(prefixStart), sampleOffset);
    imaginary.set(symbolImaginary.subarray(prefixStart), sampleOffset);
    sampleOffset += cyclicPrefixLength;
    real.set(symbolReal, sampleOffset);
    imaginary.set(symbolImaginary, sampleOffset);
    sampleOffset += FFT_SIZE;
  }

  if (sampleOffset !== FRAME_SAMPLE_COUNT) {
    throw new Error(`OFDM renderer produced ${sampleOffset} samples instead of ${FRAME_SAMPLE_COUNT}`);
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
  const namesByKind = new Map<number, LteResourceElementKindName>(
    names.map((name) => [LTE_RESOURCE_ELEMENT_KIND[name], name]),
  );
  for (const kind of kinds) {
    const name = namesByKind.get(kind);
    if (name === undefined) throw new Error(`Unknown LTE resource-element kind ${kind}`);
    counts[name] += 1;
  }
  return Object.freeze(counts);
}
