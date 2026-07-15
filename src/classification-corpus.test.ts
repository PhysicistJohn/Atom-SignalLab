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
    expect(CLASSIFICATION_CORPUS_VERSION).toBe('observable-scalar-corpus-v10');
    expect(canonicalClassificationScenarios).toHaveLength(35);
    expect(new Set(canonicalClassificationScenarios.map((item) => item.id)).size).toBe(canonicalClassificationScenarios.length);
    const represented = new Set(canonicalClassificationScenarios.map((item) => item.truthClass));
    expect([...OBSERVABLE_SIGNAL_CLASSES].every((item) => represented.has(item))).toBe(true);
    expect(canonicalClassificationScenarios.filter((item) => item.truthClass === 'unknown-signal')).toHaveLength(18);
    for (const item of canonicalClassificationScenarios) {
      expect(item.source.references.length).toBeGreaterThan(0);
      expect(item.source.references.every((reference) => reference.url.startsWith('https://'))).toBe(true);
      expect(new Set(item.source.references.map((reference) => reference.url)).size).toBe(item.source.references.length);
      expect(item.recommendedSpanHz).toBeGreaterThanOrEqual(item.occupiedBandwidthHz);
      expect(item.disclosure).toMatch(/not .*conformance/i);
      expect(item.allowedObservableClasses).toContain(item.truthClass);
      if (item.source.organization !== 'TinySA SignalLab') {
        expect(synthesizeCanonicalObservation(item.id, { lookIndex: 0 }).qualification)
          .toBe('standards-parameterized-heuristic-scalar-projection');
      }
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

  it('projects analog zero span through the configured tune and RBW response', () => {
    const common = {
      lookIndex: 0,
      zeroSpanPoints: 1_800,
      zeroSpanSamplePeriodSeconds: 1 / 180_000,
      noiseFloorDbm: -145,
      snrDb: 70,
      seed: 29,
    };
    const narrowAm = synthesizeCanonicalObservation('am-dsb-25k', {
      ...common,
      actualRbwHz: 2_000,
      zeroSpanFrequencyHz: 98_000_000,
    });
    const wideAm = synthesizeCanonicalObservation('am-dsb-25k', {
      ...common,
      actualRbwHz: 100_000,
      zeroSpanFrequencyHz: 98_000_000,
    });
    expect(quantile(narrowAm.zeroSpanPowerDbm, 0.95) - quantile(narrowAm.zeroSpanPowerDbm, 0.05)).toBeLessThan(3);
    expect(quantile(wideAm.zeroSpanPowerDbm, 0.95) - quantile(wideAm.zeroSpanPowerDbm, 0.05)).toBeGreaterThan(8);

    const discriminatorFm = synthesizeCanonicalObservation('fm-beta-3', {
      ...common,
      actualRbwHz: 50_000,
      zeroSpanFrequencyHz: 98_025_000,
    });
    const wideFm = synthesizeCanonicalObservation('fm-beta-3', {
      ...common,
      actualRbwHz: 1_000_000,
      zeroSpanFrequencyHz: 98_000_000,
    });
    expect(quantile(discriminatorFm.zeroSpanPowerDbm, 0.95) - quantile(discriminatorFm.zeroSpanPowerDbm, 0.05)).toBeGreaterThan(3);
    expect(quantile(wideFm.zeroSpanPowerDbm, 0.95) - quantile(wideFm.zeroSpanPowerDbm, 0.05)).toBeLessThan(3);
  });

  it('keeps duplex evidence temporal and differentiates continuous FDD from TDD patterns', () => {
    const common = { lookIndex: 0, zeroSpanPoints: 2_000, zeroSpanSamplePeriodSeconds: 0.0001, noiseFloorDbm: -130, snrDb: 40, seed: 63 };
    const fdd = synthesizeCanonicalObservation('lte-band3-fdd-20m', common);
    const tdd = synthesizeCanonicalObservation('lte-band38-tdd-10m', common);
    const fddDuty = activeDuty(fdd.zeroSpanPowerDbm, -100);
    const tddDuty = activeDuty(tdd.zeroSpanPowerDbm, -100);
    expect(fddDuty).toBeGreaterThan(0.98);
    expect(tddDuty).toBeGreaterThan(0.35);
    expect(tddDuty).toBeLessThan(0.45);
    expect(canonicalClassificationScenario('lte-band38-tdd-10m').parameters.ulDlConfiguration).toBe(0);
  });

  it('applies TDMA, TDD, and burst schedules during the sequential swept acquisition', () => {
    const common = {
      lookIndex: 0,
      points: 4_501,
      sweepTimeSeconds: 0.05,
      actualRbwHz: 20_000,
      noiseFloorDbm: -145,
      snrDb: 70,
      seed: 63,
    };
    const duty = (id: string) => {
      const scenario = canonicalClassificationScenario(id);
      const observation = synthesizeCanonicalObservation(id, common);
      const halfBandwidthHz = scenario.occupiedBandwidthHz / 2;
      const inBand = observation.frequencyHz.flatMap((frequency, index) =>
        Math.abs(frequency - scenario.centerHz) <= halfBandwidthHz ? [observation.powerDbm[index]!] : []);
      return activeDuty(inBand, -100);
    };

    expect(duty('lte-band3-fdd-20m')).toBeGreaterThan(0.98);
    expect(duty('gsm-900-tdma')).toBeGreaterThan(0.08);
    expect(duty('gsm-900-tdma')).toBeLessThan(0.18);
    expect(duty('gsm-900-loaded-bcch')).toBeGreaterThan(0.98);
    expect(duty('lte-band38-tdd-10m')).toBeGreaterThan(0.32);
    expect(duty('lte-band38-tdd-10m')).toBeLessThan(0.48);
    expect(duty('nr-n78-tdd-40m')).toBeGreaterThan(0.62);
    expect(duty('nr-n78-tdd-40m')).toBeLessThan(0.78);
    expect(duty('wifi-ofdm-20m')).toBeGreaterThan(0.2);
    expect(duty('wifi-ofdm-20m')).toBeLessThan(0.85);
  });

  it('models Bluetooth rasters and primary LE advertising centers without claiming decoded PHY', () => {
    const classic = canonicalClassificationScenario('bluetooth-classic-connected');
    const le = canonicalClassificationScenario('bluetooth-le-advertising');
    expect(classic.carrierRasterHz).toBe(1_000_000);
    expect(classic.parameters.hopRateHz).toBe(1_600);
    expect(le.carrierRasterHz).toBe(2_000_000);
    expect(le.parameters.packetSpacingSeconds).toBe(0.0015);
    expect(le.parameters.packetDurationSeconds).toBe(0.000376);
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

  it('models BLE packet duration separately from primary-channel packet spacing', () => {
    const samplePeriodSeconds = 10e-6;
    const observation = synthesizeCanonicalObservation('bluetooth-le-advertising', {
      lookIndex: 0,
      zeroSpanPoints: 3_000,
      zeroSpanSamplePeriodSeconds: samplePeriodSeconds,
      zeroSpanFrequencyHz: 2_426_000_000,
      actualRbwHz: 300_000,
      noiseFloorDbm: -130,
      snrDb: 55,
      seed: 119,
    });
    const active = observation.zeroSpanPowerDbm.map((powerDbm) => powerDbm > -100);
    const longestRunSamples = active.reduce((state, value) => ({
      current: value ? state.current + 1 : 0,
      longest: Math.max(state.longest, value ? state.current + 1 : 0),
    }), { current: 0, longest: 0 }).longest;
    expect(longestRunSamples * samplePeriodSeconds).toBeGreaterThanOrEqual(0.00036);
    expect(longestRunSamples * samplePeriodSeconds).toBeLessThanOrEqual(0.00039);
  });

  it('accumulates the specified 0–10 ms advertising delay between BLE events', () => {
    const samplePeriodSeconds = 50e-6;
    const observation = synthesizeCanonicalObservation('bluetooth-le-advertising', {
      lookIndex: 0,
      zeroSpanPoints: 10_000,
      zeroSpanSamplePeriodSeconds: samplePeriodSeconds,
      zeroSpanFrequencyHz: 2_402_000_000,
      actualRbwHz: 300_000,
      noiseFloorDbm: -130,
      snrDb: 55,
      seed: 119,
    });
    const active = observation.zeroSpanPowerDbm.map((powerDbm) => powerDbm > -100);
    const starts = active.flatMap((value, index) => value && (index === 0 || !active[index - 1]) ? [index * samplePeriodSeconds] : []);
    const gaps = starts.slice(1).map((start, index) => start - starts[index]!);
    expect(gaps.length).toBeGreaterThan(10);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.0199);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.0301);
  });

  it('canonizes stationary, simultaneous, interleaved, and proprietary 2.4 GHz association nulls', () => {
    const stationary = canonicalClassificationScenario('unknown-stationary-intermittent-2g4');
    const simultaneous = canonicalClassificationScenario('unknown-simultaneous-1mhz-raster-2g4');
    const interleaved = canonicalClassificationScenario('unknown-interleaved-four-channel-2g4');
    const fhss = canonicalClassificationScenario('unknown-proprietary-off-raster-fhss-2g4');
    expect(stationary.allowedObservableClasses).toEqual(['unknown-signal', 'cw-like']);
    expect(simultaneous.allowedObservableClasses).toEqual(['unknown-signal', 'cw-like', 'fm-angle-modulated-like']);
    expect(interleaved.allowedObservableClasses).toEqual(['unknown-signal', 'bluetooth-classic-like', 'bluetooth-le-like']);
    expect(fhss.allowedObservableClasses).toEqual(['unknown-signal', 'bluetooth-classic-like', 'bluetooth-le-like']);
    expect(interleaved.disclosure).toMatch(/cannot prove protocol or emitter identity/i);
    expect(fhss.disclosure).toMatch(/cannot prove protocol or emitter identity/i);

    const peakCenters = (id: string) => Array.from({ length: 12 }, (_, lookIndex) => {
      const observation = synthesizeCanonicalObservation(id, {
        lookIndex, points: 901, sweepTimeSeconds: 0.05, actualRbwHz: 200_000,
        noiseFloorDbm: -130, snrDb: 55, seed: 991,
      });
      return observation.frequencyHz[maximumIndex(observation.powerDbm)]!;
    });
    const stationaryActiveCenters = Array.from({ length: 24 }, (_, lookIndex) => synthesizeCanonicalObservation(stationary.id, {
      lookIndex, points: 901, sweepTimeSeconds: 0.05, actualRbwHz: 200_000,
      noiseFloorDbm: -130, snrDb: 55, seed: 991,
    })).filter((observation) => Math.max(...observation.powerDbm) > -100)
      .map((observation) => observation.frequencyHz[maximumIndex(observation.powerDbm)]!);
    expect(stationaryActiveCenters.length).toBeGreaterThan(3);
    expect(stationaryActiveCenters.every((frequency) => Math.abs(frequency - stationary.centerHz) <= 1_000_000)).toBe(true);
    expect(new Set(peakCenters(interleaved.id).map((frequency) => Math.round(frequency / 1_000_000))).size).toBe(4);
    const fhssCenters = peakCenters(fhss.id);
    expect(new Set(fhssCenters.map((frequency) => Math.round(frequency / 1_000_000))).size).toBeGreaterThan(3);
    expect(fhssCenters.some((frequency) => Math.abs((frequency - 2_402_000_000) % 1_000_000) > 100_000)).toBe(true);

    const comb = synthesizeCanonicalObservation(simultaneous.id, {
      lookIndex: 0, points: 4_201, actualRbwHz: 100_000, noiseFloorDbm: -140, snrDb: 60, seed: 991,
    });
    expect(strongLocalPeakFrequencies(comb.frequencyHz, comb.powerDbm, -100).length).toBeGreaterThan(60);
  });

  it('attributes the 802.15.4 hard negative to the 802.15.4 standard', () => {
    const scenario = canonicalClassificationScenario('unknown-802154');
    expect(scenario.source.references).toHaveLength(1);
    expect(scenario.source.references[0]?.specification).toBe('IEEE 802.15.4-2024');
    expect(scenario.source.references[0]?.url).toContain('802.15.4');
  });

  it('pins every multi-document standards basis independently', () => {
    expect(canonicalClassificationScenario('gsm-900-loaded-bcch').source.references.map((reference) => [
      reference.specification, reference.revision,
    ])).toEqual([
      ['TS 45.002', '18.0.0'],
      ['TS 45.005', '19.0.0'],
    ]);
    expect(canonicalClassificationScenario('lte-band3-fdd-20m').source.references.map((reference) => [
      reference.specification, reference.revision,
    ])).toEqual([
      ['TS 36.101', '19.5.0'],
      ['TS 36.211', '19.3.0'],
    ]);
    expect(canonicalClassificationScenario('nr-n78-tdd-100m').source.references.map((reference) => [
      reference.specification, reference.revision,
    ])).toEqual([
      ['TS 38.104', '19.4.0'],
      ['TS 38.211', '19.3.0'],
    ]);
    expect(canonicalClassificationScenario('bluetooth-classic-connected').source.references).toHaveLength(4);
  });

  it('canonizes exact scalar-equivalence nulls for CW, AM, FM, cellular OFDM, and Wi-Fi', () => {
    const pairs = [
      ['cw-rbw-line', 'unknown-instrument-spur-rbw-line'],
      ['am-dsb-25k', 'unknown-independent-am-equivalent-three-tone'],
      ['fm-beta-3', 'unknown-independent-fm-equivalent-bessel-comb'],
      ['lte-band3-fdd-20m', 'unknown-generic-ofdm-20m'],
      ['lte-band38-tdd-10m', 'unknown-generic-tdd-ofdm-10m'],
      ['wifi-ofdm-80m', 'unknown-generic-ofdm-80m'],
      ['wifi-hr-dsss-11m', 'unknown-proprietary-dsss-22m'],
    ] as const;
    for (const [knownId, nullId] of pairs) {
      const configuration = {
        lookIndex: 3, seed: 4_019, snrDb: 24, actualRbwHz: 100_000,
        points: 450, sweepTimeSeconds: 0.05, zeroSpanPoints: 450, zeroSpanSamplePeriodSeconds: 1 / 9_000,
      };
      const known = synthesizeCanonicalObservation(knownId, configuration);
      const scalarNull = synthesizeCanonicalObservation(nullId, configuration);
      expect(scalarNull.frequencyHz).toEqual(known.frequencyHz);
      expect(maximumAbsoluteDifference(scalarNull.powerDbm, known.powerDbm)).toBeLessThan(1e-10);
      expect(maximumAbsoluteDifference(scalarNull.zeroSpanPowerDbm, known.zeroSpanPowerDbm)).toBeLessThan(1e-10);
      expect(canonicalClassificationScenario(nullId).allowedObservableClasses.length).toBeGreaterThan(1);
      expect(canonicalClassificationScenario(nullId).disclosure).toMatch(/same admitted scalar observables/i);
    }
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
      expect(scenario.allowedObservableClasses).toEqual(['unknown-signal', 'cw-like', 'fm-angle-modulated-like']);
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
    expect(scenario.allowedObservableClasses).toEqual(['unknown-signal', 'cw-like']);
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

function maximumIndex(values: readonly number[]): number {
  return values.reduce((best, value, index) => value > values[best]! ? index : best, 0);
}

function maximumAbsoluteDifference(left: readonly number[], right: readonly number[]): number {
  return Math.max(...left.map((value, index) => Math.abs(value - right[index]!)));
}
