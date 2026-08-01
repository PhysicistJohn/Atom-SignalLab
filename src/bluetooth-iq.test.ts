import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BLUETOOTH_ANALYTIC_IQ_ALIAS_FREE_MINIMUM_SAMPLE_RATE_HZ,
  BLUETOOTH_ANALYTIC_IQ_DISCLOSURE,
  BLUETOOTH_ANALYTIC_IQ_FORMAT,
  BLUETOOTH_ANALYTIC_IQ_MODELS,
  BLUETOOTH_ANALYTIC_IQ_PROFILES,
  BLUETOOTH_ANALYTIC_IQ_QUALIFICATION,
  BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
  BLUETOOTH_BR_DH1_CORE_SAMPLE_UNWHITENED_HEADER_BITS,
  BLUETOOTH_BR_DH1_CORE_SAMPLE_UNWHITENED_PAYLOAD_BITS,
  BLUETOOTH_BR_DH1_FIXED_VECTOR,
  BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256,
  BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR,
  BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256,
  MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
  MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES,
  MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
  bluetoothBrCrcBits,
  bluetoothBrHecBits,
  bluetoothBrWhitenBits,
  bluetoothLeCrcBits,
  bluetoothLeWhitenBits,
  synthesizeBluetoothAnalyticSamples,
  type BluetoothAnalyticIqProfile,
} from './bluetooth-iq.js';
import { waveformCatalog } from './waveforms.js';

const SAMPLE_RATE_HZ = BLUETOOTH_ANALYTIC_IQ_ALIAS_FREE_MINIMUM_SAMPLE_RATE_HZ;
const SAMPLES_PER_SYMBOL = SAMPLE_RATE_HZ / 1_000_000;
const SEED = 407;

const OFFICIAL_BR_ACCESS_CODE_LAP_ZERO =
  '010101111110011100000100000111100011010000000000000000000000000011010101';
const OFFICIAL_BR_DH1_HEADER_DATA = '1100010010';
const OFFICIAL_BR_DH1_HEADER_WITH_HEC = '110001001001100000';
const OFFICIAL_BR_DH1_PAYLOAD_WITH_CRC =
  '0111010010000000010000001100000000100000101000001110110000110110';
const OFFICIAL_BR_WHITENING_FIRST_64 =
  '1110001110110001010010111110101010000101101111001110010101100110';

const OFFICIAL_LE_PDU =
  '0100001010010000011001011010010100100101110001010100010110000011100000000100000011000000';
const OFFICIAL_LE_CRC = '101101010010110111010111';
const OFFICIAL_LE_WHITENING_CHANNEL_38_FIRST_64 =
  '0110101110100011001000100000010010011010011110111000011111110001';
const OFFICIAL_LE_COMPLETE_PACKET =
  '01010101011010110111110110010001011100010010100100110011010001111010000110111111101111101100001001110010010110001110010100110101111101111111001110100101';

