import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AtomizerNdjsonMeasurementBridge } from './measurement-bridge.js';
import { MEASUREMENT_GENERATOR_ARTIFACTS, measurementBridgeContractDocumentSchema } from './measurement-contract.js';
import {
  AtomizerMeasurementService,
  measurementServiceContinuationSchema,
  type MeasurementServiceContinuation,
} from './measurement-service.js';

const CONTRACT_FILE_NAME = 'signal-lab-measurement-bridge-v1.json';
const CONTINUATION_ENVIRONMENT_VARIABLE = 'ATOMIZER_SIGNAL_LAB_CONTINUATION_V1';
const MAX_CONTINUATION_CHARACTERS = 4_096;

async function main(): Promise<void> {
  const executablePath = fileURLToPath(import.meta.url);
  await requireRegularNonSymlink(executablePath, 'measurement bridge executable');
  const contractPath = fileURLToPath(new URL(`../../contracts/${CONTRACT_FILE_NAME}`, import.meta.url));
  await requireRegularNonSymlink(contractPath, 'measurement bridge contract');

  const contractBytes = await readFile(contractPath);
  const contractValue: unknown = JSON.parse(contractBytes.toString('utf8'));
  measurementBridgeContractDocumentSchema.parse(contractValue);

  const service = new AtomizerMeasurementService({
    contractSha256: sha256Hex(contractBytes),
    generatorSha256: await hashGeneratorArtifacts(),
  }, { continuation: readContinuation(process.env[CONTINUATION_ENVIRONMENT_VARIABLE]) });
  const bridge = new AtomizerNdjsonMeasurementBridge(service, {
    input: process.stdin,
    output: process.stdout,
    diagnostics: writeDiagnostic,
  });
  await bridge.run();
  if (bridge.executionTimedOut) process.exit(1);
}

function readContinuation(encoded: string | undefined): MeasurementServiceContinuation | undefined {
  if (encoded === undefined) return undefined;
  if (encoded.length < 1
    || encoded.length > MAX_CONTINUATION_CHARACTERS
    || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('SignalLab continuation is not canonical bounded base64url');
  }
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.toString('base64url') !== encoded) throw new Error('SignalLab continuation base64url is not canonical');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (cause) { throw new Error('SignalLab continuation is not valid UTF-8', { cause }); }
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (cause) { throw new Error('SignalLab continuation is not valid JSON', { cause }); }
  return measurementServiceContinuationSchema.parse(value);
}

async function hashGeneratorArtifacts(): Promise<string> {
  const hash = createHash('sha256');
  for (const name of MEASUREMENT_GENERATOR_ARTIFACTS) {
    const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
    await requireRegularNonSymlink(path, `measurement generator artifact ${name}`);
    const bytes = await readFile(path);
    const size = Buffer.allocUnsafe(8);
    size.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(name, 'utf8').update(Buffer.of(0)).update(size).update(bytes);
  }
  return hash.digest('hex');
}

async function requireRegularNonSymlink(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  const canonical = await realpath(path);
  if (canonical !== path) throw new Error(`${label} must resolve without path indirection`);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeDiagnostic(message: string): void {
  process.stderr.write(`${message}\n`);
}

void main().catch((cause: unknown) => {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  writeDiagnostic(`SignalLab measurement bridge startup failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
