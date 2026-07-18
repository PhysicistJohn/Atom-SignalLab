/**
 * Validation-only scalar fixtures for Atomizer Auto-v4 target ranking.
 *
 * This corpus is deliberately separate from both the 34-profile operator
 * catalog and the Bayesian classification corpus. It supplies deterministic
 * competing-emission source-sweep truth for selection-policy validation; it
 * is never classifier training, calibration, likelihood, or model evidence.
 */

import { sourceBasis, type SourceBasis } from './source-provenance.js';

export const AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION =
  'auto-v4-integrated-excess-validation-corpus-v1' as const;

export const AUTO_TARGET_SELECTION_RANKING_MODEL_ID =
  'current-source-sweep-integrated-excess-power-v1' as const;

export const AUTO_TARGET_SELECTION_POLICY_ID =
  'preferred-then-current-source-sweep-integrated-excess-power-physical-or-qualified-agile-member-target-v4' as const;

export const AUTO_TARGET_SELECTION_VALIDATION_CASE_IDS = [
  'cw-peak-wide-integrated-winner',
  'cw-integrated-winner',
  'exact-integrated-tie',
  'unready-rank-zero-no-fallback',
] as const;

export type AutoTargetSelectionValidationCaseId =
  typeof AUTO_TARGET_SELECTION_VALIDATION_CASE_IDS[number];

export const AUTO_TARGET_SELECTION_VALIDATION_SOURCE = sourceBasis('TinySA SignalLab', [{
  specification: 'SignalLab Auto-v4 integrated-excess validation corpus',
  clause: 'Deterministic competing-emission source-sweep fixtures and runtime-admission schedules',
  revision: AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION,
  url: 'https://github.com/PhysicistJohn/Atom-SignalLab/blob/main/src/auto-target-selection-corpus.ts',
}]);

export const AUTO_TARGET_SELECTION_VALIDATION_DISCLOSURE =
  'Validation-only deterministic analytic scalar construction for Atomizer Auto-v4 target ranking. It is not part of the 34-profile operator catalog, classifier training or calibration data, a likelihood component, a model artifact, standards or conformance evidence, protocol-decodable I/Q, or an instruction to emit RF. CW-like and OFDM-like are fixture morphology labels only.';

export type AutoTargetSelectionFixtureMorphology = 'cw-like' | 'ofdm-like';
export type AutoTargetSelectionComparisonRelation = 'less-than' | 'equal' | 'greater-than';

export type AutoTargetSelectionRuntimeAdmission =
  | {
    readonly status: 'admitted';
    readonly spectrumHistoryCount: 8;
  }
  | {
    readonly status: 'unavailable';
    readonly reason: 'insufficient-spectrum-history';
    readonly spectrumHistoryCount: number;
  };

export interface AutoTargetSelectionValidationGeometry {
  readonly firstCenterHz: number;
  readonly frequencyStepHz: number;
  readonly pointCount: number;
  readonly actualRbwHz: number;
  readonly noiseFloorDbm: number;
  readonly sweepTimeSeconds: number;
  readonly seed: number;
  readonly lookIndex: number;
}

export interface AutoTargetSelectionExpectedComponentTruth {
  readonly supportStartHz: number;
  readonly supportStopHz: number;
  readonly supportCellCount: number;
  readonly peakHz: number;
  readonly peakDbm: number;
}

export interface AutoTargetSelectionComponentDefinition {
  readonly rawTargetId: string;
  readonly label: string;
  readonly morphology: AutoTargetSelectionFixtureMorphology;
  readonly associationMode: 'frequency-local';
  readonly supportFirstBinIndex: number;
  /** Per-cell signal power above the floor, composed in linear milliwatts. */
  readonly excessPowerDbmByCell: readonly number[];
  readonly runtimeAdmission: AutoTargetSelectionRuntimeAdmission;
  readonly expected: AutoTargetSelectionExpectedComponentTruth;
}

