import type { SynthesizedSignalProfile, WaveformDescriptor, WaveformProjection } from './contracts.js';
import { MAX_MEASUREMENT_FREQUENCY_HZ } from './contracts.js';
import { sourceBasis } from './source-provenance.js';

/**
 * Custom wideband waveform constraint model — LTE / 5G NR / Wi-Fi.
 *
 * A declarative parameter lattice per standard: every operator-relevant spec
 * parameter is selectable and defaults to 'auto'; each selection narrows the
 * remaining legal options to exactly what the standard allows, and 'auto'
 * resolves to a spec-valid default. The numeric tables below were deep-researched
 * and independently re-derived against 3GPP TS 36.101/36.104/36.141/36.211/36.213,
 * TS 38.101-1/-2/38.104/38.141 and IEEE 802.11-2020 / 802.11ax-2021 (including
 * corrections: LTE 256QAM MCS split at index 4, NR 60 kHz @ 100 MHz = 135 RB,
 * NR TDD 0.5 ms not valid at 15 kHz, VHT 80 MHz MCS9/Nss6 hole, no HE RU gate
 * on QAM order).
 *
 * Fidelity is the generator's OBSERVABLE projection (spectrum envelope +
 * complex-I/Q tone bank), not bit-exact conformance. Each parameter is tagged:
 *   observable   — the generator honors it exactly,
 *   approximated — configurable and shaping, not exact at this fidelity,
 *   metadata     — recorded in the descriptor, no baseband effect.
 *
 * The resolved output is an ordinary catalog descriptor for one of the three
 * custom profile ids, flowing through the existing standards-engineering
 * generator unchanged.
 */

export type CustomWaveformStandard = 'lte' | 'nr' | 'wifi';
export const CUSTOM_WAVEFORM_PROFILES = ['custom-lte', 'custom-nr', 'custom-wifi'] as const;
export type CustomWaveformProfile = typeof CUSTOM_WAVEFORM_PROFILES[number];

export function isCustomWaveformProfile(profile: SynthesizedSignalProfile): profile is CustomWaveformProfile {
  return CUSTOM_WAVEFORM_PROFILES.some((candidate) => candidate === profile);
}
export function customWaveformStandard(profile: CustomWaveformProfile): CustomWaveformStandard {
  return profile === 'custom-lte' ? 'lte' : profile === 'custom-nr' ? 'nr' : 'wifi';
}
export function customWaveformProfileId(standard: CustomWaveformStandard): CustomWaveformProfile {
  return standard === 'lte' ? 'custom-lte' : standard === 'nr' ? 'custom-nr' : 'custom-wifi';
}

/** Pinned selections; any omitted key is 'auto'. Values are option strings. */
export type CustomWaveformSelections = Readonly<Record<string, string>>;
/** A parameter's effective value after resolution (pinned or auto-resolved). */
export type ResolvedSelections = ReadonlyMap<string, string>;

export type CustomParameterTier = 'observable' | 'approximated' | 'metadata';
export interface CustomParameterDefinition {
  readonly key: string;
  readonly label: string;
  readonly tier: CustomParameterTier;
  readonly specRef: string;
  /** Legal non-auto options under the EARLIER (already-resolved) selections. */
  readonly options: (resolved: ResolvedSelections) => readonly string[];
  /** The value 'auto' resolves to under the earlier selections (must be legal). */
  readonly resolve: (resolved: ResolvedSelections) => string;
}

// ---------------------------------------------------------------------------
// LTE — 3GPP TS 36.101/36.104 Table 5.6-1, TS 36.141 §6.1.1, TS 36.211, 36.213
// ---------------------------------------------------------------------------

/** Channel bandwidth (MHz) -> transmission bandwidth configuration N_RB. */
export const LTE_BANDWIDTH_TO_RB: Readonly<Record<string, number>> = Object.freeze({
  '1.4': 6, '3': 15, '5': 25, '10': 50, '15': 75, '20': 100,
});
/** E-UTRA test model -> pinned PDSCH modulation (TS 36.141 §6.1.1). */
export const LTE_TEST_MODEL_MODULATION: Readonly<Record<string, 'qpsk' | '16qam' | '64qam' | '256qam'>> = Object.freeze({
  'E-TM1.1': 'qpsk', 'E-TM1.2': 'qpsk', 'E-TM2': '64qam', 'E-TM2a': '256qam',
  'E-TM3.1': '64qam', 'E-TM3.1a': '256qam', 'E-TM3.2': '16qam', 'E-TM3.3': 'qpsk',
});
/** Representative operating bands: duplex + downlink range (TS 36.101 Table 5.5-1). */
export const LTE_BANDS: Readonly<Record<string, { duplex: 'fdd' | 'tdd'; dlLowMHz: number; dlHighMHz: number }>> = Object.freeze({
  '1': { duplex: 'fdd', dlLowMHz: 2110, dlHighMHz: 2170 },
  '2': { duplex: 'fdd', dlLowMHz: 1930, dlHighMHz: 1990 },
  '3': { duplex: 'fdd', dlLowMHz: 1805, dlHighMHz: 1880 },
  '5': { duplex: 'fdd', dlLowMHz: 869, dlHighMHz: 894 },
  '7': { duplex: 'fdd', dlLowMHz: 2620, dlHighMHz: 2690 },
  '8': { duplex: 'fdd', dlLowMHz: 925, dlHighMHz: 960 },
  '20': { duplex: 'fdd', dlLowMHz: 791, dlHighMHz: 821 },
  '28': { duplex: 'fdd', dlLowMHz: 758, dlHighMHz: 803 },
  '38': { duplex: 'tdd', dlLowMHz: 2570, dlHighMHz: 2620 },
  '40': { duplex: 'tdd', dlLowMHz: 2300, dlHighMHz: 2400 },
  '41': { duplex: 'tdd', dlLowMHz: 2496, dlHighMHz: 2690 },
  '42': { duplex: 'tdd', dlLowMHz: 3400, dlHighMHz: 3600 },
  '43': { duplex: 'tdd', dlLowMHz: 3600, dlHighMHz: 3800 },
});
/**
 * MCS index -> modulation, 256QAM-capable table (TS 36.213 Table 7.1.7.1-1A,
 * corrected split: QPSK 0-3, 16QAM 4-10, 64QAM 11-19, 256QAM 20-28).
 */
