import {
  canonicalJsonString,
  parseStandardsArtifactManifest,
  sha256HexOfChunks,
  standardsArtifactConfigurationSha256,
  standardsArtifactManifestSha256,
  type CanonicalJsonObject,
  type StandardsArtifactBundleCandidate,
  type StandardsArtifactManifest,
  type StandardsToolIdentity,
} from './standards-artifact.js';
import {
  createStandardsGenerationRequest,
  standardsGenerationRequestSchema,
  type StandardsArtifactProvider,
  type StandardsGenerationRequest,
} from './standards-provider.js';
import {
  LTE_ETM1_1_10MHZ_FDD_PILOT,
  generateLteEtm11ReferenceFrame,
} from './lte-etm1-reference.js';
import { LTE_ETM_1_1_10_MHZ_FDD_PRESET } from './standards-waveform.js';

const PRESET_ID = 'lte-etm-1-1-10mhz-fdd';
const PRESET_REVISION = '2.0.0';
const RECIPE_ID = 'lte-etm-1-1-10mhz-fdd-reference-frame';
const RECIPE_REVISION = '1.0.1';
const ARTIFACT_ID = 'lte-etm-1-1-10mhz-fdd-frame';
const ARTIFACT_LOCATION = 'waveforms/lte/lte-etm-1-1-10mhz-fdd-frame.cf64le';
const FRAME_SAMPLE_COUNT = 153_600;
const SAMPLE_RATE_HZ = 15_360_000;
const BYTES_PER_COMPLEX_FLOAT64_SAMPLE = 16;
const PAYLOAD_CHUNK_BYTES = 64 * 1_024;

const EXPECTED_PRESET_VALUES = Object.freeze({
  'radio.accessTechnology': 'E-UTRA',
  'link.direction': 'downlink',
  'testModel.name': 'E-TM 1.1',
  'channel.duplexMode': 'FDD',
  'channel.bandwidthHz': 10_000_000,
  'resourceGrid.resourceBlocks': 50,
  'resourceGrid.subcarrierSpacingHz': 15_000,
  'resourceGrid.cyclicPrefix': 'normal',
  'transmission.antennaPorts': 1,
  'transmission.codewords': 1,
  'transmission.layers': 1,
  'transmission.precoding': false,
  'sampling.sampleRateHz': SAMPLE_RATE_HZ,
  'capture.radioFrames': 1,
  'capture.subframes': 10,
  'capture.durationMs': 10,
  'frame.startSystemFrameNumber': 0,
  'frame.startSlotNumber': 0,
  'cell.physicalCellId': 1,
  'control.symbolsPerSubframe': 1,
  'phich.groups': 2,
  'phich.channelsPerGroup': 2,
  'pdcch.channels': 5,
  'pdcch.controlChannelElementsPerPdcch': 2,
  'pdsch.modulation': 'QPSK',
  'pdsch.resourceBlocks': 50,
  'pdsch.rnti': 0,
  'payload.unscrambledBits': 'all-zero',
} as const);

