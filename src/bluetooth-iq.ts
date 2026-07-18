import {
  BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS,
  BLE_PRIMARY_ADVERTISING_ENGINEERING_V1,
} from './canonical-timing.js';
import {
  synthesizedSignalProfileSchema,
  type SynthesizedSignalProfile,
} from './contracts.js';

export const BLUETOOTH_ANALYTIC_IQ_PROFILES = Object.freeze([
  'bluetooth-classic-connected',
  'bluetooth-le-advertising',
] as const);
export type BluetoothAnalyticIqProfile = typeof BLUETOOTH_ANALYTIC_IQ_PROFILES[number];

export const BLUETOOTH_ANALYTIC_IQ_QUALIFICATION =
  'standards-derived-engineering-projection' as const;
export const BLUETOOTH_ANALYTIC_IQ_DISCLOSURE =
  'Normalized deterministic GFSK/FHSS-style analytic complex-baseband engineering projection. The Classic profile uses Basic-Rate-like GFSK throughout and does not synthesize EDR DPSK payload portions. It contains no Bluetooth packet, access address, whitening, CRC, coding, payload, negotiated connection state, or Bluetooth hop-selection kernel; it is not packet-decodable I/Q and is not a conformance vector. Sample rates below 80 MHz produce a deterministic discrete-time alias projection of the aggregate channel offsets, not an alias-free reconstruction.' as const;
export const BLUETOOTH_ANALYTIC_IQ_FORMAT = 'interleaved-f32-iq' as const;

export const BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ = 2_441_000_000 as const;
export const MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ = 1_000_000 as const;
export const BLUETOOTH_ANALYTIC_IQ_ALIAS_FREE_MINIMUM_SAMPLE_RATE_HZ = 80_000_000 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ = 245_760_000 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES = 65_536 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_START_SECONDS = 60 as const;
export const MIN_BLUETOOTH_ANALYTIC_IQ_SEED = 1 as const;
export const MAX_BLUETOOTH_ANALYTIC_IQ_SEED = 0xffff_ffff as const;

const SYMBOL_RATE_HZ = 1_000_000;
const GAUSSIAN_BT = 0.5;
const GAUSSIAN_SYMBOL_RADIUS = 3;
const CLASSIC_SLOT_SECONDS = 0.000625;
const CLASSIC_CHANNEL_WIDTH_HZ = 1_000_000;
const CLASSIC_FIRST_CHANNEL_CENTER_HZ = 2_402_000_000;
const CLASSIC_CHANNEL_COUNT = 79;
const CLASSIC_FREQUENCY_DEVIATION_HZ = 160_000;
const BLE_FREQUENCY_DEVIATION_HZ = 250_000;
const TWO_PI = 2 * Math.PI;

export const BLUETOOTH_ANALYTIC_IQ_MODELS = Object.freeze({
  'bluetooth-classic-connected': Object.freeze({
    qualification: BLUETOOTH_ANALYTIC_IQ_QUALIFICATION,
    schedule: 'uniform-seeded-79-center-two-active-one-idle' as const,
    referenceCenterHz: BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
    firstChannelCenterHz: CLASSIC_FIRST_CHANNEL_CENTER_HZ,
    channelCount: CLASSIC_CHANNEL_COUNT,
    channelSpacingHz: CLASSIC_CHANNEL_WIDTH_HZ,
    slotSeconds: CLASSIC_SLOT_SECONDS,
    symbolRateHz: SYMBOL_RATE_HZ,
    frequencyDeviationHz: CLASSIC_FREQUENCY_DEVIATION_HZ,
    gaussianBt: GAUSSIAN_BT,
  }),
  'bluetooth-le-advertising': Object.freeze({
    qualification: BLUETOOTH_ANALYTIC_IQ_QUALIFICATION,
    schedule: BLE_PRIMARY_ADVERTISING_ENGINEERING_V1,
    referenceCenterHz: BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
    channelCentersHz: Object.freeze([
      BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packet0CenterHz,
      BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packet1CenterHz,
      BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packet2CenterHz,
    ] as const),
    packetDurationSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packetDurationSeconds,
    packetStartSpacingSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packetStartSpacingSeconds,
    advertisingIntervalSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.advertisingIntervalSeconds,
    advertisingDelayMinimumSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.advertisingDelayMinimumSeconds,
    advertisingDelayMaximumSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.advertisingDelayMaximumSeconds,
    symbolRateHz: SYMBOL_RATE_HZ,
    frequencyDeviationHz: BLE_FREQUENCY_DEVIATION_HZ,
    gaussianBt: GAUSSIAN_BT,
  }),
});

