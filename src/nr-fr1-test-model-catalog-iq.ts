import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_FR1_TEST_MODEL_PROFILES,
  NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES,
  generateNrFr1TestModelFrame,
  type NrFr1TestModelFrame,
  type NrFr1TestModelProfile,
} from './nr-fr1-test-model-reference.js';

export const NR_FR1_TM_CATALOG_SAMPLE_RATE_HZ = 30_720_000 as const;
export const NR_FR1_TM_CATALOG_CHANNEL_BANDWIDTH_HZ = 20_000_000 as const;
export const NR_FR1_TM_CATALOG_FRAME_SAMPLES = 307_200 as const;
export const NR_FR1_TM_CATALOG_BYTES_PER_SAMPLE = 8 as const;

export const NR_FR1_TM_CATALOG_CF32LE_SHA256 = Object.freeze({
  'nr-fr1-tm1.1': '7f414f94209d56138a6d43d66230f2d851794c740fd668d330673c87251514f1',
  'nr-fr1-tm3.1': 'e890371a8fa9a484692859cf9ed447bbee09ba5b32b25ed8d92b55146d062839',
  'nr-fr1-tm3.1a': 'fc205447482fe7929fdc52b8f5684f50557511903e7e2c387011169dea06dabb',
  'nr-fr1-tm3.1b': 'd18a5441ea8bcfb3fbc0478241ce6e3e4b916594c8646ce50829939b97e47671',
} as const);

export const NR_FR1_TM_CATALOG_DIGITAL_QUALIFICATION = Object.freeze(
  Object.fromEntries(NR_FR1_TEST_MODEL_PROFILES.map((profile) => [
    profile,
    Object.freeze({
      state: 'independently-verified' as const,
      scope: 'fixed-digital-complex-baseband' as const,
      basis: profile === 'nr-fr1-tm3.1b'
        ? 'py3gpp-0.6.0-exhaustive-frame-plus-ocudu-exhaustive-1024qam'
        : 'py3gpp-0.6.0-exhaustive-frame',
      sourceGridCf64leSha256:
        NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES[profile].gridCf64leSha256,
      sourceTimeCf64leSha256:
        NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES[profile].timeCf64leSha256,
      outputCf32leSha256: NR_FR1_TM_CATALOG_CF32LE_SHA256[profile],
      rfConformance: 'not-claimed' as const,
      productCertification: 'not-claimed' as const,
    }),
  ])) as Readonly<Record<NrFr1TestModelProfile, Readonly<{
    state: 'independently-verified';
    scope: 'fixed-digital-complex-baseband';
    basis:
      | 'py3gpp-0.6.0-exhaustive-frame'
      | 'py3gpp-0.6.0-exhaustive-frame-plus-ocudu-exhaustive-1024qam';
    sourceGridCf64leSha256: string;
    sourceTimeCf64leSha256: string;
    outputCf32leSha256: string;
    rfConformance: 'not-claimed';
    productCertification: 'not-claimed';
  }>>>,
);

export interface NrFr1TmCatalogIqInput {
  readonly profile: NrFr1TestModelProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

const frameCache = new Map<NrFr1TestModelProfile, NrFr1TestModelFrame>();
const cf32Cache = new Map<NrFr1TestModelProfile, Uint8Array>();

export function isNrFr1TmCatalogProfile(
  profile: string,
): profile is NrFr1TestModelProfile {
  return NR_FR1_TEST_MODEL_PROFILES.some((candidate) => candidate === profile);
}

export function encodeNrFr1TmCatalogFrameCf32le(
  profile: NrFr1TestModelProfile,
): Uint8Array {
  const cached = cf32Cache.get(profile);
  if (cached !== undefined) return cached.slice();
  const frame = referenceFrame(profile);
  const bytes = new Uint8Array(
    NR_FR1_TM_CATALOG_FRAME_SAMPLES * NR_FR1_TM_CATALOG_BYTES_PER_SAMPLE,
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let sample = 0; sample < NR_FR1_TM_CATALOG_FRAME_SAMPLES; sample += 1) {
    const inPhase = frame.timeDomain.real[sample]!;
    const quadrature = frame.timeDomain.imaginary[sample]!;
    if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature)) {
      throw new Error(`${profile} reference frame contains a non-finite sample at ${sample}`);
    }
    const offset = sample * NR_FR1_TM_CATALOG_BYTES_PER_SAMPLE;
    view.setFloat32(offset, inPhase, true);
    view.setFloat32(offset + 4, quadrature, true);
  }
  cf32Cache.set(profile, bytes);
  return bytes.slice();
}

