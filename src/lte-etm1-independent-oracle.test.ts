import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LTE_RESOURCE_ELEMENT_KIND,
  generateLteEtm11ReferenceFrame,
} from './lte-etm1-reference.js';

const EXPECTED_GRID_SHA256 =
  '8be0dd55e7f8104f720876696e9b65d3c6d1bcdc480ac54e235e90ee8da99413';
const EXPECTED_TIME_SHA256 =
  '6e7ce0f4070c8f61cdc53c688064d673e62762833828c7243bc2261ff5d3f3e9';
const EXPECTED_SRSRAN_COMMIT = '6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16';
const EXPECTED_SRSRAN_BUILD_PATCH_SHA256 =
  '284e1453cc0ea4fed616a7a88e5fa65d706de698a6c0395ec575772d663d1173';
const EXPECTED_HARNESS_SHA256 =
  '0742db2648c909f93e8e15719baf9d1c9ccb0c3f30d2444a86332f8a4ec3ece9';
const EXPECTED_HARNESS_BINARY_SHA256 =
  'e0306c21b925d76fa33a55d7e08759679c1560a28f723b9c2d5c9d6fdbbd597f';
const GRID_COMPONENT_TOLERANCE = 1e-6;
const PSS_COMPONENT_TOLERANCE = 2.3e-4;
const TIME_DOMAIN_COMPONENT_TOLERANCE = 2e-6;

const gridPath = process.env.SIGNALLAB_SRSRAN_ETM1_GRID;
const timePath = process.env.SIGNALLAB_SRSRAN_ETM1_TIME;
const repositoryPath = process.env.SIGNALLAB_SRSRAN_REPOSITORY;
const harnessSourcePath = process.env.SIGNALLAB_SRSRAN_HARNESS_SOURCE;
const harnessBinaryPath = process.env.SIGNALLAB_SRSRAN_HARNESS_BINARY;
const oracleRequired = process.env.SIGNALLAB_REQUIRE_3GPP_ORACLE === '1';
const evidenceAvailable = (
  gridPath !== undefined
  && timePath !== undefined
  && repositoryPath !== undefined
  && harnessSourcePath !== undefined
  && harnessBinaryPath !== undefined
);

interface SplitFloat32 {
  readonly real: Float32Array;
  readonly imaginary: Float32Array;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readComplexFloat32(path: string): {
  readonly bytes: Uint8Array;
  readonly values: SplitFloat32;
} {
  const file = readFileSync(path);
  if (file.byteLength % 8 !== 0) {
    throw new Error(`Oracle vector ${path} is not interleaved complex float32`);
  }
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.byteLength / 8;
  const real = new Float32Array(count);
  const imaginary = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    real[index] = view.getFloat32(index * 8, true);
    imaginary[index] = view.getFloat32(index * 8 + 4, true);
  }
  return { bytes, values: { real, imaginary } };
}

