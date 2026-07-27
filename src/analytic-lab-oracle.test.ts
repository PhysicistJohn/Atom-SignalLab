import { describe, expect, it } from 'vitest';
import { requireConformanceValidated, waveformDescriptor } from './catalog.js';
import {
  ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ,
  ANALYTIC_IQ_AM_MODULATION_INDEX,
  ANALYTIC_IQ_FM_DEVIATION_HZ,
  ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ,
  LAB_ANALYTIC_COMPLEX_IQ_PROFILES,
  analyticLaboratorySample,
  complexIqGeneratorBasis,
  type LabAnalyticComplexIqProfile,
} from './complex-iq.js';
import { REFERENCE_COMPLEX_IQ_PROFILES } from './reference-iq.js';

const ORACLE_SAMPLE_RATE_HZ = 20_000_000;
const ORACLE_SAMPLES_PER_PERIOD =
  ORACLE_SAMPLE_RATE_HZ / ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ;

describe('analytic laboratory source equations', () => {
  it('implements CW as the exact pre-filter mathematical line', () => {
    for (const timeSeconds of [-1.25, 0, 1 / 7, 123.456]) {
      expect(analyticLaboratorySample('cw', timeSeconds)).toEqual([1, 0]);
    }
    expect(() => analyticLaboratorySample('cw', Number.NaN)).toThrow(/time must be finite/i);
  });

  it('implements normalized DSB full-carrier AM with independently measured carrier and sidebands', () => {
    const modulationPeriodSeconds = 1 / ANALYTIC_IQ_AM_MODULATION_FREQUENCY_HZ;
    const maximum = analyticLaboratorySample('am', 0);
    const midscale = analyticLaboratorySample('am', modulationPeriodSeconds / 4);
    const minimum = analyticLaboratorySample('am', modulationPeriodSeconds / 2);
    const expectedMidscale = 1 / (1 + ANALYTIC_IQ_AM_MODULATION_INDEX);
    const expectedMinimum =
      (1 - ANALYTIC_IQ_AM_MODULATION_INDEX) / (1 + ANALYTIC_IQ_AM_MODULATION_INDEX);

    expect(maximum).toEqual([1, 0]);
    expect(midscale[0]).toBeCloseTo(expectedMidscale, 14);
    expect(midscale[1]).toBe(0);
    expect(minimum[0]).toBeCloseTo(expectedMinimum, 14);
    expect(minimum[1]).toBe(0);
    expect(expectedMinimum).toBeGreaterThan(0); // modulation index 0.72 does not overmodulate.

    const samples = onePeriod('am');
    const carrierAmplitude = magnitude(discreteCoefficient(samples, 0));
    const upperSidebandAmplitude = magnitude(discreteCoefficient(samples, 1));
    const lowerSidebandAmplitude = magnitude(discreteCoefficient(samples, -1));
    const expectedCarrierAmplitude = 1 / (1 + ANALYTIC_IQ_AM_MODULATION_INDEX);
    const expectedSidebandAmplitude =
      ANALYTIC_IQ_AM_MODULATION_INDEX / (2 * (1 + ANALYTIC_IQ_AM_MODULATION_INDEX));
    const expectedSidebandDbc =
      10 * Math.log10(ANALYTIC_IQ_AM_MODULATION_INDEX ** 2 / 4);

    expect(carrierAmplitude).toBeCloseTo(expectedCarrierAmplitude, 12);
    expect(upperSidebandAmplitude).toBeCloseTo(expectedSidebandAmplitude, 12);
    expect(lowerSidebandAmplitude).toBeCloseTo(expectedSidebandAmplitude, 12);
    expect(20 * Math.log10(upperSidebandAmplitude / carrierAmplitude))
      .toBeCloseTo(expectedSidebandDbc, 10);
    for (const harmonic of [-4, -3, -2, 2, 3, 4]) {
      expect(magnitude(discreteCoefficient(samples, harmonic))).toBeLessThan(1e-12);
    }
  });

  it('implements constant-envelope sinusoidal FM with beta 3, ±75 kHz deviation, and Bessel coefficients', () => {
    const samples = onePeriod('fm');
    for (const [inPhase, quadrature] of samples) {
      expect(Math.hypot(inPhase, quadrature)).toBeCloseTo(1, 13);
    }

    const instantaneousFrequencyHz = samples.slice(1).map(([inPhase, quadrature], index) => {
      const [previousInPhase, previousQuadrature] = samples[index]!;
      const productReal =
        inPhase * previousInPhase + quadrature * previousQuadrature;
      const productImaginary =
        quadrature * previousInPhase - inPhase * previousQuadrature;
      return Math.atan2(productImaginary, productReal)
        * ORACLE_SAMPLE_RATE_HZ / (2 * Math.PI);
    });
    expect(Math.abs(Math.max(...instantaneousFrequencyHz) - ANALYTIC_IQ_FM_DEVIATION_HZ))
      .toBeLessThan(2);
    expect(Math.abs(Math.min(...instantaneousFrequencyHz) + ANALYTIC_IQ_FM_DEVIATION_HZ))
      .toBeLessThan(2);

    const beta =
      ANALYTIC_IQ_FM_DEVIATION_HZ / ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ;
    expect(beta).toBe(3);
    expect(2 * (
      ANALYTIC_IQ_FM_DEVIATION_HZ + ANALYTIC_IQ_FM_MODULATION_FREQUENCY_HZ
    )).toBe(200_000);
    for (let order = 0; order <= 8; order += 1) {
      expect(magnitude(discreteCoefficient(samples, order)))
        .toBeCloseTo(Math.abs(independentBesselJ(order, beta)), 10);
    }
  });
});

