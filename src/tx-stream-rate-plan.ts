/**
 * Tx stream rate planner: publishes the arithmetic behind every sink
 * feasibility decision instead of hiding it. Constants carry their evidence
 * provenance; the live TX direction re-measurement annotates them when the
 * runbook executes.
 */

/**
 * Sustained host-link ceiling, RX-direction measurement over the routed
 * network path (owner ground truth, 2026-08-02). The TX direction is
 * re-measured in live preflight before reliance; this constant is the
 * conservative planning value.
 */
export const P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND = 19_300_000 as const;
/** ci16le carries four wire bytes per complex sample. */
export const P210_LINK_CI16_CEILING_SAMPLES_PER_SECOND =
  Math.floor(P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND / 4) as number;

export const P210_DEVICE_RATE_MIN_HZ = 2_083_333 as const;
export const P210_DEVICE_RATE_MAX_HZ = 61_440_000 as const;
/** Live TX rf_bandwidth ceiling (RX is 56 MHz; the asymmetry is published). */
export const P210_TX_RF_BANDWIDTH_MAX_HZ = 40_000_000 as const;
export const P210_TUNE_MIN_HZ = 46_875_000 as const;
export const P210_TUNE_MAX_HZ = 6_000_000_000 as const;
/**
 * Conservative ceiling for one cyclic device-loop buffer in ci16le: the board
 * reserves 256 MiB of CMA total (live diagnostic dmesg), so a single period
 * buffer must stay well inside it.
 */
export const P210_DEVICE_LOOP_BUFFER_CAP_BYTES: number = 256 * 1024 * 1024;

export type TxStreamSinkKind = 'file' | 'stdout' | 'iiod';

export type RatePlanVerdictKind =
  | 'streamable-over-link'
  | 'device-loop-required'
  | 'device-loop-infeasible'
  | 'file-or-stdio-only'
  | 'rejected-below-anti-alias-guard'
  | 'rejected-outside-device-rate-window';

export interface RatePlanInput {
  readonly sinkKind: TxStreamSinkKind;
  readonly sampleRateHz: number;
  /** Signal bandwidth used for the 0.95-Nyquist derived-rate guard. */
  readonly signalBandwidthHz: number;
  /** Native rate of a native-bound source; null for rate-flexible sources. */
  readonly nativeSampleRateHz: number | null;
  readonly deviceLoopRequested: boolean;
  /** Complete schedule period eligible for a device-loop buffer, if any. */
  readonly deviceLoopPeriodSamples: number | null;
  readonly centerHz: number;
}

export interface RatePlanVerdict {
  readonly verdict: RatePlanVerdictKind;
  readonly wireBytesPerSecond: number;
  readonly linkSustainedCeilingBytesPerSecond:
    typeof P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND;
  readonly linkStreamableCi16CeilingSamplesPerSecond:
    typeof P210_LINK_CI16_CEILING_SAMPLES_PER_SECOND;
  readonly deviceRateWindowHz: readonly [
    typeof P210_DEVICE_RATE_MIN_HZ,
    typeof P210_DEVICE_RATE_MAX_HZ,
  ];
  readonly guardRateFloorHz: number;
  readonly warnings: readonly string[];
}

/**
 * Decide sink feasibility for a stream rate. File and stdout sinks accept any
 * admitted rate; iiod sinks must clear the device rate window, the link
 * ceiling (or a feasible device loop), and the device tune envelope warning.
 */
