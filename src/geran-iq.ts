import {
  onePoleLowPassAlphaForTwoSided3dbBandwidth as lowPassFeedForwardCoefficient,
  writeUnitBoundedCf32le,
} from '@atomos/dsp';
import {
  synthesizedSignalProfileSchema,
  type SynthesizedSignalProfile,
  type WaveformProjection,
} from './contracts.js';
import { waveformDescriptor } from './catalog.js';
import {
  GERAN_FIXED_BURST_VECTORS,
  geranScheduledBurst,
  type GeranDigitalValidation,
  type GeranFixedBurstProfile,
} from './geran-fixed-bursts.js';

/** Every GERAN profile currently admitted by the closed SignalLab catalog. */
export const GERAN_COMPLEX_IQ_PROFILES = [
  'gsm-900-loaded-bcch',
  'gsm-normal-burst',
  'gsm-qpsk-higher-symbol-rate-burst',
  'gsm-aqpsk-normal-burst',
  'gsm-8psk-normal-burst',
  'gsm-16qam-higher-symbol-rate-burst',
  'gsm-32qam-higher-symbol-rate-burst',
] as const satisfies readonly GeranFixedBurstProfile[];

export type GeranComplexIqProfile = typeof GERAN_COMPLEX_IQ_PROFILES[number];
export type GeranIqModulation = Extract<
  WaveformProjection['modulation'],
  'gmsk' | 'qpsk' | 'aqpsk' | '8psk' | '16qam' | '32qam'
>;

export const GERAN_IQ_QUALIFICATION = 'standards-derived-engineering-projection' as const;
export const GERAN_NORMAL_SYMBOL_RATE_HZ = 1_625_000 / 6;
export const GERAN_HIGHER_SYMBOL_RATE_HZ = 325_000 as const;
export const GERAN_SLOT_SECONDS = 15 / 26_000;
export const GERAN_FRAME_SECONDS = 60 / 13_000;
export const GERAN_NORMAL_SLOT_SYMBOLS = 156.25 as const;
export const GERAN_HIGHER_SLOT_SYMBOLS = 187.5 as const;
export const GERAN_NORMAL_USEFUL_SYMBOLS = 147 as const;
export const GERAN_HIGHER_USEFUL_SYMBOLS = 176 as const;
export const GERAN_NORMAL_ACTIVE_SYMBOLS = 148 as const;
export const GERAN_HIGHER_ACTIVE_SYMBOLS = 177 as const;
export const GERAN_GMSK_BT = 0.3 as const;
export const GERAN_AQPSK_ALPHA_RADIANS = Math.PI / 4;
export const DEFAULT_GERAN_IQ_SEED = 407 as const;

/**
 * The TS 45.004 constellations and pulse equations are evaluated first, then
 * uniformly scaled for the unit-bounded cf32 API. This does not alter digital
 * geometry, relative constellation geometry, rotation, or pulse shape.
 */
export const GERAN_CF32_WIRE_SCALE = 0.1 as const;

// These match the bridge's existing cf32le producer limits. They are repeated
// here instead of imported from complex-iq.ts so that complex-iq.ts can import
// this module without creating an initialization cycle.
export const MIN_GERAN_IQ_SAMPLE_RATE_HZ = 1_000_000 as const;
export const MAX_GERAN_IQ_SAMPLE_RATE_HZ = 245_760_000 as const;
export const MIN_GERAN_IQ_BANDWIDTH_HZ = 1_000 as const;
export const MAX_GERAN_IQ_BANDWIDTH_HZ = 245_760_000 as const;
export const MAX_GERAN_IQ_SAMPLES = 65_536 as const;
export const GERAN_IQ_BYTES_PER_SAMPLE = 8 as const;
export const MAX_GERAN_IQ_BYTES = MAX_GERAN_IQ_SAMPLES * GERAN_IQ_BYTES_PER_SAMPLE;
export const MAX_GERAN_IQ_START_SAMPLE_INDEX = 0x7fff_ffff as const;

