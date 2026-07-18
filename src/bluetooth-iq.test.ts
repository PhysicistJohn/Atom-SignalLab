import { describe, expect, it } from 'vitest';
import {
  BLUETOOTH_ANALYTIC_IQ_DISCLOSURE,
  BLUETOOTH_ANALYTIC_IQ_ALIAS_FREE_MINIMUM_SAMPLE_RATE_HZ,
  BLUETOOTH_ANALYTIC_IQ_FORMAT,
  BLUETOOTH_ANALYTIC_IQ_MODELS,
  BLUETOOTH_ANALYTIC_IQ_PROFILES,
  BLUETOOTH_ANALYTIC_IQ_QUALIFICATION,
  BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
  MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
  MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES,
  MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
  synthesizeBluetoothAnalyticSamples,
  type BluetoothAnalyticIqProfile,
} from './bluetooth-iq.js';
import { BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS } from './canonical-timing.js';
import { waveformCatalog } from './waveforms.js';

const SAMPLE_RATE_HZ = BLUETOOTH_ANALYTIC_IQ_ALIAS_FREE_MINIMUM_SAMPLE_RATE_HZ;
const SEED = 407;

describe('Bluetooth analytic complex-baseband engineering projections', () => {
  it('covers every and only catalogued Bluetooth profile with explicit non-conformance disclosure', () => {
    const catalogued = waveformCatalog
      .filter(({ family }) => family === 'bluetooth')
      .map(({ id }) => id);
    expect(BLUETOOTH_ANALYTIC_IQ_PROFILES).toEqual(catalogued);
    expect(Object.keys(BLUETOOTH_ANALYTIC_IQ_MODELS)).toEqual(catalogued);
    expect(BLUETOOTH_ANALYTIC_IQ_FORMAT).toBe('interleaved-f32-iq');
    expect(BLUETOOTH_ANALYTIC_IQ_QUALIFICATION).toBe('standards-derived-engineering-projection');
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/not packet-decodable I\/Q/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/not a conformance vector/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/Basic-Rate-like GFSK.*does not synthesize EDR DPSK/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/no Bluetooth packet.*payload/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/below 80 MHz.*alias projection/i);
    for (const profile of BLUETOOTH_ANALYTIC_IQ_PROFILES) {
      expect(BLUETOOTH_ANALYTIC_IQ_MODELS[profile].qualification)
        .toBe('standards-derived-engineering-projection');
    }
  });

  it('pins Classic FHSS and LE advertising timing to the current scalar engineering descriptors', () => {
    const classic = BLUETOOTH_ANALYTIC_IQ_MODELS['bluetooth-classic-connected'];
    expect(classic).toMatchObject({
      referenceCenterHz: 2_441_000_000,
      firstChannelCenterHz: 2_402_000_000,
      channelCount: 79,
      channelSpacingHz: 1_000_000,
      slotSeconds: 0.000625,
      symbolRateHz: 1_000_000,
    });
    const le = BLUETOOTH_ANALYTIC_IQ_MODELS['bluetooth-le-advertising'];
    expect(le.channelCentersHz).toEqual([2_402_000_000, 2_426_000_000, 2_480_000_000]);
    expect(le).toMatchObject({
      packetDurationSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packetDurationSeconds,
      packetStartSpacingSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packetStartSpacingSeconds,
      advertisingIntervalSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.advertisingIntervalSeconds,
      advertisingDelayMinimumSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.advertisingDelayMinimumSeconds,
      advertisingDelayMaximumSeconds: BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.advertisingDelayMaximumSeconds,
      symbolRateHz: 1_000_000,
    });
  });

  it('is deterministic, slice-independent, finite, and unit bounded', () => {
    for (const profile of BLUETOOTH_ANALYTIC_IQ_PROFILES) {
      const input = {
        profile,
        sampleRateHz: SAMPLE_RATE_HZ,
        sampleCount: 4_096,
        seed: SEED,
        startSampleIndex: 8_000,
      };
      const first = synthesizeBluetoothAnalyticSamples(input);
      const second = synthesizeBluetoothAnalyticSamples(input);
      expect(first).toEqual(second);
      expect(first).toHaveLength(input.sampleCount * 2);
      expectUnitBounded(first);

      const left = synthesizeBluetoothAnalyticSamples({ ...input, sampleCount: 2_048 });
      const right = synthesizeBluetoothAnalyticSamples({
        ...input,
        sampleCount: 2_048,
        startSampleIndex: input.startSampleIndex + 2_048,
      });
      expect(new Float32Array([...left, ...right])).toEqual(first);
    }
  });

  it('implements Classic two-active/one-idle slots and seeded 79-center FHSS', () => {
    const slotSamples = SAMPLE_RATE_HZ * 0.000625;
    const first = activeWindow('bluetooth-classic-connected', 8_000, 4_096);
    const second = activeWindow('bluetooth-classic-connected', slotSamples + 8_000, 4_096);
    const idle = activeWindow('bluetooth-classic-connected', 2 * slotSamples + 8_000, 4_096);
    expect(nonzeroSamples(first)).toBe(4_096);
    expect(nonzeroSamples(second)).toBe(4_096);
    expect(nonzeroSamples(idle)).toBe(0);

    const firstOffset = meanInstantaneousFrequency(first, SAMPLE_RATE_HZ);
    const secondOffset = meanInstantaneousFrequency(second, SAMPLE_RATE_HZ);
    for (const offset of [firstOffset, secondOffset]) {
      const channelCoordinate = (offset + 39_000_000) / 1_000_000;
      expect(Math.abs(channelCoordinate - Math.round(channelCoordinate))).toBeLessThan(0.3);
      expect(offset).toBeGreaterThanOrEqual(-39_300_000);
      expect(offset).toBeLessThanOrEqual(39_300_000);
    }
    expect(Math.abs(firstOffset - secondOffset)).toBeGreaterThan(500_000);
  });

  it('places the first LE event on channels 37, 38, and 39 with declared packet gaps', () => {
    const packetStarts = [0, 0.0015, 0.003].map((seconds) => seconds * SAMPLE_RATE_HZ);
    const expectedOffsets = [-39_000_000, -15_000_000, 39_000_000];
    for (let packet = 0; packet < packetStarts.length; packet += 1) {
      const window = activeWindow('bluetooth-le-advertising', packetStarts[packet]! + 4_096, 4_096);
      expect(nonzeroSamples(window)).toBe(4_096);
      expect(Math.abs(meanInstantaneousFrequency(window, SAMPLE_RATE_HZ) - expectedOffsets[packet]!))
        .toBeLessThan(300_000);
    }
    const packetEnd = BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS.packetDurationSeconds * SAMPLE_RATE_HZ;
    expect(nonzeroSamples(activeWindow('bluetooth-le-advertising', packetEnd, 64))).toBe(0);
    expect(nonzeroSamples(activeWindow('bluetooth-le-advertising', 0.001 * SAMPLE_RATE_HZ, 64))).toBe(0);
  });

  it('uses a deterministic seeded 20-to-30 ms LE event recurrence', () => {
    const startA = findSecondAdvertisingEvent(11);
    const startB = findSecondAdvertisingEvent(12);
    expect(startA).toBeGreaterThanOrEqual(0.020);
    expect(startA).toBeLessThan(0.030);
    expect(startB).toBeGreaterThanOrEqual(0.020);
    expect(startB).toBeLessThan(0.030);
    expect(startA).not.toBe(startB);
    expect(findSecondAdvertisingEvent(11)).toBe(startA);
  });

  it('rejects unsupported profiles and every geometry outside the allocation bounds', () => {
    const valid = {
      profile: 'bluetooth-classic-connected' as BluetoothAnalyticIqProfile,
      sampleRateHz: MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
      sampleCount: 1,
      seed: 1,
    };
    expect(() => synthesizeBluetoothAnalyticSamples(valid)).not.toThrow();
    expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, profile: 'wifi-ofdm-20m' }))
      .toThrow(/no Bluetooth analytic complex-baseband/i);
    for (const sampleRateHz of [MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ - 1, MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ + 1]) {
      expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, sampleRateHz })).toThrow(/sample rate/i);
    }
    for (const sampleCount of [0, MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES + 1]) {
      expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, sampleCount })).toThrow(/sample count/i);
    }
    for (const seed of [0, 0x1_0000_0000]) {
      expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, seed })).toThrow(/seed/i);
    }
    expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, startSampleIndex: -1 }))
      .toThrow(/start sample/i);
    expect(() => synthesizeBluetoothAnalyticSamples({
      ...valid,
      startSampleIndex: SAMPLE_RATE_HZ * 60 + 1,
    })).toThrow(/start sample/i);
  });

  it('remains bounded at maximum sample count and rate', () => {
    const samples = synthesizeBluetoothAnalyticSamples({
      profile: 'bluetooth-classic-connected',
      sampleRateHz: MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
      sampleCount: MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES,
      seed: 0xffff_ffff,
    });
    expect(samples).toHaveLength(MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES * 2);
    expectUnitBounded(samples);
  }, 15_000);
});

