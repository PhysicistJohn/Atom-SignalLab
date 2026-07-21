import { afterEach, describe, expect, it } from 'vitest';
import { waveformDescriptorSchema } from './contracts.js';
import {
  buildCustomWaveformDescriptor,
  parsePinnedSelections,
  sanitizeCustomWaveformSelections,
  customWaveformDescriptor,
  customWaveformParameters,
  lteMcsModulation,
  NR_FR1_RB,
  NR_FR2_RB,
  resetCustomWaveformSelections,
  resolveCustomWaveform,
  setCustomWaveformSelections,
  vhtExclusionHole,
  wifiUsedTones,
} from './custom-waveform.js';

afterEach(() => resetCustomWaveformSelections());

function resolvedValue(standard: 'lte' | 'nr' | 'wifi', selections: Record<string, string>, key: string): string {
  const entry = resolveCustomWaveform(standard, selections).find((parameter) => parameter.key === key);
  if (!entry) throw new Error(`missing ${key}`);
  return entry.value;
}

describe('LTE constraint lattice', () => {
  it('maps every channel bandwidth to its exact N_RB (TS 36.101 Table 5.6-1)', () => {
    const expected: Record<string, string> = { '1.4': '6', '3': '15', '5': '25', '10': '50', '15': '75', '20': '100' };
    for (const [bandwidth, rb] of Object.entries(expected)) {
      expect(resolvedValue('lte', { channelBandwidthMHz: bandwidth }, 'resourceBlocks')).toBe(rb);
    }
  });

  it('pins modulation per E-TM and rejects a contradicting selection', () => {
    expect(resolvedValue('lte', { testModel: 'E-TM3.1a' }, 'modulation')).toBe('256qam');
    expect(resolvedValue('lte', { testModel: 'E-TM3.2' }, 'modulation')).toBe('16qam');
    expect(() => resolveCustomWaveform('lte', { testModel: 'E-TM3.1', modulation: 'qpsk' })).toThrow(/modulation/);
  });

  it('forces normal CP under a test model and gates 7.5 kHz on extended CP', () => {
    expect(() => resolveCustomWaveform('lte', { testModel: 'E-TM2', cyclicPrefix: 'extended' })).toThrow(/cyclicPrefix/);
    expect(() => resolveCustomWaveform('lte', { subcarrierSpacingKHz: '7.5' })).toThrow(/subcarrierSpacing/);
    expect(resolvedValue('lte', { cyclicPrefix: 'extended', subcarrierSpacingKHz: '7.5' }, 'subcarrierSpacingKHz')).toBe('7.5');
  });

  it('derives duplex from the band and gates TDD-only knobs', () => {
    expect(resolvedValue('lte', { operatingBand: '3' }, 'duplexMode')).toBe('fdd');
    expect(resolvedValue('lte', { operatingBand: '38' }, 'duplexMode')).toBe('tdd');
    expect(() => resolveCustomWaveform('lte', { operatingBand: '3', duplexMode: 'tdd' })).toThrow(/duplexMode/);
    expect(resolvedValue('lte', { operatingBand: '3' }, 'tddConfig')).toBe('n/a');
    expect(resolvedValue('lte', { operatingBand: '38', tddConfig: '4' }, 'tddConfig')).toBe('4');
  });

  it('uses the corrected 256QAM MCS split (QPSK 0-3, 16QAM from 4)', () => {
    expect(lteMcsModulation(3)).toBe('qpsk');
    expect(lteMcsModulation(4)).toBe('16qam');
    expect(lteMcsModulation(19)).toBe('64qam');
    expect(lteMcsModulation(20)).toBe('256qam');
    expect(() => resolveCustomWaveform('lte', { modulation: '256qam', mcsIndex: '4' })).toThrow(/mcsIndex/);
    expect(resolvedValue('lte', { modulation: '256qam' }, 'mcsIndex')).toBe('20');
  });
});

