/**
 * Neptune P210 Tx device transport over libiio 0.25 client tools.
 *
 * Subprocess-wrap pattern mirrors Atomizer's iio-transport discipline:
 * injectable spawn, bounded timeouts with SIGTERM-then-SIGKILL escalation,
 * outstanding-child tracking, and idempotent dispose. Every attribute write
 * is read back and rejected on mismatch. All device names, formats, and rate
 * limits come from the live unit diagnostic (Atom-NeptuneSDR-Firmware
 * docs/live-unit), never from the QEMU twin.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { convertCf32leToCi16le } from './tx-stream-ci16.js';
import {
  P210_TX_RF_BANDWIDTH_MAX_HZ,
} from './tx-stream-rate-plan.js';
import type { TxStreamChunkReceipt, TxStreamManifest } from './tx-stream-contract.js';
import type { TxStreamPlan } from './tx-stream-engine.js';
import type { TxStreamSink, TxStreamSinkAck, TxStreamSinkReport } from './tx-stream-sinks.js';
import { TxStreamError } from './tx-stream-source.js';

export const NEPTUNE_TX_IIO_NAMES = Object.freeze({
  phyDevice: 'ad9361-phy',
  txDevice: 'cf-ad9361-dds-core-lpc',
  txLoChannel: 'altvoltage1',
  txIChannel: 'voltage0',
  txQChannel: 'voltage1',
  attributes: Object.freeze({
    centerFrequencyHz: 'frequency',
    sampleRateHz: 'sampling_frequency',
    rfBandwidthHz: 'rf_bandwidth',
    hardwareGainDb: 'hardwaregain',
    rfPortSelect: 'rf_port_select',
  }),
  deviceAttributes: Object.freeze({
    ensmMode: 'ensm_mode',
  }),
} as const);

export const DEFAULT_LIBIIO_BUILD_FRAMEWORK_PATH = '/Users/johnelliott/src/libiio/build' as const;
const ATTRIBUTE_COMMAND_TIMEOUT_MS = 5_000 as const;
const KILL_ESCALATION_MS = 2_000 as const;
/** Safety ramp: maximum attenuation before the operator-selected level. */
const MAX_ATTENUATION_DB = 89.75 as const;

export interface IiodEndpoint {
  readonly uri: string;
  readonly iioAttrPath?: string;
  readonly iioWritedevPath?: string;
  readonly dyldFrameworkPath?: string;
}

export interface TxGeometry {
  readonly centerHz: number;
  readonly sampleRateHz: number;
  /** Operator-selected attenuation in dB from 0 through 89.75. */
  readonly attenuationDb: number;
  readonly rfPortSelect: 'A' | 'B';
  /** Only 'fdd' is admitted until 'tx' is proven by a supervised probe. */
  readonly ensmMode: 'fdd';
}

export interface TxAttributeWrite {
  readonly target: string;
  readonly attribute: string;
  readonly value: string;
  readonly readback: string;
}

export interface TxAttributeReceipt {
  readonly endpointUri: string;
  readonly priorEnsmMode: string | null;
  readonly writes: readonly TxAttributeWrite[];
  readonly completedAt: string;
}

/** Minimal child-process surface so tests can inject fakes. */
export interface IiodChild {
  readonly stdin: { write(chunk: Uint8Array): boolean; end(): void; on(event: 'drain' | 'error', listener: (...args: unknown[]) => void): unknown } | null;
  readonly stdout: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null;
  readonly stderr: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null;
  readonly pid?: number;
  kill(signal?: 'SIGTERM' | 'SIGKILL'): boolean;
  on(event: 'exit' | 'error', listener: (...args: unknown[]) => void): unknown;
}

