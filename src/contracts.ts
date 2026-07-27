import { z } from 'zod';
import { profileGovernanceSchema } from './profile-governance-schema.js';
import { sourceBasisSchema } from './source-provenance.js';

export const SIGNAL_LAB_CONTRACT_VERSION = 1 as const;
export const MIN_MEASUREMENT_FREQUENCY_HZ = 1 as const;
export const MAX_MEASUREMENT_FREQUENCY_HZ = 17_922_600_000 as const;
export const MEASUREMENT_FREQUENCY_STEP_HZ = 1 as const;
export const SYNTHESIZED_SIGNAL_PROFILES = [
  'cw', 'am', 'fm',
  'gsm-900-loaded-bcch',
  'gsm-normal-burst', 'gsm-qpsk-higher-symbol-rate-burst', 'gsm-aqpsk-normal-burst', 'gsm-8psk-normal-burst', 'gsm-16qam-higher-symbol-rate-burst', 'gsm-32qam-higher-symbol-rate-burst',
  'lte-band3-fdd-20m', 'lte-band38-tdd-10m',
  'lte-etm1.1',
  'lte-etm3.1', 'lte-etm3.1a', 'lte-etm3.1b',
  'lte-ntm', 'lte-nbiot-guard-isolated-component', 'lte-nbiot-inband-isolated-component',
  'nr-n3-fdd-20m', 'nr-n78-tdd-100m',
  'nr-fr1-tm1.1',
  'nr-fr1-tm3.1', 'nr-fr1-tm3.1a', 'nr-fr1-tm3.1b', 'nr-nbiot-inband-isolated-component',
  'wifi-hr-dsss-11m', 'wifi-ofdm-20m',
  'wifi6-he-su', 'wifi6-he-er-su', 'wifi6-he-mu', 'wifi6-he-tb',
  'bluetooth-classic-connected', 'bluetooth-le-advertising',
  'ref-qpsk', 'ref-8psk', 'ref-16qam', 'ref-64qam', 'ref-256qam',
  'custom-lte', 'custom-nr', 'custom-wifi',
] as const;

