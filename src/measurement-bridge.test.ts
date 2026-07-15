import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  AtomizerNdjsonMeasurementBridge,
  MAX_PENDING_REPLY_OBLIGATIONS,
  type MeasurementBridgeTimer,
  type MeasurementRequestDispatcher,
} from './measurement-bridge.js';
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
    expect(responses).toContainEqual(expect.objectContaining({ ok: false, requestId: 'two', error: expect.objectContaining({ code: 'SHUTTING_DOWN' }) }));
    expect(responses).toContainEqual(expect.objectContaining({ ok: false, requestId: 'three', error: expect.objectContaining({ code: 'SHUTTING_DOWN' }) }));
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

  it('bounds invalid-line admission when stdout remains permanently blocked', async () => {
    const service = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
    const input = new PassThrough();
    const output = new ReadyThenPermanentlyBlockedWritable();
    const bridge = new AtomizerNdjsonMeasurementBridge(service, { input, output, diagnostics: () => undefined });
    const running = bridge.run();
    await waitUntil(() => output.writes === 1);

    input.write(`${Array.from({ length: MAX_PENDING_REPLY_OBLIGATIONS + 40 }, () => '{invalid-json}').join('\n')}\n`);
    await waitUntil(() => bridge.pendingReplyObligations === MAX_PENDING_REPLY_OBLIGATIONS);
    expect(input.isPaused()).toBe(true);
    expect(output.writes).toBe(2);

    output.failForTestTeardown();
    await expect(running).rejects.toThrow(/permanently blocked output/i);
    await waitUntil(() => bridge.pendingReplyObligations === 0);
    expect(bridge.pendingReplyObligations).toBe(0);
    expect(output.writes).toBe(2);
    expect(input.destroyed).toBe(true);
  });

  it('releases queued reply obligations after terminal stdout failure', async () => {
    const service = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
    const input = new PassThrough();
    const output = new ReadyThenPermanentlyBlockedWritable();
    const bridge = new AtomizerNdjsonMeasurementBridge(service, { input, output, diagnostics: () => undefined });
    const running = bridge.run();
    await waitUntil(() => output.writes === 1);

    for (let index = 0; index < MAX_PENDING_REPLY_OBLIGATIONS; index += 1) {
      input.write(`${JSON.stringify(request('status', `output-failure-${index}`, {}))}\n`);
    }
    await waitUntil(() => bridge.pendingReplyObligations === MAX_PENDING_REPLY_OBLIGATIONS);
    await waitUntil(() => output.writes === 2);

    output.failForTestTeardown();
    await expect(running).rejects.toThrow(/permanently blocked output/i);
    await waitUntil(() => bridge.pendingReplyObligations === 0);
    expect(input.destroyed).toBe(true);
  });

  it('charges duplicate and oversized lines to the same blocked-output admission bound', async () => {
    await exerciseBlockedLineClass((input, count) => {
      input.write(`${JSON.stringify(request('status', 'duplicate', {}))}\n`);
      for (let index = 1; index < count; index++) {
        input.write(`${JSON.stringify(request('status', 'duplicate', {}))}\n`);
      }
    });

    await exerciseBlockedLineClass((input, count) => {
      const oversized = `${'x'.repeat(MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes + 1)}\n`;
      for (let index = 0; index < count; index++) input.write(oversized);
    });
  });

  it('charges the overload reply and every queued request to one total retained-work bound', async () => {
    const base = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
    let resolveFirst!: (value: unknown) => void;
    let calls = 0;
    const dispatcher: MeasurementRequestDispatcher = {
      sessionId: base.sessionId,
      identity: base.identity,
      dispatch: (next) => {
        calls += 1;
        if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve; });
        return base.dispatch(next);
      },
    };
    const input = new PassThrough();
    const output = new ReadyThenBlockedWritable();
    const bridge = new AtomizerNdjsonMeasurementBridge(dispatcher, { input, output, diagnostics: () => undefined });
    const running = bridge.run();
    await waitUntil(() => output.writes === 1);
    for (let index = 0; index < MAX_PENDING_REPLY_OBLIGATIONS; index++) {
      input.write(`${JSON.stringify(request('status', `overload-${index}`, {}))}\n`);
    }
    await waitUntil(() => bridge.pendingReplyObligations === MAX_PENDING_REPLY_OBLIGATIONS);
    expect(calls).toBe(1);
    expect(input.isPaused()).toBe(true);
    expect(output.writes).toBe(2);

    output.unblock();
    resolveFirst(base.status());
    input.end();
    await running;
    expect(bridge.pendingReplyObligations).toBe(0);
    expect(calls).toBe(MEASUREMENT_BRIDGE_LIMITS.maxQueuedRequests);
    expect(output.writes).toBe(1 + MAX_PENDING_REPLY_OBLIGATIONS);
  });

  it('counts malformed lines against the lifetime session budget and terminates at overflow', async () => {
    const service = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
    const input = new PassThrough();
    const output = new CountingWritable();
    const bridge = new AtomizerNdjsonMeasurementBridge(service, { input, output, diagnostics: () => undefined });
    const running = bridge.run();
    await waitUntil(() => output.writes === 1);
    input.write(`${'{invalid}\n'.repeat(MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests + 1)}`);
    await running;

    expect(input.destroyed).toBe(true);
    expect(output.writes).toBe(1 + MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests + 1);
    expect(JSON.parse(output.lastLine)).toMatchObject({
      ok: false,
      requestId: null,
      error: { code: 'SESSION_REQUEST_LIMIT' },
    });
  });

  it('reserves one valid shutdown admission after the normal process-line budget is exhausted', async () => {
    const service = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
    const input = new PassThrough();
    const output = new CountingWritable();
    const bridge = new AtomizerNdjsonMeasurementBridge(service, { input, output, diagnostics: () => undefined });
    const running = bridge.run();
    await waitUntil(() => output.writes === 1);
    const lines = Array.from({ length: MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests }, (_unused, index) =>
      JSON.stringify(request('status', `normal-${index}`, {})));
    lines.push(JSON.stringify(request('shutdown', 'reserved-shutdown', {})), '');
    input.end(lines.join('\n'));

    await running;

    expect(input.destroyed).toBe(true);
    expect(output.writes).toBe(1 + MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests + 1);
    expect(JSON.parse(output.shutdownLine)).toMatchObject({
      ok: true,
      requestId: 'reserved-shutdown',
      result: { kind: 'shutdown', closed: true },
    });
    expect(output.shutdownWrite).toBeGreaterThan(1);
    expect(bridge.pendingReplyObligations).toBe(0);
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

async function exerciseBlockedLineClass(
  writeLines: (input: PassThrough, count: number) => void,
): Promise<void> {
  const service = new AtomizerMeasurementService({ contractSha256: HASH_A, generatorSha256: HASH_B });
  const input = new PassThrough();
  const output = new ReadyThenBlockedWritable();
  const bridge = new AtomizerNdjsonMeasurementBridge(service, { input, output, diagnostics: () => undefined });
  const running = bridge.run();
  await waitUntil(() => output.writes === 1);
  writeLines(input, MAX_PENDING_REPLY_OBLIGATIONS);
  await waitUntil(() => bridge.pendingReplyObligations === MAX_PENDING_REPLY_OBLIGATIONS);
  expect(input.isPaused()).toBe(true);
  expect(output.writes).toBe(2);
  output.unblock();
  input.end();
  await running;
  expect(bridge.pendingReplyObligations).toBe(0);
  expect(output.writes).toBe(1 + MAX_PENDING_REPLY_OBLIGATIONS);
}

class ReadyThenBlockedWritable extends Writable {
  writes = 0;
  #blocked = true;
  #callback: ((error?: Error | null) => void) | undefined;

  override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.writes += 1;
    if (this.writes === 1 || !this.#blocked) {
      callback();
      return;
    }
    this.#callback = callback;
  }

  unblock(): void {
    this.#blocked = false;
    const callback = this.#callback;
    this.#callback = undefined;
    callback?.();
  }
}

class ReadyThenPermanentlyBlockedWritable extends Writable {
  writes = 0;
  #callback: ((error?: Error | null) => void) | undefined;

  override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.writes += 1;
    if (this.writes === 1) {
      callback();
      return;
    }
    this.#callback = callback;
  }

  failForTestTeardown(): void {
    const callback = this.#callback;
    this.#callback = undefined;
    callback?.(new Error('Permanently blocked output test teardown'));
  }
}

class CountingWritable extends Writable {
  writes = 0;
  lastLine = '';
  shutdownWrite = 0;
  shutdownLine = '';

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.writes += 1;
    this.lastLine = chunk.toString('utf8').trimEnd();
    if (this.lastLine.includes('reserved-shutdown')) {
      this.shutdownWrite = this.writes;
      this.shutdownLine = this.lastLine;
    }
    callback();
  }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for measurement bridge test state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
