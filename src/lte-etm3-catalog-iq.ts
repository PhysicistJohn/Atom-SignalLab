import { sha256HexOfBytes } from './platform-bytes.js';
import {
  LTE_ETM3_REFERENCE_PROFILES,
  generateLteEtm3ReferenceFrame,
  type LteEtm3ReferenceFrame,
  type LteEtm3ReferenceProfile,
} from './lte-etm3-reference.js';

export const LTE_ETM3_CATALOG_SAMPLE_RATE_HZ = 15_360_000 as const;
export const LTE_ETM3_CATALOG_CHANNEL_BANDWIDTH_HZ = 10_000_000 as const;
export const LTE_ETM3_CATALOG_FRAME_SAMPLES = 153_600 as const;
export const LTE_ETM3_CATALOG_BYTES_PER_SAMPLE = 8 as const;

export const LTE_ETM3_CATALOG_CF32LE_SHA256 = Object.freeze({
  'lte-etm3.1': '5472e9cd8c923bd62da527d0b2f5d655aa516b5e762a27ed29ca21817f124219',
  'lte-etm3.1a': '4e552324f32862337b31f9cb6a94deb8a306655770570f2ec84b30ec808ffc85',
  'lte-etm3.1b': 'e55e2253f32ff9ff7cfb04f6c4ca36bb5acf53e00764f547a5788f7221310e9f',
} as const);

export const LTE_ETM3_CATALOG_DIGITAL_QUALIFICATION = Object.freeze({
  'lte-etm3.1': Object.freeze({
    state: 'independently-verified' as const,
    basis: 'composed-from-full-frame-etm1-oracle-and-srsran-exhaustive-64qam-oracle' as const,
    rfConformance: 'not-claimed' as const,
    productCertification: 'not-claimed' as const,
  }),
  'lte-etm3.1a': Object.freeze({
    state: 'independently-verified' as const,
    basis: 'composed-from-full-frame-etm1-oracle-and-srsran-exhaustive-256qam-oracle' as const,
    rfConformance: 'not-claimed' as const,
    productCertification: 'not-claimed' as const,
  }),
  'lte-etm3.1b': Object.freeze({
    state: 'independently-verified' as const,
    basis: 'composed-from-full-frame-etm1-oracle-and-ocudu-exhaustive-1024qam-oracle' as const,
    rfConformance: 'not-claimed' as const,
    productCertification: 'not-claimed' as const,
  }),
});

export interface LteEtm3CatalogIqInput {
  readonly profile: LteEtm3ReferenceProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

const frameCache = new Map<LteEtm3ReferenceProfile, LteEtm3ReferenceFrame>();
const cf32Cache = new Map<LteEtm3ReferenceProfile, Uint8Array>();

export function isLteEtm3CatalogProfile(profile: string): profile is LteEtm3ReferenceProfile {
  return LTE_ETM3_REFERENCE_PROFILES.some((candidate) => candidate === profile);
}

export function encodeLteEtm3CatalogFrameCf32le(
  profile: LteEtm3ReferenceProfile,
): Uint8Array {
  const existing = cf32Cache.get(profile);
  if (existing !== undefined) return existing.slice();
  const frame = referenceFrame(profile);
  const bytes = new Uint8Array(
    LTE_ETM3_CATALOG_FRAME_SAMPLES * LTE_ETM3_CATALOG_BYTES_PER_SAMPLE,
  );
  const view = new DataView(bytes.buffer);
  for (let sample = 0; sample < LTE_ETM3_CATALOG_FRAME_SAMPLES; sample += 1) {
    const inPhase = frame.timeDomain.real[sample]!;
    const quadrature = frame.timeDomain.imaginary[sample]!;
    if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature)) {
      throw new Error(`${profile} reference frame contains a non-finite sample at ${sample}`);
    }
    view.setFloat32(sample * LTE_ETM3_CATALOG_BYTES_PER_SAMPLE, inPhase, true);
    view.setFloat32(sample * LTE_ETM3_CATALOG_BYTES_PER_SAMPLE + 4, quadrature, true);
  }
  cf32Cache.set(profile, bytes);
  return bytes.slice();
}

