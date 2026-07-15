import type { Readable, Writable } from 'node:stream';
import {
  ATOMIZER_MEASUREMENT_CONTRACT_ID,
  ATOMIZER_MEASUREMENT_CONTRACT_VERSION,
  ATOMIZER_MEASUREMENT_PROTOCOL,
  MEASUREMENT_BRIDGE_LIMITS,
  MEASUREMENT_CAPABILITIES,
  errorResponse,
  measurementBridgeMessageSchema,
  measurementBridgeReadySchema,
  measurementBridgeRequestSchema,
  successResponse,
  type MeasurementBridgeRequest,
  type MeasurementBridgeResponse,
  type MeasurementSourceIdentity,
} from './measurement-contract.js';
import { MeasurementServiceError } from './measurement-service.js';

export interface MeasurementRequestDispatcher {
  readonly sessionId: string;
  readonly identity: MeasurementSourceIdentity;
  dispatch(request: MeasurementBridgeRequest): unknown | Promise<unknown>;
}

export interface MeasurementBridgeIo {
  input: Readable;
  output: Writable;
  diagnostics?: (message: string) => void;
  monotonicMilliseconds?: () => number;
  timer?: MeasurementBridgeTimer;
}

export interface MeasurementBridgeTimer {
  schedule(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
}

interface QueuedRequest {
  request: MeasurementBridgeRequest;
  receivedAt: number;
}

interface PendingInputChunk {
  bytes: Buffer;
  offset: number;
}

interface PendingProtocolWrite {
  chunk: string;
  resolve(): void;
  reject(error: Error): void;
}

/** One execution queue plus one overload/error response can be retained. */
export const MAX_PENDING_REPLY_OBLIGATIONS = MEASUREMENT_BRIDGE_LIMITS.maxQueuedRequests + 1;
/** Pull-based input never retains more than one line-bound-sized stream chunk. */
export const MAX_BRIDGE_INPUT_CHUNK_BYTES = MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes;

class RequestTimeoutError extends Error {
  constructor() {
    super('Measurement bridge request timed out');
    this.name = 'RequestTimeoutError';
  }
}

/** A bounded, serial, exactly-one-response-per-admitted-line NDJSON session. */
export class AtomizerNdjsonMeasurementBridge {
  readonly #dispatcher: MeasurementRequestDispatcher;
  readonly #input: Readable;
  readonly #writer: ProtocolWriter;
  readonly #diagnostics: (message: string) => void;
  readonly #monotonicMilliseconds: () => number;
  readonly #timer: MeasurementBridgeTimer;
  readonly #seenRequestIds = new Set<string>();
  readonly #queue: QueuedRequest[] = [];
  #shutdownRequest: QueuedRequest | undefined;
  readonly #lineBuffer = Buffer.allocUnsafe(MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes);
  #pendingInputChunk: PendingInputChunk | undefined;
  #lineBytes = 0;
  #lineTooLarge = false;
  #inputLineCount = 0;
  #pendingReplyObligations = 0;
  #processing = false;
  #pumpingInput = false;
  #running = false;
  #accepting = true;
  #inputEnded = false;
  #shuttingDown = false;
  #executionTimedOut = false;
  #settled = false;
  #resolveDone: (() => void) | undefined;
  #rejectDone: ((error: Error) => void) | undefined;

  constructor(dispatcher: MeasurementRequestDispatcher, io: MeasurementBridgeIo) {
    this.#dispatcher = dispatcher;
    this.#input = io.input;
    this.#writer = new ProtocolWriter(io.output);
    this.#diagnostics = io.diagnostics ?? ((message) => process.stderr.write(`${message}\n`));
    this.#monotonicMilliseconds = io.monotonicMilliseconds ?? (() => performance.now());
    this.#timer = io.timer ?? SYSTEM_TIMER;
  }

  /** A true value means the executable must terminate after flushed replies. */
  get executionTimedOut(): boolean {
    return this.#executionTimedOut;
  }

