import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  bytesToBase64,
  isUint8Array,
  sha256HexOfBytes,
} from './platform-bytes.js';
import { IncrementalSha256 } from './standards-artifact.js';

describe('platform-neutral byte boundaries', () => {
  it('accepts genuine Uint8Array values from another JavaScript realm', () => {
    const foreign = runInNewContext(
      'new Uint8Array([0, 1, 2, 127, 128, 255])',
    ) as Uint8Array;
    const local = Uint8Array.from([0, 1, 2, 127, 128, 255]);

    expect(foreign instanceof Uint8Array).toBe(false);
    expect(isUint8Array(foreign)).toBe(true);
    expect(bytesToBase64(foreign)).toBe(bytesToBase64(local));
    expect(sha256HexOfBytes(foreign)).toBe(sha256HexOfBytes(local));
    expect(new IncrementalSha256().update(foreign).digestHex())
      .toBe(new IncrementalSha256().update(local).digestHex());
  });
});
