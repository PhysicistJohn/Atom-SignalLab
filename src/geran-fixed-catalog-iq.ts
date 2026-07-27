import {
  GERAN_FIXED_BURST_VECTORS,
  type GeranFixedBurstProfile,
} from './geran-fixed-bursts.js';
import {
  GERAN_COMPLEX_IQ_PROFILES,
  synthesizeGeranAnalyticSamples,
} from './geran-iq.js';
import { GERAN_FIXED_CATALOG_CF32LE_SHA256 } from './geran-fixed-identities.js';
import { sha256HexOfBytes } from './platform-bytes.js';

export { GERAN_FIXED_CATALOG_CF32LE_SHA256 } from './geran-fixed-identities.js';

export const GERAN_FIXED_CATALOG_PROFILES = GERAN_COMPLEX_IQ_PROFILES;
export const GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ = 1_300_000 as const;
export const GERAN_FIXED_CATALOG_FRAME_SAMPLES = 6_000 as const;
export const GERAN_FIXED_CATALOG_PERIOD_FRAMES = 4 as const;
export const GERAN_FIXED_CATALOG_PERIOD_SAMPLES = 24_000 as const;
export const GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE = 8 as const;

/**
 * These values bind the exact catalog selector. They do not assert measured,
 * regulatory, or TS 45.005 occupied bandwidth, and no filter is applied.
 */
export const GERAN_FIXED_CATALOG_BANDWIDTH_HZ = Object.freeze({
  'gsm-900-loaded-bcch': 200_000,
  'gsm-normal-burst': 200_000,
  'gsm-qpsk-higher-symbol-rate-burst': 325_000,
  'gsm-aqpsk-normal-burst': 250_000,
  'gsm-8psk-normal-burst': 250_000,
  'gsm-16qam-higher-symbol-rate-burst': 325_000,
  'gsm-32qam-higher-symbol-rate-burst': 325_000,
} as const satisfies Readonly<Record<GeranFixedBurstProfile, number>>);

export const GERAN_FIXED_DIGITAL_BASEBAND_SCOPE = Object.freeze({
  governingOrganization: '3GPP',
  sampleFormat: 'cf32le',
  sampleRateHz: GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ,
  periodFrames: GERAN_FIXED_CATALOG_PERIOD_FRAMES,
  periodSamples: GERAN_FIXED_CATALOG_PERIOD_SAMPLES,
  carrierPhaseRadians: 0,
  amplitudeScale: 0.1,
  specifications: Object.freeze([
    Object.freeze({
      documentId: 'TS 45.002',
      revision: '19.0.0',
      clauses: Object.freeze([
        '4.3',
        '5.2.3.1',
        '5.2.3.2',
        '5.2.3.3',
        '5.2.3a',
        '5.2.6',
      ]),
    }),
    Object.freeze({
      documentId: 'TS 45.003',
      revision: '19.0.0',
      clauses: Object.freeze(['4.1.1-4.1.5']),
      scope: 'fixed xCCH GMSK vectors only',
    }),
    Object.freeze({
      documentId: 'TS 45.004',
      revision: '19.0.0',
      clauses: Object.freeze([
        '2.1-2.6',
        '3.1-3.6',
        '5.1-5.6',
        '6.1-6.6',
      ]),
    }),
  ]),
  qualification:
    'content-bound-fixed-digital-baseband-with-independent-sample-oracle',
  excludedScope: Object.freeze([
    'TS 45.003 channel coding for QPSK, AQPSK, 8PSK, 16QAM, and 32QAM fixtures',
    'a complete BCCH 51-multiframe or universal GERAN network schedule',
    'TS 45.005 conducted-RF or radiated conformance',
    'calibration, transmitter impairments, receiver behavior, and product certification',
  ]),
} as const);