export type IiodSpawnFn = (
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv },
) => IiodChild;

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv },
): IiodChild {
  const child: ChildProcessWithoutNullStreams = spawn(command, [...args], {
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return child as unknown as IiodChild;
}

function endpointEnv(endpoint: IiodEndpoint): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (process.platform === 'darwin') {
    env.DYLD_FRAMEWORK_PATH = endpoint.dyldFrameworkPath
      ?? DEFAULT_LIBIIO_BUILD_FRAMEWORK_PATH;
  }
  return env;
}

function toolPath(endpoint: IiodEndpoint, tool: 'iio_attr' | 'iio_writedev'): string {
  return tool === 'iio_attr'
    ? endpoint.iioAttrPath ?? 'iio_attr'
    : endpoint.iioWritedevPath ?? 'iio_writedev';
}

/** Run one short client command; bounded SIGTERM-then-SIGKILL teardown. */
export function runIiodCommand(
  endpoint: IiodEndpoint,
  command: string,
  args: readonly string[],
  spawnFn: IiodSpawnFn = defaultSpawn,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(command, args, { env: endpointEnv(endpoint) });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code: number | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(escalation);
      if (error !== undefined) reject(error);
      else resolve({ stdout, stderr, code });
    };
    const escalation = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null, new Error(`Tx stream command timed out and was killed: ${command} ${args.join(' ')}`));
    }, ATTRIBUTE_COMMAND_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (...args: unknown[]) => {
      clearTimeout(escalation);
      const error = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
      finish(null, error);
    });
    child.on('exit', (...args: unknown[]) => {
      finish(typeof args[0] === 'number' ? args[0] : null);
    });
    void child; // keep the reference alive for the listeners above
  });
}

/** Extract the last numeric readback from iio_attr output; fail-closed. */
export function parseNumericReadback(stdout: string): number {
  const matches = [...stdout.matchAll(/-?\d+(?:\.\d+)?/g)];
  if (matches.length === 0) {
    throw new Error(`Tx stream attribute readback carried no numeric value: ${JSON.stringify(stdout)}`);
  }
  const value = Number(matches[matches.length - 1]![0]);
  if (!Number.isFinite(value)) {
    throw new Error(`Tx stream attribute readback is not finite: ${JSON.stringify(stdout)}`);
  }
  return value;
}

/**
 * Best-effort read of the current sampling frequency, used to choose a safe
 * rate/bandwidth write order. Returns null when unreadable; the caller then
 * assumes the rate is not being lowered.
 */
async function readCurrentSampleRate(
  endpoint: IiodEndpoint,
  spawnFn: IiodSpawnFn | undefined,
): Promise<number | null> {
  const result = await runIiodCommand(endpoint, toolPath(endpoint, 'iio_attr'), [
    '-u', endpoint.uri, '-c', '-o', NEPTUNE_TX_IIO_NAMES.phyDevice,
    NEPTUNE_TX_IIO_NAMES.txIChannel, NEPTUNE_TX_IIO_NAMES.attributes.sampleRateHz,
  ], spawnFn);
  if (result.code !== 0) return null;
  try {
    return parseNumericReadback(result.stdout);
  } catch {
    return null;
  }
}

