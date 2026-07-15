import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MIN_MEASUREMENT_FREQUENCY_HZ,
  replayChannelConfigurationSchema,
  synthesizedSignalProfileSchema,
  type ReplayChannelConfiguration,
  type SynthesizedSignalProfile,
  type WaveformDescriptor,
  type WaveformProjection,
} from './contracts.js';
import { waveformDescriptor } from './catalog.js';
import {
  BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS,
  BLE_PRIMARY_ADVERTISING_ENGINEERING_V1,
  LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1,
  LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
  NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS,
  NR_TDD_7DL_3UL_ENGINEERING_V1,
  lteTddConfig0Ssp7NormalCpDownlinkActive,
  nrTdd7Dl3UlEngineeringDownlinkActive,
} from './canonical-timing.js';

export { requireConformanceValidated, suggestedAnalyzerRange, waveformCatalog, waveformDescriptor } from './catalog.js';

export type ReplayProfile = SynthesizedSignalProfile | 'survey';

export interface SpectrumSynthesisInput {
  profile: ReplayProfile;
  startHz: number;
  stopHz: number;
  points: number;
  sweepIndex: number;
  channel: ReplayChannelConfiguration;
}

export interface ZeroSpanSynthesisInput {
  profile: ReplayProfile;
  tuneFrequencyHz: number;
  points: number;
  sweepIndex: number;
  samplePeriodSeconds: number;
  channel: ReplayChannelConfiguration;
}

export const DEFAULT_REPLAY_CHANNEL: ReplayChannelConfiguration = replayChannelConfigurationSchema.parse({
  model: 'awgn',
  noiseFloorDbm: -108,
  seed: 407,
  fadingRateHz: 2,
});

export type CanonizedKnownScenarioId = keyof typeof CANONIZED_KNOWN_SCENARIOS;

export interface CanonizedKnownScenario {
  readonly centerHz: number;
  readonly occupiedBandwidthHz: number;
  readonly recommendedSpanHz: number;
  readonly spectrumModel: 'rbw-line' | 'am-dsb-full-carrier' | 'fm-bessel' | 'gaussian-channel' | 'ofdm-channel' | 'dsss-channel' | 'classic-hop' | 'ble-advertising';
  readonly envelopeModel: 'steady' | 'sinusoidal-am' | 'receiver-filtered-fm' | 'one-of-eight-tdma' | 'continuous-gsm-loaded' | 'continuous-ofdm' | typeof LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1 | typeof NR_TDD_7DL_3UL_ENGINEERING_V1 | 'csma-bursts' | 'classic-slots' | typeof BLE_PRIMARY_ADVERTISING_ENGINEERING_V1;
  readonly parameters: Readonly<Record<string, number>>;
}

/**
 * The single executable source definition for every fitted known scenario.
 *
 * The classifier corpus and the live replay path both consume these exact
 * definitions and synthesis functions. Profile labels remain status-only and
 * are never copied into a measurement or classifier feature.
 */
export const CANONIZED_KNOWN_SCENARIOS = Object.freeze({
  'cw-rbw-line': knownScenario(98_000_000, 2_000, 500_000, 'rbw-line', 'steady', { driftHzPerLook: 35 }),
  'am-dsb-25k': knownScenario(98_000_000, 52_000, 500_000, 'am-dsb-full-carrier', 'sinusoidal-am', { modulationFrequencyHz: 25_000, modulationIndex: 0.72 }),
  'fm-beta-3': knownScenario(98_000_000, 200_000, 500_000, 'fm-bessel', 'receiver-filtered-fm', { modulationFrequencyHz: 25_000, deviationHz: 75_000 }),
  'gsm-900-tdma': knownScenario(947_400_000, 200_000, 2_000_000, 'gaussian-channel', 'one-of-eight-tdma', { slotSeconds: 15 / 26_000, frameSeconds: 60 / 13_000 }),
  'gsm-900-loaded-bcch': knownScenario(947_400_000, 200_000, 2_000_000, 'gaussian-channel', 'continuous-gsm-loaded', { slotSeconds: 15 / 26_000, frameSeconds: 60 / 13_000 }),
  'lte-band3-fdd-5m': knownScenario(1_842_500_000, 4_500_000, 10_000_000, 'ofdm-channel', 'continuous-ofdm', { subcarrierSpacingHz: 15_000, subframeSeconds: 0.001 }),
  'lte-band3-fdd-20m': knownScenario(1_840_000_000, 18_000_000, 30_000_000, 'ofdm-channel', 'continuous-ofdm', { subcarrierSpacingHz: 15_000, subframeSeconds: 0.001 }),
  'lte-band38-tdd-10m': knownScenario(2_595_000_000, 9_000_000, 20_000_000, 'ofdm-channel', LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1, {
    subcarrierSpacingHz: 15_000,
    ...LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
  }),
  'nr-n3-fdd-20m': knownScenario(1_840_000_000, 19_080_000, 30_000_000, 'ofdm-channel', 'continuous-ofdm', { subcarrierSpacingHz: 15_000, slotSeconds: 0.001 }),
  'nr-n78-tdd-40m': knownScenario(3_500_000_000, 38_160_000, 60_000_000, 'ofdm-channel', NR_TDD_7DL_3UL_ENGINEERING_V1, NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS),
  'nr-n78-tdd-100m': knownScenario(3_500_000_000, 98_280_000, 120_000_000, 'ofdm-channel', NR_TDD_7DL_3UL_ENGINEERING_V1, NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS),
  'wifi-hr-dsss-11m': knownScenario(2_437_000_000, 22_000_000, 30_000_000, 'dsss-channel', 'csma-bursts', { chipRateHz: 11_000_000 }),
  'wifi-ofdm-20m': knownScenario(2_437_000_000, 16_600_000, 30_000_000, 'ofdm-channel', 'csma-bursts', { subcarrierSpacingHz: 312_500 }),
  'wifi-ofdm-40m': knownScenario(5_190_000_000, 36_600_000, 60_000_000, 'ofdm-channel', 'csma-bursts', { subcarrierSpacingHz: 312_500 }),
  'wifi-ofdm-80m': knownScenario(5_210_000_000, 76_600_000, 100_000_000, 'ofdm-channel', 'csma-bursts', { subcarrierSpacingHz: 312_500 }),
  'bluetooth-classic-connected': knownScenario(2_441_000_000, 79_000_000, 84_000_000, 'classic-hop', 'classic-slots', { channelWidthHz: 1_000_000, slotSeconds: 0.000625, hopRateHz: 1_600 }),
  'bluetooth-le-advertising': knownScenario(2_441_000_000, 80_000_000, 84_000_000, 'ble-advertising', BLE_PRIMARY_ADVERTISING_ENGINEERING_V1, BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS),
});

/** Public replay profiles whose live measurements use the fitted corpus source. */
export const CANONIZED_REPLAY_PROFILE_SCENARIOS: Readonly<Partial<Record<SynthesizedSignalProfile, CanonizedKnownScenarioId>>> = Object.freeze({
  cw: 'cw-rbw-line',
  am: 'am-dsb-25k',
  fm: 'fm-beta-3',
  'gsm-900-loaded-bcch': 'gsm-900-loaded-bcch',
  'lte-band3-fdd-20m': 'lte-band3-fdd-20m',
  'lte-band38-tdd-10m': 'lte-band38-tdd-10m',
  'nr-n3-fdd-20m': 'nr-n3-fdd-20m',
  'nr-n78-tdd-100m': 'nr-n78-tdd-100m',
  'wifi-hr-dsss-11m': 'wifi-hr-dsss-11m',
  'wifi-ofdm-20m': 'wifi-ofdm-20m',
  'bluetooth-classic-connected': 'bluetooth-classic-connected',
  'bluetooth-le-advertising': 'bluetooth-le-advertising',
});

