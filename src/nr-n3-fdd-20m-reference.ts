import {
  NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES,
  generateNrFr1TestModelFrame,
  type NrFr1TestModelFrame,
} from './nr-fr1-test-model-reference.js';

export const NR_N3_FDD_20M_PROFILE = 'nr-n3-fdd-20m' as const;

export const NR_N3_FDD_20M_BINDING = Object.freeze({
  testModelSpecification:
    '3GPP TS 38.141-1 V19.4.0 (Release 19)' as const,
  rfSpecification: '3GPP TS 38.104 V19.4.0 (Release 19)' as const,
  physicalLayerSpecification:
    '3GPP TS 38.211 V19.4.0 (Release 19)' as const,
  model: 'NR-FR1-TM1.1' as const,
  operatingBand: 'n3' as const,
  duplex: 'fdd' as const,
  downlinkCenterHz: 1_840_000_000 as const,
  downlinkNrArfcn: 368_000 as const,
  channelBandwidthHz: 20_000_000 as const,
  nominalGridBandwidthHz: 19_080_000 as const,
  physicalCellId: 1 as const,
  subcarrierSpacingHz: 15_000 as const,
  resourceBlockCount: 106 as const,
  activeSubcarrierCount: 1_272 as const,
  fftSize: 2_048 as const,
  sampleRateHz: 30_720_000 as const,
  frameDurationMs: 10 as const,
  frameSampleCount: 307_200 as const,
  slotsPerFrame: 10 as const,
  symbolsPerSlot: 14 as const,
  cyclicPrefix: 'normal' as const,
  windowingPercent: 0 as const,
});

export const NR_N3_FDD_20M_REFERENCE_IDENTITIES = Object.freeze({
  gridCf64leSha256:
    NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES['nr-fr1-tm1.1']
      .gridCf64leSha256,
  timeCf64leSha256:
    NR_FR1_TEST_MODEL_REFERENCE_IDENTITIES['nr-fr1-tm1.1']
      .timeCf64leSha256,
  catalogCf32leSha256:
    '7f414f94209d56138a6d43d66230f2d851794c740fd668d330673c87251514f1',
});

export interface NrN3Fdd20mFrame {
  readonly metadata: {
    readonly profileId: typeof NR_N3_FDD_20M_PROFILE;
    readonly model: 'NR-FR1-TM1.1';
    readonly qualification:
      'independently-verified-fixed-digital-baseband';
    readonly verificationBasis:
      'content-identical-nr-fr1-tm1.1-compositional-oracle';
    readonly standardsComplianceClaimed: false;
    readonly rfConformanceClaimed: false;
    readonly productCertificationClaimed: false;
    readonly qualificationScope: string;
    readonly binding: typeof NR_N3_FDD_20M_BINDING;
    readonly inheritedReference: {
      readonly profileId: 'nr-fr1-tm1.1';
      readonly gridCf64leSha256: string;
      readonly timeCf64leSha256: string;
      readonly catalogCf32leSha256: string;
    };
    readonly requirementLedger: readonly {
      readonly requirement: string;
      readonly specification: string;
      readonly clauses: readonly string[];
      readonly implementationEvidence: string;
    }[];
    readonly excludedScope: readonly string[];
  };
  readonly grid: NrFr1TestModelFrame['grid'];
  readonly timeDomain: NrFr1TestModelFrame['timeDomain'];
}

const REQUIREMENT_LEDGER = Object.freeze([
  Object.freeze({
    requirement:
      'One fixed NR-FR1-TM1.1 FDD frame at the n3 1.840 GHz channel-raster binding, 20 MHz channel bandwidth, 15 kHz SCS, normal CP, 106 RB, and PCI 1',
    specification:
      '3GPP TS 38.141-1 V19.4.0, TS 38.104 V19.4.0, and TS 38.211 V19.4.0',
    clauses: Object.freeze([
      '38.141-1 4.9.2.2, 4.9.2.2.1, 4.9.2.3.1, and 4.9.2.3.2',
      '38.104 Tables 5.2-1, 5.3.2-1, 5.3.5-1, 5.4.2.1-1, and 5.4.2.3-1',
      '38.211 4.2-4.4, 5.1.3, 5.2.1, 5.3, 7.3, and 7.4',
    ]),
    implementationEvidence:
      'The digital-baseband artifact is byte-for-byte the independently verified nr-fr1-tm1.1 artifact. The only distinct binding is the valid n3 channel-raster center/NR-ARFCN metadata; no carrier-frequency phase compensation is applied or claimed.',
  }),
]);

/**
 * Bind the already independently verified fixed NR-FR1-TM1.1 digital
 * artifact to the catalog profile's valid n3 1.840 GHz channel-raster
 * coordinate.
 *
 * Carrier center is metadata for this zero-IF artifact. The resource grid and
 * time samples are intentionally identical to the exhaustive py3gpp-verified
 * nr-fr1-tm1.1 vector. This compositional proof does not imply RF conformance.
 */
export function generateNrN3Fdd20mFrame(): NrN3Fdd20mFrame {
  const inherited = generateNrFr1TestModelFrame('nr-fr1-tm1.1');
  if (
    inherited.metadata.model !== 'NR-FR1-TM1.1'
    || inherited.metadata.channelBandwidthHz !== 20_000_000
    || inherited.metadata.nominalGridBandwidthHz !== 19_080_000
    || inherited.metadata.subcarrierSpacingHz !== 15_000
    || inherited.metadata.resourceBlockCount !== 106
    || inherited.metadata.physicalCellId !== 1
    || inherited.metadata.sampleRateHz !== 30_720_000
    || inherited.metadata.sampleCount !== 307_200
    || inherited.metadata.duplex !== 'fdd'
    || inherited.metadata.cyclicPrefix !== 'normal'
    || inherited.metadata.qualification
      !== 'independently-verified-fixed-digital-baseband'
  ) {
    throw new Error(
      'nr-n3-fdd-20m inherited TM1.1 binding changed without requalification',
    );
  }
  return {
    metadata: {
      profileId: NR_N3_FDD_20M_PROFILE,
      model: 'NR-FR1-TM1.1',
      qualification: 'independently-verified-fixed-digital-baseband',
      verificationBasis:
        'content-identical-nr-fr1-tm1.1-compositional-oracle',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
      qualificationScope:
        'One fixed, content-addressable, impairment-free NR-FR1-TM1.1 zero-IF digital-baseband frame at 20 MHz/15 kHz/106 RB/PCI1. Its complete grid and all 307,200 samples are identical to the pinned py3gpp-verified artifact; the valid 1.840 GHz n3 center and NR-ARFCN 368000 are a metadata binding only.',
      binding: NR_N3_FDD_20M_BINDING,
      inheritedReference: {
        profileId: 'nr-fr1-tm1.1',
        ...NR_N3_FDD_20M_REFERENCE_IDENTITIES,
      },
      requirementLedger: REQUIREMENT_LEDGER,
      excludedScope: Object.freeze([
        'Any carrier center, bandwidth, SCS, band, cell identity, layer count, antenna port, frame duration, or test model other than the pinned binding.',
        'Nonzero-carrier phase compensation, RF upconversion, resampling, filtering, windowing, clipping, or impairments.',
        'Conducted or radiated RF conformance, calibration, measurement uncertainty, analyzer verdicts, regulatory approval, and product certification.',
      ]),
    },
    grid: inherited.grid,
    timeDomain: inherited.timeDomain,
  };
}
