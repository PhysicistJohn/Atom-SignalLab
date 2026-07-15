import { describe, expect, it } from 'vitest';
import {
  LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1,
  LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
  NR_N78_30_KHZ_RASTER_CENTER_HZ,
  NR_N78_30_KHZ_RASTER_NREF,
  NR_N78_CHANNEL_RASTER_HZ,
  NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS,
  NR_TDD_7DL_3UL_ENGINEERING_V1,
  lteTddConfig0Ssp7NormalCpDownlinkActive,
  nrTdd7Dl3UlEngineeringDownlinkActive,
} from './canonical-timing.js';

describe('canonized TDD timing models', () => {
  it('derives the selected n78 center from an admitted even NREF on the 30 kHz channel raster', () => {
    expect(NR_N78_30_KHZ_RASTER_NREF).toBeGreaterThanOrEqual(620_000);
    expect(NR_N78_30_KHZ_RASTER_NREF).toBeLessThanOrEqual(653_332);
    expect(NR_N78_30_KHZ_RASTER_NREF % 2).toBe(0);
    expect(3_000_000_000 + 15_000 * (NR_N78_30_KHZ_RASTER_NREF - 600_000))
      .toBe(NR_N78_30_KHZ_RASTER_CENTER_HZ);
    expect(NR_N78_30_KHZ_RASTER_CENTER_HZ % NR_N78_CHANNEL_RASTER_HZ).toBe(0);
  });

  it('pins LTE config 0 and normal-CP special-subframe config 7 in exact Ts units', () => {
    const parameters = LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS;
    expect(LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1).toBe('lte-tdd-config0-ssp7-normal-cp-downlink-v1');
    expect(parameters).toMatchObject({
      ulDlConfiguration: 0,
      specialSubframeConfiguration: 7,
      downlinkCyclicPrefixNormal: 1,
      uplinkCyclicPrefixNormal: 1,
      srsUpPtsAdd: 0,
      downlinkOnly: 1,
      basicTimeUnitSeconds: 1 / 30_720_000,
      subframeBasicTimeUnits: 30_720,
      dwPtsBasicTimeUnits: 21_952,
      guardPeriodBasicTimeUnits: 4_384,
      upPtsBasicTimeUnits: 4_384,
    });
    expect(parameters.dwPtsBasicTimeUnits
      + parameters.guardPeriodBasicTimeUnits
      + parameters.upPtsBasicTimeUnits).toBe(parameters.subframeBasicTimeUnits);
    expect(parameters.dwPtsDurationSeconds).toBeCloseTo(714.583333e-6, 12);
    expect(parameters.guardPeriodDurationSeconds).toBeCloseTo(142.708333e-6, 12);
    expect(parameters.upPtsDurationSeconds).toBeCloseTo(142.708333e-6, 12);
    const activeBasicTimeUnits = 2 * parameters.subframeBasicTimeUnits + 2 * parameters.dwPtsBasicTimeUnits;
    expect(activeBasicTimeUnits / (10 * parameters.subframeBasicTimeUnits)).toBeCloseTo(0.3429166666667, 12);
  });

  it('admits only DwPTS—not GP or UpPTS—inside both LTE special subframes', () => {
    const parameters = LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS;
    const halfTs = parameters.basicTimeUnitSeconds / 2;
    const firstDwPtsEnd = parameters.subframeSeconds + parameters.dwPtsDurationSeconds;
    const secondDwPtsEnd = 6 * parameters.subframeSeconds + parameters.dwPtsDurationSeconds;
    const active = (timeSeconds: number) => lteTddConfig0Ssp7NormalCpDownlinkActive(parameters, timeSeconds);

    expect(active(0)).toBe(true);
    expect(active(parameters.subframeSeconds - halfTs)).toBe(true);
    expect(active(parameters.subframeSeconds)).toBe(true);
    expect(active(firstDwPtsEnd - halfTs)).toBe(true);
    expect(active(firstDwPtsEnd + halfTs)).toBe(false);
    expect(active(firstDwPtsEnd + parameters.guardPeriodDurationSeconds / 2)).toBe(false);
    expect(active(2 * parameters.subframeSeconds - halfTs)).toBe(false);
    expect(active(5 * parameters.subframeSeconds)).toBe(true);
    expect(active(6 * parameters.subframeSeconds)).toBe(true);
    expect(active(secondDwPtsEnd - halfTs)).toBe(true);
    expect(active(secondDwPtsEnd + halfTs)).toBe(false);
    expect(active(10 * parameters.subframeSeconds)).toBe(true);
  });

  it('rejects an unpinned LTE timing mutation instead of silently changing the corpus', () => {
    expect(() => lteTddConfig0Ssp7NormalCpDownlinkActive({
      ...LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
      specialSubframeConfiguration: 0,
    }, 0)).toThrow(/specialSubframeConfiguration=7/);
  });

  it('declares the NR 7DL/3UL choice as engineering v1 and follows its exact fields', () => {
    const parameters = NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS;
    expect(NR_TDD_7DL_3UL_ENGINEERING_V1).toBe('nr-tdd-7dl-3ul-engineering-v1');
    expect(parameters).toMatchObject({
      engineeringScheduleVersion: 1,
      referenceSubcarrierSpacingHz: 30_000,
      dlUlTransmissionPeriodicitySeconds: 0.005,
      nrofDownlinkSlots: 7,
      nrofDownlinkSymbols: 0,
      nrofUplinkSlots: 3,
      nrofUplinkSymbols: 0,
      downlinkOnly: 1,
    });
    const active = (slot: number) => nrTdd7Dl3UlEngineeringDownlinkActive(
      parameters,
      (slot + 0.5) * parameters.slotSeconds,
    );
    expect(Array.from({ length: 10 }, (_value, slot) => active(slot)))
      .toEqual([true, true, true, true, true, true, true, false, false, false]);
    expect(nrTdd7Dl3UlEngineeringDownlinkActive(parameters, parameters.dlUlTransmissionPeriodicitySeconds)).toBe(true);
  });
});
