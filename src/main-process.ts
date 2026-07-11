import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayChannelConfigurationSchema, SIGNAL_LAB_CONTRACT_VERSION, synthesizedSignalProfileSchema, type ReplayChannelConfiguration, type SignalLabStatus, type SynthesizedSignalProfile } from './contracts.js';
import { DEFAULT_REPLAY_CHANNEL, waveformCatalog, waveformDescriptor } from './waveforms.js';

const here = fileURLToPath(new URL('.', import.meta.url));
let window: BrowserWindow | undefined;
let profile: SynthesizedSignalProfile = 'cw';
let channel: ReplayChannelConfiguration = DEFAULT_REPLAY_CHANNEL;
let sequence = 0;
app.setName('TinySA SignalLab');

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
function publish(): SignalLabStatus { const value = status(); window?.webContents.send('signal-lab:status:v1', value); return value; }

ipcMain.handle('signal-lab:status:v1', () => status());
ipcMain.handle('signal-lab:select:v1', (_event, value: unknown) => { profile = synthesizedSignalProfileSchema.parse(value); sequence++; return publish(); });
ipcMain.handle('signal-lab:channel:v1', (_event, value: unknown) => { channel = replayChannelConfigurationSchema.parse(value); sequence++; return publish(); });

async function createWindow(): Promise<void> {
  const next = new BrowserWindow({
    width: 520, height: 590, minWidth: 520, minHeight: 590, maxWidth: 520, maxHeight: 590, resizable: false,
    title: 'TinySA SignalLab', titleBarStyle: 'hiddenInset', backgroundColor: '#08080a',
    webPreferences: { preload: join(here, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window = next;
  next.on('closed', () => { window = undefined; });
  next.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  next.webContents.on('will-navigate', (event) => event.preventDefault());
  if (process.env.VITE_DEV_SERVER_URL) await next.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await next.loadFile(join(here, '../renderer/index.html'));
}

app.whenReady().then(createWindow).catch((error) => { console.error('TinySA SignalLab startup failed', error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
