import { z } from 'zod';
import { isUint8Array } from './platform-bytes.js';

/**
 * Runtime contract for immutable, provider-generated standards waveform assets.
 *
 * The manifest describes the provider's bytes exactly. Admission never filters,
 * rescales, normalizes, resamples, or silently lowers the requested
 * qualification.
 */
export const STANDARDS_ARTIFACT_SCHEMA_VERSION = 1 as const;

export const STANDARDS_ARTIFACT_LIMITS = Object.freeze({
  maximumChannels: 64,
  maximumComplexSamplesPerChannel: 1_000_000_000_000,
  maximumSampleRateHz: 500_000_000_000,
  maximumCenterFrequencyHz: 1_000_000_000_000,
  maximumCanonicalManifestBytes: 1_048_576,
  defaultMaximumRetainedPayloadBytes: 512 * 1_048_576,
  defaultReaderChunkBytes: 64 * 1_024,
} as const);

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | CanonicalJsonObject;

export interface CanonicalJsonObject {
  readonly [key: string]: CanonicalJsonValue;
}

const MAXIMUM_CANONICAL_JSON_DEPTH = 128;
const textEncoder = new TextEncoder();

function canonicalJsonValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
): string {
  if (depth > MAXIMUM_CANONICAL_JSON_DEPTH) {
    throw new TypeError(`Canonical JSON nesting exceeds ${MAXIMUM_CANONICAL_JSON_DEPTH} levels`);
  }
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON numbers must be finite');
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError('Canonical JSON integers must be safe integers');
    }
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot encode cyclic values');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError('Canonical JSON arrays must not be sparse');
        }
      }
      return `[${value.map((entry) => canonicalJsonValue(entry, ancestors, depth + 1)).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON objects must have a plain or null prototype');
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) {
      throw new TypeError('Canonical JSON objects cannot contain symbol keys');
    }
    const keys = ownKeys as string[];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')
      ) {
        throw new TypeError('Canonical JSON object properties must be enumerable data properties');
      }
    }
    keys.sort();
    return `{${keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      return `${JSON.stringify(key)}:${canonicalJsonValue(descriptor.value, ancestors, depth + 1)}`;
    }).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Canonical JSON used for configuration and manifest identities.
 *
 * Object keys are UTF-16 sorted, arrays retain their order, negative zero is
 * encoded as zero, and values which JSON would otherwise silently discard are
 * rejected.
 */
export function canonicalJsonString(value: unknown): string {
  return canonicalJsonValue(value, new Set<object>(), 0);
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(canonicalJsonString(value));
}

const SHA256_INITIAL_STATE = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * Small platform-neutral incremental SHA-256 implementation.
 *
 * It avoids assembling a provider payload solely for hashing and works in both
 * the Node bridge and browser runtime.
 */
export class IncrementalSha256 {
  readonly #state = Uint32Array.from(SHA256_INITIAL_STATE);
  readonly #pending = new Uint8Array(64);
  readonly #schedule = new Uint32Array(64);
  #pendingLength = 0;
  #totalBytes = 0n;
  #digest: string | null = null;

