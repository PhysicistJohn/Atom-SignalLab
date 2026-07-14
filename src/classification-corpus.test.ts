import { describe, expect, it } from 'vitest';
import {
  CLASSIFICATION_CORPUS_VERSION,
  OBSERVABLE_SIGNAL_CLASSES,
  canonicalClassificationScenarios,
  canonicalClassificationScenario,
  synthesizeCanonicalObservation,
} from './classification-corpus.js';

describe('canonical scalar classification corpus', () => {
  it('covers every declared observable class with immutable provenance and hard negatives', () => {
    expect(CLASSIFICATION_CORPUS_VERSION).toBe('observable-scalar-corpus-v2');
    expect(canonicalClassificationScenarios).toHaveLength(23);
    expect(new Set(canonicalClassificationScenarios.map((item) => item.id)).size).toBe(canonicalClassificationScenarios.length);
    const represented = new Set(canonicalClassificationScenarios.map((item) => item.truthClass));
    expect([...OBSERVABLE_SIGNAL_CLASSES].every((item) => represented.has(item))).toBe(true);
    expect(canonicalClassificationScenarios.filter((item) => item.truthClass === 'unknown-signal')).toHaveLength(7);
    for (const item of canonicalClassificationScenarios) {
      expect(item.source.url.startsWith('https://')).toBe(true);
      expect(item.recommendedSpanHz).toBeGreaterThanOrEqual(item.occupiedBandwidthHz);
      expect(item.disclosure).toMatch(/not .*conformance/i);
    }
  });

  it('is deterministic for a seed/look/configuration and evolves across independent looks', () => {
    const input = { lookIndex: 3, seed: 9_811, snrDb: 14, actualRbwHz: 30_000 };
    const first = synthesizeCanonicalObservation('lte-band3-fdd-20m', input);
    const duplicate = synthesizeCanonicalObservation('lte-band3-fdd-20m', input);
    const next = synthesizeCanonicalObservation('lte-band3-fdd-20m', { ...input, lookIndex: 4 });
    expect(duplicate).toEqual(first);
    expect(next.powerDbm).not.toEqual(first.powerDbm);
    expect(first.powerDbm).toHaveLength(450);
    expect(first.zeroSpanPowerDbm).toHaveLength(450);
    expect(first.powerDbm.every(Number.isFinite)).toBe(true);
    expect(first.zeroSpanPowerDbm.every(Number.isFinite)).toBe(true);
  });

  it('uses the physical DSB full-carrier AM sideband-to-carrier power relation', () => {
    const observation = synthesizeCanonicalObservation('am-dsb-25k', {
      lookIndex: 0,
      points: 2_001,
      actualRbwHz: 2_000,
      noiseFloorDbm: -145,
      snrDb: 70,
      seed: 17,
    });
    const scenario = canonicalClassificationScenario('am-dsb-25k');
    const carrier = nearestPower(observation.frequencyHz, observation.powerDbm, scenario.centerHz);
    const upper = nearestPower(observation.frequencyHz, observation.powerDbm, scenario.centerHz + 25_000);
    const lower = nearestPower(observation.frequencyHz, observation.powerDbm, scenario.centerHz - 25_000);
    const expectedDbc = 10 * Math.log10(0.72 ** 2 / 4);
    expect(upper - carrier).toBeCloseTo(expectedDbc, 0);
    expect(lower - carrier).toBeCloseTo(expectedDbc, 0);
    expect(Math.abs(upper - lower)).toBeLessThan(0.15);
  });

  it('projects FM with symmetric Bessel sidebands and constant total-power envelope', () => {
    const observation = synthesizeCanonicalObservation('fm-beta-3', {
      lookIndex: 2,
      points: 2_001,
      actualRbwHz: 2_000,
      noiseFloorDbm: -145,
      snrDb: 70,
      seed: 21,
    });
    const scenario = canonicalClassificationScenario('fm-beta-3');
    for (const offset of [25_000, 50_000, 75_000]) {
      const lower = nearestPower(observation.frequencyHz, observation.powerDbm, scenario.centerHz - offset);
      const upper = nearestPower(observation.frequencyHz, observation.powerDbm, scenario.centerHz + offset);
      expect(Math.abs(lower - upper)).toBeLessThan(0.2);
    }
    expect(quantile(observation.zeroSpanPowerDbm, 0.95) - quantile(observation.zeroSpanPowerDbm, 0.05)).toBeLessThan(3);
  });

  it('keeps duplex evidence temporal and differentiates continuous FDD from TDD patterns', () => {
    const common = { lookIndex: 0, zeroSpanPoints: 2_000, zeroSpanSamplePeriodSeconds: 0.0001, noiseFloorDbm: -130, snrDb: 40, seed: 63 };
    const fdd = synthesizeCanonicalObservation('lte-band3-fdd-20m', common);
    const tdd = synthesizeCanonicalObservation('lte-band38-tdd-10m', common);
    const fddDuty = activeDuty(fdd.zeroSpanPowerDbm, -100);
    const tddDuty = activeDuty(tdd.zeroSpanPowerDbm, -100);
    expect(fddDuty).toBeGreaterThan(0.98);
    expect(tddDuty).toBeGreaterThan(0.5);
    expect(tddDuty).toBeLessThan(0.7);
  });

  it('models Bluetooth rasters and primary LE advertising centers without claiming decoded PHY', () => {
    const classic = canonicalClassificationScenario('bluetooth-classic-connected');
    const le = canonicalClassificationScenario('bluetooth-le-advertising');
    expect(classic.carrierRasterHz).toBe(1_000_000);
    expect(classic.parameters.hopRateHz).toBe(1_600);
    expect(le.carrierRasterHz).toBe(2_000_000);
    const observations = Array.from({ length: 12 }, (_, lookIndex) => synthesizeCanonicalObservation(le.id, {
      lookIndex,
      points: 901,
      sweepTimeSeconds: 0.1,
      actualRbwHz: 300_000,
      noiseFloorDbm: -130,
      snrDb: 55,
      seed: 119,
    }));
    const activeFrequencies = observations.flatMap((item) => item.frequencyHz.filter((_frequency, index) => item.powerDbm[index]! > -100));
    expect(activeFrequencies.length).toBeGreaterThan(0);
    expect(activeFrequencies.every((frequency) => [2_402_000_000, 2_426_000_000, 2_480_000_000].some((center) => Math.abs(frequency - center) < 1_500_000))).toBe(true);
  });

  it('conditions Bluetooth zero-span power on the fixed analyzer tune instead of a follow-hop envelope', () => {
    const common = {
      lookIndex: 0,
      zeroSpanPoints: 1_800,
      zeroSpanSamplePeriodSeconds: 1 / 18_000,
      actualRbwHz: 300_000,
      noiseFloorDbm: -130,
      snrDb: 55,
      seed: 119,
    };
    const leAtAdvertisingChannel = synthesizeCanonicalObservation('bluetooth-le-advertising', {
      ...common,
      zeroSpanFrequencyHz: 2_426_000_000,
    });
    const leBetweenAdvertisingChannels = synthesizeCanonicalObservation('bluetooth-le-advertising', {
      ...common,
      zeroSpanFrequencyHz: 2_441_000_000,
    });
    expect(activeDuty(leAtAdvertisingChannel.zeroSpanPowerDbm, -100)).toBeGreaterThan(0);
    expect(activeDuty(leBetweenAdvertisingChannels.zeroSpanPowerDbm, -100)).toBe(0);

    const classicFixedChannel = synthesizeCanonicalObservation('bluetooth-classic-connected', {
      ...common,
      zeroSpanFrequencyHz: 2_441_000_000,
    });
    const classicDuty = activeDuty(classicFixedChannel.zeroSpanPowerDbm, -100);
    expect(classicDuty).toBeGreaterThan(0);
    expect(classicDuty).toBeLessThan(0.1);
  });

  it('canonizes regular independent-carrier combs without claiming one emitter', () => {
    for (const [id, lineCount, expectedSpacingHz, onLineOffsetHz] of [
      ['unknown-regular-cw-comb-4', 4, 300_000, 150_000],
      ['unknown-regular-cw-comb-5', 5, 300_000, 0],
    ] as const) {
      const scenario = canonicalClassificationScenario(id);
      const observation = synthesizeCanonicalObservation(id, {
        lookIndex: 0, points: 4_001, actualRbwHz: 5_000, noiseFloorDbm: -145, snrDb: 70, seed: 811,
        zeroSpanPoints: 900, zeroSpanSamplePeriodSeconds: 1 / 9_000, zeroSpanFrequencyHz: scenario.centerHz + onLineOffsetHz,
      });
      const peaks = strongLocalPeakFrequencies(observation.frequencyHz, observation.powerDbm, -100);
      expect(peaks).toHaveLength(lineCount);
      expect(peaks.slice(1).map((frequency, index) => frequency - peaks[index]!))
        .toEqual(Array(lineCount - 1).fill(expectedSpacingHz));
      expect(activeDuty(observation.zeroSpanPowerDbm, -100)).toBe(1);
      const offLine = synthesizeCanonicalObservation(id, {
        lookIndex: 0, actualRbwHz: 5_000, noiseFloorDbm: -145, snrDb: 70, seed: 811,
        zeroSpanPoints: 900, zeroSpanSamplePeriodSeconds: 1 / 9_000, zeroSpanFrequencyHz: scenario.centerHz + 900_000,
      });
      expect(activeDuty(offLine.zeroSpanPowerDbm, -100)).toBe(0);
      expect(scenario.disclosure).toMatch(/cannot prove a shared emitter/i);
    }
  });

  it('canonizes the irregular 100/210/370 kHz span coordinates as an unknown hard negative', () => {
    const id = 'unknown-irregular-cw-multitone-100-210-370k';
    const scenario = canonicalClassificationScenario(id);
    const observation = synthesizeCanonicalObservation(id, {
      lookIndex: 0, points: 4_001, actualRbwHz: 2_000, noiseFloorDbm: -145, snrDb: 70, seed: 919,
      zeroSpanPoints: 900, zeroSpanSamplePeriodSeconds: 1 / 9_000, zeroSpanFrequencyHz: scenario.centerHz,
    });
    const peaks = strongLocalPeakFrequencies(observation.frequencyHz, observation.powerDbm, -100);
    expect(peaks.map((frequency) => frequency - (scenario.centerHz - scenario.recommendedSpanHz / 2))).toEqual([100_000, 210_000, 370_000]);
    expect(peaks.slice(1).map((frequency, index) => frequency - peaks[index]!)).toEqual([110_000, 160_000]);
    expect(activeDuty(observation.zeroSpanPowerDbm, -100)).toBe(0);
    expect(scenario.carrierRasterHz).toBeUndefined();
  });

  it('fails loudly for unknown scenarios and invalid instrument settings', () => {
    expect(() => canonicalClassificationScenario('missing')).toThrow(/unknown canonical/i);
    expect(() => synthesizeCanonicalObservation('cw-rbw-line', { lookIndex: 0, points: 2 })).toThrow(/at least 16/i);
    expect(() => synthesizeCanonicalObservation('cw-rbw-line', { lookIndex: -1 })).toThrow(/non-negative integers/i);
  });
});

function nearestPower(frequencyHz: readonly number[], powerDbm: readonly number[], targetHz: number): number {
  const index = frequencyHz.reduce((best, frequency, cursor) => Math.abs(frequency - targetHz) < Math.abs(frequencyHz[best]! - targetHz) ? cursor : best, 0);
  return powerDbm[index]!;
}

function activeDuty(values: readonly number[], thresholdDbm: number): number {
  return values.filter((value) => value >= thresholdDbm).length / values.length;
}

function strongLocalPeakFrequencies(frequencyHz: readonly number[], powerDbm: readonly number[], thresholdDbm: number): readonly number[] {
  return frequencyHz.filter((_frequency, index) => index > 0
    && index < frequencyHz.length - 1
    && powerDbm[index]! >= thresholdDbm
    && powerDbm[index]! > powerDbm[index - 1]!
    && powerDbm[index]! >= powerDbm[index + 1]!);
}

function quantile(values: readonly number[], probability: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.round((ordered.length - 1) * probability);
  return ordered[index]!;
}
