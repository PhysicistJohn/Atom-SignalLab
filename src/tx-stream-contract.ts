/**
 * SignalLab Tx stream contract (host tooling surface).
 *
 * This is a separately versioned, SignalLab-owned contract for streaming
 * generated I/Q to operator transmit hardware through host tooling. It is NOT
 * the Atomizer measurement bridge: `acquireIq` remains a bounded
 * single-buffer measurement acquisition, the bridge v1-v3 documents and trio
 * v4-v7 compositions stay byte-frozen, and no Atomizer-facing capability is
 * registered. Streaming creates no RF emission claim; emission responsibility
 * sits with the operator and their hardware.
 */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  SYNTHESIZED_SIGNAL_PROFILES,
  synthesizedSignalProfileSchema,
  type SynthesizedSignalProfile,
} from './contracts.js';
import {
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
  MAX_ANALYTIC_COMPLEX_IQ_SAMPLES,
  MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ,
} from './complex-iq.js';

export const TX_STREAM_CONTRACT_ID = 'signal-lab-tx-stream' as const;
export const TX_STREAM_CONTRACT_VERSION = 1 as const;
/** SHA-256 of the exact bytes of contracts/signal-lab-tx-stream-v1.json. */
export const TX_STREAM_CONTRACT_SHA256 =
  'bf07079080ae67bb4d2f2ec91a58b5ed19822bfaefadfe9a53528ba399f5f3cf' as const;

export const TX_STREAM_ONE_SHOT_REFUSAL_CODE =
  'TX_STREAM_ONE_SHOT_NOT_STREAMABLE' as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const decimalStringSchema = z.string().regex(/^(?:0|[1-9][0-9]*)$/);
const isoInstantSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
);

export const txStreamQualificationSchema = z.enum([
  'analytic-complex-baseband',
  'standards-derived-complex-baseband',
  'reference-generated-digital-baseband',
  'independently-verified-digital-baseband',
  'derived-from-independently-verified-digital-baseband',
]);
export type TxStreamQualification = z.infer<typeof txStreamQualificationSchema>;

export const txStreamPayloadKindSchema = z.enum([
  'native-canonical',
  'derived-hardware-ready',
  'generated-at-output-rate',
]);
export type TxStreamPayloadKind = z.infer<typeof txStreamPayloadKindSchema>;

export const txStreamBoundaryPolicySchema = z.enum([
  'cyclic-modular',
  'continuous-session-origin-zero-extended',
  'unbounded-generated',
]);
export type TxStreamBoundaryPolicy = z.infer<typeof txStreamBoundaryPolicySchema>;

export const txStreamOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('resample'),
    algorithm: z.literal('blackman-windowed-sinc-v1'),
    sourceSampleRateHz: z.number().safe().int().positive(),
    outputSampleRateHz: z.number().safe().int().positive(),
    antiAliasCutoffHz: z.number().finite().positive(),
    zeroCrossings: z.literal(16),
  }).strict(),
  z.object({
    kind: z.literal('frequency-translate'),
    algorithm: z.literal('complex-rotator-v1'),
    sourceCarrierOffsetHz: z.number().safe().int(),
    outputCarrierOffsetHz: z.number().safe().int(),
  }).strict(),
]);
export type TxStreamOperation = z.infer<typeof txStreamOperationSchema>;

/**
 * Per-chunk receipt. startSample is the absolute output sample coordinate as
 * a decimal string so unbounded streams never touch Number precision.
 */
