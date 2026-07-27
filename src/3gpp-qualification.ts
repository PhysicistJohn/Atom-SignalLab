import {
  assess3gppPromotion,
  complianceCandidateSchema,
  release19SpecificationLockSchema,
  type ComplianceCandidate,
  type PromotionAssessment,
  type Release19SpecificationLock,
  type SpecificationCitation,
} from './3gpp-compliance.js';
import { RELEASE_19_SPECIFICATION_LOCK } from './3gpp-compliance-release-19.js';
import {
  canonicalJsonString,
  sha256HexOfChunks,
  standardsArtifactManifestSchema,
  standardsArtifactManifestSha256,
  verifyStandardsArtifactChunks,
  type AdmittedStandardsArtifactBundle,
  type StandardsArtifactManifest,
} from './standards-artifact.js';
import {
  assessStandardsTestCampaign,
  standardsAssuranceSchema,
  standardsTestCampaignSchema,
  standardsTestScopeSchema,
  type StandardsAssurance,
  type StandardsTestCampaign,
  type StandardsTestGateDecision,
  type StandardsTestScope,
} from './standards-test-gate.js';
import {
  LTE_ETM1_1_CATALOG_ID,
  LTE_ETM1_1_CATALOG_REVISION,
  LTE_ETM1_1_CATALOG_SHA256,
  LTE_ETM1_1_REQUIRED_CLAUSES,
} from './lte-etm1-test-catalog.js';
import { LTE_ETM1_1_REFERENCE_CF64LE_SHA256 } from './lte-etm1-provider.js';
import { isUint8Array } from './platform-bytes.js';

export interface ThreeGppEvidenceArtifactBytes {
  readonly artifactId: string;
  readonly bytes: Uint8Array;
}

export interface ThreeGppArtifactQualificationRequest {
  /**
   * A handle returned by standards-artifact admission. The payload is read and
   * hashed again so a structurally similar, unverified object cannot promote.
   */
  readonly admittedArtifact: AdmittedStandardsArtifactBundle | unknown;
  readonly candidate: unknown;
  readonly campaign: unknown;
  readonly scope: StandardsTestScope;
  readonly assurance: StandardsAssurance;
  /**
   * Exact bytes for every non-waveform artifact in the evidence bundle.
   * Hash strings in the evidence schema are not accepted as proof by
   * themselves.
   */
  readonly evidenceArtifactBytes?: readonly ThreeGppEvidenceArtifactBytes[];
  /**
   * Compatibility input only. Production qualification is always evaluated
   * against the compiled immutable Release-19 lock; a different value fails.
   */
  readonly specificationLock?: unknown;
}

export interface ThreeGppArtifactQualificationDecision {
  readonly admitted: boolean;
  readonly scope: StandardsTestScope | 'invalid';
  readonly assurance: StandardsAssurance | 'invalid';
  readonly manifestSha256: string | null;
  readonly artifactSha256: string | null;
  readonly promotionAssessment: PromotionAssessment;
  readonly testAssessment: StandardsTestGateDecision | null;
  readonly reasons: readonly string[];
}

interface VerifiedAdmittedArtifact {
  readonly manifest: StandardsArtifactManifest;
  readonly manifestSha256: string;
  readonly artifactSha256: string;
}

interface ClaimPolicy {
  readonly scope: StandardsTestScope;
  readonly assurance: StandardsAssurance;
  readonly requiresIndependentArtifact: boolean;
}

const MAXIMUM_REASON_COUNT = 4_096;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function appendReason(reasons: string[], reason: string): void {
  if (reasons.length < MAXIMUM_REASON_COUNT) reasons.push(reason);
}

function uniqueReasons(reasons: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(reasons)]);
}

function claimPolicy(candidate: ComplianceCandidate): ClaimPolicy | null {
  if (candidate.requestedQualification === '3gpp-digital-waveform-independently-verified') {
    return {
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
      requiresIndependentArtifact: true,
    };
  }
  if (candidate.requestedQualification === '3gpp-conformance-test-stimulus-qualified') {
    return {
      scope: candidate.claimScope.kind === 'radiated-ota' ? 'radiated-rf' : 'conducted-rf',
      assurance: 'external-lab',
      requiresIndependentArtifact: true,
    };
  }
  return null;
}

