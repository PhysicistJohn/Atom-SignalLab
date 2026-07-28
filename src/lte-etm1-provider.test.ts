import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EXACT_FLOAT_PINS_REPRODUCIBLE_HERE,
  quantizedComplexSeries,
} from './architecture-identity.js';
import {
  canonicalJsonString,
  standardsArtifactConfigurationSha256,
  standardsArtifactManifestSha256,
  type StandardsArtifactBundleCandidate,
} from './standards-artifact.js';
import {
  StandardsProviderRuntimeError,
  createStandardsGenerationRequest,
  generateAndAdmitStandardsArtifact,
} from './standards-provider.js';
import {
  LTE_ETM1_1_REFERENCE_ARTIFACT_PROVIDER,
  LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
  LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION,
  LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION_SHA256,
  LTE_ETM1_1_REFERENCE_PROVIDER_IDENTITY,
  LteEtm11ReferenceArtifactProvider,
  createLteEtm11ReferenceGenerationRequest,
} from './lte-etm1-provider.js';
import { generateLteEtm11ReferenceFrame } from './lte-etm1-reference.js';
import { LTE_ETM_1_1_10_MHZ_FDD_PRESET } from './standards-waveform.js';

const EXPECTED_BYTE_LENGTH = 153_600 * 2 * 8;

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
const LTE_ETM1_1_REFERENCE_QUANTIZED_SHA256 =
  'e838d0c000828124d458b9e5ef502e19e278cecd29b0c31ac6f2de893775fa83';

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Asserted on every architecture, including the hosts where the exact byte pin
 * cannot be reproduced: the generator that feeds the provider still renders the
 * same waveform.
 */
function expectQuantizedReferenceIdentity(): void {
  const timeDomain = generateLteEtm11ReferenceFrame().timeDomain;
  expect(sha256Text(quantizedComplexSeries(timeDomain.real, timeDomain.imaginary)))
    .toBe(LTE_ETM1_1_REFERENCE_QUANTIZED_SHA256);
}