export const txStreamChunkReceiptSchema = z.object({
  streamId: z.string().uuid(),
  chunkIndex: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  startSample: decimalStringSchema,
  sampleCount: z.number().int().min(1).max(MAX_ANALYTIC_COMPLEX_IQ_SAMPLES),
  byteLength: z.number().int().positive(),
  sampleFormat: z.literal('cf32le'),
  /** Null when chunk hashing is disabled for full-rate device loops. */
  sha256: sha256Schema.nullable(),
  qualification: txStreamQualificationSchema,
  payloadKind: txStreamPayloadKindSchema,
  boundaryPolicy: txStreamBoundaryPolicySchema,
  canonicalArtifactSha256: sha256Schema.nullable(),
  nativeSampleRateHz: z.number().safe().int().positive(),
  outputSampleRateHz: z.number().safe().int().positive(),
  sourceCarrierOffsetHz: z.number().safe().int(),
  outputCarrierOffsetHz: z.number().safe().int(),
  operations: z.array(txStreamOperationSchema).max(2).readonly(),
}).strict().superRefine((receipt, context) => {
  // Ported qualification/payload consistency rules (measurement-contract.ts):
  // a content-bound qualification applies only to exact native untransformed
  // chunks, and derived lineage requires a declared transform to a canonical
  // artifact.
  if (receipt.qualification === 'independently-verified-digital-baseband' && (
    receipt.payloadKind !== 'native-canonical'
    || receipt.canonicalArtifactSha256 === null
    || receipt.operations.length !== 0
    || receipt.nativeSampleRateHz !== receipt.outputSampleRateHz
    || receipt.sourceCarrierOffsetHz !== receipt.outputCarrierOffsetHz
  )) {
    context.addIssue({
      code: 'custom',
      path: ['qualification'],
      message: 'Independent digital qualification applies only to exact native chunks without transforms',
    });
  }
  if (receipt.qualification === 'derived-from-independently-verified-digital-baseband' && (
    receipt.payloadKind !== 'derived-hardware-ready'
    || receipt.canonicalArtifactSha256 === null
    || !receipt.operations.some((operation) =>
      operation.kind === 'resample' || operation.kind === 'frequency-translate')
  )) {
    context.addIssue({
      code: 'custom',
      path: ['qualification'],
      message: 'Derived digital qualification requires resampling lineage to a canonical artifact',
    });
  }
  if (receipt.payloadKind === 'native-canonical' && (
    receipt.canonicalArtifactSha256 === null
    || receipt.operations.length !== 0
    || receipt.nativeSampleRateHz !== receipt.outputSampleRateHz
    || receipt.sourceCarrierOffsetHz !== receipt.outputCarrierOffsetHz
  )) {
    context.addIssue({
      code: 'custom',
      path: ['payloadKind'],
      message: 'Native-canonical chunks require an artifact identity, matching rates and offsets, and no operations',
    });
  }
  if (receipt.payloadKind === 'derived-hardware-ready'
    && receipt.operations.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['payloadKind'],
      message: 'Derived hardware-ready chunks require at least one declared transport transform',
    });
  }
  if (receipt.payloadKind === 'generated-at-output-rate' && (
    receipt.canonicalArtifactSha256 !== null
    || receipt.nativeSampleRateHz !== receipt.outputSampleRateHz
    || receipt.operations.length !== 0
  )) {
    context.addIssue({
      code: 'custom',
      path: ['payloadKind'],
      message: 'Generated-at-output-rate chunks have no canonical artifact and no transforms',
    });
  }
  const resamples = receipt.operations.filter((operation) => operation.kind === 'resample');
  if ((receipt.nativeSampleRateHz !== receipt.outputSampleRateHz) !== (resamples.length === 1)) {
    context.addIssue({
      code: 'custom',
      path: ['operations'],
      message: 'Exactly one resample operation is required if and only if sample rates differ',
    });
  }
  const resample = resamples[0];
  if (resample !== undefined && resample.kind === 'resample' && (
    resample.sourceSampleRateHz !== receipt.nativeSampleRateHz
    || resample.outputSampleRateHz !== receipt.outputSampleRateHz
  )) {
    context.addIssue({
      code: 'custom',
      path: ['operations'],
      message: 'Resample operation rates must match the receipt geometry',
    });
  }
  const translations = receipt.operations.filter((operation) => operation.kind === 'frequency-translate');
  const expectedTranslations =
    receipt.sourceCarrierOffsetHz === receipt.outputCarrierOffsetHz ? 0 : 1;
  if (translations.length !== expectedTranslations) {
    context.addIssue({
      code: 'custom',
      path: ['operations'],
      message: 'Exactly one frequency translation is required if and only if carrier offsets differ',
    });
  }
  const translationIndex = receipt.operations
    .findIndex((operation) => operation.kind === 'frequency-translate');
  const resampleIndex = receipt.operations
    .findIndex((operation) => operation.kind === 'resample');
  if (translationIndex >= 0 && resampleIndex >= 0 && translationIndex > resampleIndex) {
    context.addIssue({
      code: 'custom',
      path: ['operations'],
      message: 'Frequency translation must precede resampling',
    });
  }
  if ((receipt.boundaryPolicy === 'cyclic-modular')
    !== (receipt.canonicalArtifactSha256 !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['canonicalArtifactSha256'],
      message: 'Cyclic modular chunks carry a canonical artifact identity; session-origin and recipe-generated chunks do not',
    });
  }
});
export type TxStreamChunkReceipt = z.infer<typeof txStreamChunkReceiptSchema>;