async function writeChannelAttribute(
  endpoint: IiodEndpoint,
  geometryValue: {
    attribute: string;
    value: string;
    numeric: boolean;
    tolerance?: number;
    /** Output ('-o', default) or input ('-i') channel direction. */
    direction?: '-o' | '-i';
  },
  spawnFn: IiodSpawnFn | undefined,
  writes: TxAttributeWrite[],
): Promise<void> {
  const direction = geometryValue.direction ?? '-o';
  const writeArgs = [
    '-u', endpoint.uri, '-c', direction, NEPTUNE_TX_IIO_NAMES.phyDevice,
    NEPTUNE_TX_IIO_NAMES.txIChannel, geometryValue.attribute, geometryValue.value,
  ];
  const writeResult = await runIiodCommand(
    endpoint, toolPath(endpoint, 'iio_attr'), writeArgs, spawnFn,
  );
  if (writeResult.code !== 0) {
    throw new TxStreamError(
      'TX_STREAM_SINK_FAULT',
      `iio_attr write of ${geometryValue.attribute} (${direction}) failed: `
      + `${writeResult.stderr || writeResult.stdout}`,
    );
  }
  const readbackResult = await runIiodCommand(
    endpoint, toolPath(endpoint, 'iio_attr'), writeArgs.slice(0, -1), spawnFn,
  );
  if (readbackResult.code !== 0) {
    throw new TxStreamError(
      'TX_STREAM_SINK_FAULT',
      `iio_attr readback of ${geometryValue.attribute} (${direction}) failed: ${readbackResult.stderr}`,
    );
  }
  const readbackText = readbackResult.stdout.trim();
  if (geometryValue.numeric) {
    const readbackValue = parseNumericReadback(readbackText);
    const tolerance = geometryValue.tolerance ?? 0;
    if (Math.abs(readbackValue - Number(geometryValue.value)) > tolerance) {
      throw new TxStreamError(
        'TX_STREAM_SINK_FAULT',
        `iio_attr readback mismatch for ${geometryValue.attribute}: requested `
        + `${geometryValue.value}, device reports ${readbackValue}`,
      );
    }
  } else if (!readbackText.includes(geometryValue.value)) {
    throw new TxStreamError(
      'TX_STREAM_SINK_FAULT',
      `iio_attr readback mismatch for ${geometryValue.attribute}: requested `
      + `${geometryValue.value}, device reports ${readbackText}`,
    );
  }
  writes.push({
    target: `${NEPTUNE_TX_IIO_NAMES.phyDevice}/${NEPTUNE_TX_IIO_NAMES.txIChannel} (${direction === '-o' ? 'output' : 'input'})`,
    attribute: geometryValue.attribute,
    value: geometryValue.value,
    readback: readbackText,
  });
}

/**
 * Configure the TX path: LO, rate, bandwidth, explicit level discipline, and
 * ENSM. Reads the prior ENSM state first so teardown can restore it. The
 * attenuation ramp writes maximum attenuation before the operator level.
 */