describe('NR constraint lattice', () => {
  it('honors the exact FR1 table including the corrected 60 kHz column', () => {
    expect(NR_FR1_RB['60']!['100']).toBe(135); // 60 kHz IS allowed at 100 MHz
    expect(NR_FR1_RB['60']!['5']).toBeUndefined(); // blank cell
    expect(NR_FR1_RB['15']!['100']).toBeUndefined(); // 15 kHz stops at 50 MHz
    expect(resolvedValue('nr', { subcarrierSpacingKHz: '60', channelBandwidthMHz: '100' }, 'resourceBlocks')).toBe('135');
    expect(() => resolveCustomWaveform('nr', { subcarrierSpacingKHz: '60', channelBandwidthMHz: '5' })).toThrow(/channelBandwidth/);
    expect(() => resolveCustomWaveform('nr', { subcarrierSpacingKHz: '15', channelBandwidthMHz: '100' })).toThrow(/channelBandwidth/);
  });

  it('honors the FR2 table (60 kHz has no 400 MHz)', () => {
    expect(NR_FR2_RB['120']!['400']).toBe(264);
    expect(NR_FR2_RB['60']!['400']).toBeUndefined();
    expect(resolvedValue('nr', { frequencyRange: 'FR2', subcarrierSpacingKHz: '120', channelBandwidthMHz: '400' }, 'resourceBlocks')).toBe('264');
    expect(() => resolveCustomWaveform('nr', { frequencyRange: 'FR2', subcarrierSpacingKHz: '60', channelBandwidthMHz: '400' })).toThrow(/channelBandwidth/);
  });

  it('restricts 1024QAM to FR1 and extended CP to 60 kHz', () => {
    expect(resolveCustomWaveform('nr', { pdschModulation: '1024qam' })).toBeDefined();
    expect(() => resolveCustomWaveform('nr', { frequencyRange: 'FR2', pdschModulation: '1024qam' })).toThrow(/pdschModulation/);
    expect(() => resolveCustomWaveform('nr', { subcarrierSpacingKHz: '30', cyclicPrefix: 'extended' })).toThrow(/cyclicPrefix/);
    expect(resolvedValue('nr', { subcarrierSpacingKHz: '60', cyclicPrefix: 'extended' }, 'cyclicPrefix')).toBe('extended');
  });

  it('applies the corrected TDD periodicity gate (0.5 ms not valid at 15 kHz)', () => {
    expect(() => resolveCustomWaveform('nr', { operatingBand: 'n40', subcarrierSpacingKHz: '15', channelBandwidthMHz: '20', tddPeriodicityMs: '0.5' })).toThrow(/tddPeriodicity/);
    expect(resolvedValue('nr', { operatingBand: 'n78', subcarrierSpacingKHz: '30', tddPeriodicityMs: '0.5' }, 'tddPeriodicityMs')).toBe('0.5');
    expect(() => resolveCustomWaveform('nr', { operatingBand: 'n78', subcarrierSpacingKHz: '30', tddPeriodicityMs: '0.625' })).toThrow(/tddPeriodicity/);
  });

  it('gates the MCS table on the chosen modulation', () => {
    expect(resolvedValue('nr', { pdschModulation: '256qam' }, 'mcsTable')).toBe('table2-256QAM');
    expect(() => resolveCustomWaveform('nr', { pdschModulation: '1024qam', mcsTable: 'table1-64QAM' })).toThrow(/mcsTable/);
  });

  it('keeps FR2 bands out of FR1 and NR-FR2 test models out of FR1', () => {
    expect(() => resolveCustomWaveform('nr', { frequencyRange: 'FR1', operatingBand: 'n257' })).toThrow(/operatingBand/);
    expect(() => resolveCustomWaveform('nr', { frequencyRange: 'FR1', testModel: 'NR-FR2-TM2' })).toThrow(/testModel/);
    expect(resolvedValue('nr', { frequencyRange: 'FR2', testModel: 'NR-FR2-TM2a' }, 'pdschModulation')).toBe('256qam');
  });
});