export const GERAN_IQ_DISCLOSURE =
  'Seed-invariant, content-addressed GERAN fixed-burst engineering projection. '
  + 'The TS 45.002 Release 19 burst fields, tail bits, selected TSC0 sequences and dummy burst are fixed exactly; '
  + 'the GMSK xCCH block is independently encode/decode matched to pinned libosmocore. '
  + 'QPSK, AQPSK, 8PSK, 16QAM and 32QAM stop at fixed modulator-input bits and remain unpromoted '
  + 'equation/roundtrip-tested digital vectors, with no TS 45.003 channel-coding claim. '
  + 'TS 45.004 mappings, rotations and pulse equations are numerically evaluated and uniformly cf32-scaled. '
  + 'This is not calibrated RF, a TS 45.005 conformance waveform, product qualification, or a universal network schedule.';

export interface GeranIqDefinition {
  readonly profile: GeranComplexIqProfile;
  readonly modulation: GeranIqModulation;
  readonly symbolRateHz: number;
  readonly bitsPerSymbol: number;
  readonly occupiedBandwidthHz: number;
  readonly slotSymbolPeriods: number;
  readonly usefulSymbolPeriods: number;
  readonly activeSymbolPeriods: number;
  readonly symbolRotationRadians: number;
  readonly timingModel: 'fixed-normal-and-dummy-every-slot' | 'fixed-ts0-one-of-eight';
  readonly pulseModel: 'gaussian-cpfsk-bt-0.3-ts-45.004' | 'linearised-gmsk-c0-ts-45.004-numerical';
  readonly digitalValidation: GeranDigitalValidation;
  readonly qualification: typeof GERAN_IQ_QUALIFICATION;
  readonly disclosure: typeof GERAN_IQ_DISCLOSURE;
}

interface InternalGeranIqDefinition extends GeranIqDefinition {
  /** Rotation in complete turns, kept rational in use to avoid phase drift. */
  readonly rotationTurnsPerSymbol: number;
}

function definition(
  profile: GeranComplexIqProfile,
  modulation: GeranIqModulation,
  symbolRateHz: number,
  bitsPerSymbol: number,
  occupiedBandwidthHz: number,
  slotSymbolPeriods: number,
  usefulSymbolPeriods: number,
  activeSymbolPeriods: number,
  rotationTurnsPerSymbol: number,
  timingModel: GeranIqDefinition['timingModel'],
  pulseModel: GeranIqDefinition['pulseModel'],
): InternalGeranIqDefinition {
  const vector = GERAN_FIXED_BURST_VECTORS[profile];
  if (vector.bitsPerSymbol !== bitsPerSymbol || vector.activeSymbols !== activeSymbolPeriods) {
    throw new Error(`${profile} fixed burst and analytic definition geometry disagree`);
  }
  return Object.freeze({
    profile,
    modulation,
    symbolRateHz,
    bitsPerSymbol,
    occupiedBandwidthHz,
    slotSymbolPeriods,
    usefulSymbolPeriods,
    activeSymbolPeriods,
    symbolRotationRadians: rotationTurnsPerSymbol * 2 * Math.PI,
    rotationTurnsPerSymbol,
    timingModel,
    pulseModel,
    digitalValidation: vector.digitalValidation,
    qualification: GERAN_IQ_QUALIFICATION,
    disclosure: GERAN_IQ_DISCLOSURE,
  });
}

/**
 * TS 45.004 V19.0.0 clauses 2, 3, 5 and 6 provide the symbol rates,
 * mappings, pulse equations and continuous rotations represented below.
 * TS 45.002 V19.0.0 clauses 5.2.3 and 5.2.6 provide the fixed burst fields.
 */
