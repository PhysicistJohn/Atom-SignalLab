/**
 * Corpus-only content-varying GERAN I/Q synthesis.
 *
 * This module deliberately does not modify the fixed catalog producer. It
 * holds a separate content seed and logical corpus-row coordinate, varies only
 * the payload fields allowed by the fixed burst geometry, and keeps tail bits,
 * training sequences, slot timing, modulation, and sample wire format fixed.
 * It is a corpus generator, not a public SignalLab waveform or a claim about
 * complete Layer-2/3 protocol semantics.
 */
import {
  onePoleLowPassAlphaForTwoSided3dbBandwidth as lowPassFeedForwardCoefficient,
  writeUnitBoundedCf32le,
} from '@atomos/dsp';
import { corpusContentBit, corpusContentWord, validateCorpusContentSeed } from './corpus-content-prng.js';
import {
  GERAN_FIXED_BURST_VECTORS,
  GERAN_GMSK_DUMMY_BURST,
  GERAN_GMSK_TSC0_SET1,
  type GeranFixedBurstProfile,
} from './geran-fixed-bursts.js';
import { encodeGeranXcchL2Block } from './geran-xcch-corpus-codec.js';

/**
 * This closed profile set deliberately duplicates the IDs at the corpus
 * boundary. Importing geran-iq.ts would pull catalog/measurement dependencies
 * into the Node corpus tool, which is both architecturally wrong and outside
 * the native TypeScript loader's supported syntax.
 */
export const GERAN_CORPUS_PROFILES = [
  'gsm-900-loaded-bcch',
  'gsm-normal-burst',
  'gsm-qpsk-higher-symbol-rate-burst',
  'gsm-aqpsk-normal-burst',
  'gsm-8psk-normal-burst',
  'gsm-16qam-higher-symbol-rate-burst',
  'gsm-32qam-higher-symbol-rate-burst',
] as const satisfies readonly GeranFixedBurstProfile[];

export type GeranCorpusProfile = typeof GERAN_CORPUS_PROFILES[number];
type GeranCorpusModulation = 'gmsk' | 'qpsk' | 'aqpsk' | '8psk' | '16qam' | '32qam';

const GERAN_NORMAL_SYMBOL_RATE_HZ = 1_625_000 / 6;
const GERAN_HIGHER_SYMBOL_RATE_HZ = 325_000 as const;
const GERAN_SLOT_SECONDS = 15 / 26_000;
const GERAN_NORMAL_SLOT_SYMBOLS = 156.25 as const;
const GERAN_HIGHER_SLOT_SYMBOLS = 187.5 as const;
const GERAN_NORMAL_ACTIVE_SYMBOLS = 148 as const;
const GERAN_HIGHER_ACTIVE_SYMBOLS = 177 as const;
const GERAN_GMSK_BT = 0.3 as const;
const GERAN_CF32_WIRE_SCALE = 0.1 as const;
const GERAN_IQ_BYTES_PER_SAMPLE = 8 as const;
const MIN_GERAN_IQ_SAMPLE_RATE_HZ = 1_000_000 as const;
const MAX_GERAN_IQ_SAMPLE_RATE_HZ = 245_760_000 as const;
const MIN_GERAN_IQ_BANDWIDTH_HZ = 1_000 as const;
const MAX_GERAN_IQ_BANDWIDTH_HZ = 245_760_000 as const;
const MAX_GERAN_IQ_SAMPLES = 65_536 as const;
const MAX_GERAN_IQ_START_SAMPLE_INDEX = 0x7fff_ffff as const;

export interface GeranCorpusContentInput {
  readonly profile: GeranCorpusProfile;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  /** Stable corpus-content seed, separate from public generator seeds. */
  readonly contentSeed: number;
  /** Logical corpus row that domains the payload independently of time origin. */
  readonly contentRowIndex: number;
  /** Absolute sample coordinate for exact chunked capture synthesis. */
  readonly startSampleIndex?: number;
}

export interface GeranCorpusContentIqInput extends GeranCorpusContentInput {
  readonly bandwidthHz: number;
}

export interface GeranCorpusScheduledBurstInput {
  readonly profile: GeranCorpusProfile;
  readonly contentSeed: number;
  readonly contentRowIndex: number;
  readonly slotIndex: number;
}