export interface AutoTargetSelectionExpectedComparison {
  readonly leftRawTargetId: string;
  readonly rightRawTargetId: string;
  readonly peakPower: AutoTargetSelectionComparisonRelation;
  readonly integratedExcessPower: AutoTargetSelectionComparisonRelation;
}

export type AutoTargetSelectionExpectedOutcome =
  | {
    readonly status: 'selected';
    readonly rawTargetId: string;
  }
  | {
    readonly status: 'blocked';
    readonly blockedRawTargetId: string;
    readonly reason: 'rank-0-runtime-unavailable';
    readonly lowerRankSubstitutionAllowed: false;
  };

export interface AutoTargetSelectionValidationCase {
  readonly corpusVersion: typeof AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION;
  readonly rankingModelId: typeof AUTO_TARGET_SELECTION_RANKING_MODEL_ID;
  readonly selectionPolicyId: typeof AUTO_TARGET_SELECTION_POLICY_ID;
  readonly id: AutoTargetSelectionValidationCaseId;
  readonly description: string;
  readonly source: SourceBasis;
  readonly disclosure: string;
  readonly geometry: AutoTargetSelectionValidationGeometry;
  readonly components: readonly AutoTargetSelectionComponentDefinition[];
  readonly expectedComparison: AutoTargetSelectionExpectedComparison;
  readonly expectedRankedRawTargetIds: readonly string[];
  readonly expectedWinnerRawTargetId: string;
  readonly expectedAutomaticOutcome: AutoTargetSelectionExpectedOutcome;
  /** SHA-256 of canonicalAutoTargetSelectionCaseDefinitionJson(this). */
  readonly definitionSha256: string;
  /** SHA-256 of canonicalAutoTargetSelectionMaterializationJson(synthesize(this.id)). */
  readonly materializationSha256: string;
}

export interface AutoTargetSelectionValidationSweep {
  readonly kind: 'spectrum';
  readonly id: string;
  readonly sequence: number;
  readonly capturedAt: string;
  readonly elapsedMilliseconds: number;
  readonly actualStartHz: number;
  readonly actualStopHz: number;
  readonly actualRbwHz: number;
  readonly frequencyHz: readonly number[];
  readonly powerDbm: readonly number[];
  readonly source: 'signal-lab-validation-fixture';
  readonly complete: true;
}

export interface AutoTargetSelectionRankEvidence {
  readonly sourceSweepId: string;
  readonly supportStartHz: number;
  readonly supportStopHz: number;
  readonly supportCellCount: number;
  readonly robustFloorDbm: number;
  readonly actualRbwHz: number;
  /** Exact unrounded linear-power integral used for ordering. */
  readonly integratedExcessPowerMw: number;
}

export interface AutoTargetSelectionComponentTruth {
  readonly rawTargetId: string;
  readonly label: string;
  readonly morphology: AutoTargetSelectionFixtureMorphology;
  readonly associationMode: 'frequency-local';
  readonly representativeKey: string;
  readonly startHz: number;
  readonly stopHz: number;
  readonly peakHz: number;
  readonly peakDbm: number;
  readonly noiseFloorDbm: number;
  readonly rankEvidence: AutoTargetSelectionRankEvidence;
  readonly runtimeAdmission: AutoTargetSelectionRuntimeAdmission;
}

export interface SynthesizedAutoTargetSelectionValidationCase {
  readonly corpusVersion: typeof AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION;
  readonly rankingModelId: typeof AUTO_TARGET_SELECTION_RANKING_MODEL_ID;
  readonly selectionPolicyId: typeof AUTO_TARGET_SELECTION_POLICY_ID;
  readonly caseId: AutoTargetSelectionValidationCaseId;
  readonly seed: number;
  readonly lookIndex: number;
  readonly source: SourceBasis;
  readonly disclosure: string;
  readonly definitionSha256: string;
  readonly materializationSha256: string;
  readonly sweep: AutoTargetSelectionValidationSweep;
  readonly components: readonly AutoTargetSelectionComponentTruth[];
  readonly expectedComparison: AutoTargetSelectionExpectedComparison;
  readonly expectedRankedRawTargetIds: readonly string[];
  readonly expectedWinnerRawTargetId: string;
  readonly expectedAutomaticOutcome: AutoTargetSelectionExpectedOutcome;
}

