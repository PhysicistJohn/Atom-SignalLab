import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_FR1_TEST_MODEL_DEFINITIONS,
  NR_FR1_TEST_MODEL_PROFILES,
  generateNrFr1TestModelFrame,
  mapNrQamBits,
  type NrFr1TestModelProfile,
} from './nr-fr1-test-model-reference.js';

const EXPECTED_ORACLE_SCRIPT_SHA256 =
  '101b80587f7d73c92f0d309cf9f10577ad1ebbdceaf0da3bdbf8b4ea76261823';
const EXPECTED_PY3GPP_VERSION = '0.6.0';
const EXPECTED_PY3GPP_PYTHON_SOURCE_TREE_SHA256 =
  'ea8a8db80ab4235767b1a75b535ad50583edb9c80724d79d8f769e9d2219f9a6';
const EXPECTED_NUMPY_VERSION = '2.0.2';
const EXPECTED_OCUDU_COMMIT = 'f0c8467560ea894d16e50207b3db60fd5ff19c01';
const EXPECTED_OCUDU_MAPPER_SOURCE_SHA256 =
  '6dbc3a8a59d1d18cca9e11aedeedb18bacd2cfa9d60694cf350449159dbebcbf';
const EXPECTED_OCUDU_MAPPER_HEADER_SHA256 =
  '8933f8e1fb042a09759c8e903ee55e7e86f3a4aaa934cd903e9f60df6e5f5891';
const EXPECTED_OCUDU_HARNESS_SOURCE_SHA256 =
  '76b52539b609ab8e4c1b0d95e7ef8eb46d3d9a8c6259d652458f6c8241560e8a';
const EXPECTED_OCUDU_HARNESS_BINARY_SHA256 =
  'eb4543383d7203a89e54ac82b736fafe040b2b320878a6f6ab7c055423c60067';
const EXPECTED_OCUDU_1024QAM_VECTOR_SHA256 =
  '3f0c6d15eabe4b9fde4d7bbd23e8a22ee2e4fe9c37ca6b03761021c233614049';
const EXPECTED_OCUDU_ERROR_OVERLAY_SHA256 =
  'a02b1df2302c1aad55ed30fe907d5431a0c7fbbfa27a648dd4720613bf04f5d6';
const EXPECTED_OCUDU_ASSERT_OVERLAY_SHA256 =
  '8a0720c0cd4c9b37e09890773d631457ef615dd86e8912aed9d5d1b1a7ca7f18';

const EXPECTED_ORACLE_IDENTITIES = Object.freeze({
  'nr-fr1-tm1.1': Object.freeze({
    grid: '4b4e57c8607d01a7f806c9af2c77b772a27e184b3ddfe6a5f53ba908d4cb729a',
    kinds: 'aafda1df9a9279eae265fb18139414043b82194dc554e75eeed6930dea7a8e6f',
    time: 'c3716c70c6f0ceb8c0d6ee479b95b3581f9ac988abb39815be569583810d763e',
  }),
  'nr-fr1-tm3.1': Object.freeze({
    grid: '849e32fef9dffc76e02bc1108e98f587bcfec1708547da37ffdb495981043d85',
    kinds: 'aafda1df9a9279eae265fb18139414043b82194dc554e75eeed6930dea7a8e6f',
    time: '6c473d8e759d56f198054e506cb8943c8dc9d9d472ab1d31074874095189beae',
  }),
  'nr-fr1-tm3.1a': Object.freeze({
    grid: '51f51dacc8954883997b891c1fe9d4a3108464f6541b16bf4abaad8ee8e20416',
    kinds: 'aafda1df9a9279eae265fb18139414043b82194dc554e75eeed6930dea7a8e6f',
    time: '788de39cc1bc129e12ae42b9511f2756893597f1e5cc5b155760c4cfd96a7e3f',
  }),
  'nr-fr1-tm3.1b': Object.freeze({
    grid: '12c2afee698973e4324e500d6cf64971b1f363e1264077bcd872fcdcb20b2dca',
    kinds: 'aafda1df9a9279eae265fb18139414043b82194dc554e75eeed6930dea7a8e6f',
    time: 'de40bd57729ffce91160da4e75d787af6fdd05e5d257d68495584e1dc3c82dc6',
  }),
});

const pythonPath = process.env.SIGNALLAB_PY3GPP_PYTHON;
const oracleScriptPath = process.env.SIGNALLAB_NR_FR1_TM_ORACLE_SCRIPT;
const ocuduRepositoryPath = process.env.SIGNALLAB_OCUDU_REPOSITORY;
const ocuduHarnessSourcePath =
  process.env.SIGNALLAB_OCUDU_LTE_1024QAM_HARNESS_SOURCE;
const ocuduHarnessBinaryPath =
  process.env.SIGNALLAB_OCUDU_LTE_1024QAM_HARNESS_BINARY;
