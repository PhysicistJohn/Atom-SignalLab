import { z } from 'zod';
import { RELEASE_19_SPECIFICATION_LOCK } from './3gpp-compliance-release-19.js';
import { canonicalJsonBytes } from './standards-artifact.js';
import { sha256HexOfBytes } from './platform-bytes.js';

export const THREE_GPP_COMPLIANCE_SCHEMA_VERSION = 1 as const;

const identifierSchema = z.string().trim().min(1).max(128).regex(
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
  'Identifiers must be lowercase and use only alphanumerics with dot, underscore, or hyphen separators',
);
const boundedTextSchema = z.string().trim().min(1).max(4_096);
const shortTextSchema = z.string().trim().min(1).max(256);
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/, 'SHA-256 values must be lowercase hexadecimal');
const semanticVersionSchema = z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/, 'A three-component version is required');
const isoDateSchema = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'An ISO 8601 calendar date is required');
const isoInstantSchema = z.string().datetime({ offset: true });
const httpsUrlSchema = z.string().url().max(2_048)
  .refine((value) => value.startsWith('https://'), 'HTTPS is required');
const relativePathSchema = z.string().trim().min(1).max(1_024).regex(
  /^(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$))[A-Za-z0-9._/-]+$/,
  'A safe relative path is required',
);
const artifactLocationSchema = z.union([relativePathSchema, httpsUrlSchema]);
const finiteNumberSchema = z.number().finite().min(-1e18).max(1e18);
const positiveIntegerSchema = z.number().safe().int().positive();

function addDuplicateIssues(
  values: readonly string[],
  context: z.RefinementCtx,
  pathPrefix: readonly (string | number)[],
  message: string,
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) context.addIssue({ code: 'custom', path: [...pathPrefix, index], message });
    seen.add(value);
  }
}

function officialThreeGppUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === '3gpp.org' || hostname.endsWith('.3gpp.org');
}

export const threeGppTechnologySchema = z.enum(['geran', 'lte', 'nr']);
export type ThreeGppTechnology = z.infer<typeof threeGppTechnologySchema>;

export const specificationRoleSchema = z.enum([
  'waveform-structure',
  'channel-coding',
  'physical-procedures',
  'rf-requirements',
  'conducted-conformance',
  'radiated-conformance',
]);
export type SpecificationRole = z.infer<typeof specificationRoleSchema>;

export const lockedClauseSchema = z.object({
  clauseId: z.string().trim().min(1).max(96),
  title: shortTextSchema,
  applicability: z.enum(['digital', 'conducted-rf', 'radiated-ota']),
}).strict();
export type LockedClause = z.infer<typeof lockedClauseSchema>;

export const lockedSpecificationSchema = z.object({
  referenceId: identifierSchema,
  technology: threeGppTechnologySchema,
  specification: z.string().regex(/^TS [0-9]{2}\.[0-9]{3}(?:-[12])?$/),
  title: shortTextSchema,
  release: z.literal(19),
  version: semanticVersionSchema.refine((value) => value.startsWith('19.'), 'The version must be a Release 19 version'),
  role: specificationRoleSchema,
  clauses: z.array(lockedClauseSchema).min(1).max(64).readonly(),
  portalUrl: httpsUrlSchema.refine(officialThreeGppUrl, 'The version-verification URL must be an official 3GPP URL'),
  publication: z.object({
    publisher: z.literal('3GPP'),
    url: httpsUrlSchema.refine(officialThreeGppUrl, 'The publication URL must be an official 3GPP URL'),
    mediaType: z.literal('application/zip'),
    sha256: sha256HexSchema,
  }).strict(),
}).strict().superRefine((specification, context) => {
  addDuplicateIssues(
    specification.clauses.map((clause) => clause.clauseId),
    context,
    ['clauses'],
    'Clause IDs must be unique within a specification lock',
  );

  const [, minor, patch] = specification.version.split('.');
  const expectedSuffix = `-j${minor}${patch}.zip`;
  if (!specification.publication.url.endsWith(expectedSuffix)) {
    context.addIssue({
      code: 'custom',
      path: ['publication', 'url'],
      message: `Release/version lock requires an archive ending in ${expectedSuffix}`,
    });
  }
});
export type LockedSpecification = z.infer<typeof lockedSpecificationSchema>;

export const profileAdmissionSchema = z.object({
  profileId: identifierSchema,
  technology: threeGppTechnologySchema,
  status: z.literal('unpromoted'),
  currentClassification: z.literal('standards-derived-engineering-projection'),
  promotionEvidenceBundleId: z.null(),
  reason: boundedTextSchema,
}).strict();
export type ProfileAdmission = z.infer<typeof profileAdmissionSchema>;

export const release19SpecificationLockSchema = z.object({
  schemaVersion: z.literal(THREE_GPP_COMPLIANCE_SCHEMA_VERSION),
  lockId: identifierSchema,
  release: z.literal(19),
  verifiedAsOf: isoDateSchema,
  versionPolicy: z.object({
    selection: z.literal('frozen-explicit-version'),
    automaticallyTrackLatest: z.literal(false),
    newerOrUnknownRevisionAction: z.literal('require-revalidation-before-promotion'),
  }).strict(),
  specifications: z.array(lockedSpecificationSchema).min(1).max(64).readonly(),
  profileAdmissions: z.array(profileAdmissionSchema).min(1).max(128).readonly(),
}).strict().superRefine((lock, context) => {
  addDuplicateIssues(
    lock.specifications.map((specification) => specification.referenceId),
    context,
    ['specifications'],
    'Specification reference IDs must be unique',
  );
  addDuplicateIssues(
    lock.specifications.map((specification) => `${specification.specification}@${specification.version}`),
    context,
    ['specifications'],
    'A specification/version pair may be locked only once',
  );
  addDuplicateIssues(
    lock.profileAdmissions.map((profile) => profile.profileId),
    context,
    ['profileAdmissions'],
    'Profile admission IDs must be unique',
  );

  for (const technology of threeGppTechnologySchema.options) {
    if (!lock.specifications.some((specification) => specification.technology === technology)) {
      context.addIssue({
        code: 'custom',
        path: ['specifications'],
        message: `The Release 19 baseline must include ${technology}`,
      });
    }
  }
});
export type Release19SpecificationLock = z.infer<typeof release19SpecificationLockSchema>;
export type Release19SpecificationLockInput = z.input<typeof release19SpecificationLockSchema>;

