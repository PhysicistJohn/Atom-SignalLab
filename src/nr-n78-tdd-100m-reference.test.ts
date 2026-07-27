import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_N78_TDD_100M_BINDING,
  NR_N78_TDD_100M_REFERENCE_IDENTITIES,
  NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND,
  generateNrN78Tdd100mFrame,
  nrN78Tdd100mDownlinkSymbolCount,
} from './nr-n78-tdd-100m-reference.js';

describe('fixed n78 TDD 100 MHz NR-FR1-TM1.1 reference', () => {
  it('binds the exact Release 19 carrier, numerology, and prescribed TDD test-model pattern', () => {
    expect(NR_N78_TDD_100M_BINDING).toEqual({
      testModelSpecification:
        '3GPP TS 38.141-1 V19.4.0 (Release 19)',
      rfSpecification: '3GPP TS 38.104 V19.4.0 (Release 19)',
      physicalLayerSpecification:
        '3GPP TS 38.211 V19.4.0 (Release 19)',
      tddSpecification:
        '3GPP TS 38.213 V19.3.0 and TS 38.331 V19.1.0 (Release 19)',
      model: 'NR-FR1-TM1.1',
      operatingBand: 'n78',
      duplex: 'tdd',
      downlinkCenterHz: 3_500_010_000,
      downlinkNrArfcn: 633_334,
      channelBandwidthHz: 100_000_000,
      nominalGridBandwidthHz: 98_280_000,
      physicalCellId: 1,
      subcarrierSpacingHz: 30_000,
      resourceBlockCount: 273,
      activeSubcarrierCount: 3_276,
      fftSize: 4_096,
      sampleRateHz: 122_880_000,
      radioFrameDurationMs: 10,
      radioFramesPerArtifact: 2,
      artifactDurationMs: 20,
      artifactSampleCount: 2_457_600,
      slotsPerRadioFrame: 20,
      slotsPerArtifact: 40,
      symbolsPerSlot: 14,
      cyclicPrefix: 'normal',
      windowingPercent: 0,
      tddPattern: {
        referenceSubcarrierSpacingKhz: 30,
        periodicityMs: 5,
        nrofDownlinkSlots: 7,
        nrofDownlinkSymbols: 6,
        nrofUplinkSlots: 2,
        nrofUplinkSymbols: 4,
        repetitionsPerRadioFrame: 2,
        repetitionsPerArtifact: 4,
      },
    });
    const oneRadioFramePattern = [
      14, 14, 14, 14, 14, 14, 14, 6, 0, 0,
      14, 14, 14, 14, 14, 14, 14, 6, 0, 0,
    ];
    expect(
      Array.from(
        { length: 40 },
        (_, slot) => nrN78Tdd100mDownlinkSymbolCount(slot),
      ),
    ).toEqual([...oneRadioFramePattern, ...oneRadioFramePattern]);
  });

  it('fills every DL RE, leaves every non-DL RE and sample exactly zero, and pins all content identities', () => {
    const frame = generateNrN78Tdd100mFrame();
    expect(frame.metadata).toMatchObject({
      profileId: 'nr-n78-tdd-100m',
      model: 'NR-FR1-TM1.1',
      qualification:
        'independently-verified-fixed-digital-baseband',
      standardsComplianceClaimed: false,
      rfConformanceClaimed: false,
      productCertificationClaimed: false,
      resourceElementCounts: {
        inactive: 471_744,
        pdcchData: 1_728,
        pdcchDmrs: 576,
        pdschRnti0Data: 1_250_640,
        pdschRnti2Data: 11_592,
        pdschDmrs: 98_280,
      },
    });
    expect(frame.grid.real).toHaveLength(1_834_560);
    expect(frame.grid.imaginary).toHaveLength(1_834_560);
    expect(frame.grid.kinds).toHaveLength(1_834_560);
    expect(frame.timeDomain.real).toHaveLength(2_457_600);
    expect(frame.timeDomain.imaginary).toHaveLength(2_457_600);

    let allocationViolations = 0;
    for (let symbol = 0; symbol < 560; symbol += 1) {
      const slot = Math.floor(symbol / 14);
      const localSymbol = symbol % 14;
      const expectedActive = localSymbol
        < nrN78Tdd100mDownlinkSymbolCount(slot);
      const offset = symbol * 3_276;
      for (let subcarrier = 0; subcarrier < 3_276; subcarrier += 1) {
        const index = offset + subcarrier;
        if (expectedActive) {
          if (
            frame.grid.kinds[index]
            === NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.inactive
          ) {
            allocationViolations += 1;
          }
        } else {
          if (
            frame.grid.kinds[index]
              !== NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.inactive
            || frame.grid.real[index] !== 0
            || frame.grid.imaginary[index] !== 0
          ) {
            allocationViolations += 1;
          }
        }
      }
    }
    expect(allocationViolations).toBe(0);

    let sampleOffset = 0;
    let inactiveSampleViolations = 0;
    for (let symbol = 0; symbol < 560; symbol += 1) {
      const slot = Math.floor(symbol / 14);
      const localSymbol = symbol % 14;
      const cyclicPrefix = localSymbol === 0 ? 352 : 288;
      const symbolSamples = cyclicPrefix + 4_096;
      if (localSymbol >= nrN78Tdd100mDownlinkSymbolCount(slot)) {
        for (
          let sample = sampleOffset;
          sample < sampleOffset + symbolSamples;
          sample += 1
        ) {
          if (
            frame.timeDomain.real[sample] !== 0
            || frame.timeDomain.imaginary[sample] !== 0
          ) {
            inactiveSampleViolations += 1;
          }
        }
      }
      sampleOffset += symbolSamples;
    }
    expect(inactiveSampleViolations).toBe(0);
    expect(sampleOffset).toBe(2_457_600);

    expect(frame.grid.real.subarray(917_280)).toEqual(
      frame.grid.real.subarray(0, 917_280),
    );
    expect(frame.grid.imaginary.subarray(917_280)).toEqual(
      frame.grid.imaginary.subarray(0, 917_280),
    );
    expect(frame.grid.kinds.subarray(917_280)).toEqual(
      frame.grid.kinds.subarray(0, 917_280),
    );
    expect(frame.timeDomain.real.subarray(1_228_800)).toEqual(
      frame.timeDomain.real.subarray(0, 1_228_800),
    );
    expect(frame.timeDomain.imaginary.subarray(1_228_800)).toEqual(
      frame.timeDomain.imaginary.subarray(0, 1_228_800),
    );

    expect(
      sha256HexOfBytes(encodeCf64le(
        frame.grid.real,
        frame.grid.imaginary,
      )),
    ).toBe(NR_N78_TDD_100M_REFERENCE_IDENTITIES.gridCf64leSha256);
    expect(sha256HexOfBytes(frame.grid.kinds)).toBe(
      NR_N78_TDD_100M_REFERENCE_IDENTITIES.kindsU8Sha256,
    );
    expect(
      sha256HexOfBytes(encodeCf64le(
        frame.timeDomain.real,
        frame.timeDomain.imaginary,
      )),
    ).toBe(NR_N78_TDD_100M_REFERENCE_IDENTITIES.timeCf64leSha256);
  }, 60_000);

  it('keeps exact QPSK/DM-RS EPRE and a fail-closed qualification boundary', () => {
    const frame = generateNrN78Tdd100mFrame();
    const qpskMagnitude = 1 / Math.sqrt(2);
    let activeResourceElements = 0;
    let maximumMagnitudeError = 0;
    for (let index = 0; index < frame.grid.kinds.length; index += 1) {
      if (
        frame.grid.kinds[index]
        === NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.inactive
      ) {
        continue;
      }
      activeResourceElements += 1;
      maximumMagnitudeError = Math.max(
        maximumMagnitudeError,
        Math.abs(Math.abs(frame.grid.real[index]!) - qpskMagnitude),
        Math.abs(
          Math.abs(frame.grid.imaginary[index]!) - qpskMagnitude,
        ),
      );
    }
    expect(activeResourceElements).toBe(1_362_816);
    expect(maximumMagnitudeError).toBeLessThanOrEqual(1e-14);
    expect(frame.metadata.requirementLedger).toHaveLength(3);
    expect(frame.metadata.excludedScope.join(' ')).toContain(
      'RF conformance',
    );
    expect(frame.metadata.excludedScope.join(' ')).toContain(
      'product certification',
    );
  }, 60_000);

  it('rejects invalid slot indexes instead of extrapolating the standard pattern', () => {
    for (const slot of [-1, 1.5, 40, Number.NaN]) {
      expect(() => nrN78Tdd100mDownlinkSymbolCount(slot)).toThrow(
        RangeError,
      );
    }
  });
});

function encodeCf64le(
  real: Float64Array,
  imaginary: Float64Array,
): Uint8Array {
  expect(imaginary).toHaveLength(real.length);
  const bytes = new Uint8Array(real.length * 16);
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  for (let index = 0; index < real.length; index += 1) {
    view.setFloat64(index * 16, real[index]!, true);
    view.setFloat64(index * 16 + 8, imaginary[index]!, true);
  }
  return bytes;
}