const VALIDATION_GEOMETRY: AutoTargetSelectionValidationGeometry = deepFreeze({
  firstCenterHz: 1_500_000_000,
  frequencyStepHz: 100_000,
  pointCount: 65,
  actualRbwHz: 100_000,
  noiseFloorDbm: -110,
  sweepTimeSeconds: 0.05,
  seed: 407,
  lookIndex: 0,
});

const ADMITTED: AutoTargetSelectionRuntimeAdmission = deepFreeze({
  status: 'admitted',
  spectrumHistoryCount: 8,
});

const RANK_ZERO_UNAVAILABLE: AutoTargetSelectionRuntimeAdmission = deepFreeze({
  status: 'unavailable',
  reason: 'insufficient-spectrum-history',
  spectrumHistoryCount: 7,
});

interface ValidationCaseDefinition extends Omit<AutoTargetSelectionValidationCase,
  'definitionSha256' | 'materializationSha256'> {}

function component(
  rawTargetId: string,
  label: string,
  morphology: AutoTargetSelectionFixtureMorphology,
  supportFirstBinIndex: number,
  excessPowerDbmByCell: readonly number[],
  runtimeAdmission: AutoTargetSelectionRuntimeAdmission = ADMITTED,
): AutoTargetSelectionComponentDefinition {
  const supportStartHz = frequencyAtIndex(VALIDATION_GEOMETRY, supportFirstBinIndex);
  const supportStopHz = frequencyAtIndex(
    VALIDATION_GEOMETRY,
    supportFirstBinIndex + excessPowerDbmByCell.length - 1,
  );
  const peakCellOffset = maximumValueIndex(excessPowerDbmByCell);
  const peakSignalDbm = excessPowerDbmByCell[peakCellOffset]!;
  return deepFreeze({
    rawTargetId,
    label,
    morphology,
    associationMode: 'frequency-local',
    supportFirstBinIndex,
    excessPowerDbmByCell: [...excessPowerDbmByCell],
    runtimeAdmission,
    expected: {
      supportStartHz,
      supportStopHz,
      supportCellCount: excessPowerDbmByCell.length,
      peakHz: frequencyAtIndex(VALIDATION_GEOMETRY, supportFirstBinIndex + peakCellOffset),
      peakDbm: mwToDbm(
        dbmToMw(VALIDATION_GEOMETRY.noiseFloorDbm) + dbmToMw(peakSignalDbm),
      ),
    },
  });
}

function validationCase(
  id: AutoTargetSelectionValidationCaseId,
  description: string,
  components: readonly AutoTargetSelectionComponentDefinition[],
  expectedComparison: AutoTargetSelectionExpectedComparison,
  expectedRankedRawTargetIds: readonly string[],
  expectedWinnerRawTargetId: string,
  expectedAutomaticOutcome: AutoTargetSelectionExpectedOutcome,
): ValidationCaseDefinition {
  return deepFreeze({
    corpusVersion: AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION,
    rankingModelId: AUTO_TARGET_SELECTION_RANKING_MODEL_ID,
    selectionPolicyId: AUTO_TARGET_SELECTION_POLICY_ID,
    id,
    description,
    source: AUTO_TARGET_SELECTION_VALIDATION_SOURCE,
    disclosure: AUTO_TARGET_SELECTION_VALIDATION_DISCLOSURE,
    geometry: { ...VALIDATION_GEOMETRY },
    components: [...components],
    expectedComparison,
    expectedRankedRawTargetIds: [...expectedRankedRawTargetIds],
    expectedWinnerRawTargetId,
    expectedAutomaticOutcome,
  });
}

