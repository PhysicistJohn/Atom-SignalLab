import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { waveformCatalog } from './catalog.js';
import { canonicalClassificationScenarios } from './classification-corpus.js';
import {
  AUTO_TARGET_SELECTION_RANKING_MODEL_ID,
  AUTO_TARGET_SELECTION_VALIDATION_CASE_IDS,
  AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION,
  AUTO_TARGET_SELECTION_VALIDATION_DISCLOSURE,
  AUTO_TARGET_SELECTION_VALIDATION_SOURCE,
  autoTargetSelectionValidationCase,
  autoTargetSelectionValidationCases,
  canonicalAutoTargetSelectionCaseDefinitionJson,
  canonicalAutoTargetSelectionMaterializationJson,
  rankAutoTargetSelectionComponentTruth,
  resolveAutoTargetSelectionValidationCase,
  synthesizeAutoTargetSelectionValidationCase,
  type AutoTargetSelectionComparisonRelation,
  type AutoTargetSelectionComponentTruth,
  type AutoTargetSelectionValidationSweep,
} from './auto-target-selection-corpus.js';

describe('Auto-v4 integrated-excess validation corpus', () => {
  it('is an immutable four-case validation API outside both human and classifier corpora', () => {
    expect(AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION)
      .toBe('auto-v4-integrated-excess-validation-corpus-v1');
    expect(AUTO_TARGET_SELECTION_RANKING_MODEL_ID)
      .toBe('current-source-sweep-integrated-excess-power-v1');
    expect(autoTargetSelectionValidationCases.map((fixture) => fixture.id))
      .toEqual(AUTO_TARGET_SELECTION_VALIDATION_CASE_IDS);
    expect(autoTargetSelectionValidationCases).toHaveLength(4);
    expect(new Set(autoTargetSelectionValidationCases.map((fixture) => fixture.id)).size).toBe(4);

    expect(waveformCatalog).toHaveLength(34);
    const humanCatalogIds = new Set<string>(waveformCatalog.map((descriptor) => descriptor.id));
    const classifierScenarioIds = new Set<string>(
      canonicalClassificationScenarios.map((scenario) => scenario.id),
    );
    for (const fixture of autoTargetSelectionValidationCases) {
      expect(humanCatalogIds.has(fixture.id)).toBe(false);
      expect(classifierScenarioIds.has(fixture.id)).toBe(false);
      expect(Object.isFrozen(fixture)).toBe(true);
      expect(Object.isFrozen(fixture.geometry)).toBe(true);
      expect(Object.isFrozen(fixture.components)).toBe(true);
      expect(fixture.source).toEqual(AUTO_TARGET_SELECTION_VALIDATION_SOURCE);
      expect(fixture.disclosure).toBe(AUTO_TARGET_SELECTION_VALIDATION_DISCLOSURE);
      expect(fixture.disclosure).toMatch(/not part of the 34-profile operator catalog/i);
      expect(fixture.disclosure).toMatch(/not .*classifier training or calibration data/i);
      expect(fixture.disclosure).toMatch(/not .*likelihood component/i);
      expect(fixture.disclosure).toMatch(/not .*model artifact/i);
      expect(fixture.disclosure).toMatch(/not .*emit RF/i);
      expect(fixture.definitionSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fixture.materializationSha256).toMatch(/^[a-f0-9]{64}$/);
      for (const component of fixture.components) {
        expect(humanCatalogIds.has(component.rawTargetId)).toBe(false);
        expect(classifierScenarioIds.has(component.rawTargetId)).toBe(false);
        expect(Object.isFrozen(component)).toBe(true);
        expect(Object.isFrozen(component.excessPowerDbmByCell)).toBe(true);
        expect(Object.isFrozen(component.runtimeAdmission)).toBe(true);
      }
    }
    expect(AUTO_TARGET_SELECTION_VALIDATION_SOURCE.organization).toBe('TinySA SignalLab');
    expect(AUTO_TARGET_SELECTION_VALIDATION_SOURCE.references).toEqual([expect.objectContaining({
      revision: AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION,
      url: 'https://github.com/PhysicistJohn/Atom-SignalLab/blob/main/src/auto-target-selection-corpus.ts',
    })]);
    expect(() => autoTargetSelectionValidationCase('not-a-case')).toThrow(/Unknown Auto/);
  });

  it('synthesizes complete deterministic sweeps by linear-milliwatt composition', () => {
    for (const fixture of autoTargetSelectionValidationCases) {
      const first = synthesizeAutoTargetSelectionValidationCase(fixture.id);
      const duplicate = synthesizeAutoTargetSelectionValidationCase(fixture.id);
      expect(duplicate).toEqual(first);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.sweep)).toBe(true);
      expect(Object.isFrozen(first.sweep.frequencyHz)).toBe(true);
      expect(Object.isFrozen(first.sweep.powerDbm)).toBe(true);
      expect(first.sweep.complete).toBe(true);
      expect(first.sweep.frequencyHz).toHaveLength(fixture.geometry.pointCount);
      expect(first.sweep.powerDbm).toHaveLength(fixture.geometry.pointCount);
      expect(first.sweep.actualRbwHz).toBe(fixture.geometry.actualRbwHz);
      expect(first.sweep.actualStartHz).toBe(
        first.sweep.frequencyHz[0]! - fixture.geometry.frequencyStepHz / 2,
      );
      expect(first.sweep.actualStopHz).toBe(
        first.sweep.frequencyHz.at(-1)! + fixture.geometry.frequencyStepHz / 2,
      );
      expect(first.sweep.frequencyHz.every((frequencyHz, index) =>
        index === 0
          || frequencyHz - first.sweep.frequencyHz[index - 1]! === fixture.geometry.frequencyStepHz))
        .toBe(true);
      expect(first.sweep.powerDbm.every(Number.isFinite)).toBe(true);

      const floorMw = dbmToMw(fixture.geometry.noiseFloorDbm);
      for (const [binIndex, observedDbm] of first.sweep.powerDbm.entries()) {
        let expectedMw = floorMw;
        for (const component of fixture.components) {
          const cellOffset = binIndex - component.supportFirstBinIndex;
          if (cellOffset >= 0 && cellOffset < component.excessPowerDbmByCell.length) {
            expectedMw += dbmToMw(component.excessPowerDbmByCell[cellOffset]!);
          }
        }
        expect(dbmToMw(observedDbm)).toBeCloseTo(expectedMw, 14);
      }
    }
  });

  it('recomputes the exact physical-cell evidence independently and obtains every declared rank', () => {
    for (const fixture of autoTargetSelectionValidationCases) {
      const materialized = synthesizeAutoTargetSelectionValidationCase(fixture.id);
      const definitionById = new Map(fixture.components.map((component) => [component.rawTargetId, component]));
      for (const component of materialized.components) {
        const definition = definitionById.get(component.rawTargetId)!;
        const independent = independentRankEvidence(materialized.sweep, component);
        expect(component.rankEvidence).toEqual(independent);
        expect(component.startHz).toBe(definition.expected.supportStartHz);
        expect(component.stopHz).toBe(definition.expected.supportStopHz);
        expect(component.peakHz).toBe(definition.expected.peakHz);
        expect(component.peakDbm).toBe(definition.expected.peakDbm);
        expect(component.rankEvidence.supportCellCount).toBe(definition.expected.supportCellCount);
        expect(component.representativeKey).toBe(`frequency-local:${component.rawTargetId}`);
      }

      const independentlyRanked = [...materialized.components].sort((left, right) => {
        const leftPower = independentRankEvidence(materialized.sweep, left).integratedExcessPowerMw;
        const rightPower = independentRankEvidence(materialized.sweep, right).integratedExcessPowerMw;
        if (leftPower !== rightPower) return leftPower > rightPower ? -1 : 1;
        return left.representativeKey.localeCompare(right.representativeKey)
          || left.rawTargetId.localeCompare(right.rawTargetId);
      });
      expect(independentlyRanked.map((component) => component.rawTargetId))
        .toEqual(fixture.expectedRankedRawTargetIds);
      expect(rankAutoTargetSelectionComponentTruth(materialized.components)
        .map((component) => component.rawTargetId))
        .toEqual(fixture.expectedRankedRawTargetIds);
      expect(independentlyRanked[0]!.rawTargetId).toBe(fixture.expectedWinnerRawTargetId);
      expect(resolveAutoTargetSelectionValidationCase(fixture.id))
        .toEqual(fixture.expectedAutomaticOutcome);
    }
  });

  it('pins peak-versus-integrated relations, including an exact deterministic tie', () => {
    for (const fixture of autoTargetSelectionValidationCases) {
      const materialized = synthesizeAutoTargetSelectionValidationCase(fixture.id);
      const left = materialized.components.find(
        (component) => component.rawTargetId === fixture.expectedComparison.leftRawTargetId,
      )!;
      const right = materialized.components.find(
        (component) => component.rawTargetId === fixture.expectedComparison.rightRawTargetId,
      )!;
      expect(relation(left.peakDbm, right.peakDbm)).toBe(fixture.expectedComparison.peakPower);
      expect(relation(
        left.rankEvidence.integratedExcessPowerMw,
        right.rankEvidence.integratedExcessPowerMw,
      )).toBe(fixture.expectedComparison.integratedExcessPower);
    }

    const higherWide = synthesizeAutoTargetSelectionValidationCase(
      'cw-peak-wide-integrated-winner',
    );
    expect(higherWide.components.find((component) => component.morphology === 'cw-like')!.peakDbm)
      .toBeGreaterThan(higherWide.components.find((component) => component.morphology === 'ofdm-like')!.peakDbm);
    expect(higherWide.expectedWinnerRawTargetId).toBe('higher-integrated-wide');

    const inverse = synthesizeAutoTargetSelectionValidationCase('cw-integrated-winner');
    expect(inverse.expectedWinnerRawTargetId).toBe('higher-integrated-cw');

    const tied = synthesizeAutoTargetSelectionValidationCase('exact-integrated-tie');
    expect(tied.components[0]!.rankEvidence.integratedExcessPowerMw)
      .toBe(tied.components[1]!.rankEvidence.integratedExcessPowerMw);
    expect(tied.components[0]!.representativeKey).toBe('frequency-local:tie-alpha');
    expect(tied.expectedRankedRawTargetIds).toEqual(['tie-alpha', 'tie-zulu']);
  });

  it('blocks on an unavailable rank-0 winner even though rank 1 is admitted', () => {
    const materialized = synthesizeAutoTargetSelectionValidationCase(
      'unready-rank-zero-no-fallback',
    );
    const ranked = rankAutoTargetSelectionComponentTruth(materialized.components);
    expect(ranked.map((component) => component.rawTargetId)).toEqual([
      'unready-rank-zero-wide',
      'ready-weaker-cw',
    ]);
    expect(ranked[0]!.runtimeAdmission).toEqual({
      status: 'unavailable',
      reason: 'insufficient-spectrum-history',
      spectrumHistoryCount: 7,
    });
    expect(ranked[1]!.runtimeAdmission).toEqual({
      status: 'admitted',
      spectrumHistoryCount: 8,
    });
    expect(resolveAutoTargetSelectionValidationCase(materialized.caseId)).toEqual({
      status: 'blocked',
      blockedRawTargetId: 'unready-rank-zero-wide',
      reason: 'rank-0-runtime-unavailable',
      lowerRankSubstitutionAllowed: false,
    });
  });

  it('pins every declarative definition and synthesized materialization by SHA-256', () => {
    // Both canonical JSON forms embed values computed through Math.pow/log10
    // at module load (component expected.peakDbm, synthesized sweeps), and
    // libm last-ulp rounding differs by host architecture — x86_64 runners
    // deterministically compute different bytes. The pins were authored on
    // darwin-arm64 and only apply there; every platform still asserts pin
    // shape here and byte-level determinism in the synthesize-twice test.
    const pinsAuthoredOnThisHost = process.platform === 'darwin' && process.arch === 'arm64';
    for (const fixture of autoTargetSelectionValidationCases) {
      const materialized = synthesizeAutoTargetSelectionValidationCase(fixture.id);
      if (pinsAuthoredOnThisHost) {
        expect(sha256(canonicalAutoTargetSelectionCaseDefinitionJson(fixture)))
          .toBe(fixture.definitionSha256);
        expect(sha256(canonicalAutoTargetSelectionMaterializationJson(materialized)))
          .toBe(fixture.materializationSha256);
      }
      expect(fixture.definitionSha256).not.toBe('0'.repeat(64));
      expect(fixture.materializationSha256).not.toBe('0'.repeat(64));
    }
  });
});

