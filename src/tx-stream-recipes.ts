/**
 * Tx stream timeline recipes: unbounded, seeded, naturally scheduled I/Q.
 *
 * Recipes are streaming-layer compositions over SignalLab's frozen corpus
 * generators. Every sample is a pure function of (recipeId, contentSeed,
 * absolute sample coordinate), so chunk and schedule boundaries never change
 * bytes, and a stream resumed from any coordinate reproduces the tail
 * exactly. Recipes consume corpus generators read-only; they never mutate
 * sealed artifacts, catalog state, or classifier corpus determinism.
 *
 * Recipes are standards-derived engineering projections, not qualified
 * artifacts: they carry no canonical hash, and their schedule models are
 * disclosed engineering choices. The mandated schedule disclosure states that
 * transitions are sample-domain hard edges, that no power ramp is modeled
 * (the GSM power-time template and Wi-Fi TX ramp are absent), that wideband
 * splatter is expected at schedule edges, and that the stream is not
 * representative of a conformant transmitter's spectrum.
 *
 * Streamed recipe bytes are source-clean: no propagation channel and no
 * receiver impairment is applied, unlike classifier corpus rows which carry
 * the propagation channel.
 */
import { writeUnitBoundedCf32le } from '@atomos/dsp';
import {
  BROADCAST_CORPUS_BANDWIDTH_HZ,
  BROADCAST_CORPUS_SAMPLE_RATE_HZ,
  synthesizeBroadcastCorpusContentIq,
} from './broadcast-corpus-iq.js';
import { corpusContentWord } from './corpus-content-prng.js';
import { synthesizeGeranCorpusAnalyticSamples } from './geran-corpus-iq.js';
import { synthesizeOperationalCarrierCorpusIq } from './operational-carrier-iq.js';
import { synthesizeWlanCorpusContentIq } from './wlan-corpus-iq.js';
import {
  registerTxStreamRecipe,
  type TxStreamRecipeRuntime,
} from './tx-stream-source.js';

/**
 * Reserved recipe seed domain, namespaced away from classifier corpus seeds:
 * recipe defaults live in 0x51A7xxxx and recipe content draws use recipeId
 * namespaces, never bare profile namespaces.
 */
export const TX_STREAM_RECIPE_SEED_BASE = 0x51a7_0000 as const;

const SCHEDULE_DISCLOSURE_TAIL = 'Schedule model disclosure: transitions are sample-domain hard edges; no power ramp is modeled (the GSM power-time template is absent; the Wi-Fi TX ramp is absent); wideband splatter is expected at schedule edges; the stream is not representative of a conformant transmitter\'s spectrum. Streamed bytes are source-clean: no propagation channel and no receiver impairment are applied.' as const;

const PROMOTION_REQUIREMENTS = Object.freeze([
  'new closed enum entry in src/contracts.ts',
  'governance record in src/profile-governance.ts',
  'catalog descriptor in src/catalog.ts',
  'generator dispatch in src/complex-iq.ts',
  'fixed-binding entry only if a content-bound artifact is created, which requires independent oracle evidence',
  'count updates in waveforms.test.ts, CONTRACTS.md tables, and README',
  'a new trio composition version with coordinated commits in all three runtime repositories',
] as const);

// ---------------------------------------------------------------------------
// gsm-900-xcch-cycle-v1: corpus schedule as-is, content rotates per cycle
// ---------------------------------------------------------------------------

const GSM_RECIPE_RATE_HZ = 1_300_000 as const;
const GSM_RECIPE_BANDWIDTH_HZ = 200_000 as const;
const GSM_RECIPE_CENTER_HZ = 947_400_000 as const;
/** The corpus xCCH block cycle: 4 frames x 8 slots x 750 samples. */
const GSM_RECIPE_EPOCH_SAMPLES = 24_000 as const;

function synthesizeGsmRecipeWindow(input: {
  contentSeed: number;
  startSample: bigint;
  sampleCount: number;
}): Uint8Array {
  const start = assertSafeCoordinate(input.startSample, input.sampleCount);
  const output = new Uint8Array(input.sampleCount * 8);
  let produced = 0;
  while (produced < input.sampleCount) {
    const absolute = start + produced;
    const epoch = Math.floor(absolute / GSM_RECIPE_EPOCH_SAMPLES);
    const localStart = absolute - epoch * GSM_RECIPE_EPOCH_SAMPLES;
    const segmentSamples = Math.min(
      input.sampleCount - produced,
      GSM_RECIPE_EPOCH_SAMPLES - localStart,
    );
    const analytic = synthesizeGeranCorpusAnalyticSamples({
      profile: 'gsm-900-loaded-bcch',
      sampleRateHz: GSM_RECIPE_RATE_HZ,
      sampleCount: segmentSamples,
      contentSeed: input.contentSeed,
      contentRowIndex: epoch,
      startSampleIndex: localStart,
    });
    const view = new DataView(output.buffer, produced * 8, segmentSamples * 8);
    for (let index = 0; index < segmentSamples; index += 1) {
      writeUnitBoundedCf32le(
        view,
        index * 8,
        analytic[index * 2]!,
        analytic[index * 2 + 1]!,
      );
    }
    produced += segmentSamples;
  }
  return output;
}