const validationCaseDefinitions: readonly ValidationCaseDefinition[] = deepFreeze([
  validationCase(
    'cw-peak-wide-integrated-winner',
    'A one-cell CW-like component has the higher instantaneous peak, while a nine-cell OFDM-like component has the greater current-sweep integrated excess and wins Auto.',
    [
      component('higher-peak-cw', 'Higher-peak narrow CW-like component', 'cw-like', 14, [-20]),
      component('higher-integrated-wide', 'Higher-integrated wide OFDM-like component', 'ofdm-like', 36, Array(9).fill(-27.5)),
    ],
    {
      leftRawTargetId: 'higher-peak-cw',
      rightRawTargetId: 'higher-integrated-wide',
      peakPower: 'greater-than',
      integratedExcessPower: 'less-than',
    },
    ['higher-integrated-wide', 'higher-peak-cw'],
    'higher-integrated-wide',
    { status: 'selected', rawTargetId: 'higher-integrated-wide' },
  ),
  validationCase(
    'cw-integrated-winner',
    'The inverse integrated-power case: the one-cell CW-like component exceeds the weaker nine-cell OFDM-like component in current-sweep integrated excess and wins Auto.',
    [
      component('higher-integrated-cw', 'Higher-integrated narrow CW-like component', 'cw-like', 14, [-20]),
      component('weaker-wide', 'Weaker wide OFDM-like component', 'ofdm-like', 36, Array(9).fill(-34)),
    ],
    {
      leftRawTargetId: 'higher-integrated-cw',
      rightRawTargetId: 'weaker-wide',
      peakPower: 'greater-than',
      integratedExcessPower: 'greater-than',
    },
    ['higher-integrated-cw', 'weaker-wide'],
    'higher-integrated-cw',
    { status: 'selected', rawTargetId: 'higher-integrated-cw' },
  ),
  validationCase(
    'exact-integrated-tie',
    'Two separated four-cell components have exactly equal integrated excess; representative key and then raw target ID are the only deterministic tie keys.',
    [
      component('tie-alpha', 'Lexically first equal-power component', 'ofdm-like', 12, Array(4).fill(-30)),
      component('tie-zulu', 'Lexically second equal-power component', 'ofdm-like', 44, Array(4).fill(-30)),
    ],
    {
      leftRawTargetId: 'tie-alpha',
      rightRawTargetId: 'tie-zulu',
      peakPower: 'equal',
      integratedExcessPower: 'equal',
    },
    ['tie-alpha', 'tie-zulu'],
    'tie-alpha',
    { status: 'selected', rawTargetId: 'tie-alpha' },
  ),
  validationCase(
    'unready-rank-zero-no-fallback',
    'The stronger wide component is rank 0 but lacks its eighth spectrum look; the weaker CW-like rank 1 is ready, and Auto blocks without substituting rank 1.',
    [
      component('ready-weaker-cw', 'Runtime-ready weaker CW-like component', 'cw-like', 14, [-20], ADMITTED),
      component('unready-rank-zero-wide', 'Runtime-unavailable integrated-power winner', 'ofdm-like', 36, Array(9).fill(-27.5), RANK_ZERO_UNAVAILABLE),
    ],
    {
      leftRawTargetId: 'unready-rank-zero-wide',
      rightRawTargetId: 'ready-weaker-cw',
      peakPower: 'less-than',
      integratedExcessPower: 'greater-than',
    },
    ['unready-rank-zero-wide', 'ready-weaker-cw'],
    'unready-rank-zero-wide',
    {
      status: 'blocked',
      blockedRawTargetId: 'unready-rank-zero-wide',
      reason: 'rank-0-runtime-unavailable',
      lowerRankSubstitutionAllowed: false,
    },
  ),
]);

