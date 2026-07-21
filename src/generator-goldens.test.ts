import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  DEFAULT_REPLAY_CHANNEL,
  suggestedAnalyzerRange,
  synthesizeSpectrum,
  synthesizeZeroSpan,
  waveformCatalog,
  waveformDescriptor,
} from './waveforms.js';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';
import type { SynthesizedSignalProfile } from './contracts.js';

/**
 * S1 determinism goldens: bit-freeze of the generator outputs.
 *
 * These SHA-256 pins were produced by running the exact synthesis calls below
 * once and hardcoding the resulting hex digests. Any change to the generator
 * code, catalog geometry, channel defaults, or hashing that alters a single
 * bit of output MUST fail here. If a change is intentional, regenerate the
 * pins deliberately and record why in the commit that changes them.
 */

const SPECTRUM_POINTS = 256;
const SPECTRUM_SWEEP_INDEX = 0;
const ZERO_SPAN_POINTS = 128;
const ZERO_SPAN_SWEEP_INDEX = 0;
const ZERO_SPAN_SAMPLE_PERIOD_SECONDS = 0.001;
const IQ_SAMPLE_RATE_HZ = 2_000_000;
const IQ_BANDWIDTH_HZ = 1_500_000;
const IQ_SAMPLE_COUNT = 1024;

interface GeneratorGoldenPins {
  readonly spectrumSha256: string;
  readonly zeroSpanSha256: string;
  readonly complexIqSha256: string;
}

/** One representative profile per generator family (LAB, GSM, LTE, 5G NR, Wi-Fi, Bluetooth). */
const GENERATOR_GOLDEN_PINS: Readonly<Partial<Record<SynthesizedSignalProfile, GeneratorGoldenPins>>> = Object.freeze({
  cw: {
    spectrumSha256: 'eb7d92060f7213cdee880b4046aa8224c626a8281ddcadb1022b7fd29e128862',
    zeroSpanSha256: '4e85a60109eb1844373e88fb2ee03cdbaeea12974fb1ce32b5ef56f43552e143',
    complexIqSha256: '209f1f991e3ff657ad20a247216dc24762843b2a54090e73a83cfc918ccea017',
  },
  'gsm-900-loaded-bcch': {
    spectrumSha256: 'ca9e2d69999471908b12f0619c232eb95c4ffe2c9f81d77ac59c4cc0b442ea19',
    zeroSpanSha256: 'ad110436e2e3402c9e5dde1961cb1c8c43e25d8c5113df570a328db8dcb1ceb8',
    complexIqSha256: '22b5a53028be9cae96af019db515799fb80d0502e20c1815e9c9919cec1de829',
  },
  'lte-band3-fdd-20m': {
    spectrumSha256: 'c9e2c14dc9ee568eeba85199b67967ac49e5e59ee5aa4224e9fc5c7853294ef6',
    zeroSpanSha256: '063cef3e4c6755959b645b4e18faac4cd0782ef6ba1e59ae41c96c3a9c3fc3d0',
    complexIqSha256: 'd3c2c4617561f4497dba85e9e1840ba47b14b3eb6e0883b3be223e5c842ffb4a',
  },
  'nr-n3-fdd-20m': {
    spectrumSha256: '0aa3e098448177355ec29553bd21446026dffddfb60ca0c18a361ac181f713c0',
    // Identical to the lte-band3-fdd-20m zero-span pin by construction: both
    // scenarios share the 1_840_000_000 Hz center and the continuous-ofdm
    // envelope model, so their tuned detected-power replays coincide.
    zeroSpanSha256: '063cef3e4c6755959b645b4e18faac4cd0782ef6ba1e59ae41c96c3a9c3fc3d0',
    complexIqSha256: '1fec6b6ed14f751e01c5607db638a8de6536ff930dd2e77162375c910629bebc',
  },
  'wifi-hr-dsss-11m': {
    spectrumSha256: '2a47f3bf1ef2a00e5ef91e8765d5caa1cdc3d19720d04d8b072c32c8f16dfd44',
    zeroSpanSha256: '3a491f87c663cb3a0355b2bf3aaa1efdf42900078465675af0ed6eb72ae799b8',
    complexIqSha256: '3d3bd686dedb22905771c3c72544a7a9ee90bf221607a4f53b63ac52ad31cf40',
  },
  'bluetooth-classic-connected': {
    spectrumSha256: '38a04ece5ece52ac059f7351af6d24790ca5cd07818b8c7d9d5111cd39b561e5',
    zeroSpanSha256: '35ff37373c0e73e961c92af63269fc68fdf7077d4241c66c79fa7989d3fb4a90',
    complexIqSha256: 'cedb05af41c170e8c471a50d134f8b9c84c5551cfee8954478f6780dab7c0481',
  },
  'ref-qpsk': {
    spectrumSha256: 'b408419824c4c1885346d0885c33c1e0d959926f789e012ee2139b1930f53cc3',
    zeroSpanSha256: '0f905bb5cd73cc661815af6726e6fd3cd6e57de2f809342966d3c95047751e1a',
    complexIqSha256: '9eb6d13de5ad1884bac2c14a9d6d8886ef824668df003110e1edb4b2df689de6',
  },
});