export const claimScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('engineering-projection'),
    rfEmitted: z.literal(false),
    digitalArtifactClaimed: z.literal(false),
  }).strict(),
  z.object({
    kind: z.literal('digital-complex-baseband'),
    rfEmitted: z.literal(false),
    digitalArtifactClaimed: z.literal(true),
    amplitudeConvention: shortTextSchema,
    timeReference: shortTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('conducted-rf-port'),
    rfEmitted: z.literal(true),
    digitalArtifactClaimed: z.boolean(),
    rfPort: shortTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('radiated-ota'),
    rfEmitted: z.literal(true),
    digitalArtifactClaimed: z.boolean(),
    testDistanceM: z.number().finite().positive().max(10_000),
  }).strict(),
]);
export type ClaimScope = z.infer<typeof claimScopeSchema>;

export const requestedQualificationSchema = z.enum([
  'unpromoted',
  'standards-derived-engineering-projection',
  '3gpp-digital-waveform-independently-verified',
  '3gpp-conformance-test-stimulus-qualified',
]);
export type RequestedQualification = z.infer<typeof requestedQualificationSchema>;

const parameterValueSchema = z.union([
  z.string().trim().min(1).max(512),
  z.number().finite(),
  z.boolean(),
]);

export const applicabilityParameterSchema = z.object({
  key: z.string().trim().min(1).max(128).regex(/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/),
  value: parameterValueSchema,
  unit: z.string().trim().min(1).max(64).optional(),
}).strict();

export const unsupportedCaseSchema = z.object({
  caseId: identifierSchema,
  description: boundedTextSchema,
  reason: boundedTextSchema,
}).strict();

export const applicabilitySchema = z.object({
  parameters: z.array(applicabilityParameterSchema).min(1).max(256).readonly(),
  includedCases: z.array(shortTextSchema).min(1).max(64).readonly(),
  unsupportedCases: z.array(unsupportedCaseSchema).min(1).max(128).readonly(),
}).strict().superRefine((applicability, context) => {
  addDuplicateIssues(
    applicability.parameters.map((parameter) => parameter.key),
    context,
    ['parameters'],
    'Applicability parameter keys must be unique',
  );
  addDuplicateIssues(
    applicability.unsupportedCases.map((unsupported) => unsupported.caseId),
    context,
    ['unsupportedCases'],
    'Unsupported-case IDs must be unique',
  );
});
export type Applicability = z.infer<typeof applicabilitySchema>;

export const specificationCitationSchema = z.object({
  referenceId: identifierSchema,
  clauseIds: z.array(z.string().trim().min(1).max(96)).min(1).max(64).readonly(),
}).strict().superRefine((citation, context) => {
  addDuplicateIssues(citation.clauseIds, context, ['clauseIds'], 'Cited clause IDs must be unique');
});
export type SpecificationCitation = z.infer<typeof specificationCitationSchema>;

export const dependencyIdentitySchema = z.object({
  name: shortTextSchema,
  version: z.string().trim().min(1).max(128),
  sourceUrl: httpsUrlSchema,
  contentSha256: sha256HexSchema,
}).strict();
export type DependencyIdentity = z.infer<typeof dependencyIdentitySchema>;

export const toolchainIdentitySchema = z.object({
  identityId: identifierSchema,
  role: z.enum(['generator', 'oracle', 'independent-validator']),
  providerId: identifierSchema,
  provider: shortTextSchema,
  product: shortTextSchema,
  version: z.string().trim().min(1).max(128),
  implementationId: identifierSchema,
  implementationSha256: sha256HexSchema,
  source: z.object({
    repositoryUrl: httpsUrlSchema,
    commitSha: z.string().regex(/^[a-f0-9]{40,64}$/),
  }).strict(),
  dependencyLock: z.object({
    location: artifactLocationSchema,
    sha256: sha256HexSchema,
  }).strict(),
  configurationSha256: sha256HexSchema,
  dependencies: z.array(dependencyIdentitySchema).min(1).max(512).readonly(),
}).strict().superRefine((identity, context) => {
  addDuplicateIssues(
    identity.dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    context,
    ['dependencies'],
    'Dependency name/version identities must be unique',
  );
});
export type ToolchainIdentity = z.infer<typeof toolchainIdentitySchema>;

export const evidenceArtifactSchema = z.object({
  artifactId: identifierSchema,
  kind: z.enum([
    'complex-iq',
    'resource-grid',
    'generator-recipe',
    'expected-fields',
    'test-report',
    'validation-report',
    'calibration-certificate',
    'uncertainty-budget',
  ]),
  location: artifactLocationSchema,
  mediaType: z.string().trim().min(1).max(256),
  sha256: sha256HexSchema,
  byteLength: positiveIntegerSchema,
  producedByIdentityId: identifierSchema.nullable(),
}).strict();
export type EvidenceArtifact = z.infer<typeof evidenceArtifactSchema>;

const measurementSchema = z.object({
  value: finiteNumberSchema,
  unit: z.string().trim().min(1).max(64),
}).strict();

const upperLimitSchema = z.object({
  kind: z.literal('upper-bound'),
  maximum: finiteNumberSchema,
  inclusive: z.boolean(),
  unit: z.string().trim().min(1).max(64),
}).strict();
const lowerLimitSchema = z.object({
  kind: z.literal('lower-bound'),
  minimum: finiteNumberSchema,
  inclusive: z.boolean(),
  unit: z.string().trim().min(1).max(64),
}).strict();
const rangeLimitSchema = z.object({
  kind: z.literal('range'),
  minimum: finiteNumberSchema,
  maximum: finiteNumberSchema,
  inclusive: z.boolean(),
  unit: z.string().trim().min(1).max(64),
}).strict().refine((limit) => limit.minimum <= limit.maximum, {
  path: ['maximum'],
  message: 'Range maximum must be greater than or equal to range minimum',
});
const exactLimitSchema = z.object({
  kind: z.literal('exact-with-tolerance'),
  expected: finiteNumberSchema,
  tolerance: z.number().finite().nonnegative(),
  unit: z.string().trim().min(1).max(64),
}).strict();

