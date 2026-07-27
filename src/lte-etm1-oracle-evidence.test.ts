import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
  LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION_SHA256,
} from './lte-etm1-provider.js';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const RETAINED_REPORT_SHA256 =
  '55cae4fcaa514dfe6ffdd6baf25c84a0915131b7403aad095c3d4727b593d34f';
const vitestRunSchema = z.object({
  numTotalTests: z.literal(2),
  numPassedTests: z.literal(2),
  numFailedTests: z.literal(0),
  numPendingTests: z.literal(0),
  numTodoTests: z.literal(0),
  startTime: z.literal(1_785_139_656_609),
  success: z.literal(true),
  testResults: z.array(z.object({
    name: z.string().endsWith('/src/lte-etm1-independent-oracle.test.ts'),
    status: z.literal('passed'),
    assertionResults: z.array(z.object({
      status: z.literal('passed'),
      failureMessages: z.tuple([]),
    }).passthrough()).length(2),
  }).passthrough()).length(1),
}).passthrough();
const reportSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceId: z.literal('lte-etm1-srsran-full-frame-2026-07-27'),
  executedAt: z.literal('2026-07-27T08:07:36.609Z'),
  result: z.literal('pass'),
  scope: z.object({
    kind: z.literal('digital-complex-baseband'),
    presetId: z.literal('lte-etm-1-1-10mhz-fdd'),
    presetRevision: z.literal('2.0.0'),
    recipeId: z.literal('lte-etm-1-1-10mhz-fdd-reference-frame'),
    recipeRevision: z.literal('1.0.1'),
    physicalCellId: z.literal(1),
    systemFrameNumberModuloFour: z.literal(0),
    sampleRateHz: z.literal(15_360_000),
    complexSamples: z.literal(153_600),
  }).strict(),
  subject: z.object({
    providerId: z.literal('signallab'),
    implementationId: z.literal('signallab.lte-etm1-reference'),
    sourceBaselineCommitSha: z.literal('7c8303a0338b0f7c088737f8df2d935fd04bb033'),
    generatorSourceSha256: sha256Schema,
    providerSourceSha256: sha256Schema,
    dependencyLockSha256: sha256Schema,
    configurationSha256: sha256Schema,
    artifactCf64leSha256: sha256Schema,
  }).strict(),
  oracle: z.object({
    providerId: z.literal('srsran-project'),
    implementationId: z.literal('srsran-4g.lte-phy-plus-etm-harness'),
    repositoryUrl: z.literal('https://github.com/srsran/srsRAN_4G'),
    sourceCommitSha: z.literal('6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16'),
    sourceTreeBuildOnlyPatchSha256: z.literal(
      '284e1453cc0ea4fed616a7a88e5fa65d706de698a6c0395ec575772d663d1173',
    ),
    harnessSourceSha256: z.literal(
      '0742db2648c909f93e8e15719baf9d1c9ccb0c3f30d2444a86332f8a4ec3ece9',
    ),
    harnessBinarySha256: z.literal(
      'e0306c21b925d76fa33a55d7e08759679c1560a28f723b9c2d5c9d6fdbbd597f',
    ),
    dependencies: z.tuple([
      z.object({
        name: z.literal('FFTW'),
        version: z.literal('3.3.10'),
        archiveSha256: z.literal(
          '56c932549852cddcfafdab3820b0200c7742675be92179e59e6215b340e26467',
        ),
      }).strict(),
      z.object({
        name: z.literal('Boost'),
        version: z.literal('1.83.0'),
        archiveSha256: z.literal(
          '6478edfe2f3305127cffe8caf73ea0176c53769f4bf1585be237eb30798c3b8e',
        ),
      }).strict(),
      z.object({
        name: z.literal('Mbed TLS'),
        version: z.literal('2.28.10'),
        sourceCommitSha: z.literal('2fc8413bfcb51354c8e679141b17b3f1a5942561'),
      }).strict(),
    ]),
    resourceGridCf32leSha256: z.literal(
      '8be0dd55e7f8104f720876696e9b65d3c6d1bcdc480ac54e235e90ee8da99413',
    ),
    timeDomainCf32leSha256: z.literal(
      '6e7ce0f4070c8f61cdc53c688064d673e62762833828c7243bc2261ff5d3f3e9',
    ),
  }).strict(),
  test: z.object({
    sourceLocation: z.literal(
      'src/lte-etm1-independent-oracle.test.ts#matches every resource element and OFDM sample from the pinned independent implementation',
    ),
    sourceSha256: sha256Schema,
    runner: z.object({
      name: z.literal('Vitest'),
      version: z.literal('4.1.10'),
      nodeVersion: z.literal('22.23.1'),
    }).strict(),
    vitestJsonReportSha256: z.literal(
      'e560b50ef40bc0a43f79925654be4d30be72d22a883f4c9b0bce08672236dcb1',
    ),
    testsPassed: z.literal(2),
    testsFailed: z.literal(0),
    testsSkipped: z.literal(0),
  }).strict(),
  comparison: z.object({
    resourceElementsCompared: z.literal(84_000),
    timeDomainComplexSamplesCompared: z.literal(153_600),
    maximumNonPssGridComponentError: z.literal(5.960464499743523e-8),
    maximumPssComponentError: z.literal(0.00022353510823804046),
    maximumTimeDomainComponentError: z.literal(1.1386674185279166e-6),
    nonPssGridComponentTolerance: z.literal(1e-6),
    pssComponentTolerance: z.literal(0.00023),
    timeDomainComponentTolerance: z.literal(2e-6),
    notes: z.tuple([
      z.literal(
        "The PSS tolerance covers srsRAN's float32 phase evaluation; SignalLab evaluates the normative closed-form sequence in float64.",
      ),
      z.literal(
        'The oracle build patch changes macOS build plumbing only and does not change LTE PHY algorithms.',
      ),
      z.literal(
        'The evidence test executes the pinned harness binary into fresh files and requires both outputs to be byte-identical to the retained vectors before comparison.',
      ),
    ]),
  }).strict(),
  qualificationBoundary: z.object({
    independentDigitalComparison: z.literal('passed'),
    broad3gppComplianceClaim: z.literal('not-made'),
    conductedRfEvidence: z.literal('not-provided'),
    radiatedOtaEvidence: z.literal('not-provided'),
    statement: z.literal(
      'This report verifies only the exact fixed digital waveform and content hashes above. It is not RF conformance evidence and cannot qualify another preset, recipe, artifact, implementation, or dependency state.',
    ),
  }).strict(),
}).strict();

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function retainedReportBytes(): Uint8Array {
  return readFileSync(resolve('validation/lte-etm1-srsran-oracle-2026-07-27.json'));
}

