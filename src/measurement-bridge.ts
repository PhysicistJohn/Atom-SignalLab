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

class RequestTimeoutError extends Error {
  constructor() {
    super('Measurement bridge request timed out');
    this.name = 'RequestTimeoutError';
  }
}

/** A bounded, serial, exactly-one-response-per-line NDJSON bridge session. */
export class AtomizerNdjsonMeasurementBridge {
  readonly #dispatcher: MeasurementRequestDispatcher;
  readonly #input: Readable;
  readonly #writer: ProtocolWriter;
  readonly #diagnostics: (message: string) => void;
  readonly #monotonicMilliseconds: () => number;
  readonly #timer: MeasurementBridgeTimer;
  readonly #seenRequestIds = new Set<string>();
  readonly #queue: QueuedRequest[] = [];
  readonly #lineParts: Buffer[] = [];
  #lineBytes = 0;
  #lineTooLarge = false;
  #processing = false;
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
    this.#input.on('data', this.#onData);
    this.#input.once('end', this.#onEnd);
    this.#input.once('error', this.#onInputError);
    this.#input.resume();
    return done;
  }

  readonly #onData = (chunk: Buffer | string): void => {
    if (this.#settled) return;
    try {
      this.#consumeChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    } catch (error) {
      this.#fatal(error);
    }
  };

  readonly #onEnd = (): void => {
    if (this.#settled) return;
    this.#inputEnded = true;
    if (this.#lineTooLarge) {
      this.#scheduleResponse(errorResponse(null, 'LINE_TOO_LARGE', `Input lines may not exceed ${MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes} bytes`));
      this.#resetLine();
    } else if (this.#lineBytes > 0) {
      this.#scheduleResponse(errorResponse(null, 'LINE_TERMINATOR_REQUIRED', 'Every NDJSON request must end with LF'));
      this.#resetLine();
    }
    this.#maybeComplete();
  };

  readonly #onInputError = (error: Error): void => {
    this.#fatal(error);
  };

  #consumeChunk(chunk: Buffer): void {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset);
      if (newline === -1) {
        this.#appendLineBytes(chunk.subarray(offset));
        return;
      }
      this.#appendLineBytes(chunk.subarray(offset, newline));
      this.#finishLine();
      offset = newline + 1;
    }
  }

  #appendLineBytes(bytes: Buffer): void {
    if (bytes.length === 0 || this.#lineTooLarge) return;
    const nextSize = this.#lineBytes + bytes.length;
    if (nextSize > MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes) {
      this.#lineParts.length = 0;
      this.#lineBytes = nextSize;
      this.#lineTooLarge = true;
      return;
    }
    this.#lineParts.push(Buffer.from(bytes));
    this.#lineBytes = nextSize;
  }

  #finishLine(): void {
    if (this.#lineTooLarge) {
      this.#scheduleResponse(errorResponse(null, 'LINE_TOO_LARGE', `Input lines may not exceed ${MEASUREMENT_BRIDGE_LIMITS.maxRequestLineBytes} bytes`));
      this.#resetLine();
      return;
    }
    const line = Buffer.concat(this.#lineParts, this.#lineBytes);
    this.#resetLine();
    this.#acceptLine(line);
  }

  #resetLine(): void {
    this.#lineParts.length = 0;
    this.#lineBytes = 0;
    this.#lineTooLarge = false;
  }

  #acceptLine(line: Buffer): void {
    let source: string;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(line);
    } catch {
      this.#scheduleResponse(errorResponse(null, 'INVALID_ENCODING', 'Requests must be valid UTF-8'));
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      this.#scheduleResponse(errorResponse(null, 'INVALID_JSON', 'Each input line must contain exactly one JSON request'));
      return;
    }

    const parsed = measurementBridgeRequestSchema.safeParse(value);
    if (!parsed.success) {
      this.#scheduleResponse(errorResponse(correlationId(value), 'INVALID_REQUEST', 'Request does not match measurement bridge contract version 1'));
      return;
    }
    const request = parsed.data;
    if (this.#seenRequestIds.has(request.requestId)) {
      this.#scheduleResponse(errorResponse(request.requestId, 'DUPLICATE_REQUEST_ID', 'Request identifiers may be used only once per session'));
      return;
    }
    if (this.#seenRequestIds.size >= MEASUREMENT_BRIDGE_LIMITS.maxSessionRequests) {
      this.#scheduleResponse(errorResponse(request.requestId, 'SESSION_REQUEST_LIMIT', 'The bounded request budget for this session is exhausted'));
      return;
    }
    this.#seenRequestIds.add(request.requestId);

    if (!this.#accepting || this.#shuttingDown) {
      this.#scheduleResponse(errorResponse(request.requestId, 'SHUTTING_DOWN', 'The measurement bridge is shutting down'));
      return;
    }
    const outstanding = this.#queue.length + (this.#processing ? 1 : 0);
    if (outstanding >= MEASUREMENT_BRIDGE_LIMITS.maxQueuedRequests) {
      this.#scheduleResponse(errorResponse(request.requestId, 'OVERLOADED', 'The bounded measurement request queue is full'));
      return;
    }
    this.#queue.push({ request, receivedAt: this.#monotonicMilliseconds() });
    void this.#drainQueue().catch((error) => this.#fatal(error));
  }

  async #drainQueue(): Promise<void> {
    if (this.#processing || this.#settled) return;
    this.#processing = true;
    try {
      while (this.#queue.length > 0) {
        const item = this.#queue.shift()!;
        if (this.#shuttingDown) {
          await this.#writer.write(errorResponse(item.request.requestId, 'SHUTTING_DOWN', 'The measurement bridge is shutting down'));
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
      await this.#writer.write(errorResponse(item.request.requestId, 'REQUEST_TIMEOUT', 'Request exceeded the measurement bridge time bound before execution'));
      return;
    }
    try {
      const result = await withTimeout(
        () => this.#dispatcher.dispatch(item.request),
        MEASUREMENT_BRIDGE_LIMITS.requestTimeoutMs - Math.max(0, elapsed),
        this.#timer,
      );
      await this.#writer.write(successResponse(item.request.requestId, result as never));
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        // The underlying Promise cannot be cancelled. Make the entire session
        // terminal before replying so no later mutation can race it.
        this.#executionTimedOut = true;
        this.#shuttingDown = true;
        this.#accepting = false;
        this.#input.pause();
        await this.#writer.write(errorResponse(item.request.requestId, 'REQUEST_TIMEOUT', 'Request exceeded the measurement bridge execution time bound'));
        return;
      }
      if (error instanceof MeasurementServiceError) {
        await this.#writer.write(errorResponse(item.request.requestId, error.code, error.message));
        return;
      }
      this.#diagnostics(formatDiagnostic('Measurement request failed', error));
      await this.#writer.write(errorResponse(item.request.requestId, 'INTERNAL_ERROR', 'Measurement request failed without state substitution or retry'));
    }
  }

  #scheduleResponse(response: MeasurementBridgeResponse): void {
    void this.#writer.write(response)
      .then(() => this.#maybeComplete())
      .catch((error) => this.#fatal(error));
  }

  #maybeComplete(): void {
    if (this.#settled || this.#processing || this.#queue.length > 0) return;
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
    this.#diagnostics(formatDiagnostic('Measurement bridge terminated', error));
    this.#releaseInput();
    this.#rejectDone?.(error);
  }

  #releaseInput(): void {
    this.#input.removeListener('data', this.#onData);
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
  #tail: Promise<void> = Promise.resolve();
  #failure: Error | undefined;

  constructor(output: Writable) {
    this.#output = output;
  }

  write(message: unknown): Promise<void> {
    const operation = this.#tail.then(async () => {
      if (this.#failure) throw this.#failure;
      const bounded = this.#boundedMessage(message);
      await writeChunk(this.#output, `${JSON.stringify(bounded)}\n`);
    });
    this.#tail = operation.catch((error: unknown) => {
      this.#failure = asError(error);
    });
    return operation;
  }

  async flush(): Promise<void> {
    await this.#tail;
    if (this.#failure) throw this.#failure;
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
      output.removeListener('error', onError);
      if (error) reject(error);
      else resolve();
    });
  });
}

function formatDiagnostic(prefix: string, cause: unknown): string {
  const error = asError(cause);
  return `${prefix}: ${error.stack ?? error.message}`;
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
