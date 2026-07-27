import {
  SYNTHESIZED_SIGNAL_PROFILES,
  synthesizedSignalProfileSchema,
  waveformDescriptorSchema,
  type SynthesizedSignalProfile,
  type WaveformDescriptor,
  type WaveformProjection,
} from './contracts.js';
import { CUSTOM_WAVEFORM_PROFILES, customWaveformDescriptor, isCustomWaveformProfile } from './custom-waveform.js';
import {
  ANALYTIC_SCALAR_SOURCE,
  BLUETOOTH_BR_DH1_FIXED_VECTOR_SOURCE,
  BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR_SOURCE,
  GSM_OBSERVABLE_SOURCE,
  LTE_OBSERVABLE_SOURCE,
  LTE_TDD_OBSERVABLE_SOURCE,
  NR_OBSERVABLE_SOURCE,
  NR_TDD_OBSERVABLE_SOURCE,
  REFERENCE_WAVEFORM_SOURCE,
  WIFI_ERP_OFDM_SOURCE,
  WIFI_HR_DSSS_SOURCE,
  sourceBasis,
} from './source-provenance.js';
import {
  NR_N78_30_KHZ_RASTER_CENTER_HZ,
  NR_N78_30_KHZ_RASTER_NREF,
} from './canonical-timing.js';
import { profileGovernanceFor } from './profile-governance.js';
import { LTE_ETM1_1_CATALOG_CF32LE_SHA256 } from './lte-etm1-catalog-iq.js';
import { LTE_ETM3_CATALOG_CF32LE_SHA256 } from './lte-etm3-catalog-iq.js';
import { GERAN_FIXED_CATALOG_CF32LE_SHA256 } from './geran-fixed-identities.js';
import { LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256 } from './lte-band3-fdd-20m-catalog-iq.js';
import { LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256 } from './lte-band38-tdd-10m-catalog-iq.js';
import { LTE_NTM_CATALOG_CF32LE_SHA256 } from './lte-ntm-catalog-iq.js';
import { NR_FR1_TM_CATALOG_CF32LE_SHA256 } from './nr-fr1-test-model-catalog-iq.js';
import { NR_REMAINING_FIXED_CF32LE_SHA256 } from './nr-remaining-fixed-catalog-iq.js';
import { BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256 } from './bluetooth-fixed-catalog-iq.js';
import {
  WIFI_ERP_OFDM_CF32LE_SHA256,
  WIFI_HR_DSSS_CF32LE_SHA256,
  WIFI_HE_ER_SU_CF32LE_SHA256,
  WIFI_HE_MU_CF32LE_SHA256,
  WIFI_HE_SU_CF32LE_SHA256,
  WIFI_HE_TB_CF32LE_SHA256,
} from './wlan-fixed-iq.js';

const LTE_URL = 'https://www.etsi.org/deliver/etsi_ts/136100_136199/136141/19.01.00_60/ts_136141v190100p.pdf';
const LTE_RF_URL = 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.104/36104-j20.zip';
const LTE_PHY_URL = 'https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/19.03.00_60/ts_136211v190300p.pdf';
const LTE_CODING_URL = 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.212/36212-j30.zip';
const NR_URL = 'https://www.etsi.org/deliver/etsi_ts/138100_138199/13814101/19.04.00_60/ts_13814101v190400p.pdf';
const NR_RF_URL = 'https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/19.04.00_60/ts_138104v190400p.pdf';
const NR_PHY_URL = 'https://www.etsi.org/deliver/etsi_ts/138200_138299/138211/19.04.00_60/ts_138211v190400p.pdf';
const NR_SCHEDULING_URL = 'https://www.3gpp.org/ftp/Specs/archive/38_series/38.214/38214-j40.zip';
const GSM_MODULATION_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145004/19.00.00_60/ts_145004v190000p.pdf';
const GSM_MULTIPLEXING_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145002/19.00.00_60/ts_145002v190000p.pdf';
const GSM_CHANNEL_CODING_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145003/19.00.00_60/ts_145003v190000p.pdf';
const GSM_RADIO_URL = 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145005/19.00.00_60/ts_145005v190000p.pdf';
const WIFI_URL = 'https://standards.ieee.org/ieee/802.11/10548/';
const observableEquivalenceDisclosure = 'Canonized scalar power projection for observable Bayesian inference. It is not bit-exact or protocol-decodable I/Q, is not a conformance vector, and supports only observable-class equivalence rather than protocol or emitter identity.';
const agileObservableEquivalenceDisclosure = `${observableEquivalenceDisclosure} Frequency-agile scalar activity is also compatible with proprietary FHSS, scanning interference, or time-interleaved independent sources.`;
const lteTddObservableDisclosure = `${observableEquivalenceDisclosure} This downlink-only replay explicitly selects UL/DL configuration 0 and normal-CP special-subframe configuration 7 with srs-UpPtsAdd absent; only DwPTS is downlink-active in each special subframe. That special-subframe selection is not implied by Band 38 or UL/DL configuration 0.`;
const nrTddEngineeringDisclosure = `${observableEquivalenceDisclosure} The exact complex-I/Q lane is NR-FR1-TM1.1 at ${NR_N78_30_KHZ_RASTER_CENTER_HZ} Hz, n78 30 kHz-raster NREF ${NR_N78_30_KHZ_RASTER_NREF}, using the TS 38.141-1 Table 4.9.2.2-1 prescribed 5 ms TDD pattern: seven complete downlink slots, six downlink and four uplink symbols in the mixed slot, then two complete uplink slots. The scalar renderer remains non-decodable. Qualification is confined to the fixed clean digital artifact and does not transfer to another TDD pattern, RF implementation, or product.`;
const gsmLoadedBcchEngineeringDisclosure = `${observableEquivalenceDisclosure} The complex-I/Q source is seed-invariant and content-addressed: TS0 cycles four fixed GMSK xCCH normal bursts independently encode/decode matched to pinned libosmocore, while TS1 through TS7 use the exact TS 45.002 dummy burst. The schedule is a concrete fixed normal/dummy-burst replay, not a complete BCCH 51-multiframe or universal network schedule. Its numerically evaluated TS 45.004 modulation is uniformly cf32-scaled and is not calibrated RF, TS 45.005 conformance evidence, or product qualification. The separate scalar observable projection remains non-decodable and provides no protocol or emitter-identity likelihood.`;
const wifiCsmaEngineeringDisclosure = `${observableEquivalenceDisclosure} Its seeded CSMA-like on/off envelope is a deterministic SignalLab acquisition schedule, not IEEE 802.11 MAC behavior or protocol likelihood.`;
const bluetoothClassicEngineeringDisclosure = `${agileObservableEquivalenceDisclosure} The exact complex-I/Q lane is a seed-invariant Basic Rate DH1 packet: LAP 0x000000, UAP 0x47, CLK6-1 0x3f, LT_ADDR 3, five payload octets 01–05, HEC 0x06, CRC octets 37 6c, whitening, and rate-1/3 header repetition in one 625 us slot on pinned RF channel 8 (2410 MHz). At exactly 80 Msamples/s and the 1 MHz channel binding, every ideal BT=0.5, h=0.32 GFSK sample is content-addressed and compared with a separately structured digital oracle. It does not synthesize EDR or a hop-selection kernel, and it is not Bluetooth SIG RF-PHY or product qualification. The separate scalar analyzer renderer remains a non-decodable 79-center observable projection; its 79 MHz aggregate field is not this packet's instantaneous occupied bandwidth.`;
const bleEngineeringDisclosure = `${agileObservableEquivalenceDisclosure} The exact complex-I/Q lane matches the Bluetooth Core 6.3 LE 1M complete-packet sample for one legacy ADV_NONCONN_IND event: random static AdvA C1:A2:A3:A4:A5:A6, AdvData 01 02 03, advertising access address 0x8E89BED6, CRCInit 0x555555, CRC and whitening on primary advertising channel 38 (2426 MHz), and a 152 us packet. At exactly 80 Msamples/s and the 1 MHz channel binding, every ideal BT=0.5, h=0.5 GFSK sample is content-addressed and compared with a separately structured digital oracle. No unverified event recurrence is invented. This is not Bluetooth SIG RF-PHY or product qualification. The separate scalar analyzer renderer remains a non-decodable all-primary-channel observable projection; its 80 MHz aggregate field is not this packet's instantaneous occupied bandwidth.`;