export function lteMcsModulation(mcs: number): 'qpsk' | '16qam' | '64qam' | '256qam' {
  if (mcs <= 3) return 'qpsk';
  if (mcs <= 10) return '16qam';
  if (mcs <= 19) return '64qam';
  return '256qam';
}
const LTE_TDD_CONFIGS = ['0', '1', '2', '3', '4', '5', '6'] as const;
const LTE_SSF_NORMAL = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const LTE_SSF_EXTENDED = ['0', '1', '2', '3', '4', '5', '6'] as const;

const LTE_PARAMETERS: readonly CustomParameterDefinition[] = [
  {
    key: 'operatingBand', label: 'Operating band', tier: 'metadata',
    specRef: 'TS 36.101 Table 5.5-1',
    options: () => Object.keys(LTE_BANDS),
    resolve: () => '3',
  },
  {
    key: 'duplexMode', label: 'Duplex mode', tier: 'observable',
    specRef: 'TS 36.211 §4.1-4.2; TS 36.101 Table 5.5-1',
    options: (r) => [LTE_BANDS[r.get('operatingBand')!]!.duplex],
    resolve: (r) => LTE_BANDS[r.get('operatingBand')!]!.duplex,
  },
  {
    key: 'channelBandwidthMHz', label: 'Channel bandwidth (MHz)', tier: 'observable',
    specRef: 'TS 36.101 Table 5.6-1',
    options: () => Object.keys(LTE_BANDWIDTH_TO_RB),
    resolve: () => '10',
  },
  {
    key: 'resourceBlocks', label: 'Resource blocks (N_RB)', tier: 'observable',
    specRef: 'TS 36.101 Table 5.6-1 (one-to-one with bandwidth)',
    options: (r) => [String(LTE_BANDWIDTH_TO_RB[r.get('channelBandwidthMHz')!]!)],
    resolve: (r) => String(LTE_BANDWIDTH_TO_RB[r.get('channelBandwidthMHz')!]!),
  },
  {
    key: 'testModel', label: 'Test model (E-TM)', tier: 'approximated',
    specRef: 'TS 36.141 §6.1.1',
    options: () => ['none', ...Object.keys(LTE_TEST_MODEL_MODULATION)],
    resolve: () => 'none',
  },
  {
    key: 'cyclicPrefix', label: 'Cyclic prefix', tier: 'approximated',
    specRef: 'TS 36.211 Table 6.2.3-1 (E-TM requires normal CP)',
    options: (r) => (r.get('testModel') !== 'none' ? ['normal'] : ['normal', 'extended']),
    resolve: () => 'normal',
  },
  {
    key: 'subcarrierSpacingKHz', label: 'Subcarrier spacing (kHz)', tier: 'observable',
    specRef: 'TS 36.211 Table 6.2.3-1; §6.12 (7.5 kHz MBSFN-dedicated, extended CP only)',
    options: (r) => (r.get('cyclicPrefix') === 'extended' && r.get('testModel') === 'none' ? ['15', '7.5'] : ['15']),
    resolve: () => '15',
  },
  {
    key: 'modulation', label: 'PDSCH modulation', tier: 'observable',
    specRef: 'TS 36.211 §7.1; TS 36.141 §6.1.1 (test model pins it)',
    options: (r) => {
      const tm = r.get('testModel')!;
      return tm !== 'none' ? [LTE_TEST_MODEL_MODULATION[tm]!] : ['ofdm-mixed', 'qpsk', '16qam', '64qam', '256qam'];
    },
    resolve: (r) => {
      const tm = r.get('testModel')!;
      return tm !== 'none' ? LTE_TEST_MODEL_MODULATION[tm]! : 'ofdm-mixed';
    },
  },
  {
    key: 'mcsIndex', label: 'MCS index (256QAM table)', tier: 'metadata',
    specRef: 'TS 36.213 Table 7.1.7.1-1A (QPSK 0-3, 16QAM 4-10, 64QAM 11-19, 256QAM 20-28)',
    options: (r) => {
      const modulation = r.get('modulation')!;
      const all = Array.from({ length: 29 }, (_, index) => String(index));
      if (modulation === 'ofdm-mixed') return all;
      return all.filter((index) => lteMcsModulation(Number(index)) === modulation);
    },
    resolve: (r) => {
      const modulation = r.get('modulation')!;
      return modulation === 'qpsk' ? '0' : modulation === '16qam' ? '4' : modulation === '256qam' ? '20' : '11';
    },
  },
  {
    key: 'tddConfig', label: 'TDD UL-DL configuration', tier: 'approximated',
    specRef: 'TS 36.211 Table 4.2-2 (rendered with the admitted engineering TDD schedule)',
    options: (r) => (r.get('duplexMode') === 'tdd' ? [...LTE_TDD_CONFIGS] : ['n/a']),
    resolve: (r) => (r.get('duplexMode') === 'tdd' ? '0' : 'n/a'),
  },
  {
    key: 'specialSubframeConfig', label: 'Special subframe configuration', tier: 'approximated',
    specRef: 'TS 36.211 Table 4.2-1 (normal CP 0-9; extended CP 0-6)',
    options: (r) => {
      if (r.get('duplexMode') !== 'tdd') return ['n/a'];
      return r.get('cyclicPrefix') === 'extended' ? [...LTE_SSF_EXTENDED] : [...LTE_SSF_NORMAL];
    },
    resolve: (r) => (r.get('duplexMode') === 'tdd' ? '7' : 'n/a'),
  },
  {
    key: 'antennaPorts', label: 'Antenna ports', tier: 'approximated',
    specRef: 'TS 36.211 §6.10 (E-TM uses port 0)',
    options: (r) => (r.get('testModel') !== 'none' ? ['1'] : ['1', '2', '4']),
    resolve: () => '1',
  },
  {
    key: 'cellId', label: 'Cell identity (N_ID)', tier: 'metadata',
    specRef: 'TS 36.211 §6.11 (0..503; E-TM uses 0)',
    options: (r) => (r.get('testModel') !== 'none' ? ['0'] : Array.from({ length: 504 }, (_, index) => String(index))),
    resolve: () => '0',
  },
  {
    key: 'transmissionMode', label: 'Transmission mode', tier: 'metadata',
    specRef: 'TS 36.213 §7.1 (spatial TMs need >= 2 ports)',
    options: (r) => {
      const ports = Number(r.get('antennaPorts'));
      const all = ['TM1', 'TM2', 'TM3', 'TM4', 'TM5', 'TM6', 'TM7', 'TM8', 'TM9', 'TM10'];
      return ports >= 2 ? all : ['TM1', 'TM7'];
    },
    resolve: () => 'TM1',
  },
];

