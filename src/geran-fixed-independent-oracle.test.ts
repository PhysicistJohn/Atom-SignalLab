import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GERAN_FIXED_BURST_VECTORS,
  GERAN_GMSK_DUMMY_BURST,
  GERAN_XCCH_NORMAL_BURSTS,
  type GeranFixedBurstProfile,
} from './geran-fixed-bursts.js';
import {
  GERAN_FIXED_CATALOG_BANDWIDTH_HZ,
  GERAN_FIXED_CATALOG_CF32LE_SHA256,
  GERAN_FIXED_CATALOG_FRAME_SAMPLES,
  GERAN_FIXED_CATALOG_PERIOD_FRAMES,
  GERAN_FIXED_CATALOG_PERIOD_SAMPLES,
  GERAN_FIXED_CATALOG_PROFILES,
  GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ,
  encodeGeranFixedCatalogPeriodCf32le,
  synthesizeGeranFixedCatalogIq,
  verifyGeranFixedCatalogPeriodIdentity,
} from './geran-fixed-catalog-iq.js';

const SAMPLES_PER_SLOT = 750;
const NORMAL_SLOT_SYMBOLS = 156.25;
const HIGHER_SLOT_SYMBOLS = 187.5;
const NORMAL_SYMBOL_RATE_HZ = 1_625_000 / 6;
const HIGHER_SYMBOL_RATE_HZ = 325_000;
const INDEPENDENT_COMPONENT_TOLERANCE = 1e-6;

const EXPECTED_ARTIFACT_IDENTITIES = Object.freeze({
  'gsm-900-loaded-bcch':
    '6c1b8392da569af1e7d8466f0bab0fc67a3ad486c37238e737dc3e7aaa00e468',
  'gsm-normal-burst':
    'eeb6cdcc00a228d85a2cea80a31af4250498e035cbd7fa7ef38d82316b4a465b',
  'gsm-qpsk-higher-symbol-rate-burst':
    '467dab110023dc884c8d3de95b88a640cc3beda2f15845e01aaf397dd6772114',
  'gsm-aqpsk-normal-burst':
    'cd51921ed2038c6c2f26bc8f05dd94e19a802030c471594993dac16c568b0ae2',
  'gsm-8psk-normal-burst':
    'a8d02b7c21c1040d02285cf885b02a9d0760ad7a6367aea44c1486c68d99692a',
  'gsm-16qam-higher-symbol-rate-burst':
    'd1ee47875e59ab0619770855ca47e6dc309e7af20e2cb8480152ec2aa9d3232a',
  'gsm-32qam-higher-symbol-rate-burst':
    '26b84953d9299e63a198ca04f0d42d61d89f7e00a4c6e9c512677a8f6b162203',
} as const satisfies Readonly<Record<GeranFixedBurstProfile, string>>);

const EXPECTED_MAXIMUM_COMPONENT_ERRORS = Object.freeze({
  'gsm-900-loaded-bcch': 3.771206870395449e-8,
  'gsm-normal-burst': 3.771206870395449e-8,
  'gsm-qpsk-higher-symbol-rate-burst': 3.9785526745328426e-7,
  'gsm-aqpsk-normal-burst': 2.972557038669065e-7,
  'gsm-8psk-normal-burst': 3.88161570299278e-7,
  'gsm-16qam-higher-symbol-rate-burst': 5.320781412965214e-7,
  'gsm-32qam-higher-symbol-rate-burst': 5.129559149386065e-7,
} as const satisfies Readonly<Record<GeranFixedBurstProfile, number>>);

interface IndependentDefinition {
  readonly modulation: 'gmsk' | 'qpsk' | 'aqpsk' | '8psk' | '16qam' | '32qam';
  readonly bitsPerSymbol: 1 | 2 | 3 | 4 | 5;
  readonly activeSymbols: 148 | 177;
  readonly slotSymbols: 156.25 | 187.5;
  readonly rotationRadiansPerSymbol: number;
}