// ---------------------------------------------------------------------------
// LTE/NR operational recipes: continuous frames, per-frame content rotation
// ---------------------------------------------------------------------------

interface OperationalCarrierRecipeGeometry {
  readonly profile: 'lte-band3-fdd-20m' | 'nr-n78-tdd-100m';
  readonly sampleRateHz: number;
  readonly bandwidthHz: number;
  readonly centerHz: number;
  readonly frameSamples: number;
}

const LTE_BAND3_OPERATIONAL_GEOMETRY: OperationalCarrierRecipeGeometry = Object.freeze({
  profile: 'lte-band3-fdd-20m',
  sampleRateHz: 30_720_000,
  bandwidthHz: 20_000_000,
  centerHz: 1_840_000_000,
  frameSamples: 307_200,
});

const NR_N78_OPERATIONAL_GEOMETRY: OperationalCarrierRecipeGeometry = Object.freeze({
  profile: 'nr-n78-tdd-100m',
  sampleRateHz: 122_880_000,
  bandwidthHz: 100_000_000,
  centerHz: 3_500_010_000,
  frameSamples: 2_457_600,
});

function synthesizeOperationalRecipeWindow(
  geometry: OperationalCarrierRecipeGeometry,
  input: { contentSeed: number; startSample: bigint; sampleCount: number },
): Uint8Array {
  const start = assertSafeCoordinate(input.startSample, input.sampleCount);
  const output = new Uint8Array(input.sampleCount * 8);
  let produced = 0;
  while (produced < input.sampleCount) {
    const absolute = start + produced;
    const frameOrdinal = Math.floor(absolute / geometry.frameSamples);
    const localStart = absolute - frameOrdinal * geometry.frameSamples;
    const segmentSamples = Math.min(
      input.sampleCount - produced,
      geometry.frameSamples - localStart,
    );
    const segment = synthesizeOperationalCarrierCorpusIq({
      profile: geometry.profile,
      contentSeed: input.contentSeed,
      contentRowIndex: frameOrdinal,
      sampleRateHz: geometry.sampleRateHz,
      bandwidthHz: geometry.bandwidthHz,
      sampleCount: segmentSamples,
      startSampleIndex: localStart,
    });
    output.set(segment, produced * 8);
    produced += segmentSamples;
  }
  return output;
}

// ---------------------------------------------------------------------------
// wifi-ofdm-ppdu-stream-v1: absolute-PPDU-ordinal DIFS + backoff schedule
// ---------------------------------------------------------------------------

const WIFI_RECIPE_RATE_HZ = 20_000_000 as const;
const WIFI_RECIPE_BANDWIDTH_HZ = 20_000_000 as const;
const WIFI_RECIPE_CENTER_HZ = 2_437_000_000 as const;
/** The corpus ERP-OFDM ACK PPDU period (fixed geometry). */
const WIFI_RECIPE_PPDU_SAMPLES = 1_000 as const;
/** DIFS at 20 MHz: 34 us. */
const WIFI_RECIPE_DIFS_SAMPLES = 680 as const;
/** Slot time at 20 MHz: 9 us. */
const WIFI_RECIPE_SLOT_SAMPLES = 180 as const;
const WIFI_RECIPE_MAX_BACKOFF_SLOTS = 16 as const;
const WIFI_RECIPE_BACKOFF_NAMESPACE = 'wifi-ofdm-ppdu-stream-v1|backoff' as const;

function wifiBackoffSlots(contentSeed: number, ppduOrdinal: number): number {
  return corpusContentWord(
    contentSeed,
    WIFI_RECIPE_BACKOFF_NAMESPACE,
    ppduOrdinal,
  ) % WIFI_RECIPE_MAX_BACKOFF_SLOTS;
}

