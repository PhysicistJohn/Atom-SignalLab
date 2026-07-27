import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  LTE_RESOURCE_ELEMENT_KIND,
} from './lte-etm1-reference.js';
import {
  LTE_ETM3_INDEPENDENT_GRID_ELEMENTS,
  LTE_ETM3_INDEPENDENT_ORACLE_PROFILES,
  LTE_ETM3_INDEPENDENT_PDSCH_ELEMENTS,
  buildIndependentPdschMask,
  generateIndependentEtm3Gold,
  generateIndependentLteEtm3Oracle,
  renderIndependentEtm3Ofdm,
} from './lte-etm3-independent-oracle.js';
import {
  generateLteEtm3ReferenceFrame,
  mapLteQamBits,
  type LteEtm3Modulation,
} from './lte-etm3-reference.js';

const EXPECTED_SRSRAN_COMMIT = '6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16';
const EXPECTED_HARNESS_SOURCE_SHA256 =
  'f4d436bf982c61f62df5ee954d33bfe274d74e6dbd7d6643804925a782b7395b';
const EXPECTED_HARNESS_BINARY_SHA256 =
  'd28e8d1f8b4e323eaa7e0a2b21e1b27bc936dc384f0f401113cf43cc8b38550f';
const EXPECTED_64QAM_VECTOR_SHA256 =
  '66de7646dfcb96d6a2aa2c452f2e273450f7771ff14fa6ed8459cf130cad7d00';
const EXPECTED_256QAM_VECTOR_SHA256 =
  'ee4474e3b04eae29bcbacf8bf94ad7b9fa6626552c03edb4bc475eff7e5472e8';
const EXPECTED_OCUDU_COMMIT = 'f0c8467560ea894d16e50207b3db60fd5ff19c01';
const EXPECTED_OCUDU_HARNESS_SOURCE_SHA256 =
  '76b52539b609ab8e4c1b0d95e7ef8eb46d3d9a8c6259d652458f6c8241560e8a';
const EXPECTED_OCUDU_HARNESS_BINARY_SHA256 =
  'eb4543383d7203a89e54ac82b736fafe040b2b320878a6f6ab7c055423c60067';
const EXPECTED_1024QAM_VECTOR_SHA256 =
  '3f0c6d15eabe4b9fde4d7bbd23e8a22ee2e4fe9c37ca6b03761021c233614049';
const EXPECTED_OCUDU_MAPPER_SOURCE_SHA256 =
  '6dbc3a8a59d1d18cca9e11aedeedb18bacd2cfa9d60694cf350449159dbebcbf';
const EXPECTED_OCUDU_MAPPER_HEADER_SHA256 =
  '8933f8e1fb042a09759c8e903ee55e7e86f3a4aaa934cd903e9f60df6e5f5891';
const EXPECTED_OCUDU_ERROR_OVERLAY_SHA256 =
  'a02b1df2302c1aad55ed30fe907d5431a0c7fbbfa27a648dd4720613bf04f5d6';
const EXPECTED_OCUDU_ASSERT_OVERLAY_SHA256 =
  '8a0720c0cd4c9b37e09890773d631457ef615dd86e8912aed9d5d1b1a7ca7f18';
const EXPECTED_SRSRAN_BUILD_PATCH_SHA256 =
  '284e1453cc0ea4fed616a7a88e5fa65d706de698a6c0395ec575772d663d1173';
const EXPECTED_ETM1_HARNESS_SOURCE_SHA256 =
  '0742db2648c909f93e8e15719baf9d1c9ccb0c3f30d2444a86332f8a4ec3ece9';
const EXPECTED_ETM1_HARNESS_BINARY_SHA256 =
  'e0306c21b925d76fa33a55d7e08759679c1560a28f723b9c2d5c9d6fdbbd597f';
const EXPECTED_ETM1_GRID_F32LE_SHA256 =
  '8be0dd55e7f8104f720876696e9b65d3c6d1bcdc480ac54e235e90ee8da99413';
