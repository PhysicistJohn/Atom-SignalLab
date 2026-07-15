import type { WebContents } from 'electron';
import { denyRendererPermission, isTrustedRendererUrl, type RendererTrust } from './renderer-trust.js';

type BoundaryWebContents = Pick<WebContents, 'session' | 'setWindowOpenHandler' | 'on'>;

/** Install the complete non-IPC Electron renderer boundary in one auditable unit. */
export function installSignalLabRendererBoundary(webContents: BoundaryWebContents, trust: RendererTrust): void {
  webContents.session.setPermissionCheckHandler(denyRendererPermission);
  webContents.session.setPermissionRequestHandler((_requestingWebContents, _permission, callback) => callback(false));
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-attach-webview', (event) => event.preventDefault());
  const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
    if (!isTrustedRendererUrl(url, trust)) event.preventDefault();
  };
  webContents.on('will-navigate', preventUntrustedNavigation);
  webContents.on('will-redirect', preventUntrustedNavigation);
}