  update(chunk: Uint8Array): this {
    if (this.#digest !== null) throw new Error('SHA-256 instance is already finalized');
    if (!isUint8Array(chunk)) throw new TypeError('SHA-256 chunks must be Uint8Array values');

    this.#totalBytes += BigInt(chunk.byteLength);
    if (this.#totalBytes * 8n > 0xffff_ffff_ffff_ffffn) {
      throw new RangeError('SHA-256 input exceeds the 64-bit FIPS length field');
    }

    let offset = 0;
    if (this.#pendingLength > 0) {
      const take = Math.min(64 - this.#pendingLength, chunk.byteLength);
      this.#pending.set(chunk.subarray(0, take), this.#pendingLength);
      this.#pendingLength += take;
      offset += take;
      if (this.#pendingLength === 64) {
        this.#compress(this.#pending, 0);
        this.#pendingLength = 0;
      }
    }

    while (offset + 64 <= chunk.byteLength) {
      this.#compress(chunk, offset);
      offset += 64;
    }
    if (offset < chunk.byteLength) {
      this.#pending.set(chunk.subarray(offset), 0);
      this.#pendingLength = chunk.byteLength - offset;
    }
    return this;
  }

  digestHex(): string {
    if (this.#digest !== null) return this.#digest;

    const finalLength = this.#pendingLength < 56 ? 64 : 128;
    const finalBlocks = new Uint8Array(finalLength);
    finalBlocks.set(this.#pending.subarray(0, this.#pendingLength));
    finalBlocks[this.#pendingLength] = 0x80;
    let bitLength = this.#totalBytes * 8n;
    for (let index = 0; index < 8; index += 1) {
      finalBlocks[finalLength - 1 - index] = Number(bitLength & 0xffn);
      bitLength >>= 8n;
    }
    for (let offset = 0; offset < finalLength; offset += 64) {
      this.#compress(finalBlocks, offset);
    }

    this.#digest = [...this.#state]
      .map((word) => word.toString(16).padStart(8, '0'))
      .join('');
    return this.#digest;
  }

  #compress(bytes: Uint8Array, offset: number): void {
    const schedule = this.#schedule;
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      schedule[index] = (
        (bytes[start]! << 24)
        | (bytes[start + 1]! << 16)
        | (bytes[start + 2]! << 8)
        | bytes[start + 3]!
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = schedule[index - 15]!;
      const previous2 = schedule[index - 2]!;
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      schedule[index] = (
        schedule[index - 16]!
        + sigma0
        + schedule[index - 7]!
        + sigma1
      ) >>> 0;
    }

    let a = this.#state[0]!;
    let b = this.#state[1]!;
    let c = this.#state[2]!;
    let d = this.#state[3]!;
    let e = this.#state[4]!;
    let f = this.#state[5]!;
    let g = this.#state[6]!;
    let h = this.#state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sigma1 + choose + SHA256_K[index]! + schedule[index]!) >>> 0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    this.#state[0] = (this.#state[0]! + a) >>> 0;
    this.#state[1] = (this.#state[1]! + b) >>> 0;
    this.#state[2] = (this.#state[2]! + c) >>> 0;
    this.#state[3] = (this.#state[3]! + d) >>> 0;
    this.#state[4] = (this.#state[4]! + e) >>> 0;
    this.#state[5] = (this.#state[5]! + f) >>> 0;
    this.#state[6] = (this.#state[6]! + g) >>> 0;
    this.#state[7] = (this.#state[7]! + h) >>> 0;
  }
}

export function sha256HexOfChunks(...chunks: readonly Uint8Array[]): string {
  const hash = new IncrementalSha256();
  for (const chunk of chunks) hash.update(chunk);
  return hash.digestHex();
}

export function sha256HexOfCanonicalJson(value: unknown): string {
  return sha256HexOfChunks(canonicalJsonBytes(value));
}

const identifierSchema = z.string().trim().min(1).max(96).regex(
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
  'Identifier must be lowercase and contain only alphanumerics with dot, underscore, or hyphen separators',
);
const shortTextSchema = z.string().trim().min(1).max(256);
const boundedTextSchema = z.string().trim().min(1).max(2_048);
export const standardsSha256Schema = z.string().regex(
  /^[a-f0-9]{64}$/,
  'SHA-256 digests must be lowercase hexadecimal',
);

export function isSafeStandardsArtifactPath(value: string): boolean {
  if (value.length < 1 || value.length > 1_024 || value.includes('\\')) return false;
  const segments = value.split('/');
  return segments.every((segment) => (
    segment !== '.'
    && segment !== '..'
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
  ));
}

export function assertSafeStandardsArtifactPath(value: string): void {
  if (!isSafeStandardsArtifactPath(value)) {
    throw new TypeError('Artifact path must be a safe, portable, relative POSIX path');
  }
}

export const standardsArtifactRelativePathSchema = z.string().trim().min(1).max(1_024)
  .refine(isSafeStandardsArtifactPath, 'Artifact path must be a safe, portable, relative POSIX path');

function isCanonicalJsonObject(value: unknown): value is CanonicalJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    canonicalJsonString(value);
    return true;
  } catch {
    return false;
  }
}

export const canonicalJsonObjectSchema = z.custom<CanonicalJsonObject>(
  isCanonicalJsonObject,
  'Configuration must be a canonical-JSON-compatible object',
);

export const standardsToolIdentitySchema = z.object({
  providerId: identifierSchema,
  providerName: shortTextSchema,
  productName: shortTextSchema,
  productVersion: z.string().trim().min(1).max(128),
  implementationId: identifierSchema,
}).strict();
export type StandardsToolIdentity = z.infer<typeof standardsToolIdentitySchema>;

export const standardsProviderRecipeSchema = z.object({
  tool: standardsToolIdentitySchema,
  recipeId: identifierSchema,
  recipeRevision: z.string().trim().min(1).max(128),
  deterministic: z.literal(true),
  configuration: canonicalJsonObjectSchema,
  configurationSha256: standardsSha256Schema,
}).strict().superRefine((recipe, context) => {
  if (sha256HexOfCanonicalJson(recipe.configuration) !== recipe.configurationSha256) {
    context.addIssue({
      code: 'custom',
      path: ['configurationSha256'],
      message: 'Configuration SHA-256 must match the canonical recipe configuration',
    });
  }
});
export type StandardsProviderRecipe = z.infer<typeof standardsProviderRecipeSchema>;

export const standardsArtifactChannelSchema = z.object({
  channelIndex: z.number().safe().int().nonnegative().max(STANDARDS_ARTIFACT_LIMITS.maximumChannels - 1),
  role: z.literal('antenna-port'),
  antennaPort: z.number().safe().int().nonnegative().max(65_535),
  label: shortTextSchema.optional(),
}).strict();
export type StandardsArtifactChannel = z.infer<typeof standardsArtifactChannelSchema>;

export const standardsArtifactSampleFormatSchema = z.object({
  container: z.literal('raw-binary'),
  componentType: z.enum(['float32', 'float64', 'int16', 'int32']),
  layout: z.enum(['interleaved-iq', 'planar-iq']),
  channelLayout: z.enum(['channel-major', 'sample-interleaved']),
  byteOrder: z.enum(['little-endian', 'big-endian']),
  amplitudeUnit: z.enum(['normalized-full-scale', 'volts', 'arbitrary-units']),
}).strict();
export type StandardsArtifactSampleFormat = z.infer<typeof standardsArtifactSampleFormatSchema>;

export const standardsArtifactTimingSchema = z.object({
  origin: z.object({
    basis: z.literal('relative-radio-frame'),
    frameNumber: z.number().safe().int().nonnegative(),
    sampleOffset: z.literal(0),
  }).strict(),
  frameDuration: z.object({
    unit: z.literal('seconds'),
    numerator: z.number().safe().int().positive(),
    denominator: z.number().safe().int().positive(),
  }).strict(),
  samplesPerFrame: z.number().safe().int().positive(),
  frameCount: z.number().safe().int().positive(),
}).strict();
export type StandardsArtifactTiming = z.infer<typeof standardsArtifactTimingSchema>;

export const standardsArtifactProcessingSchema = z.object({
  scope: z.literal('post-provider-output'),
  filtering: z.literal('none'),
  normalization: z.literal('none'),
  resampling: z.literal('none'),
  scaling: z.literal('none'),
  sampleValueTransform: z.literal('none'),
}).strict();
export type StandardsArtifactProcessing = z.infer<typeof standardsArtifactProcessingSchema>;

export const standardsComplexIqArtifactSchema = z.object({
  artifactId: identifierSchema,
  kind: z.literal('complex-iq'),
  location: standardsArtifactRelativePathSchema,
  mediaType: z.literal('application/vnd.signallab.complex-iq'),
  contentSha256: standardsSha256Schema,
  generatorConfigurationSha256: standardsSha256Schema,
  byteLength: z.number().safe().int().positive(),
  channelCount: z.number().safe().int().min(1).max(STANDARDS_ARTIFACT_LIMITS.maximumChannels),
  channels: z.array(standardsArtifactChannelSchema)
    .min(1).max(STANDARDS_ARTIFACT_LIMITS.maximumChannels).readonly(),
  complexSamplesPerChannel: z.number().safe().int().positive()
    .max(STANDARDS_ARTIFACT_LIMITS.maximumComplexSamplesPerChannel),
  sampleRateHz: z.number().safe().int().positive()
    .max(STANDARDS_ARTIFACT_LIMITS.maximumSampleRateHz),
  centerFrequencyHz: z.number().safe().int().nonnegative()
    .max(STANDARDS_ARTIFACT_LIMITS.maximumCenterFrequencyHz),
  format: standardsArtifactSampleFormatSchema,
  timing: standardsArtifactTimingSchema,
  processing: standardsArtifactProcessingSchema,
}).strict().superRefine((artifact, context) => {
  const bytesPerComponent = ({
    float32: 4,
    float64: 8,
    int16: 2,
    int32: 4,
  } as const)[artifact.format.componentType];
  const expectedByteLength = (
    BigInt(artifact.channelCount)
    * BigInt(artifact.complexSamplesPerChannel)
    * 2n
    * BigInt(bytesPerComponent)
  );
  if (
    expectedByteLength > BigInt(Number.MAX_SAFE_INTEGER)
    || expectedByteLength !== BigInt(artifact.byteLength)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['byteLength'],
      message: 'Byte length must exactly match channels, complex samples, and component width',
    });
  }

  if (artifact.channels.length !== artifact.channelCount) {
    context.addIssue({
      code: 'custom',
      path: ['channels'],
      message: 'Channel metadata count must exactly equal channelCount',
    });
  }
  const ports = new Set<number>();
  for (const [index, channel] of artifact.channels.entries()) {
    if (channel.channelIndex !== index) {
      context.addIssue({
        code: 'custom',
        path: ['channels', index, 'channelIndex'],
        message: 'Channel indexes must be contiguous and match storage order',
      });
    }
    if (ports.has(channel.antennaPort)) {
      context.addIssue({
        code: 'custom',
        path: ['channels', index, 'antennaPort'],
        message: 'Each channel must map to a unique antenna port',
      });
    }
    ports.add(channel.antennaPort);
  }

  const { frameDuration, samplesPerFrame, frameCount, origin } = artifact.timing;
  const durationGcd = greatestCommonDivisor(frameDuration.numerator, frameDuration.denominator);
  if (durationGcd !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['timing', 'frameDuration'],
      message: 'Frame-duration rational must be in lowest terms',
    });
  }
  if (
    BigInt(artifact.sampleRateHz) * BigInt(frameDuration.numerator)
    !== BigInt(samplesPerFrame) * BigInt(frameDuration.denominator)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['timing', 'samplesPerFrame'],
      message: 'Frame duration, sample rate, and samplesPerFrame must agree exactly',
    });
  }
  if (
    BigInt(samplesPerFrame) * BigInt(frameCount)
    !== BigInt(artifact.complexSamplesPerChannel)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['timing', 'frameCount'],
      message: 'Frame geometry must exactly cover every complex sample in each channel',
    });
  }
  if (!Number.isSafeInteger(origin.frameNumber + frameCount)) {
    context.addIssue({
      code: 'custom',
      path: ['timing', 'origin', 'frameNumber'],
      message: 'Artifact end frame must be a safe integer',
    });
  }
});
export type StandardsComplexIqArtifact = z.infer<typeof standardsComplexIqArtifactSchema>;

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

