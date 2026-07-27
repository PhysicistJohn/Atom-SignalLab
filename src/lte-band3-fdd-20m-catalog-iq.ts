import {
  LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ,
  LTE_BAND3_FDD_20M_FRAME_SAMPLES,
  LTE_BAND3_FDD_20M_PROFILE,
  LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ,
  generateLteBand3Fdd20mReferenceFrame,
} from './lte-band3-fdd-20m-reference.js';
import { sha256HexOfBytes } from './platform-bytes.js';

export const LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE = 8 as const;
export const LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256 =
  '685b5f3808e0792c1803d3c398358d7e308291db6b3769d5efd8dc3e17713d0b' as const;

export interface LteBand3Fdd20mCatalogIqInput {
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

let cachedFrame: Uint8Array | undefined;

/** Encodes the exact fixed frame to the catalog's interleaved cf32le format. */
export function encodeLteBand3Fdd20mCatalogFrameCf32le(): Uint8Array {
  if (cachedFrame === undefined) {
    const reference = generateLteBand3Fdd20mReferenceFrame().timeDomain;
    const bytes = new Uint8Array(
      LTE_BAND3_FDD_20M_FRAME_SAMPLES
      * LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE,
    );
    const view = new DataView(bytes.buffer);
    for (let sample = 0; sample < LTE_BAND3_FDD_20M_FRAME_SAMPLES; sample += 1) {
      const real = reference.real[sample]!;
      const imaginary = reference.imaginary[sample]!;
      if (!Number.isFinite(real) || !Number.isFinite(imaginary)) {
        throw new Error(
          `${LTE_BAND3_FDD_20M_PROFILE} contains a non-finite sample at ${sample}`,
        );
      }
      view.setFloat32(
        sample * LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE,
        real,
        true,
      );
      view.setFloat32(
        sample * LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE + 4,
        imaginary,
        true,
      );
    }
    cachedFrame = bytes;
  }
  return cachedFrame.slice();
}

/**
 * Clean cyclic replay only. A changed sample rate or requested bandwidth would
 * alter the independently compared subject and is rejected.
 */
export function synthesizeLteBand3Fdd20mCatalogIq(
  input: LteBand3Fdd20mCatalogIqInput,
): Uint8Array {
  validateInput(input);
  const frame = encodeLteBand3Fdd20mCatalogFrameCf32le();
  const output = new Uint8Array(
    input.sampleCount * LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE,
  );
  const start = input.startSampleIndex ?? 0;
  for (let sample = 0; sample < input.sampleCount; sample += 1) {
    const sourceSample = (start + sample) % LTE_BAND3_FDD_20M_FRAME_SAMPLES;
    const sourceOffset =
      sourceSample * LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE;
    output.set(
      frame.subarray(
        sourceOffset,
        sourceOffset + LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE,
      ),
      sample * LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE,
    );
  }
  return output;
}

export function verifyLteBand3Fdd20mCatalogFrameIdentity(): string {
  const identity = sha256HexOfBytes(encodeLteBand3Fdd20mCatalogFrameCf32le());
  if (identity !== LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256) {
    throw new Error(
      `${LTE_BAND3_FDD_20M_PROFILE} cf32le bytes changed without evidence revision`,
    );
  }
  return identity;
}

function validateInput(input: LteBand3Fdd20mCatalogIqInput): void {
  if (input.sampleRateHz !== LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${LTE_BAND3_FDD_20M_PROFILE} requires `
      + `${LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ} samples/s; resampling is forbidden`,
    );
  }
  if (input.bandwidthHz !== LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ) {
    throw new RangeError(
      `${LTE_BAND3_FDD_20M_PROFILE} requires the fixed `
      + `${LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ} Hz channel bandwidth; `
      + 'filtering is forbidden',
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
    throw new RangeError(
      'Start sample must be a non-negative safe integer whose capture remains safe',
    );
  }
}
