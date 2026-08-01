import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { waveformCatalog, waveformDescriptor } from './catalog.js';
import {
  SYNTHESIZED_SIGNAL_PROFILES,
  waveformDescriptorSchema,
  type SynthesizedSignalProfile,
} from './contracts.js';
import { FIXED_DIGITAL_PROFILE_BINDINGS } from './fixed-digital-profile-binding.js';
import { PROFILE_GOVERNANCE_BY_ID } from './profile-governance.js';
import { profileGovernanceSchema } from './profile-governance-schema.js';

const EXPECTED_GOVERNING_ORGANIZATIONS = {
  cw: ['TinySA SignalLab'],
  am: ['TinySA SignalLab'],
  fm: ['TinySA SignalLab'],
  'gsm-900-loaded-bcch': ['3GPP'],
  'gsm-normal-burst': ['3GPP'],
  'gsm-qpsk-higher-symbol-rate-burst': ['3GPP'],
  'gsm-aqpsk-normal-burst': ['3GPP'],
  'gsm-8psk-normal-burst': ['3GPP'],
  'gsm-16qam-higher-symbol-rate-burst': ['3GPP'],
  'gsm-32qam-higher-symbol-rate-burst': ['3GPP'],
  'lte-band3-fdd-20m': ['3GPP'],
  'lte-band38-tdd-10m': ['3GPP'],
  'lte-etm1.1': ['3GPP'],
  'lte-etm3.1': ['3GPP'],
  'lte-etm3.1a': ['3GPP'],
  'lte-etm3.1b': ['3GPP'],
  'lte-ntm': ['3GPP'],
  'lte-nbiot-guard-isolated-component': ['3GPP'],
  'lte-nbiot-inband-isolated-component': ['3GPP'],
  'nr-n3-fdd-20m': ['3GPP'],
  'nr-n78-tdd-100m': ['3GPP'],
  'nr-fr1-tm1.1': ['3GPP'],
  'nr-fr1-tm3.1': ['3GPP'],
  'nr-fr1-tm3.1a': ['3GPP'],
  'nr-fr1-tm3.1b': ['3GPP'],
  'nr-nbiot-inband-isolated-component': ['3GPP'],
  'wifi-hr-dsss-11m': ['IEEE'],
  'wifi-ofdm-20m': ['IEEE'],
  'wifi6-he-su': ['IEEE'],
  'wifi6-he-er-su': ['IEEE'],
  'wifi6-he-mu': ['IEEE'],
  'wifi6-he-tb': ['IEEE'],
  'bluetooth-classic-connected': ['Bluetooth SIG'],
  'bluetooth-le-advertising': ['Bluetooth SIG'],
  'bluetooth-classic-connected-longdwell': ['Bluetooth SIG'],
  'bluetooth-le-advertising-longdwell': ['Bluetooth SIG'],
  'ref-qpsk': ['TinySA SignalLab'],
  'ref-8psk': ['TinySA SignalLab'],
  'ref-16qam': ['TinySA SignalLab'],
  'ref-64qam': ['TinySA SignalLab'],
  'ref-256qam': ['TinySA SignalLab'],
  'custom-lte': ['3GPP'],
  'custom-nr': ['3GPP'],
  'custom-wifi': ['IEEE'],
} as const satisfies Record<
  SynthesizedSignalProfile,
  readonly ('3GPP' | 'IEEE' | 'Bluetooth SIG' | 'TinySA SignalLab')[]
>;

const EXPECTED_TECHNICAL_BODY = {
  '3GPP': '3GPP TSG RAN',
  'IEEE': 'IEEE Standards Association / IEEE 802.11 Working Group',
  'Bluetooth SIG': 'Bluetooth SIG Core Specification Working Group',
  'TinySA SignalLab': 'TinySA SignalLab project',
} as const;

const referenceKey = (
  documentId: string,
  revision: string,
  ...clauses: readonly string[]
): string => `${documentId}@${revision}#${clauses.join('|')}`;

