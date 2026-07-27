import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_N3_FDD_20M_REFERENCE_IDENTITIES,
} from './nr-n3-fdd-20m-reference.js';
import {
  NR_N78_TDD_100M_REFERENCE_IDENTITIES,
} from './nr-n78-tdd-100m-reference.js';
import {
  NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES,
} from './nr-nbiot-inband-component-reference.js';
import {
  NR_REMAINING_FIXED_CF32LE_SHA256,
} from './nr-remaining-fixed-catalog-iq.js';

/**
 * Verify a hash-pinned evidence subject.
 *
 * Repository-owned subjects are always verified: a missing one is a real defect.
 * Some subjects are retained EXTERNAL evidence (downloaded 3GPP specifications
 * and third-party oracle sources) that is too large or not redistributable, so
 * it lives in a machine-local cache under an absolute path. That evidence
 * cannot exist on a clean checkout or a CI runner. Verify it exactly when it is
 * present, and report it as unavailable when it is not, rather than failing
 * closed on a host that was never expected to hold it. This mirrors how the
 * live external-oracle suite is fail-closed only when it is actually asked to
 * run.
 */
function verifyPinnedSubject(
  rawPath: string,
  expectedSha256: string,
  unavailable: string[],
): void {
  const external = isAbsolute(rawPath);
  const path = external ? rawPath : resolve(rawPath);
  if (external && !existsSync(path)) {
    unavailable.push(rawPath);
    return;
  }
  expect(sha256HexOfBytes(readFileSync(path)), rawPath).toBe(expectedSha256);
}

const REPORT_PATH =
  'validation/nr-remaining-fixed-digital-oracles-2026-07-27.json';
const REPORT_SHA256 =
  '47950c3f49b63275302101be61b46035f0ec628cc26e80ff0e1e32af5fc454ce';

interface EvidenceReport {
  readonly result: string;
  readonly claimScope: {
    readonly standardsComplianceClaimed: boolean;
    readonly rfConformanceClaimed: boolean;
    readonly productCertificationClaimed: boolean;
  };
  readonly subject: Readonly<Record<string, {
    readonly path: string;
    readonly sha256: string;
  }>>;
  readonly independentOracle: {
    readonly n3InheritedReport: {
      readonly path: string;
      readonly sha256: string;
    };
    readonly nbiotInheritedReport: {
      readonly path: string;
      readonly sha256: string;
    };
    readonly n78TestSource: {
      readonly path: string;
      readonly sha256: string;
    };
    readonly n78PythonScript: {
      readonly path: string;
      readonly sha256: string;
    };
    readonly py3gpp: {
      readonly version: string;
      readonly pythonSourceTreeSha256: string;
    };
    readonly numpy: { readonly version: string };
  };
  readonly profiles: readonly {
    readonly profileId: string;
    readonly fixedBinding: Readonly<Record<string, unknown>>;
    readonly resourceElementsCompared: number;
    readonly resourceElementKindsCompared?: number;
    readonly cyclicPrefixLengthsCompared?: number;
    readonly timeSamplesCompared: number;
    readonly maximumGridComponentError: number;
    readonly maximumTimeComponentError: number;
    readonly acceptanceTolerance?: number;
    readonly acceptanceBounds?: {
      readonly ordinaryGridComponent: number;
      readonly npssGridComponent: number;
      readonly nsssGridComponent: number;
      readonly timeComponent: number;
    };
    readonly subjectGridCf64leSha256: string;
    readonly subjectTimeCf64leSha256: string;
    readonly subjectCatalogCf32leSha256: string;
    readonly subjectKindsU8Sha256?: string;
  }[];
  readonly excludedClaims: readonly string[];
}

