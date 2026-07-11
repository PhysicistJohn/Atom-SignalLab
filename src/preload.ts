import { contextBridge, ipcRenderer } from 'electron';
import type { ReplayChannelConfiguration, SignalLabStatus, SynthesizedSignalProfile } from './contracts.js';

contextBridge.exposeInMainWorld('demoLab', {
  version: 1,
  status: () => ipcRenderer.invoke('signal-lab:status:v1'),
  select: (profile: SynthesizedSignalProfile) => ipcRenderer.invoke('signal-lab:select:v1', profile),
  configureChannel: (config: ReplayChannelConfiguration) => ipcRenderer.invoke('signal-lab:channel:v1', config),
  subscribe: (listener: (status: SignalLabStatus) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: SignalLabStatus) => listener(status);
    ipcRenderer.on('signal-lab:status:v1', wrapped);
    return () => ipcRenderer.removeListener('signal-lab:status:v1', wrapped);
  },
});
