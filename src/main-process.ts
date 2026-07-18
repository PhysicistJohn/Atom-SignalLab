import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayChannelConfigurationSchema, SIGNAL_LAB_CONTRACT_VERSION, synthesizedSignalProfileSchema, type ReplayChannelConfiguration, type SignalLabStatus, type SynthesizedSignalProfile } from './contracts.js';
import { registerSignalLabIpc } from './signal-lab-ipc.js';
import { installSignalLabRendererBoundary } from './renderer-boundary.js';
import {
  assertTrustedRendererEvent,
  developmentRendererTrust,
  isTrustedRendererUrl,
  productionRendererTrust,
  selectDevelopmentServerUrl,
  type RendererTrust,
} from './renderer-trust.js';
import { DEFAULT_REPLAY_CHANNEL, waveformCatalog, waveformDescriptor } from './waveforms.js';

const here = fileURLToPath(new URL('.', import.meta.url));
let window: BrowserWindow | undefined;
let rendererTrust: RendererTrust | undefined;
let profile: SynthesizedSignalProfile = 'cw';
let channel: ReplayChannelConfiguration = DEFAULT_REPLAY_CHANNEL;
let sequence = 0;
app.setName('SignalLab');

function status(): SignalLabStatus {
  return {
    contractVersion: SIGNAL_LAB_CONTRACT_VERSION,
    owner: 'tinysa-signal-lab',
    available: true,
    active: true,
    playback: true,
    sequence,
    updatedAt: new Date().toISOString(),
    profile,
    profiles: synthesizedSignalProfileSchema.options,
    waveform: waveformDescriptor(profile),
    catalog: waveformCatalog.map((item) => structuredClone(item)),
    channel: structuredClone(channel),
  };
}

function publish(): SignalLabStatus {
  const value = status();
  if (window && !window.isDestroyed() && isTrustedRendererUrl(window.webContents.mainFrame.url, rendererTrust)) {
    window.webContents.send('signal-lab:status:v1', value);
  }
  return value;
}

function assertTrustedIpcEvent(event: unknown): void {
  const webContents = window && !window.isDestroyed() ? window.webContents : undefined;
  assertTrustedRendererEvent(event, webContents, rendererTrust);
}

const unregisterIpc = registerSignalLabIpc(ipcMain, {
  status,
  select: (value) => {
    profile = synthesizedSignalProfileSchema.parse(value);
    sequence += 1;
    return publish();
  },
  configureChannel: (value) => {
    channel = replayChannelConfigurationSchema.parse(value);
    sequence += 1;
    return publish();
  },
}, assertTrustedIpcEvent);

async function createWindow(): Promise<void> {
  const rendererPath = join(here, '../renderer/index.html');
  const developmentUrl = selectDevelopmentServerUrl(process.env.VITE_DEV_SERVER_URL, app.isPackaged);
  const trust = developmentUrl ? developmentRendererTrust(developmentUrl) : productionRendererTrust(rendererPath);
  const next = new BrowserWindow({
    // 520 px is the Studio's compact six-tab width. The densest collapsed
    // standards profile plus the three-row Rayleigh controls needs 709 px to
    // remain fully visible without turning the catalog into a scroll region.
    width: 520, height: 709, minWidth: 520, minHeight: 709, maxWidth: 520, maxHeight: 709,
    useContentSize: true, resizable: false,
    title: 'SignalLab', titleBarStyle: 'hiddenInset', backgroundColor: '#08080a',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });
  window = next;
  rendererTrust = trust;
  next.on('closed', () => {
    if (window === next) {
      window = undefined;
      rendererTrust = undefined;
    }
  });
  installSignalLabRendererBoundary(next.webContents, trust);
  if (developmentUrl) await next.loadURL(developmentUrl.href);
  else await next.loadFile(rendererPath);
}

app.whenReady().then(createWindow).catch((error) => { console.error('SignalLab startup failed', error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', unregisterIpc);
