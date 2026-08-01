/**
 * Long-dwell Bluetooth capture synthesis.
 *
 * WHY THIS MODULE EXISTS. The fixed catalog (`bluetooth-fixed-catalog-iq.ts`)
 * is a qualification unit: one standards-matched DH1 slot (625 us) and one
 * ADV_NONCONN_IND advertising event (152 us), content-bound and SHA-pinned.
 * That is deliberately NOT a long capture -- but classifier training needs
 * dwells of 10 ms and beyond, where Bluetooth's identity lives in structure
 * the single-packet captures cannot express: slot-clocked frequency hopping
 * across the 79-channel span for BR, and sparse advertising events with
 * pseudo-random spacing for LE. Under a 10 ms window Bluetooth is mostly
 * silence punctuated by hops -- and that silence pattern is class-conditional
 * evidence, not an artifact.
 *
 * WHAT IT DOES. Composes the EXISTING qualified packet baseband vectors onto
 * an unbounded timeline as a pure function of the absolute sample index:
 *
 *   classic  slot k occupies samples [k*S, (k+1)*S) with S = 50,000 (625 us at
 *            80 Msps). A keyed integer hash of k decides whether the slot
 *            carries a packet (TDD utilization), its hop channel (0..78), and
 *            its carrier phase. Active slots replay the DH1 baseband shifted
 *            to (channel - 39) MHz.
 *
 *   le-adv   advertising event k sits on a fixed period grid P = 30 ms with a
 *            per-event pseudo-random delay in [0, 10 ms) -- the Core spec's
 *            advInterval + advDelay model. Each event transmits the qualified
 *            ADV_NONCONN_IND baseband on channels 37, 38, 39 in sequence
 *            (150 us inter-channel spacing) at their true offsets from the
 *            2441 MHz span centre (-39, -15, +39 MHz).
 *
 * Purity of `output[n] = f(profile, n)` makes block-stitched generation exact
 * by construction: synthesizing [0, N) in one call and in any partition of
 * consecutive calls yields bit-identical cf32le.
 *
 * WHAT IT DOES NOT DO. It does not claim standards conformance for the hop
 * SELECTION algorithm (Core 6.3 selection kernel is keyed to master clock and
 * address; here a keyed hash provides the same statistics -- uniform channel
 * usage, slot-clocked changes). Payload bits repeat the qualified vectors
 * rather than re-randomizing per packet. Both are documented training-data
 * simplifications, chosen so every emitted burst remains byte-derived from
 * standards-matched content.
 */
import { writeUnitBoundedCf32le } from '@atomos/dsp';
import {
  BLUETOOTH_BR_DH1_FIXED_VECTOR,
  BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR,
  synthesizeBluetoothAnalyticSamples,
} from './bluetooth-iq.js';
import {
  BLUETOOTH_FIXED_CAPTURE_SAMPLES,
  BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ,
} from './bluetooth-fixed-catalog-iq.js';
import {
  UNBOUNDED_COMPOSITION_PROFILE_BINDINGS,
} from './fixed-digital-profile-binding.js';

export const BLUETOOTH_LONG_DWELL_PROFILES = Object.freeze([
  'bluetooth-classic-connected-longdwell',
  'bluetooth-le-advertising-longdwell',
] as const);

export type BluetoothLongDwellProfile =
  (typeof BLUETOOTH_LONG_DWELL_PROFILES)[number];

export const BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ =
  BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ;
/** Aggregate signal support, edge to edge, for each native-rate composition. */
export const BLUETOOTH_LONG_DWELL_SPAN_HZ = Object.freeze({
  'bluetooth-classic-connected-longdwell':
    UNBOUNDED_COMPOSITION_PROFILE_BINDINGS[
      'bluetooth-classic-connected-longdwell'
    ].signalBandwidthHz,
  'bluetooth-le-advertising-longdwell':
    UNBOUNDED_COMPOSITION_PROFILE_BINDINGS[
      'bluetooth-le-advertising-longdwell'
    ].signalBandwidthHz,
} as const satisfies Record<BluetoothLongDwellProfile, number>);
export const BLUETOOTH_LONG_DWELL_MAX_SAMPLES_PER_CALL = 65_536 as const;