const httpsUrlSchema = z.string().max(2_048).url()
  .refine((value) => value.startsWith('https://'), 'Oracle report URL must use HTTPS');

export const standardsOracleAttestationSchema = z.object({
  tool: standardsToolIdentitySchema,
  oracleId: identifierSchema,
  oracleRevision: z.string().trim().min(1).max(128),
  relationship: z.literal('independent-implementation'),
  evaluatedAt: z.string().datetime({ offset: true, precision: 3 }),
  scope: z.object({
    presetId: identifierSchema,
    presetRevision: z.string().trim().min(1).max(64),
    recipeId: identifierSchema,
    recipeRevision: z.string().trim().min(1).max(128),
  }).strict(),
  artifactSha256: standardsSha256Schema,
  generatorConfigurationSha256: standardsSha256Schema,
  result: z.enum(['pass', 'fail', 'inconclusive']),
  reportSha256: standardsSha256Schema,
  reportLocation: z.union([httpsUrlSchema, standardsArtifactRelativePathSchema]),
}).strict();
export type StandardsOracleAttestation = z.infer<typeof standardsOracleAttestationSchema>;

export const standardsArtifactQualificationSchema = z.enum([
  'reference-generated',
  'independently-verified',
]);
export type StandardsArtifactQualification = z.infer<typeof standardsArtifactQualificationSchema>;