  /** Operational evidence for the hard reply/backpressure admission bound. */
  get pendingReplyObligations(): number {
    return this.#pendingReplyObligations;
  }

  async run(): Promise<void> {
    if (this.#running) throw new Error('Measurement bridge sessions can run only once');
    this.#running = true;
    const ready = measurementBridgeReadySchema.parse({
      type: 'ready',
      protocol: ATOMIZER_MEASUREMENT_PROTOCOL,
      contractId: ATOMIZER_MEASUREMENT_CONTRACT_ID,
      contractVersion: ATOMIZER_MEASUREMENT_CONTRACT_VERSION,
      service: 'tinysa-signal-lab',
      sessionId: this.#dispatcher.sessionId,
      identity: this.#dispatcher.identity,
      capabilities: MEASUREMENT_CAPABILITIES,
      limits: MEASUREMENT_BRIDGE_LIMITS,
    });
    await this.#writer.write(ready);

    const done = new Promise<void>((resolve, reject) => {
      this.#resolveDone = resolve;
      this.#rejectDone = reject;
    });
    this.#input.pause();
    this.#input.on('readable', this.#onReadable);
    this.#input.once('end', this.#onEnd);
    this.#input.once('error', this.#onInputError);
    this.#readInput();
    return done;
  }

  readonly #onReadable = (): void => {
    this.#readInput();
  };

  readonly #onEnd = (): void => {
    if (this.#settled) return;
    this.#inputEnded = true;
    if (this.#lineTooLarge || this.#lineBytes > 0) {
      if (!this.#reserveReplyObligation()) {
        this.#fatal(new Error('Input ended without response capacity for its final bounded fragment'));
        return;
      }
      this.#finishBufferedLine('eof');
    }
    this.#maybeComplete();
  };

  readonly #onInputError = (error: Error): void => {
    this.#fatal(error);
  };

