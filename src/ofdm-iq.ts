import {
  onePoleLowPassAlphaForTwoSided3dbBandwidth as lowPassFeedForwardCoefficient,
  writeUnitBoundedCf32le,
} from '@atomos/dsp';
import {
  synthesizedSignalProfileSchema,
  waveformDescriptorSchema,
  type SynthesizedSignalProfile,
  type WaveformDescriptor,
  type WaveformProjection,
} from './contracts.js';
import { waveformCatalog, waveformDescriptor } from './catalog.js';
import {
  LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
  NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS,
  lteTddConfig0Ssp7NormalCpDownlinkActive,
  nrTdd7Dl3UlEngineeringDownlinkActive,
} from './canonical-timing.js';

/**
 * Closed standards-labelled profile surface supported by this engineering
 * complex-baseband projection. The module-level catalog check below makes a
 * later LTE, NR, or WLAN catalog addition fail visibly until it is admitted
 * here rather than silently receiving a generic substitute.
 */
export const STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES = [
  'lte-band3-fdd-20m',
  'lte-band38-tdd-10m',
  'lte-etm1.1',
  'lte-etm3.1',
  'lte-etm3.1a',
  'lte-etm3.1b',
  'lte-ntm',
  'lte-nbiot-guard-isolated-component',
  'lte-nbiot-inband-isolated-component',
  'nr-n3-fdd-20m',
  'nr-n78-tdd-100m',
  'nr-fr1-tm1.1',
  'nr-fr1-tm3.1',
  'nr-fr1-tm3.1a',
  'nr-fr1-tm3.1b',
  'nr-nbiot-inband-isolated-component',
  'wifi-hr-dsss-11m',
  'wifi-ofdm-20m',
  'wifi6-he-su',
  'wifi6-he-er-su',
  'wifi6-he-mu',
  'wifi6-he-tb',
  'custom-lte',
  'custom-nr',
  'custom-wifi',
] as const satisfies readonly SynthesizedSignalProfile[];

export type StandardsEngineeringComplexIqProfile = typeof STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES[number];

export const STANDARDS_ENGINEERING_COMPLEX_IQ_QUALIFICATION =
  'standards-derived-engineering-projection' as const;

export const STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE =
  'Deterministic standards-parameterized engineering complex-baseband projection. It preserves the catalogued resource-grid or chip-rate support, modulation class, duplex mode, and declared engineering timing, but it does not construct physical channels, coding, payloads, reference signals, complete resource-element allocation, cyclic prefixes, WLAN MAC behavior, or conformance vectors. It is not protocol-decodable I/Q and is not evidence of standards conformance. When the requested sample rate undersamples the catalogued occupied support, the result is the deterministic discrete-time alias projection, not a reconstruction of the full channel.' as const;

export const MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLES = 65_536 as const;
export const STANDARDS_ENGINEERING_COMPLEX_IQ_BYTES_PER_SAMPLE = 8 as const;
export const MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ = 1_000_000 as const;
export const MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ = 245_760_000 as const;
export const MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ = 1_000 as const;
export const MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ = 245_760_000 as const;
export const MAX_REPRESENTATIVE_OFDM_TONES = 32 as const;

type StandardsFamily = 'e-utra' | 'nr' | 'wlan';
type TimingModel =
  | 'continuous-engineering-symbol-texture'
  | 'ten-millisecond-frame-engineering-symbol-texture'
  | 'lte-tdd-config0-ssp7-normal-cp-downlink-v1'
  | 'nr-tdd-7dl-3ul-engineering-v1'
  | 'wlan-six-of-ten-millisecond-engineering-burst-v1';

export interface StandardsEngineeringComplexIqConfiguration {
  readonly profile: StandardsEngineeringComplexIqProfile;
  readonly family: StandardsFamily;
  readonly centerHz: number;
  readonly occupiedBandwidthHz: number;
  readonly allocation: WaveformProjection['allocation'];
  readonly modulation: WaveformProjection['modulation'];
  readonly timing: WaveformProjection['timing'];
  readonly duplex?: WaveformProjection['duplex'];
  readonly subcarrierSpacingHz?: number;
  readonly nominalResourceBlocks?: number;
  readonly occupiedToneCount?: number;
  readonly representativeToneCount: number;
  readonly chipRateHz?: number;
  readonly timingModel: TimingModel;
  readonly qualification: typeof STANDARDS_ENGINEERING_COMPLEX_IQ_QUALIFICATION;
  readonly disclosure: typeof STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE;
}

