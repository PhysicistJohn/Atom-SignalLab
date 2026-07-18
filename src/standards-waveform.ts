import { z } from 'zod';

export const STANDARDS_WAVEFORM_SCHEMA_VERSION = 1 as const;

export const STANDARDS_WAVEFORM_LIMITS = Object.freeze({
  maximumArtifactsPerPreset: 16,
  maximumChecksPerEvidenceRecord: 256,
  maximumConfigurationParameters: 256,
  maximumEvidenceRecordsPerPreset: 32,
  maximumStandardReferences: 32,
  maximumComplexSamplesPerChannel: 1_000_000_000_000,
  maximumSampleRateHz: 500_000_000_000,
  maximumCenterFrequencyHz: 1_000_000_000_000,
} as const);

const identifierSchema = z.string().trim().min(1).max(96).regex(
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
  'Identifier must be lowercase and contain only alphanumerics with dot, underscore, or hyphen separators',
);
const boundedTextSchema = z.string().trim().min(1).max(2_048);
const shortTextSchema = z.string().trim().min(1).max(256);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'SHA-256 digests must be lowercase hexadecimal');
const isoInstantSchema = z.string().datetime({ offset: true, precision: 3 });
const httpsUrlSchema = z.string().max(2_048).url()
  .refine((value) => value.startsWith('https://'), 'Reference URL must use HTTPS');
const relativeArtifactPathSchema = z.string().trim().min(1).max(1_024).regex(
  /^(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$))[A-Za-z0-9._/-]+$/,
  'Artifact locations must be safe relative paths',
);

export const waveformFamilySchema = z.enum(['lab', 'geran', 'lte', 'nr', 'wlan', 'bluetooth']);
export type WaveformFamily = z.infer<typeof waveformFamilySchema>;

export const waveformQualificationSchema = z.enum([
  'synthetic-projection',
  'standards-derived',
  'reference-generated',
  'independently-verified',
]);
export type WaveformQualification = z.infer<typeof waveformQualificationSchema>;

export const standardsOrganizationSchema = z.enum(['SignalLab', '3GPP', 'IEEE', 'Bluetooth SIG']);

export const exactStandardReferenceSchema = z.object({
  referenceId: identifierSchema,
  organization: standardsOrganizationSchema,
  documentId: shortTextSchema,
  title: shortTextSchema,
  revision: z.string().trim().min(1).max(64),
  release: z.string().trim().min(1).max(64).optional(),
  clauses: z.array(z.string().trim().min(1).max(256))
    .min(1).max(32).readonly(),
  publicationUrl: httpsUrlSchema,
}).strict().superRefine((reference, context) => {
  const clauses = new Set<string>();
  for (const [index, clause] of reference.clauses.entries()) {
    if (clauses.has(clause)) {
      context.addIssue({ code: 'custom', path: ['clauses', index], message: 'Standard clauses must be unique' });
    }
    clauses.add(clause);
  }
});
export type ExactStandardReference = z.infer<typeof exactStandardReferenceSchema>;

const configurationStringValueSchema = z.object({
  kind: z.literal('string'),
  value: z.string().trim().min(1).max(512),
}).strict();
const configurationIntegerValueSchema = z.object({
  kind: z.literal('integer'),
  value: z.number().safe().int(),
}).strict();
const configurationNumberValueSchema = z.object({
  kind: z.literal('number'),
  value: z.number().finite().min(-1e15).max(1e15),
}).strict();
const configurationBooleanValueSchema = z.object({
  kind: z.literal('boolean'),
  value: z.boolean(),
}).strict();

export const configurationValueSchema = z.discriminatedUnion('kind', [
  configurationStringValueSchema,
  configurationIntegerValueSchema,
  configurationNumberValueSchema,
  configurationBooleanValueSchema,
]);
export type ConfigurationValue = z.infer<typeof configurationValueSchema>;

