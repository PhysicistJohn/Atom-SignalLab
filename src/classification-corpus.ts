/**
 * Deterministic scalar-observation corpus for Atomizer classifier development.
 *
 * These scenarios are physics/standards-derived instrument projections, not
 * conformance I/Q waveforms. I/Q truth is deliberately not exposed: consumers
 * receive only the swept power and detected-power envelope available from a
 * tinySA-class instrument.
 */

export const CLASSIFICATION_CORPUS_VERSION = 'observable-scalar-corpus-v7' as const;

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
  | 'lte-tdd-pattern'
  | 'nr-tdd-pattern'
  | 'csma-bursts'
  | 'classic-slots'
  | 'ble-advertising-events'
  | 'stationary-bursts'
  | 'simultaneous-raster-fixed-tune'
  | 'interleaved-fixed-tune'
  | 'proprietary-fhss-fixed-tune'
  | 'fsk-steady'
  | 'chirp-sweep'
  | 'multitone-fixed-tune'
  | 'impulsive';

export interface CanonicalSource {
  organization: 'TinySA SignalLab' | '3GPP' | 'IEEE' | 'Bluetooth SIG';
  specification: string;
  clause: string;
  revision: string;
  url: string;
}

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
  carrierRasterHz?: number;
  duplex?: 'fdd' | 'tdd';
  parameters: Readonly<Record<string, number>>;
  source: CanonicalSource;
  disclosure: string;
}

export interface CanonicalInstrumentConfiguration {
  points: number;
  actualRbwHz: number;
  sweepTimeSeconds: number;
  zeroSpanPoints: number;
  zeroSpanSamplePeriodSeconds: number;
  /** Fixed analyzer tune for the detected-power capture. Defaults to the scenario center. */
  zeroSpanFrequencyHz?: number;
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
  actualRbwHz: number;
  zeroSpanFrequencyHz: number;
  zeroSpanPowerDbm: readonly number[];
  zeroSpanSamplePeriodSeconds: number;
  source: CanonicalSource;
  disclosure: string;
}

const TINYSA_SOURCE: CanonicalSource = {
  organization: 'TinySA SignalLab',
  specification: 'Analytic RF waveform definitions',
  clause: 'CW, DSB full-carrier AM, sinusoidal FM and hard-negative models',
  revision: '1',
  url: 'https://tinysa.org/wiki/',
};
const GSM_SOURCE: CanonicalSource = {
  organization: '3GPP', specification: 'TS 45.002 / TS 45.005',
  clause: 'TDMA frame/slot structure and 200 kHz radio-channel spacing', revision: '19.0.0',
  url: 'https://www.etsi.org/deliver/etsi_ts/145000_145099/145005/19.00.00_60/ts_145005v190000p.pdf',
};
const LTE_SOURCE: CanonicalSource = {
  organization: '3GPP', specification: 'TS 36.101 / TS 36.211',
  clause: 'Operating bands, transmission bandwidths and frame structure', revision: '18.5.0',
  url: 'https://www.etsi.org/deliver/etsi_ts/136100_136199/136101/18.05.00_60/ts_136101v180500p.pdf',
};
const NR_SOURCE: CanonicalSource = {
  organization: '3GPP', specification: 'TS 38.104 / TS 38.211',
  clause: 'FR1 operating bands, channel bandwidths, numerology and frame structure', revision: '18.12.0',
  url: 'https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/18.12.00_60/ts_138104v181200p.pdf',
};
const WIFI_SOURCE: CanonicalSource = {
  organization: 'IEEE', specification: 'IEEE 802.11-2024',
  clause: 'DSSS/HR-DSSS and OFDM PHY channelization', revision: '2024',
  url: 'https://standards.ieee.org/ieee/802.11/10548/',
};
const IEEE_802154_SOURCE: CanonicalSource = {
  organization: 'IEEE', specification: 'IEEE 802.15.4-2024',
  clause: '2450 MHz O-QPSK PHY channelization', revision: '2024',
  url: 'https://standards.ieee.org/ieee/802.15.4/11011/',
};
const BLUETOOTH_SOURCE: CanonicalSource = {
  organization: 'Bluetooth SIG', specification: 'Bluetooth Core Specification',
  clause: 'BR/EDR and LE radio physical layers and baseband/link-layer timing', revision: '6.3',
  url: 'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/index-en.html',
};