const lteEtmReferenceKeys = (
  modelClause: string,
  modulationClause: string,
): readonly string[] => [
  referenceKey('TS 36.104', '19.2.0', '5.5', '5.6'),
  referenceKey('TS 36.141', '19.1.0', modelClause, '6.1.2'),
  referenceKey(
    'TS 36.211',
    '19.3.0',
    '4.1',
    '6.2.1-6.2.4',
    '6.3-6.12',
    '7.2',
    modulationClause,
  ),
  referenceKey('TS 36.212', '19.3.0', '5.3.4-5.3.5'),
];

const nrTmReferenceKeys = (
  modelClause: string,
  modulationClause: string,
): readonly string[] => [
  referenceKey(
    'TS 38.104',
    '19.4.0',
    '5.2 Table 5.2-1',
    '5.3.2 Table 5.3.2-1',
    '5.3.5 Table 5.3.5-1',
    '5.4.2.3 Table 5.4.2.3-1',
  ),
  referenceKey(
    'TS 38.141-1',
    '19.4.0',
    '4.9.2.2',
    modelClause,
    '4.9.2.3',
    '4.9.2.3.1-4.9.2.3.2',
  ),
  referenceKey(
    'TS 38.211',
    '19.4.0',
    '4.2-4.4',
    '5.2.1',
    '5.3',
    modulationClause,
    '7.3.1',
    '7.3.2',
    '7.4.1.1',
    '7.4.1.3',
  ),
  referenceKey('TS 38.214', '19.4.0', '5.1.2.2.2'),
];

const noReferences = Object.freeze([] as string[]);
const geranHigherRateReferences = Object.freeze([
  referenceKey('TS 45.002', '19.0.0', '4.3', '5.2.3a'),
  referenceKey('TS 45.004', '19.0.0', '5.1-5.6'),
]);
const lteNtmReferenceKeys = Object.freeze([
  referenceKey('TS 36.141', '19.1.0', '6.1.3', '6.1.4.1-6.1.4.5'),
  referenceKey('TS 36.211', '19.3.0', '6.2.3', '10.2.3-10.2.8'),
]);
const nrTm11ReferenceKeys = Object.freeze(
  nrTmReferenceKeys('4.9.2.2.1', '5.1.3'),
);