const CANONIZED_REPLAY_SNR_DB = 32;
const CANONIZED_REPLAY_SWEEP_TIME_SECONDS = 0.05;
/**
 * Internal receiver-filter width used to synthesize public detected-power
 * replays. The measurement bridge intentionally does not report this as an
 * observed or calibrated instrument RBW.
 */
export const CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ = 100_000;

export interface CanonizedSpectrumInput {
  readonly scenarioId: CanonizedKnownScenarioId;
  readonly startHz: number;
  readonly stopHz: number;
  readonly points: number;
  readonly actualRbwHz: number;
  readonly sweepTimeSeconds: number;
  readonly noiseFloorDbm: number;
  readonly snrDb: number;
  readonly seed: number;
  readonly lookIndex: number;
  readonly centerHz?: number;
  /** Optional receiver/channel gain applied to signal power only. */
  readonly signalGainDb?: readonly number[];
}

export interface CanonizedEnvelopeInput {
  readonly scenarioId: CanonizedKnownScenarioId;
  readonly points: number;
  readonly samplePeriodSeconds: number;
  /** Generator-internal receiver-filter width; not observed measurement metadata. */
  readonly synthesisFilterWidthHz: number;
  readonly noiseFloorDbm: number;
  readonly snrDb: number;
  readonly seed: number;
  readonly lookIndex: number;
  readonly tuneFrequencyHz: number;
  readonly centerHz?: number;
  /** Optional receiver/channel gain applied to signal power only. */
  readonly signalGainDb?: readonly number[];
}

export function synthesizeCanonizedKnownSpectrum(input: CanonizedSpectrumInput): number[] {
  validateCanonizedSpectrum(input);
  const declared = CANONIZED_KNOWN_SCENARIOS[input.scenarioId];
  const scenario = input.centerHz === undefined ? declared : { ...declared, centerHz: input.centerHz };
  return Array.from({ length: input.points }, (_unused, index) => {
    const frequencyHz = input.startHz + (input.stopHz - input.startHz) * index / (input.points - 1);
    const timeSeconds = input.lookIndex * input.sweepTimeSeconds + index * input.sweepTimeSeconds / Math.max(1, input.points - 1);
    const relativeSignalDb = canonizedSpectrumRelativePowerDb(input.scenarioId, scenario, frequencyHz, timeSeconds, input);
    const noiseDbm = input.noiseFloorDbm + canonizedPeriodogramNoiseDb(index, input.lookIndex, input.seed);
    return Number.isFinite(relativeSignalDb)
      ? canonizedCombineDbm(noiseDbm, input.noiseFloorDbm + input.snrDb + relativeSignalDb + (input.signalGainDb?.[index] ?? 0))
      : noiseDbm;
  });
}

export function synthesizeCanonizedKnownEnvelope(input: CanonizedEnvelopeInput): number[] {
  validateCanonizedEnvelope(input);
  const declared = CANONIZED_KNOWN_SCENARIOS[input.scenarioId];
  const scenario = input.centerHz === undefined ? declared : { ...declared, centerHz: input.centerHz };
  return Array.from({ length: input.points }, (_unused, index) => {
    const timeSeconds = (input.lookIndex * input.points + index) * input.samplePeriodSeconds;
    const relativeSignalDb = canonizedEnvelopeRelativePowerDb(input.scenarioId, scenario, timeSeconds, input.tuneFrequencyHz, input);
    const noiseDbm = input.noiseFloorDbm + canonizedPeriodogramNoiseDb(index, input.lookIndex + 10_000, input.seed ^ 0x68bc21eb);
    return Number.isFinite(relativeSignalDb)
      ? canonizedCombineDbm(noiseDbm, input.noiseFloorDbm + input.snrDb + relativeSignalDb + (input.signalGainDb?.[index] ?? 0))
      : noiseDbm;
  });
}

export function synthesizeSpectrum(input: SpectrumSynthesisInput): number[] {
  validateSpectrumInput(input);
  const channel = replayChannelConfigurationSchema.parse(input.channel);
  const scenarioId = canonizedReplayScenarioId(input.profile);
  if (scenarioId !== undefined) {
    return synthesizeCanonizedKnownSpectrum({
      scenarioId,
      startHz: input.startHz,
      stopHz: input.stopHz,
      points: input.points,
      actualRbwHz: (input.stopHz - input.startHz) / (input.points - 1),
      sweepTimeSeconds: CANONIZED_REPLAY_SWEEP_TIME_SECONDS,
      noiseFloorDbm: channel.noiseFloorDbm,
      snrDb: CANONIZED_REPLAY_SNR_DB,
      seed: channel.seed,
      lookIndex: input.sweepIndex,
      centerHz: waveformDescriptor(input.profile as SynthesizedSignalProfile).centerHz,
      signalGainDb: canonizedSignalGain(input.points, input.sweepIndex, channel),
    });
  }
  return Array.from({ length: input.points }, (_, index) => {
    const frequencyHz = input.startHz + (input.stopHz - input.startHz) * index / (input.points - 1);
    const noiseDbm = receiverNoiseDbm(index, input.points, input.sweepIndex, channel);
    const signalDbm = signalPowerDbm(input.profile, frequencyHz, index, input);
    if (!Number.isFinite(signalDbm)) return noiseDbm;
    const fadingDb = channel.model === 'rayleigh'
      ? rayleighFadingDb(index, input.points, input.sweepIndex, channel)
      : 0;
    return combineDbm(noiseDbm, signalDbm + fadingDb);
  });
}

export function synthesizeZeroSpan(input: ZeroSpanSynthesisInput): number[] {
  if (!Number.isSafeInteger(input.tuneFrequencyHz)
    || input.tuneFrequencyHz < MIN_MEASUREMENT_FREQUENCY_HZ
    || input.tuneFrequencyHz > MAX_MEASUREMENT_FREQUENCY_HZ) {
    throw new Error(`Zero-span synthesis requires a safe-integer tune from ${MIN_MEASUREMENT_FREQUENCY_HZ} through ${MAX_MEASUREMENT_FREQUENCY_HZ} Hz`);
  }
  if (!Number.isInteger(input.points) || input.points < 1) throw new Error('Zero-span synthesis requires a positive integer point count');
  if (!Number.isInteger(input.sweepIndex) || input.sweepIndex < 0) throw new Error('Zero-span synthesis requires a non-negative integer sweep index');
  if (!Number.isFinite(input.samplePeriodSeconds) || input.samplePeriodSeconds <= 0) throw new Error('Zero-span synthesis requires a finite positive sample period');
  const channel = replayChannelConfigurationSchema.parse(input.channel);
  const descriptor = input.profile === 'survey' ? undefined : waveformDescriptor(input.profile);
  const scenarioId = canonizedReplayScenarioId(input.profile);
  if (scenarioId !== undefined && descriptor !== undefined) {
    return synthesizeCanonizedKnownEnvelope({
      scenarioId,
      points: input.points,
      samplePeriodSeconds: input.samplePeriodSeconds,
      synthesisFilterWidthHz: CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
      noiseFloorDbm: channel.noiseFloorDbm,
      snrDb: CANONIZED_REPLAY_SNR_DB,
      seed: channel.seed,
      lookIndex: input.sweepIndex,
      tuneFrequencyHz: input.tuneFrequencyHz,
      centerHz: descriptor.centerHz,
      signalGainDb: canonizedSignalGain(input.points, input.sweepIndex, channel),
    });
  }
  if (descriptor === undefined) throw new Error('Survey zero-span synthesis has no absolute-frequency signal model');
  const receiverResponseDb = legacyReceiverResponseDb(descriptor, input.tuneFrequencyHz, input.sweepIndex);
  return Array.from({ length: input.points }, (_, index) => {
    const phase = (index + input.sweepIndex * 3) * Math.PI / 13;
    const normalized = index / Math.max(1, input.points - 1);
    const signalDbm = zeroSpanSignalDbm(input.profile, descriptor, index, input.sweepIndex, phase);
    const noiseDbm = channel.noiseFloorDbm + awgnPeriodogramDb(index, input.sweepIndex, channel.seed);
    const fadingDb = channel.model === 'rayleigh'
      ? rayleighFadingDb(index, input.points, input.sweepIndex + normalized, channel)
      : 0;
    return combineDbm(noiseDbm, signalDbm + receiverResponseDb + fadingDb);
  });
}

