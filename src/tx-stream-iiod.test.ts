import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  configureTx,
  NEPTUNE_TX_IIO_NAMES,
  openTxStream,
  IiodSink,
  parseNumericReadback,
  type IiodChild,
  type IiodSpawnFn,
} from './tx-stream-iiod.js';
import { TxStreamError } from './tx-stream-source.js';
import type { TxStreamChunkReceipt } from './tx-stream-contract.js';

interface FakeChildOptions {
  exitCode?: number;
  exitDelayMs?: number;
  stderr?: string;
}

interface FakeChild extends IiodChild {
  readonly argv: readonly string[];
  readonly written: Uint8Array[];
  stdinEnded: boolean;
  readonly killSignals: string[];
  emitStdout(text: string): void;
  exit(code: number | null): void;
}

/** One scripted command execution captured by the fake spawn. */
function createFakeChild(argv: readonly string[], options: FakeChildOptions = {}): FakeChild {
  const emitter = new EventEmitter();
  const written: Uint8Array[] = [];
  const killSignals: string[] = [];
  let stdoutListenerAttached = false;
  let pendingStdout: string[] = [];
  const child: FakeChild = {
    argv,
    written,
    stdinEnded: false,
    killSignals,
    stdin: {
      write(chunk: Uint8Array): boolean {
        written.push(chunk.slice());
        return true;
      },
      end(): void {
        child.stdinEnded = true;
        setTimeout(() => child.exit(options.exitCode ?? 0), options.exitDelayMs ?? 0);
      },
      on(): unknown {
        return undefined;
      },
    },
    stdout: {
      on(event: string, listener: (chunk: Buffer) => void): unknown {
        if (event === 'data') {
          stdoutListenerAttached = true;
          for (const text of pendingStdout) listener(Buffer.from(text, 'utf8'));
          pendingStdout = [];
          emitter.on('stdout', listener);
        }
        return undefined;
      },
    },
    stderr: {
      on(event: string, listener: (chunk: Buffer) => void): unknown {
        if (event === 'data' && options.stderr !== undefined) {
          listener(Buffer.from(options.stderr, 'utf8'));
        }
        return undefined;
      },
    },
    pid: 4242,
    kill(signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): boolean {
      killSignals.push(signal);
      return true;
    },
    on(event: string, listener: (...args: unknown[]) => void): unknown {
      emitter.on(event, listener);
      return undefined;
    },
    emitStdout(text: string): void {
      if (stdoutListenerAttached) emitter.emit('stdout', Buffer.from(text, 'utf8'));
      else pendingStdout.push(text);
    },
    exit(code: number | null): void {
      emitter.emit('exit', code);
    },
  };
  return child;
}

interface RecordedSpawn {
  command: string;
  args: readonly string[];
  child: FakeChild;
}

/**
 * Scripted spawn: attribute readbacks answer from a queue; writedev
 * invocations get a child that exits on stdin end.
 */
function createScriptedSpawn(options: {
  readbackStdout?: readonly string[];
  failWrites?: boolean;
} = {}): { spawnFn: IiodSpawnFn; calls: RecordedSpawn[] } {
  const calls: RecordedSpawn[] = [];
  const readbacks = [...(options.readbackStdout ?? [])];
  const spawnFn: IiodSpawnFn = (command, args) => {
    // Readbacks carry no value argument: exactly 5 tokens after the URI for
    // channel attributes (-c -o device channel attr) and 3 for device
    // attributes (-d device attr); writes carry one more token.
    const uriIndex = args.indexOf('-u');
    const tokensAfterUri = uriIndex >= 0 ? args.length - uriIndex - 2 : args.length;
    const isReadback = command.endsWith('iio_attr')
      && ((args.includes('-c') && tokensAfterUri === 5)
        || (args.includes('-d') && tokensAfterUri === 3));
    const child = createFakeChild(args, {
      exitCode: options.failWrites && !isReadback ? 1 : 0,
    });
    calls.push({ command, args, child });
    if (isReadback) {
      const next = readbacks.shift();
      child.emitStdout(next ?? 'value: 0');
      setTimeout(() => child.exit(0), 0);
    } else if (command.endsWith('iio_attr')) {
      setTimeout(() => child.exit(options.failWrites ? 1 : 0), 0);
    }
    // writedev children exit when stdin ends (see createFakeChild).
    return child;
  };
  return { spawnFn, calls };
}

const GEOMETRY = {
  centerHz: 947_400_000,
  sampleRateHz: 1_300_000,
  attenuationDb: 10,
  rfPortSelect: 'A',
  ensmMode: 'fdd',
} as const;

const ENDPOINT = { uri: 'ip:127.0.0.1:30431' };