export const presetConfigurationParameterSchema = z.object({
  key: z.string().trim().min(1).max(128).regex(
    /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/,
    'Configuration keys must be dot-delimited lower-camel-case paths',
  ),
  value: configurationValueSchema,
  unit: z.string().trim().min(1).max(64).optional(),
  origin: z.enum(['standard', 'preset-selection']),
  sourceReferenceIds: z.array(identifierSchema).min(1).max(16).readonly(),
  description: z.string().trim().min(1).max(512),
}).strict().superRefine((parameter, context) => {
  const referenceIds = new Set<string>();
  for (const [index, referenceId] of parameter.sourceReferenceIds.entries()) {
    if (referenceIds.has(referenceId)) {
      context.addIssue({ code: 'custom', path: ['sourceReferenceIds', index], message: 'Source reference IDs must be unique' });
    }
    referenceIds.add(referenceId);
  }
});
export type PresetConfigurationParameter = z.infer<typeof presetConfigurationParameterSchema>;

export const presetConfigurationSchema = z.object({
  schemaId: identifierSchema,
  parameters: z.array(presetConfigurationParameterSchema)
    .min(1).max(STANDARDS_WAVEFORM_LIMITS.maximumConfigurationParameters).readonly(),
}).strict().superRefine((configuration, context) => {
  const keys = new Set<string>();
  for (const [index, parameter] of configuration.parameters.entries()) {
    if (keys.has(parameter.key)) {
      context.addIssue({ code: 'custom', path: ['parameters', index, 'key'], message: 'Configuration keys must be unique' });
    }
    keys.add(parameter.key);
  }
});
export type PresetConfiguration = z.infer<typeof presetConfigurationSchema>;

export const toolIdentitySchema = z.object({
  providerId: identifierSchema,
  providerName: shortTextSchema,
  productName: shortTextSchema,
  productVersion: z.string().trim().min(1).max(128),
  implementationId: identifierSchema,
}).strict();
export type ToolIdentity = z.infer<typeof toolIdentitySchema>;

export const referenceGeneratorSchema = z.object({
  tool: toolIdentitySchema,
  recipeId: identifierSchema,
  recipeRevision: z.string().trim().min(1).max(128),
  deterministic: z.boolean(),
}).strict();
export type ReferenceGenerator = z.infer<typeof referenceGeneratorSchema>;

export const complexIqSampleFormatSchema = z.object({
  container: z.literal('raw-binary'),
  componentType: z.enum(['float32', 'float64', 'int16', 'int32']),
  layout: z.enum(['interleaved-iq', 'planar-iq']),
  byteOrder: z.enum(['little-endian', 'big-endian']),
  amplitudeUnit: z.enum(['normalized-full-scale', 'volts', 'arbitrary-units']),
}).strict();
export type ComplexIqSampleFormat = z.infer<typeof complexIqSampleFormatSchema>;

export const complexIqArtifactSchema = z.object({
  artifactId: identifierSchema,
  kind: z.literal('complex-iq'),
  location: relativeArtifactPathSchema,
  mediaType: z.literal('application/vnd.signallab.complex-iq'),
  contentSha256: sha256Schema,
  generatorConfigurationSha256: sha256Schema,
  byteLength: z.number().safe().int().positive(),
  channelCount: z.number().int().min(1).max(64),
  complexSamplesPerChannel: z.number().safe().int().positive()
    .max(STANDARDS_WAVEFORM_LIMITS.maximumComplexSamplesPerChannel),
  sampleRateHz: z.number().safe().int().positive().max(STANDARDS_WAVEFORM_LIMITS.maximumSampleRateHz),
  centerFrequencyHz: z.number().safe().int().nonnegative().max(STANDARDS_WAVEFORM_LIMITS.maximumCenterFrequencyHz),
  format: complexIqSampleFormatSchema,
}).strict().superRefine((artifact, context) => {
  const bytesPerComponent = ({ float32: 4, float64: 8, int16: 2, int32: 4 } as const)[artifact.format.componentType];
  const expectedByteLength = artifact.channelCount * artifact.complexSamplesPerChannel * 2 * bytesPerComponent;
  if (!Number.isSafeInteger(expectedByteLength) || artifact.byteLength !== expectedByteLength) {
    context.addIssue({
      code: 'custom',
      path: ['byteLength'],
      message: 'Byte length must exactly match channel count, complex sample count, and component type',
    });
  }
});
export type ComplexIqArtifact = z.infer<typeof complexIqArtifactSchema>;

