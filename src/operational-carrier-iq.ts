/**
 * Corpus-only seeded PDSCH variants for operational LTE/NR carriers.
 *
 * This code intentionally consumes the fixed reference-grid generators but
 * never changes their catalog artifacts.  It copies their grid, flips only
 * QPSK PDSCH data bits from a deterministic corpus seed, and renders that
 * derived grid at the identical OFDM geometry.  It is training data only:
 * the seeded bit stream is not a transport-block encoder, rate matcher, CRC,
 * scheduler, or qualification claim.
 */
import { fftForwardUnscaledInPlace } from '@atomos/dsp';
import {
  LTE_RESOURCE_ELEMENT_KIND,
} from './lte-etm1-reference.js';
import {
  LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ,
  LTE_BAND3_FDD_20M_FRAME_SAMPLES,
  LTE_BAND3_FDD_20M_PROFILE,
  LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ,
  generateLteBand3Fdd20mReferenceFrame,
} from './lte-band3-fdd-20m-reference.js';
import {
  LTE_BAND38_TDD_10M_CHANNEL_BANDWIDTH_HZ,
  LTE_BAND38_TDD_10M_FRAME_SAMPLES,
  LTE_BAND38_TDD_10M_PROFILE,
  LTE_BAND38_TDD_10M_SAMPLE_RATE_HZ,
  generateLteBand38Tdd10mReferenceFrame,
} from './lte-band38-tdd-10m-reference.js';
import {
  NR_RESOURCE_ELEMENT_KIND,
} from './nr-fr1-test-model-reference.js';
import {
  NR_N3_FDD_20M_BINDING,
  NR_N3_FDD_20M_PROFILE,
  generateNrN3Fdd20mFrame,
} from './nr-n3-fdd-20m-reference.js';
import {
  NR_N78_TDD_100M_BINDING,
  NR_N78_TDD_100M_PROFILE,
  NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND,
  generateNrN78Tdd100mFrame,
} from './nr-n78-tdd-100m-reference.js';
import {
  corpusContentWord,
  validateCorpusContentSeed,
} from './corpus-content-prng.js';

export const OPERATIONAL_CARRIER_CORPUS_PROFILES = [
  'lte-band3-fdd-20m',
  'lte-band38-tdd-10m',
  'nr-n3-fdd-20m',
  'nr-n78-tdd-100m',
] as const;

export type OperationalCarrierCorpusProfile =
  typeof OPERATIONAL_CARRIER_CORPUS_PROFILES[number];

export interface OperationalCarrierCorpusFrameInput {
  readonly profile: OperationalCarrierCorpusProfile;
  readonly contentSeed: number;
  readonly contentRowIndex: number;
}

export interface OperationalCarrierCorpusIqInput extends OperationalCarrierCorpusFrameInput {
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

export interface OperationalCarrierCorpusFrame {
  readonly profile: OperationalCarrierCorpusProfile;
  readonly contentSeed: number;
  readonly contentRowIndex: number;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly kinds: Uint8Array;
    readonly symbolCount: number;
    readonly subcarrierCount: number;
  };
  readonly pdschResourceElements: number;
  readonly changedPdschResourceElements: number;
  readonly cf32le: Uint8Array;
}

interface CarrierBase {
  readonly profile: OperationalCarrierCorpusProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly frameSamples: number;
  readonly grid: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
    readonly kinds: Uint8Array;
    readonly symbolCount: number;
    readonly subcarrierCount: number;
  };
  readonly timeDomain: {
    readonly real: Float64Array;
    readonly imaginary: Float64Array;
  };
  readonly fftSize: number;
  readonly cpSamplesForSymbol: (symbol: number) => number;
  readonly fftBinForSubcarrier: (subcarrier: number) => number;
  readonly pdschKinds: readonly number[];
}

const MAX_SAMPLES_PER_CALL = 65_536;
const MAX_START_SAMPLE_INDEX = 0x7fff_ffff;

let lastBase: CarrierBase | undefined;
let lastVariant: OperationalCarrierCorpusFrame | undefined;

/**
 * Build one cyclic corpus frame.  The source is cached only for the current
 * profile/seed/row, which keeps chunked stage-1 synthesis efficient without
 * retaining an unbounded production-corpus cache.
 */