export const standardsArtifactManifestSchema = z.object({
  schemaVersion: z.literal(STANDARDS_ARTIFACT_SCHEMA_VERSION),
  preset: z.object({
    presetId: identifierSchema,
    revision: z.string().trim().min(1).max(64),
    family: z.enum(['lab', 'geran', 'lte', 'nr', 'wlan', 'bluetooth']),
  }).strict(),
  qualification: standardsArtifactQualificationSchema,
  qualificationBoundary: z.object({
    complianceClaim: z.literal('not-claimed'),
    externalValidationEvidence: z.enum(['not-provided', 'attached']),
    statement: boundedTextSchema,
  }).strict(),
  recipe: standardsProviderRecipeSchema,
  artifact: standardsComplexIqArtifactSchema,
  oracle: standardsOracleAttestationSchema.nullable(),
}).strict().superRefine((manifest, context) => {
  if (manifest.artifact.generatorConfigurationSha256 !== manifest.recipe.configurationSha256) {
    context.addIssue({
      code: 'custom',
      path: ['artifact', 'generatorConfigurationSha256'],
      message: 'Artifact configuration hash must match the provider recipe configuration',
    });
  }

  const hasOracle = manifest.oracle !== null;
  const expectedEvidenceState = hasOracle ? 'attached' : 'not-provided';
  if (manifest.qualificationBoundary.externalValidationEvidence !== expectedEvidenceState) {
    context.addIssue({
      code: 'custom',
      path: ['qualificationBoundary', 'externalValidationEvidence'],
      message: 'External-evidence state must exactly match the attached oracle attestation',
    });
  }

  if (manifest.oracle !== null) {
    const oracle = manifest.oracle;
    if (oracle.artifactSha256 !== manifest.artifact.contentSha256) {
      context.addIssue({
        code: 'custom',
        path: ['oracle', 'artifactSha256'],
        message: 'Oracle attestation must bind the exact artifact content hash',
      });
    }
    if (oracle.generatorConfigurationSha256 !== manifest.recipe.configurationSha256) {
      context.addIssue({
        code: 'custom',
        path: ['oracle', 'generatorConfigurationSha256'],
        message: 'Oracle attestation must bind the exact generator configuration hash',
      });
    }
    const expectedScope = {
      presetId: manifest.preset.presetId,
      presetRevision: manifest.preset.revision,
      recipeId: manifest.recipe.recipeId,
      recipeRevision: manifest.recipe.recipeRevision,
    };
    for (const key of Object.keys(expectedScope) as (keyof typeof expectedScope)[]) {
      if (oracle.scope[key] !== expectedScope[key]) {
        context.addIssue({
          code: 'custom',
          path: ['oracle', 'scope', key],
          message: 'Oracle scope must bind the exact preset and recipe revisions',
        });
      }
    }
    if (oracle.tool.providerId === manifest.recipe.tool.providerId) {
      context.addIssue({
        code: 'custom',
        path: ['oracle', 'tool', 'providerId'],
        message: 'Independent oracle and generator must use different providers',
      });
    }
    if (oracle.tool.implementationId === manifest.recipe.tool.implementationId) {
      context.addIssue({
        code: 'custom',
        path: ['oracle', 'tool', 'implementationId'],
        message: 'Independent oracle and generator must use different implementations',
      });
    }
  }

  if (manifest.qualification === 'independently-verified') {
    if (manifest.oracle === null) {
      context.addIssue({
        code: 'custom',
        path: ['oracle'],
        message: 'Independently verified qualification requires an oracle attestation',
      });
    } else if (manifest.oracle.result !== 'pass') {
      context.addIssue({
        code: 'custom',
        path: ['oracle', 'result'],
        message: 'Independently verified qualification requires a passing oracle attestation',
      });
    }
  }
});
export type StandardsArtifactManifest = z.infer<typeof standardsArtifactManifestSchema>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function parseStandardsArtifactManifest(input: unknown): StandardsArtifactManifest {
  const parsed = standardsArtifactManifestSchema.parse(input);
  return deepFreeze(structuredClone(parsed));
}