export interface BluetoothAnalyticIqSynthesisInput {
  readonly profile: SynthesizedSignalProfile;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly seed: number;
  /** Absolute sample coordinate, retained so independently requested slices agree. */
  readonly startSampleIndex?: number;
}

interface BurstSegment {
  readonly identity: number;
  readonly startSample: number;
  readonly endSample: number;
  readonly channelCenterHz: number;
  readonly frequencyDeviationHz: number;
  readonly bitSalt: number;
}

/**
 * Produce raw normalized analytic Bluetooth engineering samples as
 * `[I0, Q0, I1, Q1, ...]` float32 components.
 *
 * Carrier offsets are relative to 2.441 GHz. Active bursts have unit envelope;
 * inactive slots and inter-packet/event intervals are exact complex zero. The
 * minimum sample rate keeps all declared channel centers plus GFSK deviation
 * strictly inside Nyquist. Absolute sample coordinates make output deterministic
 * and slice-independent without retaining mutable generator state.
 *
 * This is intentionally a standards-derived engineering projection, not a
 * Bluetooth transmitter. The pseudobits exist only to produce a bounded smooth
 * GFSK-like phase trajectory and cannot be decoded as Bluetooth packets.
 */
export function synthesizeBluetoothAnalyticSamples(
  input: BluetoothAnalyticIqSynthesisInput,
): Float32Array {
  const profile = bluetoothAnalyticIqProfile(input.profile);
  validateInput(input);
  const startSample = input.startSampleIndex ?? 0;
  const endSample = startSample + input.sampleCount;
  const segments = profile === 'bluetooth-classic-connected'
    ? classicSegments(startSample, endSample, input.sampleRateHz, input.seed)
    : bleAdvertisingSegments(startSample, endSample, input.sampleRateHz, input.seed);
  const output = new Float32Array(input.sampleCount * 2);

  let segmentIndex = 0;
  let current: BurstSegment | undefined;
  let phase = 0;
  for (let relativeIndex = 0; relativeIndex < input.sampleCount; relativeIndex += 1) {
    const absoluteIndex = startSample + relativeIndex;
    while (segmentIndex < segments.length && absoluteIndex >= segments[segmentIndex]!.endSample) {
      segmentIndex += 1;
      current = undefined;
    }
    const candidate = segments[segmentIndex];
    if (!candidate || absoluteIndex < candidate.startSample) continue;
    if (current !== candidate) {
      current = candidate;
      phase = phaseAtSample(candidate, absoluteIndex, input.sampleRateHz, input.seed);
    }
    writeUnitComplex(output, relativeIndex * 2, phase);
    phase = advancePhase(phase, instantaneousFrequencyHz(
      candidate,
      absoluteIndex - candidate.startSample,
      input.sampleRateHz,
      input.seed,
    ), input.sampleRateHz);
  }
  return output;
}

export function isBluetoothAnalyticIqProfile(
  profile: SynthesizedSignalProfile,
): profile is BluetoothAnalyticIqProfile {
  return BLUETOOTH_ANALYTIC_IQ_PROFILES.some((candidate) => candidate === profile);
}

function bluetoothAnalyticIqProfile(value: SynthesizedSignalProfile): BluetoothAnalyticIqProfile {
  const profile = synthesizedSignalProfileSchema.parse(value);
  if (!isBluetoothAnalyticIqProfile(profile)) {
    throw new RangeError(`${profile} has no Bluetooth analytic complex-baseband engineering projection`);
  }
  return profile;
}

