import { describe, expect, it } from 'vitest';
import {
  LTE_ETM_1_1_10_MHZ_FDD_PRESET,
  STANDARDS_WAVEFORM_LIMITS,
  complexIqArtifactSchema,
  standardsWaveformPresetSchema,
  waveformFamilySchema,
  waveformQualificationSchema,
  type StandardsWaveformPreset,
} from './standards-waveform.js';

const CONTENT_SHA256 = 'a'.repeat(64);
const CONFIGURATION_SHA256 = 'b'.repeat(64);
const REPORT_SHA256 = 'c'.repeat(64);

function validArtifact() {
  return {
    artifactId: 'lte-etm-vector',
    kind: 'complex-iq' as const,
    location: 'waveforms/lte-etm-vector.cf32',
    mediaType: 'application/vnd.signallab.complex-iq' as const,
    contentSha256: CONTENT_SHA256,
    generatorConfigurationSha256: CONFIGURATION_SHA256,
    byteLength: 2 * 1_536 * 2 * 4,
    channelCount: 2,
    complexSamplesPerChannel: 1_536,
    sampleRateHz: 15_360_000,
    centerFrequencyHz: 0,
    format: {
      container: 'raw-binary' as const,
      componentType: 'float32' as const,
      layout: 'interleaved-iq' as const,
      byteOrder: 'little-endian' as const,
      amplitudeUnit: 'normalized-full-scale' as const,
    },
  };
}

function validationEvidence(kind: 'internal-validation' | 'independent-validator', providerId = 'external-lab') {
  const common = {
    evidenceId: `${kind}-evidence`,
    artifactSha256: CONTENT_SHA256,
    validator: {
      providerId,
      providerName: providerId === 'signallab' ? 'SignalLab' : 'External validation lab',
      productName: 'Independent LTE analyzer',
      productVersion: '1.0.0',
      implementationId: providerId === 'signallab' ? 'signallab.internal-analyzer' : 'external-lte-analyzer',
    },
    executedAt: '2026-07-17T12:00:00.000Z',
    standardReferenceIds: ['3gpp-ts-36-141-r19'],
    methodology: 'Decode and measure the exact content-addressed artifact without using generator-side labels.',
    overallResult: 'pass' as const,
    checks: [{
      checkId: 'decode-and-evm',
      name: 'Independent decode and EVM check',
      method: 'Decode the physical channels and evaluate the clause-scoped EVM result.',
      standardReferenceIds: ['3gpp-ts-36-141-r19'],
      result: 'pass' as const,
      observation: 'The test fixture represents a passing external report.',
      acceptanceCriteria: 'All report-specific clause-scoped criteria pass.',
    }],
    reportSha256: REPORT_SHA256,
    reportLocation: 'validation/lte-etm-vector-report.json',
  };
  return kind === 'independent-validator'
    ? {
      kind,
      ...common,
      independence: {
        relationship: 'independent-implementation' as const,
        declaration: 'The validator provider and implementation are independent of the reference generator.',
      },
    }
    : { kind, ...common };
}

function verifiedPreset(overrides: Partial<StandardsWaveformPreset> = {}) {
  return {
    ...structuredClone(LTE_ETM_1_1_10_MHZ_FDD_PRESET),
    qualification: 'independently-verified' as const,
    qualificationBoundary: {
      complianceClaim: 'not-claimed' as const,
      externalValidationEvidence: 'attached' as const,
      statement: 'Qualification is limited to the exact artifact and evidence records; broad compliance is not claimed.',
    },
    referenceGenerator: {
      tool: {
        providerId: 'signallab',
        providerName: 'SignalLab',
        productName: 'SignalLab provider-neutral waveform factory',
        productVersion: '0.1.0',
        implementationId: 'signallab.lte.etm-reference',
      },
      recipeId: 'lte-etm-1-1-10mhz-fdd',
      recipeRevision: '1.0.0',
      deterministic: true,
    },
    artifacts: [validArtifact()],
    validationEvidence: [validationEvidence('independent-validator')],
    ...overrides,
  };
}

