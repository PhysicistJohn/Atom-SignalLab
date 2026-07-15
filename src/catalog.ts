import {
  SYNTHESIZED_SIGNAL_PROFILES,
  synthesizedSignalProfileSchema,
  waveformDescriptorSchema,
  type SynthesizedSignalProfile,
  type WaveformDescriptor,
  type WaveformProjection,
} from './contracts.js';
import {
  ANALYTIC_SCALAR_SOURCE,
  BLUETOOTH_OBSERVABLE_SOURCE,
  GSM_OBSERVABLE_SOURCE,
  LTE_OBSERVABLE_SOURCE,
  LTE_TDD_OBSERVABLE_SOURCE,
  NR_OBSERVABLE_SOURCE,
  NR_TDD_OBSERVABLE_SOURCE,
  WIFI_OBSERVABLE_SOURCE,
  sourceBasis,
} from './source-provenance.js';

const LTE_URL = 'https://www.etsi.org/deliver/etsi_ts/136100_136199/136141/19.01.00_60/ts_136141v190100p.pdf';
const NR_URL = 'https://www.etsi.org/deliver/etsi_ts/138100_138199/13814101/19.04.00_60/ts_13814101v190400p.pdf';
const GSM_MODULATION_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145004/19.00.00_60/ts_145004v190000p.pdf';
const GSM_MULTIPLEXING_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145002/19.00.00_60/ts_145002v190000p.pdf';
const GSM_RADIO_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145005/19.00.00_60/ts_145005v190000p.pdf';
const WIFI_URL = 'https://standards.ieee.org/ieee/802.11/10548/';
const observableEquivalenceDisclosure = 'Canonized scalar power projection for observable Bayesian inference. It is not bit-exact or protocol-decodable I/Q, is not a conformance vector, and supports only observable-class equivalence rather than protocol or emitter identity.';
const agileObservableEquivalenceDisclosure = `${observableEquivalenceDisclosure} Frequency-agile scalar activity is also compatible with proprietary FHSS, scanning interference, or time-interleaved independent sources.`;
const lteTddObservableDisclosure = `${observableEquivalenceDisclosure} This downlink-only replay explicitly selects UL/DL configuration 0 and normal-CP special-subframe configuration 7 with srs-UpPtsAdd absent; only DwPTS is downlink-active in each special subframe. That special-subframe selection is not implied by Band 38 or UL/DL configuration 0.`;
const nrTddEngineeringDisclosure = `${observableEquivalenceDisclosure} The versioned SignalLab engineering schedule uses one valid 5 ms, 30 kHz-SCS pattern with seven complete downlink slots followed by three complete uplink slots. It is a downlink-only scenario, not a pattern prescribed for n78 or universal across NR deployments.`;
const bleEngineeringDisclosure = `${agileObservableEquivalenceDisclosure} The versioned engineering schedule uses all three primary advertising centers in fixed 37, 38, 39 order, 1.5 ms packet-start spacing, fixed 376 us packet duration, a 20 ms interval, and a seeded per-event pseudorandom advDelay in [0, 10 ms). These are scenario choices, not universal Bluetooth timing, channel-map, order, or PDU behavior.`;

const visualDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'cw', label: 'CW carrier', family: 'tone', model: 'Canonized scalar observable · RBW-filtered line', centerHz: 98_000_000,
    occupiedBandwidthHz: 2_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'carrier', modulation: 'unmodulated', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} This physics-derived case is an unmodulated line passed through the declared analyzer grid-equivalent RBW.`,
  }),
  makeDescriptor({
    id: 'am', label: 'AM replay', family: 'analog', model: 'Canonized DSB full-carrier observable · 25 kHz tone', centerHz: 98_000_000,
    occupiedBandwidthHz: 52_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'sidebands', modulation: 'am', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} The carrier and symmetric sidebands use the physical DSB full-carrier power ratio; independent coherent tones can be scalar-equivalent.`,
  }),
  makeDescriptor({
    id: 'fm', label: 'FM replay', family: 'analog', model: 'Canonized sinusoidal FM observable · beta 3 · ±75 kHz', centerHz: 98_000_000,
    occupiedBandwidthHz: 200_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'sidebands', modulation: 'fm', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} The swept spectrum is the physical Bessel-series line-power projection; an independent Bessel-weighted comb can be scalar-equivalent.`,
  }),
];

const canonizedGsmDescriptors: WaveformDescriptor[] = [makeDescriptor({
  id: 'gsm-900-loaded-bcch', label: 'GSM 900 loaded observable', family: 'geran',
  model: 'Canonized scalar observable · loaded BCCH/dummy bursts', centerHz: 947_400_000,
  occupiedBandwidthHz: 200_000, recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation: 'gmsk', timing: 'continuous', duplex: 'fdd' },
  source: GSM_OBSERVABLE_SOURCE,
  disclosure: observableEquivalenceDisclosure,
})];

const canonizedLteDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'lte-band3-fdd-20m', label: 'LTE Band 3 FDD observable', family: 'e-utra',
    model: 'Canonized scalar observable · 20 MHz · 15 kHz SCS', centerHz: 1_840_000_000,
    occupiedBandwidthHz: 18_000_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'continuous', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 100 },
    source: LTE_OBSERVABLE_SOURCE,
    disclosure: observableEquivalenceDisclosure,
  }),
  makeDescriptor({
    id: 'lte-band38-tdd-10m', label: 'LTE Band 38 TDD downlink observable', family: 'e-utra',
    model: 'Canonized scalar observable · 10 MHz · UL/DL config 0 · normal-CP SSP config 7', centerHz: 2_595_000_000,
    occupiedBandwidthHz: 9_000_000, recommendedSpanHz: 20_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'tdd-frame', duplex: 'tdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 50 },
    source: LTE_TDD_OBSERVABLE_SOURCE,
    disclosure: lteTddObservableDisclosure,
  }),
];

const canonizedNrDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'nr-n3-fdd-20m', label: '5G NR n3 FDD observable', family: 'nr',
    model: 'Canonized scalar observable · 20 MHz · 15 kHz SCS', centerHz: 1_840_000_000,
    occupiedBandwidthHz: 19_080_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'continuous', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 106 },
    source: NR_OBSERVABLE_SOURCE,
    disclosure: observableEquivalenceDisclosure,
  }),
  makeDescriptor({
    id: 'nr-n78-tdd-100m', label: '5G NR n78 TDD downlink observable', family: 'nr',
    model: 'Canonized scalar observable · 100 MHz · 30 kHz SCS · engineering 7DL/3UL v1', centerHz: 3_500_000_000,
    occupiedBandwidthHz: 98_280_000, recommendedSpanHz: 120_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'tdd-frame', duplex: 'tdd', subcarrierSpacingHz: 30_000, nominalResourceBlocks: 273 },
    source: NR_TDD_OBSERVABLE_SOURCE,
    disclosure: nrTddEngineeringDisclosure,
  }),
];

const canonizedWifiDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'wifi-hr-dsss-11m', label: 'Wi-Fi HR-DSSS observable', family: 'wlan',
    model: 'Canonized scalar observable · 2.4 GHz · 11 Mchip/s', centerHz: 2_437_000_000,
    occupiedBandwidthHz: 22_000_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'hr-dsss', timing: 'burst' },
    source: WIFI_OBSERVABLE_SOURCE,
    disclosure: observableEquivalenceDisclosure,
  }),
  makeDescriptor({
    id: 'wifi-ofdm-20m', label: 'Wi-Fi OFDM 20 MHz observable', family: 'wlan',
    model: 'Canonized scalar observable · 2.4 GHz · 20 MHz', centerHz: 2_437_000_000,
    occupiedBandwidthHz: 16_600_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'burst', subcarrierSpacingHz: 312_500 },
    source: WIFI_OBSERVABLE_SOURCE,
    disclosure: observableEquivalenceDisclosure,
  }),
];

const canonizedBluetoothDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'bluetooth-classic-connected', label: 'Bluetooth BR/EDR connected observable', family: 'bluetooth',
    model: 'Canonized scalar observable · 79-channel hopping', centerHz: 2_441_000_000,
    occupiedBandwidthHz: 79_000_000, recommendedSpanHz: 84_000_000,
    projection: { allocation: 'frequency-hopping', modulation: 'br-edr', timing: 'classic-slots' },
    source: BLUETOOTH_OBSERVABLE_SOURCE,
    disclosure: agileObservableEquivalenceDisclosure,
  }),
  makeDescriptor({
    id: 'bluetooth-le-advertising', label: 'Bluetooth LE advertising observable', family: 'bluetooth',
    model: 'Canonized scalar observable · primary advertising engineering schedule v1', centerHz: 2_441_000_000,
    occupiedBandwidthHz: 80_000_000, recommendedSpanHz: 84_000_000,
    projection: { allocation: 'advertising-channels', modulation: 'ble-1m', timing: 'advertising-events' },
    source: BLUETOOTH_OBSERVABLE_SOURCE,
    disclosure: bleEngineeringDisclosure,
  }),
];

const gsmDefinitions = [
  ['gsm-normal-burst', 'GSM GMSK normal burst', 'GMSK normal burst', 'gmsk', 200_000, 'Clause 2, especially 2.1: GMSK format at the normal 1 625/6 ksymb/s symbol rate'],
  ['gsm-qpsk-normal-burst', 'GSM QPSK normal burst', 'QPSK normal burst', 'qpsk', 325_000, 'Clause 5, especially 5.1: QPSK format at the higher 325 ksymb/s symbol rate'],
  ['gsm-aqpsk-normal-burst', 'GSM AQPSK normal burst', 'AQPSK normal burst', 'aqpsk', 250_000, 'Clause 6, especially 6.1: AQPSK format at the normal 1 625/6 ksymb/s symbol rate'],
  ['gsm-8psk-normal-burst', 'EDGE 8-PSK normal burst', '8-PSK normal burst', '8psk', 250_000, 'Clause 3, especially 3.1: 8-PSK format at the normal 1 625/6 ksymb/s symbol rate'],
  ['gsm-16qam-normal-burst', 'EGPRS2 16-QAM normal burst', '16-QAM normal burst', '16qam', 325_000, 'Clause 5, especially 5.1: 16-QAM format at the higher 325 ksymb/s symbol rate'],
  ['gsm-32qam-normal-burst', 'EGPRS2 32-QAM normal burst', '32-QAM normal burst', '32qam', 325_000, 'Clause 5, especially 5.1: 32-QAM format at the higher 325 ksymb/s symbol rate'],
] as const;

const gsmDescriptors = gsmDefinitions.map(([id, label, model, modulation, occupiedBandwidthHz, modulationClause]) => makeDescriptor({
  id, label, family: 'geran', model, centerHz: 947_400_000, occupiedBandwidthHz, recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation, timing: 'burst' },
  source: sourceBasis('3GPP', [
    { specification: 'TS 45.004', clause: modulationClause, revision: '19.0.0', url: GSM_MODULATION_URL },
    { specification: 'TS 45.002', clause: 'Clauses 4.3, 5.2.3, and 5.2.3a: TDMA time-slot/frame and normal/higher-symbol-rate burst structures', revision: '19.0.0', url: GSM_MULTIPLEXING_URL },
    { specification: 'TS 45.005', clause: 'Clause 4.2.1 and Annex A: output RF modulation-spectrum context for the engineering occupied-width projection', revision: '19.0.0', url: GSM_RADIO_URL },
  ]),
  disclosure: `Standards-derived ${model} modulation, symbol-rate, spectral-occupancy context, and time-slot replay; the occupied width is an engineering projection, not a bit-exact or conformance-validated I/Q vector.`,
}));

interface ModelDefinition {
  id: SynthesizedSignalProfile;
  model: string;
  clause: string;
  allocation: WaveformProjection['allocation'];
  modulation: WaveformProjection['modulation'];
  timing: WaveformProjection['timing'];
}

const lteDefinitions: readonly ModelDefinition[] = [
  { id: 'lte-etm1.1', model: 'E-TM1.1', clause: '6.1.1.1', allocation: 'full', modulation: 'qpsk', timing: 'frame' },
  { id: 'lte-etm1.2', model: 'E-TM1.2', clause: '6.1.1.2', allocation: 'boosted', modulation: 'qpsk', timing: 'frame' },
  { id: 'lte-etm2', model: 'E-TM2', clause: '6.1.1.3', allocation: 'single-prb', modulation: '64qam', timing: 'frame' },
  { id: 'lte-etm2a', model: 'E-TM2a', clause: '6.1.1.3a', allocation: 'single-prb', modulation: '256qam', timing: 'frame' },
  { id: 'lte-etm2b', model: 'E-TM2b', clause: '6.1.1.3b', allocation: 'single-prb', modulation: '1024qam', timing: 'frame' },
  { id: 'lte-setm2-1', model: 'sE-TM2-1', clause: '6.1.1.3c', allocation: 'single-prb', modulation: '64qam', timing: 'subslot' },
  { id: 'lte-setm2a-1', model: 'sE-TM2a-1', clause: '6.1.1.3d', allocation: 'single-prb', modulation: '256qam', timing: 'subslot' },
  { id: 'lte-setm2-2', model: 'sE-TM2-2', clause: '6.1.1.3e', allocation: 'single-prb', modulation: '64qam', timing: 'slot' },
  { id: 'lte-setm2a-2', model: 'sE-TM2a-2', clause: '6.1.1.3f', allocation: 'single-prb', modulation: '256qam', timing: 'slot' },
  { id: 'lte-etm3.1', model: 'E-TM3.1', clause: '6.1.1.4', allocation: 'full', modulation: '64qam', timing: 'frame' },
  { id: 'lte-etm3.1a', model: 'E-TM3.1a', clause: '6.1.1.4a', allocation: 'full', modulation: '256qam', timing: 'frame' },
  { id: 'lte-etm3.1b', model: 'E-TM3.1b', clause: '6.1.1.4b', allocation: 'full', modulation: '1024qam', timing: 'frame' },
  { id: 'lte-setm3.1-1', model: 'sE-TM3.1-1', clause: '6.1.1.4c', allocation: 'full', modulation: '64qam', timing: 'subslot' },
  { id: 'lte-setm3.1a-1', model: 'sE-TM3.1a-1', clause: '6.1.1.4d', allocation: 'full', modulation: '256qam', timing: 'subslot' },
  { id: 'lte-setm3.1-2', model: 'sE-TM3.1-2', clause: '6.1.1.4e', allocation: 'full', modulation: '64qam', timing: 'slot' },
  { id: 'lte-setm3.1a-2', model: 'sE-TM3.1a-2', clause: '6.1.1.4f', allocation: 'full', modulation: '256qam', timing: 'slot' },
  { id: 'lte-etm3.2', model: 'E-TM3.2', clause: '6.1.1.5', allocation: 'boosted', modulation: '16qam', timing: 'frame' },
  { id: 'lte-setm3.2-1', model: 'sE-TM3.2-1', clause: '6.1.1.5a', allocation: 'boosted', modulation: '16qam', timing: 'subslot' },
  { id: 'lte-setm3.2-2', model: 'sE-TM3.2-2', clause: '6.1.1.5b', allocation: 'boosted', modulation: '16qam', timing: 'slot' },
  { id: 'lte-etm3.3', model: 'E-TM3.3', clause: '6.1.1.6', allocation: 'boosted', modulation: 'qpsk', timing: 'frame' },
  { id: 'lte-setm3.3-1', model: 'sE-TM3.3-1', clause: '6.1.1.6a', allocation: 'boosted', modulation: 'qpsk', timing: 'subslot' },
  { id: 'lte-setm3.3-2', model: 'sE-TM3.3-2', clause: '6.1.1.6b', allocation: 'boosted', modulation: 'qpsk', timing: 'slot' },
  { id: 'lte-ntm', model: 'N-TM', clause: '6.1.3', allocation: 'narrowband', modulation: 'qpsk', timing: 'frame' },
  { id: 'lte-ntm-guard', model: 'N-TM guard-band', clause: '6.1.5', allocation: 'narrowband', modulation: 'qpsk', timing: 'frame' },
  { id: 'lte-ntm-inband', model: 'N-TM in-band', clause: '6.1.6', allocation: 'narrowband', modulation: 'qpsk', timing: 'frame' },
];

const lteDescriptors = lteDefinitions.map((definition) => makeDescriptor({
  id: definition.id,
  label: `LTE ${definition.model}`,
  family: 'e-utra',
  model: `${definition.model} · ${modulationLabel(definition.modulation)} · 20 MHz`,
  centerHz: 1_840_000_000,
  occupiedBandwidthHz: definition.allocation === 'narrowband' ? 180_000 : 18_000_000,
  recommendedSpanHz: definition.allocation === 'narrowband' ? 2_000_000 : 30_000_000,
  projection: { allocation: definition.allocation, modulation: definition.modulation, timing: definition.timing, subcarrierSpacingHz: 15_000, nominalResourceBlocks: definition.allocation === 'narrowband' ? 1 : 100 },
  source: sourceBasis('3GPP', [{ specification: 'TS 36.141', clause: `Clause ${definition.clause} · ${definition.model}`, revision: '19.1.0', url: LTE_URL }]),
  disclosure: `Standards-derived ${definition.model} resource-allocation and timing projection; no conformance claim is made without a validated I/Q asset.`,
}));

const nrBaseDefinitions: readonly ModelDefinition[] = [
  { id: 'nr-fr1-tm1.1', model: 'NR-FR1-TM1.1', clause: '4.9.2.2.1', allocation: 'full', modulation: 'qpsk', timing: 'frame' },
  { id: 'nr-fr1-tm1.2', model: 'NR-FR1-TM1.2', clause: '4.9.2.2.2', allocation: 'boosted', modulation: 'qpsk', timing: 'frame' },
  { id: 'nr-fr1-tm2', model: 'NR-FR1-TM2', clause: '4.9.2.2.3', allocation: 'single-prb', modulation: '64qam', timing: 'frame' },
  { id: 'nr-fr1-tm2a', model: 'NR-FR1-TM2a', clause: '4.9.2.2.4', allocation: 'single-prb', modulation: '256qam', timing: 'frame' },
  { id: 'nr-fr1-tm2b', model: 'NR-FR1-TM2b', clause: '4.9.2.2.4A', allocation: 'single-prb', modulation: '1024qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.1', model: 'NR-FR1-TM3.1', clause: '4.9.2.2.5', allocation: 'full', modulation: '64qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.1a', model: 'NR-FR1-TM3.1a', clause: '4.9.2.2.6', allocation: 'full', modulation: '256qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.1b', model: 'NR-FR1-TM3.1b', clause: '4.9.2.2.6A', allocation: 'full', modulation: '1024qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.2', model: 'NR-FR1-TM3.2', clause: '4.9.2.2.7', allocation: 'boosted', modulation: '16qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.3', model: 'NR-FR1-TM3.3', clause: '4.9.2.2.8', allocation: 'boosted', modulation: 'qpsk', timing: 'frame' },
];

const nrBaseDescriptors = nrBaseDefinitions.map((definition) => makeNrDescriptor(definition));
const nrNarrowbandDescriptor = makeNrDescriptor({ id: 'nr-ntm', model: 'NR-N-TM', clause: '4.9.2.2.9', allocation: 'narrowband', modulation: 'qpsk', timing: 'frame' });

const sbfdClauseByModel = new Map([
  ['NR-FR1-TM1.1', '4.9.2.2.10'], ['NR-FR1-TM1.2', '4.9.2.2.11'], ['NR-FR1-TM2', '4.9.2.2.12'],
  ['NR-FR1-TM2a', '4.9.2.2.13'], ['NR-FR1-TM2b', '4.9.2.2.13A'], ['NR-FR1-TM3.1', '4.9.2.2.14'],
  ['NR-FR1-TM3.1a', '4.9.2.2.15'], ['NR-FR1-TM3.1b', '4.9.2.2.15A'], ['NR-FR1-TM3.2', '4.9.2.2.16'],
  ['NR-FR1-TM3.3', '4.9.2.2.17'],
]);

const sbfdPatterns = ['du', 'ud', 'dud'] as const;
const nrSbfdDescriptors = nrBaseDefinitions.flatMap((base) => sbfdPatterns.map((pattern) => {
  const clause = sbfdClauseByModel.get(base.model);
  if (!clause) throw new Error(`SBFD clause is missing for ${base.model}`);
  return makeNrDescriptor({
    ...base,
    id: `${base.id}-sbfd-${pattern}` as SynthesizedSignalProfile,
    model: `${base.model}_SBFD_${pattern.toUpperCase()}`,
    clause,
    timing: `sbfd-${pattern}` as WaveformProjection['timing'],
  });
}));

const wifiDefinitions = [
  ['wifi6-he-su', 'Wi-Fi 6 HE SU', 'HE SU PPDU · 20 MHz · 242-tone RU', 'full', 18_906_250],
  ['wifi6-he-er-su', 'Wi-Fi 6 HE ER SU', 'HE ER SU PPDU · 20 MHz · 106-tone RU', 'resource-unit', 8_281_250],
  ['wifi6-he-mu', 'Wi-Fi 6 HE MU', 'HE MU PPDU · 20 MHz · multi-RU', 'multi-ru', 18_906_250],
  ['wifi6-he-tb', 'Wi-Fi 6 HE TB', 'HE TB PPDU · 20 MHz · triggered multi-RU', 'multi-ru', 18_906_250],
] as const;

const wifiDescriptors = wifiDefinitions.map(([id, label, model, allocation, occupiedBandwidthHz]) => makeDescriptor({
  id, label, family: 'wlan', model, centerHz: 5_180_000_000, occupiedBandwidthHz, recommendedSpanHz: 30_000_000,
  projection: { allocation, modulation: 'he-ofdm', timing: 'burst', subcarrierSpacingHz: 78_125 },
  source: sourceBasis('IEEE', [{ specification: 'IEEE 802.11-2024', clause: `${label.replace('Wi-Fi 6 ', '')} PPDU format`, revision: '2024', url: WIFI_URL }]),
  disclosure: `Standards-derived ${model} occupied-tone and burst projection. It is not a validated packet I/Q vector.`,
}));

const unorderedCatalog = [
  ...visualDescriptors,
  ...canonizedGsmDescriptors,
  ...gsmDescriptors,
  ...canonizedLteDescriptors,
  ...lteDescriptors,
  ...canonizedNrDescriptors,
  ...nrBaseDescriptors,
  nrNarrowbandDescriptor,
  ...nrSbfdDescriptors,
  ...canonizedWifiDescriptors,
  ...wifiDescriptors,
  ...canonizedBluetoothDescriptors,
];

const catalogById = new Map<SynthesizedSignalProfile, WaveformDescriptor>();
for (const descriptor of unorderedCatalog) {
  if (catalogById.has(descriptor.id)) throw new Error(`Waveform catalog contains duplicate ${descriptor.id}`);
  catalogById.set(descriptor.id, descriptor);
}

export const waveformCatalog: readonly WaveformDescriptor[] = SYNTHESIZED_SIGNAL_PROFILES.map((id) => {
  const descriptor = catalogById.get(id);
  if (!descriptor) throw new Error(`Waveform catalog is missing ${id}`);
  return descriptor;
});

if (waveformCatalog.length !== catalogById.size) throw new Error('Waveform catalog contains IDs outside the closed profile contract');

export function waveformDescriptor(profile: SynthesizedSignalProfile): WaveformDescriptor {
  const id = synthesizedSignalProfileSchema.parse(profile);
  const descriptor = catalogById.get(id);
  if (!descriptor) throw new Error(`Waveform catalog is missing ${id}`);
  return structuredClone(descriptor);
}

export function suggestedAnalyzerRange(descriptor: WaveformDescriptor): { startHz: number; stopHz: number } {
  waveformDescriptorSchema.parse(descriptor);
  const startHz = Math.round(descriptor.centerHz - descriptor.recommendedSpanHz / 2);
  const stopHz = Math.round(descriptor.centerHz + descriptor.recommendedSpanHz / 2);
  if (startHz < 0) throw new Error(`Waveform ${descriptor.id} recommends a negative start frequency`);
  return { startHz, stopHz };
}

export function requireConformanceValidated(profile: SynthesizedSignalProfile): WaveformDescriptor {
  const descriptor = waveformDescriptor(profile);
  if (descriptor.qualification !== 'conformance-validated' || !descriptor.assetSha256) {
    throw new Error(`${descriptor.label} is ${descriptor.qualification}; a conformance-validated I/Q asset is not installed`);
  }
  return descriptor;
}

function makeNrDescriptor(definition: ModelDefinition): WaveformDescriptor {
  const narrowband = definition.allocation === 'narrowband';
  return makeDescriptor({
    id: definition.id,
    label: `5G ${definition.model}`,
    family: 'nr',
    model: `${definition.model} · ${modulationLabel(definition.modulation)} · ${narrowband ? 'NB-IoT in-band' : '100 MHz · 30 kHz SCS'}`,
    centerHz: 3_500_000_000,
    occupiedBandwidthHz: narrowband ? 180_000 : 98_280_000,
    recommendedSpanHz: narrowband ? 2_000_000 : 120_000_000,
    projection: { allocation: definition.allocation, modulation: definition.modulation, timing: definition.timing, subcarrierSpacingHz: 30_000, nominalResourceBlocks: narrowband ? 1 : 273 },
    source: sourceBasis('3GPP', [{ specification: 'TS 38.141-1', clause: `Clause ${definition.clause} · ${definition.model}`, revision: '19.4.0', url: NR_URL }]),
    disclosure: `Standards-derived ${definition.model} resource-allocation and timing projection; no conformance claim is made without a validated I/Q asset.`,
  });
}

function makeDescriptor(input: Omit<WaveformDescriptor, 'qualification'>): WaveformDescriptor {
  return waveformDescriptorSchema.parse({ ...input, qualification: input.source.organization === 'TinySA SignalLab' ? 'visual' : 'standards-derived' });
}

function modulationLabel(modulation: WaveformProjection['modulation']): string {
  return ({
    unmodulated: 'unmodulated', am: 'AM', fm: 'FM', gmsk: 'GMSK', qpsk: 'QPSK', aqpsk: 'AQPSK', '8psk': '8-PSK',
    '16qam': '16-QAM', '32qam': '32-QAM', '64qam': '64-QAM', '256qam': '256-QAM', '1024qam': '1024-QAM', 'ofdm-mixed': 'mixed OFDM', 'he-ofdm': 'HE OFDM',
    'hr-dsss': 'HR-DSSS', 'br-edr': 'BR/EDR', 'ble-1m': 'LE 1M',
  })[modulation];
}
