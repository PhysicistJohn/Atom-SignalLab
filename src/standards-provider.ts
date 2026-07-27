import { z } from 'zod';
import {
  StandardsArtifactAdmissionError,
  admitStandardsArtifactBundle,
  canonicalJsonObjectSchema,
  canonicalJsonString,
  parseStandardsArtifactManifest,
  standardsArtifactConfigurationSha256,
  standardsArtifactManifestSha256,
  standardsArtifactQualificationSchema,
  standardsArtifactRelativePathSchema,
  standardsSha256Schema,
  standardsToolIdentitySchema,
  type AdmittedStandardsArtifactBundle,
  type CanonicalJsonObject,
  type StandardsArtifactBundleCandidate,
  type StandardsArtifactQualification,
  type StandardsArtifactReadOptions,
  type StandardsToolIdentity,
} from './standards-artifact.js';

const identifierSchema = z.string().trim().min(1).max(96).regex(
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
  'Identifier must be lowercase and contain only alphanumerics with dot, underscore, or hyphen separators',
);
const versionSchema = z.string().trim().min(1).max(128);

export const standardsGenerationRequestSchema = z.object({
  presetId: identifierSchema,
  presetRevision: z.string().trim().min(1).max(64),
  family: z.enum(['lab', 'geran', 'lte', 'nr', 'wlan', 'bluetooth']),
  recipeId: identifierSchema,
  recipeRevision: versionSchema,
  configuration: canonicalJsonObjectSchema,
  configurationSha256: standardsSha256Schema,
  requestedQualification: standardsArtifactQualificationSchema,
  expectedArtifactSha256: standardsSha256Schema.optional(),
}).strict().superRefine((request, context) => {
  if (standardsArtifactConfigurationSha256(request.configuration) !== request.configurationSha256) {
    context.addIssue({
      code: 'custom',
      path: ['configurationSha256'],
      message: 'Request configuration SHA-256 must match its canonical configuration',
    });
  }
});
export type StandardsGenerationRequest = z.infer<typeof standardsGenerationRequestSchema>;

/**
 * A provider emits a reference-generated candidate. Independent promotion is a
 * separate runtime step so a generator cannot vouch for itself.
 */
export interface StandardsArtifactProvider {
  readonly identity: StandardsToolIdentity;
  supports(request: StandardsGenerationRequest): boolean | Promise<boolean>;
  generate(request: StandardsGenerationRequest): Promise<StandardsArtifactBundleCandidate>;
}

const httpsUrlSchema = z.string().max(2_048).url()
  .refine((value) => value.startsWith('https://'), 'Oracle report URL must use HTTPS');

export const standardsOracleEvaluationSchema = z.object({
  oracleId: identifierSchema,
  oracleRevision: versionSchema,
  evaluatedAt: z.string().datetime({ offset: true, precision: 3 }),
  result: z.enum(['pass', 'fail', 'inconclusive']),
  reportSha256: standardsSha256Schema,
  reportLocation: z.union([httpsUrlSchema, standardsArtifactRelativePathSchema]),
}).strict();
export type StandardsOracleEvaluation = z.infer<typeof standardsOracleEvaluationSchema>;

export interface StandardsOracleInput {
  readonly request: StandardsGenerationRequest;
  readonly manifestSha256: string;
  readonly manifest: AdmittedStandardsArtifactBundle['manifest'];
  readChunks(options?: StandardsArtifactReadOptions): AsyncIterable<Uint8Array>;
}

export interface StandardsArtifactOracle {
  readonly identity: StandardsToolIdentity;
  evaluate(input: StandardsOracleInput): Promise<StandardsOracleEvaluation>;
}

export type StandardsProviderRuntimeErrorCode =
  | 'generation-failed'
  | 'invalid-oracle'
  | 'invalid-provider'
  | 'invalid-request'
  | 'oracle-required'
  | 'oracle-result-not-pass'
  | 'provider-binding-mismatch'
  | 'unsupported-request';

export class StandardsProviderRuntimeError extends Error {
  constructor(
    readonly code: StandardsProviderRuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StandardsProviderRuntimeError';
  }
}

export interface StandardsProviderRuntimeOptions {
  readonly oracle?: StandardsArtifactOracle;
  readonly maximumRetainedBytes?: number;
}