describe('retained remaining fixed NR oracle evidence', () => {
  it('pins the immutable report and every repository subject it qualifies', () => {
    const reportBytes = readFileSync(resolve(REPORT_PATH));
    expect(sha256HexOfBytes(reportBytes)).toBe(REPORT_SHA256);
    const report = JSON.parse(
      reportBytes.toString('utf8'),
    ) as EvidenceReport;
    expect(report.result).toBe('pass');
    expect(report.claimScope).toEqual(expect.objectContaining({
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
    }));
    const unavailable: string[] = [];
    for (const subject of Object.values(report.subject)) {
      verifyPinnedSubject(subject.path, subject.sha256, unavailable);
    }
    for (const pinned of [
      report.independentOracle.n3InheritedReport,
      report.independentOracle.nbiotInheritedReport,
      report.independentOracle.n78TestSource,
      report.independentOracle.n78PythonScript,
    ]) {
      verifyPinnedSubject(pinned.path, pinned.sha256, unavailable);
    }
    // Every repository-owned subject must have been verified above; only
    // externally cached evidence may be reported unavailable.
    for (const path of unavailable) expect(isAbsolute(path)).toBe(true);
    expect(report.independentOracle).toMatchObject({
      py3gpp: {
        version: '0.6.0',
        pythonSourceTreeSha256:
          'ea8a8db80ab4235767b1a75b535ad50583edb9c80724d79d8f769e9d2219f9a6',
      },
      numpy: { version: '2.0.2' },
    });
  });

  it('binds each passing result to the compiled artifact identities and exhaustive bounds', () => {
    const report = JSON.parse(
      readFileSync(resolve(REPORT_PATH), 'utf8'),
    ) as EvidenceReport;
    const n3 = report.profiles.find(
      ({ profileId }) => profileId === 'nr-n3-fdd-20m',
    );
    const n78 = report.profiles.find(
      ({ profileId }) => profileId === 'nr-n78-tdd-100m',
    );
    const nbiot = report.profiles.find(
      ({ profileId }) =>
        profileId === 'nr-nbiot-inband-isolated-component',
    );
    expect(n3).toMatchObject({
      resourceElementsCompared: 178_080,
      timeSamplesCompared: 307_200,
      maximumGridComponentError: 0,
      acceptanceTolerance: 2e-15,
      subjectGridCf64leSha256:
        NR_N3_FDD_20M_REFERENCE_IDENTITIES.gridCf64leSha256,
      subjectTimeCf64leSha256:
        NR_N3_FDD_20M_REFERENCE_IDENTITIES.timeCf64leSha256,
      subjectCatalogCf32leSha256:
        NR_REMAINING_FIXED_CF32LE_SHA256['nr-n3-fdd-20m'],
    });
    expect(n3!.maximumTimeComponentError).toBeLessThanOrEqual(
      n3!.acceptanceTolerance!,
    );
    expect(n78).toMatchObject({
      fixedBinding: {
        radioFrameDurationMs: 10,
        radioFramesPerArtifact: 2,
        artifactDurationMs: 20,
        artifactComplexSampleCount: 2_457_600,
        tddPattern: {
          repetitionsPerRadioFrame: 2,
          repetitionsPerArtifact: 4,
        },
      },
      resourceElementsCompared: 1_834_560,
      resourceElementKindsCompared: 1_834_560,
      cyclicPrefixLengthsCompared: 560,
      timeSamplesCompared: 2_457_600,
      maximumGridComponentError: 0,
      acceptanceTolerance: 2.5e-15,
      subjectGridCf64leSha256:
        NR_N78_TDD_100M_REFERENCE_IDENTITIES.gridCf64leSha256,
      subjectKindsU8Sha256:
        NR_N78_TDD_100M_REFERENCE_IDENTITIES.kindsU8Sha256,
      subjectTimeCf64leSha256:
        NR_N78_TDD_100M_REFERENCE_IDENTITIES.timeCf64leSha256,
      subjectCatalogCf32leSha256:
        NR_REMAINING_FIXED_CF32LE_SHA256['nr-n78-tdd-100m'],
    });
    expect(n78!.maximumTimeComponentError).toBeLessThanOrEqual(
      n78!.acceptanceTolerance!,
    );
    expect(nbiot).toMatchObject({
      resourceElementsCompared: 1_680,
      timeSamplesCompared: 19_200,
      subjectGridCf64leSha256:
        NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES
          .gridCf64leSha256,
      subjectTimeCf64leSha256:
        NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES
          .timeCf64leSha256,
      subjectCatalogCf32leSha256:
        NR_REMAINING_FIXED_CF32LE_SHA256[
          'nr-nbiot-inband-isolated-component'
        ],
      acceptanceBounds: {
        ordinaryGridComponent: 1e-6,
        npssGridComponent: 2e-5,
        nsssGridComponent: 1.8e-3,
        timeComponent: 4.5e-5,
      },
    });
    expect(nbiot!.maximumGridComponentError).toBeLessThanOrEqual(
      nbiot!.acceptanceBounds!.nsssGridComponent,
    );
    expect(nbiot!.maximumTimeComponentError).toBeLessThanOrEqual(
      nbiot!.acceptanceBounds!.timeComponent,
    );
    expect(report.excludedClaims.join(' ')).toContain('RF conformance');
    expect(report.excludedClaims.join(' ')).toContain(
      'product certification',
    );
    expect(report.excludedClaims.join(' ')).toContain(
      'not a complete TS 38.141-1 NR-N-TM composite claim',
    );
  });
});
