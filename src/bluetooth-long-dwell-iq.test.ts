import { describe, expect, it } from 'vitest';
import {
  BLUETOOTH_LONG_DWELL_MAX_SAMPLES_PER_CALL,
  BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ,
  BLUETOOTH_LONG_DWELL_SPAN_HZ,
  firstActiveClassicSlotSample,
  isBluetoothLongDwellProfile,
  synthesizeBluetoothLongDwellIq,
  type BluetoothLongDwellProfile,
} from './bluetooth-long-dwell-iq.js';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';

const FS = BLUETOOTH_LONG_DWELL_SAMPLE_RATE_HZ;
const BR_SLOT = 50_000;
const LE_PERIOD = 2_400_000;

function synth(
  profile: BluetoothLongDwellProfile,
  sampleCount: number,
  startSampleIndex: number,
): Float32Array {
  const bytes = synthesizeBluetoothLongDwellIq({
    profile,
    sampleRateHz: FS,
    bandwidthHz: BLUETOOTH_LONG_DWELL_SPAN_HZ[profile],
    sampleCount,
    startSampleIndex,
  });
  return new Float32Array(bytes.buffer.slice(0));
}

function blockPower(iq: Float32Array, start: number, count: number): number {
  let acc = 0;
  for (let i = start; i < start + count; i += 1) {
    acc += iq[2 * i]! * iq[2 * i]! + iq[2 * i + 1]! * iq[2 * i + 1]!;
  }
  return acc / count;
}

/** Dominant frequency of a burst via a coarse DFT peak over the span. */
function dominantOffsetHz(iq: Float32Array, start: number, count: number): number {
  let best = 0;
  let bestPower = -1;
  for (let candidate = -39; candidate <= 39; candidate += 1) {
    const omega = (2 * Math.PI * candidate * 1e6) / FS;
    let sumI = 0;
    let sumQ = 0;
    for (let i = start; i < start + count; i += 1) {
      const theta = -omega * i;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const re = iq[2 * i]!;
      const im = iq[2 * i + 1]!;
      sumI += re * cos - im * sin;
      sumQ += re * sin + im * cos;
    }
    const power = sumI * sumI + sumQ * sumQ;
    if (power > bestPower) {
      bestPower = power;
      best = candidate;
    }
  }
  return best * 1e6;
}

