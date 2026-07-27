import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_REVALIDATION_TRIGGERS,
  RF_REVALIDATION_TRIGGERS,
  compute3gppRevalidationFingerprints,
  type ComplianceCandidateInput,
} from './3gpp-compliance.js';
import { RELEASE_19_SPECIFICATION_LOCK } from './3gpp-compliance-release-19.js';
import {
  admitStandardsArtifactBundle,
  sha256HexOfChunks,
  standardsArtifactConfigurationSha256,
  standardsArtifactManifestSha256,
  type AdmittedStandardsArtifactBundle,
} from './standards-artifact.js';
import {
  standardsTestCatalogSha256,
  type StandardsTestCampaign,
} from './standards-test-gate.js';
import { assess3gppArtifactQualification } from './3gpp-qualification.js';

const digest = (character: string): string => character.repeat(64);
const commit = (character: string): string => character.repeat(40);
const EVALUATED_AT = '2026-07-27T01:00:00.000Z';
const EXECUTED_AT = '2026-07-27T00:30:00.000Z';
const PROFILE_ID = 'lte-etm-1-1-10mhz-fdd';
const GENERATOR_IMPLEMENTATION_ID = 'signallab.lte.etm1';
const ORACLE_IMPLEMENTATION_ID = 'srsran.lte.oracle';
const ORACLE_REPORT_SHA256 = digest('6');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-27T03:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

function toolchain(
  role: 'generator' | 'oracle',
  identityId: string,
  providerId: string,
  provider: string,
  product: string,
  version: string,
  implementationId: string,
  marker: string,
  configurationSha256: string,
) {
  return {
    identityId,
    role,
    providerId,
    provider,
    product,
    version,
    implementationId,
    implementationSha256: digest(marker),
    source: {
      repositoryUrl: `https://example.com/${identityId}`,
      commitSha: commit(marker),
    },
    dependencyLock: {
      location: `dependencies/${identityId}.lock`,
      sha256: digest(marker === 'a' ? 'b' : 'e'),
    },
    configurationSha256,
    dependencies: [{
      name: `${identityId}-dependency`,
      version: '1.0.0',
      sourceUrl: `https://example.com/${identityId}/dependency`,
      contentSha256: digest(marker === 'a' ? 'c' : 'f'),
    }],
  };
}

function triggerFingerprints(rf = false) {
  const markers = '0123456789abcdef';
  const triggers = rf
    ? [...REQUIRED_REVALIDATION_TRIGGERS, ...RF_REVALIDATION_TRIGGERS]
    : REQUIRED_REVALIDATION_TRIGGERS;
  return triggers.map((trigger, index) => ({
    trigger,
    fingerprintSha256: digest(markers[index]!),
  }));
}

interface Fixture {
  readonly admittedArtifact: AdmittedStandardsArtifactBundle;
  readonly candidate: ComplianceCandidateInput;
  readonly campaign: StandardsTestCampaign;
  readonly payload: Uint8Array;
}