export const synthesizedSignalProfileSchema = z.enum(SYNTHESIZED_SIGNAL_PROFILES);
export type SynthesizedSignalProfile = z.infer<typeof synthesizedSignalProfileSchema>;
export const receiverImpairmentPresetSchema = z.enum([
  'clean',
  'awgn',
  'multipath',
  'carrier-offset',
  'phase-noise',
  'iq-imbalance',
  'dc-offset',
  'pa-compression',
  'composite',
]);
export type ReceiverImpairmentPreset = z.infer<typeof receiverImpairmentPresetSchema>;
export const replayChannelConfigurationSchema = z.object({
  model: z.enum(['awgn', 'rayleigh']),
  noiseFloorDbm: z.number().finite().min(-150).max(-30),
  seed: z.number().int().min(1).max(0xffff_ffff),
  fadingRateHz: z.number().finite().min(0.1).max(100),
  /** Complex-I/Q receiver preset; omitted is accepted as legacy clean state. */
  receiverImpairment: receiverImpairmentPresetSchema.optional(),
}).strict();
export type ReplayChannelConfiguration = z.infer<typeof replayChannelConfigurationSchema>;
export const waveformProjectionSchema = z.object({
  allocation: z.enum(['carrier', 'sidebands', 'full', 'narrowband', 'multi-ru', 'resource-unit', 'frequency-hopping', 'advertising-channels']),
  modulation: z.enum(['unmodulated', 'am', 'fm', 'gmsk', 'qpsk', 'aqpsk', '8psk', '16qam', '32qam', '64qam', '256qam', '1024qam', 'ofdm-mixed', 'he-ofdm', 'hr-dsss', 'br-gfsk', 'br-edr', 'ble-1m']),
  timing: z.enum(['continuous', 'burst', 'frame', 'tdd-frame', 'classic-slots', 'advertising-events']),
  duplex: z.enum(['fdd', 'tdd']).optional(),
  subcarrierSpacingHz: z.number().int().positive().optional(),
  nominalResourceBlocks: z.number().int().positive().optional(),
}).strict();
export type WaveformProjection = z.infer<typeof waveformProjectionSchema>;
export const waveformDescriptorSchema = z.object({
  id: synthesizedSignalProfileSchema,
  label: z.string().min(1),
  family: z.enum(['tone', 'analog', 'geran', 'e-utra', 'nr', 'wlan', 'bluetooth', 'reference']),
  model: z.string().min(1),
  qualification: z.enum([
    'visual',
    'standards-derived',
    'independently-verified-digital-baseband',
    'conformance-validated',
  ]),
  centerHz: z.number().safe().int().min(MIN_MEASUREMENT_FREQUENCY_HZ).max(MAX_MEASUREMENT_FREQUENCY_HZ),
  occupiedBandwidthHz: z.number().int().positive(),
  recommendedSpanHz: z.number().int().positive(),
  projection: waveformProjectionSchema,
  source: sourceBasisSchema,
  governance: profileGovernanceSchema,
  disclosure: z.string().min(1),
  assetSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict().superRefine((descriptor, context) => {
  if (descriptor.recommendedSpanHz < descriptor.occupiedBandwidthHz) context.addIssue({ code: 'custom', path: ['recommendedSpanHz'], message: 'Recommended span must contain the occupied bandwidth' });
  if ((descriptor.qualification === 'independently-verified-digital-baseband'
    || descriptor.qualification === 'conformance-validated')
    && descriptor.assetSha256 === undefined) {
    context.addIssue({ code: 'custom', path: ['assetSha256'], message: 'Digitally qualified waveforms require a verified I/Q artifact hash' });
  }
  if (descriptor.qualification === 'visual' && descriptor.source.organization !== 'TinySA SignalLab') context.addIssue({ code: 'custom', path: ['source', 'organization'], message: 'Visual analytic waveforms must cite TinySA SignalLab' });
  if (descriptor.qualification !== 'visual' && descriptor.source.organization === 'TinySA SignalLab') context.addIssue({ code: 'custom', path: ['source', 'organization'], message: 'Standards or conformance-qualified waveforms require an external standards organization' });
  if (descriptor.governance.profileId !== descriptor.id) context.addIssue({ code: 'custom', path: ['governance', 'profileId'], message: 'Governance profile ID must match the waveform descriptor ID' });
  if (!descriptor.governance.governingOrganizations.includes(descriptor.source.organization)) context.addIssue({ code: 'custom', path: ['governance', 'governingOrganizations'], message: 'Descriptor source organization must be represented in governance' });
  if (descriptor.qualification === 'visual' && descriptor.governance.signalKind !== 'mathematical-lab-reference') context.addIssue({ code: 'custom', path: ['governance', 'signalKind'], message: 'Visual profiles must be governed as mathematical lab references' });
  if (descriptor.qualification === 'standards-derived' && descriptor.governance.implementedQualificationState !== 'standards-derived-engineering-projection') context.addIssue({ code: 'custom', path: ['governance', 'implementedQualificationState'], message: 'Standards-derived is an engineering provenance label, not a digital qualification claim' });
  if (descriptor.qualification === 'independently-verified-digital-baseband'
    || descriptor.qualification === 'conformance-validated') {
    if (descriptor.governance.implementedQualificationState !== 'digitally-qualified') context.addIssue({ code: 'custom', path: ['governance', 'implementedQualificationState'], message: 'Qualified descriptors require digitally qualified governance' });
    const evidenceSha256 = descriptor.governance.digitalQualificationEvidence?.artifact.sha256;
    if (descriptor.assetSha256 && evidenceSha256 !== descriptor.assetSha256.toLowerCase()) context.addIssue({ code: 'custom', path: ['assetSha256'], message: 'Descriptor asset hash must match the content-addressed qualification artifact' });
  }
});
export type WaveformDescriptor = z.infer<typeof waveformDescriptorSchema>;

export interface SignalLabStatus {
  contractVersion: typeof SIGNAL_LAB_CONTRACT_VERSION;
  owner: 'tinysa-signal-lab';
  available: true;
  active: true;
  playback: boolean;
  sequence: number;
  updatedAt: string;
  profile: SynthesizedSignalProfile;
  profiles: readonly SynthesizedSignalProfile[];
  waveform: WaveformDescriptor;
  catalog: readonly WaveformDescriptor[];
  channel: ReplayChannelConfiguration;
}

/** Versioned intent reserved for a future SignalLab -> Firmware twin stimulus sink. */
export interface SignalLabStimulusIntent {
  contractVersion: typeof SIGNAL_LAB_CONTRACT_VERSION;
  sequence: number;
  issuedAt: string;
  waveform: WaveformDescriptor;
  channel: ReplayChannelConfiguration;
  qualification: WaveformDescriptor['qualification'];
}

export interface SignalLabApi {
  readonly version: typeof SIGNAL_LAB_CONTRACT_VERSION;
  status(): Promise<SignalLabStatus>;
  select(profile: SynthesizedSignalProfile): Promise<SignalLabStatus>;
  configureChannel(config: ReplayChannelConfiguration): Promise<SignalLabStatus>;
  subscribe(listener: (status: SignalLabStatus) => void): () => void;
}