const EXPECTED_NORMATIVE_REFERENCE_KEYS = {
  cw: noReferences,
  am: noReferences,
  fm: noReferences,
  'gsm-900-loaded-bcch': [
    referenceKey('TS 45.002', '19.0.0', '4.3', '5.2.3.1', '5.2.6'),
    referenceKey('TS 45.003', '19.0.0', '4.1.1-4.1.5', '4.4'),
    referenceKey('TS 45.004', '19.0.0', '2.1-2.6'),
  ],
  'gsm-normal-burst': [
    referenceKey('TS 45.002', '19.0.0', '4.3', '5.2.3.1'),
    referenceKey('TS 45.003', '19.0.0', '4.1.1-4.1.5'),
    referenceKey('TS 45.004', '19.0.0', '2.1-2.6'),
  ],
  'gsm-qpsk-higher-symbol-rate-burst': geranHigherRateReferences,
  'gsm-aqpsk-normal-burst': [
    referenceKey('TS 45.002', '19.0.0', '4.3', '5.2.3.2'),
    referenceKey('TS 45.004', '19.0.0', '6.1-6.6'),
  ],
  'gsm-8psk-normal-burst': [
    referenceKey('TS 45.002', '19.0.0', '4.3', '5.2.3.3'),
    referenceKey('TS 45.004', '19.0.0', '3.1-3.6'),
  ],
  'gsm-16qam-higher-symbol-rate-burst': geranHigherRateReferences,
  'gsm-32qam-higher-symbol-rate-burst': geranHigherRateReferences,
  'lte-band3-fdd-20m': [
    referenceKey('TS 36.104', '19.2.0', '5.5', '5.6'),
    referenceKey(
      'TS 36.141',
      '19.1.0',
      '6.1.1.1 and Table 6.1.1.1-1',
      '6.1.2',
    ),
    referenceKey(
      'TS 36.211',
      '19.3.0',
      '4.1',
      '6.2.1-6.2.4',
      '6.3-6.12',
      '7.1.2',
    ),
    referenceKey('TS 36.212', '19.3.0', '5.3.4-5.3.5'),
  ],
  'lte-band38-tdd-10m': [
    referenceKey('TS 36.104', '19.2.0', '5.5', '5.6'),
    referenceKey(
      'TS 36.211',
      '19.3.0',
      '4.2 Tables 4.2-1 and 4.2-2',
      '6.2.1-6.2.4',
      '6.3-6.12',
    ),
    referenceKey('TS 36.213', '19.3.0', '6.9'),
  ],
  'lte-etm1.1': lteEtmReferenceKeys(
    '6.1.1.1 and Table 6.1.1.1-1',
    '7.1.2',
  ),
  'lte-etm3.1': lteEtmReferenceKeys(
    '6.1.1.4 and Table 6.1.1.4-1',
    '7.1.4',
  ),
  'lte-etm3.1a': lteEtmReferenceKeys('6.1.1.4a', '7.1.5'),
  'lte-etm3.1b': lteEtmReferenceKeys('6.1.1.4b', '7.1.6'),
  'lte-ntm': lteNtmReferenceKeys,
  'lte-nbiot-guard-isolated-component': [
    referenceKey(
      'TS 36.141',
      '19.1.0',
      '6.1.3',
      '6.1.4.1-6.1.4.5',
      '6.1.5',
    ),
    referenceKey('TS 36.211', '19.3.0', '6.2.3', '10.2.3-10.2.8'),
  ],
  'lte-nbiot-inband-isolated-component': [
    referenceKey(
      'TS 36.141',
      '19.1.0',
      '6.1.3',
      '6.1.4.1-6.1.4.5',
      '6.1.6',
    ),
    referenceKey('TS 36.211', '19.3.0', '6.2.3', '10.2.3-10.2.8'),
  ],
  'nr-n3-fdd-20m': nrTm11ReferenceKeys,
  'nr-n78-tdd-100m': [
    referenceKey(
      'TS 38.104',
      '19.4.0',
      '5.2 Table 5.2-1',
      '5.3.2 Table 5.3.2-1',
      '5.3.5 Table 5.3.5-1',
      '5.4.2.3 Table 5.4.2.3-1',
    ),
    referenceKey(
      'TS 38.141-1',
      '19.4.0',
      '4.9.2.2',
      '4.9.2.2.1 and Table 4.9.2.2-1 prescribed TDD pattern',
      '4.9.2.3',
      '4.9.2.3.1-4.9.2.3.2',
    ),
    referenceKey(
      'TS 38.211',
      '19.4.0',
      '4.2-4.4',
      '5.2.1',
      '5.3',
      '5.1.3',
      '7.3.1',
      '7.3.2',
      '7.4.1.1',
      '7.4.1.3',
    ),
    referenceKey('TS 38.214', '19.4.0', '5.1.2.2.2'),
    referenceKey(
      'TS 38.331',
      '19.1.0',
      '6.3.2 TDD-UL-DL-ConfigCommon',
    ),
    referenceKey('TS 38.213', '19.3.0', '11.1'),
  ],
  'nr-fr1-tm1.1': nrTm11ReferenceKeys,
  'nr-fr1-tm3.1': nrTmReferenceKeys('4.9.2.2.5', '5.1.5'),
  'nr-fr1-tm3.1a': nrTmReferenceKeys('4.9.2.2.6', '5.1.6'),
  'nr-fr1-tm3.1b': nrTmReferenceKeys('4.9.2.2.6A', '5.1.7'),
  'nr-nbiot-inband-isolated-component': [
    referenceKey('TS 38.141-1', '19.4.0', '4.9.2.2.9', '4.9.2.4'),
    referenceKey(
      'TS 36.141',
      '19.1.0',
      '6.1.3',
      '6.1.4.1-6.1.4.5',
    ),
    referenceKey('TS 36.211', '19.3.0', '6.2.3', '10.2.3-10.2.8'),
  ],
  'wifi-hr-dsss-11m': [
    referenceKey(
      'IEEE 802.11-2024',
      '2024',
      '9.2.4.8',
      '9.3.1.4',
      '16.2.2.2',
      '16.2.3.2-16.2.3.8',
      '16.2.4-16.2.5',
      '16.3.6.3-16.3.6.4',
      '16.3.6.6.1-16.3.6.6.4',
    ),
  ],
  'wifi-ofdm-20m': [
    referenceKey(
      'IEEE 802.11-2024',
      '2024',
      '9.2.4.8',
      '9.3.1.4',
      '17.3.2-17.3.5.10',
      '17.3.11',
      '18.3.2.4',
      '18.3.3.2',
      '18.4.3',
    ),
  ],
  'wifi6-he-su': [
    referenceKey(
      'IEEE 802.11-2024',
      '2024',
      '27.1.4',
      '27.3.2.2',
      '27.3.4',
      '27.3.6.1-27.3.6.10',
      '27.3.7',
      '27.3.9-27.3.13',
    ),
  ],
  'wifi6-he-er-su': [
    referenceKey(
      'IEEE 802.11-2024',
      '2024',
      '27.1.4',
      '27.3.2.2',
      '27.3.4',
      '27.3.6.1-27.3.6.10',
      '27.3.6.6',
      '27.3.11.7',
      '27.3.12-27.3.13',
    ),
  ],
  'wifi6-he-mu': [
    referenceKey(
      'IEEE 802.11-2024',
      '2024',
      '27.3.1.1',
      '27.3.2.2',
      '27.3.2.5',
      '27.3.3.1',
      '27.3.4',
      '27.3.6.11',
      '27.3.8',
      '27.3.10-27.3.13',
      '27.3.16',
    ),
  ],
  'wifi6-he-tb': [
    referenceKey(
      'IEEE 802.11-2024',
      '2024',
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
    ),
  ],
  'bluetooth-classic-connected': [
    referenceKey('Bluetooth Core 6.3, Vol 2, Part A', '6.3', '2', '3.1.1'),
    referenceKey(
      'Bluetooth Core 6.3, Vol 2, Part B',
      '6.3',
      '6.1-6.6',
      '7.1-7.4',
    ),
    referenceKey(
      'Bluetooth Core 6.3, Vol 2, Part G',
      '6.3',
      '2.1',
      '3',
      '4',
      '5',
      '6.1',
      '8',
    ),
  ],
  'bluetooth-le-advertising': [
    referenceKey('Bluetooth Core 6.3, Vol 6, Part A', '6.3', '2', '3'),
    referenceKey(
      'Bluetooth Core 6.3, Vol 6, Part B',
      '6.3',
      '2.1',
      '2.3.1',
      '3.1',
      '3.2',
      '4.4.2',
    ),
    referenceKey('Bluetooth Core 6.3, Vol 6, Part C', '6.3', '4.1', '4.2.1'),
  ],
  'bluetooth-classic-connected-longdwell': [
    referenceKey('Bluetooth Core 6.3, Vol 2, Part A', '6.3', '2', '3.1.1'),
    referenceKey('Bluetooth Core 6.3, Vol 2, Part B', '6.3', '6.1-6.6', '7.1-7.4'),
  ],
  'bluetooth-le-advertising-longdwell': [
    referenceKey('Bluetooth Core 6.3, Vol 6, Part A', '6.3', '2', '3'),
    referenceKey(
      'Bluetooth Core 6.3, Vol 6, Part B',
      '6.3',
      '2.1',
      '2.3.1',
      '3.1',
      '3.2',
      '4.4.2',
    ),
  ],
  'ref-qpsk': noReferences,
  'ref-8psk': noReferences,
  'ref-16qam': noReferences,
  'ref-64qam': noReferences,
  'ref-256qam': noReferences,
  'custom-lte': [
    referenceKey('TS 36.104', '19.2.0', '5.5', '5.6'),
    referenceKey('TS 36.141', '19.1.0', '6.1.1'),
    referenceKey('TS 36.211', '19.3.0', '4', '6', '7.1'),
    referenceKey('TS 36.213', '19.4.0', 'Table 7.1.7.1-1A'),
  ],
  'custom-nr': [
    referenceKey('TS 38.101-1', '19.4.0', '5.3.2', '5.3.5'),
    referenceKey('TS 38.101-2', '19.4.0', '5.3.2', '5.3.5'),
    referenceKey('TS 38.104', '19.5.0', '5.2', '5.3.2', '5.3.5', '5.4.2.3'),
    referenceKey('TS 38.141-1', '19.5.0', '4.9.2'),
    referenceKey('TS 38.141-2', '19.5.0', '4.9.2', '6'),
    referenceKey('TS 38.211', '19.4.0', '4.2-4.4', '5', '7'),
    referenceKey('TS 38.213', '19.3.0', '11.1'),
    referenceKey(
      'TS 38.214',
      '19.4.0',
      '5.1.3.1 Tables 5.1.3.1-1 through 5.1.3.1-4',
    ),
  ],
  'custom-wifi': [
    referenceKey(
      'IEEE 802.11-2024',
      '2024',
      '16',
      '17',
      '18',
      '19',
      '21',
      '27',
      'Annex E',
    ),
  ],
} as const satisfies Record<SynthesizedSignalProfile, readonly string[]>;