export const metricLimitSchema = z.discriminatedUnion('kind', [
  upperLimitSchema,
  lowerLimitSchema,
  rangeLimitSchema,
  exactLimitSchema,
]);
export type MetricLimit = z.infer<typeof metricLimitSchema>;

export const measurementUncertaintySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('not-applicable-deterministic-digital'),
    rationale: boundedTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('expanded'),
    value: z.number().finite().nonnegative(),
    unit: z.string().trim().min(1).max(64),
    coverageFactor: z.number().finite().positive().max(10),
    confidencePercent: z.number().finite().positive().max(100),
    budgetArtifactId: identifierSchema,
  }).strict(),
]);
export type MeasurementUncertainty = z.infer<typeof measurementUncertaintySchema>;

export const decisionRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('direct-comparison'),
    description: boundedTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('guard-banded'),
    description: boundedTextSchema,
    guardBand: z.number().finite().nonnegative(),
    unit: z.string().trim().min(1).max(64),
  }).strict(),
]);
export type DecisionRule = z.infer<typeof decisionRuleSchema>;

function expectedRawMargin(measurement: number, limit: MetricLimit): number {
  if (limit.kind === 'upper-bound') return limit.maximum - measurement;
  if (limit.kind === 'lower-bound') return measurement - limit.minimum;
  if (limit.kind === 'range') return Math.min(measurement - limit.minimum, limit.maximum - measurement);
  return limit.tolerance - Math.abs(measurement - limit.expected);
}

export const validationMetricSchema = z.object({
  metricId: identifierSchema,
  name: shortTextSchema,
  method: boundedTextSchema,
  citations: z.array(specificationCitationSchema).min(1).max(32).readonly(),
  measurement: measurementSchema,
  limit: metricLimitSchema,
  margin: z.object({
    value: finiteNumberSchema,
    unit: z.string().trim().min(1).max(64),
    convention: z.literal('positive-is-pass'),
  }).strict(),
  uncertainty: measurementUncertaintySchema,
  decisionRule: decisionRuleSchema,
  result: z.enum(['pass', 'fail', 'inconclusive']),
}).strict().superRefine((metric, context) => {
  if (metric.measurement.unit !== metric.limit.unit || metric.measurement.unit !== metric.margin.unit) {
    context.addIssue({
      code: 'custom',
      path: ['margin', 'unit'],
      message: 'Measurement, limit, and margin units must match exactly',
    });
  }
  if (metric.uncertainty.kind === 'expanded' && metric.uncertainty.unit !== metric.measurement.unit) {
    context.addIssue({
      code: 'custom',
      path: ['uncertainty', 'unit'],
      message: 'Expanded-uncertainty units must match the measurement unit',
    });
  }
  if (metric.decisionRule.kind === 'guard-banded' && metric.decisionRule.unit !== metric.measurement.unit) {
    context.addIssue({
      code: 'custom',
      path: ['decisionRule', 'unit'],
      message: 'Guard-band units must match the measurement unit',
    });
  }

  const expectedMargin = expectedRawMargin(metric.measurement.value, metric.limit);
  const tolerance = Math.max(1e-12, Math.abs(expectedMargin) * 1e-12);
  if (Math.abs(metric.margin.value - expectedMargin) > tolerance) {
    context.addIssue({
      code: 'custom',
      path: ['margin', 'value'],
      message: 'Declared margin must equal the raw limit-to-measurement margin',
    });
  }

  const requiredMargin = metric.decisionRule.kind === 'guard-banded' ? metric.decisionRule.guardBand : 0;
  const limitIsInclusive = metric.limit.kind === 'exact-with-tolerance' || metric.limit.inclusive;
  const passesDecisionRule = metric.margin.value > requiredMargin
    || (metric.margin.value === requiredMargin && limitIsInclusive);
  if (metric.result === 'pass' && !passesDecisionRule) {
    context.addIssue({
      code: 'custom',
      path: ['result'],
      message: 'A passing result must satisfy the declared decision rule',
    });
  }
  if (metric.result === 'fail' && passesDecisionRule) {
    context.addIssue({
      code: 'custom',
      path: ['result'],
      message: 'A failing result must violate the declared decision rule',
    });
  }
});
export type ValidationMetric = z.infer<typeof validationMetricSchema>;

export const validationReportSchema = z.object({
  reportId: identifierSchema,
  reportArtifactId: identifierSchema,
  validatorIdentityId: identifierSchema,
  artifactIds: z.array(identifierSchema).min(1).max(256).readonly(),
  metricIds: z.array(identifierSchema).min(1).max(512).readonly(),
  citations: z.array(specificationCitationSchema).min(1).max(64).readonly(),
  executedAt: isoInstantSchema,
  methodology: boundedTextSchema,
  result: z.enum(['pass', 'fail', 'inconclusive']),
  sha256: sha256HexSchema,
}).strict().superRefine((report, context) => {
  addDuplicateIssues(report.artifactIds, context, ['artifactIds'], 'Report artifact references must be unique');
  addDuplicateIssues(report.metricIds, context, ['metricIds'], 'Report metric references must be unique');
});
export type ValidationReport = z.infer<typeof validationReportSchema>;

export const qualificationTestRunSchema = z.object({
  testRunId: identifierSchema,
  suiteName: shortTextSchema,
  executedAt: isoInstantSchema,
  result: z.enum(['pass', 'fail']),
  generatorIdentityId: identifierSchema,
  sourceCommitSha: z.string().regex(/^[a-f0-9]{40,64}$/),
  generatorImplementationSha256: sha256HexSchema,
  testImplementationSha256: sha256HexSchema,
  dependencyLockSha256: sha256HexSchema,
  configurationSha256: sha256HexSchema,
  reportArtifactId: identifierSchema,
  reportSha256: sha256HexSchema,
}).strict();
export type QualificationTestRun = z.infer<typeof qualificationTestRunSchema>;

export const equipmentSchema = z.object({
  equipmentId: identifierSchema,
  role: z.enum([
    'signal-generator',
    'rf-analyzer',
    'power-meter',
    'frequency-reference',
    'attenuator',
    'cable-path',
    'antenna',
    'positioner',
    'chamber',
  ]),
  manufacturer: shortTextSchema,
  model: shortTextSchema,
  serialNumber: shortTextSchema,
  firmwareVersion: z.string().trim().min(1).max(128),
  calibrationId: identifierSchema.nullable(),
}).strict();
export type Equipment = z.infer<typeof equipmentSchema>;

