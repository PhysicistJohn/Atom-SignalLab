import {
  LTE_NTM_ACTIVE_SUBCARRIERS,
  LTE_NTM_CELL_ID,
  LTE_NTM_FFT_SIZE,
  LTE_NTM_FRAME_SAMPLES,
  LTE_NTM_HOST_CELL_ID,
  LTE_NTM_NARROWBAND_GRID_HZ,
  LTE_NTM_REFERENCE_IDENTITIES,
  LTE_NTM_SAMPLE_RATE_HZ,
  generateLteNtmReferenceFrame,
  type LteNtmReferenceFrame,
} from './lte-ntm-reference.js';

export const NR_NBIOT_INBAND_COMPONENT_PROFILE =
  'nr-nbiot-inband-isolated-component' as const;

export const NR_NBIOT_INBAND_COMPONENT_BINDING = Object.freeze({
  parentSpecification:
    '3GPP TS 38.141-1 V19.4.0 (Release 19)' as const,
  importedTestModelSpecification:
    '3GPP TS 36.141 V19.1.0 (Release 19)' as const,
  physicalLayerSpecification:
    '3GPP TS 36.211 V19.3.0 (Release 19)' as const,
  parentClauses: Object.freeze([
    '38.141-1 4.9.2.2.9',
    '38.141-1 4.9.2.4',
    '38.141-1 4.9.3',
  ] as const),
  importedClauses: Object.freeze([
    '36.141 6.1.3',
    '36.141 6.1.4',
    '36.141 6.1.6 (N-TM component only)',
    '36.211 10.2.3-10.2.8',
  ] as const),
  fixedWaveform:
    'TS-36.141-N-TM-inband-isolated-component' as const,
  deploymentMode: 'inband-different-pci-isolated-component' as const,
  physicalCellId: LTE_NTM_CELL_ID,
  hostPhysicalCellId: LTE_NTM_HOST_CELL_ID,
  subcarrierSpacingHz: 15_000 as const,
  activeSubcarrierCount: LTE_NTM_ACTIVE_SUBCARRIERS,
  nominalGridBandwidthHz: LTE_NTM_NARROWBAND_GRID_HZ,
  fftSize: LTE_NTM_FFT_SIZE,
  sampleRateHz: LTE_NTM_SAMPLE_RATE_HZ,
  frameDurationMs: 10 as const,
  frameSampleCount: LTE_NTM_FRAME_SAMPLES,
  cyclicPrefix: 'normal' as const,
  parentDisplayCenterHz: 3_500_010_000 as const,
  zeroIfComponent: true as const,
  nrHostIncluded: false as const,
  eligiblePuncturedRbPlacementIncluded: false as const,
  hostComponentPowerAllocationIncluded: false as const,
});

export const NR_NBIOT_INBAND_COMPONENT_REFERENCE_IDENTITIES =
  Object.freeze({
    gridCf64leSha256:
      LTE_NTM_REFERENCE_IDENTITIES[
        'lte-nbiot-inband-isolated-component'
      ].gridCf64leSha256,
    timeCf64leSha256:
      LTE_NTM_REFERENCE_IDENTITIES[
        'lte-nbiot-inband-isolated-component'
      ].timeCf64leSha256,
  });

export interface NrNbiotInbandComponentReferenceFrame {
  readonly metadata: {
    readonly profileId:
      typeof NR_NBIOT_INBAND_COMPONENT_PROFILE;
    readonly qualification:
      'independently-verified-fixed-digital-component';
    readonly verificationBasis:
      'content-identical-to-ts36.141-ntm-inband-component-oracle';
    readonly standardsComplianceClaimed: false;
    readonly nrNtmCompositeClaimed: false;
    readonly rfConformanceClaimed: false;
    readonly productCertificationClaimed: false;
    readonly qualificationScope: string;
    readonly binding: typeof NR_NBIOT_INBAND_COMPONENT_BINDING;
    readonly inheritedReference: {
      readonly profileId:
        'lte-nbiot-inband-isolated-component';
      readonly gridCf64leSha256: string;
      readonly timeCf64leSha256: string;
    };
    readonly requirementLedger: readonly {
      readonly requirement: string;
      readonly specification: string;
      readonly clauses: readonly string[];
      readonly implementationEvidence: string;
    }[];
    readonly excludedScope: readonly string[];
  };
  readonly grid: LteNtmReferenceFrame['grid'];
  readonly timeDomain: LteNtmReferenceFrame['timeDomain'];
}