export const txStreamProfileSourceSchema = z.object({
  kind: z.literal('profile'),
  profile: synthesizedSignalProfileSchema,
  /** custom-* only; validated by the builder before any synthesis. */
  selections: z.record(z.string().min(1), z.string().min(1)).optional(),
}).strict();

export const txStreamRecipeSourceSchema = z.object({
  kind: z.literal('recipe'),
  recipeId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/),
  contentSeed: z.number().int().min(1).max(0xffff_ffff).optional(),
}).strict();

export const txStreamManifestSchema = z.object({
  streamId: z.string().uuid(),
  contractId: z.literal(TX_STREAM_CONTRACT_ID),
  contractVersion: z.literal(TX_STREAM_CONTRACT_VERSION),
  contractSha256: z.literal(TX_STREAM_CONTRACT_SHA256),
  source: z.discriminatedUnion('kind', [
    txStreamProfileSourceSchema,
    txStreamRecipeSourceSchema,
  ]),
  sampleRateHz: z.number().safe().int()
    .min(MIN_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ)
    .max(MAX_ANALYTIC_COMPLEX_IQ_SAMPLE_RATE_HZ),
  centerHz: z.number().safe().int().positive(),
  sampleFormat: z.enum(['cf32le', 'ci16le']),
  chunkSamples: z.number().int().min(1).max(MAX_ANALYTIC_COMPLEX_IQ_SAMPLES),
  plannedSamples: z.union([z.literal('unbounded'), decimalStringSchema]),
  generatorBindingSha256: sha256Schema,
  qualificationClass: txStreamQualificationSchema,
  disclosure: z.string().min(1),
  totals: z.object({
    chunks: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    samples: decimalStringSchema,
    bytes: decimalStringSchema,
    underruns: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    overruns: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }).strict(),
  state: z.enum(['completed', 'terminated', 'faulted']),
  startedAt: isoInstantSchema,
  closedAt: isoInstantSchema,
}).strict().superRefine((manifest, context) => {
  // Recipe streams carry only the two recipe qualifications; a manifest may
  // never claim a stronger class than its source admits.
  if (manifest.source.kind === 'recipe'
    && manifest.qualificationClass !== 'standards-derived-complex-baseband'
    && manifest.qualificationClass !== 'analytic-complex-baseband') {
    context.addIssue({
      code: 'custom',
      path: ['qualificationClass'],
      message: 'Recipe streams are limited to the recipe qualification vocabulary',
    });
  }
});
export type TxStreamManifest = z.infer<typeof txStreamManifestSchema>;

// ---------------------------------------------------------------------------
// Contract document schema + hash-pinned loader
// ---------------------------------------------------------------------------

const txStreamRefusalSchema = z.object({
  code: z.literal(TX_STREAM_ONE_SHOT_REFUSAL_CODE),
  guidance: z.string().min(1),
}).strict();

