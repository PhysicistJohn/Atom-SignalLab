/**
 * Tx stream CLI (host tooling). Bundled to dist/tx-stream and driven through
 * tools/tx-stream.mjs. Samples go to the sink; every log, receipt, and
 * verdict goes to stderr.
 *
 * Usage:
 *   tx-stream (--profile ID [--selections JSON] | --recipe ID [--seed N])
 *             [--rate HZ] [--center HZ]
 *             (--samples N | --duration-seconds X | --unbounded)
 *             --sink file:PATH[--format cf32le|ci16le] | stdout | iiod
 *             [--uri URI] [--device-loop] [--buffer-samples N]
 *             [--attenuation-db DB] [--rf-port A|B]
 *             [--chunk-samples N] [--no-chunk-hash] [--force] [--plan-only]
 */
import { writeFile } from 'node:fs/promises';
import { waveformDescriptor } from './catalog.js';
import type { SynthesizedSignalProfile } from './contracts.js';
import {
  fixedDigitalProfileBinding,
  isFixedDigitalProfile,
  isUnboundedCompositionProfile,
  unboundedCompositionProfileBinding,
} from './fixed-digital-profile-binding.js';
import {
  TX_STREAM_RECIPE_DEFINITIONS,
} from './tx-stream-recipes.js';
import { txStreamRecipeRuntime } from './tx-stream-source.js';
import { TxStreamEngine, type TxStreamPlan } from './tx-stream-engine.js';
import { FileSink, StdoutSink, streamToSink } from './tx-stream-sinks.js';
import { IiodSink } from './tx-stream-iiod.js';
import { convertCf32leToCi16le } from './tx-stream-ci16.js';
import { planTxRate, type TxStreamSinkKind } from './tx-stream-rate-plan.js';

interface CliOptions {
  profile?: string;
  recipe?: string;
  seed?: number;
  selections?: Record<string, string>;
  rateHz?: number;
  centerHz?: number;
  samples?: number;
  durationSeconds?: number;
  unbounded: boolean;
  sink: string;
  sinkPath?: string;
  fileFormat: 'cf32le' | 'ci16le';
  uri?: string;
  deviceLoop: boolean;
  bufferSamples?: number;
  attenuationDb: number;
  rfPort: 'A' | 'B';
  chunkSamples?: number;
  chunkHashing: boolean;
  force: boolean;
  planOnly: boolean;
}

function usageError(message: string): never {
  process.stderr.write(`tx-stream: ${message}\n`);
  process.stderr.write(
    'usage: tx-stream (--profile ID [--selections JSON] | --recipe ID [--seed N]) '
    + '[--rate HZ] [--center HZ] (--samples N | --duration-seconds X | --unbounded) '
    + '--sink file:PATH|stdout|iiod [--uri URI] [--device-loop] [--buffer-samples N] '
    + '[--attenuation-db DB] [--rf-port A|B] [--chunk-samples N] [--no-chunk-hash] '
    + '[--force] [--plan-only]\n',
  );
  throw new Error(message);
}

export function parseTxStreamArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    unbounded: false,
    sink: '',
    fileFormat: 'cf32le',
    deviceLoop: false,
    attenuationDb: 10,
    rfPort: 'A',
    chunkHashing: true,
    force: false,
    planOnly: false,
  };
  const numeric = (flag: string, value: string | undefined): number => {
    if (value === undefined) usageError(`${flag} requires a value`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) usageError(`${flag} must be numeric`);
    return parsed;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = () => argv[index += 1];
    switch (arg) {
      case '--profile': options.profile = next(); break;
      case '--recipe': options.recipe = next(); break;
      case '--seed': options.seed = numeric(arg, next()); break;
      case '--selections': {
        const raw = next();
        if (raw === undefined) usageError('--selections requires JSON');
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            usageError('--selections must be a JSON object');
          }
          options.selections = parsed as Record<string, string>;
        } catch {
          usageError('--selections must be valid JSON');
        }
        break;
      }
      case '--rate': options.rateHz = numeric(arg, next()); break;
      case '--center': options.centerHz = numeric(arg, next()); break;
      case '--samples': options.samples = numeric(arg, next()); break;
      case '--duration-seconds': options.durationSeconds = numeric(arg, next()); break;
      case '--unbounded': options.unbounded = true; break;
      case '--sink': {
        const raw = next();
        if (raw === undefined) usageError('--sink requires a value');
        if (raw.startsWith('file:')) {
          options.sink = 'file';
          options.sinkPath = raw.slice('file:'.length);
        } else if (raw === 'stdout' || raw === 'iiod') {
          options.sink = raw;
        } else {
          usageError(`unknown sink ${raw}`);
        }
        break;
      }
      case '--format': {
        const raw = next();
        if (raw !== 'cf32le' && raw !== 'ci16le') usageError('--format must be cf32le or ci16le');
        options.fileFormat = raw;
        break;
      }
      case '--uri': options.uri = next(); break;
      case '--device-loop': options.deviceLoop = true; break;
      case '--buffer-samples': options.bufferSamples = numeric(arg, next()); break;
      case '--attenuation-db': options.attenuationDb = numeric(arg, next()); break;
      case '--rf-port': {
        const raw = next();
        if (raw !== 'A' && raw !== 'B') usageError('--rf-port must be A or B');
        options.rfPort = raw;
        break;
      }
      case '--chunk-samples': options.chunkSamples = numeric(arg, next()); break;
      case '--no-chunk-hash': options.chunkHashing = false; break;
      case '--force': options.force = true; break;
      case '--plan-only': options.planOnly = true; break;
      default: usageError(`unknown argument ${arg}`);
    }
  }
  if ((options.profile === undefined) === (options.recipe === undefined)) {
    usageError('exactly one of --profile or --recipe is required');
  }
  if (options.sink === '' && !options.planOnly) usageError('--sink is required');
  if (options.sink === 'iiod' && options.uri === undefined) {
    options.uri = 'ip:10.0.0.250';
  }
  const extentFlags = Number(options.samples !== undefined)
    + Number(options.durationSeconds !== undefined)
    + Number(options.unbounded);
  // --device-loop derives its extent from one schedule period, so it needs no
  // explicit extent flag (an explicit one is tolerated and ignored for iiod).
  if (!options.planOnly && !options.deviceLoop && extentFlags !== 1) {
    usageError('exactly one of --samples, --duration-seconds, or --unbounded is required');
  }
  return options;
}

