import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  NR_FR1_TM_CATALOG_CF32LE_SHA256,
} from './nr-fr1-test-model-catalog-iq.js';
import {
  NR_FR1_TEST_MODEL_DEFINITIONS,
  NR_FR1_TEST_MODEL_PROFILES,
  NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES,
} from './nr-fr1-test-model-reference.js';

export const NR_FR1_TM_ORACLE_REPORT_SHA256 =
  '1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54' as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const profileSchema = z.object({
  profileId: z.enum(NR_FR1_TEST_MODEL_PROFILES),
  testModelClause: z.string().min(1),
  modulation: z.enum(['QPSK', '64QAM', '256QAM', '1024QAM']),
  resourceElementsCompared: z.literal(178_080),
  timeSamplesCompared: z.literal(307_200),
  maximumGridComponentError: z.number().nonnegative(),
  maximumTimeComponentError: z.number().nonnegative(),
  acceptanceTolerance: z.literal(2e-15),
  subjectGridCf64leSha256: sha256Schema,
  subjectTimeCf64leSha256: sha256Schema,
  subjectCatalogCf32leSha256: sha256Schema,
  oracleGridCf64leSha256: sha256Schema,
  oracleTimeCf64leSha256: sha256Schema,
  ocuduConstellationWordsCompared: z.literal(1_024).optional(),
}).strict();

const reportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.literal('signallab-nr-fr1-fixed-test-model-digital-oracles-2026-07-27'),
  generatedAt: z.iso.datetime(),
  result: z.literal('pass'),
  claimScope: z.object({
    kind: z.literal('content-bound-independent-digital-baseband'),
    statement: z.string().regex(/every resource element.*every OFDM sample/i),
    standard: z.literal('3GPP TS 38.141-1 V19.4.0 (Release 19)'),
    fixedBinding: z.object({
      operatingBand: z.literal('n3'),
      duplex: z.literal('FDD'),
      downlinkCenterHz: z.literal(1_842_500_000),
      downlinkNrArfcn: z.literal(368_500),
      channelBandwidthHz: z.literal(20_000_000),
      subcarrierSpacingHz: z.literal(15_000),
      resourceBlockCount: z.literal(106),
      physicalCellId: z.literal(1),
      cyclicPrefix: z.literal('normal'),
      frameDurationMs: z.literal(10),
      sampleRateHz: z.literal(30_720_000),
      frameComplexSampleCount: z.literal(307_200),
    }).strict(),
  }).strict(),
  subject: z.object({
    generatorSource: z.object({
      path: z.literal('src/nr-fr1-test-model-reference.ts'),
      sha256: sha256Schema,
    }).strict(),
    catalogAdapterSource: z.object({
      path: z.literal('src/nr-fr1-test-model-catalog-iq.ts'),
      sha256: sha256Schema,
    }).strict(),
    dependencyLock: z.object({
      path: z.literal('package-lock.json'),
      sha256: sha256Schema,
    }).strict(),
  }).strict(),
  independentOracle: z.object({
    testSource: z.object({
      path: z.literal('src/nr-fr1-test-model-independent-oracle.test.ts'),
      sha256: sha256Schema,
    }).strict(),
    pythonScript: z.object({
      path: z.string().min(1),
      sha256: z.literal(
        '101b80587f7d73c92f0d309cf9f10577ad1ebbdceaf0da3bdbf8b4ea76261823',
      ),
    }).strict(),
    py3gpp: z.object({
      version: z.literal('0.6.0'),
      pythonSourceTreeSha256: z.literal(
        'ea8a8db80ab4235767b1a75b535ad50583edb9c80724d79d8f769e9d2219f9a6',
      ),
    }).strict(),
    numpy: z.object({ version: z.literal('2.0.2') }).strict(),
    ocudu: z.object({
      commit: z.literal('f0c8467560ea894d16e50207b3db60fd5ff19c01'),
      mapperSourceSha256: sha256Schema,
      mapperHeaderSha256: sha256Schema,
      harnessSourceSha256: sha256Schema,
      harnessBinarySha256: sha256Schema,
      qam1024VectorSha256: sha256Schema,
    }).strict(),
  }).strict(),
  profiles: z.array(profileSchema).length(4),
  excludedClaims: z.array(z.string().min(1)).min(6),
}).strict();

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function retainedReport() {
  const bytes = readFileSync(resolve(
    'validation/nr-fr1-test-model-independent-oracles-2026-07-27.json',
  ));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    NR_FR1_TM_ORACLE_REPORT_SHA256,
  );
  return reportSchema.parse(JSON.parse(bytes.toString('utf8')));
}

describe('retained NR-FR1 independent-oracle evidence', () => {
  it('is content-addressed and bound to the tested implementation sources', () => {
    const report = retainedReport();
    expect(report.subject.generatorSource.sha256).toBe(
      fileSha256(report.subject.generatorSource.path),
    );
    expect(report.subject.catalogAdapterSource.sha256).toBe(
      fileSha256(report.subject.catalogAdapterSource.path),
    );
    expect(report.subject.dependencyLock.sha256).toBe(
      fileSha256(report.subject.dependencyLock.path),
    );
    expect(report.independentOracle.testSource.sha256).toBe(
      fileSha256(report.independentOracle.testSource.path),
    );
  });

  it('binds all four exact artifacts and requires every measured error to pass', () => {
    const report = retainedReport();
    const profiles = new Map(report.profiles.map((profile) => [
      profile.profileId,
      profile,
    ]));
    expect([...profiles.keys()]).toEqual(NR_FR1_TEST_MODEL_PROFILES);
    for (const profileId of NR_FR1_TEST_MODEL_PROFILES) {
      const profile = profiles.get(profileId)!;
      expect(profile).toMatchObject({
        testModelClause: NR_FR1_TEST_MODEL_DEFINITIONS[profileId].clause,
        subjectGridCf64leSha256:
          NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES[profileId].gridCf64leSha256,
        subjectTimeCf64leSha256:
          NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES[profileId].timeCf64leSha256,
        subjectCatalogCf32leSha256:
          NR_FR1_TM_CATALOG_CF32LE_SHA256[profileId],
      });
      expect(profile.maximumGridComponentError).toBeLessThanOrEqual(
        profile.acceptanceTolerance,
      );
      expect(profile.maximumTimeComponentError).toBeLessThanOrEqual(
        profile.acceptanceTolerance,
      );
    }
    expect(profiles.get('nr-fr1-tm3.1b')?.ocuduConstellationWordsCompared)
      .toBe(1_024);
  });

  it('does not turn fixed digital evidence into RF or broad compliance claims', () => {
    const report = retainedReport();
    expect(report.excludedClaims.join(' ')).toMatch(
      /broad or general 3GPP compliance.*conducted or radiated RF conformance.*product certification/i,
    );
  });
});
