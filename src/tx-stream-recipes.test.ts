import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  TX_STREAM_RECIPE_DEFINITIONS,
  registerTxStreamRecipes,
} from './tx-stream-recipes.js';
import { TxStreamEngine } from './tx-stream-engine.js';
import { loadTxStreamContract } from './tx-stream-contract.js';

const RECIPE_IDS = Object.keys(TX_STREAM_RECIPE_DEFINITIONS) as readonly (
  keyof typeof TX_STREAM_RECIPE_DEFINITIONS
)[];

function recipePlan(
  recipeId: keyof typeof TX_STREAM_RECIPE_DEFINITIONS,
  overrides: Record<string, unknown> = {},
) {
  const definition = TX_STREAM_RECIPE_DEFINITIONS[recipeId];
  return {
    source: { kind: 'recipe', recipeId },
    sampleRateHz: definition.sampleRateHz,
    centerHz: definition.profileReferenceCenterHz,
    chunkSamples: 4096,
    durationSamples: 16384,
    ...overrides,
  };
}

function drain(engine: TxStreamEngine): Uint8Array {
  const parts: Uint8Array[] = [];
  for (;;) {
    const chunk = engine.nextChunk();
    if (chunk === null) break;
    parts.push(chunk.bytes);
  }
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
  return joined;
}

describe('tx-stream recipe determinism', () => {
  it.each(RECIPE_IDS)(
    '%s is byte-exact under awkward chunk partitions',
    { timeout: 120_000 },
    (recipeId) => {
      const whole = new TxStreamEngine(recipePlan(recipeId, { chunkSamples: 16384 }));
      const partitioned = new TxStreamEngine(recipePlan(recipeId, { chunkSamples: 1373 }));
      expect(drain(partitioned)).toEqual(drain(whole));
    },
  );

  it('pins every recipe to its contract-declared sample rate', () => {
    for (const recipeId of RECIPE_IDS) {
      expect(() => new TxStreamEngine({
        ...recipePlan(recipeId),
        sampleRateHz: TX_STREAM_RECIPE_DEFINITIONS[recipeId].sampleRateHz + 1,
      })).toThrow(/pins its sample rate/);
    }
  });
});

