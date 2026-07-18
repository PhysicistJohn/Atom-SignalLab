import { useEffect, useMemo, useState } from 'react';
import { Activity, AudioLines, Bluetooth, Boxes, Grid3X3, RadioTower, Waves, Wifi } from 'lucide-react';
import type { ReplayChannelConfiguration, SignalLabStatus, SynthesizedSignalProfile, WaveformDescriptor } from './contracts.js';
import { EditableParameter, SelectParameter } from './ParameterRow.js';
import styles from './SignalLabStudio.module.css';

export type SignalLabCatalogGroup = 'lab' | 'geran' | 'e-utra' | 'nr' | 'wlan' | 'bluetooth';
export type SignalLabSourceState = 'loading' | 'available' | 'selected' | 'unavailable' | 'error';
export type SignalLabSessionState = 'offline' | 'connecting' | 'ready' | 'streaming' | 'error';
export type SignalLabStudioPendingOperation = SynthesizedSignalProfile | 'channel';

/**
 * The controlled view needed by the Studio. Standalone SignalLab can pass its
 * complete SignalLabStatus, while an embedding host can pass only state it
 * actually owns instead of inventing SignalLab process/lifecycle metadata.
 */
export type SignalLabStudioStatus = Pick<
  SignalLabStatus,
  'profile' | 'waveform' | 'catalog' | 'channel'
> & Partial<Pick<SignalLabStatus, 'sequence'>>;

export interface SignalLabStudioProps {
  /** The host owns this state. SignalLabStudio never reads a preload or browser global. */
  status?: SignalLabStudioStatus;
  sourceState: SignalLabSourceState;
  sessionState: SignalLabSessionState;
  pendingOperation?: SignalLabStudioPendingOperation;
  error?: string;
  disabled?: boolean;
  /** Lets an embedding host expose profile selection before it admits channel mutation. */
  channelDisabled?: boolean;
  /** Adds the macOS traffic-light inset used by the standalone Electron window. */
  titlebarInset?: boolean;
  /** Uses sub-app landmark and titlebar semantics inside another application shell. */
  embedded?: boolean;
  /** Keeps source-truth controls outside an embedding host's semantic agent surface. */
  agentControlPolicy?: 'studio-local' | 'human-only';
  onSelectProfile(profile: SynthesizedSignalProfile): void;
  onConfigureChannel(configuration: ReplayChannelConfiguration): void;
}

const groups: readonly { id: SignalLabCatalogGroup; label: string }[] = [
  { id: 'lab', label: 'LAB' },
  { id: 'geran', label: 'GSM' },
  { id: 'e-utra', label: 'LTE' },
  { id: 'nr', label: '5G NR' },
  { id: 'wlan', label: 'WI-FI' },
  { id: 'bluetooth', label: 'BLUETOOTH' },
];

const labIcons = { cw: RadioTower, am: Activity, fm: Waves } as const;