function independentRankEvidence(
  sweep: AutoTargetSelectionValidationSweep,
  component: AutoTargetSelectionComponentTruth,
) {
  const sorted = [...sweep.powerDbm].sort((left, right) => left - right);
  const cutoff = Math.max(1, Math.floor(sorted.length * 0.2));
  const lowerTail = sorted.slice(0, cutoff);
  const middle = Math.floor(lowerTail.length / 2);
  const robustFloorDbm = lowerTail.length % 2 === 0
    ? (lowerTail[middle - 1]! + lowerTail[middle]!) / 2
    : lowerTail[middle]!;
  const supportIndices = sweep.frequencyHz
    .map((frequencyHz, index) => ({ frequencyHz, index }))
    .filter(({ frequencyHz }) => frequencyHz >= component.startHz && frequencyHz <= component.stopHz)
    .map(({ index }) => index);
  const floorMw = dbmToMw(robustFloorDbm);
  let integratedExcessPowerMw = 0;
  for (const index of supportIndices) {
    const centerHz = sweep.frequencyHz[index]!;
    const leftHz = index === 0
      ? sweep.actualStartHz
      : (sweep.frequencyHz[index - 1]! + centerHz) / 2;
    const rightHz = index === sweep.frequencyHz.length - 1
      ? sweep.actualStopHz
      : (centerHz + sweep.frequencyHz[index + 1]!) / 2;
    integratedExcessPowerMw += Math.max(0, dbmToMw(sweep.powerDbm[index]!) - floorMw)
      * (rightHz - leftHz) / sweep.actualRbwHz;
  }
  return {
    sourceSweepId: sweep.id,
    supportStartHz: sweep.frequencyHz[supportIndices[0]!]!,
    supportStopHz: sweep.frequencyHz[supportIndices.at(-1)!]!,
    supportCellCount: supportIndices.length,
    robustFloorDbm,
    actualRbwHz: sweep.actualRbwHz,
    integratedExcessPowerMw,
  };
}

function relation(left: number, right: number): AutoTargetSelectionComparisonRelation {
  if (left === right) return 'equal';
  return left > right ? 'greater-than' : 'less-than';
}

function dbmToMw(valueDbm: number): number {
  return 10 ** (valueDbm / 10);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
