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
import {
  NR_N78_30_KHZ_RASTER_CENTER_HZ,
  NR_N78_30_KHZ_RASTER_NREF,
} from './canonical-timing.js';

const LTE_URL = 'https://www.etsi.org/deliver/etsi_ts/136100_136199/136141/19.01.00_60/ts_136141v190100p.pdf';
const LTE_RF_URL = 'https://www.etsi.org/deliver/etsi_ts/136100_136199/136101/19.05.00_60/ts_136101v190500p.pdf';
const LTE_PHY_URL = 'https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/19.03.00_60/ts_136211v190300p.pdf';
const NR_URL = 'https://www.etsi.org/deliver/etsi_ts/138100_138199/13814101/19.04.00_60/ts_13814101v190400p.pdf';
const NR_RF_URL = 'https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/19.04.00_60/ts_138104v190400p.pdf';
const NR_PHY_URL = 'https://www.etsi.org/deliver/etsi_ts/138200_138299/138211/19.03.00_60/ts_138211v190300p.pdf';
const GSM_MODULATION_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145004/19.00.00_60/ts_145004v190000p.pdf';
const GSM_MULTIPLEXING_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145002/19.00.00_60/ts_145002v190000p.pdf';
const GSM_RADIO_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145005/19.00.00_60/ts_145005v190000p.pdf';
const WIFI_URL = 'https://standards.ieee.org/ieee/802.11/10548/';
const observableEquivalenceDisclosure = 'Canonized scalar power projection for observable Bayesian inference. It is not bit-exact or protocol-decodable I/Q, is not a conformance vector, and supports only observable-class equivalence rather than protocol or emitter identity.';
const agileObservableEquivalenceDisclosure = `${observableEquivalenceDisclosure} Frequency-agile scalar activity is also compatible with proprietary FHSS, scanning interference, or time-interleaved independent sources.`;
const lteTddObservableDisclosure = `${observableEquivalenceDisclosure} This downlink-only replay explicitly selects UL/DL configuration 0 and normal-CP special-subframe configuration 7 with srs-UpPtsAdd absent; only DwPTS is downlink-active in each special subframe. That special-subframe selection is not implied by Band 38 or UL/DL configuration 0.`;
const nrTddEngineeringDisclosure = `${observableEquivalenceDisclosure} The ${NR_N78_30_KHZ_RASTER_CENTER_HZ} Hz carrier center is n78 30 kHz-raster NREF ${NR_N78_30_KHZ_RASTER_NREF}. The versioned SignalLab engineering schedule uses one valid 5 ms, 30 kHz-SCS pattern with seven complete downlink slots followed by three complete uplink slots. It is a downlink-only scenario, not a pattern prescribed for n78 or universal across NR deployments.`;
const gsmLoadedBcchEngineeringDisclosure = `${observableEquivalenceDisclosure} This is an engineering scalar loaded-downlink replay using continuous slot occupancy and synthetic texture representing traffic, control, or dummy bursts. TS 45.008 supports the continuous BCCH premise, but the texture is not a decoded GMSK burst sequence; this does not imply every GSM carrier is continuous or provide protocol likelihood.`;
const wifiCsmaEngineeringDisclosure = `${observableEquivalenceDisclosure} Its seeded CSMA-like on/off envelope is a deterministic SignalLab acquisition schedule, not IEEE 802.11 MAC behavior or protocol likelihood.`;
const bluetoothClassicEngineeringDisclosure = `${agileObservableEquivalenceDisclosure} The classic-connected engineering schedule selects each hop independently from a uniform seeded pseudorandom sequence over 79 channel centers and uses a fixed two-active-slot/one-idle-slot pattern. It is not the Bluetooth hop-selection kernel, connection state, or universal BR/EDR traffic. The 79 MHz field is the aggregate edge-to-edge support across the 79 modeled 1 MHz channels (78 MHz first-to-last center spacing plus one channel width), not instantaneous occupied bandwidth.`;
const bleEngineeringDisclosure = `${agileObservableEquivalenceDisclosure} The versioned engineering schedule uses all three primary advertising centers in sequential 37, 38, 39 order, 1.5 ms packet-start spacing, fixed 376 us packet duration, a 20 ms interval, and a seeded per-event pseudorandom advDelay in [0, 10 ms). That sequence is standards-consistent for the modeled legacy all-three-channel event, but configured subsets, early event closure after a response, and extended advertising differ. The all-three use, spacing, duration, interval, and deterministic delay generator are engineering choices, not universal Bluetooth traffic or PDU behavior. The 80 MHz field is the aggregate primary-advertising-channel support span, not instantaneous occupied bandwidth.`;

const visualDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'cw', label: 'CW carrier', family: 'tone', model: 'Canonized scalar observable · RBW-filtered line', centerHz: 98_000_000,
    occupiedBandwidthHz: 2_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'carrier', modulation: 'unmodulated', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} This physics-derived case is an unmodulated mathematical line passed through the per-observation receiver RBW. The 2 kHz field is a nominal display-support floor for that line, not the receiver RBW or the source emission's measured or regulatory occupied bandwidth; rendered spectral width varies with the admitted observation RBW.`,
  }),
  makeDescriptor({
    id: 'am', label: 'AM replay', family: 'analog', model: 'Canonized DSB full-carrier observable · 25 kHz tone', centerHz: 98_000_000,
    occupiedBandwidthHz: 52_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'sidebands', modulation: 'am', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} The carrier and symmetric sidebands use the physical DSB full-carrier power ratio; independent coherent tones can be scalar-equivalent. The 52 kHz field is the 50 kHz separation between the two outer sideband lines plus the same nominal 2 kHz display-support floor used for a mathematical line. It is not the per-observation receiver RBW or measured/regulatory occupied bandwidth; rendered line widths vary with the admitted observation RBW and can extend beyond that nominal field.`,
  }),
  makeDescriptor({
    id: 'fm', label: 'FM replay', family: 'analog', model: 'Canonized sinusoidal FM observable · beta 3 · ±75 kHz', centerHz: 98_000_000,
    occupiedBandwidthHz: 200_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'sidebands', modulation: 'fm', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} The swept spectrum is the physical Bessel-series line-power projection; an independent Bessel-weighted comb can be scalar-equivalent. The 200 kHz field is Carson's engineering transmission-bandwidth estimate 2 × (75 kHz + 25 kHz), not exact containment or measured/regulatory occupied bandwidth; the physical Bessel series retains nonzero higher-order energy beyond it, while the renderer truncates numerically at n = ±10 and its amplitude threshold. Each retained line is passed through the per-observation receiver RBW, so rendered spectral support is not bounded by that metadata field.`,
  }),
];

const canonizedGsmDescriptors: WaveformDescriptor[] = [makeDescriptor({
  id: 'gsm-900-loaded-bcch', label: 'GSM 900 loaded observable', family: 'geran',
  model: 'Canonized scalar observable · loaded BCCH/dummy bursts', centerHz: 947_400_000,
  occupiedBandwidthHz: 200_000, recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation: 'gmsk', timing: 'continuous', duplex: 'fdd' },
  source: GSM_OBSERVABLE_SOURCE,
  disclosure: gsmLoadedBcchEngineeringDisclosure,
})];

const canonizedLteDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'lte-band3-fdd-20m', label: 'LTE Band 3 FDD observable', family: 'e-utra',
    model: 'Canonized scalar observable · 20 MHz · 15 kHz SCS', centerHz: 1_840_000_000,
    occupiedBandwidthHz: 18_000_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'continuous', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 100 },
    source: LTE_OBSERVABLE_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} The 18 MHz field is the 100 × 12 × 15 kHz nominal RB-grid span, not the 20 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
  makeDescriptor({
    id: 'lte-band38-tdd-10m', label: 'LTE Band 38 TDD downlink observable', family: 'e-utra',
    model: 'Canonized scalar observable · 10 MHz · UL/DL config 0 · normal-CP SSP config 7', centerHz: 2_595_000_000,
    occupiedBandwidthHz: 9_000_000, recommendedSpanHz: 20_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'tdd-frame', duplex: 'tdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 50 },
    source: LTE_TDD_OBSERVABLE_SOURCE,
    disclosure: `${lteTddObservableDisclosure} The 9 MHz field is the 50 × 12 × 15 kHz nominal RB-grid span, not the 10 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
];

const canonizedNrDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'nr-n3-fdd-20m', label: '5G NR n3 FDD observable', family: 'nr',
    model: 'Canonized scalar observable · 20 MHz · 15 kHz SCS', centerHz: 1_840_000_000,
    occupiedBandwidthHz: 19_080_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'continuous', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 106 },
    source: NR_OBSERVABLE_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} The 19.08 MHz field is the 106 × 12 × 15 kHz nominal RB-grid span, not the 20 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
  makeDescriptor({
    id: 'nr-n78-tdd-100m', label: '5G NR n78 TDD downlink observable', family: 'nr',
    model: `Canonized scalar observable · 100 MHz · 30 kHz SCS · NREF ${NR_N78_30_KHZ_RASTER_NREF} · engineering 7DL/3UL v1`, centerHz: NR_N78_30_KHZ_RASTER_CENTER_HZ,
    occupiedBandwidthHz: 98_280_000, recommendedSpanHz: 120_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'tdd-frame', duplex: 'tdd', subcarrierSpacingHz: 30_000, nominalResourceBlocks: 273 },
    source: NR_TDD_OBSERVABLE_SOURCE,
    disclosure: `${nrTddEngineeringDisclosure} The 98.28 MHz field is the 273 × 12 × 30 kHz nominal RB-grid span, not the 100 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
];

const canonizedWifiDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'wifi-hr-dsss-11m', label: 'Wi-Fi HR-DSSS observable', family: 'wlan',
    model: 'Canonized scalar observable · 2.4 GHz · 11 Mchip/s · seeded CSMA-like schedule · 22 MHz support projection', centerHz: 2_437_000_000,
    occupiedBandwidthHz: 22_000_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'hr-dsss', timing: 'burst' },
    source: WIFI_OBSERVABLE_SOURCE,
    disclosure: `${wifiCsmaEngineeringDisclosure} The 22 MHz field is an engineering support projection, not normative measured or regulatory occupied bandwidth; the 11 Mchip/s rate is standards-derived.`,
  }),
  makeDescriptor({
    id: 'wifi-ofdm-20m', label: 'Wi-Fi OFDM 20 MHz observable', family: 'wlan',
    model: 'Canonized scalar observable · 2.4 GHz · 20 MHz · 312.5 kHz SCS · seeded CSMA-like schedule · 16.6 MHz occupied-tone support projection', centerHz: 2_437_000_000,
    occupiedBandwidthHz: 16_600_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'burst', subcarrierSpacingHz: 312_500 },
    source: WIFI_OBSERVABLE_SOURCE,
    disclosure: `${wifiCsmaEngineeringDisclosure} The 16.6 MHz field is an engineering occupied-tone support projection, not normative measured or regulatory occupied bandwidth; 312.5 kHz SCS is standards-derived.`,
  }),
];

const canonizedBluetoothDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'bluetooth-classic-connected', label: 'Bluetooth BR/EDR connected observable', family: 'bluetooth',
    model: 'Canonized scalar observable · uniform seeded 79-center hopping · fixed two-active/one-idle slot schedule · 79 MHz aggregate edge-to-edge channel support', centerHz: 2_441_000_000,
    occupiedBandwidthHz: 79_000_000, recommendedSpanHz: 84_000_000,
    projection: { allocation: 'frequency-hopping', modulation: 'br-edr', timing: 'classic-slots' },
    source: BLUETOOTH_OBSERVABLE_SOURCE,
    disclosure: bluetoothClassicEngineeringDisclosure,
  }),
  makeDescriptor({
    id: 'bluetooth-le-advertising', label: 'Bluetooth LE advertising observable', family: 'bluetooth',
    model: 'Canonized scalar observable · primary advertising engineering schedule v1 · 80 MHz aggregate primary-channel support span', centerHz: 2_441_000_000,
    occupiedBandwidthHz: 80_000_000, recommendedSpanHz: 84_000_000,
    projection: { allocation: 'advertising-channels', modulation: 'ble-1m', timing: 'advertising-events' },
    source: BLUETOOTH_OBSERVABLE_SOURCE,
    disclosure: bleEngineeringDisclosure,
  }),
];