export function SignalLabStudio({
  status,
  sourceState,
  sessionState,
  pendingOperation,
  error,
  disabled = false,
  channelDisabled = disabled,
  titlebarInset = false,
  embedded = false,
  agentControlPolicy = 'studio-local',
  onSelectProfile,
  onConfigureChannel,
}: SignalLabStudioProps) {
  const [group, setGroup] = useState<SignalLabCatalogGroup>(() => status ? catalogGroup(status.waveform) : 'lab');

  useEffect(() => {
    if (status) setGroup(catalogGroup(status.waveform));
  }, [status?.profile]);

  const groupedCatalog = useMemo(() => groupCatalog(status?.catalog ?? []), [status?.catalog]);
  const catalog = groupedCatalog.get(group) ?? [];
  const activeInGroup = status && catalogGroup(status.waveform) === group ? status.waveform : undefined;
  const descriptor = activeInGroup ?? catalog[0];
  const channel = status?.channel;
  const controlsDisabled = disabled || !status || pendingOperation !== undefined;
  const channelControlsDisabled = controlsDisabled || channelDisabled;

  function chooseGroup(next: SignalLabCatalogGroup): void {
    setGroup(next);
    const nextCatalog = groupedCatalog.get(next) ?? [];
    const current = status && catalogGroup(status.waveform) === next ? status.waveform : undefined;
    const nextDescriptor = current ?? nextCatalog[0];
    if (nextDescriptor && nextDescriptor.id !== status?.profile) onSelectProfile(nextDescriptor.id);
  }

  const controlId = (value: string): string | undefined => agentControlPolicy === 'human-only' ? undefined : value;
  const Root = embedded ? 'section' : 'main';

  return <Root
    className={`${styles.root} ${titlebarInset ? styles.titlebarInset : ''} ${embedded ? styles.embedded : ''}`}
    aria-label={embedded ? 'SignalLab Studio' : undefined}
    data-signal-lab-studio
    data-agent-exclusion={agentControlPolicy === 'human-only' ? 'human-signal-profile-boundary' : undefined}
  >
    <header className={styles.header}>
      <div className={styles.orbit} aria-hidden="true"><i/><i/><b/></div>
      <div className={styles.brand}><small>AtomOS</small><strong>SignalLab</strong></div>
      <div className={styles.runtimeState} aria-label="SignalLab source and session state">
        <span><small>Source</small><strong>{stateLabel(sourceState)}</strong></span>
        <span className={sessionState === 'streaming' ? styles.streaming : undefined}><small>Session</small><strong><i/>{stateLabel(sessionState)}</strong></span>
      </div>
    </header>

    <section className={styles.catalogSection} aria-label="Synthesized waveform catalog">
      <nav className={styles.catalogTabs} aria-label="Waveform families">
        {groups.map((item) => {
          const count = groupedCatalog.get(item.id)?.length ?? 0;
          return <button
            key={item.id}
            type="button"
            className={group === item.id ? styles.active : undefined}
            disabled={count === 0}
            aria-pressed={group === item.id}
            onClick={() => chooseGroup(item.id)}
          ><span>{item.label}</span><small>{count}</small></button>;
        })}
      </nav>

      {!descriptor ? <div className={styles.emptyCatalog} role="status">Waiting for the SignalLab catalog…</div> : <>
        {group === 'lab'
          ? <LabProfilePicker
              catalog={catalog}
              activeProfile={status?.profile}
              disabled={controlsDisabled}
              onSelect={onSelectProfile}
            />
          : <div className={styles.modelSelect}><SelectParameter
              label={`${familyLabel(descriptor)} waveform configuration`}
              value={descriptor.id}
              disabled={controlsDisabled}
              controlId={controlId('signal-lab.waveform-model')}
              options={catalog.map((entry) => ({ value: entry.id, label: entry.label }))}
              onValue={(value) => onSelectProfile(value as SynthesizedSignalProfile)}
            /></div>}
        <ProfileDetail
          descriptor={descriptor}
          active={status?.profile === descriptor.id}
          switching={pendingOperation === descriptor.id}
        />
      </>}
    </section>

    <section className={styles.channelSection} aria-label="Replay channel configuration">
      <div className={styles.channelHeading}><span>Channel</span><small>{channel ? channel.model.toUpperCase() : 'UNAVAILABLE'}</small></div>
      <div className={styles.channelButtons}>
        {(['awgn', 'rayleigh'] as const).map((model) => <button
          key={model}
          type="button"
          className={channel?.model === model ? styles.active : undefined}
          disabled={!channel || channelControlsDisabled}
          onClick={() => channel && onConfigureChannel({ ...channel, model })}
        >{model === 'awgn' ? 'AWGN' : 'Rayleigh'}</button>)}
      </div>
      <div className={styles.channelParameters}>
        <EditableParameter
          label="Noise floor"
          value={channel?.noiseFloorDbm ?? -108}
          displayValue={`${channel?.noiseFloorDbm ?? -108} dBm`}
          unit="dBm"
          minimum={-150}
          maximum={-30}
          disabled={!channel || channelControlsDisabled}
          controlId={controlId('signal-lab.channel.noise-floor')}
          onCommit={(value) => channel && onConfigureChannel({ ...channel, noiseFloorDbm: Number(value) })}
        />
        <EditableParameter
          label="Deterministic seed"
          value={channel?.seed ?? 1}
          displayValue={String(channel?.seed ?? 1)}
          minimum={1}
          maximum={0xffff_ffff}
          step={1}
          disabled={!channel || channelControlsDisabled}
          controlId={controlId('signal-lab.channel.seed')}
          onCommit={(value) => channel && onConfigureChannel({ ...channel, seed: Number(value) })}
        />
        {channel?.model === 'rayleigh' && <EditableParameter
          label="Fading rate"
          value={channel.fadingRateHz}
          displayValue={`${channel.fadingRateHz.toFixed(1)} Hz`}
          unit="Hz"
          minimum={0.1}
          maximum={100}
          step={0.1}
          disabled={channelControlsDisabled}
          controlId={controlId('signal-lab.channel.fading-rate')}
          onCommit={(value) => onConfigureChannel({ ...channel, fadingRateHz: Number(value) })}
        />}
      </div>
      <p>{channel?.model === 'rayleigh' ? 'Rayleigh fading + AWGN' : 'AWGN + receiver ripple'}</p>
    </section>

    {error && <div className={styles.error} role="alert">{error}</div>}
    <footer className={styles.footer}>
      <span>{status ? `${status.sequence === undefined ? '' : `SEQUENCE ${status.sequence} · `}${status.waveform.qualification.replaceAll('-', ' ').toUpperCase()} · ${status.waveform.source.organization}` : 'NO AUTHORITATIVE STATUS'}</span>
    </footer>
  </Root>;
}

