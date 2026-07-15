/**
 * Deterministic scalar-observation corpus for Atomizer classifier development.
 *
 * These scenarios are physics/standards-derived instrument projections, not
 * conformance I/Q waveforms. I/Q truth is deliberately not exposed: consumers
 * receive only the swept power and detected-power envelope available from a
 * tinySA-class instrument.
 */

import {
  CANONIZED_KNOWN_SCENARIOS,
  CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
  synthesizeCanonizedKnownEnvelope,
  synthesizeCanonizedKnownSpectrum,
  type CanonizedKnownScenarioId,
} from './waveforms.js';
import {
  BLE_PRIMARY_ADVERTISING_ENGINEERING_V1,
  LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1,
  LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
  NR_N78_30_KHZ_RASTER_CENTER_HZ,
  NR_N78_30_KHZ_RASTER_NREF,
  NR_N78_CHANNEL_RASTER_HZ,
  NR_TDD_7DL_3UL_ENGINEERING_V1,
  lteTddConfig0Ssp7NormalCpDownlinkActive,
  nrTdd7Dl3UlEngineeringDownlinkActive,
} from './canonical-timing.js';
import {
  ANALYTIC_SCALAR_SOURCE,
  BLUETOOTH_OBSERVABLE_SOURCE,
  GSM_OBSERVABLE_SOURCE,
  IEEE_802154_SOURCE,
  LTE_OBSERVABLE_SOURCE,
  LTE_TDD_OBSERVABLE_SOURCE,
  NR_OBSERVABLE_SOURCE,
  NR_TDD_OBSERVABLE_SOURCE,
  WIFI_OBSERVABLE_SOURCE,
  sourceBasis,
  type SourceBasis,
} from './source-provenance.js';

export const CLASSIFICATION_CORPUS_VERSION = 'observable-scalar-corpus-v13' as const;

export const OBSERVABLE_SIGNAL_CLASSES = [
  'cw-like',
  'am-dsb-full-carrier-like',
  'fm-angle-modulated-like',
  'gsm-like',
  'lte-fdd-like',
  'lte-tdd-like',
  'nr-fdd-like',
  'nr-tdd-like',
  'wifi-hr-dsss-like',
  'wifi-ofdm-like',
  'bluetooth-classic-like',
  'bluetooth-le-like',
  'unknown-signal',
] as const;

export type ObservableSignalClass = typeof OBSERVABLE_SIGNAL_CLASSES[number];

type SpectrumModel =
  | 'rbw-line'
  | 'am-dsb-full-carrier'
  | 'fm-bessel'
  | 'gaussian-channel'
  | 'ofdm-channel'
  | 'dsss-channel'
  | 'classic-hop'
  | 'ble-advertising'
  | 'stationary-burst'
  | 'simultaneous-raster'
  | 'interleaved-channels'
  | 'proprietary-fhss'
  | 'fsk-pair'
  | 'chirp'
  | 'multitone-lines'
  | 'impulsive-noise';

type EnvelopeModel =
  | 'steady'
  | 'sinusoidal-am'
  | 'receiver-filtered-fm'
  | 'one-of-eight-tdma'
  | 'continuous-gsm-loaded'
  | 'continuous-ofdm'
  | typeof LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1
  | typeof NR_TDD_7DL_3UL_ENGINEERING_V1
  | 'csma-bursts'
  | 'classic-slots'
  | typeof BLE_PRIMARY_ADVERTISING_ENGINEERING_V1
  | 'stationary-bursts'
  | 'simultaneous-raster-fixed-tune'
  | 'interleaved-fixed-tune'
  | 'proprietary-fhss-fixed-tune'
  | 'fsk-steady'
  | 'chirp-sweep'
  | 'multitone-fixed-tune'
  | 'impulsive';

export type CanonicalSource = SourceBasis;

export interface CanonicalClassificationScenario {
  id: string;
  truthClass: ObservableSignalClass;
  /** Leaf observations that this scalar projection cannot disambiguate. */
  allowedObservableClasses: readonly ObservableSignalClass[];
  family: 'analog' | 'geran' | 'e-utra' | 'nr' | 'wlan' | 'bluetooth' | 'unknown';
  label: string;
  centerHz: number;
  occupiedBandwidthHz: number;
  recommendedSpanHz: number;
  spectrumModel: SpectrumModel;
  envelopeModel: EnvelopeModel;
  /** Ordinary band-specific RF channel raster, not a global ARFCN step or enhanced raster. */
  carrierRasterHz?: number;
  duplex?: 'fdd' | 'tdd';
  parameters: Readonly<Record<string, number>>;
  source: CanonicalSource;
  disclosure: string;
}

export interface CanonicalInstrumentConfiguration {
  points: number;
  /** Swept-spectrum bin-equivalent RBW. */
  actualRbwHz: number;
  sweepTimeSeconds: number;
  zeroSpanPoints: number;
  zeroSpanSamplePeriodSeconds: number;
  /** Fixed analyzer tune for the detected-power capture. Defaults to the scenario center. */
  zeroSpanFrequencyHz?: number;
  /**
   * Generator-internal receiver-filter width for detected-power synthesis.
   * It is recorded for reproducibility but is not observed measurement metadata.
   */
  detectedPowerSynthesisFilterWidthHz: number;
  noiseFloorDbm: number;
  snrDb: number;
  seed: number;
  lookIndex: number;
}

export interface CanonicalScalarObservation {
  corpusVersion: typeof CLASSIFICATION_CORPUS_VERSION;
  scenarioId: string;
  truthClass: ObservableSignalClass;
  qualification: 'physics-derived-scalar-projection' | 'standards-parameterized-heuristic-scalar-projection';
  seed: number;
  lookIndex: number;
  frequencyHz: readonly number[];
  powerDbm: readonly number[];
  sweepTimeSeconds: number;
  /** Swept-spectrum bin-equivalent RBW; detected-power actual RBW is unavailable. */
  actualRbwHz: number;
  zeroSpanFrequencyHz: number;
  /** SignalLab does not claim an observed or calibrated detected-power RBW. */
  detectedPowerActualRbwHz: null;
  /** Generator-internal provenance; never an observed or calibrated instrument RBW. */
  detectedPowerSynthesisFilterWidthHz: number;
  zeroSpanPowerDbm: readonly number[];
  zeroSpanSamplePeriodSeconds: number;
  source: CanonicalSource;
  disclosure: string;
}

const TINYSA_SOURCE = ANALYTIC_SCALAR_SOURCE;
const GSM_SOURCE = GSM_OBSERVABLE_SOURCE;
const LTE_SOURCE = LTE_OBSERVABLE_SOURCE;
const LTE_TDD_SOURCE = LTE_TDD_OBSERVABLE_SOURCE;
const NR_SOURCE = NR_OBSERVABLE_SOURCE;
const NR_TDD_SOURCE = NR_TDD_OBSERVABLE_SOURCE;
const WIFI_SOURCE = WIFI_OBSERVABLE_SOURCE;
const BLUETOOTH_SOURCE = BLUETOOTH_OBSERVABLE_SOURCE;

