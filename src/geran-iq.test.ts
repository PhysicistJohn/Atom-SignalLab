import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { waveformCatalog } from './catalog.js';
import {
  GERAN_8PSK_NORMAL_BURST,
  GERAN_8PSK_TSC0,
  GERAN_AQPSK_NORMAL_BURST,
  GERAN_DUMMY_MIXED_BITS,
  GERAN_FIXED_BURST_VECTORS,
  GERAN_GMSK_DUMMY_BURST,
  GERAN_GMSK_DUMMY_BURST_SHA256,
  GERAN_GMSK_TSC0_SET1,
  GERAN_GMSK_TSC0_SET2,
  GERAN_HIGHER_16QAM_BURST,
  GERAN_HIGHER_16QAM_TSC0,
  GERAN_HIGHER_32QAM_BURST,
  GERAN_HIGHER_32QAM_TSC0,
  GERAN_HIGHER_QPSK_BURST,
  GERAN_HIGHER_QPSK_TSC0,
  GERAN_LIBOSMOCORE_ORACLE,
  GERAN_XCCH_EB_BITS,
  GERAN_XCCH_NORMAL_BURSTS,
  GERAN_XCCH_NORMAL_BURST_SHA256,
  geranScheduledBurst,
} from './geran-fixed-bursts.js';
import {
  DEFAULT_GERAN_IQ_SEED,
  GERAN_AQPSK_ALPHA_RADIANS,
  GERAN_CF32_WIRE_SCALE,
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
  geranConstellationPoint,
  geranIqDefinition,
  geranLinearizedGmskPulse,
  geranRotatedConstellationPoint,
  geranSymbolState,
  isGeranComplexIqProfile,
  synthesizeGeranAnalyticSamples,
  synthesizeGeranComplexIq,
  type GeranIqModulation,
} from './geran-iq.js';

const EXPECTED_XCCH_EB_BITS = [
  '10000001000010000000010000000000000000000010100001000000111010000100000010000001000000101000010100000000000001000000',
  '00000001001000000001000000001000000100001010000100000000011000000100000010000101000000000000000000001000000000001000',
  '00000000001000000001000010000000000000101000010100001010011001000000101000000001001010000000000000100000010100001000',
  '01010000001000000000000010000001000000000000000000001000011000010010000000010000001000000001000000000001000000000000',
] as const;

const EXPECTED_VECTOR_HASHES = {
  'gsm-900-loaded-bcch': '214f926e6a302ba5ddfce7aad66055c0ea49db7f7fd002a2b988f55bb239044e',
  'gsm-normal-burst': '214f926e6a302ba5ddfce7aad66055c0ea49db7f7fd002a2b988f55bb239044e',
  'gsm-qpsk-higher-symbol-rate-burst': '089781fd4c1ce505c7dffb8ce4a5ec26a788a8bb0b1c94b3a11d8c4de6457a72',
  'gsm-aqpsk-normal-burst': 'e658442c4f50a49546fe1c64b2b4c232c5a6ff94b3355be8758ce1993cca0ad6',
  'gsm-8psk-normal-burst': '0ed4adae27afa5d6676da3db08e47adf649422d0a8ee2b9a15f474359ace58e1',
  'gsm-16qam-higher-symbol-rate-burst': 'c5c8051deb7358208f8791038b1af33dde68e7773ea64467e18e37a872e6b89b',
  'gsm-32qam-higher-symbol-rate-burst': 'b46c7e5c3352086bc0c51f3f820c62c03ddea38c7a85540946523b002f54cb89',
} as const;