const visualDescriptors: WaveformDescriptor[] = [
  makeDescriptor({
    id: 'cw', label: 'Unmodulated CW analytic lab stimulus', family: 'tone', model: 'Analytic laboratory stimulus · canonized RBW-filtered mathematical line', centerHz: 98_000_000,
    occupiedBandwidthHz: 2_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'carrier', modulation: 'unmodulated', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} This physics-derived analytic laboratory stimulus is an unmodulated mathematical line passed through the per-observation receiver RBW. The 2 kHz field is a nominal display-support floor for that line, not the receiver RBW or the source emission's measured or regulatory occupied bandwidth; rendered spectral width varies with the admitted observation RBW. It is not an RF calibration or standards-conformance waveform; standards-conformance status is N/A.`,
  }),
  makeDescriptor({
    id: 'am', label: 'DSB full-carrier AM analytic lab stimulus', family: 'analog', model: 'Analytic laboratory stimulus · DSB full carrier · 25 kHz tone · modulation index 0.72', centerHz: 98_000_000,
    occupiedBandwidthHz: 52_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'sidebands', modulation: 'am', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} This analytic laboratory stimulus uses a 25 kHz sinusoidal message and modulation index 0.72. The carrier and symmetric sidebands use the physical DSB full-carrier power ratio; independent coherent tones can be scalar-equivalent. The 52 kHz field is the 50 kHz separation between the two outer sideband lines plus the same nominal 2 kHz display-support floor used for a mathematical line. It is not the per-observation receiver RBW or measured/regulatory occupied bandwidth; rendered line widths vary with the admitted observation RBW and can extend beyond that nominal field. It is not a broadcast-service, RF-calibration, or standards-conformance waveform; standards-conformance status is N/A.`,
  }),
  makeDescriptor({
    id: 'fm', label: 'Single-tone FM analytic lab stimulus', family: 'analog', model: 'Analytic laboratory stimulus · 25 kHz tone · ±75 kHz deviation · beta 3', centerHz: 98_000_000,
    occupiedBandwidthHz: 200_000, recommendedSpanHz: 500_000,
    projection: { allocation: 'sidebands', modulation: 'fm', timing: 'continuous' },
    source: ANALYTIC_SCALAR_SOURCE,
    disclosure: `${observableEquivalenceDisclosure} This analytic laboratory stimulus uses a 25 kHz sinusoidal message, ±75 kHz peak deviation, and modulation index beta 3. The swept spectrum is the physical Bessel-series line-power projection; an independent Bessel-weighted comb can be scalar-equivalent. The 200 kHz field is Carson's engineering transmission-bandwidth estimate 2 × (75 kHz + 25 kHz), not exact containment or measured/regulatory occupied bandwidth; the physical Bessel series retains nonzero higher-order energy beyond it, while the renderer truncates numerically at n = ±10 and its amplitude threshold. Each retained line is passed through the per-observation receiver RBW, so rendered spectral support is not bounded by that metadata field. It is not an FM-broadcast, RF-calibration, or standards-conformance waveform; standards-conformance status is N/A.`,
  }),
];