async function fixture(): Promise<Fixture> {
  const payload = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const artifactSha256 = sha256HexOfChunks(payload);
  const configuration = { waveform: 'lte-etm-1-1', bandwidthHz: 10_000_000 };
  const configurationSha256 = standardsArtifactConfigurationSha256(configuration);
  const generatorTool = {
    providerId: 'signallab',
    providerName: 'SignalLab',
    productName: 'SignalLab LTE',
    productVersion: '2.0.0',
    implementationId: GENERATOR_IMPLEMENTATION_ID,
  };
  const oracleTool = {
    providerId: 'srsran-project',
    providerName: 'srsRAN Project',
    productName: 'srsRAN 4G',
    productVersion: '6bcbd9e5',
    implementationId: ORACLE_IMPLEMENTATION_ID,
  };
  const manifest = {
    schemaVersion: 1 as const,
    preset: {
      presetId: PROFILE_ID,
      revision: '2.0.0',
      family: 'lte' as const,
    },
    qualification: 'independently-verified' as const,
    qualificationBoundary: {
      complianceClaim: 'not-claimed' as const,
      externalValidationEvidence: 'attached' as const,
      statement: 'Independent verification is limited to these exact bytes and does not itself make a broad compliance claim.',
    },
    recipe: {
      tool: generatorTool,
      recipeId: 'lte-etm-1-1-reference',
      recipeRevision: '1.0.0',
      deterministic: true as const,
      configuration,
      configurationSha256,
    },
    artifact: {
      artifactId: 'lte-etm-iq',
      kind: 'complex-iq' as const,
      location: 'artifacts/lte-etm.cf32',
      mediaType: 'application/vnd.signallab.complex-iq' as const,
      contentSha256: artifactSha256,
      generatorConfigurationSha256: configurationSha256,
      byteLength: payload.byteLength,
      channelCount: 1,
      channels: [{
        channelIndex: 0,
        role: 'antenna-port' as const,
        antennaPort: 0,
      }],
      complexSamplesPerChannel: 1,
      sampleRateHz: 1,
      centerFrequencyHz: 0,
      format: {
        container: 'raw-binary' as const,
        componentType: 'float32' as const,
        layout: 'interleaved-iq' as const,
        channelLayout: 'channel-major' as const,
        byteOrder: 'little-endian' as const,
        amplitudeUnit: 'normalized-full-scale' as const,
      },
      timing: {
        origin: {
          basis: 'relative-radio-frame' as const,
          frameNumber: 0,
          sampleOffset: 0 as const,
        },
        frameDuration: {
          unit: 'seconds' as const,
          numerator: 1,
          denominator: 1,
        },
        samplesPerFrame: 1,
        frameCount: 1,
      },
      processing: {
        scope: 'post-provider-output' as const,
        filtering: 'none' as const,
        normalization: 'none' as const,
        resampling: 'none' as const,
        scaling: 'none' as const,
        sampleValueTransform: 'none' as const,
      },
    },
    oracle: {
      tool: oracleTool,
      oracleId: 'srsran-etm-oracle',
      oracleRevision: '1.0.0',
      relationship: 'independent-implementation' as const,
      evaluatedAt: EXECUTED_AT,
      scope: {
        presetId: PROFILE_ID,
        presetRevision: '2.0.0',
        recipeId: 'lte-etm-1-1-reference',
        recipeRevision: '1.0.0',
      },
      artifactSha256,
      generatorConfigurationSha256: configurationSha256,
      result: 'pass' as const,
      reportSha256: ORACLE_REPORT_SHA256,
      reportLocation: 'reports/independent-validation.json',
    },
  };
  const admittedArtifact = await admitStandardsArtifactBundle({
    manifest,
    manifestSha256: standardsArtifactManifestSha256(manifest),
    chunks: [payload],
  });

  const generator = toolchain(
    'generator',
    'signallab-exact-generator',
    generatorTool.providerId,
    generatorTool.providerName,
    generatorTool.productName,
    generatorTool.productVersion,
    generatorTool.implementationId,
    'a',
    configurationSha256,
  );
  const oracle = toolchain(
    'oracle',
    'srsran-independent-oracle',
    oracleTool.providerId,
    oracleTool.providerName,
    oracleTool.productName,
    oracleTool.productVersion,
    oracleTool.implementationId,
    'd',
    digest('9'),
  );
  const citations = [{
    referenceId: '3gpp-ts-36-141-r19-v19-1-0',
    clauseIds: ['6.1.1'],
  }];
  const metric = {
    metricId: 'etm-frame-conformance',
    name: 'Exact independently checked E-TM frame',
    method: 'Independently compare every claimed field and resource element for the content-addressed artifact.',
    citations,
    measurement: { value: 0, unit: 'mismatches' },
    limit: { kind: 'upper-bound' as const, maximum: 0, inclusive: true, unit: 'mismatches' },
    margin: { value: 0, unit: 'mismatches', convention: 'positive-is-pass' as const },
    uncertainty: {
      kind: 'not-applicable-deterministic-digital' as const,
      rationale: 'This is a deterministic byte and field comparison, not an RF measurement.',
    },
    decisionRule: {
      kind: 'direct-comparison' as const,
      description: 'Pass only when the independent comparison finds zero mismatches.',
    },
    result: 'pass' as const,
  };
  const candidate: ComplianceCandidateInput = {
    schemaVersion: 1,
    candidateId: 'lte-etm-1-1-qualified-artifact',
    profileId: PROFILE_ID,
    technology: 'lte',
    specificationLockId: RELEASE_19_SPECIFICATION_LOCK.lockId,
    requestedQualification: '3gpp-digital-waveform-independently-verified',
    claimScope: {
      kind: 'digital-complex-baseband',
      rfEmitted: false,
      digitalArtifactClaimed: true,
      amplitudeConvention: 'Normalized complex baseband with relative resource-element power preserved.',
      timeReference: 'Sample zero is the first sample of frame zero.',
    },
    claimStatement: 'The claim is limited to the exact artifact and one locked E-TM frame clause.',
    applicability: {
      parameters: [
        { key: 'testModel.name', value: 'E-TM 1.1' },
        { key: 'sampling.sampleRateHz', value: 1, unit: 'samples/s' },
      ],
      includedCases: ['The exact content-addressed LTE E-TM 1.1 fixture artifact'],
      unsupportedCases: [{
        caseId: 'all-other-artifacts',
        description: 'Every artifact with a different manifest or payload digest.',
        reason: 'Qualification never transfers between content identities.',
      }],
    },
    citations,
    evidence: {
      evidenceBundleId: 'lte-etm-1-1-exact-evidence',
      toolchains: [generator, oracle],
      artifacts: [
        {
          artifactId: manifest.artifact.artifactId,
          kind: 'complex-iq',
          location: manifest.artifact.location,
          mediaType: manifest.artifact.mediaType,
          sha256: artifactSha256,
          byteLength: manifest.artifact.byteLength,
          producedByIdentityId: generator.identityId,
        },
        {
          artifactId: 'lte-etm-grid',
          kind: 'resource-grid',
          location: 'artifacts/lte-etm-grid.cbor',
          mediaType: 'application/cbor',
          sha256: digest('2'),
          byteLength: 16,
          producedByIdentityId: generator.identityId,
        },
        {
          artifactId: 'lte-etm-recipe',
          kind: 'generator-recipe',
          location: 'artifacts/lte-etm-recipe.json',
          mediaType: 'application/json',
          sha256: digest('3'),
          byteLength: 16,
          producedByIdentityId: generator.identityId,
        },
        {
          artifactId: 'lte-etm-expected',
          kind: 'expected-fields',
          location: 'artifacts/lte-etm-expected.json',
          mediaType: 'application/json',
          sha256: digest('4'),
          byteLength: 16,
          producedByIdentityId: generator.identityId,
        },
        {
          artifactId: 'generator-test-report',
          kind: 'test-report',
          location: 'reports/generator-tests.json',
          mediaType: 'application/json',
          sha256: digest('5'),
          byteLength: 16,
          producedByIdentityId: generator.identityId,
        },
        {
          artifactId: 'independent-validation',
          kind: 'validation-report',
          location: 'reports/independent-validation.json',
          mediaType: 'application/json',
          sha256: ORACLE_REPORT_SHA256,
          byteLength: 16,
          producedByIdentityId: oracle.identityId,
        },
      ],
      metrics: [metric],
      testRuns: [{
        testRunId: 'generator-tests-2026-07-27',
        suiteName: 'SignalLab exact LTE generator tests',
        executedAt: '2026-07-27T00:15:00.000Z',
        result: 'pass',
        generatorIdentityId: generator.identityId,
        sourceCommitSha: generator.source.commitSha,
        generatorImplementationSha256: generator.implementationSha256,
        testImplementationSha256: digest('8'),
        dependencyLockSha256: generator.dependencyLock.sha256,
        configurationSha256: generator.configurationSha256,
        reportArtifactId: 'generator-test-report',
        reportSha256: digest('5'),
      }],
      reports: [{
        reportId: 'independent-validation-report',
        reportArtifactId: 'independent-validation',
        validatorIdentityId: oracle.identityId,
        artifactIds: [
          manifest.artifact.artifactId,
          'lte-etm-grid',
          'lte-etm-recipe',
          'lte-etm-expected',
        ],
        metricIds: [metric.metricId],
        citations,
        executedAt: EXECUTED_AT,
        methodology: 'An independent implementation checked the exact retained bytes without invoking generator code.',
        result: 'pass',
        sha256: ORACLE_REPORT_SHA256,
      }],
      rfContext: null,
      revalidation: {
        status: 'current',
        evaluatedAt: EVALUATED_AT,
        triggerFingerprints: triggerFingerprints(),
        pendingTriggers: [],
      },
    },
  };

  const catalog = {
    schemaVersion: 1 as const,
    catalogId: 'lte-etm-1-1-independent-tests',
    revision: '1.0.0',
    subject: {
      presetId: PROFILE_ID,
      presetRevision: '2.0.0',
      generatorProviderId: generatorTool.providerId,
      generatorImplementationId: generatorTool.implementationId,
    },
    requirements: [{
      requirementId: 'lte-etm-frame',
      title: 'Exact E-TM common frame requirements',
      clause: {
        organization: '3GPP' as const,
        documentId: 'TS 36.141',
        revision: '19.1.0',
        release: 'Release 19',
        clause: '6.1.1',
        normativeTextSha256: digest('8'),
      },
      scope: 'digital-baseband' as const,
      applicability: 'applicable' as const,
      applicabilityRationale: 'The exact E-TM 1.1 artifact uses the common E-TM frame requirements.',
      disposition: 'implemented' as const,
      testIds: ['independent-lte-etm-frame-test'],
    }],
    tests: [{
      testId: 'independent-lte-etm-frame-test',
      title: 'Independent exact E-TM frame comparison',
      method: 'independent-oracle' as const,
      sourceLocation: 'src/lte-etm1-reference.test.ts#matches independent E-TM frame oracle',
      sourceFileSha256: digest('4'),
      assertionSha256: digest('7'),
      coversRequirementIds: ['lte-etm-frame'],
      implementation: {
        providerId: oracleTool.providerId,
        implementationId: oracleTool.implementationId,
      },
    }],
  };
  const campaign: StandardsTestCampaign = {
    catalog,
    catalogSha256: standardsTestCatalogSha256(catalog),
    subjectArtifactSha256: artifactSha256,
    evaluatedAt: EVALUATED_AT,
    executions: [{
      testId: 'independent-lte-etm-frame-test',
      assertionSha256: digest('7'),
      subjectArtifactSha256: artifactSha256,
      outcome: 'pass',
      executedAt: EXECUTED_AT,
      runner: { name: 'srsRAN oracle harness', version: '1.0.0' },
      reportSha256: ORACLE_REPORT_SHA256,
      executor: {
        providerId: oracleTool.providerId,
        implementationId: oracleTool.implementationId,
      },
    }],
  };

  candidate.evidence!.revalidation.triggerFingerprints = [
    ...compute3gppRevalidationFingerprints(candidate),
  ];
  return { admittedArtifact, candidate, campaign, payload };
}

