import { createHash } from 'node:crypto';
import { fftForwardUnscaledInPlace } from '@atomos/dsp';
import { describe, expect, it } from 'vitest';
import {
  LTE_ETM1_1_10MHZ_FDD_PILOT,
  LTE_RESOURCE_ELEMENT_KIND,
  applyLteSingleAntennaPortIdentityStage,
  generateLteEtm11ReferenceFrame,
  generateLteGoldSequence,
  generateLtePrimarySynchronizationSignal,
  generateLteSecondarySynchronizationSignal,
  type SplitComplexSequence,
} from './lte-etm1-reference.js';

const GRID_SUBCARRIERS = 600;
const FFT_SIZE = 1_024;

describe('Release-19 LTE E-TM1.1 10 MHz FDD digital reference candidate', () => {
  it('is fail-closed to the fixed TS 36.141 profile and does not claim qualification', () => {
    expect(LTE_ETM1_1_10MHZ_FDD_PILOT).toMatchObject({
      profileId: 'lte-etm1.1-10mhz-fdd-release19-candidate',
      qualification: 'standards-derived-digital-candidate-not-independently-verified',
      complianceClaimed: false,
      physicalCellId: 1,
      frameNumberModuloFour: 0,
      radioFrameDurationMs: 10,
      resourceBlockCount: 50,
      subcarrierSpacingHz: 15_000,
      sampleRateHz: 15_360_000,
      sampleCount: 153_600,
      physicalChannelConfiguration: {
        controlSymbolCount: 1,
        cfi: 1,
        phichNg: '1/6',
        phichGroupCount: 2,
        phichPerGroup: 2,
        phichSequenceIndices: [0, 4],
        pdcchCount: 5,
        ccesPerPdcch: 2,
        pdschResourceBlockCount: 50,
        pdschRnti: 0,
      },
      relativeEpreDb: {
        synchronizationSignals: 0,
        pbch: 0,
        pcfich: 0,
        phichBpskSymbol: -3.010,
        phichGroup: 0,
        pdcchReg: 1.065,
        pdschPa: 0,
      },
    });
    expect(LTE_ETM1_1_10MHZ_FDD_PILOT.unsupportedScope).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/cell identity other than.*1/i),
        expect.stringMatching(/independent trusted vector/i),
        expect.stringMatching(/conducted-RF/i),
      ]),
    );
    expect(LTE_ETM1_1_10MHZ_FDD_PILOT.requirementLedger).toHaveLength(9);
    for (const requirement of LTE_ETM1_1_10MHZ_FDD_PILOT.requirementLedger) {
      expect(requirement.status).toBe('implemented');
      expect(requirement.independentVerification).toBe('not-performed');
      expect(requirement.clauses.length).toBeGreaterThan(0);
    }
  });

  it('applies the one-layer single-port identity stage without changing any channel symbol', () => {
    const input = [
      { real: Math.SQRT1_2, imaginary: -Math.SQRT1_2 },
      { real: -0, imaginary: 1 },
      { real: -1.25, imaginary: 0.5 },
    ];
    const output = applyLteSingleAntennaPortIdentityStage(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
    expect(Object.is(output[1]!.real, -0)).toBe(true);
    expect(Object.isFrozen(output)).toBe(true);
    expect(output.every(Object.isFrozen)).toBe(true);
    expect(() => applyLteSingleAntennaPortIdentityStage([
      { real: Number.NaN, imaginary: 0 },
    ])).toThrow(/must be finite/i);
    expect(() => applyLteSingleAntennaPortIdentityStage([
      { real: 0, imaginary: Number.POSITIVE_INFINITY },
    ])).toThrow(/must be finite/i);
  });

  it('matches independently frozen Gold-sequence bits and rejects invalid seeds or lengths', () => {
    expect(Array.from(generateLteGoldSequence(0, 64))).toEqual(bits(
      '0000001000011010000100100111101000100101100101010000001101010110',
    ));
    expect(Array.from(generateLteGoldSequence(1, 64))).toEqual(bits(
      '0000001010000011000000110111010000101011100110101111110111100010',
    ));
    expect(Array.from(generateLteGoldSequence(4_609, 64))).toEqual(bits(
      '1100100101110000111100001111010001110011000100100111000011100100',
    ));
    expect(generateLteGoldSequence(1, 0)).toHaveLength(0);
    expect(() => generateLteGoldSequence(-1, 1)).toThrow(RangeError);
    expect(() => generateLteGoldSequence(0x8000_0000, 1)).toThrow(RangeError);
    expect(() => generateLteGoldSequence(1, -1)).toThrow(RangeError);
    expect(() => generateLteGoldSequence(1.5, 1)).toThrow(RangeError);
  });

  it('matches known PCI=1 PSS and SSS sequence elements', () => {
    const pss = generateLtePrimarySynchronizationSignal(1);
    expect(pss.real).toHaveLength(62);
    expect(pss.imaginary).toHaveLength(62);
    expect(pss.real[0]).toBeCloseTo(1, 14);
    expect(pss.imaginary[0]).toBeCloseTo(0, 14);
    expect(pss.real[1]).toBeCloseTo(-0.969077286229078, 14);
    expect(pss.imaginary[1]).toBeCloseTo(-0.246757397690294, 14);
    expect(pss.real[3]).toBeCloseTo(0.074730093586421, 14);
    expect(pss.imaginary[3]).toBeCloseTo(0.997203797181180, 14);
    for (let index = 0; index < 62; index += 1) {
      expect(Math.hypot(pss.real[index]!, pss.imaginary[index]!)).toBeCloseTo(1, 13);
    }

    const subframe0 = generateLteSecondarySynchronizationSignal(1, 0);
    const subframe5 = generateLteSecondarySynchronizationSignal(1, 5);
    expect(sequenceSigns(subframe0.real)).toBe(
      '+-+++----+-++-++-++----+-+------+-+----+-+-+---++--++-++-+-+--',
    );
    expect(sequenceSigns(subframe5.real)).toBe(
      '+-+++-+-+--+----+++-+---+-------++---+-++---+-+-++-----++++-+-',
    );
    expect(Array.from(subframe0.imaginary)).toEqual(Array.from(new Float64Array(62)));
    expect(() => generateLtePrimarySynchronizationSignal(504)).toThrow(RangeError);
    expect(() => generateLteSecondarySynchronizationSignal(1, 1 as 0)).toThrow(RangeError);
  });

  it('constructs one complete 50-RB resource grid with exact channel and reservation counts', () => {
    const frame = generateLteEtm11ReferenceFrame();
    expect(frame.metadata).toMatchObject({
      complianceClaimed: false,
      physicalCellId: 1,
      duplex: 'fdd',
      cyclicPrefix: 'normal',
      antennaPorts: [0],
      resourceBlockCount: 50,
      activeSubcarrierCount: 600,
      fftSize: 1_024,
      sampleRateHz: 15_360_000,
      sampleCount: 153_600,
    });
    expect(frame.grid).toMatchObject({
      symbolCount: 140,
      subcarrierCount: 600,
    });
    expect(frame.grid.real).toHaveLength(84_000);
    expect(frame.grid.imaginary).toHaveLength(84_000);
    expect(frame.grid.kinds).toHaveLength(84_000);
    expect(frame.metadata.resourceElementCounts).toEqual({
      unused: 0,
      crs: 4_000,
      pss: 124,
      sss: 124,
      pbch: 240,
      pcfich: 160,
      phich: 240,
      pdcch: 3_600,
      pdsch: 74_436,
      reserved: 1_076,
    });
    expect(Object.values(frame.metadata.resourceElementCounts)
      .reduce((sum, count) => sum + count, 0)).toBe(84_000);
  });

  it('places CRS, synchronization signals, PBCH, and first-symbol control REGs at known coordinates', () => {
    const { grid } = generateLteEtm11ReferenceFrame();

    expect(element(grid, 0, 1)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.crs,
      real: Math.SQRT1_2,
      imaginary: Math.SQRT1_2,
    });
    expect(element(grid, 0, 13)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.crs,
      real: -Math.SQRT1_2,
      imaginary: -Math.SQRT1_2,
    });
    expect(element(grid, 4, 4).kind).toBe(LTE_RESOURCE_ELEMENT_KIND.crs);

    expect(element(grid, 6, 264).kind).toBe(LTE_RESOURCE_ELEMENT_KIND.reserved);
    expect(element(grid, 6, 269)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.pss,
      real: 1,
    });
    expect(element(grid, 6, 335).kind).toBe(LTE_RESOURCE_ELEMENT_KIND.reserved);
    expect(element(grid, 5, 269)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.sss,
      real: 1,
      imaginary: 0,
    });
    expect(element(grid, 75, 269)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.sss,
      real: 1,
      imaginary: 0,
    });
    expect(element(grid, 7, 264)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.pbch,
      real: Math.SQRT1_2,
      imaginary: Math.SQRT1_2,
    });
    expect(element(grid, 1, 0)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.pdsch,
      real: Math.SQRT1_2,
      imaginary: Math.SQRT1_2,
    });
    expect(element(grid, 0, 12)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.phich,
      real: 0,
      imaginary: 1.0000000000000002,
    });
    expect(element(grid, 0, 6)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.pcfich,
      real: Math.SQRT1_2,
      imaginary: Math.SQRT1_2,
    });
    expect(element(grid, 0, 8)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.pcfich,
      real: Math.SQRT1_2,
      imaginary: Math.SQRT1_2,
    });
    expect(element(grid, 0, 9)).toMatchObject({
      kind: LTE_RESOURCE_ELEMENT_KIND.pcfich,
      real: -Math.SQRT1_2,
      imaginary: -Math.SQRT1_2,
    });

    const pbchKinds = Array.from({ length: 4 }, (_, offset) =>
      Array.from({ length: 72 }, (_, subcarrierOffset) =>
        element(grid, 7 + offset, 264 + subcarrierOffset).kind));
    expect(pbchKinds.flat().filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.pbch)).toHaveLength(240);
    expect(pbchKinds.flat().filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.crs)).toHaveLength(12);
    expect(pbchKinds.flat().filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.reserved)).toHaveLength(36);

    expect([0, 6, 12, 18, 24, 30].map((subcarrier) =>
      element(grid, 0, subcarrier).kind)).toEqual([
      LTE_RESOURCE_ELEMENT_KIND.pdcch,
      LTE_RESOURCE_ELEMENT_KIND.pcfich,
      LTE_RESOURCE_ELEMENT_KIND.phich,
      LTE_RESOURCE_ELEMENT_KIND.phich,
      LTE_RESOURCE_ELEMENT_KIND.pdcch,
      LTE_RESOURCE_ELEMENT_KIND.pdcch,
    ]);
    for (let subframe = 0; subframe < 10; subframe += 1) {
      const symbol = subframe * 14;
      const kinds = Array.from(
        grid.kinds.subarray(symbol * GRID_SUBCARRIERS, (symbol + 1) * GRID_SUBCARRIERS),
      );
      expect(kinds.filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.crs)).toHaveLength(100);
      expect(kinds.filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.reserved)).toHaveLength(100);
      expect(kinds.filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.pcfich)).toHaveLength(16);
      expect(kinds.filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.phich)).toHaveLength(24);
      expect(kinds.filter((kind) => kind === LTE_RESOURCE_ELEMENT_KIND.pdcch)).toHaveLength(360);
    }
  });

  it('renders exactly 153600 finite samples with exact normal-CP copies and declared fixed scaling', () => {
    const frame = generateLteEtm11ReferenceFrame();
    expect(frame.timeDomain.real).toHaveLength(153_600);
    expect(frame.timeDomain.imaginary).toHaveLength(153_600);
    expect(frame.metadata.cyclicPrefixSamplesBySymbol).toHaveLength(140);
    expect(Array.from(frame.metadata.cyclicPrefixSamplesBySymbol.subarray(0, 14))).toEqual([
      80, 72, 72, 72, 72, 72, 72,
      80, 72, 72, 72, 72, 72, 72,
    ]);

    let sampleOffset = 0;
    for (let symbol = 0; symbol < 140; symbol += 1) {
      const cyclicPrefix = frame.metadata.cyclicPrefixSamplesBySymbol[symbol]!;
      const bodyOffset = sampleOffset + cyclicPrefix;
      for (let sample = 0; sample < cyclicPrefix; sample += 1) {
        expect(frame.timeDomain.real[sampleOffset + sample])
          .toBe(frame.timeDomain.real[bodyOffset + FFT_SIZE - cyclicPrefix + sample]);
        expect(frame.timeDomain.imaginary[sampleOffset + sample])
          .toBe(frame.timeDomain.imaginary[bodyOffset + FFT_SIZE - cyclicPrefix + sample]);
      }
      sampleOffset = bodyOffset + FFT_SIZE;
    }
    expect(sampleOffset).toBe(153_600);

    const metrics = complexMetrics(frame.timeDomain);
    expect(metrics.allFinite).toBe(true);
    expect(metrics.meanPower).toBeGreaterThan(0);
    expect(metrics.peakMagnitude).toBeLessThanOrEqual(1);

    const firstGridEnergy = gridSymbolEnergy(frame.grid, 0);
    const firstBodyEnergy = complexEnergy(
      frame.timeDomain.real.subarray(80, 80 + FFT_SIZE),
      frame.timeDomain.imaginary.subarray(80, 80 + FFT_SIZE),
    );
    expect(firstBodyEnergy).toBeCloseTo(firstGridEnergy / FFT_SIZE, 11);
  });

  it('maps the split resource grid around an empty DC bin and preserves all E-TM relative EPRE values', () => {
    const frame = generateLteEtm11ReferenceFrame();
    const transformedReal = Float64Array.from(frame.timeDomain.real.subarray(80, 80 + FFT_SIZE));
    const transformedImaginary = Float64Array.from(frame.timeDomain.imaginary.subarray(80, 80 + FFT_SIZE));
    fftForwardUnscaledInPlace(transformedReal, transformedImaginary);

    for (const subcarrier of [0, 299, 300, 599]) {
      const fftBin = subcarrier < 300 ? 724 + subcarrier : subcarrier - 299;
      expect(transformedReal[fftBin]).toBeCloseTo(frame.grid.real[subcarrier]!, 11);
      expect(transformedImaginary[fftBin]).toBeCloseTo(frame.grid.imaginary[subcarrier]!, 11);
    }
    expect(transformedReal[0]).toBeCloseTo(0, 11);
    expect(transformedImaginary[0]).toBeCloseTo(0, 11);
    for (let fftBin = 301; fftBin <= 723; fftBin += 1) {
      expect(Math.hypot(transformedReal[fftBin]!, transformedImaginary[fftBin]!)).toBeLessThan(1e-11);
    }

    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.crs)).toBeCloseTo(1, 13);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.pss)).toBeCloseTo(1, 13);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.sss)).toBeCloseTo(1, 13);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.pbch)).toBeCloseTo(1, 13);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.pcfich)).toBeCloseTo(1, 13);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.phich)).toBeCloseTo(1, 13);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.pdcch))
      .toBeCloseTo(10 ** (1.065 / 10), 12);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.pdsch)).toBeCloseTo(1, 13);
    expect(meanGridPowerForKind(frame, LTE_RESOURCE_ELEMENT_KIND.reserved)).toBe(0);
  });

  it('is deterministic and sequence inputs are mutation-sensitive', () => {
    const first = generateLteEtm11ReferenceFrame();
    const second = generateLteEtm11ReferenceFrame();
    expect(frameDigest(first)).toBe(frameDigest(second));
    expect(Array.from(generateLteGoldSequence(1, 128)))
      .not.toEqual(Array.from(generateLteGoldSequence(2, 128)));
    expect(sequenceDigest(generateLtePrimarySynchronizationSignal(1)))
      .not.toBe(sequenceDigest(generateLtePrimarySynchronizationSignal(2)));
    expect(sequenceDigest(generateLteSecondarySynchronizationSignal(1, 0)))
      .not.toBe(sequenceDigest(generateLteSecondarySynchronizationSignal(1, 5)));
  });
});

