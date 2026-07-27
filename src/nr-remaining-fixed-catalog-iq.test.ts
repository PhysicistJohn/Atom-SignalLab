import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_REMAINING_FIXED_CF32LE_SHA256,
  NR_REMAINING_FIXED_DIGITAL_QUALIFICATION,
  NR_REMAINING_FIXED_PROFILES,
  encodeNrRemainingFixedFrameCf32le,
  nrRemainingFixedGeometry,
  synthesizeNrRemainingFixedCatalogIq,
  verifyNrRemainingFixedFrameIdentity,
} from './nr-remaining-fixed-catalog-iq.js';

describe('remaining fixed NR catalog I/Q adapters', () => {
  it('pins the complete cf32le artifact for all three exact profile bindings', () => {
    for (const profile of NR_REMAINING_FIXED_PROFILES) {
      const bytes = encodeNrRemainingFixedFrameCf32le(profile);
      const geometry = nrRemainingFixedGeometry(profile);
      expect(bytes).toHaveLength(geometry.frameSampleCount * 8);
      expect(sha256HexOfBytes(bytes)).toBe(
        NR_REMAINING_FIXED_CF32LE_SHA256[profile],
      );
      expect(verifyNrRemainingFixedFrameIdentity(profile)).toBe(
        NR_REMAINING_FIXED_CF32LE_SHA256[profile],
      );
      expect(
        NR_REMAINING_FIXED_DIGITAL_QUALIFICATION[profile],
      ).toMatchObject({
        state: 'independently-verified',
        scope: profile === 'nr-nbiot-inband-isolated-component'
          ? 'fixed-digital-component-complex-baseband'
          : 'fixed-digital-complex-baseband',
        outputCf32leSha256:
          NR_REMAINING_FIXED_CF32LE_SHA256[profile],
        rfConformance: 'not-claimed',
        productCertification: 'not-claimed',
      });
    }
  }, 30_000);

  it('streams exact frame slices and wraps only at the content-addressed frame boundary', () => {
    for (const profile of NR_REMAINING_FIXED_PROFILES) {
      const geometry = nrRemainingFixedGeometry(profile);
      const frame = encodeNrRemainingFixedFrameCf32le(profile);
      const startSampleIndex = geometry.frameSampleCount - 3;
      const chunk = synthesizeNrRemainingFixedCatalogIq({
        profile,
        sampleRateHz: geometry.sampleRateHz,
        bandwidthHz: geometry.bandwidthHz,
        sampleCount: 7,
        startSampleIndex,
      });
      expect(chunk).toEqual(new Uint8Array([
        ...frame.subarray(startSampleIndex * 8),
        ...frame.subarray(0, 4 * 8),
      ]));
    }
  }, 30_000);

  it('forbids every operation that would change the qualified bytes', () => {
    for (const profile of NR_REMAINING_FIXED_PROFILES) {
      const geometry = nrRemainingFixedGeometry(profile);
      const valid = {
        profile,
        sampleRateHz: geometry.sampleRateHz,
        bandwidthHz: geometry.bandwidthHz,
        sampleCount: 1,
      };
      expect(() => synthesizeNrRemainingFixedCatalogIq({
        ...valid,
        sampleRateHz: geometry.sampleRateHz + 1,
      })).toThrow(/resampling is forbidden/);
      expect(() => synthesizeNrRemainingFixedCatalogIq({
        ...valid,
        bandwidthHz: geometry.bandwidthHz - 1,
      })).toThrow(/filtering is forbidden/);
      for (const sampleCount of [0, 65_537, 1.5, Number.NaN]) {
        expect(() => synthesizeNrRemainingFixedCatalogIq({
          ...valid,
          sampleCount,
        })).toThrow(RangeError);
      }
      for (const startSampleIndex of [-1, 1.5, Number.NaN]) {
        expect(() => synthesizeNrRemainingFixedCatalogIq({
          ...valid,
          startSampleIndex,
        })).toThrow(RangeError);
      }
    }
  }, 30_000);
});