interface CorpusProfileGeometry {
  readonly modulation: GeranCorpusModulation;
  readonly symbolRateHz: number;
  readonly slotSymbolPeriods: number;
  readonly activeSymbols: number;
  readonly timing: 'loaded-every-slot' | 'ts0-only';
}

interface ValidatedCorpusInput extends CorpusProfileGeometry {
  readonly profile: GeranCorpusProfile;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly contentSeed: number;
  readonly contentRowIndex: number;
  readonly startSampleIndex: number;
}

interface GmskBurstState {
  readonly bits: string;
  readonly alpha: Int8Array;
  readonly prefix: Int16Array;
}

const CORPUS_GEOMETRY: Readonly<Record<GeranCorpusProfile, CorpusProfileGeometry>> = Object.freeze({
  'gsm-900-loaded-bcch': {
    modulation: 'gmsk', symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
    slotSymbolPeriods: GERAN_NORMAL_SLOT_SYMBOLS, activeSymbols: GERAN_NORMAL_ACTIVE_SYMBOLS,
    timing: 'loaded-every-slot',
  },
  'gsm-normal-burst': {
    modulation: 'gmsk', symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
    slotSymbolPeriods: GERAN_NORMAL_SLOT_SYMBOLS, activeSymbols: GERAN_NORMAL_ACTIVE_SYMBOLS,
    timing: 'ts0-only',
  },
  'gsm-qpsk-higher-symbol-rate-burst': {
    modulation: 'qpsk', symbolRateHz: GERAN_HIGHER_SYMBOL_RATE_HZ,
    slotSymbolPeriods: GERAN_HIGHER_SLOT_SYMBOLS, activeSymbols: GERAN_HIGHER_ACTIVE_SYMBOLS,
    timing: 'ts0-only',
  },
  'gsm-aqpsk-normal-burst': {
    modulation: 'aqpsk', symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
    slotSymbolPeriods: GERAN_NORMAL_SLOT_SYMBOLS, activeSymbols: GERAN_NORMAL_ACTIVE_SYMBOLS,
    timing: 'ts0-only',
  },
  'gsm-8psk-normal-burst': {
    modulation: '8psk', symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
    slotSymbolPeriods: GERAN_NORMAL_SLOT_SYMBOLS, activeSymbols: GERAN_NORMAL_ACTIVE_SYMBOLS,
    timing: 'ts0-only',
  },
  'gsm-16qam-higher-symbol-rate-burst': {
    modulation: '16qam', symbolRateHz: GERAN_HIGHER_SYMBOL_RATE_HZ,
    slotSymbolPeriods: GERAN_HIGHER_SLOT_SYMBOLS, activeSymbols: GERAN_HIGHER_ACTIVE_SYMBOLS,
    timing: 'ts0-only',
  },
  'gsm-32qam-higher-symbol-rate-burst': {
    modulation: '32qam', symbolRateHz: GERAN_HIGHER_SYMBOL_RATE_HZ,
    slotSymbolPeriods: GERAN_HIGHER_SLOT_SYMBOLS, activeSymbols: GERAN_HIGHER_ACTIVE_SYMBOLS,
    timing: 'ts0-only',
  },
});

/**
 * Return one physical transmission-order burst for a corpus row, or undefined
 * when the closed GERAN schedule has no burst in that timeslot.
 */
export function geranCorpusScheduledBurstBits(input: GeranCorpusScheduledBurstInput): string | undefined {
  const geometry = validateScheduledBurstInput(input);
  const timeslot = input.slotIndex % 8;
  const frameIndex = Math.floor(input.slotIndex / 8);
  if (geometry.timing === 'loaded-every-slot' && timeslot !== 0) return GERAN_GMSK_DUMMY_BURST;
  if (geometry.timing === 'ts0-only' && timeslot !== 0) return undefined;
  if (geometry.modulation === 'gmsk') {
    const blockIndex = Math.floor(frameIndex / 4);
    const encoded = encodedXcchBlock(input.profile, input.contentSeed, input.contentRowIndex, blockIndex);
    const eB = encoded[frameIndex % 4]!;
    return `000${eB.slice(0, 58)}${GERAN_GMSK_TSC0_SET1}${eB.slice(58)}000`;
  }
  return higherOrderCorpusBurstBits(input.profile, input.contentSeed, input.contentRowIndex, frameIndex);
}