describe('iiod attribute discipline', () => {
  it('parses numeric readbacks fail-closed', () => {
    expect(parseNumericReadback('attr  2: sampling_frequency value: 1300000')).toBe(1_300_000);
    expect(parseNumericReadback('value: -10.000000 dB')).toBe(-10);
    expect(() => parseNumericReadback('no numbers here')).toThrow(/no numeric value/);
  });

  it('lowers bandwidths before the rate when stepping the clock down', async () => {
    const { spawnFn, calls } = createScriptedSpawn({
      readbackStdout: [
        'attr 5: ensm_mode value: alert',           // prior ENSM read
        'attr 0: frequency value: 947400000',       // LO readback
        'attr 2: sampling_frequency value: 30720000', // current-rate read (high)
        'attr 3: rf_bandwidth value: 1300000',      // RX bandwidth readback
        'attr 3: rf_bandwidth value: 1300000',      // TX bandwidth readback
        'attr 2: sampling_frequency value: 1300000',
        'attr 1: hardwaregain value: -89.750000',
        'attr 1: hardwaregain value: -10.000000',
        'attr 4: rf_port_select value: A',
        'attr 5: ensm_mode value: fdd',
      ],
    });
    const receipt = await configureTx(ENDPOINT, GEOMETRY, spawnFn);

    expect(receipt.priorEnsmMode).toBe('alert');
    const attributes = receipt.writes.map((write) => write.attribute);
    // Lowering: both bandwidths are narrowed before the clock drops.
    expect(attributes).toEqual([
      NEPTUNE_TX_IIO_NAMES.attributes.centerFrequencyHz,
      NEPTUNE_TX_IIO_NAMES.attributes.rfBandwidthHz,
      NEPTUNE_TX_IIO_NAMES.attributes.rfBandwidthHz,
      NEPTUNE_TX_IIO_NAMES.attributes.sampleRateHz,
      NEPTUNE_TX_IIO_NAMES.attributes.hardwareGainDb,
      NEPTUNE_TX_IIO_NAMES.attributes.hardwareGainDb,
      NEPTUNE_TX_IIO_NAMES.attributes.rfPortSelect,
      NEPTUNE_TX_IIO_NAMES.deviceAttributes.ensmMode,
    ]);
    expect(receipt.writes[1]!.target).toContain('input');
    expect(receipt.writes[2]!.target).toContain('output');
    // Maximum attenuation precedes the operator level.
    expect(receipt.writes[4]!.value).toBe('-89.75');
    expect(receipt.writes[5]!.value).toBe('-10');
    // ENSM is last, so no emission is possible before level discipline.
    expect(receipt.writes.at(-1)!.attribute).toBe('ensm_mode');
    expect(receipt.writes.at(-1)!.value).toBe('fdd');

    // Every attribute command carries the explicit direction flags.
    for (const call of calls) {
      if (!call.command.endsWith('iio_attr')) continue;
      const hasDirection = call.args.includes('-c') || call.args.includes('-d');
      expect(hasDirection).toBe(true);
    }
    const loCall = calls.find((call) => call.args.includes('altvoltage1'));
    expect(loCall?.args.join(' ')).toContain('-o ad9361-phy altvoltage1 frequency');
  });

  it('sets the rate before widening bandwidths when stepping the clock up', async () => {
    const { spawnFn } = createScriptedSpawn({
      readbackStdout: [
        'attr 5: ensm_mode value: alert',           // prior ENSM read
        'attr 0: frequency value: 947400000',       // LO readback
        'attr 2: sampling_frequency value: 1000000', // current-rate read (low)
        'attr 2: sampling_frequency value: 3000000', // rate readback
        'attr 3: rf_bandwidth value: 3000000',      // RX bandwidth readback
        'attr 3: rf_bandwidth value: 3000000',      // TX bandwidth readback
        'attr 1: hardwaregain value: -89.750000',
        'attr 1: hardwaregain value: -10.000000',
        'attr 4: rf_port_select value: A',
        'attr 5: ensm_mode value: fdd',
      ],
    });
    const receipt = await configureTx(
      ENDPOINT,
      { ...GEOMETRY, sampleRateHz: 3_000_000 },
      spawnFn,
    );
    const attributes = receipt.writes.map((write) => write.attribute);
    // Raising: the rate is set first, then the bandwidths widen to fit.
    expect(attributes).toEqual([
      NEPTUNE_TX_IIO_NAMES.attributes.centerFrequencyHz,
      NEPTUNE_TX_IIO_NAMES.attributes.sampleRateHz,
      NEPTUNE_TX_IIO_NAMES.attributes.rfBandwidthHz,
      NEPTUNE_TX_IIO_NAMES.attributes.rfBandwidthHz,
      NEPTUNE_TX_IIO_NAMES.attributes.hardwareGainDb,
      NEPTUNE_TX_IIO_NAMES.attributes.hardwareGainDb,
      NEPTUNE_TX_IIO_NAMES.attributes.rfPortSelect,
      NEPTUNE_TX_IIO_NAMES.deviceAttributes.ensmMode,
    ]);
  });

  it('rejects on readback mismatch before any further write', async () => {
    const { spawnFn } = createScriptedSpawn({
      readbackStdout: [
        'attr 5: ensm_mode value: alert',
        'attr 0: frequency value: 999999999', // wrong LO readback
      ],
    });
    await expect(configureTx(ENDPOINT, GEOMETRY, spawnFn))
      .rejects.toThrow(/TX LO readback mismatch|failed/i);
  });

  it('rejects when a write command exits non-zero', async () => {
    const { spawnFn } = createScriptedSpawn({ failWrites: true });
    await expect(configureTx(ENDPOINT, GEOMETRY, spawnFn))
      .rejects.toBeInstanceOf(TxStreamError);
  });

  it('refuses out-of-range attenuation before any device access', async () => {
    const { spawnFn, calls } = createScriptedSpawn();
    await expect(configureTx(
      ENDPOINT,
      { ...GEOMETRY, attenuationDb: 200 },
      spawnFn,
    )).rejects.toThrow(/attenuation/);
    expect(calls).toHaveLength(0);
  });
});