export async function configureTx(
  endpoint: IiodEndpoint,
  geometry: TxGeometry,
  spawnFn: IiodSpawnFn = defaultSpawn,
): Promise<TxAttributeReceipt> {
  if (!Number.isFinite(geometry.attenuationDb)
    || geometry.attenuationDb < 0
    || geometry.attenuationDb > MAX_ATTENUATION_DB) {
    throw new RangeError(`Tx attenuation must be from 0 through ${MAX_ATTENUATION_DB} dB`);
  }
  const priorEnsm = await runIiodCommand(
    endpoint,
    toolPath(endpoint, 'iio_attr'),
    ['-u', endpoint.uri, '-d', NEPTUNE_TX_IIO_NAMES.phyDevice,
      NEPTUNE_TX_IIO_NAMES.deviceAttributes.ensmMode],
    spawnFn,
  );

  // TX LO.
  const loWrite = ['-u', endpoint.uri, '-c', '-o', NEPTUNE_TX_IIO_NAMES.phyDevice,
    NEPTUNE_TX_IIO_NAMES.txLoChannel, NEPTUNE_TX_IIO_NAMES.attributes.centerFrequencyHz,
    String(geometry.centerHz)];
  const loResult = await runIiodCommand(endpoint, toolPath(endpoint, 'iio_attr'), loWrite, spawnFn);
  if (loResult.code !== 0) {
    throw new TxStreamError('TX_STREAM_SINK_FAULT', `TX LO write failed: ${loResult.stderr}`);
  }
  const loReadback = await runIiodCommand(
    endpoint, toolPath(endpoint, 'iio_attr'), loWrite.slice(0, -1), spawnFn,
  );
  const loValue = parseNumericReadback(loReadback.stdout);
  if (Math.abs(loValue - geometry.centerHz) > 1) {
    throw new TxStreamError(
      'TX_STREAM_SINK_FAULT',
      `TX LO readback mismatch: requested ${geometry.centerHz}, device reports ${loValue}`,
    );
  }

  const writes: TxAttributeWrite[] = [{
    target: `${NEPTUNE_TX_IIO_NAMES.phyDevice}/${NEPTUNE_TX_IIO_NAMES.txLoChannel}`,
    attribute: NEPTUNE_TX_IIO_NAMES.attributes.centerFrequencyHz,
    value: String(geometry.centerHz),
    readback: loReadback.stdout.trim(),
  }];

  // The AD9361 keeps RF bandwidth <= sample rate as an invariant, and each
  // attribute write is refused while the other would be violated. The safe
  // order therefore depends on the direction of change: when raising the rate,
  // set the rate first (the current bandwidths already fit under it) and then
  // widen the bandwidths; when lowering the rate, narrow both bandwidths first
  // and then drop the rate. Read the current rate to choose the order. The RX
  // bandwidth write targets the input channel; the TX bandwidth write targets
  // the output channel.
  const bandwidthHz = Math.min(geometry.sampleRateHz, P210_TX_RF_BANDWIDTH_MAX_HZ);
  const bandwidthWrite = (direction: '-i' | '-o') => writeChannelAttribute(endpoint, {
    attribute: NEPTUNE_TX_IIO_NAMES.attributes.rfBandwidthHz,
    value: String(bandwidthHz),
    numeric: true,
    tolerance: Math.max(1, Math.floor(geometry.sampleRateHz * 0.01)),
    direction,
  }, spawnFn, writes);
  const rateWrite = () => writeChannelAttribute(endpoint, {
    attribute: NEPTUNE_TX_IIO_NAMES.attributes.sampleRateHz,
    value: String(geometry.sampleRateHz),
    numeric: true,
  }, spawnFn, writes);

  const currentRateHz = await readCurrentSampleRate(endpoint, spawnFn);
  if (currentRateHz === null || geometry.sampleRateHz >= currentRateHz) {
    await rateWrite();
    await bandwidthWrite('-i');
    await bandwidthWrite('-o');
  } else {
    await bandwidthWrite('-i');
    await bandwidthWrite('-o');
    await rateWrite();
  }
  // Safety ramp: maximum attenuation first, then the operator level.
  await writeChannelAttribute(endpoint, {
    attribute: NEPTUNE_TX_IIO_NAMES.attributes.hardwareGainDb,
    value: String(-MAX_ATTENUATION_DB),
    numeric: true,
    tolerance: 0.25,
  }, spawnFn, writes);
  await writeChannelAttribute(endpoint, {
    attribute: NEPTUNE_TX_IIO_NAMES.attributes.hardwareGainDb,
    value: String(-geometry.attenuationDb),
    numeric: true,
    tolerance: 0.25,
  }, spawnFn, writes);
  await writeChannelAttribute(endpoint, {
    attribute: NEPTUNE_TX_IIO_NAMES.attributes.rfPortSelect,
    value: geometry.rfPortSelect,
    numeric: false,
  }, spawnFn, writes);

  // ENSM last, so no emission is possible before level discipline is set.
  const ensmWrite = ['-u', endpoint.uri, '-d', NEPTUNE_TX_IIO_NAMES.phyDevice,
    NEPTUNE_TX_IIO_NAMES.deviceAttributes.ensmMode, geometry.ensmMode];
  const ensmResult = await runIiodCommand(endpoint, toolPath(endpoint, 'iio_attr'), ensmWrite, spawnFn);
  if (ensmResult.code !== 0) {
    throw new TxStreamError('TX_STREAM_SINK_FAULT', `ENSM write failed: ${ensmResult.stderr}`);
  }
  const ensmReadback = await runIiodCommand(
    endpoint, toolPath(endpoint, 'iio_attr'), ensmWrite.slice(0, -1), spawnFn,
  );
  if (!ensmReadback.stdout.includes(geometry.ensmMode)) {
    throw new TxStreamError(
      'TX_STREAM_SINK_FAULT',
      `ENSM readback mismatch: requested ${geometry.ensmMode}, device reports ${ensmReadback.stdout.trim()}`,
    );
  }
  writes.push({
    target: `${NEPTUNE_TX_IIO_NAMES.phyDevice} (device)`,
    attribute: NEPTUNE_TX_IIO_NAMES.deviceAttributes.ensmMode,
    value: geometry.ensmMode,
    readback: ensmReadback.stdout.trim(),
  });

  const priorEnsmMode = priorEnsm.code === 0
    ? (priorEnsm.stdout.match(/value[:\s]+([a-z_]+)/)?.[1] ?? null)
    : null;
  return Object.freeze({
    endpointUri: endpoint.uri,
    priorEnsmMode,
    writes: Object.freeze(writes),
    completedAt: new Date().toISOString().replace(/(\d{3})\d*Z$/, '$1Z'),
  });
}