const INTERNAL_GERAN_IQ_DEFINITIONS: Readonly<Record<GeranComplexIqProfile, InternalGeranIqDefinition>> =
  Object.freeze({
    'gsm-900-loaded-bcch': definition(
      'gsm-900-loaded-bcch', 'gmsk', GERAN_NORMAL_SYMBOL_RATE_HZ, 1, 200_000,
      GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
      0, 'fixed-normal-and-dummy-every-slot', 'gaussian-cpfsk-bt-0.3-ts-45.004',
    ),
    'gsm-normal-burst': definition(
      'gsm-normal-burst', 'gmsk', GERAN_NORMAL_SYMBOL_RATE_HZ, 1, 200_000,
      GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
      0, 'fixed-ts0-one-of-eight', 'gaussian-cpfsk-bt-0.3-ts-45.004',
    ),
    'gsm-qpsk-higher-symbol-rate-burst': definition(
      'gsm-qpsk-higher-symbol-rate-burst', 'qpsk', GERAN_HIGHER_SYMBOL_RATE_HZ, 2, 325_000,
      GERAN_HIGHER_SLOT_SYMBOLS, GERAN_HIGHER_USEFUL_SYMBOLS, GERAN_HIGHER_ACTIVE_SYMBOLS,
      3 / 8, 'fixed-ts0-one-of-eight', 'linearised-gmsk-c0-ts-45.004-numerical',
    ),
    'gsm-aqpsk-normal-burst': definition(
      'gsm-aqpsk-normal-burst', 'aqpsk', GERAN_NORMAL_SYMBOL_RATE_HZ, 2, 250_000,
      GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
      1 / 4, 'fixed-ts0-one-of-eight', 'linearised-gmsk-c0-ts-45.004-numerical',
    ),
    'gsm-8psk-normal-burst': definition(
      'gsm-8psk-normal-burst', '8psk', GERAN_NORMAL_SYMBOL_RATE_HZ, 3, 250_000,
      GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
      3 / 16, 'fixed-ts0-one-of-eight', 'linearised-gmsk-c0-ts-45.004-numerical',
    ),
    'gsm-16qam-higher-symbol-rate-burst': definition(
      'gsm-16qam-higher-symbol-rate-burst', '16qam', GERAN_HIGHER_SYMBOL_RATE_HZ, 4, 325_000,
      GERAN_HIGHER_SLOT_SYMBOLS, GERAN_HIGHER_USEFUL_SYMBOLS, GERAN_HIGHER_ACTIVE_SYMBOLS,
      1 / 8, 'fixed-ts0-one-of-eight', 'linearised-gmsk-c0-ts-45.004-numerical',
    ),
    'gsm-32qam-higher-symbol-rate-burst': definition(
      'gsm-32qam-higher-symbol-rate-burst', '32qam', GERAN_HIGHER_SYMBOL_RATE_HZ, 5, 325_000,
      GERAN_HIGHER_SLOT_SYMBOLS, GERAN_HIGHER_USEFUL_SYMBOLS, GERAN_HIGHER_ACTIVE_SYMBOLS,
      -1 / 8, 'fixed-ts0-one-of-eight', 'linearised-gmsk-c0-ts-45.004-numerical',
    ),
  });

export const GERAN_IQ_DEFINITIONS: Readonly<Record<GeranComplexIqProfile, GeranIqDefinition>> =
  INTERNAL_GERAN_IQ_DEFINITIONS;

export interface GeranAnalyticSamplesInput {
  readonly profile: SynthesizedSignalProfile;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  /**
   * Retained for API compatibility and bounds checking. Fixed GERAN digital
   * vectors are deliberately seed-invariant.
   */
  readonly seed?: number;
  /** Absolute sample coordinate, allowing deterministic chunked generation. */
  readonly startSampleIndex?: number;
}

export interface GeranComplexIqSynthesisInput extends GeranAnalyticSamplesInput {
  /** Two-sided -3 dB bandwidth of the deterministic segment-local output filter. */
  readonly bandwidthHz: number;
}

interface ValidatedGeranInput {
  readonly definition: InternalGeranIqDefinition;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex: number;
}

interface GmskBurstState {
  readonly bits: string;
  /** Includes the transition back to a post-burst dummy one at index bits.length. */
  readonly alpha: Int8Array;
  readonly prefix: Int16Array;
}