describe('Bluetooth fixed digital vectors and analytic GFSK projection', () => {
  it('covers every Bluetooth profile and discloses the exact digital / non-qualified RF boundary', () => {
    const catalogued = waveformCatalog
      .filter(({ family }) => family === 'bluetooth')
      .map(({ id }) => id);
    const fixedCatalogued = catalogued.filter(
      (id) => !id.endsWith('-longdwell'),
    );
    const longDwellCatalogued = catalogued.filter(
      (id) => id.endsWith('-longdwell'),
    );
    expect(BLUETOOTH_ANALYTIC_IQ_PROFILES).toEqual(fixedCatalogued);
    expect(Object.keys(BLUETOOTH_ANALYTIC_IQ_MODELS)).toEqual(fixedCatalogued);
    expect(longDwellCatalogued).toEqual([
      'bluetooth-classic-connected-longdwell',
      'bluetooth-le-advertising-longdwell',
    ]);
    expect(BLUETOOTH_ANALYTIC_IQ_FORMAT).toBe('interleaved-f32-iq');
    expect(BLUETOOTH_ANALYTIC_IQ_QUALIFICATION).toBe('standards-derived-engineering-projection');
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/packet fields, HEC\/CRC, whitening.*header FEC.*Core 6\.3 sample data/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/Basic Rate GFSK only \(not EDR\).*DH1.*625 us.*RF channel 8/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/LE 1M legacy ADV_NONCONN_IND.*channel 38/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/seed.*cannot alter either vector/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/not a calibrated RF emission.*RF-PHY qualification.*product qualification/i);
    expect(BLUETOOTH_ANALYTIC_IQ_DISCLOSURE).toMatch(/below 80 MHz.*alias projection/i);
  });

  it('constructs the fixed BR DH1 fields, HEC, CRC, whitening, and 1/3 header FEC', () => {
    const vector = BLUETOOTH_BR_DH1_FIXED_VECTOR;
    expect(vector).toMatchObject({
      packetType: 'DH1',
      encryption: false,
      lap: 0,
      uap: 0x47,
      clock6To1: 0x3f,
      channelIndex: 8,
      channelCenterHz: 2_410_000_000,
      slotDurationSeconds: 625e-6,
      packetDurationSeconds: 190e-6,
      inactiveTailSeconds: 435e-6,
      headerFec: 'rate-1/3 repetition',
      payloadFec: 'none (DH1)',
      payloadHeaderOctet: 0x2e,
      hec: 0x06,
      crcOctets: [0x37, 0x6c],
    });
    expect(bits(vector.accessCodeBits)).toBe(OFFICIAL_BR_ACCESS_CODE_LAP_ZERO);
    expect(bits(vector.headerDataBits)).toBe(OFFICIAL_BR_DH1_HEADER_DATA);
    expect(bits(vector.headerWithHecBits)).toBe(OFFICIAL_BR_DH1_HEADER_WITH_HEC);
    expect(bits(vector.payloadWithCrcBits)).toBe(OFFICIAL_BR_DH1_PAYLOAD_WITH_CRC);
    expect(BLUETOOTH_BR_DH1_CORE_SAMPLE_UNWHITENED_HEADER_BITS)
      .toBe(repeatThree(OFFICIAL_BR_DH1_HEADER_WITH_HEC));
    expect(BLUETOOTH_BR_DH1_CORE_SAMPLE_UNWHITENED_PAYLOAD_BITS)
      .toBe(OFFICIAL_BR_DH1_PAYLOAD_WITH_CRC);

    const whitenedHeader = deRepeatThree(vector.transmissionBits.slice(72, 126));
    const whitenedPayload = vector.transmissionBits.slice(126);
    const recovered = bluetoothBrWhitenBits(
      [...whitenedHeader, ...whitenedPayload],
      vector.clock6To1,
    );
    expect(bits(recovered.slice(0, 18))).toBe(OFFICIAL_BR_DH1_HEADER_WITH_HEC);
    expect(bits(recovered.slice(18))).toBe(OFFICIAL_BR_DH1_PAYLOAD_WITH_CRC);
    expect(vector.transmissionBits).toHaveLength(190);
    expect(Object.isFrozen(vector)).toBe(true);
    expect(Object.isFrozen(vector.transmissionBits)).toBe(true);
  });

  it('matches the independent BR Core sample vectors for HEC, CRC, and whitening', () => {
    expect(bits(bluetoothBrHecBits(bitArray('1100010010'), 0x47))).toBe('01100000');
    expect(bits(bluetoothBrCrcBits(
      bytesToLsbBits([0x4e, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]),
      0x47,
    ))).toBe(bits(bytesToLsbBits([0x6d, 0xd2])));
    expect(bits(bluetoothBrWhitenBits(new Array<number>(64).fill(0), 0x3f)))
      .toBe(OFFICIAL_BR_WHITENING_FIRST_64);
  });

  it('constructs the exact Core LE 1M ADV_NONCONN_IND complete packet', () => {
    const vector = BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR;
    expect(vector).toMatchObject({
      phy: 'LE 1M',
      pduType: 'ADV_NONCONN_IND',
      txAdd: 1,
      advA: 'C1:A2:A3:A4:A5:A6',
      advDataOctets: [0x01, 0x02, 0x03],
      channelIndex: 38,
      channelCenterHz: 2_426_000_000,
      eventStartSeconds: 0,
      eventDurationSeconds: 152e-6,
      accessAddress: 0x8e89bed6,
      crcInit: 0x555555,
    });
    expect(bits(vector.preambleBits)).toBe('01010101');
    expect(bits(vector.accessAddressBits)).toBe('01101011011111011001000101110001');
    expect(bits(vector.pduBits)).toBe(OFFICIAL_LE_PDU);
    expect(bits(vector.crcBits)).toBe(OFFICIAL_LE_CRC);
    expect(bits(vector.transmissionBits)).toBe(OFFICIAL_LE_COMPLETE_PACKET);
    expect(vector.transmissionBits).toHaveLength(152);

    const recovered = bluetoothLeWhitenBits(vector.whitenedPduAndCrcBits, 38);
    expect(bits(recovered)).toBe(OFFICIAL_LE_PDU + OFFICIAL_LE_CRC);
    expect(Object.isFrozen(vector)).toBe(true);
    expect(Object.isFrozen(vector.transmissionBits)).toBe(true);
  });

  it('matches the independent LE Core sample vectors for CRC and channel-38 whitening', () => {
    expect(bits(bluetoothLeCrcBits(bitArray(OFFICIAL_LE_PDU), 0x555555)))
      .toBe(OFFICIAL_LE_CRC);
    expect(bits(bluetoothLeWhitenBits(new Array<number>(64).fill(0), 38)))
      .toBe(OFFICIAL_LE_WHITENING_CHANNEL_38_FIRST_64);
  });

  it('pins both complete transmission-order vectors with explicit SHA-256 hashes', () => {
    expect(sha256Bits(BLUETOOTH_BR_DH1_FIXED_VECTOR.transmissionBits))
      .toBe(BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256);
    expect(BLUETOOTH_BR_DH1_FIXED_VECTOR.transmissionBitsSha256)
      .toBe(BLUETOOTH_BR_DH1_TRANSMISSION_BITS_SHA256);
    expect(sha256Bits(BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.transmissionBits))
      .toBe(BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256);
    expect(BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.transmissionBitsSha256)
      .toBe(BLUETOOTH_LE_ADV_NONCONN_IND_TRANSMISSION_BITS_SHA256);
  });

  it('pins fixed capture timing and the nominal BR and LE GFSK parameters', () => {
    expect(BLUETOOTH_ANALYTIC_IQ_MODELS['bluetooth-classic-connected']).toMatchObject({
      digitalValidation: 'official-sample-matched',
      schedule: 'one-fixed-dh1-packet-in-one-625us-slot',
      referenceCenterHz: BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
      channelIndex: 8,
      channelCenterHz: 2_410_000_000,
      slotSeconds: 625e-6,
      packetDurationSeconds: 190e-6,
      symbolRateHz: 1_000_000,
      frequencyDeviationHz: 160_000,
      modulationIndex: 0.32,
      gaussianBt: 0.5,
    });
    expect(BLUETOOTH_ANALYTIC_IQ_MODELS['bluetooth-le-advertising']).toMatchObject({
      digitalValidation: 'official-complete-packet-match',
      schedule: 'one-fixed-le-1m-adv-nonconn-ind-event',
      referenceCenterHz: BLUETOOTH_ANALYTIC_IQ_REFERENCE_CENTER_HZ,
      channelIndex: 38,
      channelCenterHz: 2_426_000_000,
      packetDurationSeconds: 152e-6,
      symbolRateHz: 1_000_000,
      frequencyDeviationHz: 250_000,
      modulationIndex: 0.5,
      gaussianBt: 0.5,
    });
  });

  it('is deterministic, seed-invariant, slice-independent, finite, and unit bounded', () => {
    for (const profile of BLUETOOTH_ANALYTIC_IQ_PROFILES) {
      const input = {
        profile,
        sampleRateHz: SAMPLE_RATE_HZ,
        sampleCount: 4_096,
        seed: SEED,
        startSampleIndex: 4_000,
      };
      const first = synthesizeBluetoothAnalyticSamples(input);
      expect(synthesizeBluetoothAnalyticSamples(input)).toEqual(first);
      expect(synthesizeBluetoothAnalyticSamples({ ...input, seed: SEED + 1 })).toEqual(first);
      expect(first).toHaveLength(input.sampleCount * 2);
      expectUnitBounded(first);

      const left = synthesizeBluetoothAnalyticSamples({ ...input, sampleCount: 2_048 });
      const right = synthesizeBluetoothAnalyticSamples({
        ...input,
        sampleCount: 2_048,
        startSampleIndex: input.startSampleIndex + 2_048,
      });
      expect(new Float32Array([...left, ...right])).toEqual(first);
    }
  });

  it('emits one BR packet followed by the exact inactive remainder of its 625 us slot', () => {
    const packetSamples = 190 * SAMPLES_PER_SYMBOL;
    const slotSamples = 625 * SAMPLES_PER_SYMBOL;
    expect(nonzeroSamples(activeWindow('bluetooth-classic-connected', 0, packetSamples)))
      .toBe(packetSamples);
    expect(nonzeroSamples(activeWindow(
      'bluetooth-classic-connected',
      packetSamples,
      slotSamples - packetSamples,
    ))).toBe(0);
    expect(nonzeroSamples(activeWindow('bluetooth-classic-connected', slotSamples, 64))).toBe(0);
    expect(Math.abs(meanInstantaneousFrequency(
      activeWindow('bluetooth-classic-connected', 4_000, 4_096),
      SAMPLE_RATE_HZ,
    ) - -31_000_000)).toBeLessThan(200_000);
  });

  it('emits one 152 us LE channel-38 event and no invented event recurrence', () => {
    const packetSamples = 152 * SAMPLES_PER_SYMBOL;
    expect(nonzeroSamples(activeWindow('bluetooth-le-advertising', 0, packetSamples)))
      .toBe(packetSamples);
    expect(nonzeroSamples(activeWindow('bluetooth-le-advertising', packetSamples, 64))).toBe(0);
    expect(nonzeroSamples(activeWindow('bluetooth-le-advertising', 20e-3 * SAMPLE_RATE_HZ, 64)))
      .toBe(0);
    expect(Math.abs(meanInstantaneousFrequency(
      activeWindow('bluetooth-le-advertising', 4_000, 4_096),
      SAMPLE_RATE_HZ,
    ) - -15_000_000)).toBeLessThan(300_000);
  });

  it('GFSK-demodulates every BR and LE symbol back to its fixed transmission bit', () => {
    for (const [profile, expectedBits, carrierOffsetHz] of [
      ['bluetooth-classic-connected', BLUETOOTH_BR_DH1_FIXED_VECTOR.transmissionBits, -31_000_000],
      ['bluetooth-le-advertising', BLUETOOTH_LE_ADV_NONCONN_IND_FIXED_VECTOR.transmissionBits, -15_000_000],
    ] as const) {
      const samples = activeWindow(profile, 0, expectedBits.length * SAMPLES_PER_SYMBOL);
      expect(demodulateGfskBits(samples, carrierOffsetHz)).toEqual(expectedBits);
    }
  });

  it('rejects invalid vectors, unsupported profiles, and synthesis geometry outside bounds', () => {
    expect(() => bluetoothBrHecBits([0, 1], 0x47)).toThrow(/exactly 10 bits/i);
    expect(() => bluetoothBrHecBits([...new Array<number>(9).fill(0), 2], 0x47))
      .toThrow(/only numeric zero and one/i);
    expect(() => bluetoothBrCrcBits([0], 0x100)).toThrow(/unsigned 8-bit/i);
    expect(() => bluetoothBrWhitenBits([0], 0x40)).toThrow(/unsigned 6-bit/i);
    expect(() => bluetoothLeCrcBits([0], 0x1_000000)).toThrow(/unsigned 24-bit/i);
    expect(() => bluetoothLeWhitenBits([0], 40)).toThrow(/channel index/i);

    const valid = {
      profile: 'bluetooth-classic-connected' as BluetoothAnalyticIqProfile,
      sampleRateHz: MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
      sampleCount: 1,
      seed: 1,
    };
    expect(() => synthesizeBluetoothAnalyticSamples(valid)).not.toThrow();
    expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, profile: 'wifi-ofdm-20m' }))
      .toThrow(/no Bluetooth analytic complex-baseband/i);
    for (const sampleRateHz of [
      MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ - 1,
      MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ + 1,
    ]) {
      expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, sampleRateHz }))
        .toThrow(/sample rate/i);
    }
    for (const sampleCount of [0, MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES + 1]) {
      expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, sampleCount }))
        .toThrow(/sample count/i);
    }
    for (const seed of [0, 0x1_0000_0000]) {
      expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, seed })).toThrow(/seed/i);
    }
    expect(() => synthesizeBluetoothAnalyticSamples({ ...valid, startSampleIndex: -1 }))
      .toThrow(/start sample/i);
    expect(() => synthesizeBluetoothAnalyticSamples({
      ...valid,
      startSampleIndex: MIN_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ * 60 + 1,
    })).toThrow(/start sample/i);
  });

  it('remains bounded at maximum sample count and rate', () => {
    const samples = synthesizeBluetoothAnalyticSamples({
      profile: 'bluetooth-classic-connected',
      sampleRateHz: MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLE_RATE_HZ,
      sampleCount: MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES,
      seed: 0xffff_ffff,
    });
    expect(samples).toHaveLength(MAX_BLUETOOTH_ANALYTIC_IQ_SAMPLES * 2);
    expectUnitBounded(samples);
  }, 15_000);
});