/**
 * Off the authoring architecture the fixed provider fails closed rather than
 * emitting bytes it cannot vouch for. The rejection is raised where the payload
 * digest is checked, and its message names the provider recipe revision that
 * would be required, either directly or as the cause of the runtime wrapper.
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

async function candidateBytes(candidate: StandardsArtifactBundleCandidate): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of candidate.chunks) {
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function mutatedRequest(
  mutate: (input: ReturnType<typeof createLteEtm11ReferenceGenerationRequest>) => void,
) {
  const input = structuredClone(createLteEtm11ReferenceGenerationRequest());
  mutate(input);
  return input;
}

function mutateConfigurationValue(
  request: ReturnType<typeof createLteEtm11ReferenceGenerationRequest>,
  key: string,
  value: unknown,
): void {
  const configuration = request.configuration as {
    parameters: Array<{ key: string; value: { kind: string; value: unknown } }>;
  };
  const parameter = configuration.parameters.find((candidate) => candidate.key === key);
  if (parameter === undefined) throw new Error(`Fixture configuration has no ${key}`);
  parameter.value.value = value;
  request.configurationSha256 = standardsArtifactConfigurationSha256(request.configuration);
}

describe('fixed LTE E-TM1.1 standards artifact provider', () => {
  it('binds the entire revision-2.0.0 preset configuration and fixed recipe identity', () => {
    const request = createLteEtm11ReferenceGenerationRequest();
    expect(request).toEqual({
      presetId: 'lte-etm-1-1-10mhz-fdd',
      presetRevision: '2.0.0',
      family: 'lte',
      recipeId: 'lte-etm-1-1-10mhz-fdd-reference-frame',
      recipeRevision: '1.0.1',
      configuration: LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION,
      configurationSha256: LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION_SHA256,
      requestedQualification: 'reference-generated',
    });
    expect(canonicalJsonString(request.configuration)).toBe(
      canonicalJsonString(LTE_ETM_1_1_10_MHZ_FDD_PRESET.configuration),
    );
    expect(standardsArtifactConfigurationSha256(request.configuration)).toBe(
      request.configurationSha256,
    );
    expect(request.configurationSha256).toBe(
      '60e4b8ab807a79952863f556f8580e723dbf93bf951203822908e02e7719bb18',
    );
    expect(LTE_ETM1_1_REFERENCE_PROVIDER_IDENTITY).toEqual({
      providerId: 'signallab',
      providerName: 'SignalLab',
      productName: 'SignalLab LTE reference waveform provider',
      productVersion: '0.1.0',
      implementationId: 'signallab.lte-etm1-reference',
    });
  });

  it('fails closed for every mutated binding and for independent qualification', async () => {
    const provider = new LteEtm11ReferenceArtifactProvider();
    const mutations = [
      mutatedRequest((request) => { request.presetId = 'different-preset'; }),
      mutatedRequest((request) => { request.presetRevision = '2.0.1'; }),
      mutatedRequest((request) => { request.family = 'nr'; }),
      mutatedRequest((request) => { request.recipeId = 'different-recipe'; }),
      mutatedRequest((request) => { request.recipeRevision = '1.0.0'; }),
      mutatedRequest((request) => { request.requestedQualification = 'independently-verified'; }),
      mutatedRequest((request) => {
        mutateConfigurationValue(request, 'cell.physicalCellId', 2);
      }),
      mutatedRequest((request) => {
        mutateConfigurationValue(request, 'transmission.layers', 2);
      }),
      mutatedRequest((request) => {
        mutateConfigurationValue(request, 'transmission.precoding', true);
      }),
    ];
    for (const request of mutations) {
      await expect(provider.supports(request)).resolves.toBe(false);
      await expect(provider.generate(request)).rejects.toThrow(/unsupported/i);
    }
  });

  it('encodes one port as deterministic little-endian interleaved Float64 IQ', async () => {
    const provider = new LteEtm11ReferenceArtifactProvider();
    const request = createLteEtm11ReferenceGenerationRequest();
    expectQuantizedReferenceIdentity();
    if (!EXACT_FLOAT_PINS_REPRODUCIBLE_HERE) {
      await expectFailsClosedOffAuthoringArchitecture(provider.generate(request));
      return;
    }
    const first = await provider.generate(request);
    const second = await provider.generate(request);
    const firstBytes = await candidateBytes(first);
    const secondBytes = await candidateBytes(second);
    const manifest = first.manifest as Awaited<
      ReturnType<typeof generateAndAdmitStandardsArtifact>
    >['manifest'];

    expect(firstBytes).toHaveLength(EXPECTED_BYTE_LENGTH);
    expect(secondBytes).toEqual(firstBytes);
    expect(first.manifestSha256).toBe(standardsArtifactManifestSha256(first.manifest));
    expect(second.manifestSha256).toBe(first.manifestSha256);
    expect(manifest.artifact.contentSha256).toBe(
      createHash('sha256').update(firstBytes).digest('hex'),
    );
    expect(manifest.artifact.contentSha256).toBe(
      LTE_ETM1_1_REFERENCE_CF64LE_SHA256,
    );
    expect(manifest.artifact).toMatchObject({
      byteLength: EXPECTED_BYTE_LENGTH,
      channelCount: 1,
      channels: [
        {
          channelIndex: 0,
          role: 'antenna-port',
          antennaPort: 0,
        },
      ],
      complexSamplesPerChannel: 153_600,
      sampleRateHz: 15_360_000,
      centerFrequencyHz: 0,
      format: {
        container: 'raw-binary',
        componentType: 'float64',
        layout: 'interleaved-iq',
        channelLayout: 'channel-major',
        byteOrder: 'little-endian',
        amplitudeUnit: 'arbitrary-units',
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
        samplesPerFrame: 153_600,
        frameCount: 1,
      },
    });

    const reference = generateLteEtm11ReferenceFrame().timeDomain;
    const view = new DataView(firstBytes.buffer, firstBytes.byteOffset, firstBytes.byteLength);
    for (const sample of [0, 1, 1_023, 76_800, 153_599]) {
      const offset = sample * 16;
      expect(view.getFloat64(offset, true)).toBe(reference.real[sample]);
      expect(view.getFloat64(offset + 8, true)).toBe(reference.imaginary[sample]);
      const littleEndianBytes = firstBytes.slice(offset, offset + 16);
      const independentlyEncoded = new Uint8Array(16);
      const expectedView = new DataView(independentlyEncoded.buffer);
      expectedView.setFloat64(0, reference.real[sample]!, true);
      expectedView.setFloat64(8, reference.imaginary[sample]!, true);
      expect(littleEndianBytes).toEqual(independentlyEncoded);
    }
  });

  it('admits and replays the exact content-addressed artifact with no transformations', async () => {
    const request = createLteEtm11ReferenceGenerationRequest();
    expectQuantizedReferenceIdentity();
    if (!EXACT_FLOAT_PINS_REPRODUCIBLE_HERE) {
      await expectFailsClosedOffAuthoringArchitecture(generateAndAdmitStandardsArtifact(
        LTE_ETM1_1_REFERENCE_ARTIFACT_PROVIDER,
        request,
      ));
      return;
    }
    const admitted = await generateAndAdmitStandardsArtifact(
      LTE_ETM1_1_REFERENCE_ARTIFACT_PROVIDER,
      request,
    );
    expect(admitted.qualification).toBe('reference-generated');
    expect(admitted.verifiedByteLength).toBe(EXPECTED_BYTE_LENGTH);
    expect(admitted.manifest).toMatchObject({
      preset: {
        presetId: request.presetId,
        revision: request.presetRevision,
        family: 'lte',
      },
      qualification: 'reference-generated',
      qualificationBoundary: {
        complianceClaim: 'not-claimed',
        externalValidationEvidence: 'not-provided',
      },
      recipe: {
        tool: LTE_ETM1_1_REFERENCE_PROVIDER_IDENTITY,
        recipeId: request.recipeId,
        recipeRevision: request.recipeRevision,
        deterministic: true,
        configurationSha256: request.configurationSha256,
      },
      artifact: {
        generatorConfigurationSha256: request.configurationSha256,
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
    });
    expect(admitted.manifest.qualificationBoundary.statement).toMatch(/not claimed/i);
    expect(admitted.manifest.qualificationBoundary.statement).toMatch(/3GPP compliance/i);
    expect(admitted.manifestSha256).toBe(
      standardsArtifactManifestSha256(admitted.manifest),
    );

    const replayA = admitted.readAllBytes();
    const replayB = admitted.readAllBytes();
    expect(replayB).toEqual(replayA);
    replayA[0] = replayA[0]! ^ 0xff;
    expect(admitted.readAllBytes()).toEqual(replayB);
  });

  it('accepts only a correct optional artifact pin and rejects all other pins', async () => {
    const provider = new LteEtm11ReferenceArtifactProvider();
    expectQuantizedReferenceIdentity();
    if (!EXACT_FLOAT_PINS_REPRODUCIBLE_HERE) {
      // Without reproducible bytes there is no content digest to pin against,
      // so the pinned-request path is unreachable and the provider fails closed
      // before any pin is ever compared.
      await expectFailsClosedOffAuthoringArchitecture(
        provider.generate(createLteEtm11ReferenceGenerationRequest()),
      );
      return;
    }
    const candidate = await provider.generate(createLteEtm11ReferenceGenerationRequest());
    const contentSha256 = (
      candidate.manifest as { artifact: { contentSha256: string } }
    ).artifact.contentSha256;
    const pinned = createLteEtm11ReferenceGenerationRequest({
      expectedArtifactSha256: contentSha256,
    });
    await expect(provider.supports(pinned)).resolves.toBe(true);
    await expect(generateAndAdmitStandardsArtifact(provider, pinned)).resolves.toMatchObject({
      manifest: {
        artifact: {
          contentSha256,
        },
      },
    });

    const wrongPin = createLteEtm11ReferenceGenerationRequest({
      expectedArtifactSha256: contentSha256 === '0'.repeat(64)
        ? '1'.repeat(64)
        : '0'.repeat(64),
    });
    await expect(provider.supports(wrongPin)).resolves.toBe(false);
    await expect(generateAndAdmitStandardsArtifact(provider, wrongPin)).rejects.toMatchObject({
      name: 'StandardsProviderRuntimeError',
      code: 'unsupported-request',
    });
  });

  it('rejects a caller-created broader qualification request at runtime', async () => {
    const request = createStandardsGenerationRequest({
      presetId: 'lte-etm-1-1-10mhz-fdd',
      presetRevision: '2.0.0',
      family: 'lte',
      recipeId: 'lte-etm-1-1-10mhz-fdd-reference-frame',
      recipeRevision: '1.0.1',
      configuration: structuredClone(LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION),
      requestedQualification: 'independently-verified',
    });
    await expect(generateAndAdmitStandardsArtifact(
      LTE_ETM1_1_REFERENCE_ARTIFACT_PROVIDER,
      request,
      {
        oracle: {
          identity: {
            providerId: 'outside-oracle',
            providerName: 'Outside Oracle',
            productName: 'Independent implementation',
            productVersion: '1.0.0',
            implementationId: 'outside-oracle.lte',
          },
          evaluate: async () => ({
            oracleId: 'outside-oracle',
            oracleRevision: '1.0.0',
            evaluatedAt: '2026-07-27T00:00:00.000Z',
            result: 'pass',
            reportSha256: 'a'.repeat(64),
            reportLocation: 'validation/outside-oracle.json',
          }),
        },
      },
    )).rejects.toSatisfy((error: unknown) => (
      error instanceof StandardsProviderRuntimeError
      && error.code === 'unsupported-request'
    ));
  });
});