export function planTxRate(input: RatePlanInput): RatePlanVerdict {
  const wireBytesPerSecond = input.sampleRateHz * 4;
  const guardRateFloorHz = Math.ceil(input.signalBandwidthHz / 0.95);
  const warnings: string[] = [];

  const base = {
    wireBytesPerSecond,
    linkSustainedCeilingBytesPerSecond: P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND,
    linkStreamableCi16CeilingSamplesPerSecond: P210_LINK_CI16_CEILING_SAMPLES_PER_SECOND,
    deviceRateWindowHz: [P210_DEVICE_RATE_MIN_HZ, P210_DEVICE_RATE_MAX_HZ] as const,
    guardRateFloorHz,
  };

  // Service conjunction: the guard binds only rates below the native artifact
  // rate; upsampling is lossless and admitted even under the guard floor.
  if (input.nativeSampleRateHz !== null
    && input.sampleRateHz < input.nativeSampleRateHz
    && input.sampleRateHz < guardRateFloorHz) {
    return {
      ...base,
      verdict: 'rejected-below-anti-alias-guard',
      warnings: [
        `derived rate ${input.sampleRateHz} samples/s is below the 0.95-Nyquist guard floor `
        + `${guardRateFloorHz} samples/s for a ${input.signalBandwidthHz} Hz signal bandwidth`,
      ],
    };
  }

  if (input.sinkKind === 'file' || input.sinkKind === 'stdout') {
    if (input.centerHz < P210_TUNE_MIN_HZ || input.centerHz > P210_TUNE_MAX_HZ) {
      warnings.push(
        `center ${input.centerHz} Hz is outside the Neptune P210 tune envelope `
        + `${P210_TUNE_MIN_HZ}-${P210_TUNE_MAX_HZ} Hz; the file/stdio sink carries it as placement metadata only`,
      );
    }
    // File/stdio sinks have no device-link constraint to evaluate; the plan is
    // admitted for file/stdio delivery.
    return { ...base, verdict: 'file-or-stdio-only', warnings };
  }

  // iiod sink from here on.
  if (input.sampleRateHz < P210_DEVICE_RATE_MIN_HZ
    || input.sampleRateHz > P210_DEVICE_RATE_MAX_HZ) {
    return {
      ...base,
      verdict: 'rejected-outside-device-rate-window',
      warnings: [
        `device sink requires a sample rate from ${P210_DEVICE_RATE_MIN_HZ} through `
        + `${P210_DEVICE_RATE_MAX_HZ} samples/s (live sampling_frequency_available); received `
        + `${input.sampleRateHz} samples/s`,
      ],
    };
  }
  if (input.centerHz < P210_TUNE_MIN_HZ || input.centerHz > P210_TUNE_MAX_HZ) {
    warnings.push(
      `center ${input.centerHz} Hz is outside the Neptune P210 tune envelope `
      + `${P210_TUNE_MIN_HZ}-${P210_TUNE_MAX_HZ} Hz; attribute readback will reject it`,
    );
  }

  if (wireBytesPerSecond <= P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND) {
    if (input.deviceLoopRequested) {
      warnings.push('device loop was requested but is unnecessary at or below the link ceiling');
    }
    return { ...base, verdict: 'streamable-over-link', warnings };
  }

  // Above the link ceiling: only a feasible device loop can serve iiod.
  const periodSamples = input.deviceLoopPeriodSamples;
  if (!input.deviceLoopRequested) {
    return {
      ...base,
      verdict: 'device-loop-required',
      warnings: [
        `ci16le wire rate ${wireBytesPerSecond} bytes/s exceeds the sustained link ceiling `
        + `${P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND} bytes/s (measured RX-direction over `
        + 'the routed path); device-loop (cyclic) transmission or a file/stdio sink is required',
      ],
    };
  }
  if (periodSamples === null) {
    return {
      ...base,
      verdict: 'device-loop-infeasible',
      warnings: [
        'device loop requires one complete schedule period in the cyclic buffer; this source '
        + 'declares no finite period (operator-declared period support is a later refinement); '
        + 'use a file or stdout sink',
      ],
    };
  }
  const periodBytes = periodSamples * 4;
  if (periodBytes > P210_DEVICE_LOOP_BUFFER_CAP_BYTES) {
    return {
      ...base,
      verdict: 'device-loop-infeasible',
      warnings: [
        `one complete period is ${periodBytes} ci16le bytes, exceeding the `
        + `${P210_DEVICE_LOOP_BUFFER_CAP_BYTES}-byte device-loop budget (board CMA 256 MiB); `
        + 'use a file or stdout sink',
      ],
    };
  }
  warnings.push(
    `device loop admitted: one ${periodSamples}-sample period (${periodBytes} ci16le bytes) `
    + 'fits the budget; board-side cyclic support is capability-probed in live preflight',
  );
  return { ...base, verdict: 'device-loop-required', warnings };
}
