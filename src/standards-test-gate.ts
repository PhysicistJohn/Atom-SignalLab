import { z } from 'zod';
import { sha256HexOfBytes } from './platform-bytes.js';

export const STANDARDS_TEST_CATALOG_SCHEMA_VERSION = 1 as const;

const identifierSchema = z.string().trim().min(1).max(128).regex(
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
  'Identifiers must be lowercase and use only alphanumerics with dot, underscore, or hyphen separators',
);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'SHA-256 digests must be lowercase hexadecimal');
const shortTextSchema = z.string().trim().min(1).max(512);
const boundedTextSchema = z.string().trim().min(1).max(4_096);
const sourceLocationSchema = z.string().trim().min(1).max(1_024).regex(
  /^src\/[A-Za-z0-9._/-]+\.test\.[cm]?[jt]sx?#[^\r\n#]+$/,
  'Automated test locations must identify a test in a repository-relative src/*.test.* file',
);

export const standardsTestScopeSchema = z.enum([
  'digital-baseband',
  'conducted-rf',
  'radiated-rf',
]);
export type StandardsTestScope = z.infer<typeof standardsTestScopeSchema>;

export const standardsVerificationMethodSchema = z.enum([
  'automated-unit',
  'automated-property',
  'automated-integration',
  'independent-oracle',
  'external-lab',
]);
export type StandardsVerificationMethod = z.infer<typeof standardsVerificationMethodSchema>;

export const standardsCoverageDispositionSchema = z.enum([
  'implemented',
  'unimplemented',
  'not-applicable',
  'external-evidence-required',
]);
export type StandardsCoverageDisposition = z.infer<typeof standardsCoverageDispositionSchema>;

export const standardsAssuranceSchema = z.enum([
  'automated',
  'independent-oracle',
  'external-lab',
]);
export type StandardsAssurance = z.infer<typeof standardsAssuranceSchema>;

export const clauseReferenceSchema = z.object({
  organization: z.literal('3GPP'),
  documentId: z.string().trim().regex(/^TS \d{2}\.\d{3}(?:-\d+)?$/),
  revision: z.string().trim().regex(/^\d+\.\d+\.\d+$/),
  release: z.string().trim().regex(/^Release \d+$/),
  clause: shortTextSchema,
  normativeTextSha256: sha256Schema,
}).strict();
export type ClauseReference = z.infer<typeof clauseReferenceSchema>;

export const standardsRequirementSchema = z.object({
  requirementId: identifierSchema,
  title: shortTextSchema,
  clause: clauseReferenceSchema,
  scope: standardsTestScopeSchema,
  applicability: z.enum(['applicable', 'not-applicable']),
  applicabilityRationale: boundedTextSchema,
  disposition: standardsCoverageDispositionSchema,
  testIds: z.array(identifierSchema).max(64).readonly(),
}).strict().superRefine((requirement, context) => {
  if (requirement.applicability === 'not-applicable') {
    if (requirement.disposition !== 'not-applicable') {
      context.addIssue({
        code: 'custom',
        path: ['disposition'],
        message: 'A non-applicable requirement must use the not-applicable disposition',
      });
    }
    if (requirement.testIds.length !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['testIds'],
        message: 'A non-applicable requirement cannot claim verification tests',
      });
    }
    return;
  }

  if (requirement.disposition === 'not-applicable') {
    context.addIssue({
      code: 'custom',
      path: ['disposition'],
      message: 'An applicable requirement cannot use the not-applicable disposition',
    });
  }
  if (requirement.disposition === 'implemented' && requirement.testIds.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['testIds'],
      message: 'An implemented requirement must name at least one executable verification test',
    });
  }
  if (requirement.scope !== 'digital-baseband' && requirement.disposition === 'implemented') {
    context.addIssue({
      code: 'custom',
      path: ['disposition'],
      message: 'Conducted and radiated requirements require external evidence, not a software-only implemented claim',
    });
  }
});
export type StandardsRequirement = z.infer<typeof standardsRequirementSchema>;

export const standardsTestDefinitionSchema = z.object({
  testId: identifierSchema,
  title: shortTextSchema,
  method: standardsVerificationMethodSchema,
  sourceLocation: sourceLocationSchema,
  sourceFileSha256: sha256Schema,
  assertionSha256: sha256Schema,
  coversRequirementIds: z.array(identifierSchema).min(1).max(128).readonly(),
  implementation: z.object({
    providerId: identifierSchema,
    implementationId: identifierSchema,
  }).strict(),
}).strict().superRefine((definition, context) => {
  if (new Set(definition.coversRequirementIds).size !== definition.coversRequirementIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['coversRequirementIds'],
      message: 'A test may list each requirement only once',
    });
  }
});
export type StandardsTestDefinition = z.infer<typeof standardsTestDefinitionSchema>;