const EXPECTED_ETM1_TIME_F32LE_SHA256 =
  '6e7ce0f4070c8f61cdc53c688064d673e62762833828c7243bc2261ff5d3f3e9';
const EXPECTED_FULL_ORACLE_IDENTITIES = Object.freeze({
  'lte-etm3.1': Object.freeze({
    gridCf64leSha256:
      '131ea36432354146e19b9e01388c589fa0dbd3aa39e44629baf560a944353178',
    timeCf64leSha256:
      '09b484d5ca3c68bbb4a124c59041521b692616ffcc1ef68b528120e9b7eb007a',
  }),
  'lte-etm3.1a': Object.freeze({
    gridCf64leSha256:
      'f37dcfbf7b657e964128053a0b190a71505ef3e0af5779cc5591daea3920dcb9',
    timeCf64leSha256:
      'b12f653e42edd86d0b908d828a86579b46438457aa66fa2d489b98d548bef064',
  }),
  'lte-etm3.1b': Object.freeze({
    gridCf64leSha256:
      '0eb99f2097b6d39014a52a321c36a204905e3fe3ed4daf9d8f426da2e89c0cb8',
    timeCf64leSha256:
      '5c83fb3b09a77ef0149e0a9ac6f9b81bcd6e0cd98cf465ac6102f0a81b0c52ef',
  }),
} as const);
const EXPECTED_FULL_ORACLE_MAXIMUM_TIME_ERROR = Object.freeze({
  'lte-etm3.1': 1.1378106545625877e-6,
  'lte-etm3.1a': 1.1378106545625877e-6,
  'lte-etm3.1b': 1.1378106545591182e-6,
} as const);

const repositoryPath = process.env.SIGNALLAB_SRSRAN_REPOSITORY;
const harnessSourcePath = process.env.SIGNALLAB_SRSRAN_LTE_QAM_HARNESS_SOURCE;
const harnessBinaryPath = process.env.SIGNALLAB_SRSRAN_LTE_QAM_HARNESS_BINARY;
const retained64Path = process.env.SIGNALLAB_SRSRAN_LTE_64QAM_VECTOR;
const retained256Path = process.env.SIGNALLAB_SRSRAN_LTE_256QAM_VECTOR;
const ocuduRepositoryPath = process.env.SIGNALLAB_OCUDU_REPOSITORY;
const ocuduHarnessSourcePath = process.env.SIGNALLAB_OCUDU_LTE_1024QAM_HARNESS_SOURCE;
const ocuduHarnessBinaryPath = process.env.SIGNALLAB_OCUDU_LTE_1024QAM_HARNESS_BINARY;
const retained1024Path = process.env.SIGNALLAB_OCUDU_LTE_1024QAM_VECTOR;
const ocuduErrorOverlayPath = process.env.SIGNALLAB_OCUDU_ERROR_HANDLING_OVERLAY;
const ocuduAssertOverlayPath = process.env.SIGNALLAB_OCUDU_ASSERT_OVERLAY;
const liveRequired = process.env.SIGNALLAB_REQUIRE_LTE_ETM3_QAM_ORACLE === '1';
const fullOracleRequired =
  process.env.SIGNALLAB_REQUIRE_LTE_ETM3_FULL_ORACLE === '1';
const etm1GridPath = process.env.SIGNALLAB_SRSRAN_ETM1_GRID;
const etm1TimePath = process.env.SIGNALLAB_SRSRAN_ETM1_TIME;
const etm1HarnessSourcePath = process.env.SIGNALLAB_SRSRAN_HARNESS_SOURCE;
const etm1HarnessBinaryPath = process.env.SIGNALLAB_SRSRAN_HARNESS_BINARY;
const srsranEnvironmentComplete = [
  repositoryPath,
  harnessSourcePath,
  harnessBinaryPath,
  retained64Path,
  retained256Path,
].every((value) => value !== undefined);
const ocuduEnvironmentComplete = [
  ocuduRepositoryPath,
  ocuduHarnessSourcePath,
  ocuduHarnessBinaryPath,
  retained1024Path,
  ocuduErrorOverlayPath,
  ocuduAssertOverlayPath,
].every((value) => value !== undefined);
const fullOracleEnvironmentComplete = [
  repositoryPath,
  etm1GridPath,
  etm1TimePath,
  etm1HarnessSourcePath,
  etm1HarnessBinaryPath,
].every((value) => value !== undefined);