/**
 * Receiver response for standards-derived visual profiles that are not part of
 * the canonized classifier source. This is deliberately a descriptor-bounded
 * occupied-band projection, not a calibrated analyzer filter or conformance
 * waveform. Single-PRB profiles follow the same deterministic allocation
 * position used by their swept-spectrum projection.
 */
function legacyReceiverResponseDb(descriptor: WaveformDescriptor, tuneFrequencyHz: number, sweepIndex: number): number {
  let signalCenterHz = descriptor.centerHz;
  let occupiedBandwidthHz = descriptor.occupiedBandwidthHz;
  if (descriptor.projection.allocation === 'single-prb') {
    const spacingHz = descriptor.projection.subcarrierSpacingHz;
    if (spacingHz === undefined) throw new Error(`${descriptor.id} is missing subcarrier spacing`);
    const fullGridHz = descriptor.family === 'e-utra' ? 18_000_000 : 98_280_000;
    const positions = [-0.38, -0.19, 0, 0.21, 0.39] as const;
    signalCenterHz += positions[sweepIndex % positions.length]! * fullGridHz;
    occupiedBandwidthHz = spacingHz * 12;
  }
  return occupiedBandReceiverResponseDb(
    tuneFrequencyHz - signalCenterHz,
    occupiedBandwidthHz,
    CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
  );
}

function canonizedReplayScenarioId(profile: ReplayProfile): CanonizedKnownScenarioId | undefined {
  return profile === 'survey' ? undefined : CANONIZED_REPLAY_PROFILE_SCENARIOS[profile];
}

function canonizedSignalGain(
  points: number,
  sweepIndex: number,
  channel: ReplayChannelConfiguration,
): readonly number[] | undefined {
  if (channel.model !== 'rayleigh') return undefined;
  return Array.from({ length: points }, (_unused, index) =>
    rayleighFadingDb(index, points, sweepIndex + index / Math.max(1, points - 1), channel));
}

function signalPowerDbm(profile: ReplayProfile, frequencyHz: number, index: number, input: SpectrumSynthesisInput): number {
  const spanHz = input.stopHz - input.startHz;
  const normalized = index / Math.max(1, input.points - 1);
  if (profile === 'survey') {
    return combineManyDbm([
      bellDbm(-54, normalized - 0.23, 0.018),
      bellDbm(-69, normalized - 0.51, 0.045),
      bellDbm(-61, normalized - 0.79, 0.009),
    ]);
  }
  const descriptor = waveformDescriptor(profile);
  const offsetHz = frequencyHz - descriptor.centerHz;
  const binWidthHz = spanHz / Math.max(1, input.points - 1);
  if (profile === 'cw') return bellDbm(-48, offsetHz, Math.max(2_000, binWidthHz * 1.2));
  if (profile === 'am') {
    const envelope = 0.5 + 0.5 * Math.sin(input.sweepIndex * 0.45);
    return combineManyDbm([
      bellDbm(-54 + 6 * envelope, offsetHz, Math.max(1_800, binWidthHz * 1.1)),
      bellDbm(-76 + 12 * envelope, offsetHz - 25_000, Math.max(2_000, binWidthHz * 1.2)),
      bellDbm(-76 + 12 * envelope, offsetHz + 25_000, Math.max(2_000, binWidthHz * 1.2)),
    ]);
  }
  if (profile === 'fm') return fmProjection(offsetHz, binWidthHz, input.sweepIndex);
  return standardsProjection(descriptor, offsetHz, binWidthHz, input.sweepIndex);
}

function fmProjection(offsetHz: number, binWidthHz: number, sweepIndex: number): number {
  const instantaneousOffset = 75_000 * Math.sin(sweepIndex * 0.34);
  const lineWidthHz = Math.max(1_800, binWidthHz * 1.2);
  const carrier = bellDbm(-50, offsetHz - instantaneousOffset, Math.max(2_500, binWidthHz * 1.35));
  const resolvedSidebands = [-3, -2, -1, 1, 2, 3].map((order) => {
    const breathing = 1.2 * Math.sin(sweepIndex * 0.29 + order * 0.8);
    return bellDbm(-80 - Math.abs(order) * 3 + breathing, offsetHz - order * 25_000, lineWidthHz);
  });
  return combineManyDbm([carrier, ...resolvedSidebands]);
}

function standardsProjection(descriptor: WaveformDescriptor, offsetHz: number, binWidthHz: number, sweepIndex: number): number {
  if (!transmissionActive(descriptor.projection.timing, sweepIndex)) return Number.NEGATIVE_INFINITY;
  if (descriptor.family === 'geran') return geranProjection(descriptor, offsetHz, sweepIndex);
  if (descriptor.family === 'wlan') return wlanProjection(descriptor, offsetHz, sweepIndex);
  if (descriptor.family !== 'e-utra' && descriptor.family !== 'nr') throw new Error(`No standards projection exists for ${descriptor.id}`);
  return cellularProjection(descriptor, offsetHz, binWidthHz, sweepIndex);
}

function geranProjection(descriptor: WaveformDescriptor, offsetHz: number, sweepIndex: number): number {
  const half = descriptor.occupiedBandwidthHz / 2;
  if (Math.abs(offsetHz) > half * 2.4) return Number.NEGATIVE_INFINITY;
  const modulationBroadening = modulationTexture(descriptor.projection.modulation);
  const normalized = offsetHz / half;
  const main = -55 - (descriptor.projection.modulation === 'gmsk' ? 11.5 : 8.5) * normalized ** 2;
  const structured = 0.7 * modulationBroadening * Math.cos(offsetHz / 18_000 + sweepIndex * 0.21);
  return main + structured;
}

function cellularProjection(descriptor: WaveformDescriptor, offsetHz: number, binWidthHz: number, sweepIndex: number): number {
  const spacingHz = descriptor.projection.subcarrierSpacingHz;
  if (!spacingHz) throw new Error(`${descriptor.id} is missing subcarrier spacing`);
  const textureScale = modulationTexture(descriptor.projection.modulation);
  if (descriptor.projection.allocation === 'narrowband') {
    return ofdmProjection(offsetHz, descriptor.occupiedBandwidthHz, -65, spacingHz, sweepIndex, hashText(descriptor.id), textureScale);
  }
  if (descriptor.projection.allocation === 'single-prb') {
    const fullGridHz = descriptor.family === 'e-utra' ? 18_000_000 : 98_280_000;
    const positions = [-0.38, -0.19, 0, 0.21, 0.39];
    const prbCenterHz = positions[sweepIndex % positions.length]! * fullGridHz;
    const prbWidthHz = spacingHz * 12;
    const measuredPrb = ofdmProjection(offsetHz - prbCenterHz, prbWidthHz, -62, spacingHz, sweepIndex, hashText(descriptor.id), textureScale);
    const physicalChannels = ofdmProjection(offsetHz, fullGridHz, -96, spacingHz, sweepIndex, hashText(`${descriptor.id}:control`), 0.4);
    return combineDbm(measuredPrb, physicalChannels);
  }
  const base = ofdmProjection(offsetHz, descriptor.occupiedBandwidthHz, descriptor.family === 'e-utra' ? -64 : -63, spacingHz, sweepIndex, hashText(descriptor.id), textureScale);
  if (descriptor.projection.allocation !== 'boosted' || !Number.isFinite(base)) return base;
  const rbWidthHz = spacingHz * 12;
  const rbIndex = Math.floor((offsetHz + descriptor.occupiedBandwidthHz / 2) / rbWidthHz);
  const boost = (rbIndex + sweepIndex) % 4 === 0 ? 3 : -1.25;
  return base + boost;
}

