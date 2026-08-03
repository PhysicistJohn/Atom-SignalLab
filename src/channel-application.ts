import {
  fadingGainAtTime,
  noiseStandardDeviation,
  seededComplexGaussian,
  writeUnitBoundedCf32le,
} from '@atomos/dsp';
import type { ReplayChannelConfiguration } from './contracts.js';

/**
 * Apply the propagation channel to an assembled cf32le capture.
 *
 * This runs on the transmit source and before any receiver-impairment preset,
 * which is the physical order: the channel is the medium, the impairment
 * preset is the receiver's own front end.
 *
 * The closed-form lab stimuli (CW/AM/FM) are exact mathematical lines with no
 * intrinsic noise, so without this every measurement derived from them saw a
 * floor set only by FFT arithmetic -- around -290 dBm, far below any physical
 * noise floor, which in turn dragged adaptive detector thresholds down onto
 * numerical debris. The channel is what puts a real floor under them.
 *
 * Noise and fading are keyed by the absolute sample coordinate rather than by
 * a sequential stream, so a repeated capture at one cursor stays bit-identical
 * and a split capture concatenates to the same bytes as the whole -- the same
 * contract the source generators hold themselves to.
 */
export function applyChannelToCf32le(
  bytes: Uint8Array,
  channel: ReplayChannelConfiguration,
  sampleRateHz: number,
  absoluteStartSample: number,
): Uint8Array {
  if (bytes.byteLength % 8 !== 0) {
    throw new RangeError('Channel input must be interleaved cf32le sample pairs');
  }
  // A derived first capture carries negative FIR preroll, which is explicit
  // zero extension before the session origin, so negative coordinates are
  // ordinary here.
  if (!Number.isSafeInteger(absoluteStartSample)) {
    throw new RangeError('Channel start sample must be a safe integer');
  }
  if (!Number.isSafeInteger(sampleRateHz) || sampleRateHz <= 0) {
    throw new RangeError('Channel sample rate must be a positive safe integer');
  }

  const sampleCount = bytes.byteLength / 8;
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output = new Uint8Array(bytes.byteLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const deviation = noiseStandardDeviation({ noiseFloorDbm: channel.noiseFloorDbm });
  // `rayleigh` selects flat (frequency-flat) fading across the capture
  // bandwidth, with `fadingRateHz` as the maximum Doppler shift. Tapped
  // delay-line multipath lives in @atomos/dsp and needs source access at
  // delayed coordinates, so it is not reachable from this post-assembly seam.
  const fading = channel.model === 'rayleigh'
    ? { kind: 'rayleigh' as const, dopplerHz: channel.fadingRateHz }
    : undefined;

  for (let index = 0; index < sampleCount; index += 1) {
    const absolute = absoluteStartSample + index;
    const offset = index * 8;
    let inPhase = source.getFloat32(offset, true);
    let quadrature = source.getFloat32(offset + 4, true);

    // Time zero is the origin of a generated session. Preroll before it is
    // explicit zero extension, and the medium has nothing to carry there.
    if (absolute < 0) {
      writeUnitBoundedCf32le(view, offset, inPhase, quadrature);
      continue;
    }

    if (fading) {
      const [gainReal, gainImaginary] = fadingGainAtTime(
        fading,
        channel.seed,
        0,
        absolute / sampleRateHz,
      );
      const faded = inPhase * gainReal - quadrature * gainImaginary;
      quadrature = inPhase * gainImaginary + quadrature * gainReal;
      inPhase = faded;
    }

    const [noiseReal, noiseImaginary] = seededComplexGaussian(channel.seed, absolute);
    writeUnitBoundedCf32le(
      view,
      offset,
      inPhase + deviation * noiseReal,
      quadrature + deviation * noiseImaginary,
    );
  }
  return output;
}
