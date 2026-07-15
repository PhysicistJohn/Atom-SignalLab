import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { AtomizerNdjsonMeasurementBridge, type MeasurementBridgeTimer, type MeasurementRequestDispatcher } from './measurement-bridge.js';
import {
  MEASUREMENT_BRIDGE_LIMITS,
  measurementBridgeMessageSchema,
  measurementBridgeResponseSchema,
  type MeasurementBridgeRequest,
} from './measurement-contract.js';
import { AtomizerMeasurementService } from './measurement-service.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('bounded NDJSON measurement bridge', () => {
  it('emits one exact ready handshake and one correlated reply for every input line', async () => {
    const service = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
    const input = new PassThrough();
    const output = new PassThrough();
    const capture = captureLines(output);
    const diagnostics: string[] = [];
    const bridge = new AtomizerNdjsonMeasurementBridge(service, { input, output, diagnostics: (line) => diagnostics.push(line) });
    const running = bridge.run();
    await capture.waitFor(1);
    const requests = [
      request('status', 'one', {}),
      request('status', 'one', {}),
      '{not-json}',
      JSON.stringify(request('select_profile', 'two', { profile: 'fm' })),
      JSON.stringify(request('acquire_spectrum', 'three', { startHz: 97_750_000, stopHz: 98_250_000, points: 25 })),
      JSON.stringify(request('shutdown', 'four', {})),
    ];
    input.write(`${requests.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')}\n`);
    await running;
    await capture.waitFor(1 + requests.length);

    const messages = capture.lines.map((line) => measurementBridgeMessageSchema.parse(JSON.parse(line)));
    expect(messages[0]).toMatchObject({
      type: 'ready',
      protocol: 'signal-lab-measurement-bridge',
      contractVersion: 1,
      sessionId: service.sessionId,
    });
    const responses = messages.slice(1).map((message) => measurementBridgeResponseSchema.parse(message));
    expect(responses).toHaveLength(requests.length);
    expect(responses.filter((item) => item.ok && item.requestId === 'one')).toHaveLength(1);
    expect(responses).toContainEqual(expect.objectContaining({ ok: false, requestId: 'one', error: expect.objectContaining({ code: 'DUPLICATE_REQUEST_ID' }) }));
    expect(responses).toContainEqual(expect.objectContaining({ ok: false, requestId: null, error: expect.objectContaining({ code: 'INVALID_JSON' }) }));
    expect(responses).toContainEqual(expect.objectContaining({ ok: true, requestId: 'two', result: expect.objectContaining({ kind: 'status', profile: 'fm' }) }));
    expect(responses).toContainEqual(expect.objectContaining({ ok: true, requestId: 'three', result: expect.objectContaining({ kind: 'swept-spectrum', points: 25 }) }));
    expect(responses).toContainEqual(expect.objectContaining({ ok: true, requestId: 'four', result: { kind: 'shutdown', closed: true } }));
    expect(diagnostics).toEqual([]);
    expect(input.destroyed).toBe(true);
  });

  it('bounds bytes before JSON parsing and requires LF termination', async () => {
    const oversizedInput = new PassThrough();
    const oversizedOutput = new PassThrough();
    const oversizedCapture = captureLines(oversizedOutput);
    const oversizedBridge = new AtomizerNdjsonMeasurementBridge(
      new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B }),
      { input: oversizedInput, output: oversizedOutput, diagnostics: () => undefined },
    );
    const oversizedRun = oversizedBridge.run();
    await oversizedCapture.waitFor(1);
    oversizedInput.end(`${'x'.repeat(MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes + 1)}\n`);
    await oversizedRun;
    await oversizedCapture.waitFor(2);
    expect(JSON.parse(oversizedCapture.lines[1]!)).toMatchObject({ ok: false, error: { code: 'LINE_TOO_LARGE' } });

    const unterminatedInput = new PassThrough();
    const unterminatedOutput = new PassThrough();
    const unterminatedCapture = captureLines(unterminatedOutput);
    const unterminatedBridge = new AtomizerNdjsonMeasurementBridge(
      new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B }),
      { input: unterminatedInput, output: unterminatedOutput, diagnostics: () => undefined },
    );
    const unterminatedRun = unterminatedBridge.run();
    await unterminatedCapture.waitFor(1);
    unterminatedInput.end(JSON.stringify(request('status', 'unterminated', {})));
    await unterminatedRun;
    await unterminatedCapture.waitFor(2);
    expect(JSON.parse(unterminatedCapture.lines[1]!)).toMatchObject({ ok: false, error: { code: 'LINE_TERMINATOR_REQUIRED' } });
  });

  it('makes an uncertain execution timeout terminal before any later state mutation can dispatch', async () => {
    const base = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
    const calls: string[] = [];
    let releaseLateMutation: (() => void) | undefined;
    let lateMutation = false;
    const dispatcher: MeasurementRequestDispatcher = {
      sessionId: base.sessionId,
      identity: base.identity,
      dispatch: (next: MeasurementBridgeRequest) => {
        calls.push(next.method);
        return new Promise((resolve) => {
          releaseLateMutation = () => {
            lateMutation = true;
            resolve(base.status());
          };
        });
      },
    };
    const immediateTimer: MeasurementBridgeTimer = {
      schedule: (callback) => { queueMicrotask(callback); return Symbol('timeout'); },
      cancel: () => undefined,
    };
    const input = new PassThrough();
    const output = new PassThrough();
    const capture = captureLines(output);
    const bridge = new AtomizerNdjsonMeasurementBridge(dispatcher, {
      input,
      output,
      timer: immediateTimer,
      diagnostics: () => undefined,
    });
    const running = bridge.run();
    await capture.waitFor(1);
    input.write([
      JSON.stringify(request('status', 'slow', {})),
      JSON.stringify(request('select_profile', 'must-not-run', { profile: 'fm' })),
      JSON.stringify(request('shutdown', 'also-must-not-run', {})),
      '',
    ].join('\n'));
    await running;
    await capture.waitFor(4);
    const responses = capture.lines.slice(1).map((line) => measurementBridgeResponseSchema.parse(JSON.parse(line)));
    expect(responses).toContainEqual(expect.objectContaining({ requestId: 'slow', ok: false, error: expect.objectContaining({ code: 'REQUEST_TIMEOUT' }) }));
    expect(responses).toContainEqual(expect.objectContaining({ requestId: 'must-not-run', ok: false, error: expect.objectContaining({ code: 'SHUTTING_DOWN' }) }));
    expect(responses).toContainEqual(expect.objectContaining({ requestId: 'also-must-not-run', ok: false, error: expect.objectContaining({ code: 'SHUTTING_DOWN' }) }));
    expect(bridge.executionTimedOut).toBe(true);
    expect(calls).toEqual(['status']);
    expect(lateMutation).toBe(false);
    expect(releaseLateMutation).toBeTypeOf('function');
    releaseLateMutation?.();
    await Promise.resolve();
    expect(lateMutation).toBe(true);
    expect(calls).toEqual(['status']);
  });
});

function request(method: string, requestId: string, params: unknown): MeasurementBridgeRequest {
  return { type: 'request', contractVersion: 1, requestId, method, params } as MeasurementBridgeRequest;
}

function captureLines(output: PassThrough) {
  const lines: string[] = [];
  const waiters: Array<() => void> = [];
  let pending = '';
  output.setEncoding('utf8');
  output.on('data', (chunk: string) => {
    pending += chunk;
    for (;;) {
      const newline = pending.indexOf('\n');
      if (newline < 0) break;
      lines.push(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
    for (const wake of waiters.splice(0)) wake();
  });
  return {
    lines,
    async waitFor(count: number): Promise<void> {
      const deadline = Date.now() + 2_000;
      while (lines.length < count) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${count} protocol lines; received ${lines.length}`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 10);
          waiters.push(() => { clearTimeout(timer); resolve(); });
        });
      }
    },
  };
}