export const standardsTestCatalogSchema = z.object({
  schemaVersion: z.literal(STANDARDS_TEST_CATALOG_SCHEMA_VERSION),
  catalogId: identifierSchema,
  revision: z.string().trim().min(1).max(64),
  subject: z.object({
    presetId: identifierSchema,
    presetRevision: z.string().trim().min(1).max(64),
    generatorProviderId: identifierSchema,
    generatorImplementationId: identifierSchema,
  }).strict(),
  requirements: z.array(standardsRequirementSchema).min(1).max(4_096).readonly(),
  tests: z.array(standardsTestDefinitionSchema).max(8_192).readonly(),
}).strict().superRefine((catalog, context) => {
  const requirementsById = new Map<string, StandardsRequirement>();
  for (const [index, requirement] of catalog.requirements.entries()) {
    if (requirementsById.has(requirement.requirementId)) {
      context.addIssue({
        code: 'custom',
        path: ['requirements', index, 'requirementId'],
        message: 'Requirement IDs must be unique',
      });
    }
    requirementsById.set(requirement.requirementId, requirement);
  }

  const testsById = new Map<string, StandardsTestDefinition>();
  for (const [index, definition] of catalog.tests.entries()) {
    if (testsById.has(definition.testId)) {
      context.addIssue({
        code: 'custom',
        path: ['tests', index, 'testId'],
        message: 'Test IDs must be unique',
      });
    }
    testsById.set(definition.testId, definition);
    for (const [requirementIndex, requirementId] of definition.coversRequirementIds.entries()) {
      if (!requirementsById.has(requirementId)) {
        context.addIssue({
          code: 'custom',
          path: ['tests', index, 'coversRequirementIds', requirementIndex],
          message: 'Tests may cover only requirements declared by this catalog',
        });
      }
    }
  }

  for (const [requirementIndex, requirement] of catalog.requirements.entries()) {
    if (new Set(requirement.testIds).size !== requirement.testIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['requirements', requirementIndex, 'testIds'],
        message: 'A requirement may list each test only once',
      });
    }
    for (const [testIndex, testId] of requirement.testIds.entries()) {
      const definition = testsById.get(testId);
      if (definition === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['requirements', requirementIndex, 'testIds', testIndex],
          message: 'Requirements may cite only tests declared by this catalog',
        });
      } else if (!definition.coversRequirementIds.includes(requirement.requirementId)) {
        context.addIssue({
          code: 'custom',
          path: ['requirements', requirementIndex, 'testIds', testIndex],
          message: 'Requirement-to-test coverage must be declared in both directions',
        });
      }
    }
  }

  for (const [testIndex, definition] of catalog.tests.entries()) {
    for (const [requirementIndex, requirementId] of definition.coversRequirementIds.entries()) {
      const requirement = requirementsById.get(requirementId);
      if (requirement !== undefined && !requirement.testIds.includes(definition.testId)) {
        context.addIssue({
          code: 'custom',
          path: ['tests', testIndex, 'coversRequirementIds', requirementIndex],
          message: 'Test-to-requirement coverage must be declared in both directions',
        });
      }
      if (requirement?.scope !== 'digital-baseband' && definition.method !== 'external-lab') {
        context.addIssue({
          code: 'custom',
          path: ['tests', testIndex, 'method'],
          message: 'Conducted and radiated requirements may be evidenced only by an external-lab test',
        });
      }
      if (requirement?.scope === 'digital-baseband' && definition.method === 'external-lab') {
        context.addIssue({
          code: 'custom',
          path: ['tests', testIndex, 'method'],
          message: 'Digital-baseband requirements must use an executable digital verification method',
        });
      }
    }
  }
});
export type StandardsTestCatalog = z.infer<typeof standardsTestCatalogSchema>;

export const standardsTestExecutionSchema = z.object({
  testId: identifierSchema,
  assertionSha256: sha256Schema,
  subjectArtifactSha256: sha256Schema,
  outcome: z.enum(['pass', 'fail', 'skipped']),
  executedAt: z.string().datetime({ offset: true, precision: 3 }),
  runner: z.object({
    name: shortTextSchema,
    version: z.string().trim().min(1).max(128),
  }).strict(),
  reportSha256: sha256Schema,
  executor: z.object({
    providerId: identifierSchema,
    implementationId: identifierSchema,
  }).strict(),
}).strict();
export type StandardsTestExecution = z.infer<typeof standardsTestExecutionSchema>;