describe('retained LTE E-TM1.1 independent-oracle evidence', () => {
  it('is structurally valid, content-bound, passing, and explicitly digital-only', () => {
    const reportBytes = retainedReportBytes();
    expect(createHash('sha256').update(reportBytes).digest('hex'))
      .toBe(RETAINED_REPORT_SHA256);
    const report = reportSchema.parse(JSON.parse(new TextDecoder().decode(reportBytes)));

    expect(report.subject).toMatchObject({
      generatorSourceSha256: fileSha256('src/lte-etm1-reference.ts'),
      providerSourceSha256: fileSha256('src/lte-etm1-provider.ts'),
      dependencyLockSha256: fileSha256('package-lock.json'),
      configurationSha256: LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION_SHA256,
      artifactCf64leSha256: LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
    });
    expect(report.test.sourceSha256).toBe(
      fileSha256('src/lte-etm1-independent-oracle.test.ts'),
    );
    expect(report.test.sourceLocation).toBe(
      'src/lte-etm1-independent-oracle.test.ts#matches every resource element and OFDM sample from the pinned independent implementation',
    );
    const vitestReportPath = process.env.SIGNALLAB_SRSRAN_VITEST_REPORT;
    if (process.env.SIGNALLAB_REQUIRE_3GPP_ORACLE === '1') {
      expect(
        vitestReportPath,
        'SIGNALLAB_SRSRAN_VITEST_REPORT must identify the retained current run report',
      ).toBeDefined();
    }
    if (vitestReportPath !== undefined) {
      expect(fileSha256(vitestReportPath)).toBe(report.test.vitestJsonReportSha256);
      vitestRunSchema.parse(JSON.parse(readFileSync(resolve(vitestReportPath), 'utf8')));
    }
    expect(report.comparison.maximumNonPssGridComponentError)
      .toBeLessThanOrEqual(report.comparison.nonPssGridComponentTolerance);
    expect(report.comparison.maximumPssComponentError)
      .toBeLessThanOrEqual(report.comparison.pssComponentTolerance);
    expect(report.comparison.maximumTimeDomainComponentError)
      .toBeLessThanOrEqual(report.comparison.timeDomainComponentTolerance);
  });

  it('does not turn an independent digital comparison into an RF or broad compliance claim', () => {
    const reportBytes = retainedReportBytes();
    expect(createHash('sha256').update(reportBytes).digest('hex'))
      .toBe(RETAINED_REPORT_SHA256);
    const report = reportSchema.parse(JSON.parse(new TextDecoder().decode(reportBytes)));
    expect(report.qualificationBoundary).toEqual(expect.objectContaining({
      independentDigitalComparison: 'passed',
      broad3gppComplianceClaim: 'not-made',
      conductedRfEvidence: 'not-provided',
      radiatedOtaEvidence: 'not-provided',
    }));
  });
});