function rehashCampaign(campaign: StandardsTestCampaign): void {
  (campaign as { catalogSha256: string }).catalogSha256 = standardsTestCatalogSha256(campaign.catalog);
}

function conductedFixture(input: Fixture): {
  readonly candidate: ComplianceCandidateInput;
  readonly campaign: StandardsTestCampaign;
} {
  const candidate = structuredClone(input.candidate);
  const campaign = structuredClone(input.campaign);
  const evidence = candidate.evidence!;
  const rfCitations = [{
    referenceId: '3gpp-ts-36-104-r19-v19-2-0',
    clauseIds: ['6.6'],
  }];
  const lab = {
    ...toolchain(
      'oracle',
      'accredited-rf-lab-validator',
      'accredited-rf-lab',
      'accredited-rf-lab',
      'Calibrated conducted RF validation',
      '1.0.0',
      'accredited-rf-lab.conducted-lte',
      '8',
      digest('9'),
    ),
    role: 'independent-validator' as const,
  };

  candidate.candidateId = 'lte-etm-1-1-conducted-qualified';
  candidate.requestedQualification = '3gpp-conformance-test-stimulus-qualified';
  candidate.claimScope = {
    kind: 'conducted-rf-port',
    rfEmitted: true,
    digitalArtifactClaimed: true,
    rfPort: 'RF OUT at the calibrated connector reference plane',
  };
  candidate.claimStatement = 'Qualification is limited to the exact artifact, named RF path, calibration state, and conducted clause.';
  candidate.citations = rfCitations;
  evidence.toolchains = [...evidence.toolchains, lab];
  evidence.artifacts = [
    ...evidence.artifacts,
    {
      artifactId: 'external-lab-validation',
      kind: 'validation-report',
      location: 'reports/external-lab-validation.json',
      mediaType: 'application/json',
      sha256: digest('7'),
      byteLength: 16,
      producedByIdentityId: lab.identityId,
    },
    {
      artifactId: 'rf-calibration-certificate',
      kind: 'calibration-certificate',
      location: 'reports/rf-calibration.pdf',
      mediaType: 'application/pdf',
      sha256: digest('8'),
      byteLength: 16,
      producedByIdentityId: lab.identityId,
    },
    {
      artifactId: 'rf-uncertainty-budget',
      kind: 'uncertainty-budget',
      location: 'reports/rf-uncertainty.json',
      mediaType: 'application/json',
      sha256: digest('9'),
      byteLength: 16,
      producedByIdentityId: lab.identityId,
    },
  ];
  const metric = {
    metricId: 'conducted-emissions-limit',
    name: 'Conducted RF spectrum emissions limit',
    method: 'Measure at the calibrated connector plane with the locked 3GPP method.',
    citations: rfCitations,
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
      description: 'Pass only when margin covers the expanded measurement uncertainty.',
      guardBand: 1,
      unit: 'dBc',
    },
    result: 'pass' as const,
  };
  evidence.metrics = [metric];
  evidence.reports[0]!.metricIds = [metric.metricId];
  evidence.reports[0]!.citations = rfCitations;
  evidence.reports = [
    ...evidence.reports,
    {
      reportId: 'external-lab-validation-report',
      reportArtifactId: 'external-lab-validation',
      validatorIdentityId: lab.identityId,
      artifactIds: ['lte-etm-iq', 'rf-calibration-certificate', 'rf-uncertainty-budget'],
      metricIds: [metric.metricId],
      citations: rfCitations,
      executedAt: '2026-07-27T00:40:00.000Z',
      methodology: 'The accredited laboratory measured the exact named hardware path and connector plane.',
      result: 'pass',
      sha256: digest('7'),
    },
  ];
  evidence.revalidation.triggerFingerprints = triggerFingerprints(true);
  evidence.rfContext = {
    kind: 'conducted-rf-port',
    hardwarePathId: 'conducted-rf-path-a',
    rfPort: 'RF OUT',
    connectorPlane: 'Front-panel connector mating plane',
    ambientTemperatureC: 23,
    referenceClock: 'Traceable 10 MHz laboratory reference',
    equipment: [
      {
        equipmentId: 'signal-generator-a',
        role: 'signal-generator',
        manufacturer: 'Example',
        model: 'RF Generator',
        serialNumber: 'SG-1',
        firmwareVersion: '1.0.0',
        calibrationId: null,
      },
      {
        equipmentId: 'rf-analyzer-a',
        role: 'rf-analyzer',
        manufacturer: 'Example',
        model: 'RF Analyzer',
        serialNumber: 'SA-1',
        firmwareVersion: '1.0.0',
        calibrationId: 'rf-analyzer-calibration',
      },
    ],
    calibrations: [{
      calibrationId: 'rf-analyzer-calibration',
      certificateNumber: 'CAL-2026-001',
      laboratory: 'Accredited RF Laboratory',
      calibratedAt: '2026-07-01',
      validUntil: '2027-07-01',
      scope: 'Conducted spectrum measurements at the named connector plane.',
      traceabilityStatement: 'Traceable through the laboratory calibration chain to national standards.',
      certificateArtifactId: 'rf-calibration-certificate',
      uncertaintyBudgetArtifactId: 'rf-uncertainty-budget',
    }],
  };

  (campaign.catalog.requirements as unknown as Array<
    (typeof campaign.catalog.requirements)[number]
  >)[0] = {
    requirementId: 'lte-conducted-emissions',
    title: 'Conducted output RF spectrum emissions',
    clause: {
      organization: '3GPP',
      documentId: 'TS 36.104',
      revision: '19.2.0',
      release: 'Release 19',
      clause: '6.6',
      normativeTextSha256: digest('a'),
    },
    scope: 'conducted-rf',
    applicability: 'applicable',
    applicabilityRationale: 'The named conducted RF path is explicitly within the claim boundary.',
    disposition: 'external-evidence-required',
    testIds: ['external-lab-conducted-emissions-test'],
  };
  (campaign.catalog.tests as unknown as Array<
    (typeof campaign.catalog.tests)[number]
  >)[0] = {
    testId: 'external-lab-conducted-emissions-test',
    title: 'Calibrated external-lab conducted emissions measurement',
    method: 'external-lab',
    sourceLocation: 'src/lte-etm1-reference.test.ts#records external conducted lab evidence',
    sourceFileSha256: digest('4'),
    assertionSha256: digest('b'),
    coversRequirementIds: ['lte-conducted-emissions'],
    implementation: {
      providerId: lab.providerId,
      implementationId: lab.implementationId,
    },
  };
  (campaign.executions as unknown as Array<
    (typeof campaign.executions)[number]
  >)[0] = {
    testId: 'external-lab-conducted-emissions-test',
    assertionSha256: digest('b'),
    subjectArtifactSha256: campaign.subjectArtifactSha256,
    outcome: 'pass',
    executedAt: '2026-07-27T00:40:00.000Z',
    runner: { name: 'Accredited laboratory execution system', version: '1.0.0' },
    reportSha256: digest('7'),
    executor: {
      providerId: lab.providerId,
      implementationId: lab.implementationId,
    },
  };
  rehashCampaign(campaign);
  candidate.evidence!.revalidation.triggerFingerprints = [
    ...compute3gppRevalidationFingerprints(candidate),
  ];
  return { candidate, campaign };
}

