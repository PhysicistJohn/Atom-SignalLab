import {
  synthesizedSignalProfileSchema,
  type SynthesizedSignalProfile,
  type WaveformProjection,
} from './contracts.js';
import { waveformDescriptor } from './catalog.js';

/** Every GERAN profile currently admitted by the closed SignalLab catalog. */
export const GERAN_COMPLEX_IQ_PROFILES = [
  'gsm-900-loaded-bcch',
  'gsm-normal-burst',
  'gsm-qpsk-higher-symbol-rate-burst',
  'gsm-aqpsk-normal-burst',
  'gsm-8psk-normal-burst',
  'gsm-16qam-higher-symbol-rate-burst',
  'gsm-32qam-higher-symbol-rate-burst',
] as const;

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
export const DEFAULT_GERAN_IQ_SEED = 407 as const;

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
  'Deterministic standards-derived GERAN complex-baseband engineering projection. '
  + 'It preserves the catalogued symbol rate, constellation family/rotation, and declared TDMA burst geometry, '
  + 'but uses synthetic payload symbols and an engineering pulse approximation. It is not bit-exact, '
  + 'protocol-decodable, calibrated, conformance-validated, or suitable as a 3GPP test vector.';

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
  readonly timingModel: 'continuous-loaded-slots' | 'one-of-eight-tdma-engineering';
  readonly pulseModel: 'gaussian-cpfsk-bt-0.3' | 'linearised-gmsk-pulse-engineering-approximation';
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
    qualification: GERAN_IQ_QUALIFICATION,
    disclosure: GERAN_IQ_DISCLOSURE,
  });
}

/**
 * TS 45.004 v19.0.0 clauses 2, 3, 5 and 6 provide the symbol rates,
 * mappings and continuous rotations represented below. TS 45.002 v19.0.0
 * clause 5.2.3 supplies the normal/higher-rate burst structures.
 *
 * The loaded-BCCH entry is deliberately an engineering always-loaded carrier;
 * the other entries use the scalar replay's explicit one-active-slot-per-frame
 * schedule. Neither schedule claims to reproduce a decoded traffic channel.
 */
const INTERNAL_GERAN_IQ_DEFINITIONS: Readonly<Record<GeranComplexIqProfile, InternalGeranIqDefinition>> = Object.freeze({
  'gsm-900-loaded-bcch': definition(
    'gsm-900-loaded-bcch', 'gmsk', GERAN_NORMAL_SYMBOL_RATE_HZ, 1, 200_000,
    GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
    0, 'continuous-loaded-slots', 'gaussian-cpfsk-bt-0.3',
  ),
  'gsm-normal-burst': definition(
    'gsm-normal-burst', 'gmsk', GERAN_NORMAL_SYMBOL_RATE_HZ, 1, 200_000,
    GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
    0, 'one-of-eight-tdma-engineering', 'gaussian-cpfsk-bt-0.3',
  ),
  'gsm-qpsk-higher-symbol-rate-burst': definition(
    'gsm-qpsk-higher-symbol-rate-burst', 'qpsk', GERAN_HIGHER_SYMBOL_RATE_HZ, 2, 325_000,
    GERAN_HIGHER_SLOT_SYMBOLS, GERAN_HIGHER_USEFUL_SYMBOLS, GERAN_HIGHER_ACTIVE_SYMBOLS,
    3 / 8, 'one-of-eight-tdma-engineering', 'linearised-gmsk-pulse-engineering-approximation',
  ),
  'gsm-aqpsk-normal-burst': definition(
    'gsm-aqpsk-normal-burst', 'aqpsk', GERAN_NORMAL_SYMBOL_RATE_HZ, 2, 250_000,
    GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
    1 / 4, 'one-of-eight-tdma-engineering', 'linearised-gmsk-pulse-engineering-approximation',
  ),
  'gsm-8psk-normal-burst': definition(
    'gsm-8psk-normal-burst', '8psk', GERAN_NORMAL_SYMBOL_RATE_HZ, 3, 250_000,
    GERAN_NORMAL_SLOT_SYMBOLS, GERAN_NORMAL_USEFUL_SYMBOLS, GERAN_NORMAL_ACTIVE_SYMBOLS,
    3 / 16, 'one-of-eight-tdma-engineering', 'linearised-gmsk-pulse-engineering-approximation',
  ),
  'gsm-16qam-higher-symbol-rate-burst': definition(
    'gsm-16qam-higher-symbol-rate-burst', '16qam', GERAN_HIGHER_SYMBOL_RATE_HZ, 4, 325_000,
    GERAN_HIGHER_SLOT_SYMBOLS, GERAN_HIGHER_USEFUL_SYMBOLS, GERAN_HIGHER_ACTIVE_SYMBOLS,
    1 / 8, 'one-of-eight-tdma-engineering', 'linearised-gmsk-pulse-engineering-approximation',
  ),
  'gsm-32qam-higher-symbol-rate-burst': definition(
    'gsm-32qam-higher-symbol-rate-burst', '32qam', GERAN_HIGHER_SYMBOL_RATE_HZ, 5, 325_000,
    GERAN_HIGHER_SLOT_SYMBOLS, GERAN_HIGHER_USEFUL_SYMBOLS, GERAN_HIGHER_ACTIVE_SYMBOLS,
    -1 / 8, 'one-of-eight-tdma-engineering', 'linearised-gmsk-pulse-engineering-approximation',
  ),
});

