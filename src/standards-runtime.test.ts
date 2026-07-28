import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EXACT_FLOAT_PINS_REPRODUCIBLE_HERE,
  quantizedComplexSeries,
} from './architecture-identity.js';
import {
  LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
} from './lte-etm1-provider.js';
import { generateLteEtm11ReferenceFrame } from './lte-etm1-reference.js';
import {
  STANDARDS_RUNTIME_RECIPE_IDS,
  generateStandardsRuntimeArtifact,
  listStandardsRuntimeRecipes,
} from './standards-runtime.js';

/**
 * Architecture-tolerant companion to LTE_ETM1_1_REFERENCE_CF64LE_SHA256.
 *
 * The exact cf64le digest pins the last mantissa bit of libm transcendentals,
 * so it only reproduces on the architecture that authored it. This digest
 * hashes the same time-domain series rounded to nine decimals, which is far
 * coarser than the cross-architecture last-ulp difference and far finer than
 * any real change to the waveform, so it holds on every host. Measured on
 * darwin-arm64.
 */
const LTE_ETM1_1_RUNTIME_QUANTIZED_SHA256 =
  'e838d0c000828124d458b9e5ef502e19e278cecd29b0c31ac6f2de893775fa83';

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Off the authoring architecture the fixed provider fails closed rather than
 * emitting bytes it cannot vouch for, so the runtime lane must reject. The
 * rejection is raised where the payload digest is checked, and its message
 * names the provider recipe revision that would be required.
 */
async function expectFailsClosedOffAuthoringArchitecture(
  work: Promise<unknown>,
): Promise<void> {
  await expect(work).rejects.toSatisfy((error: unknown) => (
    error instanceof Error
    && /provider recipe revision/.test(
      error.cause instanceof Error ? error.cause.message : error.message,
    )
  ));
}

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
    // Asserted on every architecture: the runtime lane renders the same
    // waveform even where the exact float64 byte pin is not reproducible.
    const timeDomain = generateLteEtm11ReferenceFrame().timeDomain;
    expect(sha256Text(quantizedComplexSeries(timeDomain.real, timeDomain.imaginary)))
      .toBe(LTE_ETM1_1_RUNTIME_QUANTIZED_SHA256);

    if (!EXACT_FLOAT_PINS_REPRODUCIBLE_HERE) {
      await expectFailsClosedOffAuthoringArchitecture(generateStandardsRuntimeArtifact(
        STANDARDS_RUNTIME_RECIPE_IDS.lteEtm11Release19,
      ));
      return;
    }

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