const nonConformance = 'Deterministic scalar instrument projection for inference testing; it is not a bit-exact, protocol-decodable, or conformance I/Q waveform.';
const multitoneDisclosure = `${nonConformance} Simultaneous regular lines are association-compatible, but scalar power cannot prove a shared emitter, oscillator, modulation process, or message identity.`;
const agileEquivalenceDisclosure = `${nonConformance} The observed frequency-agile scalar activity is also compatible with Bluetooth, proprietary FHSS, a scanning interferer, or time-interleaved independent sources; it cannot prove protocol or emitter identity.`;
const stationaryDisclosure = `${nonConformance} Intermittence at one fixed center is negative evidence for frequency agility, but its scalar line may remain CW-like.`;
const exactScalarEquivalenceDisclosure = `${nonConformance} This deliberately independent source hypothesis is rendered through the same declared scalar observation operator as a fitted known scenario, so every admitted scalar observable is exactly equal and the measurement cannot establish waveform or protocol identity.`;
const chirpFragmentDisclosure = `${nonConformance} The swept source can be fragmented by local detection and tracking into observations that are CW-like or FM-like over the admitted finite window; those observable labels do not establish the source modulation or emitter identity.`;
const cwWidthDisclosure = `${nonConformance} The source is a mathematical line passed through the per-observation receiver RBW. The 2 kHz occupiedBandwidthHz field is a nominal display-support floor, not the receiver RBW or source-emission measured/regulatory occupied bandwidth; rendered spectral width varies with the admitted observation RBW.`;
const amWidthDisclosure = `${nonConformance} The 52 kHz occupiedBandwidthHz field is the 50 kHz separation between the two outer sideband lines plus the same nominal 2 kHz display-support floor used for a mathematical line. It is not the per-observation receiver RBW or measured/regulatory occupied bandwidth; rendered line widths vary with the admitted observation RBW and can extend beyond that nominal field.`;
const fmWidthDisclosure = `${nonConformance} The 200 kHz occupiedBandwidthHz field is Carson's engineering estimate 2 × (75 kHz + 25 kHz), not exact containment or measured/regulatory occupied bandwidth. The physical Bessel series has nonzero higher-order energy beyond it; the renderer truncates only numerically at n = ±10 and its amplitude threshold. Each retained line is passed through the per-observation receiver RBW, so rendered spectral support is not bounded by that metadata field.`;
const gsmTdmaEngineeringDisclosure = `${nonConformance} The fixed schedule activates slot 0 once per eight-slot TDMA frame. It is a deterministic SignalLab scalar acquisition schedule, not universal GSM traffic, channel assignment, or protocol likelihood.`;
const gsmLoadedBcchEngineeringDisclosure = `${nonConformance} This is an engineering scalar loaded-downlink replay using continuous slot occupancy and synthetic texture representing traffic, control, or dummy bursts. TS 45.008 supports the continuous BCCH premise, but the texture is not a decoded GMSK burst sequence; this does not imply every GSM carrier is continuous or provide protocol likelihood.`;
const lteTddDisclosure = `${nonConformance} This downlink-only scenario explicitly selects UL/DL configuration 0 and normal-CP special-subframe configuration 7 with srs-UpPtsAdd absent; only DwPTS is downlink-active in each special subframe. The special-subframe selection is not implied by Band 38 or UL/DL configuration 0. The 9 MHz field is the 50 × 12 × 15 kHz nominal RB-grid span, not the 10 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`;
const nrTddEngineeringDisclosure = `${nonConformance} The ${NR_N78_30_KHZ_RASTER_CENTER_HZ} Hz carrier center is n78 30 kHz-raster NREF ${NR_N78_30_KHZ_RASTER_NREF}. Engineering schedule nr-tdd-7dl-3ul-engineering-v1 selects one valid 5 ms TDD-UL-DL-Pattern at 30 kHz SCS with seven complete downlink slots followed by three complete uplink slots. It is a downlink-only SignalLab scenario, not a pattern prescribed for n78 or universal across NR deployments.`;
const wifiCsmaEngineeringDisclosure = `${nonConformance} Its seeded CSMA-like on/off envelope is a deterministic SignalLab acquisition schedule, not IEEE 802.11 MAC behavior or protocol likelihood.`;
const bluetoothClassicEngineeringDisclosure = `${agileEquivalenceDisclosure} The classic-connected engineering schedule selects each hop independently from a uniform seeded pseudorandom sequence over 79 channel centers and uses a fixed two-active-slot/one-idle-slot pattern. It is not the Bluetooth hop-selection kernel, connection state, or universal BR/EDR traffic. The 79 MHz field is the aggregate edge-to-edge support across the 79 modeled 1 MHz channels (78 MHz first-to-last center spacing plus one channel width), not instantaneous occupied bandwidth.`;
const bleEngineeringDisclosure = `${nonConformance} Engineering schedule ble-primary-advertising-engineering-v1 sends one fixed-duration packet on all three primary advertising centers in sequential 37, 38, 39 order with 1.5 ms packet-start spacing, a 20 ms advertising interval, and a seeded per-event pseudorandom advDelay in [0, 10 ms). That sequence is standards-consistent for the modeled legacy all-three-channel event, but configured subsets, early event closure after a response, and extended advertising differ. The all-three use, spacing, duration, interval, and deterministic delay generator are engineering choices, not universal Bluetooth traffic or PDU behavior. The 80 MHz field is the aggregate primary-advertising-channel support span, not instantaneous occupied bandwidth.`;
const lteTddExactEquivalenceDisclosure = `${exactScalarEquivalenceDisclosure} Equality is only to the fitted downlink-only UL/DL-configuration-0, normal-CP special-subframe-configuration-7 SignalLab projection, not to every LTE configuration-0 carrier.`;