const gsmDefinitions = [
  ['gsm-normal-burst', 'GSM GMSK normal burst', 'GMSK normal burst', 'gmsk', 200_000, 'Clause 2, especially 2.1: GMSK format at the normal 1 625/6 ksymb/s symbol rate', 'Clauses 4.3 and 5.2.3.1: TDMA time-slot/frame and GMSK normal-burst structure'],
  ['gsm-qpsk-higher-symbol-rate-burst', 'GSM QPSK higher-symbol-rate burst', 'QPSK higher-symbol-rate burst', 'qpsk', 325_000, 'Clause 5, especially 5.1: QPSK format at the higher 325 ksymb/s symbol rate', 'Clauses 4.3 and 5.2.3a: TDMA time-slot/frame and QPSK higher-symbol-rate burst structure'],
  ['gsm-aqpsk-normal-burst', 'GSM AQPSK normal burst', 'AQPSK normal burst', 'aqpsk', 250_000, 'Clause 6, especially 6.1: AQPSK format at the normal 1 625/6 ksymb/s symbol rate', 'Clauses 4.3 and 5.2.3.2: TDMA time-slot/frame and AQPSK normal-burst structure'],
  ['gsm-8psk-normal-burst', 'EDGE 8-PSK normal burst', '8-PSK normal burst', '8psk', 250_000, 'Clause 3, especially 3.1: 8-PSK format at the normal 1 625/6 ksymb/s symbol rate', 'Clauses 4.3 and 5.2.3.3: TDMA time-slot/frame and 8-PSK normal-burst structure'],
  ['gsm-16qam-higher-symbol-rate-burst', 'EGPRS2 16-QAM higher-symbol-rate burst', '16-QAM higher-symbol-rate burst', '16qam', 325_000, 'Clause 5, especially 5.1: 16-QAM format at the higher 325 ksymb/s symbol rate', 'Clauses 4.3 and 5.2.3a: TDMA time-slot/frame and 16-QAM higher-symbol-rate burst structure'],
  ['gsm-32qam-higher-symbol-rate-burst', 'EGPRS2 32-QAM higher-symbol-rate burst', '32-QAM higher-symbol-rate burst', '32qam', 325_000, 'Clause 5, especially 5.1: 32-QAM format at the higher 325 ksymb/s symbol rate', 'Clauses 4.3 and 5.2.3a: TDMA time-slot/frame and 32-QAM higher-symbol-rate burst structure'],
] as const;