function bits(value: string): number[] {
  return [...value].map((bit) => {
    if (bit !== '0' && bit !== '1') throw new Error(`Invalid frozen bit ${bit}`);
    return Number(bit);
  });
}

function sequenceSigns(values: Float64Array): string {
  return Array.from(values, (value) => value > 0 ? '+' : '-').join('');
}

function element(
  grid: ReturnType<typeof generateLteEtm11ReferenceFrame>['grid'],
  symbol: number,
  subcarrier: number,
): { readonly real: number; readonly imaginary: number; readonly kind: number } {
  const index = symbol * GRID_SUBCARRIERS + subcarrier;
  return {
    real: grid.real[index]!,
    imaginary: grid.imaginary[index]!,
    kind: grid.kinds[index]!,
  };
}

function complexMetrics(sequence: SplitComplexSequence): {
  readonly allFinite: boolean;
  readonly meanPower: number;
  readonly peakMagnitude: number;
} {
  let energy = 0;
  let peakMagnitude = 0;
  let allFinite = sequence.real.length === sequence.imaginary.length;
  for (let index = 0; index < sequence.real.length; index += 1) {
    const real = sequence.real[index]!;
    const imaginary = sequence.imaginary[index]!;
    allFinite &&= Number.isFinite(real) && Number.isFinite(imaginary);
    const magnitudeSquared = real * real + imaginary * imaginary;
    energy += magnitudeSquared;
    peakMagnitude = Math.max(peakMagnitude, Math.sqrt(magnitudeSquared));
  }
  return {
    allFinite,
    meanPower: energy / sequence.real.length,
    peakMagnitude,
  };
}

