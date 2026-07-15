import { describe, expect, it } from 'vitest';
import {
  assertTrustedRendererEvent,
  denyRendererPermission,
  developmentRendererTrust,
  isTrustedRendererEvent,
  isTrustedRendererUrl,
  productionRendererTrust,
  selectDevelopmentServerUrl,
  validateDevelopmentServerUrl,
} from './renderer-trust.js';

describe('SignalLab renderer trust', () => {
  it('admits only explicit unauthenticated loopback HTTP development ports', () => {
    expect(validateDevelopmentServerUrl('http://localhost:5174').origin).toBe('http://localhost:5174');
    expect(validateDevelopmentServerUrl('http://127.0.0.1:4174/path').origin).toBe('http://127.0.0.1:4174');
    expect(validateDevelopmentServerUrl('http://[::1]:5174').origin).toBe('http://[::1]:5174');
    for (const value of [
      '', 'not a url', ' http://localhost:5174', 'http://localhost', 'https://localhost:5174',
      'http://example.com:5174', 'http://localhost.example:5174', 'http://127.0.0.2:5174',
      'http://user@localhost:5174', 'file:///tmp/index.html', 'ws://localhost:5174',
    ]) {
      expect(() => validateDevelopmentServerUrl(value)).toThrow(/VITE_DEV_SERVER_URL/);
    }
  });

  it('never parses or honors a development override in packaged execution', () => {
    expect(selectDevelopmentServerUrl('http://localhost:5174', true)).toBeUndefined();
    expect(selectDevelopmentServerUrl('https://attacker.example/renderer', true)).toBeUndefined();
    expect(selectDevelopmentServerUrl('malformed % url', true)).toBeUndefined();
    expect(selectDevelopmentServerUrl(undefined, true)).toBeUndefined();
    expect(selectDevelopmentServerUrl('http://localhost:5174', false)?.origin).toBe('http://localhost:5174');
  });

  it('requires the exact packaged file or exact selected development origin', () => {
    const production = productionRendererTrust('/Applications/TinySA SignalLab.app/Contents/Resources/renderer/index.html');
    const development = developmentRendererTrust(validateDevelopmentServerUrl('http://localhost:5174/app'));
    expect(isTrustedRendererUrl(production.url, production)).toBe(true);
    expect(isTrustedRendererUrl(`${production.url}?forged=1`, production)).toBe(false);
    expect(isTrustedRendererUrl('file:///tmp/index.html', production)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5174/', development)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5174/route?q=1', development)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5175/', development)).toBe(false);
    expect(isTrustedRendererUrl('http://127.0.0.1:5174/', development)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5174.evil.example/', development)).toBe(false);
    expect(isTrustedRendererUrl('blob:http://localhost:5174/id', development)).toBe(false);
    expect(isTrustedRendererUrl('malformed % url', development)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5174/', undefined)).toBe(false);
  });

  it('requires both current WebContents identity and its exact main frame', () => {
    const trust = developmentRendererTrust(validateDevelopmentServerUrl('http://localhost:5174'));
    const mainFrame = { url: 'http://localhost:5174/lab' };
    const contents = { mainFrame };
    const trusted = { sender: contents, senderFrame: mainFrame };
    expect(isTrustedRendererEvent(trusted, contents, trust)).toBe(true);
    expect(() => assertTrustedRendererEvent(trusted, contents, trust)).not.toThrow();
    for (const event of [
      { sender: { mainFrame }, senderFrame: mainFrame },
      { sender: contents, senderFrame: { url: mainFrame.url } },
      { sender: contents, senderFrame: { url: 'http://attacker.example/' } },
      { sender: contents, senderFrame: { url: 'malformed % url' } },
      {},
      null,
    ]) {
      expect(isTrustedRendererEvent(event, contents, trust)).toBe(false);
      expect(() => assertTrustedRendererEvent(event, contents, trust)).toThrow(/untrusted SignalLab renderer/i);
    }
    expect(isTrustedRendererEvent(trusted, { mainFrame }, trust)).toBe(false);
    expect(isTrustedRendererEvent(trusted, contents, undefined)).toBe(false);
  });

  it('fails closed for hostile accessors and every permission name', () => {
    const trust = developmentRendererTrust(validateDevelopmentServerUrl('http://localhost:5174'));
    const mainFrame = { url: 'http://localhost:5174' };
    const contents = { mainFrame };
    const hostile = Object.defineProperty({}, 'sender', { get() { throw new Error('hostile'); } });
    expect(isTrustedRendererEvent(hostile, contents, trust)).toBe(false);
    for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read', 'unknown']) {
      expect(denyRendererPermission()).toBe(false);
      expect(permission).toBeTypeOf('string');
    }
  });
});