export interface StandardsEngineeringComplexIqSynthesisInput {
  readonly profile: SynthesizedSignalProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  /** Absolute discrete-time origin used to observe declared TDD/burst phases. */
  readonly startSample?: number;
}

const profileSet = new Set<SynthesizedSignalProfile>(STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES);
const cataloguedStandardsProfiles = waveformCatalog
  .filter((descriptor) => isStandardsFamily(descriptor.family))
  .map((descriptor) => descriptor.id);

if (cataloguedStandardsProfiles.length !== STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES.length
  || cataloguedStandardsProfiles.some((profile) => !profileSet.has(profile))) {
  throw new Error('Standards engineering complex-I/Q profile coverage is out of sync with the LTE/NR/WLAN catalog');
}

export function isStandardsEngineeringComplexIqProfile(
  profile: SynthesizedSignalProfile,
): profile is StandardsEngineeringComplexIqProfile {
  return profileSet.has(profile);
}

/**
 * Project only parameters already admitted by the authoritative descriptor.
 * The two legacy WLAN details that are not first-class descriptor fields are
 * closed by profile: 52 occupied OFDM tones and an 11 Mchip/s HR-DSSS texture.
 */
export function projectStandardsEngineeringComplexIqConfiguration(
  descriptorValue: WaveformDescriptor,
): StandardsEngineeringComplexIqConfiguration {
  const descriptor = waveformDescriptorSchema.parse(descriptorValue);
  if (!isStandardsEngineeringComplexIqProfile(descriptor.id) || !isStandardsFamily(descriptor.family)) {
    throw new RangeError(`${descriptor.id} has no standards engineering complex-I/Q projection`);
  }
  if (descriptor.qualification !== 'standards-derived') {
    throw new Error(`${descriptor.id} must remain standards-derived; this generator cannot promote qualification`);
  }

  const projection = descriptor.projection;
  let occupiedToneCount: number | undefined;
  let chipRateHz: number | undefined;
  if (descriptor.id === 'wifi-hr-dsss-11m'
    || (descriptor.id === 'custom-wifi' && projection.modulation === 'hr-dsss')) {
    if (projection.modulation !== 'hr-dsss' || projection.timing !== 'burst') {
      throw new Error(`${descriptor.id} descriptor no longer matches its admitted chip-rate projection`);
    }
    chipRateHz = 11_000_000;
  } else if (descriptor.id === 'wifi-ofdm-20m') {
    requirePositiveSafeInteger(projection.subcarrierSpacingHz, `${descriptor.id} subcarrier spacing`);
    occupiedToneCount = 52;
  } else if (descriptor.family === 'wlan') {
    const spacingHz = requirePositiveSafeInteger(projection.subcarrierSpacingHz, `${descriptor.id} subcarrier spacing`);
    const derivedToneCount = descriptor.occupiedBandwidthHz / spacingHz;
    occupiedToneCount = requirePositiveSafeInteger(derivedToneCount, `${descriptor.id} occupied tone count`);
  } else {
    const resourceBlocks = requirePositiveSafeInteger(projection.nominalResourceBlocks, `${descriptor.id} resource blocks`);
    requirePositiveSafeInteger(projection.subcarrierSpacingHz, `${descriptor.id} subcarrier spacing`);
    occupiedToneCount = resourceBlocks * 12;
  }

  if (occupiedToneCount !== undefined && (!Number.isSafeInteger(occupiedToneCount) || occupiedToneCount < 2 || occupiedToneCount % 2 !== 0)) {
    throw new Error(`${descriptor.id} requires a positive even occupied-tone count`);
  }

  const timingModel = timingModelFor(descriptor);
  const configuration: StandardsEngineeringComplexIqConfiguration = {
    profile: descriptor.id,
    family: descriptor.family,
    centerHz: descriptor.centerHz,
    occupiedBandwidthHz: descriptor.occupiedBandwidthHz,
    allocation: projection.allocation,
    modulation: projection.modulation,
    timing: projection.timing,
    ...(projection.duplex === undefined ? {} : { duplex: projection.duplex }),
    ...(projection.subcarrierSpacingHz === undefined ? {} : { subcarrierSpacingHz: projection.subcarrierSpacingHz }),
    ...(projection.nominalResourceBlocks === undefined ? {} : { nominalResourceBlocks: projection.nominalResourceBlocks }),
    ...(occupiedToneCount === undefined ? {} : { occupiedToneCount }),
    representativeToneCount: occupiedToneCount === undefined
      ? 1
      : Math.min(occupiedToneCount, MAX_REPRESENTATIVE_OFDM_TONES),
    ...(chipRateHz === undefined ? {} : { chipRateHz }),
    timingModel,
    qualification: STANDARDS_ENGINEERING_COMPLEX_IQ_QUALIFICATION,
    disclosure: STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE,
  };
  return Object.freeze(configuration);
}

