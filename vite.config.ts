import { defineConfig } from 'vite';
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
});
