import { describe, expect, it } from 'vitest';
import {
  GERAN_LIBOSMOCORE_ORACLE,
  GERAN_XCCH_EB_BITS,
} from './geran-fixed-bursts.js';
import {
  decodeGeranXcchEncodedBursts,
  encodeGeranXcchL2Block,
} from './geran-xcch-corpus-codec.js';

const DUMMY_L2 = Uint8Array.from(Buffer.from(GERAN_LIBOSMOCORE_ORACLE.l2DummyFrameHex, 'hex'));

/**
 * Separate, checked-in libosmocore xCCH fixture. It is deliberately kept in
 * this corpus-codec test rather than the fixed-burst catalog: it exercises
 * the encoder with a different payload without changing the sealed reference
 * waveform inputs. Source: libosmocore 950430e829a3dc1d162aa241bc0505745c5a7311,
 * tests/coding/coding_test.ok lines 15-27 (gsm0503_xcch_encode/decode).
 */
const SECOND_LIBOSMOCORE_XCCH_FIXTURE = Object.freeze({
  l2: Uint8Array.from(Buffer.from('a3af5fc6364344abd96d7d6224c9d292fa275d717a59a8', 'hex')),
  encodedBursts: [
    '10010111100101001100100000111011110010011001100001000101011001010000001111000110110001010011010011101101010100000000',
    '10101001010110101100010000100101110110111010000110001010111000000001101011111000011000010110011110101111111101010010',
    '00100111010001100111111110001101011110101011010010000001011110111000100010000101000011001100101001000000011111111000',
    '10010011011011100100100110100001111000111100010111110101111000101111010101001011000100010000011000011010010100001011',
  ],
} as const);

describe('corpus-only GERAN xCCH codec', () => {
  it('reproduces the retained pinned libosmocore fixture byte-for-byte', () => {
    expect(encodeGeranXcchL2Block(DUMMY_L2)).toEqual(GERAN_XCCH_EB_BITS);
  });

  it('reproduces and decodes a separate checked-in libosmocore xCCH fixture', () => {
    expect(encodeGeranXcchL2Block(SECOND_LIBOSMOCORE_XCCH_FIXTURE.l2)).toEqual(
      SECOND_LIBOSMOCORE_XCCH_FIXTURE.encodedBursts,
    );
    expect(decodeGeranXcchEncodedBursts(SECOND_LIBOSMOCORE_XCCH_FIXTURE.encodedBursts)).toEqual(
      SECOND_LIBOSMOCORE_XCCH_FIXTURE.l2,
    );
  });

  it('decodes the retained fixture and independently round-trips synthetic L2 blocks', () => {
    expect(decodeGeranXcchEncodedBursts(GERAN_XCCH_EB_BITS)).toEqual(DUMMY_L2);

    const synthetic = Uint8Array.from(
      { length: 23 },
      (_unused, index) => (index * 37 + 11) & 0xff,
    );
    const changed = synthetic.slice();
    changed[7] = changed[7]! ^ 0xa5;
    const encoded = encodeGeranXcchL2Block(synthetic);
    expect(decodeGeranXcchEncodedBursts(encoded)).toEqual(synthetic);
    expect(encoded).not.toEqual(encodeGeranXcchL2Block(changed));
  });

  it('rejects malformed L2 fields and encoded bursts without xCCH stealing flags', () => {
    expect(() => encodeGeranXcchL2Block(new Uint8Array(22))).toThrow(/23 bytes/);
    const malformed: string[] = [...GERAN_XCCH_EB_BITS];
    malformed[0] = `${malformed[0]!.slice(0, 57)}0${malformed[0]!.slice(58)}`;
    expect(() => decodeGeranXcchEncodedBursts(malformed)).toThrow(/stealing flags/);
  });
});