export function standardsEngineeringComplexIqConfiguration(
  profileValue: SynthesizedSignalProfile,
): StandardsEngineeringComplexIqConfiguration {
  const profile = standardsEngineeringProfile(profileValue);
  return projectStandardsEngineeringComplexIqConfiguration(waveformDescriptor(profile));
}

/**
 * Generate normalized interleaved cf32le using O(sampleCount * 32) work and
 * O(32) synthesis state. A bounded set of evenly distributed occupied-grid
 * representatives replaces a full resource-grid IFFT by design. The selected
 * constellation is only deterministic engineering texture within the
 * descriptor's modulation class; it never represents a coded payload.
 */
export function synthesizeStandardsEngineeringComplexIq(
  input: StandardsEngineeringComplexIqSynthesisInput,
): Uint8Array {
  const profile = standardsEngineeringProfile(input.profile);
  validateSynthesisGeometry(input);
  const configuration = standardsEngineeringComplexIqConfiguration(profile);
  const startSample = input.startSample ?? 0;
  const byteLength = input.sampleCount * STANDARDS_ENGINEERING_COMPLEX_IQ_BYTES_PER_SAMPLE;
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const filterFeedForward = lowPassFeedForwardCoefficient(input.bandwidthHz, input.sampleRateHz);
  const configurationSeed = configurationHash(configuration);
  const carrierBank = configuration.occupiedToneCount === undefined
    ? undefined
    : createCarrierBank(configuration, input.sampleRateHz, startSample);
  let lastSymbolIndex = Number.NaN;
  let previousInPhase = 0;
  let previousQuadrature = 0;

  for (let index = 0; index < input.sampleCount; index += 1) {
    const absoluteSample = startSample + index;
    const timeSeconds = absoluteSample / input.sampleRateHz;
    const active = timingActive(configuration, timeSeconds);
    let rawInPhase = 0;
    let rawQuadrature = 0;

    if (configuration.chipRateHz !== undefined) {
      if (active) {
        [rawInPhase, rawQuadrature] = dsssEngineeringSample(
          configurationSeed,
          absoluteSample,
          input.sampleRateHz,
          configuration.chipRateHz,
        );
      }
    } else if (carrierBank !== undefined) {
      const symbolIndex = engineeringSymbolIndex(configuration, timeSeconds);
      if (active && symbolIndex !== lastSymbolIndex) {
        updateEngineeringSymbols(carrierBank, configuration, configurationSeed, symbolIndex);
        lastSymbolIndex = symbolIndex;
      }
      if (active) {
        for (let tone = 0; tone < carrierBank.length; tone += 1) {
          rawInPhase += carrierBank.coefficientInPhase[tone]! * carrierBank.carrierInPhase[tone]!
            - carrierBank.coefficientQuadrature[tone]! * carrierBank.carrierQuadrature[tone]!;
          rawQuadrature += carrierBank.coefficientInPhase[tone]! * carrierBank.carrierQuadrature[tone]!
            + carrierBank.coefficientQuadrature[tone]! * carrierBank.carrierInPhase[tone]!;
        }
        rawInPhase /= carrierBank.length;
        rawQuadrature /= carrierBank.length;
      }
      advanceCarrierBank(carrierBank, index);
    }

    const inPhase = index === 0
      ? rawInPhase
      : previousInPhase + filterFeedForward * (rawInPhase - previousInPhase);
    const quadrature = index === 0
      ? rawQuadrature
      : previousQuadrature + filterFeedForward * (rawQuadrature - previousQuadrature);
    previousInPhase = inPhase;
    previousQuadrature = quadrature;
    writeUnitBoundedCf32le(
      view,
      index * STANDARDS_ENGINEERING_COMPLEX_IQ_BYTES_PER_SAMPLE,
      inPhase,
      quadrature,
    );
  }
  return bytes;
}

