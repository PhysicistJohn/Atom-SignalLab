import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LTE_NTM_PROFILES,
  LTE_NTM_RESOURCE_ELEMENT_KIND,
  generateLteNtmReferenceFrame,
  type LteNtmProfile,
} from './lte-ntm-reference.js';

const EXPECTED_SRSRAN_COMMIT = '6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16';
const EXPECTED_SRSRAN_BUILD_PATCH_SHA256 =
  '284e1453cc0ea4fed616a7a88e5fa65d706de698a6c0395ec575772d663d1173';
const EXPECTED_SOURCE_SHA256 =
  'c4fb2e35682ca34966d6c3384d1a62ed2885f386d3cbbc424e51e6f91aa4a46e';
const EXPECTED_BINARY_SHA256 =
  '128250f8141a296623138981e7bad5b74adb418a71bdd31e86d7e4bec4018821';
const EXPECTED_RETAINED = Object.freeze({
  'lte-ntm': Object.freeze({
    mode: 'standalone',
    grid: '63dd4441b25a9bfe6be76f6791d3eab7786f1dd498dd87602cfcf32925777020',
    time: '6fb9ce034186fbd73f9093d0156109def42b71b0ef64051235d0bf164b2f41d4',
  }),
  'lte-nbiot-guard-isolated-component': Object.freeze({
    mode: 'guard',
    grid: '63dd4441b25a9bfe6be76f6791d3eab7786f1dd498dd87602cfcf32925777020',
    time: '6fb9ce034186fbd73f9093d0156109def42b71b0ef64051235d0bf164b2f41d4',
  }),
  'lte-nbiot-inband-isolated-component': Object.freeze({
    mode: 'inband',
    grid: 'f0359f8e77a702b9a7f6e91e683881d1bbfcf4b9f7f76b8006a5109b3342f63c',
    time: 'c8bcd88d2e5575c4c3ec132e82c5ee3485b80ea7bfff9c781b31bee8c1209901',
  }),
} as const);

const repository = process.env.SIGNALLAB_SRSRAN_REPOSITORY;
const source = process.env.SIGNALLAB_SRSRAN_LTE_NTM_HARNESS_SOURCE;
const binary = process.env.SIGNALLAB_SRSRAN_LTE_NTM_HARNESS_BINARY;
const retainedDirectory = process.env.SIGNALLAB_SRSRAN_LTE_NTM_RETAINED_DIRECTORY;
const required = process.env.SIGNALLAB_REQUIRE_LTE_NTM_ORACLE === '1';
const available = repository !== undefined
  && source !== undefined
  && binary !== undefined
  && retainedDirectory !== undefined;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
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
    real[index] = view.getFloat32(8 * index, true);
    imaginary[index] = view.getFloat32(8 * index + 4, true);
  }
  return { bytes, real, imaginary };
}

function retainedPath(profile: LteNtmProfile, part: 'grid' | 'time'): string {
  const mode = EXPECTED_RETAINED[profile].mode;
  return join(retainedDirectory!, `${mode}-${part}-f32le.bin`);
}

describe('independent srsRAN oracle for fixed LTE N-TM subjects', () => {
  it('fails closed when required oracle evidence is incomplete', () => {
    if (!required) return;
    expect(repository, 'SIGNALLAB_SRSRAN_REPOSITORY is required').toBeDefined();
    expect(source, 'SIGNALLAB_SRSRAN_LTE_NTM_HARNESS_SOURCE is required').toBeDefined();
    expect(binary, 'SIGNALLAB_SRSRAN_LTE_NTM_HARNESS_BINARY is required').toBeDefined();
    expect(
      retainedDirectory,
      'SIGNALLAB_SRSRAN_LTE_NTM_RETAINED_DIRECTORY is required',
    ).toBeDefined();
  });

  it.skipIf(!available)(
    'matches every RE and OFDM sample for all three deployment subjects',
    () => {
      expect(execFileSync(
        'git',
        ['-C', repository!, 'rev-parse', 'HEAD'],
        { encoding: 'utf8' },
      ).trim()).toBe(EXPECTED_SRSRAN_COMMIT);
      expect(sha256(execFileSync(
        'git',
        ['-C', repository!, 'diff', '--binary'],
      ))).toBe(EXPECTED_SRSRAN_BUILD_PATCH_SHA256);
      expect(sha256(readFileSync(source!))).toBe(EXPECTED_SOURCE_SHA256);
      expect(sha256(readFileSync(binary!))).toBe(EXPECTED_BINARY_SHA256);

      const fresh = mkdtempSync(join(tmpdir(), 'signallab-lte-ntm-'));
      try {
        for (const profile of LTE_NTM_PROFILES) {
          const expected = EXPECTED_RETAINED[profile];
          const retainedGrid = readCf32(retainedPath(profile, 'grid'));
          const retainedTime = readCf32(retainedPath(profile, 'time'));
          expect(sha256(retainedGrid.bytes)).toBe(expected.grid);
          expect(sha256(retainedTime.bytes)).toBe(expected.time);
          const freshGridPath = join(fresh, `${expected.mode}-grid.bin`);
          const freshTimePath = join(fresh, `${expected.mode}-time.bin`);
          execFileSync(
            binary!,
            [expected.mode, freshGridPath, freshTimePath],
            { timeout: 30_000 },
          );
          const freshGrid = readCf32(freshGridPath);
          const freshTime = readCf32(freshTimePath);
          expect(freshGrid.bytes).toEqual(retainedGrid.bytes);
          expect(freshTime.bytes).toEqual(retainedTime.bytes);

          const subject = generateLteNtmReferenceFrame(profile);
          expect(freshGrid.real).toHaveLength(subject.grid.real.length);
          expect(freshTime.real).toHaveLength(subject.timeDomain.real.length);
          let maximumGridError = 0;
          for (let index = 0; index < freshGrid.real.length; index += 1) {
            const error = Math.max(
              Math.abs(subject.grid.real[index]! - freshGrid.real[index]!),
              Math.abs(subject.grid.imaginary[index]! - freshGrid.imaginary[index]!),
            );
            maximumGridError = Math.max(maximumGridError, error);
            const kind = subject.grid.kinds[index];
            const tolerance = kind === LTE_NTM_RESOURCE_ELEMENT_KIND.nsss
              ? 1.8e-3
              : kind === LTE_NTM_RESOURCE_ELEMENT_KIND.npss
                ? 2e-5
                : 1e-6;
            expect(error, `${profile} grid RE ${index}`).toBeLessThanOrEqual(tolerance);
          }
          let maximumTimeError = 0;
          for (let index = 0; index < freshTime.real.length; index += 1) {
            const error = Math.max(
              Math.abs(subject.timeDomain.real[index]! - freshTime.real[index]!),
              Math.abs(
                subject.timeDomain.imaginary[index]! - freshTime.imaginary[index]!,
              ),
            );
            maximumTimeError = Math.max(maximumTimeError, error);
            expect(error, `${profile} OFDM sample ${index}`).toBeLessThanOrEqual(4.5e-5);
          }
          expect(maximumGridError).toBeGreaterThan(0);
          expect(maximumGridError).toBeLessThanOrEqual(1.8e-3);
          expect(maximumTimeError).toBeGreaterThan(0);
          expect(maximumTimeError).toBeLessThanOrEqual(4.5e-5);
        }
      } finally {
        rmSync(fresh, { recursive: true, force: true });
      }
    },
    45_000,
  );
});