describe('tx-stream recipe schedules', () => {
  it('rotates gsm xCCH content per 4-frame cycle while dummy bursts stay fixed', () => {
    const engine = new TxStreamEngine(recipePlan('gsm-900-xcch-cycle-v1', {
      chunkSamples: 8192,
      durationSamples: 48000,
    }));
    const bytes = drain(engine);
    expect(bytes.byteLength).toBe(48000 * 8);
    const epoch0Ts0 = bytes.subarray(0, 750 * 8);
    const epoch1Ts0 = bytes.subarray(24000 * 8, (24000 + 750) * 8);
    const epoch0Ts1 = bytes.subarray(750 * 8, 1500 * 8);
    const epoch1Ts1 = bytes.subarray((24000 + 750) * 8, (24000 + 1500) * 8);
    expect(epoch0Ts0).not.toEqual(epoch1Ts0);
    expect(epoch0Ts1).toEqual(epoch1Ts1);
  });

  it('keeps lte frame content distinct per absolute frame ordinal', () => {
    const definition = TX_STREAM_RECIPE_DEFINITIONS['lte-band3-operational-v1'];
    const frameSamples = 307200;
    const firstFrame = definition.synthesizeWindow({
      contentSeed: definition.contentSeedDefault,
      startSample: 0n,
      sampleCount: 4096,
    });
    const secondFrame = definition.synthesizeWindow({
      contentSeed: definition.contentSeedDefault,
      startSample: BigInt(frameSamples),
      sampleCount: 4096,
    });
    expect(firstFrame).not.toEqual(secondFrame);
    // Same frame ordinal, same coordinate: repeatable.
    const repeated = definition.synthesizeWindow({
      contentSeed: definition.contentSeedDefault,
      startSample: BigInt(frameSamples),
      sampleCount: 4096,
    });
    expect(repeated).toEqual(secondFrame);
  });

  it('crosses the lte frame boundary byte-exactly under chunking', () => {
    const durationSamples = 307200 + 4096;
    const whole = new TxStreamEngine(recipePlan('lte-band3-operational-v1', {
      chunkSamples: 65536,
      durationSamples,
    }));
    const partitioned = new TxStreamEngine(recipePlan('lte-band3-operational-v1', {
      chunkSamples: 16384,
      durationSamples,
    }));
    expect(drain(partitioned)).toEqual(drain(whole));
  }, 120_000);

  it('places wi-fi PPDUs at prevEnd + DIFS + backoff x slot with seeded backoff', () => {
    const definition = TX_STREAM_RECIPE_DEFINITIONS['wifi-ofdm-ppdu-stream-v1'];
    const durationSamples = 20000;
    const bytes = definition.synthesizeWindow({
      contentSeed: definition.contentSeedDefault,
      startSample: 0n,
      sampleCount: durationSamples,
    });
    const isSilent = (sampleIndex: number): boolean => {
      const view = new DataView(bytes.buffer, sampleIndex * 8, 8);
      return view.getFloat32(0, true) === 0 && view.getFloat32(4, true) === 0;
    };
    // Find segment starts: first non-silent sample after silence. The ERP ACK
    // PPDU ends in a zero signal-extension, so measure each segment's active
    // span (first to last non-silent sample) rather than a fixed length.
    const starts: number[] = [];
    const activeLengths: number[] = [];
    let index = 0;
    while (index < durationSamples) {
      if (!isSilent(index)) {
        const start = index;
        let lastNonSilent = index;
        while (index < durationSamples && !isSilent(index)) {
          lastNonSilent = index;
          index += 1;
        }
        // Skip a possible zero tail inside the PPDU period: look ahead for
        // more non-silent samples within 1000 samples of the start.
        while (index < durationSamples && index - start < 1000) {
          if (!isSilent(index)) {
            lastNonSilent = index;
            index += 1;
            while (index < durationSamples && !isSilent(index)) {
              lastNonSilent = index;
              index += 1;
            }
          } else {
            index += 1;
          }
        }
        starts.push(start);
        activeLengths.push(lastNonSilent - start + 1);
      } else {
        index += 1;
      }
    }
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts[0]).toBe(0);
    // Every complete PPDU renders the identical seeded ACK geometry; the final
    // segment may be cut by the window edge and is excluded.
    for (const length of activeLengths.slice(0, -1)) {
      expect(length).toBe(activeLengths[0]);
    }
    expect(activeLengths[0]).toBeGreaterThan(400);
    expect(activeLengths[0]).toBeLessThanOrEqual(1000);
    // Successive starts are spaced by the PPDU period + DIFS + backoff x slot.
    for (let ordinal = 1; ordinal < starts.length; ordinal += 1) {
      const spacing = starts[ordinal]! - starts[ordinal - 1]!;
      expect(spacing).toBeGreaterThanOrEqual(1000 + 680);
      expect(spacing).toBeLessThanOrEqual(1000 + 680 + 15 * 180);
      expect((spacing - 1000 - 680) % 180).toBe(0);
    }
    // The backoff sequence is seed-deterministic.
    const repeated = definition.synthesizeWindow({
      contentSeed: definition.contentSeedDefault,
      startSample: 0n,
      sampleCount: durationSamples,
    });
    expect(repeated).toEqual(bytes);
  });

  it('evaluates fm and am samples independently at any coordinate', () => {
    for (const recipeId of ['fm-broadcast-mpx-v1', 'am-voice-v1'] as const) {
      const definition = TX_STREAM_RECIPE_DEFINITIONS[recipeId];
      const sequential = definition.synthesizeWindow({
        contentSeed: definition.contentSeedDefault,
        startSample: 0n,
        sampleCount: 8192,
      });
      const offsetWindow = definition.synthesizeWindow({
        contentSeed: definition.contentSeedDefault,
        startSample: 4096n,
        sampleCount: 4096,
      });
      expect(offsetWindow).toEqual(sequential.subarray(4096 * 8));
    }
  });

  it('varies seeded content and never between identical seeds', () => {
    for (const recipeId of RECIPE_IDS) {
      const definition = TX_STREAM_RECIPE_DEFINITIONS[recipeId];
      const base = definition.synthesizeWindow({
        contentSeed: definition.contentSeedDefault,
        startSample: 0n,
        sampleCount: 4096,
      });
      const identical = definition.synthesizeWindow({
        contentSeed: definition.contentSeedDefault,
        startSample: 0n,
        sampleCount: 4096,
      });
      const varied = definition.synthesizeWindow({
        contentSeed: definition.contentSeedDefault + 1,
        startSample: 0n,
        sampleCount: 4096,
      });
      expect(identical).toEqual(base);
      expect(varied).not.toEqual(base);
    }
  });
});