function validateInput(input: BluetoothAnalyticIqSynthesisInput): void {
  if (!Number.isSafeInteger(input.sampleRateHz)
    || input.sampleRateHz < MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ
    || input.sampleRateHz > MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ) {
    throw new RangeError(`Bluetooth analytic sample rate must be a safe integer from ${MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ} through ${MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ} Hz`);
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES) {
    throw new RangeError(`Bluetooth analytic sample count must be a safe integer from 1 through ${MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES}`);
  }
  if (!Number.isSafeInteger(input.seed)
    || input.seed < MIN_BLUETOOTH_ANALYTIC_IQ_SEED
    || input.seed > MAX_BLUETOOTH_ANALYTIC_IQ_SEED) {
    throw new RangeError(`Bluetooth analytic seed must be a safe integer from ${MIN_BLUETOOTH_ANALYTIC_IQ_SEED} through ${MAX_BLUETOOTH_ANALYTIC_IQ_SEED}`);
  }
  const startSample = input.startSampleIndex ?? 0;
  const maximumStartSample = input.sampleRateHz * MAX_BLUETOOTH_ANALYTIC_IQ_START_SECONDS;
  if (!Number.isSafeInteger(startSample) || startSample < 0 || startSample > maximumStartSample) {
    throw new RangeError(`Bluetooth analytic start sample must be a safe integer covering at most ${MAX_BLUETOOTH_ANALYTIC_IQ_START_SECONDS} seconds`);
  }
  if (!Number.isSafeInteger(startSample + input.sampleCount)) {
    throw new RangeError('Bluetooth analytic sample geometry exceeds safe integer coordinates');
  }
}

function classicSegments(
  startSample: number,
  endSample: number,
  sampleRateHz: number,
  seed: number,
): BurstSegment[] {
  const firstSlot = Math.max(0, Math.floor(startSample / sampleRateHz / CLASSIC_SLOT_SECONDS) - 1);
  const lastSlot = Math.floor((endSample - 1) / sampleRateHz / CLASSIC_SLOT_SECONDS) + 1;
  const result: BurstSegment[] = [];
  for (let slot = firstSlot; slot <= lastSlot; slot += 1) {
    if (slot % 3 === 2) continue;
    const segmentStart = firstSampleAtOrAfter(slot * CLASSIC_SLOT_SECONDS, sampleRateHz);
    const segmentEnd = firstSampleAtOrAfter((slot + 1) * CLASSIC_SLOT_SECONDS, sampleRateHz);
    if (segmentEnd <= startSample || segmentStart >= endSample) continue;
    const channel = Math.floor(engineeringPseudoUniform(slot, 31, seed) * CLASSIC_CHANNEL_COUNT);
    result.push({
      identity: slot,
      startSample: segmentStart,
      endSample: segmentEnd,
      channelCenterHz: CLASSIC_FIRST_CHANNEL_CENTER_HZ + channel * CLASSIC_CHANNEL_WIDTH_HZ,
      frequencyDeviationHz: CLASSIC_FREQUENCY_DEVIATION_HZ,
      bitSalt: 0x434c_4153,
    });
  }
  return result;
}

function bleAdvertisingSegments(
  startSample: number,
  endSample: number,
  sampleRateHz: number,
  seed: number,
): BurstSegment[] {
  const parameters = BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS;
  const eventStarts = [0];
  const endTimeSeconds = endSample / sampleRateHz;
  while (eventStarts.at(-1)! <= endTimeSeconds) {
    const event = eventStarts.length - 1;
    const delay = parameters.advertisingDelayMinimumSeconds
      + engineeringPseudoUniform(event, 43, seed)
      * (parameters.advertisingDelayMaximumSeconds - parameters.advertisingDelayMinimumSeconds);
    eventStarts.push(eventStarts.at(-1)! + parameters.advertisingIntervalSeconds + delay);
  }

  const centers = BLUETOOTH_ANALYTIC_IQ_MODELS['bluetooth-le-advertising'].channelCentersHz;
  const result: BurstSegment[] = [];
  for (let event = 0; event < eventStarts.length; event += 1) {
    const eventStart = eventStarts[event]!;
    for (let packet = 0; packet < parameters.packetCount; packet += 1) {
      const packetStart = eventStart + packet * parameters.packetStartSpacingSeconds;
      const segmentStart = firstSampleAtOrAfter(packetStart, sampleRateHz);
      const segmentEnd = firstSampleAtOrAfter(packetStart + parameters.packetDurationSeconds, sampleRateHz);
      if (segmentEnd <= startSample || segmentStart >= endSample) continue;
      result.push({
        identity: event * parameters.packetCount + packet,
        startSample: segmentStart,
        endSample: segmentEnd,
        channelCenterHz: centers[packet]!,
        frequencyDeviationHz: BLE_FREQUENCY_DEVIATION_HZ,
        bitSalt: 0x424c_4521,
      });
    }
  }
  return result;
}