export function canonicalStandardsArtifactManifest(input: unknown): string {
  return canonicalJsonString(parseStandardsArtifactManifest(input));
}

export function standardsArtifactManifestSha256(input: unknown): string {
  return sha256HexOfChunks(textEncoder.encode(canonicalStandardsArtifactManifest(input)));
}

export function standardsArtifactConfigurationSha256(configuration: unknown): string {
  if (!isCanonicalJsonObject(configuration)) {
    throw new TypeError('Standards recipe configuration must be a canonical-JSON-compatible object');
  }
  return sha256HexOfCanonicalJson(configuration);
}

export type StandardsArtifactChunkSource =
  | Iterable<Uint8Array>
  | AsyncIterable<Uint8Array>;

export type StandardsArtifactAdmissionErrorCode =
  | 'configuration-mismatch'
  | 'invalid-chunk'
  | 'invalid-manifest'
  | 'manifest-hash-mismatch'
  | 'payload-hash-mismatch'
  | 'payload-overlong'
  | 'payload-too-large'
  | 'payload-truncated';

export class StandardsArtifactAdmissionError extends Error {
  constructor(
    readonly code: StandardsArtifactAdmissionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StandardsArtifactAdmissionError';
  }
}

export interface StandardsArtifactStreamVerification {
  readonly byteLength: number;
  readonly contentSha256: string;
}