function wlanProjection(descriptor: WaveformDescriptor, offsetHz: number, sweepIndex: number): number {
  const spacingHz = descriptor.projection.subcarrierSpacingHz;
  if (!spacingHz) throw new Error(`${descriptor.id} is missing subcarrier spacing`);
  let projected = ofdmProjection(offsetHz, descriptor.occupiedBandwidthHz, -61, spacingHz, sweepIndex, hashText(descriptor.id), 1);
  if (!Number.isFinite(projected)) return projected;
  if (descriptor.projection.allocation === 'multi-ru') {
    const normalized = offsetHz / (descriptor.occupiedBandwidthHz / 2);
    const resourceStep = Math.floor((normalized + 1) * 4);
    projected += resourceStep % 2 === 0 ? 1.8 : -2.2;
  }
  if (Math.abs(offsetHz) < spacingHz) projected -= 12;
  return projected;
}

function ofdmProjection(
  offsetHz: number,
  occupiedBandwidthHz: number,
  plateauDbm: number,
  subcarrierSpacingHz: number,
  sweepIndex: number,
  salt: number,
  textureScale: number,
): number {
  const half = occupiedBandwidthHz / 2;
  const distance = Math.abs(offsetHz);
  if (distance > half + occupiedBandwidthHz * 0.12) return Number.NEGATIVE_INFINITY;
  if (distance > half) {
    const shoulder = (distance - half) / (occupiedBandwidthHz * 0.035);
    return plateauDbm - 12 - 16 * shoulder;
  }
  const edgeTaper = distance > half * 0.965 ? -4 * (distance - half * 0.965) / (half * 0.035) : 0;
  const subcarrierPhase = offsetHz / subcarrierSpacingHz;
  const texture = textureScale * (
    0.85 * Math.sin(subcarrierPhase * 0.37 + sweepIndex * 0.41 + salt)
    + 0.55 * Math.cos(subcarrierPhase * 0.11 - sweepIndex * 0.23)
  );
  return plateauDbm + edgeTaper + texture;
}

function zeroSpanSignalDbm(
  profile: ReplayProfile,
  descriptor: WaveformDescriptor | undefined,
  index: number,
  sweepIndex: number,
  phase: number,
): number {
  if (profile === 'survey') return -82 + 7 * Math.sin(phase) + (index % 47 < 5 ? 13 : 0);
  if (profile === 'cw') return -52 + 0.25 * Math.sin(phase * 1.7);
  if (profile === 'am') return -68 + 15 * Math.sin(phase);
  if (profile === 'fm') return -56 + 0.35 * Math.sin(phase * 2.3);
  if (!descriptor) throw new Error(`Waveform descriptor is missing for ${profile}`);
  if (descriptor.family === 'geran') return ((index + sweepIndex * 7) % 104) < 13 ? -55 : -118;
  if (descriptor.family === 'wlan') return wlanZeroSpan(descriptor.id, index, sweepIndex, phase);
  const timing = descriptor.projection.timing;
  if (!transmissionActiveAtSample(timing, index, sweepIndex)) return -118;
  const allocationOffset = descriptor.projection.allocation === 'single-prb' ? -13 : descriptor.projection.allocation === 'narrowband' ? -8 : 0;
  const texture = 2.2 + modulationTexture(descriptor.projection.modulation) * 0.7;
  return -64 + allocationOffset + texture * smoothNoise(index / 2.5, sweepIndex, hashText(descriptor.id));
}

function wlanZeroSpan(profile: SynthesizedSignalProfile, index: number, sweepIndex: number, phase: number): number {
  const coordinate = index + sweepIndex * 11;
  if (profile === 'wifi6-he-er-su') return coordinate % 113 < 84 ? -65 + 1.4 * Math.sin(phase) : -118;
  if (profile === 'wifi6-he-mu') return coordinate % 97 < 72 ? -60 + 3 * smoothNoise(index / 3, sweepIndex, 0x6d75) : -118;
  if (profile === 'wifi6-he-tb') return coordinate % 89 >= 27 && coordinate % 89 < 63 ? -62 + 2.5 * Math.sin(phase * 2.7) : -118;
  return coordinate % 89 < 58 ? -61 + 2 * Math.sin(phase * 2.7) : -118;
}

function transmissionActive(timing: WaveformProjection['timing'], sweepIndex: number): boolean {
  if (timing === 'burst') return sweepIndex % 9 < 7;
  if (timing === 'sbfd-du') return sweepIndex % 2 === 0;
  if (timing === 'sbfd-ud') return sweepIndex % 2 === 1;
  if (timing === 'sbfd-dud') return sweepIndex % 3 !== 1;
  return true;
}

function transmissionActiveAtSample(timing: WaveformProjection['timing'], index: number, sweepIndex: number): boolean {
  const coordinate = index + sweepIndex * 3;
  if (timing === 'subslot') return coordinate % 14 < 4;
  if (timing === 'slot') return coordinate % 28 < 14;
  if (timing === 'sbfd-du') return coordinate % 28 < 14;
  if (timing === 'sbfd-ud') return coordinate % 28 >= 14;
  if (timing === 'sbfd-dud') { const symbol = coordinate % 42; return symbol < 14 || symbol >= 28; }
  return true;
}

function modulationTexture(modulation: WaveformProjection['modulation']): number {
  return ({
    unmodulated: 0, am: 0.2, fm: 0.3, gmsk: 0.3, qpsk: 0.55, aqpsk: 0.65, '8psk': 0.72,
    '16qam': 0.8, '32qam': 0.85, '64qam': 0.9, '256qam': 1.05, '1024qam': 1.2, 'ofdm-mixed': 1, 'he-ofdm': 1,
    'hr-dsss': 0.7, 'br-edr': 0.65, 'ble-1m': 0.55,
  })[modulation];
}

function receiverNoiseDbm(index: number, points: number, sweepIndex: number, channel: ReplayChannelConfiguration): number {
  const x = index / Math.max(1, points - 1);
  const broadShape = 1.15 * Math.sin(Math.PI * 2 * (x * 1.45 + 0.08 + sweepIndex * 0.0015))
    + 0.8 * Math.cos(Math.PI * 2 * (x * 3.7 - 0.19));
  const stableRipple = 0.95 * smoothNoise(index / 6.5, 0, channel.seed ^ 0x4a39b70d);
  const edgeLift = 1.2 * Math.pow(Math.abs(x - 0.5) * 2, 1.7);
  const awgn = awgnPeriodogramDb(index, sweepIndex, channel.seed);
  const floor = channel.noiseFloorDbm + broadShape + stableRipple + edgeLift + awgn;
  const spurs = [
    bellDbm(channel.noiseFloorDbm + 6, x - 0.083, 0.0025),
    bellDbm(channel.noiseFloorDbm + 4.5, x - 0.647, 0.0038),
    bellDbm(channel.noiseFloorDbm + 6.5, x - 0.914, 0.0022),
  ];
  return combineDbm(floor, combineManyDbm(spurs));
}