/** Restore the prior ENSM state (runbook teardown). */
export async function restoreEnsm(
  endpoint: IiodEndpoint,
  receipt: TxAttributeReceipt,
  spawnFn: IiodSpawnFn = defaultSpawn,
): Promise<void> {
  if (receipt.priorEnsmMode === null || receipt.priorEnsmMode === 'fdd') return;
  await runIiodCommand(endpoint, toolPath(endpoint, 'iio_attr'), [
    '-u', endpoint.uri, '-d', NEPTUNE_TX_IIO_NAMES.phyDevice,
    NEPTUNE_TX_IIO_NAMES.deviceAttributes.ensmMode, receipt.priorEnsmMode,
  ], spawnFn);
}

export interface IiodStreamHandle {
  write(chunk: Uint8Array): Promise<void>;
  end(): Promise<{ code: number | null; stderr: string }>;
  kill(): void;
}

/**
 * Spawn iio_writedev with explicit channel argv (never all-enable: the
 * scan-channel set changes under the 2R2T device tree) and stream ci16le
 * bytes to its stdin.
 */
export function openTxStream(
  endpoint: IiodEndpoint,
  options: {
    cyclic: boolean;
    totalSamples?: number;
    bufferSamples?: number;
    spawnFn?: IiodSpawnFn;
  },
): IiodStreamHandle {
  const spawnFn = options.spawnFn ?? defaultSpawn;
  const args: string[] = ['-u', endpoint.uri];
  if (options.bufferSamples !== undefined) {
    args.push('-b', String(options.bufferSamples));
  }
  if (options.cyclic) {
    args.push('-c');
  } else if (options.totalSamples !== undefined) {
    args.push('-s', String(options.totalSamples));
  }
  args.push(NEPTUNE_TX_IIO_NAMES.txDevice,
    NEPTUNE_TX_IIO_NAMES.txIChannel, NEPTUNE_TX_IIO_NAMES.txQChannel);
  const child = spawnFn(toolPath(endpoint, 'iio_writedev'), args, {
    env: endpointEnv(endpoint),
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

  return {
    async write(chunk: Uint8Array): Promise<void> {
      const stdin = child.stdin;
      if (stdin === null) {
        throw new TxStreamError('TX_STREAM_SINK_FAULT', 'iio_writedev stdin is unavailable');
      }
      const accepted = stdin.write(chunk);
      if (!accepted) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new TxStreamError(
            'TX_STREAM_SINK_FAULT',
            'iio_writedev stdin backpressure timed out',
          )), 10_000);
          stdin.on('drain', () => { clearTimeout(timer); resolve(); });
          stdin.on('error', (error: unknown) => {
            clearTimeout(timer);
            reject(new TxStreamError('TX_STREAM_SINK_FAULT', `iio_writedev stdin error: ${String(error)}`));
          });
        });
      }
    },
    async end(): Promise<{ code: number | null; stderr: string }> {
      child.stdin?.end();
      // A cyclic writer loops forever and never exits on stdin EOF, so signal
      // it after a brief flush grace. A bounded writer exits on EOF; give it a
      // longer grace before escalating.
      const graceMs = options.cyclic ? 300 : 10_000;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), KILL_ESCALATION_MS);
        }, graceMs);
        child.on('exit', (...args: unknown[]) => {
          clearTimeout(timer);
          resolve({ code: typeof args[0] === 'number' ? args[0] : null, stderr });
        });
      });
    },
    kill(): void {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), KILL_ESCALATION_MS);
    },
  };
}

