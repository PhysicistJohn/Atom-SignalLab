import { chmod, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const configPath = resolve(repositoryRoot, 'tsconfig.bridge.json');
const entry = resolve(repositoryRoot, 'src/atomizer-bridge.ts');
const outputDirectory = resolve(repositoryRoot, 'dist/bridge');
const output = resolve(outputDirectory, 'atomizer-bridge.js');
const contract = resolve(repositoryRoot, 'contracts/signal-lab-measurement-bridge-v1.json');

await requireRegularFile(configPath, 'bridge TypeScript configuration');
await requireRegularFile(entry, 'bridge entry source');
await requireRegularFile(contract, 'bridge contract');
JSON.parse(await readFile(contract, 'utf8'));
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
if (loaded.error) throw new Error(formatDiagnostics([loaded.error]));
const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, repositoryRoot, undefined, configPath);
if (parsed.errors.length > 0) throw new Error(formatDiagnostics(parsed.errors));
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const emitted = program.emit();
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics);
if (emitted.emitSkipped || diagnostics.some((item) => item.category === ts.DiagnosticCategory.Error)) {
  throw new Error(formatDiagnostics(diagnostics));
}

await requireRegularFile(output, 'built bridge executable');
const javascript = await readFile(output, 'utf8');
await writeFile(output, javascript.startsWith('#!') ? javascript : `#!/usr/bin/env node\n${javascript}`, 'utf8');
await chmod(output, 0o755);

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repositoryRoot,
    getNewLine: () => '\n',
  });
}

async function requireRegularFile(path, label) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${label} must be a regular non-symlink file: ${path}`);
}
