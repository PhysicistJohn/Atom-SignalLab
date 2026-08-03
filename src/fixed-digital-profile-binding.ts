import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  MIN_MEASUREMENT_FREQUENCY_HZ,
  type SynthesizedSignalProfile,
} from './contracts.js';

interface NativeRateProfileBindingBase {
  /**
   * RF center of the signal represented by the I/Q profile. For an artifact
   * whose carrier is offset inside a wider capture, this differs from the
   * catalog/scalar RF reference by `nativeCarrierOffsetHz`. It is not part of
   * digital-artifact identity: callers may place the same complex envelope at
   * another RF center without changing its digital qualification.
   */
  readonly profileReferenceCenterHz: number;
  /** Native sample rate of the source complex envelope. */
  readonly nativeSampleRateHz: number;
  /** Signal/channel bandwidth fact, never an SDR capture-bandwidth setting. */
  readonly signalBandwidthHz: number;
  /** Carrier position inside the native complex envelope. */
  readonly nativeCarrierOffsetHz: number;
}

export type FixedDigitalProfileBinding =
  | Readonly<NativeRateProfileBindingBase & {
      /** Immutable frame/PPDU artifact replayed with exact modular wrapping. */
      replay: 'cyclic';
      nativePeriodSamples: number;
      captureSamples?: never;
    }>
  | Readonly<NativeRateProfileBindingBase & {
      /** One immutable bounded packet capture with zero extension for FIR support. */
      replay: 'one-shot';
      nativePeriodSamples?: never;
      captureSamples: number;
    }>;

export type UnboundedCompositionProfileBinding =
  Readonly<NativeRateProfileBindingBase & {
    /** Native-rate generated timeline with no artifact period or content bound. */
    replay: 'unbounded';
    nativePeriodSamples?: never;
    captureSamples?: never;
  }>;

export type NativeRateProfileBinding =
  | FixedDigitalProfileBinding
  | UnboundedCompositionProfileBinding;