export function buildOperationalCarrierCorpusFrame(
  input: OperationalCarrierCorpusFrameInput,
): OperationalCarrierCorpusFrame {
  validateFrameInput(input);
  if (lastVariant !== undefined
    && lastVariant.profile === input.profile
    && lastVariant.contentSeed === input.contentSeed
    && lastVariant.contentRowIndex === input.contentRowIndex) {
    return lastVariant;
  }
  const base = baseFor(input.profile);
  const varied = varyPdschGrid(base, input.contentSeed, input.contentRowIndex);
  const timeDomain = renderChangedPdschSymbols(base, varied.real, varied.imaginary);
  const cf32le = encodeCf32le(timeDomain.real, timeDomain.imaginary);
  lastVariant = Object.freeze({
    profile: input.profile,
    contentSeed: input.contentSeed,
    contentRowIndex: input.contentRowIndex,
    sampleRateHz: base.sampleRateHz,
    bandwidthHz: base.bandwidthHz,
    grid: Object.freeze({
      real: varied.real,
      imaginary: varied.imaginary,
      kinds: base.grid.kinds,
      symbolCount: base.grid.symbolCount,
      subcarrierCount: base.grid.subcarrierCount,
    }),
    pdschResourceElements: varied.pdschResourceElements,
    changedPdschResourceElements: varied.changedPdschResourceElements,
    cf32le,
  });
  return lastVariant;
}

/**
 * Return deterministic, bounded-rate cf32le capture chunks for stage 1.
 * As with the fixed source, packet/frame repetition is cyclic; seeded PDSCH
 * content is independent from the caller's time-origin and phase draws.
 */
export function synthesizeOperationalCarrierCorpusIq(
  input: OperationalCarrierCorpusIqInput,
): Uint8Array {
  const startSampleIndex = validateIqInput(input);
  const frame = buildOperationalCarrierCorpusFrame(input);
  return sliceCyclicCf32le(frame.cf32le, startSampleIndex, input.sampleCount);
}

function validateFrameInput(input: OperationalCarrierCorpusFrameInput): void {
  if (!(OPERATIONAL_CARRIER_CORPUS_PROFILES as readonly string[]).includes(input.profile)) {
    throw new RangeError(`${input.profile} has no operational-carrier corpus generator`);
  }
  validateCorpusContentSeed(input.contentSeed);
  if (!Number.isSafeInteger(input.contentRowIndex) || input.contentRowIndex < 0) {
    throw new RangeError('Operational-carrier contentRowIndex must be a non-negative safe integer');
  }
}

function validateIqInput(input: OperationalCarrierCorpusIqInput): number {
  validateFrameInput(input);
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > MAX_SAMPLES_PER_CALL) {
    throw new RangeError(`Operational-carrier sampleCount must be an integer from 1 through ${MAX_SAMPLES_PER_CALL}`);
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex)
    || startSampleIndex < 0
    || startSampleIndex > MAX_START_SAMPLE_INDEX
    || startSampleIndex + input.sampleCount - 1 > MAX_START_SAMPLE_INDEX) {
    throw new RangeError('Operational-carrier startSampleIndex is outside the supported range');
  }
  const base = baseFor(input.profile);
  if (input.sampleRateHz !== base.sampleRateHz || input.bandwidthHz !== base.bandwidthHz) {
    throw new RangeError(
      `${input.profile} corpus path requires ${base.sampleRateHz} Hz sample rate and ${base.bandwidthHz} Hz bandwidth`,
    );
  }
  return startSampleIndex;
}