describe('Wi-Fi constraint lattice', () => {
  it('maps (PHY, bandwidth) to the exact used-tone counts', () => {
    expect(wifiUsedTones('11a-OFDM', '20')).toBe(52);
    expect(wifiUsedTones('11n-HT', '40')).toBe(114);
    expect(wifiUsedTones('11ac-VHT', '160')).toBe(484);
    expect(wifiUsedTones('11ax-HE', '80')).toBe(996);
    expect(wifiUsedTones('11ax-HE', '160')).toBe(1992);
  });

  it('applies the corrected VHT exclusion holes including 80 MHz MCS9/Nss6', () => {
    expect(vhtExclusionHole('20', 9, 1)).toBe(true);
    expect(vhtExclusionHole('20', 9, 3)).toBe(false);
    expect(vhtExclusionHole('80', 6, 3)).toBe(true);
    expect(vhtExclusionHole('80', 9, 6)).toBe(true); // the correction
    expect(vhtExclusionHole('160', 9, 3)).toBe(true);
    expect(vhtExclusionHole('40', 9, 5)).toBe(false);
    expect(() => resolveCustomWaveform('wifi', { phyType: '11ac-VHT', channelBandwidthMHz: '80', spatialStreams: '6', mcsIndex: '9' })).toThrow(/mcsIndex/);
    expect(resolvedValue('wifi', { phyType: '11ac-VHT', channelBandwidthMHz: '80', spatialStreams: '6' }, 'mcsIndex')).toBe('7');
  });

  it('gates bandwidth by PHY and band, MCS ceiling by PHY, and RU/GI by HE', () => {
    expect(() => resolveCustomWaveform('wifi', { phyType: '11n-HT', channelBandwidthMHz: '80' })).toThrow(/channelBandwidth/);
    expect(() => resolveCustomWaveform('wifi', { phyType: '11ax-HE', band: '2.4GHz', channelBandwidthMHz: '80' })).toThrow(/channelBandwidth/);
    expect(() => resolveCustomWaveform('wifi', { phyType: '11n-HT', mcsIndex: '8' })).toThrow(/mcsIndex/);
    expect(() => resolveCustomWaveform('wifi', { phyType: '11ac-VHT', mcsIndex: '10' })).toThrow(/mcsIndex/);
    expect(() => resolveCustomWaveform('wifi', { phyType: '11ac-VHT', guardIntervalUs: '1.6' })).toThrow(/guardInterval/);
    expect(() => resolveCustomWaveform('wifi', { phyType: '11ac-VHT', ruAllocation: 'RU242' })).toThrow(/ruAllocation/);
    expect(resolvedValue('wifi', { phyType: '11ax-HE', channelBandwidthMHz: '40', ruAllocation: 'RU484' }, 'ruAllocation')).toBe('RU484');
    expect(() => resolveCustomWaveform('wifi', { phyType: '11ax-HE', channelBandwidthMHz: '40', ruAllocation: 'RU996' })).toThrow(/ruAllocation/);
    expect(() => resolveCustomWaveform('wifi', { phyType: '11a-OFDM', band: '2.4GHz' })).toThrow(/band/);
  });
});