// ---------------------------------------------------------------------------
// 5G NR — TS 38.101-1/-2 Table 5.3.2-1 (exact, blanks disallowed), TS 38.141
// ---------------------------------------------------------------------------

/** FR1 max N_RB per (SCS kHz -> bandwidth MHz); missing key = disallowed pair. */
export const NR_FR1_RB: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  '15': { '5': 25, '10': 52, '15': 79, '20': 106, '25': 133, '30': 160, '40': 216, '50': 270 },
  '30': { '5': 11, '10': 24, '15': 38, '20': 51, '25': 65, '30': 78, '40': 106, '50': 133, '60': 162, '70': 189, '80': 217, '90': 245, '100': 273 },
  '60': { '10': 11, '15': 18, '20': 24, '25': 31, '30': 38, '40': 51, '50': 65, '60': 79, '70': 93, '80': 107, '90': 121, '100': 135 },
});
/** FR2 max N_RB per (SCS kHz -> bandwidth MHz). */
export const NR_FR2_RB: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  '60': { '50': 66, '100': 132, '200': 264 },
  '120': { '50': 32, '100': 66, '200': 132, '400': 264 },
});
/** NR test model -> pinned PDSCH modulation (TS 38.141-1/-2 §4.9.2). */
export const NR_TEST_MODEL_MODULATION: Readonly<Record<string, { modulation: 'qpsk' | '16qam' | '64qam' | '256qam' | '1024qam'; fr: 'FR1' | 'FR2' }>> = Object.freeze({
  'NR-FR1-TM1.1': { modulation: 'qpsk', fr: 'FR1' }, 'NR-FR1-TM1.2': { modulation: 'qpsk', fr: 'FR1' },
  'NR-FR1-TM2': { modulation: '64qam', fr: 'FR1' }, 'NR-FR1-TM2a': { modulation: '256qam', fr: 'FR1' },
  'NR-FR1-TM2b': { modulation: '1024qam', fr: 'FR1' },
  'NR-FR1-TM3.1': { modulation: '64qam', fr: 'FR1' }, 'NR-FR1-TM3.1a': { modulation: '256qam', fr: 'FR1' },
  'NR-FR1-TM3.1b': { modulation: '1024qam', fr: 'FR1' },
  'NR-FR1-TM3.2': { modulation: '16qam', fr: 'FR1' }, 'NR-FR1-TM3.3': { modulation: 'qpsk', fr: 'FR1' },
  'NR-FR2-TM1.1': { modulation: 'qpsk', fr: 'FR2' }, 'NR-FR2-TM2': { modulation: '64qam', fr: 'FR2' },
  'NR-FR2-TM2a': { modulation: '256qam', fr: 'FR2' },
  'NR-FR2-TM3.1': { modulation: '64qam', fr: 'FR2' }, 'NR-FR2-TM3.1a': { modulation: '256qam', fr: 'FR2' },
});
/** Representative bands: FR + duplex + representative DL center (metadata). */
export const NR_BANDS: Readonly<Record<string, { fr: 'FR1' | 'FR2'; duplex: 'fdd' | 'tdd'; centerMHz: number }>> = Object.freeze({
  n1: { fr: 'FR1', duplex: 'fdd', centerMHz: 2140 },
  n3: { fr: 'FR1', duplex: 'fdd', centerMHz: 1842.5 },
  n7: { fr: 'FR1', duplex: 'fdd', centerMHz: 2655 },
  n28: { fr: 'FR1', duplex: 'fdd', centerMHz: 780.5 },
  n40: { fr: 'FR1', duplex: 'tdd', centerMHz: 2350 },
  n41: { fr: 'FR1', duplex: 'tdd', centerMHz: 2593 },
  n77: { fr: 'FR1', duplex: 'tdd', centerMHz: 3700 },
  n78: { fr: 'FR1', duplex: 'tdd', centerMHz: 3500 },
  n79: { fr: 'FR1', duplex: 'tdd', centerMHz: 4700 },
  n257: { fr: 'FR2', duplex: 'tdd', centerMHz: 28_000 },
  n258: { fr: 'FR2', duplex: 'tdd', centerMHz: 25_875 },
  n260: { fr: 'FR2', duplex: 'tdd', centerMHz: 38_500 },
  n261: { fr: 'FR2', duplex: 'tdd', centerMHz: 27_925 },
});
/** TDD pattern periodicity (ms) -> allowed reference SCS kHz (corrected: 0.5 ms excludes 15 kHz). */
export const NR_TDD_PERIODICITY_SCS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '0.5': ['30', '60', '120'], '0.625': ['120'], '1': ['15', '30', '60', '120'],
  '1.25': ['60', '120'], '2': ['15', '30', '60', '120'], '2.5': ['30', '60', '120'],
  '5': ['15', '30', '60', '120'], '10': ['15', '30', '60', '120'],
});

function nrRbTable(fr: 'FR1' | 'FR2'): Readonly<Record<string, Readonly<Record<string, number>>>> {
  return fr === 'FR1' ? NR_FR1_RB : NR_FR2_RB;
}

