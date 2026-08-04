import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';
import { TxStreamEngine } from './tx-stream-engine.js';
import { FileSink, StdoutSink, streamToSink } from './tx-stream-sinks.js';
import { txStreamManifestSchema } from './tx-stream-contract.js';

async function tempPath(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tx-stream-sinks-'));
  return join(dir, name);
}

describe('FileSink', () => {
  it('writes streamed bytes byte-exactly and emits a schema-valid sidecar', async () => {
    const path = await tempPath('cw.iq.cf32le');
    const engine = new TxStreamEngine({
      source: { kind: 'profile', profile: 'cw' },
      sampleRateHz: 2_000_000,
      centerHz: 98_000_000,
      chunkSamples: 512,
      durationSamples: 2048,
    });
    const sink = new FileSink({ path });
    const { manifest, report } = await streamToSink(engine, sink);

    // Cross-architecture self-consistency: the file must equal an independent
    // synthesis of the same absolute coordinate range (never a pinned digest).
    const written = await readFile(path);
    const reference = synthesizeAnalyticComplexIq({
      profile: 'cw',
      sampleRateHz: 2_000_000,
      bandwidthHz: 2_000,
      sampleCount: 2048,
      startSampleIndex: 0,
    });
    expect(Buffer.compare(Buffer.from(written), Buffer.from(reference))).toBe(0);

    expect(report.totalChunks).toBe(4);
    expect(report.totalBytes).toBe(2048 * 8);
    expect(manifest.state).toBe('completed');

    const sidecar = JSON.parse(await readFile(`${path}.tx-stream.json`, 'utf8'));
    expect(() => txStreamManifestSchema.parse(sidecar)).not.toThrow();
    expect(sidecar.streamId).toBe(manifest.streamId);
    expect(sidecar.totals.samples).toBe('2048');
  });

  it('refuses to overwrite an existing file unless forced', async () => {
    const path = await tempPath('existing.iq.cf32le');
    await writeFile(path, 'sentinel');
    const engine = new TxStreamEngine({
      source: { kind: 'profile', profile: 'cw' },
      sampleRateHz: 2_000_000,
      centerHz: 98_000_000,
      durationSamples: 64,
    });
    await expect(streamToSink(engine, new FileSink({ path })))
      .rejects.toThrow(/Refusing to overwrite/);
    expect(await readFile(path, 'utf8')).toBe('sentinel');

    const forced = new TxStreamEngine({
      source: { kind: 'profile', profile: 'cw' },
      sampleRateHz: 2_000_000,
      centerHz: 98_000_000,
      durationSamples: 64,
    });
    const { report } = await streamToSink(forced, new FileSink({ path, force: true }));
    expect(report.totalBytes).toBe(64 * 8);
  });

  it('records faulted state when a stream throws mid-write', async () => {
    const path = await tempPath('fault.iq.cf32le');
    const engine = new TxStreamEngine({
      source: { kind: 'profile', profile: 'cw' },
      sampleRateHz: 2_000_000,
      centerHz: 98_000_000,
      chunkSamples: 64,
      durationSamples: 256,
    });
    let writes = 0;
    const failingSink = new (class extends FileSink {
      async write(chunk: Uint8Array, receipt: Parameters<FileSink['write']>[1]) {
        writes += 1;
        if (writes === 2) throw new Error('simulated device fault');
        return super.write(chunk, receipt);
      }
    })({ path });
    await expect(streamToSink(engine, failingSink)).rejects.toThrow(/simulated device fault/);
    expect(engine.manifest('faulted').state).toBe('faulted');
    // Two chunks were produced; the second write faulted before acknowledge.
    expect(engine.manifest('faulted').totals.chunks).toBe(2);
  });
});

describe('StdoutSink', () => {
  it('emits raw sample bytes only, acknowledged per chunk', async () => {
    const collected: Uint8Array[] = [];
    const sink = new StdoutSink({
      write: async (chunk) => { collected.push(chunk.slice()); },
    });
    const engine = new TxStreamEngine({
      source: { kind: 'profile', profile: 'fm' },
      sampleRateHz: 2_000_000,
      centerHz: 98_000_000,
      chunkSamples: 256,
      durationSamples: 1024,
    });
    const { manifest, report } = await streamToSink(engine, sink);
    const total = collected.reduce((sum, part) => sum + part.byteLength, 0);
    expect(total).toBe(1024 * 8);
    expect(collected).toHaveLength(4);
    expect(report.totalChunks).toBe(4);
    expect(manifest.state).toBe('completed');
  });
});

describe('streamToSink pump discipline', () => {
  it('alternates engine pulls and sink acknowledgements without queueing', async () => {
    const path = await tempPath('pump.iq.cf32le');
    const engine = new TxStreamEngine({
      source: { kind: 'profile', profile: 'gsm-900-loaded-bcch' },
      sampleRateHz: 1_300_000,
      centerHz: 947_400_000,
      chunkSamples: 1000,
      durationSamples: 3000,
    });
    const order: string[] = [];
    const observingSink = new (class extends FileSink {
      async write(chunk: Uint8Array, receipt: Parameters<FileSink['write']>[1]) {
        order.push(`write:${receipt.chunkIndex}`);
        return super.write(chunk, receipt);
      }
    })({ path });
    const originalNext = engine.nextChunk.bind(engine);
    engine.nextChunk = () => {
      order.push('pull');
      return originalNext();
    };
    await streamToSink(engine, observingSink);
    expect(order).toEqual([
      'pull', 'write:0',
      'pull', 'write:1',
      'pull', 'write:2',
      'pull',
    ]);
  });
});