export const validationCheckSchema = z.object({
  checkId: identifierSchema,
  name: shortTextSchema,
  method: boundedTextSchema,
  standardReferenceIds: z.array(identifierSchema).min(1).max(16).readonly(),
  result: z.enum(['pass', 'fail', 'not-evaluated']),
  observation: boundedTextSchema,
  acceptanceCriteria: boundedTextSchema,
}).strict();
export type ValidationCheck = z.infer<typeof validationCheckSchema>;

const validationEvidenceFields = {
  evidenceId: identifierSchema,
  artifactSha256: sha256Schema,
  validator: toolIdentitySchema,
  executedAt: isoInstantSchema,
  standardReferenceIds: z.array(identifierSchema).min(1).max(32).readonly(),
  methodology: boundedTextSchema,
  overallResult: z.enum(['pass', 'fail', 'inconclusive']),
  checks: z.array(validationCheckSchema)
    .min(1).max(STANDARDS_WAVEFORM_LIMITS.maximumChecksPerEvidenceRecord).readonly(),
  reportSha256: sha256Schema,
  reportLocation: z.union([httpsUrlSchema, relativeArtifactPathSchema]),
} as const;

function refineValidationEvidence(
  evidence: {
    overallResult: 'pass' | 'fail' | 'inconclusive';
    standardReferenceIds: readonly string[];
    checks: readonly ValidationCheck[];
  },
  context: z.RefinementCtx,
): void {
  const referenceIds = new Set<string>();
  for (const [index, referenceId] of evidence.standardReferenceIds.entries()) {
    if (referenceIds.has(referenceId)) {
      context.addIssue({ code: 'custom', path: ['standardReferenceIds', index], message: 'Evidence reference IDs must be unique' });
    }
    referenceIds.add(referenceId);
  }

  const checkIds = new Set<string>();
  for (const [index, check] of evidence.checks.entries()) {
    if (checkIds.has(check.checkId)) {
      context.addIssue({ code: 'custom', path: ['checks', index, 'checkId'], message: 'Validation check IDs must be unique' });
    }
    checkIds.add(check.checkId);
    for (const [referenceIndex, referenceId] of check.standardReferenceIds.entries()) {
      if (!referenceIds.has(referenceId)) {
        context.addIssue({
          code: 'custom',
          path: ['checks', index, 'standardReferenceIds', referenceIndex],
          message: 'Each validation-check reference must be declared by its evidence record',
        });
      }
    }
  }

  if (evidence.overallResult === 'pass' && evidence.checks.some((check) => check.result !== 'pass')) {
    context.addIssue({ code: 'custom', path: ['overallResult'], message: 'A passing evidence record requires every check to pass' });
  }
  if (evidence.overallResult === 'fail' && evidence.checks.every((check) => check.result !== 'fail')) {
    context.addIssue({ code: 'custom', path: ['overallResult'], message: 'A failing evidence record requires at least one failed check' });
  }
}

export const internalValidationEvidenceSchema = z.object({
  kind: z.literal('internal-validation'),
  ...validationEvidenceFields,
}).strict().superRefine(refineValidationEvidence);

export const independentValidationEvidenceSchema = z.object({
  kind: z.literal('independent-validator'),
  ...validationEvidenceFields,
  independence: z.object({
    relationship: z.literal('independent-implementation'),
    declaration: boundedTextSchema,
  }).strict(),
}).strict().superRefine(refineValidationEvidence);

export const validationEvidenceSchema = z.union([
  internalValidationEvidenceSchema,
  independentValidationEvidenceSchema,
]);
export type ValidationEvidence = z.infer<typeof validationEvidenceSchema>;

export const qualificationBoundarySchema = z.object({
  complianceClaim: z.literal('not-claimed'),
  externalValidationEvidence: z.enum(['not-provided', 'attached']),
  statement: boundedTextSchema,
}).strict();
export type QualificationBoundary = z.infer<typeof qualificationBoundarySchema>;

const REQUIRED_STANDARD_ORGANIZATION: Readonly<Record<WaveformFamily, z.infer<typeof standardsOrganizationSchema>>> = {
  lab: 'SignalLab',
  geran: '3GPP',
  lte: '3GPP',
  nr: '3GPP',
  wlan: 'IEEE',
  bluetooth: 'Bluetooth SIG',
};