describe('GERAN fixed digital bursts and analytic engineering projection', () => {
  it('covers every catalogued GERAN profile and states the fail-closed qualification boundary', () => {
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
    }
    expect(GERAN_IQ_DISCLOSURE).toMatch(/seed-invariant.*content-addressed/i);
    expect(GERAN_IQ_DISCLOSURE).toMatch(/unpromoted.*no TS 45\.003 channel-coding claim/i);
    expect(GERAN_IQ_DISCLOSURE).toMatch(/not calibrated RF.*product qualification/i);
    expect(GERAN_IQ_DEFINITIONS['gsm-normal-burst'].digitalValidation)
      .toBe('libosmocore-xcch-encode-decode-oracle');
    for (const profile of GERAN_COMPLEX_IQ_PROFILES.slice(2)) {
      expect(GERAN_IQ_DEFINITIONS[profile].digitalValidation)
        .toBe('ts-equation-and-symbol-roundtrip-only-unpromoted');
    }
    expect(isGeranComplexIqProfile('cw')).toBe(false);
    expect(() => geranIqDefinition('cw')).toThrow(/no GERAN complex-I\/Q/i);
  });

  it('pins Release 19 symbol rates, active geometry, rotations, and exact pulse models', () => {
    expect(GERAN_IQ_DEFINITIONS['gsm-900-loaded-bcch']).toMatchObject({
      symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
      usefulSymbolPeriods: GERAN_NORMAL_USEFUL_SYMBOLS,
      activeSymbolPeriods: GERAN_NORMAL_ACTIVE_SYMBOLS,
      timingModel: 'fixed-normal-and-dummy-every-slot',
      pulseModel: 'gaussian-cpfsk-bt-0.3-ts-45.004',
    });
    expect(GERAN_IQ_DEFINITIONS['gsm-normal-burst']).toMatchObject({
      symbolRateHz: GERAN_NORMAL_SYMBOL_RATE_HZ,
      usefulSymbolPeriods: GERAN_NORMAL_USEFUL_SYMBOLS,
      activeSymbolPeriods: GERAN_NORMAL_ACTIVE_SYMBOLS,
      timingModel: 'fixed-ts0-one-of-eight',
    });
    expect(GERAN_IQ_DEFINITIONS['gsm-qpsk-higher-symbol-rate-burst']).toMatchObject({
      symbolRateHz: GERAN_HIGHER_SYMBOL_RATE_HZ,
      usefulSymbolPeriods: GERAN_HIGHER_USEFUL_SYMBOLS,
      activeSymbolPeriods: GERAN_HIGHER_ACTIVE_SYMBOLS,
      pulseModel: 'linearised-gmsk-c0-ts-45.004-numerical',
    });
    expect(GERAN_IQ_DEFINITIONS['gsm-8psk-normal-burst'].symbolRotationRadians)
      .toBeCloseTo(3 * Math.PI / 8, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-aqpsk-normal-burst'].symbolRotationRadians)
      .toBeCloseTo(Math.PI / 2, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-qpsk-higher-symbol-rate-burst'].symbolRotationRadians)
      .toBeCloseTo(3 * Math.PI / 4, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-16qam-higher-symbol-rate-burst'].symbolRotationRadians)
      .toBeCloseTo(Math.PI / 4, 14);
    expect(GERAN_IQ_DEFINITIONS['gsm-32qam-higher-symbol-rate-burst'].symbolRotationRadians)
      .toBeCloseTo(-Math.PI / 4, 14);
    expect(GERAN_CF32_WIRE_SCALE).toBe(0.1);
  });

  it('matches independent libosmocore xCCH output and exact TS 45.002 field boundaries', () => {
    expect(GERAN_LIBOSMOCORE_ORACLE).toMatchObject({
      commit: 'a9ea438f2d3ee85167bc7ec90ae3c010e47ded92',
      testOutputSha256: '41ec1663f121fb5ad98a6210222a484e4c890be144859e025cfddbe4172e4514',
      l2DummyFrameHex: '0303010000000000000000000000000000000000000000',
    });
    expect(GERAN_XCCH_EB_BITS).toEqual(EXPECTED_XCCH_EB_BITS);
    for (let index = 0; index < EXPECTED_XCCH_EB_BITS.length; index += 1) {
      const eB = EXPECTED_XCCH_EB_BITS[index]!;
      expect(eB).toHaveLength(116);
      const expectedPhysical = `000${eB.slice(0, 58)}00100101110000100010010111${eB.slice(58)}000`;
      expect(GERAN_XCCH_NORMAL_BURSTS[index]).toBe(expectedPhysical);
      expect(GERAN_XCCH_NORMAL_BURST_SHA256[index]).toBe(sha256(expectedPhysical));
    }

    expect(GERAN_GMSK_TSC0_SET1).toBe('00100101110000100010010111');
    expect(GERAN_GMSK_TSC0_SET2).toBe('01100010001001001111010111');
    expect(GERAN_GMSK_DUMMY_BURST).toBe(`000${GERAN_DUMMY_MIXED_BITS}000`);
    expect(GERAN_DUMMY_MIXED_BITS).toHaveLength(142);
    expect(GERAN_GMSK_DUMMY_BURST).toHaveLength(148);
    expect(GERAN_GMSK_DUMMY_BURST_SHA256).toBe(sha256(GERAN_GMSK_DUMMY_BURST));

    expect(GERAN_8PSK_TSC0)
      .toBe('111111001111111001111001001001111111111111001111111111001111111001111001001001');
    expect(GERAN_HIGHER_QPSK_TSC0)
      .toBe('00110000110000001100111111111111110000110011111111000011111100');
    expect(GERAN_HIGHER_16QAM_TSC0).toHaveLength(124);
    expect(GERAN_HIGHER_32QAM_TSC0).toHaveLength(155);

    assertFields(GERAN_8PSK_NORMAL_BURST, 9, 174, GERAN_8PSK_TSC0, 444, '111111111');
    assertFields(GERAN_HIGHER_QPSK_BURST, 8, 138, GERAN_HIGHER_QPSK_TSC0, 354, '00011110');
    assertFields(GERAN_HIGHER_16QAM_BURST, 16, 276, GERAN_HIGHER_16QAM_TSC0, 708, '0001011001101101');
    assertFields(GERAN_HIGHER_32QAM_BURST, 20, 345, GERAN_HIGHER_32QAM_TSC0, 885, '11110111100111001110');

    const aqpskA = deinterleave(GERAN_AQPSK_NORMAL_BURST, 0);
    const aqpskB = deinterleave(GERAN_AQPSK_NORMAL_BURST, 1);
    expect(aqpskA).toBe(GERAN_XCCH_NORMAL_BURSTS[0]);
    expect(aqpskB.slice(0, 61)).toBe(aqpskA.slice(0, 61));
    expect(aqpskB.slice(61, 87)).toBe(GERAN_GMSK_TSC0_SET2);
    expect(aqpskB.slice(87)).toBe(aqpskA.slice(87));
    expect(GERAN_AQPSK_NORMAL_BURST).toHaveLength(296);

    for (const profile of GERAN_COMPLEX_IQ_PROFILES) {
      const vector = GERAN_FIXED_BURST_VECTORS[profile];
      expect(vector.bits).toHaveLength(vector.activeSymbols * vector.bitsPerSymbol);
      expect(vector.bitSha256).toBe(EXPECTED_VECTOR_HASHES[profile]);
      expect(vector.bitSha256).toBe(sha256(vector.bits));
    }
  });

  it('retains an internally consistent, explicit oracle evidence artifact', () => {
    const evidence = JSON.parse(readFileSync(
      new URL('../validation/geran-libosmocore-oracle-2026-07-27.json', import.meta.url),
      'utf8',
    )) as {
      result: string;
      oracle: Record<string, string>;
      transmissionOrderBitSha256: Record<string, string>;
      qualification: Record<string, string>;
      qualificationBoundary: Record<string, string>;
    };
    expect(evidence.result).toBe('pass-with-explicit-unpromoted-profiles');
    expect(evidence.oracle.sourceCommitSha).toBe(GERAN_LIBOSMOCORE_ORACLE.commit);
    expect(evidence.oracle.codingSourceSha256).toBe(GERAN_LIBOSMOCORE_ORACLE.codingSourceSha256);
    expect(evidence.oracle.mappingSourceSha256).toBe(GERAN_LIBOSMOCORE_ORACLE.mappingSourceSha256);
    expect(evidence.oracle.testSourceSha256).toBe(GERAN_LIBOSMOCORE_ORACLE.testSourceSha256);
    expect(evidence.oracle.testOutputSha256).toBe(GERAN_LIBOSMOCORE_ORACLE.testOutputSha256);
    expect(evidence.transmissionOrderBitSha256.xcchNormalBurst0)
      .toBe(GERAN_XCCH_NORMAL_BURST_SHA256[0]);
    expect(evidence.transmissionOrderBitSha256.gmskDummyBurst)
      .toBe(GERAN_GMSK_DUMMY_BURST_SHA256);
    expect(evidence.transmissionOrderBitSha256.higher32qam)
      .toBe(EXPECTED_VECTOR_HASHES['gsm-32qam-higher-symbol-rate-burst']);
    expect(evidence.qualification['gsm-32qam-higher-symbol-rate-burst']).toMatch(/^unpromoted/);
    expect(evidence.qualificationBoundary.statement).toMatch(/not TS 45\.005 RF conformance/i);
  });

  it('uses xCCH normal bursts in TS0 and exact dummy bursts in TS1 through TS7', () => {
    for (let frameIndex = 0; frameIndex < 4; frameIndex += 1) {
      const normal = geranScheduledBurst('gsm-900-loaded-bcch', frameIndex * 8)!;
      expect(normal).toMatchObject({
        timeslot: 0,
        frameIndex,
        kind: 'normal-xcch',
        bits: GERAN_XCCH_NORMAL_BURSTS[frameIndex],
        bitSha256: GERAN_XCCH_NORMAL_BURST_SHA256[frameIndex],
      });
      for (let timeslot = 1; timeslot < 8; timeslot += 1) {
        expect(geranScheduledBurst('gsm-900-loaded-bcch', frameIndex * 8 + timeslot))
          .toMatchObject({
            timeslot,
            frameIndex,
            kind: 'dummy',
            bits: GERAN_GMSK_DUMMY_BURST,
            bitSha256: GERAN_GMSK_DUMMY_BURST_SHA256,
          });
      }
    }
    for (const profile of GERAN_COMPLEX_IQ_PROFILES.slice(1)) {
      expect(geranScheduledBurst(profile, 0)).toBeDefined();
      for (let timeslot = 1; timeslot < 8; timeslot += 1) {
        expect(geranScheduledBurst(profile, timeslot)).toBeUndefined();
      }
    }
    expect(() => geranScheduledBurst('gsm-normal-burst', -1)).toThrow(/non-negative/);
    expect(() => geranScheduledBurst('gsm-normal-burst', 1.5)).toThrow(/safe integer/);
  });

  it('matches every TS 45.004 constellation state and independently decodes every fixed symbol', () => {
    const modulations = ['qpsk', 'aqpsk', '8psk', '16qam', '32qam'] as const;
    for (const modulation of modulations) {
      const expected = expectedConstellation(modulation);
      for (let state = 0; state < expected.length; state += 1) {
        expectPoint(geranConstellationPoint(modulation, state), expected[state]!);
        expect(nearestState(modulation, geranConstellationPoint(modulation, state))).toBe(state);
      }
      expect(() => geranConstellationPoint(modulation, -1)).toThrow(/symbol state/);
      expect(() => geranConstellationPoint(modulation, expected.length)).toThrow(/symbol state/);
    }
    expect(GERAN_AQPSK_ALPHA_RADIANS).toBeCloseTo(Math.PI / 4, 15);

    for (const profile of GERAN_COMPLEX_IQ_PROFILES.slice(2)) {
      const vector = GERAN_FIXED_BURST_VECTORS[profile];
      const modulation = GERAN_IQ_DEFINITIONS[profile].modulation as Exclude<GeranIqModulation, 'gmsk'>;
      for (let symbolIndex = 0; symbolIndex < vector.activeSymbols; symbolIndex += 1) {
        const state = geranSymbolState(vector.bits, symbolIndex, vector.bitsPerSymbol);
        const point = geranConstellationPoint(modulation, state);
        expect(nearestState(modulation, point)).toBe(state);
      }
    }
  });

  it('applies each exact continuous symbol rotation without changing constellation radius', () => {
    const profiles = GERAN_COMPLEX_IQ_PROFILES.slice(2);
    for (const profile of profiles) {
      const definition = GERAN_IQ_DEFINITIONS[profile];
      const modulation = definition.modulation as Exclude<GeranIqModulation, 'gmsk'>;
      const base = geranConstellationPoint(modulation, 0);
      for (let symbolIndex = 0; symbolIndex < 16; symbolIndex += 1) {
        const actual = geranRotatedConstellationPoint(
          profile as Exclude<
            typeof profile,
            'gsm-900-loaded-bcch' | 'gsm-normal-burst'
          >,
          0,
          symbolIndex,
        );
        const angle = definition.symbolRotationRadians * symbolIndex;
        const expected: readonly [number, number] = [
          base[0] * Math.cos(angle) - base[1] * Math.sin(angle),
          base[0] * Math.sin(angle) + base[1] * Math.cos(angle),
        ];
        expectPoint(actual, expected, 2e-14);
        expect(Math.hypot(...actual)).toBeCloseTo(Math.hypot(...base), 13);
      }
    }
  });

  it('evaluates the TS 45.004 c0 equation against an independent normal-Q calculation', () => {
    // Values independently evaluated with Python math.erfc from the published
    // Q-function/product equations, not copied from this TypeScript function.
    const independent = [
      [0, 0],
      [0.25, 4.4736882082083753e-5],
      [0.5, 7.1852986875681972e-4],
      [1, 3.1456109894283345e-2],
      [1.5, 2.60396328150095e-1],
      [2, 7.0565753784144969e-1],
      [2.5, 9.2679571122461268e-1],
      [3, 7.0574369389635849e-1],
      [3.5, 2.6051841302147866e-1],
      [4, 3.1546283470789881e-2],
      [4.5, 7.5067260930507869e-4],
      [4.75, 5.7924989837185405e-5],
      [5, 3.8513546394572101e-6],
    ] as const;
    for (const [normalizedTime, expected] of independent) {
      expect(geranLinearizedGmskPulse(normalizedTime)).toBeCloseTo(expected, 6);
    }
    expect(geranLinearizedGmskPulse(-Number.EPSILON)).toBe(0);
    expect(geranLinearizedGmskPulse(5.000001)).toBe(0);
    expect(() => geranLinearizedGmskPulse(Number.NaN)).toThrow(/must be finite/);
  });

  it('is seed-invariant, finite, unit-bounded, profile-distinct and chunk-exact', () => {
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
      const changedSeed = synthesizeGeranComplexIq({ ...input, seed: DEFAULT_GERAN_IQ_SEED + 1 });
      expect(first).toEqual(second);
      expect(first).toEqual(changedSeed);
      expect(first.byteLength).toBe(input.sampleCount * 8);
      const samples = decodeCf32le(first);
      expect(samples.every(([inPhase, quadrature]) => Number.isFinite(inPhase)
        && Number.isFinite(quadrature)
        && Math.hypot(inPhase, quadrature) <= 1)).toBe(true);
      outputs.set(profile, Buffer.from(first).toString('base64'));

      const whole = synthesizeGeranAnalyticSamples({
        profile, sampleRateHz: 1_300_000, sampleCount: 1_024,
      });
      const suffix = synthesizeGeranAnalyticSamples({
        profile, sampleRateHz: 1_300_000, sampleCount: 512, startSampleIndex: 512,
      });
      expect(suffix).toEqual(whole.slice(1_024));
    }
    expect(new Set(outputs.values()).size).toBe(GERAN_COMPLEX_IQ_PROFILES.length);
  });

  it('renders the loaded normal/dummy schedule in all slots and other profiles only in TS0', () => {
    const sampleRateHz = 1_300_000;
    const frameSamples = Math.round(GERAN_FRAME_SECONDS * sampleRateHz);
    expect(frameSamples).toBe(6_000);
    const loaded = synthesizeGeranAnalyticSamples({
      profile: 'gsm-900-loaded-bcch', sampleRateHz, sampleCount: frameSamples,
    });
    const loadedMagnitudes = sampleMagnitudes(loaded);
    for (let timeslot = 0; timeslot < 8; timeslot += 1) {
      expect(loadedMagnitudes[timeslot * 750 + 100]).toBeCloseTo(GERAN_CF32_WIRE_SCALE, 14);
      expect(loadedMagnitudes[timeslot * 750 + 740]).toBe(0);
    }

    for (const profile of GERAN_COMPLEX_IQ_PROFILES.slice(1)) {
      const samples = synthesizeGeranAnalyticSamples({ profile, sampleRateHz, sampleCount: frameSamples });
      const magnitudes = sampleMagnitudes(samples);
      expect(magnitudes.slice(0, 711).some((magnitude) => magnitude > 0)).toBe(true);
      expect(magnitudes.slice(750).every((magnitude) => magnitude === 0)).toBe(true);
    }
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
    expect(() => synthesizeGeranComplexIq({ ...valid, bandwidthHz: valid.sampleRateHz + 1 }))
      .toThrow(/may not exceed/i);
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

function assertFields(
  burst: string,
  tailLength: number,
  encryptedLength: number,
  training: string,
  expectedLength: number,
  tail: string,
): void {
  expect(burst).toHaveLength(expectedLength);
  expect(burst.slice(0, tailLength)).toBe(tail);
  expect(burst.slice(-tailLength)).toBe(tail);
  expect(burst.slice(tailLength, tailLength + encryptedLength)).toBe('0'.repeat(encryptedLength));
  expect(burst.slice(tailLength + encryptedLength, tailLength + encryptedLength + training.length))
    .toBe(training);
  expect(burst.slice(tailLength + encryptedLength + training.length, -tailLength))
    .toBe('0'.repeat(encryptedLength));
}

function expectedConstellation(
  modulation: Exclude<GeranIqModulation, 'gmsk'>,
): ReadonlyArray<readonly [number, number]> {
  switch (modulation) {
    case 'qpsk':
      return [
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ].map(([i, q]) => [i! / Math.sqrt(2), q! / Math.sqrt(2)] as const);
    case 'aqpsk': {
      const c = Math.cos(Math.PI / 4);
      const s = Math.sin(Math.PI / 4);
      return [[c, s], [c, -s], [-c, s], [-c, -s]];
    }
    case '8psk':
      return [3, 4, 2, 1, 6, 5, 7, 0]
        .map((index) => [Math.cos(index * Math.PI / 4), Math.sin(index * Math.PI / 4)] as const);
    case '16qam': {
      const result: Array<readonly [number, number]> = [];
      for (let state = 0; state < 16; state += 1) {
        const i = (state >= 8 ? -1 : 1) * (state & 2 ? 3 : 1);
        const q = (state & 4 ? -1 : 1) * (state & 1 ? 3 : 1);
        result.push([i / Math.sqrt(10), q / Math.sqrt(10)]);
      }
      return result;
    }
    case '32qam':
      return [
        [-3, -5], [-1, -5], [-3, 5], [-1, 5], [-5, -3], [-5, -1], [-5, 3], [-5, 1],
        [-1, -3], [-1, -1], [-1, 3], [-1, 1], [-3, -3], [-3, -1], [-3, 3], [-3, 1],
        [3, -5], [1, -5], [3, 5], [1, 5], [5, -3], [5, -1], [5, 3], [5, 1],
        [1, -3], [1, -1], [1, 3], [1, 1], [3, -3], [3, -1], [3, 3], [3, 1],
      ].map(([i, q]) => [i! / Math.sqrt(20), q! / Math.sqrt(20)] as const);
  }
}

function nearestState(
  modulation: Exclude<GeranIqModulation, 'gmsk'>,
  point: readonly [number, number],
): number {
  const candidates = expectedConstellation(modulation);
  let selected = -1;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (let state = 0; state < candidates.length; state += 1) {
    const candidate = candidates[state]!;
    const distance = (point[0] - candidate[0]) ** 2 + (point[1] - candidate[1]) ** 2;
    if (distance < selectedDistance) {
      selected = state;
      selectedDistance = distance;
    }
  }
  return selected;
}

function expectPoint(
  actual: readonly [number, number],
  expected: readonly [number, number],
  tolerance = 1e-14,
): void {
  expect(Math.abs(actual[0] - expected[0])).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual[1] - expected[1])).toBeLessThanOrEqual(tolerance);
}

function deinterleave(value: string, lane: 0 | 1): string {
  let result = '';
  for (let index = lane; index < value.length; index += 2) result += value[index]!;
  return result;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

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
