import { describe, expect, it } from 'vitest';
import {
  LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
} from './lte-etm1-provider.js';
import {
  STANDARDS_RUNTIME_RECIPE_IDS,
  generateStandardsRuntimeArtifact,
  listStandardsRuntimeRecipes,
} from './standards-runtime.js';

describe('standards runtime registry', () => {
  it('lists only the byte-pinned LTE E-TM 1.1 reference lane', () => {
    expect(listStandardsRuntimeRecipes()).toEqual([
      {
        runtimeRecipeId: 'lte-etm-1-1-10mhz-fdd-release19',
        family: 'lte',
        presetId: 'lte-etm-1-1-10mhz-fdd',
        presetRevision: '2.0.0',
        artifactSha256: LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
        qualification: 'reference-generated',
        complianceClaim: 'not-claimed',
        independentDigitalEvidence: 'available-separately',
        rfEvidence: 'not-provided',
      },
    ]);
    expect(Object.isFrozen(listStandardsRuntimeRecipes())).toBe(true);
    expect(Object.isFrozen(listStandardsRuntimeRecipes()[0])).toBe(true);
  });

  it('generates and admits exactly the content-addressed artifact', async () => {
    const artifact = await generateStandardsRuntimeArtifact(
      STANDARDS_RUNTIME_RECIPE_IDS.lteEtm11Release19,
    );

    expect(artifact.manifest).toMatchObject({
      qualification: 'reference-generated',
      qualificationBoundary: {
        complianceClaim: 'not-claimed',
        externalValidationEvidence: 'not-provided',
      },
      preset: {
        presetId: 'lte-etm-1-1-10mhz-fdd',
        revision: '2.0.0',
        family: 'lte',
      },
      artifact: {
        contentSha256: LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
        complexSamplesPerChannel: 153_600,
        sampleRateHz: 15_360_000,
      },
      oracle: null,
    });

    let byteLength = 0;
    for await (const chunk of artifact.readChunks()) {
      byteLength += chunk.byteLength;
    }
    expect(byteLength).toBe(153_600 * 16);
  });

  it('fails closed for an unregistered recipe instead of falling back', async () => {
    await expect(generateStandardsRuntimeArtifact('lte-etm-1-1-latest'))
      .rejects.toThrow('Unknown standards runtime recipe');
  });
});