const GOLDEN_PROFILES = Object.keys(GENERATOR_GOLDEN_PINS) as readonly SynthesizedSignalProfile[];

/**
 * The S1 bit-freeze pins apply only on hosts whose libm computes bit-identical
 * transcendentals to the authoring host. A handful of synthesis paths route
 * through sin/cos at large arguments (carrier-phase scale), where last-ulp
 * rounding shifts between macOS releases and differs on x86_64 — OS version
 * strings cannot separate those flavors, so the gate probes the actual
 * functions: the canary hashes sin/cos/exp/log10/pow over magnitudes spanning
 * the generator's argument range, and the pins assert exactly when it matches
 * the digest recorded at authoring time. Every platform still asserts output
 * shape here and byte-level determinism in the synthesize-twice coverage.
 * After regenerating pins (e.g. following an OS upgrade), re-record the canary
 * digest below and note why in the commit.
 */
const LIBM_CANARY_AT_AUTHORING = '881a501d2ba5dceabb074eadf3336135210cc6184509de76da73a7b7fbd4efdf';

function libmCanarySha256(): string {
  const samples: number[] = [];
  for (let i = 1; i <= 64; i += 1) {
    const x = i * 0.37 + 1 / i;
    samples.push(
      Math.sin(x * 1_000_003), Math.cos(x * 731_017),
      Math.sin(x * 2_437_000_000), Math.cos(x * 98_000_017),
      Math.exp(-x / 7), Math.log10(x * 5), Math.pow(x, 1.7),
    );
  }
  return sha256HexOfBytes(JSON.stringify(Array.from(new Float64Array(samples))));
}

const PINS_AUTHORED_ON_THIS_HOST = libmCanarySha256() === LIBM_CANARY_AT_AUTHORING;

/** Canonical hash of a scalar trace: Float64Array-normalized values serialized as a JSON array. */
function scalarSha256(values: readonly number[]): string {
  return sha256HexOfBytes(JSON.stringify(Array.from(new Float64Array(values))));
}

describe('S1 generator determinism goldens', () => {
  it.each(GOLDEN_PROFILES)('%s swept spectrum is bit-frozen', (profile) => {
    const descriptor = waveformDescriptor(profile);
    const { startHz, stopHz } = suggestedAnalyzerRange(descriptor);
    const spectrum = synthesizeSpectrum({
      profile,
      startHz,
      stopHz,
      points: SPECTRUM_POINTS,
      sweepIndex: SPECTRUM_SWEEP_INDEX,
      channel: DEFAULT_REPLAY_CHANNEL,
    });
    expect(spectrum).toHaveLength(SPECTRUM_POINTS);
    if (PINS_AUTHORED_ON_THIS_HOST) expect(scalarSha256(spectrum)).toBe(GENERATOR_GOLDEN_PINS[profile]?.spectrumSha256);
  });

  it.each(GOLDEN_PROFILES)('%s zero-span envelope is bit-frozen', (profile) => {
    const descriptor = waveformDescriptor(profile);
    const zeroSpan = synthesizeZeroSpan({
      profile,
      tuneFrequencyHz: descriptor.centerHz,
      points: ZERO_SPAN_POINTS,
      sweepIndex: ZERO_SPAN_SWEEP_INDEX,
      samplePeriodSeconds: ZERO_SPAN_SAMPLE_PERIOD_SECONDS,
      channel: DEFAULT_REPLAY_CHANNEL,
    });
    expect(zeroSpan).toHaveLength(ZERO_SPAN_POINTS);
    if (PINS_AUTHORED_ON_THIS_HOST) expect(scalarSha256(zeroSpan)).toBe(GENERATOR_GOLDEN_PINS[profile]?.zeroSpanSha256);
  });

  it.each(GOLDEN_PROFILES)('%s analytic complex I/Q is bit-frozen', (profile) => {
    const iqBytes = synthesizeAnalyticComplexIq({
      profile,
      sampleRateHz: IQ_SAMPLE_RATE_HZ,
      bandwidthHz: IQ_BANDWIDTH_HZ,
      sampleCount: IQ_SAMPLE_COUNT,
    });
    expect(iqBytes.byteLength).toBe(IQ_SAMPLE_COUNT * 8);
    if (PINS_AUTHORED_ON_THIS_HOST) expect(sha256HexOfBytes(iqBytes)).toBe(GENERATOR_GOLDEN_PINS[profile]?.complexIqSha256);
  });

  it('covers exactly one representative profile per family', () => {
    expect(GOLDEN_PROFILES).toEqual([
      'cw',
      'gsm-900-loaded-bcch',
      'lte-band3-fdd-20m',
      'nr-n3-fdd-20m',
      'wifi-hr-dsss-11m',
      'bluetooth-classic-connected',
      'ref-qpsk',
    ]);
  });
});

