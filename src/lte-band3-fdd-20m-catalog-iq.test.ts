import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE,
  LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256,
  encodeLteBand3Fdd20mCatalogFrameCf32le,
  synthesizeLteBand3Fdd20mCatalogIq,
  verifyLteBand3Fdd20mCatalogFrameIdentity,
} from './lte-band3-fdd-20m-catalog-iq.js';
import {
  LTE_BAND3_FDD_20M_FRAME_SAMPLES,
  generateLteBand3Fdd20mReferenceFrame,
} from './lte-band3-fdd-20m-reference.js';

describe('fixed LTE Band-3 FDD catalog adapter', () => {
  it('performs only component-wise float64-to-float32 encoding', () => {
    const frame = encodeLteBand3Fdd20mCatalogFrameCf32le();
    const reference = generateLteBand3Fdd20mReferenceFrame().timeDomain;
    expect(frame).toHaveLength(
      LTE_BAND3_FDD_20M_FRAME_SAMPLES
      * LTE_BAND3_FDD_20M_CATALOG_BYTES_PER_SAMPLE,
    );
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    for (const sample of [0, 1, 2_047, 153_600, 307_199]) {
      expect(view.getFloat32(sample * 8, true))
        .toBe(Math.fround(reference.real[sample]!));
      expect(view.getFloat32(sample * 8 + 4, true))
        .toBe(Math.fround(reference.imaginary[sample]!));
    }
    expect(createHash('sha256').update(frame).digest('hex'))
      .toBe(LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256);
    expect(verifyLteBand3Fdd20mCatalogFrameIdentity())
      .toBe(LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256);
  });

  it('replays clean bytes exactly across the fixed-frame boundary', () => {
    const frame = encodeLteBand3Fdd20mCatalogFrameCf32le();
    const replay = synthesizeLteBand3Fdd20mCatalogIq({
      sampleRateHz: 30_720_000,
      bandwidthHz: 20_000_000,
      sampleCount: 4,
      startSampleIndex: LTE_BAND3_FDD_20M_FRAME_SAMPLES - 2,
    });
    expect(replay.subarray(0, 16)).toEqual(frame.subarray(frame.length - 16));
    expect(replay.subarray(16)).toEqual(frame.subarray(0, 16));
  });

  it('fails closed for any geometry or unsafe index mutation', () => {
    const valid = {
      sampleRateHz: 30_720_000,
      bandwidthHz: 20_000_000,
      sampleCount: 8,
      startSampleIndex: 0,
    };
    expect(() => synthesizeLteBand3Fdd20mCatalogIq({
      ...valid,
      sampleRateHz: 15_360_000,
    })).toThrow(/resampling is forbidden/i);
    expect(() => synthesizeLteBand3Fdd20mCatalogIq({
      ...valid,
      bandwidthHz: 18_000_000,
    })).toThrow(/filtering is forbidden/i);
    expect(() => synthesizeLteBand3Fdd20mCatalogIq({
      ...valid,
      sampleCount: 0,
    })).toThrow(/sample count/i);
    expect(() => synthesizeLteBand3Fdd20mCatalogIq({
      ...valid,
      startSampleIndex: -1,
    })).toThrow(/start sample/i);
  });
});
