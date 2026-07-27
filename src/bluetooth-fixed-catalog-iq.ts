import { sha256HexOfBytes } from './platform-bytes.js';
import {
  BLUETOOTH_ANALYTIC_IQ_PROFILES,
  BLUETOOTH_BR_DH1_FIXED_VECTOR,
  BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR,
  synthesizeBluetoothAnalyticSamples,
  type BluetoothAnalyticIqProfile,
} from './bluetooth-iq.js';

export const BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ = 80_000_000 as const;
export const BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ = 1_000_000 as const;
export const BLUETOOTH_FIXED_CATALOG_BYTES_PER_SAMPLE = 8 as const;

export const BLUETOOTH_FIXED_CAPTURE_SAMPLES = Object.freeze({
  'bluetooth-classic-connected': 50_000,
  'bluetooth-le-advertising': 12_160,
} as const);

export const BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256 = Object.freeze({
  'bluetooth-classic-connected':
    'ee2975f261478a52e95e454423e5d4f36ff175a515befd34d6370bea980fe158',
  'bluetooth-le-advertising':
    '2e139351a0deefe58a17eeff9146e720eaac5f674474c465778dce859be64f11',
} as const);

const frameCache = new Map<BluetoothAnalyticIqProfile, Uint8Array>();

export interface BluetoothFixedCatalogIqInput {
  readonly profile: BluetoothAnalyticIqProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

export function isBluetoothFixedCatalogProfile(
  profile: string,
): profile is BluetoothAnalyticIqProfile {
  return BLUETOOTH_ANALYTIC_IQ_PROFILES.some((candidate) => candidate === profile);
}

/**
 * Encode the complete fixed digital capture used as the qualification unit.
 *
 * BR contains one 190 us DH1 packet plus the exact zero-valued remainder of
 * its 625 us slot. LE contains the one 152 us ADV_NONCONN_IND packet and does
 * not invent another advertising event.
 */
export function encodeBluetoothFixedCaptureCf32le(
  profile: BluetoothAnalyticIqProfile,
): Uint8Array {
  const cached = frameCache.get(profile);
  if (cached !== undefined) return cached.slice();
  const samples = synthesizeBluetoothAnalyticSamples({
    profile,
    sampleRateHz: BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ,
    sampleCount: BLUETOOTH_FIXED_CAPTURE_SAMPLES[profile],
    seed: 1,
    startSampleIndex: 0,
  });
  const bytes = encodeCf32le(samples);
  frameCache.set(profile, bytes);
  return bytes.slice();
}

/**
 * Return an exact slice of the fixed one-shot capture timeline. Unlike the
 * LTE/NR frame adapters, this deliberately does not repeat the packet.
 */
export function synthesizeBluetoothFixedCatalogIq(
  input: BluetoothFixedCatalogIqInput,
): Uint8Array {
  validateInput(input);
  const samples = synthesizeBluetoothAnalyticSamples({
    profile: input.profile,
    sampleRateHz: input.sampleRateHz,
    sampleCount: input.sampleCount,
    seed: 1,
    startSampleIndex: input.startSampleIndex ?? 0,
  });
  return encodeCf32le(samples);
}

export function verifyBluetoothFixedCaptureIdentity(
  profile: BluetoothAnalyticIqProfile,
): string {
  const observed = sha256HexOfBytes(encodeBluetoothFixedCaptureCf32le(profile));
  if (observed !== BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256[profile]) {
    throw new Error(
      `${profile} fixed capture bytes changed without a recipe/evidence revision`,
    );
  }
  return observed;
}

function validateInput(input: BluetoothFixedCatalogIqInput): void {
  if (!isBluetoothFixedCatalogProfile(input.profile)) {
    throw new RangeError(`Unsupported fixed Bluetooth profile: ${input.profile}`);
  }
  if (input.sampleRateHz !== BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${input.profile} exact replay requires ${BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ} samples/s; resampling is forbidden`,
    );
  }
  if (input.bandwidthHz !== BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ) {
    throw new RangeError(
      `${input.profile} exact replay requires ${BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ} Hz channel bandwidth; filtering is forbidden`,
    );
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > 65_536) {
    throw new RangeError(
      `${input.profile} exact replay sample count must be an integer from 1 through 65536`,
    );
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex)
    || startSampleIndex < 0
    || startSampleIndex > Number.MAX_SAFE_INTEGER - (input.sampleCount - 1)
    || startSampleIndex + input.sampleCount
      > BLUETOOTH_FIXED_CAPTURE_SAMPLES[input.profile]) {
    throw new RangeError(
      `${input.profile} exact replay window must remain inside its `
      + `${BLUETOOTH_FIXED_CAPTURE_SAMPLES[input.profile]}-sample content-bound capture`,
    );
  }
}

function encodeCf32le(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]!;
    if (!Number.isFinite(value)) {
      throw new Error(`Bluetooth fixed capture contains a non-finite component at ${index}`);
    }
    view.setFloat32(index * 4, value, true);
  }
  return bytes;
}

if (BLUETOOTH_FIXED_CAPTURE_SAMPLES['bluetooth-classic-connected']
  !== BLUETOOTH_BR_DH1_FIXED_VECTOR.slotDurationSeconds
    * BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ
  || BLUETOOTH_FIXED_CAPTURE_SAMPLES['bluetooth-le-advertising']
  !== BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.eventDurationSeconds
    * BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ) {
  throw new Error('Bluetooth fixed-capture sample geometry drifted from its packet vectors');
}