/** Return true only for the seven closed GERAN profile IDs above. */
export function isGeranComplexIqProfile(profile: SynthesizedSignalProfile): profile is GeranComplexIqProfile {
  return GERAN_COMPLEX_IQ_PROFILES.some((candidate) => candidate === profile);
}

/**
 * Resolve and cross-check a GERAN engineering-I/Q definition against the live
 * catalog. Catalog drift fails closed instead of silently changing modulation.
 */
export function geranIqDefinition(profile: SynthesizedSignalProfile): GeranIqDefinition {
  const admitted = geranProfile(profile);
  const result = INTERNAL_GERAN_IQ_DEFINITIONS[admitted];
  const descriptor = waveformDescriptor(admitted);
  if (descriptor.family !== 'geran'
    || descriptor.projection.modulation !== result.modulation
    || descriptor.occupiedBandwidthHz !== result.occupiedBandwidthHz
    || (result.timingModel === 'fixed-normal-and-dummy-every-slot'
      ? descriptor.projection.timing !== 'continuous'
      : descriptor.projection.timing !== 'burst')) {
    throw new Error(`${admitted} GERAN complex-I/Q definition no longer matches its catalog descriptor`);
  }
  return result;
}

/**
 * Generate deterministic, interleaved [I,Q] float64 analytic samples.
 *
 * The digital sequence is selected only from the fixed, hashed vectors in
 * geran-fixed-bursts.ts. GMSK uses TS 45.004 differential data and BT=0.3
 * Gaussian CPFSK. Linear modes use the standard constellation mapping,
 * continuous symbol rotation and numerical evaluation of c0(t).
 */
export function synthesizeGeranAnalyticSamples(input: GeranAnalyticSamplesInput): Float64Array {
  const validated = validateGeranInput(input);
  const output = new Float64Array(validated.sampleCount * 2);
  const gmskStates = new Map<string, GmskBurstState>();

  for (let index = 0; index < validated.sampleCount; index += 1) {
    const absoluteSampleIndex = validated.startSampleIndex + index;
    const slotCoordinate = absoluteSampleIndex * 26_000 / (validated.sampleRateHz * 15);
    const slotIndex = Math.floor(slotCoordinate);
    const burst = geranScheduledBurst(validated.definition.profile, slotIndex);
    if (burst === undefined) continue;

    const symbolWithinSlot =
      (slotCoordinate - slotIndex) * validated.definition.slotSymbolPeriods;
    if (symbolWithinSlot < 0 || symbolWithinSlot >= burst.activeSymbols) continue;

    let sample: readonly [number, number];
    if (validated.definition.modulation === 'gmsk') {
      let state = gmskStates.get(burst.bits);
      if (state === undefined) {
        state = createGmskBurstState(burst.bits);
        gmskStates.set(burst.bits, state);
      }
      sample = gmskBurstSample(state, symbolWithinSlot);
    } else {
      sample = linearlyPulseShapedBurstSample(
        validated.definition,
        burst.bits,
        symbolWithinSlot,
      );
    }

    const inPhase = sample[0] * GERAN_CF32_WIRE_SCALE;
    const quadrature = sample[1] * GERAN_CF32_WIRE_SCALE;
    const magnitude = Math.hypot(inPhase, quadrature);
    if (!Number.isFinite(magnitude) || magnitude > 1 + 1e-12) {
      throw new Error(`${validated.definition.profile} produced a non-finite or non-unit-bounded analytic sample`);
    }
    output[index * 2] = inPhase;
    output[index * 2 + 1] = quadrature;
  }
  return output;
}

/**
 * Produce bounded interleaved little-endian cf32 I/Q. This direct API mirrors
 * complex-iq.ts so integration can delegate GERAN profiles without inventing
 * a second wire layout.
 */