const INDEPENDENT_DEFINITIONS = Object.freeze({
  'gsm-900-loaded-bcch': Object.freeze({
    modulation: 'gmsk',
    bitsPerSymbol: 1,
    activeSymbols: 148,
    slotSymbols: NORMAL_SLOT_SYMBOLS,
    rotationRadiansPerSymbol: 0,
  }),
  'gsm-normal-burst': Object.freeze({
    modulation: 'gmsk',
    bitsPerSymbol: 1,
    activeSymbols: 148,
    slotSymbols: NORMAL_SLOT_SYMBOLS,
    rotationRadiansPerSymbol: 0,
  }),
  'gsm-qpsk-higher-symbol-rate-burst': Object.freeze({
    modulation: 'qpsk',
    bitsPerSymbol: 2,
    activeSymbols: 177,
    slotSymbols: HIGHER_SLOT_SYMBOLS,
    rotationRadiansPerSymbol: 3 * Math.PI / 4,
  }),
  'gsm-aqpsk-normal-burst': Object.freeze({
    modulation: 'aqpsk',
    bitsPerSymbol: 2,
    activeSymbols: 148,
    slotSymbols: NORMAL_SLOT_SYMBOLS,
    rotationRadiansPerSymbol: Math.PI / 2,
  }),
  'gsm-8psk-normal-burst': Object.freeze({
    modulation: '8psk',
    bitsPerSymbol: 3,
    activeSymbols: 148,
    slotSymbols: NORMAL_SLOT_SYMBOLS,
    rotationRadiansPerSymbol: 3 * Math.PI / 8,
  }),
  'gsm-16qam-higher-symbol-rate-burst': Object.freeze({
    modulation: '16qam',
    bitsPerSymbol: 4,
    activeSymbols: 177,
    slotSymbols: HIGHER_SLOT_SYMBOLS,
    rotationRadiansPerSymbol: Math.PI / 4,
  }),
  'gsm-32qam-higher-symbol-rate-burst': Object.freeze({
    modulation: '32qam',
    bitsPerSymbol: 5,
    activeSymbols: 177,
    slotSymbols: HIGHER_SLOT_SYMBOLS,
    rotationRadiansPerSymbol: -Math.PI / 4,
  }),
} as const satisfies Readonly<Record<GeranFixedBurstProfile, IndependentDefinition>>);

