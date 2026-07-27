import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const HISTORICAL_MEASUREMENT_V1_SHA256 =
  '969007e43acd259c7085529571e8693b09fe196cd9983c5e6dc5cfb63a26f61a';
const HISTORICAL_TRIO_V4_SHA256 =
  '5a1a0de38cdf914f4e722b66f74e5f989862e2fae0fa628e6bdcae68ce57a02c';

describe('active v5 trio composition', () => {
  it('keeps historical contracts immutable and activates only the in-process v2 edge', async () => {
    const [measurementV1, trioV4, trioV5Source] = await Promise.all([
      readFile(new URL('../contracts/signal-lab-measurement-bridge-v1.json', import.meta.url)),
      readFile(new URL('../contracts/trio-composition-v4.json', import.meta.url)),
      readFile(new URL('../contracts/trio-composition-v5.json', import.meta.url), 'utf8'),
    ]);
    expect(sha256(measurementV1)).toBe(HISTORICAL_MEASUREMENT_V1_SHA256);
    expect(sha256(trioV4)).toBe(HISTORICAL_TRIO_V4_SHA256);

    const trio = JSON.parse(trioV5Source) as {
      contractVersion: number;
      parties: {
        atomizer: { instrumentContractVersion: number; instrumentApiVersion: number };
        signalLab: {
          standaloneApiVersion: number;
          measurementBridgeContractVersion: number;
          fixedDigitalProfileCount: number;
          rateFlexibleProfileCount: number;
        };
      };
      edges: Array<Record<string, unknown>>;
      compatibility: { verification: string };
    };
    expect(trio.contractVersion).toBe(5);
    expect(trio.parties.atomizer).toMatchObject({
      instrumentContractVersion: 1,
      instrumentApiVersion: 1,
    });
    expect(trio.parties.signalLab).toMatchObject({
      standaloneApiVersion: 2,
      measurementBridgeContractVersion: 2,
      fixedDigitalProfileCount: 31,
      rateFlexibleProfileCount: 11,
    });
    const edge = trio.edges.find((candidate) =>
      candidate.producer === 'signalLab' && candidate.consumer === 'atomizer');
    expect(edge).toMatchObject({
      status: 'active',
      transport: 'in-process-typescript-direct-import',
      serialization: 'none',
      processBoundary: 'none',
      contract: 'contracts/signal-lab-measurement-bridge-v2.json',
    });
    expect(JSON.stringify(edge)).toMatch(/generatorContractBindingSha256.*not generator code identity/);
    expect(JSON.stringify(edge)).toMatch(/captureBandwidthHz.*signalBandwidthHz/);
    expect(JSON.stringify(edge)).toMatch(/I\/Q is a digital sample interface.*no antenna qualification/);
    expect(JSON.stringify(edge)).not.toMatch(/ndjson|stdio|child process/i);
    expect(trio.compatibility.verification).toMatch(/byte-identical v5 copies/);
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
