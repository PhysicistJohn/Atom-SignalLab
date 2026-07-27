import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_N3_FDD_20M_BINDING,
  NR_N3_FDD_20M_PROFILE,
  NR_N3_FDD_20M_REFERENCE_IDENTITIES,
  generateNrN3Fdd20mFrame,
} from './nr-n3-fdd-20m-reference.js';
import {
  NR_N78_TDD_100M_BINDING,
  NR_N78_TDD_100M_PROFILE,
  NR_N78_TDD_100M_REFERENCE_IDENTITIES,
  generateNrN78Tdd100mFrame,
} from './nr-n78-tdd-100m-reference.js';
import {
  NR_NBIOT_INBAND_COMPONENT_BINDING,
  NR_NBIOT_INBAND_COMPONENT_PROFILE,
  NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES,
  generateNrNbiotInbandComponentReferenceFrame,
} from './nr-nbiot-inband-component-reference.js';

export const NR_REMAINING_FIXED_PROFILES = Object.freeze([
  NR_N3_FDD_20M_PROFILE,
  NR_N78_TDD_100M_PROFILE,
  NR_NBIOT_INBAND_COMPONENT_PROFILE,
] as const);

export type NrRemainingFixedProfile =
  typeof NR_REMAINING_FIXED_PROFILES[number];

export const NR_REMAINING_FIXED_CF32LE_SHA256 = Object.freeze({
  'nr-n3-fdd-20m':
    NR_N3_FDD_20M_REFERENCE_IDENTITIES.catalogCf32leSha256,
  'nr-n78-tdd-100m':
    '9bf4024dc1f6f0ad2b335d56917e5ac1129f5a3011ccffc0c6049ee7dce78260',
  'nr-nbiot-inband-isolated-component':
    'cf307a838902a1283757ff0f90b7d879e37c2e96331de86f8c8e07ccbff9ba0f',
} as const);

export const NR_REMAINING_FIXED_DIGITAL_QUALIFICATION = Object.freeze({
  'nr-n3-fdd-20m': Object.freeze({
    state: 'independently-verified' as const,
    scope: 'fixed-digital-complex-baseband' as const,
    basis:
      'content-identical-to-py3gpp-0.6.0-exhaustive-nr-fr1-tm1.1-oracle' as const,
    gridCf64leSha256:
      NR_N3_FDD_20M_REFERENCE_IDENTITIES.gridCf64leSha256,
    timeCf64leSha256:
      NR_N3_FDD_20M_REFERENCE_IDENTITIES.timeCf64leSha256,
    outputCf32leSha256:
      NR_N3_FDD_20M_REFERENCE_IDENTITIES.catalogCf32leSha256,
    rfConformance: 'not-claimed' as const,
    productCertification: 'not-claimed' as const,
  }),
  'nr-n78-tdd-100m': Object.freeze({
    state: 'independently-verified' as const,
    scope: 'fixed-digital-complex-baseband' as const,
    basis:
      'py3gpp-0.6.0-exhaustive-active-grid-and-complete-20ms-oracle' as const,
    gridCf64leSha256:
      NR_N78_TDD_100M_REFERENCE_IDENTITIES.gridCf64leSha256,
    timeCf64leSha256:
      NR_N78_TDD_100M_REFERENCE_IDENTITIES.timeCf64leSha256,
    outputCf32leSha256:
      NR_REMAINING_FIXED_CF32LE_SHA256['nr-n78-tdd-100m'],
    rfConformance: 'not-claimed' as const,
    productCertification: 'not-claimed' as const,
  }),
  'nr-nbiot-inband-isolated-component': Object.freeze({
    state: 'independently-verified' as const,
    scope: 'fixed-digital-component-complex-baseband' as const,
    basis:
      'content-identical-to-srsran-4g-exhaustive-ts36.141-ntm-inband-component-oracle' as const,
    gridCf64leSha256:
      NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES.gridCf64leSha256,
    timeCf64leSha256:
      NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES.timeCf64leSha256,
    outputCf32leSha256:
      NR_REMAINING_FIXED_CF32LE_SHA256[
        'nr-nbiot-inband-isolated-component'
      ],
    nrNtmComposite: 'not-claimed' as const,
    rfConformance: 'not-claimed' as const,
    productCertification: 'not-claimed' as const,
  }),
});

