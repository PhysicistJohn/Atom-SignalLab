import { sha256HexOfBytes } from './platform-bytes.js';
import {
  LTE_ETM1_1_10MHZ_FDD_PILOT,
  generateLteEtm11ReferenceFrame,
  type LteEtm11ReferenceFrame,
} from './lte-etm1-reference.js';
import { LTE_ETM1_1_REFERENCE_CF64LE_SHA256 } from './lte-etm1-provider.js';

export const LTE_ETM1_1_CATALOG_PROFILE = 'lte-etm1.1' as const;
export const LTE_ETM1_1_CATALOG_SAMPLE_RATE_HZ = 15_360_000 as const;
export const LTE_ETM1_1_CATALOG_CHANNEL_BANDWIDTH_HZ = 10_000_000 as const;
export const LTE_ETM1_1_CATALOG_RESOURCE_BLOCKS = 50 as const;
export const LTE_ETM1_1_CATALOG_FRAME_SAMPLES = 153_600 as const;
export const LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE = 8 as const;

/**
 * SHA-256 of the complete interleaved cf32le rendering returned by
 * encodeLteEtm11CatalogFrameCf32le(). This is intentionally distinct from the
 * provider's independently compared cf64le artifact identity.
 *
 * The value is filled from the deterministic generator and pinned by the
 * catalog adapter tests. Any change requires a new recipe and evidence run.
 */
export const LTE_ETM1_1_CATALOG_CF32LE_SHA256 =
  '64515628a900f0422e67c8cdd9b2209c70aaaa467f1d533f99080ac110f340c7' as const;

export const LTE_ETM1_1_INDEPENDENT_REPORT_SHA256 =
  '55cae4fcaa514dfe6ffdd6baf25c84a0915131b7403aad095c3d4727b593d34f' as const;

export const LTE_ETM1_1_CATALOG_DIGITAL_QUALIFICATION = Object.freeze({
  scope: 'fixed-digital-complex-baseband' as const,
  state: 'independently-verified' as const,
  rfConformance: 'not-claimed' as const,
  productCertification: 'not-claimed' as const,
  sourceArtifactFormat: 'cf64le' as const,
  sourceArtifactSha256: LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
  independentReportSha256: LTE_ETM1_1_INDEPENDENT_REPORT_SHA256,
  outputFormat: 'cf32le' as const,
  outputFrameSha256: LTE_ETM1_1_CATALOG_CF32LE_SHA256,
  allowedPostProcessing: Object.freeze([
    'component-wise IEEE-754 float64-to-float32 conversion',
    'content-preserving cyclic replay of the single fixed frame',
  ] as const),
  forbiddenPostProcessing: Object.freeze([
    'filtering',
    'normalization',
    'resampling',
    'scaling',
    'receiver impairment',
  ] as const),
});

export interface LteEtm11CatalogIqInput {
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

let cachedFrame: LteEtm11ReferenceFrame | undefined;
let cachedCf32le: Uint8Array | undefined;

/**
 * Encode the complete fixed Release-19 E-TM1.1 frame as interleaved cf32le.
 *
 * The independently compared provider artifact is cf64le. The measurement
 * bridge currently exposes cf32le, so this adapter performs exactly one
 * explicit, test-covered transform: IEEE-754 component conversion to float32.
 * It never filters, rescales, normalizes, or resamples the waveform.
 */
export function encodeLteEtm11CatalogFrameCf32le(): Uint8Array {
  if (cachedCf32le === undefined) {
    const frame = referenceFrame();
    const bytes = new Uint8Array(
      LTE_ETM1_1_CATALOG_FRAME_SAMPLES * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE,
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let sample = 0; sample < LTE_ETM1_1_CATALOG_FRAME_SAMPLES; sample += 1) {
      const inPhase = frame.timeDomain.real[sample]!;
      const quadrature = frame.timeDomain.imaginary[sample]!;
      if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature)) {
        throw new Error(`LTE E-TM1.1 reference frame contains a non-finite sample at ${sample}`);
      }
      const byteOffset = sample * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE;
      view.setFloat32(byteOffset, inPhase, true);
      view.setFloat32(byteOffset + 4, quadrature, true);
    }
    cachedCf32le = bytes;
  }
  return cachedCf32le.slice();
}

