/**
 * Tx stream sinks: bounded, acknowledged chunk writers.
 *
 * A sink accepts cf32le chunks exactly as the engine produces them (single
 * chunk in flight; the pump awaits the sink acknowledgement before pulling
 * the next chunk). File and stdout sinks are Phase 1; the iiod device sink
 * lands with the device transport phase. All logging stays off the sample
 * byte path: stdout carries only raw samples when it IS the sink.
 */
import { open, stat, writeFile, type FileHandle } from 'node:fs/promises';
import type { TxStreamChunkReceipt, TxStreamManifest } from './tx-stream-contract.js';
import type { TxStreamChunk, TxStreamEngine, TxStreamPlan } from './tx-stream-engine.js';
import { TxStreamError } from './tx-stream-source.js';

export interface TxStreamSinkAck {
  readonly acceptedBytes: number;
  readonly backpressureWaitMs?: number;
  readonly deviceUnderruns?: number;
}

export interface TxStreamSinkReport {
  readonly totalChunks: number;
  readonly totalSamples: number;
  readonly totalBytes: number;
  readonly underruns: number;
  readonly overruns: number;
  readonly closedAt: string;
}

export interface TxStreamSink {
  open(plan: TxStreamPlan): Promise<void>;
  write(chunk: Uint8Array, receipt: TxStreamChunkReceipt): Promise<TxStreamSinkAck>;
  close(manifest: TxStreamManifest | null): Promise<TxStreamSinkReport>;
}

function isoInstant(): string {
  return new Date().toISOString().replace(/(\d{3})\d*Z$/, '$1Z');
}

/**
 * Streaming cf32le file sink with a JSON sidecar recording the final
 * manifest. Refuses to overwrite an existing file unless forced.
 */
export class FileSink implements TxStreamSink {
  readonly path: string;
  readonly #force: boolean;
  /** Optional wire encoding (e.g. ci16le conversion) applied per chunk. */
  readonly #encoder: ((chunk: Uint8Array) => Uint8Array) | undefined;
  #handle: FileHandle | null = null;
  #chunks = 0;
  #samples = 0n;
  #bytes = 0n;
  #closed = false;

  constructor(options: {
    path: string;
    force?: boolean;
    encoder?: (chunk: Uint8Array) => Uint8Array;
  }) {
    this.path = options.path;
    this.#force = options.force ?? false;
    this.#encoder = options.encoder;
  }