/**
 * Generate deterministic, content-varying interleaved float64 analytic I/Q.
 * The result is exact across chunks with the same content seed and row index.
 */
export function synthesizeGeranCorpusAnalyticSamples(input: GeranCorpusContentInput): Float64Array {
  const validated = validateCorpusInput(input);
  const output = new Float64Array(validated.sampleCount * 2);
  const states = new Map<string, GmskBurstState>();
  for (let index = 0; index < validated.sampleCount; index += 1) {
    const absoluteSampleIndex = validated.startSampleIndex + index;
    const slotCoordinate = absoluteSampleIndex / (validated.sampleRateHz * GERAN_SLOT_SECONDS);
    const slotIndex = Math.floor(slotCoordinate);
    const bits = geranCorpusScheduledBurstBits({
      profile: validated.profile,
      contentSeed: validated.contentSeed,
      contentRowIndex: validated.contentRowIndex,
      slotIndex,
    });
    if (bits === undefined) continue;
    const symbolWithinSlot = (slotCoordinate - slotIndex) * validated.slotSymbolPeriods;
    if (symbolWithinSlot < 0 || symbolWithinSlot >= validated.activeSymbols) continue;
    const sample = validated.modulation === 'gmsk'
      ? corpusGmskSample(states, bits, symbolWithinSlot)
      : corpusLinearSample(validated.profile, validated, bits, symbolWithinSlot);
    const inPhase = sample[0] * GERAN_CF32_WIRE_SCALE;
    const quadrature = sample[1] * GERAN_CF32_WIRE_SCALE;
    if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature) || Math.hypot(inPhase, quadrature) > 1 + 1e-12) {
      throw new Error(`${validated.profile} corpus generator produced a non-finite or non-unit-bounded analytic sample`);
    }
    output[index * 2] = inPhase;
    output[index * 2 + 1] = quadrature;
  }
  return output;
}

/** Produce bounded cf32le using the same segment-local output filter as SignalLab's GERAN API. */
export function synthesizeGeranCorpusContentIq(input: GeranCorpusContentIqInput): Uint8Array {
  validateBandwidth(input.bandwidthHz, input.sampleRateHz);
  const analytic = synthesizeGeranCorpusAnalyticSamples(input);
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

function validateScheduledBurstInput(input: GeranCorpusScheduledBurstInput): CorpusProfileGeometry {
  const geometry = CORPUS_GEOMETRY[input.profile];
  if (geometry === undefined) throw new RangeError(`${input.profile} has no corpus GERAN generator`);
  validateCorpusContentSeed(input.contentSeed);
  if (!Number.isSafeInteger(input.contentRowIndex) || input.contentRowIndex < 0) {
    throw new RangeError('GERAN corpus content row index must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(input.slotIndex) || input.slotIndex < 0) {
    throw new RangeError('GERAN corpus slot index must be a non-negative safe integer');
  }
  return geometry;
}

function validateCorpusInput(input: GeranCorpusContentInput): ValidatedCorpusInput {
  const geometry = validateScheduledBurstInput({
    profile: input.profile,
    contentSeed: input.contentSeed,
    contentRowIndex: input.contentRowIndex,
    slotIndex: 0,
  });
  if (!Number.isSafeInteger(input.sampleRateHz)
    || input.sampleRateHz < MIN_GERAN_IQ_SAMPLE_RATE_HZ
    || input.sampleRateHz > MAX_GERAN_IQ_SAMPLE_RATE_HZ) {
    throw new RangeError(`GERAN corpus sample rate must be a safe integer from ${MIN_GERAN_IQ_SAMPLE_RATE_HZ} through ${MAX_GERAN_IQ_SAMPLE_RATE_HZ} Hz`);
  }
  if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 1 || input.sampleCount > MAX_GERAN_IQ_SAMPLES) {
    throw new RangeError(`GERAN corpus sample count must be an integer from 1 through ${MAX_GERAN_IQ_SAMPLES}`);
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex)
    || startSampleIndex < 0
    || startSampleIndex > MAX_GERAN_IQ_START_SAMPLE_INDEX
    || startSampleIndex + input.sampleCount - 1 > MAX_GERAN_IQ_START_SAMPLE_INDEX) {
    throw new RangeError(`GERAN corpus start sample index and complete output must lie from 0 through ${MAX_GERAN_IQ_START_SAMPLE_INDEX}`);
  }
  return {
    ...geometry,
    profile: input.profile,
    sampleRateHz: input.sampleRateHz,
    sampleCount: input.sampleCount,
    contentSeed: validateCorpusContentSeed(input.contentSeed),
    contentRowIndex: input.contentRowIndex,
    startSampleIndex,
  };
}

