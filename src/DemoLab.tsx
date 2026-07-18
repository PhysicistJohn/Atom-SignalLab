import { useEffect, useState } from 'react';
import type { ReplayChannelConfiguration, SignalLabStatus, SynthesizedSignalProfile } from './contracts.js';
import { SignalLabStudio, type SignalLabStudioPendingOperation } from './SignalLabStudio.js';

/** Standalone Electron adapter. The reusable studio itself has no preload dependency. */
export function DemoLab() {
  const [status, setStatus] = useState<SignalLabStatus>();
  const [pendingOperation, setPendingOperation] = useState<SignalLabStudioPendingOperation>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const unsubscribe = window.demoLab.subscribe(setStatus);
    void window.demoLab.status().then(setStatus).catch((value) => setError(message(value)));
    return unsubscribe;
  }, []);

  async function select(profile: SynthesizedSignalProfile): Promise<void> {
    setPendingOperation(profile);
    setError(undefined);
    try { setStatus(await window.demoLab.select(profile)); }
    catch (value) { setError(message(value)); }
    finally { setPendingOperation(undefined); }
  }

  async function configureChannel(channel: ReplayChannelConfiguration): Promise<void> {
    setPendingOperation('channel');
    setError(undefined);
    try { setStatus(await window.demoLab.configureChannel(channel)); }
    catch (value) { setError(message(value)); }
    finally { setPendingOperation(undefined); }
  }

  return <SignalLabStudio
    status={status}
    sourceState="selected"
    // The standalone shell owns editable source state, but it does not run a
    // measurement stream. `playback` is legacy availability metadata and must
    // not be rendered as evidence that samples are actively flowing.
    sessionState={error && !status ? 'error' : !status ? 'connecting' : 'ready'}
    pendingOperation={pendingOperation}
    error={error}
    titlebarInset
    onSelectProfile={(profile) => { void select(profile); }}
    onConfigureChannel={(channel) => { void configureChannel(channel); }}
  />;
}

function message(value: unknown): string { return value instanceof Error ? value.message : String(value); }
