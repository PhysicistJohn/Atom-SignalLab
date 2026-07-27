import { describe, expect, it } from 'vitest';
import { waveformDescriptor } from './catalog.js';
import {
  DEFAULT_REFERENCE_IQ_SEED,
  REFERENCE_COMPLEX_IQ_PROFILES,
  REFERENCE_NOMINAL_RRC_SUPPORT_HZ,
  REFERENCE_RRC_ROLLOFF,
  REFERENCE_RRC_SPAN_SYMBOLS,
  REFERENCE_SNR_DB,
  REFERENCE_SYMBOL_RATE_HZ,
  referenceConstellationPoint,
  referenceConstellationSize,
  referenceRootRaisedCosineImpulse,
  referenceRootRaisedCosinePowerNormalization,
  synthesizeReferenceAnalyticSamples,
  type ReferenceComplexIqProfile,
} from './reference-iq.js';

const SAMPLE_RATE_HZ = 56_000_000;
const POWER_SAMPLE_COUNT = 65_536;
const TRANSMIT_SCALE = 0.25;

describe('reference constellation mathematical oracle', () => {
  it('pins every state of all five direct-index laboratory mappings', () => {
    const expectedSizes: Readonly<Record<ReferenceComplexIqProfile, number>> = {
      'ref-qpsk': 4,
      'ref-8psk': 8,
      'ref-16qam': 16,
      'ref-64qam': 64,
      'ref-256qam': 256,
    };

    for (const profile of REFERENCE_COMPLEX_IQ_PROFILES) {
      const size = expectedSizes[profile];
      expect(referenceConstellationSize(profile), profile).toBe(size);
      const observed = Array.from({ length: size }, (_unused, state) =>
        referenceConstellationPoint(profile, state));

      expect(new Set(observed.map(([inPhase, quadrature]) =>
        `${inPhase.toPrecision(17)},${quadrature.toPrecision(17)}`)).size, profile)
        .toBe(size);

      for (let state = 0; state < size; state += 1) {
        const expected = independentConstellationPoint(profile, state);
        const actual = observed[state]!;
        expect(actual[0], `${profile} state ${state} I`).toBeCloseTo(expected[0], 15);
        expect(actual[1], `${profile} state ${state} Q`).toBeCloseTo(expected[1], 15);
      }

      const averagePower = observed.reduce(
        (total, [inPhase, quadrature]) =>
          total + inPhase * inPhase + quadrature * quadrature,
        0,
      ) / size;
      expect(averagePower, `${profile} average constellation power`)
        .toBeCloseTo(1, 14);
      expect(() => referenceConstellationPoint(profile, -1)).toThrow(/state/i);
      expect(() => referenceConstellationPoint(profile, size)).toThrow(/state/i);
      expect(() => referenceConstellationPoint(profile, 0.5)).toThrow(/state/i);
    }
  });

  it('keeps square-QAM axis indexing explicitly natural rather than Gray coded', () => {
    const stateOne = referenceConstellationPoint('ref-16qam', 1);
    const stateTwo = referenceConstellationPoint('ref-16qam', 2);
    expect(stateOne[0]).toBeCloseTo(-1 / Math.sqrt(10), 15);
    expect(stateTwo[0]).toBeCloseTo(1 / Math.sqrt(10), 15);
    // Natural binary indices 01 -> 10 change two label bits while advancing
    // one adjacent amplitude level. This is intentionally not Gray labeling.
    expect(bitDifference(1, 2)).toBe(2);
  });
});

