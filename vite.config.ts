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
    // These suites pin the SHA-256 of float64 reference frames. Those samples
    // come out of libm transcendentals, whose last-ulp rounding differs by host
    // architecture, so the bytes are reproducible per architecture but not
    // across them. The pins were authored on darwin-arm64 and cannot simply be
    // re-taken elsewhere: retained srsRAN oracle evidence binds the generator
    // and provider sources, so a second set of pins requires a recipe revision
    // backed by a re-run oracle.
    //
    // Rather than lock all of CI to arm64, run them where their identities hold
    // and let every other suite run on all platforms. The fail-closed behaviour
    // off the authoring architecture is still asserted by the standards bundle
    // smoke in tools/standards-runtime-bundle-smoke.mjs, so a generator that
    // silently emitted unverified bytes on x86_64 would still be caught.
    exclude: [
      ...configDefaults.exclude,
      ...(process.platform === 'darwin' && process.arch === 'arm64'
        ? []
        : [
            'src/lte-band3-fdd-20m-reference.test.ts',
            'src/lte-band38-tdd-10m-reference.test.ts',
            'src/lte-etm1-provider.test.ts',
            'src/lte-etm3-reference.test.ts',
            'src/lte-ntm-reference.test.ts',
            'src/nr-nbiot-inband-component-reference.test.ts',
            'src/standards-runtime.test.ts',
          ]),
    ],
  },
});