/** Span centre used by every Bluetooth capture in this catalog. */
const SPAN_CENTER_HZ = 2_441_000_000;

/**
 * The qualified basebands are NOT at zero offset: each fixed vector is pinned
 * to a specific RF channel (BR: channel 8 at 2410 MHz; LE: channel 38 at
 * 2426 MHz), so its content already sits at (channelCenterHz - spanCentre).
 * The composition mixer must therefore shift by (target - baked), and shifts
 * act modulo the 80 MHz sample rate, which keeps every target inside the
 * (-40, +40] MHz Nyquist span.
 */
const BR_BAKED_OFFSET_HZ =
  BLUETOOTH_BR_DH1_FIXED_VECTOR.channelCenterHz - SPAN_CENTER_HZ;
const LE_BAKED_OFFSET_HZ =
  BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.channelCenterHz - SPAN_CENTER_HZ;

/** BR slot geometry at the catalog rate: 625 us -> 50,000 samples. */
const BR_SLOT_SAMPLES =
  BLUETOOTH_FIXED_CAPTURE_SAMPLES['bluetooth-classic-connected'];
/** Fraction of slots carrying a packet on the modeled ACL link. */
const BR_SLOT_UTILIZATION = 0.55;
/** 79 BR channels at 2402 + k MHz; span centre 2441 MHz -> offset (k-39) MHz. */
const BR_CHANNEL_COUNT = 79;
const BR_CHANNEL_OFFSET_HZ = (channel: number): number =>
  (channel - 39) * 1_000_000;

/** LE ADV_NONCONN_IND packet: 152 us -> 12,160 samples at the catalog rate. */
const LE_PACKET_SAMPLES =
  BLUETOOTH_FIXED_CAPTURE_SAMPLES['bluetooth-le-advertising'];
/** Advertising event grid: 30 ms period, [0, 10 ms) per-event advDelay. */
const LE_EVENT_PERIOD_SAMPLES = 2_400_000;
const LE_ADV_DELAY_MAX_SAMPLES = 800_000;
/** T_IFS-scale spacing between the three channel transmissions: 150 us. */
const LE_INTER_CHANNEL_GAP_SAMPLES = 12_000;
/** Channels 37/38/39 at 2402/2426/2480 MHz vs the 2441 MHz span centre. */
const LE_CHANNEL_OFFSETS_HZ = Object.freeze([
  -39_000_000, -15_000_000, 39_000_000,
] as const);
const LE_EVENT_ACTIVE_SAMPLES =
  3 * LE_PACKET_SAMPLES + 2 * LE_INTER_CHANNEL_GAP_SAMPLES;

export interface BluetoothLongDwellIqInput {
  readonly profile: BluetoothLongDwellProfile;
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly sampleCount: number;
  readonly startSampleIndex?: number;
}

export function isBluetoothLongDwellProfile(
  profile: string,
): profile is BluetoothLongDwellProfile {
  return BLUETOOTH_LONG_DWELL_PROFILES.some(
    (candidate) => candidate === profile,
  );
}

/**
 * Keyed 32-bit integer hash (murmur3 finalizer over lane-mixed input).
 * Deterministic across platforms; used for slot activity, hop selection,
 * advDelay, and per-burst carrier phase.
 */
function keyedHash(index: number, lane: number): number {
  const low = index >>> 0;
  const high = Math.floor(index / 4_294_967_296) >>> 0;
  let h = (0x9e3779b9 ^ Math.imul(lane + 1, 0x85ebca6b)) >>> 0;
  h = (h ^ low) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ high) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

const unitHash = (index: number, lane: number): number =>
  keyedHash(index, lane) / 4_294_967_296;

interface Burst {
  /** Absolute sample where the qualified baseband starts. */
  readonly contentStart: number;
  /** Samples of qualified baseband available from contentStart. */
  readonly contentSamples: number;
  readonly carrierOffsetHz: number;
  readonly carrierPhaseRadians: number;
}

