import {
  writeUnitBoundedCf32le,
} from '@atomos/dsp';
import {
  isBluetoothLongDwellProfile,
  synthesizeBluetoothLongDwellIq,
} from './bluetooth-long-dwell-iq.js';
import {
  SYNTHESIZED_SIGNAL_PROFILES,
  synthesizedSignalProfileSchema,
  type SynthesizedSignalProfile,
} from './contracts.js';
import {
  isGeranComplexIqProfile,
  synthesizeGeranComplexIq,
} from './geran-iq.js';
import {
  isGeranFixedCatalogProfile,
  synthesizeGeranFixedCatalogIq,
} from './geran-fixed-catalog-iq.js';
import {
  isStandardsEngineeringComplexIqProfile,
  synthesizeStandardsEngineeringComplexIq,
} from './ofdm-iq.js';
import {
  LTE_ETM1_1_CATALOG_PROFILE,
  synthesizeLteEtm11CatalogIq,
} from './lte-etm1-catalog-iq.js';
import {
  isLteEtm3CatalogProfile,
  synthesizeLteEtm3CatalogIq,
} from './lte-etm3-catalog-iq.js';
import {
  synthesizeLteBand3Fdd20mCatalogIq,
} from './lte-band3-fdd-20m-catalog-iq.js';
import {
  LTE_BAND3_FDD_20M_PROFILE,
} from './lte-band3-fdd-20m-reference.js';
import {
  synthesizeLteBand38Tdd10mCatalogIq,
} from './lte-band38-tdd-10m-catalog-iq.js';
import {
  LTE_BAND38_TDD_10M_PROFILE,
} from './lte-band38-tdd-10m-reference.js';
import {
  synthesizeLteNtmCatalogIq,
} from './lte-ntm-catalog-iq.js';
import {
  isLteNtmProfile,
} from './lte-ntm-reference.js';
import {
  isNrFr1TmCatalogProfile,
  synthesizeNrFr1TmCatalogIq,
} from './nr-fr1-test-model-catalog-iq.js';
import {
  isNrRemainingFixedProfile,
  synthesizeNrRemainingFixedCatalogIq,
} from './nr-remaining-fixed-catalog-iq.js';
import {
  isBluetoothFixedCatalogProfile,
  synthesizeBluetoothFixedCatalogIq,
} from './bluetooth-fixed-catalog-iq.js';
import {
  isWlanFixedProfileId,
  synthesizeWlanFixedCatalogIq,
} from './wlan-fixed-iq.js';
import {
  DEFAULT_REFERENCE_IQ_SEED,
  isReferenceComplexIqProfile,
  synthesizeReferenceComplexIq,
} from './reference-iq.js';

export const LAB_ANALYTIC_COMPLEX_IQ_PROFILES = ['cw', 'am', 'fm'] as const;
export type LabAnalyticComplexIqProfile = typeof LAB_ANALYTIC_COMPLEX_IQ_PROFILES[number];

/** Every profile in the closed catalog has an installed deterministic complex-
 * envelope generator. Fixed standards-linked members dispatch to exact,
 * content-addressed digital artifacts; operator builders remain engineering
 * projections. Catalog membership is never a broad or RF-conformance claim. */
export const ANALYTIC_COMPLEX_IQ_PROFILES = SYNTHESIZED_SIGNAL_PROFILES;
export type AnalyticComplexIqProfile = typeof ANALYTIC_COMPLEX_IQ_PROFILES[number];
export type ComplexIqGeneratorBasis =
  | 'analytic-laboratory'
  | 'standards-derived-engineering-projection'
  | 'content-bound-digital-baseband';

export function complexIqGeneratorBasis(profile: SynthesizedSignalProfile): ComplexIqGeneratorBasis {
  const admitted = synthesizedSignalProfileSchema.parse(profile);
  // The single-carrier references are deterministic analytic lab waveforms (like
  // cw/am/fm), not standards-derived engineering projections. They carry the
  // 'visual' catalog qualification, so their measurements must report the
  // 'analytic-complex-baseband' basis the admission layer expects for a visual
  // source (see expectedMeasurementQualification in the Atomizer instrument
  // manager) — otherwise a reference I/Q capture is rejected as a qualification
  // mismatch.
  const isAnalyticLab = LAB_ANALYTIC_COMPLEX_IQ_PROFILES.some((candidate) => candidate === admitted)
    || isReferenceComplexIqProfile(admitted);
  if (isAnalyticLab) return 'analytic-laboratory';
  if (isGeranFixedCatalogProfile(admitted)
    || admitted === LTE_BAND3_FDD_20M_PROFILE
    || admitted === LTE_BAND38_TDD_10M_PROFILE
    || admitted === LTE_ETM1_1_CATALOG_PROFILE
    || isLteEtm3CatalogProfile(admitted)
    || isLteNtmProfile(admitted)
    || isNrFr1TmCatalogProfile(admitted)
    || isNrRemainingFixedProfile(admitted)
    || isWlanFixedProfileId(admitted)
    || isBluetoothFixedCatalogProfile(admitted)) {
    return 'content-bound-digital-baseband';
  }
  return 'standards-derived-engineering-projection';
}

