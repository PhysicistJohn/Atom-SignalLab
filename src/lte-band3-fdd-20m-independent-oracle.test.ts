import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS,
  generateLteBand3Fdd20mReferenceFrame,
} from './lte-band3-fdd-20m-reference.js';
import { LTE_RESOURCE_ELEMENT_KIND } from './lte-etm1-reference.js';

const EXPECTED_SRSRAN_COMMIT = '6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16';
const EXPECTED_SRSRAN_BUILD_PATCH_SHA256 =
  '284e1453cc0ea4fed616a7a88e5fa65d706de698a6c0395ec575772d663d1173';
const EXPECTED_HARNESS_SOURCE_SHA256 =
  'c80313cea61b8d4432c1ce68a27f6c79375d32a8520ce1555ed374ed6373dfb0';
const EXPECTED_HARNESS_BINARY_SHA256 =
  'f69305c796d5bac4795ca54675473a6eedec62e5ebf10a8dec276e08e9b3e8f4';
const EXPECTED_GRID_F32LE_SHA256 =
  '1feea11787d421391396089ae1992cd83c039fee949f0b7b005c0e78f315d889';
const EXPECTED_TIME_F32LE_SHA256 =
  '314a099611e6359eb50bcb47d024288d054f35dcd33f351614862e36fc14daa2';

const repositoryPath = process.env.SIGNALLAB_SRSRAN_REPOSITORY;
const harnessSourcePath =
  process.env.SIGNALLAB_SRSRAN_BAND3_FDD20_HARNESS_SOURCE;
const harnessBinaryPath =
  process.env.SIGNALLAB_SRSRAN_BAND3_FDD20_HARNESS_BINARY;
const retainedGridPath = process.env.SIGNALLAB_SRSRAN_BAND3_FDD20_GRID;
const retainedTimePath = process.env.SIGNALLAB_SRSRAN_BAND3_FDD20_TIME;
const oracleRequired =
  process.env.SIGNALLAB_REQUIRE_LTE_BAND3_FDD20_ORACLE === '1';
const evidenceAvailable = (
  repositoryPath !== undefined
  && harnessSourcePath !== undefined
  && harnessBinaryPath !== undefined
  && retainedGridPath !== undefined
  && retainedTimePath !== undefined
);

interface SplitFloat32 {
  readonly bytes: Uint8Array;
  readonly real: Float32Array;
  readonly imaginary: Float32Array;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readComplexFloat32(path: string): SplitFloat32 {
  const file = readFileSync(path);
  if (file.byteLength % 8 !== 0) {
    throw new Error(`${path} is not interleaved cf32le`);
  }
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const count = bytes.byteLength / 8;
  const real = new Float32Array(count);
  const imaginary = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < count; index += 1) {
    real[index] = view.getFloat32(index * 8, true);
    imaginary[index] = view.getFloat32(index * 8 + 4, true);
  }
  return { bytes, real, imaginary };
}

describe('independent srsRAN oracle for the fixed LTE Band-3 FDD subject', () => {
  it('fails closed when its explicitly required evidence lane is incomplete', () => {
    if (!oracleRequired) return;
    expect(repositoryPath, 'SIGNALLAB_SRSRAN_REPOSITORY is required').toBeDefined();
    expect(
      harnessSourcePath,
      'SIGNALLAB_SRSRAN_BAND3_FDD20_HARNESS_SOURCE is required',
    ).toBeDefined();
    expect(
      harnessBinaryPath,
      'SIGNALLAB_SRSRAN_BAND3_FDD20_HARNESS_BINARY is required',
    ).toBeDefined();
    expect(
      retainedGridPath,
      'SIGNALLAB_SRSRAN_BAND3_FDD20_GRID is required',
    ).toBeDefined();
    expect(
      retainedTimePath,
      'SIGNALLAB_SRSRAN_BAND3_FDD20_TIME is required',
    ).toBeDefined();
  });

  it.skipIf(!evidenceAvailable)(
    'matches every resource element and OFDM sample from the pinned implementation',
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
      expect(sha256(execFileSync(
        'git',
        ['-C', repositoryPath!, 'diff', '--binary'],
      ))).toBe(EXPECTED_SRSRAN_BUILD_PATCH_SHA256);
      expect(sha256(readFileSync(harnessSourcePath!)))
        .toBe(EXPECTED_HARNESS_SOURCE_SHA256);
      expect(sha256(readFileSync(harnessBinaryPath!)))
        .toBe(EXPECTED_HARNESS_BINARY_SHA256);

      const retainedGrid = readComplexFloat32(retainedGridPath!);
      const retainedTime = readComplexFloat32(retainedTimePath!);
      expect(sha256(retainedGrid.bytes)).toBe(EXPECTED_GRID_F32LE_SHA256);
      expect(sha256(retainedTime.bytes)).toBe(EXPECTED_TIME_F32LE_SHA256);

      const freshDirectory = mkdtempSync(join(tmpdir(), 'signallab-band3-fdd20-'));
      try {
        const freshGridPath = join(freshDirectory, 'grid.cf32le');
        const freshTimePath = join(freshDirectory, 'time.cf32le');
        execFileSync(
          harnessBinaryPath!,
          [freshGridPath, freshTimePath],
          { timeout: 30_000 },
        );
        const freshGrid = readComplexFloat32(freshGridPath);
        const freshTime = readComplexFloat32(freshTimePath);
        expect(freshGrid.bytes).toEqual(retainedGrid.bytes);
        expect(freshTime.bytes).toEqual(retainedTime.bytes);

        const subject = generateLteBand3Fdd20mReferenceFrame();
        expect(freshGrid.real).toHaveLength(subject.grid.real.length);
        expect(freshTime.real).toHaveLength(subject.timeDomain.real.length);

        let maximumGridError = 0;
        let maximumPssError = 0;
        for (let index = 0; index < subject.grid.real.length; index += 1) {
          const componentError = Math.max(
            Math.abs(subject.grid.real[index]! - freshGrid.real[index]!),
            Math.abs(subject.grid.imaginary[index]! - freshGrid.imaginary[index]!),
          );
          const pss =
            subject.grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.pss;
          expect(
            componentError,
            `grid mismatch at symbol ${
              Math.floor(index / LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS)
            }, subcarrier ${index % LTE_BAND3_FDD_20M_ACTIVE_SUBCARRIERS}`,
          ).toBeLessThanOrEqual(pss ? 2.3e-4 : 1e-6);
          if (pss) maximumPssError = Math.max(maximumPssError, componentError);
          else maximumGridError = Math.max(maximumGridError, componentError);
        }

        let maximumTimeError = 0;
        for (let index = 0; index < subject.timeDomain.real.length; index += 1) {
          const componentError = Math.max(
            Math.abs(subject.timeDomain.real[index]! - freshTime.real[index]!),
            Math.abs(
              subject.timeDomain.imaginary[index]! - freshTime.imaginary[index]!,
            ),
          );
          expect(componentError, `OFDM mismatch at sample ${index}`)
            .toBeLessThanOrEqual(2e-6);
          maximumTimeError = Math.max(maximumTimeError, componentError);
        }

        expect(maximumGridError).toBeGreaterThan(0);
        expect(maximumGridError).toBeLessThanOrEqual(1e-6);
        expect(maximumPssError).toBeGreaterThan(0);
        expect(maximumPssError).toBeLessThanOrEqual(2.3e-4);
        expect(maximumTimeError).toBeGreaterThan(0);
        expect(maximumTimeError).toBeLessThanOrEqual(2e-6);
      } finally {
        rmSync(freshDirectory, { recursive: true, force: true });
      }
    },
    45_000,
  );
});
