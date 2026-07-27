import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYNTHESIZED_SIGNAL_PROFILES } from './contracts.js';
import {
  REQUIRED_REVALIDATION_TRIGGERS,
  RF_REVALIDATION_TRIGGERS,
  assess3gppPromotion,
  complianceCandidateSchema,
  compute3gppRevalidationFingerprints,
  release19SpecificationLockSchema,
  validationMetricSchema,
  type ComplianceCandidateInput,
  type Release19SpecificationLockInput,
} from './3gpp-compliance.js';

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-26T03:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});
import { RELEASE_19_SPECIFICATION_LOCK } from './3gpp-compliance-release-19.js';

const digest = (character: string) => character.repeat(64);
const commit = (character: string) => character.repeat(40);

function toolchain(
  role: 'generator' | 'oracle',
  identityId: string,
  providerId: string,
  provider: string,
  marker: string,
) {
  return {
    identityId,
    role,
    providerId,
    provider,
    product: `${provider} ${role}`,
    version: '1.0.0',
    implementationId: `${identityId}.implementation`,
    implementationSha256: digest(marker),
    source: {
      repositoryUrl: `https://example.com/${identityId}`,
      commitSha: commit(marker),
    },
    dependencyLock: {
      location: `dependencies/${identityId}.lock`,
      sha256: digest(marker === 'a' ? 'b' : 'd'),
    },
    configurationSha256: digest(marker === 'a' ? 'c' : 'e'),
    dependencies: [{
      name: `${identityId}-dependency`,
      version: '1.0.0',
      sourceUrl: `https://example.com/${identityId}/dependency`,
      contentSha256: digest(marker === 'a' ? 'd' : 'f'),
    }],
  };
}

function triggerFingerprints(rf = false) {
  const triggers = rf
    ? [...REQUIRED_REVALIDATION_TRIGGERS, ...RF_REVALIDATION_TRIGGERS]
    : REQUIRED_REVALIDATION_TRIGGERS;
  return triggers.map((trigger, index) => ({
    trigger,
    fingerprintSha256: digest((index % 10).toString()),
  }));
}