interface CarrierBank {
  readonly length: number;
  readonly signedToneIndices: Int32Array;
  readonly carrierInPhase: Float64Array;
  readonly carrierQuadrature: Float64Array;
  readonly stepInPhase: Float64Array;
  readonly stepQuadrature: Float64Array;
  readonly coefficientInPhase: Float64Array;
  readonly coefficientQuadrature: Float64Array;
}

function createCarrierBank(
  configuration: StandardsEngineeringComplexIqConfiguration,
  sampleRateHz: number,
  startSample: number,
): CarrierBank {
  const totalToneCount = configuration.occupiedToneCount!;
  const length = configuration.representativeToneCount;
  const spacingHz = configuration.subcarrierSpacingHz!;
  const signedToneIndices = representativeSignedToneIndices(totalToneCount, length);
  const carrierInPhase = new Float64Array(length);
  const carrierQuadrature = new Float64Array(length);
  const stepInPhase = new Float64Array(length);
  const stepQuadrature = new Float64Array(length);
  const startRemainder = startSample % sampleRateHz;
  for (let tone = 0; tone < length; tone += 1) {
    const offsetHz = signedToneIndices[tone]! * spacingHz;
    const aliasedOffsetHz = positiveModulo(offsetHz, sampleRateHz);
    const initialAngle = 2 * Math.PI * aliasedOffsetHz * (startRemainder / sampleRateHz);
    const stepAngle = 2 * Math.PI * aliasedOffsetHz / sampleRateHz;
    carrierInPhase[tone] = Math.cos(initialAngle);
    carrierQuadrature[tone] = Math.sin(initialAngle);
    stepInPhase[tone] = Math.cos(stepAngle);
    stepQuadrature[tone] = Math.sin(stepAngle);
  }
  return {
    length,
    signedToneIndices,
    carrierInPhase,
    carrierQuadrature,
    stepInPhase,
    stepQuadrature,
    coefficientInPhase: new Float64Array(length),
    coefficientQuadrature: new Float64Array(length),
  };
}

function representativeSignedToneIndices(totalToneCount: number, representativeToneCount: number): Int32Array {
  const indices = new Int32Array(representativeToneCount);
  const lowerHalf = totalToneCount / 2;
  for (let ordinal = 0; ordinal < representativeToneCount; ordinal += 1) {
    const occupiedRank = Math.min(
      totalToneCount - 1,
      Math.floor((ordinal + 0.5) * totalToneCount / representativeToneCount),
    );
    indices[ordinal] = occupiedRank < lowerHalf
      ? occupiedRank - lowerHalf
      : occupiedRank - lowerHalf + 1;
  }
  return indices;
}

function updateEngineeringSymbols(
  bank: CarrierBank,
  configuration: StandardsEngineeringComplexIqConfiguration,
  configurationSeed: number,
  symbolIndex: number,
): void {
  for (let tone = 0; tone < bank.length; tone += 1) {
    const word = deterministicWord(configurationSeed, symbolIndex, tone, bank.signedToneIndices[tone]!);
    const modulation = engineeringConstellation(configuration.modulation, word, tone, symbolIndex);
    [bank.coefficientInPhase[tone], bank.coefficientQuadrature[tone]] = constellationPoint(
      modulation,
      word,
      mix32(word ^ 0xa511_e9b3),
    );
  }
}

function engineeringConstellation(
  modulation: WaveformProjection['modulation'],
  word: number,
  tone: number,
  symbolIndex: number,
): 'qpsk' | '64qam' | '256qam' | '1024qam' {
  if (modulation === 'qpsk' || modulation === 'he-ofdm') return 'qpsk';
  if (modulation === '64qam' || modulation === '256qam' || modulation === '1024qam') return modulation;
  if (modulation === 'ofdm-mixed') {
    return (['qpsk', '64qam', '256qam', '1024qam'] as const)[(word + tone + foldSafeInteger(symbolIndex)) & 3]!;
  }
  throw new Error(`${modulation} is not an admitted OFDM engineering constellation`);
}

function constellationPoint(
  modulation: 'qpsk' | '64qam' | '256qam' | '1024qam',
  inPhaseWord: number,
  quadratureWord: number,
): readonly [number, number] {
  const axisPoints = modulation === 'qpsk' ? 2 : modulation === '64qam' ? 8 : modulation === '256qam' ? 16 : 32;
  const maximumLevel = axisPoints - 1;
  const inPhaseLevel = 2 * (inPhaseWord % axisPoints) - maximumLevel;
  const quadratureLevel = 2 * (quadratureWord % axisPoints) - maximumLevel;
  const normalization = Math.SQRT2 * maximumLevel;
  return [inPhaseLevel / normalization, quadratureLevel / normalization];
}

