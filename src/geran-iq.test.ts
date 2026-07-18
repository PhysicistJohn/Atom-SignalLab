import { describe, expect, it } from 'vitest';
import { waveformCatalog } from './catalog.js';
import {
  DEFAULT_GERAN_IQ_SEED,
  GERAN_COMPLEX_IQ_PROFILES,
  GERAN_FRAME_SECONDS,
  GERAN_HIGHER_ACTIVE_SYMBOLS,
  GERAN_HIGHER_SYMBOL_RATE_HZ,
  GERAN_HIGHER_USEFUL_SYMBOLS,
  GERAN_IQ_DEFINITIONS,
  GERAN_IQ_DISCLOSURE,
  GERAN_IQ_QUALIFICATION,
  GERAN_NORMAL_ACTIVE_SYMBOLS,
  GERAN_NORMAL_SYMBOL_RATE_HZ,
  GERAN_NORMAL_USEFUL_SYMBOLS,
  MAX_GERAN_IQ_BANDWIDTH_HZ,
  MAX_GERAN_IQ_SAMPLE_RATE_HZ,
  MAX_GERAN_IQ_SAMPLES,
  MAX_GERAN_IQ_START_SAMPLE_INDEX,
  MIN_GERAN_IQ_BANDWIDTH_HZ,
  MIN_GERAN_IQ_SAMPLE_RATE_HZ,
  geranIqDefinition,
  isGeranComplexIqProfile,
  synthesizeGeranAnalyticSamples,
  synthesizeGeranComplexIq,
} from './geran-iq.js';

