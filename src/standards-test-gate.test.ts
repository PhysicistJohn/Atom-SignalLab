import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assessStandardsTestCampaign,
  standardsTestCatalogSchema,
  standardsTestCatalogSha256,
  type StandardsTestCatalog,
  type StandardsTestExecution,
} from './standards-test-gate.js';

const ASSERTION_SHA256 = '1'.repeat(64);
const ARTIFACT_SHA256 = '2'.repeat(64);
const REPORT_SHA256 = '3'.repeat(64);
const NORMATIVE_TEXT_SHA256 = '4'.repeat(64);

function catalog(): StandardsTestCatalog {
  return standardsTestCatalogSchema.parse({
    schemaVersion: 1,
    catalogId: 'lte-etm1-1-clause-tests',
    revision: '1.0.0',
    subject: {
      presetId: 'lte-etm-1-1-10mhz-fdd',
      presetRevision: '2.0.0',
      generatorProviderId: 'signallab',
      generatorImplementationId: 'signallab.lte.etm1',
    },
    requirements: [{
      requirementId: 'lte-frame-geometry',
      title: 'One normal-CP 10 ms E-TM frame',
      clause: {
        organization: '3GPP',
        documentId: 'TS 36.141',
        revision: '19.1.0',
        release: 'Release 19',
        clause: '6.1.1',
        normativeTextSha256: NORMATIVE_TEXT_SHA256,
      },
      scope: 'digital-baseband',
      applicability: 'applicable',
      applicabilityRationale: 'The selected E-TM 1.1 FDD preset uses the common E-TM frame geometry.',
      disposition: 'implemented',
      testIds: ['lte-frame-geometry-test'],
    }],
    tests: [{
      testId: 'lte-frame-geometry-test',
      title: 'Checks exact frame, slot, symbol, FFT, and cyclic-prefix geometry',
      method: 'automated-property',
      sourceLocation: 'src/lte-etm1-reference.test.ts#emits exact normal-CP frame geometry',
      sourceFileSha256: '5'.repeat(64),
      assertionSha256: ASSERTION_SHA256,
      coversRequirementIds: ['lte-frame-geometry'],
      implementation: {
        providerId: 'signallab',
        implementationId: 'signallab.lte.etm1-tests',
      },
    }],
  });
}

function execution(overrides: Partial<StandardsTestExecution> = {}): StandardsTestExecution {
  return {
    testId: 'lte-frame-geometry-test',
    assertionSha256: ASSERTION_SHA256,
    subjectArtifactSha256: ARTIFACT_SHA256,
    outcome: 'pass',
    executedAt: '2026-07-26T08:00:00.000Z',
    runner: { name: 'Vitest', version: '4.1.10' },
    reportSha256: REPORT_SHA256,
    executor: {
      providerId: 'signallab',
      implementationId: 'signallab.lte.etm1-tests',
    },
    ...overrides,
  };
}

function campaign(overrides: Record<string, unknown> = {}) {
  const testCatalog = catalog();
  return {
    catalog: testCatalog,
    catalogSha256: standardsTestCatalogSha256(testCatalog),
    subjectArtifactSha256: ARTIFACT_SHA256,
    evaluatedAt: '2026-07-26T08:30:00.000Z',
    executions: [execution()],
    ...overrides,
  };
}

