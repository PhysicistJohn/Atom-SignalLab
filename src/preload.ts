import { contextBridge, ipcRenderer } from 'electron';
import {
  SIGNAL_LAB_CONTRACT_VERSION,
  type ReplayChannelConfiguration,
  type SignalLabStatus,
  type SynthesizedSignalProfile,
} from './contracts.js';
import { SIGNAL_LAB_IPC_CHANNELS } from './signal-lab-ipc.js';

contextBridge.exposeInMainWorld('demoLab', {
  version: SIGNAL_LAB_CONTRACT_VERSION,
  status: () => ipcRenderer.invoke(SIGNAL_LAB_IPC_CHANNELS.status),
  select: (profile: SynthesizedSignalProfile) =>
    ipcRenderer.invoke(SIGNAL_LAB_IPC_CHANNELS.select, profile),
  configureChannel: (config: ReplayChannelConfiguration) =>
    ipcRenderer.invoke(SIGNAL_LAB_IPC_CHANNELS.channel, config),
  subscribe: (listener: (status: SignalLabStatus) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: SignalLabStatus) => listener(status);
    ipcRenderer.on(SIGNAL_LAB_IPC_CHANNELS.status, wrapped);
    return () => ipcRenderer.removeListener(SIGNAL_LAB_IPC_CHANNELS.status, wrapped);
  },
});