/**
 * Replay a bounded slice of the one-frame exact artifact.
 *
 * Arbitrary sample rates and bandwidth filters would change the tested
 * subject, so they are rejected. startSampleIndex is interpreted modulo the
 * fixed frame solely to support deterministic cyclic replay; it does not
 * pretend that SFN or payload state advances into a second generated frame.
 */
export function synthesizeLteEtm11CatalogIq(input: LteEtm11CatalogIqInput): Uint8Array {
  validateInput(input);
  const frame = encodeLteEtm11CatalogFrameCf32le();
  const output = new Uint8Array(input.sampleCount * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE);
  const startSampleIndex = input.startSampleIndex ?? 0;
  for (let outputSample = 0; outputSample < input.sampleCount; outputSample += 1) {
    const frameSample = (startSampleIndex + outputSample) % LTE_ETM1_1_CATALOG_FRAME_SAMPLES;
    const sourceOffset = frameSample * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE;
    const outputOffset = outputSample * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE;
    output.set(
      frame.subarray(sourceOffset, sourceOffset + LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE),
      outputOffset,
    );
  }
  return output;
}

export function verifyLteEtm11CatalogFrameIdentity(): string {
  const sha256 = sha256HexOfBytes(encodeLteEtm11CatalogFrameCf32le());
  if (sha256 !== LTE_ETM1_1_CATALOG_CF32LE_SHA256) {
    throw new Error('LTE E-TM1.1 catalog cf32le bytes changed without a recipe/evidence revision');
  }
  return sha256;
}

function referenceFrame(): LteEtm11ReferenceFrame {
  cachedFrame ??= generateLteEtm11ReferenceFrame();
  if (
    cachedFrame.metadata.profileId !== LTE_ETM1_1_10MHZ_FDD_PILOT.profileId
    || cachedFrame.metadata.sampleRateHz !== LTE_ETM1_1_CATALOG_SAMPLE_RATE_HZ
    || cachedFrame.metadata.sampleCount !== LTE_ETM1_1_CATALOG_FRAME_SAMPLES
    || cachedFrame.metadata.resourceBlockCount !== LTE_ETM1_1_CATALOG_RESOURCE_BLOCKS
    || cachedFrame.metadata.physicalCellId !== 1
    || cachedFrame.metadata.duplex !== 'fdd'
    || cachedFrame.metadata.cyclicPrefix !== 'normal'
    || cachedFrame.metadata.complianceClaimed !== false
  ) {
    throw new Error('LTE E-TM1.1 catalog adapter is no longer bound to its fixed reference frame');
  }
  return cachedFrame;
}

function validateInput(input: LteEtm11CatalogIqInput): void {
  if (input.sampleRateHz !== LTE_ETM1_1_CATALOG_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `LTE E-TM1.1 exact replay requires ${LTE_ETM1_1_CATALOG_SAMPLE_RATE_HZ} samples/s; resampling is forbidden`,
    );
  }
  if (input.bandwidthHz !== LTE_ETM1_1_CATALOG_CHANNEL_BANDWIDTH_HZ) {
    throw new RangeError(
      `LTE E-TM1.1 exact replay requires the fixed ${LTE_ETM1_1_CATALOG_CHANNEL_BANDWIDTH_HZ} Hz channel bandwidth; filtering is forbidden`,
    );
  }
  if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 1 || input.sampleCount > 65_536) {
    throw new RangeError('LTE E-TM1.1 exact replay sample count must be an integer from 1 through 65536');
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex) || startSampleIndex < 0
    || startSampleIndex > Number.MAX_SAFE_INTEGER - (input.sampleCount - 1)) {
    throw new RangeError('LTE E-TM1.1 exact replay start sample must be a non-negative safe integer');
  }
}
