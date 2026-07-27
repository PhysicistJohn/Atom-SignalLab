import type { AdmittedStandardsArtifactBundle } from './standards-artifact.js';
import {
  LTE_ETM1_1_REFERENCE_ARTIFACT_PROVIDER,
  LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
  createLteEtm11ReferenceGenerationRequest,
} from './lte-etm1-provider.js';
import { generateAndAdmitStandardsArtifact } from './standards-provider.js';

export const STANDARDS_RUNTIME_RECIPE_IDS = Object.freeze({
  lteEtm11Release19: 'lte-etm-1-1-10mhz-fdd-release19',
} as const);

export type StandardsRuntimeRecipeId =
  typeof STANDARDS_RUNTIME_RECIPE_IDS[keyof typeof STANDARDS_RUNTIME_RECIPE_IDS];

export interface StandardsRuntimeRecipeDescriptor {
  readonly runtimeRecipeId: StandardsRuntimeRecipeId;
  readonly family: 'lte';
  readonly presetId: 'lte-etm-1-1-10mhz-fdd';
  readonly presetRevision: '2.0.0';
  readonly artifactSha256: string;
  readonly qualification: 'reference-generated';
  readonly complianceClaim: 'not-claimed';
  readonly independentDigitalEvidence: 'available-separately';
  readonly rfEvidence: 'not-provided';
}

const LTE_ETM1_1_RUNTIME_DESCRIPTOR: StandardsRuntimeRecipeDescriptor = Object.freeze({
  runtimeRecipeId: STANDARDS_RUNTIME_RECIPE_IDS.lteEtm11Release19,
  family: 'lte',
  presetId: 'lte-etm-1-1-10mhz-fdd',
  presetRevision: '2.0.0',
  artifactSha256: LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
  qualification: 'reference-generated',
  complianceClaim: 'not-claimed',
  independentDigitalEvidence: 'available-separately',
  rfEvidence: 'not-provided',
});

const STANDARDS_RUNTIME_RECIPES = Object.freeze([
  LTE_ETM1_1_RUNTIME_DESCRIPTOR,
] as const);

/**
 * Returns immutable metadata for the standards-exact runtime lanes.
 *
 * Existing SignalLab engineering-projection recipes are intentionally absent:
 * registering a recipe here means its payload is deterministic and pinned.
 */
export function listStandardsRuntimeRecipes(): readonly StandardsRuntimeRecipeDescriptor[] {
  return STANDARDS_RUNTIME_RECIPES;
}

/**
 * Generates and admits a byte-pinned digital-baseband artifact.
 *
 * This API cannot promote its own output. Independent digital qualification
 * requires the separate evidence/campaign gate, and RF qualification requires
 * calibrated external-laboratory evidence.
 */
export async function generateStandardsRuntimeArtifact(
  runtimeRecipeId: StandardsRuntimeRecipeId | string,
): Promise<AdmittedStandardsArtifactBundle> {
  if (runtimeRecipeId !== STANDARDS_RUNTIME_RECIPE_IDS.lteEtm11Release19) {
    throw new RangeError(`Unknown standards runtime recipe: ${runtimeRecipeId}`);
  }

  const request = createLteEtm11ReferenceGenerationRequest({
    expectedArtifactSha256: LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
  });
  return generateAndAdmitStandardsArtifact(
    LTE_ETM1_1_REFERENCE_ARTIFACT_PROVIDER,
    request,
  );
}