const GERAN_EVIDENCE_REPORT =
  'validation/geran-release19-fixed-digital-baseband-oracles-2026-07-27.json';
const LTE_REMAINING_EVIDENCE_REPORT =
  'validation/lte-fixed-independent-oracles-2026-07-27.json';
const LTE_ETM1_EVIDENCE_REPORT =
  'validation/lte-etm1-srsran-oracle-2026-07-27.json';
const LTE_ETM3_EVIDENCE_REPORT =
  'validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json';
const NR_REMAINING_EVIDENCE_REPORT =
  'validation/nr-remaining-fixed-digital-oracles-2026-07-27.json';
const NR_TM_EVIDENCE_REPORT =
  'validation/nr-fr1-test-model-independent-oracles-2026-07-27.json';
const WLAN_EVIDENCE_REPORT =
  'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json';
const BLUETOOTH_EVIDENCE_REPORT =
  'validation/bluetooth-core63-fixed-packet-digital-oracles-2026-07-27.json';

const EXPECTED_EVIDENCE_REPORT_PATHS = {
  'gsm-900-loaded-bcch': GERAN_EVIDENCE_REPORT,
  'gsm-normal-burst': GERAN_EVIDENCE_REPORT,
  'gsm-qpsk-higher-symbol-rate-burst': GERAN_EVIDENCE_REPORT,
  'gsm-aqpsk-normal-burst': GERAN_EVIDENCE_REPORT,
  'gsm-8psk-normal-burst': GERAN_EVIDENCE_REPORT,
  'gsm-16qam-higher-symbol-rate-burst': GERAN_EVIDENCE_REPORT,
  'gsm-32qam-higher-symbol-rate-burst': GERAN_EVIDENCE_REPORT,
  'lte-band3-fdd-20m': LTE_REMAINING_EVIDENCE_REPORT,
  'lte-band38-tdd-10m': LTE_REMAINING_EVIDENCE_REPORT,
  'lte-etm1.1': LTE_ETM1_EVIDENCE_REPORT,
  'lte-etm3.1': LTE_ETM3_EVIDENCE_REPORT,
  'lte-etm3.1a': LTE_ETM3_EVIDENCE_REPORT,
  'lte-etm3.1b': LTE_ETM3_EVIDENCE_REPORT,
  'lte-ntm': LTE_REMAINING_EVIDENCE_REPORT,
  'lte-nbiot-guard-isolated-component': LTE_REMAINING_EVIDENCE_REPORT,
  'lte-nbiot-inband-isolated-component': LTE_REMAINING_EVIDENCE_REPORT,
  'nr-n3-fdd-20m': NR_REMAINING_EVIDENCE_REPORT,
  'nr-n78-tdd-100m': NR_REMAINING_EVIDENCE_REPORT,
  'nr-fr1-tm1.1': NR_TM_EVIDENCE_REPORT,
  'nr-fr1-tm3.1': NR_TM_EVIDENCE_REPORT,
  'nr-fr1-tm3.1a': NR_TM_EVIDENCE_REPORT,
  'nr-fr1-tm3.1b': NR_TM_EVIDENCE_REPORT,
  'nr-nbiot-inband-isolated-component': NR_REMAINING_EVIDENCE_REPORT,
  'wifi-hr-dsss-11m': WLAN_EVIDENCE_REPORT,
  'wifi-ofdm-20m': WLAN_EVIDENCE_REPORT,
  'wifi6-he-su': WLAN_EVIDENCE_REPORT,
  'wifi6-he-er-su': WLAN_EVIDENCE_REPORT,
  'wifi6-he-mu': WLAN_EVIDENCE_REPORT,
  'wifi6-he-tb': WLAN_EVIDENCE_REPORT,
  'bluetooth-classic-connected': BLUETOOTH_EVIDENCE_REPORT,
  'bluetooth-le-advertising': BLUETOOTH_EVIDENCE_REPORT,
} as const satisfies Record<
  keyof typeof FIXED_DIGITAL_PROFILE_BINDINGS,
  string
