/**
 * Deterministic band-limited cf32le transport resampler.
 *
 * This module never changes or relabels a canonical artifact. It consumes a
 * declared native-domain support window and returns new hardware-ready bytes.
 * Downsampling lowers the interpolation cutoff to 95% of the output Nyquist
 * frequency; the Blackman-windowed sinc has sixteen zero crossings on either
 * side of each output coordinate. Exact-rate/integer-phase replay bypasses this
 * module entirely so canonical byte identity is preserved.
 */

export const IQ_RESAMPLER_ALGORITHM = 'blackman-windowed-sinc-v1' as const;
export const IQ_RESAMPLER_ZERO_CROSSINGS = 16 as const;
export const IQ_RESAMPLER_NYQUIST_GUARD = 0.95 as const;

export interface IqResamplerSupport {
  /** First available native-domain sample, inclusive. */
  readonly sourceStartSample: number;
  /** Last available native-domain sample, inclusive. */
  readonly sourceEndSample: number;
  /** Normalized cutoff in cycles per native input sample. */
  readonly normalizedCutoff: number;
  /** Kernel radius in native input samples. */
  readonly radius: number;
  /** Physical anti-alias/interpolation cutoff. */
  readonly antiAliasCutoffHz: number;
}

export interface IqResampleInput {
  readonly sourceBytes: Uint8Array;
  readonly sourceStartSample: number;
  /** Exact native-domain coordinate of output sample zero. */
  readonly outputStartSourceSampleNumerator: bigint;
  readonly outputStartSourceSampleDenominator: bigint;
  readonly sourceSampleRateHz: number;
  readonly outputSampleRateHz: number;
  readonly outputSampleCount: number;
}

export interface IqFrequencyTranslationInput {
  readonly sourceBytes: Uint8Array;
  readonly sourceStartSample: number;
  readonly sampleRateHz: number;
  readonly sourceCarrierOffsetHz: number;
  readonly outputCarrierOffsetHz: number;
}

/**
 * Move a carrier within the complex envelope without changing RF metadata.
 * Absolute native-domain sample coordinates keep phase deterministic across
 * adjacent source windows.
 */
export function translateCf32leCarrier(input: IqFrequencyTranslationInput): Uint8Array {
  validateRate(input.sampleRateHz, 'frequency-translation');
  if (!Number.isSafeInteger(input.sourceStartSample)) {
    throw new RangeError('Frequency translation start sample must be a safe integer');
  }
  if (!Number.isSafeInteger(input.sourceCarrierOffsetHz)
    || !Number.isSafeInteger(input.outputCarrierOffsetHz)) {
    throw new RangeError('Carrier offsets must be safe integer hertz values');
  }
  if (input.sourceBytes.byteLength % 8 !== 0 || input.sourceBytes.byteLength === 0) {
    throw new RangeError('Frequency translation input must be non-empty interleaved cf32le');
  }
  const shiftHz = input.outputCarrierOffsetHz - input.sourceCarrierOffsetHz;
  if (shiftHz === 0) return input.sourceBytes.slice();
  const source = new DataView(
    input.sourceBytes.buffer,
    input.sourceBytes.byteOffset,
    input.sourceBytes.byteLength,
  );
  const output = new Uint8Array(input.sourceBytes.byteLength);
  const target = new DataView(output.buffer);
  const sampleCount = input.sourceBytes.byteLength / 8;
  const sampleRate = BigInt(input.sampleRateHz);
  let phaseNumerator = positiveModuloBigInt((
    BigInt(input.sourceStartSample) * BigInt(shiftHz)
  ), sampleRate);
  const phaseStep = BigInt(shiftHz);
  for (let index = 0; index < sampleCount; index += 1) {
    const inPhase = source.getFloat32(index * 8, true);
    const quadrature = source.getFloat32(index * 8 + 4, true);
    const angle = 2 * Math.PI * Number(phaseNumerator) / input.sampleRateHz;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    target.setFloat32(
      index * 8,
      Math.fround(inPhase * cosine - quadrature * sine),
      true,
    );
    target.setFloat32(
      index * 8 + 4,
      Math.fround(inPhase * sine + quadrature * cosine),
      true,
    );
    phaseNumerator = positiveModuloBigInt(phaseNumerator + phaseStep, sampleRate);
  }
  return output;
}