describe('independent GERAN fixed-artifact digital-baseband oracle', () => {
  it('pins the complete four-frame cf32le identity and exact integer geometry', () => {
    expect(GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ).toBe(1_300_000);
    expect(GERAN_FIXED_CATALOG_FRAME_SAMPLES).toBe(6_000);
    expect(GERAN_FIXED_CATALOG_PERIOD_FRAMES).toBe(4);
    expect(GERAN_FIXED_CATALOG_PERIOD_SAMPLES).toBe(24_000);
    expect(GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ * 15 / 26_000)
      .toBe(SAMPLES_PER_SLOT);

    const observed = Object.fromEntries(
      GERAN_FIXED_CATALOG_PROFILES.map((profile) => {
        const period = encodeGeranFixedCatalogPeriodCf32le(profile);
        expect(period).toHaveLength(GERAN_FIXED_CATALOG_PERIOD_SAMPLES * 8);
        return [
          profile,
          createHash('sha256').update(period).digest('hex'),
        ];
      }),
    );
    expect(observed).toEqual(EXPECTED_ARTIFACT_IDENTITIES);
    expect(GERAN_FIXED_CATALOG_CF32LE_SHA256)
      .toEqual(EXPECTED_ARTIFACT_IDENTITIES);
    for (const profile of GERAN_FIXED_CATALOG_PROFILES) {
      expect(verifyGeranFixedCatalogPeriodIdentity(profile))
        .toBe(EXPECTED_ARTIFACT_IDENTITIES[profile]);
    }
  });

  it('independently rederives and compares every component of every artifact sample', () => {
    const maximumErrors = {} as Record<GeranFixedBurstProfile, number>;
    for (const profile of GERAN_FIXED_CATALOG_PROFILES) {
      const bytes = encodeGeranFixedCatalogPeriodCf32le(profile);
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      let maximumError = 0;
      let maximumErrorSample = -1;
      for (let sample = 0;
        sample < GERAN_FIXED_CATALOG_PERIOD_SAMPLES;
        sample += 1) {
        const expected = independentSample(profile, sample);
        const actualInPhase = view.getFloat32(sample * 8, true);
        const actualQuadrature = view.getFloat32(sample * 8 + 4, true);
        const error = Math.max(
          Math.abs(actualInPhase - expected[0]),
          Math.abs(actualQuadrature - expected[1]),
        );
        if (error > maximumError) {
          maximumError = error;
          maximumErrorSample = sample;
        }
      }
      maximumErrors[profile] = maximumError;
      expect(
        maximumError,
        `${profile} maximum independently rederived component error `
          + `${maximumError} at sample ${maximumErrorSample}`,
      ).toBeLessThanOrEqual(INDEPENDENT_COMPONENT_TOLERANCE);
    }
    expect(maximumErrors).toEqual(EXPECTED_MAXIMUM_COMPONENT_ERRORS);
  }, 30_000);

  it.each(GERAN_FIXED_CATALOG_PROFILES)(
    '%s returns exact cyclic slices without filtering or resampling',
    (profile) => {
      const period = encodeGeranFixedCatalogPeriodCf32le(profile);
      const input = {
        profile,
        sampleRateHz: GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: GERAN_FIXED_CATALOG_BANDWIDTH_HZ[profile],
        sampleCount: 509,
        startSampleIndex: GERAN_FIXED_CATALOG_PERIOD_SAMPLES - 211,
      } as const;
      const actual = synthesizeGeranFixedCatalogIq(input);
      expect(actual.subarray(0, 211 * 8))
        .toEqual(period.subarray(-211 * 8));
      expect(actual.subarray(211 * 8))
        .toEqual(period.subarray(0, (509 - 211) * 8));

      const onePeriodLater = synthesizeGeranFixedCatalogIq({
        ...input,
        startSampleIndex:
          input.startSampleIndex + GERAN_FIXED_CATALOG_PERIOD_SAMPLES,
      });
      expect(onePeriodLater).toEqual(actual);
    },
  );

  it.each(GERAN_FIXED_CATALOG_PROFILES)(
    '%s fails closed on changed geometry',
    (profile) => {
      const valid = {
        profile,
        sampleRateHz: GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: GERAN_FIXED_CATALOG_BANDWIDTH_HZ[profile],
        sampleCount: 1,
      } as const;
      expect(() => synthesizeGeranFixedCatalogIq({
        ...valid,
        sampleRateHz: valid.sampleRateHz * 2,
      })).toThrow(/resampling is forbidden/i);
      expect(() => synthesizeGeranFixedCatalogIq({
        ...valid,
        bandwidthHz: valid.bandwidthHz + 1,
      })).toThrow(/filtering is forbidden/i);
    },
  );

  it('keeps all non-GMSK channel coding outside the qualified fixture scope', () => {
    for (const profile of GERAN_FIXED_CATALOG_PROFILES) {
      const vector = GERAN_FIXED_BURST_VECTORS[profile];
      if (profile === 'gsm-900-loaded-bcch' || profile === 'gsm-normal-burst') {
        expect(vector.channelCodingClaim).toBe('pinned-xcch-dummy-frame');
      } else {
        expect(vector.channelCodingClaim).toBe('none-modulator-input-only');
      }
    }
  });
});

/**
 * This oracle intentionally does not import any production modulation helper.
 * It reconstructs the slot schedule, differential GMSK state, Gaussian phase
 * response, TS 45.004 constellation tables/rotations, and c0 pulse equations.
 */
