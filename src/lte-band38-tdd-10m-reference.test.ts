import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS,
  LTE_BAND38_TDD_10M_CHANNEL_BANDWIDTH_HZ,
  LTE_BAND38_TDD_10M_FFT_SIZE,
  LTE_BAND38_TDD_10M_FRAME_SAMPLES,
  LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID,
  LTE_BAND38_TDD_10M_REFERENCE_IDENTITIES,
  LTE_BAND38_TDD_10M_RESOURCE_BLOCKS,
  LTE_BAND38_TDD_10M_SAMPLE_RATE_HZ,
  generateLteBand38Tdd10mReferenceFrame,
} from './lte-band38-tdd-10m-reference.js';
import {
  EXACT_FLOAT_PINS_REPRODUCIBLE_HERE,
  quantizedComplexSeries,
} from './architecture-identity.js';

/**
 * Architecture-tolerant companions to LTE_BAND38_TDD_10M_REFERENCE_IDENTITIES.
 *
 * The exact cf64le digests pin the last mantissa bit of libm transcendentals, so
 * they only reproduce on the architecture that authored them. These digests hash
 * the same two series rounded to nine decimals, which is far coarser than the
 * cross-architecture last-ulp difference and far finer than any real change to
 * the waveform, so they hold on every host. Measured on darwin-arm64.
 */
const LTE_BAND38_TDD_10M_QUANTIZED_IDENTITIES = Object.freeze({
  gridQuantizedSha256: '7696149b60dbbee5581571c960fc6325019208030bc30bb6ba2550770d0d0ad3',
  timeQuantizedSha256: '69df62c41a848649b2bef2daf094982832b8972a7e4dd0097f01c49b7755bcf9',
});