function advanceCarrierBank(bank: CarrierBank, sampleIndex: number): void {
  for (let tone = 0; tone < bank.length; tone += 1) {
    const currentInPhase = bank.carrierInPhase[tone]!;
    const currentQuadrature = bank.carrierQuadrature[tone]!;
    const nextInPhase = currentInPhase * bank.stepInPhase[tone]! - currentQuadrature * bank.stepQuadrature[tone]!;
    const nextQuadrature = currentInPhase * bank.stepQuadrature[tone]! + currentQuadrature * bank.stepInPhase[tone]!;
    if ((sampleIndex & 0x3ff) === 0x3ff) {
      const magnitude = Math.hypot(nextInPhase, nextQuadrature);
      bank.carrierInPhase[tone] = nextInPhase / magnitude;
      bank.carrierQuadrature[tone] = nextQuadrature / magnitude;
    } else {
      bank.carrierInPhase[tone] = nextInPhase;
      bank.carrierQuadrature[tone] = nextQuadrature;
    }
  }
}

function dsssEngineeringSample(
  configurationSeed: number,
  absoluteSample: number,
  sampleRateHz: number,
  chipRateHz: number,
): readonly [number, number] {
  const chipIndex = Math.floor((absoluteSample / sampleRateHz) * chipRateHz);
  const word = deterministicWord(configurationSeed, Math.floor(chipIndex / 8), chipIndex & 7, 0);
  const quadrant = word & 3;
  const component = Math.SQRT1_2;
  return [quadrant === 0 || quadrant === 3 ? component : -component, quadrant < 2 ? component : -component];
}

function timingActive(configuration: StandardsEngineeringComplexIqConfiguration, timeSeconds: number): boolean {
  switch (configuration.timingModel) {
    case 'continuous-engineering-symbol-texture':
    case 'ten-millisecond-frame-engineering-symbol-texture':
      return true;
    case 'lte-tdd-config0-ssp7-normal-cp-downlink-v1':
      return lteTddConfig0Ssp7NormalCpDownlinkActive(
        LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
        timeSeconds,
      );
    case 'nr-tdd-7dl-3ul-engineering-v1':
      return nrTdd7Dl3UlEngineeringDownlinkActive(
        NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS,
        timeSeconds,
      );
    case 'wlan-six-of-ten-millisecond-engineering-burst-v1':
      return positiveModulo(timeSeconds, 0.010) < 0.006;
  }
}

function engineeringSymbolIndex(
  configuration: StandardsEngineeringComplexIqConfiguration,
  timeSeconds: number,
): number {
  const spacingHz = configuration.subcarrierSpacingHz!;
  const absoluteSymbolIndex = Math.floor(timeSeconds * spacingHz + 1e-10);
  if (configuration.timingModel === 'ten-millisecond-frame-engineering-symbol-texture'
    || configuration.timingModel === 'lte-tdd-config0-ssp7-normal-cp-downlink-v1') {
    return positiveModulo(absoluteSymbolIndex, Math.round(spacingHz * 0.010));
  }
  if (configuration.timingModel === 'nr-tdd-7dl-3ul-engineering-v1') {
    return positiveModulo(absoluteSymbolIndex, Math.round(spacingHz * 0.005));
  }
  return absoluteSymbolIndex;
}

