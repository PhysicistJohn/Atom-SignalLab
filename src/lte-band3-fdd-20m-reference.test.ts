import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS,
  LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ,
  LTE_BAND3_FDD_20M_FFT_SIZE,
  LTE_BAND3_FDD_20M_FRAME_SAMPLES,
  LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
  LTE_BAND3_FDD_20M_REFERENCE_IDENTITIES,
  LTE_BAND3_FDD_20M_RESOURCE_BLOCKS,
  LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ,
  generateLteBand3Fdd20mReferenceFrame,
} from './lte-band3-fdd-20m-reference.js';
import { LTE_RESOURCE_ELEMENT_KIND } from './lte-etm1-reference.js';

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

describe('fixed LTE Band-3 20 MHz FDD digital reference', () => {
  it('binds the observable to the complete TS 36.141 E-TM1.1 20 MHz row', () => {
    const frame = generateLteBand3Fdd20mReferenceFrame();
    expect(frame.metadata).toMatchObject({
      profileId: 'lte-band3-fdd-20m',
      fixedWaveform: 'E-TM1.1',
      specification: '3GPP TS 36.141 V19.1.0',
      operatingBand: 3,
      downlinkCenterHz: 1_840_000_000,
      channelBandwidthHz: LTE_BAND3_FDD_20M_CHANNEL_BANDWIDTH_HZ,
      duplex: 'fdd',
      physicalCellId: LTE_BAND3_FDD_20M_PHYSICAL_CELL_ID,
      frameNumberModuloFour: 0,
      resourceBlockCount: LTE_BAND3_FDD_20M_RESOURCE_BLOCKS,
      subcarrierSpacingHz: 15_000,
      cyclicPrefix: 'normal',
      antennaPorts: [0],
      sampleRateHz: LTE_BAND3_FDD_20M_SAMPLE_RATE_HZ,
      sampleCount: LTE_BAND3_FDD_20M_FRAME_SAMPLES,
      physicalChannelConfiguration: {
        cfi: 1,
        phichNg: '1/6',
        phichGroupCount: 3,
        phichPerGroup: 2,
        phichSequenceIndices: [0, 4],
        pdcchCount: 10,
        ccesPerPdcch: 2,
        pdcchAvailableRegs: 187,
        pdcchAllocatedRegs: 180,
        pdcchNilRegs: 7,
        pdschResourceBlockCount: 100,
        pdschRnti: 0,
      },
      relativeEpreDb: {
        synchronizationSignals: 0,
        pbch: 0,
        pcfich: 0,
        phichBpskSymbol: -3.010,
        phichGroup: 0,
        pdcchReg: 1.195,
        pdschPa: 0,
      },
      qualification: 'fixed-digital-candidate',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
    });
    expect(frame.metadata.clause).toMatch(/6\.1\.1\.1.*6\.1\.2/);
  });

  it('has the exact 100-RB grid, OFDM geometry, and fixed-channel counts', () => {
    const frame = generateLteBand3Fdd20mReferenceFrame();
    expect(frame.grid.symbolCount).toBe(140);
    expect(frame.grid.subcarrierCount).toBe(LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS);
    expect(frame.grid.real).toHaveLength(140 * LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS);
    expect(frame.grid.imaginary).toHaveLength(frame.grid.real.length);
    expect(frame.grid.kinds).toHaveLength(frame.grid.real.length);
    expect(frame.timeDomain.real).toHaveLength(LTE_BAND3_FDD_20M_FRAME_SAMPLES);
    expect(frame.timeDomain.imaginary).toHaveLength(LTE_BAND3_FDD_20M_FRAME_SAMPLES);
    expect(LTE_BAND3_FDD_20M_FFT_SIZE).toBe(2_048);
    expect(frame.metadata.resourceElementCounts).toMatchObject({
      crs: 8_000,
      pss: 124,
      sss: 124,
      pbch: 240,
      pcfich: 160,
      phich: 360,
      pdcch: 7_200,
      reserved: 2_356,
    });
    const countSum = Object.values(frame.metadata.resourceElementCounts)
      .reduce((sum, count) => sum + count, 0);
    expect(countSum).toBe(frame.grid.kinds.length);
  });

  it('keeps the seven PDCCH NIL REGs zero in every subframe', () => {
    const frame = generateLteBand3Fdd20mReferenceFrame();
    for (let subframe = 0; subframe < 10; subframe += 1) {
      const firstSymbol = subframe * 14;
      let pdcchNilElements = 0;
      for (let subcarrier = 0; subcarrier < 1_200; subcarrier += 1) {
        const index = firstSymbol * 1_200 + subcarrier;
        if (
          frame.grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.reserved
          && frame.grid.real[index] === 0
          && frame.grid.imaginary[index] === 0
          && subcarrier % 6 !== 4
        ) {
          pdcchNilElements += 1;
        }
      }
      expect(pdcchNilElements).toBe(28);
    }
  });

  it('is deterministic and exposes stable full-grid/full-frame identities', () => {
    const first = generateLteBand3Fdd20mReferenceFrame();
    const second = generateLteBand3Fdd20mReferenceFrame();
    const firstGrid = encodeCf64le(first.grid.real, first.grid.imaginary);
    const secondGrid = encodeCf64le(second.grid.real, second.grid.imaginary);
    const firstTime = encodeCf64le(first.timeDomain.real, first.timeDomain.imaginary);
    const secondTime = encodeCf64le(second.timeDomain.real, second.timeDomain.imaginary);
    expect(secondGrid).toEqual(firstGrid);
    expect(secondTime).toEqual(firstTime);
    const identities = {
      gridCf64leSha256: sha256(firstGrid),
      timeCf64leSha256: sha256(firstTime),
    };
    expect(identities).toEqual(LTE_BAND3_FDD_20M_REFERENCE_IDENTITIES);
  });
});