export const LTE_ETM1_1_REFERENCE_PROVIDER_IDENTITY: StandardsToolIdentity = Object.freeze({
  providerId: 'signallab',
  providerName: 'SignalLab',
  productName: 'SignalLab LTE reference waveform provider',
  productVersion: '0.1.0',
  implementationId: 'signallab.lte-etm1-reference',
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function assertPresetBinding(): void {
  const preset = LTE_ETM_1_1_10_MHZ_FDD_PRESET;
  if (
    preset.presetId !== PRESET_ID
    || preset.revision !== PRESET_REVISION
    || preset.family !== 'lte'
    || preset.configuration.schemaId !== 'signallab.lte.reference-generator-configuration.v1'
  ) {
    throw new Error('LTE E-TM1.1 provider is not bound to the expected preset revision');
  }

  const expectedEntries = Object.entries(EXPECTED_PRESET_VALUES);
  if (preset.configuration.parameters.length !== expectedEntries.length) {
    throw new Error('LTE E-TM1.1 preset parameter set changed without a provider recipe revision');
  }
  const observedValues = new Map<string, string | number | boolean>();
  for (const parameter of preset.configuration.parameters) {
    if (observedValues.has(parameter.key)) {
      throw new Error(`LTE E-TM1.1 preset repeats configuration key ${parameter.key}`);
    }
    observedValues.set(parameter.key, parameter.value.value);
  }
  for (const [key, expectedValue] of expectedEntries) {
    if (
      !observedValues.has(key)
      || !Object.is(observedValues.get(key), expectedValue)
    ) {
      throw new Error(`LTE E-TM1.1 preset value ${key} no longer matches the fixed provider`);
    }
  }
}

assertPresetBinding();

export const LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION = deepFreeze(
  structuredClone(LTE_ETM_1_1_10_MHZ_FDD_PRESET.configuration),
) as unknown as CanonicalJsonObject;

export const LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION_SHA256 =
  '60e4b8ab807a79952863f556f8580e723dbf93bf951203822908e02e7719bb18';

if (
  standardsArtifactConfigurationSha256(LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION)
  !== LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION_SHA256
) {
  throw new Error(
    'LTE E-TM1.1 preset configuration bytes changed without a provider recipe revision',
  );
}

/**
 * Frozen content identity for recipe revision 1.0.1.
 *
 * This is a generator regression identity, not independent standards evidence.
 */
export const LTE_ETM1_1_REFERENCE_CF64LE_SHA256 =
  '1cb66b49be2518ea33a2bbf1f7075b54e6e62e10a9c05491a0ba4727bfe05511';

export interface LteEtm11ReferenceGenerationRequestOptions {
  readonly expectedArtifactSha256?: string;
}

/**
 * Constructs the only generation request accepted by this provider.
 *
 * The qualification is intentionally fixed to `reference-generated`. Promotion
 * by an independent oracle, clause-level test campaign, or RF laboratory is a
 * separate operation and is not asserted by this generator.
 */
export function createLteEtm11ReferenceGenerationRequest(
  options: LteEtm11ReferenceGenerationRequestOptions = {},
): StandardsGenerationRequest {
  return createStandardsGenerationRequest({
    presetId: PRESET_ID,
    presetRevision: PRESET_REVISION,
    family: 'lte',
    recipeId: RECIPE_ID,
    recipeRevision: RECIPE_REVISION,
    configuration: structuredClone(LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION),
    requestedQualification: 'reference-generated',
    ...(options.expectedArtifactSha256 === undefined
      ? {}
      : { expectedArtifactSha256: options.expectedArtifactSha256 }),
  });
}

interface EncodedReferenceFrame {
  readonly bytes: Uint8Array;
  readonly contentSha256: string;
}

function assertGeneratedFrameGeometry(
  frame: ReturnType<typeof generateLteEtm11ReferenceFrame>,
): void {
  const metadata = frame.metadata;
  const configuration = metadata.physicalChannelConfiguration;
  const exactGeometry = (
    metadata.profileId === LTE_ETM1_1_10MHZ_FDD_PILOT.profileId
    && metadata.qualification
      === 'standards-derived-digital-candidate-not-independently-verified'
    && metadata.complianceClaimed === false
    && metadata.physicalCellId === 1
    && metadata.frameNumberModuloFour === 0
    && metadata.radioFrameDurationMs === 10
    && metadata.duplex === 'fdd'
    && metadata.cyclicPrefix === 'normal'
    && metadata.antennaPorts.length === 1
    && metadata.antennaPorts[0] === 0
    && metadata.resourceBlockCount === 50
    && metadata.subcarrierSpacingHz === 15_000
    && metadata.activeSubcarrierCount === 600
    && metadata.fftSize === 1_024
    && metadata.sampleRateHz === SAMPLE_RATE_HZ
    && metadata.sampleCount === FRAME_SAMPLE_COUNT
    && frame.timeDomain.sampleCount === FRAME_SAMPLE_COUNT
    && frame.timeDomain.real.length === FRAME_SAMPLE_COUNT
    && frame.timeDomain.imaginary.length === FRAME_SAMPLE_COUNT
    && configuration.controlSymbolCount === 1
    && configuration.cfi === 1
    && configuration.phichNg === '1/6'
    && configuration.phichGroupCount === 2
    && configuration.phichPerGroup === 2
    && configuration.phichSequenceIndices.length === 2
    && configuration.phichSequenceIndices[0] === 0
    && configuration.phichSequenceIndices[1] === 4
    && configuration.pdcchCount === 5
    && configuration.ccesPerPdcch === 2
    && configuration.pdschResourceBlockCount === 50
    && configuration.pdschRnti === 0
    && metadata.requirementLedger.every(
      (requirement) => requirement.independentVerification === 'not-performed',
    )
  );
  if (!exactGeometry) {
    throw new Error('LTE E-TM1.1 generator output no longer matches the fixed provider geometry');
  }
}

function encodeReferenceFrame(): EncodedReferenceFrame {
  const frame = generateLteEtm11ReferenceFrame();
  assertGeneratedFrameGeometry(frame);

  const bytes = new Uint8Array(FRAME_SAMPLE_COUNT * BYTES_PER_COMPLEX_FLOAT64_SAMPLE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let sample = 0; sample < FRAME_SAMPLE_COUNT; sample += 1) {
    const real = frame.timeDomain.real[sample]!;
    const imaginary = frame.timeDomain.imaginary[sample]!;
    if (!Number.isFinite(real) || !Number.isFinite(imaginary)) {
      throw new Error(`LTE E-TM1.1 generator emitted a non-finite sample at index ${sample}`);
    }
    const byteOffset = sample * BYTES_PER_COMPLEX_FLOAT64_SAMPLE;
    view.setFloat64(byteOffset, real, true);
    view.setFloat64(byteOffset + 8, imaginary, true);
  }

  const contentSha256 = sha256HexOfChunks(bytes);
  if (contentSha256 !== LTE_ETM1_1_REFERENCE_CF64LE_SHA256) {
    throw new Error(
      'LTE E-TM1.1 payload bytes changed without a provider recipe revision',
    );
  }
  return Object.freeze({
    bytes,
    contentSha256,
  });
}

function replayablePayload(bytes: Uint8Array): Iterable<Uint8Array> {
  return Object.freeze({
    *[Symbol.iterator](): Iterator<Uint8Array> {
      for (let offset = 0; offset < bytes.byteLength; offset += PAYLOAD_CHUNK_BYTES) {
        yield bytes.slice(offset, Math.min(offset + PAYLOAD_CHUNK_BYTES, bytes.byteLength));
      }
    },
  });
}

function requestMatchesFixedRecipe(request: StandardsGenerationRequest): boolean {
  return (
    request.presetId === PRESET_ID
    && request.presetRevision === PRESET_REVISION
    && request.family === 'lte'
    && request.recipeId === RECIPE_ID
    && request.recipeRevision === RECIPE_REVISION
    && request.requestedQualification === 'reference-generated'
    && request.configurationSha256 === LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION_SHA256
    && canonicalJsonString(request.configuration)
      === canonicalJsonString(LTE_ETM1_1_REFERENCE_PROVIDER_CONFIGURATION)
  );
}

export class LteEtm11ReferenceArtifactProvider implements StandardsArtifactProvider {
  readonly identity = LTE_ETM1_1_REFERENCE_PROVIDER_IDENTITY;
  #encodedFrame: Promise<EncodedReferenceFrame> | undefined;

  async supports(requestInput: StandardsGenerationRequest): Promise<boolean> {
    const parsed = standardsGenerationRequestSchema.safeParse(requestInput);
    if (!parsed.success || !requestMatchesFixedRecipe(parsed.data)) return false;
    if (parsed.data.expectedArtifactSha256 === undefined) return true;
    const frame = await this.#encodedReferenceFrame();
    return parsed.data.expectedArtifactSha256 === frame.contentSha256;
  }

  async generate(requestInput: StandardsGenerationRequest): Promise<StandardsArtifactBundleCandidate> {
    const parsed = standardsGenerationRequestSchema.safeParse(requestInput);
    if (!parsed.success || !await this.supports(parsed.data)) {
      throw new RangeError('Unsupported LTE E-TM1.1 reference generation request');
    }
    const request = parsed.data;
    const frame = await this.#encodedReferenceFrame();
    const manifestInput: StandardsArtifactManifest = {
      schemaVersion: 1,
      preset: {
        presetId: PRESET_ID,
        revision: PRESET_REVISION,
        family: 'lte',
      },
      qualification: 'reference-generated',
      qualificationBoundary: {
        complianceClaim: 'not-claimed',
        externalValidationEvidence: 'not-provided',
        statement: 'This manifest binds the exact digital-baseband bytes from the fixed LTE E-TM1.1 reference recipe. Independent verification, broad 3GPP compliance, and conducted or radiated RF conformance are not claimed.',
      },
      recipe: {
        tool: this.identity,
        recipeId: RECIPE_ID,
        recipeRevision: RECIPE_REVISION,
        deterministic: true,
        configuration: structuredClone(request.configuration),
        configurationSha256: request.configurationSha256,
      },
      artifact: {
        artifactId: ARTIFACT_ID,
        kind: 'complex-iq',
        location: ARTIFACT_LOCATION,
        mediaType: 'application/vnd.signallab.complex-iq',
        contentSha256: frame.contentSha256,
        generatorConfigurationSha256: request.configurationSha256,
        byteLength: frame.bytes.byteLength,
        channelCount: 1,
        channels: [
          {
            channelIndex: 0,
            role: 'antenna-port',
            antennaPort: 0,
            label: 'LTE antenna port 0',
          },
        ],
        complexSamplesPerChannel: FRAME_SAMPLE_COUNT,
        sampleRateHz: SAMPLE_RATE_HZ,
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
          samplesPerFrame: FRAME_SAMPLE_COUNT,
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
    const manifest = parseStandardsArtifactManifest(manifestInput);
    return Object.freeze({
      manifest,
      manifestSha256: standardsArtifactManifestSha256(manifest),
      chunks: replayablePayload(frame.bytes),
    });
  }

  #encodedReferenceFrame(): Promise<EncodedReferenceFrame> {
    this.#encodedFrame ??= Promise.resolve().then(encodeReferenceFrame);
    return this.#encodedFrame;
  }
}

export const LTE_ETM1_1_REFERENCE_ARTIFACT_PROVIDER =
  new LteEtm11ReferenceArtifactProvider();
