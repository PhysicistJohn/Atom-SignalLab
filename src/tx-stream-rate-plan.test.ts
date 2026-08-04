import { describe, expect, it } from 'vitest';
import {
  P210_DEVICE_LOOP_BUFFER_CAP_BYTES,
  P210_DEVICE_RATE_MAX_HZ,
  P210_DEVICE_RATE_MIN_HZ,
  P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND,
  planTxRate,
} from './tx-stream-rate-plan.js';

const base = {
  signalBandwidthHz: 200_000,
  nativeSampleRateHz: 1_300_000,
  deviceLoopRequested: false,
  deviceLoopPeriodSamples: 24_000,
  centerHz: 947_400_000,
} as const;

describe('tx-stream rate planner verdicts', () => {
  it('streams the live-Tx GSM upsample rate over the link to iiod', () => {
    // 1.3 MHz is below the live device floor (2,083,333 Hz); the runbook
    // streams GSM upsampled to 2,083,333 samples/s.
    const verdict = planTxRate({ ...base, sinkKind: 'iiod', sampleRateHz: 2_083_333 });
    expect(verdict.verdict).toBe('streamable-over-link');
    expect(verdict.warnings).toEqual([]);
  });

  it('rejects sub-floor rates for device sinks', () => {
    const verdict = planTxRate({ ...base, sinkKind: 'iiod', sampleRateHz: 1_300_000 });
    expect(verdict.verdict).toBe('rejected-outside-device-rate-window');
  });

  it('admits the live link ceiling exactly at 4.825 Msps ci16', () => {
    expect(P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND).toBe(19_300_000);
    const atCeiling = planTxRate({
      ...base,
      sinkKind: 'iiod',
      sampleRateHz: 4_825_000,
      nativeSampleRateHz: null,
      deviceLoopPeriodSamples: null,
    });
    expect(atCeiling.verdict).toBe('streamable-over-link');
    const aboveCeiling = planTxRate({
      ...base,
      sinkKind: 'iiod',
      sampleRateHz: 4_825_001,
      nativeSampleRateHz: null,
      deviceLoopPeriodSamples: null,
    });
    expect(aboveCeiling.verdict).toBe('device-loop-required');
  });

  it('requires a device loop above the link ceiling and admits feasible loops', () => {
    const withoutLoop = planTxRate({
      ...base,
      sinkKind: 'iiod',
      sampleRateHz: 30_720_000,
      nativeSampleRateHz: 30_720_000,
      signalBandwidthHz: 20_000_000,
      deviceLoopPeriodSamples: 307_200,
    });
    expect(withoutLoop.verdict).toBe('device-loop-required');
    expect(withoutLoop.warnings.join(' ')).toMatch(/exceeds the sustained link ceiling/);

    const withLoop = planTxRate({
      ...base,
      sinkKind: 'iiod',
      sampleRateHz: 30_720_000,
      nativeSampleRateHz: 30_720_000,
      signalBandwidthHz: 20_000_000,
      deviceLoopRequested: true,
      deviceLoopPeriodSamples: 307_200,
    });
    expect(withLoop.verdict).toBe('device-loop-required');
    expect(withLoop.warnings.join(' ')).toMatch(/device loop admitted/);
  });

  it('declares device loops infeasible when the period exceeds the memory budget', () => {
    const tooLarge = Math.floor(P210_DEVICE_LOOP_BUFFER_CAP_BYTES / 4) + 1;
    const verdict = planTxRate({
      ...base,
      sinkKind: 'iiod',
      sampleRateHz: 30_720_000,
      nativeSampleRateHz: 30_720_000,
      signalBandwidthHz: 20_000_000,
      deviceLoopRequested: true,
      deviceLoopPeriodSamples: tooLarge,
    });
    expect(verdict.verdict).toBe('device-loop-infeasible');
  });

  it('declares device loops infeasible without a finite period', () => {
    const verdict = planTxRate({
      ...base,
      sinkKind: 'iiod',
      sampleRateHz: 20_000_000,
      nativeSampleRateHz: null,
      signalBandwidthHz: 20_000_000,
      deviceLoopRequested: true,
      deviceLoopPeriodSamples: null,
    });
    expect(verdict.verdict).toBe('device-loop-infeasible');
    expect(verdict.warnings.join(' ')).toMatch(/no finite period/);
  });

  it('rejects rates outside the live device window', () => {
    const tooLow = planTxRate({
      ...base, sinkKind: 'iiod', sampleRateHz: P210_DEVICE_RATE_MIN_HZ - 1,
    });
    expect(tooLow.verdict).toBe('rejected-outside-device-rate-window');
    const tooHigh = planTxRate({
      ...base, sinkKind: 'iiod', sampleRateHz: P210_DEVICE_RATE_MAX_HZ + 1,
    });
    expect(tooHigh.verdict).toBe('rejected-outside-device-rate-window');
    expect(tooHigh.warnings.join(' ')).toMatch(/2083333 through 61440000/);
  });

  it('rejects derived rates below the 0.95-Nyquist guard with arithmetic', () => {
    const verdict = planTxRate({
      ...base,
      sinkKind: 'file',
      sampleRateHz: 15_360_000,
      nativeSampleRateHz: 30_720_000,
      signalBandwidthHz: 20_000_000,
    });
    expect(verdict.verdict).toBe('rejected-below-anti-alias-guard');
    expect(verdict.guardRateFloorHz).toBe(21_052_632);
  });

  it('admits native rates without applying the derived guard', () => {
    const verdict = planTxRate({
      ...base,
      sinkKind: 'file',
      sampleRateHz: 1_300_000,
    });
    expect(verdict.verdict).toBe('file-or-stdio-only');
  });

  it('accepts any admitted rate for file and stdout sinks', () => {
    for (const sinkKind of ['file', 'stdout'] as const) {
      const verdict = planTxRate({
        ...base,
        sinkKind,
        sampleRateHz: 122_880_000,
        nativeSampleRateHz: 122_880_000,
        signalBandwidthHz: 100_000_000,
      });
      expect(verdict.verdict).toBe('file-or-stdio-only');
    }
  });

  it('warns when the center is outside the P210 tune envelope', () => {
    const verdict = planTxRate({
      ...base,
      sinkKind: 'iiod',
      sampleRateHz: 2_083_333,
      centerHz: 17_000_000_000,
    });
    expect(verdict.warnings.join(' ')).toMatch(/tune envelope/);
  });

  it('publishes the ci16 ceiling derived from the link constant', () => {
    const verdict = planTxRate({ ...base, sinkKind: 'file', sampleRateHz: 1_300_000 });
    expect(verdict.linkStreamableCi16CeilingSamplesPerSecond)
      .toBe(Math.floor(P210_LINK_SUSTAINED_CEILING_BYTES_PER_SECOND / 4));
  });
});