export const calibrationRecordSchema = z.object({
  calibrationId: identifierSchema,
  certificateNumber: shortTextSchema,
  laboratory: shortTextSchema,
  calibratedAt: isoDateSchema,
  validUntil: isoDateSchema,
  scope: boundedTextSchema,
  traceabilityStatement: boundedTextSchema,
  certificateArtifactId: identifierSchema,
  uncertaintyBudgetArtifactId: identifierSchema,
}).strict().refine((calibration) => calibration.validUntil >= calibration.calibratedAt, {
  path: ['validUntil'],
  message: 'Calibration validity cannot end before calibration',
});
export type CalibrationRecord = z.infer<typeof calibrationRecordSchema>;

const rfContextFields = {
  hardwarePathId: identifierSchema,
  equipment: z.array(equipmentSchema).min(2).max(128).readonly(),
  calibrations: z.array(calibrationRecordSchema).min(1).max(128).readonly(),
  ambientTemperatureC: z.number().finite().min(-100).max(200),
  referenceClock: shortTextSchema,
} as const;

export const rfEvidenceContextSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('conducted-rf-port'),
    ...rfContextFields,
    rfPort: shortTextSchema,
    connectorPlane: shortTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('radiated-ota'),
    ...rfContextFields,
    chamberId: identifierSchema,
    testDistanceM: z.number().finite().positive().max(10_000),
    polarization: shortTextSchema,
  }).strict(),
]);
export type RfEvidenceContext = z.infer<typeof rfEvidenceContextSchema>;

export const REQUIRED_REVALIDATION_TRIGGERS = Object.freeze([
  'specification-version-or-clause-changed',
  'generator-source-or-build-changed',
  'generator-dependency-lock-changed',
  'generator-recipe-or-configuration-changed',
  'artifact-digest-changed',
  'oracle-source-or-build-changed',
  'oracle-dependency-lock-changed',
  'validator-method-or-version-changed',
  'compiler-or-runtime-changed',
  'decision-rule-or-limit-changed',
  'external-report-invalidated',
  'support-matrix-expanded',
] as const);

export const RF_REVALIDATION_TRIGGERS = Object.freeze([
  'rf-hardware-path-or-firmware-changed',
  'calibration-changed-or-expired',
  'environmental-range-changed',
  'measurement-uncertainty-budget-changed',
] as const);

export const revalidationTriggerSchema = z.enum([
  ...REQUIRED_REVALIDATION_TRIGGERS,
  ...RF_REVALIDATION_TRIGGERS,
]);
export type RevalidationTrigger = z.infer<typeof revalidationTriggerSchema>;

export const revalidationStateSchema = z.object({
  status: z.enum(['current', 'required']),
  evaluatedAt: isoInstantSchema,
  triggerFingerprints: z.array(z.object({
    trigger: revalidationTriggerSchema,
    fingerprintSha256: sha256HexSchema,
  }).strict()).min(1).max(64).readonly(),
  pendingTriggers: z.array(revalidationTriggerSchema).max(64).readonly(),
}).strict().superRefine((state, context) => {
  addDuplicateIssues(
    state.triggerFingerprints.map((fingerprint) => fingerprint.trigger),
    context,
    ['triggerFingerprints'],
    'Revalidation-trigger fingerprints must be unique',
  );
  addDuplicateIssues(state.pendingTriggers, context, ['pendingTriggers'], 'Pending triggers must be unique');
  if (state.status === 'current' && state.pendingTriggers.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['pendingTriggers'],
      message: 'Current revalidation state cannot contain pending triggers',
    });
  }
  if (state.status === 'required' && state.pendingTriggers.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['pendingTriggers'],
      message: 'Required revalidation state must identify at least one pending trigger',
    });
  }
});
export type RevalidationState = z.infer<typeof revalidationStateSchema>;

