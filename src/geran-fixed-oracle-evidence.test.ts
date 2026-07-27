import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  GERAN_FIXED_CATALOG_BANDWIDTH_HZ,
  GERAN_FIXED_CATALOG_CF32LE_SHA256,
  GERAN_FIXED_CATALOG_PERIOD_SAMPLES,
  GERAN_FIXED_CATALOG_PROFILES,
  GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ,
} from './geran-fixed-catalog-iq.js';

export const GERAN_FIXED_ORACLE_REPORT_SHA256 =
  'b24f818661bf6ced2d5f2c0a01e7305ba21c4ce49e21fb08ab9799c51e6b051b' as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.object({
  path: z.string().min(1),
  sha256: sha256Schema,
}).passthrough();
const profileSchema = z.object({
  profileId: z.enum(GERAN_FIXED_CATALOG_PROFILES),
  signalKind: z.enum([
    'normative-fixed-profile',
    'standards-component-fixture',
  ]),
  fixture: z.string().min(1),
  catalogBandwidthBindingHz: z.number().int().positive(),
  normativeReferences: z.array(z.string().min(1)).min(2),
  modulatorInputSha256: z.array(sha256Schema).min(1),
  channelCodingScope: z.string().min(1),
  catalogCf32leSha256: sha256Schema,
  comparedComplexSamples: z.literal(GERAN_FIXED_CATALOG_PERIOD_SAMPLES),
  maximumObservedComponentError: z.number().nonnegative(),
}).strict();
const reportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.literal(
    'signallab-geran-release19-fixed-digital-baseband-oracles-2026-07-27',
  ),
  generatedAt: z.iso.datetime(),
  result: z.literal('pass'),
  governingOrganization: z.literal('3GPP'),
  standardsRelease: z.literal(19),
  claimScope: z.object({
    kind: z.literal('content-bound-fixed-digital-baseband'),
    statement: z.string().regex(/every I and Q component of every sample/i),
    sampleRateHz: z.literal(GERAN_FIXED_CATALOG_SAMPLE_RATE_HZ),
    slotComplexSamples: z.literal(750),
    tdmaFrameComplexSamples: z.literal(6_000),
    artifactFrames: z.literal(4),
    artifactComplexSamples: z.literal(GERAN_FIXED_CATALOG_PERIOD_SAMPLES),
    artifactBytes: z.literal(GERAN_FIXED_CATALOG_PERIOD_SAMPLES * 8),
    sampleFormat: z.literal('cf32le'),
    carrierPhaseRadians: z.literal(0),
    uniformAmplitudeScale: z.literal(0.1),
    maximumComponentTolerance: z.literal(0.000001),
  }).strict(),
  specificationArchives: z.array(z.object({
    specification: z.enum(['TS 45.002', 'TS 45.003', 'TS 45.004']),
    version: z.literal('19.0.0'),
    archiveUrl: z.url(),
    archiveSha256: sha256Schema,
    scope: z.string().optional(),
  }).strict()).length(3),
  subject: z.object({
    analyticGeneratorSource: sourceSchema,
    fixedBurstSource: sourceSchema,
    catalogAdapterSource: sourceSchema,
    dependencyLock: sourceSchema,
  }).strict(),
  tests: z.object({
    burstAndLibosmocoreBindingTest: sourceSchema,
    independentSampleOracleTest: sourceSchema,
    retainedLibosmocoreEvidence: sourceSchema,
  }).strict(),
  profiles: z.array(profileSchema).length(7),
  qualificationBoundary: z.object({
    fixedArtifactDigitalBasebandComparison:
      z.literal('passed-for-all-seven-profiles'),
    xCchChannelCodingOracle:
      z.literal('passed-for-gsm-900-loaded-bcch-and-gsm-normal-burst'),
    otherChannelCoding:
      z.literal('not-claimed-modulator-input-fixtures-only'),
    broad3gppComplianceClaim: z.literal('not-made'),
    completeBcch51Multiframe: z.literal('not-provided'),
    ts45005RfConformance: z.literal('not-performed'),
    conductedRfEvidence: z.literal('not-provided'),
    radiatedEvidence: z.literal('not-provided'),
    productCertification: z.literal('not-provided'),
    statement: z.string().regex(/only the exact content-addressed/i),
  }).strict(),
}).strict();

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function report(): z.infer<typeof reportSchema> {
  const bytes = readFileSync(resolve(
    'validation/geran-release19-fixed-digital-baseband-oracles-2026-07-27.json',
  ));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    GERAN_FIXED_ORACLE_REPORT_SHA256,
  );
  return reportSchema.parse(JSON.parse(bytes.toString('utf8')));
}

describe('retained GERAN fixed-artifact digital-baseband evidence', () => {
  it('is content-addressed and bound to every implementation and oracle input', () => {
    const evidence = report();
    for (const source of [
      ...Object.values(evidence.subject),
      ...Object.values(evidence.tests),
    ]) {
      expect(source.sha256).toBe(sha256(source.path));
    }
  });

  it('binds all seven exact artifacts, geometries, and independently measured errors', () => {
    const evidence = report();
    const profiles = new Map(evidence.profiles.map((profile) => [
      profile.profileId,
      profile,
    ]));
    expect([...profiles.keys()].sort())
      .toEqual([...GERAN_FIXED_CATALOG_PROFILES].sort());
    for (const profileId of GERAN_FIXED_CATALOG_PROFILES) {
      const profile = profiles.get(profileId)!;
      expect(profile.catalogBandwidthBindingHz)
        .toBe(GERAN_FIXED_CATALOG_BANDWIDTH_HZ[profileId]);
      expect(profile.catalogCf32leSha256)
        .toBe(GERAN_FIXED_CATALOG_CF32LE_SHA256[profileId]);
      expect(profile.comparedComplexSamples)
        .toBe(GERAN_FIXED_CATALOG_PERIOD_SAMPLES);
      expect(profile.maximumObservedComponentError)
        .toBeLessThanOrEqual(evidence.claimScope.maximumComponentTolerance);
    }
  });

  it('qualifies channel coding only for the two retained libosmocore xCCH profiles', () => {
    const profiles = new Map(report().profiles.map((profile) => [
      profile.profileId,
      profile,
    ]));
    for (const profileId of GERAN_FIXED_CATALOG_PROFILES) {
      const profile = profiles.get(profileId)!;
      if (profileId === 'gsm-900-loaded-bcch'
        || profileId === 'gsm-normal-burst') {
        expect(profile.signalKind).toBe('normative-fixed-profile');
        expect(profile.channelCodingScope)
          .toMatch(/independently encode\/decode matched/i);
        expect(profile.normativeReferences.join(' '))
          .toMatch(/TS 45\.003/);
      } else {
        expect(profile.signalKind).toBe('standards-component-fixture');
        expect(profile.channelCodingScope)
          .toMatch(/No TS 45\.003 claim/i);
        expect(profile.normativeReferences.join(' '))
          .not.toMatch(/TS 45\.003/);
      }
    }
  });

  it('keeps broad 3GPP, BCCH multiframe, RF, and product claims outside scope', () => {
    expect(report().qualificationBoundary).toMatchObject({
      broad3gppComplianceClaim: 'not-made',
      completeBcch51Multiframe: 'not-provided',
      ts45005RfConformance: 'not-performed',
      conductedRfEvidence: 'not-provided',
      radiatedEvidence: 'not-provided',
      productCertification: 'not-provided',
    });
  });
});