export const canonicalClassificationScenarios: readonly CanonicalClassificationScenario[] = Object.freeze([
  canonizedKnownScenario('cw-rbw-line', 'cw-like', 'analog', 'CW through an RBW filter', TINYSA_SOURCE, {
    disclosure: cwWidthDisclosure,
  }),
  canonizedKnownScenario('am-dsb-25k', 'am-dsb-full-carrier-like', 'analog', 'DSB full-carrier AM, 25 kHz tone', TINYSA_SOURCE, {
    allowedObservableClasses: ['am-dsb-full-carrier-like', 'cw-like'],
    disclosure: amWidthDisclosure,
  }),
  canonizedKnownScenario('fm-beta-3', 'fm-angle-modulated-like', 'analog', 'Sinusoidal FM, beta 3', TINYSA_SOURCE, {
    allowedObservableClasses: ['fm-angle-modulated-like', 'cw-like'],
    disclosure: fmWidthDisclosure,
  }),

  canonizedKnownScenario('gsm-900-tdma', 'gsm-like', 'geran', 'GSM 900 fixed slot-0 engineering schedule', GSM_SOURCE, {
    carrierRasterHz: 200_000,
    duplex: 'fdd',
    disclosure: gsmTdmaEngineeringDisclosure,
  }),
  canonizedKnownScenario('gsm-900-loaded-bcch', 'gsm-like', 'geran', 'GSM 900 loaded BCCH/dummy-burst carrier', GSM_SOURCE, {
    carrierRasterHz: 200_000,
    duplex: 'fdd',
    disclosure: gsmLoadedBcchEngineeringDisclosure,
  }),

  canonizedKnownScenario('lte-band3-fdd-5m', 'lte-fdd-like', 'e-utra', 'LTE Band 3 FDD, 5 MHz', LTE_SOURCE, {
    carrierRasterHz: 100_000,
    duplex: 'fdd',
    disclosure: `${nonConformance} The 4.5 MHz field is the 25 × 12 × 15 kHz nominal RB-grid span, not the 5 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
  canonizedKnownScenario('lte-band3-fdd-20m', 'lte-fdd-like', 'e-utra', 'LTE Band 3 FDD, 20 MHz', LTE_SOURCE, {
    carrierRasterHz: 100_000,
    duplex: 'fdd',
    disclosure: `${nonConformance} The 18 MHz field is the 100 × 12 × 15 kHz nominal RB-grid span, not the 20 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
  canonizedKnownScenario('lte-band38-tdd-10m', 'lte-tdd-like', 'e-utra', 'LTE Band 38 TDD downlink, 10 MHz · UL/DL config 0 · normal-CP special-subframe config 7', LTE_TDD_SOURCE, {
    carrierRasterHz: 100_000,
    duplex: 'tdd',
    disclosure: lteTddDisclosure,
  }),

  canonizedKnownScenario('nr-n3-fdd-20m', 'nr-fdd-like', 'nr', 'NR n3 FDD, 20 MHz', NR_SOURCE, {
    carrierRasterHz: 100_000,
    duplex: 'fdd',
    disclosure: `${nonConformance} The 19.08 MHz field is the 106 × 12 × 15 kHz nominal RB-grid span, not the 20 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
  canonizedKnownScenario('nr-n78-tdd-40m', 'nr-tdd-like', 'nr', 'NR n78 TDD downlink, 40 MHz · engineering 7DL/3UL schedule v1', NR_TDD_SOURCE, {
    carrierRasterHz: NR_N78_CHANNEL_RASTER_HZ,
    duplex: 'tdd',
    disclosure: `${nrTddEngineeringDisclosure} The 38.16 MHz field is the 106 × 12 × 30 kHz nominal RB-grid span, not the 40 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),
  canonizedKnownScenario('nr-n78-tdd-100m', 'nr-tdd-like', 'nr', 'NR n78 TDD downlink, 100 MHz · engineering 7DL/3UL schedule v1', NR_TDD_SOURCE, {
    carrierRasterHz: NR_N78_CHANNEL_RASTER_HZ,
    duplex: 'tdd',
    disclosure: `${nrTddEngineeringDisclosure} The 98.28 MHz field is the 273 × 12 × 30 kHz nominal RB-grid span, not the 100 MHz channel bandwidth or measured 99%-power or regulatory occupied bandwidth.`,
  }),

  canonizedKnownScenario('wifi-hr-dsss-11m', 'wifi-hr-dsss-like', 'wlan', '2.4 GHz HR-DSSS · seeded CSMA-like engineering schedule', WIFI_SOURCE, {
    carrierRasterHz: 5_000_000,
    disclosure: `${wifiCsmaEngineeringDisclosure} The 22 MHz field is an engineering support projection, not normative measured or regulatory occupied bandwidth; the 11 Mchip/s rate is standards-derived.`,
  }),
  canonizedKnownScenario('wifi-ofdm-20m', 'wifi-ofdm-like', 'wlan', 'Wi-Fi OFDM 20 MHz · seeded CSMA-like engineering schedule', WIFI_SOURCE, {
    carrierRasterHz: 5_000_000,
    disclosure: `${wifiCsmaEngineeringDisclosure} The 16.6 MHz field is an engineering occupied-tone support projection, not normative measured or regulatory occupied bandwidth; 312.5 kHz SCS is standards-derived.`,
  }),
  canonizedKnownScenario('wifi-ofdm-40m', 'wifi-ofdm-like', 'wlan', 'Wi-Fi OFDM 40 MHz · seeded CSMA-like engineering schedule', WIFI_SOURCE, {
    carrierRasterHz: 5_000_000,
    disclosure: `${wifiCsmaEngineeringDisclosure} The 36.6 MHz field is an engineering occupied-tone support projection, not normative measured or regulatory occupied bandwidth; 312.5 kHz SCS is standards-derived.`,
  }),
  canonizedKnownScenario('wifi-ofdm-80m', 'wifi-ofdm-like', 'wlan', 'Wi-Fi OFDM 80 MHz · seeded CSMA-like engineering schedule', WIFI_SOURCE, {
    carrierRasterHz: 5_000_000,
    disclosure: `${wifiCsmaEngineeringDisclosure} The 76.6 MHz field is an engineering occupied-tone support projection, not normative measured or regulatory occupied bandwidth; 312.5 kHz SCS is standards-derived.`,
  }),

  canonizedKnownScenario('bluetooth-classic-connected', 'bluetooth-classic-like', 'bluetooth', 'Bluetooth BR/EDR connected-like engineering hop/slot schedule', BLUETOOTH_SOURCE, {
    carrierRasterHz: 1_000_000,
    disclosure: bluetoothClassicEngineeringDisclosure,
  }),
  canonizedKnownScenario('bluetooth-le-advertising', 'bluetooth-le-like', 'bluetooth', 'Bluetooth LE primary advertising · engineering schedule v1', BLUETOOTH_SOURCE, {
    carrierRasterHz: 2_000_000,
    disclosure: bleEngineeringDisclosure,
  }),

  scenario('unknown-narrow-fsk', 'unknown-signal', 'unknown', 'Proprietary narrow FSK hard negative', 433_920_000, 45_000, 500_000, 'fsk-pair', 'fsk-steady', TINYSA_SOURCE, { deviationHz: 18_000 }),
  scenario('unknown-chirp', 'unknown-signal', 'unknown', 'Swept chirp with locally line-like finite-window fragments', 915_000_000, 5_000_000, 10_000_000, 'chirp', 'chirp-sweep', TINYSA_SOURCE, { chirpPeriodSeconds: 0.004 }, {
    disclosure: chirpFragmentDisclosure,
    allowedObservableClasses: ['unknown-signal', 'cw-like', 'fm-angle-modulated-like'],
  }),
  scenario('unknown-802154', 'unknown-signal', 'unknown', 'IEEE 802.15.4-like hard negative', 2_425_000_000, 2_000_000, 10_000_000, 'gaussian-channel', 'csma-bursts', IEEE_802154_SOURCE, { symbolRateHz: 62_500 }, { carrierRasterHz: 5_000_000 }),
  scenario('unknown-impulsive', 'unknown-signal', 'unknown', 'Impulsive broadband interference hard negative', 1_000_000_000, 20_000_000, 30_000_000, 'impulsive-noise', 'impulsive', TINYSA_SOURCE, { impulseRateHz: 120 }),
  scenario('unknown-regular-cw-comb-4', 'unknown-signal', 'unknown', 'Four independent equal-power CW lines on a regular raster', 915_000_000, 900_000, 2_000_000, 'multitone-lines', 'multitone-fixed-tune', TINYSA_SOURCE, {
    lineCount: 4, lineOffset0Hz: -450_000, lineOffset1Hz: -150_000, lineOffset2Hz: 150_000, lineOffset3Hz: 450_000,
  }, { carrierRasterHz: 300_000, disclosure: multitoneDisclosure, allowedObservableClasses: ['unknown-signal', 'cw-like', 'fm-angle-modulated-like'] }),
  scenario('unknown-regular-cw-comb-5', 'unknown-signal', 'unknown', 'Five independent equal-power CW lines on a regular raster', 915_000_000, 1_200_000, 2_000_000, 'multitone-lines', 'multitone-fixed-tune', TINYSA_SOURCE, {
    lineCount: 5, lineOffset0Hz: -600_000, lineOffset1Hz: -300_000, lineOffset2Hz: 0, lineOffset3Hz: 300_000, lineOffset4Hz: 600_000,
  }, { carrierRasterHz: 300_000, disclosure: multitoneDisclosure, allowedObservableClasses: ['unknown-signal', 'cw-like', 'fm-angle-modulated-like'] }),
  scenario('unknown-irregular-cw-multitone-100-210-370k', 'unknown-signal', 'unknown', 'Three independent CW lines with irregular 110/160 kHz gaps', 915_000_000, 270_000, 500_000, 'multitone-lines', 'multitone-fixed-tune', TINYSA_SOURCE, {
    lineCount: 3, lineOffset0Hz: -150_000, lineOffset1Hz: -40_000, lineOffset2Hz: 120_000,
  }, { disclosure: multitoneDisclosure, allowedObservableClasses: ['unknown-signal', 'cw-like'] }),
  scenario('unknown-stationary-intermittent-2g4', 'unknown-signal', 'unknown', 'Stationary intermittent 2.4 GHz narrowband source', 2_441_000_000, 1_000_000, 84_000_000, 'stationary-burst', 'stationary-bursts', TINYSA_SOURCE, {
    channelWidthHz: 1_000_000, burstPeriodSeconds: 0.0073, burstDuty: 0.58,
  }, { disclosure: stationaryDisclosure, allowedObservableClasses: ['unknown-signal', 'cw-like'] }),
  // The 120 MHz acquisition span deliberately retains off-signal reference
  // cells around the 79-channel, 1 MHz-spaced raster. With an 84 MHz span, nearly every cell is
  // occupied and an unknown uniform gain is scale-confounded with a higher
  // receiver noise floor; no scale-invariant local detector can honestly
  // infer presence from that view alone.
  scenario('unknown-simultaneous-1mhz-raster-2g4', 'unknown-signal', 'unknown', 'Simultaneous full-band 1 MHz raster comb', 2_441_000_000, 79_000_000, 120_000_000, 'simultaneous-raster', 'simultaneous-raster-fixed-tune', TINYSA_SOURCE, {
    firstCenterHz: 2_402_000_000, channelCount: 79, channelSpacingHz: 1_000_000, channelWidthHz: 180_000,
  }, { carrierRasterHz: 1_000_000, disclosure: multitoneDisclosure, allowedObservableClasses: ['unknown-signal', 'cw-like', 'fm-angle-modulated-like'] }),
  scenario('unknown-interleaved-four-channel-2g4', 'unknown-signal', 'unknown', 'Four time-interleaved independent 2.4 GHz sources', 2_441_000_000, 62_000_000, 84_000_000, 'interleaved-channels', 'interleaved-fixed-tune', TINYSA_SOURCE, {
    channelWidthHz: 1_000_000, channel0Hz: 2_410_300_000, channel1Hz: 2_428_700_000, channel2Hz: 2_453_400_000, channel3Hz: 2_471_600_000,
  }, { disclosure: agileEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'bluetooth-classic-like', 'bluetooth-le-like'] }),
  scenario('unknown-proprietary-off-raster-fhss-2g4', 'unknown-signal', 'unknown', 'Proprietary off-raster 2.4 GHz FHSS', 2_441_000_000, 76_000_000, 84_000_000, 'proprietary-fhss', 'proprietary-fhss-fixed-tune', TINYSA_SOURCE, {
    channelWidthHz: 1_200_000, firstCenterHz: 2_404_350_000, channelCount: 29, channelSpacingHz: 2_550_000,
  }, { disclosure: agileEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'bluetooth-classic-like', 'bluetooth-le-like'] }),
  scenario('unknown-instrument-spur-rbw-line', 'unknown-signal', 'unknown', 'Receiver/instrument spur indistinguishable from a CW line', 98_000_000, 2_000, 500_000, 'rbw-line', 'steady', TINYSA_SOURCE, {
    driftHzPerLook: 35,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'cw-like'] }),
  scenario('unknown-independent-am-equivalent-three-tone', 'unknown-signal', 'unknown', 'Three coherent independent lines exactly scalar-equivalent to the AM scenario', 98_000_000, 52_000, 500_000, 'multitone-lines', 'sinusoidal-am', TINYSA_SOURCE, {
    lineCount: 3, lineOffset0Hz: -25_000, lineOffset1Hz: 0, lineOffset2Hz: 25_000,
    lineLevel0Db: 10 * Math.log10(0.72 ** 2 / 4), lineLevel1Db: 0, lineLevel2Db: 10 * Math.log10(0.72 ** 2 / 4),
    modulationFrequencyHz: 25_000, modulationIndex: 0.72,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'am-dsb-full-carrier-like', 'cw-like'] }),
  scenario('unknown-independent-fm-equivalent-bessel-comb', 'unknown-signal', 'unknown', 'Independent Bessel-weighted lines exactly scalar-equivalent to the FM scenario', 98_000_000, 200_000, 500_000, 'fm-bessel', 'receiver-filtered-fm', TINYSA_SOURCE, {
    modulationFrequencyHz: 25_000, deviationHz: 75_000,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'fm-angle-modulated-like', 'cw-like'] }),
  scenario('unknown-generic-ofdm-20m', 'unknown-signal', 'unknown', 'Generic 20 MHz OFDM exactly matching the fitted LTE/NR scalar projection', 1_840_000_000, 18_000_000, 30_000_000, 'ofdm-channel', 'continuous-ofdm', TINYSA_SOURCE, {
    subcarrierSpacingHz: 15_000,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'lte-fdd-like', 'nr-fdd-like'] }),
  scenario('unknown-generic-tdd-ofdm-10m', 'unknown-signal', 'unknown', 'Generic TDD OFDM scalar-equivalent to the fitted LTE config-0 / normal-CP special-subframe-config-7 downlink projection', 2_595_000_000, 9_000_000, 20_000_000, 'ofdm-channel', LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1, TINYSA_SOURCE, {
    subcarrierSpacingHz: 15_000,
    ...LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
  }, { disclosure: lteTddExactEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'lte-tdd-like'] }),
  scenario('unknown-generic-ofdm-80m', 'unknown-signal', 'unknown', 'Generic 80 MHz OFDM exactly matching the Wi-Fi scalar projection', 5_210_000_000, 76_600_000, 100_000_000, 'ofdm-channel', 'csma-bursts', TINYSA_SOURCE, {
    subcarrierSpacingHz: 312_500,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'wifi-ofdm-like'] }),
  scenario('unknown-proprietary-dsss-22m', 'unknown-signal', 'unknown', 'Proprietary 22 MHz DSSS exactly matching the HR-DSSS scalar projection', 2_437_000_000, 22_000_000, 30_000_000, 'dsss-channel', 'csma-bursts', TINYSA_SOURCE, {
    chipRateHz: 11_000_000,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'wifi-hr-dsss-like'] }),
]);