describe('standards waveform foundation', () => {
  it('closes the requested family and qualification taxonomies', () => {
    expect(waveformFamilySchema.options).toEqual(['lab', 'geran', 'lte', 'nr', 'wlan', 'bluetooth']);
    expect(waveformQualificationSchema.options).toEqual([
      'synthetic-projection',
      'standards-derived',
      'reference-generated',
      'independently-verified',
    ]);
  });

  it('ships an exact LTE E-TM 1.1 10 MHz FDD standards-derived seed without an artifact, external evidence, or a compliance claim', () => {
    const preset = standardsWaveformPresetSchema.parse(LTE_ETM_1_1_10_MHZ_FDD_PRESET);
    const parameters = Object.fromEntries(preset.configuration.parameters.map((parameter) => [parameter.key, parameter.value.value]));

    expect(preset).toMatchObject({
      family: 'lte',
      qualification: 'standards-derived',
      qualificationBoundary: {
        complianceClaim: 'not-claimed',
        externalValidationEvidence: 'not-provided',
      },
      artifacts: [],
      validationEvidence: [],
      referenceGenerator: null,
    });
    expect(preset.standardReferences.map((reference) => [reference.documentId, reference.revision])).toEqual([
      ['TS 36.141', '19.1.0'],
      ['TS 36.211', '19.3.0'],
    ]);
    expect(parameters).toMatchObject({
      'testModel.name': 'E-TM 1.1',
      'channel.duplexMode': 'FDD',
      'channel.bandwidthHz': 10_000_000,
      'resourceGrid.resourceBlocks': 50,
      'resourceGrid.subcarrierSpacingHz': 15_000,
      'sampling.sampleRateHz': 15_360_000,
    });
    expect(preset.qualificationBoundary.statement).toMatch(/no generated artifact.*not a claim.*conformance or compliance/i);
  });

  it('does not admit reference-generated qualification without a content-addressed artifact', () => {
    const seed = verifiedPreset({
      qualification: 'reference-generated',
      qualificationBoundary: {
        complianceClaim: 'not-claimed',
        externalValidationEvidence: 'not-provided',
        statement: 'No independent validation evidence is attached.',
      },
      artifacts: [],
      validationEvidence: [],
    });
    const parsed = standardsWaveformPresetSchema.safeParse(seed);

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((issue) => issue.message).join(' ')).toMatch(/content-addressed I\/Q artifact/i);
  });

  it('validates content-addressed complex-I/Q metadata and exact byte accounting', () => {
    expect(complexIqArtifactSchema.parse(validArtifact())).toMatchObject({
      kind: 'complex-iq',
      contentSha256: CONTENT_SHA256,
      generatorConfigurationSha256: CONFIGURATION_SHA256,
      complexSamplesPerChannel: 1_536,
      sampleRateHz: 15_360_000,
    });
    expect(complexIqArtifactSchema.safeParse({ ...validArtifact(), byteLength: validArtifact().byteLength - 1 }).success).toBe(false);
    expect(complexIqArtifactSchema.safeParse({ ...validArtifact(), contentSha256: 'A'.repeat(64) }).success).toBe(false);
    expect(complexIqArtifactSchema.safeParse({ ...validArtifact(), sampleRateHz: STANDARDS_WAVEFORM_LIMITS.maximumSampleRateHz + 1 }).success).toBe(false);
    expect(complexIqArtifactSchema.safeParse({ ...validArtifact(), unexpected: true }).success).toBe(false);
  });

  it('rejects independently verified qualification without passing independent validator evidence', () => {
    const noEvidence = verifiedPreset({
      qualificationBoundary: {
        complianceClaim: 'not-claimed',
        externalValidationEvidence: 'not-provided',
        statement: 'No external validation is present.',
      },
      validationEvidence: [],
    });
    const internalOnly = verifiedPreset({
      qualificationBoundary: {
        complianceClaim: 'not-claimed',
        externalValidationEvidence: 'not-provided',
        statement: 'Only internal validation is present.',
      },
      validationEvidence: [validationEvidence('internal-validation')],
    });

    expect(standardsWaveformPresetSchema.safeParse(noEvidence).success).toBe(false);
    expect(standardsWaveformPresetSchema.safeParse(internalOnly).success).toBe(false);
  });

  it('rejects self-validation disguised as independent evidence', () => {
    const parsed = standardsWaveformPresetSchema.safeParse(verifiedPreset({
      validationEvidence: [validationEvidence('independent-validator', 'signallab')],
    }));

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((issue) => issue.message).join(' ')).toMatch(/different provider/i);
  });

  it('accepts a passing independent record while retaining the no-compliance claim boundary', () => {
    const parsed = standardsWaveformPresetSchema.parse(verifiedPreset());

    expect(parsed.qualification).toBe('independently-verified');
    expect(parsed.validationEvidence[0]?.kind).toBe('independent-validator');
    expect(parsed.qualificationBoundary.complianceClaim).toBe('not-claimed');
  });

  it('rejects unbounded, unknown, duplicate, and dangling configuration metadata', () => {
    const base = structuredClone(LTE_ETM_1_1_10_MHZ_FDD_PRESET);
    const parameter = base.configuration.parameters[0]!;
    const duplicates = {
      ...base,
      configuration: { ...base.configuration, parameters: [parameter, parameter] },
    };
    const dangling = {
      ...base,
      configuration: {
        ...base.configuration,
        parameters: [{ ...parameter, sourceReferenceIds: ['missing-reference'] }],
      },
    };

    expect(standardsWaveformPresetSchema.safeParse({ ...base, unknown: true }).success).toBe(false);
    expect(standardsWaveformPresetSchema.safeParse({ ...base, description: 'x'.repeat(2_049) }).success).toBe(false);
    expect(standardsWaveformPresetSchema.safeParse(duplicates).success).toBe(false);
    expect(standardsWaveformPresetSchema.safeParse(dangling).success).toBe(false);
  });
});