/**
 * S6 catalog golden: the closed profile catalog is pinned by count and exact
 * id order. Adding, removing, renaming, or reordering a profile MUST fail
 * here so catalog drift is always a deliberate, reviewed pin update.
 */
const PINNED_CATALOG_PROFILE_IDS = [
  'cw', 'am', 'fm',
  'gsm-900-loaded-bcch',
  'gsm-normal-burst', 'gsm-qpsk-higher-symbol-rate-burst', 'gsm-aqpsk-normal-burst', 'gsm-8psk-normal-burst', 'gsm-16qam-higher-symbol-rate-burst', 'gsm-32qam-higher-symbol-rate-burst',
  'lte-band3-fdd-20m', 'lte-band38-tdd-10m',
  'lte-etm1.1', 'lte-etm3.1', 'lte-etm3.1a', 'lte-etm3.1b',
  'lte-ntm', 'lte-nbiot-guard-isolated-component', 'lte-nbiot-inband-isolated-component',
  'nr-n3-fdd-20m', 'nr-n78-tdd-100m',
  'nr-fr1-tm1.1', 'nr-fr1-tm3.1', 'nr-fr1-tm3.1a', 'nr-fr1-tm3.1b', 'nr-nbiot-inband-isolated-component',
  'wifi-hr-dsss-11m', 'wifi-ofdm-20m',
  'wifi6-he-su', 'wifi6-he-er-su', 'wifi6-he-mu', 'wifi6-he-tb',
  'bluetooth-classic-connected', 'bluetooth-le-advertising',
  'ref-qpsk', 'ref-8psk', 'ref-16qam', 'ref-64qam', 'ref-256qam',
  'custom-lte', 'custom-nr', 'custom-wifi',
] as const;

const PINNED_CATALOG_COUNT = 42;

/**
 * The generator families as presented by the Generate workspace tabs. The LAB
 * tab spans both catalog family labels for analytic scalar profiles.
 */
const FAMILY_TAB_MEMBERS: readonly (readonly string[])[] = [
  ['tone', 'analog'], // LAB
  ['geran'], // GSM
  ['e-utra'], // LTE
  ['nr'], // 5G NR
  ['wlan'], // WI-FI
  ['bluetooth'], // BLUETOOTH
  ['reference'], // REFERENCE
];

describe('S6 waveform catalog golden', () => {
  it('has exactly the pinned profile count', () => {
    expect(waveformCatalog).toHaveLength(PINNED_CATALOG_COUNT);
    expect(PINNED_CATALOG_PROFILE_IDS).toHaveLength(PINNED_CATALOG_COUNT);
  });

  it('matches the pinned profile-id list exactly, in order', () => {
    expect(waveformCatalog.map((descriptor) => descriptor.id)).toEqual([...PINNED_CATALOG_PROFILE_IDS]);
  });

  it('assigns every entry to exactly one generator family tab', () => {
    for (const descriptor of waveformCatalog) {
      const owningTabs = FAMILY_TAB_MEMBERS.filter((members) => members.includes(descriptor.family));
      expect(owningTabs, `${descriptor.id} family ${descriptor.family}`).toHaveLength(1);
    }
  });
});
