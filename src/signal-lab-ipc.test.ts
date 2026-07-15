import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_REPLAY_CHANNEL } from './waveforms.js';
import { registerSignalLabIpc, SIGNAL_LAB_IPC_CHANNELS, type SignalLabIpcController, type SignalLabIpcMainLike } from './signal-lab-ipc.js';

describe('SignalLab privileged IPC admission', () => {
  it('checks renderer trust and exact argument counts before every operation', () => {
    const harness = createHarness();
    const status = harness.controller.status();
    expect(harness.invoke(SIGNAL_LAB_IPC_CHANNELS.status, harness.trustedEvent)).toEqual(status);
    expect(harness.invoke(SIGNAL_LAB_IPC_CHANNELS.select, harness.trustedEvent, 'fm')).toEqual(status);
    expect(harness.invoke(SIGNAL_LAB_IPC_CHANNELS.channel, harness.trustedEvent, DEFAULT_REPLAY_CHANNEL)).toEqual(status);

    const callsBeforeRejections = harness.operations.mock.calls.length;
    for (const [channel, args] of [
      [SIGNAL_LAB_IPC_CHANNELS.status, ['unexpected']],
      [SIGNAL_LAB_IPC_CHANNELS.select, []],
      [SIGNAL_LAB_IPC_CHANNELS.select, ['cw', 'extra']],
      [SIGNAL_LAB_IPC_CHANNELS.channel, []],
      [SIGNAL_LAB_IPC_CHANNELS.channel, [DEFAULT_REPLAY_CHANNEL, 'extra']],
    ] as const) {
      expect(() => harness.invoke(channel, harness.trustedEvent, ...args)).toThrow(/expected exactly/i);
    }
    expect(harness.operations).toHaveBeenCalledTimes(callsBeforeRejections);

    expect(() => harness.invoke(SIGNAL_LAB_IPC_CHANNELS.status, {})).toThrow(/untrusted/i);
    expect(harness.operations).toHaveBeenCalledTimes(callsBeforeRejections);
  });

  it('removes partial registration after a setup failure and all handlers at teardown', () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const removed: string[] = [];
    const ipc: SignalLabIpcMainLike = {
      handle: (channel, listener) => {
        if (channel === SIGNAL_LAB_IPC_CHANNELS.select) throw new Error('duplicate handler');
        handlers.set(channel, listener);
      },
      removeHandler: (channel) => { removed.push(channel); handlers.delete(channel); },
    };
    const controller = createController(vi.fn());
    expect(() => registerSignalLabIpc(ipc, controller, () => undefined)).toThrow('duplicate handler');
    expect(removed).toEqual([SIGNAL_LAB_IPC_CHANNELS.status]);
    expect(handlers.size).toBe(0);

    const harness = createHarness();
    harness.unregister();
    expect(harness.handlers.size).toBe(0);
  });
});

function createHarness() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const operations = vi.fn();
  const controller = createController(operations);
  const ipc: SignalLabIpcMainLike = {
    handle: (channel, listener) => { handlers.set(channel, listener); },
    removeHandler: (channel) => { handlers.delete(channel); },
  };
  const trustedEvent = Object.freeze({ trusted: true });
  const unregister = registerSignalLabIpc(ipc, controller, (event) => {
    if (event !== trustedEvent) throw new Error('untrusted renderer');
  });
  return {
    handlers,
    operations,
    controller,
    trustedEvent,
    unregister,
    invoke(channel: string, event: unknown, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler ${channel}`);
      return handler(event, ...args);
    },
  };
}

function createController(operations: (...args: unknown[]) => void): SignalLabIpcController {
  const status = {
    contractVersion: 1 as const,
    owner: 'tinysa-signal-lab' as const,
    available: true as const,
    active: true as const,
    playback: true as const,
    sequence: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    profile: 'cw' as const,
    profiles: ['cw'] as never,
    waveform: {} as never,
    catalog: [] as never,
    channel: DEFAULT_REPLAY_CHANNEL,
  };
  return {
    status: () => { operations('status'); return status; },
    select: (profile) => { operations('select', profile); return status; },
    configureChannel: (configuration) => { operations('channel', configuration); return status; },
  };
}
