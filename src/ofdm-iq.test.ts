import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { waveformCatalog, waveformDescriptor } from './catalog.js';
import type { SynthesizedSignalProfile, WaveformDescriptor } from './contracts.js';
import {
  MAX_REPRESENTATIVE_OFDM_TONES,
  MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ,
  MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLES,
  MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ,
  MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ,
  STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE,
  STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES,
  STANDARDS_ENGINEERING_COMPLEX_IQ_QUALIFICATION,
  isStandardsEngineeringComplexIqProfile,
  projectStandardsEngineeringComplexIqConfiguration,
  standardsEngineeringComplexIqConfiguration,
  synthesizeStandardsEngineeringComplexIq,
} from './ofdm-iq.js';

describe('standards engineering complex-I/Q projection', () => {
  it('covers the exact closed LTE, NR, and WLAN catalog without qualification promotion', () => {
    const catalogProfiles = waveformCatalog
      .filter((descriptor) => descriptor.family === 'e-utra' || descriptor.family === 'nr' || descriptor.family === 'wlan')
      .map((descriptor) => descriptor.id);

    expect(STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES).toEqual(catalogProfiles);
    expect(STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES).toHaveLength(25);
    for (const profile of STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES) {
      expect(isStandardsEngineeringComplexIqProfile(profile)).toBe(true);
      expect(waveformDescriptor(profile).qualification).toBe('standards-derived');
      const configuration = standardsEngineeringComplexIqConfiguration(profile);
      expect(configuration.qualification).toBe(STANDARDS_ENGINEERING_COMPLEX_IQ_QUALIFICATION);
      expect(configuration.disclosure).toBe(STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE);
      expect(configuration.representativeToneCount).toBeLessThanOrEqual(MAX_REPRESENTATIVE_OFDM_TONES);
    }
    expect(isStandardsEngineeringComplexIqProfile('cw')).toBe(false);
    expect(STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE).toMatch(/not protocol-decodable I\/Q/i);
    expect(STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE).toMatch(/not evidence of standards conformance/i);
    expect(STANDARDS_ENGINEERING_COMPLEX_IQ_DISCLOSURE).toMatch(/alias projection, not a reconstruction/i);
  });

  it('derives RB grids, WLAN tone counts, modulation, allocation, duplex, and timing from descriptors', () => {
    expect(standardsEngineeringComplexIqConfiguration('lte-band3-fdd-20m')).toMatchObject({
      family: 'e-utra',
      nominalResourceBlocks: 100,
      subcarrierSpacingHz: 15_000,
      occupiedToneCount: 1_200,
      representativeToneCount: 32,
      duplex: 'fdd',
      timingModel: 'continuous-engineering-symbol-texture',
    });
    expect(standardsEngineeringComplexIqConfiguration('lte-band38-tdd-10m')).toMatchObject({
      nominalResourceBlocks: 50,
      occupiedToneCount: 600,
      duplex: 'tdd',
      timingModel: 'lte-tdd-config0-ssp7-normal-cp-downlink-v1',
    });
    expect(standardsEngineeringComplexIqConfiguration('lte-ntm')).toMatchObject({
      allocation: 'narrowband',
      modulation: 'qpsk',
      nominalResourceBlocks: 1,
      occupiedToneCount: 12,
      representativeToneCount: 12,
    });
    expect(standardsEngineeringComplexIqConfiguration('nr-n78-tdd-100m')).toMatchObject({
      family: 'nr',
      nominalResourceBlocks: 273,
      subcarrierSpacingHz: 30_000,
      occupiedToneCount: 3_276,
      duplex: 'tdd',
      timingModel: 'nr-tdd-7dl-3ul-engineering-v1',
    });
    expect(standardsEngineeringComplexIqConfiguration('wifi-ofdm-20m')).toMatchObject({
      family: 'wlan',
      subcarrierSpacingHz: 312_500,
      occupiedToneCount: 52,
      timingModel: 'wlan-six-of-ten-millisecond-engineering-burst-v1',
    });
    expect(standardsEngineeringComplexIqConfiguration('wifi6-he-su')).toMatchObject({
      allocation: 'full',
      modulation: 'he-ofdm',
      subcarrierSpacingHz: 78_125,
      occupiedToneCount: 242,
    });
    expect(standardsEngineeringComplexIqConfiguration('wifi6-he-er-su')).toMatchObject({
      allocation: 'resource-unit',
      occupiedToneCount: 106,
    });
    expect(standardsEngineeringComplexIqConfiguration('wifi6-he-mu')).toMatchObject({
      allocation: 'multi-ru',
      occupiedToneCount: 242,
    });
    expect(standardsEngineeringComplexIqConfiguration('wifi-hr-dsss-11m')).toMatchObject({
      modulation: 'hr-dsss',
      chipRateHz: 11_000_000,
      representativeToneCount: 1,
      timingModel: 'wlan-six-of-ten-millisecond-engineering-burst-v1',
    });
  });

  it('is deterministic, finite, unit-bounded, nonzero, and profile-distinct at the admitted 1 Msps floor', () => {
    const digests = new Map<string, SynthesizedSignalProfile>();
    for (const profile of STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES) {
      const input = {
        profile,
        sampleRateHz: MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ,
        bandwidthHz: MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ,
        sampleCount: 1_024,
      };
      const first = synthesizeStandardsEngineeringComplexIq(input);
      const second = synthesizeStandardsEngineeringComplexIq(input);
      expect(first).toEqual(second);
      expect(first.byteLength).toBe(input.sampleCount * 8);
      const metrics = sampleMetrics(first);
      expect(metrics.allFinite).toBe(true);
      expect(metrics.peakMagnitude).toBeLessThanOrEqual(1);
      expect(metrics.meanPower).toBeGreaterThan(0);

      const digest = createHash('sha256').update(first).digest('hex');
      expect(digests.get(digest), `${profile} must not substitute another profile's bytes`).toBeUndefined();
      digests.set(digest, profile);
    }
    expect(digests.size).toBe(STANDARDS_ENGINEERING_COMPLEX_IQ_PROFILES.length);
  });

  it('honors the pinned LTE/NR downlink phases and declared WLAN burst phase', () => {
    const sampleRateHz = 1_000_000;
    const capture = (profile: SynthesizedSignalProfile, startSample: number) => synthesizeStandardsEngineeringComplexIq({
      profile,
      sampleRateHz,
      bandwidthHz: sampleRateHz,
      sampleCount: 256,
      startSample,
    });

    expect(sampleMetrics(capture('lte-band38-tdd-10m', 0)).meanPower).toBeGreaterThan(0);
    expect(sampleMetrics(capture('lte-band38-tdd-10m', 2_200)).meanPower).toBe(0);
    expect(sampleMetrics(capture('lte-band3-fdd-20m', 2_200)).meanPower).toBeGreaterThan(0);

    expect(sampleMetrics(capture('nr-n78-tdd-100m', 0)).meanPower).toBeGreaterThan(0);
    expect(sampleMetrics(capture('nr-n78-tdd-100m', 4_000)).meanPower).toBe(0);
    expect(sampleMetrics(capture('nr-n3-fdd-20m', 4_000)).meanPower).toBeGreaterThan(0);

    expect(sampleMetrics(capture('wifi-ofdm-20m', 0)).meanPower).toBeGreaterThan(0);
    expect(sampleMetrics(capture('wifi-ofdm-20m', 7_000)).meanPower).toBe(0);
    expect(sampleMetrics(capture('wifi-hr-dsss-11m', 0)).meanPower).toBeGreaterThan(0);
    expect(sampleMetrics(capture('wifi-hr-dsss-11m', 7_000)).meanPower).toBe(0);
  });

  it('remains bounded at maximum geometry without allocating a full NR grid or IFFT', () => {
    const bytes = synthesizeStandardsEngineeringComplexIq({
      profile: 'nr-n78-tdd-100m',
      sampleRateHz: MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ,
      sampleCount: MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLES,
    });
    expect(bytes.byteLength).toBe(MAX_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLES * 8);
    expect(standardsEngineeringComplexIqConfiguration('nr-n78-tdd-100m').representativeToneCount).toBe(32);
    const metrics = sampleMetrics(bytes);
    expect(metrics.allFinite).toBe(true);
    expect(metrics.peakMagnitude).toBeLessThanOrEqual(1);
    expect(metrics.meanPower).toBeGreaterThan(0);
  }, 15_000);

  it('applies the independent requested low-pass bandwidth deterministically', () => {
    const common = {
      profile: 'wifi6-he-su' as const,
      sampleRateHz: 20_000_000,
      sampleCount: 8_192,
    };
    const narrow = synthesizeStandardsEngineeringComplexIq({ ...common, bandwidthHz: 10_000 });
    const wide = synthesizeStandardsEngineeringComplexIq({ ...common, bandwidthHz: common.sampleRateHz });
    expect(narrow).not.toEqual(wide);
    expect(sampleMetrics(narrow).meanPower).toBeLessThan(sampleMetrics(wide).meanPower);
  });

  it('rejects non-standards profiles, invalid geometry, and descriptor drift before allocation', () => {
    const valid = {
      profile: 'lte-etm1.1' as SynthesizedSignalProfile,
      sampleRateHz: MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_SAMPLE_RATE_HZ,
      bandwidthHz: MIN_STANDARDS_ENGINEERING_COMPLEX_IQ_BANDWIDTH_HZ,
      sampleCount: 1,
    };
    expect(() => synthesizeStandardsEngineeringComplexIq(valid)).not.toThrow();
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, profile: 'cw' })).toThrow(/no standards engineering complex-I\/Q projection/i);
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, sampleRateHz: 999_999 })).toThrow(/sample rate/i);
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, bandwidthHz: 999 })).toThrow(/bandwidth/i);
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, bandwidthHz: 1_000_001 })).toThrow(/may not exceed/i);
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, sampleCount: 0 })).toThrow(/sample count/i);
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, sampleCount: 65_537 })).toThrow(/sample count/i);
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, startSample: -1 })).toThrow(/start sample/i);
    expect(() => synthesizeStandardsEngineeringComplexIq({ ...valid, sampleCount: 2, startSample: Number.MAX_SAFE_INTEGER })).toThrow(/start sample/i);

    expect(() => projectStandardsEngineeringComplexIqConfiguration(waveformDescriptor('cw'))).toThrow(/no standards engineering/i);
    const drifted = structuredClone(waveformDescriptor('lte-etm1.1')) as WaveformDescriptor;
    delete (drifted.projection as { subcarrierSpacingHz?: number }).subcarrierSpacingHz;
    expect(() => projectStandardsEngineeringComplexIqConfiguration(drifted)).toThrow(/subcarrier spacing/i);
  });
});

function sampleMetrics(bytes: Uint8Array): {
  allFinite: boolean;
  peakMagnitude: number;
  meanPower: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let allFinite = true;
  let peakMagnitude = 0;
  let totalPower = 0;
  for (let byteOffset = 0; byteOffset < bytes.byteLength; byteOffset += 8) {
    const inPhase = view.getFloat32(byteOffset, true);
    const quadrature = view.getFloat32(byteOffset + 4, true);
    allFinite &&= Number.isFinite(inPhase) && Number.isFinite(quadrature);
    const power = inPhase * inPhase + quadrature * quadrature;
    totalPower += power;
    peakMagnitude = Math.max(peakMagnitude, Math.sqrt(power));
  }
  return { allFinite, peakMagnitude, meanPower: totalPower / (bytes.byteLength / 8) };
}