export const txStreamProfileCapabilityRowSchema = z.object({
  profileId: synthesizedSignalProfileSchema,
  replay: z.enum(['continuous', 'cyclic', 'one-shot', 'unbounded']),
  nativeSampleRateHz: z.number().safe().int().positive().nullable(),
  signalBandwidthHz: z.number().safe().int().positive(),
  profileReferenceCenterHz: z.number().safe().int().positive(),
  nativeCarrierOffsetHz: z.number().safe().int(),
  streamable: z.boolean(),
  minStreamRateHz: z.number().safe().int().positive().optional(),
  refusal: txStreamRefusalSchema.optional(),
}).strict().superRefine((row, context) => {
  if (row.streamable === (row.refusal !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['refusal'],
      message: 'Exactly one of streamable admission or typed refusal must be declared',
    });
  }
  if ((row.replay === 'one-shot') !== !row.streamable) {
    context.addIssue({
      code: 'custom',
      path: ['streamable'],
      message: 'Only one-shot artifacts refuse streaming in v1',
    });
  }
  if ((row.nativeSampleRateHz === null) !== (row.replay === 'continuous')) {
    context.addIssue({
      code: 'custom',
      path: ['replay'],
      message: 'Only rate-flexible generators declare a null native rate',
    });
  }
  if (row.streamable === (row.minStreamRateHz === undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['minStreamRateHz'],
      message: 'Exactly one stream admission minimum or refusal applies per row',
    });
  }
});
export type TxStreamProfileCapabilityRow =
  z.infer<typeof txStreamProfileCapabilityRowSchema>;

const txStreamRecipeRowSchema = z.object({
  recipeId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/),
  recipeVersion: z.literal(1),
  sampleRateHz: z.number().safe().int().positive(),
  signalBandwidthHz: z.number().safe().int().positive(),
  qualification: z.enum([
    'standards-derived-complex-baseband',
    'analytic-complex-baseband',
  ]),
  generator: z.string().min(1),
  schedule: z.string().min(1),
  streamableOverLink: z.boolean(),
}).strict();

