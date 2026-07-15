/**
 * Versioned timing choices shared by the public canonized replay and corpus.
 *
 * The LTE schedule is a fully specified standards configuration. The NR and
 * Bluetooth schedules are declared engineering selections inside standards-
 * permitted parameter spaces; neither is a deployment-wide protocol default.
 */

export const LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1 =
  'lte-tdd-config0-ssp7-normal-cp-downlink-v1' as const;
export const NR_TDD_7DL_3UL_ENGINEERING_V1 =
  'nr-tdd-7dl-3ul-engineering-v1' as const;
export const BLE_PRIMARY_ADVERTISING_ENGINEERING_V1 =
  'ble-primary-advertising-engineering-v1' as const;

const LTE_BASIC_TIME_UNIT_SECONDS = 1 / 30_720_000;

/**
 * TS 36.211 v19.3.0 clause 4.2, Tables 4.2-1 and 4.2-2.
 *
 * Special-subframe configuration 7 with normal downlink/uplink CP and
 * srs-UpPtsAdd absent (X=0) is an explicit SignalLab scenario choice. It is
 * not implied by Band 38 or by UL/DL configuration 0.
 */
export const LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS = Object.freeze({
  timingModelVersion: 1,
  downlinkOnly: 1,
  ulDlConfiguration: 0,
  specialSubframeConfiguration: 7,
  downlinkCyclicPrefixNormal: 1,
  uplinkCyclicPrefixNormal: 1,
  srsUpPtsAdd: 0,
  basicTimeUnitSeconds: LTE_BASIC_TIME_UNIT_SECONDS,
  subframeBasicTimeUnits: 30_720,
  dwPtsBasicTimeUnits: 21_952,
  guardPeriodBasicTimeUnits: 4_384,
  upPtsBasicTimeUnits: 4_384,
  subframeSeconds: 30_720 * LTE_BASIC_TIME_UNIT_SECONDS,
  dwPtsDurationSeconds: 21_952 * LTE_BASIC_TIME_UNIT_SECONDS,
  guardPeriodDurationSeconds: 4_384 * LTE_BASIC_TIME_UNIT_SECONDS,
  upPtsDurationSeconds: 4_384 * LTE_BASIC_TIME_UNIT_SECONDS,
});

/**
 * TS 38.331 TDD-UL-DL-Pattern fields interpreted by TS 38.213 clause 11.1.
 * This valid 5 ms, 30 kHz-SCS 7-DL/3-UL selection is SignalLab engineering
 * scenario v1, not a pattern prescribed for n78 or all NR deployments.
 */
export const NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS = Object.freeze({
  engineeringScheduleVersion: 1,
  downlinkOnly: 1,
  subcarrierSpacingHz: 30_000,
  referenceSubcarrierSpacingHz: 30_000,
  slotSeconds: 0.0005,
  dlUlTransmissionPeriodicitySeconds: 0.005,
  nrofDownlinkSlots: 7,
  nrofDownlinkSymbols: 0,
  nrofUplinkSlots: 3,
  nrofUplinkSymbols: 0,
});

/**
 * One deterministic legacy primary-advertising schedule used for acquisition
 * experiments. The Core Specification permits other channel maps, packet
 * lengths and event schedules, so these values are not universal BLE timing.
 */
export const BLE_PRIMARY_ADVERTISING_ENGINEERING_PARAMETERS = Object.freeze({
  engineeringScheduleVersion: 1,
  advertisingDelayGeneratorVersion: 1,
  channelWidthHz: 2_000_000,
  advertisingIntervalSeconds: 0.020,
  advertisingDelayMinimumSeconds: 0,
  advertisingDelayMaximumSeconds: 0.010,
  packetStartSpacingSeconds: 0.0015,
  packetDurationSeconds: 0.000376,
  packetCount: 3,
  packet0CenterHz: 2_402_000_000,
  packet1CenterHz: 2_426_000_000,
  packet2CenterHz: 2_480_000_000,
});

export function lteTddConfig0Ssp7NormalCpDownlinkActive(
  parameters: Readonly<Record<string, number>>,
  timeSeconds: number,
): boolean {
  assertPinnedParameters(
    LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1,
    parameters,
    LTE_TDD_CONFIG0_SSP7_NORMAL_CP_PARAMETERS,
  );
  assertTime(LTE_TDD_CONFIG0_SSP7_NORMAL_CP_DOWNLINK_V1, timeSeconds);

  const basicTimeCoordinate = snapNearInteger(timeSeconds / parameters.basicTimeUnitSeconds!);
  const subframeBasicTimeUnits = parameters.subframeBasicTimeUnits!;
  const framePhaseBasicTimeUnits = positiveModulo(basicTimeCoordinate, 10 * subframeBasicTimeUnits);
  const subframeIndex = Math.min(9, Math.floor(framePhaseBasicTimeUnits / subframeBasicTimeUnits));
  const subframePhaseBasicTimeUnits = framePhaseBasicTimeUnits - subframeIndex * subframeBasicTimeUnits;
  const direction = 'DSUUUDSUUU'[subframeIndex];
  if (direction === 'D') return true;
  if (direction === 'S') return subframePhaseBasicTimeUnits < parameters.dwPtsBasicTimeUnits!;
  return false;
}

export function nrTdd7Dl3UlEngineeringDownlinkActive(
  parameters: Readonly<Record<string, number>>,
  timeSeconds: number,
): boolean {
  assertPinnedParameters(
    NR_TDD_7DL_3UL_ENGINEERING_V1,
    parameters,
    NR_TDD_7DL_3UL_ENGINEERING_PARAMETERS,
  );
  assertTime(NR_TDD_7DL_3UL_ENGINEERING_V1, timeSeconds);

  const slotSeconds = parameters.slotSeconds!;
  const periodSeconds = parameters.dlUlTransmissionPeriodicitySeconds!;
  const periodSlots = periodSeconds / slotSeconds;
  if (!Number.isSafeInteger(periodSlots)
    || parameters.nrofDownlinkSlots! + parameters.nrofUplinkSlots! !== periodSlots
    || parameters.nrofDownlinkSymbols !== 0
    || parameters.nrofUplinkSymbols !== 0) {
    throw new Error(`${NR_TDD_7DL_3UL_ENGINEERING_V1} requires seven complete DL and three complete UL slots`);
  }
  const slotCoordinate = snapNearInteger(timeSeconds / slotSeconds);
  const slotIndex = Math.min(periodSlots - 1, Math.floor(positiveModulo(slotCoordinate, periodSlots)));
  return slotIndex < parameters.nrofDownlinkSlots!;
}

function assertPinnedParameters(
  modelId: string,
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
): void {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${modelId} requires ${key}=${value}`);
  }
}

function assertTime(modelId: string, timeSeconds: number): void {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    throw new Error(`${modelId} requires finite non-negative time`);
  }
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function snapNearInteger(value: number): number {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) <= 1e-7 ? nearest : value;
}