interface VerifyStandardsArtifactChunksOptions {
  readonly retainChunks?: boolean;
  readonly maximumRetainedBytes?: number;
}

interface InternalStreamVerification extends StandardsArtifactStreamVerification {
  readonly retainedChunks: readonly Uint8Array[];
}

async function verifyChunks(
  artifact: Pick<StandardsComplexIqArtifact, 'byteLength' | 'contentSha256'>,
  chunks: StandardsArtifactChunkSource,
  options: VerifyStandardsArtifactChunksOptions,
): Promise<InternalStreamVerification> {
  const retainChunks = options.retainChunks ?? false;
  const maximumRetainedBytes = options.maximumRetainedBytes
    ?? STANDARDS_ARTIFACT_LIMITS.defaultMaximumRetainedPayloadBytes;
  if (!Number.isSafeInteger(maximumRetainedBytes) || maximumRetainedBytes < 1) {
    throw new RangeError('maximumRetainedBytes must be a positive safe integer');
  }
  if (retainChunks && artifact.byteLength > maximumRetainedBytes) {
    throw new StandardsArtifactAdmissionError(
      'payload-too-large',
      `Artifact byte length ${artifact.byteLength} exceeds the atomic retention limit ${maximumRetainedBytes}`,
    );
  }

  const hash = new IncrementalSha256();
  const retainedChunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of chunks) {
    if (!isUint8Array(chunk)) {
      throw new StandardsArtifactAdmissionError('invalid-chunk', 'Artifact stream yielded a non-Uint8Array chunk');
    }
    if (chunk.byteLength === 0) continue;
    if (chunk.byteLength > artifact.byteLength - byteLength) {
      throw new StandardsArtifactAdmissionError(
        'payload-overlong',
        `Artifact stream exceeds declared byte length ${artifact.byteLength}`,
      );
    }
    byteLength += chunk.byteLength;
    hash.update(chunk);
    if (retainChunks) retainedChunks.push(chunk.slice());
  }
  if (byteLength !== artifact.byteLength) {
    throw new StandardsArtifactAdmissionError(
      'payload-truncated',
      `Artifact stream ended at ${byteLength} bytes; expected ${artifact.byteLength}`,
    );
  }
  const contentSha256 = hash.digestHex();
  if (contentSha256 !== artifact.contentSha256) {
    throw new StandardsArtifactAdmissionError(
      'payload-hash-mismatch',
      'Artifact bytes do not match the manifest content SHA-256',
    );
  }
  return {
    byteLength,
    contentSha256,
    retainedChunks,
  };
}

/** Incrementally verifies a stream without retaining its payload. */
export async function verifyStandardsArtifactChunks(
  artifact: Pick<StandardsComplexIqArtifact, 'byteLength' | 'contentSha256'>,
  chunks: StandardsArtifactChunkSource,
): Promise<StandardsArtifactStreamVerification> {
  const verified = await verifyChunks(artifact, chunks, { retainChunks: false });
  return {
    byteLength: verified.byteLength,
    contentSha256: verified.contentSha256,
  };
}

