import type { RendererTrust } from './renderer-trust.js';

export const PACKAGED_RENDERER_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'";

/** Admit only Vite's inline refresh bootstrap and exact selected WebSocket. */
export function developmentRendererCsp(trust: RendererTrust): string {
  if (trust.mode !== 'development') throw new Error('Development CSP requires development renderer trust');
  const origin = new URL(trust.origin);
  return PACKAGED_RENDERER_CSP
    .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    .replace("connect-src 'self'", `connect-src 'self' ws://${origin.host}`);
}

/** Add only the exact selected Vite WebSocket endpoint during local development. */
export function transformDevelopmentRendererCsp(html: string, trust: RendererTrust): string {
  const developmentCsp = developmentRendererCsp(trust);
  const productionDirective = `content="${PACKAGED_RENDERER_CSP}"`;
  if (!html.includes(productionDirective)) {
    throw new Error('Renderer HTML does not contain the exact packaged CSP');
  }
  return html.replace(productionDirective, `content="${developmentCsp}"`);
}