function validateBandwidth(bandwidthHz: number, sampleRateHz: number): void {
  if (!Number.isSafeInteger(bandwidthHz)
    || bandwidthHz < MIN_GERAN_IQ_BANDWIDTH_HZ
    || bandwidthHz > MAX_GERAN_IQ_BANDWIDTH_HZ) {
    throw new RangeError(`GERAN corpus bandwidth must be a safe integer from ${MIN_GERAN_IQ_BANDWIDTH_HZ} through ${MAX_GERAN_IQ_BANDWIDTH_HZ} Hz`);
  }
  if (bandwidthHz > sampleRateHz) throw new RangeError('GERAN corpus bandwidth may not exceed its sample rate');
}

function encodedXcchBlock(
  profile: GeranCorpusProfile,
  contentSeed: number,
  contentRowIndex: number,
  blockIndex: number,
): readonly string[] {
  const l2 = new Uint8Array(23);
  const namespace = `${profile}|corpus-row=${contentRowIndex}|xcch-l2`;
  for (let byte = 0; byte < l2.length; byte += 1) {
    l2[byte] = corpusContentWord(contentSeed, namespace, blockIndex * l2.length + byte) & 0xff;
  }
  return encodeGeranXcchL2Block(l2);
}

function higherOrderCorpusBurstBits(
  profile: GeranCorpusProfile,
  contentSeed: number,
  contentRowIndex: number,
  frameIndex: number,
): string {
  const fixed = GERAN_FIXED_BURST_VECTORS[profile];
  const tailBits = fixed.tailBitsPerSide;
  const encryptedBits = fixed.encryptedBitsPerSide;
  const prefix = fixed.bits.slice(0, tailBits);
  const trainingStart = tailBits + encryptedBits;
  const training = fixed.bits.slice(trainingStart, trainingStart + fixed.trainingBits.length);
  const suffix = fixed.bits.slice(fixed.bits.length - tailBits);
  const namespace = `${profile}|corpus-row=${contentRowIndex}|encrypted-field`;
  const left = contentBits(contentSeed, namespace, frameIndex, 0, encryptedBits);
  const right = contentBits(contentSeed, namespace, frameIndex, 1, encryptedBits);
  const result = `${prefix}${left}${training}${right}${suffix}`;
  if (result.length !== fixed.bits.length) throw new Error(`${profile} corpus burst geometry drifted`);
  return result;
}

function contentBits(
  contentSeed: number,
  namespace: string,
  frameIndex: number,
  side: number,
  count: number,
): string {
  const origin = (frameIndex * 2 + side) * count;
  let bits = '';
  for (let index = 0; index < count; index += 1) {
    bits += corpusContentBit(contentSeed, namespace, origin + index);
  }
  return bits;
}

function corpusGmskSample(
  states: Map<string, GmskBurstState>,
  bits: string,
  symbolCoordinate: number,
): readonly [number, number] {
  let state = states.get(bits);
  if (state === undefined) {
    state = createGmskBurstState(bits);
    states.set(bits, state);
  }
  const center = Math.floor(symbolCoordinate);
  const firstTransition = center - 10;
  const lastTransition = center + 10;
  let phaseUnits = gmskAlphaPrefix(state, firstTransition);
  for (let symbolIndex = firstTransition; symbolIndex <= lastTransition; symbolIndex += 1) {
    phaseUnits += gmskAlphaAt(state, symbolIndex) * gaussianPhaseResponse(symbolCoordinate - symbolIndex);
  }
  const phase = Math.PI / 2 * phaseUnits;
  return [Math.cos(phase), Math.sin(phase)];
}