export const standardsWaveformPresetSchema = z.object({
  schemaVersion: z.literal(STANDARDS_WAVEFORM_SCHEMA_VERSION),
  presetId: identifierSchema,
  revision: z.string().trim().min(1).max(64),
  family: waveformFamilySchema,
  name: shortTextSchema,
  description: boundedTextSchema,
  qualification: waveformQualificationSchema,
  qualificationBoundary: qualificationBoundarySchema,
  standardReferences: z.array(exactStandardReferenceSchema)
    .min(1).max(STANDARDS_WAVEFORM_LIMITS.maximumStandardReferences).readonly(),
  configuration: presetConfigurationSchema,
  referenceGenerator: referenceGeneratorSchema.nullable(),
  artifacts: z.array(complexIqArtifactSchema)
    .max(STANDARDS_WAVEFORM_LIMITS.maximumArtifactsPerPreset).readonly(),
  validationEvidence: z.array(validationEvidenceSchema)
    .max(STANDARDS_WAVEFORM_LIMITS.maximumEvidenceRecordsPerPreset).readonly(),
}).strict().superRefine((preset, context) => {
  const referenceIds = new Set<string>();
  for (const [index, reference] of preset.standardReferences.entries()) {
    if (referenceIds.has(reference.referenceId)) {
      context.addIssue({ code: 'custom', path: ['standardReferences', index, 'referenceId'], message: 'Standard reference IDs must be unique' });
    }
    referenceIds.add(reference.referenceId);
  }

  const requiredOrganization = REQUIRED_STANDARD_ORGANIZATION[preset.family];
  if (!preset.standardReferences.some((reference) => reference.organization === requiredOrganization)) {
    context.addIssue({
      code: 'custom',
      path: ['standardReferences'],
      message: `${preset.family} presets require at least one ${requiredOrganization} source`,
    });
  }

  for (const [parameterIndex, parameter] of preset.configuration.parameters.entries()) {
    for (const [referenceIndex, referenceId] of parameter.sourceReferenceIds.entries()) {
      if (!referenceIds.has(referenceId)) {
        context.addIssue({
          code: 'custom',
          path: ['configuration', 'parameters', parameterIndex, 'sourceReferenceIds', referenceIndex],
          message: 'Configuration parameters may cite only declared standard references',
        });
      }
    }
  }

  const artifactIds = new Set<string>();
  const artifactHashes = new Set<string>();
  for (const [index, artifact] of preset.artifacts.entries()) {
    if (artifactIds.has(artifact.artifactId)) {
      context.addIssue({ code: 'custom', path: ['artifacts', index, 'artifactId'], message: 'Artifact IDs must be unique' });
    }
    if (artifactHashes.has(artifact.contentSha256)) {
      context.addIssue({ code: 'custom', path: ['artifacts', index, 'contentSha256'], message: 'Artifact content hashes must be unique' });
    }
    artifactIds.add(artifact.artifactId);
    artifactHashes.add(artifact.contentSha256);
  }

  const evidenceIds = new Set<string>();
  const independentEvidence = preset.validationEvidence.filter((evidence) => evidence.kind === 'independent-validator');
  for (const [index, evidence] of preset.validationEvidence.entries()) {
    if (evidenceIds.has(evidence.evidenceId)) {
      context.addIssue({ code: 'custom', path: ['validationEvidence', index, 'evidenceId'], message: 'Evidence IDs must be unique' });
    }
    evidenceIds.add(evidence.evidenceId);
    if (!artifactHashes.has(evidence.artifactSha256)) {
      context.addIssue({
        code: 'custom',
        path: ['validationEvidence', index, 'artifactSha256'],
        message: 'Validation evidence must identify an artifact in this preset by content hash',
      });
    }
    for (const [referenceIndex, referenceId] of evidence.standardReferenceIds.entries()) {
      if (!referenceIds.has(referenceId)) {
        context.addIssue({
          code: 'custom',
          path: ['validationEvidence', index, 'standardReferenceIds', referenceIndex],
          message: 'Validation evidence may cite only declared standard references',
        });
      }
    }
    if (evidence.kind === 'independent-validator' && preset.referenceGenerator !== null) {
      if (evidence.validator.providerId === preset.referenceGenerator.tool.providerId) {
        context.addIssue({
          code: 'custom',
          path: ['validationEvidence', index, 'validator', 'providerId'],
          message: 'An independent validator must have a different provider from the reference generator',
        });
      }
      if (evidence.validator.implementationId === preset.referenceGenerator.tool.implementationId) {
        context.addIssue({
          code: 'custom',
          path: ['validationEvidence', index, 'validator', 'implementationId'],
          message: 'An independent validator must use a different implementation from the reference generator',
        });
      }
    }
  }

  const hasExternalEvidence = independentEvidence.length > 0;
  if ((preset.qualificationBoundary.externalValidationEvidence === 'attached') !== hasExternalEvidence) {
    context.addIssue({
      code: 'custom',
      path: ['qualificationBoundary', 'externalValidationEvidence'],
      message: 'External-evidence state must exactly match the attached independent-validator records',
    });
  }

  if (preset.artifacts.length > 0 && preset.referenceGenerator === null) {
    context.addIssue({ code: 'custom', path: ['referenceGenerator'], message: 'Generated artifacts require reference-generator identity' });
  }
  if (preset.qualification === 'reference-generated' && preset.referenceGenerator === null) {
    context.addIssue({ code: 'custom', path: ['referenceGenerator'], message: 'Reference-generated presets require generator identity' });
  }
  if (preset.qualification === 'reference-generated' && preset.artifacts.length === 0) {
    context.addIssue({ code: 'custom', path: ['artifacts'], message: 'Reference-generated presets require a content-addressed I/Q artifact' });
  }
  if (preset.qualification === 'independently-verified') {
    if (preset.referenceGenerator === null) {
      context.addIssue({ code: 'custom', path: ['referenceGenerator'], message: 'Independently verified presets require generator identity' });
    }
    if (preset.artifacts.length === 0) {
      context.addIssue({ code: 'custom', path: ['artifacts'], message: 'Independently verified presets require a content-addressed I/Q artifact' });
    }
    if (!independentEvidence.some((evidence) => evidence.overallResult === 'pass')) {
      context.addIssue({
        code: 'custom',
        path: ['validationEvidence'],
        message: 'Independently verified qualification requires passing independent-validator evidence',
      });
    }
  }
});
export type StandardsWaveformPreset = z.infer<typeof standardsWaveformPresetSchema>;