function activeWindow(
  profile: BluetoothAnalyticIqProfile,
  startSampleIndex: number,
  sampleCount: number,
  seed = SEED,
): Float32Array {
  return synthesizeBluetoothAnalyticSamples({
    profile,
    sampleRateHz: SAMPLE_RATE_HZ,
    sampleCount,
    seed,
    startSampleIndex,
  });
}

function nonzeroSamples(samples: Float32Array): number {
  let count = 0;
  for (let index = 0; index < samples.length; index += 2) {
    if (samples[index] !== 0 || samples[index + 1] !== 0) count += 1;
  }
  return count;
}

function meanInstantaneousFrequency(samples: Float32Array, sampleRateHz: number): number {
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < samples.length / 2 - 1; index += 1) {
    const inPhase = samples[index * 2]!;
    const quadrature = samples[index * 2 + 1]!;
    const nextInPhase = samples[index * 2 + 2]!;
    const nextQuadrature = samples[index * 2 + 3]!;
    real += inPhase * nextInPhase + quadrature * nextQuadrature;
    imaginary += inPhase * nextQuadrature - quadrature * nextInPhase;
  }
  return Math.atan2(imaginary, real) * sampleRateHz / (2 * Math.PI);
}

function expectUnitBounded(samples: Float32Array): void {
  for (let index = 0; index < samples.length; index += 2) {
    const inPhase = samples[index]!;
    const quadrature = samples[index + 1]!;
    expect(Number.isFinite(inPhase) && Number.isFinite(quadrature)).toBe(true);
    expect(Math.hypot(inPhase, quadrature)).toBeLessThanOrEqual(1);
  }
}

function findSecondAdvertisingEvent(seed: number): number {
  for (let tenthMillisecond = 200; tenthMillisecond < 300; tenthMillisecond += 1) {
    const timeSeconds = tenthMillisecond / 10_000;
    const samples = activeWindow(
      'bluetooth-le-advertising',
      Math.round(timeSeconds * SAMPLE_RATE_HZ),
      1,
      seed,
    );
    if (nonzeroSamples(samples) === 1) return timeSeconds;
  }
  throw new Error(`No second BLE advertising event was found for seed ${seed}`);
}