describe('tx-stream recipe coordinate determinism', () => {
  const join = (parts: Uint8Array[]): Uint8Array => {
    const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
    return joined;
  };

  it('reproduces nr-n78 windows at non-zero coordinates across the frame boundary', () => {
    const definition = TX_STREAM_RECIPE_DEFINITIONS['nr-n78-tdd-pattern-v1'];
    const frameSamples = 2457600;
    const seed = definition.contentSeedDefault;
    // A window straddling the frame 0 -> frame 1 boundary.
    const straddleStart = BigInt(frameSamples - 1000);
    const whole = definition.synthesizeWindow({
      contentSeed: seed, startSample: straddleStart, sampleCount: 2000,
    });
    const head = definition.synthesizeWindow({
      contentSeed: seed, startSample: straddleStart, sampleCount: 1000,
    });
    const tail = definition.synthesizeWindow({
      contentSeed: seed, startSample: BigInt(frameSamples), sampleCount: 1000,
    });
    expect(join([head, tail])).toEqual(whole);
    // Per-frame content rotation: frame 0 and frame 1 differ at equal offsets.
    const frame0 = definition.synthesizeWindow({
      contentSeed: seed, startSample: 0n, sampleCount: 4096,
    });
    const frame1 = definition.synthesizeWindow({
      contentSeed: seed, startSample: BigInt(frameSamples), sampleCount: 4096,
    });
    expect(frame0).not.toEqual(frame1);
    // Repeatable at a non-zero coordinate.
    const repeated = definition.synthesizeWindow({
      contentSeed: seed, startSample: straddleStart, sampleCount: 2000,
    });
    expect(repeated).toEqual(whole);
  });

  it('crosses the gsm epoch boundary byte-exactly', () => {
    const definition = TX_STREAM_RECIPE_DEFINITIONS['gsm-900-xcch-cycle-v1'];
    const epochSamples = 24000;
    const seed = definition.contentSeedDefault;
    const straddleStart = BigInt(epochSamples - 1000);
    const whole = definition.synthesizeWindow({
      contentSeed: seed, startSample: straddleStart, sampleCount: 2000,
    });
    const head = definition.synthesizeWindow({
      contentSeed: seed, startSample: straddleStart, sampleCount: 1000,
    });
    const tail = definition.synthesizeWindow({
      contentSeed: seed, startSample: BigInt(epochSamples), sampleCount: 1000,
    });
    expect(join([head, tail])).toEqual(whole);
  });
});

describe('tx-stream recipe governance', () => {
  it('carries the mandated splatter/ramp/source-clean disclosures', () => {
    for (const recipeId of RECIPE_IDS) {
      const disclosure = TX_STREAM_RECIPE_DEFINITIONS[recipeId].disclosure;
      expect(disclosure).toMatch(/hard edges/);
      expect(disclosure).toMatch(/no power ramp is modeled/);
      expect(disclosure).toMatch(/wideband splatter/);
      expect(disclosure).toMatch(/not\s+representative of a conformant transmitter/);
      expect(disclosure).toMatch(/source-clean/);
      expect(disclosure).toMatch(/no canonical artifact/);
    }
  });

  it('publishes exact promotion requirements for every recipe', () => {
    for (const recipeId of RECIPE_IDS) {
      const requirements = TX_STREAM_RECIPE_DEFINITIONS[recipeId].promotionRequirements;
      expect(requirements.length).toBeGreaterThanOrEqual(6);
      expect(requirements.join('\n')).toMatch(/new trio composition version/);
    }
  });

  it('keeps recipe seeds inside the reserved 0x51A7xxxx domain', () => {
    for (const recipeId of RECIPE_IDS) {
      const seed = TX_STREAM_RECIPE_DEFINITIONS[recipeId].contentSeedDefault;
      expect(seed).toBeGreaterThanOrEqual(0x51a7_0001);
      expect(seed).toBeLessThanOrEqual(0x51a7_ffff);
    }
  });

  it('matches the contract recipe rows exactly', async () => {
    const contract = await loadTxStreamContract();
    registerTxStreamRecipes();
    expect(contract.recipes.map((recipe) => recipe.recipeId)).toEqual([...RECIPE_IDS]);
    for (const row of contract.recipes) {
      const definition = TX_STREAM_RECIPE_DEFINITIONS[
        row.recipeId as keyof typeof TX_STREAM_RECIPE_DEFINITIONS
      ];
      expect(definition).toBeDefined();
      expect(row.sampleRateHz).toBe(definition.sampleRateHz);
      expect(row.signalBandwidthHz).toBe(definition.signalBandwidthHz);
      expect(row.qualification).toBe(definition.qualification);
      expect(row.recipeVersion).toBe(1);
    }
  });
});