/** The burst (if any) covering absolute sample n for the BR classic profile. */
function classicBurstAt(absoluteSample: number): Burst | undefined {
  const slot = Math.floor(absoluteSample / BR_SLOT_SAMPLES);
  // Trigger-aligned origin: real acquisitions begin on detected activity, so
  // slot 0 always carries a packet; utilization statistics apply thereafter.
  if (slot !== 0 && unitHash(slot, 0) >= BR_SLOT_UTILIZATION) return undefined;
  const channel = keyedHash(slot, 1) % BR_CHANNEL_COUNT;
  return {
    contentStart: slot * BR_SLOT_SAMPLES,
    contentSamples: BR_SLOT_SAMPLES,
    carrierOffsetHz: BR_CHANNEL_OFFSET_HZ(channel) - BR_BAKED_OFFSET_HZ,
    carrierPhaseRadians: unitHash(slot, 2) * 2 * Math.PI,
  };
}

/**
 * Per-event advDelay. Trigger-aligned origin: the first advertising event
 * starts at sample 0; every later event keeps the spec's pseudo-random delay.
 */
function leEventDelaySamples(event: number): number {
  return event === 0 ? 0 : keyedHash(event, 3) % LE_ADV_DELAY_MAX_SAMPLES;
}

/** The burst (if any) covering absolute sample n for the LE adv profile. */
function leBurstAt(absoluteSample: number): Burst | undefined {
  const event = Math.floor(absoluteSample / LE_EVENT_PERIOD_SAMPLES);
  const delay = leEventDelaySamples(event);
  const eventStart = event * LE_EVENT_PERIOD_SAMPLES + delay;
  const local = absoluteSample - eventStart;
  if (local < 0 || local >= LE_EVENT_ACTIVE_SAMPLES) return undefined;
  const stride = LE_PACKET_SAMPLES + LE_INTER_CHANNEL_GAP_SAMPLES;
  const channelSlot = Math.floor(local / stride);
  if (channelSlot > 2 || local - channelSlot * stride >= LE_PACKET_SAMPLES) {
    return undefined; // inter-channel gap
  }
  return {
    contentStart: eventStart + channelSlot * stride,
    contentSamples: LE_PACKET_SAMPLES,
    carrierOffsetHz: LE_CHANNEL_OFFSETS_HZ[channelSlot]! - LE_BAKED_OFFSET_HZ,
    carrierPhaseRadians: unitHash(event * 3 + channelSlot, 4) * 2 * Math.PI,
  };
}

const basebandCache = new Map<string, Float32Array>();

function qualifiedBaseband(
  profile: 'bluetooth-classic-connected' | 'bluetooth-le-advertising',
): Float32Array {
  const cached = basebandCache.get(profile);
  if (cached !== undefined) return cached;
  const samples = synthesizeBluetoothAnalyticSamples({
    profile,
    sampleRateHz: BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ,
    sampleCount: BLUETOOTH_FIXED_CAPTURE_SAMPLES[profile],
    seed: 1,
    startSampleIndex: 0,
  });
  basebandCache.set(profile, samples);
  return samples;
}

/**
 * Synthesize a window of the unbounded long-dwell timeline as cf32le bytes.
 * Output sample n is a pure function of (profile, n): block-stitched
 * generation is exact by construction.
 */
