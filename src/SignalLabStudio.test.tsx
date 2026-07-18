import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { waveformCatalog } from './catalog.js';
import { SIGNAL_LAB_CONTRACT_VERSION, SYNTHESIZED_SIGNAL_PROFILES, type SignalLabStatus } from './contracts.js';
import { SignalLabStudio, catalogGroup } from './SignalLabStudio.js';
import { DEFAULT_REPLAY_CHANNEL } from './waveforms.js';

describe('SignalLabStudio host boundary', () => {
  it('renders every waveform family and honest metadata from authoritative props', () => {
    const waveform = waveformCatalog.find((descriptor) => descriptor.id === 'lte-etm1.1');
    if (!waveform) throw new Error('LTE E-TM1.1 fixture is missing');
    const status: SignalLabStatus = {
      contractVersion: SIGNAL_LAB_CONTRACT_VERSION,
      owner: 'tinysa-signal-lab',
      available: true,
      active: true,
      playback: false,
      sequence: 42,
      updatedAt: '2026-07-17T00:00:00.000Z',
      profile: waveform.id,
      profiles: SYNTHESIZED_SIGNAL_PROFILES,
      waveform,
      catalog: waveformCatalog,
      channel: DEFAULT_REPLAY_CHANNEL,
    };

    const markup = renderToStaticMarkup(<SignalLabStudio
      status={status}
      sourceState="selected"
      sessionState="ready"
      onSelectProfile={() => undefined}
      onConfigureChannel={() => undefined}
    />);

    for (const family of ['LAB', 'GSM', 'LTE', '5G NR', 'WI-FI', 'BLUETOOTH']) expect(markup).toContain(family);
    expect(markup).toContain('Source</small><strong>SELECTED');
    expect(markup).toContain('Session</small><strong><i></i>READY');
    expect(markup).toContain('LTE E-TM1.1');
    expect(markup).toContain('STANDARDS DERIVED');
    expect(markup).toContain('TS 36.141');
    expect(markup).toContain('SEQUENCE 42');
    expect(markup).not.toContain('CONFORMANCE VALIDATED');
  });

  it('maps analog waveforms into the Lab family without changing catalog identities', () => {
    const am = waveformCatalog.find((descriptor) => descriptor.id === 'am');
    const bluetooth = waveformCatalog.find((descriptor) => descriptor.id === 'bluetooth-le-advertising');
    if (!am || !bluetooth) throw new Error('Catalog fixture is incomplete');
    expect(catalogGroup(am)).toBe('lab');
    expect(catalogGroup(bluetooth)).toBe('bluetooth');
  });

  it('uses a named sub-app landmark and human-only controls when embedded', () => {
    const waveform = waveformCatalog[0];
    if (!waveform) throw new Error('Catalog fixture is empty');

    const markup = renderToStaticMarkup(<SignalLabStudio
      embedded
      agentControlPolicy="human-only"
      status={{ profile: waveform.id, waveform, catalog: waveformCatalog, channel: DEFAULT_REPLAY_CHANNEL }}
      sourceState="selected"
      sessionState="ready"
      onSelectProfile={() => undefined}
      onConfigureChannel={() => undefined}
    />);

    expect(markup).toContain('<section');
    expect(markup).toContain('aria-label="SignalLab Studio"');
    expect(markup).toContain('data-agent-exclusion="human-signal-profile-boundary"');
    expect(markup).not.toContain('<main');
    expect(markup).not.toContain('data-control-id=');
  });
});