function activeWindow(
  profile: BluetoothAnalyticIqProfile,
  startSampleIndex: number,
  sampleCount: number,
  seed = SEED,
): Float32Array {
  return synthesizeBluetoothAnalyticSamples({
    profile,
    sampleRateHz: SAMPLE_RATE_HZ,
    sampleCount,
    seed,
    startSampleIndex,
  });
}

function bits(value: readonly number[]): string {
  return value.join('');
}

function bitArray(value: string): number[] {
  return [...value].map(Number);
}

function bytesToLsbBits(bytes: readonly number[]): number[] {
  return bytes.flatMap((byte) => (
    Array.from({ length: 8 }, (_unused, index) => (byte >>> index) & 1)
  ));
}

function repeatThree(value: string): string {
  return [...value].flatMap((bit) => [bit, bit, bit]).join('');
}

function deRepeatThree(encoded: readonly number[]): number[] {
  expect(encoded.length % 3).toBe(0);
  const result: number[] = [];
  for (let index = 0; index < encoded.length; index += 3) {
    expect(encoded.slice(index, index + 3)).toEqual([
      encoded[index], encoded[index], encoded[index],
    ]);
    result.push(encoded[index]!);
  }
  return result;
}

function sha256Bits(value: readonly number[]): string {
  return createHash('sha256').update(bits(value), 'utf8').digest('hex');
}