const canonizedGsmDescriptors: WaveformDescriptor[] = [makeDigitallyQualifiedDescriptor({
  id: 'gsm-900-loaded-bcch', label: 'GSM 900 fixed normal/dummy burst vector', family: 'geran',
  model: 'Fixed digital vector · TS0 four-burst xCCH block · TS1–TS7 exact dummy bursts; separate scalar observable projection retained', centerHz: 947_400_000,
  occupiedBandwidthHz: 200_000, recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation: 'gmsk', timing: 'continuous', duplex: 'fdd' },
  source: sourceBasis('3GPP', [
    { specification: 'TS 45.002', clause: 'Clauses 4.3, 5.2.3.1, and 5.2.6: TDMA timing, normal-burst, and dummy-burst structures', revision: '19.0.0', url: GSM_MULTIPLEXING_URL },
    { specification: 'TS 45.003', clause: 'Clauses 4.1.1 through 4.1.5 and 4.4: fixed xCCH coding, interleaving, and burst mapping', revision: '19.0.0', url: GSM_CHANNEL_CODING_URL },
    { specification: 'TS 45.004', clause: 'Clauses 2.1 through 2.6: GMSK modulation construction', revision: '19.0.0', url: GSM_MODULATION_URL },
  ]),
  disclosure: gsmLoadedBcchEngineeringDisclosure,
  assetSha256: GERAN_FIXED_CATALOG_CF32LE_SHA256['gsm-900-loaded-bcch'],
})];

const canonizedLteDescriptors: WaveformDescriptor[] = [
  makeDigitallyQualifiedDescriptor({
    id: 'lte-band3-fdd-20m', label: 'LTE Band 3 FDD E-TM1.1 fixed frame', family: 'e-utra',
    model: 'Fixed digital vector · E-TM1.1 · 20 MHz FDD · 100 RB · PCI 1; separate scalar observable projection retained', centerHz: 1_840_000_000,
    occupiedBandwidthHz: 18_000_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'qpsk', timing: 'frame', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 100 },
    source: sourceBasis('3GPP', [
      { specification: 'TS 36.104', clause: 'Clauses 5.5 and 5.6: Band 3 and 20 MHz transmission-bandwidth configuration', revision: '19.2.0', url: LTE_RF_URL },
      { specification: 'TS 36.141', clause: 'Clause 6.1.1.1, Table 6.1.1.1-1, and 6.1.2: E-TM1.1 fixed test model', revision: '19.1.0', url: LTE_URL },
      { specification: 'TS 36.211', clause: 'Clauses 4.1, 6.2.1 through 6.12, and 7.1.2: frame, grid, physical channels, OFDM, and QPSK', revision: '19.3.0', url: LTE_PHY_URL },
      { specification: 'TS 36.212', clause: 'Clauses 5.3.4 through 5.3.5: BCH and DL-SCH coding', revision: '19.3.0', url: LTE_CODING_URL },
    ]),
    disclosure: `${observableEquivalenceDisclosure} The exact clean complex-I/Q lane is a content-addressed 20 MHz Band 3 FDD E-TM1.1 frame at 30.72 Msamples/s, exhaustively matched to a pinned srsRAN_4G oracle. The 18 MHz field is the 100 × 12 × 15 kHz nominal RB-grid span, not measured or regulatory occupied bandwidth. Alternate geometry, RF conformance, and product certification are excluded.`,
    assetSha256: LTE_BAND3_FDD_20M_CATALOG_CF32LE_SHA256,
  }),
  makeDigitallyQualifiedDescriptor({
    id: 'lte-band38-tdd-10m', label: 'LTE Band 38 TDD fixed downlink fixture', family: 'e-utra',
    model: 'Fixed digital fixture · 10 MHz · UL/DL config 0 · normal-CP SSP config 7; separate scalar observable projection retained', centerHz: 2_595_000_000,
    occupiedBandwidthHz: 9_000_000, recommendedSpanHz: 20_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'tdd-frame', duplex: 'tdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 50 },
    source: sourceBasis('3GPP', [
      { specification: 'TS 36.104', clause: 'Clauses 5.5 and 5.6: Band 38 and 10 MHz transmission-bandwidth configuration', revision: '19.2.0', url: LTE_RF_URL },
      { specification: 'TS 36.211', clause: 'Clause 4.2: UL/DL configuration 0 and normal-CP special-subframe configuration 7; clauses 6.2.1 through 6.12: 50-RB grid, physical channels, and OFDM generation', revision: '19.3.0', url: LTE_PHY_URL },
      { specification: 'TS 36.213', clause: 'Clause 6.9 and Table 6.9-1: PHICH mi mapping for TDD UL/DL configuration 0', revision: '19.3.0', url: 'https://www.3gpp.org/ftp/Specs/archive/36_series/36.213/36213-j30.zip' },
    ]),
    disclosure: `${lteTddObservableDisclosure} The exact clean complex-I/Q lane is a content-addressed 10 MHz TDD downlink fixture at 15.36 Msamples/s, exhaustively matched to a pinned srsRAN_4G oracle. It is not represented as a named E-TM. The 9 MHz field is the 50 × 12 × 15 kHz nominal RB-grid span, not measured or regulatory occupied bandwidth; RF and product certification are excluded.`,
    assetSha256: LTE_BAND38_TDD_10M_CATALOG_CF32LE_SHA256,
  }),
];

