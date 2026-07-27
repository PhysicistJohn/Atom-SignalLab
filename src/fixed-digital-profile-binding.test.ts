import { describe, expect, it } from 'vitest';
import { waveformDescriptor } from './catalog.js';
import { synthesizeAnalyticComplexIq } from './complex-iq.js';
import type { SynthesizedSignalProfile } from './contracts.js';
import {
  FIXED_DIGITAL_PROFILE_BINDINGS,
  fixedDigitalProfileBinding,
  isFixedDigitalProfile,
} from './fixed-digital-profile-binding.js';

describe('fixed digital profile acquisition bindings', () => {
  it('covers exactly 31 content-bound catalog profiles at their published center and geometry', () => {
    const entries = Object.entries(FIXED_DIGITAL_PROFILE_BINDINGS);
    expect(entries).toHaveLength(31);
    for (const [profileValue, binding] of entries) {
      const profile = profileValue as SynthesizedSignalProfile;
      expect(isFixedDigitalProfile(profile)).toBe(true);
      if (!isFixedDigitalProfile(profile)) throw new Error(`${profile} is not fixed`);
      expect(fixedDigitalProfileBinding(profile)).toEqual(binding);
      const descriptor = waveformDescriptor(profile);
      expect(descriptor.centerHz)
        .toBe(binding.profileReferenceCenterHz - binding.nativeCarrierOffsetHz);
      expect(descriptor.qualification)
        .toBe('independently-verified-digital-baseband');
      expect(descriptor.assetSha256)
        .toBe(descriptor.governance.digitalQualificationEvidence?.artifact.sha256);
    }
  });

  it('synthesizes every fixed profile only at its exact digital geometry', { timeout: 30_000 }, () => {
    for (const [profileValue, binding] of Object.entries(
      FIXED_DIGITAL_PROFILE_BINDINGS,
    )) {
      const profile = profileValue as SynthesizedSignalProfile;
      const input = {
        profile,
        sampleRateHz: binding.nativeSampleRateHz,
        bandwidthHz: binding.signalBandwidthHz,
        sampleCount: 257,
        startSampleIndex: 0,
      } as const;
      const bytes = synthesizeAnalyticComplexIq(input);
      expect(bytes.byteLength).toBe(257 * 8);
      expect(() => synthesizeAnalyticComplexIq({
        ...input,
        sampleRateHz: binding.nativeSampleRateHz + 1,
      })).toThrow(/requires/i);
      expect(() => synthesizeAnalyticComplexIq({
        ...input,
        bandwidthHz: binding.signalBandwidthHz - 1,
      })).toThrow(/requires/i);
    }
  });
});