describe('independent LTE E-TM3 QAM oracles', () => {
  it('has a complete environment whenever the live independent lane is required', () => {
    if (liveRequired || fullOracleRequired) {
      expect(srsranEnvironmentComplete).toBe(true);
      expect(ocuduEnvironmentComplete).toBe(true);
    }
  });

  it.skipIf(!srsranEnvironmentComplete)(
    'reruns the pinned independent mapper and matches every 64QAM and 256QAM symbol',
    () => {
      expect(execFileSync('git', ['-C', repositoryPath!, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim()).toBe(EXPECTED_SRSRAN_COMMIT);
      expect(sha256HexOfBytes(readFileSync(harnessSourcePath!))).toBe(
        EXPECTED_HARNESS_SOURCE_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(harnessBinaryPath!))).toBe(
        EXPECTED_HARNESS_BINARY_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(retained64Path!))).toBe(
        EXPECTED_64QAM_VECTOR_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(retained256Path!))).toBe(
        EXPECTED_256QAM_VECTOR_SHA256,
      );

      const generatedDirectory = mkdtempSync(join(tmpdir(), 'signallab-srsran-lte-qam-'));
      try {
        const generated64 = join(generatedDirectory, '64qam.cf32le');
        const generated256 = join(generatedDirectory, '256qam.cf32le');
        execFileSync(harnessBinaryPath!, [generated64, generated256]);
        const fresh64 = readFileSync(generated64);
        const fresh256 = readFileSync(generated256);
        expect(sha256HexOfBytes(fresh64)).toBe(EXPECTED_64QAM_VECTOR_SHA256);
        expect(sha256HexOfBytes(fresh256)).toBe(EXPECTED_256QAM_VECTOR_SHA256);
        expect(fresh64).toEqual(readFileSync(retained64Path!));
        expect(fresh256).toEqual(readFileSync(retained256Path!));
        compareEverySymbol('64qam', 6, fresh64);
        compareEverySymbol('256qam', 8, fresh256);
      } finally {
        rmSync(generatedDirectory, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!ocuduEnvironmentComplete)(
    'reruns the pinned independent mapper and matches every 1024QAM symbol',
    () => {
      expect(execFileSync('git', ['-C', ocuduRepositoryPath!, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim()).toBe(EXPECTED_OCUDU_COMMIT);
      expect(sha256HexOfBytes(readFileSync(ocuduHarnessSourcePath!))).toBe(
        EXPECTED_OCUDU_HARNESS_SOURCE_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(ocuduHarnessBinaryPath!))).toBe(
        EXPECTED_OCUDU_HARNESS_BINARY_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(retained1024Path!))).toBe(
        EXPECTED_1024QAM_VECTOR_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(ocuduErrorOverlayPath!))).toBe(
        EXPECTED_OCUDU_ERROR_OVERLAY_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(ocuduAssertOverlayPath!))).toBe(
        EXPECTED_OCUDU_ASSERT_OVERLAY_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(join(
        ocuduRepositoryPath!,
        'lib/phy/upper/channel_modulation/modulation_mapper_lut_impl.cpp',
      )))).toBe(EXPECTED_OCUDU_MAPPER_SOURCE_SHA256);
      expect(sha256HexOfBytes(readFileSync(join(
        ocuduRepositoryPath!,
        'lib/phy/upper/channel_modulation/modulation_mapper_lut_impl.h',
      )))).toBe(EXPECTED_OCUDU_MAPPER_HEADER_SHA256);

      const fresh1024 = execFileSync(ocuduHarnessBinaryPath!);
      expect(sha256HexOfBytes(fresh1024)).toBe(EXPECTED_1024QAM_VECTOR_SHA256);
      expect(fresh1024).toEqual(readFileSync(retained1024Path!));
      compareEverySymbol('1024qam', 10, fresh1024);
    },
  );
});

