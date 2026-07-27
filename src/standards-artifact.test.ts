import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  IncrementalSha256,
  StandardsArtifactAdmissionError,
  admitStandardsArtifactBundle,
  canonicalJsonString,
  isSafeStandardsArtifactPath,
  parseStandardsArtifactManifest,
  sha256HexOfChunks,
  standardsArtifactConfigurationSha256,
  standardsArtifactManifestSha256,
  standardsArtifactManifestSchema,
  verifyStandardsArtifactChunks,
  type StandardsArtifactManifest,
} from './standards-artifact.js';

const PAYLOAD = Uint8Array.from({ length: 64 }, (_, index) => (index * 29 + 7) & 0xff);
const PAYLOAD_SHA256 = createHash('sha256').update(PAYLOAD).digest('hex');
const CONFIGURATION = {
  waveform: {
    testModel: 'E-TM 1.1',
    bandwidthHz: 10_000_000,
  },
  cell: {
    physicalCellId: 0,
  },
};
const CONFIGURATION_SHA256 = standardsArtifactConfigurationSha256(CONFIGURATION);

const GENERATOR = {
  providerId: 'reference-provider',
  providerName: 'Reference Provider',
  productName: 'Standards waveform generator',
  productVersion: '5.4.1',
  implementationId: 'reference-provider.lte',
};

const ORACLE = {
  providerId: 'independent-lab',
  providerName: 'Independent Lab',
  productName: 'Independent LTE decoder',
  productVersion: '2.0.0',
  implementationId: 'independent-lab.lte-decoder',
};