function nonzeroSamples(samples: Float32Array): number {
  let count = 0;
  for (let index = 0; index < samples.length; index += 2) {
    if (samples[index] !== 0 || samples[index + 1] !== 0) count += 1;
  }
  return count;
}

function meanInstantaneousFrequency(samples: Float32Array, sampleRateHz: number): number {
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < samples.length / 2 - 1; index += 1) {
    const inPhase = samples[index * 2]!;
    const quadrature = samples[index * 2 + 1]!;
    const nextInPhase = samples[index * 2 + 2]!;
    const nextQuadrature = samples[index * 2 + 3]!;
    real += inPhase * nextInPhase + quadrature * nextQuadrature;
    imaginary += inPhase * nextQuadrature - quadrature * nextInPhase;
  }
  return Math.atan2(imaginary, real) * sampleRateHz / (2 * Math.PI);
}

function demodulateGfskBits(samples: Float32Array, carrierOffsetHz: number): number[] {
  const result: number[] = [];
  for (let symbol = 0; symbol < samples.length / 2 / SAMPLES_PER_SYMBOL; symbol += 1) {
    const symbolSamples = samples.slice(
      symbol * SAMPLES_PER_SYMBOL * 2,
      (symbol + 1) * SAMPLES_PER_SYMBOL * 2,
    );
    const residual = meanInstantaneousFrequency(symbolSamples, SAMPLE_RATE_HZ) - carrierOffsetHz;
    result.push(residual >= 0 ? 1 : 0);
  }
  return result;
}

function expectUnitBounded(samples: Float32Array): void {
  for (let index = 0; index < samples.length; index += 2) {
    const inPhase = samples[index]!;
    const quadrature = samples[index + 1]!;
    expect(Number.isFinite(inPhase) && Number.isFinite(quadrature)).toBe(true);
    expect(Math.hypot(inPhase, quadrature)).toBeLessThanOrEqual(1);
  }
}
