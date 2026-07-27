import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  NR_N78_TDD_100M_REFERENCE_IDENTITIES,
  generateNrN78Tdd100mFrame,
} from './nr-n78-tdd-100m-reference.js';

const EXPECTED_ORACLE_SCRIPT_SHA256 =
  'dc7037e430308da09c6de71f59a4cb297b0eda5ba697b78f01ae1ed9ea0017f6';
const EXPECTED_PY3GPP_VERSION = '0.6.0';
const EXPECTED_PY3GPP_PYTHON_SOURCE_TREE_SHA256 =
  'ea8a8db80ab4235767b1a75b535ad50583edb9c80724d79d8f769e9d2219f9a6';
const EXPECTED_NUMPY_VERSION = '2.0.2';
const EXPECTED_ORACLE_IDENTITIES = Object.freeze({
  grid:
    'd23c6b425b73d7b4791c775da400ae55a72d552dd1ab31b4c8b09ee453d86bf7',
  kinds:
    '16dfc38e275993cc5b80289840e5a4b159dc6c1be071978a2e81924568fb5b8b',
  time:
    'b0e228f4451227153e0a317e5d10bc0bbfef20cd70a6d9aed82e7fd9ff72c474',
  cpLengths:
    '13afa868027f56184523f84784c60d72961b6420153b062ba4d5e4951cccb54a',
});

const pythonPath = process.env.SIGNALLAB_PY3GPP_PYTHON;
const oracleScriptPath =
  process.env.SIGNALLAB_NR_N78_TDD_100M_ORACLE_SCRIPT;
const liveRequired =
  process.env.SIGNALLAB_REQUIRE_NR_N78_TDD_100M_ORACLE === '1';
const environmentComplete =
  pythonPath !== undefined && oracleScriptPath !== undefined;

interface OracleMetadata {
  readonly profile: string;
  readonly model: string;
  readonly radioFramesPerArtifact: number;
  readonly artifactDurationMs: number;
  readonly py3gppVersion: string;
  readonly py3gppPythonSourceTreeSha256: string;
  readonly numpyVersion: string;
  readonly gridComplexSampleCount: number;
  readonly timeComplexSampleCount: number;
  readonly files: Readonly<Record<
    'grid' | 'kinds' | 'time' | 'cpLengths',
    {
      readonly name: string;
      readonly sha256: string;
    }
  >>;
}

describe('independent fixed n78 TDD 100 MHz oracle', () => {
  it('has every pinned external dependency whenever the live lane is required', () => {
    if (liveRequired) expect(environmentComplete).toBe(true);
  });

  it.skipIf(!environmentComplete)(
    'compares every RE, kind, CP length, and time-domain sample against py3gpp',
    () => {
      expect(sha256HexOfBytes(readFileSync(oracleScriptPath!))).toBe(
        EXPECTED_ORACLE_SCRIPT_SHA256,
      );
      const generatedDirectory = mkdtempSync(
        join(tmpdir(), 'signallab-n78-tdd-100m-oracle-'),
      );
      try {
        execFileSync(pythonPath!, [
          oracleScriptPath!,
          '--output-dir',
          generatedDirectory,
        ], { stdio: 'pipe' });
        const metadata = JSON.parse(readFileSync(
          join(generatedDirectory, 'metadata.json'),
          'utf8',
        )) as OracleMetadata;
        expect(metadata).toEqual({
          profile: 'nr-n78-tdd-100m',
          model: 'NR-FR1-TM1.1',
          radioFramesPerArtifact: 2,
          artifactDurationMs: 20,
          py3gppVersion: EXPECTED_PY3GPP_VERSION,
          py3gppPythonSourceTreeSha256:
            EXPECTED_PY3GPP_PYTHON_SOURCE_TREE_SHA256,
          numpyVersion: EXPECTED_NUMPY_VERSION,
          gridComplexSampleCount: 1_834_560,
          timeComplexSampleCount: 2_457_600,
          files: {
            grid: {
              name: 'grid.cf64le',
              sha256: EXPECTED_ORACLE_IDENTITIES.grid,
            },
            kinds: {
              name: 'kinds.u8',
              sha256: EXPECTED_ORACLE_IDENTITIES.kinds,
            },
            time: {
              name: 'time.cf64le',
              sha256: EXPECTED_ORACLE_IDENTITIES.time,
            },
            cpLengths: {
              name: 'cp-lengths.i32le',
              sha256: EXPECTED_ORACLE_IDENTITIES.cpLengths,
            },
          },
        });

        const gridBytes = readAndVerifyOracleFile(
          generatedDirectory,
          metadata.files.grid,
          EXPECTED_ORACLE_IDENTITIES.grid,
        );
        const kindBytes = readAndVerifyOracleFile(
          generatedDirectory,
          metadata.files.kinds,
          EXPECTED_ORACLE_IDENTITIES.kinds,
        );
        const timeBytes = readAndVerifyOracleFile(
          generatedDirectory,
          metadata.files.time,
          EXPECTED_ORACLE_IDENTITIES.time,
        );
        const cpBytes = readAndVerifyOracleFile(
          generatedDirectory,
          metadata.files.cpLengths,
          EXPECTED_ORACLE_IDENTITIES.cpLengths,
        );
        const signalLab = generateNrN78Tdd100mFrame();
        expect(kindBytes).toEqual(Buffer.from(signalLab.grid.kinds));
        const gridMaximumError = compareEveryComplexSample(
          'nr-n78-tdd-100m resource grid',
          signalLab.grid.real,
          signalLab.grid.imaginary,
          gridBytes,
          2e-15,
        );
        const timeMaximumError = compareEveryComplexSample(
          'nr-n78-tdd-100m OFDM waveform',
          signalLab.timeDomain.real,
          signalLab.timeDomain.imaginary,
          timeBytes,
          2.5e-15,
        );
        expect(gridMaximumError).toBe(0);
        expect(timeMaximumError).toBe(2.0920765120280294e-15);
        expect(readI32le(cpBytes)).toEqual(
          Array.from(
            { length: 560 },
            (_, symbol) => symbol % 14 === 0 ? 352 : 288,
          ),
        );
        expect(
          sha256HexOfBytes(encodeCf64le(
            signalLab.grid.real,
            signalLab.grid.imaginary,
          )),
        ).toBe(NR_N78_TDD_100M_REFERENCE_IDENTITIES.gridCf64leSha256);
        expect(
          sha256HexOfBytes(encodeCf64le(
            signalLab.timeDomain.real,
            signalLab.timeDomain.imaginary,
          )),
        ).toBe(NR_N78_TDD_100M_REFERENCE_IDENTITIES.timeCf64leSha256);
      } finally {
        rmSync(generatedDirectory, { recursive: true, force: true });
      }
    },
    120_000,
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
): number {
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
      signalLabImaginary[index]!
      - view.getFloat64(index * 16 + 8, true),
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
  return maximumError;
}

function readI32le(bytes: Uint8Array): number[] {
  expect(bytes.byteLength % 4).toBe(0);
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  return Array.from(
    { length: bytes.byteLength / 4 },
    (_, index) => view.getInt32(index * 4, true),
  );
}

function encodeCf64le(
  real: Float64Array,
  imaginary: Float64Array,
): Uint8Array {
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