export function iqResamplerSupport(input: Omit<IqResampleInput, 'sourceBytes' | 'sourceStartSample'>): IqResamplerSupport {
  validateRate(input.sourceSampleRateHz, 'source');
  validateRate(input.outputSampleRateHz, 'output');
  if (!Number.isSafeInteger(input.outputSampleCount) || input.outputSampleCount < 1) {
    throw new RangeError('Resampler output sample count must be a positive safe integer');
  }
  validateRationalStart(
    input.outputStartSourceSampleNumerator,
    input.outputStartSourceSampleDenominator,
  );
  // Validate every exact output phase before the caller synthesizes what can
  // be a large native support window. A phase that Number cannot distinguish
  // from an adjacent integer must fail closed rather than silently move the
  // requested time coordinate.
  const coordinateDenominator =
    input.outputStartSourceSampleDenominator * BigInt(input.outputSampleRateHz);
  const initialCoordinateNumerator =
    input.outputStartSourceSampleNumerator * BigInt(input.outputSampleRateHz);
  const coordinateStep =
    BigInt(input.sourceSampleRateHz)
    * input.outputStartSourceSampleDenominator;
  for (let outputIndex = 0; outputIndex < input.outputSampleCount; outputIndex += 1) {
    const coordinateNumerator =
      initialCoordinateNumerator + BigInt(outputIndex) * coordinateStep;
    assertRepresentableFraction(
      coordinateNumerator % coordinateDenominator,
      coordinateDenominator,
    );
  }

  const rateRatio = input.outputSampleRateHz / input.sourceSampleRateHz;
  // Equal-rate fractional delay and upsampling must preserve the complete
  // native Nyquist interval.  The transition-band guard is needed only when
  // the output Nyquist is below the source Nyquist (actual downsampling).
  const normalizedCutoff = rateRatio < 1
    ? 0.5 * rateRatio * IQ_RESAMPLER_NYQUIST_GUARD
    : 0.5;
  const radius = Math.ceil(IQ_RESAMPLER_ZERO_CROSSINGS / (2 * normalizedCutoff));
  const startFloor = rationalFloor(
    input.outputStartSourceSampleNumerator,
    input.outputStartSourceSampleDenominator,
  );
  const lastNumerator =
    input.outputStartSourceSampleNumerator * BigInt(input.outputSampleRateHz)
    + BigInt(input.outputSampleCount - 1)
      * BigInt(input.sourceSampleRateHz)
      * input.outputStartSourceSampleDenominator;
  const lastDenominator =
    input.outputStartSourceSampleDenominator * BigInt(input.outputSampleRateHz);
  const sourceStartSample = safeBigIntToNumber(startFloor - BigInt(radius));
  const sourceEndSample = safeBigIntToNumber(
    rationalCeiling(lastNumerator, lastDenominator) + BigInt(radius),
  );
  return Object.freeze({
    sourceStartSample,
    sourceEndSample,
    normalizedCutoff,
    radius,
    antiAliasCutoffHz: normalizedCutoff * input.sourceSampleRateHz,
  });
}

