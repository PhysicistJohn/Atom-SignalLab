#!/usr/bin/env node
// Quantify how far the LTE E-TM1.1 reference frame diverges across host
// architectures.
//
// The exact cf64le identity is reproducible per architecture but not across
// them, because the samples come out of libm transcendentals whose last-ulp
// rounding is implementation defined. That is why seven suites are pinned to
// their authoring architecture. This tool measures the size of that divergence
// so the limitation is a number rather than an assumption, and so a future
// provider recipe revision has evidence to reason from.
//
// It prints two identities per host:
//   exact      - sha256 of the raw cf64le bytes, the value the provider pins
//   quantized  - sha256 after rounding every sample to a fixed decimal grid
//
// If the quantized identities agree across architectures while the exact ones
// differ, the divergence is confined below that grid and the two hosts are
// generating the same waveform to that precision. If the quantized identities
// also differ, the divergence is real and a re-pin would be hiding a bug.
//
// This is a diagnostic. It asserts nothing and changes no pinned file.

// Imported from source rather than the bundle on purpose: the shipped provider
// deliberately fails closed off its authoring architecture, so it will not hand
// out the very bytes this tool needs to measure. Run with tsx.
import { createHash } from 'node:crypto';
import { generateLteEtm11ReferenceFrame } from '../src/lte-etm1-reference.ts';

// Decimal places retained before hashing. 1e-9 is far coarser than float64
// last-ulp (~1e-16 relative here) and far finer than any physically meaningful
// difference in a normalized baseband sample.
const QUANTIZATION_DECIMALS = 9;

const frame = generateLteEtm11ReferenceFrame();
const { real, imaginary } = frame.timeDomain;
const sampleCount = frame.timeDomain.sampleCount;

const exact = createHash('sha256');
const quantized = createHash('sha256');
const scratch = new DataView(new ArrayBuffer(16));

let maxAbs = 0;
for (let i = 0; i < sampleCount; i += 1) {
  const re = real[i];
  const im = imaginary[i];
  maxAbs = Math.max(maxAbs, Math.abs(re), Math.abs(im));

  scratch.setFloat64(0, re, true);
  scratch.setFloat64(8, im, true);
  exact.update(new Uint8Array(scratch.buffer.slice(0)));

  // toFixed gives a decimal string, which removes the binary last-ulp noise
  // that differs between libm implementations.
  quantized.update(
    `${re.toFixed(QUANTIZATION_DECIMALS)},${im.toFixed(QUANTIZATION_DECIMALS)};`,
  );
}

process.stdout.write(
  [
    `host        ${process.platform}-${process.arch}`,
    `node        ${process.version}`,
    `samples     ${sampleCount}`,
    `maxAbs      ${maxAbs}`,
    `exact       ${exact.digest('hex')}`,
    `quantized   ${quantized.digest('hex')} (${QUANTIZATION_DECIMALS} decimals)`,
    '',
  ].join('\n'),
);
