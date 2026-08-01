import { describe, expect, it } from 'vitest';
import {
  MAX_MEASUREMENT_FREQUENCY_HZ,
  synthesizedSignalProfileSchema,
  type ReplayChannelConfiguration,
} from './contracts.js';
import {
  NR_N78_30_KHZ_RASTER_CENTER_HZ,
  NR_N78_30_KHZ_RASTER_NREF,
} from './canonical-timing.js';
import {
  canonicalClassificationScenario,
  synthesizeCanonicalObservation,
} from './classification-corpus.js';
import {
  CANONIZED_KNOWN_SCENARIOS,
  CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
  CANONIZED_REPLAY_PROFILE_SCENARIOS,
  DEFAULT_REPLAY_CHANNEL,
  requireConformanceValidated,
  requireDigitallyQualified,
  suggestedAnalyzerRange,
  synthesizeCanonizedKnownSpectrum,
  synthesizeCanonizedKnownEnvelope,
  synthesizeSpectrum,
  synthesizeZeroSpan,
  waveformCatalog,
  waveformDescriptor,
} from './waveforms.js';

describe('qualified waveform replay engine', () => {
  it('publishes a closed catalog with source clauses and refuses unvalidated conformance claims', () => {
    expect(waveformCatalog.map((entry) => entry.id)).toEqual(synthesizedSignalProfileSchema.options);
    expect(waveformCatalog).toHaveLength(44);
    expect(countFamilies(waveformCatalog)).toEqual({ tone: 1, analog: 2, reference: 5, geran: 7, 'e-utra': 11, nr: 7, wlan: 7, bluetooth: 4 });
    for (const descriptor of waveformCatalog) {
      expect(descriptor.source.references.every((reference) => /^https:\/\//.test(reference.url))).toBe(true);
      expect(descriptor.recommendedSpanHz).toBeGreaterThanOrEqual(descriptor.occupiedBandwidthHz);
    }
    expect(waveformDescriptor('lte-band3-fdd-20m').projection.duplex).toBe('fdd');
    expect(waveformDescriptor('lte-band38-tdd-10m').projection.duplex).toBe('tdd');
    expect(waveformDescriptor('nr-n3-fdd-20m').projection.duplex).toBe('fdd');
    expect(waveformDescriptor('nr-n78-tdd-100m').projection.duplex).toBe('tdd');
    for (const profile of ['lte-etm1.1', 'lte-etm3.1', 'lte-etm3.1a', 'lte-etm3.1b'] as const) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor).toMatchObject({
        centerHz: 1_840_000_000,
        occupiedBandwidthHz: 9_000_000,
        projection: { allocation: 'full', timing: 'frame', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 50 },
      });
      expect(descriptor.source.references.map((reference) => reference.specification))
        .toEqual(['TS 36.141', 'TS 36.104', 'TS 36.211', 'TS 36.212']);
      expect(descriptor.qualification).toBe('independently-verified-digital-baseband');
      expect(descriptor.assetSha256).toBe(descriptor.governance.digitalQualificationEvidence?.artifact.sha256);
    }
    for (const profile of ['nr-fr1-tm1.1', 'nr-fr1-tm3.1', 'nr-fr1-tm3.1a', 'nr-fr1-tm3.1b'] as const) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor).toMatchObject({
        centerHz: 1_842_500_000,
        occupiedBandwidthHz: 19_080_000,
        projection: { allocation: 'full', timing: 'frame', duplex: 'fdd', subcarrierSpacingHz: 15_000, nominalResourceBlocks: 106 },
      });
      expect(descriptor.source.references.map((reference) => reference.specification))
        .toEqual(['TS 38.141-1', 'TS 38.104', 'TS 38.211', 'TS 38.214']);
      expect(descriptor.source.references[1]?.clause).toMatch(/5\.2-1.*5\.3\.2-1.*5\.3\.5-1.*5\.4\.2\.3-1.*n3 FDD.*106 RB.*100 kHz channel raster/i);
      expect(descriptor.qualification).toBe(
        'independently-verified-digital-baseband',
      );
      expect(descriptor.assetSha256).toBe(
        descriptor.governance.digitalQualificationEvidence?.artifact.sha256,
      );
    }
    expect(waveformDescriptor('bluetooth-classic-connected')).toMatchObject({
      family: 'bluetooth',
      qualification: 'independently-verified-digital-baseband',
    });
    expect(waveformDescriptor('bluetooth-le-advertising').qualification)
      .toBe('independently-verified-digital-baseband');
    expect(waveformDescriptor('bluetooth-le-advertising').disclosure).toMatch(/observable-class equivalence/i);
    expect(waveformDescriptor('lte-band38-tdd-10m').disclosure).toMatch(/only DwPTS is downlink-active/i);
    expect(waveformDescriptor('lte-band38-tdd-10m').source.references[1]?.clause).toMatch(/special-subframe configuration 7/i);
    expect(waveformDescriptor('gsm-normal-burst').source.references.map((reference) => reference.specification))
      .toEqual(['TS 45.004', 'TS 45.002', 'TS 45.003']);
    expect(waveformDescriptor('cw').disclosure)
      .toMatch(/mathematical line.*per-observation receiver RBW.*2 kHz.*nominal display-support floor.*not the receiver RBW.*rendered spectral width varies/i);
    expect(waveformDescriptor('am').disclosure)
      .toMatch(/52 kHz.*50 kHz separation.*outer sideband lines.*nominal 2 kHz display-support floor.*not the per-observation receiver RBW.*rendered line widths vary/i);
    expect(waveformDescriptor('fm').disclosure)
      .toMatch(/200 kHz.*Carson.*not exact.*Bessel series.*higher-order energy.*n = ±10.*amplitude threshold.*per-observation receiver RBW.*not bounded/i);
    expect(waveformDescriptor('gsm-900-loaded-bcch').disclosure)
      .toMatch(/content-addressed.*TS0.*four fixed GMSK xCCH normal bursts.*TS1 through TS7.*exact TS 45\.002 dummy burst.*not a complete BCCH 51-multiframe.*not calibrated RF.*no protocol.*likelihood/i);
    expect(waveformDescriptor('gsm-normal-burst').source.references.map((reference) => reference.revision))
      .toEqual(['19.0.0', '19.0.0', '19.0.0']);
    for (const [profile, modulationClause, symbolRate, burstClause, rateLabel] of [
      ['gsm-normal-burst', '2', '1 625/6', '5.2.3.1', 'normal'],
      ['gsm-qpsk-higher-symbol-rate-burst', '5', '325', '5.2.3a', 'higher-symbol-rate'],
      ['gsm-aqpsk-normal-burst', '6', '1 625/6', '5.2.3.2', 'normal'],
      ['gsm-8psk-normal-burst', '3', '1 625/6', '5.2.3.3', 'normal'],
      ['gsm-16qam-higher-symbol-rate-burst', '5', '325', '5.2.3a', 'higher-symbol-rate'],
      ['gsm-32qam-higher-symbol-rate-burst', '5', '325', '5.2.3a', 'higher-symbol-rate'],
    ] as const) {
      expect(waveformDescriptor(profile).source.references[0]?.clause)
        .toContain(`Clause ${modulationClause}`);
      expect(waveformDescriptor(profile).source.references[0]?.clause)
        .toContain(`${symbolRate} ksymb/s`);
      expect(waveformDescriptor(profile).source.references[1]?.clause)
        .toContain(burstClause);
      expect(waveformDescriptor(profile).label).toContain(`${rateLabel} burst`);
      expect(waveformDescriptor(profile).model).toContain(`${rateLabel} burst`);
    }
    expect(waveformDescriptor('gsm-normal-burst').source.references[2]?.clause)
      .toMatch(/fixed xCCH channel coding.*interleaving.*burst mapping/i);
    expect(waveformDescriptor('gsm-normal-burst').disclosure)
      .toMatch(/not calibrated RF.*TS 45\.005 conformance evidence/i);
    expect(synthesizedSignalProfileSchema.options.some((profile) =>
      /gsm-(?:qpsk|16qam|32qam)-normal-burst/.test(profile))).toBe(false);
    expect(waveformDescriptor('lte-ntm')).toMatchObject({
      label: 'LTE N-TM',
      projection: { subcarrierSpacingHz: 15_000, nominalResourceBlocks: 1 },
    });
    expect(waveformDescriptor('lte-ntm').model)
      .toMatch(/exact 180 kHz fixed N-TM frame/i);
    expect(waveformDescriptor('lte-ntm').disclosure)
      .toMatch(/exact cf32le clean cyclic replay.*guard-band\/in-band composite placement.*RF conformance.*product certification.*excluded/i);
    for (const [profile, clause, placement] of [
      ['lte-nbiot-guard-isolated-component', '6.1.5', 'guard-band'],
      ['lte-nbiot-inband-isolated-component', '6.1.6', 'in-band'],
    ] as const) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor.label).toMatch(/isolated.*NB-IoT component/i);
      expect(descriptor.source.references[0]?.clause).toContain(clause);
      expect(descriptor.source.references[0]?.clause).toContain(`${placement} placement`);
      expect(descriptor.disclosure)
        .toMatch(/E-TM1\.1 host.*absent.*complete.*not claimed/i);
      expect(descriptor.projection.subcarrierSpacingHz).toBe(15_000);
    }
    const nrNarrowbandComponent = waveformDescriptor('nr-nbiot-inband-isolated-component');
    expect(nrNarrowbandComponent.source.references.map((reference) => reference.specification))
      .toEqual(['TS 38.141-1', 'TS 38.104', 'TS 36.141', 'TS 36.211']);
    expect(nrNarrowbandComponent.source.references[0]?.clause)
      .toMatch(/4\.9\.2\.2\.9.*NR-FR1-TM1\.1.*eligible NR RB punctured.*power allocation/i);
    expect(nrNarrowbandComponent.source.references[1]?.clause)
      .toMatch(/5\.4\.2\.1-1.*5\.4\.2\.3-1.*NREF 633334/i);
    expect(nrNarrowbandComponent.source.references[2]?.clause)
      .toMatch(/6\.1\.3.*6\.1\.4\.1 through 6\.1\.4\.5.*NRS.*NPBCH.*NPDCCH.*NPDSCH/i);
    expect(nrNarrowbandComponent.source.references[3]?.clause)
      .toMatch(/6\.2\.3.*10\.2\.3 through 10\.2\.8.*12 subcarriers.*15 kHz.*NPBCH.*NPDCCH.*NPDSCH/i);
    expect(nrNarrowbandComponent.disclosure)
      .toMatch(/NR-FR1-TM1\.1 host.*absent.*complete.*NR-N-TM composite.*not claimed/i);
    expect(nrNarrowbandComponent.family).toBe('e-utra');
    expect(nrNarrowbandComponent.projection.subcarrierSpacingHz).toBe(15_000);
    expect(synthesizedSignalProfileSchema.options)
      .not.toEqual(expect.arrayContaining(['lte-ntm-guard', 'lte-ntm-inband', 'nr-ntm']));
    for (const profile of ['wifi6-he-su', 'wifi6-he-er-su', 'wifi6-he-mu'] as const) {
      expect(waveformDescriptor(profile).source.references[0]?.clause).toMatch(/^Clause 27:/);
    }
    expect(waveformDescriptor('wifi6-he-tb').source.references[0]?.clause)
      .toMatch(/^Clauses 26 and 27:.*Basic Trigger.*HE-TB PPDU/i);
    expect(waveformDescriptor('wifi6-he-tb')).toMatchObject({
      label: 'Wi-Fi 6 HE TB fixed Trigger/PPDU pair',
      occupiedBandwidthHz: 106 * 78_125,
      qualification: 'independently-verified-digital-baseband',
    });
    expect(waveformDescriptor('wifi6-he-tb').model).toMatch(/one-STA HE TB PPDU.*right 106-tone RU/i);
    for (const [profile, toneCount] of [
      ['wifi6-he-su', 242],
      ['wifi6-he-er-su', 106],
      ['wifi6-he-mu', 242],
      ['wifi6-he-tb', 106],
    ] as const) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor.occupiedBandwidthHz).toBe(toneCount * 78_125);
      expect(descriptor.disclosure)
        .toMatch(/Content-addressed complete fixed.*78\.125 kHz.*not measured or regulatory occupied bandwidth/i);
      expect(descriptor.qualification).toBe('independently-verified-digital-baseband');
      expect(descriptor.assetSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    for (const [profile, width, exactScope] of [
      ['wifi-hr-dsss-11m', '22 MHz', '11 Mchip/s ideal complex-chip interface'],
      ['wifi-ofdm-20m', '16.6 MHz', '6 Mb/s ERP-OFDM ACK PPDU'],
    ] as const) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor.model).toContain(exactScope);
      expect(descriptor.disclosure)
        .toMatch(/seeded CSMA-like.*not IEEE 802\.11 MAC behavior or protocol likelihood/i);
      expect(descriptor.disclosure).toContain(width);
      expect(descriptor.disclosure).toMatch(/exact clean complex-I\/Q lane.*content-addressed complete/i);
      expect(descriptor.qualification).toBe('independently-verified-digital-baseband');
      expect(descriptor.assetSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(waveformDescriptor('bluetooth-classic-connected')).toMatchObject({
      label: 'Bluetooth BR DH1 fixed packet vector',
      projection: { allocation: 'narrowband', modulation: 'br-gfsk', timing: 'classic-slots' },
    });
    expect(waveformDescriptor('bluetooth-classic-connected').disclosure)
      .toMatch(/exact complex-I\/Q lane.*Basic Rate DH1 packet.*LAP 0x000000.*UAP 0x47.*CLK6-1 0x3f.*HEC 0x06.*CRC octets 37 6c.*whitening.*rate-1\/3 header repetition.*625 us.*RF channel 8.*80 Msamples\/s.*BT=0\.5.*separately structured digital oracle.*does not synthesize EDR.*not Bluetooth SIG RF-PHY or product qualification.*scalar analyzer renderer.*79-center observable projection.*79 MHz aggregate field.*not this packet's instantaneous occupied bandwidth/i);
    expect(waveformDescriptor('nr-n78-tdd-100m').disclosure)
      .toMatch(/NR-FR1-TM1\.1.*prescribed 5 ms TDD pattern.*seven complete downlink slots.*six downlink and four uplink symbols.*two complete uplink slots/i);
    expect(waveformDescriptor('nr-n78-tdd-100m')).toMatchObject({
      centerHz: NR_N78_30_KHZ_RASTER_CENTER_HZ,
    });
    expect(waveformDescriptor('nr-n78-tdd-100m').model)
      .toContain(`NREF ${NR_N78_30_KHZ_RASTER_NREF}`);
    expect(waveformDescriptor('nr-n78-tdd-100m').disclosure)
      .toMatch(/3500010000 Hz.*30 kHz-raster NREF 633334/i);
    expect(waveformDescriptor('nr-n78-tdd-100m').source.references.map((reference) => reference.specification))
      .toEqual(['TS 38.104', 'TS 38.141-1', 'TS 38.211', 'TS 38.214', 'TS 38.331', 'TS 38.213']);
    expect(waveformDescriptor('bluetooth-le-advertising')).toMatchObject({
      label: 'Bluetooth LE 1M ADV_NONCONN_IND fixed packet vector',
      projection: { allocation: 'narrowband', modulation: 'ble-1m', timing: 'advertising-events' },
    });
    expect(waveformDescriptor('bluetooth-le-advertising').disclosure)
      .toMatch(/exact complex-I\/Q lane.*Core 6\.3.*LE 1M.*ADV_NONCONN_IND.*AdvA C1:A2:A3:A4:A5:A6.*AdvData 01 02 03.*0x8E89BED6.*CRCInit 0x555555.*channel 38.*152 us.*80 Msamples\/s.*BT=0\.5.*separately structured digital oracle.*No unverified event recurrence.*not Bluetooth SIG RF-PHY or product qualification.*scalar analyzer renderer.*80 MHz aggregate field.*not this packet's instantaneous occupied bandwidth/i);
    expect(() => requireConformanceValidated('lte-etm1.1')).toThrow(/not installed/i);
    expect(requireDigitallyQualified('lte-etm1.1').assetSha256).toBe(
      waveformDescriptor('lte-etm1.1').governance.digitalQualificationEvidence?.artifact.sha256,
    );
    expect(requireDigitallyQualified('lte-etm3.1b').assetSha256).toBe(
      waveformDescriptor('lte-etm3.1b').governance.digitalQualificationEvidence?.artifact.sha256,
    );
    expect(synthesizedSignalProfileSchema.options).not.toEqual(expect.arrayContaining([
      'lte-etm1.2', 'lte-etm2', 'lte-etm2a', 'lte-etm2b',
      'lte-setm2-1', 'lte-setm2a-1', 'lte-setm2-2', 'lte-setm2a-2',
      'lte-setm3.1-1', 'lte-setm3.1a-1', 'lte-setm3.1-2', 'lte-setm3.1a-2',
      'lte-etm3.2', 'lte-etm3.3', 'nr-fr1-tm1.2', 'nr-fr1-tm2', 'nr-fr1-tm2a', 'nr-fr1-tm2b',
      'nr-fr1-tm3.2', 'nr-fr1-tm3.3', 'nr-fr1-tm1.1-sbfd-du',
    ]));
  });

  it('produces seeded AWGN-derived frames that are repeatable and evolve by sweep', () => {
    const input = { profile: 'cw' as const, startHz: 200_000_000, stopHz: 202_000_000, points: 450, sweepIndex: 4, channel: DEFAULT_REPLAY_CHANNEL };
    const first = synthesizeSpectrum(input);
    const duplicate = synthesizeSpectrum(input);
    const next = synthesizeSpectrum({ ...input, sweepIndex: 5 });
    expect(duplicate).toEqual(first);
    expect(next).not.toEqual(first);
    expect(average(first)).toBeGreaterThan(-112);
    expect(average(first)).toBeLessThan(-103);
    expect(Math.max(...first) - Math.min(...first)).toBeGreaterThan(6);
  });

  it('adds reproducible frequency-selective Rayleigh fades rather than relabeling AWGN', () => {
    const descriptor = waveformDescriptor('lte-etm1.1');
    const range = suggestedAnalyzerRange(descriptor);
    const awgn = synthesizeSpectrum({ profile: descriptor.id, ...range, points: 450, sweepIndex: 7, channel: { ...DEFAULT_REPLAY_CHANNEL, noiseFloorDbm: -125 } });
    const rayleighChannel: ReplayChannelConfiguration = { ...DEFAULT_REPLAY_CHANNEL, model: 'rayleigh', noiseFloorDbm: -125 };
    const rayleigh = synthesizeSpectrum({ profile: descriptor.id, ...range, points: 450, sweepIndex: 7, channel: rayleighChannel });
    const occupied = rayleigh.filter((_value, index) => index > 110 && index < 340);
    const awgnOccupied = awgn.filter((_value, index) => index > 110 && index < 340);
    expect(standardDeviation(occupied)).toBeGreaterThan(standardDeviation(awgnOccupied) + 1);
    expect(Math.min(...occupied)).toBeLessThan(Math.min(...awgnOccupied) - 3);
    expect(synthesizeSpectrum({ profile: descriptor.id, ...range, points: 450, sweepIndex: 7, channel: rayleighChannel })).toEqual(rayleigh);
  });

  it('uses the exact fitted canonized source for every public observable profile', () => {
    for (const [profile, scenarioId] of Object.entries(CANONIZED_REPLAY_PROFILE_SCENARIOS)) {
      if (!scenarioId) continue;
      const descriptor = waveformDescriptor(profile as keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS);
      const declared = CANONIZED_KNOWN_SCENARIOS[scenarioId];
      expect(descriptor).toMatchObject({
        centerHz: declared.centerHz,
        occupiedBandwidthHz: declared.occupiedBandwidthHz,
        recommendedSpanHz: declared.recommendedSpanHz,
      });
      expect(descriptor.source.organization)
        .toBe(canonicalClassificationScenario(scenarioId).source.organization);
      expect(descriptor.source.references.length).toBeGreaterThan(0);
      const range = suggestedAnalyzerRange(descriptor);
      const points = 450;
      const sweepIndex = 17;
      const live = synthesizeSpectrum({ profile: descriptor.id, ...range, points, sweepIndex, channel: DEFAULT_REPLAY_CHANNEL });
      const expected = synthesizeCanonizedKnownSpectrum({
        scenarioId,
        ...range,
        points,
        actualRbwHz: (range.stopHz - range.startHz) / (points - 1),
        sweepTimeSeconds: 0.05,
        noiseFloorDbm: DEFAULT_REPLAY_CHANNEL.noiseFloorDbm,
        snrDb: 32,
        seed: DEFAULT_REPLAY_CHANNEL.seed,
        lookIndex: sweepIndex,
        centerHz: descriptor.centerHz,
      });
      expect(live, profile).toEqual(expected);
    }
  });

  it('keeps the FM-adjacent channel floor at the AWGN floor instead of drawing a false occupied pedestal', () => {
    const descriptor = waveformDescriptor('fm');
    const range = suggestedAnalyzerRange(descriptor);
    const values = synthesizeSpectrum({ profile: 'fm', ...range, points: 1001, sweepIndex: 8, channel: DEFAULT_REPLAY_CHANNEL });
    const frequencies = values.map((_value, index) => range.startHz + (range.stopHz - range.startHz) * index / 1000);
    const adjacent = values.filter((_value, index) => {
      const offset = Math.abs(frequencies[index]! - descriptor.centerHz);
      const sidebandDistance = Math.min(...[25_000, 50_000, 75_000].map((line) => Math.abs(offset - line)));
      return offset < 105_000 && sidebandDistance > 5_000;
    });
    const outside = values.filter((_value, index) => {
      const offset = Math.abs(frequencies[index]! - descriptor.centerHz);
      return offset > 145_000 && offset < 225_000;
    });
    expect(Math.abs(median(adjacent) - median(outside))).toBeLessThan(4);
  });

  it('synthesizes every closed visual, standards, and observable profile with finite, correctly sized output', () => {
    for (const descriptor of waveformCatalog) {
      const range = suggestedAnalyzerRange(descriptor);
      const values = synthesizeSpectrum({ profile: descriptor.id, ...range, points: 121, sweepIndex: 2, channel: DEFAULT_REPLAY_CHANNEL });
      expect(values).toHaveLength(121);
      expect(values.every(Number.isFinite), descriptor.id).toBe(true);
    }
  });

  it('honors the bridge-advertised two-point spectrum and one-point detected-power minima', () => {
    for (const profile of Object.keys(CANONIZED_REPLAY_PROFILE_SCENARIOS) as Array<keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS>) {
      const descriptor = waveformDescriptor(profile);
      const range = suggestedAnalyzerRange(descriptor);
      const spectrum = synthesizeSpectrum({ profile, ...range, points: 2, sweepIndex: 0, channel: DEFAULT_REPLAY_CHANNEL });
      const envelope = synthesizeZeroSpan({
        profile,
        tuneFrequencyHz: descriptor.centerHz,
        points: 1,
        sweepIndex: 0,
        samplePeriodSeconds: 1 / 9_000,
        channel: DEFAULT_REPLAY_CHANNEL,
      });
      expect(spectrum).toHaveLength(2);
      expect(spectrum.every(Number.isFinite)).toBe(true);
      expect(envelope).toHaveLength(1);
      expect(envelope.every(Number.isFinite)).toBe(true);
    }
  });

  it('uses the admitted detected-power sample period instead of a hidden fixed clock', () => {
    const descriptor = waveformDescriptor('am');
    const samplePeriodSeconds = 1 / 3_200;
    const points = 450;
    const sweepIndex = 9;
    const live = synthesizeZeroSpan({
      profile: 'am', tuneFrequencyHz: descriptor.centerHz, points, sweepIndex, samplePeriodSeconds, channel: DEFAULT_REPLAY_CHANNEL,
    });
    const expected = synthesizeCanonizedKnownEnvelope({
      scenarioId: 'am-dsb-25k', points, samplePeriodSeconds,
      synthesisFilterWidthHz: CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
      noiseFloorDbm: DEFAULT_REPLAY_CHANNEL.noiseFloorDbm, snrDb: 32,
      seed: DEFAULT_REPLAY_CHANNEL.seed, lookIndex: sweepIndex,
      tuneFrequencyHz: descriptor.centerHz, centerHz: descriptor.centerHz,
    });
    expect(live).toEqual(expected);
    expect(live).not.toEqual(synthesizeZeroSpan({
      profile: 'am', tuneFrequencyHz: descriptor.centerHz, points, sweepIndex, samplePeriodSeconds: 1 / 9_000, channel: DEFAULT_REPLAY_CHANNEL,
    }));
  });

  it('uses the exact corpus source and explicit synthesis filter for every public detected-power replay', () => {
    const points = 450;
    const samplePeriodSeconds = 1 / 9_000;
    const lookIndex = 17;
    for (const [profile, scenarioId] of Object.entries(CANONIZED_REPLAY_PROFILE_SCENARIOS)) {
      if (!scenarioId) continue;
      const descriptor = waveformDescriptor(profile as keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS);
      const range = suggestedAnalyzerRange(descriptor);
      const actualRbwHz = (range.stopHz - range.startHz) / (points - 1);
      const live = synthesizeZeroSpan({
        profile: descriptor.id,
        tuneFrequencyHz: descriptor.centerHz,
        points,
        sweepIndex: lookIndex,
        samplePeriodSeconds,
        channel: DEFAULT_REPLAY_CHANNEL,
      });
      const corpus = synthesizeCanonicalObservation(scenarioId, {
        lookIndex,
        points,
        actualRbwHz,
        zeroSpanPoints: points,
        zeroSpanSamplePeriodSeconds: samplePeriodSeconds,
        zeroSpanFrequencyHz: descriptor.centerHz,
        detectedPowerSynthesisFilterWidthHz: CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ,
        noiseFloorDbm: DEFAULT_REPLAY_CHANNEL.noiseFloorDbm,
        snrDb: 32,
        seed: DEFAULT_REPLAY_CHANNEL.seed,
      });
      expect(corpus.actualRbwHz, profile).toBe(actualRbwHz);
      expect(corpus.detectedPowerActualRbwHz, profile).toBeNull();
      expect(corpus.detectedPowerSynthesisFilterWidthHz, profile)
        .toBe(CANONIZED_REPLAY_DETECTED_POWER_SYNTHESIS_FILTER_WIDTH_HZ);
      expect(live, profile).toEqual(corpus.zeroSpanPowerDbm);
    }
  });

  it('receiver-filters every canonized public envelope at the exact requested integer-Hz tune', () => {
    for (const [profile, scenarioId] of Object.entries(CANONIZED_REPLAY_PROFILE_SCENARIOS)) {
      if (!scenarioId) continue;
      const descriptor = waveformDescriptor(profile as keyof typeof CANONIZED_REPLAY_PROFILE_SCENARIOS);
      // LE content lives on the primary advertising channels, not at the span
      // centre: tune both LE profiles at channel 38 (2426 MHz), which every
      // advertising event transmits.
      const tuneFrequencyHz = profile === 'bluetooth-le-advertising'
        || profile === 'bluetooth-le-advertising-longdwell'
        ? 2_426_000_000
        : descriptor.centerHz;
      const input = {
        profile: descriptor.id,
        points: 1_024,
        sweepIndex: 0,
        samplePeriodSeconds: 1 / 9_000,
        channel: DEFAULT_REPLAY_CHANNEL,
      } as const;
      const tuned = synthesizeZeroSpan({ ...input, tuneFrequencyHz });
      const outOfBand = synthesizeZeroSpan({ ...input, tuneFrequencyHz: MAX_MEASUREMENT_FREQUENCY_HZ });
      expect(tuned, profile).not.toEqual(outOfBand);
      expect(Math.max(...tuned), profile).toBeGreaterThan(Math.max(...outOfBand) + 8);
    }
  });

  it('uses an explicit descriptor-bounded tune for legacy visual profiles and rejects untunable survey zero span', () => {
    const descriptor = waveformDescriptor('lte-etm3.1');
    const sweepIndex = 0;
    const input = {
      profile: descriptor.id,
      points: 256,
      sweepIndex,
      samplePeriodSeconds: 1 / 9_000,
      channel: DEFAULT_REPLAY_CHANNEL,
    } as const;
    const nominalCenter = synthesizeZeroSpan({ ...input, tuneFrequencyHz: descriptor.centerHz });
    const outsideGrid = synthesizeZeroSpan({ ...input, tuneFrequencyHz: descriptor.centerHz + 14_000_000 });
    expect(nominalCenter).not.toEqual(outsideGrid);
    expect(Math.max(...nominalCenter)).toBeGreaterThan(Math.max(...outsideGrid) + 8);
    expect(() => synthesizeZeroSpan({ ...input, profile: 'survey', tuneFrequencyHz: descriptor.centerHz })).toThrow(/no absolute-frequency signal model/i);
    expect(() => synthesizeZeroSpan({ ...input, tuneFrequencyHz: 98_000_000.5 })).toThrow(/safe-integer tune/i);
  });

  it('renders the retained cellular test-model surface only as full-grid scalar projections', () => {
    for (const profile of [
      'lte-etm1.1', 'lte-etm3.1', 'lte-etm3.1a', 'lte-etm3.1b',
      'nr-fr1-tm1.1', 'nr-fr1-tm3.1', 'nr-fr1-tm3.1a', 'nr-fr1-tm3.1b',
    ] as const) {
      const descriptor = waveformDescriptor(profile);
      expect(descriptor.projection).toMatchObject({ allocation: 'full', timing: 'frame', duplex: 'fdd' });
      if (profile.startsWith('lte-')) {
        expect(descriptor.disclosure).toMatch(/content-addressed.*digital.*9 MHz.*50 × 12 × 15 kHz RB-grid span/i);
      } else {
        expect(descriptor.disclosure).toMatch(/nominal RB-grid span.*not.*channel bandwidth.*99%-power.*regulatory occupied bandwidth/i);
      }
      const range = suggestedAnalyzerRange(descriptor);
      const spectrum = synthesizeSpectrum({ profile, ...range, points: 450, sweepIndex: 3, channel: DEFAULT_REPLAY_CHANNEL });
      expect(spectrum.filter((value) => value > -75).length, profile).toBeGreaterThan(150);
    }
  });

  it('projects burst timing into zero-span replays for GSM and Wi-Fi', () => {
    const gsm = synthesizeZeroSpan({ profile: 'gsm-normal-burst', tuneFrequencyHz: waveformDescriptor('gsm-normal-burst').centerHz, points: 208, sweepIndex: 0, samplePeriodSeconds: 1 / 9_000, channel: DEFAULT_REPLAY_CHANNEL });
    const wifi = synthesizeZeroSpan({ profile: 'wifi6-he-su', tuneFrequencyHz: waveformDescriptor('wifi6-he-su').centerHz, points: 178, sweepIndex: 0, samplePeriodSeconds: 1 / 9_000, channel: DEFAULT_REPLAY_CHANNEL });
    expect(gsm.filter((value) => value > -80).length / gsm.length).toBeCloseTo(1 / 8, 1);
    expect(wifi.some((value) => value > -70)).toBe(true);
    expect(wifi.some((value) => value < -100)).toBe(true);
  });
});

function average(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }
function standardDeviation(values: readonly number[]): number {
  const mean = average(values);
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}
function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) throw new Error('Median requires samples');
  return ordered[Math.floor(ordered.length / 2)]!;
}
function countFamilies(catalog: typeof waveformCatalog): Record<string, number> {
  return catalog.reduce<Record<string, number>>((counts, descriptor) => ({ ...counts, [descriptor.family]: (counts[descriptor.family] ?? 0) + 1 }), {});
}
