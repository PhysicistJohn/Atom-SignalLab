import { describe, expect, it } from 'vitest';
import {
  LTE_ETM3_CATALOG_CF32LE_SHA256,
  LTE_ETM3_CATALOG_CHANNEL_BANDWIDTH_HZ,
  LTE_ETM3_CATALOG_DIGITAL_QUALIFICATION,
  LTE_ETM3_CATALOG_FRAME_SAMPLES,
  LTE_ETM3_CATALOG_SAMPLE_RATE_HZ,
  encodeLteEtm3CatalogFrameCf32le,
  synthesizeLteEtm3CatalogIq,
  verifyLteEtm3CatalogFrameIdentity,
} from './lte-etm3-catalog-iq.js';
import { LTE_ETM3_REFERENCE_PROFILES } from './lte-etm3-reference.js';

describe('catalog-facing fixed LTE E-TM3 I/Q replay', () => {
  it.each(LTE_ETM3_REFERENCE_PROFILES)('%s pins its complete cf32le frame', (profile) => {
    expect(encodeLteEtm3CatalogFrameCf32le(profile)).toHaveLength(
      LTE_ETM3_CATALOG_FRAME_SAMPLES * 8,
    );
    expect(verifyLteEtm3CatalogFrameIdentity(profile)).toBe(
      LTE_ETM3_CATALOG_CF32LE_SHA256[profile],
    );
  });

  it.each(LTE_ETM3_REFERENCE_PROFILES)(
    '%s returns deterministic cyclic slices only at exact geometry',
    (profile) => {
      const frame = encodeLteEtm3CatalogFrameCf32le(profile);
      const replay = synthesizeLteEtm3CatalogIq({
        profile,
        sampleRateHz: LTE_ETM3_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: LTE_ETM3_CATALOG_CHANNEL_BANDWIDTH_HZ,
        sampleCount: 5,
        startSampleIndex: LTE_ETM3_CATALOG_FRAME_SAMPLES - 2,
      });
      expect(replay.subarray(0, 16)).toEqual(frame.subarray(frame.length - 16));
      expect(replay.subarray(16)).toEqual(frame.subarray(0, 24));
    },
  );

  it.each(LTE_ETM3_REFERENCE_PROFILES)(
    '%s rejects resampling, filtering, and oversized captures',
    (profile) => {
      const valid = {
        profile,
        sampleRateHz: LTE_ETM3_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: LTE_ETM3_CATALOG_CHANNEL_BANDWIDTH_HZ,
        sampleCount: 1,
      } as const;
      expect(() => synthesizeLteEtm3CatalogIq({
        ...valid,
        sampleRateHz: valid.sampleRateHz * 2,
      })).toThrow(/resampling is forbidden/);
      expect(() => synthesizeLteEtm3CatalogIq({
        ...valid,
        bandwidthHz: 9_000_000,
      })).toThrow(/filtering is forbidden/);
      expect(() => synthesizeLteEtm3CatalogIq({
        ...valid,
        sampleCount: 65_537,
      })).toThrow(/sample count/);
    },
  );

  it('promotes all three independently covered modulation variants', () => {
    for (const qualification of Object.values(LTE_ETM3_CATALOG_DIGITAL_QUALIFICATION)) {
      expect(qualification.state).toBe('independently-verified');
      expect(qualification.rfConformance).toBe('not-claimed');
      expect(qualification.productCertification).toBe('not-claimed');
    }
  });
});