async function verifyAdmittedArtifact(
  input: unknown,
  reasons: string[],
): Promise<VerifiedAdmittedArtifact | null> {
  const handle = asRecord(input);
  if (handle === null) {
    appendReason(reasons, 'Admitted artifact handle is absent or malformed.');
    return null;
  }

  const parsedManifest = standardsArtifactManifestSchema.safeParse(handle.manifest);
  if (!parsedManifest.success) {
    appendReason(
      reasons,
      `Admitted artifact manifest is malformed: ${parsedManifest.error.issues.map((issue) => issue.message).join('; ')}`,
    );
    return null;
  }
  const manifest = parsedManifest.data;
  const expectedManifestSha256 = standardsArtifactManifestSha256(manifest);
  if (handle.manifestSha256 !== expectedManifestSha256) {
    appendReason(reasons, 'Admitted artifact manifest SHA-256 does not match its canonical manifest.');
  }
  if (handle.qualification !== manifest.qualification) {
    appendReason(reasons, 'Admitted artifact qualification does not match the manifest qualification.');
  }
  if (handle.verifiedByteLength !== manifest.artifact.byteLength) {
    appendReason(reasons, 'Admitted artifact verified byte length does not match the manifest.');
  }
  if (typeof handle.readChunks !== 'function') {
    appendReason(reasons, 'Admitted artifact has no replayable verified-payload reader.');
    return null;
  }

  try {
    const verification = await verifyStandardsArtifactChunks(
      manifest.artifact,
      handle.readChunks.call(input),
    );
    if (
      verification.contentSha256 !== manifest.artifact.contentSha256
      || verification.byteLength !== manifest.artifact.byteLength
    ) {
      appendReason(reasons, 'Replayed admitted payload does not match its exact manifest identity.');
      return null;
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'unknown payload verification error';
    appendReason(reasons, `Admitted artifact payload verification failed: ${detail}`);
    return null;
  }

  return {
    manifest,
    manifestSha256: expectedManifestSha256,
    artifactSha256: manifest.artifact.contentSha256,
  };
}

function clauseKey(
  documentId: string,
  revision: string,
  release: number,
  clause: string,
): string {
  return `${documentId}@${revision}@Release ${release}#${clause}`;
}

function citationClauseKeys(
  citations: readonly SpecificationCitation[],
  lock: Release19SpecificationLock,
  technology: ComplianceCandidate['technology'],
  label: string,
  reasons: string[],
): Set<string> {
  const keys = new Set<string>();
  const specifications = new Map(lock.specifications.map((specification) => [
    specification.referenceId,
    specification,
  ]));
  for (const citation of citations) {
    const specification = specifications.get(citation.referenceId);
    if (specification === undefined) {
      appendReason(reasons, `${label} cites unknown specification ${citation.referenceId}.`);
      continue;
    }
    if (specification.technology !== technology) {
      appendReason(reasons, `${label} cites ${citation.referenceId} for a different technology.`);
    }
    for (const clause of citation.clauseIds) {
      if (!specification.clauses.some((lockedClause) => lockedClause.clauseId === clause)) {
        appendReason(reasons, `${label} cites unlocked clause ${citation.referenceId} ${clause}.`);
        continue;
      }
      keys.add(clauseKey(
        specification.specification,
        specification.version,
        specification.release,
        clause,
      ));
    }
  }
  return keys;
}

function compareClauseSets(
  leftLabel: string,
  left: ReadonlySet<string>,
  rightLabel: string,
  right: ReadonlySet<string>,
  reasons: string[],
): void {
  for (const key of left) {
    if (!right.has(key)) appendReason(reasons, `${leftLabel} includes ${key}, which ${rightLabel} does not.`);
  }
  for (const key of right) {
    if (!left.has(key)) appendReason(reasons, `${rightLabel} includes ${key}, which ${leftLabel} does not.`);
  }
}

function campaignClauseKeys(
  campaign: StandardsTestCampaign,
  lock: Release19SpecificationLock,
  candidate: ComplianceCandidate,
  scope: StandardsTestScope,
  reasons: string[],
): Set<string> {
  const keys = new Set<string>();
  for (const requirement of campaign.catalog.requirements) {
    if (requirement.applicability === 'not-applicable') continue;
    if (requirement.scope !== scope) {
      appendReason(
        reasons,
        `Applicable test requirement ${requirement.requirementId} has scope ${requirement.scope}, not ${scope}.`,
      );
    }
    const specification = lock.specifications.find((entry) => (
      entry.specification === requirement.clause.documentId
      && entry.version === requirement.clause.revision
      && `Release ${entry.release}` === requirement.clause.release
    ));
    if (specification === undefined) {
      appendReason(
        reasons,
        `Test requirement ${requirement.requirementId} does not match an exact locked specification revision.`,
      );
      continue;
    }
    if (specification.technology !== candidate.technology) {
      appendReason(
        reasons,
        `Test requirement ${requirement.requirementId} is for a different technology.`,
      );
    }
    const lockedClause = specification.clauses.find(
      (entry) => entry.clauseId === requirement.clause.clause,
    );
    if (lockedClause === undefined) {
      appendReason(
        reasons,
        `Test requirement ${requirement.requirementId} cites an unlocked clause.`,
      );
      continue;
    }
    const expectedApplicability = scope === 'digital-baseband'
      ? 'digital'
      : scope === 'conducted-rf'
        ? 'conducted-rf'
        : 'radiated-ota';
    if (lockedClause.applicability !== expectedApplicability) {
      appendReason(
        reasons,
        `Test requirement ${requirement.requirementId} clause applicability does not match ${scope}.`,
      );
    }
    keys.add(clauseKey(
      specification.specification,
      specification.version,
      specification.release,
      requirement.clause.clause,
    ));
  }
  return keys;
}

function enforceCompiledProfilePolicy(
  manifest: StandardsArtifactManifest,
  candidate: ComplianceCandidate,
  campaign: StandardsTestCampaign,
  lock: Release19SpecificationLock,
  scope: StandardsTestScope,
  reasons: string[],
): void {
  if (candidate.profileId !== 'lte-etm-1-1-10mhz-fdd') {
    appendReason(
      reasons,
      `No compiled qualification policy exists for profile ${candidate.profileId}.`,
    );
    return;
  }
  if (
    scope !== 'digital-baseband'
    || candidate.requestedQualification
      !== '3gpp-digital-waveform-independently-verified'
  ) {
    appendReason(
      reasons,
      'No trusted conducted-RF or radiated-OTA policy is installed for the fixed LTE E-TM1.1 profile.',
    );
    return;
  }

  if (
    campaign.catalog.catalogId !== LTE_ETM1_1_CATALOG_ID
    || campaign.catalog.revision !== LTE_ETM1_1_CATALOG_REVISION
    || campaign.catalogSha256 !== LTE_ETM1_1_CATALOG_SHA256
  ) {
    appendReason(
      reasons,
      'The executed catalog is not the compiled complete LTE E-TM1.1 clause catalog.',
    );
  }
  if (manifest.artifact.contentSha256 !== LTE_ETM1_1_REFERENCE_CF64LE_SHA256) {
    appendReason(
      reasons,
      'The artifact does not match the compiled LTE E-TM1.1 content identity.',
    );
  }

  const expectedClauseKeys = new Set(LTE_ETM1_1_REQUIRED_CLAUSES.map((descriptor) =>
    clauseKey(
      descriptor.documentId,
      descriptor.revision,
      19,
      descriptor.clause,
    )));
  const claimClauseKeys = citationClauseKeys(
    candidate.citations,
    lock,
    candidate.technology,
    'Compiled profile claim',
    reasons,
  );
  const testClauseKeys = campaignClauseKeys(
    campaign,
    lock,
    candidate,
    scope,
    reasons,
  );
  compareClauseSets(
    'Compiled profile obligation set',
    expectedClauseKeys,
    'compliance claim',
    claimClauseKeys,
    reasons,
  );
  compareClauseSets(
    'Compiled profile obligation set',
    expectedClauseKeys,
    'test catalog',
    testClauseKeys,
    reasons,
  );

  const admission = lock.profileAdmissions.find(
    (entry) => entry.profileId === candidate.profileId,
  );
  if (admission === undefined) {
    appendReason(reasons, 'The immutable Release-19 lock does not list this profile.');
  } else if (admission.status === 'unpromoted') {
    appendReason(
      reasons,
      `The immutable Release-19 lock explicitly keeps ${candidate.profileId} unpromoted: ${admission.reason}`,
    );
  }
}

function verifyEvidenceArtifactBytes(
  candidate: ComplianceCandidate,
  supplied: unknown,
  reasons: string[],
): void {
  if (candidate.evidence === null) return;
  if (!Array.isArray(supplied)) {
    appendReason(
      reasons,
      'Qualification requires the exact bytes of every non-waveform evidence artifact.',
    );
    return;
  }

  const suppliedById = new Map<string, Uint8Array>();
  for (const [index, value] of supplied.entries()) {
    const record = asRecord(value);
    if (
      record === null
      || typeof record.artifactId !== 'string'
      || !isUint8Array(record.bytes)
    ) {
      appendReason(reasons, `Evidence artifact bytes entry ${index} is malformed.`);
      continue;
    }
    if (suppliedById.has(record.artifactId)) {
      appendReason(reasons, `Evidence artifact ${record.artifactId} has duplicate byte payloads.`);
      continue;
    }
    suppliedById.set(record.artifactId, record.bytes);
  }

  const expectedIds = new Set<string>();
  for (const artifact of candidate.evidence.artifacts) {
    if (artifact.kind === 'complex-iq') continue;
    expectedIds.add(artifact.artifactId);
    const bytes = suppliedById.get(artifact.artifactId);
    if (bytes === undefined) {
      appendReason(
        reasons,
        `Evidence artifact ${artifact.artifactId} has no supplied bytes.`,
      );
      continue;
    }
    if (
      bytes.byteLength !== artifact.byteLength
      || sha256HexOfChunks(bytes) !== artifact.sha256
    ) {
      appendReason(
        reasons,
        `Evidence artifact ${artifact.artifactId} bytes do not match its declared identity.`,
      );
    }
  }
  for (const artifactId of suppliedById.keys()) {
    if (!expectedIds.has(artifactId)) {
      appendReason(reasons, `Unreferenced evidence bytes were supplied for ${artifactId}.`);
    }
  }
}

function bindManifestToCandidate(
  manifest: StandardsArtifactManifest,
  manifestSha256: string,
  candidate: ComplianceCandidate,
  campaign: StandardsTestCampaign,
  scope: StandardsTestScope,
  assurance: StandardsAssurance,
  lock: Release19SpecificationLock,
  reasons: string[],
): void {
  if (candidate.profileId !== manifest.preset.presetId) {
    appendReason(reasons, 'Compliance profile does not match the admitted artifact preset.');
  }
  if (candidate.technology !== manifest.preset.family) {
    appendReason(reasons, 'Compliance technology does not match the admitted artifact family.');
  }
  if (
    campaign.catalog.subject.presetId !== manifest.preset.presetId
    || campaign.catalog.subject.presetRevision !== manifest.preset.revision
  ) {
    appendReason(reasons, 'Test-catalog subject does not match the exact artifact preset and revision.');
  }
  if (
    campaign.catalog.subject.generatorProviderId !== manifest.recipe.tool.providerId
    || campaign.catalog.subject.generatorImplementationId !== manifest.recipe.tool.implementationId
  ) {
    appendReason(reasons, 'Test-catalog subject does not match the artifact generator provider and implementation.');
  }
  if (campaign.subjectArtifactSha256 !== manifest.artifact.contentSha256) {
    appendReason(reasons, 'Test campaign is bound to a different artifact content SHA-256.');
  }

  const evidence = candidate.evidence;
  if (evidence === null) {
    appendReason(reasons, 'Composite qualification requires compliance evidence bound to the artifact and tests.');
    return;
  }
  if (campaign.evaluatedAt !== evidence.revalidation.evaluatedAt) {
    appendReason(reasons, 'Test campaign and compliance evidence do not describe the same revalidation snapshot.');
  }

  const generators = evidence.toolchains.filter((toolchain) => toolchain.role === 'generator');
  if (generators.length !== 1) {
    appendReason(reasons, 'Composite qualification requires exactly one compliance-evidence generator.');
  } else {
    const generator = generators[0]!;
    if (
      generator.providerId !== manifest.recipe.tool.providerId
      || generator.provider !== manifest.recipe.tool.providerName
      || generator.product !== manifest.recipe.tool.productName
      || generator.version !== manifest.recipe.tool.productVersion
      || generator.implementationId !== manifest.recipe.tool.implementationId
      || generator.configurationSha256 !== manifest.recipe.configurationSha256
    ) {
      appendReason(reasons, 'Compliance generator identity or configuration does not exactly match the artifact recipe.');
    }
  }

  const complexIqArtifacts = evidence.artifacts.filter((artifact) => artifact.kind === 'complex-iq');
  if (complexIqArtifacts.length !== 1) {
    appendReason(reasons, 'Compliance evidence must identify exactly one complex-I/Q subject artifact.');
  } else {
    const evidenceArtifact = complexIqArtifacts[0]!;
    const generator = generators[0];
    if (
      evidenceArtifact.artifactId !== manifest.artifact.artifactId
      || evidenceArtifact.location !== manifest.artifact.location
      || evidenceArtifact.mediaType !== manifest.artifact.mediaType
      || evidenceArtifact.sha256 !== manifest.artifact.contentSha256
      || evidenceArtifact.byteLength !== manifest.artifact.byteLength
      || generator === undefined
      || evidenceArtifact.producedByIdentityId !== generator.identityId
    ) {
      appendReason(reasons, 'Compliance complex-I/Q evidence does not exactly match the admitted artifact.');
    }
  }

  if (candidate.requestedQualification !== 'standards-derived-engineering-projection') {
    if (manifest.qualification !== 'independently-verified' || manifest.oracle === null) {
      appendReason(reasons, '3GPP qualification requires an independently verified artifact manifest.');
    } else {
      const matchingOracle = evidence.toolchains.find((toolchain) => (
        toolchain.role === 'oracle'
        && toolchain.providerId === manifest.oracle!.tool.providerId
        && toolchain.provider === manifest.oracle!.tool.providerName
        && toolchain.product === manifest.oracle!.tool.productName
        && toolchain.version === manifest.oracle!.tool.productVersion
        && toolchain.implementationId === manifest.oracle!.tool.implementationId
      ));
      if (matchingOracle === undefined) {
        appendReason(reasons, 'Artifact oracle identity is not present in the compliance evidence.');
      } else if (!evidence.reports.some((report) => (
        report.validatorIdentityId === matchingOracle.identityId
        && report.sha256 === manifest.oracle!.reportSha256
      ))) {
        appendReason(reasons, 'Artifact oracle report is not content-bound in the compliance evidence.');
      }
    }
  }

  const definitions = new Map(campaign.catalog.tests.map((definition) => [
    definition.testId,
    definition,
  ]));
  const iqArtifactId = complexIqArtifacts[0]?.artifactId;
  for (const execution of campaign.executions) {
    const definition = definitions.get(execution.testId);
    if (definition === undefined) continue;
    if (definition.method === 'automated-unit'
      || definition.method === 'automated-property'
      || definition.method === 'automated-integration') {
      if (!evidence.testRuns.some((testRun) => (
        testRun.reportSha256 === execution.reportSha256
        && testRun.executedAt === execution.executedAt
      ))) {
        appendReason(
          reasons,
          `Automated execution ${execution.testId} is not content-bound to a compliance test run.`,
        );
      }
      continue;
    }
    const matchingReport = evidence.reports.find((report) => (
      report.sha256 === execution.reportSha256
      && report.executedAt === execution.executedAt
      && (iqArtifactId === undefined || report.artifactIds.includes(iqArtifactId))
    ));
    if (matchingReport === undefined) {
      appendReason(
        reasons,
        `${definition.method} execution ${execution.testId} is not content-bound to a compliance validation report for the exact artifact.`,
      );
      continue;
    }
    const validator = evidence.toolchains.find(
      (toolchain) => toolchain.identityId === matchingReport.validatorIdentityId,
    );
    const providerMatches = definition.method === 'independent-oracle'
      ? (
          manifest.oracle !== null
          && definition.implementation.providerId === manifest.oracle.tool.providerId
          && validator?.providerId === manifest.oracle.tool.providerId
          && validator.provider === manifest.oracle.tool.providerName
        )
      : validator?.providerId === definition.implementation.providerId;
    if (
      validator === undefined
      || !providerMatches
      || validator.implementationId !== definition.implementation.implementationId
    ) {
      appendReason(
        reasons,
        `${definition.method} execution ${execution.testId} validator identity does not match compliance evidence.`,
      );
    }
  }

  const claimClauses = citationClauseKeys(
    candidate.citations,
    lock,
    candidate.technology,
    'Compliance claim',
    reasons,
  );
  const testClauses = campaignClauseKeys(campaign, lock, candidate, scope, reasons);
  compareClauseSets('Compliance claim', claimClauses, 'test catalog', testClauses, reasons);

  const metricClauses = citationClauseKeys(
    evidence.metrics.flatMap((metric) => metric.citations),
    lock,
    candidate.technology,
    'Compliance metrics',
    reasons,
  );
  compareClauseSets('Compliance metrics', metricClauses, 'compliance claim', claimClauses, reasons);
  const reportClauses = citationClauseKeys(
    evidence.reports.flatMap((report) => report.citations),
    lock,
    candidate.technology,
    'Compliance reports',
    reasons,
  );
  compareClauseSets('Compliance reports', reportClauses, 'compliance claim', claimClauses, reasons);

  if (scope !== 'digital-baseband' && assurance !== 'external-lab') {
    appendReason(reasons, 'RF qualification requires external-lab test assurance.');
  }
  if (scope !== 'digital-baseband' && evidence.rfContext === null) {
    appendReason(reasons, 'RF qualification requires calibrated external-lab evidence.');
  }

  // The manifest hash is deliberately evaluated even though the compliance
  // schema presently has no manifest-hash field. Its content hash is the
  // cross-schema subject identity; this guard prevents callers from swapping
  // metadata around the same bytes unnoticed.
  if (standardsArtifactManifestSha256(manifest) !== manifestSha256) {
    appendReason(reasons, 'Artifact metadata changed after admission.');
  }
}

/**
 * Composite, fail-closed 3GPP qualification.
 *
 * Neither a declarative claim nor a test catalog can promote independently.
 * Admission requires the 3GPP evidence gate and the executed-test gate to
 * admit, then proves that both refer to the same bytes, generator, scope,
 * locked clauses, and evidence snapshot.
 */
export async function assess3gppArtifactQualification(
  request: ThreeGppArtifactQualificationRequest,
): Promise<ThreeGppArtifactQualificationDecision> {
  const requestRecord = asRecord(request);
  const candidateInput = requestRecord?.candidate;
  const lockInput = RELEASE_19_SPECIFICATION_LOCK;
  const promotionAssessment = assess3gppPromotion(candidateInput, lockInput);
  const reasons: string[] = [];
  const suppliedLock = requestRecord?.specificationLock;
  if (suppliedLock !== undefined) {
    const suppliedLockResult = release19SpecificationLockSchema.safeParse(suppliedLock);
    if (
      !suppliedLockResult.success
      || canonicalJsonString(suppliedLockResult.data) !== canonicalJsonString(lockInput)
    ) {
      appendReason(
        reasons,
        'Caller-supplied specification locks cannot replace the compiled immutable Release-19 lock.',
      );
    }
  }
  if (!promotionAssessment.admitted) {
    for (const reason of promotionAssessment.reasons) {
      appendReason(reasons, `3GPP promotion gate: ${reason}`);
    }
  }

  const scopeResult = standardsTestScopeSchema.safeParse(requestRecord?.scope);
  const assuranceResult = standardsAssuranceSchema.safeParse(requestRecord?.assurance);
  let testAssessment: StandardsTestGateDecision | null = null;
  if (!scopeResult.success) {
    appendReason(reasons, 'Qualification scope is absent or invalid.');
  }
  if (!assuranceResult.success) {
    appendReason(reasons, 'Qualification assurance is absent or invalid.');
  }
  if (scopeResult.success && assuranceResult.success) {
    testAssessment = assessStandardsTestCampaign({
      campaign: requestRecord?.campaign,
      scope: scopeResult.data,
      assurance: assuranceResult.data,
    });
    if (!testAssessment.admitted) {
      for (const reason of testAssessment.reasons) {
        appendReason(reasons, `Executed-test gate: ${reason}`);
      }
    }
  }

  const verifiedArtifact = await verifyAdmittedArtifact(requestRecord?.admittedArtifact, reasons);
  const candidateResult = complianceCandidateSchema.safeParse(candidateInput);
  const campaignResult = standardsTestCampaignSchema.safeParse(requestRecord?.campaign);
  const lockResult = release19SpecificationLockSchema.safeParse(lockInput);

  if (!candidateResult.success) {
    appendReason(reasons, 'Composite binding cannot parse the compliance candidate.');
  }
  if (!campaignResult.success) {
    appendReason(reasons, 'Composite binding cannot parse the executed test campaign.');
  }
  if (!lockResult.success) {
    appendReason(reasons, 'Composite binding cannot parse the specification lock.');
  }
  if (candidateResult.success) {
    verifyEvidenceArtifactBytes(
      candidateResult.data,
      requestRecord?.evidenceArtifactBytes,
      reasons,
    );
  }

  if (
    candidateResult.success
    && scopeResult.success
    && assuranceResult.success
  ) {
    const policy = claimPolicy(candidateResult.data);
    if (policy === null) {
      appendReason(
        reasons,
        'Only independently verified digital waveforms or external-lab-qualified RF stimuli can pass this qualification bridge.',
      );
    } else {
      if (scopeResult.data !== policy.scope) {
        appendReason(
          reasons,
          `Requested test scope ${scopeResult.data} does not match claim scope ${policy.scope}.`,
        );
      }
      if (assuranceResult.data !== policy.assurance) {
        appendReason(
          reasons,
          `Requested assurance ${assuranceResult.data} does not meet required ${policy.assurance} assurance.`,
        );
      }
      if (
        policy.requiresIndependentArtifact
        && verifiedArtifact !== null
        && verifiedArtifact.manifest.qualification !== 'independently-verified'
      ) {
        appendReason(reasons, 'Claim policy requires an independently verified artifact.');
      }
    }
  }

  if (
    verifiedArtifact !== null
    && candidateResult.success
    && campaignResult.success
    && lockResult.success
    && scopeResult.success
    && assuranceResult.success
  ) {
    enforceCompiledProfilePolicy(
      verifiedArtifact.manifest,
      candidateResult.data,
      campaignResult.data,
      lockResult.data,
      scopeResult.data,
      reasons,
    );
    bindManifestToCandidate(
      verifiedArtifact.manifest,
      verifiedArtifact.manifestSha256,
      candidateResult.data,
      campaignResult.data,
      scopeResult.data,
      assuranceResult.data,
      lockResult.data,
      reasons,
    );
  }

  const finalReasons = uniqueReasons(reasons);
  return Object.freeze({
    admitted: (
      promotionAssessment.admitted
      && testAssessment?.admitted === true
      && verifiedArtifact !== null
      && finalReasons.length === 0
    ),
    scope: scopeResult.success ? scopeResult.data : 'invalid',
    assurance: assuranceResult.success ? assuranceResult.data : 'invalid',
    manifestSha256: verifiedArtifact?.manifestSha256 ?? null,
    artifactSha256: verifiedArtifact?.artifactSha256 ?? null,
    promotionAssessment,
    testAssessment,
    reasons: finalReasons,
  });
}