export const complianceEvidenceBundleSchema = z.object({
  evidenceBundleId: identifierSchema,
  toolchains: z.array(toolchainIdentitySchema).min(2).max(64).readonly(),
  artifacts: z.array(evidenceArtifactSchema).min(1).max(1_024).readonly(),
  metrics: z.array(validationMetricSchema).min(1).max(2_048).readonly(),
  testRuns: z.array(qualificationTestRunSchema).min(1).max(256).readonly(),
  reports: z.array(validationReportSchema).min(1).max(256).readonly(),
  rfContext: rfEvidenceContextSchema.nullable(),
  revalidation: revalidationStateSchema,
}).strict().superRefine((bundle, context) => {
  const toolchainIds = new Set(bundle.toolchains.map((identity) => identity.identityId));
  const artifactById = new Map(bundle.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  const metricById = new Map(bundle.metrics.map((metric) => [metric.metricId, metric]));
  const calibrationIds = new Set(bundle.rfContext?.calibrations.map((calibration) => calibration.calibrationId) ?? []);

  addDuplicateIssues(
    bundle.toolchains.map((identity) => identity.identityId),
    context,
    ['toolchains'],
    'Toolchain identity IDs must be unique',
  );
  addDuplicateIssues(
    bundle.artifacts.map((artifact) => artifact.artifactId),
    context,
    ['artifacts'],
    'Artifact IDs must be unique',
  );
  addDuplicateIssues(
    bundle.artifacts.map((artifact) => artifact.sha256),
    context,
    ['artifacts'],
    'Artifact digests must be unique',
  );
  addDuplicateIssues(
    bundle.metrics.map((metric) => metric.metricId),
    context,
    ['metrics'],
    'Metric IDs must be unique',
  );
  addDuplicateIssues(
    bundle.testRuns.map((testRun) => testRun.testRunId),
    context,
    ['testRuns'],
    'Qualification test-run IDs must be unique',
  );
  addDuplicateIssues(
    bundle.reports.map((report) => report.reportId),
    context,
    ['reports'],
    'Report IDs must be unique',
  );

  for (const [index, artifact] of bundle.artifacts.entries()) {
    if (artifact.producedByIdentityId !== null && !toolchainIds.has(artifact.producedByIdentityId)) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts', index, 'producedByIdentityId'],
        message: 'Artifact producer must identify a declared toolchain',
      });
    }
  }

  for (const [index, report] of bundle.reports.entries()) {
    const validator = bundle.toolchains.find((identity) => identity.identityId === report.validatorIdentityId);
    if (validator === undefined || validator.role === 'generator') {
      context.addIssue({
        code: 'custom',
        path: ['reports', index, 'validatorIdentityId'],
        message: 'A report validator must identify a declared oracle or independent validator',
      });
    }
    const reportArtifact = artifactById.get(report.reportArtifactId);
    if (reportArtifact?.kind !== 'validation-report' || reportArtifact.sha256 !== report.sha256) {
      context.addIssue({
        code: 'custom',
        path: ['reports', index, 'reportArtifactId'],
        message: 'A report must match a content-addressed validation-report artifact',
      });
    }
    for (const [artifactIndex, artifactId] of report.artifactIds.entries()) {
      if (!artifactById.has(artifactId)) {
        context.addIssue({
          code: 'custom',
          path: ['reports', index, 'artifactIds', artifactIndex],
          message: 'Reports may reference only declared artifacts',
        });
      }
    }
    const reportMetrics = report.metricIds.map((metricId) => metricById.get(metricId));
    for (const [metricIndex, metric] of reportMetrics.entries()) {
      if (metric === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['reports', index, 'metricIds', metricIndex],
          message: 'Reports may reference only declared metrics',
        });
      }
    }
    if (report.result === 'pass' && reportMetrics.some((metric) => metric?.result !== 'pass')) {
      context.addIssue({
        code: 'custom',
        path: ['reports', index, 'result'],
        message: 'A passing report requires every referenced metric to pass',
      });
    }
    if (report.result === 'fail' && reportMetrics.every((metric) => metric?.result !== 'fail')) {
      context.addIssue({
        code: 'custom',
        path: ['reports', index, 'result'],
        message: 'A failing report requires at least one referenced metric to fail',
      });
    }
  }

  for (const [index, testRun] of bundle.testRuns.entries()) {
    const generator = bundle.toolchains.find((identity) => identity.identityId === testRun.generatorIdentityId);
    if (generator?.role !== 'generator') {
      context.addIssue({
        code: 'custom',
        path: ['testRuns', index, 'generatorIdentityId'],
        message: 'Qualification tests must identify the declared generator',
      });
    } else {
      if (testRun.sourceCommitSha !== generator.source.commitSha) {
        context.addIssue({
          code: 'custom',
          path: ['testRuns', index, 'sourceCommitSha'],
          message: 'Qualification-test source commit must match the generator identity',
        });
      }
      if (testRun.generatorImplementationSha256 !== generator.implementationSha256) {
        context.addIssue({
          code: 'custom',
          path: ['testRuns', index, 'generatorImplementationSha256'],
          message: 'Qualification-test subject implementation digest must match the generator identity',
        });
      }
      if (testRun.testImplementationSha256 === generator.implementationSha256) {
        context.addIssue({
          code: 'custom',
          path: ['testRuns', index, 'testImplementationSha256'],
          message: 'Qualification-test implementation bytes must be distinct from generator bytes',
        });
      }
      if (testRun.dependencyLockSha256 !== generator.dependencyLock.sha256) {
        context.addIssue({
          code: 'custom',
          path: ['testRuns', index, 'dependencyLockSha256'],
          message: 'Qualification-test dependency lock must match the generator identity',
        });
      }
      if (testRun.configurationSha256 !== generator.configurationSha256) {
        context.addIssue({
          code: 'custom',
          path: ['testRuns', index, 'configurationSha256'],
          message: 'Qualification-test configuration digest must match the generator identity',
        });
      }
    }
    const testReport = artifactById.get(testRun.reportArtifactId);
    if (testReport?.kind !== 'test-report' || testReport.sha256 !== testRun.reportSha256) {
      context.addIssue({
        code: 'custom',
        path: ['testRuns', index, 'reportArtifactId'],
        message: 'Qualification tests require a matching content-addressed test-report artifact',
      });
    }
  }

  for (const [index, metric] of bundle.metrics.entries()) {
    if (
      metric.uncertainty.kind === 'expanded'
      && artifactById.get(metric.uncertainty.budgetArtifactId)?.kind !== 'uncertainty-budget'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['metrics', index, 'uncertainty', 'budgetArtifactId'],
        message: 'Expanded uncertainty requires a content-addressed uncertainty-budget artifact',
      });
    }
  }

  if (bundle.rfContext !== null) {
    addDuplicateIssues(
      bundle.rfContext.equipment.map((equipment) => equipment.equipmentId),
      context,
      ['rfContext', 'equipment'],
      'Equipment IDs must be unique',
    );
    addDuplicateIssues(
      bundle.rfContext.calibrations.map((calibration) => calibration.calibrationId),
      context,
      ['rfContext', 'calibrations'],
      'Calibration IDs must be unique',
    );
    for (const [index, equipment] of bundle.rfContext.equipment.entries()) {
      if (equipment.calibrationId !== null && !calibrationIds.has(equipment.calibrationId)) {
        context.addIssue({
          code: 'custom',
          path: ['rfContext', 'equipment', index, 'calibrationId'],
          message: 'Equipment calibration IDs must identify declared calibration records',
        });
      }
    }
    for (const [index, calibration] of bundle.rfContext.calibrations.entries()) {
      if (artifactById.get(calibration.certificateArtifactId)?.kind !== 'calibration-certificate') {
        context.addIssue({
          code: 'custom',
          path: ['rfContext', 'calibrations', index, 'certificateArtifactId'],
          message: 'Calibration records require a content-addressed certificate artifact',
        });
      }
      if (artifactById.get(calibration.uncertaintyBudgetArtifactId)?.kind !== 'uncertainty-budget') {
        context.addIssue({
          code: 'custom',
          path: ['rfContext', 'calibrations', index, 'uncertaintyBudgetArtifactId'],
          message: 'Calibration records require a content-addressed uncertainty-budget artifact',
        });
      }
    }
  }
});
export type ComplianceEvidenceBundle = z.infer<typeof complianceEvidenceBundleSchema>;