export interface StandardsArtifactBundleCandidate {
  readonly manifest: unknown;
  readonly manifestSha256: string;
  readonly chunks: StandardsArtifactChunkSource;
}

export interface StandardsArtifactAdmissionOptions {
  readonly expectedConfigurationSha256?: string;
  readonly maximumRetainedBytes?: number;
}

export interface StandardsArtifactReadOptions {
  readonly chunkBytes?: number;
}

export interface AdmittedStandardsArtifactBundle {
  readonly manifest: StandardsArtifactManifest;
  readonly manifestSha256: string;
  readonly qualification: StandardsArtifactQualification;
  readonly verifiedByteLength: number;
  readChunks(options?: StandardsArtifactReadOptions): AsyncIterable<Uint8Array>;
  readAllBytes(): Uint8Array;
}

/**
 * Validates the complete manifest and payload before returning any usable
 * handle. The verified bytes are retained privately so later reads cannot race
 * a mutable provider source.
 */
export async function admitStandardsArtifactBundle(
  candidate: StandardsArtifactBundleCandidate,
  options: StandardsArtifactAdmissionOptions = {},
): Promise<AdmittedStandardsArtifactBundle> {
  let manifest: StandardsArtifactManifest;
  try {
    manifest = parseStandardsArtifactManifest(candidate.manifest);
  } catch (cause) {
    throw new StandardsArtifactAdmissionError(
      'invalid-manifest',
      'Standards artifact manifest is invalid',
      { cause },
    );
  }

  if (!standardsSha256Schema.safeParse(candidate.manifestSha256).success) {
    throw new StandardsArtifactAdmissionError(
      'manifest-hash-mismatch',
      'Manifest SHA-256 must be lowercase hexadecimal',
    );
  }
  const canonicalManifest = canonicalJsonBytes(manifest);
  if (canonicalManifest.byteLength > STANDARDS_ARTIFACT_LIMITS.maximumCanonicalManifestBytes) {
    throw new StandardsArtifactAdmissionError(
      'invalid-manifest',
      `Canonical manifest exceeds ${STANDARDS_ARTIFACT_LIMITS.maximumCanonicalManifestBytes} bytes`,
    );
  }
  const actualManifestSha256 = sha256HexOfChunks(canonicalManifest);
  if (actualManifestSha256 !== candidate.manifestSha256) {
    throw new StandardsArtifactAdmissionError(
      'manifest-hash-mismatch',
      'Canonical manifest does not match the supplied manifest SHA-256',
    );
  }

  if (options.expectedConfigurationSha256 !== undefined) {
    if (!standardsSha256Schema.safeParse(options.expectedConfigurationSha256).success) {
      throw new StandardsArtifactAdmissionError(
        'configuration-mismatch',
        'Expected configuration SHA-256 must be lowercase hexadecimal',
      );
    }
    if (manifest.recipe.configurationSha256 !== options.expectedConfigurationSha256) {
      throw new StandardsArtifactAdmissionError(
        'configuration-mismatch',
        'Manifest recipe does not match the expected generator configuration',
      );
    }
  }

  const verified = await verifyChunks(manifest.artifact, candidate.chunks, {
    retainChunks: true,
    maximumRetainedBytes: options.maximumRetainedBytes,
  });
  const payload = new Uint8Array(verified.byteLength);
  let offset = 0;
  for (const chunk of verified.retainedChunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const readChunks = (readOptions: StandardsArtifactReadOptions = {}): AsyncIterable<Uint8Array> => {
    const chunkBytes = readOptions.chunkBytes ?? STANDARDS_ARTIFACT_LIMITS.defaultReaderChunkBytes;
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) {
      throw new RangeError('chunkBytes must be a positive safe integer');
    }
    return (async function* replayVerifiedPayload(): AsyncGenerator<Uint8Array> {
      for (let start = 0; start < payload.byteLength; start += chunkBytes) {
        yield payload.slice(start, Math.min(start + chunkBytes, payload.byteLength));
      }
    })();
  };

  return Object.freeze({
    manifest,
    manifestSha256: actualManifestSha256,
    qualification: manifest.qualification,
    verifiedByteLength: verified.byteLength,
    readChunks,
    readAllBytes: (): Uint8Array => payload.slice(),
  });
}
