import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const executable = resolve(repositoryRoot, 'dist/bridge/atomizer-bridge.js');
const contract = resolve(repositoryRoot, 'contracts/signal-lab-measurement-bridge-v1.json');
await requireDirectRegularFile(executable, 'built bridge executable');
await requireDirectRegularFile(contract, 'bridge contract');

const child = spawn(process.execPath, ['--disable-proto=throw', executable], {
  cwd: repositoryRoot,
  stdio: 'inherit',
  env: admittedEnvironment(process.env),
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  });
}

child.once('error', (error) => {
  process.stderr.write(`TinySA SignalLab bridge runner failed: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});

async function requireDirectRegularFile(path, label) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  if (await realpath(path) !== path) throw new Error(`${label} must resolve without path indirection: ${path}`);
}

function admittedEnvironment(environment) {
  const admitted = {};
  for (const name of ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR', 'TZ']) {
    const value = environment[name];
    if (typeof value === 'string') admitted[name] = value;
  }
  admitted.NODE_ENV = 'production';
  return admitted;
}