function validDigitalCandidate(): ComplianceCandidateInput {
  const generator = toolchain(
    'generator',
    'signallab-exact-generator',
    'signallab',
    'SignalLab',
    'a',
  );
  const oracle = toolchain(
    'oracle',
    'independent-lte-oracle',
    'independent-phy-lab',
    'Independent PHY Lab',
    'c',
  );
  const citations = [
    {
      referenceId: '3gpp-ts-36-141-r19-v19-1-0',
      clauseIds: ['6.1.1', '6.1.1.1', 'Table 6.1.1.1-1'],
    },
    {
      referenceId: '3gpp-ts-36-211-r19-v19-3-0',
      clauseIds: ['4', '6'],
    },
    {
      referenceId: '3gpp-ts-36-212-r19-v19-3-0',
      clauseIds: ['5.3'],
    },
  ];
  const artifacts = [
    {
      artifactId: 'lte-etm-iq',
      kind: 'complex-iq' as const,
      location: 'artifacts/lte-etm.cf32',
      mediaType: 'application/vnd.signallab.complex-iq',
      sha256: digest('1'),
      byteLength: 1_228_800,
      producedByIdentityId: generator.identityId,
    },
    {
      artifactId: 'lte-etm-grid',
      kind: 'resource-grid' as const,
      location: 'artifacts/lte-etm-grid.cbor',
      mediaType: 'application/cbor',
      sha256: digest('2'),
      byteLength: 100_000,
      producedByIdentityId: generator.identityId,
    },
    {
      artifactId: 'lte-etm-recipe',
      kind: 'generator-recipe' as const,
      location: 'artifacts/lte-etm-recipe.json',
      mediaType: 'application/json',
      sha256: digest('3'),
      byteLength: 2_048,
      producedByIdentityId: generator.identityId,
    },
    {
      artifactId: 'lte-etm-expected',
      kind: 'expected-fields' as const,
      location: 'artifacts/lte-etm-expected.json',
      mediaType: 'application/json',
      sha256: digest('4'),
      byteLength: 4_096,
      producedByIdentityId: generator.identityId,
    },
    {
      artifactId: 'qualification-tests',
      kind: 'test-report' as const,
      location: 'reports/qualification-tests.json',
      mediaType: 'application/json',
      sha256: digest('5'),
      byteLength: 8_192,
      producedByIdentityId: generator.identityId,
    },
    {
      artifactId: 'independent-validation',
      kind: 'validation-report' as const,
      location: 'reports/independent-validation.json',
      mediaType: 'application/json',
      sha256: digest('6'),
      byteLength: 16_384,
      producedByIdentityId: oracle.identityId,
    },
  ];
  const metric = {
    metricId: 'clean-channel-crc-failures',
    name: 'Clean-channel decoded CRC failures',
    method: 'Synchronize and independently decode every applicable clean-channel codeword in the exact I/Q artifact.',
    citations: [{
      referenceId: '3gpp-ts-36-211-r19-v19-3-0',
      clauseIds: ['6'],
    }],
    measurement: { value: 0, unit: 'failures' },
    limit: { kind: 'upper-bound' as const, maximum: 0, inclusive: true, unit: 'failures' },
    margin: { value: 0, unit: 'failures', convention: 'positive-is-pass' as const },
    uncertainty: {
      kind: 'not-applicable-deterministic-digital' as const,
      rationale: 'This is an exact deterministic decoded-count comparison on immutable digital bytes.',
    },
    decisionRule: {
      kind: 'direct-comparison' as const,
      description: 'Pass only when the independently decoded CRC-failure count is no greater than zero.',
    },
    result: 'pass' as const,
  };

  const candidate: ComplianceCandidateInput = {
    schemaVersion: 1 as const,
    candidateId: 'lte-etm-1-1-10mhz-fdd-digital',
    profileId: 'lte-etm-1-1-10mhz-fdd',
    technology: 'lte' as const,
    specificationLockId: RELEASE_19_SPECIFICATION_LOCK.lockId,
    requestedQualification: '3gpp-digital-waveform-independently-verified' as const,
    claimScope: {
      kind: 'digital-complex-baseband' as const,
      rfEmitted: false as const,
      digitalArtifactClaimed: true as const,
      amplitudeConvention: 'Per-antenna-port normalized complex baseband with all relative RE powers preserved.',
      timeReference: 'Sample zero is the first sample of radio frame 0 and subframe 0.',
    },
    claimStatement: 'Qualification is limited to the exact content-addressed 10 ms LTE E-TM 1.1 artifact and locked Release 19 clauses; RF emission and broader LTE compliance are not claimed.',
    applicability: {
      parameters: [
        { key: 'testModel.name', value: 'E-TM 1.1' },
        { key: 'link.direction', value: 'downlink' },
        { key: 'channel.duplexMode', value: 'FDD' },
        { key: 'channel.bandwidthHz', value: 10_000_000, unit: 'Hz' },
        { key: 'resourceGrid.resourceBlocks', value: 50, unit: 'resource blocks' },
        { key: 'resourceGrid.subcarrierSpacingHz', value: 15_000, unit: 'Hz' },
        { key: 'resourceGrid.cyclicPrefix', value: 'normal' },
        { key: 'transmission.antennaPorts', value: 1, unit: 'ports' },
        { key: 'sampling.sampleRateHz', value: 15_360_000, unit: 'samples/s' },
        { key: 'capture.durationSubframes', value: 10, unit: 'subframes' },
        { key: 'capture.durationMs', value: 10, unit: 'ms' },
        { key: 'cell.physicalCellId', value: 0 },
      ],
      includedCases: ['LTE E-TM 1.1, 10 MHz, FDD, normal CP, one antenna port, PCI 0, 10 ms'],
      unsupportedCases: [
        {
          caseId: 'different-etm',
          description: 'Any E-TM other than E-TM 1.1.',
          reason: 'Test-model qualification does not transfer to another resource allocation.',
        },
        {
          caseId: 'different-bandwidth-or-duplex',
          description: 'Any bandwidth other than 10 MHz or any TDD configuration.',
          reason: 'The exact configuration and evidence cover only 10 MHz FDD.',
        },
        {
          caseId: 'multiple-ports-or-rf',
          description: 'Multiple antenna ports, calibrated conducted RF, or radiated output.',
          reason: 'The artifact is single-port digital complex baseband only.',
        },
      ],
    },
    citations,
    evidence: {
      evidenceBundleId: 'lte-etm-1-1-digital-evidence',
      toolchains: [generator, oracle],
      artifacts,
      metrics: [metric],
      testRuns: [{
        testRunId: 'qualification-tests-2026-07-26',
        suiteName: 'SignalLab exact LTE qualification suite',
        executedAt: '2026-07-26T01:00:00.000Z',
        result: 'pass' as const,
        generatorIdentityId: generator.identityId,
        sourceCommitSha: generator.source.commitSha,
        generatorImplementationSha256: generator.implementationSha256,
        testImplementationSha256: digest('9'),
        dependencyLockSha256: generator.dependencyLock.sha256,
        configurationSha256: generator.configurationSha256,
        reportArtifactId: 'qualification-tests',
        reportSha256: digest('5'),
      }],
      reports: [{
        reportId: 'independent-validation-report',
        reportArtifactId: 'independent-validation',
        validatorIdentityId: oracle.identityId,
        artifactIds: ['lte-etm-iq', 'lte-etm-grid', 'lte-etm-recipe', 'lte-etm-expected'],
        metricIds: [metric.metricId],
        citations,
        executedAt: '2026-07-26T01:30:00.000Z',
        methodology: 'The independent implementation ingested raw artifact bytes and recipe metadata without calling SignalLab generator code.',
        result: 'pass' as const,
        sha256: digest('6'),
      }],
      rfContext: null,
      revalidation: {
        status: 'current' as const,
        evaluatedAt: '2026-07-26T02:00:00.000Z',
        triggerFingerprints: triggerFingerprints(),
        pendingTriggers: [],
      },
    },
  };
  candidate.evidence!.revalidation.triggerFingerprints = [
    ...compute3gppRevalidationFingerprints(candidate),
  ];
  return candidate;
}

