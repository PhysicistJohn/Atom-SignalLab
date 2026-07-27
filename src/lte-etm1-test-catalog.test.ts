import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LTE_ETM1_1_CLAUSE_TEXT_CANONICALIZATION,
  LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256,
  LTE_ETM1_1_CATALOG_SHA256,
  LTE_ETM1_1_ASSERTION_SHA256_PINS,
  LTE_ETM1_1_REQUIRED_CLAUSES,
  LTE_ETM1_1_SEMANTIC_ASSERTION_CONTRACTS,
  canonicalLteEtm11AssertionContractJson,
  createLteEtm11CampaignEnvelope,
  createLteEtm11ClauseTestCatalog,
  lteEtm11AssertionSha256,
  lteEtm11RequiredExecutionBindings,
  parseRetainedLteEtm11ClauseEvidence,
  verifyLteEtm11ClauseDigest,
  type VerifiedLteEtm11ClauseDigest,
} from './lte-etm1-test-catalog.js';
import {
  assessStandardsTestCampaign,
  standardsTestCatalogSha256,
  type StandardsTestExecution,
} from './standards-test-gate.js';
import { RELEASE_19_SPECIFICATION_LOCK } from './3gpp-compliance-release-19.js';

const SUBJECT_ARTIFACT_SHA256 =
  '1cb66b49be2518ea33a2bbf1f7075b54e6e62e10a9c05491a0ba4727bfe05511';

function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function retainedReportBytes(): Uint8Array {
  return readFileSync(new URL(
    '../validation/lte-etm1-release19-clause-evidence.json',
    import.meta.url,
  ));
}

function verifiedClauseEvidence(): readonly VerifiedLteEtm11ClauseDigest[] {
  return parseRetainedLteEtm11ClauseEvidence(retainedReportBytes());
}