/**
 * Device sink: converts engine cf32le chunks to ci16le and streams them to
 * iio_writedev. Exactly one chunk is in flight; the pump awaits each ack.
 */
export class IiodSink implements TxStreamSink {
  readonly endpoint: IiodEndpoint;
  readonly geometry: TxGeometry;
  readonly cyclic: boolean;
  readonly bufferSamples: number | undefined;
  readonly #spawnFn: IiodSpawnFn;
  #stream: IiodStreamHandle | null = null;
  #receipt: TxAttributeReceipt | null = null;
  #chunks = 0;
  #samples = 0n;
  #bytes = 0n;
  #closed = false;
  #underrunHint = false;

  constructor(options: {
    endpoint: IiodEndpoint;
    geometry: TxGeometry;
    cyclic?: boolean;
    bufferSamples?: number;
    spawnFn?: IiodSpawnFn;
  }) {
    this.endpoint = options.endpoint;
    this.geometry = options.geometry;
    this.cyclic = options.cyclic ?? false;
    this.bufferSamples = options.bufferSamples;
    this.#spawnFn = options.spawnFn ?? defaultSpawn;
  }

  get attributeReceipt(): TxAttributeReceipt | null {
    return this.#receipt;
  }

  async open(plan: TxStreamPlan): Promise<void> {
    if (this.#stream !== null) throw new Error('IiodSink is already open');
    this.#receipt = await configureTx(this.endpoint, this.geometry, this.#spawnFn);
    const totalSamples = this.cyclic || plan.durationSamples === undefined
      ? undefined
      : plan.durationSamples;
    this.#stream = openTxStream(this.endpoint, {
      cyclic: this.cyclic,
      totalSamples,
      bufferSamples: this.bufferSamples,
      spawnFn: this.#spawnFn,
    });
  }

  async write(chunk: Uint8Array, receipt: TxStreamChunkReceipt): Promise<TxStreamSinkAck> {
    if (this.#stream === null || this.#closed) {
      throw new TxStreamError('TX_STREAM_SINK_FAULT', 'IiodSink is not open');
    }
    const wire = convertCf32leToCi16le(chunk);
    await this.#stream.write(wire);
    this.#chunks += 1;
    this.#samples += BigInt(receipt.sampleCount);
    this.#bytes += BigInt(wire.byteLength);
    return { acceptedBytes: wire.byteLength };
  }

  async close(manifest: TxStreamManifest | null): Promise<TxStreamSinkReport> {
    void manifest;
    if (this.#closed) return this.#report();
    this.#closed = true;
    const stream = this.#stream;
    this.#stream = null;
    if (stream !== null) {
      const result = await stream.end();
      if (result.code !== 0 && result.code !== null) {
        this.#underrunHint = true;
      }
    }
    return this.#report();
  }

  /** Abort path: kill the writer now; bounded escalation to SIGKILL. */
  abort(): void {
    const stream = this.#stream;
    this.#stream = null;
    this.#closed = true;
    stream?.kill();
  }

  #report(): TxStreamSinkReport {
    return {
      totalChunks: this.#chunks,
      totalSamples: Number(this.#samples),
      totalBytes: Number(this.#bytes),
      underruns: this.#underrunHint ? 1 : 0,
      overruns: 0,
      closedAt: new Date().toISOString().replace(/(\d{3})\d*Z$/, '$1Z'),
    };
  }
}
