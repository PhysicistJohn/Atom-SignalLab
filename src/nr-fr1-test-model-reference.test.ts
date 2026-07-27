import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_FR1_20MHZ_N3_FDD_BINDING,
  NR_FR1_TEST_MODEL_DEFINITIONS,
  NR_FR1_TEST_MODEL_PROFILES,
  NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES,
  generateNrFr1TestModelFrame,
  generateNrGoldSequence,
  generateNrPn23Bits,
  mapNrQamBits,
  type NrFr1TestModelModulation,
} from './nr-fr1-test-model-reference.js';

describe('fixed Release 19 NR-FR1 test-model frames', () => {
  it.each(NR_FR1_TEST_MODEL_PROFILES)(
    '%s fills the exact 106-RB, 10 ms frame geometry',
    (profile) => {
      const frame = generateNrFr1TestModelFrame(profile);
      const definition = NR_FR1_TEST_MODEL_DEFINITIONS[profile];
      expect(frame.metadata).toMatchObject({
        profileId: profile,
        model: definition.model,
        qualification: 'independently-verified-fixed-digital-baseband',
        standardsComplianceClaimed: false,
        rfConformanceClaimed: false,
        productCertificationClaimed: false,
        specification: '3GPP TS 38.141-1 V19.4.0 (Release 19)',
        clause: definition.clause,
        modulation: definition.modulation,
        bitsPerPdschSymbol: definition.bitsPerSymbol,
        operatingBand: 'n3',
        downlinkCenterHz: 1_842_500_000,
        channelBandwidthHz: 20_000_000,
        nominalGridBandwidthHz: 19_080_000,
        physicalCellId: 1,
        duplex: 'fdd',
        cyclicPrefix: 'normal',
        subcarrierSpacingHz: 15_000,
        resourceBlockCount: 106,
        activeSubcarrierCount: 1_272,
        sampleRateHz: 30_720_000,
        sampleCount: 307_200,
      });
      expect(frame.grid.real).toHaveLength(178_080);
      expect(frame.grid.imaginary).toHaveLength(178_080);
      expect(frame.grid.kinds).toHaveLength(178_080);
      expect(frame.timeDomain.real).toHaveLength(307_200);
      expect(frame.timeDomain.imaginary).toHaveLength(307_200);
      expect(frame.metadata.resourceElementCounts).toEqual({
        unused: 0,
        pdcchData: 540,
        pdcchDmrs: 180,
        pdschRnti0Data: 160_680,
        pdschRnti2Data: 3_960,
        pdschDmrs: 12_720,
      });
      expect(Object.values(frame.metadata.resourceElementCounts).reduce(
        (sum, count) => sum + count,
        0,
      )).toBe(178_080);
      expect(frame.metadata.excludedScope.join(' ')).toMatch(/RF conformance/i);
    },
    30_000,
  );

  it('pins the n3 carrier and baseband geometry independently of a profile', () => {
    expect(NR_FR1_20MHZ_N3_FDD_BINDING).toMatchObject({
      operatingBand: 'n3',
      duplex: 'fdd',
      downlinkCenterHz: 1_842_500_000,
      downlinkNrArfcn: 368_500,
      channelBandwidthHz: 20_000_000,
      nominalGridBandwidthHz: 19_080_000,
      physicalCellId: 1,
      subcarrierSpacingHz: 15_000,
      resourceBlockCount: 106,
      activeSubcarrierCount: 1_272,
      fftSize: 2_048,
      sampleRateHz: 30_720_000,
      frameDurationMs: 10,
      frameSampleCount: 307_200,
      slotsPerFrame: 10,
      symbolsPerSlot: 14,
      cyclicPrefix: 'normal',
      windowingPercent: 0,
    });
  });

  it('is deterministic and produces finite samples', () => {
    const first = generateNrFr1TestModelFrame('nr-fr1-tm1.1');
    const second = generateNrFr1TestModelFrame('nr-fr1-tm1.1');
    expect(second.grid.real).toEqual(first.grid.real);
    expect(second.grid.imaginary).toEqual(first.grid.imaginary);
    expect(second.timeDomain.real).toEqual(first.timeDomain.real);
    expect(second.timeDomain.imaginary).toEqual(first.timeDomain.imaginary);
    for (let index = 0; index < first.timeDomain.real.length; index += 1) {
      expect(Number.isFinite(first.timeDomain.real[index])).toBe(true);
      expect(Number.isFinite(first.timeDomain.imaginary[index])).toBe(true);
    }
  }, 30_000);

  it('keeps PDCCH, PDSCH allocation, and DM-RS geometry identical across models', () => {
    const reference = generateNrFr1TestModelFrame('nr-fr1-tm1.1');
    for (const profile of NR_FR1_TEST_MODEL_PROFILES.slice(1)) {
      const candidate = generateNrFr1TestModelFrame(profile);
      expect(candidate.grid.kinds).toEqual(reference.grid.kinds);
      for (let index = 0; index < candidate.grid.kinds.length; index += 1) {
        const kind = candidate.grid.kinds[index]!;
        if (kind === 2 || kind === 5) {
          expect(candidate.grid.real[index]).toBe(reference.grid.real[index]);
          expect(candidate.grid.imaginary[index]).toBe(reference.grid.imaginary[index]);
        }
      }
    }
  }, 30_000);

  it('pins the complete grid and time-domain frame identities', () => {
    for (const profile of NR_FR1_TEST_MODEL_PROFILES) {
      const frame = generateNrFr1TestModelFrame(profile);
      expect(sha256HexOfBytes(
        encodeCf64le(frame.grid.real, frame.grid.imaginary),
      )).toBe(NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES[profile].gridCf64leSha256);
      expect(sha256HexOfBytes(
        encodeCf64le(frame.timeDomain.real, frame.timeDomain.imaginary),
      )).toBe(NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES[profile].timeCf64leSha256);
    }
  });
});