describe('analytic laboratory qualification policy', () => {
  const profiles = [
    ...LAB_ANALYTIC_COMPLEX_IQ_PROFILES,
    ...REFERENCE_COMPLEX_IQ_PROFILES,
  ] as const;

  it('keeps exactly the eight mathematical profiles outside standards conformance', () => {
    expect(profiles).toEqual([
      'cw', 'am', 'fm',
      'ref-qpsk', 'ref-8psk', 'ref-16qam', 'ref-64qam', 'ref-256qam',
    ]);
    for (const profile of profiles) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor.qualification, profile).toBe('visual');
      expect(descriptor.source.organization, profile).toBe('TinySA SignalLab');
      expect(descriptor.assetSha256, profile).toBeUndefined();
      expect(descriptor.disclosure, profile)
        .toMatch(/standards-conformance status is N\/A/i);
      expect(complexIqGeneratorBasis(profile), profile).toBe('analytic-laboratory');
      expect(() => requireConformanceValidated(profile), profile)
        .toThrow(/visual.*conformance-validated I\/Q asset is not installed/i);
    }
  });

  it('pins truthful operator labels and detailed reference disclosures', () => {
    expect(waveformDescriptor('cw').label).toBe('Unmodulated CW analytic lab stimulus');
    expect(waveformDescriptor('am').label).toBe('DSB full-carrier AM analytic lab stimulus');
    expect(waveformDescriptor('fm').label).toBe('Single-tone FM analytic lab stimulus');

    for (const profile of REFERENCE_COMPLEX_IQ_PROFILES) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor.label).toMatch(/analytic lab reference/i);
      expect(descriptor.model).toMatch(/intrinsic seeded AWGN 40 dB/i);
      expect(descriptor.model).not.toMatch(/\bclean\b/i);
      expect(descriptor.occupiedBandwidthHz).toBe(9_450_000);
      expect(descriptor.disclosure)
        .toMatch(/direct symbol-state indexing.*natural, non-Gray.*7 Msym\/s.*beta 0\.35.*±8 symbols.*intrinsic seeded complex AWGN at 40 dB SNR/i);
      expect(descriptor.disclosure)
        .toMatch(/9\.45 MHz.*nominal raised-cosine support.*not measured, 99%-power, necessary, or regulatory occupied bandwidth/i);
    }
  });
});

function onePeriod(
  profile: LabAnalyticComplexIqProfile,
): ReadonlyArray<readonly [number, number]> {
  return Array.from({ length: ORACLE_SAMPLES_PER_PERIOD }, (_unused, index) =>
    analyticLaboratorySample(profile, index / ORACLE_SAMPLE_RATE_HZ));
}

function discreteCoefficient(
  samples: ReadonlyArray<readonly [number, number]>,
  harmonic: number,
): readonly [number, number] {
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const [inPhase, quadrature] = samples[index]!;
    const angle = -2 * Math.PI * harmonic * index / samples.length;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    real += inPhase * cosine - quadrature * sine;
    imaginary += inPhase * sine + quadrature * cosine;
  }
  return [real / samples.length, imaginary / samples.length];
}

function magnitude(value: readonly [number, number]): number {
  return Math.hypot(value[0], value[1]);
}

/** Integer-order J_n(x), evaluated independently from the production kernel. */
function independentBesselJ(order: number, argument: number): number {
  let factorial = 1;
  for (let value = 2; value <= order; value += 1) factorial *= value;
  let term = (argument / 2) ** order / factorial;
  let sum = term;
  for (let index = 1; index < 80; index += 1) {
    term *= -(argument * argument / 4) / (index * (order + index));
    sum += term;
    if (Math.abs(term) < 1e-18) break;
  }
  return sum;
}
