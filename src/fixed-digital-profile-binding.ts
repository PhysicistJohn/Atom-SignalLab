import type { SynthesizedSignalProfile } from './contracts.js';

export interface FixedDigitalProfileBinding {
  /** Exact catalog RF/display coordinate carried by qualified measurements. */
  readonly centerHz: number;
  /** Exact digital-interface sample rate accepted by the content-bound adapter. */
  readonly sampleRateHz: number;
  /** Exact channel/grid/interface bandwidth argument accepted by the adapter. */
  readonly bandwidthHz: number;
  /** Cyclic frame/PPDU replay or a single bounded packet capture. */
  readonly replay: 'cyclic' | 'one-shot';
  /** Exclusive sample bound for a one-shot capture. */
  readonly captureSamples?: number;
}

const geran = (
  bandwidthHz: number,
): FixedDigitalProfileBinding => Object.freeze({
  centerHz: 947_400_000,
  sampleRateHz: 1_300_000,
  bandwidthHz,
  replay: 'cyclic',
});
const lte10m = Object.freeze({
  centerHz: 1_840_000_000,
  sampleRateHz: 15_360_000,
  bandwidthHz: 10_000_000,
  replay: 'cyclic',
} as const);
const lteNtm = Object.freeze({
  centerHz: 1_840_000_000,
  sampleRateHz: 1_920_000,
  bandwidthHz: 180_000,
  replay: 'cyclic',
} as const);
const nrN3 = Object.freeze({
  centerHz: 1_840_000_000,
  sampleRateHz: 30_720_000,
  bandwidthHz: 20_000_000,
  replay: 'cyclic',
} as const);
const nrTmN3 = Object.freeze({
  centerHz: 1_842_500_000,
  sampleRateHz: 30_720_000,
  bandwidthHz: 20_000_000,
  replay: 'cyclic',
} as const);
const wlan20m5g = Object.freeze({
  centerHz: 5_180_000_000,
  sampleRateHz: 20_000_000,
  bandwidthHz: 20_000_000,
  replay: 'cyclic',
} as const);

export const FIXED_DIGITAL_PROFILE_BINDINGS = Object.freeze({
  'gsm-900-loaded-bcch': geran(200_000),
  'gsm-normal-burst': geran(200_000),
  'gsm-qpsk-higher-symbol-rate-burst': geran(325_000),
  'gsm-aqpsk-normal-burst': geran(250_000),
  'gsm-8psk-normal-burst': geran(250_000),
  'gsm-16qam-higher-symbol-rate-burst': geran(325_000),
  'gsm-32qam-higher-symbol-rate-burst': geran(325_000),

  'lte-band3-fdd-20m': Object.freeze({
    centerHz: 1_840_000_000,
    sampleRateHz: 30_720_000,
    bandwidthHz: 20_000_000,
    replay: 'cyclic',
  }),
  'lte-band38-tdd-10m': Object.freeze({
    centerHz: 2_595_000_000,
    sampleRateHz: 15_360_000,
    bandwidthHz: 10_000_000,
    replay: 'cyclic',
  }),
  'lte-etm1.1': lte10m,
  'lte-etm3.1': lte10m,
  'lte-etm3.1a': lte10m,
  'lte-etm3.1b': lte10m,
  'lte-ntm': lteNtm,
  'lte-nbiot-guard-isolated-component': lteNtm,
  'lte-nbiot-inband-isolated-component': lteNtm,

  'nr-n3-fdd-20m': nrN3,
  'nr-n78-tdd-100m': Object.freeze({
    centerHz: 3_500_010_000,
    sampleRateHz: 122_880_000,
    bandwidthHz: 100_000_000,
    replay: 'cyclic',
  }),
  'nr-fr1-tm1.1': nrTmN3,
  'nr-fr1-tm3.1': nrTmN3,
  'nr-fr1-tm3.1a': nrTmN3,
  'nr-fr1-tm3.1b': nrTmN3,
  'nr-nbiot-inband-isolated-component': Object.freeze({
    centerHz: 3_500_010_000,
    sampleRateHz: 1_920_000,
    bandwidthHz: 180_000,
    replay: 'cyclic',
  }),

  'wifi-hr-dsss-11m': Object.freeze({
    centerHz: 2_437_000_000,
    sampleRateHz: 11_000_000,
    bandwidthHz: 11_000_000,
    replay: 'cyclic',
  }),
  'wifi-ofdm-20m': Object.freeze({
    centerHz: 2_437_000_000,
    sampleRateHz: 20_000_000,
    bandwidthHz: 20_000_000,
    replay: 'cyclic',
  }),
  'wifi6-he-su': wlan20m5g,
  'wifi6-he-er-su': wlan20m5g,
  'wifi6-he-mu': wlan20m5g,
  'wifi6-he-tb': wlan20m5g,

  'bluetooth-classic-connected': Object.freeze({
    // The 80 MHz complex capture is centered at 2441 MHz; RF channel 8 is
    // represented by the independently checked -31 MHz baseband offset.
    centerHz: 2_441_000_000,
    sampleRateHz: 80_000_000,
    bandwidthHz: 1_000_000,
    replay: 'one-shot',
    captureSamples: 50_000,
  }),
  'bluetooth-le-advertising': Object.freeze({
    // The capture is centered at 2441 MHz; advertising channel 38 is the
    // independently checked -15 MHz baseband offset.
    centerHz: 2_441_000_000,
    sampleRateHz: 80_000_000,
    bandwidthHz: 1_000_000,
    replay: 'one-shot',
    captureSamples: 12_160,
  }),
} as const satisfies Partial<
  Record<SynthesizedSignalProfile, FixedDigitalProfileBinding>
>);

export type FixedDigitalProfile =
  keyof typeof FIXED_DIGITAL_PROFILE_BINDINGS;

export function isFixedDigitalProfile(
  profile: SynthesizedSignalProfile,
): profile is FixedDigitalProfile {
  return Object.hasOwn(FIXED_DIGITAL_PROFILE_BINDINGS, profile);
}

export function fixedDigitalProfileBinding(
  profile: FixedDigitalProfile,
): FixedDigitalProfileBinding {
  return FIXED_DIGITAL_PROFILE_BINDINGS[profile];
}

if (Object.keys(FIXED_DIGITAL_PROFILE_BINDINGS).length !== 31) {
  throw new Error('Fixed digital profile binding registry must contain exactly 31 profiles');
}