function timingModelFor(descriptor: WaveformDescriptor): TimingModel {
  if (descriptor.id === 'lte-band38-tdd-10m') {
    if (descriptor.projection.duplex !== 'tdd' || descriptor.projection.timing !== 'tdd-frame') {
      throw new Error(`${descriptor.id} no longer declares its pinned TDD frame`);
    }
    return 'lte-tdd-config0-ssp7-normal-cp-downlink-v1';
  }
  if (descriptor.id === 'nr-n78-tdd-100m') {
    if (descriptor.projection.duplex !== 'tdd' || descriptor.projection.timing !== 'tdd-frame') {
      throw new Error(`${descriptor.id} no longer declares its pinned TDD frame`);
    }
    return 'nr-tdd-7dl-3ul-engineering-v1';
  }
  // Custom wideband builders render TDD with the family's admitted engineering
  // schedule; the operator's exact UL-DL config/pattern is recorded shaping
  // metadata in the descriptor (see custom-waveform.ts disclosures).
  if (descriptor.id === 'custom-lte' && descriptor.projection.duplex === 'tdd') {
    return 'lte-tdd-config0-ssp7-normal-cp-downlink-v1';
  }
  if (descriptor.id === 'custom-nr' && descriptor.projection.duplex === 'tdd') {
    return 'nr-tdd-7dl-3ul-engineering-v1';
  }
  if (descriptor.projection.duplex === 'tdd' || descriptor.projection.timing === 'tdd-frame') {
    throw new Error(`${descriptor.id} has no admitted concrete TDD engineering schedule`);
  }
  if (descriptor.family === 'wlan') {
    if (descriptor.projection.timing !== 'burst') throw new Error(`${descriptor.id} must retain WLAN burst timing`);
    return 'wlan-six-of-ten-millisecond-engineering-burst-v1';
  }
  return descriptor.projection.timing === 'frame'
    ? 'ten-millisecond-frame-engineering-symbol-texture'
    : 'continuous-engineering-symbol-texture';
}

function validateSynthesisGeometry(input: StandardsEngineeringComplexIqSynthesisInput): void {
  if (!Number.isSafeInteger(input.sampleRateHz)
    || input.sampleRateHz < MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ
    || input.sampleRateHz > MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ) {
    throw new RangeError(`Standards engineering complex-I/Q sample rate must be a safe integer from ${MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ} through ${MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ} Hz`);
  }
  if (!Number.isSafeInteger(input.bandwidthHz)
    || input.bandwidthHz < MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ
    || input.bandwidthHz > MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ) {
    throw new RangeError(`Standards engineering complex-I/Q bandwidth must be a safe integer from ${MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ} through ${MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ} Hz`);
  }
  if (input.bandwidthHz > input.sampleRateHz) {
    throw new RangeError('Standards engineering complex-I/Q bandwidth may not exceed its sample rate');
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLES) {
    throw new RangeError(`Standards engineering complex-I/Q sample count must be a safe integer from 1 through ${MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLES}`);
  }
  const startSample = input.startSample ?? 0;
  if (!Number.isSafeInteger(startSample) || startSample < 0
    || startSample > Number.MAX_SAFE_INTEGER - (input.sampleCount - 1)) {
    throw new RangeError('Standards engineering complex-I/Q start sample must be a non-negative safe integer whose capture remains safe');
  }
}

function standardsEngineeringProfile(value: SynthesizedSignalProfile): StandardsEngineeringComplexIqProfile {
  const profile = synthesizedSignalProfileSchema.parse(value);
  if (!isStandardsEngineeringComplexIqProfile(profile)) {
    throw new RangeError(`${profile} has no standards engineering complex-I/Q projection`);
  }
  return profile;
}

function isStandardsFamily(family: WaveformDescriptor['family']): family is StandardsFamily {
  return family === 'e-utra' || family === 'nr' || family === 'wlan';
}

function requirePositiveSafeInteger(value: number | undefined, label: string): number {
  if (!Number.isSafeInteger(value) || value === undefined || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function configurationHash(configuration: StandardsEngineeringComplexIqConfiguration): number {
  return fnv1a32([
    configuration.profile,
    configuration.family,
    configuration.centerHz,
    configuration.occupiedBandwidthHz,
    configuration.allocation,
    configuration.modulation,
    configuration.timing,
    configuration.duplex ?? 'none',
    configuration.subcarrierSpacingHz ?? 0,
    configuration.nominalResourceBlocks ?? 0,
    configuration.occupiedToneCount ?? 0,
    configuration.chipRateHz ?? 0,
    configuration.timingModel,
  ].join('|'));
}

function deterministicWord(seed: number, symbolIndex: number, toneOrdinal: number, signedToneIndex: number): number {
  const low = foldSafeInteger(symbolIndex);
  const high = foldSafeInteger(Math.floor(symbolIndex / 0x1_0000_0000));
  return mix32(seed ^ low ^ rotateLeft32(high, 11) ^ Math.imul(toneOrdinal + 1, 0x9e37_79b1) ^ Math.imul(signedToneIndex, 0x85eb_ca6b));
}

function foldSafeInteger(value: number): number {
  return Math.trunc(positiveModulo(value, 0x1_0000_0000)) >>> 0;
}

function fnv1a32(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function rotateLeft32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