const NR_PARAMETERS: readonly CustomParameterDefinition[] = [
  {
    key: 'frequencyRange', label: 'Frequency range', tier: 'observable',
    specRef: 'TS 38.101-1 / 38.101-2',
    options: () => ['FR1', 'FR2'],
    resolve: () => 'FR1',
  },
  {
    key: 'operatingBand', label: 'Operating band', tier: 'metadata',
    specRef: 'TS 38.101-1/-2 Table 5.3.5-1 (band fixes duplex; hard SCSxBW lattice from Table 5.3.2-1)',
    options: (r) => Object.keys(NR_BANDS).filter((band) => NR_BANDS[band]!.fr === r.get('frequencyRange')),
    resolve: (r) => (r.get('frequencyRange') === 'FR2' ? 'n257' : 'n78'),
  },
  {
    key: 'subcarrierSpacingKHz', label: 'Subcarrier spacing (kHz)', tier: 'observable',
    specRef: 'TS 38.101-1 Table 5.3.2-1 (FR1: 15/30/60); 38.101-2 (FR2: 60/120)',
    options: (r) => Object.keys(nrRbTable(r.get('frequencyRange') as 'FR1' | 'FR2')),
    resolve: (r) => (r.get('frequencyRange') === 'FR2' ? '120' : '30'),
  },
  {
    key: 'channelBandwidthMHz', label: 'Channel bandwidth (MHz)', tier: 'observable',
    specRef: 'TS 38.101-1/-2 Table 5.3.2-1 (blank cells are disallowed)',
    options: (r) => Object.keys(nrRbTable(r.get('frequencyRange') as 'FR1' | 'FR2')[r.get('subcarrierSpacingKHz')!] ?? {}),
    resolve: (r) => {
      const cells = nrRbTable(r.get('frequencyRange') as 'FR1' | 'FR2')[r.get('subcarrierSpacingKHz')!]!;
      if (r.get('frequencyRange') === 'FR2') return '100';
      return cells['60'] !== undefined ? '60' : '20';
    },
  },
  {
    key: 'resourceBlocks', label: 'Resource blocks (N_RB)', tier: 'observable',
    specRef: 'TS 38.101-1/-2 Table 5.3.2-1 (exact cell)',
    options: (r) => {
      const cell = nrRbTable(r.get('frequencyRange') as 'FR1' | 'FR2')[r.get('subcarrierSpacingKHz')!]?.[r.get('channelBandwidthMHz')!];
      return cell === undefined ? [] : [String(cell)];
    },
    resolve: (r) => String(nrRbTable(r.get('frequencyRange') as 'FR1' | 'FR2')[r.get('subcarrierSpacingKHz')!]![r.get('channelBandwidthMHz')!]!),
  },
  {
    key: 'duplexMode', label: 'Duplex mode', tier: 'observable',
    specRef: 'TS 38.101-1/-2 Table 5.3.5-1 (band fixes duplex)',
    options: (r) => [NR_BANDS[r.get('operatingBand')!]!.duplex],
    resolve: (r) => NR_BANDS[r.get('operatingBand')!]!.duplex,
  },
  {
    key: 'testModel', label: 'Test model (NR-TM)', tier: 'approximated',
    specRef: 'TS 38.141-1/-2 §4.9.2',
    options: (r) => ['none', ...Object.keys(NR_TEST_MODEL_MODULATION).filter((tm) => NR_TEST_MODEL_MODULATION[tm]!.fr === r.get('frequencyRange'))],
    resolve: () => 'none',
  },
  {
    key: 'pdschModulation', label: 'PDSCH modulation', tier: 'observable',
    specRef: 'TS 38.211 Table 7.3.1.2-1 (1024QAM FR1 only; FR2 max 256QAM); TS 38.141 (TM pins it)',
    options: (r) => {
      const tm = r.get('testModel')!;
      if (tm !== 'none') return [NR_TEST_MODEL_MODULATION[tm]!.modulation];
      const base = ['ofdm-mixed', 'qpsk', '16qam', '64qam', '256qam'];
      return r.get('frequencyRange') === 'FR1' ? [...base, '1024qam'] : base;
    },
    resolve: (r) => {
      const tm = r.get('testModel')!;
      return tm !== 'none' ? NR_TEST_MODEL_MODULATION[tm]!.modulation : 'ofdm-mixed';
    },
  },
  {
    key: 'cyclicPrefix', label: 'Cyclic prefix', tier: 'approximated',
    specRef: 'TS 38.211 Table 4.2-1 (extended only at 60 kHz)',
    options: (r) => (r.get('subcarrierSpacingKHz') === '60' ? ['normal', 'extended'] : ['normal']),
    resolve: () => 'normal',
  },
  {
    key: 'tddPeriodicityMs', label: 'TDD pattern periodicity (ms)', tier: 'approximated',
    specRef: 'TS 38.213 §11.1 (period must hold whole slots at the reference SCS; rendered with the admitted engineering TDD schedule)',
    options: (r) => {
      if (r.get('duplexMode') !== 'tdd') return ['n/a'];
      const scs = r.get('subcarrierSpacingKHz')!;
      return Object.keys(NR_TDD_PERIODICITY_SCS).filter((period) => NR_TDD_PERIODICITY_SCS[period]!.includes(scs));
    },
    resolve: (r) => (r.get('duplexMode') === 'tdd' ? '5' : 'n/a'),
  },
  {
    key: 'mcsTable', label: 'MCS table', tier: 'metadata',
    specRef: 'TS 38.214 Tables 5.1.3.1-1..-4 (256QAM needs table2/table4; 1024QAM needs table4, FR1 only)',
    options: (r) => {
      const modulation = r.get('pdschModulation')!;
      if (modulation === '1024qam') return ['table4-1024QAM'];
      if (modulation === '256qam') return ['table2-256QAM', 'table4-1024QAM'];
      const base = ['table1-64QAM', 'table2-256QAM', 'table3-lowSE'];
      return r.get('frequencyRange') === 'FR1' ? [...base, 'table4-1024QAM'] : base;
    },
    resolve: (r) => {
      const modulation = r.get('pdschModulation')!;
      if (modulation === '1024qam') return 'table4-1024QAM';
      if (modulation === '256qam') return 'table2-256QAM';
      return 'table1-64QAM';
    },
  },
  {
    key: 'antennaPortsLayers', label: 'Antenna ports / layers', tier: 'metadata',
    specRef: 'TS 38.214 §5.1 (single-stream observable projection)',
    options: () => ['1', '2', '4', '8'],
    resolve: () => '1',
  },
  {
    key: 'cellIdentityPCI', label: 'Physical cell identity', tier: 'metadata',
    specRef: 'TS 38.211 §7.4.2 (0..1007)',
    options: () => Array.from({ length: 1008 }, (_, index) => String(index)),
    resolve: () => '0',
  },
];