const nonConformance = 'Deterministic scalar instrument projection for inference testing; it is not a bit-exact, protocol-decodable, or conformance I/Q waveform.';
const multitoneDisclosure = `${nonConformance} Simultaneous regular lines are association-compatible, but scalar power cannot prove a shared emitter, oscillator, modulation process, or message identity.`;
const agileEquivalenceDisclosure = `${nonConformance} The observed frequency-agile scalar activity is also compatible with Bluetooth, proprietary FHSS, a scanning interferer, or time-interleaved independent sources; it cannot prove protocol or emitter identity.`;
const stationaryDisclosure = `${nonConformance} Intermittence at one fixed center is negative evidence for frequency agility, but its scalar line may remain CW-like.`;
const exactScalarEquivalenceDisclosure = `${nonConformance} This deliberately independent source model produces the same admitted scalar observables as a fitted known scenario, so the measurement cannot establish waveform or protocol identity.`;

export const canonicalClassificationScenarios: readonly CanonicalClassificationScenario[] = Object.freeze([
  scenario('cw-rbw-line', 'cw-like', 'analog', 'CW through an RBW filter', 98_000_000, 2_000, 500_000, 'rbw-line', 'steady', TINYSA_SOURCE, { driftHzPerLook: 35 }),
  scenario('am-dsb-25k', 'am-dsb-full-carrier-like', 'analog', 'DSB full-carrier AM, 25 kHz tone', 98_000_000, 52_000, 500_000, 'am-dsb-full-carrier', 'sinusoidal-am', TINYSA_SOURCE, { modulationFrequencyHz: 25_000, modulationIndex: 0.72 }, {
    allowedObservableClasses: ['am-dsb-full-carrier-like', 'cw-like'],
  }),
  scenario('fm-beta-3', 'fm-angle-modulated-like', 'analog', 'Sinusoidal FM, beta 3', 98_000_000, 200_000, 500_000, 'fm-bessel', 'receiver-filtered-fm', TINYSA_SOURCE, { modulationFrequencyHz: 25_000, deviationHz: 75_000 }, {
    allowedObservableClasses: ['fm-angle-modulated-like', 'cw-like'],
  }),

  scenario('gsm-900-tdma', 'gsm-like', 'geran', 'GSM 900 one-timeslot traffic', 947_400_000, 200_000, 2_000_000, 'gaussian-channel', 'one-of-eight-tdma', GSM_SOURCE, { slotSeconds: 15 / 26_000, frameSeconds: 60 / 13_000 }, { carrierRasterHz: 200_000, duplex: 'fdd' }),
  scenario('gsm-900-loaded-bcch', 'gsm-like', 'geran', 'GSM 900 loaded BCCH/dummy-burst carrier', 947_400_000, 200_000, 2_000_000, 'gaussian-channel', 'continuous-gsm-loaded', GSM_SOURCE, { slotSeconds: 15 / 26_000, frameSeconds: 60 / 13_000 }, {
    carrierRasterHz: 200_000,
    duplex: 'fdd',
    disclosure: `${nonConformance} This loaded downlink scenario models continuous slot occupancy from traffic, control, or dummy bursts; it does not claim that every GSM carrier is continuous.`,
  }),

  scenario('lte-band3-fdd-5m', 'lte-fdd-like', 'e-utra', 'LTE Band 3 FDD, 5 MHz', 1_842_500_000, 4_500_000, 10_000_000, 'ofdm-channel', 'continuous-ofdm', LTE_SOURCE, { subcarrierSpacingHz: 15_000, subframeSeconds: 0.001 }, { carrierRasterHz: 100_000, duplex: 'fdd' }),
  scenario('lte-band3-fdd-20m', 'lte-fdd-like', 'e-utra', 'LTE Band 3 FDD, 20 MHz', 1_840_000_000, 18_000_000, 30_000_000, 'ofdm-channel', 'continuous-ofdm', LTE_SOURCE, { subcarrierSpacingHz: 15_000, subframeSeconds: 0.001 }, { carrierRasterHz: 100_000, duplex: 'fdd' }),
  scenario('lte-band38-tdd-10m', 'lte-tdd-like', 'e-utra', 'LTE Band 38 TDD, 10 MHz · UL/DL config 0', 2_595_000_000, 9_000_000, 20_000_000, 'ofdm-channel', 'lte-tdd-pattern', LTE_SOURCE, { subcarrierSpacingHz: 15_000, subframeSeconds: 0.001, ulDlConfiguration: 0 }, { carrierRasterHz: 100_000, duplex: 'tdd' }),

  scenario('nr-n3-fdd-20m', 'nr-fdd-like', 'nr', 'NR n3 FDD, 20 MHz', 1_840_000_000, 19_080_000, 30_000_000, 'ofdm-channel', 'continuous-ofdm', NR_SOURCE, { subcarrierSpacingHz: 15_000, slotSeconds: 0.001 }, { carrierRasterHz: 5_000, duplex: 'fdd' }),
  scenario('nr-n78-tdd-40m', 'nr-tdd-like', 'nr', 'NR n78 TDD, 40 MHz', 3_500_000_000, 38_160_000, 60_000_000, 'ofdm-channel', 'nr-tdd-pattern', NR_SOURCE, { subcarrierSpacingHz: 30_000, slotSeconds: 0.0005 }, { carrierRasterHz: 15_000, duplex: 'tdd' }),
  scenario('nr-n78-tdd-100m', 'nr-tdd-like', 'nr', 'NR n78 TDD, 100 MHz', 3_500_000_000, 98_280_000, 120_000_000, 'ofdm-channel', 'nr-tdd-pattern', NR_SOURCE, { subcarrierSpacingHz: 30_000, slotSeconds: 0.0005 }, { carrierRasterHz: 15_000, duplex: 'tdd' }),

  scenario('wifi-hr-dsss-11m', 'wifi-hr-dsss-like', 'wlan', '2.4 GHz HR-DSSS channel', 2_437_000_000, 22_000_000, 30_000_000, 'dsss-channel', 'csma-bursts', WIFI_SOURCE, { chipRateHz: 11_000_000 }, { carrierRasterHz: 5_000_000 }),
  scenario('wifi-ofdm-20m', 'wifi-ofdm-like', 'wlan', 'Wi-Fi OFDM 20 MHz', 2_437_000_000, 16_600_000, 30_000_000, 'ofdm-channel', 'csma-bursts', WIFI_SOURCE, { subcarrierSpacingHz: 312_500 }, { carrierRasterHz: 5_000_000 }),
  scenario('wifi-ofdm-40m', 'wifi-ofdm-like', 'wlan', 'Wi-Fi OFDM 40 MHz', 5_190_000_000, 36_600_000, 60_000_000, 'ofdm-channel', 'csma-bursts', WIFI_SOURCE, { subcarrierSpacingHz: 312_500 }, { carrierRasterHz: 5_000_000 }),
  scenario('wifi-ofdm-80m', 'wifi-ofdm-like', 'wlan', 'Wi-Fi OFDM 80 MHz', 5_210_000_000, 76_600_000, 100_000_000, 'ofdm-channel', 'csma-bursts', WIFI_SOURCE, { subcarrierSpacingHz: 312_500 }, { carrierRasterHz: 5_000_000 }),

  scenario('bluetooth-classic-connected', 'bluetooth-classic-like', 'bluetooth', 'Bluetooth BR/EDR connected hopping', 2_441_000_000, 79_000_000, 84_000_000, 'classic-hop', 'classic-slots', BLUETOOTH_SOURCE, { channelWidthHz: 1_000_000, slotSeconds: 0.000625, hopRateHz: 1_600 }, { carrierRasterHz: 1_000_000 }),
  scenario('bluetooth-le-advertising', 'bluetooth-le-like', 'bluetooth', 'Bluetooth LE primary advertising', 2_441_000_000, 80_000_000, 84_000_000, 'ble-advertising', 'ble-advertising-events', BLUETOOTH_SOURCE, {
    channelWidthHz: 2_000_000,
    advertisingIntervalSeconds: 0.02,
    // Scenario schedule: start-to-start spacing for the three primary-channel
    // packets. This is deliberately separate from their on-air duration.
    packetSpacingSeconds: 0.0015,
    // Full-length legacy LE 1M advertising packet: 1-byte preamble + 4-byte
    // access address + 2-byte header + 37-byte payload + 3-byte CRC = 376 bits.
    packetDurationSeconds: 0.000376,
  }, { carrierRasterHz: 2_000_000 }),

  scenario('unknown-narrow-fsk', 'unknown-signal', 'unknown', 'Proprietary narrow FSK hard negative', 433_920_000, 45_000, 500_000, 'fsk-pair', 'fsk-steady', TINYSA_SOURCE, { deviationHz: 18_000 }),
  scenario('unknown-chirp', 'unknown-signal', 'unknown', 'Swept chirp hard negative', 915_000_000, 5_000_000, 10_000_000, 'chirp', 'chirp-sweep', TINYSA_SOURCE, { chirpPeriodSeconds: 0.004 }),
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
  // cells around the 79 MHz raster. With an 84 MHz span, nearly every cell is
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
  scenario('unknown-generic-tdd-ofdm-10m', 'unknown-signal', 'unknown', 'Generic TDD OFDM exactly matching LTE UL/DL configuration 0 scalar power', 2_595_000_000, 9_000_000, 20_000_000, 'ofdm-channel', 'lte-tdd-pattern', TINYSA_SOURCE, {
    subcarrierSpacingHz: 15_000, subframeSeconds: 0.001, ulDlConfiguration: 0,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'lte-tdd-like'] }),
  scenario('unknown-generic-ofdm-80m', 'unknown-signal', 'unknown', 'Generic 80 MHz OFDM exactly matching the Wi-Fi scalar projection', 5_210_000_000, 76_600_000, 100_000_000, 'ofdm-channel', 'csma-bursts', TINYSA_SOURCE, {
    subcarrierSpacingHz: 312_500,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'wifi-ofdm-like'] }),
  scenario('unknown-proprietary-dsss-22m', 'unknown-signal', 'unknown', 'Proprietary 22 MHz DSSS exactly matching the HR-DSSS scalar projection', 2_437_000_000, 22_000_000, 30_000_000, 'dsss-channel', 'csma-bursts', TINYSA_SOURCE, {
    chipRateHz: 11_000_000,
  }, { disclosure: exactScalarEquivalenceDisclosure, allowedObservableClasses: ['unknown-signal', 'wifi-hr-dsss-like'] }),
]);

