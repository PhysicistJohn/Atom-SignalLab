import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  LTE_RESOURCE_ELEMENT_KIND,
  generateLteEtm11ReferenceFrame,
} from './lte-etm1-reference.js';
import {
  LTE_ETM3_REFERENCE_DEFINITIONS,
  LTE_ETM3_REFERENCE_IDENTITIES,
  LTE_ETM3_REFERENCE_PROFILES,
  generateLteEtm3ReferenceFrame,
  mapLteQamBits,
  type LteEtm3Modulation,
} from './lte-etm3-reference.js';

describe('fixed LTE E-TM3 Release-19 reference frames', () => {
  it.each(LTE_ETM3_REFERENCE_PROFILES)(
    '%s changes only the PDSCH modulation relative to the fixed E-TM1.1 physical-channel table',
    (profile) => {
      const etm11 = generateLteEtm11ReferenceFrame();
      const frame = generateLteEtm3ReferenceFrame(profile);
      const definition = LTE_ETM3_REFERENCE_DEFINITIONS[profile];

      expect(frame.metadata).toMatchObject({
        profileId: profile,
        model: definition.model,
        qualification: 'standards-derived-digital-candidate-not-independently-verified',
        complianceClaimed: false,
        modulation: definition.modulation,
        bitsPerPdschSymbol: definition.bitsPerSymbol,
        physicalCellId: 1,
        channelBandwidthHz: 10_000_000,
        resourceBlockCount: 50,
        sampleRateHz: 15_360_000,
        sampleCount: 153_600,
        transformation: 'replace-only-pdsch-qpsk-with-specified-qam',
      });
      expect(frame.grid.kinds).toEqual(etm11.grid.kinds);
      expect(frame.metadata.resourceElementCounts).toEqual(etm11.metadata.resourceElementCounts);

      let changedPdsch = 0;
      for (let index = 0; index < frame.grid.kinds.length; index += 1) {
        if (frame.grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.pdsch) {
          if (
            frame.grid.real[index] !== etm11.grid.real[index]
            || frame.grid.imaginary[index] !== etm11.grid.imaginary[index]
          ) changedPdsch += 1;
        } else {
          expect(frame.grid.real[index], `real non-PDSCH RE ${index}`).toBe(etm11.grid.real[index]);
          expect(frame.grid.imaginary[index], `imaginary non-PDSCH RE ${index}`).toBe(
            etm11.grid.imaginary[index],
          );
        }
      }
      expect(changedPdsch).toBeGreaterThan(50_000);
    },
  );

  it.each(LTE_ETM3_REFERENCE_PROFILES)(
    '%s pins complete grid and OFDM identities',
    (profile) => {
      const frame = generateLteEtm3ReferenceFrame(profile);
      expect(sha256HexOfBytes(encodeCf64le(frame.grid.real, frame.grid.imaginary))).toBe(
        LTE_ETM3_REFERENCE_IDENTITIES[profile].gridCf64leSha256,
      );
      expect(sha256HexOfBytes(encodeCf64le(
        frame.timeDomain.real,
        frame.timeDomain.imaginary,
      ))).toBe(LTE_ETM3_REFERENCE_IDENTITIES[profile].timeCf64leSha256);
    },
  );
});

describe('TS 36.211 LTE rectangular-QAM mapping', () => {
  it.each([
    ['64qam', 6, 42, [-7, -5, -3, -1, 1, 3, 5, 7]],
    ['256qam', 8, 170, Array.from({ length: 16 }, (_unused, index) => 2 * index - 15)],
    ['1024qam', 10, 682, Array.from({ length: 32 }, (_unused, index) => 2 * index - 31)],
  ] as const)(
    '%s spans the complete normalized odd-level Cartesian constellation with unit average energy',
    (modulation, bitsPerSymbol, normalizationSquared, expectedLevels) => {
      const constellationSize = 2 ** bitsPerSymbol;
      const bits = new Uint8Array(constellationSize * bitsPerSymbol);
      for (let symbol = 0; symbol < constellationSize; symbol += 1) {
        for (let bit = 0; bit < bitsPerSymbol; bit += 1) {
          bits[symbol * bitsPerSymbol + bit] =
            (symbol >> (bitsPerSymbol - bit - 1)) & 1;
        }
      }
      const points = mapLteQamBits(bits, modulation);
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
    ['64qam', [0, 0, 0, 0, 0, 0], 3 / Math.sqrt(42), 3 / Math.sqrt(42)],
    ['64qam', [1, 0, 0, 0, 0, 0], -3 / Math.sqrt(42), 3 / Math.sqrt(42)],
    ['256qam', [0, 0, 0, 0, 0, 0, 0, 0], 5 / Math.sqrt(170), 5 / Math.sqrt(170)],
    ['1024qam', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 11 / Math.sqrt(682), 11 / Math.sqrt(682)],
  ] as const)(
    'matches independent nested-formula spot vector for %s',
    (modulation, input, expectedReal, expectedImaginary) => {
      const [point] = mapLteQamBits(Uint8Array.from(input), modulation);
      expect(point!.real).toBeCloseTo(expectedReal, 15);
      expect(point!.imaginary).toBeCloseTo(expectedImaginary, 15);
    },
  );

  it.each([
    ['64qam', 5],
    ['256qam', 7],
    ['1024qam', 9],
  ] as const)('rejects malformed %s input', (modulation, bitCount) => {
    expect(() => mapLteQamBits(new Uint8Array(bitCount), modulation)).toThrow(/multiple/);
    const invalid = new Uint8Array(bitCount + 1);
    invalid[0] = 2;
    expect(() => mapLteQamBits(invalid, modulation)).toThrow(/binary/);
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

function _typeCheckModulation(_modulation: LteEtm3Modulation): void {
  // This never runs; it keeps the table's inferred string literals tied to the
  // public modulation type instead of widening silently during maintenance.
}
void _typeCheckModulation;