describe('reference root-raised-cosine mathematical oracle', () => {
  it('pins nominal support, roll-off, finite span, symmetry, and removable singularities', () => {
    const beta = REFERENCE_RRC_ROLLOFF;
    const singularTau = 1 / (4 * beta);
    const expectedAtZero = 1 - beta + 4 * beta / Math.PI;
    const expectedAtSingularity = beta / Math.SQRT2 * (
      (1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * beta))
      + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * beta))
    );

    expect(REFERENCE_SYMBOL_RATE_HZ).toBe(7_000_000);
    expect(beta).toBe(0.35);
    expect(REFERENCE_RRC_SPAN_SYMBOLS).toBe(8);
    expect(REFERENCE_NOMINAL_RRC_SUPPORT_HZ).toBe(9_450_000);
    for (const profile of REFERENCE_COMPLEX_IQ_PROFILES) {
      expect(waveformDescriptor(profile).occupiedBandwidthHz, profile)
        .toBe(REFERENCE_NOMINAL_RRC_SUPPORT_HZ);
    }

    expect(referenceRootRaisedCosineImpulse(0, beta))
      .toBeCloseTo(expectedAtZero, 15);
    expect(referenceRootRaisedCosineImpulse(singularTau, beta))
      .toBeCloseTo(expectedAtSingularity, 15);
    expect(referenceRootRaisedCosineImpulse(-singularTau, beta))
      .toBeCloseTo(expectedAtSingularity, 15);
    for (const tau of [0.01, 0.25, 0.5, 1.25, 3.75, 7.9]) {
      expect(referenceRootRaisedCosineImpulse(tau, beta))
        .toBeCloseTo(independentRootRaisedCosine(tau, beta), 15);
      expect(referenceRootRaisedCosineImpulse(-tau, beta))
        .toBeCloseTo(independentRootRaisedCosine(-tau, beta), 15);
      expect(referenceRootRaisedCosineImpulse(tau, beta))
        .toBeCloseTo(referenceRootRaisedCosineImpulse(-tau, beta), 15);
    }

    expect(() => referenceRootRaisedCosineImpulse(Number.NaN, beta))
      .toThrow(/time coordinate/i);
    expect(() => referenceRootRaisedCosineImpulse(0, 0))
      .toThrow(/roll-off/i);
    expect(() => referenceRootRaisedCosinePowerNormalization(beta, 0))
      .toThrow(/span/i);
  });

  it('normalizes the truncated RRC pulse to unit time-averaged symbol power', () => {
    const beta = REFERENCE_RRC_ROLLOFF;
    const span = REFERENCE_RRC_SPAN_SYMBOLS;
    const normalization =
      referenceRootRaisedCosinePowerNormalization(beta, span);
    const phaseCount = 4_096;
    let totalPower = 0;

    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phase = phaseIndex / phaseCount;
      let phasePower = 0;
      for (let symbol = -span - 1; symbol <= span + 1; symbol += 1) {
        const tau = phase - symbol;
        if (Math.abs(tau) > span) continue;
        const pulse = normalization
          * independentRootRaisedCosine(tau, beta);
        phasePower += pulse * pulse;
      }
      totalPower += phasePower;
    }

    expect(Math.abs(totalPower / phaseCount - 1)).toBeLessThan(3e-6);
  });
});

