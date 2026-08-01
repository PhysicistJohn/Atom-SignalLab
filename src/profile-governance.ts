import type { SynthesizedSignalProfile } from './contracts.js';
import { GERAN_FIXED_CATALOG_CF32LE_SHA256 } from './geran-fixed-identities.js';
import { LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256 } from './lte-band3-fdd-20m-catalog-iq.js';
import { LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256 } from './lte-band38-tdd-10m-catalog-iq.js';
import { LTE_NTM_CATALOG_CF32LE_SHA256 } from './lte-ntm-catalog-iq.js';
import { NR_REMAINING_FIXED_CF32LE_SHA256 } from './nr-remaining-fixed-catalog-iq.js';
import {
  profileGovernanceSchema,
  type GoverningBody,
  type GovernanceOrganization,
  type NormativeReference,
  type ProfileGovernance,
} from './profile-governance-schema.js';

const reference = (
  organization: NormativeReference['organization'],
  documentId: string,
  revision: string,
  clauses: readonly string[],
  url: string,
): NormativeReference => ({ organization, documentId, revision, clauses, url });

const selectedClauses = (
  document: NormativeReference,
  clauses: readonly string[],
): NormativeReference => ({ ...document, clauses });

const TS_45_002 = reference('3GPP', 'TS 45.002', '19.0.0', ['4.3', '5.2.3.1', '5.2.3.2', '5.2.3.3', '5.2.3a', '5.2.6'], 'https://www.3gpp.org/ftp/Specs/archive/45_series/45.002/45002-j00.zip');
const TS_45_003 = reference('3GPP', 'TS 45.003', '19.0.0', ['4.1.1-4.1.5', '4.4'], 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145003/19.00.00_60/ts_145003v190000p.pdf');
const TS_45_004 = reference('3GPP', 'TS 45.004', '19.0.0', ['2', '2.1', '3', '3.1', '5', '5.1', '6', '6.1'], 'https://www.3gpp.org/ftp/Specs/archive/45_series/45.004/45004-j00.zip');
const TS_36_104 = reference('3GPP', 'TS 36.104', '19.2.0', ['5.6'], 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.104/36104-j20.zip');
const TS_36_141 = reference('3GPP', 'TS 36.141', '19.1.0', ['6.1.1', '6.1.3', '6.1.4.1-6.1.4.5', '6.1.5', '6.1.6'], 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.141/36141-j10.zip');
const TS_36_211 = reference('3GPP', 'TS 36.211', '19.3.0', ['4', '6', '6.2.3', '6.10.1', '6.11', '6.12', '10.2.2.1'], 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.211/36211-j30.zip');
const TS_36_212 = reference('3GPP', 'TS 36.212', '19.3.0', ['5.3.4', '5.3.5'], 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.212/36212-j30.zip');
const TS_36_213_V19_3 = reference('3GPP', 'TS 36.213', '19.3.0', ['6.9'], 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.213/36213-j30.zip');
const TS_36_213 = reference('3GPP', 'TS 36.213', '19.4.0', ['7', 'Table 7.1.7.1-1A'], 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.213/36213-j40.zip');

const TS_38_101_1 = reference('3GPP', 'TS 38.101-1', '19.4.0', ['5.3.2', '5.3.5'], 'https://www.etsi.org/deliver/etsi_ts/138100_138199/13810101/19.04.00_60/ts_13810101v190400p.pdf');
const TS_38_101_2 = reference('3GPP', 'TS 38.101-2', '19.4.0', ['5.3.2', '5.3.5'], 'https://www.etsi.org/deliver/etsi_ts/138100_138199/13810102/19.04.00_60/ts_13810102v190400p.pdf');
const TS_38_104_V19_4 = reference('3GPP', 'TS 38.104', '19.4.0', ['5.2', '5.3.2', '5.3.5', '5.4.2.3'], 'https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/19.04.00_60/ts_138104v190400p.pdf');
const TS_38_104 = reference('3GPP', 'TS 38.104', '19.5.0', ['5.2', '5.3.2', '5.3.5', '5.4.2.3'], 'https://www.3gpp.org/ftp/Specs/archive/38_series/38.104/38104-j50.zip');
const TS_38_141_1_V19_4 = reference('3GPP', 'TS 38.141-1', '19.4.0', ['4.9.2.2', '4.9.2.2.1', '4.9.2.2.5', '4.9.2.2.6', '4.9.2.2.6A', '4.9.2.3'], 'https://www.etsi.org/deliver/etsi_ts/138100_138199/13814101/19.04.00_60/ts_13814101v190400p.pdf');
const TS_38_141_1 = reference('3GPP', 'TS 38.141-1', '19.5.0', ['4.9.2.2.1', '4.9.2.2.5', '4.9.2.2.6', '4.9.2.2.6A', '4.9.2.2.9'], 'https://www.3gpp.org/ftp/Specs/archive/38_series/38.141-1/38141-1-j50.zip');
const TS_38_141_2 = reference('3GPP', 'TS 38.141-2', '19.5.0', ['4.9.2', '6'], 'https://www.3gpp.org/ftp/Specs/archive/38_series/38.141-2/38141-2-j50.zip');
const TS_38_211 = reference('3GPP', 'TS 38.211', '19.4.0', ['4.2', '4.3', '4.4', '5', '7'], 'https://www.3gpp.org/ftp/Specs/archive/38_series/38.211/38211-j40.zip');
const TS_38_213 = reference('3GPP', 'TS 38.213', '19.3.0', ['11.1'], 'https://www.etsi.org/deliver/etsi_ts/138200_138299/138213/19.03.00_60/ts_138213v190300p.pdf');
const TS_38_214 = reference('3GPP', 'TS 38.214', '19.4.0', ['5.1.2.2.2', '5.1.3.1'], 'https://www.3gpp.org/ftp/Specs/archive/38_series/38.214/38214-j40.zip');
const TS_38_331 = reference('3GPP', 'TS 38.331', '19.1.0', ['6.3.2 TDD-UL-DL-ConfigCommon'], 'https://www.etsi.org/deliver/etsi_ts/138300_138399/138331/19.01.00_60/ts_138331v190100p.pdf');

const IEEE_802_11 = reference('IEEE', 'IEEE 802.11-2024', '2024', ['15', '17', '26', '27'], 'https://standards.ieee.org/ieee/802.11/10548/');
const BLUETOOTH_BR_PHY = reference('Bluetooth SIG', 'Bluetooth Core 6.3, Vol 2, Part A', '6.3', ['2', '3.1.1'], 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/radio-physical-layer-specification.html');
const BLUETOOTH_BR_BASEBAND = reference('Bluetooth SIG', 'Bluetooth Core 6.3, Vol 2, Part B', '6.3', ['6.1-6.6', '7.1-7.4'], 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/baseband-specification.html');
const BLUETOOTH_BR_SAMPLE_DATA = reference('Bluetooth SIG', 'Bluetooth Core 6.3, Vol 2, Part G', '6.3', ['2.1', '3', '4', '5', '6.1', '8'], 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/sample-data.html');
const BLUETOOTH_LE_PHY = reference('Bluetooth SIG', 'Bluetooth Core 6.3, Vol 6, Part A', '6.3', ['2', '3'], 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/radio-physical-layer-specification.html');
const BLUETOOTH_LE_LINK = reference('Bluetooth SIG', 'Bluetooth Core 6.3, Vol 6, Part B', '6.3', ['2.1', '2.3.1', '3.1', '3.2', '4.4.2'], 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/link-layer-specification.html');
const BLUETOOTH_LE_SAMPLE_DATA = reference('Bluetooth SIG', 'Bluetooth Core 6.3, Vol 6, Part C', '6.3', ['4.1', '4.2.1'], 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/sample-data.html');

const fixedBlockers = Object.freeze([
  'No content-addressed waveform artifact with independent passing evidence is bound to this operator profile.',
  'No conducted-RF or radiated-OTA conformance evidence is represented by SignalLab tests.',
]);
const builderBlockers = Object.freeze([
  'An operator-selected configuration is not a fixed waveform artifact.',
  'No content-addressed generated artifact or independent passing evidence is bound to the selection.',
]);
const mathematicalBlockers = Object.freeze([
  'No unique normative waveform standard applies to this mathematical laboratory reference.',
  'SignalLab tests do not provide RF calibration or conformance evidence.',
]);

function fixed(
  profileId: SynthesizedSignalProfile,
  normativeReferences: readonly NormativeReference[],
  testLocation: string,
  reason = 'The implementation is a deterministic standards-derived engineering projection; its tests cover declared implementation behavior, not standards compliance.',
  signalKind: ProfileGovernance['signalKind'] = 'normative-fixed-profile',
): ProfileGovernance {
  return parseAndFreeze({
    schemaVersion: 1,
    profileId,
    signalKind,
    governingOrganizations: governingOrganizations(normativeReferences),
    governingBodies: governingBodyDetails(governingOrganizations(normativeReferences)),
    normativeReferences,
    applicability: {
      status: 'applicable',
      reason: 'The cited clauses govern parameters represented by this fixed profile; other protocol and RF conformance requirements remain outside its claim scope.',
    },
    implementedQualificationState: 'standards-derived-engineering-projection',
    testedClaimScope: {
      kind: 'deterministic-engineering-projection',
      statement: 'Tests verify deterministic generation and declared implementation invariants only; they do not establish bit-exact, protocol, digital-conformance, or RF-conformance equivalence.',
      testLocations: [testLocation],
    },
    claims: {
      standardsCompliance: 'not-claimed',
      digitalStandardsAdherence: 'not-verified',
      digitalQualification: 'not-qualified',
      rfConformance: 'not-qualified',
    },
    digitalQualificationEvidence: null,
    qualificationBlockers: fixedBlockers,
    reason,
  });
}

function engineeringProfile(
  profileId: SynthesizedSignalProfile,
  normativeReferences: readonly NormativeReference[],
  testLocation: string,
): ProfileGovernance {
  return fixed(
    profileId,
    normativeReferences,
    testLocation,
    'This is a deterministic standards-parameterized observable engineering profile, not a complete protocol waveform or conformance vector.',
    'standards-derived-engineering-profile',
  );
}

function componentFixture(
  profileId: SynthesizedSignalProfile,
  normativeReferences: readonly NormativeReference[],
  testLocation: string,
): ProfileGovernance {
  return fixed(
    profileId,
    normativeReferences,
    testLocation,
    'This is an isolated standards component fixture. It omits the host/composite context required for the complete normative test model.',
    'standards-component-fixture',
  );
}

function digitallyQualified(
  profileId: SynthesizedSignalProfile,
  normativeReferences: readonly NormativeReference[],
  artifactSha256: string,
  independentEvidenceSha256: string,
  independentEvidenceReportPath: string,
  oracleProvider: string,
  suite: string,
  testLocations: readonly string[],
  reason: string,
  signalKind: Extract<
    ProfileGovernance['signalKind'],
    'normative-fixed-profile' | 'standards-component-fixture'
  > = 'normative-fixed-profile',
): ProfileGovernance {
  return parseAndFreeze({
    schemaVersion: 1,
    profileId,
    signalKind,
    governingOrganizations: governingOrganizations(normativeReferences),
    governingBodies: governingBodyDetails(governingOrganizations(normativeReferences)),
    normativeReferences,
    applicability: {
      status: 'applicable',
      reason: 'The digital qualification is confined to the exact content-addressed fixed configuration and cited clauses; it does not transfer to another configuration or to an RF implementation.',
    },
    implementedQualificationState: 'digitally-qualified',
    testedClaimScope: {
      kind: 'content-bound-independent-digital-baseband',
      statement: 'Tests bind the complete fixed complex-baseband artifact to its generator recipe and compare the applicable digital construction with a separately implemented pinned oracle.',
      testLocations,
    },
    claims: {
      standardsCompliance: 'not-claimed',
      digitalStandardsAdherence: 'verified-for-declared-digital-scope',
      digitalQualification: 'qualified',
      rfConformance: 'not-qualified',
    },
    digitalQualificationEvidence: {
      artifact: {
        sha256: artifactSha256,
        mediaType: 'application/vnd.tinysa.complex-f32',
        producer: digitalArtifactProducer(profileId),
      },
      independentEvidence: {
        sha256: independentEvidenceSha256,
        reportPath: independentEvidenceReportPath,
        result: 'pass',
        oracleProvider,
        suite,
      },
    },
    qualificationBlockers: [
      'The qualification is content-bound digital baseband, not a broad implementation or product standards-compliance claim.',
      'No conducted-RF or radiated-OTA conformance evidence is represented by SignalLab tests.',
    ],
    reason,
  });
}

function digitalArtifactProducer(profileId: SynthesizedSignalProfile): string {
  if (profileId.startsWith('nr-')) return 'SignalLab Release-19 exact NR generator';
  if (profileId.startsWith('lte-')) return 'SignalLab Release-19 exact LTE generator';
  if (profileId.startsWith('gsm-')) return 'SignalLab Release-19 exact GERAN generator';
  if (profileId.startsWith('wifi')) return 'SignalLab IEEE 802.11-2024 fixed-PPDU generator';
  if (profileId.startsWith('bluetooth-')) {
    return 'SignalLab Bluetooth Core 6.3 fixed-packet generator';
  }
  throw new Error(`${profileId} has no digital artifact producer identity`);
}

function builder(
  profileId: SynthesizedSignalProfile,
  normativeReferences: readonly NormativeReference[],
): ProfileGovernance {
  return parseAndFreeze({
    schemaVersion: 1,
    profileId,
    signalKind: 'operator-defined-builder',
    governingOrganizations: governingOrganizations(normativeReferences),
    governingBodies: governingBodyDetails(governingOrganizations(normativeReferences)),
    normativeReferences,
    applicability: {
      status: 'configuration-only',
      reason: 'The cited clauses constrain selectable parameters, but a builder is not itself a normative fixed waveform or conformance vector.',
    },
    implementedQualificationState: 'standards-derived-engineering-projection',
    testedClaimScope: {
      kind: 'configuration-constraints-only',
      statement: 'Tests cover the implemented option lattice, deterministic resolution, and descriptor projection; they do not qualify any operator-selected waveform.',
      testLocations: ['src/custom-waveform.test.ts'],
    },
    claims: {
      standardsCompliance: 'not-claimed',
      digitalStandardsAdherence: 'configuration-only',
      digitalQualification: 'not-qualified',
      rfConformance: 'not-qualified',
    },
    digitalQualificationEvidence: null,
    qualificationBlockers: builderBlockers,
    reason: 'This profile is a configuration tool only. Standards-constrained selections must not be represented as a compliant or digitally qualified waveform.',
  });
}

function mathematical(
  profileId: SynthesizedSignalProfile,
  testLocation: string,
): ProfileGovernance {
  return parseAndFreeze({
    schemaVersion: 1,
    profileId,
    signalKind: 'mathematical-lab-reference',
    governingOrganizations: ['TinySA SignalLab'],
    governingBodies: governingBodyDetails(['TinySA SignalLab']),
    normativeReferences: [],
    applicability: {
      status: 'not-applicable',
      reason: 'There is no unique governing waveform standard for this generic mathematical laboratory signal.',
    },
    implementedQualificationState: 'mathematical-reference',
    testedClaimScope: {
      kind: 'deterministic-mathematical-reference',
      statement: 'Tests cover the deterministic mathematical construction and numerical invariants only.',
      testLocations: [testLocation],
    },
    claims: {
      standardsCompliance: 'not-claimed',
      digitalStandardsAdherence: 'not-applicable',
      digitalQualification: 'not-qualified',
      rfConformance: 'not-qualified',
    },
    digitalQualificationEvidence: null,
    qualificationBlockers: mathematicalBlockers,
    reason: 'Standards compliance is not applicable; this is a deterministic laboratory reference, not a calibrated RF source or conformance waveform.',
  });
}

const geranLoadedReferences = [
  selectedClauses(TS_45_002, ['4.3', '5.2.3.1', '5.2.6']),
  selectedClauses(TS_45_003, ['4.1.1-4.1.5', '4.4']),
  selectedClauses(TS_45_004, ['2.1-2.6']),
] as const;
const geranGmskReferences = [
  selectedClauses(TS_45_002, ['4.3', '5.2.3.1']),
  selectedClauses(TS_45_003, ['4.1.1-4.1.5']),
  selectedClauses(TS_45_004, ['2.1-2.6']),
] as const;
const geranHigherRateReferences = [
  selectedClauses(TS_45_002, ['4.3', '5.2.3a']),
  selectedClauses(TS_45_004, ['5.1-5.6']),
] as const;
const geranAqpskReferences = [
  selectedClauses(TS_45_002, ['4.3', '5.2.3.2']),
  selectedClauses(TS_45_004, ['6.1-6.6']),
] as const;
const geran8PskReferences = [
  selectedClauses(TS_45_002, ['4.3', '5.2.3.3']),
  selectedClauses(TS_45_004, ['3.1-3.6']),
] as const;

function qualifiedGeran(
  profileId: keyof typeof GERAN_FIXED_CATALOG_CF32LE_SHA256,
  normativeReferences: readonly NormativeReference[],
  signalKind: Extract<
    ProfileGovernance['signalKind'],
    'normative-fixed-profile' | 'standards-component-fixture'
  >,
): ProfileGovernance {
  const carriesXCchCoding = profileId === 'gsm-900-loaded-bcch'
    || profileId === 'gsm-normal-burst';
  return digitallyQualified(
    profileId,
    normativeReferences,
    GERAN_FIXED_CATALOG_CF32LE_SHA256[profileId],
    'b24f818661bf6ced2d5f2c0a01e7305ba21c4ce49e21fb08ab9799c51e6b051b',
    'validation/geran-release19-fixed-digital-baseband-oracles-2026-07-27.json',
    carriesXCchCoding
      ? 'Separately structured GERAN sample oracle and pinned libosmocore xCCH oracle'
      : 'Separately structured GERAN modulation sample oracle',
    carriesXCchCoding
      ? 'Every fixed TS 45.002/45.004 sample plus complete fixed xCCH encode/decode'
      : 'Every fixed TS 45.002 burst-field and TS 45.004 modulation sample',
    [
      'src/geran-fixed-independent-oracle.test.ts',
      'src/geran-fixed-oracle-evidence.test.ts',
    ],
    carriesXCchCoding
      ? 'The exact four-frame GMSK fixed artifact, including its frozen xCCH block, is independently digitally verified. A complete BCCH 51-multiframe, RF conformance, and product certification are excluded.'
      : 'The exact frozen modulator-input burst fixture is independently verified through TS 45.002 field geometry and TS 45.004 sample construction. No TS 45.003 channel-coding, RF-conformance, or product claim is made.',
    signalKind,
  );
}

const lteBand3References = [
  selectedClauses(TS_36_104, ['5.5', '5.6']),
  selectedClauses(TS_36_141, ['6.1.1.1 and Table 6.1.1.1-1', '6.1.2']),
  selectedClauses(TS_36_211, ['4.1', '6.2.1-6.2.4', '6.3-6.12', '7.1.2']),
  selectedClauses(TS_36_212, ['5.3.4-5.3.5']),
] as const;
const lteBand38References = [
  selectedClauses(TS_36_104, ['5.5', '5.6']),
  selectedClauses(TS_36_211, ['4.2 Tables 4.2-1 and 4.2-2', '6.2.1-6.2.4', '6.3-6.12']),
  selectedClauses(TS_36_213_V19_3, ['6.9']),
] as const;
const lteEtmReferences = (
  testModelClause: string,
  modulationClause: string,
): readonly NormativeReference[] => [
  selectedClauses(TS_36_104, ['5.5', '5.6']),
  selectedClauses(TS_36_141, [testModelClause, '6.1.2']),
  selectedClauses(TS_36_211, [
    '4.1',
    '6.2.1-6.2.4',
    '6.3-6.12',
    '7.2',
    modulationClause,
  ]),
  selectedClauses(TS_36_212, ['5.3.4-5.3.5']),
];
const lteEtm11References = lteEtmReferences(
  '6.1.1.1 and Table 6.1.1.1-1',
  '7.1.2',
);
const lteEtm31References = lteEtmReferences(
  '6.1.1.4 and Table 6.1.1.4-1',
  '7.1.4',
);
const lteEtm31aReferences = lteEtmReferences('6.1.1.4a', '7.1.5');
const lteEtm31bReferences = lteEtmReferences('6.1.1.4b', '7.1.6');
const lteNtmReferences = [
  selectedClauses(TS_36_141, ['6.1.3', '6.1.4.1-6.1.4.5']),
  selectedClauses(TS_36_211, ['6.2.3', '10.2.3-10.2.8']),
] as const;
const lteGuardComponentReferences = [
  selectedClauses(TS_36_141, ['6.1.3', '6.1.4.1-6.1.4.5', '6.1.5']),
  selectedClauses(TS_36_211, ['6.2.3', '10.2.3-10.2.8']),
] as const;
const lteInbandComponentReferences = [
  selectedClauses(TS_36_141, ['6.1.3', '6.1.4.1-6.1.4.5', '6.1.6']),
  selectedClauses(TS_36_211, ['6.2.3', '10.2.3-10.2.8']),
] as const;

const LTE_REMAINING_EVIDENCE_SHA256 =
  'f25ebfb28e6f967907516731cee10d7642ff46f774482bb3399f9d7d023cd5b9' as const;

function qualifiedRemainingLte(
  profileId:
    | 'lte-band3-fdd-20m'
    | 'lte-band38-tdd-10m'
    | 'lte-ntm'
    | 'lte-nbiot-guard-isolated-component'
    | 'lte-nbiot-inband-isolated-component',
  normativeReferences: readonly NormativeReference[],
  artifactSha256: string,
  reason: string,
  signalKind: Extract<
    ProfileGovernance['signalKind'],
    'normative-fixed-profile' | 'standards-component-fixture'
  > = 'normative-fixed-profile',
): ProfileGovernance {
  return digitallyQualified(
    profileId,
    normativeReferences,
    artifactSha256,
    LTE_REMAINING_EVIDENCE_SHA256,
    'validation/lte-fixed-independent-oracles-2026-07-27.json',
    'Pinned srsRAN_4G LTE PHY oracle',
    'Exhaustive fixed resource-grid and OFDM-sample comparison',
    [
      'src/lte-fixed-oracle-evidence.test.ts',
      'src/lte-band3-fdd-20m-independent-oracle.test.ts',
      'src/lte-band38-tdd-10m-independent-oracle.test.ts',
      'src/lte-ntm-independent-oracle.test.ts',
    ],
    reason,
    signalKind,
  );
}

const nrTmReferences = (
  testModelClause: string,
  modulationClause: string,
): readonly NormativeReference[] => [
  selectedClauses(TS_38_104_V19_4, [
    '5.2 Table 5.2-1',
    '5.3.2 Table 5.3.2-1',
    '5.3.5 Table 5.3.5-1',
    '5.4.2.3 Table 5.4.2.3-1',
  ]),
  selectedClauses(TS_38_141_1_V19_4, [
    '4.9.2.2',
    testModelClause,
    '4.9.2.3',
    '4.9.2.3.1-4.9.2.3.2',
  ]),
  selectedClauses(TS_38_211, [
    '4.2-4.4',
    '5.2.1',
    '5.3',
    modulationClause,
    '7.3.1',
    '7.3.2',
    '7.4.1.1',
    '7.4.1.3',
  ]),
  selectedClauses(TS_38_214, ['5.1.2.2.2']),
];
const nrTm11References = nrTmReferences('4.9.2.2.1', '5.1.3');
const nrTm31References = nrTmReferences('4.9.2.2.5', '5.1.5');
const nrTm31aReferences = nrTmReferences('4.9.2.2.6', '5.1.6');
const nrTm31bReferences = nrTmReferences('4.9.2.2.6A', '5.1.7');
const nrN3References = nrTm11References;
const nrN78TddReferences = [
  ...nrTmReferences(
    '4.9.2.2.1 and Table 4.9.2.2-1 prescribed TDD pattern',
    '5.1.3',
  ),
  selectedClauses(TS_38_331, ['6.3.2 TDD-UL-DL-ConfigCommon']),
  selectedClauses(TS_38_213, ['11.1']),
] as const;
const nrNarrowbandReferences = [
  selectedClauses(TS_38_141_1_V19_4, ['4.9.2.2.9', '4.9.2.4']),
  selectedClauses(TS_36_141, ['6.1.3', '6.1.4.1-6.1.4.5']),
  selectedClauses(TS_36_211, ['6.2.3', '10.2.3-10.2.8']),
] as const;

const NR_REMAINING_EVIDENCE_SHA256 =
  '47950c3f49b63275302101be61b46035f0ec628cc26e80ff0e1e32af5fc454ce' as const;

function qualifiedRemainingNr(
  profileId:
    | 'nr-n3-fdd-20m'
    | 'nr-n78-tdd-100m'
    | 'nr-nbiot-inband-isolated-component',
  normativeReferences: readonly NormativeReference[],
  reason: string,
  signalKind: Extract<
    ProfileGovernance['signalKind'],
    'normative-fixed-profile' | 'standards-component-fixture'
  > = 'normative-fixed-profile',
): ProfileGovernance {
  return digitallyQualified(
    profileId,
    normativeReferences,
    NR_REMAINING_FIXED_CF32LE_SHA256[profileId],
    NR_REMAINING_EVIDENCE_SHA256,
    'validation/nr-remaining-fixed-digital-oracles-2026-07-27.json',
    profileId === 'nr-nbiot-inband-isolated-component'
      ? 'Pinned srsRAN_4G LTE PHY oracle'
      : 'Pinned py3gpp 0.6.0 / NumPy 2.0.2 oracle',
    profileId === 'nr-nbiot-inband-isolated-component'
      ? 'Exhaustive imported N-TM component grid and OFDM-sample comparison'
      : 'Exhaustive fixed NR resource-grid and OFDM-sample comparison',
    [
      'src/nr-remaining-fixed-oracle-evidence.test.ts',
      'src/nr-n78-tdd-100m-independent-oracle.test.ts',
      'src/nr-fr1-test-model-independent-oracle.test.ts',
    ],
    reason,
    signalKind,
  );
}

const ieeeHrDsssReferences = [
  selectedClauses(IEEE_802_11, [
    '9.2.4.8',
    '9.3.1.4',
    '16.2.2.2',
    '16.2.3.2-16.2.3.8',
    '16.2.4-16.2.5',
    '16.3.6.3-16.3.6.4',
    '16.3.6.6.1-16.3.6.6.4',
  ]),
] as const;
const ieeeErpOfdmReferences = [
  selectedClauses(IEEE_802_11, [
    '9.2.4.8',
    '9.3.1.4',
    '17.3.2-17.3.5.10',
    '17.3.11',
    '18.3.2.4',
    '18.3.3.2',
    '18.4.3',
  ]),
] as const;
const ieeeHeSuReferences = [
  selectedClauses(IEEE_802_11, [
    '27.1.4',
    '27.3.2.2',
    '27.3.4',
    '27.3.6.1-27.3.6.10',
    '27.3.7',
    '27.3.9-27.3.13',
  ]),
] as const;
const ieeeHeErSuReferences = [
  selectedClauses(IEEE_802_11, [
    '27.1.4',
    '27.3.2.2',
    '27.3.4',
    '27.3.6.1-27.3.6.10',
    '27.3.6.6',
    '27.3.11.7',
    '27.3.12-27.3.13',
  ]),
] as const;
const ieeeHeMuReferences = [
  selectedClauses(IEEE_802_11, [
    '27.3.1.1',
    '27.3.2.2',
    '27.3.2.5',
    '27.3.3.1',
    '27.3.4',
    '27.3.6.11',
    '27.3.8',
    '27.3.10-27.3.13',
    '27.3.16',
  ]),
] as const;
const ieeeHeTbReferences = [
  selectedClauses(IEEE_802_11, [
    '9.3.1.22',
    '26.5.2',
    '27.2.3',
    '27.3.1.1-27.3.1.2',
    '27.3.2.6',
    '27.3.3.2',
    '27.3.4',
    '27.3.6.10',
    '27.3.10-27.3.13',
    '27.3.15',
  ]),
] as const;

const registry = {
  cw: mathematical('cw', 'src/complex-iq.test.ts'),
  am: mathematical('am', 'src/complex-iq.test.ts'),
  fm: mathematical('fm', 'src/complex-iq.test.ts'),

  'gsm-900-loaded-bcch': qualifiedGeran(
    'gsm-900-loaded-bcch',
    geranLoadedReferences,
    'normative-fixed-profile',
  ),
  'gsm-normal-burst': qualifiedGeran(
    'gsm-normal-burst',
    geranGmskReferences,
    'normative-fixed-profile',
  ),
  'gsm-qpsk-higher-symbol-rate-burst': qualifiedGeran(
    'gsm-qpsk-higher-symbol-rate-burst',
    geranHigherRateReferences,
    'standards-component-fixture',
  ),
  'gsm-aqpsk-normal-burst': qualifiedGeran(
    'gsm-aqpsk-normal-burst',
    geranAqpskReferences,
    'standards-component-fixture',
  ),
  'gsm-8psk-normal-burst': qualifiedGeran(
    'gsm-8psk-normal-burst',
    geran8PskReferences,
    'standards-component-fixture',
  ),
  'gsm-16qam-higher-symbol-rate-burst': qualifiedGeran(
    'gsm-16qam-higher-symbol-rate-burst',
    geranHigherRateReferences,
    'standards-component-fixture',
  ),
  'gsm-32qam-higher-symbol-rate-burst': qualifiedGeran(
    'gsm-32qam-higher-symbol-rate-burst',
    geranHigherRateReferences,
    'standards-component-fixture',
  ),

  'lte-band3-fdd-20m': qualifiedRemainingLte(
    'lte-band3-fdd-20m',
    lteBand3References,
    LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256,
    'The exact 20 MHz Band 3 FDD E-TM1.1 frame is independently digitally verified. Qualification is confined to the fixed clean bytes; alternate geometry, RF, and product conformance are excluded.',
  ),
  'lte-band38-tdd-10m': qualifiedRemainingLte(
    'lte-band38-tdd-10m',
    lteBand38References,
    LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256,
    'The exact 10 MHz Band 38 TDD downlink fixture is independently digitally verified. It is not represented as a named E-TM; RF and product conformance are excluded.',
    'standards-component-fixture',
  ),
  'lte-etm1.1': digitallyQualified(
    'lte-etm1.1',
    lteEtm11References,
    '64515628a900f0422e67c8cdd9b2209c70aaaa467f1d533f99080ac110f340c7',
    '55cae4fcaa514dfe6ffdd6baf25c84a0915131b7403aad095c3d4727b593d34f',
    'validation/lte-etm1-srsran-oracle-2026-07-27.json',
    'srsRAN Project LTE PHY oracle',
    'Complete E-TM1.1 resource-grid and OFDM-frame comparison',
    [
      'src/lte-etm1-catalog-iq.test.ts',
      'src/lte-etm1-independent-oracle.test.ts',
      'src/lte-etm1-oracle-evidence.test.ts',
    ],
    'The exact 10 MHz FDD, normal-CP, PCI-1 E-TM1.1 cf32le frame is independently digitally verified. The claim is limited to those bytes and excludes RF and product conformance.',
  ),
  'lte-etm3.1': digitallyQualified(
    'lte-etm3.1',
    lteEtm31References,
    '5472e9cd8c923bd62da527d0b2f5d655aa516b5e762a27ed29ca21817f124219',
    'e3c3eed68d9453573569821e0c56ac045d8b898012e584ccd09dae9590fb6dab',
    'validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json',
    'Pinned srsRAN_4G plus zero-import full-frame and 64QAM oracles',
    'Every E-TM3.1 grid classification/value and OFDM sample, with independently implemented Gold, 64QAM, resource mapping, IFFT, and CP',
    [
      'src/lte-etm3-catalog-iq.test.ts',
      'src/lte-etm3-independent-oracle.test.ts',
      'src/lte-etm3-oracle-evidence.test.ts',
    ],
    'The exact 10 MHz FDD, normal-CP, PCI-1 E-TM3.1 cf32le frame is independently digitally verified across every grid element, grid classification, and OFDM sample, with separately implemented Gold, 64QAM, mapping, IFFT, and CP logic anchored to fresh pinned srsRAN output. RF and product conformance are excluded.',
  ),
  'lte-etm3.1a': digitallyQualified(
    'lte-etm3.1a',
    lteEtm31aReferences,
    '4e552324f32862337b31f9cb6a94deb8a306655770570f2ec84b30ec808ffc85',
    'e3c3eed68d9453573569821e0c56ac045d8b898012e584ccd09dae9590fb6dab',
    'validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json',
    'Pinned srsRAN_4G plus zero-import full-frame and 256QAM oracles',
    'Every E-TM3.1a grid classification/value and OFDM sample, with independently implemented Gold, 256QAM, resource mapping, IFFT, and CP',
    [
      'src/lte-etm3-catalog-iq.test.ts',
      'src/lte-etm3-independent-oracle.test.ts',
      'src/lte-etm3-oracle-evidence.test.ts',
    ],
    'The exact 10 MHz FDD, normal-CP, PCI-1 E-TM3.1a cf32le frame is independently digitally verified across every grid element, grid classification, and OFDM sample, with separately implemented Gold, 256QAM, mapping, IFFT, and CP logic anchored to fresh pinned srsRAN output. RF and product conformance are excluded.',
  ),
  'lte-etm3.1b': digitallyQualified(
    'lte-etm3.1b',
    lteEtm31bReferences,
    'e55e2253f32ff9ff7cfb04f6c4ca36bb5acf53e00764f547a5788f7221310e9f',
    'e3c3eed68d9453573569821e0c56ac045d8b898012e584ccd09dae9590fb6dab',
    'validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json',
    'Pinned srsRAN_4G, OCUDU, and zero-import full-frame oracles',
    'Every E-TM3.1b grid classification/value and OFDM sample, with independently implemented Gold, 1024QAM, resource mapping, IFFT, and CP',
    [
      'src/lte-etm3-catalog-iq.test.ts',
      'src/lte-etm3-independent-oracle.test.ts',
      'src/lte-etm3-oracle-evidence.test.ts',
    ],
    'The exact 10 MHz FDD, normal-CP, PCI-1 E-TM3.1b cf32le frame is independently digitally verified across every grid element, grid classification, and OFDM sample, with separately implemented Gold, 1024QAM, mapping, IFFT, and CP logic anchored to fresh pinned srsRAN and OCUDU output. RF and product conformance are excluded.',
  ),
  'lte-ntm': qualifiedRemainingLte(
    'lte-ntm',
    lteNtmReferences,
    LTE_NTM_CATALOG_CF32LE_SHA256['lte-ntm'],
    'The exact fixed N-TM frame is independently digitally verified. Its engineering display coordinate, RF behavior, and product conformance are excluded.',
  ),
  'lte-nbiot-guard-isolated-component': qualifiedRemainingLte(
    'lte-nbiot-guard-isolated-component',
    lteGuardComponentReferences,
    LTE_NTM_CATALOG_CF32LE_SHA256['lte-nbiot-guard-isolated-component'],
    'The exact isolated N-TM component is independently digitally verified. The required E-TM1.1 host, host-relative guard placement, and host/component power allocation are absent, so the complete guard-band composite is not claimed.',
    'standards-component-fixture',
  ),
  'lte-nbiot-inband-isolated-component': qualifiedRemainingLte(
    'lte-nbiot-inband-isolated-component',
    lteInbandComponentReferences,
    LTE_NTM_CATALOG_CF32LE_SHA256['lte-nbiot-inband-isolated-component'],
    'The exact isolated in-band N-TM component is independently digitally verified. The required E-TM1.1 host, punctured-RB placement, retained host resources, and host/component power allocation are absent, so the complete in-band composite is not claimed.',
    'standards-component-fixture',
  ),

  'nr-n3-fdd-20m': qualifiedRemainingNr(
    'nr-n3-fdd-20m',
    nrN3References,
    'The exact n3 FDD 20 MHz NR-FR1-TM1.1 frame at 1.840 GHz / ARFCN 368000 is independently digitally verified. Alternate geometry, RF, and product conformance are excluded.',
  ),
  'nr-n78-tdd-100m': qualifiedRemainingNr(
    'nr-n78-tdd-100m',
    nrN78TddReferences,
    'The exact n78 TDD 100 MHz NR-FR1-TM1.1 frame uses the TS 38.141-1 prescribed 7-DL-slot plus mixed-slot and 2-UL-slot pattern and is independently digitally verified. Alternate geometry, RF, and product conformance are excluded.',
  ),
  'nr-fr1-tm1.1': digitallyQualified(
    'nr-fr1-tm1.1',
    nrTm11References,
    '7f414f94209d56138a6d43d66230f2d851794c740fd668d330673c87251514f1',
    '1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54',
    'validation/nr-fr1-test-model-independent-oracles-2026-07-27.json',
    'py3gpp 0.6.0 / NumPy 2.0.2 oracle',
    'Exhaustive fixed-frame resource-grid and OFDM-sample comparison',
    [
      'src/nr-fr1-test-model-reference.test.ts',
      'src/nr-fr1-test-model-independent-oracle.test.ts',
      'src/nr-fr1-test-model-catalog-iq.test.ts',
      'src/nr-fr1-test-model-oracle-evidence.test.ts',
    ],
    'The exact n3 FDD, 20 MHz, 15 kHz-SCS, 106-RB, PCI-1 NR-FR1-TM1.1 cf32le frame is independently digitally verified. Alternate geometries, RF, and product conformance are excluded.',
  ),
  'nr-fr1-tm3.1': digitallyQualified(
    'nr-fr1-tm3.1',
    nrTm31References,
    'e890371a8fa9a484692859cf9ed447bbee09ba5b32b25ed8d92b55146d062839',
    '1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54',
    'validation/nr-fr1-test-model-independent-oracles-2026-07-27.json',
    'py3gpp 0.6.0 / NumPy 2.0.2 oracle',
    'Exhaustive fixed-frame resource-grid and OFDM-sample comparison',
    [
      'src/nr-fr1-test-model-reference.test.ts',
      'src/nr-fr1-test-model-independent-oracle.test.ts',
      'src/nr-fr1-test-model-catalog-iq.test.ts',
      'src/nr-fr1-test-model-oracle-evidence.test.ts',
    ],
    'The exact n3 FDD, 20 MHz, 15 kHz-SCS, 106-RB, PCI-1 NR-FR1-TM3.1 cf32le frame is independently digitally verified. Alternate geometries, RF, and product conformance are excluded.',
  ),
  'nr-fr1-tm3.1a': digitallyQualified(
    'nr-fr1-tm3.1a',
    nrTm31aReferences,
    'fc205447482fe7929fdc52b8f5684f50557511903e7e2c387011169dea06dabb',
    '1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54',
    'validation/nr-fr1-test-model-independent-oracles-2026-07-27.json',
    'py3gpp 0.6.0 / NumPy 2.0.2 oracle',
    'Exhaustive fixed-frame resource-grid and OFDM-sample comparison',
    [
      'src/nr-fr1-test-model-reference.test.ts',
      'src/nr-fr1-test-model-independent-oracle.test.ts',
      'src/nr-fr1-test-model-catalog-iq.test.ts',
      'src/nr-fr1-test-model-oracle-evidence.test.ts',
    ],
    'The exact n3 FDD, 20 MHz, 15 kHz-SCS, 106-RB, PCI-1 NR-FR1-TM3.1a cf32le frame is independently digitally verified. Alternate geometries, RF, and product conformance are excluded.',
  ),
  'nr-fr1-tm3.1b': digitallyQualified(
    'nr-fr1-tm3.1b',
    nrTm31bReferences,
    'd18a5441ea8bcfb3fbc0478241ce6e3e4b916594c8646ce50829939b97e47671',
    '1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54',
    'validation/nr-fr1-test-model-independent-oracles-2026-07-27.json',
    'py3gpp 0.6.0 / NumPy 2.0.2 and OCUDU mapper oracles',
    'Exhaustive fixed-frame comparison plus all 1,024 1024QAM words',
    [
      'src/nr-fr1-test-model-reference.test.ts',
      'src/nr-fr1-test-model-independent-oracle.test.ts',
      'src/nr-fr1-test-model-catalog-iq.test.ts',
      'src/nr-fr1-test-model-oracle-evidence.test.ts',
    ],
    'The exact n3 FDD, 20 MHz, 15 kHz-SCS, 106-RB, PCI-1 NR-FR1-TM3.1b cf32le frame is independently digitally verified, including every 1024QAM input word against OCUDU. Alternate geometries, RF, and product conformance are excluded.',
  ),
  'nr-nbiot-inband-isolated-component': qualifiedRemainingNr(
    'nr-nbiot-inband-isolated-component',
    nrNarrowbandReferences,
    'The exact imported N-TM component is independently digitally verified. The NR-FR1-TM1.1 host, eligible punctured-RB placement, and host/component power allocation are absent, so the complete NR-N-TM composite is not claimed.',
    'standards-component-fixture',
  ),

  'wifi-hr-dsss-11m': digitallyQualified(
    'wifi-hr-dsss-11m',
    ieeeHrDsssReferences,
    'e356f1009fd814d667952673ed230320bcd463369bcf2eb219eb69ca2b3595e8',
    '9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18',
    'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json',
    'Separately structured exhaustive IEEE 802.11 HR-DSSS/CCK decoder',
    'Every fixed complex chip decoded through Barker/CCK, descrambling, PLCP, PSDU, and CRC',
    [
      'src/wlan-fixed-iq.test.ts',
      'src/wlan-fixed-oracle-evidence.test.ts',
    ],
    'The exact long-preamble 11 Mb/s HR-DSSS ACK PPDU is independently verified at its 11 Mchip/s ideal complex-chip interface. Pulse shaping, RF, MAC channel access, interoperability, certification, and regulatory approval are excluded.',
  ),
  'wifi-ofdm-20m': digitallyQualified(
    'wifi-ofdm-20m',
    ieeeErpOfdmReferences,
    'c035c7661b7c2b5b1ad6bcfb65dda903f6ef92bc230c0c54b332f974cb92a1c8',
    '9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18',
    'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json',
    'Pinned gr-ieee802-11 and separately structured direct-DFT decoder',
    'Complete fixed ERP-OFDM ACK PPDU and 2.4 GHz signal extension',
    [
      'src/wlan-fixed-iq.test.ts',
      'src/wlan-fixed-independent-oracle.test.ts',
      'src/wlan-fixed-oracle-evidence.test.ts',
    ],
    'The exact 20 Msamples/s 6 Mb/s ERP-OFDM ACK PPDU and six-microsecond signal extension are independently digitally verified. RF, MAC channel access, interoperability, certification, and regulatory approval are excluded.',
  ),
  'wifi6-he-su': digitallyQualified(
    'wifi6-he-su',
    ieeeHeSuReferences,
    '640fd2bfe140511d14ac9f9583ceadbe86e904e2759fb154bc5fc1fc002e7453',
    '9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18',
    'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json',
    'Separately structured IEEE 802.11 HE sample-domain decoder',
    'Complete fixed HE SU PPDU DFT, field, data, CRC, and RU-grid recovery',
    [
      'src/wlan-he-fixed-iq.test.ts',
      'src/wlan-fixed-oracle-evidence.test.ts',
    ],
    'The exact fixed 20 MHz HE SU PPDU is independently digitally verified at 20 Msamples/s. RF, MAC channel access, interoperability, certification, and regulatory approval are excluded.',
  ),
  'wifi6-he-er-su': digitallyQualified(
    'wifi6-he-er-su',
    ieeeHeErSuReferences,
    '9b183de8f31f5002c3d03fbe39bf4d68477e67a69b04e06ba4008e6ffceec74f',
    '9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18',
    'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json',
    'Separately structured IEEE 802.11 HE sample-domain decoder',
    'Complete fixed HE ER SU PPDU DFT, repeated/QBPSK field, data, CRC, and RU-grid recovery',
    [
      'src/wlan-he-fixed-iq.test.ts',
      'src/wlan-fixed-oracle-evidence.test.ts',
    ],
    'The exact fixed 20 MHz HE ER SU PPDU is independently digitally verified at 20 Msamples/s. RF, MAC channel access, interoperability, certification, and regulatory approval are excluded.',
  ),
  'wifi6-he-mu': digitallyQualified(
    'wifi6-he-mu',
    ieeeHeMuReferences,
    '5f403d8407c1d02177c59dd03333599c4ebf658af9a936fa790ccd8930b63392',
    '9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18',
    'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json',
    'Separately structured IEEE 802.11 HE sample-domain decoder',
    'Complete fixed two-user HE MU PPDU DFT, HE-SIG-B, data, CRC, and RU-grid recovery',
    [
      'src/wlan-he-fixed-iq.test.ts',
      'src/wlan-fixed-oracle-evidence.test.ts',
    ],
    'The exact fixed 20 MHz two-user HE MU PPDU is independently digitally verified at 20 Msamples/s. RF, scheduling policy, MAC channel access, interoperability, certification, and regulatory approval are excluded.',
  ),
  'wifi6-he-tb': digitallyQualified(
    'wifi6-he-tb',
    ieeeHeTbReferences,
    'b465c7a7a56c537b17d7f2e0aa7dd996591d7e5a3b1bcdc2503bb167becdf789',
    '9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18',
    'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json',
    'Separately structured IEEE 802.11 HE trigger and sample-domain decoder',
    'Complete fixed Trigger/TXVECTOR plus HE TB PPDU DFT, field, data, CRC, and RU-grid recovery',
    [
      'src/wlan-he-fixed-iq.test.ts',
      'src/wlan-fixed-oracle-evidence.test.ts',
    ],
    'The exact fixed nominal 20 MHz HE TB PPDU and its Basic Trigger are independently digitally verified at 20 Msamples/s. RF timing/frequency tolerance, MAC exchange behavior, interoperability, certification, and regulatory approval are excluded.',
  ),

  'bluetooth-classic-connected': digitallyQualified(
    'bluetooth-classic-connected',
    [BLUETOOTH_BR_PHY, BLUETOOTH_BR_BASEBAND, BLUETOOTH_BR_SAMPLE_DATA],
    'ee2975f261478a52e95e454423e5d4f36ff175a515befd34d6370bea980fe158',
    'bdf32b159891a033f7d3609f53667d000444f3ddc5c4bbaf058fdede947f6d87',
    'validation/bluetooth-core63-fixed-packet-digital-oracles-2026-07-27.json',
    'Separately structured Bluetooth Core sample and ideal-GFSK test oracle',
    'Complete fixed packet-vector and every-active-sample digital comparison',
    [
      'src/bluetooth-iq.test.ts',
      'src/bluetooth-fixed-independent-oracle.test.ts',
      'src/bluetooth-fixed-oracle-evidence.test.ts',
    ],
    'The exact one-slot BR DH1 packet capture at 80 Msamples/s is internally independently verified against published Core sample data and a separately structured ideal BT=0.5 GFSK oracle. Bluetooth SIG RF-PHY, interoperability, and product qualification are excluded.',
  ),
  'bluetooth-le-advertising': digitallyQualified(
    'bluetooth-le-advertising',
    [BLUETOOTH_LE_PHY, BLUETOOTH_LE_LINK, BLUETOOTH_LE_SAMPLE_DATA],
    '2e139351a0deefe58a17eeff9146e720eaac5f674474c465778dce859be64f11',
    'bdf32b159891a033f7d3609f53667d000444f3ddc5c4bbaf058fdede947f6d87',
    'validation/bluetooth-core63-fixed-packet-digital-oracles-2026-07-27.json',
    'Separately structured Bluetooth Core sample and ideal-GFSK test oracle',
    'Complete fixed packet-vector and every-active-sample digital comparison',
    [
      'src/bluetooth-iq.test.ts',
      'src/bluetooth-fixed-independent-oracle.test.ts',
      'src/bluetooth-fixed-oracle-evidence.test.ts',
    ],
    'The exact one-event LE 1M ADV_NONCONN_IND packet capture at 80 Msamples/s is internally independently verified against published Core sample data and a separately structured ideal BT=0.5 GFSK oracle. Bluetooth SIG RF-PHY, interoperability, and product qualification are excluded.',
  ),

  'bluetooth-classic-connected-longdwell': fixed(
    'bluetooth-classic-connected-longdwell',
    [BLUETOOTH_BR_PHY, BLUETOOTH_BR_BASEBAND],
    'src/bluetooth-long-dwell-iq.test.ts',
    'A long-dwell engineering composition: the digitally qualified one-slot BR '
    + 'DH1 baseband replayed on a 625 us slot clock with keyed-hash slot '
    + 'utilization and 79-channel placement. The hop-selection kernel of '
    + 'Core 6.3 is NOT implemented; channel statistics, not the selection '
    + 'algorithm, are represented. Tests cover composition determinism, '
    + 'stitch exactness, slot timing, and channel spread.',
    'standards-derived-engineering-profile',
  ),
  'bluetooth-le-advertising-longdwell': fixed(
    'bluetooth-le-advertising-longdwell',
    [BLUETOOTH_LE_PHY, BLUETOOTH_LE_LINK],
    'src/bluetooth-long-dwell-iq.test.ts',
    'A long-dwell engineering composition: the digitally qualified '
    + 'ADV_NONCONN_IND baseband transmitted on channels 37/38/39 per '
    + 'advertising event, on a 30 ms event grid with keyed-hash advDelay in '
    + '[0, 10 ms). Payload bits repeat the qualified vector. Tests cover '
    + 'composition determinism, stitch exactness, event spacing, and true '
    + 'channel offsets.',
    'standards-derived-engineering-profile',
  ),

  'ref-qpsk': mathematical('ref-qpsk', 'src/reference-iq.test.ts'),
  'ref-8psk': mathematical('ref-8psk', 'src/reference-iq.test.ts'),
  'ref-16qam': mathematical('ref-16qam', 'src/reference-iq.test.ts'),
  'ref-64qam': mathematical('ref-64qam', 'src/reference-iq.test.ts'),
  'ref-256qam': mathematical('ref-256qam', 'src/reference-iq.test.ts'),

  'custom-lte': builder('custom-lte', [
    selectedClauses(TS_36_104, ['5.5', '5.6']),
    selectedClauses(TS_36_141, ['6.1.1']),
    selectedClauses(TS_36_211, ['4', '6', '7.1']),
    selectedClauses(TS_36_213, ['Table 7.1.7.1-1A']),
  ]),
  'custom-nr': builder('custom-nr', [
    selectedClauses(TS_38_101_1, ['5.3.2', '5.3.5']),
    selectedClauses(TS_38_101_2, ['5.3.2', '5.3.5']),
    selectedClauses(TS_38_104, ['5.2', '5.3.2', '5.3.5', '5.4.2.3']),
    selectedClauses(TS_38_141_1, ['4.9.2']),
    selectedClauses(TS_38_141_2, ['4.9.2', '6']),
    selectedClauses(TS_38_211, ['4.2-4.4', '5', '7']),
    selectedClauses(TS_38_213, ['11.1']),
    selectedClauses(TS_38_214, [
      '5.1.3.1 Tables 5.1.3.1-1 through 5.1.3.1-4',
    ]),
  ]),
  'custom-wifi': builder('custom-wifi', [
    selectedClauses(IEEE_802_11, ['16', '17', '18', '19', '21', '27', 'Annex E']),
  ]),
} satisfies Record<SynthesizedSignalProfile, ProfileGovernance>;

export const PROFILE_GOVERNANCE_BY_ID: Readonly<Record<SynthesizedSignalProfile, ProfileGovernance>> = Object.freeze(registry);

export function profileGovernanceFor(profileId: SynthesizedSignalProfile): ProfileGovernance {
  return structuredClone(PROFILE_GOVERNANCE_BY_ID[profileId]);
}

function governingOrganizations(references: readonly NormativeReference[]): readonly GovernanceOrganization[] {
  return [...new Set(references.map(({ organization }) => organization))];
}

function governingBodyDetails(
  organizations: readonly GovernanceOrganization[],
): readonly GoverningBody[] {
  return organizations.map((organization): GoverningBody => {
    switch (organization) {
      case '3GPP':
        return {
          organization,
          technicalBody: '3GPP TSG RAN',
          authorityScope: 'Radio-access specifications for GERAN, E-UTRA/LTE, and NR, including physical-layer construction and radio test models.',
        };
      case 'IEEE':
        return {
          organization,
          technicalBody: 'IEEE Standards Association / IEEE 802.11 Working Group',
          authorityScope: 'IEEE 802.11 WLAN PHY and MAC specifications, including HR-DSSS, ERP-OFDM, and HE PPDU formats.',
        };
      case 'Bluetooth SIG':
        return {
          organization,
          technicalBody: 'Bluetooth SIG Core Specification Working Group',
          authorityScope: 'Bluetooth Core radio, baseband, link-layer, sample-data, and corresponding test-specification requirements.',
        };
      case 'TinySA SignalLab':
        return {
          organization,
          technicalBody: 'TinySA SignalLab project',
          authorityScope: 'Project-defined deterministic mathematical laboratory references for which no unique external waveform standard applies.',
        };
    }
  });
}

function parseAndFreeze(value: unknown): ProfileGovernance {
  const parsed = profileGovernanceSchema.parse(value);
  return Object.freeze({
    ...parsed,
    governingOrganizations: Object.freeze([...parsed.governingOrganizations]),
    governingBodies: Object.freeze(parsed.governingBodies.map((body) =>
      Object.freeze({ ...body }))),
    normativeReferences: Object.freeze(parsed.normativeReferences.map((entry) => Object.freeze({
      ...entry,
      clauses: Object.freeze([...entry.clauses]),
    }))),
    applicability: Object.freeze({ ...parsed.applicability }),
    testedClaimScope: Object.freeze({
      ...parsed.testedClaimScope,
      testLocations: Object.freeze([...parsed.testedClaimScope.testLocations]),
    }),
    claims: Object.freeze({ ...parsed.claims }),
    digitalQualificationEvidence: parsed.digitalQualificationEvidence === null
      ? null
      : Object.freeze({
        artifact: Object.freeze({ ...parsed.digitalQualificationEvidence.artifact }),
        independentEvidence: Object.freeze({ ...parsed.digitalQualificationEvidence.independentEvidence }),
      }),
    qualificationBlockers: Object.freeze([...parsed.qualificationBlockers]),
  });
}