  #readInput(): void {
    if (this.#pumpingInput || this.#settled || this.#inputEnded || this.#shuttingDown || this.#shutdownRequest) return;
    this.#pumpingInput = true;
    try {
      for (;;) {
        if (this.#pendingInputChunk) {
          this.#pumpInputChunk();
          if (this.#pendingInputChunk || this.#settled || this.#inputEnded || this.#shuttingDown || this.#shutdownRequest) return;
        }
        if (!this.#reserveReplyObligation(false)) return;
        const maximumUnits = this.#input.readableEncoding
          ? Math.floor(MAX_BRIDGE_INPUT_CHUNK_BYTES / 4)
          : MAX_BRIDGE_INPUT_CHUNK_BYTES;
        const available = Math.min(this.#input.readableLength, maximumUnits);
        if (available < 1) {
          // A zero-length read lets Node publish a pending EOF after the last
          // bounded pull without switching this stream into flowing mode.
          this.#input.read(0);
          return;
        }
        const chunk: unknown = this.#input.read(available);
        if (chunk === null) return;
        if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) {
          throw new Error('Measurement bridge input must produce bytes or UTF-8 strings');
        }
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
        if (bytes.byteLength > MAX_BRIDGE_INPUT_CHUNK_BYTES) {
          throw new Error(`Input decoder produced more than the ${MAX_BRIDGE_INPUT_CHUNK_BYTES}-byte pull bound`);
        }
        this.#pendingInputChunk = { bytes, offset: 0 };
      }
    } catch (error) {
      this.#fatal(error);
    } finally {
      this.#pumpingInput = false;
    }
  }

  #pumpInputChunk(): void {
    const pending = this.#pendingInputChunk;
    if (!pending || this.#settled) return;
    if (this.#shuttingDown || this.#shutdownRequest || this.#inputEnded) {
      this.#pendingInputChunk = undefined;
      return;
    }
    while (pending.offset < pending.bytes.length) {
      if (!this.#reserveReplyObligation(false)) {
        this.#input.pause();
        return;
      }
      const newline = pending.bytes.indexOf(0x0a, pending.offset);
      if (newline === -1) {
        this.#appendLineBytes(pending.bytes.subarray(pending.offset));
        pending.offset = pending.bytes.length;
        break;
      }
      this.#pendingReplyObligations += 1;
      this.#appendLineBytes(pending.bytes.subarray(pending.offset, newline));
      pending.offset = newline + 1;
      this.#finishBufferedLine('lf');
      if (this.#settled || this.#inputEnded || this.#shuttingDown || this.#shutdownRequest) {
        this.#pendingInputChunk = undefined;
        return;
      }
    }
    this.#pendingInputChunk = undefined;
  }

  #appendLineBytes(bytes: Buffer): void {
    if (bytes.length === 0 || this.#lineTooLarge) return;
    const nextSize = this.#lineBytes + bytes.length;
    if (nextSize > MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes) {
      this.#lineBytes = nextSize;
      this.#lineTooLarge = true;
      return;
    }
    bytes.copy(this.#lineBuffer, this.#lineBytes);
    this.#lineBytes = nextSize;
  }

  #finishBufferedLine(termination: 'lf' | 'eof'): void {
    const tooLarge = this.#lineTooLarge;
    const line = tooLarge ? undefined : this.#lineBuffer.subarray(0, this.#lineBytes);
    this.#resetLine();
    this.#inputLineCount += 1;
    if (this.#inputLineCount > MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests) {
      const isReservedShutdown = this.#inputLineCount
        === MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests + MEASUREMENT_BRIDGE_LIMITS.reservedShutdownRequests
        && !tooLarge
        && termination === 'lf'
        && this.#isValidUnseenShutdown(line!);
      if (isReservedShutdown) {
        this.#acceptLine(line!);
        return;
      }
      this.#writeScheduledResponse(errorResponse(
        line ? correlationIdFromLine(line) : null,
        'SESSION_REQUEST_LIMIT',
        'The bounded input-line budget for this session is exhausted',
      ));
      this.#terminateInputAdmission();
      return;
    }
    if (tooLarge) {
      this.#writeScheduledResponse(errorResponse(null, 'LINE_TOO_LARGE', `Input lines may not exceed ${MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes} bytes`));
      return;
    }
    if (termination === 'eof') {
      this.#writeScheduledResponse(errorResponse(correlationIdFromLine(line!), 'LINE_TERMINATOR_REQUIRED', 'Every NDJSON request must end with LF'));
      return;
    }
    this.#acceptLine(line!);
  }

