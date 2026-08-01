import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const HISTORICAL_MEASUREMENT_V1_SHA256 =
  '969007e43acd259c7085529571e8693b09fe196cd9983c5e6dc5cfb63a26f61a';
const HISTORICAL_TRIO_V4_SHA256 =
  '5a1a0de38cdf914f4e722b66f74e5f989862e2fae0fa628e6bdcae68ce57a02c';
const HISTORICAL_TRIO_V5_SHA256 =
  'fcf423a217d75dc76a8b3fba89d4e0045d6e852dc507fea8d8d81a6a8e7d4744';
const HISTORICAL_TRIO_V6_SHA256 =
  '37421c8bb2a7d3c93804f00da0e4cbb2bd32dab0a4a3b1e915ac27f6e621d596';

describe('active v7 trio composition', () => {
  it('keeps historical contracts immutable and activates only the in-process v3 edge', async () => {
    const [measurementV1, trioV4, trioV5, trioV6, trioV7Source] = await Promise.all([
      readFile(new URL('../contracts/signal-lab-measurement-bridge-v1.json', import.meta.url)),
      readFile(new URL('../contracts/trio-composition-v4.json', import.meta.url)),
      readFile(new URL('../contracts/trio-composition-v5.json', import.meta.url)),
      readFile(new URL('../contracts/trio-composition-v6.json', import.meta.url)),
      readFile(new URL('../contracts/trio-composition-v7.json', import.meta.url), 'utf8'),
    ]);
    expect(sha256(measurementV1)).toBe(HISTORICAL_MEASUREMENT_V1_SHA256);
    expect(sha256(trioV4)).toBe(HISTORICAL_TRIO_V4_SHA256);
    expect(sha256(trioV5)).toBe(HISTORICAL_TRIO_V5_SHA256);
    expect(sha256(trioV6)).toBe(HISTORICAL_TRIO_V6_SHA256);

    const trio = JSON.parse(trioV7Source) as {
      contractVersion: number;
      parties: {
        atomizer: { instrumentContractVersion: number; instrumentApiVersion: number };
        signalLab: {
          standaloneApiVersion: number;
          measurementBridgeContractVersion: number;
          closedProfileCount: number;
          fixedDigitalProfileCount: number;
          rateFlexibleProfileCount: number;
          unboundedCompositionProfileCount: number;
        };
      };
      edges: Array<Record<string, unknown>>;
      compatibility: { verification: string };
    };
    expect(trio.contractVersion).toBe(7);
    expect(trio.parties.atomizer).toMatchObject({
      instrumentContractVersion: 1,
      instrumentApiVersion: 1,
    });
    expect(trio.parties.signalLab).toMatchObject({
      standaloneApiVersion: 2,
      measurementBridgeContractVersion: 3,
      closedProfileCount: 44,
      fixedDigitalProfileCount: 31,
      rateFlexibleProfileCount: 11,
      unboundedCompositionProfileCount: 2,
    });
    const edge = trio.edges.find((candidate) =>
      candidate.producer === 'signalLab' && candidate.consumer === 'atomizer');
    expect(edge).toMatchObject({
      status: 'active',
      transport: 'in-process-typescript-direct-import',
      serialization: 'none',
      processBoundary: 'none',
      contract: 'contracts/signal-lab-measurement-bridge-v3.json',
    });
    expect(JSON.stringify(edge)).toMatch(/generatorContractBindingSha256.*not generator code identity/);
    expect(JSON.stringify(edge)).toMatch(/captureBandwidthHz.*signalBandwidthHz/);
    expect(JSON.stringify(edge)).toMatch(/I\/Q is a digital sample interface.*no antenna qualification/);
    expect(JSON.stringify(edge)).toMatch(/unbounded Bluetooth long-dwell engineering compositions/i);
    expect(JSON.stringify(edge)).not.toMatch(/ndjson|stdio|child process/i);
    const neptune = trio.edges.find((candidate) =>
      candidate.producer === 'neptune-p210' && candidate.consumer === 'atomizer');
    expect(neptune).toMatchObject({
      status: 'active',
      transport: 'libiio-network-through-neptune-p210-driver',
    });
    expect(JSON.stringify(neptune)).toMatch(/capture starts are paced/);
    expect(trio.compatibility.verification).toMatch(/byte-identical v7 copies/);
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