export function synthesizeNrFr1TmCatalogIq(
  input: NrFr1TmCatalogIqInput,
): Uint8Array {
  validateInput(input);
  const frame = encodeNrFr1TmCatalogFrameCf32le(input.profile);
  const output = new Uint8Array(
    input.sampleCount * NR_FR1_TM_CATALOG_BYTES_PER_SAMPLE,
  );
  const startSampleIndex = input.startSampleIndex ?? 0;
  for (let outputSample = 0; outputSample < input.sampleCount; outputSample += 1) {
    const frameSample =
      (startSampleIndex + outputSample) % NR_FR1_TM_CATALOG_FRAME_SAMPLES;
    const sourceOffset = frameSample * NR_FR1_TM_CATALOG_BYTES_PER_SAMPLE;
    output.set(
      frame.subarray(
        sourceOffset,
        sourceOffset + NR_FR1_TM_CATALOG_BYTES_PER_SAMPLE,
      ),
      outputSample * NR_FR1_TM_CATALOG_BYTES_PER_SAMPLE,
    );
  }
  return output;
}

export function verifyNrFr1TmCatalogFrameIdentity(
  profile: NrFr1TestModelProfile,
): string {
  const observed = sha256HexOfBytes(encodeNrFr1TmCatalogFrameCf32le(profile));
  if (observed !== NR_FR1_TM_CATALOG_CF32LE_SHA256[profile]) {
    throw new Error(
      `${profile} catalog cf32le bytes changed without a recipe/evidence revision`,
    );
  }
  return observed;
}

function referenceFrame(profile: NrFr1TestModelProfile): NrFr1TestModelFrame {
  let frame = frameCache.get(profile);
  if (frame === undefined) {
    frame = generateNrFr1TestModelFrame(profile);
    frameCache.set(profile, frame);
  }
  if (
    frame.metadata.profileId !== profile
    || frame.metadata.sampleRateHz !== NR_FR1_TM_CATALOG_SAMPLE_RATE_HZ
    || frame.metadata.sampleCount !== NR_FR1_TM_CATALOG_FRAME_SAMPLES
    || frame.metadata.channelBandwidthHz !==
      NR_FR1_TM_CATALOG_CHANNEL_BANDWIDTH_HZ
    || frame.metadata.resourceBlockCount !== 106
    || frame.metadata.physicalCellId !== 1
    || frame.metadata.duplex !== 'fdd'
    || frame.metadata.cyclicPrefix !== 'normal'
    || frame.metadata.standardsComplianceClaimed !== false
  ) {
    throw new Error(
      `${profile} catalog adapter is no longer bound to its fixed reference frame`,
    );
  }
  return frame;
}

function validateInput(input: NrFr1TmCatalogIqInput): void {
  if (!isNrFr1TmCatalogProfile(input.profile)) {
    throw new RangeError(`Unsupported NR-FR1 test-model profile: ${input.profile}`);
  }
  if (input.sampleRateHz !== NR_FR1_TM_CATALOG_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${input.profile} exact replay requires ${NR_FR1_TM_CATALOG_SAMPLE_RATE_HZ} samples/s; resampling is forbidden`,
    );
  }
  if (input.bandwidthHz !== NR_FR1_TM_CATALOG_CHANNEL_BANDWIDTH_HZ) {
    throw new RangeError(
      `${input.profile} exact replay requires ${NR_FR1_TM_CATALOG_CHANNEL_BANDWIDTH_HZ} Hz channel bandwidth; filtering is forbidden`,
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
