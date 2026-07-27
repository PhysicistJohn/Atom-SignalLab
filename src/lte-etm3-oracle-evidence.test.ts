import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LTE_ETM3_CATALOG_CF32LE_SHA256 } from './lte-etm3-catalog-iq.js';
import { LTE_ETM3_REFERENCE_IDENTITIES } from './lte-etm3-reference.js';
import { sha256HexOfBytes } from './platform-bytes.js';

export const LTE_ETM3_FULL_FRAME_REPORT_SHA256 =
  'e3c3eed68d9453573569821e0c56ac045d8b898012e584ccd09dae9590fb6dab' as const;
const REPORT_PATH =
  'validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.object({
  path: z.string().min(1),
  sha256: sha256Schema,
}).strict();
const profileSchema = z.object({
  profileId: z.enum(['lte-etm3.1', 'lte-etm3.1a', 'lte-etm3.1b']),
  model: z.enum(['E-TM3.1', 'E-TM3.1a', 'E-TM3.1b']),
  modulation: z.enum(['64QAM', '256QAM', '1024QAM']),
  resourceElementsCompared: z.literal(84_000),
  pdschElementsCompared: z.literal(74_436),
  nonPdschElementsCompared: z.literal(9_564),
  pdschClassificationsCompared: z.literal(84_000),
  timeDomainComplexSamplesCompared: z.literal(153_600),
  maximumPdschComponentError: z.literal(0),
  maximumNonPssComponentError: z.literal(5.960464499743523e-8),
  maximumPssComponentError: z.literal(0.00022353510823804046),
  maximumTimeDomainComponentError: z.number().positive(),
  tolerances: z.object({
    pdschComponent: z.literal(1e-12),
    nonPssComponent: z.literal(1e-6),
    pssComponent: z.literal(0.00023),
    timeDomainComponent: z.literal(2e-6),
  }).strict(),
  subjectGridCf64leSha256: sha256Schema,
  subjectTimeDomainCf64leSha256: sha256Schema,
  subjectCatalogCf32leSha256: sha256Schema,
  oracleGridCf64leSha256: sha256Schema,
  oracleTimeDomainCf64leSha256: sha256Schema,
}).strict();
const reportSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceId: z.literal(
    'signallab-lte-etm3-independent-full-frame-oracles-2026-07-27',
  ),
  executedAt: z.iso.datetime(),
  result: z.literal('pass'),
  governingBody: z.object({
    organization: z.literal('3GPP'),
    technicalGroup: z.literal('TSG RAN'),
    specifications: z.tuple([
      z.literal('3GPP TS 36.141 V19.1.0'),
      z.literal('3GPP TS 36.211 V19.3.0'),
    ]),
  }).strict(),
  scope: z.object({
    technology: z.literal('E-UTRA'),
    profiles: z.tuple([
      z.literal('E-TM3.1'),
      z.literal('E-TM3.1a'),
      z.literal('E-TM3.1b'),
    ]),
    normativeClauses: z.array(z.string().min(1)).length(4),
    configuration: z.string().regex(/10 MHz FDD.*50 resource blocks.*10 ms/i),
    claim: z.string().regex(/independent exhaustive fixed-digital-baseband/i),
    standardsComplianceClaimed: z.literal(false),
    rfConformanceClaimed: z.literal(false),
    productCertificationClaimed: z.literal(false),
  }).strict(),
  subjects: z.record(z.string(), sourceSchema),
  independentOracle: z.object({
    method: z.string()
      .regex(/does not import or call the production Gold, QAM, mapper, or FFT/i),
    generatorSource: sourceSchema,
    testSource: sourceSchema,
    externalBase: z.object({
      implementation: z.literal('srsRAN_4G'),
      repositoryUrl: z.literal('https://github.com/srsran/srsRAN_4G.git'),
      sourceCommitSha: z.literal(
        '6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16',
      ),
      sourceTreeBuildOnlyPatchSha256: sha256Schema,
      harnessSourceSha256: sha256Schema,
      harnessBinarySha256: sha256Schema,
      resourceGridCf32leSha256: sha256Schema,
      timeDomainCf32leSha256: sha256Schema,
      freshExecutionByteIdenticalToRetained: z.literal(true),
    }).strict(),
    externalQamAnchors: z.object({
      srsran: z.object({
        inputWordsCompared: z.object({
          '64qam': z.literal(64),
          '256qam': z.literal(256),
        }).strict(),
      }).passthrough(),
      ocudu: z.object({
        inputWordsCompared: z.literal(1_024),
      }).passthrough(),
    }).strict(),
    primitiveAnchors: z.object({
      gold: z.object({
        freshExternalPdschQpskSymbolsCompared: z.literal(74_436),
        maximumComponentError: z.literal(1.2101617152815436e-8),
        componentTolerance: z.literal(1e-6),
      }).strict(),
      ofdm: z.object({
        freshExternalBaseSamplesCompared: z.literal(153_600),
        maximumComponentError: z.literal(1.2633349352753065e-8),
        componentTolerance: z.literal(2e-6),
      }).strict(),
    }).strict(),
  }).strict(),
  profiles: z.array(profileSchema).length(3),
  qualificationBoundary: z.object({
    independentDigitalComparison: z.literal('passed'),
    broad3gppComplianceClaim: z.literal('not-made'),
    conductedRfEvidence: z.literal('not-provided'),
    radiatedOtaEvidence: z.literal('not-provided'),
    productCertification: z.literal('not-provided'),
    statement: z.string().min(1),
  }).strict(),
}).strict();

