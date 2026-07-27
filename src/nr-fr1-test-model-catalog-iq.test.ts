import { describe, expect, it } from 'vitest';
import {
  NR_FR1_TM_CATALOG_CF32LE_SHA256,
  NR_FR1_TM_CATALOG_CHANNEL_BANDWIDTH_HZ,
  NR_FR1_TM_CATALOG_DIGITAL_QUALIFICATION,
  NR_FR1_TM_CATALOG_FRAME_SAMPLES,
  NR_FR1_TM_CATALOG_SAMPLE_RATE_HZ,
  encodeNrFr1TmCatalogFrameCf32le,
  synthesizeNrFr1TmCatalogIq,
  verifyNrFr1TmCatalogFrameIdentity,
} from './nr-fr1-test-model-catalog-iq.js';
import { NR_FR1_TEST_MODEL_PROFILES } from './nr-fr1-test-model-reference.js';

describe('catalog-facing fixed NR-FR1 test-model I/Q replay', () => {
  it.each(NR_FR1_TEST_MODEL_PROFILES)(
    '%s pins its complete cf32le frame',
    (profile) => {
      expect(encodeNrFr1TmCatalogFrameCf32le(profile)).toHaveLength(
        NR_FR1_TM_CATALOG_FRAME_SAMPLES * 8,
      );
      expect(verifyNrFr1TmCatalogFrameIdentity(profile)).toBe(
        NR_FR1_TM_CATALOG_CF32LE_SHA256[profile],
      );
    },
    30_000,
  );

  it.each(NR_FR1_TEST_MODEL_PROFILES)(
    '%s returns deterministic cyclic slices only at exact geometry',
    (profile) => {
      const frame = encodeNrFr1TmCatalogFrameCf32le(profile);
      const replay = synthesizeNrFr1TmCatalogIq({
        profile,
        sampleRateHz: NR_FR1_TM_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: NR_FR1_TM_CATALOG_CHANNEL_BANDWIDTH_HZ,
        sampleCount: 5,
        startSampleIndex: NR_FR1_TM_CATALOG_FRAME_SAMPLES - 2,
      });
      expect(replay.subarray(0, 16)).toEqual(frame.subarray(frame.length - 16));
      expect(replay.subarray(16)).toEqual(frame.subarray(0, 24));
    },
    30_000,
  );

  it.each(NR_FR1_TEST_MODEL_PROFILES)(
    '%s rejects resampling, filtering, and invalid capture bounds',
    (profile) => {
      const valid = {
        profile,
        sampleRateHz: NR_FR1_TM_CATALOG_SAMPLE_RATE_HZ,
        bandwidthHz: NR_FR1_TM_CATALOG_CHANNEL_BANDWIDTH_HZ,
        sampleCount: 1,
      } as const;
      expect(() => synthesizeNrFr1TmCatalogIq({
        ...valid,
        sampleRateHz: valid.sampleRateHz * 2,
      })).toThrow(/resampling is forbidden/);
      expect(() => synthesizeNrFr1TmCatalogIq({
        ...valid,
        bandwidthHz: 10_000_000,
      })).toThrow(/filtering is forbidden/);
      expect(() => synthesizeNrFr1TmCatalogIq({
        ...valid,
        sampleCount: 65_537,
      })).toThrow(/sample count/);
      expect(() => synthesizeNrFr1TmCatalogIq({
        ...valid,
        startSampleIndex: -1,
      })).toThrow(/start sample/);
    },
  );

  it('keeps the independently verified claim inside the fixed digital boundary', () => {
    for (const qualification of Object.values(
      NR_FR1_TM_CATALOG_DIGITAL_QUALIFICATION,
    )) {
      expect(qualification.state).toBe('independently-verified');
      expect(qualification.scope).toBe('fixed-digital-complex-baseband');
      expect(qualification.rfConformance).toBe('not-claimed');
      expect(qualification.productCertification).toBe('not-claimed');
    }
  });
});