function encodeCf64le(real: Float64Array, imaginary: Float64Array): Uint8Array {
  expect(imaginary).toHaveLength(real.length);
  const bytes = new Uint8Array(real.length * 16);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < real.length; index += 1) {
    view.setFloat64(index * 16, real[index]!, true);
    view.setFloat64(index * 16 + 8, imaginary[index]!, true);
  }
  return bytes;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('fixed LTE Band-38 10 MHz TDD digital reference', () => {
  it('binds every material frame-structure choice explicitly', () => {
    const frame = generateLteBand38Tdd10mReferenceFrame();
    expect(frame.metadata).toMatchObject({
      profileId: 'lte-band38-tdd-10m',
      fixedWaveform: 'TS-36.211-valid-downlink-physical-input-fixture',
      operatingBand: 38,
      downlinkCenterHz: 2_595_000_000,
      channelBandwidthHz: LTE_BAND38_TDD_10M_CHANNEL_BANDWIDTH_HZ,
      duplex: 'tdd',
      ulDlConfiguration: 0,
      specialSubframeConfiguration: 7,
      subframeDirections: 'DSUUUDSUUU',
      dwPtsSymbols: 10,
      guardPeriodSymbols: 2,
      upPtsSymbols: 2,
      srsUpPtsAdd: false,
      miBySubframe: [2, 1, 0, 0, 0, 2, 1, 0, 0, 0],
      physicalCellId: LTE_BAND38_TDD_10M_PHYSICAL_CELL_ID,
      resourceBlockCount: LTE_BAND38_TDD_10M_RESOURCE_BLOCKS,
      sampleRateHz: LTE_BAND38_TDD_10M_SAMPLE_RATE_HZ,
      sampleCount: LTE_BAND38_TDD_10M_FRAME_SAMPLES,
      qualification: 'fixed-digital-candidate',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
    });
  });

  it('has exact 50-RB normal-CP frame geometry and zero downlink output in U/GP/UpPTS', () => {
    const frame = generateLteBand38Tdd10mReferenceFrame();
    expect(frame.grid.symbolCount).toBe(140);
    expect(frame.grid.subcarrierCount).toBe(LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS);
    expect(frame.grid.real).toHaveLength(140 * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS);
    expect(frame.grid.imaginary).toHaveLength(frame.grid.real.length);
    expect(frame.timeDomain.real).toHaveLength(LTE_BAND38_TDD_10M_FRAME_SAMPLES);
    expect(frame.timeDomain.imaginary).toHaveLength(LTE_BAND38_TDD_10M_FRAME_SAMPLES);
    expect(LTE_BAND38_TDD_10M_FFT_SIZE).toBe(1_024);
    expect(frame.metadata.resourceElementCounts).toEqual({
      unused: 55_200,
      crs: 1_400,
      pss: 124,
      sss: 124,
      pbch: 240,
      pcfich: 64,
      phich: 144,
      pdcch: 1_368,
      pdsch: 24_836,
      reserved: 500,
    });

    const zeroSubframes = [2, 3, 4, 7, 8, 9];
    for (const subframe of zeroSubframes) {
      const first = subframe * 14 * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
      const end = first + 14 * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
      expect(frame.grid.real.subarray(first, end).every((value) => value === 0)).toBe(true);
      expect(frame.grid.imaginary.subarray(first, end).every((value) => value === 0))
        .toBe(true);
    }
    for (const subframe of [1, 6]) {
      const first = (subframe * 14 + 10) * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
      const end = (subframe * 14 + 14) * LTE_BAND38_TDD_10M_ACTIVE_SUBCARRIERS;
      expect(frame.grid.real.subarray(first, end).every((value) => value === 0)).toBe(true);
      expect(frame.grid.imaginary.subarray(first, end).every((value) => value === 0))
        .toBe(true);
    }
    const countSum = Object.values(frame.metadata.resourceElementCounts)
      .reduce((sum, count) => sum + count, 0);
    expect(countSum).toBe(frame.grid.kinds.length);
  });

  it('is deterministic and exposes stable full-grid/full-frame identities', () => {
    const first = generateLteBand38Tdd10mReferenceFrame();
    const second = generateLteBand38Tdd10mReferenceFrame();
    const firstGrid = encodeCf64le(first.grid.real, first.grid.imaginary);
    const secondGrid = encodeCf64le(second.grid.real, second.grid.imaginary);
    const firstTime = encodeCf64le(first.timeDomain.real, first.timeDomain.imaginary);
    const secondTime = encodeCf64le(second.timeDomain.real, second.timeDomain.imaginary);
    expect(secondGrid).toEqual(firstGrid);
    expect(secondTime).toEqual(firstTime);
    if (EXACT_FLOAT_PINS_REPRODUCIBLE_HERE) {
      const identities = {
        gridCf64leSha256: sha256(firstGrid),
        timeCf64leSha256: sha256(firstTime),
      };
      expect(identities).toEqual(LTE_BAND38_TDD_10M_REFERENCE_IDENTITIES);
    }
    // Asserted on every architecture: same two series, rounded to a decimal grid
    // coarser than the cross-architecture last-ulp difference.
    const quantizedIdentities = {
      gridQuantizedSha256: sha256Text(
        quantizedComplexSeries(first.grid.real, first.grid.imaginary),
      ),
      timeQuantizedSha256: sha256Text(
        quantizedComplexSeries(first.timeDomain.real, first.timeDomain.imaginary),
      ),
    };
    expect(quantizedIdentities).toEqual(LTE_BAND38_TDD_10M_QUANTIZED_IDENTITIES);
    // The second frame reproduces the quantized identity too, so determinism is
    // still checked at the identity level and not only byte-for-byte.
    expect(sha256Text(quantizedComplexSeries(second.grid.real, second.grid.imaginary)))
      .toBe(quantizedIdentities.gridQuantizedSha256);
    expect(
      sha256Text(quantizedComplexSeries(second.timeDomain.real, second.timeDomain.imaginary)),
    ).toBe(quantizedIdentities.timeQuantizedSha256);
  });
});