  #isValidUnseenShutdown(line: Buffer): boolean {
    try {
      const source = new TextDecoder('utf-8', { fatal: true }).decode(line);
      const parsed = measurementBridgeRequestSchema.safeParse(JSON.parse(source));
      return parsed.success
        && parsed.data.method === 'shutdown'
        && !this.#seenRequestIds.has(parsed.data.requestId);
    } catch {
      return false;
    }
  }

  #resetLine(): void {
    this.#lineBytes = 0;
    this.#lineTooLarge = false;
  }

  #acceptLine(line: Buffer): void {
    let source: string;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(line);
    } catch {
      this.#writeScheduledResponse(errorResponse(null, 'INVALID_ENCODING', 'Requests must be valid UTF-8'));
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      this.#writeScheduledResponse(errorResponse(null, 'INVALID_JSON', 'Each input line must contain exactly one JSON request'));
      return;
    }

    const parsed = measurementBridgeRequestSchema.safeParse(value);
    if (!parsed.success) {
      this.#writeScheduledResponse(errorResponse(correlationId(value), 'INVALID_REQUEST', 'Request does not match measurement bridge contract version 1'));
      return;
    }
    const request = parsed.data;
    if (this.#seenRequestIds.has(request.requestId)) {
      this.#writeScheduledResponse(errorResponse(request.requestId, 'DUPLICATE_REQUEST_ID', 'Request identifiers may be used only once per session'));
      return;
    }
    this.#seenRequestIds.add(request.requestId);

    if (!this.#accepting || this.#shuttingDown) {
      this.#writeScheduledResponse(errorResponse(request.requestId, 'SHUTTING_DOWN', 'The measurement bridge is shutting down'));
      return;
    }
    if (request.method === 'shutdown') {
      // One separately retained control request runs immediately after active
      // work and ahead of the bounded normal queue. Its reply obligation is
      // the existing +1 slot, so teardown remains admissible at normal load.
      this.#accepting = false;
      this.#input.pause();
      this.#shutdownRequest = { request, receivedAt: this.#monotonicMilliseconds() };
      void this.#drainQueue().catch((error) => this.#fatal(error));
      return;
    }
    const outstanding = this.#queue.length + (this.#processing ? 1 : 0);
    if (outstanding >= MEASUREMENT_BRIDGE_LIMITS.maxQueuedRequests) {
      this.#writeScheduledResponse(errorResponse(request.requestId, 'OVERLOADED', 'The bounded measurement request queue is full'));
      return;
    }
    this.#queue.push({ request, receivedAt: this.#monotonicMilliseconds() });
    void this.#drainQueue().catch((error) => this.#fatal(error));
  }

  async #drainQueue(): Promise<void> {
    if (this.#processing || this.#settled) return;
    this.#processing = true;
    try {
      while (this.#shutdownRequest || this.#queue.length > 0) {
        const item = this.#shutdownRequest ?? this.#queue.shift()!;
        if (this.#shutdownRequest === item) this.#shutdownRequest = undefined;
        if (this.#shuttingDown) {
          await this.#writeReservedResponse(errorResponse(item.request.requestId, 'SHUTTING_DOWN', 'The measurement bridge is shutting down'));
          continue;
        }
        if (item.request.method === 'shutdown') {
          this.#shuttingDown = true;
          this.#accepting = false;
          this.#input.pause();
        }
        await this.#execute(item);
      }
    } finally {
      this.#processing = false;
    }
    this.#maybeComplete();
  }

  async #execute(item: QueuedRequest): Promise<void> {
    const elapsed = this.#monotonicMilliseconds() - item.receivedAt;
    if (!Number.isFinite(elapsed) || elapsed >= MEASUREMENT_BRIDGE_LIMITS.requestTimeoutMs) {
      await this.#writeReservedResponse(errorResponse(item.request.requestId, 'REQUEST_TIMEOUT', 'Request exceeded the measurement bridge time bound before execution'));
      return;
    }
    let result: unknown;
    try {
      result = await withTimeout(
        () => this.#dispatcher.dispatch(item.request),
        MEASUREMENT_BRIDGE_LIMITS.requestTimeoutMs - Math.max(0, elapsed),
        this.#timer,
      );
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        // The underlying Promise cannot be cancelled. Make the entire session
        // terminal before replying so no later mutation can race it.
        this.#executionTimedOut = true;
        this.#shuttingDown = true;
        this.#accepting = false;
        this.#input.pause();
        await this.#writeReservedResponse(errorResponse(item.request.requestId, 'REQUEST_TIMEOUT', 'Request exceeded the measurement bridge execution time bound'));
        return;
      }
      if (error instanceof MeasurementServiceError) {
        await this.#writeReservedResponse(errorResponse(item.request.requestId, error.code, error.message));
        return;
      }
      this.#reportDiagnostic(formatDiagnostic('Measurement request failed', error));
      await this.#writeReservedResponse(errorResponse(item.request.requestId, 'INTERNAL_ERROR', 'Measurement request failed without state substitution or retry'));
      return;
    }
    await this.#writeReservedResponse(successResponse(item.request.requestId, result as never));
  }

  #writeScheduledResponse(response: MeasurementBridgeResponse): void {
    void this.#writeReservedResponse(response).catch((error) => this.#fatal(error));
  }

  async #writeReservedResponse(response: MeasurementBridgeResponse): Promise<void> {
    let written = false;
    try {
      await this.#writer.write(response);
      written = true;
    } finally {
      if (this.#pendingReplyObligations < 1) throw new Error('Measurement bridge reply admission accounting underflow');
      this.#pendingReplyObligations -= 1;
      if (written && !this.#settled && !this.#inputEnded && !this.#shuttingDown) this.#readInput();
      if (written) this.#maybeComplete();
    }
  }

  #reserveReplyObligation(commit = true): boolean {
    if (this.#pendingReplyObligations >= MAX_PENDING_REPLY_OBLIGATIONS) return false;
    if (commit) this.#pendingReplyObligations += 1;
    return true;
  }

  #terminateInputAdmission(): void {
    this.#accepting = false;
    this.#inputEnded = true;
    this.#pendingInputChunk = undefined;
    this.#releaseInput();
  }

  #maybeComplete(): void {
    if (this.#settled || this.#processing || this.#shutdownRequest || this.#queue.length > 0) return;
    if (!this.#inputEnded && !this.#shuttingDown) return;
    this.#settled = true;
    this.#accepting = false;
    this.#releaseInput();
    void this.#writer.flush().then(
      () => this.#resolveDone?.(),
      (error: unknown) => this.#rejectDone?.(asError(error)),
    );
  }

  #fatal(cause: unknown): void {
    if (this.#settled) return;
    const error = asError(cause);
    this.#settled = true;
    this.#accepting = false;
    // Requests still in the execution queue can no longer produce replies.
    // Release their reserved obligations immediately so a terminal I/O error
    // cannot retain request payloads or leave the operational bound stale.
    const abandonedRequests = this.#queue.length + (this.#shutdownRequest ? 1 : 0);
    this.#queue.length = 0;
    this.#shutdownRequest = undefined;
    if (abandonedRequests > this.#pendingReplyObligations) {
      this.#pendingReplyObligations = 0;
      this.#reportDiagnostic('Measurement bridge reply admission accounting was inconsistent during terminal cleanup');
    } else {
      this.#pendingReplyObligations -= abandonedRequests;
    }
    this.#reportDiagnostic(formatDiagnostic('Measurement bridge terminated', error));
    this.#releaseInput();
    this.#rejectDone?.(error);
  }

  #reportDiagnostic(message: string): void {
    try {
      this.#diagnostics(message);
    } catch {
      // Diagnostics are best effort and must never replace protocol failure or
      // prevent this bounded session from settling.
    }
  }

  #releaseInput(): void {
    this.#input.removeListener('readable', this.#onReadable);
    this.#input.removeListener('end', this.#onEnd);
    this.#input.removeListener('error', this.#onInputError);
    this.#input.pause();
    // A shutdown request is terminal. Releasing the owned stdin stream is
    // required for the packaged child process to exit after its acknowledged
    // response instead of retaining the parent pipe indefinitely.
    if (!this.#input.destroyed) this.#input.destroy();
  }
}