function parseRequest(input: unknown): StandardsGenerationRequest {
  const parsed = standardsGenerationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new StandardsProviderRuntimeError(
      'invalid-request',
      'Standards generation request is invalid',
      { cause: parsed.error },
    );
  }
  return structuredClone(parsed.data);
}

function parseToolIdentity(
  input: unknown,
  kind: 'provider' | 'oracle',
): StandardsToolIdentity {
  const parsed = standardsToolIdentitySchema.safeParse(input);
  if (!parsed.success) {
    throw new StandardsProviderRuntimeError(
      kind === 'provider' ? 'invalid-provider' : 'invalid-oracle',
      `${kind === 'provider' ? 'Provider' : 'Oracle'} identity is invalid`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalJsonString(left) === canonicalJsonString(right);
}

function assertProviderBindings(
  candidate: StandardsArtifactBundleCandidate,
  provider: StandardsToolIdentity,
  request: StandardsGenerationRequest,
): void {
  let manifest;
  try {
    manifest = parseStandardsArtifactManifest(candidate.manifest);
  } catch (cause) {
    if (cause instanceof StandardsArtifactAdmissionError) throw cause;
    throw new StandardsProviderRuntimeError(
      'provider-binding-mismatch',
      'Provider emitted an invalid standards artifact manifest',
      { cause },
    );
  }

  const bindingsMatch = (
    manifest.qualification === 'reference-generated'
    && manifest.oracle === null
    && manifest.qualificationBoundary.externalValidationEvidence === 'not-provided'
    && manifest.preset.presetId === request.presetId
    && manifest.preset.revision === request.presetRevision
    && manifest.preset.family === request.family
    && manifest.recipe.recipeId === request.recipeId
    && manifest.recipe.recipeRevision === request.recipeRevision
    && manifest.recipe.configurationSha256 === request.configurationSha256
    && sameCanonicalValue(manifest.recipe.configuration, request.configuration)
    && sameCanonicalValue(manifest.recipe.tool, provider)
  );
  if (!bindingsMatch) {
    throw new StandardsProviderRuntimeError(
      'provider-binding-mismatch',
      'Provider manifest does not exactly bind the requested preset, recipe, configuration, and provider identity',
    );
  }
  if (
    request.expectedArtifactSha256 !== undefined
    && manifest.artifact.contentSha256 !== request.expectedArtifactSha256
  ) {
    throw new StandardsProviderRuntimeError(
      'provider-binding-mismatch',
      'Provider artifact does not match the request-pinned content SHA-256',
    );
  }
}

function assertIndependentOracle(
  provider: StandardsToolIdentity,
  oracle: StandardsToolIdentity,
): void {
  if (
    provider.providerId === oracle.providerId
    || provider.implementationId === oracle.implementationId
  ) {
    throw new StandardsProviderRuntimeError(
      'invalid-oracle',
      'Independent verification requires a different provider and implementation',
    );
  }
}

/**
 * Generates and atomically admits an artifact. An independent request either
 * returns an independently verified handle or throws; it is never silently
 * downgraded to reference-generated.
 */
export async function generateAndAdmitStandardsArtifact(
  providerInput: StandardsArtifactProvider,
  requestInput: unknown,
  options: StandardsProviderRuntimeOptions = {},
): Promise<AdmittedStandardsArtifactBundle> {
  const request = parseRequest(requestInput);
  const providerIdentity = parseToolIdentity(providerInput.identity, 'provider');

  let oracleIdentity: StandardsToolIdentity | null = null;
  if (request.requestedQualification === 'independently-verified') {
    if (options.oracle === undefined) {
      throw new StandardsProviderRuntimeError(
        'oracle-required',
        'Independently verified qualification requires an independent oracle',
      );
    }
    oracleIdentity = parseToolIdentity(options.oracle.identity, 'oracle');
    assertIndependentOracle(providerIdentity, oracleIdentity);
  }

  let supported: boolean;
  try {
    supported = await providerInput.supports(structuredClone(request));
  } catch (cause) {
    throw new StandardsProviderRuntimeError(
      'unsupported-request',
      'Provider support check failed closed',
      { cause },
    );
  }
  if (supported !== true) {
    throw new StandardsProviderRuntimeError(
      'unsupported-request',
      'Provider does not explicitly support the exact generation request',
    );
  }

  let candidate: StandardsArtifactBundleCandidate;
  try {
    candidate = await providerInput.generate(structuredClone(request));
  } catch (cause) {
    throw new StandardsProviderRuntimeError(
      'generation-failed',
      'Standards waveform provider failed to generate an artifact',
      { cause },
    );
  }

  assertProviderBindings(candidate, providerIdentity, request);
  const referenceArtifact = await admitStandardsArtifactBundle(candidate, {
    expectedConfigurationSha256: request.configurationSha256,
    maximumRetainedBytes: options.maximumRetainedBytes,
  });
  if (request.requestedQualification === 'reference-generated') {
    return referenceArtifact;
  }

  // Established above for the independently-verified branch.
  const oracle = options.oracle!;
  const boundOracleIdentity = oracleIdentity!;
  let evaluationInput: StandardsOracleEvaluation;
  try {
    evaluationInput = await oracle.evaluate(Object.freeze({
      request: structuredClone(request),
      manifestSha256: referenceArtifact.manifestSha256,
      manifest: referenceArtifact.manifest,
      readChunks: referenceArtifact.readChunks,
    }));
  } catch (cause) {
    throw new StandardsProviderRuntimeError(
      'invalid-oracle',
      'Independent oracle execution failed closed',
      { cause },
    );
  }
  const evaluation = standardsOracleEvaluationSchema.safeParse(evaluationInput);
  if (!evaluation.success) {
    throw new StandardsProviderRuntimeError(
      'invalid-oracle',
      'Independent oracle returned an invalid evaluation',
      { cause: evaluation.error },
    );
  }
  if (evaluation.data.result !== 'pass') {
    throw new StandardsProviderRuntimeError(
      'oracle-result-not-pass',
      `Independent oracle result is ${evaluation.data.result}; qualification was not promoted`,
    );
  }

  const referenceManifest = referenceArtifact.manifest;
  const independentlyVerifiedManifest = {
    ...structuredClone(referenceManifest),
    qualification: 'independently-verified' as const,
    qualificationBoundary: {
      complianceClaim: 'not-claimed' as const,
      externalValidationEvidence: 'attached' as const,
      statement: 'Independent verification is limited to this exact content-addressed digital-baseband artifact, preset, recipe, configuration, and oracle report; broad 3GPP or RF compliance is not claimed.',
    },
    oracle: {
      tool: boundOracleIdentity,
      oracleId: evaluation.data.oracleId,
      oracleRevision: evaluation.data.oracleRevision,
      relationship: 'independent-implementation' as const,
      evaluatedAt: evaluation.data.evaluatedAt,
      scope: {
        presetId: referenceManifest.preset.presetId,
        presetRevision: referenceManifest.preset.revision,
        recipeId: referenceManifest.recipe.recipeId,
        recipeRevision: referenceManifest.recipe.recipeRevision,
      },
      artifactSha256: referenceManifest.artifact.contentSha256,
      generatorConfigurationSha256: referenceManifest.recipe.configurationSha256,
      result: evaluation.data.result,
      reportSha256: evaluation.data.reportSha256,
      reportLocation: evaluation.data.reportLocation,
    },
  };
  const promotedManifestSha256 = standardsArtifactManifestSha256(independentlyVerifiedManifest);

  return admitStandardsArtifactBundle({
    manifest: independentlyVerifiedManifest,
    manifestSha256: promotedManifestSha256,
    chunks: referenceArtifact.readChunks(),
  }, {
    expectedConfigurationSha256: request.configurationSha256,
    maximumRetainedBytes: options.maximumRetainedBytes,
  });
}

/**
 * Convenience helper for callers constructing a pinned generation request.
 */
export function createStandardsGenerationRequest(input: {
  readonly presetId: string;
  readonly presetRevision: string;
  readonly family: StandardsGenerationRequest['family'];
  readonly recipeId: string;
  readonly recipeRevision: string;
  readonly configuration: CanonicalJsonObject;
  readonly requestedQualification: StandardsArtifactQualification;
  readonly expectedArtifactSha256?: string;
}): StandardsGenerationRequest {
  return standardsGenerationRequestSchema.parse({
    ...input,
    configurationSha256: standardsArtifactConfigurationSha256(input.configuration),
  });
}
