import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import { generateLteEtm11ReferenceFrame } from './lte-etm1-reference.js';
import {
  LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE,
  LTE_ETM1_1_CATALOG_CF32LE_SHA256,
  LTE_ETM1_1_CATALOG_CHANNEL_BANDWIDTH_HZ,
  LTE_ETM1_1_CATALOG_DIGITAL_QUALIFICATION,
  LTE_ETM1_1_CATALOG_FRAME_SAMPLES,
  LTE_ETM1_1_CATALOG_SAMPLE_RATE_HZ,
  encodeLteEtm11CatalogFrameCf32le,
  synthesizeLteEtm11CatalogIq,
  verifyLteEtm11CatalogFrameIdentity,
} from './lte-etm1-catalog-iq.js';

const exactInput = Object.freeze({
  sampleRateHz: LTE_ETM1_1_CATALOG_SAMPLE_RATE_HZ,
  bandwidthHz: LTE_ETM1_1_CATALOG_CHANNEL_BANDWIDTH_HZ,
});

describe('catalog-facing fixed LTE E-TM1.1 I/Q replay', () => {
  it('pins the full cf32le transform of the independently compared cf64le frame', () => {
    const encoded = encodeLteEtm11CatalogFrameCf32le();
    const frame = generateLteEtm11ReferenceFrame();
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);

    expect(encoded.byteLength).toBe(
      LTE_ETM1_1_CATALOG_FRAME_SAMPLES * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE,
    );
    expect(verifyLteEtm11CatalogFrameIdentity()).toBe(LTE_ETM1_1_CATALOG_CF32LE_SHA256);
    expect(sha256HexOfBytes(encoded)).toBe(
      '64515628a900f0422e67c8cdd9b2209c70aaaa467f1d533f99080ac110f340c7',
    );

    for (let sample = 0; sample < LTE_ETM1_1_CATALOG_FRAME_SAMPLES; sample += 1) {
      const byteOffset = sample * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE;
      expect(view.getFloat32(byteOffset, true)).toBe(
        Math.fround(frame.timeDomain.real[sample]!),
      );
      expect(view.getFloat32(byteOffset + 4, true)).toBe(
        Math.fround(frame.timeDomain.imaginary[sample]!),
      );
    }
  });

  it('returns exact slices and wraps only as an explicit cyclic artifact replay', () => {
    const frame = encodeLteEtm11CatalogFrameCf32le();
    const startSampleIndex = LTE_ETM1_1_CATALOG_FRAME_SAMPLES - 3;
    const replay = synthesizeLteEtm11CatalogIq({
      ...exactInput,
      sampleCount: 7,
      startSampleIndex,
    });
    const expected = new Uint8Array(7 * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE);
    for (let sample = 0; sample < 7; sample += 1) {
      const frameSample = (startSampleIndex + sample) % LTE_ETM1_1_CATALOG_FRAME_SAMPLES;
      expected.set(
        frame.subarray(
          frameSample * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE,
          (frameSample + 1) * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE,
        ),
        sample * LTE_ETM1_1_CATALOG_BYTES_PER_SAMPLE,
      );
    }
    expect(replay).toEqual(expected);
  });

  it('is deterministic, non-aliasing, and bounded by the bridge sample limit', () => {
    const first = synthesizeLteEtm11CatalogIq({
      ...exactInput,
      sampleCount: 65_536,
      startSampleIndex: 70_001,
    });
    const second = synthesizeLteEtm11CatalogIq({
      ...exactInput,
      sampleCount: 65_536,
      startSampleIndex: 70_001,
    });
    expect(second).toEqual(first);
    first[0] = first[0]! ^ 0xff;
    expect(second[0]).not.toBe(first[0]);
  });

  it.each([
    [{ ...exactInput, sampleRateHz: 30_720_000, sampleCount: 1 }, /resampling is forbidden/],
    [{ ...exactInput, bandwidthHz: 9_000_000, sampleCount: 1 }, /filtering is forbidden/],
    [{ ...exactInput, sampleCount: 0 }, /sample count/],
    [{ ...exactInput, sampleCount: 65_537 }, /sample count/],
    [{ ...exactInput, sampleCount: 1, startSampleIndex: -1 }, /start sample/],
    [{ ...exactInput, sampleCount: 1, startSampleIndex: 0.5 }, /start sample/],
  ] as const)('rejects geometry outside the exact tested subject: %o', (input, expected) => {
    expect(() => synthesizeLteEtm11CatalogIq(input)).toThrow(expected);
  });

  it('states a narrow digital claim and explicitly excludes RF and product qualification', () => {
    expect(LTE_ETM1_1_CATALOG_DIGITAL_QUALIFICATION).toMatchObject({
      scope: 'fixed-digital-complex-baseband',
      state: 'independently-verified',
      rfConformance: 'not-claimed',
      productCertification: 'not-claimed',
      outputFrameSha256: LTE_ETM1_1_CATALOG_CF32LE_SHA256,
    });
    expect(LTE_ETM1_1_CATALOG_DIGITAL_QUALIFICATION.forbiddenPostProcessing).toEqual(
      expect.arrayContaining(['filtering', 'resampling', 'receiver impairment']),
    );
  });
});
