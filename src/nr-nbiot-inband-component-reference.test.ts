import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  EXACT_FLOAT_PINS_REPRODUCIBLE_HERE,
  IDENTITY_QUANTIZATION_DECIMALS,
  quantizedComplexSeries,
} from './architecture-identity.js';
import {
  LTE_NTM_REFERENCE_IDENTITIES,
  generateLteNtmReferenceFrame,
} from './lte-ntm-reference.js';
import {
  NR_NBIOT_INBAND_COMPONENT_BINDING,
  NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES,
  generateNrNbiotInbandComponentReferenceFrame,
} from './nr-nbiot-inband-component-reference.js';

/**
 * Quantized companion to NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES. The
 * exact cf64le pins bind the last mantissa bit of libm output and so are only
 * reproducible on the architecture that authored them. These digests hash the
 * same series rounded to IDENTITY_QUANTIZATION_DECIMALS decimals, far coarser
 * than last-ulp yet far finer than any real change to the waveform, so they are
 * asserted on every architecture.
 */
const NR_NBIOT_INBAND_COMPONENT_QUANTIZED_REFERENCE_IDENTITIES = Object.freeze({
  gridSha256:
    '4e41fe14af74f44df1f8a0a3de75a20dff3af5739424b7d21a5960fc1bf24368',
  timeSha256:
    '5d7f4f0885c74deb9d9cb0b60ef5e15450e1b3deb08d212a20f03f9c7a8da8f8',
});

function quantizedIdentity(
  real: Float64Array,
  imaginary: Float64Array,
): string {
  return sha256HexOfBytes(
    quantizedComplexSeries(real, imaginary, IDENTITY_QUANTIZATION_DECIMALS),
  );
}

describe('fixed NR-N-TM imported NB-IoT in-band component', () => {
  it('binds the exact imported Release 19 component and keeps the composite boundary explicit', () => {
    expect(NR_NBIOT_INBAND_COMPONENT_BINDING).toEqual({
      parentSpecification:
        '3GPP TS 38.141-1 V19.4.0 (Release 19)',
      importedTestModelSpecification:
        '3GPP TS 36.141 V19.1.0 (Release 19)',
      physicalLayerSpecification:
        '3GPP TS 36.211 V19.3.0 (Release 19)',
      parentClauses: [
        '38.141-1 4.9.2.2.9',
        '38.141-1 4.9.2.4',
        '38.141-1 4.9.3',
      ],
      importedClauses: [
        '36.141 6.1.3',
        '36.141 6.1.4',
        '36.141 6.1.6 (N-TM component only)',
        '36.211 10.2.3-10.2.8',
      ],
      fixedWaveform:
        'TS-36.141-N-TM-inband-isolated-component',
      deploymentMode: 'inband-different-pci-isolated-component',
      physicalCellId: 103,
      hostPhysicalCellId: 1,
      subcarrierSpacingHz: 15_000,
      activeSubcarrierCount: 12,
      nominalGridBandwidthHz: 180_000,
      fftSize: 128,
      sampleRateHz: 1_920_000,
      frameDurationMs: 10,
      frameSampleCount: 19_200,
      cyclicPrefix: 'normal',
      parentDisplayCenterHz: 3_500_010_000,
      zeroIfComponent: true,
      nrHostIncluded: false,
      eligiblePuncturedRbPlacementIncluded: false,
      hostComponentPowerAllocationIncluded: false,
    });
  });

  it('is exhaustively content-identical to the independently compared TS 36.141 in-band component', () => {
    const bound = generateNrNbiotInbandComponentReferenceFrame();
    const inherited = generateLteNtmReferenceFrame(
      'lte-nbiot-inband-isolated-component',
    );
    expect(bound.metadata).toMatchObject({
      profileId: 'nr-nbiot-inband-isolated-component',
      qualification:
        'independently-verified-fixed-digital-component',
      verificationBasis:
        'content-identical-to-ts36.141-ntm-inband-component-oracle',
      standardsComplianceClaimed: false,
      nrNtmCompositeClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
    });
    expect(bound.grid.kinds).toEqual(inherited.grid.kinds);
    expect(bound.grid.real).toEqual(inherited.grid.real);
    expect(bound.grid.imaginary).toEqual(inherited.grid.imaginary);
    expect(bound.timeDomain.real).toEqual(inherited.timeDomain.real);
    expect(bound.timeDomain.imaginary).toEqual(
      inherited.timeDomain.imaginary,
    );
    // Asserted everywhere: a generator that changed the waveform moves these.
    expect({
      gridSha256: quantizedIdentity(bound.grid.real, bound.grid.imaginary),
      timeSha256: quantizedIdentity(
        bound.timeDomain.real,
        bound.timeDomain.imaginary,
      ),
    }).toEqual(NR_NBIOT_INBAND_COMPONENT_QUANTIZED_REFERENCE_IDENTITIES);

    // Asserted only on the architecture the exact cf64le pins were authored on.
    if (EXACT_FLOAT_PINS_REPRODUCIBLE_HERE) {
      expect(
        sha256HexOfBytes(encodeCf64le(
          bound.grid.real,
          bound.grid.imaginary,
        )),
      ).toBe(NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES.gridCf64leSha256);
      expect(
        sha256HexOfBytes(encodeCf64le(
          bound.timeDomain.real,
          bound.timeDomain.imaginary,
        )),
      ).toBe(
        NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES.timeCf64leSha256,
      );
    }
    expect(NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES).toEqual(
      LTE_NTM_REFERENCE_IDENTITIES[
        'lte-nbiot-inband-isolated-component'
      ],
    );
  });

  it('does not let a passing component oracle become a complete NR-N-TM claim', () => {
    const metadata =
      generateNrNbiotInbandComponentReferenceFrame().metadata;
    expect(metadata.requirementLedger).toHaveLength(1);
    expect(metadata.qualificationScope).toContain(
      'parent NR carrier',
    );
    expect(metadata.excludedScope.join(' ')).toContain(
      'complete TS 38.141-1',
    );
    expect(metadata.excludedScope.join(' ')).toContain(
      'eligible punctured NR RB',
    );
    expect(metadata.excludedScope.join(' ')).toContain(
      'power allocation',
    );
    expect(metadata.excludedScope.join(' ')).toContain(
      'RF conformance',
    );
  });
});

function encodeCf64le(
  real: Float64Array,
  imaginary: Float64Array,
): Uint8Array {
  const bytes = new Uint8Array(real.length * 16);
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  for (let index = 0; index < real.length; index += 1) {
    view.setFloat64(index * 16, real[index]!, true);
    view.setFloat64(index * 16 + 8, imaginary[index]!, true);
  }
  return bytes;
}