const scenarioById = new Map(canonicalClassificationScenarios.map((value) => [value.id, value]));
if (scenarioById.size !== canonicalClassificationScenarios.length) throw new Error('Canonical classification corpus contains duplicate scenario IDs');

export const DEFAULT_CANONICAL_INSTRUMENT: Omit<CanonicalInstrumentConfiguration, 'lookIndex'> = Object.freeze({
  points: 450,
  actualRbwHz: 100_000,
  sweepTimeSeconds: 0.05,
  zeroSpanPoints: 450,
  zeroSpanSamplePeriodSeconds: 1 / 9_000,
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
  const powerDbm = frequencyHz.map((frequency, index) => {
    const timeSeconds = configuration.lookIndex * configuration.sweepTimeSeconds + index * configuration.sweepTimeSeconds / Math.max(1, configuration.points - 1);
    const relativeSignalDb = spectrumRelativePowerDb(scenario, frequency, timeSeconds, configuration);
    const noiseDbm = configuration.noiseFloorDbm + periodogramNoiseDb(index, configuration.lookIndex, configuration.seed);
    if (!Number.isFinite(relativeSignalDb)) return noiseDbm;
    return combineDbm(noiseDbm, configuration.noiseFloorDbm + configuration.snrDb + relativeSignalDb);
  });
  const zeroSpanPowerDbm = Array.from({ length: configuration.zeroSpanPoints }, (_, index) => {
    const timeSeconds = (configuration.lookIndex * configuration.zeroSpanPoints + index) * configuration.zeroSpanSamplePeriodSeconds;
    const relativeSignalDb = envelopeRelativePowerDb(
      scenario,
      timeSeconds,
      configuration.zeroSpanFrequencyHz ?? scenario.centerHz,
      configuration,
    );
    const noiseDbm = configuration.noiseFloorDbm + periodogramNoiseDb(index, configuration.lookIndex + 10_000, configuration.seed ^ 0x68bc21eb);
    if (!Number.isFinite(relativeSignalDb)) return noiseDbm;
    return combineDbm(noiseDbm, configuration.noiseFloorDbm + configuration.snrDb + relativeSignalDb);
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
    zeroSpanFrequencyHz: configuration.zeroSpanFrequencyHz ?? scenario.centerHz,
    zeroSpanPowerDbm,
    zeroSpanSamplePeriodSeconds: configuration.zeroSpanSamplePeriodSeconds,
    source: structuredClone(scenario.source),
    disclosure: scenario.disclosure,
  };
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
    source: Object.freeze({ ...source }),
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
      const center = bleAdvertisingCenter(
        timeSeconds,
        requiredParameter(scenario, 'advertisingIntervalSeconds'),
        requiredParameter(scenario, 'packetSpacingSeconds'),
        requiredParameter(scenario, 'packetDurationSeconds'),
        configuration.seed,
      );
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
    case 'sinusoidal-am': return receiverFilteredAmPowerDb(scenario, timeSeconds, tuneFrequencyHz, configuration.actualRbwHz);
    case 'receiver-filtered-fm': return receiverFilteredFmPowerDb(scenario, timeSeconds, tuneFrequencyHz, configuration.actualRbwHz);
    case 'one-of-eight-tdma': {
      return gsmTrafficActive(scenario, timeSeconds) ? 0 : Number.NEGATIVE_INFINITY;
    }
    case 'continuous-gsm-loaded': return -0.35 + 0.25 * deterministicTexture(timeSeconds * 1_733, configuration.seed);
    case 'continuous-ofdm': return -0.7 + 0.55 * deterministicTexture(timeSeconds * 2_000, configuration.seed);
    case 'lte-tdd-pattern': {
      return lteTddDownlinkActive(scenario, timeSeconds)
        ? -0.5 + 0.4 * deterministicTexture(timeSeconds * 2_000, configuration.seed)
        : Number.NEGATIVE_INFINITY;
    }
    case 'nr-tdd-pattern': {
      return nrTddDownlinkActive(scenario, timeSeconds)
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
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - hopCenterHz, Math.max(configuration.actualRbwHz, requiredParameter(scenario, 'channelWidthHz')));
      return classicSlotActive(timeSeconds) && receiverResponseDb > -60
        ? -0.4 + 0.25 * deterministicTexture(index, configuration.seed) + receiverResponseDb
        : Number.NEGATIVE_INFINITY;
    }
    case 'ble-advertising-events': {
      const interval = requiredParameter(scenario, 'advertisingIntervalSeconds');
      const packetCenterHz = bleAdvertisingCenter(
        timeSeconds,
        interval,
        requiredParameter(scenario, 'packetSpacingSeconds'),
        requiredParameter(scenario, 'packetDurationSeconds'),
        configuration.seed,
      );
      if (packetCenterHz === undefined) return Number.NEGATIVE_INFINITY;
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - packetCenterHz, Math.max(configuration.actualRbwHz, requiredParameter(scenario, 'channelWidthHz')));
      return receiverResponseDb > -60 ? -0.35 + receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'stationary-bursts': {
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - scenario.centerHz, Math.max(configuration.actualRbwHz, requiredParameter(scenario, 'channelWidthHz')));
      return periodicBurstActive(timeSeconds, requiredParameter(scenario, 'burstPeriodSeconds'), requiredParameter(scenario, 'burstDuty'))
        && receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'simultaneous-raster-fixed-tune': {
      const receiverResponseDb = combineRelativeDb(rasterCenters(scenario).map((centerHz) =>
        gaussianFilterDb(tuneFrequencyHz - centerHz, Math.max(configuration.actualRbwHz, requiredParameter(scenario, 'channelWidthHz')))));
      return receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'interleaved-fixed-tune': {
      const centerHz = interleavedCenter(scenario, configuration.lookIndex);
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - centerHz, Math.max(configuration.actualRbwHz, requiredParameter(scenario, 'channelWidthHz')));
      return receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'proprietary-fhss-fixed-tune': {
      const centerHz = proprietaryFhssCenter(scenario, configuration.lookIndex, configuration.seed);
      const receiverResponseDb = gaussianFilterDb(tuneFrequencyHz - centerHz, Math.max(configuration.actualRbwHz, requiredParameter(scenario, 'channelWidthHz')));
      return receiverResponseDb > -60 ? receiverResponseDb : Number.NEGATIVE_INFINITY;
    }
    case 'fsk-steady': return -0.4 + 0.25 * Math.sin(2 * Math.PI * 1_700 * timeSeconds);
    case 'chirp-sweep': return -0.8 + 0.7 * Math.sin(2 * Math.PI * 250 * timeSeconds);
    case 'multitone-fixed-tune': {
      const receiverResponseDb = combineRelativeDb(multitoneOffsets(scenario).map((lineOffsetHz, index) =>
        multitoneLevelDb(scenario, index) + gaussianFilterDb(tuneFrequencyHz - (scenario.centerHz + lineOffsetHz), configuration.actualRbwHz)));
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
    case 'lte-tdd-pattern': return lteTddDownlinkActive(scenario, timeSeconds);
    case 'nr-tdd-pattern': return nrTddDownlinkActive(scenario, timeSeconds);
    case 'csma-bursts': return csmaTrafficActive(timeSeconds, seed);
    default: return true;
  }
}

function gsmTrafficActive(scenario: CanonicalClassificationScenario, timeSeconds: number): boolean {
  const slot = requiredParameter(scenario, 'slotSeconds');
  return Math.floor(timeSeconds / slot) % 8 === 0;
}

function lteTddDownlinkActive(scenario: CanonicalClassificationScenario, timeSeconds: number): boolean {
  const configurationIndex = requiredParameter(scenario, 'ulDlConfiguration');
  if (configurationIndex !== 0) throw new Error(`${scenario.id} supports only LTE UL/DL configuration 0`);
  const subframe = requiredParameter(scenario, 'subframeSeconds');
  const index = Math.floor(timeSeconds / subframe) % 10;
  // TS 36.211 Table 4.2-2 configuration 0: D S U U U D S U U U.
  // This coarse downlink observation treats S as active DwPTS energy and does
  // not model the DwPTS/GP/UpPTS symbol split.
  return 'DSUUUDSUUU'[index] !== 'U';
}

function nrTddDownlinkActive(scenario: CanonicalClassificationScenario, timeSeconds: number): boolean {
  const slot = requiredParameter(scenario, 'slotSeconds');
  const index = Math.floor(timeSeconds / slot) % 10;
  // This is an explicitly heuristic 7-DL/3-UL slot pattern, not an inference
  // that every NR deployment uses one standardized configuration.
  return index <= 6;
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
  timeSeconds: number,
  intervalSeconds: number,
  packetSpacingSeconds: number,
  packetDurationSeconds: number,
  seed: number,
): number | undefined {
  if (packetDurationSeconds <= 0 || packetDurationSeconds > packetSpacingSeconds) {
    throw new Error('BLE advertising packet duration must be positive and no longer than the packet start spacing');
  }
  const starts = bleAdvertisingEventStartsThrough(timeSeconds, intervalSeconds, seed);
  const event = greatestIndexAtOrBefore(starts, timeSeconds);
  if (event < 0) return undefined;
  const eventPhase = timeSeconds - starts[event]!;
  if (eventPhase < 0) return undefined;
  const packet = Math.floor(eventPhase / packetSpacingSeconds);
  if (packet < 0 || packet > 2) return undefined;
  const packetPhase = eventPhase - packet * packetSpacingSeconds;
  if (packetPhase >= packetDurationSeconds) return undefined;
  return [2_402_000_000, 2_426_000_000, 2_480_000_000][packet];
}

const bleEventStartCache = new Map<string, number[]>();

function bleAdvertisingEventStartsThrough(timeSeconds: number, intervalSeconds: number, seed: number): readonly number[] {
  if (!(intervalSeconds > 0)) throw new Error('BLE advertising interval must be positive');
  const key = `${intervalSeconds}:${seed}`;
  const starts = bleEventStartCache.get(key) ?? [0];
  while (starts.at(-1)! <= timeSeconds) {
    const event = starts.length - 1;
    const advertisingDelaySeconds = pseudoUniform(event, 43, seed) * 0.010;
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
  if (value.actualRbwHz <= 0 || value.sweepTimeSeconds <= 0 || value.zeroSpanSamplePeriodSeconds <= 0) throw new Error('Canonical acquisition intervals and RBW must be positive');
  if (!Number.isInteger(value.seed) || !Number.isInteger(value.lookIndex) || value.lookIndex < 0) throw new Error('Canonical seed/look index must be non-negative integers');
}