describe('descriptor projection', () => {
  it('produces schema-valid descriptors for the all-auto default of every standard', () => {
    for (const profile of ['custom-lte', 'custom-nr', 'custom-wifi'] as const) {
      const descriptor = customWaveformDescriptor(profile);
      expect(() => waveformDescriptorSchema.parse(descriptor)).not.toThrow();
      expect(descriptor.qualification).toBe('standards-derived');
      expect(descriptor.recommendedSpanHz).toBeGreaterThanOrEqual(descriptor.occupiedBandwidthHz);
    }
  });

  it('derives LTE occupied bandwidth as N_RB x 12 x 15 kHz', () => {
    const descriptor = buildCustomWaveformDescriptor('lte', { channelBandwidthMHz: '20' });
    expect(descriptor.occupiedBandwidthHz).toBe(100 * 12 * 15_000); // 18 MHz
    expect(descriptor.projection.nominalResourceBlocks).toBe(100);
    expect(descriptor.projection.subcarrierSpacingHz).toBe(15_000);
  });

  it('derives NR occupied bandwidth from the exact table cell', () => {
    const descriptor = buildCustomWaveformDescriptor('nr', { subcarrierSpacingKHz: '30', channelBandwidthMHz: '100' });
    expect(descriptor.occupiedBandwidthHz).toBe(273 * 12 * 30_000); // 98.28 MHz
    const fr2 = buildCustomWaveformDescriptor('nr', { frequencyRange: 'FR2', subcarrierSpacingKHz: '120', channelBandwidthMHz: '400' });
    expect(fr2.occupiedBandwidthHz).toBe(264 * 12 * 120_000); // 380.16 MHz
    expect(() => waveformDescriptorSchema.parse(fr2)).not.toThrow(); // FR2 center clamped in-range
  });

  it('derives Wi-Fi occupied bandwidth as usedTones x spacing, and DSSS as 22 MHz', () => {
    const he80 = buildCustomWaveformDescriptor('wifi', { phyType: '11ax-HE', channelBandwidthMHz: '80' });
    expect(he80.occupiedBandwidthHz).toBe(996 * 78_125); // 77.8125 MHz
    expect(he80.projection.modulation).toBe('he-ofdm');
    const dsss = buildCustomWaveformDescriptor('wifi', { phyType: '11b-HR-DSSS' });
    expect(dsss.occupiedBandwidthHz).toBe(22_000_000);
    expect(dsss.projection.modulation).toBe('hr-dsss');
    expect(dsss.projection.subcarrierSpacingHz).toBeUndefined();
  });

  it('reflects TDD in the projection so the envelope gates', () => {
    const tdd = buildCustomWaveformDescriptor('lte', { operatingBand: '38' });
    expect(tdd.projection.duplex).toBe('tdd');
    expect(tdd.projection.timing).toBe('tdd-frame');
    const fdd = buildCustomWaveformDescriptor('nr', { operatingBand: 'n1' });
    expect(fdd.projection.duplex).toBe('fdd');
    expect(fdd.projection.timing).toBe('continuous');
  });
});

describe('selection store', () => {
  it('applies validated selections to the live descriptor and rejects illegal ones', () => {
    setCustomWaveformSelections('nr', { subcarrierSpacingKHz: '30', channelBandwidthMHz: '40' });
    expect(customWaveformDescriptor('custom-nr').occupiedBandwidthHz).toBe(106 * 12 * 30_000);
    expect(() => setCustomWaveformSelections('nr', { subcarrierSpacingKHz: '15', channelBandwidthMHz: '100' })).toThrow(/channelBandwidth/);
    // the failed set must not clobber the previous valid state
    expect(customWaveformDescriptor('custom-nr').occupiedBandwidthHz).toBe(106 * 12 * 30_000);
    expect(() => setCustomWaveformSelections('lte', { bogus: 'x' })).toThrow(/Unknown/);
  });

  it('round-trips pinned selections through the descriptor model string', () => {
    const selections = { subcarrierSpacingKHz: '30', channelBandwidthMHz: '40', pdschModulation: '256qam' };
    const descriptor = buildCustomWaveformDescriptor('nr', selections);
    expect(parsePinnedSelections(descriptor.model)).toEqual(selections);
    expect(parsePinnedSelections(buildCustomWaveformDescriptor('lte', {}).model)).toEqual({});
  });

  it('sanitize drops pins that a cascade edit made illegal, keeping the rest', () => {
    // 60 kHz FR1 pinned at 5 MHz is a blank cell: the bandwidth pin must go.
    const cleaned = sanitizeCustomWaveformSelections('nr', {
      subcarrierSpacingKHz: '60', channelBandwidthMHz: '5', pdschModulation: '64qam', bogusKey: 'x',
    });
    expect(cleaned).toEqual({ subcarrierSpacingKHz: '60', pdschModulation: '64qam' });
    expect(() => resolveCustomWaveform('nr', cleaned)).not.toThrow();
  });

  it('every parameter of every standard resolves and offers only legal options', () => {
    for (const standard of ['lte', 'nr', 'wifi'] as const) {
      const resolved = resolveCustomWaveform(standard, {});
      expect(resolved.length).toBe(customWaveformParameters(standard).length);
      for (const parameter of resolved) {
        expect(parameter.options.length).toBeGreaterThan(0);
        expect(parameter.options).toContain(parameter.value);
        expect(parameter.pinned).toBe(false);
      }
    }
  });
});
