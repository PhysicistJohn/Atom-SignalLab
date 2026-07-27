import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  StandardsArtifactAdmissionError,
  standardsArtifactManifestSha256,
  type StandardsArtifactBundleCandidate,
  type StandardsArtifactManifest,
  type StandardsToolIdentity,
} from './standards-artifact.js';
import {
  StandardsProviderRuntimeError,
  createStandardsGenerationRequest,
  generateAndAdmitStandardsArtifact,
  standardsGenerationRequestSchema,
  type StandardsArtifactOracle,
  type StandardsArtifactProvider,
  type StandardsGenerationRequest,
} from './standards-provider.js';

const PAYLOAD = Uint8Array.from({ length: 32 }, (_, index) => (index * 13 + 5) & 0xff);
const PAYLOAD_SHA256 = createHash('sha256').update(PAYLOAD).digest('hex');

const PROVIDER_IDENTITY: StandardsToolIdentity = {
  providerId: 'generator-vendor',
  providerName: 'Generator Vendor',
  productName: 'Provider-neutral waveform engine',
  productVersion: '1.2.3',
  implementationId: 'generator-vendor.lte-engine',
};

const ORACLE_IDENTITY: StandardsToolIdentity = {
  providerId: 'oracle-lab',
  providerName: 'Oracle Lab',
  productName: 'Independent waveform decoder',
  productVersion: '9.1.0',
  implementationId: 'oracle-lab.lte-decoder',
};

const CONFIGURATION = {
  channel: {
    bandwidthHz: 10_000_000,
    duplex: 'FDD',
  },
  testModel: 'E-TM 1.1',
};

function request(
  qualification: 'reference-generated' | 'independently-verified' = 'reference-generated',
) {
  return createStandardsGenerationRequest({
    presetId: 'lte-etm-1-1-10mhz-fdd',
    presetRevision: '1.0.0',
    family: 'lte',
    recipeId: 'lte-etm-1-1',
    recipeRevision: '4.0.0',
    configuration: CONFIGURATION,
    requestedQualification: qualification,
  });
}

function manifestFor(
  generationRequest: StandardsGenerationRequest,
  providerIdentity: StandardsToolIdentity = PROVIDER_IDENTITY,
): StandardsArtifactManifest {
  return {
    schemaVersion: 1,
    preset: {
      presetId: generationRequest.presetId,
      revision: generationRequest.presetRevision,
      family: generationRequest.family,
    },
    qualification: 'reference-generated',
    qualificationBoundary: {
      complianceClaim: 'not-claimed',
      externalValidationEvidence: 'not-provided',
      statement: 'This provider artifact is reference generated; broad standards or RF compliance is not claimed.',
    },
    recipe: {
      tool: providerIdentity,
      recipeId: generationRequest.recipeId,
      recipeRevision: generationRequest.recipeRevision,
      deterministic: true,
      configuration: generationRequest.configuration,
      configurationSha256: generationRequest.configurationSha256,
    },
    artifact: {
      artifactId: 'lte-etm-1-1-vector',
      kind: 'complex-iq',
      location: 'waveforms/lte-etm-1-1.cf32',
      mediaType: 'application/vnd.signallab.complex-iq',
      contentSha256: PAYLOAD_SHA256,
      generatorConfigurationSha256: generationRequest.configurationSha256,
      byteLength: PAYLOAD.byteLength,
      channelCount: 1,
      channels: [
        {
          channelIndex: 0,
          role: 'antenna-port',
          antennaPort: 0,
        },
      ],
      complexSamplesPerChannel: 4,
      sampleRateHz: 400,
      centerFrequencyHz: 0,
      format: {
        container: 'raw-binary',
        componentType: 'float32',
        layout: 'interleaved-iq',
        channelLayout: 'channel-major',
        byteOrder: 'little-endian',
        amplitudeUnit: 'normalized-full-scale',
      },
      timing: {
        origin: {
          basis: 'relative-radio-frame',
          frameNumber: 0,
          sampleOffset: 0,
        },
        frameDuration: {
          unit: 'seconds',
          numerator: 1,
          denominator: 100,
        },
        samplesPerFrame: 4,
        frameCount: 1,
      },
      processing: {
        scope: 'post-provider-output',
        filtering: 'none',
        normalization: 'none',
        resampling: 'none',
        scaling: 'none',
        sampleValueTransform: 'none',
      },
    },
    oracle: null,
  };
}

function candidateFor(
  generationRequest: StandardsGenerationRequest,
  mutate?: (manifest: StandardsArtifactManifest) => void,
  payload: Uint8Array = PAYLOAD,
): StandardsArtifactBundleCandidate {
  const manifest = structuredClone(manifestFor(generationRequest));
  mutate?.(manifest);
  return {
    manifest,
    manifestSha256: standardsArtifactManifestSha256(manifest),
    chunks: [
      payload.subarray(0, 3),
      payload.subarray(3, 19),
      payload.subarray(19),
    ],
  };
}