/**
 * Source-distinct hypotheses that are intentionally identical after the
 * declared scalar instrument observation operator.  Delegating the numerical
 * projection is stronger than maintaining duplicate formulas: it makes the
 * non-identifiability null exact for every seed, look, RBW, tune, and sampling
 * geometry while the returned scenario truth/provenance remains independent.
 */
export const EXACT_SCALAR_EQUIVALENCE_REFERENCE_SCENARIOS: Readonly<Record<string, CanonizedKnownScenarioId | undefined>> = Object.freeze({
  'unknown-instrument-spur-rbw-line': 'cw-rbw-line',
  'unknown-independent-am-equivalent-three-tone': 'am-dsb-25k',
  'unknown-independent-fm-equivalent-bessel-comb': 'fm-beta-3',
  'unknown-generic-ofdm-20m': 'lte-band3-fdd-20m',
  'unknown-generic-tdd-ofdm-10m': 'lte-band38-tdd-10m',
  'unknown-generic-ofdm-80m': 'wifi-ofdm-80m',
  'unknown-proprietary-dsss-22m': 'wifi-hr-dsss-11m',
});

const scenarioById = new Map(canonicalClassificationScenarios.map((value) => [value.id, value]));
if (scenarioById.size !== canonicalClassificationScenarios.length) throw new Error('Canonical classification corpus contains duplicate scenario IDs');
for (const [nullScenarioId, referenceScenarioId] of Object.entries(EXACT_SCALAR_EQUIVALENCE_REFERENCE_SCENARIOS)) {
  if (referenceScenarioId === undefined) continue;
  const scalarNull = scenarioById.get(nullScenarioId);
  const reference = scenarioById.get(referenceScenarioId);
  if (!scalarNull || !reference) throw new Error(`Exact scalar-equivalence pair ${nullScenarioId}<=>${referenceScenarioId} is missing`);
  if (scalarNull.truthClass !== 'unknown-signal'
    || scalarNull.centerHz !== reference.centerHz
    || scalarNull.occupiedBandwidthHz !== reference.occupiedBandwidthHz
    || scalarNull.recommendedSpanHz !== reference.recommendedSpanHz) {
    throw new Error(`Exact scalar-equivalence pair ${nullScenarioId}<=>${referenceScenarioId} has incompatible declared geometry`);
  }
}

export const DEFAULT_CANONICAL_INSTRUMENT: Omit<CanonicalInstrumentConfiguration, 'lookIndex'> = Object.freeze({
  points: 450,
  actualRbwHz: 100_000,
  sweepTimeSeconds: 0.05,
  zeroSpanPoints: 450,
  zeroSpanSamplePeriodSeconds: 1 / 9_000,
  detectedPowerSynthesisFilterWidthHz: CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
  noiseFloorDbm: -108,
  snrDb: 24,
  seed: 407,
});

export function canonicalClassificationScenario(id: string): CanonicalClassificationScenario {
  const value = scenarioById.get(id);
  if (!value) throw new Error(`Unknown canonical classification scenario: ${id}`);
  return structuredClone(value);
}