const retained1024Path = process.env.SIGNALLAB_OCUDU_LTE_1024QAM_VECTOR;
const ocuduErrorOverlayPath =
  process.env.SIGNALLAB_OCUDU_ERROR_HANDLING_OVERLAY;
const ocuduAssertOverlayPath = process.env.SIGNALLAB_OCUDU_ASSERT_OVERLAY;
const liveRequired = process.env.SIGNALLAB_REQUIRE_NR_FR1_TM_ORACLE === '1';
const environmentComplete = [
  pythonPath,
  oracleScriptPath,
  ocuduRepositoryPath,
  ocuduHarnessSourcePath,
  ocuduHarnessBinaryPath,
  retained1024Path,
  ocuduErrorOverlayPath,
  ocuduAssertOverlayPath,
].every((value) => value !== undefined);

interface OracleMetadata {
  readonly profile: NrFr1TestModelProfile;
  readonly py3gppVersion: string;
  readonly py3gppPythonSourceTreeSha256: string;
  readonly numpyVersion: string;
  readonly gridComplexSampleCount: number;
  readonly timeComplexSampleCount: number;
  readonly files: Readonly<Record<'grid' | 'kinds' | 'time', {
    readonly name: string;
    readonly sha256: string;
  }>>;
}

describe('independent fixed NR-FR1 test-model oracles', () => {
  it('has every pinned external dependency whenever the live lane is required', () => {
    if (liveRequired) expect(environmentComplete).toBe(true);
  });

  it.skipIf(!environmentComplete)(
    'compares every resource element and every time-domain sample for all four frames',
    () => {
      expect(sha256HexOfBytes(readFileSync(oracleScriptPath!))).toBe(
        EXPECTED_ORACLE_SCRIPT_SHA256,
      );

      for (const profile of NR_FR1_TEST_MODEL_PROFILES) {
        const generatedDirectory = mkdtempSync(
          join(tmpdir(), `signallab-${profile}-oracle-`),
        );
        try {
          execFileSync(pythonPath!, [
            oracleScriptPath!,
            '--profile',
            profile,
            '--output-dir',
            generatedDirectory,
          ], { stdio: 'pipe' });

          const metadata = JSON.parse(readFileSync(
            join(generatedDirectory, 'metadata.json'),
            'utf8',
          )) as OracleMetadata;
          expect(metadata).toMatchObject({
            profile,
            py3gppVersion: EXPECTED_PY3GPP_VERSION,
            py3gppPythonSourceTreeSha256:
              EXPECTED_PY3GPP_PYTHON_SOURCE_TREE_SHA256,
            numpyVersion: EXPECTED_NUMPY_VERSION,
            gridComplexSampleCount: 178_080,
            timeComplexSampleCount: 307_200,
            files: {
              grid: { sha256: EXPECTED_ORACLE_IDENTITIES[profile].grid },
              kinds: { sha256: EXPECTED_ORACLE_IDENTITIES[profile].kinds },
              time: { sha256: EXPECTED_ORACLE_IDENTITIES[profile].time },
            },
          });

          const gridBytes = readAndVerifyOracleFile(
            generatedDirectory,
            metadata.files.grid,
            EXPECTED_ORACLE_IDENTITIES[profile].grid,
          );
          const kindBytes = readAndVerifyOracleFile(
            generatedDirectory,
            metadata.files.kinds,
            EXPECTED_ORACLE_IDENTITIES[profile].kinds,
          );
          const timeBytes = readAndVerifyOracleFile(
            generatedDirectory,
            metadata.files.time,
            EXPECTED_ORACLE_IDENTITIES[profile].time,
          );
          const signalLab = generateNrFr1TestModelFrame(profile);
          expect(kindBytes).toEqual(Buffer.from(signalLab.grid.kinds));
          compareEveryComplexSample(
            `${profile} resource grid`,
            signalLab.grid.real,
            signalLab.grid.imaginary,
            gridBytes,
            2e-15,
          );
          compareEveryComplexSample(
            `${profile} OFDM waveform`,
            signalLab.timeDomain.real,
            signalLab.timeDomain.imaginary,
            timeBytes,
            2e-15,
          );
          expect(countPdschConstellationPoints(signalLab)).toBe(
            2 ** NR_FR1_TEST_MODEL_DEFINITIONS[profile].bitsPerSymbol,
          );
        } finally {
          rmSync(generatedDirectory, { recursive: true, force: true });
        }
      }
    },
    120_000,
  );

  it.skipIf(!environmentComplete)(
    'reruns the pinned OCUDU mapper and compares every 1024QAM input word',
    () => {
      expect(execFileSync('git', [
        '-C',
        ocuduRepositoryPath!,
        'rev-parse',
        'HEAD',
      ], { encoding: 'utf8' }).trim()).toBe(EXPECTED_OCUDU_COMMIT);
      expect(sha256HexOfBytes(readFileSync(join(
        ocuduRepositoryPath!,
        'lib/phy/upper/channel_modulation/modulation_mapper_lut_impl.cpp',
      )))).toBe(EXPECTED_OCUDU_MAPPER_SOURCE_SHA256);
      expect(sha256HexOfBytes(readFileSync(join(
        ocuduRepositoryPath!,
        'lib/phy/upper/channel_modulation/modulation_mapper_lut_impl.h',
      )))).toBe(EXPECTED_OCUDU_MAPPER_HEADER_SHA256);
      expect(sha256HexOfBytes(readFileSync(ocuduHarnessSourcePath!))).toBe(
        EXPECTED_OCUDU_HARNESS_SOURCE_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(ocuduHarnessBinaryPath!))).toBe(
        EXPECTED_OCUDU_HARNESS_BINARY_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(ocuduErrorOverlayPath!))).toBe(
        EXPECTED_OCUDU_ERROR_OVERLAY_SHA256,
      );
      expect(sha256HexOfBytes(readFileSync(ocuduAssertOverlayPath!))).toBe(
        EXPECTED_OCUDU_ASSERT_OVERLAY_SHA256,
      );

      const retained = readFileSync(retained1024Path!);
      const fresh = execFileSync(ocuduHarnessBinaryPath!);
      expect(sha256HexOfBytes(retained)).toBe(
        EXPECTED_OCUDU_1024QAM_VECTOR_SHA256,
      );
      expect(sha256HexOfBytes(fresh)).toBe(
        EXPECTED_OCUDU_1024QAM_VECTOR_SHA256,
      );
      expect(fresh).toEqual(retained);

      const bitsPerSymbol = 10;
      const symbolCount = 2 ** bitsPerSymbol;
      const bits = new Uint8Array(symbolCount * bitsPerSymbol);
      for (let symbol = 0; symbol < symbolCount; symbol += 1) {
        for (let bit = 0; bit < bitsPerSymbol; bit += 1) {
          bits[symbol * bitsPerSymbol + bit] =
            (symbol >> (bitsPerSymbol - bit - 1)) & 1;
        }
      }
      const signalLab = mapNrQamBits(bits, '1024qam');
      const view = new DataView(fresh.buffer, fresh.byteOffset, fresh.byteLength);
      expect(fresh.byteLength).toBe(symbolCount * 8);
      for (let symbol = 0; symbol < symbolCount; symbol += 1) {
        expect(signalLab[symbol]!.real).toBeCloseTo(
          view.getFloat32(symbol * 8, true),
          6,
        );
        expect(signalLab[symbol]!.imaginary).toBeCloseTo(
          view.getFloat32(symbol * 8 + 4, true),
          6,
        );
      }
    },
  );
});

