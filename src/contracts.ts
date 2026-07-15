import { z } from 'zod';
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
  allocation: z.enum(['carrier', 'sidebands', 'full', 'narrowband', 'multi-ru', 'resource-unit', 'frequency-hopping', 'advertising-channels']),
  modulation: z.enum(['unmodulated', 'am', 'fm', 'gmsk', 'qpsk', 'aqpsk', '8psk', '16qam', '32qam', '64qam', '256qam', '1024qam', 'ofdm-mixed', 'he-ofdm', 'hr-dsss', 'br-edr', 'ble-1m']),
  timing: z.enum(['continuous', 'burst', 'frame', 'tdd-frame', 'classic-slots', 'advertising-events']),
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
  centerHz: z.number().safe().int().min(MIN_MEASUREMENT_FREQUENCY_HZ).max(MAX_MEASUREMENT_FREQUENCY_HZ),
  occupiedBandwidthHz: z.number().int().positive(),
  recommendedSpanHz: z.number().int().positive(),
  projection: waveformProjectionSchema,
  source: sourceBasisSchema,
  disclosure: z.string().min(1),
  assetSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict().superRefine((descriptor, context) => {
  if (descriptor.recommendedSpanHz < descriptor.occupiedBandwidthHz) context.addIssue({ code: 'custom', path: ['recommendedSpanHz'], message: 'Recommended span must contain the occupied bandwidth' });
  if (descriptor.qualification === 'conformance-validated' && descriptor.assetSha256 === undefined) context.addIssue({ code: 'custom', path: ['assetSha256'], message: 'Conformance-validated waveforms require a verified I/Q asset hash' });
  if (descriptor.qualification === 'visual' && descriptor.source.organization !== 'TinySA SignalLab') context.addIssue({ code: 'custom', path: ['source', 'organization'], message: 'Visual analytic waveforms must cite TinySA SignalLab' });
  if (descriptor.qualification !== 'visual' && descriptor.source.organization === 'TinySA SignalLab') context.addIssue({ code: 'custom', path: ['source', 'organization'], message: 'Standards or conformance-qualified waveforms require an external standards organization' });
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