function baseFor(profile: OperationalCarrierCorpusProfile): CarrierBase {
  if (lastBase?.profile === profile) return lastBase;
  lastVariant = undefined;
  if (profile === LTE_BAND3_FDD_20M_PROFILE) {
    const reference = generateLteBand3Fdd20mReferenceFrame();
    lastBase = Object.freeze({
      profile,
      sampleRateHz: LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ,
      bandwidthHz: LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ,
      frameSamples: LTE_BAND3_FDD_20M_FRAME_SAMPLES,
      grid: reference.grid,
      timeDomain: reference.timeDomain,
      fftSize: 2_048,
      cpSamplesForSymbol: (symbol: number) => symbol % 7 === 0 ? 160 : 144,
      fftBinForSubcarrier: (subcarrier: number) => lteFftBin(subcarrier, 1_200, 2_048),
      pdschKinds: Object.freeze([LTE_RESOURCE_ELEMENT_KIND.pdsch]),
    });
    return lastBase;
  }
  if (profile === LTE_BAND38_TDD_10M_PROFILE) {
    const reference = generateLteBand38Tdd10mReferenceFrame();
    lastBase = Object.freeze({
      profile,
      sampleRateHz: LTE_BAND38_TDD_10M_SAMPLE_RATE_HZ,
      bandwidthHz: LTE_BAND38_TDD_10M_CHANNEL_BANDWIDTH_HZ,
      frameSamples: LTE_BAND38_TDD_10M_FRAME_SAMPLES,
      grid: reference.grid,
      timeDomain: reference.timeDomain,
      fftSize: 1_024,
      cpSamplesForSymbol: (symbol: number) => symbol % 7 === 0 ? 80 : 72,
      fftBinForSubcarrier: (subcarrier: number) => lteFftBin(subcarrier, 600, 1_024),
      pdschKinds: Object.freeze([LTE_RESOURCE_ELEMENT_KIND.pdsch]),
    });
    return lastBase;
  }
  if (profile === NR_N3_FDD_20M_PROFILE) {
    const reference = generateNrN3Fdd20mFrame();
    lastBase = Object.freeze({
      profile,
      sampleRateHz: NR_N3_FDD_20M_BINDING.sampleRateHz,
      bandwidthHz: NR_N3_FDD_20M_BINDING.channelBandwidthHz,
      frameSamples: NR_N3_FDD_20M_BINDING.frameSampleCount,
      grid: reference.grid,
      timeDomain: reference.timeDomain,
      fftSize: NR_N3_FDD_20M_BINDING.fftSize,
      cpSamplesForSymbol: (symbol: number) => symbol % 14 === 0 || symbol % 14 === 7 ? 160 : 144,
      fftBinForSubcarrier: (subcarrier: number) => nrFftBin(subcarrier, 1_272, 2_048),
      pdschKinds: Object.freeze([
        NR_RESOURCE_ELEMENT_KIND.pdschRnti0Data,
        NR_RESOURCE_ELEMENT_KIND.pdschRnti2Data,
      ]),
    });
    return lastBase;
  }
  const reference = generateNrN78Tdd100mFrame();
  lastBase = Object.freeze({
    profile,
    sampleRateHz: NR_N78_TDD_100M_BINDING.sampleRateHz,
    bandwidthHz: NR_N78_TDD_100M_BINDING.channelBandwidthHz,
    frameSamples: NR_N78_TDD_100M_BINDING.artifactSampleCount,
    grid: reference.grid,
    timeDomain: reference.timeDomain,
    fftSize: NR_N78_TDD_100M_BINDING.fftSize,
    cpSamplesForSymbol: (symbol: number) => symbol % 14 === 0 ? 352 : 288,
    fftBinForSubcarrier: (subcarrier: number) => nrFftBin(subcarrier, 3_276, 4_096),
    pdschKinds: Object.freeze([
      NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdschRnti0Data,
      NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdschRnti2Data,
    ]),
  });
  return lastBase;
}

function varyPdschGrid(base: CarrierBase, contentSeed: number, contentRowIndex: number): {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
  readonly pdschResourceElements: number;
  readonly changedPdschResourceElements: number;
} {
  const real = Float64Array.from(base.grid.real);
  const imaginary = Float64Array.from(base.grid.imaginary);
  const key = corpusContentWord(contentSeed, base.profile, contentRowIndex, 0x4f01);
  const pdschKindSet = new Set(base.pdschKinds);
  let pdschResourceElements = 0;
  let changedPdschResourceElements = 0;
  for (let index = 0; index < base.grid.kinds.length; index += 1) {
    if (!pdschKindSet.has(base.grid.kinds[index]!)) continue;
    const word = mix32(key ^ Math.imul(index, 0x9e37_79b1));
    const realSign = (word & 1) === 0 ? 1 : -1;
    const imaginarySign = (word & 2) === 0 ? 1 : -1;
    real[index] = base.grid.real[index]! * realSign;
    imaginary[index] = base.grid.imaginary[index]! * imaginarySign;
    if (realSign === -1 || imaginarySign === -1) changedPdschResourceElements += 1;
    pdschResourceElements += 1;
  }
  if (pdschResourceElements === 0 || changedPdschResourceElements === 0) {
    throw new Error(`${base.profile} seeded corpus grid did not change any PDSCH resource elements`);
  }
  return { real, imaginary, pdschResourceElements, changedPdschResourceElements };
}