export function synthesizeGeranComplexIq(input: GeranComplexIqSynthesisInput): Uint8Array {
  validateBandwidth(input.bandwidthHz, input.sampleRateHz);
  const analytic = synthesizeGeranAnalyticSamples(input);
  const feedForward = lowPassFeedForwardCoefficient(input.bandwidthHz, input.sampleRateHz);
  const bytes = new Uint8Array(input.sampleCount * GERAN_IQ_BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let previousInPhase = 0;
  let previousQuadrature = 0;
  for (let index = 0; index < input.sampleCount; index += 1) {
    const rawInPhase = analytic[index * 2]!;
    const rawQuadrature = analytic[index * 2 + 1]!;
    const inPhase = index === 0
      ? rawInPhase
      : previousInPhase + feedForward * (rawInPhase - previousInPhase);
    const quadrature = index === 0
      ? rawQuadrature
      : previousQuadrature + feedForward * (rawQuadrature - previousQuadrature);
    previousInPhase = inPhase;
    previousQuadrature = quadrature;
    writeUnitBoundedCf32le(view, index * GERAN_IQ_BYTES_PER_SAMPLE, inPhase, quadrature);
  }
  return bytes;
}

/**
 * Exact TS 45.004 memoryless constellation point before continuous rotation
 * and before the uniform cf32 wire scaling.
 */
export function geranConstellationPoint(
  modulation: Exclude<GeranIqModulation, 'gmsk'>,
  state: number,
): readonly [number, number] {
  const bitsPerSymbol = ({ qpsk: 2, aqpsk: 2, '8psk': 3, '16qam': 4, '32qam': 5 })[modulation];
  if (!Number.isSafeInteger(state) || state < 0 || state >= 2 ** bitsPerSymbol) {
    throw new RangeError(`${modulation} symbol state must be an integer from 0 through ${2 ** bitsPerSymbol - 1}`);
  }
  switch (modulation) {
    case 'qpsk': {
      const scale = Math.SQRT1_2;
      return [state & 2 ? -scale : scale, state & 1 ? -scale : scale];
    }
    case 'aqpsk': {
      const cosine = Math.cos(GERAN_AQPSK_ALPHA_RADIANS);
      const sine = Math.sin(GERAN_AQPSK_ALPHA_RADIANS);
      return [state & 2 ? -cosine : cosine, state & 1 ? -sine : sine];
    }
    case '8psk': {
      // TS 45.004 table 1, states 000 through 111 in MSB-first order.
      const mappedPhaseIndex = [3, 4, 2, 1, 6, 5, 7, 0] as const;
      const phase = 2 * Math.PI * mappedPhaseIndex[state]! / 8;
      return [Math.cos(phase), Math.sin(phase)];
    }
    case '16qam': {
      // TS 45.004 table 2, including its 1/sqrt(10) average-power scale.
      const inPhase = (state & 8 ? -1 : 1) * (state & 2 ? 3 : 1);
      const quadrature = (state & 4 ? -1 : 1) * (state & 1 ? 3 : 1);
      return [inPhase / Math.sqrt(10), quadrature / Math.sqrt(10)];
    }
    case '32qam': {
      // TS 45.004 table 3, including its 1/sqrt(20) average-power scale.
      const point = QAM32_POINTS[state]!;
      return [point[0] / Math.sqrt(20), point[1] / Math.sqrt(20)];
    }
  }
}

/** Apply the profile's TS 45.004 symbol-index rotation to one mapped point. */
export function geranRotatedConstellationPoint(
  profile: Exclude<GeranComplexIqProfile, 'gsm-900-loaded-bcch' | 'gsm-normal-burst'>,
  state: number,
  symbolIndex: number,
): readonly [number, number] {
  if (!Number.isSafeInteger(symbolIndex)) {
    throw new RangeError('GERAN symbol index must be a safe integer');
  }
  const definitionValue = INTERNAL_GERAN_IQ_DEFINITIONS[profile];
  if (definitionValue.modulation === 'gmsk') {
    throw new Error(`${profile} unexpectedly resolved to GMSK`);
  }
  const base = geranConstellationPoint(definitionValue.modulation, state);
  const rotationPeriod = rotationPeriodSymbols(definitionValue.rotationTurnsPerSymbol);
  const reducedIndex = positiveModulo(symbolIndex, rotationPeriod);
  const angle = 2 * Math.PI * definitionValue.rotationTurnsPerSymbol * reducedIndex;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [base[0] * cosine - base[1] * sine, base[0] * sine + base[1] * cosine];
}

/**
 * Numerical evaluation of TS 45.004 c0(t/T), clauses 3.5, 5.4 and 6.4.
 * The mathematical support is exactly 0 <= t/T <= 5.
 */
export function geranLinearizedGmskPulse(normalizedTime: number): number {
  if (!Number.isFinite(normalizedTime)) {
    throw new RangeError('GERAN normalized pulse time must be finite');
  }
  if (normalizedTime < 0 || normalizedTime > 5) return 0;
  let value = 1;
  for (let offset = 0; offset <= 3; offset += 1) {
    value *= linearizedGmskS(normalizedTime + offset);
  }
  return Math.max(0, value);
}

/** Read one MSB-first symbol state from a transmission-order bit string. */
export function geranSymbolState(bits: string, symbolIndex: number, bitsPerSymbol: number): number {
  if (!/^[01]+$/.test(bits)) throw new RangeError('GERAN symbol input must be a binary string');
  if (!Number.isSafeInteger(symbolIndex) || symbolIndex < 0) {
    throw new RangeError('GERAN symbol index must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(bitsPerSymbol) || bitsPerSymbol < 1 || bitsPerSymbol > 5) {
    throw new RangeError('GERAN bits per symbol must be an integer from 1 through 5');
  }
  const start = symbolIndex * bitsPerSymbol;
  if (start + bitsPerSymbol > bits.length) {
    throw new RangeError('GERAN symbol input does not contain the requested complete symbol');
  }
  let state = 0;
  for (let offset = 0; offset < bitsPerSymbol; offset += 1) {
    state = state * 2 + Number(bits[start + offset]!);
  }
  return state;
}

function validateGeranInput(input: GeranAnalyticSamplesInput): ValidatedGeranInput {
  const definitionValue = geranIqDefinition(input.profile) as InternalGeranIqDefinition;
  if (!Number.isSafeInteger(input.sampleRateHz)
    || input.sampleRateHz < MIN_GERAN_IQ_SAMPLE_RATE_HZ
    || input.sampleRateHz > MAX_GERAN_IQ_SAMPLE_RATE_HZ) {
    throw new RangeError(`GERAN complex-I/Q sample rate must be a safe integer from ${MIN_GERAN_IQ_SAMPLE_RATE_HZ} through ${MAX_GERAN_IQ_SAMPLE_RATE_HZ} Hz`);
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_GERAN_IQ_SAMPLES) {
    throw new RangeError(`GERAN complex-I/Q sample count must be a safe integer from 1 through ${MAX_GERAN_IQ_SAMPLES}`);
  }
  const seed = input.seed ?? DEFAULT_GERAN_IQ_SEED;
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffff_ffff) {
    throw new RangeError('GERAN complex-I/Q seed must be an integer from 1 through 0xffffffff');
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex)
    || startSampleIndex < 0
    || startSampleIndex > MAX_GERAN_IQ_START_SAMPLE_INDEX
    || startSampleIndex + input.sampleCount - 1 > MAX_GERAN_IQ_START_SAMPLE_INDEX) {
    throw new RangeError(`GERAN complex-I/Q start sample index and complete output must lie from 0 through ${MAX_GERAN_IQ_START_SAMPLE_INDEX}`);
  }
  const byteLength = input.sampleCount * GERAN_IQ_BYTES_PER_SAMPLE;
  if (!Number.isSafeInteger(byteLength) || byteLength > MAX_GERAN_IQ_BYTES) {
    throw new RangeError(`GERAN complex-I/Q payload may not exceed ${MAX_GERAN_IQ_BYTES} bytes`);
  }
  return {
    definition: definitionValue,
    sampleRateHz: input.sampleRateHz,
    sampleCount: input.sampleCount,
    startSampleIndex,
  };
}