export const standardsTestCampaignSchema = z.object({
  catalog: standardsTestCatalogSchema,
  catalogSha256: sha256Schema,
  subjectArtifactSha256: sha256Schema,
  evaluatedAt: z.string().datetime({ offset: true, precision: 3 }),
  executions: z.array(standardsTestExecutionSchema).max(8_192).readonly(),
}).strict();
export type StandardsTestCampaign = z.infer<typeof standardsTestCampaignSchema>;

export interface StandardsTestGateRequest {
  campaign: unknown;
  scope: StandardsTestScope;
  assurance: StandardsAssurance;
}

export interface StandardsTestGateDecision {
  admitted: boolean;
  scope: StandardsTestScope;
  assurance: StandardsAssurance;
  coveredRequirementIds: readonly string[];
  uncoveredRequirementIds: readonly string[];
  reasons: readonly string[];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize ${typeof value}`);
}

export function standardsTestCatalogSha256(input: unknown): string {
  const catalog = standardsTestCatalogSchema.parse(input);
  return sha256HexOfBytes(new TextEncoder().encode(canonicalJson(catalog)));
}

function methodSatisfiesAssurance(
  method: StandardsVerificationMethod,
  assurance: StandardsAssurance,
): boolean {
  switch (assurance) {
    case 'automated':
      return method === 'automated-unit'
        || method === 'automated-property'
        || method === 'automated-integration'
        || method === 'independent-oracle';
    case 'independent-oracle':
      return method === 'independent-oracle';
    case 'external-lab':
      return method === 'external-lab';
  }
}

/**
 * Admits only requirements proved by fresh, content-bound executions.
 *
 * The catalog describes what a test is intended to prove. It is not evidence.
 * Evidence exists only when the current campaign carries a passing execution
 * whose assertion digest, catalog digest, and subject-artifact digest all
 * match. This prevents a stale test report or an unexecuted traceability row
 * from promoting a waveform.
 */
export function assessStandardsTestCampaign(request: StandardsTestGateRequest): StandardsTestGateDecision {
  const parsed = standardsTestCampaignSchema.safeParse(request.campaign);
  const reasons: string[] = [];
  if (!parsed.success) {
    return {
      admitted: false,
      scope: request.scope,
      assurance: request.assurance,
      coveredRequirementIds: [],
      uncoveredRequirementIds: [],
      reasons: [`Malformed standards test campaign: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`],
    };
  }

  const campaign = parsed.data;
  const expectedCatalogSha256 = standardsTestCatalogSha256(campaign.catalog);
  if (campaign.catalogSha256 !== expectedCatalogSha256) {
    reasons.push('The test-catalog digest does not match the canonical catalog.');
  }
  const evaluationTimeMs = Date.parse(campaign.evaluatedAt);
  const maximumExecutionAgeMs = 24 * 60 * 60 * 1_000;
  const maximumEvaluationAgeMs = 24 * 60 * 60 * 1_000;
  const maximumClockSkewMs = 5 * 60 * 1_000;
  const currentTimeMs = Date.now();
  if (evaluationTimeMs > currentTimeMs + maximumClockSkewMs) {
    reasons.push('Campaign evaluation time is in the future relative to the system clock.');
  } else if (currentTimeMs - evaluationTimeMs > maximumEvaluationAgeMs) {
    reasons.push('Campaign evaluation is older than 24 hours relative to the system clock.');
  }
  if (request.scope === 'digital-baseband' && request.assurance === 'external-lab') {
    reasons.push('External-lab assurance is not a substitute for executable digital-baseband verification.');
  }
  if (request.scope !== 'digital-baseband' && request.assurance !== 'external-lab') {
    reasons.push('Conducted and radiated RF assurance requires external-lab evidence.');
  }

  const definitionsById = new Map(campaign.catalog.tests.map((definition) => [definition.testId, definition]));
  const executionsById = new Map<string, StandardsTestExecution>();
  for (const execution of campaign.executions) {
    if (executionsById.has(execution.testId)) {
      reasons.push(`Test ${execution.testId} has duplicate executions; the campaign is ambiguous.`);
      continue;
    }
    executionsById.set(execution.testId, execution);
    const definition = definitionsById.get(execution.testId);
    if (definition === undefined) {
      reasons.push(`Execution ${execution.testId} is not declared by the test catalog.`);
      continue;
    }
    if (execution.assertionSha256 !== definition.assertionSha256) {
      reasons.push(`Execution ${execution.testId} was produced by a stale or different test definition.`);
    }
    if (execution.subjectArtifactSha256 !== campaign.subjectArtifactSha256) {
      reasons.push(`Execution ${execution.testId} is bound to a different subject artifact.`);
    }
    if (execution.executor.providerId !== definition.implementation.providerId
      || execution.executor.implementationId !== definition.implementation.implementationId) {
      reasons.push(`Execution ${execution.testId} does not match its declared test implementation.`);
    }
    const executionTimeMs = Date.parse(execution.executedAt);
    if (
      executionTimeMs > evaluationTimeMs
      || evaluationTimeMs - executionTimeMs > maximumExecutionAgeMs
    ) {
      reasons.push(`Execution ${execution.testId} is not fresh within 24 hours of campaign evaluation.`);
    }
    if (definition.method === 'independent-oracle') {
      if (definition.implementation.providerId === campaign.catalog.subject.generatorProviderId) {
        reasons.push(`Independent-oracle test ${execution.testId} shares the generator provider.`);
      }
      if (definition.implementation.implementationId === campaign.catalog.subject.generatorImplementationId) {
        reasons.push(`Independent-oracle test ${execution.testId} shares the generator implementation.`);
      }
    }
    if (definition.method === 'external-lab') {
      if (definition.implementation.providerId === campaign.catalog.subject.generatorProviderId) {
        reasons.push(`External-lab test ${execution.testId} shares the generator provider.`);
      }
      if (definition.implementation.implementationId === campaign.catalog.subject.generatorImplementationId) {
        reasons.push(`External-lab test ${execution.testId} shares the generator implementation.`);
      }
    }
  }

  const coveredRequirementIds: string[] = [];
  const uncoveredRequirementIds: string[] = [];
  for (const requirement of campaign.catalog.requirements) {
    if (requirement.scope !== request.scope || requirement.applicability === 'not-applicable') continue;

    const requirementReasons: string[] = [];
    if (request.scope === 'digital-baseband' && requirement.disposition !== 'implemented') {
      requirementReasons.push(`Requirement ${requirement.requirementId} is ${requirement.disposition}.`);
    }
    if (request.scope !== 'digital-baseband' && requirement.disposition !== 'external-evidence-required') {
      requirementReasons.push(`Requirement ${requirement.requirementId} is not marked external-evidence-required.`);
    }

    const eligibleDefinitions = requirement.testIds
      .map((testId) => definitionsById.get(testId))
      .filter((definition): definition is StandardsTestDefinition => definition !== undefined)
      .filter((definition) => methodSatisfiesAssurance(definition.method, request.assurance));
    if (eligibleDefinitions.length === 0) {
      requirementReasons.push(
        `Requirement ${requirement.requirementId} has no ${request.assurance} test definition.`,
      );
    }

    for (const definition of eligibleDefinitions) {
      const execution = executionsById.get(definition.testId);
      if (execution === undefined) {
        requirementReasons.push(`Required test ${definition.testId} was not executed.`);
      } else if (execution.outcome !== 'pass') {
        requirementReasons.push(`Required test ${definition.testId} outcome is ${execution.outcome}.`);
      } else if (execution.assertionSha256 !== definition.assertionSha256) {
        requirementReasons.push(`Required test ${definition.testId} has a mismatched assertion digest.`);
      } else if (execution.subjectArtifactSha256 !== campaign.subjectArtifactSha256) {
        requirementReasons.push(`Required test ${definition.testId} has a mismatched subject artifact.`);
      } else if (
        execution.executor.providerId !== definition.implementation.providerId
        || execution.executor.implementationId !== definition.implementation.implementationId
      ) {
        requirementReasons.push(`Required test ${definition.testId} has a mismatched executor identity.`);
      } else {
        const executionTimeMs = Date.parse(execution.executedAt);
        if (
          executionTimeMs > evaluationTimeMs
          || evaluationTimeMs - executionTimeMs > maximumExecutionAgeMs
        ) {
          requirementReasons.push(`Required test ${definition.testId} is not fresh within 24 hours.`);
        }
      }
    }

    if (requirementReasons.length === 0) {
      coveredRequirementIds.push(requirement.requirementId);
    } else {
      uncoveredRequirementIds.push(requirement.requirementId);
      reasons.push(...requirementReasons);
    }
  }

  if (coveredRequirementIds.length === 0) {
    reasons.push(`No applicable ${request.scope} requirements were proved by this campaign.`);
  }

  return {
    admitted: reasons.length === 0 && uncoveredRequirementIds.length === 0,
    scope: request.scope,
    assurance: request.assurance,
    coveredRequirementIds,
    uncoveredRequirementIds,
    reasons,
  };
}