function providerFor(
  candidateFactory: (generationRequest: StandardsGenerationRequest) => StandardsArtifactBundleCandidate
  = (generationRequest) => candidateFor(generationRequest),
): StandardsArtifactProvider & {
  supports: ReturnType<typeof vi.fn>;
  generate: ReturnType<typeof vi.fn>;
} {
  return {
    identity: PROVIDER_IDENTITY,
    supports: vi.fn(async () => true),
    generate: vi.fn(async (generationRequest: StandardsGenerationRequest) => candidateFactory(generationRequest)),
  };
}

function passingOracle(
  identity: StandardsToolIdentity = ORACLE_IDENTITY,
): StandardsArtifactOracle & { evaluate: ReturnType<typeof vi.fn> } {
  return {
    identity,
    evaluate: vi.fn(async (input) => {
      const hash = createHash('sha256');
      for await (const chunk of input.readChunks({ chunkBytes: 5 })) hash.update(chunk);
      if (hash.digest('hex') !== input.manifest.artifact.contentSha256) {
        throw new Error('oracle observed corrupt bytes');
      }
      return {
        oracleId: 'independent-lte-oracle',
        oracleRevision: '2.0.0',
        evaluatedAt: '2026-07-26T12:00:00.000Z',
        result: 'pass' as const,
        reportSha256: 'd'.repeat(64),
        reportLocation: 'validation/independent-lte-report.json',
      };
    }),
  };
}