function awgnPeriodogramDb(index: number, sweepIndex: number, seed: number): number {
  let power = 0;
  const looks = 6;
  for (let look = 0; look < looks; look++) {
    const [i, q] = normalPair(index, sweepIndex, seed ^ Math.imul(look + 1, 0x632be59b));
    power += (i * i + q * q) / 2;
  }
  return clamp(10 * Math.log10(power / looks), -8, 6);
}

function rayleighFadingDb(index: number, points: number, sweepIndex: number, channel: ReplayChannelConfiguration): number {
  const frequencyCoordinate = index / Math.max(3, points / 14);
  const timeCoordinate = sweepIndex * Math.min(1, channel.fadingRateHz / 9);
  const [inPhase, quadrature] = interpolatedComplexGaussian(frequencyCoordinate, timeCoordinate, channel.seed ^ 0x72a11e);
  const magnitude = Math.sqrt((inPhase * inPhase + quadrature * quadrature) / 2);
  return clamp(20 * Math.log10(Math.max(0.035, magnitude)), -28, 8);
}

function interpolatedComplexGaussian(x: number, y: number, seed: number): readonly [number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smootherStep(x - x0);
  const ty = smootherStep(y - y0);
  const sample = (xi: number, yi: number): readonly [number, number] => normalPair(xi, yi, seed);
  const a = sample(x0, y0);
  const b = sample(x0 + 1, y0);
  const c = sample(x0, y0 + 1);
  const d = sample(x0 + 1, y0 + 1);
  return [
    lerp(lerp(a[0], b[0], tx), lerp(c[0], d[0], tx), ty),
    lerp(lerp(a[1], b[1], tx), lerp(c[1], d[1], tx), ty),
  ];
}

