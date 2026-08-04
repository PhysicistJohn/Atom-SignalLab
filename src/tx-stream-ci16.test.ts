import { describe, expect, it } from 'vitest';
import {
  convertCf32leToCi16le,
  TX_STREAM_CI16_CLIP,
  TX_STREAM_CI16_SCALE,
} from './tx-stream-ci16.js';
import { loadTxStreamContract } from './tx-stream-contract.js';

/** Hand-authored cf32le samples: integer-exact expectations, no libm. */
function cf32leOf(samples: readonly (readonly [number, number])[]): Uint8Array {
  const bytes = new Uint8Array(samples.length * 8);
  const view = new DataView(bytes.buffer);
  samples.forEach(([inPhase, quadrature], index) => {
    view.setFloat32(index * 8, inPhase, true);
    view.setFloat32(index * 8 + 4, quadrature, true);
  });
  return bytes;
}

function ci16Pairs(bytes: Uint8Array): Array<[number, number]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < bytes.byteLength / 4; index += 1) {
    pairs.push([view.getInt16(index * 4, true), view.getInt16(index * 4 + 2, true)]);
  }
  return pairs;
}

describe('ci16le conversion convention', () => {
  it('matches the contract-pinned scale and clip', async () => {
    const contract = await loadTxStreamContract();
    expect(contract.ci16leConvention.scale).toBe(TX_STREAM_CI16_SCALE);
    expect(contract.ci16leConvention.clip).toEqual([-TX_STREAM_CI16_CLIP, TX_STREAM_CI16_CLIP]);
    expect(contract.ci16leConvention.rounding).toBe('round-half-away-from-zero');
  });

  it('converts zero, full scale, and clipping boundaries exactly', () => {
    const input = cf32leOf([
      [0, 0],
      [1, -1],
      [-1, 1],
      [2047 / 32768, -2047 / 32768],
      [2, 2], // clips
      [-2, -2], // clips
    ]);
    expect(ci16Pairs(convertCf32leToCi16le(input))).toEqual([
      [0, 0],
      [32767, -32767], // 1 x 32768 = 32768 clips to 32767
      [-32767, 32767],
      [2047, -2047],
      [32767, 32767],
      [-32767, -32767],
    ]);
  });

  it('rounds half away from zero in both directions', () => {
    // 0.5/32768 x 32768 = 0.5 -> 1; -0.5 -> -1 (away from zero).
    const input = cf32leOf([
      [0.5 / 32768, -0.5 / 32768],
      [1.5 / 32768, -1.5 / 32768],
    ]);
    expect(ci16Pairs(convertCf32leToCi16le(input))).toEqual([
      [1, -1],
      [2, -2],
    ]);
  });

  it('preserves byte geometry (half the cf32le length)', () => {
    const input = cf32leOf([[0.25, -0.25], [0.5, -0.5], [-0.75, 0.75]]);
    const output = convertCf32leToCi16le(input);
    expect(output.byteLength).toBe(input.byteLength / 2);
  });

  it('fails closed on non-finite input', () => {
    const nan = cf32leOf([[Number.NaN, 0]]);
    expect(() => convertCf32leToCi16le(nan)).toThrow(/non-finite/);
    const infinity = cf32leOf([[0, Number.POSITIVE_INFINITY]]);
    expect(() => convertCf32leToCi16le(infinity)).toThrow(/non-finite/);
  });

  it('rejects empty or misaligned input', () => {
    expect(() => convertCf32leToCi16le(new Uint8Array(0))).toThrow(/cf32le/);
    expect(() => convertCf32leToCi16le(new Uint8Array(4))).toThrow(/cf32le/);
  });
});