export const complianceCandidateSchema = z.object({
  schemaVersion: z.literal(THREE_GPP_COMPLIANCE_SCHEMA_VERSION),
  candidateId: identifierSchema,
  profileId: identifierSchema,
  technology: threeGppTechnologySchema,
  specificationLockId: identifierSchema,
  requestedQualification: requestedQualificationSchema,
  claimScope: claimScopeSchema,
  claimStatement: boundedTextSchema,
  applicability: applicabilitySchema,
  citations: z.array(specificationCitationSchema).min(1).max(64).readonly(),
  evidence: complianceEvidenceBundleSchema.nullable(),
}).strict().superRefine((candidate, context) => {
  addDuplicateIssues(
    candidate.citations.map((citation) => citation.referenceId),
    context,
    ['citations'],
    'Candidate specification citations must be unique',
  );

  if (
    candidate.requestedQualification === 'standards-derived-engineering-projection'
    && candidate.claimScope.kind !== 'engineering-projection'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['claimScope', 'kind'],
      message: 'Engineering-projection classification requires engineering-projection scope',
    });
  }
  if (
    candidate.requestedQualification === '3gpp-digital-waveform-independently-verified'
    && candidate.claimScope.kind !== 'digital-complex-baseband'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['claimScope', 'kind'],
      message: 'Digital waveform qualification requires digital-complex-baseband scope',
    });
  }
  if (
    candidate.requestedQualification === '3gpp-conformance-test-stimulus-qualified'
    && candidate.claimScope.kind !== 'conducted-rf-port'
    && candidate.claimScope.kind !== 'radiated-ota'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['claimScope', 'kind'],
      message: 'Conformance-test stimulus qualification requires conducted or radiated RF scope',
    });
  }

  const rfScoped = candidate.claimScope.kind === 'conducted-rf-port' || candidate.claimScope.kind === 'radiated-ota';
  if (!rfScoped && candidate.evidence?.rfContext !== null && candidate.evidence !== null) {
    context.addIssue({
      code: 'custom',
      path: ['evidence', 'rfContext'],
      message: 'RF equipment and calibration fields are forbidden for non-RF claims',
    });
  }
  if (
    !rfScoped
    && candidate.evidence !== null
    && candidate.evidence.artifacts.some((artifact) =>
      artifact.kind === 'calibration-certificate' || artifact.kind === 'uncertainty-budget')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['evidence', 'artifacts'],
      message: 'Calibration certificates and uncertainty budgets are forbidden for non-RF claims',
    });
  }
  if (rfScoped && candidate.evidence !== null && candidate.evidence.rfContext?.kind !== candidate.claimScope.kind) {
    context.addIssue({
      code: 'custom',
      path: ['evidence', 'rfContext'],
      message: 'RF evidence context must exist and match the claim scope',
    });
  }
});
export type ComplianceCandidate = z.infer<typeof complianceCandidateSchema>;
export type ComplianceCandidateInput = z.input<typeof complianceCandidateSchema>;

export interface PromotionAssessment {
  readonly admitted: boolean;
  readonly requestedQualification: RequestedQualification | 'invalid';
  readonly reasons: readonly string[];
}

function checkCitations(
  citations: readonly SpecificationCitation[],
  lock: Release19SpecificationLock,
  technology: ThreeGppTechnology,
  scope: ClaimScope['kind'],
  reasons: string[],
): void {
  const specificationById = new Map(lock.specifications.map((specification) => [specification.referenceId, specification]));
  for (const citation of citations) {
    const specification = specificationById.get(citation.referenceId);
    if (specification === undefined) {
      reasons.push(`Unknown locked specification reference: ${citation.referenceId}`);
      continue;
    }
    if (specification.technology !== technology) {
      reasons.push(`Specification ${citation.referenceId} does not apply to ${technology}`);
    }
    const clauseById = new Map(specification.clauses.map((clause) => [clause.clauseId, clause]));
    for (const clauseId of citation.clauseIds) {
      const clause = clauseById.get(clauseId);
      if (clause === undefined) {
        reasons.push(`Clause ${clauseId} is not locked under ${citation.referenceId}`);
        continue;
      }
      const expectedApplicability = scope === 'digital-complex-baseband' || scope === 'engineering-projection'
        ? 'digital'
        : scope === 'conducted-rf-port'
          ? 'conducted-rf'
          : 'radiated-ota';
      if (clause.applicability !== expectedApplicability && clause.applicability !== 'digital') {
        reasons.push(`Clause ${citation.referenceId} ${clauseId} is outside the ${scope} claim scope`);
      }
    }
  }
}

function hasScopeSpecificCitation(
  citations: readonly SpecificationCitation[],
  lock: Release19SpecificationLock,
  technology: ThreeGppTechnology,
  scope: ClaimScope['kind'],
): boolean {
  const expectedApplicability = scope === 'digital-complex-baseband' || scope === 'engineering-projection'
    ? 'digital'
    : scope === 'conducted-rf-port'
      ? 'conducted-rf'
      : 'radiated-ota';
  const specificationById = new Map(lock.specifications.map((specification) => [specification.referenceId, specification]));
  return citations.some((citation) => {
    const specification = specificationById.get(citation.referenceId);
    return specification?.technology === technology
      && citation.clauseIds.some((clauseId) =>
        specification.clauses.some((clause) =>
          clause.clauseId === clauseId && clause.applicability === expectedApplicability));
  });
}

/**
 * Recomputes conservative trigger fingerprints from the complete promotion
 * state, excluding only the revalidation declaration itself.
 *
 * Each trigger is domain-separated. A change to any locked specification,
 * claim boundary, toolchain, artifact, report, metric, test run, or RF context
 * invalidates every stored fingerprint. This is intentionally stricter than a
 * minimal per-field dependency graph.
 */
export function compute3gppRevalidationFingerprints(
  candidateInput: unknown,
  lockInput: unknown = RELEASE_19_SPECIFICATION_LOCK,
): readonly { readonly trigger: RevalidationTrigger; readonly fingerprintSha256: string }[] {
  const candidate = complianceCandidateSchema.parse(candidateInput);
  const lock = release19SpecificationLockSchema.parse(lockInput);
  if (candidate.evidence === null) {
    throw new TypeError('Revalidation fingerprints require a complete evidence bundle');
  }
  const { evidence: _candidateEvidence, ...candidateMetadata } = candidate;
  const { revalidation: _revalidation, ...evidenceState } = candidate.evidence;
  const rfScoped = (
    candidate.claimScope.kind === 'conducted-rf-port'
    || candidate.claimScope.kind === 'radiated-ota'
  );
  const triggers: readonly RevalidationTrigger[] = rfScoped
    ? [...REQUIRED_REVALIDATION_TRIGGERS, ...RF_REVALIDATION_TRIGGERS]
    : REQUIRED_REVALIDATION_TRIGGERS;

  return Object.freeze(triggers.map((trigger) => Object.freeze({
    trigger,
    fingerprintSha256: sha256HexOfBytes(canonicalJsonBytes({
      schemaVersion: 1,
      trigger,
      candidate: candidateMetadata,
      specificationLock: lock,
      evidence: evidenceState,
    })),
  })));
}

