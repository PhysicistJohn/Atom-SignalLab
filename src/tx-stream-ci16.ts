/**
 * cf32le -> ci16le transport encoding for device sinks.
 *
 * Convention (pinned in contracts/signal-lab-tx-stream-v1.json): interleaved
 * little-endian int16 I/Q; scale x32768; round-half-away-from-zero; clip to
 * [-32767, 32767]; non-finite input fails closed. The Neptune P210 TX DAC
 * scan format is le:S16/16>>0 per the live unit diagnostic; le:S12/16>>0
 * with full-scale code 2048 is the RX-direction ADC format and is NOT the TX
 * convention. Emitted amplitude is controlled only via the explicitly set
 * hardwaregain attribute; no amplitude verification exists for this surface
 * yet. The live Tx runbook plans an RX-loopback amplitude gate; until that
 * gate executes and records evidence, emitted amplitude must never be inferred
 * from this encoding.
 *
 * The conversion is integer-exact once the float32 inputs are read (no
 * transcendentals), so its goldens are reproducible on every architecture.
 */

export const TX_STREAM_CI16_SCALE = 32_768 as const;
export const TX_STREAM_CI16_CLIP = 32_767 as const;
export const TX_STREAM_CI16_BYTES_PER_SAMPLE = 4 as const;

function roundHalfAwayFromZero(value: number): number {
  const magnitude = Math.floor(Math.abs(value) + 0.5);
  return value < 0 ? -magnitude : magnitude;
}

/**
 * Convert interleaved cf32le (8 bytes/sample) to ci16le (4 bytes/sample).
 * Throws RangeError on non-finite samples rather than silently saturating.
 */
export function convertCf32leToCi16le(source: Uint8Array): Uint8Array {
  if (source.byteLength % 8 !== 0 || source.byteLength === 0) {
    throw new RangeError('ci16le conversion requires a non-empty interleaved cf32le buffer');
  }
  const sampleCount = source.byteLength / 8;
  const input = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const output = new Uint8Array(sampleCount * TX_STREAM_CI16_BYTES_PER_SAMPLE);
  const target = new DataView(output.buffer);
  for (let index = 0; index < sampleCount; index += 1) {
    const inPhase = input.getFloat32(index * 8, true);
    const quadrature = input.getFloat32(index * 8 + 4, true);
    if (!Number.isFinite(inPhase) || !Number.isFinite(quadrature)) {
      throw new RangeError(`ci16le conversion refuses non-finite cf32le input at sample ${index}`);
    }
    const scaledInPhase = clampCi16(roundHalfAwayFromZero(inPhase * TX_STREAM_CI16_SCALE));
    const scaledQuadrature = clampCi16(roundHalfAwayFromZero(quadrature * TX_STREAM_CI16_SCALE));
    target.setInt16(index * 4, scaledInPhase, true);
    target.setInt16(index * 4 + 2, scaledQuadrature, true);
  }
  return output;
}

function clampCi16(value: number): number {
  if (value > TX_STREAM_CI16_CLIP) return TX_STREAM_CI16_CLIP;
  if (value < -TX_STREAM_CI16_CLIP) return -TX_STREAM_CI16_CLIP;
  return value;
}