function validateBandwidth(bandwidthHz: number, sampleRateHz: number): void {
  if (!Number.isSafeInteger(bandwidthHz)
    || bandwidthHz < MIN_GERAN_IQ_BANDWIDTH_HZ
    || bandwidthHz > MAX_GERAN_IQ_BANDWIDTH_HZ) {
    throw new RangeError(`GERAN complex-I/Q bandwidth must be a safe integer from ${MIN_GERAN_IQ_BANDWIDTH_HZ} through ${MAX_GERAN_IQ_BANDWIDTH_HZ} Hz`);
  }
  if (bandwidthHz > sampleRateHz) {
    throw new RangeError('GERAN complex-I/Q bandwidth may not exceed its sample rate');
  }
}

function geranProfile(value: SynthesizedSignalProfile): GeranComplexIqProfile {
  const profile = synthesizedSignalProfileSchema.parse(value);
  if (!isGeranComplexIqProfile(profile)) {
    throw new RangeError(`${profile} has no GERAN complex-I/Q engineering generator installed`);
  }
  return profile;
}

function createGmskBurstState(bits: string): GmskBurstState {
  if (!/^[01]+$/.test(bits)) throw new Error('GERAN GMSK burst contains a non-binary digit');
  const alpha = new Int8Array(bits.length + 1);
  const prefix = new Int16Array(alpha.length + 1);
  for (let index = 0; index <= bits.length; index += 1) {
    const currentBit = index < bits.length ? Number(bits[index]!) : 1;
    const previousBit = index === 0 ? 1 : Number(bits[index - 1]!);
    // TS 45.004 clause 2.3: d-hat_i = d_i XOR d_(i-1);
    alpha[index] = (currentBit ^ previousBit) === 0 ? 1 : -1;
    prefix[index + 1] = prefix[index]! + alpha[index]!;
  }
  return { bits, alpha, prefix };
}