export function synthesizeBluetoothLongDwellIq(
  input: BluetoothLongDwellIqInput,
): Uint8Array {
  validateInput(input);
  const startSample = input.startSampleIndex ?? 0;
  const classic = input.profile === 'bluetooth-classic-connected-longdwell';
  const baseband = qualifiedBaseband(
    classic ? 'bluetooth-classic-connected' : 'bluetooth-le-advertising',
  );
  const burstAt = classic ? classicBurstAt : leBurstAt;
  const fs = BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ;

  const bytes = new Uint8Array(input.sampleCount * 8);
  const view = new DataView(bytes.buffer);
  let burst: Burst | undefined;
  let burstEnd = -1;
  for (let relative = 0; relative < input.sampleCount; relative += 1) {
    const absolute = startSample + relative;
    // Cache only while INSIDE a burst. Silent samples re-evaluate burstAt on
    // every sample: any coarser fast-forward makes output depend on where the
    // window began, which breaks the pure-function-of-n contract (measured:
    // a period-granular skip dropped packets 2-3 of an LE event whenever the
    // window opened inside packet 1).
    if (!burst || absolute >= burstEnd || absolute < burst.contentStart) {
      burst = burstAt(absolute);
      burstEnd = burst ? burst.contentStart + burst.contentSamples : absolute + 1;
    }
    if (!burst) {
      view.setFloat32(relative * 8, 0, true);
      view.setFloat32(relative * 8 + 4, 0, true);
      continue;
    }
    const contentIndex = absolute - burst.contentStart;
    const inPhase = baseband[contentIndex * 2]!;
    const quadrature = baseband[contentIndex * 2 + 1]!;
    // Shift to the hop/advertising channel. Absolute-time phase argument keeps
    // the mixer a pure function of n; per-burst phase gives realistic
    // discontinuity at hop boundaries.
    const theta =
      2 * Math.PI * burst.carrierOffsetHz * (absolute / fs)
      + burst.carrierPhaseRadians;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // Unit-bounded write: rotation preserves magnitude analytically, but
    // float32 round-off can exceed |1| by one ulp on peak samples.
    writeUnitBoundedCf32le(
      view,
      relative * 8,
      inPhase * cos - quadrature * sin,
      inPhase * sin + quadrature * cos,
    );
  }
  return bytes;
}

function validateInput(input: BluetoothLongDwellIqInput): void {
  if (!isBluetoothLongDwellProfile(input.profile)) {
    throw new RangeError(
      `Unsupported Bluetooth long-dwell profile: ${input.profile}`,
    );
  }
  if (input.sampleRateHz !== BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ) {
    throw new RangeError(
      `${input.profile} requires ${BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ} `
      + 'samples/s; resampling belongs to the consumer pipeline',
    );
  }
  const requiredBandwidthHz = BLUETOOTH_LONG_DWELL_SPAN_HZ[input.profile];
  if (input.bandwidthHz !== requiredBandwidthHz) {
    throw new RangeError(
      `${input.profile} requires the ${requiredBandwidthHz} Hz `
      + 'aggregate span binding',
    );
  }
  if (!Number.isSafeInteger(input.sampleCount)
    || input.sampleCount < 1
    || input.sampleCount > BLUETOOTH_LONG_DWELL_MAX_SAMPLES_PER_CALL) {
    throw new RangeError(
      `${input.profile} sample count must be an integer from 1 through `
      + `${BLUETOOTH_LONG_DWELL_MAX_SAMPLES_PER_CALL}`,
    );
  }
  const startSampleIndex = input.startSampleIndex ?? 0;
  if (!Number.isSafeInteger(startSampleIndex)
    || startSampleIndex < 0
    || !Number.isSafeInteger(startSampleIndex + input.sampleCount)) {
    throw new RangeError(
      `${input.profile} start sample index must be a non-negative safe integer`,
    );
  }
}

/**
 * Deterministic known-active coordinates, for tests and consumers that need a
 * window guaranteed to contain content (the timelines are mostly silence).
 */
export function firstActiveClassicSlotSample(): number {
  return 0;
}

export function firstLeEventStartSample(): number {
  return leEventDelaySamples(0);
}

/* Geometry cross-checks: fail at import time if the fixed vectors drift. */
if (BR_SLOT_SAMPLES
  !== BLUETOOTH_BR_DH1_FIXED_VECTOR.slotDurationSeconds
    * BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ) {
  throw new Error('Bluetooth long-dwell BR slot geometry drifted');
}
if (LE_PACKET_SAMPLES
  !== BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.eventDurationSeconds
    * BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ) {
  throw new Error('Bluetooth long-dwell LE packet geometry drifted');
}
if (LE_EVENT_ACTIVE_SAMPLES >= LE_ADV_DELAY_MAX_SAMPLES) {
  throw new Error('Bluetooth long-dwell LE event exceeds its delay budget');
}
if (LE_EVENT_ACTIVE_SAMPLES + LE_ADV_DELAY_MAX_SAMPLES
  > LE_EVENT_PERIOD_SAMPLES) {
  throw new Error('Bluetooth long-dwell LE event can escape its period cell');
}
