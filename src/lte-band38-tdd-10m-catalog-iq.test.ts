import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LTE_BAND38_TDD_10M_CATALOG_BYTES_PER_SAMPLE,
  LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256,
  encodeLteBand38Tdd10mCatalogFrameCf32le,
  synthesizeLteBand38Tdd10mCatalogIq,
  verifyLteBand38Tdd10mCatalogFrameIdentity,
} from './lte-band38-tdd-10m-catalog-iq.js';
import {
  LTE_BAND38_TDD_10M_FRAME_SAMPLES,
  generateLteBand38Tdd10mReferenceFrame,
} from './lte-band38-tdd-10m-reference.js';

describe('fixed LTE Band-38 TDD catalog adapter', () => {
  it('performs only component-wise float64-to-float32 encoding', () => {
    const frame = encodeLteBand38Tdd10mCatalogFrameCf32le();
    const reference = generateLteBand38Tdd10mReferenceFrame().timeDomain;
    expect(frame).toHaveLength(
      LTE_BAND38_TDD_10M_FRAME_SAMPLES
      * LTE_BAND38_TDD_10M_CATALOG_BYTES_PER_SAMPLE,
    );
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    for (const sample of [0, 1, 1_023, 76_800, 153_599]) {
      expect(view.getFloat32(sample * 8, true))
        .toBe(Math.fround(reference.real[sample]!));
      expect(view.getFloat32(sample * 8 + 4, true))
        .toBe(Math.fround(reference.imaginary[sample]!));
    }
    expect(createHash('sha256').update(frame).digest('hex'))
      .toBe(LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256);
    expect(verifyLteBand38Tdd10mCatalogFrameIdentity())
      .toBe(LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256);
  });

  it('replays clean bytes exactly across the fixed-frame boundary', () => {
    const frame = encodeLteBand38Tdd10mCatalogFrameCf32le();
    const replay = synthesizeLteBand38Tdd10mCatalogIq({
      sampleRateHz: 15_360_000,
      bandwidthHz: 10_000_000,
      sampleCount: 4,
      startSampleIndex: LTE_BAND38_TDD_10M_FRAME_SAMPLES - 2,
    });
    expect(replay.subarray(0, 16)).toEqual(frame.subarray(frame.length - 16));
    expect(replay.subarray(16)).toEqual(frame.subarray(0, 16));
  });

  it('fails closed for any geometry or unsafe index mutation', () => {
    const valid = {
      sampleRateHz: 15_360_000,
      bandwidthHz: 10_000_000,
      sampleCount: 8,
      startSampleIndex: 0,
    };
    expect(() => synthesizeLteBand38Tdd10mCatalogIq({
      ...valid,
      sampleRateHz: 30_720_000,
    })).toThrow(/resampling is forbidden/i);
    expect(() => synthesizeLteBand38Tdd10mCatalogIq({
      ...valid,
      bandwidthHz: 9_000_000,
    })).toThrow(/filtering is forbidden/i);
    expect(() => synthesizeLteBand38Tdd10mCatalogIq({
      ...valid,
      sampleCount: 0,
    })).toThrow(/sample count/i);
    expect(() => synthesizeLteBand38Tdd10mCatalogIq({
      ...valid,
      startSampleIndex: -1,
    })).toThrow(/start sample/i);
  });
});
