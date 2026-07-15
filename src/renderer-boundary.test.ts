import { describe, expect, it, vi } from 'vitest';
import { installSignalLabRendererBoundary } from './renderer-boundary.js';
import { developmentRendererTrust, validateDevelopmentServerUrl } from './renderer-trust.js';

describe('SignalLab Electron renderer boundary wiring', () => {
  it('denies permissions, windows, webviews, and untrusted navigation', () => {
    const listeners = new Map<string, (...args: never[]) => unknown>();
    let permissionCheck: ((...args: unknown[]) => boolean) | undefined;
    let permissionRequest: ((...args: unknown[]) => void) | undefined;
    let windowOpen: (() => { action: string }) | undefined;
    const webContents = {
      session: {
        setPermissionCheckHandler(handler: (...args: unknown[]) => boolean) { permissionCheck = handler; },
        setPermissionRequestHandler(handler: (...args: unknown[]) => void) { permissionRequest = handler; },
      },
      setWindowOpenHandler(handler: () => { action: string }) { windowOpen = handler; },
      on(name: string, listener: (...args: never[]) => unknown) { listeners.set(name, listener); return webContents; },
    };
    const trust = developmentRendererTrust(validateDevelopmentServerUrl('http://localhost:5174'));
    installSignalLabRendererBoundary(webContents as never, trust);

    expect(permissionCheck?.({}, 'media', 'http://localhost:5174', {})).toBe(false);
    const callback = vi.fn();
    permissionRequest?.({}, 'media', callback, {});
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    expect(windowOpen?.()).toEqual({ action: 'deny' });

    const webviewEvent = { preventDefault: vi.fn() };
    listeners.get('will-attach-webview')?.(webviewEvent as never);
    expect(webviewEvent.preventDefault).toHaveBeenCalledOnce();

    for (const name of ['will-navigate', 'will-redirect']) {
      const trusted = { preventDefault: vi.fn() };
      listeners.get(name)?.(trusted as never, 'http://localhost:5174/next' as never);
      expect(trusted.preventDefault).not.toHaveBeenCalled();
      for (const url of ['http://localhost:5175/', 'http://localhost:5174.evil.example/', 'file:///tmp/attack.html']) {
        const hostile = { preventDefault: vi.fn() };
        listeners.get(name)?.(hostile as never, url as never);
        expect(hostile.preventDefault).toHaveBeenCalledOnce();
      }
    }
  });
});
