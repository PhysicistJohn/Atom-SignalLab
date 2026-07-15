import { describe, expect, it } from 'vitest';
import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  synthesizedSignalProfileSchema,
  type ReplayChannelConfiguration,
} from './contracts.js';
import {
  canonicalClassificationScenario,
  synthesizeCanonicalObservation,
} from './classification-corpus.js';
import {
  CANONIZED_KNOWN_SCENARIOS,
  CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
  CANONIZED_REPLAY_PROFILE_SCENARIOS,
  DEFAULT_REPLAY_CHANNEL,
  requireConformanceValidated,
  suggestedAnalyzerRange,
  synthesizeCanonizedKnownSpectrum,
  synthesizeCanonizedKnownEnvelope,
  synthesizeSpectrum,
  synthesizeZeroSpan,
  waveformCatalog,
  waveformDescriptor,
} from './waveforms.js';

describe('qualified waveform replay engine', () => {
  it('publishes a closed catalog with source clauses and refuses unvalidated conformance claims', () => {
    expect(waveformCatalog.map((entry) => entry.id)).toEqual(synthesizedSignalProfileSchema.options);
    expect(waveformCatalog).toHaveLength(88);
    expect(countFamilies(waveformCatalog)).toEqual({ tone: 1, analog: 2, geran: 7, 'e-utra': 27, nr: 43, wlan: 6, bluetooth: 2 });
    for (const descriptor of waveformCatalog) {
      expect(descriptor.source.references.every((reference) => /^https:\/\//.test(reference.url))).toBe(true);
      expect(descriptor.recommendedSpanHz).toBeGreaterThanOrEqual(descriptor.occupiedBandwidthHz);
    }
    expect(waveformDescriptor('lte-band3-fdd-20m').projection.duplex).toBe('fdd');
    expect(waveformDescriptor('lte-band38-tdd-10m').projection.duplex).toBe('tdd');
    expect(waveformDescriptor('nr-n3-fdd-20m').projection.duplex).toBe('fdd');
    expect(waveformDescriptor('nr-n78-tdd-100m').projection.duplex).toBe('tdd');
    expect(waveformDescriptor('bluetooth-classic-connected')).toMatchObject({ family: 'bluetooth', qualification: 'standards-derived' });
    expect(waveformDescriptor('bluetooth-le-advertising').disclosure).toMatch(/observable-class equivalence/i);
    expect(waveformDescriptor('lte-band38-tdd-10m').disclosure).toMatch(/only DwPTS is downlink-active/i);
    expect(waveformDescriptor('lte-band38-tdd-10m').source.references[1]?.clause).toMatch(/special-subframe configuration 7/i);
    expect(waveformDescriptor('gsm-normal-burst').source.references.map((reference) => reference.specification))
      .toEqual(['TS 45.004', 'TS 45.002', 'TS 45.005']);
    expect(waveformDescriptor('gsm-normal-burst').source.references.map((reference) => reference.revision))
      .toEqual(['19.0.0', '19.0.0', '19.0.0']);
    for (const [profile, clause, symbolRate] of [
      ['gsm-normal-burst', '2', '1 625/6'],
      ['gsm-qpsk-normal-burst', '5', '325'],
      ['gsm-aqpsk-normal-burst', '6', '1 625/6'],
      ['gsm-8psk-normal-burst', '3', '1 625/6'],
      ['gsm-16qam-normal-burst', '5', '325'],
      ['gsm-32qam-normal-burst', '5', '325'],
    ] as const) {
      expect(waveformDescriptor(profile).source.references[0]?.clause)
        .toContain(`Clause ${clause}`);
      expect(waveformDescriptor(profile).source.references[0]?.clause)
        .toContain(`${symbolRate} ksymb/s`);
    }
    expect(waveformDescriptor('gsm-normal-burst').source.references[1]?.clause)
      .toMatch(/4\.3.*5\.2\.3.*5\.2\.3a.*time-slot.*burst/i);
    expect(waveformDescriptor('gsm-normal-burst').source.references[2]?.clause)
      .toMatch(/4\.2\.1.*Annex A.*modulation-spectrum.*occupied-width/i);
    expect(waveformDescriptor('nr-n78-tdd-100m').disclosure).toMatch(/engineering schedule.*seven complete downlink slots/i);
    expect(waveformDescriptor('nr-n78-tdd-100m').source.references.map((reference) => reference.specification))
      .toEqual(['TS 38.104', 'TS 38.211', 'TS 38.331', 'TS 38.213']);
    expect(waveformDescriptor('bluetooth-le-advertising').disclosure).toMatch(/scenario choices, not universal Bluetooth timing/i);
    expect(() => requireConformanceValidated('lte-etm1.1')).toThrow(/not installed/i);
  });

  it('produces seeded AWGN-derived frames that are repeatable and evolve by sweep', () => {
    const input = { profile: 'cw' as const, startHz: 200_000_000, stopHz: 202_000_000, points: 450, sweepIndex: 4, channel: DEFAULT_REPLAY_CHANNEL };
    const first = synthesizeSpectrum(input);
    const duplicate = synthesizeSpectrum(input);
    const next = synthesizeSpectrum({ ...input, sweepIndex: 5 });
    expect(duplicate).toEqual(first);
    expect(next).not.toEqual(first);
    expect(average(first)).toBeGreaterThan(-112);
    expect(average(first)).toBeLessThan(-103);
    expect(Math.max(...first) - Math.min(...first)).toBeGreaterThan(6);
  });

  it('adds reproducible frequency-selective Rayleigh fades rather than relabeling AWGN', () => {
    const descriptor = waveformDescriptor('lte-etm1.1');
    const range = suggestedAnalyzerRange(descriptor);
    const awgn = synthesizeSpectrum({ profile: descriptor.id, ...range, points: 450, sweepIndex: 7, channel: { ...DEFAULT_REPLAY_CHANNEL, noiseFloorDbm: -125 } });
    const rayleighChannel: ReplayChannelConfiguration = { ...DEFAULT_REPLAY_CHANNEL, model: 'rayleigh', noiseFloorDbm: -125 };
    const rayleigh = synthesizeSpectrum({ profile: descriptor.id, ...range, points: 450, sweepIndex: 7, channel: rayleighChannel });
    const occupied = rayleigh.filter((_value, index) => index > 110 && index < 340);
    const awgnOccupied = awgn.filter((_value, index) => index > 110 && index < 340);
    expect(standardDeviation(occupied)).toBeGreaterThan(standardDeviation(awgnOccupied) + 1);
    expect(Math.min(...occupied)).toBeLessThan(Math.min(...awgnOccupied) - 3);
    expect(synthesizeSpectrum({ profile: descriptor.id, ...range, points: 450, sweepIndex: 7, channel: rayleighChannel })).toEqual(rayleigh);
  });

  it('uses the exact fitted canonized source for every public observable profile', () => {
    for (const [profile, scenarioId] of Object.entries(CANONIZED_REPLAY_PROFILE_SCENARIOS)) {
      if (!scenarioId) continue;
      const descriptor = waveformDescriptor(profile as keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS);
      const declared = CANONIZED_KNOWN_SCENARIOS[scenarioId];
      expect(descriptor).toMatchObject({
        centerHz: declared.centerHz,
        occupiedBandwidthHz: declared.occupiedBandwidthHz,
        recommendedSpanHz: declared.recommendedSpanHz,
      });
      expect(descriptor.source).toEqual(canonicalClassificationScenario(scenarioId).source);
      const range = suggestedAnalyzerRange(descriptor);
      const points = 450;
      const sweepIndex = 17;
      const live = synthesizeSpectrum({ profile: descriptor.id, ...range, points, sweepIndex, channel: DEFAULT_REPLAY_CHANNEL });
      const expected = synthesizeCanonizedKnownSpectrum({
        scenarioId,
        ...range,
        points,
        actualRbwHz: (range.stopHz - range.startHz) / (points - 1),
        sweepTimeSeconds: 0.05,
        noiseFloorDbm: DEFAULT_REPLAY_CHANNEL.noiseFloorDbm,
        snrDb: 32,
        seed: DEFAULT_REPLAY_CHANNEL.seed,
        lookIndex: sweepIndex,
        centerHz: descriptor.centerHz,
      });
      expect(live, profile).toEqual(expected);
    }
  });

  it('keeps the FM-adjacent channel floor at the AWGN floor instead of drawing a false occupied pedestal', () => {
    const descriptor = waveformDescriptor('fm');
    const range = suggestedAnalyzerRange(descriptor);
    const values = synthesizeSpectrum({ profile: 'fm', ...range, points: 1001, sweepIndex: 8, channel: DEFAULT_REPLAY_CHANNEL });
    const frequencies = values.map((_value, index) => range.startHz + (range.stopHz - range.startHz) * index / 1000);
    const adjacent = values.filter((_value, index) => {
      const offset = Math.abs(frequencies[index]! - descriptor.centerHz);
      const sidebandDistance = Math.min(...[25_000, 50_000, 75_000].map((line) => Math.abs(offset - line)));
      return offset < 105_000 && sidebandDistance > 5_000;
    });
    const outside = values.filter((_value, index) => {
      const offset = Math.abs(frequencies[index]! - descriptor.centerHz);
      return offset > 145_000 && offset < 225_000;
    });
    expect(Math.abs(median(adjacent) - median(outside))).toBeLessThan(4);
  });

  it('synthesizes every closed visual, standards, and observable profile with finite, correctly sized output', () => {
    for (const descriptor of waveformCatalog) {
      const range = suggestedAnalyzerRange(descriptor);
      const values = synthesizeSpectrum({ profile: descriptor.id, ...range, points: 121, sweepIndex: 2, channel: DEFAULT_REPLAY_CHANNEL });
      expect(values).toHaveLength(121);
      expect(values.every(Number.isFinite), descriptor.id).toBe(true);
    }
  });

  it('honors the bridge-advertised two-point spectrum and one-point detected-power minima', () => {
    for (const profile of Object.keys(CANONIZED_REPLAY_PROFILE_SCENARIOS) as Array<keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS>) {
      const descriptor = waveformDescriptor(profile);
      const range = suggestedAnalyzerRange(descriptor);
      const spectrum = synthesizeSpectrum({ profile, ...range, points: 2, sweepIndex: 0, channel: DEFAULT_REPLAY_CHANNEL });
      const envelope = synthesizeZeroSpan({
        profile,
        tuneFrequencyHz: descriptor.centerHz,
        points: 1,
        sweepIndex: 0,
        samplePeriodSeconds: 1 / 9_000,
        channel: DEFAULT_REPLAY_CHANNEL,
      });
      expect(spectrum).toHaveLength(2);
      expect(spectrum.every(Number.isFinite)).toBe(true);
      expect(envelope).toHaveLength(1);
      expect(envelope.every(Number.isFinite)).toBe(true);
    }
  });

  it('uses the admitted detected-power sample period instead of a hidden fixed clock', () => {
    const descriptor = waveformDescriptor('am');
    const samplePeriodSeconds = 1 / 3_200;
    const points = 450;
    const sweepIndex = 9;
    const live = synthesizeZeroSpan({
      profile: 'am', tuneFrequencyHz: descriptor.centerHz, points, sweepIndex, samplePeriodSeconds, channel: DEFAULT_REPLAY_CHANNEL,
    });
    const expected = synthesizeCanonizedKnownEnvelope({
      scenarioId: 'am-dsb-25k', points, samplePeriodSeconds,
      synthesisFilterWidthHz: CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
      noiseFloorDbm: DEFAULT_REPLAY_CHANNEL.noiseFloorDbm, snrDb: 32,
      seed: DEFAULT_REPLAY_CHANNEL.seed, lookIndex: sweepIndex,
      tuneFrequencyHz: descriptor.centerHz, centerHz: descriptor.centerHz,
    });
    expect(live).toEqual(expected);
    expect(live).not.toEqual(synthesizeZeroSpan({
      profile: 'am', tuneFrequencyHz: descriptor.centerHz, points, sweepIndex, samplePeriodSeconds: 1 / 9_000, channel: DEFAULT_REPLAY_CHANNEL,
    }));
  });

  it('uses the exact corpus source and explicit synthesis filter for every public detected-power replay', () => {
    const points = 450;
    const samplePeriodSeconds = 1 / 9_000;
    const lookIndex = 17;
    for (const [profile, scenarioId] of Object.entries(CANONIZED_REPLAY_PROFILE_SCENARIOS)) {
      if (!scenarioId) continue;
      const descriptor = waveformDescriptor(profile as keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS);
      const range = suggestedAnalyzerRange(descriptor);
      const actualRbwHz = (range.stopHz - range.startHz) / (points - 1);
      const live = synthesizeZeroSpan({
        profile: descriptor.id,
        tuneFrequencyHz: descriptor.centerHz,
        points,
        sweepIndex: lookIndex,
        samplePeriodSeconds,
        channel: DEFAULT_REPLAY_CHANNEL,
      });
      const corpus = synthesizeCanonicalObservation(scenarioId, {
        lookIndex,
        points,
        actualRbwHz,
        zeroSpanPoints: points,
        zeroSpanSamplePeriodSeconds: samplePeriodSeconds,
        zeroSpanFrequencyHz: descriptor.centerHz,
        detectedPowerSynthesisFilterWidthHz: CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
        noiseFloorDbm: DEFAULT_REPLAY_CHANNEL.noiseFloorDbm,
        snrDb: 32,
        seed: DEFAULT_REPLAY_CHANNEL.seed,
      });
      expect(corpus.actualRbwHz, profile).toBe(actualRbwHz);
      expect(corpus.detectedPowerActualRbwHz, profile).toBeNull();
      expect(corpus.detectedPowerSynthesisFilterWidthHz, profile)
        .toBe(CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ);
      expect(live, profile).toEqual(corpus.zeroSpanPowerDbm);
    }
  });

  it('receiver-filters every canonized public envelope at the exact requested integer-Hz tune', () => {
    for (const [profile, scenarioId] of Object.entries(CANONIZED_REPLAY_PROFILE_SCENARIOS)) {
      if (!scenarioId) continue;
      const descriptor = waveformDescriptor(profile as keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS);
      const tuneFrequencyHz = profile === 'bluetooth-le-advertising' ? 2_426_000_000 : descriptor.centerHz;
      const input = {
        profile: descriptor.id,
        points: 1_024,
        sweepIndex: 0,
        samplePeriodSeconds: 1 / 9_000,
        channel: DEFAULT_REPLAY_CHANNEL,
      } as const;
      const tuned = synthesizeZeroSpan({ ...input, tuneFrequencyHz });
      const outOfBand = synthesizeZeroSpan({ ...input, tuneFrequencyHz: MAX_MEASUREMENT_FREQUENCY_HZ });
      expect(tuned, profile).not.toEqual(outOfBand);
      expect(Math.max(...tuned), profile).toBeGreaterThan(Math.max(...outOfBand) + 8);
    }
  });

  it('uses an explicit descriptor-bounded tune for legacy visual profiles and rejects untunable survey zero span', () => {
    const descriptor = waveformDescriptor('lte-etm2');
    const sweepIndex = 0;
    const allocatedPrbCenterHz = descriptor.centerHz - 0.38 * 18_000_000;
    const input = {
      profile: descriptor.id,
      points: 256,
      sweepIndex,
      samplePeriodSeconds: 1 / 9_000,
      channel: DEFAULT_REPLAY_CHANNEL,
    } as const;
    const allocated = synthesizeZeroSpan({ ...input, tuneFrequencyHz: allocatedPrbCenterHz });
    const nominalCenter = synthesizeZeroSpan({ ...input, tuneFrequencyHz: descriptor.centerHz });
    expect(allocated).not.toEqual(nominalCenter);
    expect(Math.max(...allocated)).toBeGreaterThan(Math.max(...nominalCenter) + 8);
    expect(() => synthesizeZeroSpan({ ...input, profile: 'survey', tuneFrequencyHz: descriptor.centerHz })).toThrow(/no absolute-frequency signal model/i);
    expect(() => synthesizeZeroSpan({ ...input, tuneFrequencyHz: 98_000_000.5 })).toThrow(/safe-integer tune/i);
  });

  it('projects full, boosted, and single-PRB test models as distinct allocations', () => {
    const range = suggestedAnalyzerRange(waveformDescriptor('lte-etm1.1'));
    const full = synthesizeSpectrum({ profile: 'lte-etm1.1', ...range, points: 450, sweepIndex: 3, channel: DEFAULT_REPLAY_CHANNEL });
    const boosted = synthesizeSpectrum({ profile: 'lte-etm1.2', ...range, points: 450, sweepIndex: 3, channel: DEFAULT_REPLAY_CHANNEL });
    const single = synthesizeSpectrum({ profile: 'lte-etm2', ...range, points: 450, sweepIndex: 3, channel: DEFAULT_REPLAY_CHANNEL });
    expect(standardDeviation(boosted.slice(100, 350))).toBeGreaterThan(standardDeviation(full.slice(100, 350)) + 0.2);
    expect(single.filter((value) => value > -75).length).toBeLessThan(full.filter((value) => value > -75).length / 8);
  });

  it('projects burst timing into zero-span replays for GSM and Wi-Fi', () => {
    const gsm = synthesizeZeroSpan({ profile: 'gsm-normal-burst', tuneFrequencyHz: waveformDescriptor('gsm-normal-burst').centerHz, points: 208, sweepIndex: 0, samplePeriodSeconds: 1 / 9_000, channel: DEFAULT_REPLAY_CHANNEL });
    const wifi = synthesizeZeroSpan({ profile: 'wifi6-he-su', tuneFrequencyHz: waveformDescriptor('wifi6-he-su').centerHz, points: 178, sweepIndex: 0, samplePeriodSeconds: 1 / 9_000, channel: DEFAULT_REPLAY_CHANNEL });
    expect(gsm.filter((value) => value > -80).length / gsm.length).toBeCloseTo(1 / 8, 1);
    expect(wifi.some((value) => value > -70)).toBe(true);
    expect(wifi.some((value) => value < -100)).toBe(true);
  });
});

function average(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }
function standardDeviation(values: readonly number[]): number {
  const mean = average(values);
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}
function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) throw new Error('Median requires samples');
  return ordered[Math.floor(ordered.length / 2)]!;
}
function countFamilies(catalog: typeof waveformCatalog): Record<string, number> {
  return catalog.reduce<Record<string, number>>((counts, descriptor) => ({ ...counts, [descriptor.family]: (counts[descriptor.family] ?? 0) + 1 }), {});
}