function gmskBurstSample(state: GmskBurstState, symbolCoordinate: number): readonly [number, number] {
  const center = Math.floor(symbolCoordinate);
  const firstTransition = center - 10;
  const lastTransition = center + 10;
  let phaseUnits = gmskAlphaPrefix(state, firstTransition);
  for (let symbolIndex = firstTransition; symbolIndex <= lastTransition; symbolIndex += 1) {
    phaseUnits += gmskAlphaAt(state, symbolIndex)
      * gaussianPhaseResponse(symbolCoordinate - symbolIndex);
  }
  const phase = Math.PI / 2 * phaseUnits;
  return [Math.cos(phase), Math.sin(phase)];
}

function gmskAlphaAt(state: GmskBurstState, symbolIndex: number): number {
  if (symbolIndex < 0 || symbolIndex >= state.alpha.length) return 1;
  return state.alpha[symbolIndex]!;
}

/** Sum alpha[k] for every integer k in [0, exclusiveEnd), including negative ends. */
function gmskAlphaPrefix(state: GmskBurstState, exclusiveEnd: number): number {
  if (exclusiveEnd <= 0) return exclusiveEnd;
  if (exclusiveEnd <= state.alpha.length) return state.prefix[exclusiveEnd]!;
  return state.prefix[state.alpha.length]! + exclusiveEnd - state.alpha.length;
}

/**
 * Integrated BT=0.3 Gaussian-filtered rectangular frequency pulse, normalized
 * from zero to one. TS 45.004 uses the equivalent half-normalized q(t) form.
 */
function gaussianPhaseResponse(symbolTime: number): number {
  const sigma = Math.sqrt(Math.log(2)) / (2 * Math.PI * GERAN_GMSK_BT);
  const upper = (symbolTime + 0.5) / sigma;
  const lower = (symbolTime - 0.5) / sigma;
  const value = sigma * (normalIntegralPrimitive(upper) - normalIntegralPrimitive(lower));
  return Math.max(0, Math.min(1, value));
}

function normalIntegralPrimitive(value: number): number {
  return value * normalCdf(value) + normalDensity(value);
}