export function synthesizeCanonicalObservation(
  scenarioId: string,
  input: Partial<CanonicalInstrumentConfiguration> & Pick<CanonicalInstrumentConfiguration, 'lookIndex'>,
): CanonicalScalarObservation {
  const scenario = canonicalClassificationScenario(scenarioId);
  const configuration = { ...DEFAULT_CANONICAL_INSTRUMENT, ...input };
  validateInstrument(configuration);
  const startHz = scenario.centerHz - scenario.recommendedSpanHz / 2;
  const stopHz = scenario.centerHz + scenario.recommendedSpanHz / 2;
  const frequencyHz = Array.from({ length: configuration.points }, (_, index) => startHz + (stopHz - startHz) * index / (configuration.points - 1));
  const knownScenarioId = isCanonizedKnownScenarioId(scenario.id)
    ? scenario.id
    : EXACT_SCALAR_EQUIVALENCE_REFERENCE_SCENARIOS[scenario.id];
  const powerDbm = knownScenarioId === undefined
    ? frequencyHz.map((frequency, index) => {
      const timeSeconds = configuration.lookIndex * configuration.sweepTimeSeconds + index * configuration.sweepTimeSeconds / Math.max(1, configuration.points - 1);
      const relativeSignalDb = spectrumRelativePowerDb(scenario, frequency, timeSeconds, configuration);
      const noiseDbm = configuration.noiseFloorDbm + periodogramNoiseDb(index, configuration.lookIndex, configuration.seed);
      if (!Number.isFinite(relativeSignalDb)) return noiseDbm;
      return combineDbm(noiseDbm, configuration.noiseFloorDbm + configuration.snrDb + relativeSignalDb);
    })
    : synthesizeCanonizedKnownSpectrum({
      scenarioId: knownScenarioId,
      startHz,
      stopHz,
      points: configuration.points,
      actualRbwHz: configuration.actualRbwHz,
      sweepTimeSeconds: configuration.sweepTimeSeconds,
      noiseFloorDbm: configuration.noiseFloorDbm,
      snrDb: configuration.snrDb,
      seed: configuration.seed,
      lookIndex: configuration.lookIndex,
    });
  const zeroSpanFrequencyHz = configuration.zeroSpanFrequencyHz ?? scenario.centerHz;
  const zeroSpanPowerDbm = knownScenarioId === undefined
    ? Array.from({ length: configuration.zeroSpanPoints }, (_, index) => {
      const timeSeconds = (configuration.lookIndex * configuration.zeroSpanPoints + index) * configuration.zeroSpanSamplePeriodSeconds;
      const relativeSignalDb = envelopeRelativePowerDb(scenario, timeSeconds, zeroSpanFrequencyHz, configuration);
      const noiseDbm = configuration.noiseFloorDbm + periodogramNoiseDb(index, configuration.lookIndex + 10_000, configuration.seed ^ 0x68bc21eb);
      if (!Number.isFinite(relativeSignalDb)) return noiseDbm;
      return combineDbm(noiseDbm, configuration.noiseFloorDbm + configuration.snrDb + relativeSignalDb);
    })
    : synthesizeCanonizedKnownEnvelope({
      scenarioId: knownScenarioId,
      points: configuration.zeroSpanPoints,
      samplePeriodSeconds: configuration.zeroSpanSamplePeriodSeconds,
      synthesisFilterWidthHz: configuration.detectedPowerSynthesisFilterWidthHz,
      noiseFloorDbm: configuration.noiseFloorDbm,
      snrDb: configuration.snrDb,
      seed: configuration.seed,
      lookIndex: configuration.lookIndex,
      tuneFrequencyHz: zeroSpanFrequencyHz,
    });
  return {
    corpusVersion: CLASSIFICATION_CORPUS_VERSION,
    scenarioId: scenario.id,
    truthClass: scenario.truthClass,
    qualification: scenario.source.organization === 'TinySA SignalLab' ? 'physics-derived-scalar-projection' : 'standards-parameterized-heuristic-scalar-projection',
    seed: configuration.seed,
    lookIndex: configuration.lookIndex,
    frequencyHz,
    powerDbm,
    sweepTimeSeconds: configuration.sweepTimeSeconds,
    actualRbwHz: configuration.actualRbwHz,
    zeroSpanFrequencyHz,
    detectedPowerActualRbwHz: null,
    detectedPowerSynthesisFilterWidthHz: configuration.detectedPowerSynthesisFilterWidthHz,
    zeroSpanPowerDbm,
    zeroSpanSamplePeriodSeconds: configuration.zeroSpanSamplePeriodSeconds,
    source: structuredClone(scenario.source),
    disclosure: scenario.disclosure,
  };
}

function isCanonizedKnownScenarioId(value: string): value is CanonizedKnownScenarioId {
  return Object.prototype.hasOwnProperty.call(CANONIZED_KNOWN_SCENARIOS, value);
}

function canonizedKnownScenario(
  id: CanonizedKnownScenarioId,
  truthClass: ObservableSignalClass,
  family: CanonicalClassificationScenario['family'],
  label: string,
  source: CanonicalSource,
  options: Pick<CanonicalClassificationScenario, 'carrierRasterHz' | 'duplex'> & {
    disclosure?: string;
    allowedObservableClasses?: readonly ObservableSignalClass[];
  } = {},
): CanonicalClassificationScenario {
  const definition = CANONIZED_KNOWN_SCENARIOS[id];
  return scenario(
    id,
    truthClass,
    family,
    label,
    definition.centerHz,
    definition.occupiedBandwidthHz,
    definition.recommendedSpanHz,
    definition.spectrumModel,
    definition.envelopeModel,
    source,
    definition.parameters,
    options,
  );
}

function scenario(
  id: string,
  truthClass: ObservableSignalClass,
  family: CanonicalClassificationScenario['family'],
  label: string,
  centerHz: number,
  occupiedBandwidthHz: number,
  recommendedSpanHz: number,
  spectrumModel: SpectrumModel,
  envelopeModel: EnvelopeModel,
  source: CanonicalSource,
  parameters: Readonly<Record<string, number>>,
  options: Pick<CanonicalClassificationScenario, 'carrierRasterHz' | 'duplex'> & {
    disclosure?: string;
    allowedObservableClasses?: readonly ObservableSignalClass[];
  } = {},
): CanonicalClassificationScenario {
  if (recommendedSpanHz < occupiedBandwidthHz) throw new Error(`${id} span does not contain its occupied bandwidth`);
  const { disclosure = nonConformance, allowedObservableClasses = [truthClass], ...metadata } = options;
  if (!allowedObservableClasses.length || !allowedObservableClasses.includes(truthClass)
    || allowedObservableClasses.some((value) => !OBSERVABLE_SIGNAL_CLASSES.includes(value))) {
    throw new Error(`${id} has invalid allowed observable classes`);
  }
  return Object.freeze({
    id,
    truthClass,
    allowedObservableClasses: Object.freeze([...new Set(allowedObservableClasses)]),
    family,
    label,
    centerHz,
    occupiedBandwidthHz,
    recommendedSpanHz,
    spectrumModel,
    envelopeModel,
    parameters: Object.freeze({ ...parameters }),
    source: sourceBasis(source.organization, source.references),
    disclosure,
    ...metadata,
  });
}

