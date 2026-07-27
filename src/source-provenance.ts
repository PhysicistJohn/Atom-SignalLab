import { z } from 'zod';

export const sourceOrganizationSchema = z.enum([
  'TinySA SignalLab',
  '3GPP',
  'IEEE',
  'Bluetooth SIG',
]);

export const sourceReferenceSchema = z.object({
  specification: z.string().trim().min(1),
  clause: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Source reference must use HTTPS'),
}).strict();

export const sourceBasisSchema = z.object({
  organization: sourceOrganizationSchema,
  references: z.array(sourceReferenceSchema).min(1).max(8).readonly(),
}).strict().superRefine((basis, context) => {
  const keys = new Set<string>();
  const urls = new Set<string>();
  for (const [index, reference] of basis.references.entries()) {
    const key = `${reference.specification}\u0000${reference.revision}\u0000${reference.url}`;
    if (keys.has(key)) context.addIssue({ code: 'custom', path: ['references', index], message: 'Duplicate source document reference' });
    if (urls.has(reference.url)) context.addIssue({ code: 'custom', path: ['references', index, 'url'], message: 'One URL may identify only one source document reference' });
    keys.add(key);
    urls.add(reference.url);
  }
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type SourceBasis = z.infer<typeof sourceBasisSchema>;

export function sourceBasis(
  organization: SourceBasis['organization'],
  references: readonly SourceReference[],
): SourceBasis {
  const parsed = sourceBasisSchema.parse({ organization, references });
  return Object.freeze({
    organization: parsed.organization,
    references: Object.freeze(parsed.references.map((reference) => Object.freeze({ ...reference }))),
  });
}

export const ANALYTIC_SCALAR_SOURCE = sourceBasis('TinySA SignalLab', [{
  specification: 'TinySA SignalLab canonical scalar kernel',
  clause: 'RBW-filtered CW, DSB full-carrier AM, sinusoidal FM and explicit hard-negative models',
  revision: 'canonical-scalar-kernel-v1',
  url: 'https://github.com/PhysicistJohn/Atom-SignalLab/blob/main/src/waveforms.ts',
}]);

export const REFERENCE_WAVEFORM_SOURCE = sourceBasis('TinySA SignalLab', [{
  specification: 'TinySA SignalLab single-carrier reference kernel',
  clause: 'Deterministic seeded RRC-shaped PSK/QAM reference waveforms for blind constellation recovery',
  revision: 'reference-waveform-kernel-v1',
  url: 'https://github.com/PhysicistJohn/Atom-SignalLab/blob/main/src/reference-iq.ts',
}]);

export const GSM_OBSERVABLE_SOURCE = sourceBasis('3GPP', [
  {
    specification: 'TS 45.002',
    clause: '4.3, 5.2.3.1, and 5.2.6: TDMA timing/frame sequence and GMSK/dummy-burst structures',
    revision: '19.0.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145002/19.00.00_60/ts_145002v190000p.pdf',
  },
  {
    specification: 'TS 45.003',
    clause: '4.1.1 through 4.1.5 and 4.4: control-channel coding, interleaving, and normal-burst mapping for the fixed xCCH block',
    revision: '19.0.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145003/19.00.00_60/ts_145003v190000p.pdf',
  },
  {
    specification: 'TS 45.004',
    clause: '2 and 2.1: GMSK modulation format and normal symbol rate',
    revision: '19.0.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145004/19.00.00_60/ts_145004v190000p.pdf',
  },
  {
    specification: 'TS 45.008',
    clause: '7.1: BCCH carrier continuous transmission and dummy bursts in otherwise unused time slots',
    revision: '19.0.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145008/19.00.00_60/ts_145008v190000p.pdf',
  },
  {
    specification: 'TS 45.005',
    clause: 'Clause 2: GSM 900 operating bands and RF-channel arrangement/raster',
    revision: '19.0.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145005/19.00.00_60/ts_145005v190000p.pdf',
  },
]);

const LTE_BAND_SOURCE_REFERENCE = {
  specification: 'TS 36.104',
  clause: '5.5 and 5.6: E-UTRA base-station operating bands and transmission bandwidth configuration',
  revision: '19.2.0',
  url: 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.104/36104-j20.zip',
} as const;

export const LTE_OBSERVABLE_SOURCE = sourceBasis('3GPP', [
  LTE_BAND_SOURCE_REFERENCE,
  {
    specification: 'TS 36.211',
    clause: '4 and 6: frame structure, resource grid and OFDM physical channels',
    revision: '19.3.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/19.03.00_60/ts_136211v190300p.pdf',
  },
]);

export const LTE_TDD_OBSERVABLE_SOURCE = sourceBasis('3GPP', [
  LTE_BAND_SOURCE_REFERENCE,
  {
    specification: 'TS 36.211',
    clause: '4.2 Tables 4.2-1 and 4.2-2: frame-structure type 2, UL/DL configuration 0 and normal-CP special-subframe configuration 7; clause 6 resource grid',
    revision: '19.3.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/19.03.00_60/ts_136211v190300p.pdf',
  },
]);

const NR_BASE_SOURCE_REFERENCES = [
  {
    specification: 'TS 38.104',
    clause: '5.2 through 5.4, especially 5.4.2.3: FR1 operating bands, channel bandwidths and band-specific channel raster',
    revision: '19.4.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/19.04.00_60/ts_138104v190400p.pdf',
  },
  {
    specification: 'TS 38.211',
    clause: '4.2 through 4.4: numerologies, frame structure and resource grids',
    revision: '19.4.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/138200_138299/138211/19.04.00_60/ts_138211v190400p.pdf',
  },
] as const;

export const NR_OBSERVABLE_SOURCE = sourceBasis('3GPP', NR_BASE_SOURCE_REFERENCES);

export const NR_TDD_OBSERVABLE_SOURCE = sourceBasis('3GPP', [
  ...NR_BASE_SOURCE_REFERENCES,
  {
    specification: 'TS 38.331',
    clause: '6.3.2: TDD-UL-DL-ConfigCommon and TDD-UL-DL-Pattern information elements',
    revision: '19.1.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/138300_138399/138331/19.01.00_60/ts_138331v190100p.pdf',
  },
  {
    specification: 'TS 38.213',
    clause: '11.1: slot configuration from TDD-UL-DL-ConfigCommon',
    revision: '19.3.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/138200_138299/138213/19.03.00_60/ts_138213v190300p.pdf',
  },
]);

export const WIFI_HR_DSSS_SOURCE = sourceBasis('IEEE', [{
  specification: 'IEEE 802.11-2024',
  clause: 'Clauses 9.2.4.8, 9.3.1.4, 16.2.2.2, 16.2.3.2 through 16.2.3.8, 16.2.4 through 16.2.5, 16.3.6.3 through 16.3.6.4, and 16.3.6.6.1 through 16.3.6.6.4: ACK MPDU/FCS and HR-DSSS long-PLCP/CCK PPDU construction',
  revision: '2024',
  url: 'https://standards.ieee.org/ieee/802.11/10548/',
}]);

export const WIFI_ERP_OFDM_SOURCE = sourceBasis('IEEE', [{
  specification: 'IEEE 802.11-2024',
  clause: 'Clauses 9.2.4.8, 9.3.1.4, 17.3.2 through 17.3.5.10, 17.3.11, 18.3.2.4, 18.3.3.2, and 18.4.3: ACK MPDU/FCS and 20 MHz ERP-OFDM PPDU construction',
  revision: '2024',
  url: 'https://standards.ieee.org/ieee/802.11/10548/',
}]);

/** @deprecated Use the profile-specific HR-DSSS or ERP-OFDM source. */
export const WIFI_OBSERVABLE_SOURCE = WIFI_ERP_OFDM_SOURCE;

export const IEEE_802154_SOURCE = sourceBasis('IEEE', [{
  specification: 'IEEE 802.15.4-2024',
  clause: '2450 MHz O-QPSK PHY channelization',
  revision: '2024',
  url: 'https://standards.ieee.org/ieee/802.15.4/11041/',
}]);

export const BLUETOOTH_OBSERVABLE_SOURCE = sourceBasis('Bluetooth SIG', [
  {
    specification: 'Bluetooth Core 6.3, Vol 2, Part A',
    clause: 'BR/EDR radio physical layer, Sections 1 through 3',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/radio-physical-layer-specification.html',
  },
  {
    specification: 'Bluetooth Core 6.3, Vol 2, Part B',
    clause: 'BR/EDR baseband physical channels, packets and slot timing',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/baseband-specification.html',
  },
  {
    specification: 'Bluetooth Core 6.3, Vol 6, Part A',
    clause: 'LE radio physical layer, Sections 1 through 3',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/radio-physical-layer-specification.html',
  },
  {
    specification: 'Bluetooth Core 6.3, Vol 6, Part B',
    clause: '2.3.1 and 4.4.2, including event-specific 4.4.2.1, 4.4.2.2.1 and 4.4.2.4.3: primary-channel use, next-used-channel sequencing, event closure, advInterval, advDelay and timing bounds',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/link-layer-specification.html',
  },
]);

export const BLUETOOTH_BR_DH1_FIXED_VECTOR_SOURCE = sourceBasis('Bluetooth SIG', [
  {
    specification: 'Bluetooth Core 6.3, Vol 2, Part A',
    clause: 'Sections 2 and 3.1.1: BR RF-channel centers and 1 Msym/s, BT=0.5 GFSK modulation requirements',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/radio-physical-layer-specification.html',
  },
  {
    specification: 'Bluetooth Core 6.3, Vol 2, Part B',
    clause: 'Sections 6.1 through 6.6 and 7.1 through 7.4: BR packet/access-code/header/DH1 payload construction, HEC, CRC, whitening, and rate-1/3 header FEC',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/baseband-specification.html',
  },
  {
    specification: 'Bluetooth Core 6.3, Vol 2, Part G',
    clause: 'Sections 2.1, 3, 4, 5, 6.1, and 8: connection-state RF-channel, LAP-zero access-code, HEC/header, CRC, complete DH1, and whitening sample data',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/br-edr-controller/sample-data.html',
  },
]);

export const BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR_SOURCE = sourceBasis('Bluetooth SIG', [
  {
    specification: 'Bluetooth Core 6.3, Vol 6, Part A',
    clause: 'Sections 2 and 3: LE physical-channel centers and LE 1M BT=0.5 GFSK modulation requirements',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/radio-physical-layer-specification.html',
  },
  {
    specification: 'Bluetooth Core 6.3, Vol 6, Part B',
    clause: 'Sections 2.1, 2.3.1, 3.1, 3.2, and 4.4.2: LE packet and legacy advertising PDU formats, CRC, whitening, and advertising-event behavior',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/link-layer-specification.html',
  },
  {
    specification: 'Bluetooth Core 6.3, Vol 6, Part C',
    clause: 'Sections 4.1 and 4.2.1: channel-38 whitening sequence and complete LE 1M ADV_NONCONN_IND sample packet',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/sample-data.html',
  },
]);