function defaultRateForProfile(profile: string): number {
  const binding = isFixedDigitalProfile(profile as never)
    ? fixedDigitalProfileBinding(profile as never)
    : isUnboundedCompositionProfile(profile as never)
      ? unboundedCompositionProfileBinding(profile as never)
      : undefined;
  if (binding !== undefined) return binding.nativeSampleRateHz;
  return Math.max(1_000_000, waveformDescriptor(profile as never).occupiedBandwidthHz);
}

function defaultCenterForProfile(profile: string): number {
  return waveformDescriptor(profile as never).centerHz;
}

export async function txStreamMain(argv: readonly string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseTxStreamArgs(argv);
  } catch {
    return 2;
  }

  let source: TxStreamPlan['source'];
  let defaultRateHz: number;
  let defaultCenterHz: number;
  let signalBandwidthHz: number;
  let nativeSampleRateHz: number | null;
  let deviceLoopPeriodSamples: number | null;

  if (options.profile !== undefined) {
    const profile = options.profile as SynthesizedSignalProfile;
    source = { kind: 'profile', profile, selections: options.selections };
    defaultRateHz = defaultRateForProfile(profile);
    defaultCenterHz = defaultCenterForProfile(profile);
    const descriptor = waveformDescriptor(profile as never);
    const binding = isFixedDigitalProfile(profile as never)
      ? fixedDigitalProfileBinding(profile as never)
      : isUnboundedCompositionProfile(profile as never)
        ? unboundedCompositionProfileBinding(profile as never)
        : undefined;
    signalBandwidthHz = binding?.signalBandwidthHz ?? descriptor.occupiedBandwidthHz;
    nativeSampleRateHz = binding?.nativeSampleRateHz ?? null;
    deviceLoopPeriodSamples = binding?.replay === 'cyclic'
      ? binding.nativePeriodSamples
      : null;
  } else {
    const recipeId = options.recipe!;
    const runtime = txStreamRecipeRuntime(recipeId)
      ?? TX_STREAM_RECIPE_DEFINITIONS[recipeId as keyof typeof TX_STREAM_RECIPE_DEFINITIONS];
    if (runtime === undefined) {
      process.stderr.write(`tx-stream: unknown recipe ${recipeId}\n`);
      return 2;
    }
    source = { kind: 'recipe', recipeId, contentSeed: options.seed };
    defaultRateHz = runtime.sampleRateHz;
    defaultCenterHz = runtime.profileReferenceCenterHz;
    signalBandwidthHz = runtime.signalBandwidthHz;
    nativeSampleRateHz = null;
    deviceLoopPeriodSamples = runtime.deviceLoopPeriodSamples;
  }

  const sampleRateHz = options.rateHz ?? defaultRateHz;
  const centerHz = options.centerHz ?? defaultCenterHz;
  const durationSamples = options.samples !== undefined
    ? options.samples
    : options.durationSeconds !== undefined
      ? Math.max(1, Math.round(options.durationSeconds * sampleRateHz))
      : undefined;

  // A device-loop (cyclic) stream fills one device buffer with a single
  // schedule period and lets the DAC repeat it. Generate exactly one period so
  // the pump terminates cleanly; an unbounded engine would stall against a
  // cyclic writer that stops consuming once its buffer is full.
  const loopPeriodSamples = options.deviceLoop
    ? options.bufferSamples ?? deviceLoopPeriodSamples ?? undefined
    : undefined;

  const sinkKind: TxStreamSinkKind = options.sink === 'iiod'
    ? 'iiod'
    : options.sink === 'stdout' ? 'stdout' : 'file';
  const plan = planTxRate({
    sinkKind,
    sampleRateHz,
    signalBandwidthHz,
    nativeSampleRateHz,
    deviceLoopRequested: options.deviceLoop,
    deviceLoopPeriodSamples,
    centerHz,
  });
  process.stderr.write(
    `tx-stream rate plan: ${plan.verdict} `
    + `(wire ${plan.wireBytesPerSecond} B/s; link ceiling `
    + `${plan.linkSustainedCeilingBytesPerSecond} B/s; device window `
    + `${plan.deviceRateWindowHz[0]}-${plan.deviceRateWindowHz[1]} Hz/s)\n`,
  );
  for (const warning of plan.warnings) {
    process.stderr.write(`tx-stream warning: ${warning}\n`);
  }

  const planRejected = plan.verdict === 'rejected-below-anti-alias-guard'
    || plan.verdict === 'rejected-outside-device-rate-window'
    || plan.verdict === 'device-loop-infeasible'
    || (plan.verdict === 'device-loop-required' && sinkKind === 'iiod' && !options.deviceLoop);
  if (planRejected) {
    process.stderr.write('tx-stream: refusing to stream under the rate plan above\n');
    return options.planOnly ? 0 : 2;
  }
  if (options.planOnly) return 0;

  if (options.deviceLoop && sinkKind === 'iiod' && loopPeriodSamples === undefined) {
    process.stderr.write(
      'tx-stream: device loop requires a finite schedule period (or --buffer-samples)\n',
    );
    return 2;
  }
  const engineDurationSamples = options.deviceLoop && sinkKind === 'iiod'
    ? loopPeriodSamples
    : durationSamples;

  const enginePlan: unknown = {
    source,
    sampleRateHz,
    centerHz,
    durationSamples: engineDurationSamples,
    chunkHashing: options.chunkHashing,
    ...(options.chunkSamples !== undefined ? { chunkSamples: options.chunkSamples } : {}),
  };

  let engine: TxStreamEngine | null = null;
  const interrupt = () => engine?.cancel();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    // Engine construction throws typed refusals (one-shot artifacts,
    // inadmissible geometry); treat them as a clean non-zero exit, not a crash.
    engine = new TxStreamEngine(enginePlan);

    let sink;
    if (sinkKind === 'file') {
      sink = new FileSink({
        path: options.sinkPath!,
        force: options.force,
        encoder: options.fileFormat === 'ci16le' ? convertCf32leToCi16le : undefined,
      });
    } else if (sinkKind === 'stdout') {
      sink = new StdoutSink();
    } else {
      sink = new IiodSink({
        endpoint: { uri: options.uri! },
        geometry: {
          centerHz,
          sampleRateHz,
          attenuationDb: options.attenuationDb,
          rfPortSelect: options.rfPort,
          ensmMode: 'fdd',
        },
        cyclic: options.deviceLoop,
        // A device-loop (cyclic) buffer holds one whole schedule period; a
        // bounded stream must not be sized to the period, because iio_writedev
        // pads the final buffer to the buffer size and would push stale bytes.
        // For bounded streams, only an explicit --buffer-samples applies.
        bufferSamples: options.deviceLoop ? loopPeriodSamples : options.bufferSamples,
      });
    }

    const { manifest, report } = await streamToSink(engine, sink);
    process.stderr.write(
      `tx-stream ${manifest.state}: ${manifest.totals.samples} samples, `
      + `${manifest.totals.bytes} source bytes, ${manifest.totals.chunks} chunks, `
      + `sink accepted ${report.totalBytes} wire bytes\n`,
    );
    if (manifest.state !== 'completed') return 1;
    return 0;
  } catch (error) {
    process.stderr.write(`tx-stream faulted: ${error instanceof Error ? error.message : String(error)}\n`);
    if (engine !== null && sinkKind === 'file' && options.sinkPath !== undefined) {
      const faultedManifest = engine.manifest('faulted');
      await writeFile(
        `${options.sinkPath}.tx-stream.json`,
        `${JSON.stringify(faultedManifest, null, 2)}\n`,
        'utf8',
      ).catch(() => undefined);
    }
    return 1;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

export async function main(): Promise<void> {
  const exitCode = await txStreamMain(process.argv.slice(2));
  process.exitCode = exitCode;
}