describe('production LTE E-TM1.1 clause-to-test catalog', () => {
  it('requires content-verified evidence for every exact normative clause range', () => {
    const evidence = verifiedClauseEvidence();
    expect(evidence).toHaveLength(59);
    expect(LTE_ETM1_1_CLAUSE_TEXT_CANONICALIZATION).toMatch(/WordprocessingML/);
    expect(sha256(retainedReportBytes())).toBe(LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256);

    expect(() => createLteEtm11ClauseTestCatalog(evidence.slice(1))).toThrow(/missing=/i);
    expect(() => createLteEtm11ClauseTestCatalog([...evidence, evidence[0]!]))
      .toThrow(/duplicate/i);
    const last = evidence.at(-1)!;
    expect(() => createLteEtm11ClauseTestCatalog([
      ...evidence.slice(0, -1),
      {
        clauseKey: last.clauseKey,
        sourceArchiveSha256: last.sourceArchiveSha256,
        normativeTextSha256: last.normativeTextSha256,
        normativeTextByteLength: last.normativeTextByteLength,
        extractionReportSha256: last.extractionReportSha256,
      } as VerifiedLteEtm11ClauseDigest,
    ])).toThrow(/must be reproduced/i);

    expect(() => createLteEtm11ClauseTestCatalog([
      {
        ...evidence[0]!,
        normativeTextSha256: '0'.repeat(64),
      },
      ...evidence.slice(1),
    ])).toThrow(/must be reproduced/i);

    const brandedDescriptors: PropertyDescriptorMap = {
      ...Object.getOwnPropertyDescriptors(evidence[0]!),
    };
    brandedDescriptors.normativeTextSha256 = {
      ...brandedDescriptors.normativeTextSha256!,
      value: '0'.repeat(64),
    };
    const brandedTamper = Object.create(
      Object.getPrototypeOf(evidence[0]!),
      brandedDescriptors,
    ) as VerifiedLteEtm11ClauseDigest;
    expect(() => createLteEtm11ClauseTestCatalog([
      brandedTamper,
      ...evidence.slice(1),
    ])).toThrow(/pinned normative evidence/i);

    let clauseKeyReads = 0;
    const proxyTarget = { ...evidence[0]! } as VerifiedLteEtm11ClauseDigest;
    const brandSymbol = Object.getOwnPropertySymbols(evidence[0]!)[0]!;
    Object.defineProperty(
      proxyTarget,
      brandSymbol,
      Object.getOwnPropertyDescriptor(evidence[0]!, brandSymbol)!,
    );
    const alternatingClauseKey = new Proxy(proxyTarget, {
      get(target, property, receiver) {
        if (property === 'clauseKey') {
          return clauseKeyReads++ === 0
            ? evidence[0]!.clauseKey
            : evidence[1]!.clauseKey;
        }
        if (property === 'normativeTextSha256') {
          return evidence[1]!.normativeTextSha256;
        }
        if (property === 'normativeTextByteLength') {
          return evidence[1]!.normativeTextByteLength;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    expect(() => createLteEtm11ClauseTestCatalog([
      alternatingClauseKey,
      ...evidence.slice(1),
    ])).toThrow(/pinned normative evidence/i);
  });

  it('rejects tampered reports and caller-invented normative-range identities', () => {
    const tamperedReport = retainedReportBytes().slice();
    const tamperedIndex = tamperedReport.byteLength - 2;
    tamperedReport[tamperedIndex] = tamperedReport[tamperedIndex]! ^ 1;
    expect(() => parseRetainedLteEtm11ClauseEvidence(tamperedReport))
      .toThrow(/SHA-256 does not match/i);

    const descriptor = LTE_ETM1_1_REQUIRED_CLAUSES[0]!;
    const valid = {
      clauseKey: descriptor.clauseKey,
      sourceArchiveSha256: descriptor.sourceArchiveSha256,
      normativeOoxmlRange:
        '<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>6.1.1</w:t></w:r></w:p>',
      extractionReportSha256: LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256,
    };

    expect(() => verifyLteEtm11ClauseDigest(valid)).toThrow(/pinned normative-range mismatch/i);
    expect(() => verifyLteEtm11ClauseDigest({
      ...valid,
      sourceArchiveSha256: sha256('different archive'),
    })).toThrow(/pinned official archive/i);
    expect(() => verifyLteEtm11ClauseDigest({
      ...valid,
      extractionReportSha256: sha256('different extraction report'),
    })).toThrow(/retained evidence report/i);
  });

  it('maps every fixed digital requirement to leaf-level implemented clauses and real tests', () => {
    const catalog = createLteEtm11ClauseTestCatalog(verifiedClauseEvidence());
    expect(standardsTestCatalogSha256(catalog)).toBe(LTE_ETM1_1_CATALOG_SHA256);
    expect(catalog.requirements).toHaveLength(74);
    expect(catalog.tests).toHaveLength(12);
    expect(new Set(catalog.requirements.map((requirement) => requirement.requirementId)).size)
      .toBe(74);
    expect(catalog.requirements.every((requirement) => (
      requirement.scope === 'digital-baseband'
      && requirement.applicability === 'applicable'
      && requirement.disposition === 'implemented'
      && requirement.testIds.length > 0
    ))).toBe(true);

    const clauseIds = catalog.requirements.map(
      (requirement) => `${requirement.clause.documentId}#${requirement.clause.clause}`,
    );
    expect(clauseIds).not.toContain('TS 36.211#5.6');
    expect(clauseIds).toContain('TS 36.104#5.6');
    expect(clauseIds).toContain('TS 36.211#6.2.1');
    expect(clauseIds).toContain('TS 36.212#5.1.4.2.1');
    expect(clauseIds).toContain('TS 36.212#5.3.4');
    expect(clauseIds).toContain('TS 36.212#5.3.5');
    expect(clauseIds).toContain('TS 36.211#6.2.4');
    expect(clauseIds).toContain('TS 36.211#6.3.3.1');
    expect(clauseIds).toContain('TS 36.211#6.3.4.1');
    expect(clauseIds).toContain('TS 36.211#6.4');
    expect(clauseIds).toContain('TS 36.211#6.6.3');
    expect(clauseIds).toContain('TS 36.211#6.7.3');
    expect(clauseIds).toContain('TS 36.211#6.8.4');
    expect(clauseIds).toContain('TS 36.211#6.9.2');
    expect(clauseIds).toContain('TS 36.211#6.10.1');
    expect(clauseIds).toContain('TS 36.211#6.11');
    expect(clauseIds).toContain('TS 36.211#6.11.1');
    expect(clauseIds).toContain('TS 36.211#6.11.2');
    expect(clauseIds).toContain('TS 36.211#7.1.1');
    expect(clauseIds).toContain('TS 36.211#7.1.2');

    const sourceFiles = new Set(catalog.tests.map(
      (test) => test.sourceLocation.split('#', 1)[0],
    ));
    expect(sourceFiles).toEqual(new Set([
      'src/lte-etm1-reference.test.ts',
      'src/lte-etm1-provider.test.ts',
      'src/lte-etm1-independent-oracle.test.ts',
    ]));
    expect(catalog.tests.find((test) => test.method === 'independent-oracle'))
      .toMatchObject({
        testId: 'lte.etm1.oracle.full-frame',
        implementation: {
          providerId: 'srsran-project',
          implementationId: 'srsran-4g.lte-phy-plus-etm-harness',
        },
      });

    for (const descriptor of LTE_ETM1_1_REQUIRED_CLAUSES) {
      const specification = RELEASE_19_SPECIFICATION_LOCK.specifications.find(
        (entry) => (
          entry.specification === descriptor.documentId
          && entry.version === descriptor.revision
        ),
      );
      expect(
        specification?.clauses.some((entry) => entry.clauseId === descriptor.clause),
        `${descriptor.clauseKey} must be present in the immutable Release-19 lock`,
      ).toBe(true);
    }
  });

  it('derives every assertion digest from its full canonical semantic contract', () => {
    const catalog = createLteEtm11ClauseTestCatalog(verifiedClauseEvidence());
    const testsById = new Map(catalog.tests.map((test) => [test.testId, test]));
    const digests = new Set<string>();

    for (const contract of LTE_ETM1_1_SEMANTIC_ASSERTION_CONTRACTS) {
      const canonical = canonicalLteEtm11AssertionContractJson(contract);
      const independentlyHashed = sha256(canonical);
      expect(sha256(readFileSync(contract.sourceLocation.split('#', 1)[0]!)))
        .toBe(contract.sourceFileSha256);
      expect(lteEtm11AssertionSha256(contract)).toBe(independentlyHashed);
      expect(LTE_ETM1_1_ASSERTION_SHA256_PINS[contract.testId]).toBe(independentlyHashed);
      expect(testsById.get(contract.testId)?.assertionSha256).toBe(independentlyHashed);
      expect(independentlyHashed).toMatch(/^[a-f0-9]{64}$/);
      digests.add(independentlyHashed);

      const mutated = {
        ...contract,
        assertions: [...contract.assertions, 'A semantic mutation changes the identity.'],
      };
      expect(sha256(canonicalLteEtm11AssertionContractJson(mutated)))
        .not.toBe(independentlyHashed);
    }
    expect(digests.size).toBe(LTE_ETM1_1_SEMANTIC_ASSERTION_CONTRACTS.length);
  });

  it('provides content bindings but cannot synthesize a passing execution', () => {
    const catalog = createLteEtm11ClauseTestCatalog(verifiedClauseEvidence());
    const bindings = lteEtm11RequiredExecutionBindings(catalog, SUBJECT_ARTIFACT_SHA256);
    expect(bindings).toHaveLength(catalog.tests.length);
    for (const binding of bindings) {
      expect(binding).not.toHaveProperty('outcome');
      expect(binding).not.toHaveProperty('executedAt');
      expect(binding).not.toHaveProperty('reportSha256');
      expect(binding.subjectArtifactSha256).toBe(SUBJECT_ARTIFACT_SHA256);
    }

    const campaign = createLteEtm11CampaignEnvelope({
      catalog,
      subjectArtifactSha256: SUBJECT_ARTIFACT_SHA256,
      evaluatedAt: '2026-07-27T08:00:00.000Z',
      executions: [],
    });
    expect(campaign.catalogSha256).toBe(standardsTestCatalogSha256(catalog));
    expect(campaign.executions).toEqual([]);
    expect(assessStandardsTestCampaign({
      campaign,
      scope: 'digital-baseband',
      assurance: 'automated',
    }).admitted).toBe(false);
    expect(assessStandardsTestCampaign({
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    }).admitted).toBe(false);
  });

  it('retains caller executions and the gate rejects them outside the 24-hour window', () => {
    const catalog = createLteEtm11ClauseTestCatalog(verifiedClauseEvidence());
    const staleExecutions: StandardsTestExecution[] = catalog.tests.map((definition) => ({
      testId: definition.testId,
      assertionSha256: definition.assertionSha256,
      subjectArtifactSha256: SUBJECT_ARTIFACT_SHA256,
      outcome: 'pass',
      executedAt: '2026-07-26T07:59:59.999Z',
      runner: { name: 'Synthetic caller fixture', version: '1.0.0' },
      reportSha256: sha256(`caller report:${definition.testId}`),
      executor: definition.implementation,
    }));
    const campaign = createLteEtm11CampaignEnvelope({
      catalog,
      subjectArtifactSha256: SUBJECT_ARTIFACT_SHA256,
      evaluatedAt: '2026-07-27T08:00:00.000Z',
      executions: staleExecutions,
    });

    expect(campaign.executions).toEqual(staleExecutions);
    const automated = assessStandardsTestCampaign({
      campaign,
      scope: 'digital-baseband',
      assurance: 'automated',
    });
    const independent = assessStandardsTestCampaign({
      campaign,
      scope: 'digital-baseband',
      assurance: 'independent-oracle',
    });
    expect(automated.admitted).toBe(false);
    expect(independent.admitted).toBe(false);
    expect([...automated.reasons, ...independent.reasons].join(' '))
      .toMatch(/fresh within 24 hours/i);
  });
});