describe('composite 3GPP artifact qualification', () => {
  it('denies caller-complete metadata when the compiled profile policy and evidence bytes are absent', async () => {
    const input = await fixture();
    const decision = await assess3gppArtifactQualification({
      ...input,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.promotionAssessment.admitted).toBe(false);
    expect(decision.testAssessment?.admitted).toBe(true);
    expect(decision.artifactSha256).toBe(input.admittedArtifact.manifest.artifact.contentSha256);
    expect(decision.reasons.join(' ')).toMatch(
      /complete LTE E-TM1\.1 clause catalog|exact bytes|unpromoted/i,
    );
  });

  it.each([
    ['absent', null],
    ['malformed', { no: 'campaign' }],
  ])('denies an %s test campaign', async (_caseName, campaign) => {
    const input = await fixture();
    const decision = await assess3gppArtifactQualification({
      ...input,
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/campaign/i);
  });

  it.each(['fail', 'skipped'] as const)('denies a %s executed test', async (outcome) => {
    const input = await fixture();
    const campaign = structuredClone(input.campaign);
    campaign.executions[0]!.outcome = outcome;
    const decision = await assess3gppArtifactQualification({
      ...input,
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toContain(`outcome is ${outcome}`);
  });

  it('denies stale execution evidence', async () => {
    const input = await fixture();
    const campaign = structuredClone(input.campaign);
    campaign.executions[0]!.executedAt = '2026-07-25T00:30:00.000Z';
    const decision = await assess3gppArtifactQualification({
      ...input,
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/fresh within 24 hours/i);
  });

  it.each([
    ['preset revision', (campaign: StandardsTestCampaign) => {
      campaign.catalog.subject.presetRevision = '9.9.9';
    }],
    ['generator provider', (campaign: StandardsTestCampaign) => {
      campaign.catalog.subject.generatorProviderId = 'different-generator';
    }],
    ['generator implementation', (campaign: StandardsTestCampaign) => {
      campaign.catalog.subject.generatorImplementationId = 'different-generator';
    }],
  ])('denies a test catalog for a different %s', async (_caseName, mutate) => {
    const input = await fixture();
    const campaign = structuredClone(input.campaign);
    mutate(campaign);
    rehashCampaign(campaign);
    const decision = await assess3gppArtifactQualification({
      ...input,
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/test-catalog subject/i);
  });

  it('denies tests that passed against different bytes', async () => {
    const input = await fixture();
    const campaign = structuredClone(input.campaign);
    campaign.subjectArtifactSha256 = digest('9');
    campaign.executions[0]!.subjectArtifactSha256 = digest('9');
    const decision = await assess3gppArtifactQualification({
      ...input,
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.testAssessment?.admitted).toBe(true);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/different artifact content/i);
  });

  it('denies a compliance artifact hash that differs from admitted bytes', async () => {
    const input = await fixture();
    const candidate = structuredClone(input.candidate);
    candidate.evidence!.artifacts[0]!.sha256 = digest('9');
    const decision = await assess3gppArtifactQualification({
      ...input,
      candidate,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.promotionAssessment.admitted).toBe(false);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/complex-I\/Q evidence/i);
  });

  it('re-hashes replayed payload bytes instead of trusting a forged admitted handle', async () => {
    const input = await fixture();
    const forged = {
      ...input.admittedArtifact,
      readChunks: async function* (): AsyncGenerator<Uint8Array> {
        yield Uint8Array.from([255, 2, 3, 4, 5, 6, 7, 8]);
      },
    };
    const decision = await assess3gppArtifactQualification({
      ...input,
      admittedArtifact: forged,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/payload verification failed/i);
  });

  it('recomputes and binds the canonical manifest digest', async () => {
    const input = await fixture();
    const forged = {
      ...input.admittedArtifact,
      manifestSha256: digest('9'),
    };
    const decision = await assess3gppArtifactQualification({
      ...input,
      admittedArtifact: forged,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/manifest SHA-256/i);
  });

  it('denies a caller-selected scope or assurance weaker than the claim', async () => {
    const input = await fixture();
    const weak = await assess3gppArtifactQualification({
      ...input,
      scope: 'digital-baseband',
      assurance: 'automated',
    });
    const wrongScope = await assess3gppArtifactQualification({
      ...input,
      scope: 'conducted-rf',
      assurance: 'external-lab',
    });

    expect(weak.admitted).toBe(false);
    expect(weak.reasons.join(' ')).toMatch(/required independent-oracle assurance/i);
    expect(wrongScope.admitted).toBe(false);
    expect(wrongScope.reasons.join(' ')).toMatch(/does not match claim scope/i);
  });

  it('denies RF metadata until a trusted external-lab policy is installed', async () => {
    const input = await fixture();
    const rf = conductedFixture(input);
    const externalLab = await assess3gppArtifactQualification({
      ...input,
      ...rf,
      scope: 'conducted-rf',
      assurance: 'external-lab',
    });
    const softwareOnly = await assess3gppArtifactQualification({
      ...input,
      ...rf,
      scope: 'conducted-rf',
      assurance: 'automated',
    });

    expect(externalLab.admitted).toBe(false);
    expect(externalLab.reasons.join(' ')).toMatch(/No trusted conducted-RF|exact bytes/i);
    expect(softwareOnly.admitted).toBe(false);
    expect(softwareOnly.reasons.join(' ')).toMatch(/external-lab/i);
  });

  it('denies clause drift between the compliance claim and executed test catalog', async () => {
    const input = await fixture();
    const campaign = structuredClone(input.campaign);
    campaign.catalog.requirements[0]!.clause.clause = '6.1.1.1';
    rehashCampaign(campaign);
    const decision = await assess3gppArtifactQualification({
      ...input,
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.testAssessment?.admitted).toBe(true);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/which test catalog does not|which Compliance claim does not/i);
  });

  it('denies clause drift inside metrics and reports and invalidates revalidation', async () => {
    const input = await fixture();
    const candidate = structuredClone(input.candidate);
    candidate.evidence!.metrics[0]!.citations = [{
      referenceId: '3gpp-ts-36-141-r19-v19-1-0',
      clauseIds: ['6.1.1.1'],
    }];
    const decision = await assess3gppArtifactQualification({
      ...input,
      candidate,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.promotionAssessment.admitted).toBe(false);
    expect(decision.testAssessment?.admitted).toBe(true);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/Compliance metrics/i);
  });

  it('denies a campaign and evidence bundle from different revalidation snapshots', async () => {
    const input = await fixture();
    const campaign = structuredClone(input.campaign);
    campaign.evaluatedAt = '2026-07-27T02:00:00.000Z';
    const decision = await assess3gppArtifactQualification({
      ...input,
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.testAssessment?.admitted).toBe(true);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/same revalidation snapshot/i);
  });
});