describe('independent srsRAN full-frame oracle', () => {
  it('fails closed when the explicit independent-oracle lane lacks its pinned vectors', () => {
    if (oracleRequired) {
      expect(gridPath, 'SIGNALLAB_SRSRAN_ETM1_GRID must identify the pinned grid vector')
        .toBeDefined();
      expect(timePath, 'SIGNALLAB_SRSRAN_ETM1_TIME must identify the pinned OFDM vector')
        .toBeDefined();
      expect(repositoryPath, 'SIGNALLAB_SRSRAN_REPOSITORY must identify the pinned checkout')
        .toBeDefined();
      expect(harnessSourcePath, 'SIGNALLAB_SRSRAN_HARNESS_SOURCE must identify the harness source')
        .toBeDefined();
      expect(harnessBinaryPath, 'SIGNALLAB_SRSRAN_HARNESS_BINARY must identify the harness binary')
        .toBeDefined();
    }
  });

  it.skipIf(!evidenceAvailable)(
    'matches every resource element and OFDM sample from the pinned independent implementation',
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
      expect(sha256(readFileSync(harnessSourcePath!))).toBe(EXPECTED_HARNESS_SHA256);
      expect(sha256(readFileSync(harnessBinaryPath!))).toBe(
        EXPECTED_HARNESS_BINARY_SHA256,
      );
      const cachedGrid = readComplexFloat32(gridPath!);
      const cachedTime = readComplexFloat32(timePath!);
      expect(sha256(cachedGrid.bytes)).toBe(EXPECTED_GRID_SHA256);
      expect(sha256(cachedTime.bytes)).toBe(EXPECTED_TIME_SHA256);

      const generatedDirectory = mkdtempSync(join(tmpdir(), 'signallab-srsran-etm1-'));
      try {
        const generatedGridPath = join(generatedDirectory, 'grid-f32le.bin');
        const generatedTimePath = join(generatedDirectory, 'time-f32le.bin');
        execFileSync(
          harnessBinaryPath!,
          [generatedGridPath, generatedTimePath],
          { timeout: 20_000 },
        );
        const gridOracle = readComplexFloat32(generatedGridPath);
        const timeOracle = readComplexFloat32(generatedTimePath);
        expect(sha256(gridOracle.bytes)).toBe(EXPECTED_GRID_SHA256);
        expect(sha256(timeOracle.bytes)).toBe(EXPECTED_TIME_SHA256);
        expect(gridOracle.bytes).toEqual(cachedGrid.bytes);
        expect(timeOracle.bytes).toEqual(cachedTime.bytes);

        const frame = generateLteEtm11ReferenceFrame();
        expect(gridOracle.values.real).toHaveLength(frame.grid.real.length);
        expect(timeOracle.values.real).toHaveLength(frame.timeDomain.real.length);

        let maximumGridError = 0;
        let maximumPssError = 0;
        for (let index = 0; index < frame.grid.real.length; index += 1) {
          const realError = Math.abs(frame.grid.real[index]! - gridOracle.values.real[index]!);
          const imaginaryError = Math.abs(
            frame.grid.imaginary[index]! - gridOracle.values.imaginary[index]!,
          );
          const componentError = Math.max(realError, imaginaryError);
          const isPss = frame.grid.kinds[index] === LTE_RESOURCE_ELEMENT_KIND.pss;
          const tolerance = isPss ? PSS_COMPONENT_TOLERANCE : GRID_COMPONENT_TOLERANCE;
          expect(
            componentError,
            `grid mismatch at symbol ${Math.floor(index / 600)}, subcarrier ${index % 600}`,
          ).toBeLessThanOrEqual(tolerance);
          if (isPss) maximumPssError = Math.max(maximumPssError, componentError);
          else maximumGridError = Math.max(maximumGridError, componentError);
        }

        let maximumTimeError = 0;
        for (let index = 0; index < frame.timeDomain.real.length; index += 1) {
          const componentError = Math.max(
            Math.abs(frame.timeDomain.real[index]! - timeOracle.values.real[index]!),
            Math.abs(frame.timeDomain.imaginary[index]! - timeOracle.values.imaginary[index]!),
          );
          expect(componentError, `OFDM sample mismatch at ${index}`)
            .toBeLessThanOrEqual(TIME_DOMAIN_COMPONENT_TOLERANCE);
          maximumTimeError = Math.max(maximumTimeError, componentError);
        }

        expect({
          srsranCommit: EXPECTED_SRSRAN_COMMIT,
          srsranBuildPatchSha256: EXPECTED_SRSRAN_BUILD_PATCH_SHA256,
          harnessSourceSha256: EXPECTED_HARNESS_SHA256,
          harnessBinarySha256: EXPECTED_HARNESS_BINARY_SHA256,
          gridSha256: EXPECTED_GRID_SHA256,
          timeSha256: EXPECTED_TIME_SHA256,
          maximumNonPssGridComponentError: maximumGridError,
          maximumPssComponentError: maximumPssError,
          maximumTimeDomainComponentError: maximumTimeError,
        }).toMatchObject({
          maximumNonPssGridComponentError: expect.closeTo(5.960464499743523e-8, 14),
          maximumPssComponentError: expect.closeTo(0.00022353510823804046, 14),
          maximumTimeDomainComponentError: expect.closeTo(0.0000011386674185279166, 14),
        });
      } finally {
        rmSync(generatedDirectory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