function spectrumRelativePowerDb(
  scenario: CanonicalClassificationScenario,
  frequencyHz: number,
  timeSeconds: number,
  configuration: CanonicalInstrumentConfiguration,
): number {
  // A swept analyzer observes different frequencies at different times.  The
  // traffic schedule must therefore gate the spectrum sample itself; applying
  // TDMA/TDD/CSMA only to zero span would incorrectly turn every bursty source
  // into a continuously occupied channel during a sweep.
  if (!sweptTrafficActive(scenario, timeSeconds, configuration.seed)) return Number.NEGATIVE_INFINITY;
  const offsetHz = frequencyHz - scenario.centerHz;
  switch (scenario.spectrumModel) {
    case 'rbw-line': {
      const drift = (configuration.lookIndex - 4) * (scenario.parameters.driftHzPerLook ?? 0);
      return gaussianFilterDb(offsetHz - drift, configuration.actualRbwHz);
    }
    case 'am-dsb-full-carrier': {
      const modulationFrequencyHz = requiredParameter(scenario, 'modulationFrequencyHz');
      const modulationIndex = requiredParameter(scenario, 'modulationIndex');
      const sidebandRelativeDb = 10 * Math.log10(modulationIndex ** 2 / 4);
      return combineRelativeDb([
        gaussianFilterDb(offsetHz, configuration.actualRbwHz),
        sidebandRelativeDb + gaussianFilterDb(offsetHz - modulationFrequencyHz, configuration.actualRbwHz),
        sidebandRelativeDb + gaussianFilterDb(offsetHz + modulationFrequencyHz, configuration.actualRbwHz),
      ]);
    }
    case 'fm-bessel': {
      const modulationFrequencyHz = requiredParameter(scenario, 'modulationFrequencyHz');
      const beta = requiredParameter(scenario, 'deviationHz') / modulationFrequencyHz;
      const components: number[] = [];
      for (let order = -10; order <= 10; order++) {
        const amplitude = Math.abs(besselJ(order, beta));
        if (amplitude < 1e-5) continue;
        components.push(20 * Math.log10(amplitude) + gaussianFilterDb(offsetHz - order * modulationFrequencyHz, configuration.actualRbwHz));
      }
      return combineRelativeDb(components);
    }
    case 'gaussian-channel':
      return gaussianOccupiedChannelDb(offsetHz, scenario.occupiedBandwidthHz);
    case 'ofdm-channel':
      return ofdmChannelDb(offsetHz, scenario.occupiedBandwidthHz, requiredParameter(scenario, 'subcarrierSpacingHz'), configuration.lookIndex, configuration.seed);
    case 'dsss-channel':
      return dsssChannelDb(offsetHz, scenario.occupiedBandwidthHz);
    case 'classic-hop': {
      if (!classicSlotActive(timeSeconds)) return Number.NEGATIVE_INFINITY;
      const hop = classicHopCenter(timeSeconds, configuration.seed);
      return gaussianOccupiedChannelDb(frequencyHz - hop, requiredParameter(scenario, 'channelWidthHz'));
    }
    case 'ble-advertising': {
      const center = bleAdvertisingCenter(scenario, timeSeconds, configuration.seed);
      return center === undefined ? Number.NEGATIVE_INFINITY : gaussianOccupiedChannelDb(frequencyHz - center, requiredParameter(scenario, 'channelWidthHz'));
    }
    case 'stationary-burst': {
      const period = requiredParameter(scenario, 'burstPeriodSeconds');
      const duty = requiredParameter(scenario, 'burstDuty');
      return periodicBurstActive(timeSeconds, period, duty)
        ? gaussianOccupiedChannelDb(offsetHz, requiredParameter(scenario, 'channelWidthHz'))
        : Number.NEGATIVE_INFINITY;
    }
    case 'simultaneous-raster': {
      const centers = rasterCenters(scenario);
      const nearest = centers.reduce((best, center) => Math.abs(frequencyHz - center) < Math.abs(frequencyHz - best) ? center : best, centers[0]!);
      return gaussianFilterDb(frequencyHz - nearest, Math.max(configuration.actualRbwHz, requiredParameter(scenario, 'channelWidthHz')));
    }
    case 'interleaved-channels':
      return gaussianOccupiedChannelDb(frequencyHz - interleavedCenter(scenario, configuration.lookIndex), requiredParameter(scenario, 'channelWidthHz'));
    case 'proprietary-fhss':
      return gaussianOccupiedChannelDb(frequencyHz - proprietaryFhssCenter(scenario, configuration.lookIndex, configuration.seed), requiredParameter(scenario, 'channelWidthHz'));
    case 'fsk-pair': {
      const deviationHz = requiredParameter(scenario, 'deviationHz');
      const state = Math.sin(2 * Math.PI * 1_700 * timeSeconds) >= 0 ? 1 : -1;
      return gaussianFilterDb(offsetHz - state * deviationHz, Math.max(configuration.actualRbwHz, scenario.occupiedBandwidthHz / 6));
    }
    case 'chirp': {
      const period = requiredParameter(scenario, 'chirpPeriodSeconds');
      const phase = (timeSeconds % period) / period;
      const instantaneousHz = scenario.centerHz - scenario.occupiedBandwidthHz / 2 + phase * scenario.occupiedBandwidthHz;
      return gaussianFilterDb(frequencyHz - instantaneousHz, Math.max(configuration.actualRbwHz, scenario.occupiedBandwidthHz / 80));
    }
    case 'multitone-lines':
      return combineRelativeDb(multitoneOffsets(scenario).map((lineOffsetHz, index) =>
        multitoneLevelDb(scenario, index) + gaussianFilterDb(offsetHz - lineOffsetHz, configuration.actualRbwHz)));
    case 'impulsive-noise': {
      const active = pseudoUniform(Math.floor(timeSeconds * 1_000_000), configuration.lookIndex, configuration.seed) < 0.22;
      return active && Math.abs(offsetHz) <= scenario.occupiedBandwidthHz / 2 ? -2.5 * Math.abs(offsetHz) / (scenario.occupiedBandwidthHz / 2) : Number.NEGATIVE_INFINITY;
    }
  }
}