const CASE_HASHES: Readonly<Record<AutoTargetSelectionValidationCaseId, {
  readonly definitionSha256: string;
  readonly materializationSha256: string;
}>> = deepFreeze({
  'cw-peak-wide-integrated-winner': {
    definitionSha256: 'e1d22e66e6668e91c57867181ee4aee7e53bedcb7eea1c3e1ec8af3683c78e93',
    materializationSha256: '73001a5938d6044b2456851f7cdfc07f643ab8554d986db7e753540cbdb54037',
  },
  'cw-integrated-winner': {
    definitionSha256: '28e28b7f83ddb4c68c0575d0a4daa468657528674e7e122fd2697631d44fef92',
    materializationSha256: 'f9ad41e1ae30b10791a594ac3e1c14f52a58a141b512873b4095d1c3c18ca570',
  },
  'exact-integrated-tie': {
    definitionSha256: 'cacbd816fb348255b3364d5b033a10c29cd5045f209decee3420ff410889f138',
    materializationSha256: '6630e205f4163a3f8a405fcf041629c0afa28d27b8b9c75bfe078c20980a0766',
  },
  'unready-rank-zero-no-fallback': {
    definitionSha256: '6a3e53729167c5e0db4f17188056437609d374d6de694498a40bc111824cbe19',
    materializationSha256: 'bca9286fa6373cdd4955d5e4a927423b7b61c6a131ff02c5356a530685229a09',
  },
});

export const autoTargetSelectionValidationCases: readonly AutoTargetSelectionValidationCase[] =
  deepFreeze(validationCaseDefinitions.map((definition) => ({
    ...definition,
    ...CASE_HASHES[definition.id],
  })));

const validationCaseById = new Map(autoTargetSelectionValidationCases.map((fixture) => [fixture.id, fixture]));
if (validationCaseById.size !== AUTO_TARGET_SELECTION_VALIDATION_CASE_IDS.length
  || AUTO_TARGET_SELECTION_VALIDATION_CASE_IDS.some((id) => !validationCaseById.has(id))) {
  throw new Error('Auto target-selection validation corpus must contain exactly its four declared cases');
}

export function autoTargetSelectionValidationCase(id: string): AutoTargetSelectionValidationCase {
  const fixture = validationCaseById.get(id as AutoTargetSelectionValidationCaseId);
  if (!fixture) throw new Error(`Unknown Auto target-selection validation case: ${id}`);
  return structuredClone(fixture);
}