export function synthesizeLteEtm3CatalogIq(input: LteEtm3CatalogIqInput): Uint8Array {
  validateInput(input);
  const frame = encodeLteEtm3CatalogFrameCf32le(input.profile);
  const output = new Uint8Array(input.sampleCount * LTE_ETM3_CATALOG_BYTES_PER_SAMPLE);
  const startSampleIndex = input.startSampleIndex ?? 0;
  for (let outputSample = 0; outputSample < input.sampleCount; outputSample += 1) {
    const frameSample = (startSampleIndex + outputSample) % LTE_ETM3_CATALOG_FRAME_SAMPLES;
    const sourceOffset = frameSample * LTE_ETM3_CATALOG_BYTES_PER_SAMPLE;
    output.set(
      frame.subarray(sourceOffset, sourceOffset + LTE_ETM3_CATALOG_BYTES_PER_SAMPLE),
      outputSample * LTE_ETM3_CATALOG_BYTES_PER_SAMPLE,
    );
  }
  return output;
}

export function verifyLteEtm3CatalogFrameIdentity(
  profile: LteEtm3ReferenceProfile,
): string {
  const observed = sha256HexOfBytes(encodeLteEtm3CatalogFrameCf32le(profile));
  const expected = LTE_ETM3_CATALOG_CF32LE_SHA256[profile];
  if (observed !== expected) {
    throw new Error(`${profile} catalog cf32le bytes changed without a recipe/evidence revision`);
  }
  return observed;
}

function referenceFrame(profile: LteEtm3ReferenceProfile): LteEtm3ReferenceFrame {
  let frame = frameCache.get(profile);
  if (frame === undefined) {
    frame = generateLteEtm3ReferenceFrame(profile);
    frameCache.set(profile, frame);
  }
  if (
    frame.metadata.profileId !== profile
    || frame.metadata.sampleRateHz !== LTE_ETM3_CATALOG_SAMPLE_RATE_HZ
    || frame.metadata.sampleCount !== LTE_ETM3_CATALOG_FRAME_SAMPLES
    || frame.metadata.channelBandwidthHz !== LTE_ETM3_CATALOG_CHANNEL_BANDWIDTH_HZ
    || frame.metadata.resourceBlockCount !== 50
    || frame.metadata.physicalCellId !== 1
    || frame.metadata.complianceClaimed !== false
  ) {
    throw new Error(`${profile} catalog adapter is no longer bound to its fixed reference frame`);
  }
  return frame;
}

function validateInput(input: LteEtm3CatalogIqInput): void {
  if (!isLteEtm3CatalogProfile(input.profile)) {
    throw new RangeError(`Unsupported LTE E-TM3 catalog profile: ${input.profile}`);
  }
  if (input.sampleRateHz !== LTE_ETM3_CATALOG_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${input.profile} exact replay requires ${LTE_ETM3_CATALOG_SAMPLE_RATE_HZ} samples/s; resampling is forbidden`,
    );
  }
  if (input.bandwidthHz !== LTE_ETM3_CATALOG_CHANNEL_BANDWIDTH_HZ) {
    throw new RangeError(
      `${input.profile} exact replay requires ${LTE_ETM3_CATALOG_CHANNEL_BANDWIDTH_HZ} Hz channel bandwidth; filtering is forbidden`,
    );
  }
  if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 1 || input.sampleCount > 65_536) {
    throw new RangeError(`${input.profile} exact replay sample count must be an integer from 1 through 65536`);
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex) || startSampleIndex < 0
    || startSampleIndex > Number.MAX_SAFE_INTEGER - (input.sampleCount - 1)) {
    throw new RangeError(`${input.profile} exact replay start sample must be a non-negative safe integer`);
  }
}