function independentSample(
  profile: GeranFixedBurstProfile,
  sampleIndex: number,
): readonly [number, number] {
  const definition = INDEPENDENT_DEFINITIONS[profile];
  const slotIndex = Math.floor(sampleIndex / SAMPLES_PER_SLOT);
  const sampleWithinSlot = sampleIndex % SAMPLES_PER_SLOT;
  const timeslot = slotIndex % 8;
  const frame = Math.floor(slotIndex / 8);
  let bits: string | undefined;
  if (profile === 'gsm-900-loaded-bcch') {
    bits = timeslot === 0
      ? GERAN_XCCH_NORMAL_BURSTS[frame % 4]!
      : GERAN_GMSK_DUMMY_BURST;
  } else if (timeslot === 0) {
    bits = profile === 'gsm-normal-burst'
      ? GERAN_XCCH_NORMAL_BURSTS[frame % 4]!
      : GERAN_FIXED_BURST_VECTORS[profile].bits;
  }
  if (bits === undefined) return [0, 0];

  const symbolCoordinate =
    sampleWithinSlot * definition.slotSymbols / SAMPLES_PER_SLOT;
  if (symbolCoordinate >= definition.activeSymbols) return [0, 0];

  const baseband = definition.modulation === 'gmsk'
    ? independentGmsk(bits, symbolCoordinate)
    : independentLinearModulation(definition, bits, symbolCoordinate);
  return [baseband[0] * 0.1, baseband[1] * 0.1];
}

function independentGmsk(
  bits: string,
  symbolCoordinate: number,
): readonly [number, number] {
  const center = Math.floor(symbolCoordinate);
  const first = center - 10;
  const last = center + 10;

  // Start from an infinite all-one dummy stream and apply only the finite
  // differential-state corrections introduced by the fixed burst.
  let phaseUnits = first;
  for (let symbol = 0;
    symbol < Math.min(first, bits.length + 1);
    symbol += 1) {
    phaseUnits += independentDifferentialAlpha(bits, symbol) - 1;
  }
  for (let symbol = first; symbol <= last; symbol += 1) {
    phaseUnits += independentDifferentialAlpha(bits, symbol)
      * independentGaussianPhaseResponse(symbolCoordinate - symbol);
  }
  const phase = Math.PI * phaseUnits / 2;
  return [Math.cos(phase), Math.sin(phase)];
}

function independentDifferentialAlpha(bits: string, symbol: number): number {
  if (symbol < 0 || symbol > bits.length) return 1;
  const current = symbol === bits.length ? 1 : Number(bits[symbol]!);
  const previous = symbol === 0 ? 1 : Number(bits[symbol - 1]!);
  return current === previous ? 1 : -1;
}

function independentGaussianPhaseResponse(symbolTime: number): number {
  const sigma = Math.sqrt(Math.log(2)) / (2 * Math.PI * 0.3);
  const high = (symbolTime + 0.5) / sigma;
  const low = (symbolTime - 0.5) / sigma;
  const integrated = sigma
    * (normalIntegralPrimitive(high) - normalIntegralPrimitive(low));
  return Math.max(0, Math.min(1, integrated));
}

function normalIntegralPrimitive(value: number): number {
  return value * independentNormalCdf(value) + normalDensity(value);
}

function independentLinearModulation(
  definition: IndependentDefinition,
  bits: string,
  symbolCoordinate: number,
): readonly [number, number] {
  const normalRate = definition.slotSymbols === NORMAL_SLOT_SYMBOLS;
  const timeScale = normalRate
    ? 1
    : NORMAL_SYMBOL_RATE_HZ / HIGHER_SYMBOL_RATE_HZ;
  const offset = normalRate ? 2 : 2.5;
  let inPhase = 0;
  let quadrature = 0;

  // A full-symbol scan is deliberately structured differently from the
  // production window calculation. The exact compact support rejects all
  // symbols that cannot contribute to this sample.
  for (let symbol = 0; symbol < definition.activeSymbols; symbol += 1) {
    const pulseTime =
      (symbolCoordinate - symbol + offset) * timeScale;
    if (pulseTime < 0 || pulseTime > 5) continue;
    const pulse = independentLinearizedGmskPulse(pulseTime);
    const state = independentSymbolState(
      bits,
      symbol,
      definition.bitsPerSymbol,
    );
    const mapped = independentConstellation(definition.modulation, state);
    const angle = definition.rotationRadiansPerSymbol * symbol;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    inPhase += (mapped[0] * cosine - mapped[1] * sine) * pulse;
    quadrature += (mapped[0] * sine + mapped[1] * cosine) * pulse;
  }
  return [inPhase, quadrature];
}