function validConductedCandidate(): ComplianceCandidateInput {
  const candidate = structuredClone(validDigitalCandidate());
  const evidence = candidate.evidence!;
  const metric = {
    metricId: 'conducted-spectrum-limit',
    name: 'Conducted RF spectrum limit',
    method: 'Measure the named RF output plane with the locked measurement method and calibrated analyzer path.',
    citations: [{
      referenceId: '3gpp-ts-36-104-r19-v19-2-0',
      clauseIds: ['6.6'],
    }],
    measurement: { value: -50, unit: 'dBc' },
    limit: { kind: 'upper-bound' as const, maximum: -45, inclusive: true, unit: 'dBc' },
    margin: { value: 5, unit: 'dBc', convention: 'positive-is-pass' as const },
    uncertainty: {
      kind: 'expanded' as const,
      value: 0.5,
      unit: 'dBc',
      coverageFactor: 2,
      confidencePercent: 95,
      budgetArtifactId: 'rf-uncertainty-budget',
    },
    decisionRule: {
      kind: 'guard-banded' as const,
      description: 'Pass only when raw margin remains at least the declared one-decibel guard band.',
      guardBand: 1,
      unit: 'dBc',
    },
    result: 'pass' as const,
  };

  candidate.candidateId = 'lte-etm-1-1-10mhz-fdd-conducted';
  candidate.requestedQualification = '3gpp-conformance-test-stimulus-qualified';
  candidate.claimScope = {
    kind: 'conducted-rf-port',
    rfEmitted: true,
    digitalArtifactClaimed: true,
    rfPort: 'RF OUT 1 at the calibrated connector reference plane',
  };
  candidate.claimStatement = 'Qualification is limited to the named conducted RF hardware path, connector plane, calibration state, and locked LTE test stimulus.';
  candidate.citations = [...candidate.citations, {
    referenceId: '3gpp-ts-36-104-r19-v19-2-0',
    clauseIds: ['6.6'],
  }];
  evidence.artifacts = [...evidence.artifacts,
    {
      artifactId: 'rf-uncertainty-budget',
      kind: 'uncertainty-budget',
      location: 'reports/rf-uncertainty-budget.json',
      mediaType: 'application/json',
      sha256: digest('7'),
      byteLength: 2_048,
      producedByIdentityId: 'independent-lte-oracle',
    },
    {
      artifactId: 'rf-calibration-certificate',
      kind: 'calibration-certificate',
      location: 'reports/rf-calibration-certificate.pdf',
      mediaType: 'application/pdf',
      sha256: digest('8'),
      byteLength: 20_000,
      producedByIdentityId: 'independent-lte-oracle',
    },
  ];
  evidence.metrics = [metric];
  evidence.reports[0]!.metricIds = [metric.metricId];
  evidence.revalidation.triggerFingerprints = triggerFingerprints(true);
  evidence.rfContext = {
    kind: 'conducted-rf-port',
    hardwarePathId: 'rf-path-a',
    rfPort: 'RF OUT 1',
    connectorPlane: 'Front-panel type-N connector mating plane',
    ambientTemperatureC: 23,
    referenceClock: '10 MHz traceable external reference',
    equipment: [
      {
        equipmentId: 'rf-source',
        role: 'signal-generator',
        manufacturer: 'Example Instruments',
        model: 'RF Source 1',
        serialNumber: 'SOURCE-001',
        firmwareVersion: '1.0.0',
        calibrationId: 'calibration-2026',
      },
      {
        equipmentId: 'rf-analyzer',
        role: 'rf-analyzer',
        manufacturer: 'Example Instruments',
        model: 'RF Analyzer 1',
        serialNumber: 'ANALYZER-001',
        firmwareVersion: '1.0.0',
        calibrationId: 'calibration-2026',
      },
    ],
    calibrations: [{
      calibrationId: 'calibration-2026',
      certificateNumber: 'CAL-2026-001',
      laboratory: 'ISO/IEC 17025 example laboratory',
      calibratedAt: '2026-07-01',
      validUntil: '2027-07-01',
      scope: 'RF source and analyzer path amplitude and frequency response over the claimed range.',
      traceabilityStatement: 'Measurements are traceable through the certificate to national standards.',
      certificateArtifactId: 'rf-calibration-certificate',
      uncertaintyBudgetArtifactId: 'rf-uncertainty-budget',
    }],
  };
  evidence.revalidation.triggerFingerprints = [
    ...compute3gppRevalidationFingerprints(candidate),
  ];
  return candidate;
}