function readAndVerifyOracleFile(
  directory: string,
  descriptor: { readonly name: string; readonly sha256: string },
  expectedSha256: string,
): Buffer {
  const bytes = readFileSync(join(directory, descriptor.name));
  expect(descriptor.sha256).toBe(expectedSha256);
  expect(sha256HexOfBytes(bytes)).toBe(expectedSha256);
  return bytes;
}

function compareEveryComplexSample(
  label: string,
  signalLabReal: Float64Array,
  signalLabImaginary: Float64Array,
  oracleBytes: Uint8Array,
  tolerance: number,
): void {
  expect(signalLabImaginary).toHaveLength(signalLabReal.length);
  expect(oracleBytes.byteLength).toBe(signalLabReal.length * 16);
  const view = new DataView(
    oracleBytes.buffer,
    oracleBytes.byteOffset,
    oracleBytes.byteLength,
  );
  let maximumError = 0;
  let maximumErrorIndex = -1;
  for (let index = 0; index < signalLabReal.length; index += 1) {
    const realError = Math.abs(
      signalLabReal[index]! - view.getFloat64(index * 16, true),
    );
    const imaginaryError = Math.abs(
      signalLabImaginary[index]! - view.getFloat64(index * 16 + 8, true),
    );
    const error = Math.max(realError, imaginaryError);
    if (error > maximumError) {
      maximumError = error;
      maximumErrorIndex = index;
    }
  }
  expect(
    maximumError,
    `${label}: maximum component error ${maximumError} at ${maximumErrorIndex}`,
  ).toBeLessThanOrEqual(tolerance);
}

function countPdschConstellationPoints(
  frame: ReturnType<typeof generateNrFr1TestModelFrame>,
): number {
  const points = new Set<string>();
  for (let index = 0; index < frame.grid.kinds.length; index += 1) {
    const kind = frame.grid.kinds[index]!;
    if (kind === 3 || kind === 4) {
      points.add(`${frame.grid.real[index]!},${frame.grid.imaginary[index]!}`);
    }
  }
  return points.size;
}