export const GERAN_IQ_DEFINITIONS: Readonly<Record<GeranComplexIqProfile, GeranIqDefinition>> =
  INTERNAL_GERAN_IQ_DEFINITIONS;

export interface GeranAnalyticSamplesInput {
  readonly profile: SynthesizedSignalProfile;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
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
  readonly seed: number;
  readonly startSampleIndex: number;
}

interface GmskSequence {
  readonly alpha: Int8Array;
  readonly prefix: Int16Array;
  readonly cycleSum: number;
  readonly initialPhase: number;
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
    || (result.timingModel === 'continuous-loaded-slots'
      ? descriptor.projection.timing !== 'continuous'
      : descriptor.projection.timing !== 'burst')) {
    throw new Error(`${admitted} GERAN complex-I/Q definition no longer matches its catalog descriptor`);
  }
  return result;
}

/**
 * Generate normalized interleaved [I,Q] float64 analytic samples.
 *
 * GMSK uses differential symbols and a BT=0.3 Gaussian CPFSK phase response
 * with modulation index 1/2. The linear modes use their TS 45.004 constellation
 * geometry and continuous symbol rotation, passed through a positive,
 * finite-support approximation of the standard's linearised-GMSK pulse. The
 * approximation is deliberately identified as engineering—not conformance I/Q.
 */
