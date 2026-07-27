import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LTE_NTM_ACTIVE_SUBCARRIERS,
  LTE_NTM_FFT_SIZE,
  LTE_NTM_FRAME_SAMPLES,
  LTE_NTM_PROFILES,
  LTE_NTM_REFERENCE_IDENTITIES,
  LTE_NTM_SAMPLE_RATE_HZ,
  generateLteNtmReferenceFrame,
} from './lte-ntm-reference.js';

function identity(real: Float64Array, imaginary: Float64Array): string {
  const bytes = new Uint8Array(real.length * 16);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < real.length; index += 1) {
    view.setFloat64(index * 16, real[index]!, true);
    view.setFloat64(index * 16 + 8, imaginary[index]!, true);
  }
  return createHash('sha256').update(bytes).digest('hex');
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
    const identities = {
      gridCf64leSha256: identity(frame.grid.real, frame.grid.imaginary),
      timeCf64leSha256: identity(
        frame.timeDomain.real,
        frame.timeDomain.imaginary,
      ),
    };
    expect(identities).toEqual(LTE_NTM_REFERENCE_IDENTITIES[profile]);
  });
});