describe('independent exhaustive LTE E-TM3 grid and OFDM oracle', () => {
  it('fails closed when the required full-frame lane is incomplete', () => {
    if (!fullOracleRequired) return;
    expect(repositoryPath, 'SIGNALLAB_SRSRAN_REPOSITORY is required').toBeDefined();
    expect(etm1GridPath, 'SIGNALLAB_SRSRAN_ETM1_GRID is required').toBeDefined();
    expect(etm1TimePath, 'SIGNALLAB_SRSRAN_ETM1_TIME is required').toBeDefined();
    expect(
      etm1HarnessSourcePath,
      'SIGNALLAB_SRSRAN_HARNESS_SOURCE is required',
    ).toBeDefined();
    expect(
      etm1HarnessBinaryPath,
      'SIGNALLAB_SRSRAN_HARNESS_BINARY is required',
    ).toBeDefined();
  });

  it.skipIf(!fullOracleEnvironmentComplete)(
    'freshly regenerates the external base, then compares every RE and OFDM sample',
    () => {
      expect(execFileSync(
        'git',
        ['-C', repositoryPath!, 'rev-parse', 'HEAD'],
        { encoding: 'utf8' },
      ).trim()).toBe(EXPECTED_SRSRAN_COMMIT);
      expect(execFileSync(
        'git',
        ['-C', repositoryPath!, 'config', '--get', 'remote.origin.url'],
        { encoding: 'utf8' },
      ).trim()).toBe('https://github.com/srsran/srsRAN_4G.git');
      expect(sha256HexOfBytes(execFileSync(
        'git',
        ['-C', repositoryPath!, 'diff', '--binary'],
      ))).toBe(EXPECTED_SRSRAN_BUILD_PATCH_SHA256);
      expect(sha256HexOfBytes(readFileSync(etm1HarnessSourcePath!)))
        .toBe(EXPECTED_ETM1_HARNESS_SOURCE_SHA256);
      expect(sha256HexOfBytes(readFileSync(etm1HarnessBinaryPath!)))
        .toBe(EXPECTED_ETM1_HARNESS_BINARY_SHA256);
      const retainedGrid = readCf32(etm1GridPath!);
      const retainedTime = readCf32(etm1TimePath!);
      expect(sha256HexOfBytes(retainedGrid.bytes))
        .toBe(EXPECTED_ETM1_GRID_F32LE_SHA256);
      expect(sha256HexOfBytes(retainedTime.bytes))
        .toBe(EXPECTED_ETM1_TIME_F32LE_SHA256);

      const freshDirectory = mkdtempSync(join(tmpdir(), 'signallab-etm3-full-'));
      try {
        const freshGridPath = join(freshDirectory, 'etm1-grid.cf32le');
        const freshTimePath = join(freshDirectory, 'etm1-time.cf32le');
        execFileSync(
          etm1HarnessBinaryPath!,
          [freshGridPath, freshTimePath],
          { timeout: 20_000 },
        );
        const freshGrid = readCf32(freshGridPath);
        const freshTime = readCf32(freshTimePath);
        expect(freshGrid.bytes).toEqual(retainedGrid.bytes);
        expect(freshTime.bytes).toEqual(retainedTime.bytes);
        expect(freshGrid.real).toHaveLength(LTE_ETM3_INDEPENDENT_GRID_ELEMENTS);

        const independentMask = buildIndependentPdschMask();
        let externalGoldSymbolsCompared = 0;
        let maximumExternalGoldError = 0;
        for (let subframe = 0; subframe < 10; subframe += 1) {
          const first = subframe * 14 * 600;
          const last = first + 14 * 600;
          let count = 0;
          for (let index = first; index < last; index += 1) {
            if (independentMask[index] === 1) count += 1;
          }
          const bits = generateIndependentEtm3Gold(
            subframe * 512 + 1,
            2 * count,
          );
          let symbol = 0;
          for (let index = first; index < last; index += 1) {
            if (independentMask[index] !== 1) continue;
            const expectedReal = Math.SQRT1_2 * (1 - 2 * bits[2 * symbol]!);
            const expectedImaginary =
              Math.SQRT1_2 * (1 - 2 * bits[2 * symbol + 1]!);
            const error = Math.max(
              Math.abs(expectedReal - freshGrid.real[index]!),
              Math.abs(expectedImaginary - freshGrid.imaginary[index]!),
            );
            expect(error, `external E-TM1 PDSCH Gold symbol ${index}`)
              .toBeLessThanOrEqual(1e-6);
            maximumExternalGoldError = Math.max(maximumExternalGoldError, error);
            externalGoldSymbolsCompared += 1;
            symbol += 1;
          }
          expect(symbol).toBe(count);
        }
        expect(externalGoldSymbolsCompared)
          .toBe(LTE_ETM3_INDEPENDENT_PDSCH_ELEMENTS);

        const independentBaseTime = renderIndependentEtm3Ofdm(
          freshGrid.real,
          freshGrid.imaginary,
        );
        let maximumExternalOfdmError = 0;
        for (let index = 0; index < freshTime.real.length; index += 1) {
          const error = Math.max(
            Math.abs(independentBaseTime.real[index]! - freshTime.real[index]!),
            Math.abs(
              independentBaseTime.imaginary[index]!
              - freshTime.imaginary[index]!,
            ),
          );
          expect(error, `external E-TM1 OFDM sample ${index}`)
            .toBeLessThanOrEqual(2e-6);
          maximumExternalOfdmError = Math.max(maximumExternalOfdmError, error);
        }
        expect(maximumExternalGoldError)
          .toBeCloseTo(1.2101617152815436e-8, 15);
        expect(maximumExternalOfdmError)
          .toBeCloseTo(1.2633349352753065e-8, 15);

        for (const profile of LTE_ETM3_INDEPENDENT_ORACLE_PROFILES) {
          const oracle = generateIndependentLteEtm3Oracle(
            profile,
            freshGrid.real,
            freshGrid.imaginary,
          );
          const subject = generateLteEtm3ReferenceFrame(profile);
          const oracleIdentities = {
            gridCf64leSha256: sha256HexOfBytes(encodeCf64le(
              oracle.grid.real,
              oracle.grid.imaginary,
            )),
            timeCf64leSha256: sha256HexOfBytes(encodeCf64le(
              oracle.timeDomain.real,
              oracle.timeDomain.imaginary,
            )),
          };
          expect(oracleIdentities).toEqual(EXPECTED_FULL_ORACLE_IDENTITIES[profile]);

          let pdschCompared = 0;
          let nonPdschCompared = 0;
          let maximumPdschError = 0;
          let maximumNonPssError = 0;
          let maximumPssError = 0;
          for (let index = 0; index < LTE_ETM3_INDEPENDENT_GRID_ELEMENTS; index += 1) {
            const independentlyPdsch = oracle.grid.pdschMask[index] === 1;
            expect(
              subject.grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.pdsch,
              `${profile} PDSCH classification at RE ${index}`,
            ).toBe(independentlyPdsch);
            const error = Math.max(
              Math.abs(subject.grid.real[index]! - oracle.grid.real[index]!),
              Math.abs(
                subject.grid.imaginary[index]! - oracle.grid.imaginary[index]!,
              ),
            );
            const pss = isPssElement(index);
            const tolerance = independentlyPdsch
              ? 1e-12
              : pss
                ? 2.3e-4
                : 1e-6;
            expect(error, `${profile} grid RE ${index}`)
              .toBeLessThanOrEqual(tolerance);
            if (independentlyPdsch) {
              pdschCompared += 1;
              maximumPdschError = Math.max(maximumPdschError, error);
            } else {
              nonPdschCompared += 1;
              if (pss) maximumPssError = Math.max(maximumPssError, error);
              else maximumNonPssError = Math.max(maximumNonPssError, error);
            }
          }
          expect(pdschCompared).toBe(LTE_ETM3_INDEPENDENT_PDSCH_ELEMENTS);
          expect(nonPdschCompared).toBe(
            LTE_ETM3_INDEPENDENT_GRID_ELEMENTS
            - LTE_ETM3_INDEPENDENT_PDSCH_ELEMENTS,
          );

          let maximumTimeError = 0;
          for (let index = 0; index < oracle.timeDomain.real.length; index += 1) {
            const error = Math.max(
              Math.abs(
                subject.timeDomain.real[index]! - oracle.timeDomain.real[index]!,
              ),
              Math.abs(
                subject.timeDomain.imaginary[index]!
                - oracle.timeDomain.imaginary[index]!,
              ),
            );
            expect(error, `${profile} OFDM sample ${index}`)
              .toBeLessThanOrEqual(2e-6);
            maximumTimeError = Math.max(maximumTimeError, error);
          }
          expect(maximumPdschError).toBe(0);
          expect(maximumNonPssError)
            .toBeCloseTo(5.960464499743523e-8, 15);
          expect(maximumPssError)
            .toBeCloseTo(0.00022353510823804046, 15);
          expect(maximumTimeError)
            .toBeCloseTo(
              EXPECTED_FULL_ORACLE_MAXIMUM_TIME_ERROR[profile],
              15,
            );
        }
      } finally {
        rmSync(freshDirectory, { recursive: true, force: true });
      }
    },
    45_000,
  );
});