export function resampleCf32leWindowedSinc(input: IqResampleInput): Uint8Array {
  const support = iqResamplerSupport(input);
  if (!Number.isSafeInteger(input.sourceStartSample)) {
    throw new RangeError('Source start sample must be a safe integer');
  }
  if (input.sourceBytes.byteLength % 8 !== 0 || input.sourceBytes.byteLength === 0) {
    throw new RangeError('Resampler input must be a non-empty interleaved cf32le buffer');
  }
  const sourceSampleCount = input.sourceBytes.byteLength / 8;
  const sourceEndSample = input.sourceStartSample + sourceSampleCount - 1;
  if (input.sourceStartSample > support.sourceStartSample || sourceEndSample < support.sourceEndSample) {
    throw new RangeError('Resampler input does not cover the required native-domain FIR support window');
  }

  const source = new DataView(
    input.sourceBytes.buffer,
    input.sourceBytes.byteOffset,
    input.sourceBytes.byteLength,
  );
  const output = new Uint8Array(input.outputSampleCount * 8);
  const target = new DataView(output.buffer);
  const coordinateDenominator =
    input.outputStartSourceSampleDenominator * BigInt(input.outputSampleRateHz);
  const initialCoordinateNumerator =
    input.outputStartSourceSampleNumerator * BigInt(input.outputSampleRateHz);
  const coordinateStep =
    BigInt(input.sourceSampleRateHz)
    * input.outputStartSourceSampleDenominator;
  for (let outputIndex = 0; outputIndex < input.outputSampleCount; outputIndex += 1) {
    const coordinateNumerator =
      initialCoordinateNumerator + BigInt(outputIndex) * coordinateStep;
    const floor = coordinateNumerator / coordinateDenominator;
    const remainder = coordinateNumerator % coordinateDenominator;
    assertRepresentableFraction(remainder, coordinateDenominator);
    const floorNumber = safeBigIntToNumber(floor);
    const first = floorNumber - support.radius + (remainder === 0n ? 0 : 1);
    const last = floorNumber + support.radius;
    let inPhase = 0;
    let quadrature = 0;
    let weightSum = 0;
    for (let nativeIndex = first; nativeIndex <= last; nativeIndex += 1) {
      const distance = exactRationalDistance(
        floorNumber - nativeIndex,
        remainder,
        coordinateDenominator,
      );
      const weight = interpolationKernel(
        distance,
        support.normalizedCutoff,
        support.radius,
      );
      if (weight === 0) continue;
      // Missing samples outside the declared artifact/window are zero padding.
      // Their kernel weights remain in the normalization so a one-shot edge
      // cannot be amplified by silently renormalizing only the present taps.
      weightSum += weight;
      if (nativeIndex < input.sourceStartSample || nativeIndex > sourceEndSample) continue;
      const byteOffset = (nativeIndex - input.sourceStartSample) * 8;
      inPhase += source.getFloat32(byteOffset, true) * weight;
      quadrature += source.getFloat32(byteOffset + 4, true) * weight;
    }
    if (Math.abs(weightSum) < 1e-15) {
      throw new Error('Resampler kernel has no usable source support');
    }
    target.setFloat32(outputIndex * 8, Math.fround(inPhase / weightSum), true);
    target.setFloat32(outputIndex * 8 + 4, Math.fround(quadrature / weightSum), true);
  }
  return output;
}

function interpolationKernel(distance: number, normalizedCutoff: number, radius: number): number {
  const relative = Math.abs(distance) / radius;
  if (relative > 1) return 0;
  const lowPass = 2 * normalizedCutoff * sinc(2 * normalizedCutoff * distance);
  // Symmetric Blackman window, exactly zero at both support boundaries.
  const window = 0.42
    + 0.5 * Math.cos(Math.PI * relative)
    + 0.08 * Math.cos(2 * Math.PI * relative);
  return lowPass * window;
}

function sinc(value: number): number {
  if (Math.abs(value) < 1e-12) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function validateRate(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`Resampler ${label} sample rate must be a positive safe integer`);
  }
}

function validateRationalStart(numerator: bigint, denominator: bigint): void {
  if (typeof numerator !== 'bigint'
    || typeof denominator !== 'bigint'
    || numerator < 0n
    || denominator <= 0n) {
    throw new RangeError('Resampler output start must be a non-negative rational');
  }
}

function rationalFloor(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator;
}

function rationalCeiling(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function safeBigIntToNumber(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER)
    || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Resampler support exceeds the safe integer range');
  }
  return Number(value);
}

function assertRepresentableFraction(remainder: bigint, denominator: bigint): void {
  if (remainder === 0n) return;
  const smaller = remainder <= denominator - remainder
    ? remainder
    : denominator - remainder;
  const delta = Number(smaller) / Number(denominator);
  if (!Number.isFinite(delta) || delta === 0 || 1 - delta === 1) {
    throw new RangeError(
      'Exact fractional-delay phase is below deterministic Number resolution',
    );
  }
}

function exactRationalDistance(
  floorMinusNativeIndex: number,
  remainder: bigint,
  denominator: bigint,
): number {
  if (remainder === 0n) return floorMinusNativeIndex;
  if (remainder * 2n <= denominator) {
    return floorMinusNativeIndex + Number(remainder) / Number(denominator);
  }
  const complement = Number(denominator - remainder) / Number(denominator);
  return floorMinusNativeIndex === -1
    ? -complement
    : floorMinusNativeIndex + 1 - complement;
}

function positiveModuloBigInt(value: bigint, modulus: bigint): bigint {
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}