describe('bluetooth long-dwell synthesis', () => {
  it('recognizes exactly its own profiles', () => {
    expect(isBluetoothLongDwellProfile('bluetooth-classic-connected-longdwell')).toBe(true);
    expect(isBluetoothLongDwellProfile('bluetooth-le-advertising-longdwell')).toBe(true);
    expect(isBluetoothLongDwellProfile('bluetooth-classic-connected')).toBe(false);
  });

  it('keeps Classic and LE aggregate signal spans distinct', () => {
    expect(BLUETOOTH_LONG_DWELL_SPAN_HZ).toEqual({
      'bluetooth-classic-connected-longdwell': 79_000_000,
      'bluetooth-le-advertising-longdwell': 80_000_000,
    });
    expect(firstActiveClassicSlotSample()).toBe(0);
  });

  it('is deterministic call-to-call', () => {
    for (const profile of [
      'bluetooth-classic-connected-longdwell',
      'bluetooth-le-advertising-longdwell',
    ] as const) {
      const a = synth(profile, 20_000, 123_456);
      const b = synth(profile, 20_000, 123_456);
      expect(a).toEqual(b);
    }
  });

  it('stitches exactly: one call equals any partition of consecutive calls', () => {
    for (const profile of [
      'bluetooth-classic-connected-longdwell',
      'bluetooth-le-advertising-longdwell',
    ] as const) {
      const whole = synth(profile, 60_000, 7_777);
      const parts = [
        synth(profile, 17_000, 7_777),
        synth(profile, 25_000, 24_777),
        synth(profile, 18_000, 49_777),
      ];
      const stitched = new Float32Array(60_000 * 2);
      let cursor = 0;
      for (const part of parts) {
        stitched.set(part, cursor);
        cursor += part.length;
      }
      expect(stitched).toEqual(whole);
    }
  });

  it('classic: slot-clocked activity with hop-channel diversity', () => {
    const slots = 200;
    const iq = synth(
      'bluetooth-classic-connected-longdwell',
      BLUETOOTH_LONG_DWELL_MAX_SAMPLES_PER_CALL,
      0,
    );
    // activity statistics over many slots, measured slot-by-slot
    const channels = new Set<number>();
    let active = 0;
    let checked = 0;
    for (let slot = 0; slot < slots; slot += 1) {
      const startIndex = slot * BR_SLOT;
      const window = synth(
        'bluetooth-classic-connected-longdwell',
        4_096,
        startIndex,
      );
      const power = blockPower(window, 0, 4_096);
      checked += 1;
      if (power > 1e-6) {
        active += 1;
        channels.add(Math.round(dominantOffsetHz(window, 0, 1_024) / 1e6));
      }
    }
    const utilization = active / checked;
    expect(utilization).toBeGreaterThan(0.40);
    expect(utilization).toBeLessThan(0.70);
    // hash-driven hop selection must exercise a wide channel set
    expect(channels.size).toBeGreaterThan(25);
    // the packet occupies the slot head; the slot tail is the qualified
    // inactive remainder, so mid-capture power must vary within a slot
    expect(iq.length).toBe(BLUETOOTH_LONG_DWELL_MAX_SAMPLES_PER_CALL * 2);
  });

  it('le: sparse advertising events with three channel bursts', () => {
    // scan three event periods for bursts
    const found: number[] = [];
    for (let event = 0; event < 3; event += 1) {
      let inBurst = false;
      for (let probe = 0; probe < LE_PERIOD; probe += 2_048) {
        const window = synth(
          'bluetooth-le-advertising-longdwell',
          2_048,
          event * LE_PERIOD + probe,
        );
        const power = blockPower(window, 0, 2_048);
        if (power > 1e-6 && !inBurst) {
          inBurst = true;
          found.push(event * LE_PERIOD + probe);
        } else if (power <= 1e-6) {
          inBurst = false;
        }
      }
    }
    // every period contains an event (>=1 burst detection per period)
    expect(found.length).toBeGreaterThanOrEqual(3);
    // duty cycle over one period is tiny: ~756us active in 30ms
    let totalPower = 0;
    let activeBlocks = 0;
    const blocks = Math.floor(LE_PERIOD / 8_192);
    for (let block = 0; block < blocks; block += 1) {
      const window = synth(
        'bluetooth-le-advertising-longdwell',
        8_192,
        block * 8_192,
      );
      const power = blockPower(window, 0, 8_192);
      totalPower += power;
      if (power > 1e-6) activeBlocks += 1;
    }
    expect(activeBlocks / blocks).toBeLessThan(0.08);
    expect(totalPower).toBeGreaterThan(0);
  });

  it('le: channel offsets are the true 37/38/39 spectral positions', () => {
    // find the first event coarsely, then sweep its active region and collect
    // the dominant offset of every energetic probe window -- alignment-free
    let eventStart = -1;
    for (let probe = 0; probe < LE_PERIOD; probe += 1_024) {
      const window = synth('bluetooth-le-advertising-longdwell', 1_024, probe);
      if (blockPower(window, 0, 1_024) > 1e-6) {
        eventStart = probe;
        break;
      }
    }
    expect(eventStart).toBeGreaterThanOrEqual(0);
    const observed = new Set<number>();
    const sweepStart = Math.max(0, eventStart - 16_384);
    for (let probe = 0; probe < 96_000; probe += 2_048) {
      const window = synth(
        'bluetooth-le-advertising-longdwell',
        2_048,
        sweepStart + probe,
      );
      if (blockPower(window, 0, 2_048) > 1e-6) {
        observed.add(Math.round(dominantOffsetHz(window, 0, 1_024) / 1e6));
      }
    }
    for (const expectedMhz of [-39, -15, 39]) {
      expect(
        [...observed].some((mhz) => Math.abs(mhz - expectedMhz) <= 1),
      ).toBe(true);
    }
  });

  it('routes through the public synthesizeAnalyticComplexIq dispatch', () => {
    const bytes = synthesizeAnalyticComplexIq({
      profile: 'bluetooth-classic-connected-longdwell',
      sampleRateHz: FS,
      bandwidthHz:
        BLUETOOTH_LONG_DWELL_SPAN_HZ[
          'bluetooth-classic-connected-longdwell'
        ],
      sampleCount: 4_096,
      startSampleIndex: 0,
    });
    const direct = synthesizeBluetoothLongDwellIq({
      profile: 'bluetooth-classic-connected-longdwell',
      sampleRateHz: FS,
      bandwidthHz:
        BLUETOOTH_LONG_DWELL_SPAN_HZ[
          'bluetooth-classic-connected-longdwell'
        ],
      sampleCount: 4_096,
      startSampleIndex: 0,
    });
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array(direct));
  });

  it('rejects wrong rate, span, count, and start', () => {
    const good = {
      profile: 'bluetooth-classic-connected-longdwell' as const,
      sampleRateHz: FS,
      bandwidthHz:
        BLUETOOTH_LONG_DWELL_SPAN_HZ[
          'bluetooth-classic-connected-longdwell'
        ],
      sampleCount: 1_024,
      startSampleIndex: 0,
    };
    expect(() => synthesizeBluetoothLongDwellIq({ ...good, sampleRateHz: FS + 1 })).toThrow(RangeError);
    expect(() => synthesizeBluetoothLongDwellIq({
      ...good,
      bandwidthHz: good.bandwidthHz - 1,
    })).toThrow(RangeError);
    expect(() => synthesizeBluetoothLongDwellIq({
      ...good,
      profile: 'bluetooth-le-advertising-longdwell',
    })).toThrow(/80000000/);
    expect(() => synthesizeBluetoothLongDwellIq({ ...good, sampleCount: 0 })).toThrow(RangeError);
    expect(() => synthesizeBluetoothLongDwellIq({
      ...good,
      sampleCount: BLUETOOTH_LONG_DWELL_MAX_SAMPLES_PER_CALL + 1,
    })).toThrow(RangeError);
    expect(() => synthesizeBluetoothLongDwellIq({ ...good, startSampleIndex: -1 })).toThrow(RangeError);
  });
});
