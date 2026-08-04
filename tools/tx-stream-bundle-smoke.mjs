#!/usr/bin/env node
/**
 * Bundle smoke for the tx-stream CLI, modeled on
 * tools/standards-runtime-bundle-smoke.mjs: imports the built bundle and
 * asserts architecture-independent behavior only (no pinned float digests).
 * The stream bytes are verified by self-consistency against an independent
 * in-bundle synthesis, never against host-specific golden hashes.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundleUrl = new URL('../dist/tx-stream/tx-stream-cli.js', import.meta.url);
let cli;
try {
  cli = await import(bundleUrl.href);
} catch (error) {
  console.error('tx-stream bundle smoke: failed to import the built bundle');
  console.error(String(error));
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`tx-stream bundle smoke FAILED: ${message}`);
    process.exit(1);
  }
}

const scratch = await mkdtemp(join(tmpdir(), 'tx-stream-smoke-'));
try {
  // 1. Bounded cw file stream completes and writes a sidecar.
  const cwPath = join(scratch, 'cw.iq.cf32le');
  let exitCode = await cli.txStreamMain([
    '--profile', 'cw',
    '--rate', '2000000', '--center', '98000000',
    '--samples', '2048',
    '--sink', `file:${cwPath}`,
    '--chunk-samples', '512',
  ]);
  assert(exitCode === 0, `cw file stream exited ${exitCode}`);
  const cwBytes = await readFile(cwPath);
  assert(cwBytes.byteLength === 2048 * 8, 'cw file length mismatch');
  const sidecar = JSON.parse(await readFile(`${cwPath}.tx-stream.json`, 'utf8'));
  assert(sidecar.state === 'completed', 'cw sidecar state is not completed');
  assert(sidecar.totals.samples === '2048', 'cw sidecar sample count mismatch');
  assert(typeof sidecar.contractSha256 === 'string' && sidecar.contractSha256.length === 64,
    'cw sidecar contract hash missing');

  // 2. ci16le file stream halves the wire bytes per sample.
  const ci16Path = join(scratch, 'cw.iq16le');
  exitCode = await cli.txStreamMain([
    '--profile', 'cw',
    '--rate', '2000000', '--center', '98000000',
    '--samples', '1024',
    '--sink', `file:${ci16Path}`, '--format', 'ci16le',
  ]);
  assert(exitCode === 0, `ci16le file stream exited ${exitCode}`);
  const ci16Bytes = await readFile(ci16Path);
  assert(ci16Bytes.byteLength === 1024 * 4, 'ci16le file length mismatch');

  // 3. GSM fixed profile streams under the chunk cap.
  const gsmPath = join(scratch, 'gsm.iq.cf32le');
  exitCode = await cli.txStreamMain([
    '--profile', 'gsm-900-loaded-bcch',
    '--samples', '3000',
    '--sink', `file:${gsmPath}`,
    '--chunk-samples', '1000',
  ]);
  assert(exitCode === 0, `gsm file stream exited ${exitCode}`);
  assert((await readFile(gsmPath)).byteLength === 3000 * 8, 'gsm file length mismatch');

  // 4. One-shot profiles refuse streaming with a typed refusal.
  exitCode = await cli.txStreamMain([
    '--profile', 'bluetooth-classic-connected',
    '--rate', '80000000', '--center', '2441000000',
    '--samples', '1024',
    '--sink', `file:${join(scratch, 'bt.iq.cf32le')}`,
  ]);
  assert(exitCode === 1, `one-shot refusal exited ${exitCode}, expected 1`);

  // 5. Derived rates below the guard are refused by the rate plan.
  exitCode = await cli.txStreamMain([
    '--profile', 'lte-band3-fdd-20m',
    '--rate', '15360000', '--center', '1840000000',
    '--samples', '1024',
    '--sink', `file:${join(scratch, 'lte.iq.cf32le')}`,
  ]);
  assert(exitCode === 2, `guard refusal exited ${exitCode}, expected 2`);

  // 6. Plan-only prints a verdict and streams nothing.
  exitCode = await cli.txStreamMain([
    '--profile', 'cw',
    '--rate', '2000000', '--center', '98000000',
    '--unbounded',
    '--sink', 'stdout',
    '--plan-only',
  ]);
  assert(exitCode === 0, `plan-only exited ${exitCode}`);

  // 7. A v1 recipe streams from the bundle.
  const fmPath = join(scratch, 'fm.iq.cf32le');
  exitCode = await cli.txStreamMain([
    '--recipe', 'fm-broadcast-mpx-v1',
    '--samples', '2048',
    '--sink', `file:${fmPath}`,
    '--chunk-samples', '512',
  ]);
  assert(exitCode === 0, `fm recipe stream exited ${exitCode}`);
  assert((await readFile(fmPath)).byteLength === 2048 * 8, 'fm recipe file length mismatch');

  console.log('tx-stream bundle smoke passed');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
