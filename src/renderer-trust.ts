import { pathToFileURL } from 'node:url';

const DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type RendererTrust =
  | { mode: 'development'; origin: string }
  | { mode: 'production'; url: string };

export interface RendererFrameLike {
  readonly url: string;
}

export interface RendererWebContentsLike {
  readonly mainFrame: RendererFrameLike;
}

export interface RendererIpcEventLike {
  readonly sender: unknown;
  readonly senderFrame: unknown;
}

/** Admit only the one explicit unauthenticated loopback HTTP development origin. */
export function validateDevelopmentServerUrl(value: string): URL {
  if (!value || value !== value.trim()) {
    throw new Error('VITE_DEV_SERVER_URL must be a non-empty URL without surrounding whitespace');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_DEV_SERVER_URL must be a valid URL');
  }
  if (url.protocol !== 'http:'
    || !DEVELOPMENT_HOSTS.has(url.hostname)
    || !url.port
    || url.username
    || url.password) {
    throw new Error('VITE_DEV_SERVER_URL must be an unauthenticated http://localhost, 127.0.0.1, or [::1] URL with an explicit port');
  }
  return url;
}

/** Packaged SignalLab builds never honor a development-server environment override. */
export function selectDevelopmentServerUrl(value: string | undefined, isPackaged: boolean): URL | undefined {
  if (isPackaged || value === undefined) return undefined;
  return validateDevelopmentServerUrl(value);
}

export function productionRendererTrust(rendererPath: string): Extract<RendererTrust, { mode: 'production' }> {
  return { mode: 'production', url: pathToFileURL(rendererPath).href };
}

export function developmentRendererTrust(url: URL): Extract<RendererTrust, { mode: 'development' }> {
  return { mode: 'development', origin: validateDevelopmentServerUrl(url.href).origin };
}

/** Match the exact packaged file or the exact selected development origin and port. */
export function isTrustedRendererUrl(actual: string, expected: RendererTrust | undefined): boolean {
  if (!expected) return false;
  try {
    const url = new URL(actual);
    return expected.mode === 'development'
      ? url.protocol === 'http:' && url.origin === expected.origin
      : url.href === expected.url;
  } catch {
    return false;
  }
}

/**
 * URL equality alone is insufficient. Privileged IPC must come from the exact
 * current BrowserWindow WebContents and its exact main frame.
 */
export function isTrustedRendererEvent(
  event: unknown,
  expectedWebContents: RendererWebContentsLike | undefined,
  expected: RendererTrust | undefined,
): event is RendererIpcEventLike {
  if (!expectedWebContents || !expected || !isRecord(event)) return false;
  try {
    const sender = Reflect.get(event, 'sender');
    const senderFrame = Reflect.get(event, 'senderFrame');
    return sender === expectedWebContents
      && senderFrame === expectedWebContents.mainFrame
      && isRecord(senderFrame)
      && typeof Reflect.get(senderFrame, 'url') === 'string'
      && isTrustedRendererUrl(Reflect.get(senderFrame, 'url') as string, expected);
  } catch {
    return false;
  }
}

export function assertTrustedRendererEvent(
  event: unknown,
  expectedWebContents: RendererWebContentsLike | undefined,
  expected: RendererTrust | undefined,
): void {
  if (!isTrustedRendererEvent(event, expectedWebContents, expected)) {
    throw new Error('Rejected IPC from an untrusted SignalLab renderer frame or origin');
  }
}

/** SignalLab has no renderer permission requirement; every Electron permission is denied. */
export function denyRendererPermission(): false {
  return false;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}
