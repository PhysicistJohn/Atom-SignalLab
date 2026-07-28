import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EXACT_FLOAT_PINS_REPRODUCIBLE_HERE,
  IDENTITY_QUANTIZATION_DECIMALS,
  quantizedComplexSeries,
} from './architecture-identity.js';
import {
  LTE_NTM_ACTIVE_SUBCARRIERS,
  LTE_NTM_FFT_SIZE,
  LTE_NTM_FRAME_SAMPLES,
  LTE_NTM_PROFILES,
  LTE_NTM_REFERENCE_IDENTITIES,
  LTE_NTM_SAMPLE_RATE_HZ,
  generateLteNtmReferenceFrame,
  type LteNtmProfile,
} from './lte-ntm-reference.js';

/**
 * Quantized companions to LTE_NTM_REFERENCE_IDENTITIES. The exact cf64le pins in
 * the generator module bind the last mantissa bit of libm output and so are only
 * reproducible on the architecture that authored them. These digests hash the
 * same series rounded to IDENTITY_QUANTIZATION_DECIMALS decimals, which is far
 * coarser than last-ulp yet far finer than any real change to the waveform, so
 * they are asserted on every architecture.
 */
const LTE_NTM_QUANTIZED_REFERENCE_IDENTITIES: Readonly<
  Record<LteNtmProfile, { gridSha256: string; timeSha256: string }>
> = Object.freeze({
  'lte-ntm': Object.freeze({
    gridSha256:
      'c18c5d94c8327f90d3c8f131c26fff625bdf67858404d507fa12549fc4509157',
    timeSha256:
      '0480fb3bf17cb2b6aca5b920256e14ce7e01304e90be7faf733158a8558cb3e6',
  }),
  // Identical to 'lte-ntm' by construction: the guard-isolated component carries
  // the same component bytes, as the byte-equality test above asserts directly.
  'lte-nbiot-guard-isolated-component': Object.freeze({
    gridSha256:
      'c18c5d94c8327f90d3c8f131c26fff625bdf67858404d507fa12549fc4509157',
    timeSha256:
      '0480fb3bf17cb2b6aca5b920256e14ce7e01304e90be7faf733158a8558cb3e6',
  }),
  'lte-nbiot-inband-isolated-component': Object.freeze({
    gridSha256:
      '4e41fe14af74f44df1f8a0a3de75a20dff3af5739424b7d21a5960fc1bf24368',
    timeSha256:
      '5d7f4f0885c74deb9d9cb0b60ef5e15450e1b3deb08d212a20f03f9c7a8da8f8',
  }),
});

function identity(real: Float64Array, imaginary: Float64Array): string {
  const bytes = new Uint8Array(real.length * 16);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < real.length; index += 1) {
    view.setFloat64(index * 16, real[index]!, true);
    view.setFloat64(index * 16 + 8, imaginary[index]!, true);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

function quantizedIdentity(real: Float64Array, imaginary: Float64Array): string {
  return createHash('sha256')
    .update(quantizedComplexSeries(real, imaginary, IDENTITY_QUANTIZATION_DECIMALS))
    .digest('hex');
}

describe('fixed LTE NB-IoT N-TM digital references', () => {
  it.each(LTE_NTM_PROFILES)('%s binds exact frame geometry and safe claim boundaries', (profile) => {
    const frame = generateLteNtmReferenceFrame(profile);
    expect(frame.metadata).toMatchObject({
      profileId: profile,
      physicalCellId: 103,
      antennaPort: 1_000,
      subcarrierSpacingHz: 15_000,
      cyclicPrefix: 'normal',
      sampleRateHz: LTE_NTM_SAMPLE_RATE_HZ,
      sampleCount: LTE_NTM_FRAME_SAMPLES,
      compositeHostIncluded: false,
      qualification: 'fixed-digital-candidate',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
    });
    expect(frame.grid.symbolCount).toBe(140);
    expect(frame.grid.subcarrierCount).toBe(LTE_NTM_ACTIVE_SUBCARRIERS);
    expect(frame.grid.real).toHaveLength(1_680);
    expect(frame.grid.imaginary).toHaveLength(1_680);
    expect(frame.grid.kinds).toHaveLength(1_680);
    expect(frame.timeDomain.real).toHaveLength(LTE_NTM_FRAME_SAMPLES);
    expect(frame.timeDomain.imaginary).toHaveLength(LTE_NTM_FRAME_SAMPLES);
    expect(LTE_NTM_FFT_SIZE).toBe(128);
    expect(
      Object.values(frame.metadata.resourceElementCounts)
        .reduce((sum, count) => sum + count, 0),
    ).toBe(1_680);
  });

  it('keeps standalone and guard-isolated component bytes identical', () => {
    const standalone = generateLteNtmReferenceFrame('lte-ntm');
    const guard = generateLteNtmReferenceFrame(
      'lte-nbiot-guard-isolated-component',
    );
    expect(guard.grid.real).toEqual(standalone.grid.real);
    expect(guard.grid.imaginary).toEqual(standalone.grid.imaginary);
    expect(guard.timeDomain.real).toEqual(standalone.timeDomain.real);
    expect(guard.timeDomain.imaginary).toEqual(standalone.timeDomain.imaginary);
  });

  it.each(LTE_NTM_PROFILES)('%s exposes stable full-grid/full-frame identities', (profile) => {
    const frame = generateLteNtmReferenceFrame(profile);

    // Asserted everywhere: a generator that changed the waveform moves these.
    expect({
      gridSha256: quantizedIdentity(frame.grid.real, frame.grid.imaginary),
      timeSha256: quantizedIdentity(
        frame.timeDomain.real,
        frame.timeDomain.imaginary,
      ),
    }).toEqual(LTE_NTM_QUANTIZED_REFERENCE_IDENTITIES[profile]);

    // Asserted only on the architecture the exact cf64le pins were authored on.
    if (EXACT_FLOAT_PINS_REPRODUCIBLE_HERE) {
      const identities = {
        gridCf64leSha256: identity(frame.grid.real, frame.grid.imaginary),
        timeCf64leSha256: identity(
          frame.timeDomain.real,
          frame.timeDomain.imaginary,
        ),
      };
      expect(identities).toEqual(LTE_NTM_REFERENCE_IDENTITIES[profile]);
    }
  });
});