function compareEverySymbol(
  modulation: LteEtm3Modulation,
  bitsPerSymbol: number,
  oracleBytes: Uint8Array,
): void {
  const symbolCount = 2 ** bitsPerSymbol;
  expect(oracleBytes.byteLength).toBe(symbolCount * 8);
  const bits = new Uint8Array(symbolCount * bitsPerSymbol);
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    for (let bit = 0; bit < bitsPerSymbol; bit += 1) {
      bits[symbol * bitsPerSymbol + bit] =
        (symbol >> (bitsPerSymbol - bit - 1)) & 1;
    }
  }
  const signalLab = mapLteQamBits(bits, modulation);
  const view = new DataView(
    oracleBytes.buffer,
    oracleBytes.byteOffset,
    oracleBytes.byteLength,
  );
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    expect(signalLab[symbol]!.real).toBeCloseTo(view.getFloat32(symbol * 8, true), 6);
    expect(signalLab[symbol]!.imaginary).toBeCloseTo(
      view.getFloat32(symbol * 8 + 4, true),
      6,
    );
  }
}

function readCf32(path: string): {
  readonly bytes: Uint8Array;
  readonly real: Float32Array;
  readonly imaginary: Float32Array;
} {
  const file = readFileSync(path);
  if (file.byteLength % 8 !== 0) throw new Error(`${path} is not cf32le`);
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const real = new Float32Array(bytes.byteLength / 8);
  const imaginary = new Float32Array(real.length);
  for (let index = 0; index < real.length; index += 1) {
    real[index] = view.getFloat32(index * 8, true);
    imaginary[index] = view.getFloat32(index * 8 + 4, true);
  }
  return { bytes, real, imaginary };
}

function encodeCf64le(
  real: Float64Array,
  imaginary: Float64Array,
): Uint8Array {
  expect(imaginary).toHaveLength(real.length);
  const bytes = new Uint8Array(real.length * 16);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < real.length; index += 1) {
    view.setFloat64(index * 16, real[index]!, true);
    view.setFloat64(index * 16 + 8, imaginary[index]!, true);
  }
  return bytes;
}

function isPssElement(index: number): boolean {
  const symbol = Math.floor(index / 600);
  const subcarrier = index % 600;
  return (symbol === 6 || symbol === 76)
    && subcarrier >= 269
    && subcarrier <= 330;
}