  async open(plan: TxStreamPlan): Promise<void> {
    void plan;
    if (this.#handle !== null) {
      throw new Error('FileSink is already open');
    }
    if (!this.#force) {
      try {
        await stat(this.path);
        throw new Error(`Refusing to overwrite existing file ${this.path} (pass force to replace)`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    this.#handle = await open(this.path, this.#force ? 'w' : 'wx');
  }

  async write(chunk: Uint8Array, receipt: TxStreamChunkReceipt): Promise<TxStreamSinkAck> {
    if (this.#handle === null || this.#closed) {
      throw new TxStreamError('TX_STREAM_SINK_FAULT', 'FileSink is not open');
    }
    if (chunk.byteLength !== receipt.byteLength) {
      throw new Error('FileSink received a chunk whose byte length disagrees with its receipt');
    }
    const wire = this.#encoder === undefined ? chunk : this.#encoder(chunk);
    await this.#handle.write(wire);
    this.#chunks += 1;
    this.#samples += BigInt(receipt.sampleCount);
    this.#bytes += BigInt(wire.byteLength);
    return { acceptedBytes: wire.byteLength };
  }

  async close(manifest: TxStreamManifest | null): Promise<TxStreamSinkReport> {
    if (this.#closed) {
      return this.#report();
    }
    this.#closed = true;
    const handle = this.#handle;
    this.#handle = null;
    if (handle !== null) {
      await handle.close();
    }
    if (manifest !== null) {
      await writeFile(
        `${this.path}.tx-stream.json`,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
      );
    }
    return this.#report();
  }

  #report(): TxStreamSinkReport {
    return {
      totalChunks: this.#chunks,
      totalSamples: Number(this.#samples),
      totalBytes: Number(this.#bytes),
      underruns: 0,
      overruns: 0,
      closedAt: isoInstant(),
    };
  }
}

/**
 * Raw sample bytes to fd 1. Every log, receipt, and diagnostic goes to
 * stderr so the stdout stream stays pipe-clean for operator composition
 * (e.g. into iio_writedev); that composition is operator-owned.
 */
export class StdoutSink implements TxStreamSink {
  #chunks = 0;
  #samples = 0n;
  #bytes = 0n;
  #open = false;
  #closed = false;
  readonly #writeFn: (chunk: Uint8Array) => Promise<void>;

  constructor(options: { write?: (chunk: Uint8Array) => Promise<void> } = {}) {
    this.#writeFn = options.write ?? writeStdout;
  }

  async open(plan: TxStreamPlan): Promise<void> {
    void plan;
    if (this.#open) throw new Error('StdoutSink is already open');
    this.#open = true;
  }

  async write(chunk: Uint8Array, receipt: TxStreamChunkReceipt): Promise<TxStreamSinkAck> {
    if (!this.#open || this.#closed) {
      throw new TxStreamError('TX_STREAM_SINK_FAULT', 'StdoutSink is not open');
    }
    if (chunk.byteLength !== receipt.byteLength) {
      throw new Error('StdoutSink received a chunk whose byte length disagrees with its receipt');
    }
    const started = Date.now();
    await this.#writeFn(chunk);
    this.#chunks += 1;
    this.#samples += BigInt(receipt.sampleCount);
    this.#bytes += BigInt(chunk.byteLength);
    return {
      acceptedBytes: chunk.byteLength,
      backpressureWaitMs: Math.max(0, Date.now() - started),
    };
  }

  async close(manifest: TxStreamManifest | null): Promise<TxStreamSinkReport> {
    void manifest;
    this.#closed = true;
    this.#open = false;
    return {
      totalChunks: this.#chunks,
      totalSamples: Number(this.#samples),
      totalBytes: Number(this.#bytes),
      underruns: 0,
      overruns: 0,
      closedAt: isoInstant(),
    };
  }
}

function writeStdout(chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = process.stdout.write(chunk, (error) => {
      if (error !== undefined && error !== null) reject(error);
    });
    if (ok) resolve();
    else process.stdout.once('drain', resolve);
  });
}

/**
 * Pump an engine into a sink until the planned end, cancellation, or first
 * fault. The engine's pull and the sink's acknowledgement alternate one chunk
 * at a time; there is no internal queue. Returns the final manifest with the
 * sink's report attached for caller-side evidence.
 */
export async function streamToSink(
  engine: TxStreamEngine,
  sink: TxStreamSink,
): Promise<{ manifest: TxStreamManifest; report: TxStreamSinkReport }> {
  await sink.open(engine.plan);
  let state: TxStreamManifest['state'] = 'completed';
  let report: TxStreamSinkReport | null = null;
  try {
    for (;;) {
      const chunk: TxStreamChunk | null = engine.isCancelled()
        ? null
        : engine.nextChunk();
      if (chunk === null) {
        state = engine.isCancelled() ? 'terminated' : 'completed';
        break;
      }
      await sink.write(chunk.bytes, chunk.receipt);
    }
  } catch (error) {
    state = 'faulted';
    try {
      report = await sink.close(null);
    } catch {
      // The first fault is the one reported; a close failure on the fault
      // path must not mask the original error.
      throw error;
    }
    throw attachSinkReport(error, report);
  }
  const manifest = engine.manifest(state);
  report = await sink.close(manifest);
  return { manifest, report };
}

function attachSinkReport(
  error: unknown,
  report: TxStreamSinkReport,
): unknown {
  if (error instanceof Error) {
    error.message = `${error.message} [sink report: ${JSON.stringify(report)}]`;
  }
  return error;
}
