import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  LTE_BAND3_FDD_20M_REFERENCE_IDENTITIES,
} from './lte-band3-fdd-20m-reference.js';
import {
  LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256,
} from './lte-band3-fdd-20m-catalog-iq.js';
import {
  LTE_BAND38_TDD_10M_REFERENCE_IDENTITIES,
} from './lte-band38-tdd-10m-reference.js';
import {
  LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256,
} from './lte-band38-tdd-10m-catalog-iq.js';
import {
  LTE_NTM_REFERENCE_IDENTITIES,
} from './lte-ntm-reference.js';
import {
  LTE_NTM_CATALOG_CF32LE_SHA256,
} from './lte-ntm-catalog-iq.js';
import { sha256HexOfBytes } from './platform-bytes.js';

export const LTE_FIXED_ORACLE_REPORT_SHA256 =
  'f25ebfb28e6f967907516731cee10d7642ff46f774482bb3399f9d7d023cd5b9' as const;
const REPORT_PATH =
  'validation/lte-fixed-independent-oracles-2026-07-27.json';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.object({
  path: z.string().min(1),
  sha256: sha256Schema,
}).passthrough();
const profileSchema = z.object({
  profileId: z.enum([
    'lte-band3-fdd-20m',
    'lte-band38-tdd-10m',
    'lte-ntm',
    'lte-nbiot-guard-isolated-component',
    'lte-nbiot-inband-isolated-component',
  ]),
  classification: z.string().min(1),
  normativeClauses: z.array(z.string().min(1)).min(2),
  resourceElementsCompared: z.number().int().positive(),
  timeSamplesCompared: z.number().int().positive(),
  acceptanceBounds: z.record(z.string(), z.number().positive()),
  subjectGridCf64leSha256: sha256Schema,
  subjectTimeCf64leSha256: sha256Schema,
  subjectCatalogCf32leSha256: sha256Schema,
}).passthrough();
const reportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.literal('signallab-lte-fixed-independent-oracles-2026-07-27'),
  generatedAt: z.iso.datetime(),
  result: z.literal('pass'),
  governingBody: z.object({
    organization: z.literal('3GPP'),
    technicalGroup: z.literal('TSG RAN'),
    specifications: z.array(z.string()).length(3),
  }).strict(),
  claimScope: z.object({
    kind: z.literal('content-bound-independent-fixed-digital-baseband'),
    statement: z.string().regex(/every complex resource element/i),
    standardsComplianceClaimed: z.literal(false),
    rfConformanceClaimed: z.literal(false),
    productCertificationClaimed: z.literal(false),
  }).strict(),
  subject: z.record(z.string(), sourceSchema),
  independentOracle: z.object({
    implementation: z.literal('srsRAN_4G'),
    repository: z.literal('https://github.com/srsran/srsRAN_4G.git'),
    commit: z.literal('6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16'),
    localBuildPatchSha256: sha256Schema,
    band3: z.object({ testSource: sourceSchema }).passthrough(),
    band38: z.object({ testSource: sourceSchema }).passthrough(),
    ntm: z.object({ testSource: sourceSchema }).passthrough(),
  }).strict(),
  profiles: z.array(profileSchema).length(5),
  excludedClaims: z.array(z.string().min(1)).min(5),
}).strict();

function sha256(path: string): string {
  return sha256HexOfBytes(readFileSync(resolve(path)));
}

function report() {
  const bytes = readFileSync(resolve(REPORT_PATH));
  expect(sha256HexOfBytes(bytes)).toBe(LTE_FIXED_ORACLE_REPORT_SHA256);
  return reportSchema.parse(JSON.parse(bytes.toString('utf8')));
}

describe('retained LTE fixed digital oracle evidence', () => {
  it('pins the report and every repository source used by the verdict', () => {
    const evidence = report();
    for (const source of [
      ...Object.values(evidence.subject),
      evidence.independentOracle.band3.testSource,
      evidence.independentOracle.band38.testSource,
      evidence.independentOracle.ntm.testSource,
    ]) {
      expect(sha256(source.path)).toBe(source.sha256);
    }
  });

  it('binds all five profile verdicts to their complete artifact identities', () => {
    const profiles = new Map(report().profiles.map((profile) => [
      profile.profileId,
      profile,
    ]));
    expect(profiles.get('lte-band3-fdd-20m')).toMatchObject({
      resourceElementsCompared: 168_000,
      timeSamplesCompared: 307_200,
      subjectGridCf64leSha256:
        LTE_BAND3_FDD_20M_REFERENCE_IDENTITIES.gridCf64leSha256,
      subjectTimeCf64leSha256:
        LTE_BAND3_FDD_20M_REFERENCE_IDENTITIES.timeCf64leSha256,
      subjectCatalogCf32leSha256:
        LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256,
    });
    expect(profiles.get('lte-band38-tdd-10m')).toMatchObject({
      resourceElementsCompared: 84_000,
      timeSamplesCompared: 153_600,
      subjectGridCf64leSha256:
        LTE_BAND38_TDD_10M_REFERENCE_IDENTITIES.gridCf64leSha256,
      subjectTimeCf64leSha256:
        LTE_BAND38_TDD_10M_REFERENCE_IDENTITIES.timeCf64leSha256,
      subjectCatalogCf32leSha256:
        LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256,
    });
    for (const profile of [
      'lte-ntm',
      'lte-nbiot-guard-isolated-component',
      'lte-nbiot-inband-isolated-component',
    ] as const) {
      expect(profiles.get(profile)).toMatchObject({
        resourceElementsCompared: 1_680,
        timeSamplesCompared: 19_200,
        subjectGridCf64leSha256:
          LTE_NTM_REFERENCE_IDENTITIES[profile].gridCf64leSha256,
        subjectTimeCf64leSha256:
          LTE_NTM_REFERENCE_IDENTITIES[profile].timeCf64leSha256,
        subjectCatalogCf32leSha256:
          LTE_NTM_CATALOG_CF32LE_SHA256[profile],
      });
    }
  });

  it('keeps composite NB hosts, RF conformance, and certification outside scope', () => {
    const evidence = report();
    expect(evidence.claimScope).toMatchObject({
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
    });
    const exclusions = evidence.excludedClaims.join(' ');
    expect(exclusions).toMatch(/isolated NB-IoT component/i);
    expect(exclusions).toMatch(/RF conformance/i);
    expect(exclusions).toMatch(/product certification/i);
  });
});