const LTE_ETM_REFERENCE_ID = '3gpp-ts-36-141-r19';
const LTE_PHY_REFERENCE_ID = '3gpp-ts-36-211-r19';

/**
 * Initial exact LTE configuration seed. It remains `standards-derived` until a
 * named generator emits a content-addressed artifact; the claim boundary also
 * records that there is no external validation evidence and makes no
 * conformance/compliance claim.
 */
export const LTE_ETM_1_1_10_MHZ_FDD_PRESET: StandardsWaveformPreset = standardsWaveformPresetSchema.parse({
  schemaVersion: STANDARDS_WAVEFORM_SCHEMA_VERSION,
  presetId: 'lte-etm-1-1-10mhz-fdd',
  revision: '1.0.0',
  family: 'lte',
  name: 'LTE E-TM 1.1 · 10 MHz · FDD',
  description: 'A version-pinned, concrete downlink reference-generator configuration for LTE E-TM 1.1 at 10 MHz FDD.',
  qualification: 'standards-derived',
  qualificationBoundary: {
    complianceClaim: 'not-claimed',
    externalValidationEvidence: 'not-provided',
    statement: 'No generated artifact or external validation evidence is attached. This exact standards-derived configuration is not a claim of 3GPP conformance or compliance.',
  },
  standardReferences: [
    {
      referenceId: LTE_ETM_REFERENCE_ID,
      organization: '3GPP',
      documentId: 'TS 36.141',
      title: 'E-UTRA Base Station (BS) conformance testing',
      revision: '19.1.0',
      release: 'Release 19',
      clauses: ['6.1.1', '6.1.1.1', 'Table 6.1.1.1-1'],
      publicationUrl: 'https://www.etsi.org/deliver/etsi_ts/136100_136199/136141/19.01.00_60/ts_136141v190100p.pdf',
    },
    {
      referenceId: LTE_PHY_REFERENCE_ID,
      organization: '3GPP',
      documentId: 'TS 36.211',
      title: 'E-UTRA Physical channels and modulation',
      revision: '19.3.0',
      release: 'Release 19',
      clauses: ['4 Frame structure', '6 Downlink physical channels and modulation'],
      publicationUrl: 'https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/19.03.00_60/ts_136211v190300p.pdf',
    },
  ],
  configuration: {
    schemaId: 'signallab.lte.reference-generator-configuration.v1',
    parameters: [
      { key: 'radio.accessTechnology', value: { kind: 'string', value: 'E-UTRA' }, origin: 'standard', sourceReferenceIds: [LTE_PHY_REFERENCE_ID], description: 'Radio access technology selected by the preset.' },
      { key: 'link.direction', value: { kind: 'string', value: 'downlink' }, origin: 'standard', sourceReferenceIds: [LTE_ETM_REFERENCE_ID], description: 'E-TM 1.1 is instantiated as a downlink base-station test model.' },
      { key: 'testModel.name', value: { kind: 'string', value: 'E-TM 1.1' }, origin: 'standard', sourceReferenceIds: [LTE_ETM_REFERENCE_ID], description: 'Exact named E-UTRA test model.' },
      { key: 'channel.duplexMode', value: { kind: 'string', value: 'FDD' }, origin: 'preset-selection', sourceReferenceIds: [LTE_PHY_REFERENCE_ID], description: 'Concrete frame-structure selection for this preset.' },
      { key: 'channel.bandwidthHz', value: { kind: 'integer', value: 10_000_000 }, unit: 'Hz', origin: 'preset-selection', sourceReferenceIds: [LTE_ETM_REFERENCE_ID], description: 'Concrete 10 MHz transmission bandwidth selection.' },
      { key: 'resourceGrid.resourceBlocks', value: { kind: 'integer', value: 50 }, unit: 'resource blocks', origin: 'standard', sourceReferenceIds: [LTE_ETM_REFERENCE_ID, LTE_PHY_REFERENCE_ID], description: 'Resource-block count for the 10 MHz test-model column.' },
      { key: 'resourceGrid.subcarrierSpacingHz', value: { kind: 'integer', value: 15_000 }, unit: 'Hz', origin: 'standard', sourceReferenceIds: [LTE_PHY_REFERENCE_ID], description: 'LTE downlink subcarrier spacing.' },
      { key: 'resourceGrid.cyclicPrefix', value: { kind: 'string', value: 'normal' }, origin: 'preset-selection', sourceReferenceIds: [LTE_PHY_REFERENCE_ID], description: 'Concrete cyclic-prefix selection.' },
      { key: 'transmission.antennaPorts', value: { kind: 'integer', value: 1 }, unit: 'ports', origin: 'preset-selection', sourceReferenceIds: [LTE_ETM_REFERENCE_ID], description: 'Single transmit antenna-port configuration.' },
      { key: 'sampling.sampleRateHz', value: { kind: 'integer', value: 15_360_000 }, unit: 'samples/s', origin: 'preset-selection', sourceReferenceIds: [LTE_PHY_REFERENCE_ID], description: 'Provider-neutral complex-baseband output sample rate.' },
      { key: 'capture.frames', value: { kind: 'integer', value: 10 }, unit: 'radio frames', origin: 'preset-selection', sourceReferenceIds: [LTE_PHY_REFERENCE_ID], description: 'Finite, deterministic 100 ms generation length.' },
      { key: 'cell.physicalCellId', value: { kind: 'integer', value: 0 }, origin: 'preset-selection', sourceReferenceIds: [LTE_PHY_REFERENCE_ID], description: 'Deterministic physical-cell identity selected for the reference vector.' },
      { key: 'payload.seed', value: { kind: 'integer', value: 1 }, origin: 'preset-selection', sourceReferenceIds: [LTE_ETM_REFERENCE_ID], description: 'Deterministic payload seed selected by SignalLab; it is not prescribed by 3GPP.' },
    ],
  },
  referenceGenerator: null,
  artifacts: [],
  validationEvidence: [],
});
