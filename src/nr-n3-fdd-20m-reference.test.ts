import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  generateNrFr1TestModelFrame,
} from './nr-fr1-test-model-reference.js';
import {
  NR_N3_FDD_20M_BINDING,
  NR_N3_FDD_20M_REFERENCE_IDENTITIES,
  generateNrN3Fdd20mFrame,
} from './nr-n3-fdd-20m-reference.js';

const RETAINED_ORACLE_REPORT =
  'validation/nr-fr1-test-model-independent-oracles-2026-07-27.json';
const RETAINED_ORACLE_REPORT_SHA256 =
  '1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54';

describe('fixed n3 FDD 20 MHz NR-FR1-TM1.1 binding', () => {
  it('binds the catalog coordinate to a valid exact Release 19 n3 geometry', () => {
    expect(NR_N3_FDD_20M_BINDING).toEqual({
      testModelSpecification:
        '3GPP TS 38.141-1 V19.4.0 (Release 19)',
      rfSpecification: '3GPP TS 38.104 V19.4.0 (Release 19)',
      physicalLayerSpecification:
        '3GPP TS 38.211 V19.4.0 (Release 19)',
      model: 'NR-FR1-TM1.1',
      operatingBand: 'n3',
      duplex: 'fdd',
      downlinkCenterHz: 1_840_000_000,
      downlinkNrArfcn: 368_000,
      channelBandwidthHz: 20_000_000,
      nominalGridBandwidthHz: 19_080_000,
      physicalCellId: 1,
      subcarrierSpacingHz: 15_000,
      resourceBlockCount: 106,
      activeSubcarrierCount: 1_272,
      fftSize: 2_048,
      sampleRateHz: 30_720_000,
      frameDurationMs: 10,
      frameSampleCount: 307_200,
      slotsPerFrame: 10,
      symbolsPerSlot: 14,
      cyclicPrefix: 'normal',
      windowingPercent: 0,
    });
    expect(5_000 * NR_N3_FDD_20M_BINDING.downlinkNrArfcn).toBe(
      NR_N3_FDD_20M_BINDING.downlinkCenterHz,
    );
    expect(NR_N3_FDD_20M_BINDING.downlinkNrArfcn % 20).toBe(0);
  });

  it('is exhaustively content-identical to the independently verified TM1.1 artifact', () => {
    const bound = generateNrN3Fdd20mFrame();
    const independentlyVerified =
      generateNrFr1TestModelFrame('nr-fr1-tm1.1');
    expect(bound.metadata).toMatchObject({
      profileId: 'nr-n3-fdd-20m',
      model: 'NR-FR1-TM1.1',
      qualification:
        'independently-verified-fixed-digital-baseband',
      verificationBasis:
        'content-identical-nr-fr1-tm1.1-compositional-oracle',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
    });
    expect(bound.grid.kinds).toEqual(independentlyVerified.grid.kinds);
    expect(bound.grid.real).toEqual(independentlyVerified.grid.real);
    expect(bound.grid.imaginary).toEqual(
      independentlyVerified.grid.imaginary,
    );
    expect(bound.timeDomain.real).toEqual(
      independentlyVerified.timeDomain.real,
    );
    expect(bound.timeDomain.imaginary).toEqual(
      independentlyVerified.timeDomain.imaginary,
    );
    expect(
      sha256HexOfBytes(encodeCf64le(
        bound.grid.real,
        bound.grid.imaginary,
      )),
    ).toBe(NR_N3_FDD_20M_REFERENCE_IDENTITIES.gridCf64leSha256);
    expect(
      sha256HexOfBytes(encodeCf64le(
        bound.timeDomain.real,
        bound.timeDomain.imaginary,
      )),
    ).toBe(NR_N3_FDD_20M_REFERENCE_IDENTITIES.timeCf64leSha256);
  }, 30_000);

  it('pins and consumes the retained exhaustive py3gpp evidence for the inherited artifact', () => {
    const bytes = readFileSync(resolve(RETAINED_ORACLE_REPORT));
    expect(sha256HexOfBytes(bytes)).toBe(
      RETAINED_ORACLE_REPORT_SHA256,
    );
    const report = JSON.parse(bytes.toString('utf8')) as {
      readonly result: string;
      readonly profiles: readonly {
        readonly profileId: string;
        readonly resourceElementsCompared: number;
        readonly timeSamplesCompared: number;
        readonly subjectGridCf64leSha256: string;
        readonly subjectTimeCf64leSha256: string;
        readonly subjectCatalogCf32leSha256: string;
        readonly maximumGridComponentError: number;
        readonly maximumTimeComponentError: number;
        readonly acceptanceTolerance: number;
      }[];
    };
    expect(report.result).toBe('pass');
    const tm1 = report.profiles.find(
      ({ profileId }) => profileId === 'nr-fr1-tm1.1',
    );
    expect(tm1).toEqual({
      profileId: 'nr-fr1-tm1.1',
      testModelClause: '4.9.2.2.1',
      modulation: 'QPSK',
      resourceElementsCompared: 178_080,
      timeSamplesCompared: 307_200,
      maximumGridComponentError: 0,
      maximumTimeComponentError: 8.3961e-16,
      acceptanceTolerance: 2e-15,
      subjectGridCf64leSha256:
        NR_N3_FDD_20M_REFERENCE_IDENTITIES.gridCf64leSha256,
      subjectTimeCf64leSha256:
        NR_N3_FDD_20M_REFERENCE_IDENTITIES.timeCf64leSha256,
      subjectCatalogCf32leSha256:
        NR_N3_FDD_20M_REFERENCE_IDENTITIES.catalogCf32leSha256,
      oracleGridCf64leSha256:
        '4b4e57c8607d01a7f806c9af2c77b772a27e184b3ddfe6a5f53ba908d4cb729a',
      oracleTimeCf64leSha256:
        'c3716c70c6f0ceb8c0d6ee479b95b3581f9ac988abb39815be569583810d763e',
    });
  });

  it('keeps the compositional qualification boundary fail closed', () => {
    const metadata = generateNrN3Fdd20mFrame().metadata;
    expect(metadata.requirementLedger).toHaveLength(1);
    expect(metadata.excludedScope.join(' ')).toContain('RF conformance');
    expect(metadata.excludedScope.join(' ')).toContain(
      'product certification',
    );
    expect(metadata.qualificationScope).toContain(
      'metadata binding only',
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