function phaseAtSample(
  segment: BurstSegment,
  absoluteSample: number,
  sampleRateHz: number,
  seed: number,
): number {
  let phase = TWO_PI * engineeringPseudoUniform(segment.identity, segment.bitSalt ^ 0x5048_4153, seed);
  const localTarget = absoluteSample - segment.startSample;
  for (let localSample = 0; localSample < localTarget; localSample += 1) {
    phase = advancePhase(
      phase,
      instantaneousFrequencyHz(segment, localSample, sampleRateHz, seed),
      sampleRateHz,
    );
  }
  return phase;
}

function instantaneousFrequencyHz(
  segment: BurstSegment,
  localSample: number,
  sampleRateHz: number,
  seed: number,
): number {
  const carrierOffsetHz = segment.channelCenterHz - BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ;
  const symbolCoordinate = localSample * SYMBOL_RATE_HZ / sampleRateHz;
  let weightedSymbols = 0;
  let weightTotal = 0;
  const nearestSymbol = Math.floor(symbolCoordinate);
  for (let symbol = nearestSymbol - GAUSSIAN_SYMBOL_RADIUS;
    symbol <= nearestSymbol + GAUSSIAN_SYMBOL_RADIUS;
    symbol += 1) {
    const distance = symbolCoordinate - (symbol + 0.5);
    const weight = Math.exp(-2 * (Math.PI * GAUSSIAN_BT * distance) ** 2);
    const bit = engineeringPseudoUniform(symbol, segment.identity ^ segment.bitSalt, seed) < 0.5 ? -1 : 1;
    weightedSymbols += bit * weight;
    weightTotal += weight;
  }
  const gaussianSymbol = weightedSymbols / weightTotal;
  return carrierOffsetHz + segment.frequencyDeviationHz * gaussianSymbol;
}

function advancePhase(phase: number, frequencyHz: number, sampleRateHz: number): number {
  const next = phase + TWO_PI * frequencyHz / sampleRateHz;
  return next - TWO_PI * Math.floor(next / TWO_PI);
}

function writeUnitComplex(output: Float32Array, offset: number, phase: number): void {
  let inPhase = Math.fround(Math.cos(phase));
  let quadrature = Math.fround(Math.sin(phase));
  const magnitudeSquared = inPhase * inPhase + quadrature * quadrature;
  if (magnitudeSquared > 1) {
    const scale = (1 - 2 ** -23) / Math.sqrt(magnitudeSquared);
    inPhase = Math.fround(inPhase * scale);
    quadrature = Math.fround(quadrature * scale);
  }
  output[offset] = inPhase;
  output[offset + 1] = quadrature;
}

function firstSampleAtOrAfter(timeSeconds: number, sampleRateHz: number): number {
  const coordinate = timeSeconds * sampleRateHz;
  const nearest = Math.round(coordinate);
  return Math.abs(coordinate - nearest) <= 1e-7 ? nearest : Math.ceil(coordinate);
}

/** Kept byte-for-byte arithmetic-compatible with the canonized scalar schedule. */
function engineeringPseudoUniform(left: number, right: number, seed: number): number {
  let value = (Math.trunc(left) ^ Math.imul(Math.trunc(right), 0x9e3779b1) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value ^= value >>> 15;
  return ((value >>> 0) + 0.5) / 0x1_0000_0000;
}