// ---------------------------------------------------------------------------
// Wi-Fi — IEEE 802.11-2020 Tables 17-5/19-6/21-5, 802.11ax-2021 Table 27-5
// ---------------------------------------------------------------------------

export interface WifiPhyDefinition {
  readonly spacingHz: number | undefined; // undefined = DSSS single carrier
  readonly bands: readonly string[];
  readonly bandwidths: readonly string[];
  readonly maxMcs: number | undefined; // undefined = DSSS rate set
  readonly maxNss: number;
  readonly modulationToken: WaveformProjection['modulation'];
}
export const WIFI_PHYS: Readonly<Record<string, WifiPhyDefinition>> = Object.freeze({
  '11b-HR-DSSS': { spacingHz: undefined, bands: ['2.4GHz'], bandwidths: ['20'], maxMcs: undefined, maxNss: 1, modulationToken: 'hr-dsss' },
  '11a-OFDM': { spacingHz: 312_500, bands: ['5GHz'], bandwidths: ['20'], maxMcs: 7, maxNss: 1, modulationToken: 'ofdm-mixed' },
  '11g-ERP-OFDM': { spacingHz: 312_500, bands: ['2.4GHz'], bandwidths: ['20'], maxMcs: 7, maxNss: 1, modulationToken: 'ofdm-mixed' },
  '11n-HT': { spacingHz: 312_500, bands: ['2.4GHz', '5GHz'], bandwidths: ['20', '40'], maxMcs: 7, maxNss: 4, modulationToken: 'ofdm-mixed' },
  '11ac-VHT': { spacingHz: 312_500, bands: ['5GHz'], bandwidths: ['20', '40', '80', '160'], maxMcs: 9, maxNss: 8, modulationToken: 'ofdm-mixed' },
  '11ax-HE': { spacingHz: 78_125, bands: ['2.4GHz', '5GHz', '6GHz'], bandwidths: ['20', '40', '80', '160'], maxMcs: 11, maxNss: 8, modulationToken: 'he-ofdm' },
});
/** (phy kind, bandwidth) -> used-tone count. Legacy 11a/g use 52; HT/VHT 56/114/242/484; HE 242/484/996/1992. */
export function wifiUsedTones(phy: string, bandwidthMHz: string): number {
  if (phy === '11a-OFDM' || phy === '11g-ERP-OFDM') return 52;
  if (phy === '11ax-HE') return ({ '20': 242, '40': 484, '80': 996, '160': 1992 })[bandwidthMHz]!;
  return ({ '20': 56, '40': 114, '80': 242, '160': 484 })[bandwidthMHz]!;
}
/** Per-stream MCS -> constellation (802.11-2020 / 802.11ax-2021). */
export function wifiMcsConstellation(mcs: number): string {
  if (mcs === 0) return 'BPSK';
  if (mcs <= 2) return 'QPSK';
  if (mcs <= 4) return '16-QAM';
  if (mcs <= 7) return '64-QAM';
  if (mcs <= 9) return '256-QAM';
  return '1024-QAM';
}
/**
 * VHT MCS/Nss exclusion holes (802.11-2020 §21.5, corrected to include the
 * 80 MHz MCS9/Nss6 hole). Returns true when the combination is NOT permitted.
 */
export function vhtExclusionHole(bandwidthMHz: string, mcs: number, nss: number): boolean {
  if (bandwidthMHz === '20' && mcs === 9) return nss !== 3 && nss !== 6;
  if (bandwidthMHz === '80' && mcs === 6) return nss === 3 || nss === 7;
  if (bandwidthMHz === '80' && mcs === 9) return nss === 6;
  if (bandwidthMHz === '160' && mcs === 9) return nss === 3;
  return false;
}
const WIFI_RU_BY_BANDWIDTH: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '20': ['full-band', 'RU26', 'RU52', 'RU106', 'RU242'],
  '40': ['full-band', 'RU26', 'RU52', 'RU106', 'RU242', 'RU484'],
  '80': ['full-band', 'RU26', 'RU52', 'RU106', 'RU242', 'RU484', 'RU996'],
  '160': ['full-band', 'RU26', 'RU52', 'RU106', 'RU242', 'RU484', 'RU996', 'RU2x996'],
});
const WIFI_DSSS_RATES = ['11M-CCK', '5.5M-CCK', '2M-DQPSK', '1M-DBPSK'] as const;