function checkRequiredTriggerFingerprints(
  candidate: ComplianceCandidate,
  lock: Release19SpecificationLock,
  evidence: ComplianceEvidenceBundle,
  rfScoped: boolean,
  reasons: string[],
): void {
  const required = rfScoped
    ? [...REQUIRED_REVALIDATION_TRIGGERS, ...RF_REVALIDATION_TRIGGERS]
    : REQUIRED_REVALIDATION_TRIGGERS;
  const fingerprinted = new Map(
    evidence.revalidation.triggerFingerprints.map((entry) => [
      entry.trigger,
      entry.fingerprintSha256,
    ]),
  );
  const expected = new Map(
    compute3gppRevalidationFingerprints(candidate, lock).map((entry) => [
      entry.trigger,
      entry.fingerprintSha256,
    ]),
  );
  for (const trigger of required) {
    const observed = fingerprinted.get(trigger);
    if (observed === undefined) {
      reasons.push(`Missing revalidation fingerprint: ${trigger}`);
    } else if (observed !== expected.get(trigger)) {
      reasons.push(`Stale or fabricated revalidation fingerprint: ${trigger}`);
    }
  }
}

/**
 * Fail-closed promotion admission. Schema failures, unknown references,
 * incomplete evidence, inconclusive checks, or pending revalidation all deny
 * promotion. This function does not mutate catalog or profile state.
 */
