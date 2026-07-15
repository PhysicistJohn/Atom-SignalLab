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
  url: 'https://github.com/PhysicistJohn/TinySA_SignalLab/blob/main/src/waveforms.ts',
}]);

export const GSM_OBSERVABLE_SOURCE = sourceBasis('3GPP', [
  {
    specification: 'TS 45.002',
    clause: '4.3 and 5.5: timeslots and TDMA frame sequence',
    revision: '18.0.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145002/18.00.00_60/ts_145002v180000p.pdf',
  },
  {
    specification: 'TS 45.005',
    clause: 'GSM 900 operating bands and 200 kHz RF channel raster',
    revision: '19.0.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145005/19.00.00_60/ts_145005v190000p.pdf',
  },
]);

export const LTE_OBSERVABLE_SOURCE = sourceBasis('3GPP', [
  {
    specification: 'TS 36.101',
    clause: '5.5 and 5.6: operating bands and transmission bandwidth configuration',
    revision: '19.5.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/136100_136199/136101/19.05.00_60/ts_136101v190500p.pdf',
  },
  {
    specification: 'TS 36.211',
    clause: '4 and 6: frame structure, resource grid and OFDM physical channels',
    revision: '19.3.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/19.03.00_60/ts_136211v190300p.pdf',
  },
]);

export const NR_OBSERVABLE_SOURCE = sourceBasis('3GPP', [
  {
    specification: 'TS 38.104',
    clause: '5.2 and 5.3: FR1 operating bands and channel bandwidths',
    revision: '19.4.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/19.04.00_60/ts_138104v190400p.pdf',
  },
  {
    specification: 'TS 38.211',
    clause: '4.2 through 4.4: numerologies, frame structure and resource grids',
    revision: '19.3.0',
    url: 'https://www.etsi.org/deliver/etsi_ts/138200_138299/138211/19.03.00_60/ts_138211v190300p.pdf',
  },
]);

export const WIFI_OBSERVABLE_SOURCE = sourceBasis('IEEE', [{
  specification: 'IEEE 802.11-2024',
  clause: 'DSSS/HR-DSSS and OFDM PHY channelization',
  revision: '2024',
  url: 'https://standards.ieee.org/ieee/802.11/10548/',
}]);

export const IEEE_802154_SOURCE = sourceBasis('IEEE', [{
  specification: 'IEEE 802.15.4-2024',
  clause: '2450 MHz O-QPSK PHY channelization',
  revision: '2024',
  url: 'https://standards.ieee.org/ieee/802.15.4/11011/',
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
    clause: 'LE physical channels, advertising events and link-layer timing',
    revision: '6.3',
    url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/link-layer-specification.html',
  },
]);
