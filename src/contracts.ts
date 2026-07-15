import { z } from 'zod';

export const SIGNAL_LAB_CONTRACT_VERSION = 1 as const;
export const SYNTHESIZED_SIGNAL_PROFILES = [
  'cw', 'am', 'fm',
  'gsm-900-loaded-bcch',
  'gsm-normal-burst', 'gsm-qpsk-normal-burst', 'gsm-aqpsk-normal-burst', 'gsm-8psk-normal-burst', 'gsm-16qam-normal-burst', 'gsm-32qam-normal-burst',
  'lte-band3-fdd-20m', 'lte-band38-tdd-10m',
  'lte-etm1.1', 'lte-etm1.2', 'lte-etm2', 'lte-etm2a', 'lte-etm2b',
  'lte-setm2-1', 'lte-setm2a-1', 'lte-setm2-2', 'lte-setm2a-2',
  'lte-etm3.1', 'lte-etm3.1a', 'lte-etm3.1b', 'lte-setm3.1-1', 'lte-setm3.1a-1', 'lte-setm3.1-2', 'lte-setm3.1a-2',
  'lte-etm3.2', 'lte-setm3.2-1', 'lte-setm3.2-2', 'lte-etm3.3', 'lte-setm3.3-1', 'lte-setm3.3-2',
  'lte-ntm', 'lte-ntm-guard', 'lte-ntm-inband',
  'nr-n3-fdd-20m', 'nr-n78-tdd-100m',
  'nr-fr1-tm1.1', 'nr-fr1-tm1.2', 'nr-fr1-tm2', 'nr-fr1-tm2a', 'nr-fr1-tm2b',
  'nr-fr1-tm3.1', 'nr-fr1-tm3.1a', 'nr-fr1-tm3.1b', 'nr-fr1-tm3.2', 'nr-fr1-tm3.3', 'nr-ntm',
  'nr-fr1-tm1.1-sbfd-du', 'nr-fr1-tm1.1-sbfd-ud', 'nr-fr1-tm1.1-sbfd-dud',
  'nr-fr1-tm1.2-sbfd-du', 'nr-fr1-tm1.2-sbfd-ud', 'nr-fr1-tm1.2-sbfd-dud',
  'nr-fr1-tm2-sbfd-du', 'nr-fr1-tm2-sbfd-ud', 'nr-fr1-tm2-sbfd-dud',
  'nr-fr1-tm2a-sbfd-du', 'nr-fr1-tm2a-sbfd-ud', 'nr-fr1-tm2a-sbfd-dud',
  'nr-fr1-tm2b-sbfd-du', 'nr-fr1-tm2b-sbfd-ud', 'nr-fr1-tm2b-sbfd-dud',
  'nr-fr1-tm3.1-sbfd-du', 'nr-fr1-tm3.1-sbfd-ud', 'nr-fr1-tm3.1-sbfd-dud',
  'nr-fr1-tm3.1a-sbfd-du', 'nr-fr1-tm3.1a-sbfd-ud', 'nr-fr1-tm3.1a-sbfd-dud',
  'nr-fr1-tm3.1b-sbfd-du', 'nr-fr1-tm3.1b-sbfd-ud', 'nr-fr1-tm3.1b-sbfd-dud',
  'nr-fr1-tm3.2-sbfd-du', 'nr-fr1-tm3.2-sbfd-ud', 'nr-fr1-tm3.2-sbfd-dud',
  'nr-fr1-tm3.3-sbfd-du', 'nr-fr1-tm3.3-sbfd-ud', 'nr-fr1-tm3.3-sbfd-dud',
  'wifi-hr-dsss-11m', 'wifi-ofdm-20m',
  'wifi6-he-su', 'wifi6-he-er-su', 'wifi6-he-mu', 'wifi6-he-tb',
  'bluetooth-classic-connected', 'bluetooth-le-advertising',
] as const;

export const synthesizedSignalProfileSchema = z.enum(SYNTHESIZED_SIGNAL_PROFILES);
export type SynthesizedSignalProfile = z.infer<typeof synthesizedSignalProfileSchema>;
export const replayChannelConfigurationSchema = z.object({
  model: z.enum(['awgn', 'rayleigh']),
  noiseFloorDbm: z.number().finite().min(-150).max(-30),
  seed: z.number().int().min(1).max(0xffff_ffff),
  fadingRateHz: z.number().finite().min(0.1).max(100),
}).strict();
export type ReplayChannelConfiguration = z.infer<typeof replayChannelConfigurationSchema>;
export const waveformProjectionSchema = z.object({
  allocation: z.enum(['carrier', 'sidebands', 'full', 'boosted', 'single-prb', 'narrowband', 'multi-ru', 'resource-unit', 'frequency-hopping', 'advertising-channels']),
  modulation: z.enum(['unmodulated', 'am', 'fm', 'gmsk', 'qpsk', 'aqpsk', '8psk', '16qam', '32qam', '64qam', '256qam', '1024qam', 'ofdm-mixed', 'he-ofdm', 'hr-dsss', 'br-edr', 'ble-1m']),
  timing: z.enum(['continuous', 'burst', 'frame', 'subslot', 'slot', 'tdd-frame', 'classic-slots', 'advertising-events', 'sbfd-du', 'sbfd-ud', 'sbfd-dud']),
  duplex: z.enum(['fdd', 'tdd']).optional(),
  subcarrierSpacingHz: z.number().int().positive().optional(),
  nominalResourceBlocks: z.number().int().positive().optional(),
}).strict();
export type WaveformProjection = z.infer<typeof waveformProjectionSchema>;
export const waveformDescriptorSchema = z.object({
  id: synthesizedSignalProfileSchema,
  label: z.string().min(1),
  family: z.enum(['tone', 'analog', 'geran', 'e-utra', 'nr', 'wlan', 'bluetooth']),
  model: z.string().min(1),
  qualification: z.enum(['visual', 'standards-derived', 'conformance-validated']),
  centerHz: z.number().int().positive().max(17_922_600_000),
  occupiedBandwidthHz: z.number().int().positive(),
  recommendedSpanHz: z.number().int().positive(),
  projection: waveformProjectionSchema,
  standard: z.object({
    organization: z.enum(['TinySA SignalLab', '3GPP', 'IEEE', 'Bluetooth SIG']),
    specification: z.string().min(1),
    clause: z.string().min(1),
    revision: z.string().min(1),
    url: z.string().url(),
  }).strict(),
  disclosure: z.string().min(1),
  assetSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict().superRefine((descriptor, context) => {
  if (descriptor.recommendedSpanHz < descriptor.occupiedBandwidthHz) context.addIssue({ code: 'custom', path: ['recommendedSpanHz'], message: 'Recommended span must contain the occupied bandwidth' });
  if (descriptor.qualification === 'conformance-validated' && descriptor.assetSha256 === undefined) context.addIssue({ code: 'custom', path: ['assetSha256'], message: 'Conformance-validated waveforms require a verified I/Q asset hash' });
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