/**
 * Schedule: S(0) = 0 and, for k >= 1,
 * S(k) = S(k-1) + PPDU + DIFS + backoff(k) x slot, with backoff(k) seeded by
 * the absolute PPDU ordinal k. PPDU k occupies [S(k), S(k) + PPDU).
 *
 * The resolver returns the PPDU that contains the coordinate, or the NEXT
 * PPDU's start when the coordinate falls inside a silence gap (startSample
 * greater than the queried coordinate means silence until startSample).
 *
 * The walk is a pure function of (seed, coordinate); the memo only amortizes
 * cost. It is reused only for same-seed coordinates at or ahead of the
 * memoized position; anything earlier restarts from ordinal zero (e.g. two
 * engines interleaved on this shared runtime), so determinism never depends
 * on memo state. A resume far ahead of the memo pays a one-time prefix walk.
 */
interface WifiSchedulePosition {
  readonly ordinal: number;
  readonly startSample: number;
}

function createWifiScheduleResolver() {
  let memoSeed: number | undefined;
  let memo: WifiSchedulePosition | undefined;
  return function resolve(
    contentSeed: number,
    absoluteSample: number,
  ): WifiSchedulePosition {
    let position: WifiSchedulePosition =
      memo !== undefined && memoSeed === contentSeed && absoluteSample >= memo.startSample
        ? memo
        : { ordinal: 0, startSample: 0 };
    for (;;) {
      const ppduEnd = position.startSample + WIFI_RECIPE_PPDU_SAMPLES;
      if (absoluteSample < ppduEnd) {
        memo = position;
        memoSeed = contentSeed;
        return position;
      }
      const nextOrdinal = position.ordinal + 1;
      position = {
        ordinal: nextOrdinal,
        startSample: position.startSample + WIFI_RECIPE_PPDU_SAMPLES
          + WIFI_RECIPE_DIFS_SAMPLES
          + wifiBackoffSlots(contentSeed, nextOrdinal) * WIFI_RECIPE_SLOT_SAMPLES,
      };
      if (absoluteSample < position.startSample) {
        // Silence gap before this PPDU: report it as the next active start.
        memo = position;
        memoSeed = contentSeed;
        return position;
      }
    }
  };
}