function sha256(path: string): string {
  return sha256HexOfBytes(readFileSync(resolve(path)));
}

function report() {
  const bytes = readFileSync(resolve(REPORT_PATH));
  expect(sha256HexOfBytes(bytes)).toBe(LTE_ETM3_FULL_FRAME_REPORT_SHA256);
  return reportSchema.parse(JSON.parse(bytes.toString('utf8')));
}

describe('retained LTE E-TM3 independent full-frame evidence', () => {
  it('pins the immutable report and every repository subject/oracle source', () => {
    const evidence = report();
    for (const source of [
      ...Object.values(evidence.subjects),
      evidence.independentOracle.generatorSource,
      evidence.independentOracle.testSource,
    ]) {
      expect(sha256(source.path)).toBe(source.sha256);
    }
    expect(evidence.independentOracle.externalBase).toMatchObject({
      sourceCommitSha: '6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16',
      harnessSourceSha256:
        '0742db2648c909f93e8e15719baf9d1c9ccb0c3f30d2444a86332f8a4ec3ece9',
      harnessBinarySha256:
        'e0306c21b925d76fa33a55d7e08759679c1560a28f723b9c2d5c9d6fdbbd597f',
      resourceGridCf32leSha256:
        '8be0dd55e7f8104f720876696e9b65d3c6d1bcdc480ac54e235e90ee8da99413',
      timeDomainCf32leSha256:
        '6e7ce0f4070c8f61cdc53c688064d673e62762833828c7243bc2261ff5d3f3e9',
      freshExecutionByteIdenticalToRetained: true,
    });
  });

  it('binds each verdict to exhaustive grid/classification/time comparison', () => {
    const evidence = report();
    const profiles = new Map(evidence.profiles.map((profile) => [
      profile.profileId,
      profile,
    ]));
    for (const profileId of [
      'lte-etm3.1',
      'lte-etm3.1a',
      'lte-etm3.1b',
    ] as const) {
      const profile = profiles.get(profileId)!;
      expect(profile).toMatchObject({
        resourceElementsCompared: 84_000,
        pdschElementsCompared: 74_436,
        nonPdschElementsCompared: 9_564,
        pdschClassificationsCompared: 84_000,
        timeDomainComplexSamplesCompared: 153_600,
        maximumPdschComponentError: 0,
        subjectGridCf64leSha256:
          LTE_ETM3_REFERENCE_IDENTITIES[profileId].gridCf64leSha256,
        subjectTimeDomainCf64leSha256:
          LTE_ETM3_REFERENCE_IDENTITIES[profileId].timeCf64leSha256,
        subjectCatalogCf32leSha256:
          LTE_ETM3_CATALOG_CF32LE_SHA256[profileId],
      });
      expect(profile.maximumNonPssComponentError)
        .toBeLessThanOrEqual(profile.tolerances.nonPssComponent);
      expect(profile.maximumPssComponentError)
        .toBeLessThanOrEqual(profile.tolerances.pssComponent);
      expect(profile.maximumTimeDomainComponentError)
        .toBeLessThanOrEqual(profile.tolerances.timeDomainComponent);
    }
    expect(evidence.independentOracle.primitiveAnchors).toMatchObject({
      gold: { freshExternalPdschQpskSymbolsCompared: 74_436 },
      ofdm: { freshExternalBaseSamplesCompared: 153_600 },
    });
  });

  it('does not promote fixed digital evidence into RF or product compliance', () => {
    expect(report()).toMatchObject({
      scope: {
        standardsComplianceClaimed: false,
        rfConformanceClaimed: false,
        productCertificationClaimed: false,
      },
      qualificationBoundary: {
        independentDigitalComparison: 'passed',
        broad3gppComplianceClaim: 'not-made',
        conductedRfEvidence: 'not-provided',
        radiatedOtaEvidence: 'not-provided',
        productCertification: 'not-provided',
      },
    });
  });
});