export function synthesizeGeranAnalyticSamples(input: GeranAnalyticSamplesInput): Float64Array {
  const validated = validateGeranInput(input);
  const output = new Float64Array(validated.sampleCount * 2);
  const gmsk = validated.definition.modulation === 'gmsk'
    ? createGmskSequence(validated.seed)
    : undefined;

  for (let index = 0; index < validated.sampleCount; index += 1) {
    const absoluteSampleIndex = validated.startSampleIndex + index;
    const coordinate = absoluteSampleIndex / validated.sampleRateHz * validated.definition.symbolRateHz;
    const envelope = burstEnvelope(validated.definition, absoluteSampleIndex, validated.sampleRateHz);
    let inPhase = 0;
    let quadrature = 0;
    if (envelope > 0) {
      const sample = gmsk
        ? gmskSample(gmsk, coordinate)
        : linearlyPulseShapedSample(validated.definition, coordinate, validated.seed);
      const phaseOffset = validated.definition.timingModel === 'one-of-eight-tdma-engineering'
        ? deterministicBurstPhase(validated.seed, absoluteSampleIndex, validated.sampleRateHz)
        : 0;
      const cosine = Math.cos(phaseOffset);
      const sine = Math.sin(phaseOffset);
      inPhase = envelope * (sample[0] * cosine - sample[1] * sine);
      quadrature = envelope * (sample[0] * sine + sample[1] * cosine);
    }
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
  return { definition: definitionValue, sampleRateHz: input.sampleRateHz, sampleCount: input.sampleCount, seed, startSampleIndex };
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

function burstEnvelope(
  definitionValue: InternalGeranIqDefinition,
  absoluteSampleIndex: number,
  sampleRateHz: number,
): number {
  if (definitionValue.timingModel === 'continuous-loaded-slots') return 1;
  const slotCoordinate = absoluteSampleIndex * 26_000 / (sampleRateHz * 15);
  const slotIndex = Math.floor(slotCoordinate);
  if (positiveModulo(slotIndex, 8) !== 0) return 0;
  const symbolWithinSlot = (slotCoordinate - slotIndex) * definitionValue.slotSymbolPeriods;
  if (symbolWithinSlot < 0 || symbolWithinSlot >= definitionValue.activeSymbolPeriods) return 0;
  // TS 45.004 depicts the active interval with one half-symbol beyond the
  // useful interval at each edge. A deterministic raised-cosine power ramp is
  // an explicit engineering choice because the normative ramp is not supplied
  // by the catalog and this output is not a conformance vector.
  const distanceFromEdge = Math.min(symbolWithinSlot, definitionValue.activeSymbolPeriods - symbolWithinSlot);
  if (distanceFromEdge >= 0.5) return 1;
  const sine = Math.sin(Math.PI * distanceFromEdge);
  return sine * sine;
}

function deterministicBurstPhase(seed: number, absoluteSampleIndex: number, sampleRateHz: number): number {
  const frameCoordinate = absoluteSampleIndex * 13_000 / (sampleRateHz * 60);
  const frameIndex = Math.floor(frameCoordinate);
  return hash32(seed, frameIndex, 0x6275_7273) / 0x1_0000_0000 * 2 * Math.PI;
}

function createGmskSequence(seed: number): GmskSequence {
  // A finite deterministic synthetic payload repeats only to make its signed
  // prefix sum available at arbitrary sample offsets. It is not a GSM channel
  // coding, interleaving, ciphering, training-sequence, or dummy-burst source.
  const period = 256;
  const bits = new Uint8Array(period);
  let parity = 0;
  for (let index = 0; index < period - 1; index += 1) {
    bits[index] = hash32(seed, index, 0x676d_736b) & 1;
    parity ^= bits[index]!;
  }
  // Even input parity makes the recursive differential-encoder state periodic,
  // so absolute-offset generation and separately requested chunks agree.
  bits[period - 1] = parity;
  const alpha = new Int8Array(period);
  const prefix = new Int16Array(period + 1);
  let previousDifferentialBit = 1;
  for (let index = 0; index < period; index += 1) {
    // TS 45.004 clause 2.3: the current input bit is XORed with the previous
    // differential-encoder output, not merely with the preceding input bit.
    const differentialBit = bits[index]! ^ previousDifferentialBit;
    previousDifferentialBit = differentialBit;
    alpha[index] = differentialBit === 0 ? 1 : -1;
    prefix[index + 1] = prefix[index]! + alpha[index]!;
  }
  return {
    alpha,
    prefix,
    cycleSum: prefix[period]!,
    initialPhase: hash32(seed, 0, 0x7068_6173) / 0x1_0000_0000 * 2 * Math.PI,
  };
}

function gmskSample(sequence: GmskSequence, symbolCoordinate: number): readonly [number, number] {
  const center = Math.floor(symbolCoordinate);
  const firstTransition = center - 8;
  const lastTransition = center + 8;
  let phaseUnits = periodicAlphaPrefix(sequence, firstTransition);
  for (let symbolIndex = firstTransition; symbolIndex <= lastTransition; symbolIndex += 1) {
    phaseUnits += periodicAlpha(sequence, symbolIndex) * gaussianPhaseResponse(symbolCoordinate - symbolIndex);
  }
  // Modulation index h=1/2 gives a maximum pi/2 phase change per symbol.
  const phase = sequence.initialPhase + Math.PI / 2 * phaseUnits;
  return [Math.cos(phase), Math.sin(phase)];
}

function periodicAlpha(sequence: GmskSequence, symbolIndex: number): number {
  return sequence.alpha[positiveModulo(symbolIndex, sequence.alpha.length)]!;
}

/** Sum alpha[k] for every integer k in [0, exclusiveEnd), including negative ends. */
function periodicAlphaPrefix(sequence: GmskSequence, exclusiveEnd: number): number {
  const period = sequence.alpha.length;
  const cycles = Math.floor(exclusiveEnd / period);
  const remainder = exclusiveEnd - cycles * period;
  return cycles * sequence.cycleSum + sequence.prefix[remainder]!;
}

/**
 * Integrated Gaussian-filtered rectangular frequency pulse in symbol units.
 * The Gaussian sigma follows the BT=0.3 time-bandwidth relationship. The
 * implementation is analytic and stateless, so adjacent requested chunks are
 * byte-identical to slices from one larger unfiltered analytic request.
 */
function gaussianPhaseResponse(symbolTime: number): number {
  const sigma = Math.sqrt(Math.log(2)) / (2 * Math.PI * GERAN_GMSK_BT);
  const upper = (symbolTime + 0.5) / sigma;
  const lower = (symbolTime - 0.5) / sigma;
  const value = sigma * (normalIntegralPrimitive(upper) - normalIntegralPrimitive(lower));
  return Math.max(0, Math.min(1, value));
}

function normalIntegralPrimitive(value: number): number {
  return value * normalCdf(value) + Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

// Abramowitz-Stegun 7.1.26; sufficient for a deterministic engineering pulse.
function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * magnitude);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-magnitude * magnitude));
}