const WIFI_PARAMETERS: readonly CustomParameterDefinition[] = [
  {
    key: 'phyType', label: 'PHY generation', tier: 'observable',
    specRef: 'IEEE 802.11-2020 Clauses 15/17/19/21; 802.11ax-2021 Clause 27',
    options: () => Object.keys(WIFI_PHYS),
    resolve: () => '11ax-HE',
  },
  {
    key: 'band', label: 'Band', tier: 'metadata',
    specRef: '802.11-2020 Annex E (6 GHz is HE-only)',
    options: (r) => WIFI_PHYS[r.get('phyType')!]!.bands,
    resolve: (r) => {
      const bands = WIFI_PHYS[r.get('phyType')!]!.bands;
      return bands.includes('5GHz') ? '5GHz' : bands[0]!;
    },
  },
  {
    key: 'channelBandwidthMHz', label: 'Channel bandwidth (MHz)', tier: 'observable',
    specRef: '802.11-2020 Tables 17-5/19-6/21-5; 802.11ax Table 27-5 (40+ MHz not in 2.4 GHz here)',
    options: (r) => {
      const phy = WIFI_PHYS[r.get('phyType')!]!;
      return r.get('band') === '2.4GHz' ? phy.bandwidths.filter((bw) => bw === '20' || bw === '40') : phy.bandwidths;
    },
    resolve: (r) => {
      const legal = r.get('band') === '2.4GHz'
        ? WIFI_PHYS[r.get('phyType')!]!.bandwidths.filter((bw) => bw === '20' || bw === '40')
        : WIFI_PHYS[r.get('phyType')!]!.bandwidths;
      return legal.includes('80') ? '80' : legal[legal.length - 1]!;
    },
  },
  {
    key: 'spatialStreams', label: 'Spatial streams (Nss)', tier: 'approximated',
    specRef: '802.11-2020 §19.5/§21.5; 802.11ax §27.3',
    options: (r) => Array.from({ length: WIFI_PHYS[r.get('phyType')!]!.maxNss }, (_, index) => String(index + 1)),
    resolve: () => '1',
  },
  {
    key: 'mcsIndex', label: 'MCS index', tier: 'approximated',
    specRef: '802.11-2020 HT/VHT MCS tables (VHT holes incl. 80 MHz MCS9/Nss6); 802.11ax HE-MCS 0-11 (no RU gate on QAM order)',
    options: (r) => {
      const phy = WIFI_PHYS[r.get('phyType')!]!;
      if (phy.maxMcs === undefined) return [...WIFI_DSSS_RATES];
      const bandwidth = r.get('channelBandwidthMHz')!;
      const nss = Number(r.get('spatialStreams'));
      return Array.from({ length: phy.maxMcs + 1 }, (_, mcs) => mcs)
        .filter((mcs) => !(r.get('phyType') === '11ac-VHT' && vhtExclusionHole(bandwidth, mcs, nss)))
        .map(String);
    },
    resolve: (r) => {
      const phy = WIFI_PHYS[r.get('phyType')!]!;
      if (phy.maxMcs === undefined) return '11M-CCK';
      const bandwidth = r.get('channelBandwidthMHz')!;
      const nss = Number(r.get('spatialStreams'));
      for (let mcs = 7; mcs >= 0; mcs -= 1) {
        if (!(r.get('phyType') === '11ac-VHT' && vhtExclusionHole(bandwidth, mcs, nss))) return String(mcs);
      }
      return '0';
    },
  },
  {
    key: 'guardIntervalUs', label: 'Guard interval (µs)', tier: 'approximated',
    specRef: '802.11-2020 17.3.8.3/19.3.7 (0.8/0.4); 802.11ax 27.3.7 (0.8/1.6/3.2)',
    options: (r) => {
      const phy = r.get('phyType')!;
      if (phy === '11b-HR-DSSS') return ['n/a'];
      if (phy === '11ax-HE') return ['0.8', '1.6', '3.2'];
      if (phy === '11n-HT' || phy === '11ac-VHT') return ['0.8', '0.4'];
      return ['0.8'];
    },
    resolve: (r) => (r.get('phyType') === '11b-HR-DSSS' ? 'n/a' : '0.8'),
  },
  {
    key: 'ruAllocation', label: 'HE RU allocation', tier: 'approximated',
    specRef: '802.11ax §27.3.2.6 Tables 27-7/27-8 (HE only; every HE-MCS valid on every RU size)',
    options: (r) => (r.get('phyType') === '11ax-HE' ? WIFI_RU_BY_BANDWIDTH[r.get('channelBandwidthMHz')!]! : ['n/a']),
    resolve: (r) => (r.get('phyType') === '11ax-HE' ? 'full-band' : 'n/a'),
  },
  {
    key: 'channelNumber', label: 'Channel number', tier: 'metadata',
    specRef: '802.11-2020 Annex E channel plans',
    options: (r) => (r.get('band') === '2.4GHz' ? ['1', '6', '11'] : r.get('band') === '5GHz' ? ['36', '52', '100', '149'] : ['37', '69', '117']),
    resolve: (r) => (r.get('band') === '2.4GHz' ? '6' : r.get('band') === '5GHz' ? '36' : '37'),
  },
];

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export function customWaveformParameters(standard: CustomWaveformStandard): readonly CustomParameterDefinition[] {
  return standard === 'lte' ? LTE_PARAMETERS : standard === 'nr' ? NR_PARAMETERS : WIFI_PARAMETERS;
}

export interface ResolvedCustomParameter {
  readonly key: string;
  readonly label: string;
  readonly tier: CustomParameterTier;
  readonly specRef: string;
  /** The legal non-auto options under the resolved earlier selections. */
  readonly options: readonly string[];
  /** The effective value (pinned selection, or the auto resolution). */
  readonly value: string;
  /** True when the value came from an explicit selection rather than auto. */
  readonly pinned: boolean;
}

/**
 * Evaluate the lattice: walk parameters in declaration order; a pinned value
 * must be legal under the earlier resolved selections (else this throws with
 * the parameter and its legal set), and 'auto' takes the standard's default.
 * Deterministic and pure — the same selections always resolve identically.
 */
export function resolveCustomWaveform(
  standard: CustomWaveformStandard,
  selections: CustomWaveformSelections,
): readonly ResolvedCustomParameter[] {
  const parameters = customWaveformParameters(standard);
  const known = new Set(parameters.map((parameter) => parameter.key));
  for (const key of Object.keys(selections)) {
    if (!known.has(key)) throw new RangeError(`Unknown ${standard} custom-waveform parameter: ${key}`);
  }
  const resolved = new Map<string, string>();
  const output: ResolvedCustomParameter[] = [];
  for (const parameter of parameters) {
    const options = parameter.options(resolved);
    const pinnedValue = selections[parameter.key];
    let value: string;
    let pinned = false;
    if (pinnedValue !== undefined && pinnedValue !== 'auto') {
      if (!options.includes(pinnedValue)) {
        throw new RangeError(
          `${standard} ${parameter.key} = ${pinnedValue} is not allowed by the standard here; legal: ${options.slice(0, 24).join(', ')}${options.length > 24 ? ', …' : ''}`,
        );
      }
      value = pinnedValue;
      pinned = true;
    } else {
      value = parameter.resolve(resolved);
    }
    resolved.set(parameter.key, value);
    output.push({ key: parameter.key, label: parameter.label, tier: parameter.tier, specRef: parameter.specRef, options, value, pinned });
  }
  return output;
}