function envelopeRelativePowerDb(
  scenario: CanonicalClassificationScenario,
  timeSeconds: number,
  tuneFrequencyHz: number,
  configuration: CanonicalInstrumentConfiguration,
): number {
  switch (scenario.envelopeModel) {
    case 'steady': return -0.12 + 0.12 * Math.sin(2 * Math.PI * 7 * timeSeconds);
    case 'sinusoidal-am': return receiverFilteredAmPowerDb(scenario, timeSeconds, tuneFrequencyHz, configuration.detectedPowerSynthesisFilterWidthHz);
    case 'receiver-filtered-fm': return receiverFilteredFmPowerDb(scenario, timeSeconds, tuneFrequencyHz, configuration.detectedPowerSynthesisFilterWidthHz);
    case 'one-of-eight-tdma': {
      return gsmTrafficActive(scenario, timeSeconds) ? 0 : Number.NEGATIVE_INFINITY;
    }
    case 'continuous-gsm-loaded': return -0.35 + 0.25 * deterministicTexture(timeSeconds * 1_733, configuration.seed);
    case 'continuous-ofdm': return -0.7 + 0.55 * deterministicTexture(timeSeconds * 2_000, configuration.seed);
    case LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1: {
      return lteTddConfig0Ssp7NormalCpDownlinkActive(scenario.parameters, timeSeconds)
        ? -0.5 + 0.4 * deterministicTexture(timeSeconds * 2_000, configuration.seed)
        : Number.NEGATIVE_INFINITY;
    }
    case NR_TDD_7DL_3UL_ENGINEERING_V1: {
      return nrTdd7Dl3UlEngineeringDownlinkActive(scenario.parameters, timeSeconds)
        ? -0.5 + 0.45 * deterministicTexture(timeSeconds * 4_000, configuration.seed)
        : Number.NEGATIVE_INFINITY;
    }
    case 'csma-bursts': {
      return csmaTrafficActive(timeSeconds, configuration.seed)
        ? -0.5 + 0.7 * deterministicTexture(timeSeconds * 3_000, configuration.seed)
        : Number.NEGATIVE_INFINITY;
    }
    case 'classic-slots': {
      const slot = requiredParameter(scenario, 'slotSeconds');
      const index = Math.floor(timeSeconds / slot);
      const hopCenterHz = classicHopCenter(timeSeconds, configuration.seed);
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - hopCenterHz, Math.max(configuration.detectedPowerSynthesisFilterWidthHz, requiredParameter(scenario, 'channelWidthHz')));
      return classicSlotActive(timeSeconds) && receiverResponseDb > -60
        ? -0.4 + 0.25 * deterministicTexture(index, configuration.seed) + receiverResponseDb
        : Number.NEGATIVE_INFINITY;
    }
    case BLE_PRIMARY_ADVERTISING_ENGINEERING_V1: {
      const packetCenterHz = bleAdvertisingCenter(scenario, timeSeconds, configuration.seed);
      if (packetCenterHz === undefined) return Number.NEGATIVE_INFINITY;
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - packetCenterHz, Math.max(configuration.detectedPowerSynthesisFilterWidthHz, requiredParameter(scenario, 'channelWidthHz')));
      return receiverResponseDb > -60 ? -0.35 + receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'stationary-bursts': {
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - scenario.centerHz, Math.max(configuration.detectedPowerSynthesisFilterWidthHz, requiredParameter(scenario, 'channelWidthHz')));
      return periodicBurstActive(timeSeconds, requiredParameter(scenario, 'burstPeriodSeconds'), requiredParameter(scenario, 'burstDuty'))
        && receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'simultaneous-raster-fixed-tune': {
      const receiverResponseDb = combineRelativeDb(rasterCenters(scenario).map((centerHz) =>
        gaussianFilterDb(tuneFrequencyHz - centerHz, Math.max(configuration.detectedPowerSynthesisFilterWidthHz, requiredParameter(scenario, 'channelWidthHz')))));
      return receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'interleaved-fixed-tune': {
      const centerHz = interleavedCenter(scenario, configuration.lookIndex);
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - centerHz, Math.max(configuration.detectedPowerSynthesisFilterWidthHz, requiredParameter(scenario, 'channelWidthHz')));
      return receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'proprietary-fhss-fixed-tune': {
      const centerHz = proprietaryFhssCenter(scenario, configuration.lookIndex, configuration.seed);
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - centerHz, Math.max(configuration.detectedPowerSynthesisFilterWidthHz, requiredParameter(scenario, 'channelWidthHz')));
      return receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'fsk-steady': return -0.4 + 0.25 * Math.sin(2 * Math.PI * 1_700 * timeSeconds);
    case 'chirp-sweep': return -0.8 + 0.7 * Math.sin(2 * Math.PI * 250 * timeSeconds);
    case 'multitone-fixed-tune': {
      const receiverResponseDb = combineRelativeDb(multitoneOffsets(scenario).map((lineOffsetHz, index) =>
        multitoneLevelDb(scenario, index) + gaussianFilterDb(tuneFrequencyHz - (scenario.centerHz + lineOffsetHz), configuration.detectedPowerSynthesisFilterWidthHz)));
      return receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'impulsive': return pseudoUniform(Math.floor(timeSeconds * 50_000), 17, configuration.seed) < 0.08 ? 0 : Number.NEGATIVE_INFINITY;
  }
}

function sweptTrafficActive(
  scenario: CanonicalClassificationScenario,
  timeSeconds: number,
  seed: number,
): boolean {
  switch (scenario.envelopeModel) {
    case 'one-of-eight-tdma': return gsmTrafficActive(scenario, timeSeconds);
    case LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1: return lteTddConfig0Ssp7NormalCpDownlinkActive(scenario.parameters, timeSeconds);
    case NR_TDD_7DL_3UL_ENGINEERING_V1: return nrTdd7Dl3UlEngineeringDownlinkActive(scenario.parameters, timeSeconds);
    case 'csma-bursts': return csmaTrafficActive(timeSeconds, seed);
    default: return true;
  }
}

function gsmTrafficActive(scenario: CanonicalClassificationScenario, timeSeconds: number): boolean {
  const slot = requiredParameter(scenario, 'slotSeconds');
  return Math.floor(timeSeconds / slot) % 8 === 0;
}

function csmaTrafficActive(timeSeconds: number, seed: number): boolean {
  const coordinate = timeSeconds * 1_000;
  const frame = Math.floor(coordinate / 2.7);
  const phase = coordinate - frame * 2.7;
  const duration = 0.25 + 1.9 * pseudoUniform(frame, 7, seed);
  return phase < duration;
}

function receiverFilteredAmPowerDb(
  scenario: CanonicalClassificationScenario,
  timeSeconds: number,
  tuneFrequencyHz: number,
  rbwHz: number,
): number {
  const modulationFrequencyHz = requiredParameter(scenario, 'modulationFrequencyHz');
  const modulationIndex = requiredParameter(scenario, 'modulationIndex');
  return receiverFilteredTonePowerDb([
    { offsetHz: -modulationFrequencyHz, amplitude: modulationIndex / 2 },
    { offsetHz: 0, amplitude: 1 },
    { offsetHz: modulationFrequencyHz, amplitude: modulationIndex / 2 },
  ], scenario.centerHz, timeSeconds, tuneFrequencyHz, rbwHz, modulationFrequencyHz);
}

function receiverFilteredFmPowerDb(
  scenario: CanonicalClassificationScenario,
  timeSeconds: number,
  tuneFrequencyHz: number,
  rbwHz: number,
): number {
  const modulationFrequencyHz = requiredParameter(scenario, 'modulationFrequencyHz');
  const beta = requiredParameter(scenario, 'deviationHz') / modulationFrequencyHz;
  const tones = Array.from({ length: 21 }, (_value, index) => index - 10)
    .map((order) => ({ offsetHz: order * modulationFrequencyHz, amplitude: besselJ(order, beta) }))
    .filter((tone) => Math.abs(tone.amplitude) >= 1e-5);
  return receiverFilteredTonePowerDb(
    tones,
    scenario.centerHz,
    timeSeconds,
    tuneFrequencyHz,
    rbwHz,
    modulationFrequencyHz,
  );
}

function receiverFilteredTonePowerDb(
  tones: readonly { offsetHz: number; amplitude: number }[],
  centerHz: number,
  timeSeconds: number,
  tuneFrequencyHz: number,
  rbwHz: number,
  fundamentalHz: number,
): number {
  let real = 0;
  let imaginary = 0;
  for (const tone of tones) {
    // gaussianFilterDb is the detected-power response. Convert to its real,
    // zero-phase voltage response before coherently summing the passed tones.
    const responseAmplitude = 10 ** (gaussianFilterDb(
      centerHz + tone.offsetHz - tuneFrequencyHz,
      rbwHz,
    ) / 20);
    const order = tone.offsetHz / fundamentalHz;
    const phase = 2 * Math.PI * order * fundamentalHz * timeSeconds;
    real += tone.amplitude * responseAmplitude * Math.cos(phase);
    imaginary += tone.amplitude * responseAmplitude * Math.sin(phase);
  }
  return 10 * Math.log10(Math.max(1e-12, real * real + imaginary * imaginary));
}

function multitoneOffsets(scenario: CanonicalClassificationScenario): readonly number[] {
  const count = requiredParameter(scenario, 'lineCount');
  if (!Number.isInteger(count) || count < 1 || count > 16) throw new Error(`${scenario.id} has invalid multitone lineCount`);
  return Array.from({ length: count }, (_value, index) => requiredParameter(scenario, `lineOffset${index}Hz`));
}

function multitoneLevelDb(scenario: CanonicalClassificationScenario, index: number): number {
  return scenario.parameters[`lineLevel${index}Db`] ?? 0;
}

function gaussianFilterDb(offsetHz: number, rbwHz: number): number {
  const sigmaHz = Math.max(1, rbwHz / 2.355);
  return -4.342944819 * 0.5 * (offsetHz / sigmaHz) ** 2;
}

function gaussianOccupiedChannelDb(offsetHz: number, occupiedBandwidthHz: number): number {
  const normalized = offsetHz / Math.max(1, occupiedBandwidthHz / 2);
  if (Math.abs(normalized) > 1.45) return Number.NEGATIVE_INFINITY;
  return -4.342944819 * 0.5 * (normalized / 0.52) ** 2;
}

function ofdmChannelDb(offsetHz: number, occupiedBandwidthHz: number, spacingHz: number, lookIndex: number, seed: number): number {
  const half = occupiedBandwidthHz / 2;
  const distance = Math.abs(offsetHz);
  if (distance > half * 1.08) return Number.NEGATIVE_INFINITY;
  if (distance > half) return -18 - 45 * (distance - half) / (half * 0.08);
  const taper = distance > half * 0.96 ? -5 * (distance - half * 0.96) / (half * 0.04) : 0;
  const dcNotch = Math.abs(offsetHz) < spacingHz * 0.75 ? -10 : 0;
  const texture = 0.65 * deterministicTexture(offsetHz / Math.max(1, spacingHz) + lookIndex * 0.37, seed);
  return taper + dcNotch + texture;
}

function dsssChannelDb(offsetHz: number, occupiedBandwidthHz: number): number {
  const normalized = Math.abs(offsetHz) / (occupiedBandwidthHz / 2);
  if (normalized > 1.25) return Number.NEGATIVE_INFINITY;
  return -1.8 * normalized ** 2 - 9 * normalized ** 8;
}

function classicHopCenter(timeSeconds: number, seed: number): number {
  const slot = Math.floor(timeSeconds / 0.000625);
  const channel = Math.floor(pseudoUniform(slot, 31, seed) * 79);
  return 2_402_000_000 + channel * 1_000_000;
}

function classicSlotActive(timeSeconds: number): boolean {
  const slot = Math.floor(timeSeconds / 0.000625);
  return slot % 3 !== 2;
}

function bleAdvertisingCenter(
  scenario: CanonicalClassificationScenario,
  timeSeconds: number,
  seed: number,
): number | undefined {
  const engineeringScheduleVersion = requiredParameter(scenario, 'engineeringScheduleVersion');
  const advertisingDelayGeneratorVersion = requiredParameter(scenario, 'advertisingDelayGeneratorVersion');
  const intervalSeconds = requiredParameter(scenario, 'advertisingIntervalSeconds');
  const advertisingDelayMinimumSeconds = requiredParameter(scenario, 'advertisingDelayMinimumSeconds');
  const advertisingDelayMaximumSeconds = requiredParameter(scenario, 'advertisingDelayMaximumSeconds');
  const packetStartSpacingSeconds = requiredParameter(scenario, 'packetStartSpacingSeconds');
  const packetDurationSeconds = requiredParameter(scenario, 'packetDurationSeconds');
  const packetCount = requiredParameter(scenario, 'packetCount');
  if (engineeringScheduleVersion !== 1 || advertisingDelayGeneratorVersion !== 1 || packetCount !== 3) {
    throw new Error(`${scenario.id} requires ${BLE_PRIMARY_ADVERTISING_ENGINEERING_V1}`);
  }
  if (packetDurationSeconds <= 0 || packetDurationSeconds > packetStartSpacingSeconds) {
    throw new Error('BLE advertising packet duration must be positive and no longer than the packet start spacing');
  }
  const starts = bleAdvertisingEventStartsThrough(
    timeSeconds,
    intervalSeconds,
    advertisingDelayMinimumSeconds,
    advertisingDelayMaximumSeconds,
    seed,
  );
  const event = greatestIndexAtOrBefore(starts, timeSeconds);
  if (event < 0) return undefined;
  const eventPhase = timeSeconds - starts[event]!;
  if (eventPhase < 0) return undefined;
  const packet = Math.floor(eventPhase / packetStartSpacingSeconds);
  if (packet < 0 || packet >= packetCount) return undefined;
  const packetPhase = eventPhase - packet * packetStartSpacingSeconds;
  if (packetPhase >= packetDurationSeconds) return undefined;
  return requiredParameter(scenario, `packet${packet}CenterHz`);
}

const bleEventStartCache = new Map<string, number[]>();

function bleAdvertisingEventStartsThrough(timeSeconds: number, intervalSeconds: number, advertisingDelayMinimumSeconds: number, advertisingDelayMaximumSeconds: number, seed: number): readonly number[] {
  if (!(intervalSeconds > 0) || !(advertisingDelayMinimumSeconds >= 0) || advertisingDelayMaximumSeconds < advertisingDelayMinimumSeconds) {
    throw new Error('BLE advertising interval and delay bounds must be valid');
  }
  const key = `${intervalSeconds}:${advertisingDelayMinimumSeconds}:${advertisingDelayMaximumSeconds}:${seed}`;
  const starts = bleEventStartCache.get(key) ?? [0];
  while (starts.at(-1)! <= timeSeconds) {
    const event = starts.length - 1;
    const advertisingDelaySeconds = advertisingDelayMinimumSeconds
      + pseudoUniform(event, 43, seed) * (advertisingDelayMaximumSeconds - advertisingDelayMinimumSeconds);
    starts.push(starts.at(-1)! + intervalSeconds + advertisingDelaySeconds);
  }
  bleEventStartCache.set(key, starts);
  return starts;
}

function greatestIndexAtOrBefore(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! <= target) {
      result = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return result;
}

function periodicBurstActive(timeSeconds: number, periodSeconds: number, duty: number): boolean {
  if (!(periodSeconds > 0) || !(duty > 0 && duty < 1)) throw new Error('Periodic burst geometry is invalid');
  const phase = ((timeSeconds % periodSeconds) + periodSeconds) % periodSeconds;
  return phase < periodSeconds * duty;
}

function rasterCenters(scenario: CanonicalClassificationScenario): readonly number[] {
  const count = requiredParameter(scenario, 'channelCount');
  if (!Number.isInteger(count) || count < 2 || count > 128) throw new Error(`${scenario.id} has invalid channelCount`);
  const firstCenterHz = requiredParameter(scenario, 'firstCenterHz');
  const spacingHz = requiredParameter(scenario, 'channelSpacingHz');
  return Array.from({ length: count }, (_value, index) => firstCenterHz + index * spacingHz);
}

function interleavedCenter(scenario: CanonicalClassificationScenario, lookIndex: number): number {
  const centers = [0, 1, 2, 3].map((index) => requiredParameter(scenario, `channel${index}Hz`));
  // A non-monotone order prevents this adversarial schedule from looking like
  // a simple chirp while preserving exactly one independent source per sweep.
  return centers[[0, 2, 1, 3][lookIndex % 4]!]!;
}

function proprietaryFhssCenter(scenario: CanonicalClassificationScenario, lookIndex: number, seed: number): number {
  const centers = rasterCenters(scenario);
  const channel = Math.floor(pseudoUniform(lookIndex, 97, seed ^ 0x51f15e) * centers.length);
  return centers[channel]!;
}

function besselJ(order: number, value: number): number {
  const absoluteOrder = Math.abs(order);
  let term = (value / 2) ** absoluteOrder / factorial(absoluteOrder);
  let sum = term;
  for (let k = 1; k < 80; k++) {
    term *= -(value * value / 4) / (k * (k + absoluteOrder));
    sum += term;
    if (Math.abs(term) < 1e-14) break;
  }
  return order < 0 && absoluteOrder % 2 === 1 ? -sum : sum;
}

function factorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index++) result *= index;
  return result;
}