describe('Release 19 specification lock', () => {
  it('pins the verified 2026-07-26 versions and exact official archive bytes', () => {
    const lock = release19SpecificationLockSchema.parse(RELEASE_19_SPECIFICATION_LOCK);
    const versions = Object.fromEntries(lock.specifications.map((entry) => [entry.specification, entry.version]));

    expect(lock).toMatchObject({
      lockId: '3gpp-release-19-2026-07-26',
      release: 19,
      verifiedAsOf: '2026-07-26',
      versionPolicy: {
        selection: 'frozen-explicit-version',
        automaticallyTrackLatest: false,
        newerOrUnknownRevisionAction: 'require-revalidation-before-promotion',
      },
    });
    expect(versions).toEqual({
      'TS 45.002': '19.0.0',
      'TS 45.003': '19.0.0',
      'TS 45.004': '19.0.0',
      'TS 45.005': '19.0.0',
      'TS 36.104': '19.2.0',
      'TS 36.141': '19.1.0',
      'TS 36.211': '19.3.0',
      'TS 36.212': '19.3.0',
      'TS 36.213': '19.4.0',
      'TS 38.104': '19.5.0',
      'TS 38.141-1': '19.5.0',
      'TS 38.141-2': '19.5.0',
      'TS 38.211': '19.4.0',
      'TS 38.212': '19.4.0',
      'TS 38.213': '19.4.0',
      'TS 38.214': '19.4.0',
    });
    for (const specification of lock.specifications) {
      expect(specification.portalUrl).toMatch(/^https:\/\/portal\.3gpp\.org\//);
      expect(specification.publication.url).toMatch(/^https:\/\/www\.3gpp\.org\/ftp\/Specs\/archive\//);
      expect(specification.publication.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(Object.isFrozen(RELEASE_19_SPECIFICATION_LOCK)).toBe(true);
    expect(Object.isFrozen(RELEASE_19_SPECIFICATION_LOCK.specifications)).toBe(true);
    expect(Object.isFrozen(RELEASE_19_SPECIFICATION_LOCK.specifications[0]!.publication)).toBe(true);
  });

  it('keeps every current cellular profile and the LTE pilot unpromoted', () => {
    const currentCellularProfiles = SYNTHESIZED_SIGNAL_PROFILES.filter((profile) =>
      profile.startsWith('gsm-') || profile.startsWith('lte-') || profile.startsWith('nr-'));
    const admissions = new Map<string, (typeof RELEASE_19_SPECIFICATION_LOCK.profileAdmissions)[number]>(
      RELEASE_19_SPECIFICATION_LOCK.profileAdmissions
      .map((admission) => [admission.profileId, admission]));

    for (const profile of currentCellularProfiles) {
      expect(admissions.get(profile)).toMatchObject({
        status: 'unpromoted',
        currentClassification: 'standards-derived-engineering-projection',
        promotionEvidenceBundleId: null,
      });
    }
    expect(admissions.get('lte-etm-1-1-10mhz-fdd')?.reason)
      .toMatch(/manifest remains reference-generated.*authenticated, executed clause campaign/i);
  });

  it('rejects mutable, mismatched, duplicated, or non-content-addressed locks', () => {
    const base: Release19SpecificationLockInput = structuredClone(RELEASE_19_SPECIFICATION_LOCK);
    const versionMismatch = structuredClone(base);
    versionMismatch.specifications[0]!.version = '19.1.0';
    const mutableUrl = structuredClone(base);
    mutableUrl.specifications[0]!.publication.url = 'https://www.3gpp.org/latest.zip';
    const badDigest = structuredClone(base);
    badDigest.specifications[0]!.publication.sha256 = 'A'.repeat(64);
    const duplicate = structuredClone(base);
    duplicate.specifications = [
      ...duplicate.specifications,
      structuredClone(duplicate.specifications[0]!),
    ];

    expect(release19SpecificationLockSchema.safeParse(versionMismatch).success).toBe(false);
    expect(release19SpecificationLockSchema.safeParse(mutableUrl).success).toBe(false);
    expect(release19SpecificationLockSchema.safeParse(badDigest).success).toBe(false);
    expect(release19SpecificationLockSchema.safeParse(duplicate).success).toBe(false);
  });
});

describe('structured metrics and evidence', () => {
  it('requires consistent units, raw margin, uncertainty, and decision-rule outcome', () => {
    const metric = validDigitalCandidate().evidence!.metrics[0]!;
    expect(validationMetricSchema.parse(metric)).toMatchObject({ result: 'pass' });
    expect(validationMetricSchema.safeParse({
      ...metric,
      margin: { ...metric.margin, unit: 'dB' },
    }).success).toBe(false);
    expect(validationMetricSchema.safeParse({
      ...metric,
      margin: { ...metric.margin, value: 1 },
    }).success).toBe(false);
    expect(validationMetricSchema.safeParse({
      ...metric,
      measurement: { value: 1, unit: 'failures' },
      margin: { value: -1, unit: 'failures', convention: 'positive-is-pass' },
      result: 'pass',
    }).success).toBe(false);
    expect(validationMetricSchema.safeParse({
      ...metric,
      limit: { ...metric.limit, inclusive: false },
    }).success).toBe(false);
  });

  it('rejects unknown fields instead of silently accepting incomplete semantics', () => {
    const candidate = validDigitalCandidate();
    expect(complianceCandidateSchema.safeParse({ ...candidate, broadCompliance: true }).success).toBe(false);
    const metric = candidate.evidence!.metrics[0]!;
    const { decisionRule: _decisionRule, ...withoutDecisionRule } = metric;
    expect(validationMetricSchema.safeParse(withoutDecisionRule).success).toBe(false);
  });
});

describe('fail-closed 3GPP promotion admission', () => {
  it('keeps structurally complete digital evidence unpromoted until the compiled matrix changes', () => {
    const assessment = assess3gppPromotion(validDigitalCandidate());
    expect(assessment).toMatchObject({
      admitted: false,
      requestedQualification: '3gpp-digital-waveform-independently-verified',
    });
    expect(assessment.reasons.join(' ')).toMatch(/explicitly unpromoted/i);
  });

  it('denies unpromoted state and qualification without an evidence bundle', () => {
    const unpromoted = validDigitalCandidate();
    unpromoted.requestedQualification = 'unpromoted';
    const noEvidence = validDigitalCandidate();
    noEvidence.evidence = null;

    expect(assess3gppPromotion(unpromoted)).toMatchObject({ admitted: false });
    expect(assess3gppPromotion(unpromoted).reasons.join(' ')).toMatch(/non-claim state/i);
    expect(assess3gppPromotion(noEvidence).reasons.join(' ')).toMatch(/complete evidence bundle/i);
  });

  it.each([
    'complex-iq',
    'resource-grid',
    'generator-recipe',
    'expected-fields',
    'test-report',
    'validation-report',
  ] as const)('denies promotion when the %s artifact is absent', (kind) => {
    const candidate = validDigitalCandidate();
    candidate.evidence!.artifacts = candidate.evidence!.artifacts.filter((artifact) => artifact.kind !== kind);

    const assessment = assess3gppPromotion(candidate);
    expect(assessment.admitted).toBe(false);
    expect(assessment.reasons.length, `${kind} removal must produce a fail-closed reason`).toBeGreaterThan(0);
  });

  it('denies same-provider, same-implementation, and same-dependency-lock oracle substitution', () => {
    const candidate = validDigitalCandidate();
    const generator = candidate.evidence!.toolchains.find((identity) => identity.role === 'generator')!;
    const oracle = candidate.evidence!.toolchains.find((identity) => identity.role === 'oracle')!;
    oracle.providerId = generator.providerId;
    oracle.implementationId = generator.implementationId;
    oracle.implementationSha256 = generator.implementationSha256;
    oracle.dependencyLock.sha256 = generator.dependencyLock.sha256;

    const assessment = assess3gppPromotion(candidate);
    expect(assessment.admitted).toBe(false);
    expect(assessment.reasons.join(' ')).toMatch(/provider independent.*implementation independent.*dependency lock/i);
  });

  it('denies unknown specifications, unlocked clauses, and a mismatched lock ID', () => {
    const candidate = validDigitalCandidate();
    candidate.specificationLockId = 'some-other-lock';
    candidate.citations[0]!.referenceId = '3gpp-ts-unknown';
    candidate.citations[1]!.clauseIds = ['not-a-locked-clause'];

    const assessment = assess3gppPromotion(candidate);
    expect(assessment.admitted).toBe(false);
    expect(assessment.reasons.join(' ')).toMatch(/does not match.*unknown locked specification.*not locked/i);
  });

  it('does not allow a caller-supplied lock to replace the compiled baseline', () => {
    const candidate = validDigitalCandidate();
    const substitutedLock = structuredClone(RELEASE_19_SPECIFICATION_LOCK);
    (substitutedLock as { lockId: string }).lockId = 'caller-selected-release-19-lock';

    const assessment = assess3gppPromotion(candidate, substitutedLock);
    expect(assessment.admitted).toBe(false);
    expect(assessment.reasons.join(' ')).toMatch(/cannot replace the compiled immutable/i);
  });

  it('denies fail or inconclusive results at metric and report levels', () => {
    const candidate = validDigitalCandidate();
    candidate.evidence!.metrics[0]!.result = 'inconclusive';
    candidate.evidence!.reports[0]!.result = 'inconclusive';

    const assessment = assess3gppPromotion(candidate);
    expect(assessment.admitted).toBe(false);
    expect(assessment.reasons.join(' ')).toMatch(/every promotion metric must pass.*every promotion report must pass/i);
  });

  it('requires fresh passing test evidence tied to the exact generator identity', () => {
    const missing = validDigitalCandidate();
    missing.evidence!.testRuns = [];
    const stale = validDigitalCandidate();
    stale.evidence!.testRuns[0]!.executedAt = '2026-07-24T00:00:00.000Z';
    const wrongBuild = validDigitalCandidate();
    wrongBuild.evidence!.testRuns[0]!.generatorImplementationSha256 = digest('f');

    expect(assess3gppPromotion(missing).reasons.join(' ')).toMatch(/testRuns|test run/i);
    expect(assess3gppPromotion(stale).reasons.join(' ')).toMatch(/not fresh within 24 hours/i);
    expect(assess3gppPromotion(wrongBuild).reasons.join(' ')).toMatch(/implementation digest must match/i);
  });

  it('requires reports current to revalidation and evidence no older than the specification lock', () => {
    const staleReport = validDigitalCandidate();
    staleReport.evidence!.reports[0]!.executedAt = '2026-07-18T00:00:00.000Z';
    const predatesLock = validDigitalCandidate();
    predatesLock.evidence!.testRuns[0]!.executedAt = '2026-07-25T01:00:00.000Z';
    predatesLock.evidence!.reports[0]!.executedAt = '2026-07-25T01:30:00.000Z';
    predatesLock.evidence!.revalidation.evaluatedAt = '2026-07-25T02:00:00.000Z';

    expect(assess3gppPromotion(staleReport).reasons.join(' ')).toMatch(/not current within seven days/i);
    expect(assess3gppPromotion(predatesLock).reasons.join(' ')).toMatch(/predates.*specification lock/i);
  });

  it.each([
    ['stale', '2026-07-25T02:59:59.999Z'],
    ['future', '2026-07-26T03:05:00.001Z'],
  ])('denies a %s caller-selected revalidation snapshot', (_caseName, evaluatedAt) => {
    const candidate = validDigitalCandidate();
    candidate.evidence!.revalidation.evaluatedAt = evaluatedAt;

    expect(assess3gppPromotion(candidate).reasons.join(' ')).toMatch(/system clock/i);
  });

  it('denies pending revalidation and missing trigger fingerprints', () => {
    const pending = validDigitalCandidate();
    pending.evidence!.revalidation = {
      ...pending.evidence!.revalidation,
      status: 'required',
      pendingTriggers: ['artifact-digest-changed'],
    };
    const incomplete = validDigitalCandidate();
    incomplete.evidence!.revalidation.triggerFingerprints =
      incomplete.evidence!.revalidation.triggerFingerprints.slice(0, -1);

    expect(assess3gppPromotion(pending).reasons.join(' ')).toMatch(/pending or required revalidation/i);
    expect(assess3gppPromotion(incomplete).reasons.join(' ')).toMatch(/missing revalidation fingerprint/i);
  });

  it('forbids RF equipment and calibration fields on a digital claim', () => {
    const digital = validDigitalCandidate();
    digital.evidence!.rfContext = validConductedCandidate().evidence!.rfContext;

    const assessment = assess3gppPromotion(digital);
    expect(assessment.admitted).toBe(false);
    expect(assessment.reasons.join(' ')).toMatch(/forbidden for non-RF claims/i);

    const certificateOnly = validDigitalCandidate();
    certificateOnly.evidence!.artifacts = [...certificateOnly.evidence!.artifacts, {
      artifactId: 'misplaced-calibration',
      kind: 'calibration-certificate',
      location: 'reports/misplaced-calibration.pdf',
      mediaType: 'application/pdf',
      sha256: digest('8'),
      byteLength: 100,
      producedByIdentityId: null,
    }];
    expect(assess3gppPromotion(certificateOnly).reasons.join(' '))
      .toMatch(/calibration certificates.*forbidden for non-RF claims/i);
  });

  it('keeps even structurally complete RF metadata unpromoted without an approved matrix entry', () => {
    const assessment = assess3gppPromotion(validConductedCandidate());
    expect(assessment).toMatchObject({
      admitted: false,
      requestedQualification: '3gpp-conformance-test-stimulus-qualified',
    });
    expect(assessment.reasons.join(' ')).toMatch(/explicitly unpromoted/i);
  });

  it('denies RF qualification without expanded uncertainty, calibration, required equipment, or RF triggers', () => {
    const candidate = validConductedCandidate();
    candidate.evidence!.metrics[0]!.uncertainty = {
      kind: 'not-applicable-deterministic-digital',
      rationale: 'Invalid for RF.',
    };
    candidate.evidence!.metrics[0]!.decisionRule = {
      kind: 'direct-comparison',
      description: 'Invalid for RF.',
    };
    const analyzer = candidate.evidence!.rfContext!.equipment
      .find((equipment) => equipment.role === 'rf-analyzer')!;
    analyzer.role = 'power-meter';
    candidate.evidence!.revalidation.triggerFingerprints =
      candidate.evidence!.revalidation.triggerFingerprints.filter(({ trigger }) =>
        !RF_REVALIDATION_TRIGGERS.includes(trigger as (typeof RF_REVALIDATION_TRIGGERS)[number]));

    const assessment = assess3gppPromotion(candidate);
    expect(assessment.admitted).toBe(false);
    const reasons = assessment.reasons.join(' ');
    expect(reasons).toMatch(/expanded uncertainty/i);
    expect(reasons).toMatch(/rf-analyzer/i);
    expect(reasons).toMatch(/guard-banded/i);
    expect(reasons).toMatch(/revalidation fingerprint/i);
  });

  it('denies expired calibration and scope-specific citation gaps', () => {
    const expired = validConductedCandidate();
    expired.evidence!.rfContext!.calibrations[0]!.validUntil = '2026-07-25';
    const noRfClause = validConductedCandidate();
    noRfClause.citations = noRfClause.citations.filter((citation) => !citation.referenceId.includes('36-104'));

    expect(assess3gppPromotion(expired).reasons.join(' ')).toMatch(/expired before/i);
    expect(assess3gppPromotion(noRfClause).reasons.join(' ')).toMatch(/no locked clause specific to conducted-rf-port/i);
  });

  it('requires an RF guard band at least as large as expanded uncertainty', () => {
    const candidate = validConductedCandidate();
    const metric = candidate.evidence!.metrics[0]!;
    if (metric.decisionRule.kind !== 'guard-banded') throw new Error('fixture must use a guard-banded rule');
    metric.decisionRule.guardBand = 0.1;

    expect(assess3gppPromotion(candidate).reasons.join(' '))
      .toMatch(/guard band must cover its expanded uncertainty/i);
  });
});