export function synthesizeAutoTargetSelectionValidationCase(
  id: string,
): SynthesizedAutoTargetSelectionValidationCase {
  const fixture = autoTargetSelectionValidationCase(id);
  const { geometry } = fixture;
  const actualStartHz = geometry.firstCenterHz - geometry.frequencyStepHz / 2;
  const actualStopHz = geometry.firstCenterHz
    + geometry.frequencyStepHz * (geometry.pointCount - 1)
    + geometry.frequencyStepHz / 2;
  const frequencyHz = Array.from(
    { length: geometry.pointCount },
    (_, index) => frequencyAtIndex(geometry, index),
  );
  const floorMw = dbmToMw(geometry.noiseFloorDbm);
  const powerMw = Array.from({ length: geometry.pointCount }, () => floorMw);
  for (const definition of fixture.components) {
    for (const [cellOffset, signalPowerDbm] of definition.excessPowerDbmByCell.entries()) {
      const binIndex = definition.supportFirstBinIndex + cellOffset;
      powerMw[binIndex] = powerMw[binIndex]! + dbmToMw(signalPowerDbm);
    }
  }
  const powerDbm = powerMw.map(mwToDbm);
  const sweep: AutoTargetSelectionValidationSweep = deepFreeze({
    kind: 'spectrum',
    id: `${AUTO_TARGET_SELECTION_VALIDATION_CORPUS_VERSION}:${fixture.id}:look-${geometry.lookIndex}`,
    sequence: AUTO_TARGET_SELECTION_VALIDATION_CASE_IDS.indexOf(fixture.id) + 1,
    capturedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, geometry.lookIndex)).toISOString(),
    elapsedMilliseconds: geometry.sweepTimeSeconds * 1_000,
    actualStartHz,
    actualStopHz,
    actualRbwHz: geometry.actualRbwHz,
    frequencyHz,
    powerDbm,
    source: 'signal-lab-validation-fixture',
    complete: true,
  });
  const robustFloorDbm = robustLowerTailFloorDbm(sweep.powerDbm);
  const components = fixture.components.map((definition): AutoTargetSelectionComponentTruth => {
    const supportLastBinIndex = definition.supportFirstBinIndex
      + definition.excessPowerDbmByCell.length - 1;
    const supportIndices = Array.from(
      { length: definition.excessPowerDbmByCell.length },
      (_, index) => definition.supportFirstBinIndex + index,
    );
    const peakIndex = supportIndices.reduce((best, candidate) =>
      sweep.powerDbm[candidate]! > sweep.powerDbm[best]! ? candidate : best);
    let integratedExcessPowerMw = 0;
    for (const index of supportIndices) {
      const excessMw = Math.max(0, dbmToMw(sweep.powerDbm[index]!) - dbmToMw(robustFloorDbm));
      integratedExcessPowerMw += excessMw * physicalCellWidthHz(sweep, index)
        / sweep.actualRbwHz;
    }
    return deepFreeze({
      rawTargetId: definition.rawTargetId,
      label: definition.label,
      morphology: definition.morphology,
      associationMode: definition.associationMode,
      representativeKey: `${definition.associationMode}:${definition.rawTargetId}`,
      startHz: sweep.frequencyHz[definition.supportFirstBinIndex]!,
      stopHz: sweep.frequencyHz[supportLastBinIndex]!,
      peakHz: sweep.frequencyHz[peakIndex]!,
      peakDbm: sweep.powerDbm[peakIndex]!,
      noiseFloorDbm: robustFloorDbm,
      rankEvidence: {
        sourceSweepId: sweep.id,
        supportStartHz: sweep.frequencyHz[definition.supportFirstBinIndex]!,
        supportStopHz: sweep.frequencyHz[supportLastBinIndex]!,
        supportCellCount: supportIndices.length,
        robustFloorDbm,
        actualRbwHz: sweep.actualRbwHz,
        integratedExcessPowerMw,
      },
      runtimeAdmission: definition.runtimeAdmission,
    });
  });
  return deepFreeze({
    corpusVersion: fixture.corpusVersion,
    rankingModelId: fixture.rankingModelId,
    selectionPolicyId: fixture.selectionPolicyId,
    caseId: fixture.id,
    seed: geometry.seed,
    lookIndex: geometry.lookIndex,
    source: fixture.source,
    disclosure: fixture.disclosure,
    definitionSha256: fixture.definitionSha256,
    materializationSha256: fixture.materializationSha256,
    sweep,
    components,
    expectedComparison: fixture.expectedComparison,
    expectedRankedRawTargetIds: fixture.expectedRankedRawTargetIds,
    expectedWinnerRawTargetId: fixture.expectedWinnerRawTargetId,
    expectedAutomaticOutcome: fixture.expectedAutomaticOutcome,
  });
}

/**
 * Resolve the fixture's declared Auto behavior after ranking. A runtime-
 * unavailable rank-0 target blocks; this function never searches rank 1+.
 */
export function resolveAutoTargetSelectionValidationCase(
  id: string,
): AutoTargetSelectionExpectedOutcome {
  const materialized = synthesizeAutoTargetSelectionValidationCase(id);
  const ranked = rankAutoTargetSelectionComponentTruth(materialized.components);
  const rankZero = ranked[0];
  if (!rankZero) throw new Error(`Auto target-selection validation case ${id} has no rank population`);
  if (rankZero.runtimeAdmission.status !== 'admitted') {
    return deepFreeze({
      status: 'blocked',
      blockedRawTargetId: rankZero.rawTargetId,
      reason: 'rank-0-runtime-unavailable',
      lowerRankSubstitutionAllowed: false,
    });
  }
  return deepFreeze({ status: 'selected', rawTargetId: rankZero.rawTargetId });
}

export function rankAutoTargetSelectionComponentTruth(
  components: readonly AutoTargetSelectionComponentTruth[],
): readonly AutoTargetSelectionComponentTruth[] {
  return [...components].sort((left, right) => {
    const leftPower = left.rankEvidence.integratedExcessPowerMw;
    const rightPower = right.rankEvidence.integratedExcessPowerMw;
    if (leftPower !== rightPower) return leftPower > rightPower ? -1 : 1;
    return left.representativeKey.localeCompare(right.representativeKey)
      || left.rawTargetId.localeCompare(right.rawTargetId);
  });
}