function createGmskBurstState(bits: string): GmskBurstState {
  const alpha = new Int8Array(bits.length + 1);
  const prefix = new Int16Array(alpha.length + 1);
  for (let index = 0; index <= bits.length; index += 1) {
    const currentBit = index < bits.length ? Number(bits[index]!) : 1;
    const previousBit = index === 0 ? 1 : Number(bits[index - 1]!);
    alpha[index] = (currentBit ^ previousBit) === 0 ? 1 : -1;
    prefix[index + 1] = prefix[index]! + alpha[index]!;
  }
  return { bits, alpha, prefix };
}

function gmskAlphaAt(state: GmskBurstState, symbolIndex: number): number {
  if (symbolIndex < 0 || symbolIndex >= state.alpha.length) return 1;
  return state.alpha[symbolIndex]!;
}

function gmskAlphaPrefix(state: GmskBurstState, exclusiveEnd: number): number {
  if (exclusiveEnd <= 0) return exclusiveEnd;
  if (exclusiveEnd <= state.alpha.length) return state.prefix[exclusiveEnd]!;
  return state.prefix[state.alpha.length]! + exclusiveEnd - state.alpha.length;
}

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

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function normalDensity(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * magnitude);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t);
  return sign * (1 - polynomial * Math.exp(-magnitude * magnitude));
}

/** Corpus-local copy of the TS 45.004 c0 equation used by linear modes. */
function corpusLinearizedGmskPulse(normalizedTime: number): number {
  if (normalizedTime < 0 || normalizedTime > 5) return 0;
  let value = 1;
  for (let offset = 0; offset <= 3; offset += 1) {
    value *= linearizedGmskS(normalizedTime + offset);
  }
  return Math.max(0, value);
}

function linearizedGmskS(normalizedTime: number): number {
  if (normalizedTime < 0 || normalizedTime > 8) return 0;
  if (normalizedTime <= 4) return Math.sin(Math.PI * gaussianGIntegral(normalizedTime));
  return Math.sin(Math.PI / 2 - Math.PI * gaussianGIntegral(normalizedTime - 4));
}

