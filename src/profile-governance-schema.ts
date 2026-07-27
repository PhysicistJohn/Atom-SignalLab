import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase SHA-256 digest');

export const governanceOrganizationSchema = z.enum([
  '3GPP',
  'IEEE',
  'Bluetooth SIG',
  'TinySA SignalLab',
]);

export const governingBodySchema = z.object({
  organization: governanceOrganizationSchema,
  technicalBody: z.enum([
    '3GPP TSG RAN',
    'IEEE Standards Association / IEEE 802.11 Working Group',
    'Bluetooth SIG Core Specification Working Group',
    'TinySA SignalLab project',
  ]),
  authorityScope: z.string().trim().min(1),
}).strict();

export const normativeReferenceSchema = z.object({
  organization: governanceOrganizationSchema.exclude(['TinySA SignalLab']),
  documentId: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  clauses: z.array(z.string().trim().min(1)).min(1).readonly(),
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Normative reference must use HTTPS'),
}).strict();

export const profileApplicabilitySchema = z.object({
  status: z.enum(['applicable', 'configuration-only', 'not-applicable']),
  reason: z.string().trim().min(1),
}).strict();

export const testedClaimScopeSchema = z.object({
  kind: z.enum([
    'deterministic-mathematical-reference',
    'deterministic-engineering-projection',
    'configuration-constraints-only',
    'content-bound-independent-digital-baseband',
  ]),
  statement: z.string().trim().min(1),
  testLocations: z.array(
    z.string().trim().regex(/^src\/[^#]+\.test\.(?:ts|tsx)$/),
  ).min(1).readonly(),
}).strict();

export const digitalQualificationEvidenceSchema = z.object({
  artifact: z.object({
    sha256: sha256Schema,
    mediaType: z.string().trim().min(1),
    producer: z.string().trim().min(1),
  }).strict(),
  independentEvidence: z.object({
    sha256: sha256Schema,
    reportPath: z.string().trim().regex(/^validation\/[^/]+\.json$/),
    result: z.literal('pass'),
    oracleProvider: z.string().trim().min(1),
    suite: z.string().trim().min(1),
  }).strict(),
}).strict().superRefine((evidence, context) => {
  if (evidence.artifact.producer === evidence.independentEvidence.oracleProvider) {
    context.addIssue({
      code: 'custom',
      path: ['independentEvidence', 'oracleProvider'],
      message: 'Digital qualification evidence must use an independently implemented oracle',
    });
  }
});

/**
 * This contract deliberately has no positive standards-compliance or RF
 * conformance value. Those claims need a separately governed external-lab
 * contract; citing a standard or passing SignalLab tests can never create one.
 */
export const profileGovernanceSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: z.string().trim().min(1),
  signalKind: z.enum([
    'normative-fixed-profile',
    'standards-derived-engineering-profile',
    'standards-component-fixture',
    'operator-defined-builder',
    'mathematical-lab-reference',
  ]),
  governingOrganizations: z.array(governanceOrganizationSchema).min(1).readonly(),
  governingBodies: z.array(governingBodySchema).min(1).readonly(),
  normativeReferences: z.array(normativeReferenceSchema).readonly(),
  applicability: profileApplicabilitySchema,
  implementedQualificationState: z.enum([
    'mathematical-reference',
    'standards-derived-engineering-projection',
    'digitally-qualified',
  ]),
  testedClaimScope: testedClaimScopeSchema,
  claims: z.object({
    standardsCompliance: z.literal('not-claimed'),
    digitalStandardsAdherence: z.enum([
      'not-applicable',
      'configuration-only',
      'not-verified',
      'verified-for-declared-digital-scope',
    ]),
    digitalQualification: z.enum(['not-qualified', 'qualified']),
    rfConformance: z.literal('not-qualified'),
  }).strict(),
  digitalQualificationEvidence: digitalQualificationEvidenceSchema.nullable(),
  qualificationBlockers: z.array(z.string().trim().min(1)).min(1).readonly(),
  reason: z.string().trim().min(1),
}).strict().superRefine((governance, context) => {
  const organizationSet = new Set(governance.governingOrganizations);
  if (organizationSet.size !== governance.governingOrganizations.length) {
    context.addIssue({ code: 'custom', path: ['governingOrganizations'], message: 'Governing organizations must be unique' });
  }
  const bodyOrganizations = governance.governingBodies.map(({ organization }) => organization);
  if (new Set(bodyOrganizations).size !== bodyOrganizations.length) {
    context.addIssue({ code: 'custom', path: ['governingBodies'], message: 'Governing bodies must be unique by organization' });
  }
  if (bodyOrganizations.length !== governance.governingOrganizations.length
    || bodyOrganizations.some((organization) => !organizationSet.has(organization))) {
    context.addIssue({ code: 'custom', path: ['governingBodies'], message: 'Governing body details must exactly cover the governing organizations' });
  }
  const referenceSet = new Set<string>();
  for (const [index, reference] of governance.normativeReferences.entries()) {
    if (!organizationSet.has(reference.organization)) {
      context.addIssue({
        code: 'custom',
        path: ['normativeReferences', index, 'organization'],
        message: 'Every normative reference organization must be listed as governing',
      });
    }
    const key = `${reference.organization}\u0000${reference.documentId}\u0000${reference.revision}`;
    if (referenceSet.has(key)) {
      context.addIssue({ code: 'custom', path: ['normativeReferences', index], message: 'Duplicate normative reference' });
    }
    referenceSet.add(key);
  }

  const evidence = governance.digitalQualificationEvidence;
  const digitallyQualified = governance.implementedQualificationState === 'digitally-qualified'
    || governance.claims.digitalQualification === 'qualified';
  if (digitallyQualified) {
    if (governance.implementedQualificationState !== 'digitally-qualified') {
      context.addIssue({ code: 'custom', path: ['implementedQualificationState'], message: 'A qualified digital claim requires the digitally-qualified implementation state' });
    }
    if (governance.claims.digitalQualification !== 'qualified') {
      context.addIssue({ code: 'custom', path: ['claims', 'digitalQualification'], message: 'The digital claim and implementation state must agree' });
    }
    if (governance.claims.digitalStandardsAdherence !== 'verified-for-declared-digital-scope') {
      context.addIssue({ code: 'custom', path: ['claims', 'digitalStandardsAdherence'], message: 'Digital qualification requires verified standards adherence for the declared digital scope' });
    }
    if (!evidence) {
      context.addIssue({ code: 'custom', path: ['digitalQualificationEvidence'], message: 'Digital qualification requires a content-addressed artifact and independent passing evidence' });
    }
    if (governance.testedClaimScope.kind !== 'content-bound-independent-digital-baseband') {
      context.addIssue({ code: 'custom', path: ['testedClaimScope', 'kind'], message: 'Digital qualification requires an independently tested content-bound claim scope' });
    }
  } else {
    if (evidence !== null) {
      context.addIssue({ code: 'custom', path: ['digitalQualificationEvidence'], message: 'Unqualified profiles must not carry qualification evidence' });
    }
    if (governance.claims.digitalStandardsAdherence === 'verified-for-declared-digital-scope') {
      context.addIssue({ code: 'custom', path: ['claims', 'digitalStandardsAdherence'], message: 'Verified digital standards adherence requires a qualified content-bound artifact' });
    }
  }

  if (governance.signalKind === 'mathematical-lab-reference') {
    if (governance.governingOrganizations.length !== 1 || governance.governingOrganizations[0] !== 'TinySA SignalLab') {
      context.addIssue({ code: 'custom', path: ['governingOrganizations'], message: 'Mathematical lab references are governed only by TinySA SignalLab' });
    }
    if (governance.normativeReferences.length !== 0) {
      context.addIssue({ code: 'custom', path: ['normativeReferences'], message: 'Mathematical lab references have no unique normative waveform standard' });
    }
    if (governance.applicability.status !== 'not-applicable') {
      context.addIssue({ code: 'custom', path: ['applicability', 'status'], message: 'Standards applicability is N/A for mathematical lab references' });
    }
    if (governance.implementedQualificationState !== 'mathematical-reference') {
      context.addIssue({ code: 'custom', path: ['implementedQualificationState'], message: 'Mathematical lab references cannot claim standards qualification' });
    }
    if (governance.testedClaimScope.kind !== 'deterministic-mathematical-reference') {
      context.addIssue({ code: 'custom', path: ['testedClaimScope', 'kind'], message: 'Mathematical lab references may claim only tested mathematics' });
    }
    if (governance.claims.digitalStandardsAdherence !== 'not-applicable') {
      context.addIssue({ code: 'custom', path: ['claims', 'digitalStandardsAdherence'], message: 'Standards adherence is not applicable to mathematical lab references' });
    }
  }

  if (governance.signalKind === 'operator-defined-builder') {
    if (governance.applicability.status !== 'configuration-only') {
      context.addIssue({ code: 'custom', path: ['applicability', 'status'], message: 'Operator-defined builders are configuration-only' });
    }
    if (governance.implementedQualificationState !== 'standards-derived-engineering-projection') {
      context.addIssue({ code: 'custom', path: ['implementedQualificationState'], message: 'A configurable builder cannot itself be digitally qualified' });
    }
    if (governance.testedClaimScope.kind !== 'configuration-constraints-only') {
      context.addIssue({ code: 'custom', path: ['testedClaimScope', 'kind'], message: 'Builder tests may claim only configuration constraints' });
    }
    if (evidence !== null || governance.claims.digitalQualification !== 'not-qualified') {
      context.addIssue({ code: 'custom', path: ['digitalQualificationEvidence'], message: 'A builder configuration is not a qualified waveform artifact' });
    }
    if (governance.claims.digitalStandardsAdherence !== 'configuration-only') {
      context.addIssue({ code: 'custom', path: ['claims', 'digitalStandardsAdherence'], message: 'A builder may claim only configuration-level standards constraints' });
    }
  }

  if (governance.signalKind === 'normative-fixed-profile'
    || governance.signalKind === 'standards-derived-engineering-profile'
    || governance.signalKind === 'standards-component-fixture') {
    if (governance.normativeReferences.length === 0) {
      context.addIssue({ code: 'custom', path: ['normativeReferences'], message: 'A normative fixed profile requires at least one exact normative reference' });
    }
    if (governance.applicability.status !== 'applicable') {
      context.addIssue({ code: 'custom', path: ['applicability', 'status'], message: 'Normative fixed profiles must identify the applicable standards scope' });
    }
    if (governance.implementedQualificationState === 'mathematical-reference') {
      context.addIssue({ code: 'custom', path: ['implementedQualificationState'], message: 'A normative profile cannot use the mathematical-reference state' });
    }
    if (governance.claims.digitalQualification === 'not-qualified'
      && governance.claims.digitalStandardsAdherence !== 'not-verified') {
      context.addIssue({ code: 'custom', path: ['claims', 'digitalStandardsAdherence'], message: 'An unqualified standards-linked profile must report its digital adherence as not verified' });
    }
  }
});

export type GovernanceOrganization = z.infer<typeof governanceOrganizationSchema>;
export type GoverningBody = z.infer<typeof governingBodySchema>;
export type NormativeReference = z.infer<typeof normativeReferenceSchema>;
export type ProfileGovernance = z.infer<typeof profileGovernanceSchema>;