const geran = (
  signalBandwidthHz: number,
): FixedDigitalProfileBinding => Object.freeze({
  profileReferenceCenterHz: 947_400_000,
  nativeSampleRateHz: 1_300_000,
  signalBandwidthHz,
  nativeCarrierOffsetHz: 0,
  replay: 'cyclic',
  nativePeriodSamples: 24_000,
});
const lte10m = Object.freeze({
  profileReferenceCenterHz: 1_840_000_000,
  nativeSampleRateHz: 15_360_000,
  signalBandwidthHz: 10_000_000,
  nativeCarrierOffsetHz: 0,
  replay: 'cyclic',
  nativePeriodSamples: 153_600,
} as const);
const lteNtm = Object.freeze({
  profileReferenceCenterHz: 1_840_000_000,
  nativeSampleRateHz: 1_920_000,
  signalBandwidthHz: 180_000,
  nativeCarrierOffsetHz: 0,
  replay: 'cyclic',
  nativePeriodSamples: 19_200,
} as const);
const nrN3 = Object.freeze({
  profileReferenceCenterHz: 1_840_000_000,
  nativeSampleRateHz: 30_720_000,
  signalBandwidthHz: 20_000_000,
  nativeCarrierOffsetHz: 0,
  replay: 'cyclic',
  nativePeriodSamples: 307_200,
} as const);
const nrTmN3 = Object.freeze({
  profileReferenceCenterHz: 1_842_500_000,
  nativeSampleRateHz: 30_720_000,
  signalBandwidthHz: 20_000_000,
  nativeCarrierOffsetHz: 0,
  replay: 'cyclic',
  nativePeriodSamples: 307_200,
} as const);
const wlan20m5g = Object.freeze({
  profileReferenceCenterHz: 5_180_000_000,
  nativeSampleRateHz: 20_000_000,
  signalBandwidthHz: 20_000_000,
  nativeCarrierOffsetHz: 0,
  replay: 'cyclic',
  nativePeriodSamples: 10_640,
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
    profileReferenceCenterHz: 1_840_000_000,
    nativeSampleRateHz: 30_720_000,
    signalBandwidthHz: 20_000_000,
    nativeCarrierOffsetHz: 0,
    replay: 'cyclic',
    nativePeriodSamples: 307_200,
  }),
  'lte-band38-tdd-10m': Object.freeze({
    profileReferenceCenterHz: 2_595_000_000,
    nativeSampleRateHz: 15_360_000,
    signalBandwidthHz: 10_000_000,
    nativeCarrierOffsetHz: 0,
    replay: 'cyclic',
    nativePeriodSamples: 153_600,
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
    profileReferenceCenterHz: 3_500_010_000,
    nativeSampleRateHz: 122_880_000,
    signalBandwidthHz: 100_000_000,
    nativeCarrierOffsetHz: 0,
    replay: 'cyclic',
    nativePeriodSamples: 2_457_600,
  }),
  'nr-fr1-tm1.1': nrTmN3,
  'nr-fr1-tm3.1': nrTmN3,
  'nr-fr1-tm3.1a': nrTmN3,
  'nr-fr1-tm3.1b': nrTmN3,
  'nr-nbiot-inband-isolated-component': Object.freeze({
    profileReferenceCenterHz: 3_500_010_000,
    nativeSampleRateHz: 1_920_000,
    signalBandwidthHz: 180_000,
    nativeCarrierOffsetHz: 0,
    replay: 'cyclic',
    nativePeriodSamples: 19_200,
  }),

  'wifi-hr-dsss-11m': Object.freeze({
    profileReferenceCenterHz: 2_437_000_000,
    nativeSampleRateHz: 11_000_000,
    signalBandwidthHz: 11_000_000,
    nativeCarrierOffsetHz: 0,
    replay: 'cyclic',
    nativePeriodSamples: 2_224,
  }),
  'wifi-ofdm-20m': Object.freeze({
    profileReferenceCenterHz: 2_437_000_000,
    nativeSampleRateHz: 20_000_000,
    signalBandwidthHz: 20_000_000,
    nativeCarrierOffsetHz: 0,
    replay: 'cyclic',
    nativePeriodSamples: 1_000,
  }),
  'wifi6-he-su': wlan20m5g,
  'wifi6-he-er-su': Object.freeze({
    ...wlan20m5g,
    nativePeriodSamples: 6_960,
  }),
  'wifi6-he-mu': Object.freeze({
    ...wlan20m5g,
    nativePeriodSamples: 7_040,
  }),
  'wifi6-he-tb': Object.freeze({
    ...wlan20m5g,
    nativePeriodSamples: 6_880,
  }),

  'bluetooth-classic-connected': Object.freeze({
    // The 80 MHz complex capture is centered at 2441 MHz; RF channel 8 is
    // represented by the independently checked -31 MHz baseband offset.
    profileReferenceCenterHz: 2_410_000_000,
    nativeSampleRateHz: 80_000_000,
    signalBandwidthHz: 1_000_000,
    nativeCarrierOffsetHz: -31_000_000,
    replay: 'one-shot',
    captureSamples: 50_000,
  }),
  'bluetooth-le-advertising': Object.freeze({
    // The capture is centered at 2441 MHz; advertising channel 38 is the
    // independently checked -15 MHz baseband offset.
    profileReferenceCenterHz: 2_426_000_000,
    nativeSampleRateHz: 80_000_000,
    signalBandwidthHz: 1_000_000,
    nativeCarrierOffsetHz: -15_000_000,
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
for (const [profile, inferredBinding] of Object.entries(FIXED_DIGITAL_PROFILE_BINDINGS)) {
  const binding: FixedDigitalProfileBinding = inferredBinding;
  if ((binding.replay === 'cyclic') !== (
    binding.nativePeriodSamples !== undefined
    && Number.isSafeInteger(binding.nativePeriodSamples)
    && binding.nativePeriodSamples > 0
  )) {
    throw new Error(`${profile} cyclic replay requires exactly one positive native period`);
  }
  if ((binding.replay === 'one-shot') !== (
    binding.captureSamples !== undefined
    && Number.isSafeInteger(binding.captureSamples)
    && binding.captureSamples > 0
  )) {
    throw new Error(`${profile} one-shot replay requires exactly one positive capture bound`);
  }
  validateNativeRateBinding(profile, binding);
}


/**
 * Unbounded composition profiles: native-rate synthesis with NO content bound
 * and NO content-addressed artifact -- deliberately outside the 31-profile
 * fixed registry, whose invariant is "content-bound qualified artifact".
 */
export const UNBOUNDED_COMPOSITION_PROFILE_BINDINGS = Object.freeze({
  'bluetooth-classic-connected-longdwell': Object.freeze({
    // The content spans the whole 79 MHz hop set, so the reference centre IS
    // the span centre and no single carrier offset exists.
    profileReferenceCenterHz: 2_441_000_000,
    nativeSampleRateHz: 80_000_000,
    signalBandwidthHz: 79_000_000,
    nativeCarrierOffsetHz: 0,
    replay: 'unbounded',
  } satisfies UnboundedCompositionProfileBinding),
  'bluetooth-le-advertising-longdwell': Object.freeze({
    profileReferenceCenterHz: 2_441_000_000,
    nativeSampleRateHz: 80_000_000,
    // Primary channels 37 and 39 sit at 2402/2480 MHz. Their 2 MHz LE
    // channel support therefore spans 2401 through 2481 MHz edge-to-edge.
    signalBandwidthHz: 80_000_000,
    nativeCarrierOffsetHz: 0,
    replay: 'unbounded',
  } satisfies UnboundedCompositionProfileBinding),
} as const satisfies Partial<
  Record<SynthesizedSignalProfile, UnboundedCompositionProfileBinding>
>);

export type UnboundedCompositionProfile =
  keyof typeof UNBOUNDED_COMPOSITION_PROFILE_BINDINGS;

export function isUnboundedCompositionProfile(
  profile: SynthesizedSignalProfile,
): profile is UnboundedCompositionProfile {
  return Object.hasOwn(UNBOUNDED_COMPOSITION_PROFILE_BINDINGS, profile);
}

export function unboundedCompositionProfileBinding(
  profile: UnboundedCompositionProfile,
): UnboundedCompositionProfileBinding {
  return UNBOUNDED_COMPOSITION_PROFILE_BINDINGS[profile];
}

if (Object.keys(UNBOUNDED_COMPOSITION_PROFILE_BINDINGS).length !== 2) {
  throw new Error('Unbounded composition binding registry must contain exactly 2 profiles');
}
for (const [profile, inferredBinding] of Object.entries(
  UNBOUNDED_COMPOSITION_PROFILE_BINDINGS,
)) {
  const binding: UnboundedCompositionProfileBinding = inferredBinding;
  if (binding.replay !== 'unbounded'
    || Object.hasOwn(binding, 'nativePeriodSamples')
    || Object.hasOwn(binding, 'captureSamples')) {
    throw new Error(`${profile} unbounded replay cannot declare a period or content bound`);
  }
  validateNativeRateBinding(profile, binding);
}

function validateNativeRateBinding(
  profile: string,
  binding: NativeRateProfileBinding,
): void {
  if (!Number.isSafeInteger(binding.nativeSampleRateHz)
    || binding.nativeSampleRateHz < 1
    || !Number.isSafeInteger(binding.signalBandwidthHz)
    || binding.signalBandwidthHz < 1
    || !Number.isSafeInteger(binding.profileReferenceCenterHz)
    || !Number.isSafeInteger(binding.nativeCarrierOffsetHz)) {
    throw new Error(`${profile} native-rate geometry must use positive safe-integer rate and bandwidth values`);
  }
  if (
    Math.abs(binding.nativeCarrierOffsetHz) + binding.signalBandwidthHz / 2
    > binding.nativeSampleRateHz / 2
  ) {
    throw new Error(`${profile} native carrier and signal bandwidth exceed Nyquist`);
  }
  const rfReferenceCenterHz = binding.profileReferenceCenterHz
    - binding.nativeCarrierOffsetHz;
  if (rfReferenceCenterHz < MIN_MEASUREMENT_FREQUENCY_HZ
    || rfReferenceCenterHz > MAX_MEASUREMENT_FREQUENCY_HZ) {
    throw new Error(`${profile} RF reference center is outside the admitted range`);
  }
}