/** Ordered JSON input for each committed definition SHA-256. */
export function canonicalAutoTargetSelectionCaseDefinitionJson(
  fixture: AutoTargetSelectionValidationCase,
): string {
  return JSON.stringify({
    corpusVersion: fixture.corpusVersion,
    rankingModelId: fixture.rankingModelId,
    selectionPolicyId: fixture.selectionPolicyId,
    id: fixture.id,
    description: fixture.description,
    source: fixture.source,
    disclosure: fixture.disclosure,
    geometry: fixture.geometry,
    components: fixture.components,
    expectedComparison: fixture.expectedComparison,
    expectedRankedRawTargetIds: fixture.expectedRankedRawTargetIds,
    expectedWinnerRawTargetId: fixture.expectedWinnerRawTargetId,
    expectedAutomaticOutcome: fixture.expectedAutomaticOutcome,
  });
}

/** Ordered JSON input for each committed materialization SHA-256. */
export function canonicalAutoTargetSelectionMaterializationJson(
  materialized: SynthesizedAutoTargetSelectionValidationCase,
): string {
  return JSON.stringify({
    corpusVersion: materialized.corpusVersion,
    rankingModelId: materialized.rankingModelId,
    selectionPolicyId: materialized.selectionPolicyId,
    caseId: materialized.caseId,
    seed: materialized.seed,
    lookIndex: materialized.lookIndex,
    source: materialized.source,
    disclosure: materialized.disclosure,
    definitionSha256: materialized.definitionSha256,
    sweep: materialized.sweep,
    components: materialized.components,
    expectedComparison: materialized.expectedComparison,
    expectedRankedRawTargetIds: materialized.expectedRankedRawTargetIds,
    expectedWinnerRawTargetId: materialized.expectedWinnerRawTargetId,
    expectedAutomaticOutcome: materialized.expectedAutomaticOutcome,
  });
}

function frequencyAtIndex(
  geometry: AutoTargetSelectionValidationGeometry,
  index: number,
): number {
  if (!Number.isInteger(index) || index < 0 || index >= geometry.pointCount) {
    throw new Error(`Auto target-selection validation bin ${index} is outside the complete sweep`);
  }
  return geometry.firstCenterHz + index * geometry.frequencyStepHz;
}

function maximumValueIndex(values: readonly number[]): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Auto target-selection fixture components require finite non-empty cell power');
  }
  return values.reduce((best, _value, candidate) =>
    values[candidate]! > values[best]! ? candidate : best, 0);
}

function robustLowerTailFloorDbm(powerDbm: readonly number[]): number {
  const sorted = [...powerDbm].sort((left, right) => left - right);
  const cutoff = Math.max(1, Math.floor(sorted.length * 0.2));
  const lowerTail = sorted.slice(0, cutoff);
  const middle = Math.floor(lowerTail.length / 2);
  return lowerTail.length % 2 === 0
    ? (lowerTail[middle - 1]! + lowerTail[middle]!) / 2
    : lowerTail[middle]!;
}

function physicalCellWidthHz(sweep: AutoTargetSelectionValidationSweep, index: number): number {
  const centerHz = sweep.frequencyHz[index]!;
  const leftHz = index === 0
    ? sweep.actualStartHz
    : (sweep.frequencyHz[index - 1]! + centerHz) / 2;
  const rightHz = index === sweep.frequencyHz.length - 1
    ? sweep.actualStopHz
    : (centerHz + sweep.frequencyHz[index + 1]!) / 2;
  return rightHz - leftHz;
}

function dbmToMw(valueDbm: number): number {
  return 10 ** (valueDbm / 10);
}

function mwToDbm(valueMw: number): number {
  return 10 * Math.log10(valueMw);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value) as T;
}