function linearlyPulseShapedSample(
  definitionValue: InternalGeranIqDefinition,
  symbolCoordinate: number,
  seed: number,
): readonly [number, number] {
  const center = Math.floor(symbolCoordinate);
  let inPhase = 0;
  let quadrature = 0;
  let totalWeight = 0;
  // Positive normalized weights make the pulse a convex combination of
  // unit-bounded symbols. This four-symbol-neighbourhood Gaussian projection
  // approximates the linearised-GMSK family while remaining explicitly
  // non-conformance; exact TS 45.004 coefficients are not claimed.
  for (let symbolIndex = center - 4; symbolIndex <= center + 4; symbolIndex += 1) {
    const distance = symbolCoordinate - symbolIndex;
    const weight = Math.exp(-0.5 * (distance / 0.85) ** 2);
    const symbol = rotatedConstellationSymbol(definitionValue, symbolIndex, seed);
    inPhase += weight * symbol[0];
    quadrature += weight * symbol[1];
    totalWeight += weight;
  }
  return [inPhase / totalWeight, quadrature / totalWeight];
}

function rotatedConstellationSymbol(
  definitionValue: InternalGeranIqDefinition,
  symbolIndex: number,
  seed: number,
): readonly [number, number] {
  const stateMask = 2 ** definitionValue.bitsPerSymbol - 1;
  const state = hash32(seed, symbolIndex, modulationLane(definitionValue.modulation)) & stateMask;
  const base = constellationSymbol(definitionValue.modulation, state);
  // All admitted rotations are exact rational multiples of a complete turn.
  // Reducing the integer coordinate avoids large-angle floating-point drift.
  const rotationPeriod = rotationPeriodSymbols(definitionValue.rotationTurnsPerSymbol);
  const reducedIndex = positiveModulo(symbolIndex, rotationPeriod);
  const angle = 2 * Math.PI * definitionValue.rotationTurnsPerSymbol * reducedIndex;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [base[0] * cosine - base[1] * sine, base[0] * sine + base[1] * cosine];
}