export interface NrRemainingFixedCatalogIqInput {
  readonly profile: NrRemainingFixedProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

const cf32Cache = new Map<NrRemainingFixedProfile, Uint8Array>();

export function isNrRemainingFixedProfile(
  profile: string,
): profile is NrRemainingFixedProfile {
  return NR_REMAINING_FIXED_PROFILES.some(
    (candidate) => candidate === profile,
  );
}

export function nrRemainingFixedGeometry(
  profile: NrRemainingFixedProfile,
): {
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly frameSampleCount: number;
} {
  if (profile === NR_N3_FDD_20M_PROFILE) {
    return Object.freeze({
      sampleRateHz: NR_N3_FDD_20M_BINDING.sampleRateHz,
      bandwidthHz: NR_N3_FDD_20M_BINDING.channelBandwidthHz,
      frameSampleCount: NR_N3_FDD_20M_BINDING.frameSampleCount,
    });
  }
  if (profile === NR_N78_TDD_100M_PROFILE) {
    return Object.freeze({
      sampleRateHz: NR_N78_TDD_100M_BINDING.sampleRateHz,
      bandwidthHz: NR_N78_TDD_100M_BINDING.channelBandwidthHz,
      frameSampleCount: NR_N78_TDD_100M_BINDING.artifactSampleCount,
    });
  }
  return Object.freeze({
    sampleRateHz: NR_NBIOT_INBAND_COMPONENT_BINDING.sampleRateHz,
    bandwidthHz:
      NR_NBIOT_INBAND_COMPONENT_BINDING.nominalGridBandwidthHz,
    frameSampleCount:
      NR_NBIOT_INBAND_COMPONENT_BINDING.frameSampleCount,
  });
}

export function encodeNrRemainingFixedFrameCf32le(
  profile: NrRemainingFixedProfile,
): Uint8Array {
  const cached = cf32Cache.get(profile);
  if (cached !== undefined) return cached.slice();
  const timeDomain = profile === NR_N3_FDD_20M_PROFILE
    ? generateNrN3Fdd20mFrame().timeDomain
    : profile === NR_N78_TDD_100M_PROFILE
      ? generateNrN78Tdd100mFrame().timeDomain
      : generateNrNbiotInbandComponentReferenceFrame().timeDomain;
  const geometry = nrRemainingFixedGeometry(profile);
  if (
    timeDomain.sampleCount !== geometry.frameSampleCount
    || timeDomain.real.length !== geometry.frameSampleCount
    || timeDomain.imaginary.length !== geometry.frameSampleCount
  ) {
    throw new Error(`${profile} exact frame geometry changed`);
  }
  const bytes = new Uint8Array(geometry.frameSampleCount * 8);
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  for (let sample = 0; sample < geometry.frameSampleCount; sample += 1) {
    const inPhase = timeDomain.real[sample]!;
    const quadrature = timeDomain.imaginary[sample]!;
    if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature)) {
      throw new Error(
        `${profile} reference frame contains a non-finite sample at ${sample}`,
      );
    }
    view.setFloat32(sample * 8, inPhase, true);
    view.setFloat32(sample * 8 + 4, quadrature, true);
  }
  cf32Cache.set(profile, bytes);
  return bytes.slice();
}

export function synthesizeNrRemainingFixedCatalogIq(
  input: NrRemainingFixedCatalogIqInput,
): Uint8Array {
  validateInput(input);
  const frame = encodeNrRemainingFixedFrameCf32le(input.profile);
  const geometry = nrRemainingFixedGeometry(input.profile);
  const output = new Uint8Array(input.sampleCount * 8);
  const startSampleIndex = input.startSampleIndex ?? 0;
  for (
    let outputSample = 0;
    outputSample < input.sampleCount;
    outputSample += 1
  ) {
    const frameSample = (
      startSampleIndex + outputSample
    ) % geometry.frameSampleCount;
    const sourceOffset = frameSample * 8;
    output.set(
      frame.subarray(sourceOffset, sourceOffset + 8),
      outputSample * 8,
    );
  }
  return output;
}

export function verifyNrRemainingFixedFrameIdentity(
  profile: NrRemainingFixedProfile,
): string {
  const observed = sha256HexOfBytes(
    encodeNrRemainingFixedFrameCf32le(profile),
  );
  if (observed !== NR_REMAINING_FIXED_CF32LE_SHA256[profile]) {
    throw new Error(
      `${profile} catalog cf32le bytes changed without a recipe/evidence revision`,
    );
  }
  return observed;
}

function validateInput(input: NrRemainingFixedCatalogIqInput): void {
  if (!isNrRemainingFixedProfile(input.profile)) {
    throw new RangeError(`Unsupported fixed NR profile: ${input.profile}`);
  }
  const geometry = nrRemainingFixedGeometry(input.profile);
  if (input.sampleRateHz !== geometry.sampleRateHz) {
    throw new RangeError(
      `${input.profile} exact replay requires ${geometry.sampleRateHz} samples/s; resampling is forbidden`,
    );
  }
  if (input.bandwidthHz !== geometry.bandwidthHz) {
    throw new RangeError(
      `${input.profile} exact replay requires ${geometry.bandwidthHz} Hz channel bandwidth; filtering is forbidden`,
    );
  }
  if (
    !Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > 65_536
  ) {
    throw new RangeError(
      `${input.profile} exact replay sample count must be an integer from 1 through 65536`,
    );
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (
    !Number.isSafeInteger(startSampleIndex)
    || startSampleIndex < 0
    || startSampleIndex > Number.MAX_SAFE_INTEGER - (input.sampleCount - 1)
  ) {
    throw new RangeError(
      `${input.profile} exact replay start sample must be a non-negative safe integer`,
    );
  }
}