const canonizedNrDescriptors: WaveformDescriptor[] = [
  makeDigitallyQualifiedDescriptor({
    id: 'nr-n3-fdd-20m', label: '5G NR n3 FDD NR-FR1-TM1.1 fixed frame', family: 'nr',
    model: 'Fixed digital vector · NR-FR1-TM1.1 · 20 MHz · 15 kHz SCS · ARFCN 368000 · PCI 1', centerHz: 1_840_000_000,
    occupiedBandwidthHz: 19_080_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'qpsk', timing: 'frame', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 106 },
    source: sourceBasis('3GPP', [
      { specification: 'TS 38.104', clause: 'Tables 5.2-1, 5.3.2-1, 5.3.5-1, and 5.4.2.3-1: n3, 20 MHz, 15 kHz SCS, and channel raster', revision: '19.4.0', url: NR_RF_URL },
      { specification: 'TS 38.141-1', clause: 'Clauses 4.9.2.2.1 and 4.9.2.3: NR-FR1-TM1.1 fixed test model', revision: '19.4.0', url: NR_URL },
      { specification: 'TS 38.211', clause: 'Clauses 4.2 through 4.4, 5.2.1, 5.3, 5.1.3, 7.3, and 7.4: grid, mapping, channels, and reference signals', revision: '19.4.0', url: NR_PHY_URL },
      { specification: 'TS 38.214', clause: 'Clause 5.1.2.2.2: type-1 PDSCH resource allocation', revision: '19.4.0', url: NR_SCHEDULING_URL },
    ]),
    disclosure: `${observableEquivalenceDisclosure} The exact clean complex-I/Q lane is a content-addressed 20 MHz n3 FDD NR-FR1-TM1.1 frame at 30.72 Msamples/s, ARFCN 368000 and PCI 1, exhaustively matched to a pinned py3gpp oracle. The 19.08 MHz field is the nominal RB-grid span, not measured or regulatory occupied bandwidth. Alternate geometry, RF conformance, and product certification are excluded.`,
    assetSha256: NR_REMAINING_FIXED_CF32LE_SHA256['nr-n3-fdd-20m'],
  }),
  makeDigitallyQualifiedDescriptor({
    id: 'nr-n78-tdd-100m', label: '5G NR n78 TDD NR-FR1-TM1.1 fixed frame', family: 'nr',
    model: `Fixed digital vector · NR-FR1-TM1.1 · 100 MHz · 30 kHz SCS · NREF ${NR_N78_30_KHZ_RASTER_NREF} · prescribed 7DL+mixed+2UL pattern`, centerHz: NR_N78_30_KHZ_RASTER_CENTER_HZ,
    occupiedBandwidthHz: 98_280_000, recommendedSpanHz: 120_000_000,
    projection: { allocation: 'full', modulation: 'qpsk', timing: 'tdd-frame', duplex: 'tdd', subcarrierSpacingHz: 30_000, nominalResourceBlocks: 273 },
    source: sourceBasis('3GPP', [
      { specification: 'TS 38.104', clause: 'Tables 5.2-1, 5.3.2-1, 5.3.5-1, and 5.4.2.3-1: n78, 100 MHz, 30 kHz SCS, and channel raster', revision: '19.4.0', url: NR_RF_URL },
      { specification: 'TS 38.141-1', clause: 'Clause 4.9.2.2.1 and Table 4.9.2.2-1: NR-FR1-TM1.1 and prescribed TDD pattern', revision: '19.4.0', url: NR_URL },
      { specification: 'TS 38.211', clause: 'Clauses 4.2 through 4.4, 5.2.1, 5.3, 5.1.3, 7.3, and 7.4: grid, mapping, channels, and reference signals', revision: '19.4.0', url: NR_PHY_URL },
      { specification: 'TS 38.214', clause: 'Clause 5.1.2.2.2: type-1 PDSCH resource allocation', revision: '19.4.0', url: NR_SCHEDULING_URL },
      { specification: 'TS 38.331', clause: 'Clause 6.3.2: TDD-UL-DL-ConfigCommon', revision: '19.1.0', url: 'https://www.etsi.org/deliver/etsi_ts/138300_138399/138331/19.01.00_60/ts_138331v190100p.pdf' },
      { specification: 'TS 38.213', clause: 'Clause 11.1: slot configuration', revision: '19.3.0', url: 'https://www.etsi.org/deliver/etsi_ts/138200_138299/138213/19.03.00_60/ts_138213v190300p.pdf' },
    ]),
    disclosure: `${nrTddEngineeringDisclosure} The 98.28 MHz field is the 273 × 12 × 30 kHz nominal RB-grid span, not the 100 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
    assetSha256: NR_REMAINING_FIXED_CF32LE_SHA256['nr-n78-tdd-100m'],
  }),
];

const canonizedWifiDescriptors: WaveformDescriptor[] = [
  makeDigitallyQualifiedDescriptor({
    id: 'wifi-hr-dsss-11m', label: 'Wi-Fi HR-DSSS fixed ACK PPDU', family: 'wlan',
    model: 'Fixed digital vector · long PLCP · 11 Mb/s CCK ACK · 11 Mchip/s ideal complex-chip interface; separate scalar observable projection retained', centerHz: 2_437_000_000,
    occupiedBandwidthHz: 22_000_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'hr-dsss', timing: 'burst' },
    source: WIFI_HR_DSSS_SOURCE,
    disclosure: `${wifiCsmaEngineeringDisclosure} The exact clean complex-I/Q lane is a content-addressed complete long-preamble 11 Mb/s HR-DSSS ACK PPDU at the 11 Mchip/s ideal complex-chip interface. A separately structured exhaustive decoder recovers every Barker/CCK chip, PLCP field, PSDU octet, and CRC. It does not include transmit pulse shaping and makes no RF, channel-access, interoperability, Wi-Fi Alliance, or regulatory claim. The 22 MHz field belongs to the separate scalar support projection, not the qualified artifact.`,
    assetSha256: WIFI_HR_DSSS_CF32LE_SHA256,
  }),
  makeDigitallyQualifiedDescriptor({
    id: 'wifi-ofdm-20m', label: 'Wi-Fi ERP-OFDM 20 MHz fixed ACK PPDU', family: 'wlan',
    model: 'Fixed digital vector · 6 Mb/s ERP-OFDM ACK PPDU · 20 Msamples/s · six-microsecond signal extension; separate scalar observable projection retained', centerHz: 2_437_000_000,
    occupiedBandwidthHz: 16_600_000, recommendedSpanHz: 30_000_000,
    projection: { allocation: 'full', modulation: 'ofdm-mixed', timing: 'burst', subcarrierSpacingHz: 312_500 },
    source: WIFI_ERP_OFDM_SOURCE,
    disclosure: `${wifiCsmaEngineeringDisclosure} The exact clean complex-I/Q lane is a content-addressed complete 6 Mb/s ERP-OFDM ACK PPDU at 20 Msamples/s followed by the required six-microsecond 2.4 GHz signal extension. Direct-DFT tests recover every symbol and a pinned live gr-ieee802-11 oracle matches every SIGNAL/DATA coding and interleaving bit. It makes no RF, channel-access, interoperability, Wi-Fi Alliance, or regulatory claim. The 16.6 MHz field belongs to the separate scalar occupied-tone projection.`,
    assetSha256: WIFI_ERP_OFDM_CF32LE_SHA256,
  }),
];

const canonizedBluetoothDescriptors: WaveformDescriptor[] = [
  makeDigitallyQualifiedDescriptor({
    id: 'bluetooth-classic-connected', label: 'Bluetooth BR DH1 fixed packet vector', family: 'bluetooth',
    model: 'Fixed digital vector · Basic Rate DH1 · pinned RF channel 8 · one 190 us packet in one 625 us slot; separate scalar observable projection retained', centerHz: 2_441_000_000,
    occupiedBandwidthHz: 79_000_000, recommendedSpanHz: 84_000_000,
    projection: { allocation: 'narrowband', modulation: 'br-gfsk', timing: 'classic-slots' },
    source: BLUETOOTH_BR_DH1_FIXED_VECTOR_SOURCE,
    disclosure: bluetoothClassicEngineeringDisclosure,
    assetSha256:
      BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256['bluetooth-classic-connected'],
  }),
  makeDigitallyQualifiedDescriptor({
    id: 'bluetooth-le-advertising', label: 'Bluetooth LE 1M ADV_NONCONN_IND fixed packet vector', family: 'bluetooth',
    model: 'Fixed digital vector · LE 1M legacy ADV_NONCONN_IND · primary advertising channel 38 · one 152 us event; separate scalar observable projection retained', centerHz: 2_441_000_000,
    occupiedBandwidthHz: 80_000_000, recommendedSpanHz: 84_000_000,
    projection: { allocation: 'narrowband', modulation: 'ble-1m', timing: 'advertising-events' },
    source: BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR_SOURCE,
    disclosure: bleEngineeringDisclosure,
    assetSha256:
      BLUETOOTH_FIXED_CATALOG_CF32LE_SHA256['bluetooth-le-advertising'],
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

const gsmDescriptors = gsmDefinitions.map(([id, label, model, modulation, occupiedBandwidthHz, modulationClause, burstClause]) => makeDigitallyQualifiedDescriptor({
  id, label, family: 'geran', model, centerHz: 947_400_000, occupiedBandwidthHz, recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation, timing: 'burst' },
  source: sourceBasis('3GPP', [
    { specification: 'TS 45.004', clause: modulationClause, revision: '19.0.0', url: GSM_MODULATION_URL },
    { specification: 'TS 45.002', clause: burstClause, revision: '19.0.0', url: GSM_MULTIPLEXING_URL },
    ...(modulation === 'gmsk'
      ? [{ specification: 'TS 45.003', clause: 'Clauses 4.1.1 through 4.1.5: fixed xCCH channel coding, interleaving, and burst mapping', revision: '19.0.0', url: GSM_CHANNEL_CODING_URL }]
      : []),
  ]),
  disclosure: modulation === 'gmsk'
    ? `Seed-invariant, content-addressed fixed ${model}: exact TS 45.002 Release 19 field geometry and TSC0 with one four-burst xCCH block independently encode/decode matched to pinned libosmocore. Every TS 45.004 GMSK sample is independently rederived. Qualification is confined to the fixed digital artifact; this is not calibrated RF, TS 45.005 conformance evidence, product qualification, or a universal schedule.`
    : `Seed-invariant, content-addressed fixed ${model}: exact TS 45.002 Release 19 field geometry, tail bits, TSC0 and frozen all-zero encrypted modulator-input fields, with every TS 45.004 mapping, rotation and c0 sample independently rederived. This is a digitally qualified component fixture only: no TS 45.003 channel-coding, calibrated-RF, TS 45.005 conformance, product, or universal-schedule claim is made.`,
  assetSha256: GERAN_FIXED_CATALOG_CF32LE_SHA256[id],
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

const independentlyVerifiedLteEtmArtifacts = {
  'lte-etm1.1': LTE_ETM1_1_CATALOG_CF32LE_SHA256,
  'lte-etm3.1': LTE_ETM3_CATALOG_CF32LE_SHA256['lte-etm3.1'],
  'lte-etm3.1a': LTE_ETM3_CATALOG_CF32LE_SHA256['lte-etm3.1a'],
  'lte-etm3.1b': LTE_ETM3_CATALOG_CF32LE_SHA256['lte-etm3.1b'],
  'lte-ntm': LTE_NTM_CATALOG_CF32LE_SHA256['lte-ntm'],
} as const;

const exactLteEtmArtifacts = independentlyVerifiedLteEtmArtifacts;

const lteDescriptors = lteDefinitions.map((definition) => {
  const exactArtifactSha256 = definition.id in exactLteEtmArtifacts
    ? exactLteEtmArtifacts[definition.id as keyof typeof exactLteEtmArtifacts]
    : undefined;
  const independentlyVerifiedArtifactSha256 = definition.id in independentlyVerifiedLteEtmArtifacts
    ? independentlyVerifiedLteEtmArtifacts[
      definition.id as keyof typeof independentlyVerifiedLteEtmArtifacts
    ]
    : undefined;
  const isExactEtm = exactArtifactSha256 !== undefined;
  const descriptor = {
    id: definition.id,
    label: `LTE ${definition.model}`,
    family: 'e-utra' as const,
    model: definition.allocation === 'narrowband'
      ? `${definition.model} · ${modulationLabel(definition.modulation)} · exact 180 kHz fixed N-TM frame`
      : `${definition.model} · ${modulationLabel(definition.modulation)} · exact 10 MHz FDD frame · PCI 1`,
    centerHz: 1_840_000_000,
    occupiedBandwidthHz: definition.allocation === 'narrowband' ? 180_000 : 9_000_000,
    recommendedSpanHz: definition.allocation === 'narrowband' ? 2_000_000 : 20_000_000,
    projection: {
      allocation: definition.allocation,
      modulation: definition.modulation,
      timing: definition.timing,
      ...(definition.allocation === 'narrowband' ? {} : { duplex: 'fdd' as const }),
      subcarrierSpacingHz: 15_000,
      nominalResourceBlocks: definition.allocation === 'narrowband' ? 1 : 50,
    },
    source: definition.allocation === 'narrowband'
      ? sourceBasis('3GPP', [
        {
          specification: 'TS 36.141',
          clause: 'Clauses 6.1.3 and 6.1.4.1 through 6.1.4.5: N-TM setup plus NRS, synchronization, NPBCH, NPDCCH, and NPDSCH allocations',
          revision: '19.1.0',
          url: LTE_URL,
        },
        {
          specification: 'TS 36.211',
          clause: 'Clauses 6.2.3 and 10.2.3 through 10.2.8: one downlink resource block, 12 subcarriers, 15 kHz SCS, NRS, synchronization, NPBCH, NPDCCH, and NPDSCH mapping',
          revision: '19.3.0',
          url: LTE_PHY_URL,
        },
      ])
      : sourceBasis('3GPP', [
        { specification: 'TS 36.141', clause: `Clause ${definition.clause} · ${definition.model}`, revision: '19.1.0', url: LTE_URL },
        { specification: 'TS 36.104', clause: 'Clauses 5.5 and 5.6: Band 3 FDD base-station operating band and 10 MHz transmission-bandwidth configuration', revision: '19.2.0', url: LTE_RF_URL },
        { specification: 'TS 36.211', clause: 'Clauses 4.1, 6.2.1 through 6.2.4, 6.3 through 6.12, 7.2, and the profile modulation clause: FDD frame, 50-RB grid, physical channels, OFDM generation, and modulation mapping', revision: '19.3.0', url: LTE_PHY_URL },
        { specification: 'TS 36.212', clause: 'Clauses 5.3.4 through 5.3.5: BCH and DL-SCH transport-channel coding used by the fixed frame', revision: '19.3.0', url: LTE_CODING_URL },
      ]),
    disclosure: definition.allocation === 'narrowband'
      ? 'Content-addressed, independently verified fixed N-TM digital-baseband frame. The 180 kHz field is its 1 × 12 × 15 kHz nominal RB-grid span, not measured or regulatory occupied bandwidth. Its 1.840 GHz center is an engineering display binding, not a claim of a standardized deployment placement. Qualification is limited to the exact cf32le clean cyclic replay; guard-band/in-band composite placement, RF conformance, and product certification are excluded.'
      : independentlyVerifiedArtifactSha256 === undefined
        ? `Content-addressed exact ${definition.model} 10 MHz FDD, normal-CP, PCI-1 digital reference frame without independent digital evidence. The 9 MHz field is the 50 × 12 × 15 kHz RB-grid span; no RF or product claim is made.`
        : `Content-addressed, independently verified ${definition.model} 10 MHz FDD, normal-CP, PCI-1 digital-baseband frame. Qualification is limited to the exact cf32le artifact and clean cyclic replay; resampling, filtering, scaling, receiver impairment, RF conformance, and product certification are excluded. The 9 MHz field is the 50 × 12 × 15 kHz RB-grid span.`,
    ...(exactArtifactSha256 === undefined ? {} : { assetSha256: exactArtifactSha256 }),
  };
  return independentlyVerifiedArtifactSha256 === undefined
    ? makeDescriptor(descriptor)
    : makeDigitallyQualifiedDescriptor({
      ...descriptor,
      assetSha256: independentlyVerifiedArtifactSha256,
    });
});

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

const lteNarrowbandCompositeComponentDescriptors = lteNarrowbandCompositeComponentDefinitions.map((definition) => makeDigitallyQualifiedDescriptor({
  id: definition.id,
  label: definition.label,
  family: 'e-utra',
  model: `${definition.model} · QPSK · exact 180 kHz digital component fixture`,
  centerHz: 1_840_000_000,
  occupiedBandwidthHz: 180_000,
  recommendedSpanHz: 2_000_000,
  projection: { allocation: 'narrowband', modulation: 'qpsk', timing: 'frame', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 1 },
  source: sourceBasis('3GPP', [
    {
      specification: 'TS 36.141',
      clause: `Clauses 6.1.3, 6.1.4.1 through 6.1.4.5, and ${definition.clause}: complete N-TM component plus the composite E-TM1.1 carrier, ${definition.placement} placement, and host/component power allocation`,
      revision: '19.1.0',
      url: LTE_URL,
    },
    {
      specification: 'TS 36.211',
      clause: 'Clauses 6.2.3 and 10.2.3 through 10.2.8: one downlink resource block, 12 subcarriers, 15 kHz SCS, NRS, synchronization, NPBCH, NPDCCH, and NPDSCH mapping',
      revision: '19.3.0',
      url: LTE_PHY_URL,
    },
  ]),
  disclosure: definition.placement === 'guard-band'
    ? 'Content-addressed, independently verified isolated N-TM digital component. The 180 kHz field is its nominal RB-grid span, not measured or regulatory occupied bandwidth. Its 1.840 GHz center is an engineering display binding, not the required host-relative placement. The E-TM1.1 host, closest guard placement, and host/component power allocation are absent, so the complete TS 36.141 clause 6.1.5 guard-band test model is not claimed.'
    : 'Content-addressed, independently verified isolated N-TM digital component. The 180 kHz field is its nominal RB-grid span, not measured or regulatory occupied bandwidth. Its 1.840 GHz center is an engineering display binding, not the required host-relative placement. The E-TM1.1 host, punctured-RB placement, retained host resource elements, and host/component power allocation are absent, so the complete TS 36.141 clause 6.1.6 in-band test model is not claimed.',
  assetSha256: LTE_NTM_CATALOG_CF32LE_SHA256[definition.id],
}));

const nrBaseDefinitions: readonly ModelDefinition[] = [
  { id: 'nr-fr1-tm1.1', model: 'NR-FR1-TM1.1', clause: '4.9.2.2.1', allocation: 'full', modulation: 'qpsk', timing: 'frame' },
  { id: 'nr-fr1-tm3.1', model: 'NR-FR1-TM3.1', clause: '4.9.2.2.5', allocation: 'full', modulation: '64qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.1a', model: 'NR-FR1-TM3.1a', clause: '4.9.2.2.6', allocation: 'full', modulation: '256qam', timing: 'frame' },
  { id: 'nr-fr1-tm3.1b', model: 'NR-FR1-TM3.1b', clause: '4.9.2.2.6A', allocation: 'full', modulation: '1024qam', timing: 'frame' },
];

const nrBaseDescriptors = nrBaseDefinitions.map((definition) => makeNrDescriptor(definition));
const nrNarrowbandComponentDescriptor = makeDigitallyQualifiedDescriptor({
  id: 'nr-nbiot-inband-isolated-component',
  label: 'NB-IoT N-TM component isolated from NR-N-TM composite',
  family: 'e-utra',
  model: 'Exact isolated N-TM NB-IoT digital component · QPSK · 180 kHz · 15 kHz SCS',
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
      clause: 'Clauses 6.1.3 and 6.1.4.1 through 6.1.4.5: imported complete N-TM component including NRS, synchronization, NPBCH, NPDCCH, and NPDSCH allocations',
      revision: '19.1.0',
      url: LTE_URL,
    },
    {
      specification: 'TS 36.211',
      clause: 'Clauses 6.2.3 and 10.2.3 through 10.2.8: one downlink resource block, 12 subcarriers, 15 kHz SCS, NRS, synchronization, NPBCH, NPDCCH, and NPDSCH mapping',
      revision: '19.3.0',
      url: LTE_PHY_URL,
    },
  ]),
  disclosure: `Content-addressed, independently verified E-UTRA/NB-IoT N-TM digital component imported by the NR-N-TM parent test model. The 180 kHz field is its nominal RB-grid span, not measured or regulatory occupied bandwidth. Its ${NR_N78_30_KHZ_RASTER_CENTER_HZ} Hz center is an engineering parent-carrier display binding, not an eligible punctured-RB placement. The NR-FR1-TM1.1 host, eligible punctured-RB placement, and host/component power allocation are absent, so the complete TS 38.141-1 clause 4.9.2.2.9 NR-N-TM composite is not claimed. Its family describes the isolated component air interface, not its NR parent context.`,
  assetSha256:
    NR_REMAINING_FIXED_CF32LE_SHA256['nr-nbiot-inband-isolated-component'],
});

const wifiDefinitions = [
  ['wifi6-he-su', 'Wi-Fi 6 HE SU fixed PPDU', 'Fixed HE SU PPDU · 20 MHz · one 242-tone RU · MCS 0 · 3.2 us GI', 'full', 242, 'Clause 27: HE SU PPDU, HE PHY resource-unit, and OFDM tone-plan definitions'],
  ['wifi6-he-er-su', 'Wi-Fi 6 HE ER SU fixed PPDU', 'Fixed HE ER SU PPDU · 20 MHz · right 106-tone RU · MCS 0 · 3.2 us GI', 'resource-unit', 106, 'Clause 27: HE ER SU PPDU, HE PHY resource-unit, and OFDM tone-plan definitions'],
  ['wifi6-he-mu', 'Wi-Fi 6 HE MU fixed PPDU', 'Fixed two-user HE MU PPDU · 20 MHz · left/right 106-tone RUs · MCS 0 · 3.2 us GI', 'multi-ru', 242, 'Clause 27: HE MU PPDU, HE PHY resource-unit, and OFDM tone-plan definitions'],
  ['wifi6-he-tb', 'Wi-Fi 6 HE TB fixed Trigger/PPDU pair', 'Fixed one-STA HE TB PPDU · 20 MHz · right 106-tone RU · MCS 0 · 3.2 us GI · bound Basic Trigger', 'resource-unit', 106, 'Clauses 26 and 27: Basic Trigger and HE-TB PPDU/resource-unit definitions'],
] as const;

const wifiArtifactSha256 = {
  'wifi6-he-su': WIFI_HE_SU_CF32LE_SHA256,
  'wifi6-he-er-su': WIFI_HE_ER_SU_CF32LE_SHA256,
  'wifi6-he-mu': WIFI_HE_MU_CF32LE_SHA256,
  'wifi6-he-tb': WIFI_HE_TB_CF32LE_SHA256,
} as const;

const wifiDescriptors = wifiDefinitions.map(([id, label, model, allocation, toneCount, sourceClause]) => makeDigitallyQualifiedDescriptor({
  id, label, family: 'wlan', model, centerHz: 5_180_000_000, occupiedBandwidthHz: toneCount * 78_125, recommendedSpanHz: 30_000_000,
  projection: { allocation, modulation: 'he-ofdm', timing: 'burst', subcarrierSpacingHz: 78_125 },
  source: sourceBasis('IEEE', [{ specification: 'IEEE 802.11-2024', clause: sourceClause, revision: '2024', url: WIFI_URL }]),
  disclosure: `Content-addressed complete fixed ${model} ideal digital-baseband artifact at 20 Msamples/s. Separately structured sample-domain tests DFT-recover the transmitted tones and independently decode every applicable L-SIG, RL-SIG, HE-SIG-A, HE-SIG-B, HE data, CRC/FCS, A-MPDU, RU-grid, and Trigger field. Qualification is limited to those exact bytes; RF, MAC channel access or scheduling beyond the fixed vector, interoperability, Wi-Fi Alliance certification, and regulatory approval are excluded. The ${toneCount} × 78.125 kHz = ${toneCount * 78_125} Hz field is an occupied-tone support description, not measured or regulatory occupied bandwidth.`,
  assetSha256: wifiArtifactSha256[id],
}));

const referenceDisclosure = 'Deterministic analytic laboratory stimulus for constellation recovery. It uses SignalLab-defined direct symbol-state indexing (with natural, non-Gray level indexing on each square-QAM axis), a fixed 7 Msym/s symbol rate, root-raised-cosine pulse shaping with beta 0.35 truncated to ±8 symbols, and intrinsic seeded complex AWGN at 40 dB SNR. The 9.45 MHz field is the 7 Msym/s × (1 + 0.35) nominal raised-cosine support before finite-span truncation, injected broadband noise, and downstream receiver filtering; it is not measured, 99%-power, necessary, or regulatory occupied bandwidth. It is not a captured emission, protocol waveform, RF calibration, or standards-conformance vector; standards-conformance status is N/A.';

const referenceDefinitions = [
  ['ref-qpsk', 'RRC QPSK (4-QAM) analytic lab reference', 'qpsk', 'QPSK'],
  ['ref-8psk', 'RRC 8-PSK analytic lab reference', '8psk', '8PSK'],
  ['ref-16qam', 'RRC 16-QAM analytic lab reference', '16qam', '16-QAM'],
  ['ref-64qam', 'RRC 64-QAM analytic lab reference', '64qam', '64-QAM'],
  ['ref-256qam', 'RRC 256-QAM analytic lab reference', '256qam', '256-QAM'],
] as const;

const referenceDescriptors: WaveformDescriptor[] = referenceDefinitions.map(([id, label, modulation, modulationLabelText]) => makeDescriptor({
  id, label, family: 'reference',
  model: `Analytic laboratory reference · ${modulationLabelText} · 7 Msym/s · RRC 0.35 · intrinsic seeded AWGN 40 dB`,
  centerHz: 100_000_000,
  occupiedBandwidthHz: 9_450_000,
  recommendedSpanHz: 14_000_000,
  projection: { allocation: 'full', modulation, timing: 'continuous' },
  source: REFERENCE_WAVEFORM_SOURCE,
  disclosure: referenceDisclosure,
}));

const unorderedCatalog = [
  ...visualDescriptors,
  ...referenceDescriptors,
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
  // Custom wideband builders: the catalog entry is the all-auto default; the
  // LIVE descriptor (waveformDescriptor below) reflects the operator's current
  // spec-validated selections. See custom-waveform.ts for the constraint model.
  ...CUSTOM_WAVEFORM_PROFILES.map((profile) => customWaveformDescriptor(profile)),
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
  // Custom builders resolve live so operator selections take effect immediately.
  if (isCustomWaveformProfile(id)) return customWaveformDescriptor(id);
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

export function requireDigitallyQualified(profile: SynthesizedSignalProfile): WaveformDescriptor {
  const descriptor = waveformDescriptor(profile);
  if (descriptor.qualification !== 'independently-verified-digital-baseband'
    || descriptor.governance.claims.digitalQualification !== 'qualified'
    || !descriptor.assetSha256) {
    throw new Error(`${descriptor.label} is ${descriptor.qualification}; an independently verified digital-baseband artifact is not installed`);
  }
  return descriptor;
}

function makeNrDescriptor(definition: ModelDefinition): WaveformDescriptor {
  const descriptor = {
    id: definition.id,
    label: `5G ${definition.model}`,
    family: 'nr',
    model: `${definition.model} · ${modulationLabel(definition.modulation)} · exact n3 FDD 20 MHz frame · PCI 1`,
    centerHz: 1_842_500_000,
    occupiedBandwidthHz: 19_080_000,
    recommendedSpanHz: 30_000_000,
    projection: { allocation: definition.allocation, modulation: definition.modulation, timing: definition.timing, duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 106 },
    source: sourceBasis('3GPP', [
      { specification: 'TS 38.141-1', clause: `Clause ${definition.clause} · ${definition.model}`, revision: '19.4.0', url: NR_URL },
      { specification: 'TS 38.104', clause: 'Tables 5.2-1, 5.3.2-1, 5.3.5-1, and 5.4.2.3-1: n3 FDD, 20 MHz at 15 kHz SCS with 106 RB, band/channel-bandwidth support, and the 100 kHz channel raster', revision: '19.4.0', url: NR_RF_URL },
      { specification: 'TS 38.211', clause: 'Clauses 4.2 through 4.4, 5.2.1, 5.3, the profile modulation clause, 7.3.1, 7.3.2, 7.4.1.1, and 7.4.1.3: frame/grid, scrambling, mapping, PDSCH/PDCCH, and DM-RS construction', revision: '19.4.0', url: NR_PHY_URL },
      { specification: 'TS 38.214', clause: 'Clause 5.1.2.2.2: type-1 PDSCH resource allocation used by the fixed test model', revision: '19.4.0', url: NR_SCHEDULING_URL },
    ]),
    disclosure: `Content-addressed, independently verified ${definition.model} digital-baseband frame in a fixed n3 FDD 20 MHz, 15 kHz-SCS, 106-RB, PCI-1 instantiation. Qualification is limited to the exact cf32le clean cyclic replay; alternate geometry, rank, resampling, filtering, impairments, RF conformance, and product certification are excluded. The 19.08 MHz field is the nominal RB-grid span, not the 20 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
    assetSha256: NR_FR1_TM_CATALOG_CF32LE_SHA256[
      definition.id as keyof typeof NR_FR1_TM_CATALOG_CF32LE_SHA256
    ],
  } as const;
  return makeDigitallyQualifiedDescriptor(descriptor);
}