function independentLinearizedGmskPulse(time: number): number {
  if (time < 0 || time > 5) return 0;
  let result = 1;
  for (let shift = 0; shift < 4; shift += 1) {
    result *= independentS(time + shift);
  }
  return Math.max(0, result);
}

function independentS(time: number): number {
  if (time < 0 || time > 8) return 0;
  return time <= 4
    ? Math.sin(Math.PI * independentGaussianGIntegral(time))
    : Math.sin(
      Math.PI / 2
        - Math.PI * independentGaussianGIntegral(time - 4),
    );
}

function independentGaussianGIntegral(time: number): number {
  const scale = 2 * Math.PI * 0.3 / Math.sqrt(Math.log(2));
  const integral = 0.5 * (
    independentQIntegral(time, 2.5, scale)
      - independentQIntegral(time, 1.5, scale)
  );
  return Math.max(0, Math.min(0.5, integral));
}

function independentQIntegral(
  upper: number,
  center: number,
  scale: number,
): number {
  const upperValue = scale * (upper - center);
  const lowerValue = -scale * center;
  return (
    independentQPrimitive(upperValue)
      - independentQPrimitive(lowerValue)
  ) / scale;
}

function independentQPrimitive(value: number): number {
  return value * (1 - independentNormalCdf(value)) - normalDensity(value);
}

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

function normalDensity(value: number): number {
  return Math.exp(-value * value / 2) / Math.sqrt(2 * Math.PI);
}

function independentSymbolState(
  bits: string,
  symbol: number,
  bitsPerSymbol: number,
): number {
  let state = 0;
  const firstBit = symbol * bitsPerSymbol;
  for (let bit = 0; bit < bitsPerSymbol; bit += 1) {
    state = state * 2 + Number(bits[firstBit + bit]!);
  }
  return state;
}

function independentConstellation(
  modulation: IndependentDefinition['modulation'],
  state: number,
): readonly [number, number] {
  switch (modulation) {
    case 'gmsk':
      throw new Error('GMSK does not use the memoryless constellation oracle');
    case 'qpsk':
    case 'aqpsk': {
      const scale = Math.SQRT1_2;
      return [
        state < 2 ? scale : -scale,
        state % 2 === 0 ? scale : -scale,
      ];
    }
    case '8psk': {
      const tableParameter = [3, 4, 2, 1, 6, 5, 7, 0][state]!;
      const phase = Math.PI * tableParameter / 4;
      return [Math.cos(phase), Math.sin(phase)];
    }
    case '16qam': {
      const bits = state.toString(2).padStart(4, '0');
      const inPhase =
        (bits[0] === '0' ? 1 : -1) * (bits[2] === '0' ? 1 : 3);
      const quadrature =
        (bits[1] === '0' ? 1 : -1) * (bits[3] === '0' ? 1 : 3);
      return [inPhase / Math.sqrt(10), quadrature / Math.sqrt(10)];
    }
    case '32qam': {
      const point = INDEPENDENT_32QAM_TABLE[state]!;
      return [point[0] / Math.sqrt(20), point[1] / Math.sqrt(20)];
    }
  }
}

const INDEPENDENT_32QAM_TABLE = Object.freeze([
  [-3, -5], [-1, -5], [-3, 5], [-1, 5],
  [-5, -3], [-5, -1], [-5, 3], [-5, 1],
  [-1, -3], [-1, -1], [-1, 3], [-1, 1],
  [-3, -3], [-3, -1], [-3, 3], [-3, 1],
  [3, -5], [1, -5], [3, 5], [1, 5],
  [5, -3], [5, -1], [5, 3], [5, 1],
  [1, -3], [1, -1], [1, 3], [1, 1],
  [3, -3], [3, -1], [3, 3], [3, 1],
] as const);