describe('NR PN23 and Gold sequence primitives', () => {
  it('uses the all-ones O.150 PN23 start and reciprocal SSRG recurrence', () => {
    const sequence = generateNrPn23Bits(64);
    expect([...sequence.slice(0, 23)]).toEqual(new Array(23).fill(1));
    expect([...sequence.slice(23, 41)]).toEqual(new Array(18).fill(0));
    expect([...sequence.slice(41, 46)]).toEqual(new Array(5).fill(1));
    expect([...sequence.slice(46, 64)]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
    ]);
  });

  it('pins TS 38.211 Gold sequence known values and rejects invalid inputs', () => {
    expect([...generateNrGoldSequence(1, 32)]).toEqual([
      0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0,
    ]);
    expect(() => generateNrGoldSequence(-1, 1)).toThrow(/c_init/);
    expect(() => generateNrGoldSequence(2 ** 31, 1)).toThrow(/c_init/);
    expect(() => generateNrGoldSequence(0, -1)).toThrow(/length/);
    expect(() => generateNrPn23Bits(-1)).toThrow(/length/);
  });
});

describe('TS 38.211 NR rectangular-QAM mapping', () => {
  it.each([
    ['qpsk', 2, 2, [-1, 1]],
    ['64qam', 6, 42, [-7, -5, -3, -1, 1, 3, 5, 7]],
    ['256qam', 8, 170, Array.from({ length: 16 }, (_unused, index) => 2 * index - 15)],
    ['1024qam', 10, 682, Array.from({ length: 32 }, (_unused, index) => 2 * index - 31)],
  ] as const)(
    '%s exhaustively spans the normalized odd-level Cartesian constellation with unit average energy',
    (modulation, bitsPerSymbol, normalizationSquared, expectedLevels) => {
      const constellationSize = 2 ** bitsPerSymbol;
      const bits = new Uint8Array(constellationSize * bitsPerSymbol);
      for (let symbol = 0; symbol < constellationSize; symbol += 1) {
        for (let bit = 0; bit < bitsPerSymbol; bit += 1) {
          bits[symbol * bitsPerSymbol + bit] =
            (symbol >> (bitsPerSymbol - bit - 1)) & 1;
        }
      }
      const points = mapNrQamBits(bits, modulation);
      const scale = Math.sqrt(normalizationSquared);
      const realLevels = [...new Set(points.map((point) => Math.round(point.real * scale)))].sort(
        (left, right) => left - right,
      );
      const imaginaryLevels = [
        ...new Set(points.map((point) => Math.round(point.imaginary * scale))),
      ].sort((left, right) => left - right);
      const averagePower = points.reduce(
        (sum, point) => sum + point.real ** 2 + point.imaginary ** 2,
        0,
      ) / points.length;
      expect(realLevels).toEqual(expectedLevels);
      expect(imaginaryLevels).toEqual(expectedLevels);
      expect(averagePower).toBeCloseTo(1, 13);
    },
  );

  it.each([
    ['qpsk', [0, 0], 1 / Math.sqrt(2), 1 / Math.sqrt(2)],
    ['64qam', [0, 0, 0, 0, 0, 0], 3 / Math.sqrt(42), 3 / Math.sqrt(42)],
    ['256qam', [0, 0, 0, 0, 0, 0, 0, 0], 5 / Math.sqrt(170), 5 / Math.sqrt(170)],
    ['1024qam', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 11 / Math.sqrt(682), 11 / Math.sqrt(682)],
  ] as const)(
    'matches the nested-formula spot vector for %s',
    (modulation, input, expectedReal, expectedImaginary) => {
      const [point] = mapNrQamBits(Uint8Array.from(input), modulation);
      expect(point!.real).toBeCloseTo(expectedReal, 15);
      expect(point!.imaginary).toBeCloseTo(expectedImaginary, 15);
    },
  );

  it.each([
    ['qpsk', 1],
    ['64qam', 5],
    ['256qam', 7],
    ['1024qam', 9],
  ] as const)('rejects malformed %s input', (modulation, bitCount) => {
    expect(() => mapNrQamBits(new Uint8Array(bitCount), modulation)).toThrow(/multiple/);
    const invalid = new Uint8Array(bitCount + 1);
    invalid[0] = 2;
    expect(() => mapNrQamBits(invalid, modulation)).toThrow(/binary/);
    expect(() => mapNrQamBits(new Uint8Array(), modulation)).toThrow(/nonzero/);
  });
});

function encodeCf64le(real: Float64Array, imaginary: Float64Array): Uint8Array {
  expect(imaginary.length).toBe(real.length);
  const bytes = new Uint8Array(real.length * 16);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < real.length; index += 1) {
    view.setFloat64(index * 16, real[index]!, true);
    view.setFloat64(index * 16 + 8, imaginary[index]!, true);
  }
  return bytes;
}

function _typeCheckModulation(_modulation: NrFr1TestModelModulation): void {
  // Keeps table literals tied to the public modulation type.
}
void _typeCheckModulation;