function referenceManifest(): StandardsArtifactManifest {
  return {
    schemaVersion: 1,
    preset: {
      presetId: 'lte-etm-1-1-10mhz-fdd',
      revision: '1.0.0',
      family: 'lte',
    },
    qualification: 'reference-generated',
    qualificationBoundary: {
      complianceClaim: 'not-claimed',
      externalValidationEvidence: 'not-provided',
      statement: 'Qualification is limited to the exact provider bytes; broad compliance is not claimed.',
    },
    recipe: {
      tool: GENERATOR,
      recipeId: 'lte-etm-1-1',
      recipeRevision: '3.0.0',
      deterministic: true,
      configuration: CONFIGURATION,
      configurationSha256: CONFIGURATION_SHA256,
    },
    artifact: {
      artifactId: 'lte-etm-1-1-vector',
      kind: 'complex-iq',
      location: 'waveforms/lte/etm-1-1.cf32',
      mediaType: 'application/vnd.signallab.complex-iq',
      contentSha256: PAYLOAD_SHA256,
      generatorConfigurationSha256: CONFIGURATION_SHA256,
      byteLength: PAYLOAD.byteLength,
      channelCount: 2,
      channels: [
        { channelIndex: 0, role: 'antenna-port', antennaPort: 0, label: 'LTE antenna port 0' },
        { channelIndex: 1, role: 'antenna-port', antennaPort: 1, label: 'LTE antenna port 1' },
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

function independentlyVerifiedManifest(): StandardsArtifactManifest {
  const manifest = structuredClone(referenceManifest());
  return {
    ...manifest,
    qualification: 'independently-verified',
    qualificationBoundary: {
      ...manifest.qualificationBoundary,
      externalValidationEvidence: 'attached',
    },
    oracle: {
      tool: ORACLE,
      oracleId: 'independent-lte-oracle',
      oracleRevision: '2.0.0',
      relationship: 'independent-implementation',
      evaluatedAt: '2026-07-26T12:00:00.000Z',
      scope: {
        presetId: manifest.preset.presetId,
        presetRevision: manifest.preset.revision,
        recipeId: manifest.recipe.recipeId,
        recipeRevision: manifest.recipe.recipeRevision,
      },
      artifactSha256: manifest.artifact.contentSha256,
      generatorConfigurationSha256: manifest.recipe.configurationSha256,
      result: 'pass',
      reportSha256: 'd'.repeat(64),
      reportLocation: 'validation/lte-etm-1-1-report.json',
    },
  };
}

function bundle(manifest: StandardsArtifactManifest = referenceManifest(), chunks = [PAYLOAD]) {
  return {
    manifest,
    manifestSha256: standardsArtifactManifestSha256(manifest),
    chunks,
  };
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of chunks) {
    parts.push(chunk);
    length += chunk.byteLength;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

describe('canonical standards artifact identities', () => {
  it('serializes object keys canonically while preserving array order', () => {
    const left = { z: 2, a: { y: [3, 2, 1], x: -0 } };
    const right = { a: { x: 0, y: [3, 2, 1] }, z: 2 };

    expect(canonicalJsonString(left)).toBe('{"a":{"x":0,"y":[3,2,1]},"z":2}');
    expect(canonicalJsonString(left)).toBe(canonicalJsonString(right));
    expect(standardsArtifactConfigurationSha256(left))
      .toBe(standardsArtifactConfigurationSha256(right));
  });

  it('rejects values JSON would silently discard or ambiguously coerce', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = new Array(2);
    sparse[1] = 'present';

    expect(() => canonicalJsonString({ missing: undefined })).toThrow(/cannot encode undefined/i);
    expect(() => canonicalJsonString({ invalid: Number.NaN })).toThrow(/finite/i);
    expect(() => canonicalJsonString({ unsafe: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/safe integers/i);
    expect(() => canonicalJsonString(cyclic)).toThrow(/cyclic/i);
    expect(() => canonicalJsonString(sparse)).toThrow(/sparse/i);
  });

  it('hashes incrementally with byte-for-byte SHA-256 compatibility', () => {
    const expected = createHash('sha256').update(PAYLOAD).digest('hex');
    const hash = new IncrementalSha256();
    hash.update(PAYLOAD.subarray(0, 1));
    hash.update(PAYLOAD.subarray(1, 33));
    hash.update(new Uint8Array());
    hash.update(PAYLOAD.subarray(33));

    expect(hash.digestHex()).toBe(expected);
    expect(hash.digestHex()).toBe(expected);
    expect(sha256HexOfChunks(PAYLOAD.subarray(0, 17), PAYLOAD.subarray(17))).toBe(expected);
    expect(() => hash.update(Uint8Array.of(1))).toThrow(/finalized/i);
  });

  it.each([0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 1_000])(
    'matches SHA-256 across padding and block boundaries at %i bytes',
    (length) => {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) & 0xff);
      const expected = createHash('sha256').update(bytes).digest('hex');
      const hash = new IncrementalSha256();
      for (let offset = 0; offset < bytes.length; offset += 7) {
        hash.update(bytes.subarray(offset, Math.min(offset + 7, bytes.length)));
      }

      expect(hash.digestHex()).toBe(expected);
    },
  );
});

describe('standards artifact manifest validation', () => {
  it('admits exact byte geometry, port metadata, frame origin, and no-transform processing', () => {
    const parsed = parseStandardsArtifactManifest(referenceManifest());

    expect(parsed.artifact).toMatchObject({
      byteLength: 64,
      channelCount: 2,
      complexSamplesPerChannel: 4,
      sampleRateHz: 400,
      processing: {
        filtering: 'none',
        normalization: 'none',
        resampling: 'none',
      },
    });
    expect(parsed.artifact.channels.map((channel) => channel.antennaPort)).toEqual([0, 1]);
    expect(parsed.artifact.timing.origin).toEqual({
      basis: 'relative-radio-frame',
      frameNumber: 0,
      sampleOffset: 0,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    '../escape.cf32',
    'waveforms/../../escape.cf32',
    '/absolute.cf32',
    'C:/drive.cf32',
    'waveforms\\escape.cf32',
    'waveforms//empty.cf32',
    './relative.cf32',
  ])('rejects unsafe or non-portable artifact path %s', (location) => {
    const manifest = structuredClone(referenceManifest());
    manifest.artifact.location = location;

    expect(isSafeStandardsArtifactPath(location)).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects mismatched byte geometry, channel order, and duplicate antenna ports', () => {
    const wrongBytes = structuredClone(referenceManifest());
    wrongBytes.artifact.byteLength -= 1;
    const wrongIndex = structuredClone(referenceManifest());
    wrongIndex.artifact.channels[1]!.channelIndex = 3;
    const duplicatePort = structuredClone(referenceManifest());
    duplicatePort.artifact.channels[1]!.antennaPort = 0;

    expect(standardsArtifactManifestSchema.safeParse(wrongBytes).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(wrongIndex).success).toBe(false);
    const duplicateResult = standardsArtifactManifestSchema.safeParse(duplicatePort);
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(duplicateResult.error.issues.map((issue) => issue.message).join(' '))
        .toMatch(/unique antenna port/i);
    }
  });

  it('rejects invalid, ambiguous, or incomplete frame timing', () => {
    const wrongRate = structuredClone(referenceManifest());
    wrongRate.artifact.timing.samplesPerFrame = 5;
    const wrongCoverage = structuredClone(referenceManifest());
    wrongCoverage.artifact.timing.frameCount = 2;
    const nonCanonicalDuration = structuredClone(referenceManifest());
    nonCanonicalDuration.artifact.timing.frameDuration = {
      unit: 'seconds',
      numerator: 2,
      denominator: 200,
    };
    const offsetOrigin = structuredClone(referenceManifest()) as unknown as {
      artifact: { timing: { origin: { sampleOffset: number } } };
    };
    offsetOrigin.artifact.timing.origin.sampleOffset = 1;

    expect(standardsArtifactManifestSchema.safeParse(wrongRate).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(wrongCoverage).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(nonCanonicalDuration).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(offsetOrigin).success).toBe(false);
  });

  it.each([
    ['filtering', 'fir-low-pass'],
    ['normalization', 'unit-peak'],
    ['resampling', '15.36-msps'],
    ['scaling', 'automatic'],
    ['sampleValueTransform', 'clamp'],
  ])('rejects unsupported post-provider %s transformation', (field, value) => {
    const manifest = structuredClone(referenceManifest()) as unknown as {
      artifact: { processing: Record<string, string> };
    };
    manifest.artifact.processing[field] = value;

    expect(standardsArtifactManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('binds both artifact metadata and recipe to the canonical configuration hash', () => {
    const wrongRecipeHash = structuredClone(referenceManifest());
    wrongRecipeHash.recipe.configurationSha256 = 'f'.repeat(64);
    wrongRecipeHash.artifact.generatorConfigurationSha256 = 'f'.repeat(64);
    const wrongArtifactHash = structuredClone(referenceManifest());
    wrongArtifactHash.artifact.generatorConfigurationSha256 = 'e'.repeat(64);

    expect(standardsArtifactManifestSchema.safeParse(wrongRecipeHash).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(wrongArtifactHash).success).toBe(false);
  });

  it('promotes only a passing, independent, exactly bound oracle record', () => {
    expect(standardsArtifactManifestSchema.parse(independentlyVerifiedManifest()).qualification)
      .toBe('independently-verified');

    const absent = structuredClone(independentlyVerifiedManifest());
    absent.oracle = null;
    absent.qualificationBoundary.externalValidationEvidence = 'not-provided';
    const failed = structuredClone(independentlyVerifiedManifest());
    failed.oracle!.result = 'fail';
    const selfOracle = structuredClone(independentlyVerifiedManifest());
    selfOracle.oracle!.tool.providerId = GENERATOR.providerId;
    const wrongArtifact = structuredClone(independentlyVerifiedManifest());
    wrongArtifact.oracle!.artifactSha256 = 'e'.repeat(64);
    const wrongScope = structuredClone(independentlyVerifiedManifest());
    wrongScope.oracle!.scope.recipeRevision = 'different';

    expect(standardsArtifactManifestSchema.safeParse(absent).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(failed).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(selfOracle).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(wrongArtifact).success).toBe(false);
    expect(standardsArtifactManifestSchema.safeParse(wrongScope).success).toBe(false);
  });
});

describe('atomic standards artifact admission and reading', () => {
  it('verifies chunked bytes before returning an immutable, replayable handle', async () => {
    const mutableFirstHalf = PAYLOAD.slice(0, 32);
    const admitted = await admitStandardsArtifactBundle(bundle(
      referenceManifest(),
      [mutableFirstHalf, PAYLOAD.slice(32)],
    ), {
      expectedConfigurationSha256: CONFIGURATION_SHA256,
    });
    mutableFirstHalf.fill(0);

    expect(admitted.qualification).toBe('reference-generated');
    expect(admitted.verifiedByteLength).toBe(PAYLOAD.byteLength);
    expect(admitted.readAllBytes()).toEqual(PAYLOAD);
    expect(await collect(admitted.readChunks({ chunkBytes: 7 }))).toEqual(PAYLOAD);
    const firstRead = admitted.readAllBytes();
    firstRead.fill(0);
    expect(admitted.readAllBytes()).toEqual(PAYLOAD);
    expect(() => admitted.readChunks({ chunkBytes: 0 })).toThrow(/positive safe integer/i);
  });

  it('incrementally verifies without retaining a replay buffer', async () => {
    const result = await verifyStandardsArtifactChunks(
      referenceManifest().artifact,
      [PAYLOAD.subarray(0, 3), PAYLOAD.subarray(3, 61), PAYLOAD.subarray(61)],
    );

    expect(result).toEqual({
      byteLength: PAYLOAD.byteLength,
      contentSha256: PAYLOAD_SHA256,
    });
  });

  it('rejects corruption, truncation, excess bytes, and invalid chunks', async () => {
    const corrupted = PAYLOAD.slice();
    corrupted[17] = corrupted[17]! ^ 0xff;

    await expect(admitStandardsArtifactBundle(bundle(referenceManifest(), [corrupted])))
      .rejects.toMatchObject({ code: 'payload-hash-mismatch' });
    await expect(admitStandardsArtifactBundle(bundle(referenceManifest(), [PAYLOAD.subarray(0, 63)])))
      .rejects.toMatchObject({ code: 'payload-truncated' });
    await expect(admitStandardsArtifactBundle(bundle(referenceManifest(), [PAYLOAD, Uint8Array.of(0)])))
      .rejects.toMatchObject({ code: 'payload-overlong' });
    await expect(admitStandardsArtifactBundle({
      ...bundle(),
      chunks: [PAYLOAD, 'not bytes'] as unknown as Uint8Array[],
    })).rejects.toMatchObject({ code: 'invalid-chunk' });
  });

  it('rejects wrong manifest/configuration hashes and bounded-retention overflow', async () => {
    await expect(admitStandardsArtifactBundle({
      ...bundle(),
      manifestSha256: '0'.repeat(64),
    })).rejects.toMatchObject({ code: 'manifest-hash-mismatch' });
    await expect(admitStandardsArtifactBundle(bundle(), {
      expectedConfigurationSha256: '0'.repeat(64),
    })).rejects.toMatchObject({ code: 'configuration-mismatch' });
    await expect(admitStandardsArtifactBundle(bundle(), {
      maximumRetainedBytes: PAYLOAD.byteLength - 1,
    })).rejects.toMatchObject({ code: 'payload-too-large' });
  });

  it('wraps invalid manifests before consuming provider bytes', async () => {
    const invalid = structuredClone(referenceManifest());
    invalid.artifact.location = '../escape.cf32';
    let consumed = false;
    async function* chunks() {
      consumed = true;
      yield PAYLOAD;
    }

    await expect(admitStandardsArtifactBundle({
      manifest: invalid,
      manifestSha256: '0'.repeat(64),
      chunks: chunks(),
    })).rejects.toBeInstanceOf(StandardsArtifactAdmissionError);
    expect(consumed).toBe(false);
  });
});