// ---------------------------------------------------------------------------
// Descriptor projection — resolved lattice -> catalog descriptor
// ---------------------------------------------------------------------------

const LTE_SOURCE = sourceBasis('3GPP', [{
  specification: '3GPP TS 36.101 / 36.104 / 36.141 / 36.211 / 36.213',
  clause: 'Table 5.6-1 (bandwidth-N_RB), §6.1.1 (E-TM), Table 7.1.7.1-1A (MCS)',
  revision: 'Rel-14 baseline',
  url: 'https://www.3gpp.org/DynaReport/36-series.htm',
}]);
const NR_SOURCE = sourceBasis('3GPP', [{
  specification: '3GPP TS 38.101-1 / 38.101-2 / 38.104 / 38.141-1 / 38.141-2',
  clause: 'Table 5.3.2-1 (SCSxBW-N_RB), §4.9.2 (NR-TM)',
  revision: 'Rel-17 baseline',
  url: 'https://www.3gpp.org/DynaReport/38-series.htm',
}]);
const WIFI_SOURCE = sourceBasis('IEEE', [{
  specification: 'IEEE 802.11-2020; IEEE 802.11ax-2021',
  clause: 'Tables 17-5 / 19-6 / 21-5 / 27-5 (tone plans), §21.5 (VHT MCS), Clause 27 (HE)',
  revision: '2020 / ax-2021',
  url: 'https://standards.ieee.org/ieee/802.11/7028/',
}]);

const CUSTOM_DISCLOSURE_TAIL =
  'Operator-defined engineering projection assembled strictly from the cited standard tables. '
  + 'It is an observable spectrum/I/Q projection, not bit-exact, not protocol-decodable, not conformance evidence, and not an instruction to emit RF.';

function selectionValue(resolved: readonly ResolvedCustomParameter[], key: string): string {
  const entry = resolved.find((parameter) => parameter.key === key);
  if (!entry) throw new Error(`Custom waveform resolution is missing ${key}`);
  return entry.value;
}
function pinnedSummary(resolved: readonly ResolvedCustomParameter[]): string {
  const pins = resolved.filter((parameter) => parameter.pinned).map((parameter) => `${parameter.key}=${parameter.value}`);
  return pins.length === 0 ? 'all auto' : pins.join(' · ');
}
function clampCenterHz(centerHz: number): number {
  return Math.min(centerHz, MAX_MEASUREMENT_FREQUENCY_HZ);
}
function niceSpanHz(occupiedBandwidthHz: number): number {
  return Math.ceil((occupiedBandwidthHz * 1.5) / 1_000_000) * 1_000_000;
}