>;

describe('operator-profile governance registry', () => {
  it('maps all 44 operator profiles exactly once and threads the mapping through every descriptor', () => {
    expect(SYNTHESIZED_SIGNAL_PROFILES).toHaveLength(44);
    expect(Object.keys(PROFILE_GOVERNANCE_BY_ID).sort()).toEqual([...SYNTHESIZED_SIGNAL_PROFILES].sort());
    expect(waveformCatalog).toHaveLength(44);

    for (const profileId of SYNTHESIZED_SIGNAL_PROFILES) {
      const governance = PROFILE_GOVERNANCE_BY_ID[profileId];
      expect(profileGovernanceSchema.parse(governance).profileId).toBe(profileId);
      const descriptor = waveformDescriptor(profileId);
      expect(descriptor.governance).toEqual(governance);
      expect(waveformDescriptorSchema.parse(descriptor).id).toBe(profileId);
    }
  });

  it('freezes the governing organization for each of the 44 profiles', () => {
    expect(Object.keys(EXPECTED_GOVERNING_ORGANIZATIONS).sort())
      .toEqual([...SYNTHESIZED_SIGNAL_PROFILES].sort());
    for (const profileId of SYNTHESIZED_SIGNAL_PROFILES) {
      expect(PROFILE_GOVERNANCE_BY_ID[profileId].governingOrganizations)
        .toEqual(EXPECTED_GOVERNING_ORGANIZATIONS[profileId]);
      expect(PROFILE_GOVERNANCE_BY_ID[profileId].governingBodies.map(({ organization }) => organization))
        .toEqual(EXPECTED_GOVERNING_ORGANIZATIONS[profileId]);
      for (const body of PROFILE_GOVERNANCE_BY_ID[profileId].governingBodies) {
        expect(body.technicalBody).toBe(EXPECTED_TECHNICAL_BODY[body.organization]);
        expect(body.authorityScope.length).toBeGreaterThan(40);
      }
    }
  });

  it('freezes the exact governing document, revision, and clause set for every profile', () => {
    expect(Object.keys(EXPECTED_NORMATIVE_REFERENCE_KEYS).sort())
      .toEqual([...SYNTHESIZED_SIGNAL_PROFILES].sort());
    for (const profileId of SYNTHESIZED_SIGNAL_PROFILES) {
      const observed = PROFILE_GOVERNANCE_BY_ID[
        profileId
      ].normativeReferences.map(({ documentId, revision, clauses }) =>
        referenceKey(documentId, revision, ...clauses));
      expect(observed, profileId)
        .toEqual(EXPECTED_NORMATIVE_REFERENCE_KEYS[profileId]);
    }
  });

  it('classifies complete profiles, engineering observables, component fixtures, builders, and mathematical references without broad compliance or RF claims', () => {
    const entries = Object.values(PROFILE_GOVERNANCE_BY_ID);
    expect(entries.filter(({ signalKind }) => signalKind === 'normative-fixed-profile')).toHaveLength(22);
    expect(entries.filter(({ signalKind }) => signalKind === 'standards-derived-engineering-profile')).toHaveLength(2);
    expect(entries.filter(({ signalKind }) => signalKind === 'standards-component-fixture')).toHaveLength(9);
    expect(entries.filter(({ signalKind }) => signalKind === 'operator-defined-builder')).toHaveLength(3);
    expect(entries.filter(({ signalKind }) => signalKind === 'mathematical-lab-reference')).toHaveLength(8);
    expect(entries.filter(({ claims }) => claims.digitalQualification === 'qualified')).toHaveLength(31);

    for (const governance of entries) {
      expect(governance.claims.standardsCompliance).toBe('not-claimed');
      expect(governance.claims.rfConformance).toBe('not-qualified');
      if (governance.claims.digitalQualification === 'qualified') {
        expect(governance.claims.digitalStandardsAdherence)
          .toBe('verified-for-declared-digital-scope');
        expect(governance.implementedQualificationState).toBe('digitally-qualified');
        expect(governance.digitalQualificationEvidence).not.toBeNull();
      } else {
        expect(governance.digitalQualificationEvidence).toBeNull();
      }
      expect(governance.qualificationBlockers.length).toBeGreaterThan(0);
      for (const location of governance.testedClaimScope.testLocations) {
        expect(location, 'Test locations are files, not unverified pseudo-anchors')
          .not.toContain('#');
        expect(existsSync(resolve(location)), location).toBe(true);
      }
    }
  });

  it('hashes the independently frozen retained evidence report for every qualified profile', () => {
    const qualifiedProfiles = Object.keys(FIXED_DIGITAL_PROFILE_BINDINGS).sort();
    expect(Object.keys(EXPECTED_EVIDENCE_REPORT_PATHS).sort())
      .toEqual(qualifiedProfiles);

    for (const profileId of qualifiedProfiles as (
      keyof typeof FIXED_DIGITAL_PROFILE_BINDINGS
    )[]) {
      const evidence =
        PROFILE_GOVERNANCE_BY_ID[profileId].digitalQualificationEvidence;
      expect(evidence, profileId).not.toBeNull();
      if (evidence === null) throw new Error(`${profileId} has no evidence`);
      const expectedPath = EXPECTED_EVIDENCE_REPORT_PATHS[profileId];
      expect(evidence.independentEvidence.reportPath, profileId)
        .toBe(expectedPath);
      const reportBytes = readFileSync(resolve(expectedPath));
      const observedSha256 = createHash('sha256')
        .update(reportBytes)
        .digest('hex');
      expect(observedSha256, expectedPath)
        .toBe(evidence.independentEvidence.sha256);
    }
  });

  it('binds exactly all 31 standards-linked fixed profiles to qualified catalog artifacts and immutable acquisition geometry', () => {
    const boundProfiles = Object.keys(FIXED_DIGITAL_PROFILE_BINDINGS).sort();
    const qualifiedProfiles = Object.values(PROFILE_GOVERNANCE_BY_ID)
      .filter(({ claims }) => claims.digitalQualification === 'qualified')
      .map(({ profileId }) => profileId)
      .sort();
    expect(boundProfiles).toHaveLength(31);
    expect(boundProfiles).toEqual(qualifiedProfiles);

    for (const profileId of boundProfiles as SynthesizedSignalProfile[]) {
      const descriptor = waveformDescriptor(profileId);
      const evidence =
        PROFILE_GOVERNANCE_BY_ID[profileId].digitalQualificationEvidence;
      expect(descriptor.qualification)
        .toBe('independently-verified-digital-baseband');
      expect(descriptor.assetSha256).toBe(evidence?.artifact.sha256);
      const binding = FIXED_DIGITAL_PROFILE_BINDINGS[
        profileId as keyof typeof FIXED_DIGITAL_PROFILE_BINDINGS
      ];
      expect(descriptor.centerHz)
        .toBe(binding.profileReferenceCenterHz - binding.nativeCarrierOffsetHz);
    }
  });

  it('makes builders configuration-only and generic lab/reference signals N/A for a unique waveform standard', () => {
    for (const profileId of ['custom-lte', 'custom-nr', 'custom-wifi'] as const) {
      const governance = PROFILE_GOVERNANCE_BY_ID[profileId];
      expect(governance.applicability.status).toBe('configuration-only');
      expect(governance.claims.digitalStandardsAdherence).toBe('configuration-only');
      expect(governance.testedClaimScope.kind).toBe('configuration-constraints-only');
      expect(governance.normativeReferences.length).toBeGreaterThan(0);
    }
    for (const profileId of ['cw', 'am', 'fm', 'ref-qpsk', 'ref-8psk', 'ref-16qam', 'ref-64qam', 'ref-256qam'] as const) {
      const governance = PROFILE_GOVERNANCE_BY_ID[profileId];
      expect(governance.applicability.status).toBe('not-applicable');
      expect(governance.claims.digitalStandardsAdherence).toBe('not-applicable');
      expect(governance.normativeReferences).toEqual([]);
      expect(governance.governingOrganizations).toEqual(['TinySA SignalLab']);
    }
  });

  it('pins an organization, document, revision, clauses, and HTTPS location for every applicable normative reference', () => {
    for (const governance of Object.values(PROFILE_GOVERNANCE_BY_ID)) {
      for (const reference of governance.normativeReferences) {
        expect(reference.organization).not.toBe('TinySA SignalLab');
        expect(reference.documentId).toBeTruthy();
        expect(reference.revision).toMatch(/^(?:\d+\.\d+\.\d+|\d{4}|\d+\.\d+)$/);
        expect(reference.clauses.length).toBeGreaterThan(0);
        expect(reference.url).toMatch(/^https:\/\//);
      }
    }
  });

  it('keeps every governed document/revision represented in catalog source provenance', () => {
    for (const profileId of SYNTHESIZED_SIGNAL_PROFILES) {
      const descriptor = waveformDescriptor(profileId);
      for (const governed of descriptor.governance.normativeReferences) {
        expect(
          descriptor.source.references.some((source) =>
            source.specification === governed.documentId
            && source.revision === governed.revision),
          `${profileId}: ${governed.documentId}@${governed.revision}`,
        ).toBe(true);
      }
    }
  });

  it('fails closed unless a digital qualification has a matching state, content hash, and independent passing evidence', () => {
    const fixed = PROFILE_GOVERNANCE_BY_ID['lte-etm1.1'];
    const noEvidence = {
      ...fixed,
      implementedQualificationState: 'digitally-qualified',
      claims: { ...fixed.claims, digitalQualification: 'qualified' },
      testedClaimScope: { ...fixed.testedClaimScope, kind: 'content-bound-independent-digital-baseband' },
      digitalQualificationEvidence: null,
    };
    expect(profileGovernanceSchema.safeParse(noEvidence).success).toBe(false);

    const evidence = {
      artifact: { sha256: 'a'.repeat(64), mediaType: 'application/vnd.tinysa.complex-f32', producer: 'SignalLab generator' },
      independentEvidence: {
        sha256: 'b'.repeat(64),
        reportPath: 'validation/example-independent-evidence.json',
        result: 'pass',
        oracleProvider: 'Independent oracle',
        suite: 'E-TM1.1 digital baseband oracle',
      },
    } as const;
    expect(profileGovernanceSchema.safeParse({ ...noEvidence, digitalQualificationEvidence: evidence }).success).toBe(true);
    expect(profileGovernanceSchema.safeParse({
      ...noEvidence,
      digitalQualificationEvidence: {
        ...evidence,
        independentEvidence: { ...evidence.independentEvidence, oracleProvider: evidence.artifact.producer },
      },
    }).success).toBe(false);
    expect(profileGovernanceSchema.safeParse({
      ...fixed,
      claims: { ...fixed.claims, standardsCompliance: 'claimed' },
    }).success).toBe(false);
  });

  it('rejects digital promotion of builders, normative references on lab signals, and descriptor/governance ID drift', () => {
    const builder = PROFILE_GOVERNANCE_BY_ID['custom-lte'];
    expect(profileGovernanceSchema.safeParse({
      ...builder,
      implementedQualificationState: 'digitally-qualified',
      claims: { ...builder.claims, digitalQualification: 'qualified' },
    }).success).toBe(false);

    const lab = PROFILE_GOVERNANCE_BY_ID.cw;
    expect(profileGovernanceSchema.safeParse({
      ...lab,
      normativeReferences: PROFILE_GOVERNANCE_BY_ID['lte-etm1.1'].normativeReferences,
    }).success).toBe(false);

    const descriptor = waveformDescriptor('lte-etm1.1');
    expect(waveformDescriptorSchema.safeParse({
      ...descriptor,
      governance: { ...descriptor.governance, profileId: 'lte-etm3.1' },
    }).success).toBe(false);
  });
});
