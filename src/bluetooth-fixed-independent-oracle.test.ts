import { describe, expect, it } from 'vitest';
import {
  BLUETOOTH_ANALYTIC_IQ_MODELS,
  BLUETOOTH_ANALYTIC_IQ_PROFILES,
  BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
  BLUETOOTH_BR_DH1_FIXED_VECTOR,
  BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR,
  type BluetoothAnalyticIqProfile,
} from './bluetooth-iq.js';
import {
  BLUETOOTH_FIXED_CAPTURE_SAMPLES,
  BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256,
  BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ,
  BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ,
  encodeBluetoothFixedCaptureCf32le,
  synthesizeBluetoothFixedCatalogIq,
  verifyBluetoothFixedCaptureIdentity,
} from './bluetooth-fixed-catalog-iq.js';

const SYMBOL_RATE_HZ = 1_000_000;
const SAMPLES_PER_SYMBOL =
  BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ / SYMBOL_RATE_HZ;
const GAUSSIAN_BT = 0.5;
const GAUSSIAN_SIGMA_SYMBOLS =
  Math.sqrt(Math.log(2)) / (2 * Math.PI * GAUSSIAN_BT);

describe('independent fixed Bluetooth digital-baseband oracle', () => {
  it.each(BLUETOOTH_ANALYTIC_IQ_PROFILES)(
    '%s pins the complete fixed capture and exact clean replay geometry',
    (profile) => {
      const capture = encodeBluetoothFixedCaptureCf32le(profile);
      expect(capture).toHaveLength(BLUETOOTH_FIXED_CAPTURE_SAMPLES[profile] * 8);
      expect(verifyBluetoothFixedCaptureIdentity(profile)).toBe(
        BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256[profile],
      );

      const replay = synthesizeBluetoothFixedCatalogIq({
        profile,
        sampleRateHz: BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ,
        sampleCount: 257,
        startSampleIndex: 123,
      });
      expect(replay).toEqual(capture.subarray(123 * 8, (123 + 257) * 8));
    },
  );

  it.each(BLUETOOTH_ANALYTIC_IQ_PROFILES)(
    '%s matches an independently structured BT=0.5 GFSK oracle at every active sample',
    (profile) => {
      const actual = decodeCf32le(encodeBluetoothFixedCaptureCf32le(profile));
      const expected = independentGfskCapture(profile);
      expect(actual).toHaveLength(expected.length);
      let maximumComponentError = 0;
      let maximumErrorIndex = -1;
      for (let index = 0; index < actual.length; index += 1) {
        const error = Math.max(
          Math.abs(actual[index]![0] - expected[index]![0]),
          Math.abs(actual[index]![1] - expected[index]![1]),
        );
        if (error > maximumComponentError) {
          maximumComponentError = error;
          maximumErrorIndex = index;
        }
      }
      expect(
        maximumComponentError,
        `${profile} maximum independent GFSK component error ${maximumComponentError} at sample ${maximumErrorIndex}`,
      ).toBeLessThanOrEqual(2e-5);
    },
    20_000,
  );

  it('meets the Core 6.3 BR and LE 1M digital modulation bounds by construction and measurement', () => {
    const cases = [
      {
        profile: 'bluetooth-classic-connected',
        modulationIndex: 0.32,
        minimumIndex: 0.28,
        maximumIndex: 0.35,
        frequencyDeviationHz: 160_000,
        minimumAlternatingDeviationHz: 115_000,
        minimumAlternatingRatio: 0.8,
      },
      {
        profile: 'bluetooth-le-advertising',
        modulationIndex: 0.5,
        minimumIndex: 0.45,
        maximumIndex: 0.55,
        frequencyDeviationHz: 250_000,
        minimumAlternatingDeviationHz: 185_000,
        minimumAlternatingRatio: 0.8,
      },
    ] as const;

    for (const requirement of cases) {
      const model = BLUETOOTH_ANALYTIC_IQ_MODELS[requirement.profile];
      expect(model.symbolRateHz).toBe(SYMBOL_RATE_HZ);
      expect(model.gaussianBt).toBe(GAUSSIAN_BT);
      expect(model.modulationIndex).toBe(requirement.modulationIndex);
      expect(model.modulationIndex).toBeGreaterThanOrEqual(requirement.minimumIndex);
      expect(model.modulationIndex).toBeLessThanOrEqual(requirement.maximumIndex);
      expect(model.frequencyDeviationHz).toBe(requirement.frequencyDeviationHz);

      // The unit-area BT=0.5 Gaussian response to an indefinitely alternating
      // NRZ sequence is periodic. Measure it at the bit center with a
      // separately evaluated closed form, not through production code.
      const alternatingNormalizedDeviation = Math.abs(
        independentNormalizedGfskFrequency(
          [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
          5.5,
        ),
      );
      const alternatingDeviationHz =
        alternatingNormalizedDeviation * requirement.frequencyDeviationHz;
      expect(alternatingNormalizedDeviation).toBeGreaterThanOrEqual(
        requirement.minimumAlternatingRatio,
      );
      expect(alternatingDeviationHz).toBeGreaterThanOrEqual(
        requirement.minimumAlternatingDeviationHz,
      );
    }
  });

  it.each(BLUETOOTH_ANALYTIC_IQ_PROFILES)(
    '%s rejects resampling, filtering, and invented recurrence',
    (profile) => {
      const valid = {
        profile,
        sampleRateHz: BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ,
        sampleCount: 1,
      } as const;
      expect(() => synthesizeBluetoothFixedCatalogIq({
        ...valid,
        sampleRateHz: valid.sampleRateHz / 2,
      })).toThrow(/resampling is forbidden/i);
      expect(() => synthesizeBluetoothFixedCatalogIq({
        ...valid,
        bandwidthHz: 2_000_000,
      })).toThrow(/filtering is forbidden/i);

      expect(() => synthesizeBluetoothFixedCatalogIq({
        ...valid,
        sampleCount: 64,
        startSampleIndex: BLUETOOTH_FIXED_CAPTURE_SAMPLES[profile],
      })).toThrow(/content-bound capture/i);
      expect(() => synthesizeBluetoothFixedCatalogIq({
        ...valid,
        sampleCount: 2,
        startSampleIndex: BLUETOOTH_FIXED_CAPTURE_SAMPLES[profile] - 1,
      })).toThrow(/content-bound capture/i);
    },
  );
});

function independentGfskCapture(
  profile: BluetoothAnalyticIqProfile,
): Array<readonly [number, number]> {
  const br = profile === 'bluetooth-classic-connected';
  const bits = br
    ? BLUETOOTH_BR_DH1_FIXED_VECTOR.transmissionBits
    : BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.transmissionBits;
  const model = BLUETOOTH_ANALYTIC_IQ_MODELS[profile];
  const carrierOffsetHz =
    model.channelCenterHz - BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ;
  const result: Array<readonly [number, number]> = [];
  let phase = 0;
  for (let sample = 0;
    sample < BLUETOOTH_FIXED_CAPTURE_SAMPLES[profile];
    sample += 1) {
    if (sample >= bits.length * SAMPLES_PER_SYMBOL) {
      result.push([0, 0]);
      continue;
    }
    result.push(unitCf32(phase));
    const symbolCoordinate = (sample + 0.5) / SAMPLES_PER_SYMBOL;
    const normalized = independentNormalizedGfskFrequency(
      bits,
      symbolCoordinate,
    );
    phase = wrapPhase(
      phase + 2 * Math.PI
        * (carrierOffsetHz + model.frequencyDeviationHz * normalized)
        / BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ,
    );
  }
  return result;
}

function independentNormalizedGfskFrequency(
  bits: readonly number[],
  symbolCoordinate: number,
): number {
  let numerator = 0;
  let denominator = 0;
  const nearest = Math.floor(symbolCoordinate);
  for (let symbol = nearest - 9; symbol <= nearest + 9; symbol += 1) {
    const left = (symbolCoordinate - symbol - 1) / GAUSSIAN_SIGMA_SYMBOLS;
    const right = (symbolCoordinate - symbol) / GAUSSIAN_SIGMA_SYMBOLS;
    const weight = independentNormalCdf(right) - independentNormalCdf(left);
    const bounded = Math.max(0, Math.min(bits.length - 1, symbol));
    numerator += (bits[bounded] === 0 ? -1 : 1) * weight;
    denominator += weight;
  }
  return numerator / denominator;
}

// Numerical Recipes' erfc approximation is intentionally distinct from the
// production Abramowitz-Stegun polynomial.
function independentNormalCdf(value: number): number {
  const scaled = value / Math.SQRT2;
  const magnitude = Math.abs(scaled);
  const t = 1 / (1 + 0.5 * magnitude);
  const tau = t * Math.exp(
    -magnitude * magnitude
    - 1.26551223
    + t * (1.00002368
      + t * (0.37409196
        + t * (0.09678418
          + t * (-0.18628806
            + t * (0.27886807
              + t * (-1.13520398
                + t * (1.48851587
                  + t * (-0.82215223 + t * 0.17087277)))))))),
  );
  const erf = scaled >= 0 ? 1 - tau : tau - 1;
  return 0.5 * (1 + erf);
}

function unitCf32(phase: number): readonly [number, number] {
  let inPhase = Math.fround(Math.cos(phase));
  let quadrature = Math.fround(Math.sin(phase));
  const magnitudeSquared = inPhase * inPhase + quadrature * quadrature;
  if (magnitudeSquared > 1) {
    const scale = (1 - 2 ** -23) / Math.sqrt(magnitudeSquared);
    inPhase = Math.fround(inPhase * scale);
    quadrature = Math.fround(quadrature * scale);
  }
  return [inPhase, quadrature];
}

function wrapPhase(phase: number): number {
  return phase - 2 * Math.PI * Math.floor(phase / (2 * Math.PI));
}

function decodeCf32le(bytes: Uint8Array): Array<readonly [number, number]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 8 }, (_unused, sample) => [
    view.getFloat32(sample * 8, true),
    view.getFloat32(sample * 8 + 4, true),
  ]);
}