describe('standards clause-to-test admission gate', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T09:00:00.000Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('admits an applicable digital requirement only after its content-bound test passes', () => {
    expect(assessStandardsTestCampaign({
      campaign: campaign(),
      scope: 'digital-baseband',
      assurance: 'automated',
    })).toEqual({
      admitted: true,
      scope: 'digital-baseband',
      assurance: 'automated',
      coveredRequirementIds: ['lte-frame-geometry'],
      uncoveredRequirementIds: [],
      reasons: [],
    });
  });

  it.each([
    ['missing', []],
    ['failed', [execution({ outcome: 'fail' })]],
    ['skipped', [execution({ outcome: 'skipped' })]],
    ['stale assertion', [execution({ assertionSha256: '5'.repeat(64) })]],
    ['different artifact', [execution({ subjectArtifactSha256: '6'.repeat(64) })]],
    ['different executor', [execution({
      executor: {
        providerId: 'different-provider',
        implementationId: 'different-implementation',
      },
    })]],
    ['expired result', [execution({ executedAt: '2026-07-25T07:59:59.999Z' })]],
    ['future result', [execution({ executedAt: '2026-07-26T08:30:00.001Z' })]],
  ])('fails closed for a %s execution', (_caseName, executions) => {
    const decision = assessStandardsTestCampaign({
      campaign: campaign({ executions }),
      scope: 'digital-baseband',
      assurance: 'automated',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.uncoveredRequirementIds).toEqual(['lte-frame-geometry']);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it('rejects a stale catalog digest even when every named test passes', () => {
    const decision = assessStandardsTestCampaign({
      campaign: campaign({ catalogSha256: '7'.repeat(64) }),
      scope: 'digital-baseband',
      assurance: 'automated',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/catalog digest/i);
  });

  it.each([
    ['stale', '2026-07-25T08:59:59.999Z'],
    ['future', '2026-07-26T09:05:00.001Z'],
  ])('rejects a %s caller-selected campaign snapshot', (_caseName, evaluatedAt) => {
    const decision = assessStandardsTestCampaign({
      campaign: campaign({ evaluatedAt }),
      scope: 'digital-baseband',
      assurance: 'automated',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/system clock/i);
  });

  it('does not treat an ordinary generator-side test as an independent oracle', () => {
    const decision = assessStandardsTestCampaign({
      campaign: campaign(),
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/no independent-oracle test/i);
  });

  it('rejects an allegedly independent oracle that shares the generator provider', () => {
    const baseCatalog = catalog();
    const testCatalog = {
      ...baseCatalog,
      tests: [{
        ...baseCatalog.tests[0]!,
        method: 'independent-oracle' as const,
        implementation: {
          providerId: 'signallab',
          implementationId: 'other-code-path',
        },
      }],
    };
    const parsedCatalog = standardsTestCatalogSchema.parse(testCatalog);
    const decision = assessStandardsTestCampaign({
      campaign: {
        catalog: parsedCatalog,
        catalogSha256: standardsTestCatalogSha256(parsedCatalog),
        subjectArtifactSha256: ARTIFACT_SHA256,
        evaluatedAt: '2026-07-26T08:30:00.000Z',
        executions: [execution({
          executor: {
            providerId: 'signallab',
            implementationId: 'other-code-path',
          },
        })],
      },
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/shares the generator provider/i);
  });

  it('requires external-lab evidence for conducted and radiated RF claims', () => {
    const baseCatalog = catalog();
    const testCatalog = {
      ...baseCatalog,
      requirements: [{
        ...baseCatalog.requirements[0]!,
        requirementId: 'lte-conducted-output-power',
        title: 'Conducted BS output-power conformance',
        scope: 'conducted-rf' as const,
        disposition: 'external-evidence-required' as const,
        testIds: [],
      }],
      tests: [],
    };
    const parsedCatalog = standardsTestCatalogSchema.parse(testCatalog);
    const decision = assessStandardsTestCampaign({
      campaign: {
        catalog: parsedCatalog,
        catalogSha256: standardsTestCatalogSha256(parsedCatalog),
        subjectArtifactSha256: ARTIFACT_SHA256,
        evaluatedAt: '2026-07-26T08:30:00.000Z',
        executions: [],
      },
      scope: 'conducted-rf',
      assurance: 'automated',
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/external-lab evidence/i);
  });

  it('rejects malformed or one-way traceability instead of silently dropping coverage', () => {
    const baseCatalog = catalog();
    const malformed = {
      ...baseCatalog,
      tests: [{
        ...baseCatalog.tests[0]!,
        coversRequirementIds: ['different-requirement'],
      }],
    };

    expect(standardsTestCatalogSchema.safeParse(malformed).success).toBe(false);
    expect(assessStandardsTestCampaign({
      campaign: { not: 'a campaign' },
      scope: 'digital-baseband',
      assurance: 'automated',
    }).admitted).toBe(false);
  });

  it.each(['TS 38.141-1', 'TS 38.141-2'])(
    'accepts the split NR conformance document identifier %s',
    (documentId) => {
      const input = structuredClone(catalog());
      input.requirements[0]!.clause.documentId = documentId;
      expect(standardsTestCatalogSchema.safeParse(input).success).toBe(true);
    },
  );
});