/** Hard producer bounds, shared with the bridge contract to prevent drift. */
export const MAX_ANALYTIC_COMPLEX_IQ_SAMPLES = 65_536 as const;
export const ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE = 8 as const;
export const MAX_ANALYTIC_COMPLEX_IQ_BYTES = MAX_ANALYTIC_COMPLEX_IQ_SAMPLES * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE;
export const MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ = 1_000_000 as const;
export const MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ = 491_520_000 as const;
export const MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ = 1_000 as const;
export const MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ = 491_520_000 as const;

export const ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ = 25_000 as const;
export const ANALYTIC_IQ_AM_MODULATION_INDEX = 0.72 as const;
export const ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ = 25_000 as const;
export const ANALYTIC_IQ_FM_DEVIATION_HZ = 75_000 as const;
export const DEFAULT_STANDARDS_ENGINEERING_COMPLEX_IQ_SEED = 407 as const;

export interface AnalyticComplexIqSynthesisInput {
  readonly profile: SynthesizedSignalProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  /**
   * Absolute sample coordinate of the first output sample. Successive
   * captures pass their running cursor here so complex-I/Q evolves in time
   * exactly like every other acquisition kind (a repeated capture with the
   * same coordinate remains bit-identical). Defaults to 0.
   */
  readonly startSampleIndex?: number;
}

/**
 * Produce a normalized source complex envelope in interleaved cf32le.
 *
 * "Source" here means before an optional receiver-impairment preset. The
 * PSK/QAM reference sources deliberately include their separately disclosed
 * intrinsic seeded 40 dB AWGN; they are not noiseless vectors.
 *
 * `bandwidthHz` declares the intrinsic signal/channel support used for
 * geometry admission and standards-parameterized source construction. It is
 * never a capture filter. The returned source is indexed only by absolute
 * sample coordinate, so whole and split captures are byte-identical. Any
 * receiver filter must be a separately named transform with its own receipt.
 *
 * CW, AM, and FM are closed-form laboratory signals. Every standards-linked
 * fixed catalog member dispatches to a content-addressed digital-baseband
 * artifact without filtering or resampling. The three operator-defined
 * builders remain standards-parameterized engineering generators.
 */