describe('GERAN complex-baseband engineering projection', () => {
  it('covers every and only currently catalogued GERAN profile with descriptor-exact modulation', () => {
    const catalogued = waveformCatalog
      .filter(({ family }) => family === 'geran')
      .map(({ id }) => id)
      .sort();
    expect([...GERAN_COMPLEX_IQ_PROFILES].sort()).toEqual(catalogued);

    for (const profile of GERAN_COMPLEX_IQ_PROFILES) {
      const descriptor = waveformCatalog.find(({ id }) => id === profile)!;
      const definition = geranIqDefinition(profile);
      expect(isGeranComplexIqProfile(profile)).toBe(true);
      expect(definition.profile).toBe(profile);
      expect(definition.modulation).toBe(descriptor.projection.modulation);
      expect(definition.occupiedBandwidthHz).toBe(descriptor.occupiedBandwidthHz);
      expect(definition.qualification).toBe(GERAN_IQ_QUALIFICATION);
      expect(definition.disclosure).toBe(GERAN_IQ_DISCLOSURE);
      expect(definition.disclosure).toMatch(/engineering projection.*not bit-exact.*conformance-validated/i);
    }
    expect(isGeranComplexIqProfile('cw')).toBe(false);
    expect(() => geranIqDefinition('cw')).toThrow(/no GERAN complex-I\/Q/i);
  });

  it('pins normal and higher symbol rates, useful/active windows, and continuous rotations', () => {
    expect(GERAN_IQ_DEFINITIONS['gsm-900-loaded-bcch']).toMatchObject({
      symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
      usefulSymbolPeriods: GERAN_NORMAL_USEFUL_SYMBOLS,
      activeSymbolPeriods: GERAN_NORMAL_ACTIVE_SYMBOLS,
      timingModel: 'continuous-loaded-slots',
      pulseModel: 'gaussian-cpfsk-bt-0.3',
    });
    expect(GERAN_IQ_DEFINITIONS['gsm-normal-burst']).toMatchObject({
      symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
      usefulSymbolPeriods: GERAN_NORMAL_USEFUL_SYMBOLS,
      activeSymbolPeriods: GERAN_NORMAL_ACTIVE_SYMBOLS,
      timingModel: 'one-of-eight-tdma-engineering',
    });
    expect(GERAN_IQ_DEFINITIONS['gsm-8psk-normal-burst'].symbolRotationRadians).toBeCloseTo(3 * Math.PI / 8, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-aqpsk-normal-burst'].symbolRotationRadians).toBeCloseTo(Math.PI / 2, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-qpsk-higher-symbol-rate-burst']).toMatchObject({
      symbolRateHz: GERAN_HIGHER_SYMBOL_RATE_HZ,
      usefulSymbolPeriods: GERAN_HIGHER_USEFUL_SYMBOLS,
      activeSymbolPeriods: GERAN_HIGHER_ACTIVE_SYMBOLS,
    });
    expect(GERAN_IQ_DEFINITIONS['gsm-qpsk-higher-symbol-rate-burst'].symbolRotationRadians).toBeCloseTo(3 * Math.PI / 4, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-16qam-higher-symbol-rate-burst'].symbolRotationRadians).toBeCloseTo(Math.PI / 4, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-32qam-higher-symbol-rate-burst'].symbolRotationRadians).toBeCloseTo(-Math.PI / 4, 14);
  });

  it('is deterministic, seed-sensitive, finite, unit-bounded, and distinct for all seven profiles', () => {
    const outputs = new Map<string, string>();
    for (const profile of GERAN_COMPLEX_IQ_PROFILES) {
      const input = {
        profile,
        sampleRateHz: 1_300_000,
        bandwidthHz: 500_000,
        sampleCount: 4_096,
        seed: DEFAULT_GERAN_IQ_SEED,
      };
      const first = synthesizeGeranComplexIq(input);
      const second = synthesizeGeranComplexIq(input);
      const changed = synthesizeGeranComplexIq({ ...input, seed: DEFAULT_GERAN_IQ_SEED + 1 });
      expect(first).toEqual(second);
      expect(first).not.toEqual(changed);
      expect(first.byteLength).toBe(input.sampleCount * 8);
      const samples = decodeCf32le(first);
      expect(samples.every(([inPhase, quadrature]) => Number.isFinite(inPhase)
        && Number.isFinite(quadrature)
        && Math.hypot(inPhase, quadrature) <= 1)).toBe(true);
      outputs.set(profile, Buffer.from(first).toString('base64'));
    }
    expect(new Set(outputs.values()).size).toBe(GERAN_COMPLEX_IQ_PROFILES.length);
  });

  it('makes loaded GMSK continuous while burst profiles occupy only one bounded slot per frame', () => {
    const sampleRateHz = 1_300_000;
    const frameSamples = Math.round(GERAN_FRAME_SECONDS * sampleRateHz);
    expect(frameSamples).toBe(6_000);
    const loaded = synthesizeGeranAnalyticSamples({
      profile: 'gsm-900-loaded-bcch', sampleRateHz, sampleCount: frameSamples,
    });
    expect(sampleMagnitudes(loaded).every((magnitude) => Math.abs(magnitude - 1) < 1e-12)).toBe(true);

    for (const profile of GERAN_COMPLEX_IQ_PROFILES.filter((candidate) => candidate !== 'gsm-900-loaded-bcch')) {
      const samples = synthesizeGeranAnalyticSamples({ profile, sampleRateHz, sampleCount: frameSamples });
      const magnitudes = sampleMagnitudes(samples);
      const active = magnitudes.filter((magnitude) => magnitude > 1e-10).length;
      expect(active).toBeGreaterThan(650);
      expect(active).toBeLessThan(750);
      expect(magnitudes.slice(750).every((magnitude) => magnitude === 0)).toBe(true);
    }
  });

  it('keeps unfiltered analytic chunks exactly aligned and distinguishes GMSK from rotated 8PSK', () => {
    for (const profile of GERAN_COMPLEX_IQ_PROFILES) {
      const whole = synthesizeGeranAnalyticSamples({
        profile, sampleRateHz: 1_300_000, sampleCount: 1_024, seed: 99,
      });
      const suffix = synthesizeGeranAnalyticSamples({
        profile, sampleRateHz: 1_300_000, sampleCount: 512, seed: 99, startSampleIndex: 512,
      });
      expect(suffix).toEqual(whole.slice(1_024));
    }

    const gmsk = synthesizeGeranAnalyticSamples({
      profile: 'gsm-normal-burst', sampleRateHz: 1_300_000, sampleCount: 700, seed: 7,
    });
    const edge = synthesizeGeranAnalyticSamples({
      profile: 'gsm-8psk-normal-burst', sampleRateHz: 1_300_000, sampleCount: 700, seed: 7,
    });
    expect(gmsk).not.toEqual(edge);
    expect(sampleMagnitudes(gmsk).slice(4, -4).filter((magnitude) => magnitude > 0)
      .every((magnitude) => Math.abs(magnitude - 1) < 1e-12)).toBe(true);
    expect(sampleMagnitudes(edge).some((magnitude) => magnitude > 0 && magnitude < 0.8)).toBe(true);
  });

  it('rejects non-GERAN profiles and every geometry outside the closed producer bounds', () => {
    const valid = {
      profile: 'gsm-normal-burst' as const,
      sampleRateHz: MIN_GERAN_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MIN_GERAN_IQ_BANDWIDTH_HZ,
      sampleCount: 1,
    };
    expect(() => synthesizeGeranComplexIq(valid)).not.toThrow();
    expect(() => synthesizeGeranComplexIq({
      ...valid,
      sampleRateHz: MAX_GERAN_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MAX_GERAN_IQ_BANDWIDTH_HZ,
      sampleCount: MAX_GERAN_IQ_SAMPLES,
    })).not.toThrow();
    expect(() => synthesizeGeranComplexIq({ ...valid, profile: 'cw' })).toThrow(/no GERAN complex-I\/Q/i);
    for (const sampleCount of [0, MAX_GERAN_IQ_SAMPLES + 1, Number.MAX_SAFE_INTEGER]) {
      expect(() => synthesizeGeranComplexIq({ ...valid, sampleCount })).toThrow(/sample count/i);
    }
    for (const sampleRateHz of [MIN_GERAN_IQ_SAMPLE_RATE_HZ - 1, MAX_GERAN_IQ_SAMPLE_RATE_HZ + 1]) {
      expect(() => synthesizeGeranComplexIq({ ...valid, sampleRateHz })).toThrow(/sample rate/i);
    }
    for (const bandwidthHz of [MIN_GERAN_IQ_BANDWIDTH_HZ - 1, MAX_GERAN_IQ_BANDWIDTH_HZ + 1]) {
      expect(() => synthesizeGeranComplexIq({ ...valid, bandwidthHz })).toThrow(/bandwidth/i);
    }
    expect(() => synthesizeGeranComplexIq({ ...valid, bandwidthHz: valid.sampleRateHz + 1 })).toThrow(/may not exceed/i);
    for (const seed of [0, 0x1_0000_0000, 1.5]) {
      expect(() => synthesizeGeranComplexIq({ ...valid, seed })).toThrow(/seed/i);
    }
    for (const startSampleIndex of [-1, 1.5, MAX_GERAN_IQ_START_SAMPLE_INDEX + 1]) {
      expect(() => synthesizeGeranComplexIq({ ...valid, startSampleIndex })).toThrow(/start sample index/i);
    }
    expect(() => synthesizeGeranComplexIq({
      ...valid,
      sampleCount: 2,
      startSampleIndex: MAX_GERAN_IQ_START_SAMPLE_INDEX,
    })).toThrow(/complete output/i);
  }, 20_000);
});

function decodeCf32le(bytes: Uint8Array): Array<[number, number]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 8 }, (_unused, index) => [
    view.getFloat32(index * 8, true),
    view.getFloat32(index * 8 + 4, true),
  ]);
}

function sampleMagnitudes(samples: Float64Array): number[] {
  return Array.from({ length: samples.length / 2 }, (_unused, index) =>
    Math.hypot(samples[index * 2]!, samples[index * 2 + 1]!));
}