function synthesizeWifiRecipeWindow(
  resolver: ReturnType<typeof createWifiScheduleResolver>,
  input: { contentSeed: number; startSample: bigint; sampleCount: number },
): Uint8Array {
  const start = assertSafeCoordinate(input.startSample, input.sampleCount);
  const output = new Uint8Array(input.sampleCount * 8); // silence unless filled
  const windowEnd = start + input.sampleCount;
  let absolute = start;
  while (absolute < windowEnd) {
    const position = resolver(input.contentSeed, absolute);
    if (absolute < position.startSample) {
      absolute = Math.min(position.startSample, windowEnd); // jump the gap
      continue;
    }
    const localStart = absolute - position.startSample;
    const segmentSamples = Math.min(
      windowEnd - absolute,
      WIFI_RECIPE_PPDU_SAMPLES - localStart,
    );
    const segment = synthesizeWlanCorpusContentIq({
      profile: 'wifi-ofdm-20m',
      sampleRateHz: WIFI_RECIPE_RATE_HZ,
      bandwidthHz: WIFI_RECIPE_BANDWIDTH_HZ,
      sampleCount: segmentSamples,
      contentSeed: input.contentSeed,
      contentRowIndex: position.ordinal,
      startSampleIndex: localStart,
    });
    output.set(segment, (absolute - start) * 8);
    absolute += segmentSamples;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Broadcast recipes: closed-form FM-MPX and AM-voice timelines
// ---------------------------------------------------------------------------

function synthesizeBroadcastRecipeWindow(
  profile: 'fm-broadcast-mpx' | 'am-voice',
  input: { contentSeed: number; startSample: bigint; sampleCount: number },
): Uint8Array {
  const start = assertSafeCoordinate(input.startSample, input.sampleCount);
  return synthesizeBroadcastCorpusContentIq({
    profile,
    sampleRateHz: BROADCAST_CORPUS_SAMPLE_RATE_HZ,
    bandwidthHz: BROADCAST_CORPUS_BANDWIDTH_HZ[profile],
    sampleCount: input.sampleCount,
    startSampleIndex: start,
    contentSeed: input.contentSeed,
    contentRowIndex: 0,
  });
}

function assertSafeCoordinate(startSample: bigint, sampleCount: number): number {
  if (startSample < 0n
    || startSample + BigInt(sampleCount) - 1n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Tx stream recipe coordinate exceeds the safe integer range');
  }
  return Number(startSample);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const TX_STREAM_RECIPE_DEFINITIONS = Object.freeze({
  'gsm-900-xcch-cycle-v1': Object.freeze({
    deviceLoopPeriodSamples: GSM_RECIPE_EPOCH_SAMPLES,

    recipeId: 'gsm-900-xcch-cycle-v1',
    sampleRateHz: GSM_RECIPE_RATE_HZ,
    signalBandwidthHz: GSM_RECIPE_BANDWIDTH_HZ,
    profileReferenceCenterHz: GSM_RECIPE_CENTER_HZ,
    qualification: 'standards-derived-complex-baseband',
    contentSeedDefault: TX_STREAM_RECIPE_SEED_BASE + 1,
    promotionRequirements: PROMOTION_REQUIREMENTS,
    disclosure:
      'GSM 900 corpus-schedule timeline: the gsm-900-loaded-bcch corpus schedule as-is '
      + '(TS0 seeded xCCH bursts on a 4-frame block cycle, fixed dummy bursts TS1-7) with '
      + 'content rotating per 24000-sample cycle via the recipe content seed. Engineering '
      + 'composition over a corpus generator; no canonical artifact exists because the '
      + 'timeline is unbounded. Not a 51-multiframe BCCH schedule; FCCH/SCH and traffic '
      + 'channels are absent and belong to a future promoted profile with oracle evidence. '
      + SCHEDULE_DISCLOSURE_TAIL,
    synthesizeWindow: synthesizeGsmRecipeWindow,
  }),
  'lte-band3-operational-v1': Object.freeze({
    deviceLoopPeriodSamples: LTE_BAND3_OPERATIONAL_GEOMETRY.frameSamples,

    recipeId: 'lte-band3-operational-v1',
    sampleRateHz: LTE_BAND3_OPERATIONAL_GEOMETRY.sampleRateHz,
    signalBandwidthHz: LTE_BAND3_OPERATIONAL_GEOMETRY.bandwidthHz,
    profileReferenceCenterHz: LTE_BAND3_OPERATIONAL_GEOMETRY.centerHz,
    qualification: 'standards-derived-complex-baseband',
    contentSeedDefault: TX_STREAM_RECIPE_SEED_BASE + 2,
    promotionRequirements: PROMOTION_REQUIREMENTS,
    disclosure:
      'LTE Band 3 FDD 20 MHz operational timeline: continuous 10 ms frames from the '
      + 'operational-carrier corpus generator with QPSK PDSCH content rotating per absolute '
      + 'frame ordinal. Engineering composition; seeded PDSCH bits are not a transport-block '
      + 'encoder, rate matcher, CRC, or scheduler; no canonical artifact exists because the '
      + 'timeline is unbounded. Per-frame content rotation rebuilds the frame grid once per '
      + 'frame and is disclosed synthesis cost. ' + SCHEDULE_DISCLOSURE_TAIL,
    synthesizeWindow: (input: {
      contentSeed: number; startSample: bigint; sampleCount: number;
    }) => synthesizeOperationalRecipeWindow(LTE_BAND3_OPERATIONAL_GEOMETRY, input),
  }),
  'nr-n78-tdd-pattern-v1': Object.freeze({
    deviceLoopPeriodSamples: NR_N78_OPERATIONAL_GEOMETRY.frameSamples,

    recipeId: 'nr-n78-tdd-pattern-v1',
    sampleRateHz: NR_N78_OPERATIONAL_GEOMETRY.sampleRateHz,
    signalBandwidthHz: NR_N78_OPERATIONAL_GEOMETRY.bandwidthHz,
    profileReferenceCenterHz: NR_N78_OPERATIONAL_GEOMETRY.centerHz,
    qualification: 'standards-derived-complex-baseband',
    contentSeedDefault: TX_STREAM_RECIPE_SEED_BASE + 3,
    promotionRequirements: PROMOTION_REQUIREMENTS,
    disclosure:
      'NR n78 TDD 100 MHz operational timeline: continuous 20 ms artifact frames (four '
      + 'repetitions of the 5 ms TDD pattern) from the operational-carrier corpus generator '
      + 'with PDSCH content rotating per absolute frame ordinal; TDD pattern phase derives '
      + 'from the absolute coordinate, so continuity across frame boundaries is exact. '
      + 'Engineering composition; seeded PDSCH bits are not a transport-block encoder, rate '
      + 'matcher, CRC, HARQ, or scheduler, and the UL slots of the TDD pattern carry the fixed '
      + 'artifact content rather than an uplink signal; no canonical artifact exists because '
      + 'the timeline is unbounded. ' + SCHEDULE_DISCLOSURE_TAIL,
    synthesizeWindow: (input: {
      contentSeed: number; startSample: bigint; sampleCount: number;
    }) => synthesizeOperationalRecipeWindow(NR_N78_OPERATIONAL_GEOMETRY, input),
  }),
  'wifi-ofdm-ppdu-stream-v1': Object.freeze({
    deviceLoopPeriodSamples: null,

    recipeId: 'wifi-ofdm-ppdu-stream-v1',
    sampleRateHz: WIFI_RECIPE_RATE_HZ,
    signalBandwidthHz: WIFI_RECIPE_BANDWIDTH_HZ,
    profileReferenceCenterHz: WIFI_RECIPE_CENTER_HZ,
    qualification: 'standards-derived-complex-baseband',
    contentSeedDefault: TX_STREAM_RECIPE_SEED_BASE + 4,
    promotionRequirements: PROMOTION_REQUIREMENTS,
    disclosure:
      'Wi-Fi ERP-OFDM PPDU stream: seeded ACK PPDUs from the WLAN corpus generator placed at '
      + 'prevEnd + DIFS(680 samples) + backoff(k) x slot(180 samples) with backoff seeded '
      + 'uniformly in [0,15] per absolute PPDU ordinal; silence between PPDUs. NOT a MAC: no '
      + 'ACK exchange, CSMA, or contention resolution is modeled. Engineering composition; no '
      + 'canonical artifact exists because the timeline is unbounded. '
      + SCHEDULE_DISCLOSURE_TAIL,
    synthesizeWindow: (() => {
      const resolver = createWifiScheduleResolver();
      return (input: {
        contentSeed: number; startSample: bigint; sampleCount: number;
      }) => synthesizeWifiRecipeWindow(resolver, input);
    })(),
  }),
  'fm-broadcast-mpx-v1': Object.freeze({
    deviceLoopPeriodSamples: null,

    recipeId: 'fm-broadcast-mpx-v1',
    sampleRateHz: BROADCAST_CORPUS_SAMPLE_RATE_HZ,
    signalBandwidthHz: BROADCAST_CORPUS_BANDWIDTH_HZ['fm-broadcast-mpx'],
    profileReferenceCenterHz: 100_000_000,
    qualification: 'standards-derived-complex-baseband',
    contentSeedDefault: TX_STREAM_RECIPE_SEED_BASE + 5,
    promotionRequirements: PROMOTION_REQUIREMENTS,
    disclosure:
      'FM broadcast MPX timeline: continuous stereo composite FM with 256 kHz Carson bandwidth '
      + 'from the broadcast corpus generator; closed-form phase integral, any sample '
      + 'independently evaluable at any safe-integer coordinate. Broadcast-realistic '
      + 'engineering composition, not a broadcast service signal; no canonical artifact exists '
      + 'because the timeline is unbounded. ' + SCHEDULE_DISCLOSURE_TAIL,
    synthesizeWindow: (input: {
      contentSeed: number; startSample: bigint; sampleCount: number;
    }) => synthesizeBroadcastRecipeWindow('fm-broadcast-mpx', input),
  }),
  'am-voice-v1': Object.freeze({
    deviceLoopPeriodSamples: null,

    recipeId: 'am-voice-v1',
    sampleRateHz: BROADCAST_CORPUS_SAMPLE_RATE_HZ,
    signalBandwidthHz: BROADCAST_CORPUS_BANDWIDTH_HZ['am-voice'],
    profileReferenceCenterHz: 1_000_000,
    qualification: 'standards-derived-complex-baseband',
    contentSeedDefault: TX_STREAM_RECIPE_SEED_BASE + 6,
    promotionRequirements: PROMOTION_REQUIREMENTS,
    disclosure:
      'AM voice timeline: continuous voiced full-carrier DSB AM with 10 kHz bandwidth from the '
      + 'broadcast corpus generator; closed-form envelope, any sample independently evaluable '
      + 'at any safe-integer coordinate. Broadcast-realistic engineering composition built from '
      + 'sum-of-cosines amplitude motion, not recorded speech; no canonical artifact exists '
      + 'because the timeline is unbounded. ' + SCHEDULE_DISCLOSURE_TAIL,
    synthesizeWindow: (input: {
      contentSeed: number; startSample: bigint; sampleCount: number;
    }) => synthesizeBroadcastRecipeWindow('am-voice', input),
  }),
} as const) satisfies Readonly<Record<string, TxStreamRecipeRuntime>>;

export type TxStreamRecipeId = keyof typeof TX_STREAM_RECIPE_DEFINITIONS;

let recipesRegistered = false;

/** Register every v1 recipe runtime. Idempotent within a process. */
export function registerTxStreamRecipes(): void {
  if (recipesRegistered) return;
  for (const definition of Object.values(TX_STREAM_RECIPE_DEFINITIONS)) {
    registerTxStreamRecipe(definition);
  }
  recipesRegistered = true;
}