function gaussianGIntegral(normalizedTime: number): number {
  const scale = 2 * Math.PI * GERAN_GMSK_BT / Math.sqrt(Math.log(2));
  const integral = 0.5 * (
    normalQIntegral(normalizedTime, 2.5, scale) - normalQIntegral(normalizedTime, 1.5, scale)
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

function corpusSymbolState(bits: string, symbolIndex: number, bitsPerSymbol: number): number {
  const start = symbolIndex * bitsPerSymbol;
  if (!Number.isSafeInteger(symbolIndex) || symbolIndex < 0 || start + bitsPerSymbol > bits.length) {
    throw new RangeError('GERAN corpus burst does not contain the requested complete symbol');
  }
  let state = 0;
  for (let offset = 0; offset < bitsPerSymbol; offset += 1) {
    state = state * 2 + Number(bits[start + offset]!);
  }
  return state;
}

function corpusRotatedConstellationPoint(
  profile: Exclude<GeranCorpusProfile, 'gsm-900-loaded-bcch' | 'gsm-normal-burst'>,
  state: number,
  symbolIndex: number,
): readonly [number, number] {
  const modulation = CORPUS_GEOMETRY[profile].modulation;
  if (modulation === 'gmsk') throw new Error(`${profile} cannot use a linear constellation`);
  const point = corpusConstellationPoint(modulation, state);
  const turns = ({
    'gsm-qpsk-higher-symbol-rate-burst': 3 / 8,
    'gsm-aqpsk-normal-burst': 1 / 4,
    'gsm-8psk-normal-burst': 3 / 16,
    'gsm-16qam-higher-symbol-rate-burst': 1 / 8,
    'gsm-32qam-higher-symbol-rate-burst': -1 / 8,
  } as const)[profile];
  const period = rotationPeriodSymbols(turns);
  const angle = 2 * Math.PI * turns * positiveModulo(symbolIndex, period);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine];
}

function corpusConstellationPoint(
  modulation: Exclude<GeranCorpusModulation, 'gmsk'>,
  state: number,
): readonly [number, number] {
  const bitsPerSymbol = ({ qpsk: 2, aqpsk: 2, '8psk': 3, '16qam': 4, '32qam': 5 })[modulation];
  if (!Number.isSafeInteger(state) || state < 0 || state >= 2 ** bitsPerSymbol) {
    throw new RangeError(`${modulation} corpus symbol state is outside its constellation`);
  }
  switch (modulation) {
    case 'qpsk': {
      const scale = Math.SQRT1_2;
      return [state & 2 ? -scale : scale, state & 1 ? -scale : scale];
    }
    case 'aqpsk': {
      const cosine = Math.cos(Math.PI / 4);
      const sine = Math.sin(Math.PI / 4);
      return [state & 2 ? -cosine : cosine, state & 1 ? -sine : sine];
    }
    case '8psk': {
      const phaseIndex = [3, 4, 2, 1, 6, 5, 7, 0] as const;
      const phase = 2 * Math.PI * phaseIndex[state]! / 8;
      return [Math.cos(phase), Math.sin(phase)];
    }
    case '16qam': {
      const inPhase = (state & 8 ? -1 : 1) * (state & 2 ? 3 : 1);
      const quadrature = (state & 4 ? -1 : 1) * (state & 1 ? 3 : 1);
      return [inPhase / Math.sqrt(10), quadrature / Math.sqrt(10)];
    }
    case '32qam': {
      const point = QAM32_POINTS[state]!;
      return [point[0] / Math.sqrt(20), point[1] / Math.sqrt(20)];
    }
  }
}

function rotationPeriodSymbols(turnsPerSymbol: number): number {
  for (let period = 1; period <= 16; period += 1) {
    if (Math.abs(turnsPerSymbol * period - Math.round(turnsPerSymbol * period)) < 1e-12) return period;
  }
  throw new Error(`Unsupported corpus GERAN symbol rotation ${turnsPerSymbol}`);
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

const QAM32_POINTS = [
  [-3, -5], [-1, -5], [-3, 5], [-1, 5], [-5, -3], [-5, -1], [-5, 3], [-5, 1],
  [-1, -3], [-1, -1], [-1, 3], [-1, 1], [-3, -3], [-3, -1], [-3, 3], [-3, 1],
  [3, -5], [1, -5], [3, 5], [1, 5], [5, -3], [5, -1], [5, 3], [5, 1],
  [1, -3], [1, -1], [1, 3], [1, 1], [3, -3], [3, -1], [3, 3], [3, 1],
] as const;

function corpusLinearSample(
  profile: GeranCorpusProfile,
  geometry: CorpusProfileGeometry,
  bits: string,
  symbolCoordinate: number,
): readonly [number, number] {
  const higherRate = geometry.symbolRateHz === GERAN_HIGHER_SYMBOL_RATE_HZ;
  const timeScale = higherRate ? GERAN_NORMAL_SYMBOL_RATE_HZ / GERAN_HIGHER_SYMBOL_RATE_HZ : 1;
  const pulseOffset = higherRate ? 2.5 : 2;
  const minimumSymbol = Math.max(0, Math.ceil(symbolCoordinate + pulseOffset - 5 / timeScale));
  const maximumSymbol = Math.min(geometry.activeSymbols - 1, Math.floor(symbolCoordinate + pulseOffset));
  let inPhase = 0;
  let quadrature = 0;
  for (let symbolIndex = minimumSymbol; symbolIndex <= maximumSymbol; symbolIndex += 1) {
    const pulse = corpusLinearizedGmskPulse((symbolCoordinate - symbolIndex + pulseOffset) * timeScale);
    const state = corpusSymbolState(bits, symbolIndex, GERAN_FIXED_BURST_VECTORS[profile].bitsPerSymbol);
    const symbol = corpusRotatedConstellationPoint(
      profile as Exclude<GeranCorpusProfile, 'gsm-900-loaded-bcch' | 'gsm-normal-burst'>,
      state,
      symbolIndex,
    );
    inPhase += symbol[0] * pulse;
    quadrature += symbol[1] * pulse;
  }
  return [inPhase, quadrature];
}
