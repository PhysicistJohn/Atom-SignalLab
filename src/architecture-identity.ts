/**
 * Architecture-tolerant identities for float64 reference artifacts.
 *
 * The fixed standards references are float64 samples produced through libm
 * transcendentals, whose last-ulp rounding is implementation defined. The exact
 * cf64le/cf32le byte identity is therefore reproducible on a given architecture
 * but not across architectures, and those exact pins cannot simply be re-taken
 * per host: retained independent-oracle evidence binds the generator sources, so
 * a second set of exact pins would need a recipe revision backed by a re-run
 * oracle.
 *
 * The divergence was measured rather than assumed. For the LTE E-TM1.1 frame,
 * darwin-arm64 and win32-x64 produce different exact digests
 * (1cb66b49... vs e67176fe...) but an identical digest once every sample is
 * rounded to nine decimals (08e26c89...), with identical peak magnitude. The two
 * hosts generate the same waveform; only the final bit of the mantissa differs.
 *
 * So the exact digest is asserted where it is meaningful, on the architecture
 * that authored it, and the quantized digest is asserted everywhere. That keeps
 * these suites running on every platform without weakening what they check: a
 * generator that actually changed the waveform would move the quantized digest
 * too.
 */

/** Decimal places retained before hashing. */
export const IDENTITY_QUANTIZATION_DECIMALS = 9;

/**
 * True on the architecture the exact float64 pins were authored on. Off it, the
 * exact byte identity is not reproducible and only the quantized identity is
 * meaningful.
 */
export const EXACT_FLOAT_PINS_REPRODUCIBLE_HERE =
  process.platform === 'darwin' && process.arch === 'arm64';

/**
 * Canonical decimal rendering of a complex sample series, suitable for hashing.
 * Rounding to a fixed decimal grid far coarser than float64 last-ulp removes the
 * libm difference while preserving any real change to the waveform.
 */
export function quantizedComplexSeries(
  real: ArrayLike<number>,
  imaginary: ArrayLike<number>,
  decimals: number = IDENTITY_QUANTIZATION_DECIMALS,
): string {
  if (real.length !== imaginary.length) {
    throw new RangeError('Quantized identity requires matching component lengths');
  }
  const parts: string[] = [];
  for (let index = 0; index < real.length; index += 1) {
    const re = real[index]!;
    const im = imaginary[index]!;
    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      throw new RangeError(`Quantized identity requires finite samples at ${index}`);
    }
    // Negative zero renders as "-0.000000000"; normalize so the identity does
    // not depend on the sign of a zero.
    parts.push(`${(re + 0).toFixed(decimals)},${(im + 0).toFixed(decimals)}`);
  }
  return parts.join(';');
}