function constellationSymbol(modulation: GeranIqModulation, state: number): readonly [number, number] {
  switch (modulation) {
    case 'qpsk': {
      const scale = Math.SQRT1_2;
      return [state & 2 ? -scale : scale, state & 1 ? -scale : scale];
    }
    case 'aqpsk': {
      // Balanced alpha=pi/4 (SCPIR=0 dB) is one valid deterministic selection
      // inside the clause-6 SCPIR <= 10 dB parameter space; it is not universal.
      const alpha = Math.PI / 4;
      const cosine = Math.cos(alpha);
      const sine = Math.sin(alpha);
      return [state & 2 ? -cosine : cosine, state & 1 ? -sine : sine];
    }
    case '8psk': {
      // Exact Gray mapping l for binary states 000 through 111 (TS 45.004 table 1).
      const grayMappedL = [3, 4, 2, 1, 6, 5, 7, 0] as const;
      const phase = 2 * Math.PI * grayMappedL[state]! / 8;
      return [Math.cos(phase), Math.sin(phase)];
    }
    case '16qam': {
      // Table-2 relative geometry, peak-normalized to fit the API unit disk.
      const inPhase = (state & 8 ? -1 : 1) * (state & 2 ? 3 : 1);
      const quadrature = (state & 4 ? -1 : 1) * (state & 1 ? 3 : 1);
      return [inPhase / Math.sqrt(18), quadrature / Math.sqrt(18)];
    }
    case '32qam': {
      // Exact Table-3 cross-32-QAM point ordering, peak-normalized. The table's
      // original 1/sqrt(20) average-power scale is uniformly changed to
      // 1/sqrt(34) solely to honor this API's unit-peak contract.
      const point = QAM32_POINTS[state]!;
      return [point[0] / Math.sqrt(34), point[1] / Math.sqrt(34)];
    }
    case 'gmsk':
      throw new Error('GMSK uses the continuous-phase path, not a memoryless constellation');
  }
}

const QAM32_POINTS = [
  [-3, -5], [-1, -5], [-3, 5], [-1, 5], [-5, -3], [-5, -1], [-5, 3], [-5, 1],
  [-1, -3], [-1, -1], [-1, 3], [-1, 1], [-3, -3], [-3, -1], [-3, 3], [-3, 1],
  [3, -5], [1, -5], [3, 5], [1, 5], [5, -3], [5, -1], [5, 3], [5, 1],
  [1, -3], [1, -1], [1, 3], [1, 1], [3, -3], [3, -1], [3, 3], [3, 1],
] as const;

function modulationLane(modulation: GeranIqModulation): number {
  return ({ gmsk: 1, qpsk: 2, aqpsk: 3, '8psk': 4, '16qam': 5, '32qam': 6 })[modulation];
}

function rotationPeriodSymbols(turnsPerSymbol: number): number {
  for (let period = 1; period <= 16; period += 1) {
    if (Math.abs(turnsPerSymbol * period - Math.round(turnsPerSymbol * period)) < 1e-12) return period;
  }
  throw new Error(`Unsupported non-rational GERAN symbol rotation ${turnsPerSymbol}`);
}

function hash32(seed: number, index: number, lane: number): number {
  const low = index >>> 0;
  const high = Math.floor(index / 0x1_0000_0000) >>> 0;
  let value = (seed ^ lane ^ Math.imul(low, 0x9e37_79b1) ^ Math.imul(high, 0x85eb_ca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function lowPassFeedForwardCoefficient(bandwidthHz: number, sampleRateHz: number): number {
  const sineHalfEdge = Math.sin(Math.PI * bandwidthHz / (2 * sampleRateHz));
  return 2 * sineHalfEdge / (Math.sqrt(1 + sineHalfEdge * sineHalfEdge) + sineHalfEdge);
}

function writeUnitBoundedCf32le(
  view: DataView,
  byteOffset: number,
  inPhase: number,
  quadrature: number,
): void {
  let boundedInPhase = Math.fround(inPhase);
  let boundedQuadrature = Math.fround(quadrature);
  const magnitudeSquared = boundedInPhase * boundedInPhase + boundedQuadrature * boundedQuadrature;
  if (magnitudeSquared > 1) {
    const scale = (1 - 2 ** -23) / Math.sqrt(magnitudeSquared);
    boundedInPhase = Math.fround(boundedInPhase * scale);
    boundedQuadrature = Math.fround(boundedQuadrature * scale);
  }
  view.setFloat32(byteOffset, boundedInPhase, true);
  view.setFloat32(byteOffset + 4, boundedQuadrature, true);
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