const REQUIREMENT_LEDGER = Object.freeze([
  Object.freeze({
    requirement:
      'The exact imported TS 36.141 N-TM in-band different-PCI digital component used as the NB-IoT part of the TS 38.141-1 NR-N-TM construction',
    specification:
      '3GPP TS 38.141-1 V19.4.0, TS 36.141 V19.1.0, and TS 36.211 V19.3.0',
    clauses: Object.freeze([
      '38.141-1 4.9.2.2.9 and 4.9.2.4',
      '36.141 6.1.3, 6.1.4, and 6.1.6 (component only)',
      '36.211 10.2.3-10.2.8',
    ]),
    implementationEvidence:
      'Every resource element and every OFDM sample is content-identical to the independently verified fixed TS 36.141 N-TM in-band component artifact.',
  }),
]);

/**
 * Bind the independently verified TS 36.141 N-TM in-band component to its
 * role in TS 38.141-1 NR-N-TM.
 *
 * This profile is deliberately component-only. It does not add the
 * NR-FR1-TM1.1 host, puncture an eligible NR RB, choose left/right placement,
 * or implement manufacturer-specific host/component power allocation.
 */
export function generateNrNbiotInbandComponentReferenceFrame(
): NrNbiotInbandComponentReferenceFrame {
  const inherited = generateLteNtmReferenceFrame(
    'lte-nbiot-inband-isolated-component',
  );
  if (
    inherited.metadata.profileId
      !== 'lte-nbiot-inband-isolated-component'
    || inherited.metadata.deploymentMode
      !== 'inband-different-pci-isolated-component'
    || inherited.metadata.physicalCellId !== LTE_NTM_CELL_ID
    || inherited.metadata.hostPhysicalCellId !== LTE_NTM_HOST_CELL_ID
    || inherited.metadata.compositeHostIncluded !== false
    || inherited.metadata.subcarrierSpacingHz !== 15_000
    || inherited.metadata.sampleRateHz !== LTE_NTM_SAMPLE_RATE_HZ
    || inherited.metadata.sampleCount !== LTE_NTM_FRAME_SAMPLES
  ) {
    throw new Error(
      'NR NB-IoT component inherited N-TM binding changed without requalification',
    );
  }
  const identities =
    LTE_NTM_REFERENCE_IDENTITIES[
      'lte-nbiot-inband-isolated-component'
    ];
  if (
    identities.gridCf64leSha256.length !== 64
    || identities.timeCf64leSha256.length !== 64
  ) {
    throw new Error(
      'NR NB-IoT component requires pinned passing N-TM oracle identities',
    );
  }
  return {
    metadata: {
      profileId: NR_NBIOT_INBAND_COMPONENT_PROFILE,
      qualification:
        'independently-verified-fixed-digital-component',
      verificationBasis:
        'content-identical-to-ts36.141-ntm-inband-component-oracle',
      standardsComplianceClaimed: false,
      nrNtmCompositeClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
      qualificationScope:
        'One fixed, content-addressable, impairment-free TS 36.141 N-TM in-band different-PCI component used by TS 38.141-1 NR-N-TM. The complete 1-RB grid and all 19,200 zero-IF samples are identical to the independently verified inherited artifact. The parent NR carrier, punctured-RB placement, and power allocation are excluded.',
      binding: NR_NBIOT_INBAND_COMPONENT_BINDING,
      inheritedReference: {
        profileId: 'lte-nbiot-inband-isolated-component',
        ...identities,
      },
      requirementLedger: REQUIREMENT_LEDGER,
      excludedScope: Object.freeze([
        'The complete TS 38.141-1 clause 4.9.2.2.9 NR-N-TM composite, including its NR-FR1-TM1.1 host.',
        'Selection or frequency placement of the eligible punctured NR RB closest to the NR minimum guard band.',
        'Manufacturer-declared rated carrier power, NB-IoT maximum power dynamic range, and host/component RE power allocation.',
        'RF upconversion, conducted or radiated RF conformance, calibration, measurement uncertainty, regulatory approval, and product certification.',
      ]),
    },
    grid: inherited.grid,
    timeDomain: inherited.timeDomain,
  };
}
