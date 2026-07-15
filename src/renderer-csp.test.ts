import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import viteConfiguration from '../vite.config.js';
import { developmentRendererCsp, PACKAGED_RENDERER_CSP, transformDevelopmentRendererCsp } from './renderer-csp.js';
import { developmentRendererTrust, validateDevelopmentServerUrl } from './renderer-trust.js';

describe('SignalLab renderer CSP', () => {
  const sourceHtml = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

  it('keeps packaged HTML free of development network origins and inline scripts', () => {
    expect(sourceHtml).toContain(`content="${PACKAGED_RENDERER_CSP}"`);
    expect(sourceHtml).not.toMatch(/localhost|127\.0\.0\.1|ws:\/\//);
    expect(PACKAGED_RENDERER_CSP).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('adds only the exact Vite WebSocket endpoint in development', () => {
    const trust = developmentRendererTrust(validateDevelopmentServerUrl('http://127.0.0.1:4174/path'));
    const transformed = transformDevelopmentRendererCsp(
      sourceHtml,
      trust,
    );
    expect(transformed).toContain("script-src 'self' 'unsafe-inline'");
    expect(transformed).toContain("connect-src 'self' ws://127.0.0.1:4174");
    expect(transformed).not.toContain('localhost:5174');
    expect(developmentRendererCsp(trust)).toBe(PACKAGED_RENDERER_CSP
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:4174"));
  });

  it('installs the exact development policy as an HTTP response header', () => {
    const configured = viteConfiguration as { server?: { headers?: Record<string, unknown> } };
    const trust = developmentRendererTrust(validateDevelopmentServerUrl(
      process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174',
    ));
    expect(configured.server?.headers?.['Content-Security-Policy']).toBe(developmentRendererCsp(trust));
  });

  it('refuses production trust and HTML without the exact packaged policy', () => {
    expect(() => transformDevelopmentRendererCsp(sourceHtml, { mode: 'production', url: 'file:///app/index.html' })).toThrow(/development renderer trust/i);
    expect(() => developmentRendererCsp({ mode: 'production', url: 'file:///app/index.html' })).toThrow(/development renderer trust/i);
    expect(() => transformDevelopmentRendererCsp('<html></html>', developmentRendererTrust(validateDevelopmentServerUrl('http://localhost:5174')))).toThrow(/exact packaged CSP/i);
  });
});