function LabProfilePicker({ catalog, activeProfile, disabled, onSelect }: {
  catalog: readonly WaveformDescriptor[];
  activeProfile?: SynthesizedSignalProfile;
  disabled: boolean;
  onSelect(profile: SynthesizedSignalProfile): void;
}) {
  return <div className={styles.labSignals}>{catalog.map((descriptor) => {
    const Icon = labIcons[descriptor.id as keyof typeof labIcons];
    if (!Icon) throw new Error(`Visual lab profile ${descriptor.id} has no icon contract`);
    const active = activeProfile === descriptor.id;
    return <button
      key={descriptor.id}
      type="button"
      className={active ? styles.active : undefined}
      disabled={disabled}
      onClick={() => onSelect(descriptor.id)}
      title={descriptor.disclosure}
    ><span><Icon size={18}/></span><strong>{descriptor.label.replace(' replay', '')}</strong><small>{descriptor.model}</small><i>{active && <b/>}</i></button>;
  })}</div>;
}

function ProfileDetail({ descriptor, active, switching }: { descriptor: WaveformDescriptor; active: boolean; switching: boolean }) {
  const Icon = descriptor.family === 'geran'
    ? AudioLines
    : descriptor.family === 'e-utra'
      ? Grid3X3
      : descriptor.family === 'nr'
        ? Boxes
        : descriptor.family === 'bluetooth'
          ? Bluetooth
          : descriptor.family === 'wlan'
            ? Wifi
            : descriptor.family === 'tone'
              ? RadioTower
              : descriptor.id === 'am'
                ? Activity
                : Waves;
  const configuration = descriptorConfiguration(descriptor);

  return <article className={`${styles.profileDetail} ${active ? styles.active : ''}`} title={descriptor.disclosure}>
    <div className={styles.profileSummary}>
      <span className={styles.profileIcon}><Icon size={21}/></span>
      <div><small>{descriptor.qualification.replaceAll('-', ' ').toUpperCase()}</small><h2>{descriptor.label}</h2><p>{switching ? 'Switching configuration…' : descriptor.model}</p></div>
      <i>{active && <b/>}</i>
    </div>
    <dl className={styles.configurationGrid}>
      {configuration.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
    </dl>
    <section className={styles.sourceEvidence} aria-label="Waveform source evidence">
      <div><small>Source basis</small><strong>{descriptor.source.organization}</strong></div>
      <ul>{descriptor.source.references.map((reference) => <li key={`${reference.specification}-${reference.revision}`} title={reference.url}>
        <strong>{reference.specification} · {reference.revision}</strong><span>{reference.clause}</span>
      </li>)}</ul>
    </section>
    <details className={styles.disclosure}><summary>Scope and limitations</summary><p>{descriptor.disclosure}</p></details>
  </article>;
}

function descriptorConfiguration(descriptor: WaveformDescriptor): readonly (readonly [string, string])[] {
  const projection = descriptor.projection;
  return [
    ['ALLOCATION', displayToken(projection.allocation)],
    ['MODULATION', displayToken(projection.modulation)],
    ['TIMING', displayToken(projection.timing)],
    ['CENTER', formatFrequency(descriptor.centerHz)],
    ['OCCUPIED FIELD', formatFrequency(descriptor.occupiedBandwidthHz)],
    ['DISPLAY SPAN', formatFrequency(descriptor.recommendedSpanHz)],
    ...(projection.duplex ? [['DUPLEX', projection.duplex.toUpperCase()] as const] : []),
    ...(projection.subcarrierSpacingHz ? [['SUBCARRIER SPACING', formatFrequency(projection.subcarrierSpacingHz)] as const] : []),
    ...(projection.nominalResourceBlocks ? [['NOMINAL RB', String(projection.nominalResourceBlocks)] as const] : []),
  ];
}

function groupCatalog(catalog: readonly WaveformDescriptor[]): ReadonlyMap<SignalLabCatalogGroup, readonly WaveformDescriptor[]> {
  const result = new Map<SignalLabCatalogGroup, WaveformDescriptor[]>(groups.map(({ id }) => [id, []]));
  for (const descriptor of catalog) result.get(catalogGroup(descriptor))?.push(descriptor);
  return result;
}

export function catalogGroup(descriptor: WaveformDescriptor): SignalLabCatalogGroup {
  return descriptor.family === 'tone' || descriptor.family === 'analog' ? 'lab' : descriptor.family;
}

function familyLabel(descriptor: WaveformDescriptor): string {
  return ({ geran: 'GSM', 'e-utra': 'LTE', nr: '5G NR', wlan: 'Wi-Fi', bluetooth: 'Bluetooth', tone: 'Lab', analog: 'Lab' })[descriptor.family];
}

function stateLabel(state: SignalLabSourceState | SignalLabSessionState): string {
  return state.replaceAll('-', ' ').toUpperCase();
}

function displayToken(value: string): string { return value.replaceAll('-', ' ').toUpperCase(); }

function formatFrequency(value: number): string {
  if (value >= 1_000_000_000) return `${trimNumber(value / 1_000_000_000)} GHz`;
  if (value >= 1_000_000) return `${trimNumber(value / 1_000_000)} MHz`;
  if (value >= 1_000) return `${trimNumber(value / 1_000)} kHz`;
  return `${value} Hz`;
}

function trimNumber(value: number): string { return Number(value.toFixed(6)).toLocaleString('en-US'); }
