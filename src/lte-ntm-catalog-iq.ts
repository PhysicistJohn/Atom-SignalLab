import {
  LTE_NTM_FRAME_SAMPLES,
  LTE_NTM_NARROWBAND_GRID_HZ,
  LTE_NTM_PROFILES,
  LTE_NTM_REFERENCE_IDENTITIES,
  LTE_NTM_SAMPLE_RATE_HZ,
  generateLteNtmReferenceFrame,
  isLteNtmProfile,
  type LteNtmProfile,
} from './lte-ntm-reference.js';
import { sha256HexOfBytes } from './platform-bytes.js';

export const LTE_NTM_CATALOG_CF32LE_SHA256 = Object.freeze({
  'lte-ntm':
    '5cb11d59c16e0241a68948783aef0384c329f2b73f1f20336d38a7e08fb72a9d',
  'lte-nbiot-guard-isolated-component':
    '5cb11d59c16e0241a68948783aef0384c329f2b73f1f20336d38a7e08fb72a9d',
  'lte-nbiot-inband-isolated-component':
    'cf307a838902a1283757ff0f90b7d879e37c2e96331de86f8c8e07ccbff9ba0f',
} as const);

export const LTE_NTM_DIGITAL_QUALIFICATION = Object.freeze(
  Object.fromEntries(LTE_NTM_PROFILES.map((profile) => [
    profile,
    Object.freeze({
      state: 'independently-verified' as const,
      scope: profile === 'lte-ntm'
        ? 'fixed-n-tm-digital-complex-baseband' as const
        : 'fixed-isolated-n-tm-component-digital-complex-baseband' as const,
      gridCf64leSha256: LTE_NTM_REFERENCE_IDENTITIES[profile].gridCf64leSha256,
      timeCf64leSha256: LTE_NTM_REFERENCE_IDENTITIES[profile].timeCf64leSha256,
      rfConformance: 'not-claimed' as const,
      productCertification: 'not-claimed' as const,
      compositePlacementAndPower: 'not-claimed' as const,
    }),
  ])) as Record<LteNtmProfile, {
    readonly state: 'independently-verified';
    readonly scope:
      | 'fixed-n-tm-digital-complex-baseband'
      | 'fixed-isolated-n-tm-component-digital-complex-baseband';
    readonly gridCf64leSha256: string;
    readonly timeCf64leSha256: string;
    readonly rfConformance: 'not-claimed';
    readonly productCertification: 'not-claimed';
    readonly compositePlacementAndPower: 'not-claimed';
  }>,
);

export interface LteNtmCatalogIqInput {
  readonly profile: LteNtmProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

const cache = new Map<LteNtmProfile, Uint8Array>();

export function encodeLteNtmCatalogFrameCf32le(profile: LteNtmProfile): Uint8Array {
  const cached = cache.get(profile);
  if (cached !== undefined) return cached.slice();
  const timeDomain = generateLteNtmReferenceFrame(profile).timeDomain;
  const bytes = new Uint8Array(LTE_NTM_FRAME_SAMPLES * 8);
  const view = new DataView(bytes.buffer);
  for (let sample = 0; sample < LTE_NTM_FRAME_SAMPLES; sample += 1) {
    const real = timeDomain.real[sample]!;
    const imaginary = timeDomain.imaginary[sample]!;
    if (!Number.isFinite(real) || !Number.isFinite(imaginary)) {
      throw new Error(`${profile} contains a non-finite sample at ${sample}`);
    }
    view.setFloat32(8 * sample, real, true);
    view.setFloat32(8 * sample + 4, imaginary, true);
  }
  cache.set(profile, bytes);
  return bytes.slice();
}

export function synthesizeLteNtmCatalogIq(input: LteNtmCatalogIqInput): Uint8Array {
  validateInput(input);
  const frame = encodeLteNtmCatalogFrameCf32le(input.profile);
  const output = new Uint8Array(input.sampleCount * 8);
  const start = input.startSampleIndex ?? 0;
  for (let sample = 0; sample < input.sampleCount; sample += 1) {
    const source = (start + sample) % LTE_NTM_FRAME_SAMPLES;
    output.set(frame.subarray(8 * source, 8 * source + 8), 8 * sample);
  }
  return output;
}

export function verifyLteNtmCatalogFrameIdentity(profile: LteNtmProfile): string {
  const observed = sha256HexOfBytes(encodeLteNtmCatalogFrameCf32le(profile));
  if (observed !== LTE_NTM_CATALOG_CF32LE_SHA256[profile]) {
    throw new Error(`${profile} cf32le bytes changed without evidence revision`);
  }
  return observed;
}

function validateInput(input: LteNtmCatalogIqInput): void {
  if (!isLteNtmProfile(input.profile)) {
    throw new RangeError(`Unsupported N-TM profile ${input.profile}`);
  }
  if (input.sampleRateHz !== LTE_NTM_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${input.profile} requires ${LTE_NTM_SAMPLE_RATE_HZ} samples/s; resampling is forbidden`,
    );
  }
  if (input.bandwidthHz !== LTE_NTM_NARROWBAND_GRID_HZ) {
    throw new RangeError(
      `${input.profile} requires ${LTE_NTM_NARROWBAND_GRID_HZ} Hz grid; filtering is forbidden`,
    );
  }
  if (
    !Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > 65_536
  ) {
    throw new RangeError('Sample count must be an integer from 1 through 65536');
  }
  const start = input.startSampleIndex ?? 0;
  if (
    !Number.isSafeInteger(start)
    || start < 0
    || start > Number.MAX_SAFE_INTEGER - (input.sampleCount - 1)
  ) {
    throw new RangeError('Start sample must be a non-negative safe integer');
  }
}