class ProtocolWriter {
  readonly #output: Writable;
  readonly #maximumPending: number;
  readonly #queue: PendingProtocolWrite[] = [];
  readonly #flushWaiters: Array<{ resolve(): void; reject(error: Error): void }> = [];
  #pending = 0;
  #writing = false;
  #failure: Error | undefined;

  constructor(output: Writable, maximumPending = MAX_PENDING_REPLY_OBLIGATIONS) {
    this.#output = output;
    this.#maximumPending = maximumPending;
  }

  write(message: unknown): Promise<void> {
    if (this.#failure) return Promise.reject(this.#failure);
    if (this.#pending >= this.#maximumPending) {
      return Promise.reject(new Error(`Protocol writer exceeded its ${this.#maximumPending}-message pending bound`));
    }
    let chunk: string;
    try {
      const bounded = this.#boundedMessage(message);
      chunk = `${JSON.stringify(bounded)}\n`;
    } catch (error) {
      return Promise.reject(asError(error));
    }
    this.#pending += 1;
    return new Promise<void>((resolve, reject) => {
      this.#queue.push({ chunk, resolve, reject });
      this.#drain();
    });
  }

  flush(): Promise<void> {
    if (this.#failure) return Promise.reject(this.#failure);
    if (this.#pending === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => this.#flushWaiters.push({ resolve, reject }));
  }

  #drain(): void {
    if (this.#writing || this.#failure) return;
    const next = this.#queue.shift();
    if (!next) {
      if (this.#pending !== 0) this.#fail(new Error('Protocol writer pending accounting is inconsistent'));
      else for (const waiter of this.#flushWaiters.splice(0)) waiter.resolve();
      return;
    }
    this.#writing = true;
    void writeChunk(this.#output, next.chunk).then(() => {
      this.#writing = false;
      this.#pending -= 1;
      next.resolve();
      this.#drain();
    }, (error: unknown) => {
      this.#writing = false;
      this.#pending -= 1;
      next.reject(asError(error));
      this.#fail(error);
    });
  }

  #fail(cause: unknown): void {
    const error = asError(cause);
    this.#failure ??= error;
    for (const queued of this.#queue.splice(0)) {
      this.#pending -= 1;
      queued.reject(this.#failure);
    }
    for (const waiter of this.#flushWaiters.splice(0)) waiter.reject(this.#failure);
  }

  #boundedMessage(message: unknown): unknown {
    const parsed = measurementBridgeMessageSchema.parse(message);
    const bytes = Buffer.byteLength(JSON.stringify(parsed), 'utf8');
    if (bytes <= MEASUREMENT_BRIDGE_LIMITS.maxResponseLineBytes) return parsed;
    if (parsed.type !== 'response' || !parsed.ok) throw new Error('Uncorrelated protocol message exceeded the response line bound');
    const replacement = errorResponse(parsed.requestId, 'RESPONSE_TOO_LARGE', 'Response exceeded the measurement bridge line bound');
    if (Buffer.byteLength(JSON.stringify(replacement), 'utf8') > MEASUREMENT_BRIDGE_LIMITS.maxResponseLineBytes) {
      throw new Error('Bounded protocol error exceeded the response line bound');
    }
    return replacement;
  }
}

function correlationId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('requestId' in value)) return null;
  const requestId = (value as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(requestId) ? requestId : null;
}

function correlationIdFromLine(line: Buffer): string | null {
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(line);
    return correlationId(JSON.parse(source) as unknown);
  } catch {
    return null;
  }
}

const SYSTEM_TIMER: MeasurementBridgeTimer = {
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function withTimeout<T>(operation: () => T | Promise<T>, timeoutMs: number, timer: MeasurementBridgeTimer): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutHandle = timer.schedule(() => {
      if (settled) return;
      settled = true;
      reject(new RequestTimeoutError());
    }, Math.max(1, timeoutMs));
    Promise.resolve().then(operation).then(
      (value) => {
        if (settled) return;
        settled = true;
        timer.cancel(timeoutHandle);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        timer.cancel(timeoutHandle);
        reject(error);
      },
    );
  });
}

function writeChunk(output: Writable, chunk: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      output.removeListener('error', onError);
      reject(error);
    };
    output.once('error', onError);
    output.write(chunk, 'utf8', (error?: Error | null) => {
      if (error) {
        reject(error);
        // Writable implementations may emit `error` immediately after invoking
        // the write callback. Keep the bounded one-shot listener installed so
        // a callback-reported failure cannot become an uncaught exception.
      } else {
        output.removeListener('error', onError);
        resolve();
      }
    });
  });
}

function formatDiagnostic(prefix: string, cause: unknown): string {
  const error = asError(cause);
  return `${prefix}: ${error.stack ?? error.message}`.slice(0, 4_096);
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