export function assess3gppPromotion(
  candidateInput: unknown,
  lockInput: unknown = RELEASE_19_SPECIFICATION_LOCK,
): PromotionAssessment {
  const candidateResult = complianceCandidateSchema.safeParse(candidateInput);
  const suppliedLockResult = release19SpecificationLockSchema.safeParse(lockInput);
  const approvedLockResult =
    release19SpecificationLockSchema.safeParse(RELEASE_19_SPECIFICATION_LOCK);
  if (!candidateResult.success || !suppliedLockResult.success || !approvedLockResult.success) {
    const reasons = [
      ...(!candidateResult.success
        ? candidateResult.error.issues.map((issue) => `Candidate schema: ${issue.path.join('.') || '<root>'}: ${issue.message}`)
        : []),
      ...(!suppliedLockResult.success
        ? suppliedLockResult.error.issues.map((issue) => `Specification lock schema: ${issue.path.join('.') || '<root>'}: ${issue.message}`)
        : []),
      ...(!approvedLockResult.success
        ? approvedLockResult.error.issues.map((issue) => `Compiled specification lock schema: ${issue.path.join('.') || '<root>'}: ${issue.message}`)
        : []),
    ];
    return {
      admitted: false,
      requestedQualification: candidateResult.success ? candidateResult.data.requestedQualification : 'invalid',
      reasons,
    };
  }

  const candidate = candidateResult.data;
  const lock = approvedLockResult.data;
  const reasons: string[] = [];
  if (
    sha256HexOfBytes(canonicalJsonBytes(suppliedLockResult.data))
    !== sha256HexOfBytes(canonicalJsonBytes(lock))
  ) {
    reasons.push('Caller-supplied specification locks cannot replace the compiled immutable Release-19 lock');
  }

  if (candidate.specificationLockId !== lock.lockId) {
    reasons.push('Candidate specificationLockId does not match the supplied immutable lock');
  }
  checkCitations(candidate.citations, lock, candidate.technology, candidate.claimScope.kind, reasons);
  if (!hasScopeSpecificCitation(candidate.citations, lock, candidate.technology, candidate.claimScope.kind)) {
    reasons.push(`Candidate has no locked clause specific to ${candidate.claimScope.kind} scope`);
  }

  if (candidate.requestedQualification === 'unpromoted') {
    reasons.push('Unpromoted is a non-claim state and cannot be admitted as a promotion');
    return { admitted: false, requestedQualification: candidate.requestedQualification, reasons };
  }
  if (candidate.requestedQualification === 'standards-derived-engineering-projection') {
    return { admitted: reasons.length === 0, requestedQualification: candidate.requestedQualification, reasons };
  }
  const profileAdmission = lock.profileAdmissions.find(
    (entry) => entry.profileId === candidate.profileId,
  );
  if (profileAdmission === undefined) {
    reasons.push('Candidate profile is absent from the compiled Release-19 profile matrix');
  } else if (profileAdmission.status === 'unpromoted') {
    reasons.push(
      `Candidate profile remains explicitly unpromoted in the compiled Release-19 matrix: ${profileAdmission.reason}`,
    );
  }
  if (candidate.evidence === null) {
    reasons.push('Requested qualification requires a complete evidence bundle');
    return { admitted: false, requestedQualification: candidate.requestedQualification, reasons };
  }

  const evidence = candidate.evidence;
  const rfScoped = candidate.claimScope.kind === 'conducted-rf-port' || candidate.claimScope.kind === 'radiated-ota';
  const generators = evidence.toolchains.filter((identity) => identity.role === 'generator');
  const oracles = evidence.toolchains.filter((identity) => identity.role === 'oracle');
  if (generators.length !== 1) reasons.push('Evidence must identify exactly one generator toolchain');
  if (oracles.length === 0) reasons.push('Evidence must identify at least one independent oracle toolchain');
  for (const generator of generators) {
    for (const oracle of oracles) {
      if (oracle.providerId === generator.providerId) {
        reasons.push(`Oracle ${oracle.identityId} must have a provider independent of the generator`);
      }
      if (oracle.implementationId === generator.implementationId) {
        reasons.push(`Oracle ${oracle.identityId} must use an implementation independent of the generator`);
      }
      if (oracle.implementationSha256 === generator.implementationSha256) {
        reasons.push(`Oracle ${oracle.identityId} must not reuse the generator implementation bytes`);
      }
      if (oracle.dependencyLock.sha256 === generator.dependencyLock.sha256) {
        reasons.push(`Oracle ${oracle.identityId} must not reuse the generator dependency lock`);
      }
    }
  }
  const oracleIds = new Set(oracles.map((oracle) => oracle.identityId));
  if (!evidence.reports.some((report) => oracleIds.has(report.validatorIdentityId))) {
    reasons.push('At least one validation report must be produced by the independent oracle');
  }

  const requiredDigitalArtifacts: readonly EvidenceArtifact['kind'][] = [
    'complex-iq',
    'resource-grid',
    'generator-recipe',
    'expected-fields',
    'test-report',
    'validation-report',
  ];
  for (const kind of requiredDigitalArtifacts) {
    if (!evidence.artifacts.some((artifact) => artifact.kind === kind)) {
      reasons.push(`Evidence is missing required content-addressed artifact kind: ${kind}`);
    }
  }
  if (evidence.metrics.some((metric) => metric.result !== 'pass')) {
    reasons.push('Every promotion metric must pass; fail and inconclusive results deny promotion');
  }
  if (evidence.reports.some((report) => report.result !== 'pass')) {
    reasons.push('Every promotion report must pass; fail and inconclusive reports deny promotion');
  }
  const reportedMetricIds = new Set(evidence.reports.flatMap((report) => report.metricIds));
  for (const metric of evidence.metrics) {
    if (!reportedMetricIds.has(metric.metricId)) {
      reasons.push(`Metric ${metric.metricId} is not covered by a validation report`);
    }
  }
  if (evidence.testRuns.some((testRun) => testRun.result !== 'pass')) {
    reasons.push('Every qualification test run must pass');
  }
  const evaluationTimeMs = Date.parse(evidence.revalidation.evaluatedAt);
  const maximumTestAgeMs = 24 * 60 * 60 * 1_000;
  const maximumEvaluationAgeMs = 24 * 60 * 60 * 1_000;
  const maximumClockSkewMs = 5 * 60 * 1_000;
  const currentTimeMs = Date.now();
  if (evaluationTimeMs > currentTimeMs + maximumClockSkewMs) {
    reasons.push('Promotion revalidation time is in the future relative to the system clock');
  } else if (currentTimeMs - evaluationTimeMs > maximumEvaluationAgeMs) {
    reasons.push('Promotion revalidation is older than 24 hours relative to the system clock');
  }
  for (const testRun of evidence.testRuns) {
    const testTimeMs = Date.parse(testRun.executedAt);
    if (testTimeMs > evaluationTimeMs || evaluationTimeMs - testTimeMs > maximumTestAgeMs) {
      reasons.push(`Qualification test ${testRun.testRunId} is not fresh within 24 hours of revalidation`);
    }
  }
  const maximumReportAgeMs = 7 * 24 * 60 * 60 * 1_000;
  for (const report of evidence.reports) {
    const reportTimeMs = Date.parse(report.executedAt);
    if (reportTimeMs > evaluationTimeMs || evaluationTimeMs - reportTimeMs > maximumReportAgeMs) {
      reasons.push(`Validation report ${report.reportId} is not current within seven days of revalidation`);
    }
  }
  if (evidence.revalidation.status !== 'current' || evidence.revalidation.pendingTriggers.length > 0) {
    reasons.push('Promotion evidence has pending or required revalidation');
  }
  if (evidence.revalidation.evaluatedAt.slice(0, 10) < lock.verifiedAsOf) {
    reasons.push('Promotion evidence predates the supplied specification lock verification');
  }
  checkRequiredTriggerFingerprints(candidate, lock, evidence, rfScoped, reasons);

  for (const metric of evidence.metrics) {
    checkCitations(metric.citations, lock, candidate.technology, candidate.claimScope.kind, reasons);
    if (rfScoped && metric.uncertainty.kind !== 'expanded') {
      reasons.push(`RF metric ${metric.metricId} requires a structured expanded uncertainty`);
    }
    if (!rfScoped && metric.uncertainty.kind !== 'not-applicable-deterministic-digital') {
      reasons.push(`Digital metric ${metric.metricId} must not attach RF measurement uncertainty`);
    }
  }
  for (const report of evidence.reports) {
    checkCitations(report.citations, lock, candidate.technology, candidate.claimScope.kind, reasons);
  }

  if (!rfScoped && evidence.rfContext !== null) {
    reasons.push('Non-RF promotion evidence must not contain calibration or equipment data');
  }
  if (rfScoped) {
    if (evidence.rfContext === null) {
      reasons.push('RF promotion requires equipment, path, environment, and calibration evidence');
    } else {
      const evaluationDate = evidence.revalidation.evaluatedAt.slice(0, 10);
      for (const calibration of evidence.rfContext.calibrations) {
        if (calibration.calibratedAt > evaluationDate) {
          reasons.push(`Calibration ${calibration.calibrationId} occurs after the revalidation evaluation`);
        }
        if (calibration.validUntil < evaluationDate) {
          reasons.push(`Calibration ${calibration.calibrationId} expired before the revalidation evaluation`);
        }
      }
      const requiredRoles = candidate.claimScope.kind === 'radiated-ota'
        ? ['signal-generator', 'rf-analyzer', 'antenna', 'chamber']
        : ['signal-generator', 'rf-analyzer'];
      for (const role of requiredRoles) {
        if (!evidence.rfContext.equipment.some((equipment) => equipment.role === role)) {
          reasons.push(`RF evidence is missing required equipment role: ${role}`);
        }
      }
      for (const metric of evidence.metrics) {
        if (metric.decisionRule.kind !== 'guard-banded') {
          reasons.push(`RF metric ${metric.metricId} requires an uncertainty-aware guard-banded decision rule`);
        } else if (
          metric.uncertainty.kind === 'expanded'
          && metric.decisionRule.guardBand < metric.uncertainty.value
        ) {
          reasons.push(`RF metric ${metric.metricId} guard band must cover its expanded uncertainty`);
        }
      }
    }
  }

  return {
    admitted: reasons.length === 0,
    requestedQualification: candidate.requestedQualification,
    reasons: Object.freeze([...new Set(reasons)]),
  };
}