function gridSymbolEnergy(
  grid: ReturnType<typeof generateLteEtm11ReferenceFrame>['grid'],
  symbol: number,
): number {
  const start = symbol * GRID_SUBCARRIERS;
  return complexEnergy(
    grid.real.subarray(start, start + GRID_SUBCARRIERS),
    grid.imaginary.subarray(start, start + GRID_SUBCARRIERS),
  );
}

function complexEnergy(real: Float64Array, imaginary: Float64Array): number {
  let energy = 0;
  for (let index = 0; index < real.length; index += 1) {
    energy += real[index]! ** 2 + imaginary[index]! ** 2;
  }
  return energy;
}

function meanGridPowerForKind(
  frame: ReturnType<typeof generateLteEtm11ReferenceFrame>,
  targetKind: number,
): number {
  let energy = 0;
  let count = 0;
  for (let index = 0; index < frame.grid.kinds.length; index += 1) {
    if (frame.grid.kinds[index] === targetKind) {
      energy += frame.grid.real[index]! ** 2 + frame.grid.imaginary[index]! ** 2;
      count += 1;
    }
  }
  if (count === 0) throw new Error(`No resource elements have kind ${targetKind}`);
  return energy / count;
}

function frameDigest(frame: ReturnType<typeof generateLteEtm11ReferenceFrame>): string {
  return createHash('sha256')
    .update(asBytes(frame.grid.real))
    .update(asBytes(frame.grid.imaginary))
    .update(frame.grid.kinds)
    .update(asBytes(frame.timeDomain.real))
    .update(asBytes(frame.timeDomain.imaginary))
    .digest('hex');
}

function sequenceDigest(sequence: SplitComplexSequence): string {
  return createHash('sha256')
    .update(asBytes(sequence.real))
    .update(asBytes(sequence.imaginary))
    .digest('hex');
}

function asBytes(values: Float64Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}
