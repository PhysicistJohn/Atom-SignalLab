/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { developmentRendererCsp, transformDevelopmentRendererCsp } from './src/renderer-csp.js';
import { developmentRendererTrust, validateDevelopmentServerUrl } from './src/renderer-trust.js';

const developmentUrl = validateDevelopmentServerUrl(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174');
const developmentTrust = developmentRendererTrust(developmentUrl);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'signal-lab-exact-development-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return transformDevelopmentRendererCsp(html, developmentTrust);
      },
    },
  ],
  base: './',
  server: {
    port: 5174,
    strictPort: true,
    // Vite injects its refresh bootstrap before the source meta element. The
    // equivalent response header makes the policy effective from byte zero.
    headers: { 'Content-Security-Policy': developmentRendererCsp(developmentTrust) },
  },
  build: { outDir: 'dist/renderer', emptyOutDir: true },
  // DSP synthesis tests generate large deterministic buffers. Vitest's 5000ms
  // default is tight enough that they go red on a loaded machine.
  test: {
    testTimeout: 30000,
    // Only one suite is still confined to a single architecture.
    //
    // src/lte-etm3-reference.test.ts pins the exact cf64le digests of float64
    // reference frames. Those samples come out of libm transcendentals whose
    // last-ulp rounding differs by host, so the exact bytes are reproducible per
    // architecture but not across them. Every other suite that had the same
    // problem was converted to assert a quantized waveform identity, which was
    // measured to be byte-identical across darwin-arm64 and win32-x64, alongside
    // the exact pin where it is meaningful. This one cannot be converted the
    // same way: retained independent-oracle evidence
    // (validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json) pins
    // this file itself as `subjects.referenceTestSource`, so editing it would
    // falsify that attestation.
    //
    // E-TM3 still has coverage on every architecture through the unpinned
    // companion src/lte-etm3-reference-architecture.test.ts, which asserts the
    // quantized identity, geometry, finiteness, and determinism. Only the exact
    // byte assertion is arm64 bound, and that assertion carries no extra
    // information off its authoring host, because the divergence was measured to
    // be confined to the last mantissa bit.
    exclude: [
      ...configDefaults.exclude,
      ...(process.platform === 'darwin' && process.arch === 'arm64'
        ? []
        : [
            // The last remaining architecture-gated suite.
            //
            // Oracle evidence pins this file itself as
            // subjects.referenceTestSource in
            // validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json.
            // Editing it and re-pointing that hash would make an audit record
            // describe a file no oracle run ever saw, so the file stays exactly
            // as attested and simply does not run where its exact float64 pins
            // cannot reproduce.
            //
            // E-TM3 is still covered on every architecture by the unpinned
            // companion src/lte-etm3-reference-architecture.test.ts, which
            // asserts the quantized waveform identity, geometry, finiteness,
            // and determinism. Only the exact-byte assertion is arm64 bound,
            // and that assertion carries no extra information off its authoring
            // host: the divergence was measured to be the last mantissa bit.
            'src/lte-etm3-reference.test.ts',
          ]),
    ],
  },
});
