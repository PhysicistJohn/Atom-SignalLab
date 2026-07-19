import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ANALYTIC_COMPLEX_IQ_PROFILES,
  ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ,
  ANALYTIC_IQ_AM_MODULATION_INDEX,
  ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
  MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
  MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
  complexIqGeneratorBasis,
  synthesizeAnalyticComplexIq,
  type AnalyticComplexIqProfile,
} from './complex-iq.js';

describe('analytic complex-I/Q synthesis', () => {
  it('evolves every non-constant profile across successive capture coordinates while staying deterministic', () => {
    const geometry = { sampleRateHz: 2_000_000, bandwidthHz: 1_500_000, sampleCount: 4_096 };
    for (const profile of ANALYTIC_COMPLEX_IQ_PROFILES) {
      const first = synthesizeAnalyticComplexIq({ ...geometry, profile });
      const explicitZero = synthesizeAnalyticComplexIq({ ...geometry, profile, startSampleIndex: 0 });
      const advanced = synthesizeAnalyticComplexIq({ ...geometry, profile, startSampleIndex: geometry.sampleCount });
      const advancedAgain = synthesizeAnalyticComplexIq({ ...geometry, profile, startSampleIndex: geometry.sampleCount });
      // Omitting the coordinate is exactly coordinate 0 (pins the goldens).
      expect(explicitZero).toEqual(first);
      // Same coordinate is bit-identical; this is a coordinate, not a RNG.
      expect(advancedAgain).toEqual(advanced);
      // A later coordinate is a later moment of the same signal. CW is the
      // one physically constant envelope and stays bit-frozen.
      if (profile === 'cw') expect(advanced).toEqual(first);
      else expect(advanced).not.toEqual(first);
    }
  });

  it('rejects a negative or unsafe capture coordinate', () => {
    const geometry = { profile: 'fm' as const, sampleRateHz: 2_000_000, bandwidthHz: 1_500_000, sampleCount: 16 };
    expect(() => synthesizeAnalyticComplexIq({ ...geometry, startSampleIndex: -1 })).toThrow(/non-negative safe integer/);
    expect(() => synthesizeAnalyticComplexIq({ ...geometry, startSampleIndex: Number.MAX_SAFE_INTEGER }))
      .toThrow(/non-negative safe integer/);
  });

  it('keeps CW bit-exact across the full independent bandwidth range', () => {
    const input = {
      profile: 'cw' as const,
      sampleRateHz: MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
      sampleCount: 257,
    };
    const narrow = synthesizeAnalyticComplexIq({ ...input, bandwidthHz: MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ });
    const wide = synthesizeAnalyticComplexIq({ ...input, bandwidthHz: MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ });

    expect(narrow).toEqual(wide);
    expect(narrow.byteLength).toBe(input.sampleCount * 8);
    expect(decodeCf32le(narrow)).toEqual(Array.from({ length: input.sampleCount }, () => [1, 0]));
  });

  it('retains the declared normalized DSB full-carrier AM source before deterministic filtering', () => {
    const samples = decodeCf32le(synthesizeAnalyticComplexIq({
      profile: 'am',
      sampleRateHz: 1_000_000,
      bandwidthHz: 1_000_000,
      sampleCount: 21,
    }));

    expect(samples[0]).toEqual([1, 0]);
    expect(samples.every(([_inPhase, quadrature]) => quadrature === 0)).toBe(true);
    expect(samples[10]![0]).toBeLessThan(1);
    expect(samples[20]![0]).toBeGreaterThanOrEqual((1 - ANALYTIC_IQ_AM_MODULATION_INDEX) / (1 + ANALYTIC_IQ_AM_MODULATION_INDEX));
  });

  it('measures the documented -3 dB edge directly on the coherent AM sideband', () => {
    const sampleRateHz = 1_000_000;
    const bandwidthHz = 2 * ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ;
    const discardedSamples = 4_096;
    const measuredSamples = 40_000;
    const bytes = synthesizeAnalyticComplexIq({
      profile: 'am',
      sampleRateHz,
      bandwidthHz,
      sampleCount: discardedSamples + measuredSamples,
    });
    const measuredSideband = complexToneMagnitude(
      decodeCf32le(bytes).slice(discardedSamples),
      ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ,
      sampleRateHz,
    );
    const unfilteredSideband = ANALYTIC_IQ_AM_MODULATION_INDEX / (2 * (1 + ANALYTIC_IQ_AM_MODULATION_INDEX));

    expect(measuredSideband).toBeCloseTo(unfilteredSideband * Math.SQRT1_2, 7);
  });

  it('keeps the exact -3 dB coefficient response numerically stable at both admitted corners', () => {
    for (const [bandwidthHz, sampleRateHz] of [
      [MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ, MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ],
      [MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ, MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ],
    ] as const) {
      expect(onePoleMagnitude(bandwidthHz, sampleRateHz, bandwidthHz / 2)).toBeCloseTo(Math.SQRT1_2, 12);
    }
  });

  it('changes AM and FM bytes and quantitatively attenuates their spectra at narrow bandwidth', () => {
    const sampleRateHz = 1_000_000;
    const narrowBandwidthHz = MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ;
    const wideBandwidthHz = sampleRateHz;
    const discardedSamples = 4_096;
    const measuredSamples = 40_000;
    const sampleCount = discardedSamples + measuredSamples;

    for (const profile of ['am', 'fm'] as const) {
      const narrowBytes = synthesizeAnalyticComplexIq({ profile, sampleRateHz, bandwidthHz: narrowBandwidthHz, sampleCount });
      const wideBytes = synthesizeAnalyticComplexIq({ profile, sampleRateHz, bandwidthHz: wideBandwidthHz, sampleCount });
      expect(narrowBytes).not.toEqual(wideBytes);

      const toneFrequencyHz = profile === 'am'
        ? ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ
        : ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ;
      const narrowTone = complexToneMagnitude(
        decodeCf32le(narrowBytes).slice(discardedSamples),
        toneFrequencyHz,
        sampleRateHz,
      );
      const wideTone = complexToneMagnitude(
        decodeCf32le(wideBytes).slice(discardedSamples),
        toneFrequencyHz,
        sampleRateHz,
      );
      const expectedRatio = onePoleMagnitude(narrowBandwidthHz, sampleRateHz, toneFrequencyHz)
        / onePoleMagnitude(wideBandwidthHz, sampleRateHz, toneFrequencyHz);

      expect(narrowTone).toBeLessThan(wideTone * 0.03);
      expect(narrowTone / wideTone).toBeCloseTo(expectedRatio, 5);
    }
  });

  it('is deterministic, finite, unit-peak, and bounded at maximum geometry and rate', () => {
    const input = {
      profile: 'fm' as const,
      sampleRateHz: MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
    };
    const first = synthesizeAnalyticComplexIq(input);
    const second = synthesizeAnalyticComplexIq(input);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(first.byteLength).toBe(MAX_ANALYTIC_COMPLEX_IQ_SAMPLES * 8);
    let peak = 0;
    let allFinite = true;
    let allUnitBounded = true;
    const view = new DataView(first.buffer, first.byteOffset, first.byteLength);
    for (let index = 0; index < MAX_ANALYTIC_COMPLEX_IQ_SAMPLES; index += 1) {
      const inPhase = view.getFloat32(index * 8, true);
      const quadrature = view.getFloat32(index * 8 + 4, true);
      allFinite &&= Number.isFinite(inPhase) && Number.isFinite(quadrature);
      const magnitude = Math.hypot(inPhase, quadrature);
      allUnitBounded &&= magnitude <= 1;
      peak = Math.max(peak, magnitude);
    }
    expect(allFinite).toBe(true);
    expect(allUnitBounded).toBe(true);
    expect(peak).toBe(1);
  }, 15_000);

  it('installs deterministic, finite, unit-bounded, non-empty generators for the entire closed profile catalog', () => {
    const hashes = new Set<string>();
    for (const profile of ANALYTIC_COMPLEX_IQ_PROFILES) {
      const input = {
        profile,
        sampleRateHz: 122_880_000,
        bandwidthHz: 122_880_000,
        sampleCount: 1_024,
      };
      const first = synthesizeAnalyticComplexIq(input);
      const second = synthesizeAnalyticComplexIq(input);
      expect(first).toEqual(second);
      expect(first.byteLength).toBe(input.sampleCount * 8);
      const samples = decodeCf32le(first);
      expect(samples.every(([inPhase, quadrature]) => (
        Number.isFinite(inPhase)
        && Number.isFinite(quadrature)
        && Math.hypot(inPhase, quadrature) <= 1
      ))).toBe(true);
      expect(samples.some(([inPhase, quadrature]) => inPhase !== 0 || quadrature !== 0)).toBe(true);
      expect(complexIqGeneratorBasis(profile)).toBe(
        profile === 'cw' || profile === 'am' || profile === 'fm'
          ? 'analytic-laboratory'
          : 'standards-derived-engineering-projection',
      );
      hashes.add(createHash('sha256').update(first).digest('hex'));
    }
    expect(hashes.size).toBe(ANALYTIC_COMPLEX_IQ_PROFILES.length);
  }, 20_000);

  it('rejects every value outside the exact geometry bounds before allocation', () => {
    const valid = {
      profile: 'cw' as AnalyticComplexIqProfile,
      sampleRateHz: MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: 1,
    };
    expect(() => synthesizeAnalyticComplexIq({ ...valid, profile: 'lte-etm1.1' })).not.toThrow();
    expect(() => synthesizeAnalyticComplexIq(valid)).not.toThrow();
    expect(() => synthesizeAnalyticComplexIq({
      ...valid,
      sampleRateHz: MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
    })).not.toThrow();

    for (const sampleCount of [0, MAX_ANALYTIC_COMPLEX_IQ_SAMPLES + 1, Number.MAX_SAFE_INTEGER]) {
      expect(() => synthesizeAnalyticComplexIq({ ...valid, sampleCount })).toThrow(/sample count/i);
    }
    for (const sampleRateHz of [
      MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ - 1,
      MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ + 1,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(() => synthesizeAnalyticComplexIq({ ...valid, sampleRateHz })).toThrow(/sample rate/i);
    }
    for (const bandwidthHz of [
      MIN_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ - 1,
      MAX_ANALYTIC_COMPLEX_IQ_BANDWIDTH_HZ + 1,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(() => synthesizeAnalyticComplexIq({ ...valid, bandwidthHz })).toThrow(/bandwidth/i);
    }
    expect(() => synthesizeAnalyticComplexIq({
      ...valid,
      bandwidthHz: MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ + 1,
    })).toThrow(/may not exceed.*sample rate/i);
  });
});

function decodeCf32le(bytes: Uint8Array): Array<[number, number]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 8 }, (_unused, index) => [
    view.getFloat32(index * 8, true),
    view.getFloat32(index * 8 + 4, true),
  ]);
}

function complexToneMagnitude(
  samples: ReadonlyArray<readonly [number, number]>,
  frequencyHz: number,
  sampleRateHz: number,
): number {
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const [inPhase, quadrature] = samples[index]!;
    const angle = -2 * Math.PI * frequencyHz * index / sampleRateHz;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    real += inPhase * cosine - quadrature * sine;
    imaginary += inPhase * sine + quadrature * cosine;
  }
  return Math.hypot(real, imaginary) / samples.length;
}

function onePoleMagnitude(bandwidthHz: number, sampleRateHz: number, frequencyHz: number): number {
  const sineHalfEdge = Math.sin(Math.PI * bandwidthHz / (2 * sampleRateHz));
  const alpha = 2 * sineHalfEdge / (Math.sqrt(1 + sineHalfEdge * sineHalfEdge) + sineHalfEdge);
  const feedback = 1 - alpha;
  const responseRadians = 2 * Math.PI * frequencyHz / sampleRateHz;
  return alpha / Math.hypot(
    1 - feedback * Math.cos(responseRadians),
    feedback * Math.sin(responseRadians),
  );
}