/** Re-render only OFDM symbols that contain PDSCH; all other time samples stay copied verbatim. */
function renderChangedPdschSymbols(
  base: CarrierBase,
  gridReal: Float64Array,
  gridImaginary: Float64Array,
): { readonly real: Float64Array; readonly imaginary: Float64Array } {
  const real = Float64Array.from(base.timeDomain.real);
  const imaginary = Float64Array.from(base.timeDomain.imaginary);
  const pdschKindSet = new Set(base.pdschKinds);
  let sampleOffset = 0;
  for (let symbol = 0; symbol < base.grid.symbolCount; symbol += 1) {
    const cpSamples = base.cpSamplesForSymbol(symbol);
    const symbolSamples = cpSamples + base.fftSize;
    const gridOffset = symbol * base.grid.subcarrierCount;
    let hasPdsch = false;
    for (let subcarrier = 0; subcarrier < base.grid.subcarrierCount; subcarrier += 1) {
      if (pdschKindSet.has(base.grid.kinds[gridOffset + subcarrier]!)) {
        hasPdsch = true;
        break;
      }
    }
    if (hasPdsch) {
      const body = inverseOfdmSymbol(base, gridReal, gridImaginary, symbol);
      real.set(body.real.subarray(base.fftSize - cpSamples), sampleOffset);
      imaginary.set(body.imaginary.subarray(base.fftSize - cpSamples), sampleOffset);
      real.set(body.real, sampleOffset + cpSamples);
      imaginary.set(body.imaginary, sampleOffset + cpSamples);
    }
    sampleOffset += symbolSamples;
  }
  if (sampleOffset !== base.frameSamples) {
    throw new Error(`${base.profile} OFDM layout produced ${sampleOffset} samples, expected ${base.frameSamples}`);
  }
  return { real, imaginary };
}

function inverseOfdmSymbol(
  base: CarrierBase,
  gridReal: Float64Array,
  gridImaginary: Float64Array,
  symbol: number,
): { readonly real: Float64Array; readonly imaginary: Float64Array } {
  const real = new Float64Array(base.fftSize);
  const imaginary = new Float64Array(base.fftSize);
  const gridOffset = symbol * base.grid.subcarrierCount;
  for (let subcarrier = 0; subcarrier < base.grid.subcarrierCount; subcarrier += 1) {
    const bin = base.fftBinForSubcarrier(subcarrier);
    real[bin] = gridReal[gridOffset + subcarrier]!;
    imaginary[bin] = -gridImaginary[gridOffset + subcarrier]!;
  }
  fftForwardUnscaledInPlace(real, imaginary);
  for (let sample = 0; sample < base.fftSize; sample += 1) {
    real[sample] = real[sample]! / base.fftSize;
    imaginary[sample] = -imaginary[sample]! / base.fftSize;
  }
  return { real, imaginary };
}

function encodeCf32le(real: Float64Array, imaginary: Float64Array): Uint8Array {
  if (real.length !== imaginary.length) throw new RangeError('I/Q lanes must have equal lengths');
  const bytes = new Uint8Array(real.length * 8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let sample = 0; sample < real.length; sample += 1) {
    const inPhase = real[sample]!;
    const quadrature = imaginary[sample]!;
    if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature)) {
      throw new Error(`Operational-carrier renderer produced a non-finite sample at ${sample}`);
    }
    view.setFloat32(sample * 8, inPhase, true);
    view.setFloat32(sample * 8 + 4, quadrature, true);
  }
  return bytes;
}

function sliceCyclicCf32le(source: Uint8Array, startSampleIndex: number, sampleCount: number): Uint8Array {
  const periodSamples = source.byteLength / 8;
  const output = new Uint8Array(sampleCount * 8);
  let written = 0;
  while (written < sampleCount) {
    const sourceSample = (startSampleIndex + written) % periodSamples;
    const copySamples = Math.min(sampleCount - written, periodSamples - sourceSample);
    output.set(
      source.subarray(sourceSample * 8, (sourceSample + copySamples) * 8),
      written * 8,
    );
    written += copySamples;
  }
  return output;
}

function lteFftBin(subcarrier: number, activeSubcarriers: number, fftSize: number): number {
  return subcarrier < activeSubcarriers / 2
    ? fftSize - activeSubcarriers / 2 + subcarrier
    : subcarrier - activeSubcarriers / 2 + 1;
}

function nrFftBin(subcarrier: number, activeSubcarriers: number, fftSize: number): number {
  const lowerGuardBins = (fftSize - activeSubcarriers) / 2;
  return (lowerGuardBins + subcarrier - fftSize / 2 + fftSize) % fftSize;
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
