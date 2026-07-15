import type { SignalLabStatus } from './contracts.js';

export const SIGNAL_LAB_IPC_CHANNELS = Object.freeze({
  status: 'signal-lab:status:v1',
  select: 'signal-lab:select:v1',
  channel: 'signal-lab:channel:v1',
} as const);

export interface SignalLabIpcController {
  status(): SignalLabStatus;
  select(profile: unknown): SignalLabStatus;
  configureChannel(configuration: unknown): SignalLabStatus;
}

export interface SignalLabIpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

/** Register the complete privileged IPC surface with exact argument arity. */
export function registerSignalLabIpc(
  ipcMain: SignalLabIpcMainLike,
  controller: SignalLabIpcController,
  assertTrustedEvent: (event: unknown) => void,
): () => void {
  const registered: string[] = [];
  const handle = (channel: string, argumentCount: number, operation: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedEvent(event);
      assertExactArgumentCount(channel, args, argumentCount);
      return operation(...args);
    });
    registered.push(channel);
  };

  try {
    handle(SIGNAL_LAB_IPC_CHANNELS.status, 0, () => controller.status());
    handle(SIGNAL_LAB_IPC_CHANNELS.select, 1, (profile) => controller.select(profile));
    handle(SIGNAL_LAB_IPC_CHANNELS.channel, 1, (configuration) => controller.configureChannel(configuration));
  } catch (error) {
    for (const channel of registered) ipcMain.removeHandler(channel);
    throw error;
  }

  return () => {
    for (const channel of registered) ipcMain.removeHandler(channel);
  };
}

export function assertExactArgumentCount(channel: string, args: readonly unknown[], expected: number): void {
  if (args.length !== expected) {
    throw new Error(`Rejected ${channel} IPC invocation: expected exactly ${expected} argument${expected === 1 ? '' : 's'}`);
  }
}
