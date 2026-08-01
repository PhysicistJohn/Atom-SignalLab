import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256,
  BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256,
} from './bluetooth-iq.js';
import {
  BLUETOOTH_FIXED_CAPTURE_SAMPLES,
  BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256,
  BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ,
  BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ,
} from './bluetooth-fixed-catalog-iq.js';

export const BLUETOOTH_FIXED_ORACLE_REPORT_SHA256 =
  'bdf32b159891a033f7d3609f53667d000444f3ddc5c4bbaf058fdede947f6d87' as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.object({
  path: z.string().min(1),
  sha256: sha256Schema,
}).passthrough();
const profileSchema = z.object({
  profileId: z.enum([
    'bluetooth-classic-connected',
    'bluetooth-le-advertising',
  ]),
  packet: z.string().min(1),
  normativeReferences: z.array(z.string().min(1)).min(3),
  channelIndex: z.number().int(),
  channelCenterHz: z.number().int(),
  symbolRateHz: z.literal(1_000_000),
  gaussianBt: z.literal(0.5),
  modulationIndex: z.number().positive(),
  frequencyDeviationHz: z.number().int().positive(),
  transmissionBits: z.number().int().positive(),
  transmissionBitsSha256: sha256Schema,
  captureComplexSamples: z.number().int().positive(),
  activeComplexSamplesCompared: z.number().int().positive(),
  catalogCf32leSha256: sha256Schema,
  maximumComponentTolerance: z.literal(0.00002),
  modulationRequirements: z.object({
    modulationIndexMinimum: z.number(),
    modulationIndexMaximum: z.number(),
    alternatingDeviationRatioMinimum: z.literal(0.8),
    alternatingDeviationHzMinimum: z.number().int().positive(),
  }).strict(),
}).strict();
const reportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.literal(
    'signallab-bluetooth-core63-fixed-packet-digital-oracles-2026-07-27',
  ),
  generatedAt: z.iso.datetime(),
  result: z.literal('pass'),
  governingOrganization: z.literal('Bluetooth SIG'),
  standard: z.literal('Bluetooth Core Specification 6.3'),
  claimScope: z.object({
    kind: z.literal('content-bound-fixed-packet-digital-baseband'),
    statement: z.string().regex(/every active ideal BT=0\.5 GFSK sample/i),
    sampleRateHz: z.literal(BLUETOOTH_FIXED_CATALOG_SAMPLE_RATE_HZ),
    channelBandwidthBindingHz: z.literal(
      BLUETOOTH_FIXED_CATALOG_CHANNEL_BANDWIDTH_HZ,
    ),
    sampleFormat: z.literal('cf32le'),
  }).strict(),
  subject: z.object({
    generatorSource: sourceSchema,
    catalogAdapterSource: sourceSchema,
    dependencyLock: sourceSchema,
  }).strict(),
  tests: z.object({
    publishedSampleVectorTest: sourceSchema,
    independentGfskOracleTest: sourceSchema,
  }).strict(),
  profiles: z.array(profileSchema).length(2),
  qualificationBoundary: z.object({
    digitalPacketAndIdealBasebandComparison: z.literal('passed'),
    broadBluetoothComplianceClaim: z.literal('not-made'),
    rfPhyQualificationTestSuite: z.literal('not-performed'),
    conductedRfEvidence: z.literal('not-provided'),
    radiatedEvidence: z.literal('not-provided'),
    interoperabilityEvidence: z.literal('not-provided'),
    productQualification: z.literal('not-provided'),
    statement: z.string().regex(/Bluetooth SIG qualification still requires/i),
  }).strict(),
}).strict();

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function report() {
  const bytes = readFileSync(resolve(
    'validation/bluetooth-core63-fixed-packet-digital-oracles-2026-07-27.json',
  ));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    BLUETOOTH_FIXED_ORACLE_REPORT_SHA256,
  );
  return reportSchema.parse(JSON.parse(bytes.toString('utf8')));
}

describe('retained Bluetooth fixed-packet digital evidence', () => {
  it('is content-addressed and bound to every implementation and test source', () => {
    const evidence = report();
    for (const source of [
      ...Object.values(evidence.subject),
      ...Object.values(evidence.tests),
    ]) {
      expect(source.sha256).toBe(sha256(source.path));
    }
  });

  it('binds both fixed packet and complete cf32le capture identities', () => {
    const profiles = new Map(report().profiles.map((profile) => [
      profile.profileId,
      profile,
    ]));
    expect(profiles.get('bluetooth-classic-connected')).toMatchObject({
      transmissionBitsSha256: BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256,
      captureComplexSamples:
        BLUETOOTH_FIXED_CAPTURE_SAMPLES['bluetooth-classic-connected'],
      catalogCf32leSha256:
        BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256['bluetooth-classic-connected'],
    });
    expect(profiles.get('bluetooth-le-advertising')).toMatchObject({
      transmissionBitsSha256:
        BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256,
      captureComplexSamples:
        BLUETOOTH_FIXED_CAPTURE_SAMPLES['bluetooth-le-advertising'],
      catalogCf32leSha256:
        BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256['bluetooth-le-advertising'],
    });
    for (const profile of profiles.values()) {
      expect(profile.modulationIndex).toBeGreaterThanOrEqual(
        profile.modulationRequirements.modulationIndexMinimum,
      );
      expect(profile.modulationIndex).toBeLessThanOrEqual(
        profile.modulationRequirements.modulationIndexMaximum,
      );
    }
  });

  it('keeps Bluetooth SIG RF-PHY and product qualification outside the claim', () => {
    expect(report().qualificationBoundary).toMatchObject({
      broadBluetoothComplianceClaim: 'not-made',
      rfPhyQualificationTestSuite: 'not-performed',
      conductedRfEvidence: 'not-provided',
      radiatedEvidence: 'not-provided',
      productQualification: 'not-provided',
    });
  });
});