function normalPair(index: number, sweepIndex: number, seed: number): readonly [number, number] {
  const first = Math.max(Number.EPSILON, uniform(index, sweepIndex, seed ^ 0x9e3779b9));
  const second = uniform(index, sweepIndex, seed ^ 0x243f6a88);
  const radius = Math.sqrt(-2 * Math.log(first));
  const angle = Math.PI * 2 * second;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

function uniform(index: number, sweepIndex: number, seed: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(sweepIndex + 1, 0x85ebca77) ^ seed;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return ((value >>> 0) + 0.5) / 0x1_0000_0000;
}

function smoothNoise(position: number, sweepIndex: number, seed: number): number {
  const left = Math.floor(position);
  const fraction = smootherStep(position - left);
  const start = uniform(left, sweepIndex, seed) * 2 - 1;
  const stop = uniform(left + 1, sweepIndex, seed) * 2 - 1;
  return lerp(start, stop, fraction);
}

function bellDbm(peakDbm: number, offset: number, width: number): number {
  if (width <= 0) throw new Error('Spectrum bell width must be positive');
  return peakDbm - 4.342944819 * (offset / width) ** 2;
}

function combineDbm(left: number, right: number): number {
  if (!Number.isFinite(left)) return right;
  if (!Number.isFinite(right)) return left;
  const maximum = Math.max(left, right);
  return maximum + 10 * Math.log10(10 ** ((left - maximum) / 10) + 10 ** ((right - maximum) / 10));
}

function combineManyDbm(values: readonly number[]): number {
  return values.reduce(combineDbm, Number.NEGATIVE_INFINITY);
}

function knownScenario(
  centerHz: number,
  occupiedBandwidthHz: number,
  recommendedSpanHz: number,
  spectrumModel: CanonizedKnownScenario['spectrumModel'],
  envelopeModel: CanonizedKnownScenario['envelopeModel'],
  parameters: Readonly<Record<string, number>>,
): CanonizedKnownScenario {
  return Object.freeze({ centerHz, occupiedBandwidthHz, recommendedSpanHz, spectrumModel, envelopeModel, parameters: Object.freeze({ ...parameters }) });
}

function canonizedSpectrumRelativePowerDb(
  scenarioId: CanonizedKnownScenarioId,
  scenario: CanonizedKnownScenario,
  frequencyHz: number,
  timeSeconds: number,
  configuration: Pick<CanonizedSpectrumInput, 'actualRbwHz' | 'lookIndex' | 'seed'>,
): number {
  if (!canonizedSweptTrafficActive(scenarioId, scenario, timeSeconds, configuration.seed)) return Number.NEGATIVE_INFINITY;
  const offsetHz = frequencyHz - scenario.centerHz;
  switch (scenario.spectrumModel) {
    case 'rbw-line': {
      const drift = (configuration.lookIndex - 4) * (scenario.parameters.driftHzPerLook ?? 0);
      return canonizedGaussianFilterDb(offsetHz - drift, configuration.actualRbwHz);
    }
    case 'am-dsb-full-carrier': {
      const modulationFrequencyHz = canonizedRequiredParameter(scenarioId, scenario, 'modulationFrequencyHz');
      const modulationIndex = canonizedRequiredParameter(scenarioId, scenario, 'modulationIndex');
      const sidebandRelativeDb = 10 * Math.log10(modulationIndex ** 2 / 4);
      return canonizedCombineRelativeDb([
        canonizedGaussianFilterDb(offsetHz, configuration.actualRbwHz),
        sidebandRelativeDb + canonizedGaussianFilterDb(offsetHz - modulationFrequencyHz, configuration.actualRbwHz),
        sidebandRelativeDb + canonizedGaussianFilterDb(offsetHz + modulationFrequencyHz, configuration.actualRbwHz),
      ]);
    }
    case 'fm-bessel': {
      const modulationFrequencyHz = canonizedRequiredParameter(scenarioId, scenario, 'modulationFrequencyHz');
      const beta = canonizedRequiredParameter(scenarioId, scenario, 'deviationHz') / modulationFrequencyHz;
      const components: number[] = [];
      for (let order = -10; order <= 10; order++) {
        const amplitude = Math.abs(canonizedBesselJ(order, beta));
        if (amplitude < 1e-5) continue;
        components.push(20 * Math.log10(amplitude) + canonizedGaussianFilterDb(offsetHz - order * modulationFrequencyHz, configuration.actualRbwHz));
      }
      return canonizedCombineRelativeDb(components);
    }
    case 'gaussian-channel': return canonizedGaussianOccupiedChannelDb(offsetHz, scenario.occupiedBandwidthHz);
    case 'ofdm-channel': return canonizedOfdmChannelDb(
      offsetHz,
      scenario.occupiedBandwidthHz,
      canonizedRequiredParameter(scenarioId, scenario, 'subcarrierSpacingHz'),
      configuration.lookIndex,
      configuration.seed,
    );
    case 'dsss-channel': return canonizedDsssChannelDb(offsetHz, scenario.occupiedBandwidthHz);
    case 'classic-hop': {
      if (!canonizedClassicSlotActive(timeSeconds)) return Number.NEGATIVE_INFINITY;
      const hop = canonizedClassicHopCenter(timeSeconds, configuration.seed);
      return canonizedGaussianOccupiedChannelDb(frequencyHz - hop, canonizedRequiredParameter(scenarioId, scenario, 'channelWidthHz'));
    }
    case 'ble-advertising': {
      const center = canonizedBleAdvertisingCenter(scenarioId, scenario, timeSeconds, configuration.seed);
      return center === undefined
        ? Number.NEGATIVE_INFINITY
        : canonizedGaussianOccupiedChannelDb(frequencyHz - center, canonizedRequiredParameter(scenarioId, scenario, 'channelWidthHz'));
    }
  }
}

function canonizedEnvelopeRelativePowerDb(
  scenarioId: CanonizedKnownScenarioId,
  scenario: CanonizedKnownScenario,
  timeSeconds: number,
  tuneFrequencyHz: number,
  configuration: Pick<CanonizedEnvelopeInput, 'synthesisFilterWidthHz' | 'seed'>,
): number {
  switch (scenario.envelopeModel) {
    case 'steady': return -0.12 + 0.12 * Math.sin(2 * Math.PI * 7 * timeSeconds)
      + canonizedFixedReceiverResponseDb(scenarioId, scenario, tuneFrequencyHz, configuration.synthesisFilterWidthHz);
    case 'sinusoidal-am': return canonizedReceiverFilteredAmPowerDb(scenarioId, scenario, timeSeconds, tuneFrequencyHz, configuration.synthesisFilterWidthHz);
    case 'receiver-filtered-fm': return canonizedReceiverFilteredFmPowerDb(scenarioId, scenario, timeSeconds, tuneFrequencyHz, configuration.synthesisFilterWidthHz);
    case 'one-of-eight-tdma': return canonizedGsmTrafficActive(scenarioId, scenario, timeSeconds)
      ? canonizedFixedReceiverResponseDb(scenarioId, scenario, tuneFrequencyHz, configuration.synthesisFilterWidthHz)
      : Number.NEGATIVE_INFINITY;
    case 'continuous-gsm-loaded': return -0.35 + 0.25 * canonizedDeterministicTexture(timeSeconds * 1_733, configuration.seed)
      + canonizedFixedReceiverResponseDb(scenarioId, scenario, tuneFrequencyHz, configuration.synthesisFilterWidthHz);
    case 'continuous-ofdm': return -0.7 + 0.55 * canonizedDeterministicTexture(timeSeconds * 2_000, configuration.seed)
      + canonizedFixedReceiverResponseDb(scenarioId, scenario, tuneFrequencyHz, configuration.synthesisFilterWidthHz);
    case LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1: return lteTddConfig0Ssp7NormalCpDownlinkActive(scenario.parameters, timeSeconds)
      ? -0.5 + 0.4 * canonizedDeterministicTexture(timeSeconds * 2_000, configuration.seed)
        + canonizedFixedReceiverResponseDb(scenarioId, scenario, tuneFrequencyHz, configuration.synthesisFilterWidthHz)
      : Number.NEGATIVE_INFINITY;
    case NR_TDD_7DL_3UL_ENGINEERING_V1: return nrTdd7Dl3UlEngineeringDownlinkActive(scenario.parameters, timeSeconds)
      ? -0.5 + 0.45 * canonizedDeterministicTexture(timeSeconds * 4_000, configuration.seed)
        + canonizedFixedReceiverResponseDb(scenarioId, scenario, tuneFrequencyHz, configuration.synthesisFilterWidthHz)
      : Number.NEGATIVE_INFINITY;
    case 'csma-bursts': return canonizedCsmaTrafficActive(timeSeconds, configuration.seed)
      ? -0.5 + 0.7 * canonizedDeterministicTexture(timeSeconds * 3_000, configuration.seed)
        + canonizedFixedReceiverResponseDb(scenarioId, scenario, tuneFrequencyHz, configuration.synthesisFilterWidthHz)
      : Number.NEGATIVE_INFINITY;
    case 'classic-slots': {
      const slot = canonizedRequiredParameter(scenarioId, scenario, 'slotSeconds');
      const index = Math.floor(timeSeconds / slot);
      const hopCenterHz = canonizedClassicHopCenter(timeSeconds, configuration.seed);
      const receiverResponseDb = canonizedGaussianFilterDb(
        tuneFrequencyHz - hopCenterHz,
        Math.max(configuration.synthesisFilterWidthHz, canonizedRequiredParameter(scenarioId, scenario, 'channelWidthHz')),
      );
      return canonizedClassicSlotActive(timeSeconds) && receiverResponseDb > -60
        ? -0.4 + 0.25 * canonizedDeterministicTexture(index, configuration.seed) + receiverResponseDb
        : Number.NEGATIVE_INFINITY;
    }
    case BLE_PRIMARY_ADVERTISING_ENGINEERING_V1: {
      const packetCenterHz = canonizedBleAdvertisingCenter(scenarioId, scenario, timeSeconds, configuration.seed);
      if (packetCenterHz === undefined) return Number.NEGATIVE_INFINITY;
      const receiverResponseDb = canonizedGaussianFilterDb(
        tuneFrequencyHz - packetCenterHz,
        Math.max(configuration.synthesisFilterWidthHz, canonizedRequiredParameter(scenarioId, scenario, 'channelWidthHz')),
      );
      return receiverResponseDb > -60 ? -0.35 + receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
  }
}

function canonizedFixedReceiverResponseDb(
  scenarioId: CanonizedKnownScenarioId,
  scenario: CanonizedKnownScenario,
  tuneFrequencyHz: number,
  rbwHz: number,
): number {
  const offsetHz = tuneFrequencyHz - scenario.centerHz;
  switch (scenario.spectrumModel) {
    case 'rbw-line': return canonizedGaussianFilterDb(offsetHz, rbwHz);
    case 'gaussian-channel': return canonizedGaussianOccupiedChannelDb(offsetHz, Math.max(scenario.occupiedBandwidthHz, rbwHz));
    case 'ofdm-channel': return occupiedBandReceiverResponseDb(offsetHz, scenario.occupiedBandwidthHz, rbwHz);
    case 'dsss-channel': return canonizedDsssChannelDb(offsetHz, Math.max(scenario.occupiedBandwidthHz, rbwHz));
    case 'am-dsb-full-carrier':
    case 'fm-bessel':
      throw new Error(`${scenarioId} requires its coherent receiver-filtered envelope model`);
    case 'classic-hop':
    case 'ble-advertising':
      throw new Error(`${scenarioId} requires its time-varying channel receiver model`);
  }
}

function canonizedSweptTrafficActive(scenarioId: CanonizedKnownScenarioId, scenario: CanonizedKnownScenario, timeSeconds: number, seed: number): boolean {
  switch (scenario.envelopeModel) {
    case 'one-of-eight-tdma': return canonizedGsmTrafficActive(scenarioId, scenario, timeSeconds);
    case LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1: return lteTddConfig0Ssp7NormalCpDownlinkActive(scenario.parameters, timeSeconds);
    case NR_TDD_7DL_3UL_ENGINEERING_V1: return nrTdd7Dl3UlEngineeringDownlinkActive(scenario.parameters, timeSeconds);
    case 'csma-bursts': return canonizedCsmaTrafficActive(timeSeconds, seed);
    default: return true;
  }
}

function canonizedGsmTrafficActive(scenarioId: CanonizedKnownScenarioId, scenario: CanonizedKnownScenario, timeSeconds: number): boolean {
  const slot = canonizedRequiredParameter(scenarioId, scenario, 'slotSeconds');
  return Math.floor(timeSeconds / slot) % 8 === 0;
}

function canonizedCsmaTrafficActive(timeSeconds: number, seed: number): boolean {
  const coordinate = timeSeconds * 1_000;
  const frame = Math.floor(coordinate / 2.7);
  const phase = coordinate - frame * 2.7;
  const duration = 0.25 + 1.9 * canonizedPseudoUniform(frame, 7, seed);
  return phase < duration;
}

function canonizedReceiverFilteredAmPowerDb(scenarioId: CanonizedKnownScenarioId, scenario: CanonizedKnownScenario, timeSeconds: number, tuneFrequencyHz: number, rbwHz: number): number {
  const modulationFrequencyHz = canonizedRequiredParameter(scenarioId, scenario, 'modulationFrequencyHz');
  const modulationIndex = canonizedRequiredParameter(scenarioId, scenario, 'modulationIndex');
  return canonizedReceiverFilteredTonePowerDb([
    { offsetHz: -modulationFrequencyHz, amplitude: modulationIndex / 2 },
    { offsetHz: 0, amplitude: 1 },
    { offsetHz: modulationFrequencyHz, amplitude: modulationIndex / 2 },
  ], scenario.centerHz, timeSeconds, tuneFrequencyHz, rbwHz, modulationFrequencyHz);
}

function canonizedReceiverFilteredFmPowerDb(scenarioId: CanonizedKnownScenarioId, scenario: CanonizedKnownScenario, timeSeconds: number, tuneFrequencyHz: number, rbwHz: number): number {
  const modulationFrequencyHz = canonizedRequiredParameter(scenarioId, scenario, 'modulationFrequencyHz');
  const beta = canonizedRequiredParameter(scenarioId, scenario, 'deviationHz') / modulationFrequencyHz;
  const tones = Array.from({ length: 21 }, (_value, index) => index - 10)
    .map((order) => ({ offsetHz: order * modulationFrequencyHz, amplitude: canonizedBesselJ(order, beta) }))
    .filter((tone) => Math.abs(tone.amplitude) >= 1e-5);
  return canonizedReceiverFilteredTonePowerDb(tones, scenario.centerHz, timeSeconds, tuneFrequencyHz, rbwHz, modulationFrequencyHz);
}

function canonizedReceiverFilteredTonePowerDb(tones: readonly { offsetHz: number; amplitude: number }[], centerHz: number, timeSeconds: number, tuneFrequencyHz: number, rbwHz: number, fundamentalHz: number): number {
  let real = 0;
  let imaginary = 0;
  for (const tone of tones) {
    const responseAmplitude = 10 ** (canonizedGaussianFilterDb(centerHz + tone.offsetHz - tuneFrequencyHz, rbwHz) / 20);
    const order = tone.offsetHz / fundamentalHz;
    const phase = 2 * Math.PI * order * fundamentalHz * timeSeconds;
    real += tone.amplitude * responseAmplitude * Math.cos(phase);
    imaginary += tone.amplitude * responseAmplitude * Math.sin(phase);
  }
  return 10 * Math.log10(Math.max(1e-12, real * real + imaginary * imaginary));
}

function canonizedGaussianFilterDb(offsetHz: number, rbwHz: number): number {
  const sigmaHz = Math.max(1, rbwHz / 2.355);
  return -4.342944819 * 0.5 * (offsetHz / sigmaHz) ** 2;
}

function occupiedBandReceiverResponseDb(offsetHz: number, occupiedBandwidthHz: number, rbwHz: number): number {
  const distanceOutsideOccupiedBandHz = Math.max(0, Math.abs(offsetHz) - occupiedBandwidthHz / 2);
  return canonizedGaussianFilterDb(distanceOutsideOccupiedBandHz, rbwHz);
}

function canonizedGaussianOccupiedChannelDb(offsetHz: number, occupiedBandwidthHz: number): number {
  const normalized = offsetHz / Math.max(1, occupiedBandwidthHz / 2);
  if (Math.abs(normalized) > 1.45) return Number.NEGATIVE_INFINITY;
  return -4.342944819 * 0.5 * (normalized / 0.52) ** 2;
}

function canonizedOfdmChannelDb(offsetHz: number, occupiedBandwidthHz: number, spacingHz: number, lookIndex: number, seed: number): number {
  const half = occupiedBandwidthHz / 2;
  const distance = Math.abs(offsetHz);
  if (distance > half * 1.08) return Number.NEGATIVE_INFINITY;
  if (distance > half) return -18 - 45 * (distance - half) / (half * 0.08);
  const taper = distance > half * 0.96 ? -5 * (distance - half * 0.96) / (half * 0.04) : 0;
  const dcNotch = Math.abs(offsetHz) < spacingHz * 0.75 ? -10 : 0;
  const texture = 0.65 * canonizedDeterministicTexture(offsetHz / Math.max(1, spacingHz) + lookIndex * 0.37, seed);
  return taper + dcNotch + texture;
}

function canonizedDsssChannelDb(offsetHz: number, occupiedBandwidthHz: number): number {
  const normalized = Math.abs(offsetHz) / (occupiedBandwidthHz / 2);
  if (normalized > 1.25) return Number.NEGATIVE_INFINITY;
  return -1.8 * normalized ** 2 - 9 * normalized ** 8;
}

function canonizedClassicHopCenter(timeSeconds: number, seed: number): number {
  const slot = Math.floor(timeSeconds / 0.000625);
  const channel = Math.floor(canonizedPseudoUniform(slot, 31, seed) * 79);
  return 2_402_000_000 + channel * 1_000_000;
}

function canonizedClassicSlotActive(timeSeconds: number): boolean {
  return Math.floor(timeSeconds / 0.000625) % 3 !== 2;
}

const canonizedBleEventStartCache = new Map<string, number[]>();

function canonizedBleAdvertisingCenter(
  scenarioId: CanonizedKnownScenarioId,
  scenario: CanonizedKnownScenario,
  timeSeconds: number,
  seed: number,
): number | undefined {
  const engineeringScheduleVersion = canonizedRequiredParameter(scenarioId, scenario, 'engineeringScheduleVersion');
  const advertisingDelayGeneratorVersion = canonizedRequiredParameter(scenarioId, scenario, 'advertisingDelayGeneratorVersion');
  const intervalSeconds = canonizedRequiredParameter(scenarioId, scenario, 'advertisingIntervalSeconds');
  const advertisingDelayMinimumSeconds = canonizedRequiredParameter(scenarioId, scenario, 'advertisingDelayMinimumSeconds');
  const advertisingDelayMaximumSeconds = canonizedRequiredParameter(scenarioId, scenario, 'advertisingDelayMaximumSeconds');
  const packetStartSpacingSeconds = canonizedRequiredParameter(scenarioId, scenario, 'packetStartSpacingSeconds');
  const packetDurationSeconds = canonizedRequiredParameter(scenarioId, scenario, 'packetDurationSeconds');
  const packetCount = canonizedRequiredParameter(scenarioId, scenario, 'packetCount');
  if (engineeringScheduleVersion !== 1 || advertisingDelayGeneratorVersion !== 1 || packetCount !== 3) {
    throw new Error(`${scenarioId} requires ${BLE_PRIMARY_ADVERTISING_ENGINEERING_V1}`);
  }
  if (packetDurationSeconds <= 0 || packetDurationSeconds > packetStartSpacingSeconds) throw new Error('BLE advertising packet duration must be positive and no longer than the packet start spacing');
  const starts = canonizedBleAdvertisingEventStartsThrough(
    timeSeconds,
    intervalSeconds,
    advertisingDelayMinimumSeconds,
    advertisingDelayMaximumSeconds,
    seed,
  );
  const event = canonizedGreatestIndexAtOrBefore(starts, timeSeconds);
  if (event < 0) return undefined;
  const eventPhase = timeSeconds - starts[event]!;
  if (eventPhase < 0) return undefined;
  const packet = Math.floor(eventPhase / packetStartSpacingSeconds);
  if (packet < 0 || packet >= packetCount) return undefined;
  if (eventPhase - packet * packetStartSpacingSeconds >= packetDurationSeconds) return undefined;
  return canonizedRequiredParameter(scenarioId, scenario, `packet${packet}CenterHz`);
}

function canonizedBleAdvertisingEventStartsThrough(timeSeconds: number, intervalSeconds: number, advertisingDelayMinimumSeconds: number, advertisingDelayMaximumSeconds: number, seed: number): readonly number[] {
  if (!(intervalSeconds > 0) || !(advertisingDelayMinimumSeconds >= 0) || advertisingDelayMaximumSeconds < advertisingDelayMinimumSeconds) {
    throw new Error('BLE advertising interval and delay bounds must be valid');
  }
  const key = `${intervalSeconds}:${advertisingDelayMinimumSeconds}:${advertisingDelayMaximumSeconds}:${seed}`;
  const starts = canonizedBleEventStartCache.get(key) ?? [0];
  while (starts.at(-1)! <= timeSeconds) {
    const event = starts.length - 1;
    const advertisingDelaySeconds = advertisingDelayMinimumSeconds
      + canonizedPseudoUniform(event, 43, seed) * (advertisingDelayMaximumSeconds - advertisingDelayMinimumSeconds);
    starts.push(starts.at(-1)! + intervalSeconds + advertisingDelaySeconds);
  }
  canonizedBleEventStartCache.set(key, starts);
  return starts;
}

function canonizedGreatestIndexAtOrBefore(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! <= target) {
      result = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return result;
}

function canonizedBesselJ(order: number, value: number): number {
  const absoluteOrder = Math.abs(order);
  let term = (value / 2) ** absoluteOrder / canonizedFactorial(absoluteOrder);
  let sum = term;
  for (let k = 1; k < 80; k++) {
    term *= -(value * value / 4) / (k * (k + absoluteOrder));
    sum += term;
    if (Math.abs(term) < 1e-14) break;
  }
  return order < 0 && absoluteOrder % 2 === 1 ? -sum : sum;
}

function canonizedFactorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index++) result *= index;
  return result;
}