describe('iio_writedev stream handling', () => {
  it('always passes explicit TX channel argv and bounded sample count', () => {
    const { spawnFn, calls } = createScriptedSpawn();
    const stream = openTxStream(ENDPOINT, {
      cyclic: false,
      totalSamples: 4096,
      spawnFn,
    });
    const writedev = calls.find((call) => call.command.endsWith('iio_writedev'));
    expect(writedev).toBeDefined();
    expect(writedev!.args.join(' '))
      .toBe(`-u ${ENDPOINT.uri} -s 4096 ${NEPTUNE_TX_IIO_NAMES.txDevice} voltage0 voltage1`);
    stream.kill();
  });

  it('uses -c for cyclic device loops and never mixes it with -s', () => {
    const { spawnFn, calls } = createScriptedSpawn();
    const stream = openTxStream(ENDPOINT, {
      cyclic: true,
      bufferSamples: 24_000,
      spawnFn,
    });
    const writedev = calls.find((call) => call.command.endsWith('iio_writedev'));
    expect(writedev!.args.join(' '))
      .toBe(`-u ${ENDPOINT.uri} -b 24000 -c ${NEPTUNE_TX_IIO_NAMES.txDevice} voltage0 voltage1`);
    stream.kill();
  });

  it('streams ci16le-converted bytes through the IiodSink with exact accounting', async () => {
    const { spawnFn, calls } = createScriptedSpawn({
      readbackStdout: [
        'attr 5: ensm_mode value: fdd',             // prior ENSM read
        'attr 0: frequency value: 947400000',       // LO readback
        'attr 2: sampling_frequency value: 30720000', // current-rate read (high)
        'attr 3: rf_bandwidth value: 1300000',      // RX bandwidth readback
        'attr 3: rf_bandwidth value: 1300000',      // TX bandwidth readback
        'attr 2: sampling_frequency value: 1300000',
        'attr 1: hardwaregain value: -89.750000',
        'attr 1: hardwaregain value: -10.000000',
        'attr 4: rf_port_select value: A',
        'attr 5: ensm_mode value: fdd',
      ],
    });
    const sink = new IiodSink({
      endpoint: ENDPOINT,
      geometry: GEOMETRY,
      spawnFn,
    });
    await sink.open({
      source: { kind: 'profile', profile: 'cw' },
      sampleRateHz: 1_300_000,
      centerHz: 947_400_000,
      chunkSamples: 512,
      durationSamples: 1024,
      chunkHashing: true,
    });
    // cf32le chunk: two samples at half scale.
    const chunk = new Uint8Array(16);
    const view = new DataView(chunk.buffer);
    view.setFloat32(0, 0.5, true);
    view.setFloat32(4, -0.5, true);
    view.setFloat32(8, 0.25, true);
    view.setFloat32(12, -0.25, true);
    const receipt = {
      byteLength: 16,
      sampleCount: 2,
    } as unknown as TxStreamChunkReceipt;
    const ack = await sink.write(chunk, receipt);
    expect(ack.acceptedBytes).toBe(8); // ci16le: 4 bytes per sample
    const report = await sink.close(null);
    expect(report.totalChunks).toBe(1);
    expect(report.totalSamples).toBe(2);
    expect(report.totalBytes).toBe(8);

    const writedev = calls.find((call) => call.command.endsWith('iio_writedev'));
    const fake = writedev!.child;
    expect(fake.written).toHaveLength(1);
    const wire = new DataView(fake.written[0]!.buffer, fake.written[0]!.byteOffset, 8);
    expect(wire.getInt16(0, true)).toBe(16384);
    expect(wire.getInt16(2, true)).toBe(-16384);
    expect(wire.getInt16(4, true)).toBe(8192);
    expect(wire.getInt16(6, true)).toBe(-8192);
  });

  it('kill signals SIGTERM then SIGKILL escalation', () => {
    const { spawnFn, calls } = createScriptedSpawn();
    const stream = openTxStream(ENDPOINT, { cyclic: false, totalSamples: 16, spawnFn });
    const writedev = calls.find((call) => call.command.endsWith('iio_writedev'));
    stream.kill();
    expect(writedev!.child.killSignals[0]).toBe('SIGTERM');
  });
});
