import { describe, expect, it } from 'vitest';
import {
  LTE_NTM_CATALOG_CF32LE_SHA256,
  LTE_NTM_DIGITAL_QUALIFICATION,
  encodeLteNtmCatalogFrameCf32le,
  synthesizeLteNtmCatalogIq,
  verifyLteNtmCatalogFrameIdentity,
} from './lte-ntm-catalog-iq.js';
import {
  LTE_NTM_FRAME_SAMPLES,
  LTE_NTM_PROFILES,
  LTE_NTM_SAMPLE_RATE_HZ,
} from './lte-ntm-reference.js';
import { sha256HexOfBytes } from './platform-bytes.js';

describe('fixed N-TM catalog adapters', () => {
  it.each(LTE_NTM_PROFILES)('%s pins its complete cf32le frame', (profile) => {
    const frame = encodeLteNtmCatalogFrameCf32le(profile);
    expect(frame).toHaveLength(LTE_NTM_FRAME_SAMPLES * 8);
    expect(sha256HexOfBytes(frame)).toBe(LTE_NTM_CATALOG_CF32LE_SHA256[profile]);
    expect(verifyLteNtmCatalogFrameIdentity(profile))
      .toBe(LTE_NTM_CATALOG_CF32LE_SHA256[profile]);
    expect(LTE_NTM_DIGITAL_QUALIFICATION[profile]).toMatchObject({
      state: 'independently-verified',
      rfConformance: 'not-claimed',
      productCertification: 'not-claimed',
      compositePlacementAndPower: 'not-claimed',
    });
  });

  it.each(LTE_NTM_PROFILES)('%s replays clean frame slices only', (profile) => {
    const frame = encodeLteNtmCatalogFrameCf32le(profile);
    const chunk = synthesizeLteNtmCatalogIq({
      profile,
      sampleRateHz: LTE_NTM_SAMPLE_RATE_HZ,
      bandwidthHz: 180_000,
      sampleCount: 7,
      startSampleIndex: LTE_NTM_FRAME_SAMPLES - 3,
    });
    expect(chunk).toEqual(new Uint8Array([
      ...frame.subarray((LTE_NTM_FRAME_SAMPLES - 3) * 8),
      ...frame.subarray(0, 4 * 8),
    ]));
  });

  it('rejects transformations and unsafe ranges', () => {
    const valid = {
      profile: 'lte-ntm' as const,
      sampleRateHz: LTE_NTM_SAMPLE_RATE_HZ,
      bandwidthHz: 180_000,
      sampleCount: 1,
    };
    expect(() => synthesizeLteNtmCatalogIq({
      ...valid,
      sampleRateHz: LTE_NTM_SAMPLE_RATE_HZ + 1,
    })).toThrow(/resampling is forbidden/);
    expect(() => synthesizeLteNtmCatalogIq({
      ...valid,
      bandwidthHz: 179_999,
    })).toThrow(/filtering is forbidden/);
    for (const sampleCount of [0, 65_537, 1.5, Number.NaN]) {
      expect(() => synthesizeLteNtmCatalogIq({ ...valid, sampleCount }))
        .toThrow(RangeError);
    }
  });
});