export interface GeranFixedCatalogIqInput {
  readonly profile: string;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

const captureCache = new Map<GeranFixedBurstProfile, Uint8Array>();

export function isGeranFixedCatalogProfile(
  profile: string,
): profile is GeranFixedBurstProfile {
  return GERAN_FIXED_CATALOG_PROFILES.some((candidate) => candidate === profile);
}

/**
 * Encode one four-frame period directly from the TS-derived analytic generator.
 *
 * At 1.3 Msample/s a slot contains exactly 750 samples and a TDMA frame exactly
 * 6000 samples. Four frames close the xCCH burst cycle. This path deliberately
 * bypasses the generic one-pole output filter and any resampler.
 */
export function encodeGeranFixedCatalogPeriodCf32le(
  profile: GeranFixedBurstProfile,
): Uint8Array {
  const cached = captureCache.get(profile);
  if (cached !== undefined) return cached.slice();

  const analytic = synthesizeGeranAnalyticSamples({
    profile,
    sampleRateHz: GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ,
    sampleCount: GERAN_FIXED_CATALOG_PERIOD_SAMPLES,
    seed: 1,
    startSampleIndex: 0,
  });
  const bytes = new Uint8Array(
    GERAN_FIXED_CATALOG_PERIOD_SAMPLES
      * GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE,
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let sample = 0; sample < GERAN_FIXED_CATALOG_PERIOD_SAMPLES; sample += 1) {
    const sampleWithinSlot = sample % 750;
    const firstOutsideActivePart =
      GERAN_FIXED_BURST_VECTORS[profile].activeSymbols === 177 ? 708 : 711;
    // The higher-rate active boundary is exactly sample 708. Canonicalize it
    // with integer slot arithmetic so a floating-point global time coordinate
    // cannot include that first out-of-burst sample in only some frames.
    const inPhase = sampleWithinSlot >= firstOutsideActivePart
      ? 0
      : analytic[sample * 2]!;
    const quadrature = sampleWithinSlot >= firstOutsideActivePart
      ? 0
      : analytic[sample * 2 + 1]!;
    if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature)) {
      throw new Error(`${profile} contains a non-finite component at sample ${sample}`);
    }
    view.setFloat32(
      sample * GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE,
      inPhase,
      true,
    );
    view.setFloat32(
      sample * GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE + 4,
      quadrature,
      true,
    );
  }
  captureCache.set(profile, bytes);
  return bytes.slice();
}

/**
 * Return an exact cyclic slice of the independently checked four-frame period.
 * Changed geometry is rejected because it would no longer be the checked bytes.
 */
export function synthesizeGeranFixedCatalogIq(
  input: GeranFixedCatalogIqInput,
): Uint8Array {
  const profile = validateInput(input);
  const period = encodeGeranFixedCatalogPeriodCf32le(profile);
  const output = new Uint8Array(
    input.sampleCount * GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE,
  );
  const start = input.startSampleIndex ?? 0;
  for (let sample = 0; sample < input.sampleCount; sample += 1) {
    const sourceSample =
      (start + sample) % GERAN_FIXED_CATALOG_PERIOD_SAMPLES;
    const sourceOffset =
      sourceSample * GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE;
    output.set(
      period.subarray(
        sourceOffset,
        sourceOffset + GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE,
      ),
      sample * GERAN_FIXED_CATALOG_BYTES_PER_SAMPLE,
    );
  }
  return output;
}

export function verifyGeranFixedCatalogPeriodIdentity(
  profile: GeranFixedBurstProfile,
): string {
  const observed = sha256HexOfBytes(
    encodeGeranFixedCatalogPeriodCf32le(profile),
  );
  if (observed !== GERAN_FIXED_CATALOG_CF32LE_SHA256[profile]) {
    throw new Error(
      `${profile} cf32le period changed without a recipe/evidence revision; `
      + `observed ${observed}`,
    );
  }
  return observed;
}

function validateInput(
  input: GeranFixedCatalogIqInput,
): GeranFixedBurstProfile {
  if (!isGeranFixedCatalogProfile(input.profile)) {
    throw new RangeError(`Unsupported fixed GERAN profile: ${input.profile}`);
  }
  if (input.sampleRateHz !== GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${input.profile} requires ${GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ} `
      + 'samples/s; resampling is forbidden',
    );
  }
  if (input.bandwidthHz !== GERAN_FIXED_CATALOG_BANDWIDTH_HZ[input.profile]) {
    throw new RangeError(
      `${input.profile} requires the fixed `
      + `${GERAN_FIXED_CATALOG_BANDWIDTH_HZ[input.profile]} Hz catalog `
      + 'bandwidth binding; filtering is forbidden',
    );
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > 65_536) {
    throw new RangeError(
      `${input.profile} sample count must be an integer from 1 through 65536`,
    );
  }
  const start = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(start)
    || start < 0
    || start > Number.MAX_SAFE_INTEGER - (input.sampleCount - 1)) {
    throw new RangeError(
      `${input.profile} start sample must be a non-negative safe integer `
      + 'whose complete capture remains safe',
    );
  }
  return input.profile;
}

if (GERAN_FIXED_CATALOG_FRAME_SAMPLES
    * GERAN_FIXED_CATALOG_PERIOD_FRAMES
  !== GERAN_FIXED_CATALOG_PERIOD_SAMPLES) {
  throw new Error('GERAN fixed catalog period geometry is inconsistent');
}
for (const profile of GERAN_FIXED_CATALOG_PROFILES) {
  if (GERAN_FIXED_BURST_VECTORS[profile].activeSymbols
    > (profile.includes('higher-symbol-rate') ? 187.5 : 156.25)) {
    throw new Error(`${profile} active burst exceeds its fixed slot`);
  }
}