export const txStreamContractDocumentSchema = z.object({
  documentType: z.literal('contract-manifest'),
  contractId: z.literal(TX_STREAM_CONTRACT_ID),
  contractVersion: z.literal(TX_STREAM_CONTRACT_VERSION),
  status: z.literal('active'),
  owner: z.literal('Atom-SignalLab'),
  scope: z.literal('host-tooling-tx-sample-stream'),
  relationToMeasurementBridge: z.object({
    independentSurface: z.string().min(1),
    measurementEdgeUnchanged: z.string().min(1),
    trioLivenessScoping: z.string().min(1),
    driverEvolutionIntact: z.string().min(1),
    stimulusSinkUnchanged: z.string().min(1),
  }).strict(),
  streamModel: z.object({
    transport: z.literal('chunked-pull-single-chunk-in-flight'),
    chunkSamplesMax: z.literal(MAX_ANALYTIC_COMPLEX_IQ_SAMPLES),
    sampleFormatSource: z.literal('cf32le'),
    continuity: z.string().min(1),
    cursor: z.string().min(1),
    backpressure: z.string().min(1),
    overrunUnderrun: z.string().min(1),
    cancellation: z.string().min(1),
    failureAlgebra: z.object({
      invalidInput: z.string().min(1),
      oneShotProfileStreamRequest: z.string().min(1),
      derivedRateBelowAntiAliasGuard: z.string().min(1),
      rateAboveSinkSustainedCapacity: z.string().min(1),
      sinkWriteFailure: z.string().min(1),
      cursorBoundExceeded: z.string().min(1),
    }).strict(),
  }).strict(),
  sampleFormats: z.tuple([z.literal('cf32le'), z.literal('ci16le')]),
  ci16leConvention: z.object({
    layout: z.string().min(1),
    scale: z.number().positive(),
    rounding: z.string().min(1),
    clip: z.tuple([z.number().int(), z.number().int()]),
    nonFiniteInput: z.string().min(1),
    disclosure: z.string().min(1),
  }).strict(),
  qualificationPassthrough: z.object({
    vocabulary: z.array(txStreamQualificationSchema).min(1),
    payloadKinds: z.array(txStreamPayloadKindSchema).min(1),
    rule: z.string().min(1),
    hardwareReadyLimitation: z.string().min(1),
    sourceCleanDisclosure: z.string().min(1),
  }).strict(),
  nonClaims: z.array(z.string().min(1)).min(9),
  emissionResponsibility: z.literal('operator-and-hardware'),
  customProfileStreaming: z.object({
    descriptorResolution: z.string().min(1),
    moduleStateDisclosure: z.string().min(1),
  }).strict(),
  recipeDisclosureRequirements: z.array(z.string().min(1)).min(5),
  p210DeviceEnvelope: z.object({
    device: z.literal('neptune-p210'),
    evidence: z.string().min(1),
    txScanFormat: z.string().min(1),
    rxScanFormat: z.string().min(1),
    txScanChannelsExpected: z.array(z.string().min(1)),
    sampleRateHzRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    txRfBandwidthHzMax: z.number().int().positive(),
    rxRfBandwidthHzMax: z.number().int().positive(),
    tuneHzRangeLive: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    ensmModeObserved: z.array(z.string().min(1)),
    ensmModeAdmittedForStreaming: z.array(z.string().min(1)),
    txLevelControl: z.object({
      attribute: z.string().min(1),
      liveValueDb: z.number(),
      attenuationRangeDb: z.tuple([z.number(), z.number()]),
      rfPortSelect: z.array(z.string().min(1)),
    }).strict(),
    linkSustainedCeilingBytesPerSecond: z.object({
      value: z.number().positive(),
      provenance: z.string().min(1),
      ci16CeilingSamplesPerSecond: z.number().positive(),
    }).strict(),
    deviceLoop: z.object({
      clientSupport: z.string().min(1),
      boardSupport: z.string().min(1),
      nativeRateCeilingHz: z.number().int().positive(),
      bufferMemoryCapBytes: z.object({
        value: z.number().int().positive(),
        provenance: z.string().min(1),
      }).strict(),
    }).strict(),
    pllLockObservability: z.string().min(1),
    knownUnitFailure: z.string().min(1),
  }).strict(),
  profileCapability: z.array(txStreamProfileCapabilityRowSchema)
    .length(SYNTHESIZED_SIGNAL_PROFILES.length),
  recipes: z.array(txStreamRecipeRowSchema).min(1),
}).strict().superRefine((document, context) => {
  for (const [index, row] of document.profileCapability.entries()) {
    if (row.profileId !== SYNTHESIZED_SIGNAL_PROFILES[index]) {
      context.addIssue({
        code: 'custom',
        path: ['profileCapability', index, 'profileId'],
        message: 'Profile capability rows must exactly match the closed profile order',
      });
      break;
    }
  }
  const recipeIds = document.recipes.map((recipe) => recipe.recipeId);
  if (new Set(recipeIds).size !== recipeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['recipes'],
      message: 'Recipe identifiers must be unique',
    });
  }
});
export type TxStreamContractDocument = z.infer<typeof txStreamContractDocumentSchema>;

/**
 * Load and admit the tx-stream contract document by exact byte hash, then
 * runtime-validate its schema. Fail-closed on missing file, drifted bytes, or
 * schema deviation. The optional override exists so bundled CLI geometry can
 * resolve the document outside the source tree.
 */
export async function loadTxStreamContract(
  documentUrl?: URL,
): Promise<TxStreamContractDocument> {
  const url = documentUrl
    ?? new URL('../contracts/signal-lab-tx-stream-v1.json', import.meta.url);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(url);
  } catch (error) {
    throw new Error(`Tx stream contract document is unreadable at ${url.href}: ${String(error)}`);
  }
  const hash = sha256HexOfBytes(bytes);
  if (hash !== TX_STREAM_CONTRACT_SHA256) {
    throw new Error(
      `Tx stream contract document hash ${hash} does not match the pinned `
      + `${TX_STREAM_CONTRACT_SHA256}; refusing drifted contract bytes`,
    );
  }
  return txStreamContractDocumentSchema.parse(
    JSON.parse(new TextDecoder('utf-8').decode(bytes)),
  );
}

/** Contract binding identity, mirroring the bridge's binding construction. */
export function txStreamGeneratorBindingSha256(contractSha256: string): string {
  return sha256HexOfBytes(`${TX_STREAM_CONTRACT_ID}\u0000${contractSha256}`);
}

export type { SynthesizedSignalProfile };