function periodogramNoiseDb(index: number, lookIndex: number, seed: number): number {
  let gammaPower = 0;
  const looks = 6;
  for (let look = 0; look < looks; look++) gammaPower += -Math.log(Math.max(Number.EPSILON, pseudoUniform(index, lookIndex * 17 + look, seed ^ Math.imul(look + 1, 0x9e3779b9))));
  return Math.max(-12, Math.min(8, 10 * Math.log10(gammaPower / looks)));
}

function pseudoUniform(left: number, right: number, seed: number): number {
  let value = (Math.trunc(left) ^ Math.imul(Math.trunc(right), 0x9e3779b1) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value ^= value >>> 15;
  return ((value >>> 0) + 0.5) / 0x1_0000_0000;
}

function deterministicTexture(coordinate: number, seed: number): number {
  return 0.58 * Math.sin(coordinate * 0.73 + seed * 0.001)
    + 0.27 * Math.cos(coordinate * 1.91 - seed * 0.0007)
    + 0.15 * Math.sin(coordinate * 4.17 + seed * 0.0003);
}

function combineDbm(leftDbm: number, rightDbm: number): number {
  return 10 * Math.log10(10 ** (leftDbm / 10) + 10 ** (rightDbm / 10));
}

function combineRelativeDb(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return Number.NEGATIVE_INFINITY;
  const maximum = Math.max(...finite);
  return maximum + 10 * Math.log10(finite.reduce((sum, value) => sum + 10 ** ((value - maximum) / 10), 0));
}

function requiredParameter(scenario: CanonicalClassificationScenario, key: string): number {
  const value = scenario.parameters[key];
  if (value === undefined) throw new Error(`${scenario.id} is missing parameter ${key}`);
  return value;
}

function validateInstrument(value: CanonicalInstrumentConfiguration): void {
  if (!Number.isInteger(value.points) || value.points < 16) throw new Error('Canonical spectrum requires at least 16 points');
  if (!Number.isInteger(value.zeroSpanPoints) || value.zeroSpanPoints < 20) throw new Error('Canonical zero span requires at least 20 points');
  for (const [key, item] of Object.entries(value)) if (!Number.isFinite(item)) throw new Error(`Canonical instrument ${key} must be finite`);
  if (value.actualRbwHz <= 0 || value.detectedPowerSynthesisFilterWidthHz <= 0
    || value.sweepTimeSeconds <= 0 || value.zeroSpanSamplePeriodSeconds <= 0) {
    throw new Error('Canonical acquisition intervals and synthesis filter widths must be positive');
  }
  if (!Number.isInteger(value.seed) || !Number.isInteger(value.lookIndex) || value.lookIndex < 0) throw new Error('Canonical seed/look index must be non-negative integers');
}