describe('reference seeded synthesis mathematical oracle', () => {
  it('measures the declared clean power and intrinsic 40 dB complex-AWGN SNR for all five references', { timeout: 60_000 }, () => {
    for (const profile of REFERENCE_COMPLEX_IQ_PROFILES) {
      const common = {
        profile,
        sampleRateHz: SAMPLE_RATE_HZ,
        sampleCount: POWER_SAMPLE_COUNT,
        seed: DEFAULT_REFERENCE_IQ_SEED,
      } as const;
      const clean = synthesizeReferenceAnalyticSamples({
        ...common,
        includeIntrinsicNoise: false,
      });
      const noisy = synthesizeReferenceAnalyticSamples({
        ...common,
        includeIntrinsicNoise: true,
      });
      const signalPower = complexPower(clean);
      const noisePower = complexDifferencePower(noisy, clean);
      const measuredSnrDb = 10 * Math.log10(signalPower / noisePower);

      expect(signalPower / (TRANSMIT_SCALE ** 2), `${profile} shaped power`)
        .toBeCloseTo(1, 1);
      expect(measuredSnrDb, `${profile} intrinsic SNR`)
        .toBeCloseTo(REFERENCE_SNR_DB, 1);
    }
  });

  it('is bit-identical on repeat and across arbitrary streaming chunk boundaries', { timeout: 60_000 }, () => {
    const firstChunkSamples = 137;
    const secondChunkSamples = 251;
    for (const profile of REFERENCE_COMPLEX_IQ_PROFILES) {
      const common = {
        profile,
        sampleRateHz: SAMPLE_RATE_HZ,
        seed: 0x5eed_1234,
        includeIntrinsicNoise: true,
      } as const;
      const complete = synthesizeReferenceAnalyticSamples({
        ...common,
        sampleCount: firstChunkSamples + secondChunkSamples,
      });
      const repeated = synthesizeReferenceAnalyticSamples({
        ...common,
        sampleCount: firstChunkSamples + secondChunkSamples,
      });
      const first = synthesizeReferenceAnalyticSamples({
        ...common,
        sampleCount: firstChunkSamples,
      });
      const second = synthesizeReferenceAnalyticSamples({
        ...common,
        startSampleIndex: firstChunkSamples,
        sampleCount: secondChunkSamples,
      });
      const joined = new Float64Array(complete.length);
      joined.set(first);
      joined.set(second, first.length);

      expect(repeated, `${profile} repeated synthesis`).toEqual(complete);
      expect(joined, `${profile} streamed synthesis`).toEqual(complete);
    }
  });
});

function independentConstellationPoint(
  profile: ReferenceComplexIqProfile,
  state: number,
): readonly [number, number] {
  if (profile === 'ref-qpsk') {
    return [
      (state & 1 ? -1 : 1) / Math.sqrt(2),
      (state & 2 ? -1 : 1) / Math.sqrt(2),
    ];
  }
  if (profile === 'ref-8psk') {
    const angle = 2 * Math.PI * state / 8;
    return [Math.cos(angle), Math.sin(angle)];
  }

  const size = {
    'ref-16qam': 16,
    'ref-64qam': 64,
    'ref-256qam': 256,
  }[profile];
  const levelsPerAxis = Math.sqrt(size);
  const bitsPerAxis = Math.log2(levelsPerAxis);
  const axisMask = levelsPerAxis - 1;
  const scale = 1 / Math.sqrt(2 * (levelsPerAxis ** 2 - 1) / 3);
  const level = (index: number): number =>
    2 * index - (levelsPerAxis - 1);
  return [
    scale * level(state & axisMask),
    scale * level((state >> bitsPerAxis) & axisMask),
  ];
}

function bitDifference(left: number, right: number): number {
  let difference = left ^ right;
  let count = 0;
  while (difference !== 0) {
    count += difference & 1;
    difference >>>= 1;
  }
  return count;
}

function independentRootRaisedCosine(tau: number, beta: number): number {
  if (tau === 0) return 1 - beta + 4 * beta / Math.PI;
  if (Math.abs(4 * beta * tau) === 1) {
    return beta / Math.SQRT2 * (
      (1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * beta))
      + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * beta))
    );
  }
  return (
    Math.sin(Math.PI * tau * (1 - beta))
    + 4 * beta * tau * Math.cos(Math.PI * tau * (1 + beta))
  ) / (
    Math.PI * tau * (1 - (4 * beta * tau) ** 2)
  );
}

function complexPower(samples: Float64Array): number {
  let total = 0;
  for (let index = 0; index < samples.length; index += 2) {
    total += samples[index]! ** 2 + samples[index + 1]! ** 2;
  }
  return total / (samples.length / 2);
}

function complexDifferencePower(
  left: Float64Array,
  right: Float64Array,
): number {
  expect(left.length).toBe(right.length);
  let total = 0;
  for (let index = 0; index < left.length; index += 2) {
    const differenceInPhase = left[index]! - right[index]!;
    const differenceQuadrature = left[index + 1]! - right[index + 1]!;
    total += differenceInPhase ** 2 + differenceQuadrature ** 2;
  }
  return total / (left.length / 2);
}