const gsmDescriptors = gsmDefinitions.map(([id, label, model, modulation, occupiedBandwidthHz, modulationClause, burstClause]) => makeDescriptor({
  id, label, family: 'geran', model, centerHz: 947_400_000, occupiedBandwidthHz, recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation, timing: 'burst' },
  source: sourceBasis('3GPP', [
    { specification: 'TS 45.004', clause: modulationClause, revision: '19.0.0', url: GSM_MODULATION_URL },
    { specification: 'TS 45.002', clause: burstClause, revision: '19.0.0', url: GSM_MULTIPLEXING_URL },
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
  { id: 'lte-etm3.1', model: 'E-TM3.1', clause: '6.1.1.4', allocation: 'full', modulation: '64qam', timing: 'frame' },
  { id: 'lte-etm3.1a', model: 'E-TM3.1a', clause: '6.1.1.4a', allocation: 'full', modulation: '256qam', timing: 'frame' },
  { id: 'lte-etm3.1b', model: 'E-TM3.1b', clause: '6.1.1.4b', allocation: 'full', modulation: '1024qam', timing: 'frame' },
  { id: 'lte-ntm', model: 'N-TM', clause: '6.1.3', allocation: 'narrowband', modulation: 'qpsk', timing: 'frame' },
];

const lteDescriptors = lteDefinitions.map((definition) => makeDescriptor({
  id: definition.id,
  label: `LTE ${definition.model}`,
  family: 'e-utra',
  model: definition.allocation === 'narrowband'
    ? `${definition.model} · ${modulationLabel(definition.modulation)} · 180 kHz isolated N-TM component presentation`
    : `${definition.model} · ${modulationLabel(definition.modulation)} · 20 MHz`,
  centerHz: 1_840_000_000,
  occupiedBandwidthHz: definition.allocation === 'narrowband' ? 180_000 : 18_000_000,
  recommendedSpanHz: definition.allocation === 'narrowband' ? 2_000_000 : 30_000_000,
  projection: {
    allocation: definition.allocation,
    modulation: definition.modulation,
    timing: definition.timing,
    ...(definition.allocation === 'narrowband' ? {} : { duplex: 'fdd' as const }),
    subcarrierSpacingHz: 15_000,
    nominalResourceBlocks: definition.allocation === 'narrowband' ? 1 : 100,
  },
  source: definition.allocation === 'narrowband'
    ? sourceBasis('3GPP', [
      {
        specification: 'TS 36.141',
        clause: 'Clauses 6.1.3 and 6.1.4.5: N-TM setup and the default QPSK NPDSCH PRBs',
        revision: '19.1.0',
        url: LTE_URL,
      },
      {
        specification: 'TS 36.211',
        clause: 'Clauses 6.2.3 and 10.2.2.1: one downlink resource block, 12 subcarriers, and 15 kHz SCS',
        revision: '19.3.0',
        url: LTE_PHY_URL,
      },
    ])
    : sourceBasis('3GPP', [
      { specification: 'TS 36.141', clause: `Clause ${definition.clause} · ${definition.model}`, revision: '19.1.0', url: LTE_URL },
      { specification: 'TS 36.101', clause: 'Clauses 5.5 and 5.6: Band 3 FDD operating band and 20 MHz transmission-bandwidth configuration', revision: '19.5.0', url: LTE_RF_URL },
      { specification: 'TS 36.211', clause: 'Clauses 4 and 6: FDD frame structure, 15 kHz resource grid, and OFDM physical channels', revision: '19.3.0', url: LTE_PHY_URL },
    ]),
  disclosure: definition.allocation === 'narrowband'
    ? 'Standards-derived isolated N-TM component projection. The 180 kHz field is its 1 × 12 × 15 kHz nominal RB-grid span, not measured 99%-power or regulatory occupied bandwidth. Its 1.840 GHz center is an engineering display coordinate, not a standards-derived N-TM placement. This presentation does not claim a standalone, guard-band, or in-band deployment mode, either composite configuration, or conformance.'
    : `Standards-derived ${definition.model} full-allocation/modulation context in a valid Band 3 FDD 20 MHz, 15 kHz-SCS instantiation. The 18 MHz field is the 100 × 12 × 15 kHz nominal RB-grid span, not the 20 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth. The scalar renderer repeats a frame-level power projection; it is not the bit-exact physical-channel grid or a conformance waveform.`,
}));

const lteNarrowbandCompositeComponentDefinitions = [
  {
    id: 'lte-nbiot-guard-isolated-component',
    label: 'LTE isolated guard-band NB-IoT component',
    model: 'Isolated guard-band N-TM component',
    clause: '6.1.5',
    placement: 'guard-band',
  },
  {
    id: 'lte-nbiot-inband-isolated-component',
    label: 'LTE isolated in-band NB-IoT component',
    model: 'Isolated in-band N-TM component',
    clause: '6.1.6',
    placement: 'in-band',
  },
] as const;

const lteNarrowbandCompositeComponentDescriptors = lteNarrowbandCompositeComponentDefinitions.map((definition) => makeDescriptor({
  id: definition.id,
  label: definition.label,
  family: 'e-utra',
  model: `${definition.model} · QPSK · 180 kHz engineering projection`,
  centerHz: 1_840_000_000,
  occupiedBandwidthHz: 180_000,
  recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation: 'qpsk', timing: 'frame', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 1 },
  source: sourceBasis('3GPP', [
    {
      specification: 'TS 36.141',
      clause: `Clauses 6.1.3, 6.1.4.5, and ${definition.clause}: N-TM/QPSK plus the composite E-TM1.1 carrier, ${definition.placement} placement, and host/component power allocation`,
      revision: '19.1.0',
      url: LTE_URL,
    },
    {
      specification: 'TS 36.211',
      clause: 'Clauses 6.2.3 and 10.2.2.1: one downlink resource block, 12 subcarriers, and 15 kHz SCS',
      revision: '19.3.0',
      url: LTE_PHY_URL,
    },
  ]),
  disclosure: definition.placement === 'guard-band'
    ? 'Engineering fixture of only an isolated N-TM NB-IoT component. The 180 kHz field is its 1 × 12 × 15 kHz nominal RB-grid span, not measured 99%-power or regulatory occupied bandwidth. Its 1.840 GHz center is an engineering display coordinate, not the required host-relative placement. The E-TM1.1 host carrier, placement closest to the host E-UTRA PRBs, and host/component power allocation are absent, so this does not realize or claim the complete TS 36.141 clause 6.1.5 guard-band test model or conformance.'
    : 'Engineering fixture of only an isolated N-TM NB-IoT component. The 180 kHz field is its 1 × 12 × 15 kHz nominal RB-grid span, not measured 99%-power or regulatory occupied bandwidth. Its 1.840 GHz center is an engineering display coordinate, not the required host-relative placement. The E-TM1.1 host carrier, punctured-PRB placement, retained host E-UTRA resource elements, and host/component power allocation are absent, so this does not realize or claim the complete TS 36.141 clause 6.1.6 in-band test model or conformance.',
}));

const nrBaseDefinitions: readonly ModelDefinition[] = [
  { id: 'nr-fr1-tm1.1', model: 'NR-FR1-TM1.1', clause: '4.9.2.2.1', allocation: 'full', modulation: 'qpsk', timing: 'frame' },
  { id: 'nr-fr1-tm3.1', model: 'NR-FR1-TM3.1', clause: '4.9.2.2.5', allocation: 'full', modulation: '64qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.1a', model: 'NR-FR1-TM3.1a', clause: '4.9.2.2.6', allocation: 'full', modulation: '256qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.1b', model: 'NR-FR1-TM3.1b', clause: '4.9.2.2.6A', allocation: 'full', modulation: '1024qam', timing: 'frame' },
];

const nrBaseDescriptors = nrBaseDefinitions.map((definition) => makeNrDescriptor(definition));
const nrNarrowbandComponentDescriptor = makeDescriptor({
  id: 'nr-nbiot-inband-isolated-component',
  label: 'NB-IoT N-TM component isolated from NR-N-TM composite',
  family: 'e-utra',
  model: 'Isolated N-TM NB-IoT component · QPSK · 180 kHz · 15 kHz SCS',
  centerHz: NR_N78_30_KHZ_RASTER_CENTER_HZ,
  occupiedBandwidthHz: 180_000,
  recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation: 'qpsk', timing: 'frame', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 1 },
  source: sourceBasis('3GPP', [
    {
      specification: 'TS 38.141-1',
      clause: 'Clause 4.9.2.2.9: NR-N-TM composite uses NR-FR1-TM1.1 on NR carriers and N-TM on NB-IoT carriers, with one eligible NR RB punctured closest to the NR minimum guard band and host/component RE power allocation',
      revision: '19.4.0',
      url: NR_URL,
    },
    {
      specification: 'TS 38.104',
      clause: `Tables 5.4.2.1-1 and 5.4.2.3-1: the engineering parent-carrier display coordinate ${NR_N78_30_KHZ_RASTER_CENTER_HZ} Hz is n78 30 kHz-raster NREF ${NR_N78_30_KHZ_RASTER_NREF}`,
      revision: '19.4.0',
      url: NR_RF_URL,
    },
    {
      specification: 'TS 36.141',
      clause: 'Clauses 6.1.3 and 6.1.4.5: imported N-TM definition and the default QPSK NPDSCH PRBs',
      revision: '19.1.0',
      url: LTE_URL,
    },
    {
      specification: 'TS 36.211',
      clause: 'Clauses 6.2.3 and 10.2.2.1: one downlink resource block, 12 subcarriers, and 15 kHz SCS',
      revision: '19.3.0',
      url: LTE_PHY_URL,
    },
  ]),
  disclosure: `Engineering fixture of only the E-UTRA/NB-IoT N-TM component imported by the NR-N-TM parent test model. The 180 kHz field is its 1 × 12 × 15 kHz nominal RB-grid span, not measured 99%-power or regulatory occupied bandwidth. Its ${NR_N78_30_KHZ_RASTER_CENTER_HZ} Hz center is the engineering NR parent-carrier display coordinate, not an eligible punctured-RB NB-IoT placement. The NR-FR1-TM1.1 host carrier, eligible punctured-RB placement closest to the NR minimum guard band, and host/component RE power allocation are absent, so this does not realize or claim the complete TS 38.141-1 clause 4.9.2.2.9 NR-N-TM composite or conformance. Its family describes the isolated component air interface, not its NR parent context.`,
});

const wifiDefinitions = [
  ['wifi6-he-su', 'Wi-Fi 6 HE SU', 'HE SU PPDU · 20 MHz · 242-tone engineering support projection', 'full', 242, 'Clause 27: HE SU PPDU, HE PHY resource-unit, and OFDM tone-plan definitions'],
  ['wifi6-he-er-su', 'Wi-Fi 6 HE ER SU', 'HE ER SU PPDU · 20 MHz · 106-tone engineering support projection', 'resource-unit', 106, 'Clause 27: HE ER SU PPDU, HE PHY resource-unit, and OFDM tone-plan definitions'],
  ['wifi6-he-mu', 'Wi-Fi 6 HE MU', 'HE MU PPDU · 20 MHz · multi-RU · 242-tone engineering support projection', 'multi-ru', 242, 'Clause 27: HE MU PPDU, HE PHY resource-unit, and OFDM tone-plan definitions'],
  ['wifi6-he-tb', 'Wi-Fi 6 triggered HE TB uplink aggregate', 'Triggered HE TB uplink aggregate · 20 MHz · multi-RU · 242-tone engineering support projection', 'multi-ru', 242, 'Clauses 26 and 27: triggered uplink multi-user operation and HE-TB PPDU/resource-unit context for this channel-wide aggregate of per-STA HE-TB PPDUs'],
] as const;

const wifiDescriptors = wifiDefinitions.map(([id, label, model, allocation, toneCount, sourceClause]) => makeDescriptor({
  id, label, family: 'wlan', model, centerHz: 5_180_000_000, occupiedBandwidthHz: toneCount * 78_125, recommendedSpanHz: 30_000_000,
  projection: { allocation, modulation: 'he-ofdm', timing: 'burst', subcarrierSpacingHz: 78_125 },
  source: sourceBasis('IEEE', [{ specification: 'IEEE 802.11-2024', clause: sourceClause, revision: '2024', url: WIFI_URL }]),
  disclosure: `Standards-derived HE format context and 78.125 kHz tone spacing. The ${toneCount} × 78.125 kHz = ${toneCount * 78_125} Hz field is a SignalLab engineering occupied-tone span projection, not normative measured or regulatory occupied bandwidth. It is not a validated packet I/Q vector.`,
}));

const unorderedCatalog = [
  ...visualDescriptors,
  ...canonizedGsmDescriptors,
  ...gsmDescriptors,
  ...canonizedLteDescriptors,
  ...lteDescriptors,
  ...lteNarrowbandCompositeComponentDescriptors,
  ...canonizedNrDescriptors,
  ...nrBaseDescriptors,
  nrNarrowbandComponentDescriptor,
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
  return makeDescriptor({
    id: definition.id,
    label: `5G ${definition.model}`,
    family: 'nr',
    model: `${definition.model} · ${modulationLabel(definition.modulation)} · n3 FDD · 20 MHz · 15 kHz SCS`,
    centerHz: 1_840_000_000,
    occupiedBandwidthHz: 19_080_000,
    recommendedSpanHz: 30_000_000,
    projection: { allocation: definition.allocation, modulation: definition.modulation, timing: definition.timing, duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 106 },
    source: sourceBasis('3GPP', [
      { specification: 'TS 38.141-1', clause: `Clause ${definition.clause} · ${definition.model}`, revision: '19.4.0', url: NR_URL },
      { specification: 'TS 38.104', clause: 'Tables 5.2-1, 5.3.2-1, 5.3.5-1, and 5.4.2.3-1: n3 FDD, 20 MHz at 15 kHz SCS with 106 RB, band/channel-bandwidth support, and the 100 kHz channel raster', revision: '19.4.0', url: NR_RF_URL },
      { specification: 'TS 38.211', clause: 'Clauses 4.2 through 4.4: numerology, frame/slot structure, and resource-grid definitions', revision: '19.3.0', url: NR_PHY_URL },
    ]),
    disclosure: `Standards-derived ${definition.model} full-allocation/modulation context in a valid n3 FDD 20 MHz, 15 kHz-SCS, 106-RB instantiation. The 19.08 MHz field is the 106 × 12 × 15 kHz nominal RB-grid span, not the 20 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth. The scalar renderer repeats a frame-level power projection; it is not the bit-exact physical-channel grid or a conformance waveform.`,
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