export function synthesizeAnalyticComplexIq(input: AnalyticComplexIqSynthesisInput): Uint8Array {
  const profile = analyticComplexIqProfile(input.profile);
  if (!Number.isSafeInteger(input.sampleRateHz)
    || input.sampleRateHz < MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ
    || input.sampleRateHz > MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ) {
    throw new RangeError(`Analytic complex-I/Q sample rate must be a safe integer from ${MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ} through ${MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ} Hz`);
  }
  if (!Number.isSafeInteger(input.bandwidthHz)
    || input.bandwidthHz < MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ
    || input.bandwidthHz > MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ) {
    throw new RangeError(`Analytic complex-I/Q bandwidth must be a safe integer from ${MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ} through ${MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ} Hz`);
  }
  if (input.bandwidthHz > input.sampleRateHz) {
    throw new RangeError('Analytic complex-I/Q bandwidth may not exceed its sample rate');
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_ANALYTIC_COMPLEX_IQ_SAMPLES) {
    throw new RangeError(`Analytic complex-I/Q sample count must be a safe integer from 1 through ${MAX_ANALYTIC_COMPLEX_IQ_SAMPLES}`);
  }
  const byteLength = input.sampleCount * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE;
  if (!Number.isSafeInteger(byteLength) || byteLength > MAX_ANALYTIC_COMPLEX_IQ_BYTES) {
    throw new RangeError(`Analytic complex-I/Q payload may not exceed ${MAX_ANALYTIC_COMPLEX_IQ_BYTES} bytes`);
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex) || startSampleIndex < 0
    || !Number.isSafeInteger(startSampleIndex + input.sampleCount)) {
    throw new RangeError('Analytic complex-I/Q start sample index must be a non-negative safe integer');
  }

  if (profile === LTE_ETM1_1_CATALOG_PROFILE) {
    return synthesizeLteEtm11CatalogIq({
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (profile === LTE_BAND3_FDD_20M_PROFILE) {
    return synthesizeLteBand3Fdd20mCatalogIq({
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (profile === LTE_BAND38_TDD_10M_PROFILE) {
    return synthesizeLteBand38Tdd10mCatalogIq({
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isLteEtm3CatalogProfile(profile)) {
    return synthesizeLteEtm3CatalogIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isLteNtmProfile(profile)) {
    return synthesizeLteNtmCatalogIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isNrFr1TmCatalogProfile(profile)) {
    return synthesizeNrFr1TmCatalogIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isNrRemainingFixedProfile(profile)) {
    return synthesizeNrRemainingFixedCatalogIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isWlanFixedProfileId(profile)) {
    return synthesizeWlanFixedCatalogIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isBluetoothLongDwellProfile(profile)) {
    return synthesizeBluetoothLongDwellIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isBluetoothFixedCatalogProfile(profile)) {
    return synthesizeBluetoothFixedCatalogIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
    });
  }
  if (isGeranFixedCatalogProfile(profile)) {
    return synthesizeGeranFixedCatalogIq({
      ...input,
      profile,
      startSampleIndex,
    });
  }
  if (isGeranComplexIqProfile(profile)) {
    return synthesizeGeranComplexIq({
      ...input,
      profile,
      seed: DEFAULT_STANDARDS_ENGINEERING_COMPLEX_IQ_SEED,
      startSampleIndex,
    });
  }
  if (isStandardsEngineeringComplexIqProfile(profile)) {
    return synthesizeStandardsEngineeringComplexIq({
      ...input,
      profile,
      startSample: startSampleIndex,
    });
  }
  if (isReferenceComplexIqProfile(profile)) {
    return synthesizeReferenceComplexIq({
      profile,
      sampleRateHz: input.sampleRateHz,
      bandwidthHz: input.bandwidthHz,
      sampleCount: input.sampleCount,
      startSampleIndex,
      seed: DEFAULT_REFERENCE_IQ_SEED,
    });
  }
  if (!isLabAnalyticComplexIqProfile(profile)) {
    throw new Error(`Closed complex-I/Q profile ${profile satisfies never} has no installed generator`);
  }

  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < input.sampleCount; index += 1) {
    const timeSeconds = (startSampleIndex + index) / input.sampleRateHz;
    const [rawInPhase, rawQuadrature] = analyticLaboratorySample(profile, timeSeconds);
    writeUnitBoundedCf32le(
      view,
      index * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE,
      rawInPhase,
      rawQuadrature,
    );
  }
  return bytes;
}

export function isAnalyticComplexIqProfile(profile: SynthesizedSignalProfile): profile is AnalyticComplexIqProfile {
  return ANALYTIC_COMPLEX_IQ_PROFILES.some((candidate) => candidate === profile);
}

export function isLabAnalyticComplexIqProfile(
  profile: SynthesizedSignalProfile,
): profile is LabAnalyticComplexIqProfile {
  return LAB_ANALYTIC_COMPLEX_IQ_PROFILES.some((candidate) => candidate === profile);
}

function analyticComplexIqProfile(value: SynthesizedSignalProfile): AnalyticComplexIqProfile {
  const profile = synthesizedSignalProfileSchema.parse(value);
  if (!isAnalyticComplexIqProfile(profile)) {
    throw new RangeError(`${profile} has no truthful complex-I/Q generator installed`);
  }
  return profile;
}

/**
 * Exact source complex envelope for the three closed-form lab stimuli.
 *
 * Exported so conformance-policy tests can compare the implementation with
 * independent mathematical oracles without treating cf32 packing as part of
 * the source equation.
 */
export function analyticLaboratorySample(
  profile: LabAnalyticComplexIqProfile,
  timeSeconds: number,
): readonly [number, number] {
  if (!Number.isFinite(timeSeconds)) {
    throw new RangeError('Analytic laboratory sample time must be finite');
  }
  switch (profile) {
    case 'cw':
      return [1, 0];
    case 'am': {
      // DSB full-carrier AM, normalized so its maximum envelope is exactly 1.
      const message = Math.cos(2 * Math.PI * ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ * timeSeconds);
      return [(1 + ANALYTIC_IQ_AM_MODULATION_INDEX * message) / (1 + ANALYTIC_IQ_AM_MODULATION_INDEX), 0];
    }
    case 'fm': {
      // The selected catalog profile has beta = deviation / modulation rate = 3.
      const modulationIndex = ANALYTIC_IQ_FM_DEVIATION_HZ / ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ;
      const phase = modulationIndex * Math.sin(2 * Math.PI * ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ * timeSeconds);
      return [Math.cos(phase), Math.sin(phase)];
    }
  }
}

export function encodeInterleavedSamples(
  analytic: Float32Array | Float64Array,
  input: Pick<AnalyticComplexIqSynthesisInput, 'sampleCount'>,
): Uint8Array {
  if (analytic.length !== input.sampleCount * 2) {
    throw new Error('Complex-I/Q engineering generator returned invalid interleaved sample geometry');
  }
  const bytes = new Uint8Array(input.sampleCount * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < input.sampleCount; index += 1) {
    writeUnitBoundedCf32le(
      view,
      index * ANALYTIC_COMPLEX_IQ_BYTES_PER_SAMPLE,
      analytic[index * 2]!,
      analytic[index * 2 + 1]!,
    );
  }
  return bytes;
}