function makeDescriptor(input: Omit<WaveformDescriptor, 'qualification' | 'governance'>): WaveformDescriptor {
  return waveformDescriptorSchema.parse({
    ...input,
    qualification: input.source.organization === 'TinySA SignalLab' ? 'visual' : 'standards-derived',
    governance: profileGovernanceFor(input.id),
  });
}

function makeDigitallyQualifiedDescriptor(
  input: Omit<WaveformDescriptor, 'qualification' | 'governance'> & { readonly assetSha256: string },
): WaveformDescriptor {
  return waveformDescriptorSchema.parse({
    ...input,
    qualification: 'independently-verified-digital-baseband',
    governance: profileGovernanceFor(input.id),
  });
}

function modulationLabel(modulation: WaveformProjection['modulation']): string {
  return ({
    unmodulated: 'unmodulated', am: 'AM', fm: 'FM', gmsk: 'GMSK', qpsk: 'QPSK', aqpsk: 'AQPSK', '8psk': '8-PSK',
    '16qam': '16-QAM', '32qam': '32-QAM', '64qam': '64-QAM', '256qam': '256-QAM', '1024qam': '1024-QAM', 'ofdm-mixed': 'mixed OFDM', 'he-ofdm': 'HE OFDM',
    'hr-dsss': 'HR-DSSS', 'br-gfsk': 'BR GFSK', 'br-edr': 'BR/EDR', 'ble-1m': 'LE 1M',
  })[modulation];
}