describe('standards provider runtime', () => {
  it('generates and atomically admits an exactly bound reference artifact', async () => {
    const provider = providerFor();
    const generated = await generateAndAdmitStandardsArtifact(provider, request());

    expect(generated.qualification).toBe('reference-generated');
    expect(generated.readAllBytes()).toEqual(PAYLOAD);
    expect(generated.manifest.recipe.tool).toEqual(PROVIDER_IDENTITY);
    expect(provider.supports).toHaveBeenCalledOnce();
    expect(provider.generate).toHaveBeenCalledOnce();
  });

  it('fails closed before generation when exact support is unavailable', async () => {
    const provider = providerFor();
    provider.supports.mockResolvedValue(false);

    await expect(generateAndAdmitStandardsArtifact(provider, request()))
      .rejects.toMatchObject({ code: 'unsupported-request' });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('fails closed when a provider support check throws', async () => {
    const provider = providerFor();
    provider.supports.mockRejectedValue(new Error('backend unavailable'));

    await expect(generateAndAdmitStandardsArtifact(provider, request()))
      .rejects.toMatchObject({ code: 'unsupported-request' });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('rejects invalid request configuration hashes before calling a provider', async () => {
    const provider = providerFor();
    const invalid = {
      ...request(),
      configurationSha256: '0'.repeat(64),
    };

    expect(standardsGenerationRequestSchema.safeParse(invalid).success).toBe(false);
    await expect(generateAndAdmitStandardsArtifact(provider, invalid))
      .rejects.toMatchObject({ code: 'invalid-request' });
    expect(provider.supports).not.toHaveBeenCalled();
  });

  it('rejects provider generation failures without returning partial state', async () => {
    const provider = providerFor();
    provider.generate.mockRejectedValue(new Error('generator crashed'));

    await expect(generateAndAdmitStandardsArtifact(provider, request()))
      .rejects.toMatchObject({ code: 'generation-failed' });
  });

  it.each([
    [
      'preset identity',
      (manifest: StandardsArtifactManifest) => {
        manifest.preset.presetId = 'different-preset';
      },
    ],
    [
      'recipe revision',
      (manifest: StandardsArtifactManifest) => {
        manifest.recipe.recipeRevision = '99.0.0';
      },
    ],
    [
      'provider identity',
      (manifest: StandardsArtifactManifest) => {
        manifest.recipe.tool.providerId = 'impostor';
      },
    ],
  ])('rejects a valid manifest with wrong %s binding', async (_name, mutate) => {
    const provider = providerFor((generationRequest) => candidateFor(generationRequest, mutate));

    await expect(generateAndAdmitStandardsArtifact(provider, request()))
      .rejects.toMatchObject({ code: 'provider-binding-mismatch' });
  });

  it('rejects a different valid recipe configuration instead of trusting provider labels', async () => {
    const provider = providerFor((generationRequest) => {
      const differentRequest = createStandardsGenerationRequest({
        ...generationRequest,
        configuration: {
          channel: {
            bandwidthHz: 5_000_000,
            duplex: 'FDD',
          },
          testModel: 'E-TM 1.1',
        },
      });
      return candidateFor(differentRequest);
    });

    await expect(generateAndAdmitStandardsArtifact(provider, request()))
      .rejects.toMatchObject({ code: 'provider-binding-mismatch' });
  });

  it('enforces a caller-pinned artifact hash', async () => {
    const generationRequest = {
      ...request(),
      expectedArtifactSha256: '0'.repeat(64),
    };
    const provider = providerFor();

    await expect(generateAndAdmitStandardsArtifact(provider, generationRequest))
      .rejects.toMatchObject({ code: 'provider-binding-mismatch' });
  });

  it('propagates manifest and payload integrity failures from atomic admission', async () => {
    const wrongManifestHash = providerFor((generationRequest) => ({
      ...candidateFor(generationRequest),
      manifestSha256: '0'.repeat(64),
    }));
    const corruptPayload = PAYLOAD.slice();
    corruptPayload[0] = corruptPayload[0]! ^ 0xff;
    const corrupted = providerFor((generationRequest) => candidateFor(
      generationRequest,
      undefined,
      corruptPayload,
    ));

    await expect(generateAndAdmitStandardsArtifact(wrongManifestHash, request()))
      .rejects.toBeInstanceOf(StandardsArtifactAdmissionError);
    await expect(generateAndAdmitStandardsArtifact(corrupted, request()))
      .rejects.toMatchObject({ code: 'payload-hash-mismatch' });
  });

  it('requires an oracle up front and never downgrades an independent request', async () => {
    const provider = providerFor();

    await expect(generateAndAdmitStandardsArtifact(
      provider,
      request('independently-verified'),
    )).rejects.toMatchObject({ code: 'oracle-required' });
    expect(provider.supports).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('promotes only after an independent oracle reads the admitted exact bytes', async () => {
    const provider = providerFor();
    const oracle = passingOracle();
    const generated = await generateAndAdmitStandardsArtifact(
      provider,
      request('independently-verified'),
      { oracle },
    );

    expect(generated.qualification).toBe('independently-verified');
    expect(generated.readAllBytes()).toEqual(PAYLOAD);
    expect(generated.manifest.oracle).toMatchObject({
      tool: ORACLE_IDENTITY,
      result: 'pass',
      artifactSha256: PAYLOAD_SHA256,
      generatorConfigurationSha256: request().configurationSha256,
    });
    expect(generated.manifest.qualificationBoundary).toMatchObject({
      complianceClaim: 'not-claimed',
      externalValidationEvidence: 'attached',
    });
    expect(oracle.evaluate).toHaveBeenCalledOnce();
  });

  it('rejects self-validation before generation', async () => {
    const provider = providerFor();
    const oracle = passingOracle({
      ...ORACLE_IDENTITY,
      providerId: PROVIDER_IDENTITY.providerId,
    });

    await expect(generateAndAdmitStandardsArtifact(
      provider,
      request('independently-verified'),
      { oracle },
    )).rejects.toMatchObject({ code: 'invalid-oracle' });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it.each(['fail', 'inconclusive'] as const)(
    'rejects oracle result %s without returning the lower qualification',
    async (result) => {
      const provider = providerFor();
      const oracle = passingOracle();
      oracle.evaluate.mockResolvedValue({
        oracleId: 'independent-lte-oracle',
        oracleRevision: '2.0.0',
        evaluatedAt: '2026-07-26T12:00:00.000Z',
        result,
        reportSha256: 'd'.repeat(64),
        reportLocation: 'validation/independent-lte-report.json',
      });

      await expect(generateAndAdmitStandardsArtifact(
        provider,
        request('independently-verified'),
        { oracle },
      )).rejects.toMatchObject({ code: 'oracle-result-not-pass' });
    },
  );

  it('rejects malformed or throwing oracle implementations', async () => {
    const malformed = passingOracle();
    malformed.evaluate.mockResolvedValue({
      result: 'pass',
    });
    const throwing = passingOracle();
    throwing.evaluate.mockRejectedValue(new Error('decoder unavailable'));

    await expect(generateAndAdmitStandardsArtifact(
      providerFor(),
      request('independently-verified'),
      { oracle: malformed },
    )).rejects.toMatchObject({ code: 'invalid-oracle' });
    await expect(generateAndAdmitStandardsArtifact(
      providerFor(),
      request('independently-verified'),
      { oracle: throwing },
    )).rejects.toMatchObject({ code: 'invalid-oracle' });
  });

  it('retains the no-compliance boundary at every supported qualification', async () => {
    const reference = await generateAndAdmitStandardsArtifact(providerFor(), request());
    const independent = await generateAndAdmitStandardsArtifact(
      providerFor(),
      request('independently-verified'),
      { oracle: passingOracle() },
    );

    expect(reference.manifest.qualificationBoundary.complianceClaim).toBe('not-claimed');
    expect(independent.manifest.qualificationBoundary.complianceClaim).toBe('not-claimed');
    expect(() => {
      (independent.manifest.qualificationBoundary as { complianceClaim: string }).complianceClaim = 'claimed';
    }).toThrow();
  });
});

describe('provider runtime error taxonomy', () => {
  it('exposes stable error classes for integration without parsing messages', () => {
    const error = new StandardsProviderRuntimeError('invalid-provider', 'invalid');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StandardsProviderRuntimeError');
    expect(error.code).toBe('invalid-provider');
  });
});
