import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { describe, expect, it } from 'vitest';
import {
  MEASUREMENT_GENERATOR_ARTIFACTS,
  measurementBridgeReadySchema,
  measurementBridgeResponseSchema,
  type MeasurementBridgeRequest,
  type MeasurementBridgeResponse,
} from './measurement-contract.js';

const executableUrl = new URL('../dist/bridge/atomizer-bridge.js', import.meta.url);
const contractUrl = new URL('../contracts/signal-lab-measurement-bridge-v1.json', import.meta.url);

describe('shipped Atomizer measurement bridge executable', () => {
  it('is the packaged CLI, binds identity to shipped bytes, and runs every command over protocol-only stdout', async () => {
    const packageDocument = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      bin?: Record<string, string>;
      files?: string[];
    };
    expect(packageDocument.bin).toEqual({ 'tinysa-signal-lab-atomizer-bridge': 'dist/bridge/atomizer-bridge.js' });
    expect(packageDocument.files).toContain('dist/bridge');
    expect(packageDocument.files).toContain('contracts/signal-lab-measurement-bridge-v1.json');
    const emittedRuntimeArtifacts = (await readdir(new URL('../dist/bridge/', import.meta.url), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => entry.name)
      .sort();
    expect(emittedRuntimeArtifacts).toEqual([...MEASUREMENT_GENERATOR_ARTIFACTS]);
    const metadata = await lstat(executableUrl);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.mode & 0o111).not.toBe(0);
    expect((await readFile(executableUrl, 'utf8')).startsWith('#!/usr/bin/env node\n')).toBe(true);

    const child = spawn(executableUrl.pathname, [], {
      cwd: new URL('..', import.meta.url).pathname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
    try {
      const ready = measurementBridgeReadySchema.parse(JSON.parse(await nextLine(lines)));
      expect(ready.identity.contractSha256).toBe(sha256Hex(await readFile(contractUrl)));
      expect(ready.identity.generatorSha256).toBe(await aggregateGeneratorHash());
      expect(ready.identity.claims).toEqual({ usbEmulated: false, firmwareExecuted: false, rfEmitted: false });

      const status = await exchange(child, lines, request('status', 'status', {}));
      expect(status).toMatchObject({ ok: true, requestId: 'status', result: { kind: 'status', profile: 'cw' } });
      const selected = await exchange(child, lines, request('select_profile', 'select', { profile: 'fm' }));
      expect(selected).toMatchObject({ ok: true, requestId: 'select', result: { kind: 'status', profile: 'fm' } });
      const configured = await exchange(child, lines, request('configure_channel', 'channel', {
        channel: { model: 'rayleigh', noiseFloorDbm: -120, seed: 99, fadingRateHz: 4 },
      }));
      expect(configured).toMatchObject({ ok: true, requestId: 'channel', result: { kind: 'status', channel: { model: 'rayleigh' } } });
      const spectrum = await exchange(child, lines, request('acquire_spectrum', 'spectrum', {
        startHz: 97_750_000,
        stopHz: 98_250_000,
        points: 33,
      }));
      expect(spectrum).toMatchObject({ ok: true, requestId: 'spectrum', result: { kind: 'swept-spectrum', points: 33 } });
      const detected = await exchange(child, lines, request('acquire_detected_power', 'detected', {
        points: 64,
        samplePeriodSeconds: 0.000_1,
      }));
      expect(detected).toMatchObject({ ok: true, requestId: 'detected', result: { kind: 'detected-power-timeseries', points: 64 } });
      for (const response of [spectrum, detected]) {
        if (!response.ok) throw new Error('Expected successful measurement');
        expect(deepKeys(response.result)).not.toContain('profile');
      }
      const shutdown = await exchange(child, lines, request('shutdown', 'shutdown', {}));
      expect(shutdown).toEqual({
        type: 'response',
        contractVersion: 1,
        requestId: 'shutdown',
        ok: true,
        result: { kind: 'shutdown', closed: true },
      });
      expect(await waitForExit(child)).toEqual({ code: 0, signal: null });
      expect(stderr).toBe('');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });
});

async function exchange(
  child: ChildProcessWithoutNullStreams,
  lines: AsyncIterator<string>,
  next: MeasurementBridgeRequest,
): Promise<MeasurementBridgeResponse> {
  await writeLine(child, JSON.stringify(next));
  return measurementBridgeResponseSchema.parse(JSON.parse(await nextLine(lines)));
}

function request(method: string, requestId: string, params: unknown): MeasurementBridgeRequest {
  return { type: 'request', contractVersion: 1, requestId, method, params } as MeasurementBridgeRequest;
}

function writeLine(child: ChildProcessWithoutNullStreams, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.stdin.write(`${line}\n`, 'utf8', (error) => error ? reject(error) : resolve());
  });
}

async function nextLine(lines: AsyncIterator<string>): Promise<string> {
  const result = await withDeadline(lines.next(), 2_000, 'Timed out waiting for a measurement bridge protocol line');
  if (result.done) throw new Error('Measurement bridge stdout closed before the expected protocol line');
  return result.value;
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return withDeadline(new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  }), 2_000, 'Timed out waiting for measurement bridge exit');
}

async function aggregateGeneratorHash(): Promise<string> {
  const hash = createHash('sha256');
  for (const name of MEASUREMENT_GENERATOR_ARTIFACTS) {
    const bytes = await readFile(new URL(`../dist/bridge/${name}`, import.meta.url));
    const size = Buffer.allocUnsafe(8);
    size.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(name, 'utf8').update(Buffer.of(0)).update(size).update(bytes);
  }
  return hash.digest('hex');
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function withDeadline<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function deepKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...deepKeys(nested)]);
}