function canonizedPeriodogramNoiseDb(index: number, lookIndex: number, seed: number): number {
  let gammaPower = 0;
  const looks = 6;
  for (let look = 0; look < looks; look++) gammaPower += -Math.log(Math.max(Number.EPSILON, canonizedPseudoUniform(index, lookIndex * 17 + look, seed ^ Math.imul(look + 1, 0x9e3779b9))));
  return Math.max(-12, Math.min(8, 10 * Math.log10(gammaPower / looks)));
}

function canonizedPseudoUniform(left: number, right: number, seed: number): number {
  let value = (Math.trunc(left) ^ Math.imul(Math.trunc(right), 0x9e3779b1) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value ^= value >>> 15;
  return ((value >>> 0) + 0.5) / 0x1_0000_0000;
}

function canonizedDeterministicTexture(coordinate: number, seed: number): number {
  return 0.58 * Math.sin(coordinate * 0.73 + seed * 0.001)
    + 0.27 * Math.cos(coordinate * 1.91 - seed * 0.0007)
    + 0.15 * Math.sin(coordinate * 4.17 + seed * 0.0003);
}

// Keep the corpus arithmetic exact: the trained model hash includes these
// scalar samples, so even an algebraically equivalent stable-log rewrite would
// create a different executable corpus.
function canonizedCombineDbm(leftDbm: number, rightDbm: number): number {
  return 10 * Math.log10(10 ** (leftDbm / 10) + 10 ** (rightDbm / 10));
}

function canonizedCombineRelativeDb(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return Number.NEGATIVE_INFINITY;
  const maximum = Math.max(...finite);
  return maximum + 10 * Math.log10(finite.reduce((sum, value) => sum + 10 ** ((value - maximum) / 10), 0));
}

function canonizedRequiredParameter(scenarioId: CanonizedKnownScenarioId, scenario: CanonizedKnownScenario, key: string): number {
  const value = scenario.parameters[key];
  if (value === undefined) throw new Error(`${scenarioId} is missing parameter ${key}`);
  return value;
}

function validateCanonizedSpectrum(input: CanonizedSpectrumInput): void {
  if (!Number.isFinite(input.startHz) || !Number.isFinite(input.stopHz) || input.stopHz <= input.startHz) throw new Error('Canonized spectrum requires an increasing finite frequency range');
  if (!Number.isInteger(input.points) || input.points < 2) throw new Error('Canonized spectrum requires at least two points');
  validateCanonizedSignalGain(input.points, input.signalGainDb);
  validateCanonizedCommon(input);
}

function validateCanonizedEnvelope(input: CanonizedEnvelopeInput): void {
  if (!Number.isInteger(input.points) || input.points < 1) throw new Error('Canonized envelope requires at least one point');
  if (!Number.isFinite(input.samplePeriodSeconds) || input.samplePeriodSeconds <= 0 || !Number.isFinite(input.tuneFrequencyHz)) throw new Error('Canonized envelope geometry must be finite and positive');
  if (!Number.isFinite(input.synthesisFilterWidthHz) || input.synthesisFilterWidthHz <= 0) throw new Error('Canonized envelope synthesis filter width must be finite and positive');
  validateCanonizedSignalGain(input.points, input.signalGainDb);
  validateCanonizedLevelsAndIdentity(input);
}

function validateCanonizedSignalGain(points: number, signalGainDb: readonly number[] | undefined): void {
  if (signalGainDb === undefined) return;
  if (signalGainDb.length !== points || signalGainDb.some((value) => !Number.isFinite(value))) {
    throw new Error('Canonized signal gain must contain one finite value per point');
  }
}

function validateCanonizedCommon(input: Pick<CanonizedSpectrumInput, 'actualRbwHz' | 'noiseFloorDbm' | 'snrDb' | 'seed' | 'lookIndex' | 'centerHz'>): void {
  if (!Number.isFinite(input.actualRbwHz) || input.actualRbwHz <= 0) throw new Error('Canonized spectrum RBW must be finite and positive');
  validateCanonizedLevelsAndIdentity(input);
}

function validateCanonizedLevelsAndIdentity(
  input: Pick<CanonizedSpectrumInput, 'noiseFloorDbm' | 'snrDb' | 'seed' | 'lookIndex' | 'centerHz'>,
): void {
  if (!Number.isFinite(input.noiseFloorDbm) || !Number.isFinite(input.snrDb)) throw new Error('Canonized projection levels must be finite');
  if (!Number.isInteger(input.seed) || !Number.isInteger(input.lookIndex) || input.lookIndex < 0) throw new Error('Canonized projection seed/look index must be non-negative integers');
  if (input.centerHz !== undefined && !Number.isFinite(input.centerHz)) throw new Error('Canonized projection center must be finite');
}

function validateSpectrumInput(input: SpectrumSynthesisInput): void {
  if (!Number.isSafeInteger(input.startHz) || !Number.isSafeInteger(input.stopHz) || input.stopHz <= input.startHz) throw new Error('Spectrum synthesis requires an increasing safe-integer frequency range');
  if (!Number.isInteger(input.points) || input.points < 2) throw new Error('Spectrum synthesis requires at least two points');
  if (!Number.isInteger(input.sweepIndex) || input.sweepIndex < 0) throw new Error('Spectrum synthesis requires a non-negative integer sweep index');
  if (input.profile !== 'survey') synthesizedSignalProfileSchema.parse(input.profile);
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return hash | 0;
}

function smootherStep(value: number): number { return value * value * (3 - 2 * value); }
function lerp(start: number, stop: number, amount: number): number { return start + (stop - start) * amount; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