function linearlyPulseShapedBurstSample(
  definitionValue: InternalGeranIqDefinition,
  bits: string,
  symbolCoordinate: number,
): readonly [number, number] {
  const higherRate = definitionValue.symbolRateHz === GERAN_HIGHER_SYMBOL_RATE_HZ;
  const timeScale = higherRate
    ? GERAN_NORMAL_SYMBOL_RATE_HZ / GERAN_HIGHER_SYMBOL_RATE_HZ
    : 1;
  const pulseOffset = higherRate ? 2.5 : 2;
  const minimumSymbol = Math.max(
    0,
    Math.ceil(symbolCoordinate + pulseOffset - 5 / timeScale),
  );
  const maximumSymbol = Math.min(
    definitionValue.activeSymbolPeriods - 1,
    Math.floor(symbolCoordinate + pulseOffset),
  );
  let inPhase = 0;
  let quadrature = 0;
  for (let symbolIndex = minimumSymbol; symbolIndex <= maximumSymbol; symbolIndex += 1) {
    const normalizedPulseTime =
      (symbolCoordinate - symbolIndex + pulseOffset) * timeScale;
    const pulse = geranLinearizedGmskPulse(normalizedPulseTime);
    const state = geranSymbolState(bits, symbolIndex, definitionValue.bitsPerSymbol);
    const symbol = geranRotatedConstellationPoint(
      definitionValue.profile as Exclude<
        GeranComplexIqProfile,
        'gsm-900-loaded-bcch' | 'gsm-normal-burst'
      >,
      state,
      symbolIndex,
    );
    inPhase += symbol[0] * pulse;
    quadrature += symbol[1] * pulse;
  }
  return [inPhase, quadrature];
}

/**
 * TS 45.004 S(t/T) used to define c0. The Gaussian g integral is evaluated
 * analytically through the normal-Q primitive, avoiding sampled coefficients.
 */
function linearizedGmskS(normalizedTime: number): number {
  if (normalizedTime < 0 || normalizedTime > 8) return 0;
  if (normalizedTime <= 4) {
    return Math.sin(Math.PI * gaussianGIntegral(normalizedTime));
  }
  return Math.sin(Math.PI / 2 - Math.PI * gaussianGIntegral(normalizedTime - 4));
}

function gaussianGIntegral(normalizedTime: number): number {
  const k = 2 * Math.PI * GERAN_GMSK_BT / Math.sqrt(Math.log(2));
  const integral = 0.5 * (
    normalQIntegral(normalizedTime, 2.5, k)
    - normalQIntegral(normalizedTime, 1.5, k)
  );
  return Math.max(0, Math.min(0.5, integral));
}

function normalQIntegral(upper: number, center: number, scale: number): number {
  const upperValue = scale * (upper - center);
  const lowerValue = -scale * center;
  return (normalQPrimitive(upperValue) - normalQPrimitive(lowerValue)) / scale;
}

function normalQPrimitive(value: number): number {
  return value * normalQ(value) - normalDensity(value);
}

function normalQ(value: number): number {
  return 1 - normalCdf(value);
}

function normalDensity(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

// Abramowitz-Stegun 7.1.26, used only to evaluate the published equations.
function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * magnitude);
  const polynomial =
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-magnitude * magnitude));
}

const QAM32_POINTS = [
  [-3, -5], [-1, -5], [-3, 5], [-1, 5], [-5, -3], [-5, -1], [-5, 3], [-5, 1],
  [-1, -3], [-1, -1], [-1, 3], [-1, 1], [-3, -3], [-3, -1], [-3, 3], [-3, 1],
  [3, -5], [1, -5], [3, 5], [1, 5], [5, -3], [5, -1], [5, 3], [5, 1],
  [1, -3], [1, -1], [1, 3], [1, 1], [3, -3], [3, -1], [3, 3], [3, 1],
] as const;

function rotationPeriodSymbols(turnsPerSymbol: number): number {
  for (let period = 1; period <= 16; period += 1) {
    if (Math.abs(turnsPerSymbol * period - Math.round(turnsPerSymbol * period)) < 1e-12) return period;
  }
  throw new Error(`Unsupported non-rational GERAN symbol rotation ${turnsPerSymbol}`);
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