/** Build the live catalog descriptor for a standard from resolved selections. */
export function buildCustomWaveformDescriptor(
  standard: CustomWaveformStandard,
  selections: CustomWaveformSelections,
): WaveformDescriptor {
  const resolved = resolveCustomWaveform(standard, selections);
  const value = (key: string) => selectionValue(resolved, key);

  if (standard === 'lte') {
    const resourceBlocks = Number(value('resourceBlocks'));
    const spacingHz = value('subcarrierSpacingKHz') === '7.5' ? 7_500 : 15_000;
    const occupiedBandwidthHz = resourceBlocks * 12 * spacingHz;
    const band = LTE_BANDS[value('operatingBand')]!;
    const tdd = value('duplexMode') === 'tdd';
    const modulation = value('modulation') as WaveformProjection['modulation'];
    return {
      id: 'custom-lte', label: 'Custom LTE downlink', family: 'e-utra',
      model: `Custom E-UTRA · ${value('channelBandwidthMHz')} MHz · ${resourceBlocks} RB · ${value('subcarrierSpacingKHz')} kHz · ${value('duplexMode').toUpperCase()} · ${value('modulation')} · ${pinnedSummary(resolved)}`,
      qualification: 'standards-derived',
      centerHz: clampCenterHz(Math.round(((band.dlLowMHz + band.dlHighMHz) / 2) * 1_000_000)),
      occupiedBandwidthHz,
      recommendedSpanHz: niceSpanHz(occupiedBandwidthHz),
      projection: {
        allocation: 'full', modulation, timing: tdd ? 'tdd-frame' : 'continuous',
        duplex: tdd ? 'tdd' : 'fdd', subcarrierSpacingHz: spacingHz, nominalResourceBlocks: resourceBlocks,
      },
      source: LTE_SOURCE,
      disclosure: `Custom LTE configuration (Band ${value('operatingBand')}, TDD config ${value('tddConfig')}, CP ${value('cyclicPrefix')}, MCS ${value('mcsIndex')}). TDD envelopes render with the admitted engineering schedule. ${CUSTOM_DISCLOSURE_TAIL}`,
    };
  }

  if (standard === 'nr') {
    const resourceBlocks = Number(value('resourceBlocks'));
    const spacingHz = Number(value('subcarrierSpacingKHz')) * 1_000;
    const occupiedBandwidthHz = resourceBlocks * 12 * spacingHz;
    const band = NR_BANDS[value('operatingBand')]!;
    const tdd = value('duplexMode') === 'tdd';
    const modulation = value('pdschModulation') as WaveformProjection['modulation'];
    return {
      id: 'custom-nr', label: 'Custom 5G NR downlink', family: 'nr',
      model: `Custom NR ${value('frequencyRange')} · ${value('channelBandwidthMHz')} MHz · ${resourceBlocks} RB · ${value('subcarrierSpacingKHz')} kHz · ${value('duplexMode').toUpperCase()} · ${value('pdschModulation')} · ${pinnedSummary(resolved)}`,
      qualification: 'standards-derived',
      centerHz: clampCenterHz(Math.round(band.centerMHz * 1_000_000)),
      occupiedBandwidthHz,
      recommendedSpanHz: niceSpanHz(occupiedBandwidthHz),
      projection: {
        allocation: 'full', modulation, timing: tdd ? 'tdd-frame' : 'continuous',
        duplex: tdd ? 'tdd' : 'fdd', subcarrierSpacingHz: spacingHz, nominalResourceBlocks: resourceBlocks,
      },
      source: NR_SOURCE,
      disclosure: `Custom NR configuration (${value('operatingBand')}, TDD periodicity ${value('tddPeriodicityMs')} ms, CP ${value('cyclicPrefix')}, ${value('mcsTable')}). FR2 band centers above the instrument maximum are clamped; TDD envelopes render with the admitted engineering schedule. ${CUSTOM_DISCLOSURE_TAIL}`,
    };
  }

  const phyKey = value('phyType');
  const phy = WIFI_PHYS[phyKey]!;
  const bandwidth = value('channelBandwidthMHz');
  const centerHz = value('band') === '2.4GHz' ? 2_437_000_000 : value('band') === '5GHz' ? 5_180_000_000 : 5_975_000_000;
  if (phy.spacingHz === undefined) {
    return {
      id: 'custom-wifi', label: 'Custom Wi-Fi', family: 'wlan',
      model: `Custom Wi-Fi ${phyKey} · 22 MHz DSSS · rate ${value('mcsIndex')} · ${pinnedSummary(resolved)}`,
      qualification: 'standards-derived',
      centerHz,
      occupiedBandwidthHz: 22_000_000,
      recommendedSpanHz: 33_000_000,
      projection: { allocation: 'full', modulation: 'hr-dsss', timing: 'burst' },
      source: WIFI_SOURCE,
      disclosure: `Custom Wi-Fi HR-DSSS configuration (${value('band')}, channel ${value('channelNumber')}, ${value('mcsIndex')}). ${CUSTOM_DISCLOSURE_TAIL}`,
    };
  }
  const usedTones = wifiUsedTones(phyKey, bandwidth);
  const occupiedBandwidthHz = usedTones * phy.spacingHz;
  const constellation = wifiMcsConstellation(Number(value('mcsIndex')));
  return {
    id: 'custom-wifi', label: 'Custom Wi-Fi', family: 'wlan',
    model: `Custom Wi-Fi ${phyKey} · ${bandwidth} MHz · ${usedTones} tones · MCS ${value('mcsIndex')} (${constellation}) · Nss ${value('spatialStreams')} · GI ${value('guardIntervalUs')} µs · ${pinnedSummary(resolved)}`,
    qualification: 'standards-derived',
    centerHz,
    occupiedBandwidthHz,
    recommendedSpanHz: niceSpanHz(occupiedBandwidthHz),
    projection: { allocation: 'full', modulation: phy.modulationToken, timing: 'burst', subcarrierSpacingHz: phy.spacingHz },
    source: WIFI_SOURCE,
    disclosure: `Custom Wi-Fi ${phyKey} configuration (${value('band')}, channel ${value('channelNumber')}, RU ${value('ruAllocation')}). Per-MCS constellation and RU allocation are recorded shaping metadata at this fidelity. ${CUSTOM_DISCLOSURE_TAIL}`,
  };
}

// ---------------------------------------------------------------------------
// Selection store — the live custom configuration per standard
// ---------------------------------------------------------------------------

const activeSelections = new Map<CustomWaveformStandard, CustomWaveformSelections>();

/** Replace a standard's custom selections; throws when any pin is illegal. */
export function setCustomWaveformSelections(standard: CustomWaveformStandard, selections: CustomWaveformSelections): void {
  resolveCustomWaveform(standard, selections); // validation: throws on an illegal pin
  activeSelections.set(standard, Object.freeze({ ...selections }));
}
export function customWaveformSelections(standard: CustomWaveformStandard): CustomWaveformSelections {
  return activeSelections.get(standard) ?? Object.freeze({});
}
/** The live descriptor for a custom profile (all-auto when never configured). */
export function customWaveformDescriptor(profile: CustomWaveformProfile): WaveformDescriptor {
  const standard = customWaveformStandard(profile);
  return buildCustomWaveformDescriptor(standard, customWaveformSelections(standard));
}
/** Test hook: reset all custom selections to all-auto. */
export function resetCustomWaveformSelections(): void {
  activeSelections.clear();
}

/**
 * Recover the pinned selections from a custom descriptor's model string (the
 * `pinnedSummary` segments). Lets a UI restore its editing state from the
 * service-truth descriptor without a second status channel; round-tripped by
 * tests against buildCustomWaveformDescriptor.
 */
export function parsePinnedSelections(model: string): CustomWaveformSelections {
  const selections: Record<string, string> = {};
  for (const segment of model.split('·')) {
    const match = segment.trim().match(/^([A-Za-z][A-Za-z0-9]*)=(.+)$/);
    if (match) selections[match[1]!] = match[2]!.trim();
  }
  return Object.freeze(selections);
}

/**
 * Drop pins that a cascade edit has made illegal (e.g. picking a narrower
 * bandwidth after pinning an RB count) so the remaining selections always
 * resolve. Deterministic: repeatedly resolves and removes the first offender.
 */
export function sanitizeCustomWaveformSelections(
  standard: CustomWaveformStandard,
  selections: CustomWaveformSelections,
): CustomWaveformSelections {
  const working: Record<string, string> = { ...selections };
  const known = new Set(customWaveformParameters(standard).map((parameter) => parameter.key));
  for (const key of Object.keys(working)) if (!known.has(key)) delete working[key];
  for (let guard = 0; guard <= known.size; guard += 1) {
    try {
      resolveCustomWaveform(standard, working);
      return Object.freeze({ ...working });
    } catch (value) {
      const message = value instanceof Error ? value.message : String(value);
      const offender = [...known].find((key) => message.includes(` ${key} = `));
      if (!offender || working[offender] === undefined) throw value;
      delete working[offender];
    }
  }
  throw new Error(`Custom ${standard} selections could not be sanitized`);
}
