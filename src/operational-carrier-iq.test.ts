import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LTE_RESOURCE_ELEMENT_KIND } from './lte-etm1-reference.js';
import { generateLteBand3Fdd20mReferenceFrame } from './lte-band3-fdd-20m-reference.js';
import { generateLteBand38Tdd10mReferenceFrame } from './lte-band38-tdd-10m-reference.js';
import { NR_RESOURCE_ELEMENT_KIND } from './nr-fr1-test-model-reference.js';
import { generateNrN3Fdd20mFrame } from './nr-n3-fdd-20m-reference.js';
import {
  NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND,
  generateNrN78Tdd100mFrame,
} from './nr-n78-tdd-100m-reference.js';
import {
  OPERATIONAL_CARRIER_CORPUS_PROFILES,
  buildOperationalCarrierCorpusFrame,
  synthesizeOperationalCarrierCorpusIq,
  type OperationalCarrierCorpusProfile,
} from './operational-carrier-iq.js';

const SEED = 20_260_731;
const INPUTS = {
  'lte-band3-fdd-20m': { sampleRateHz: 30_720_000, bandwidthHz: 20_000_000 },
  'lte-band38-tdd-10m': { sampleRateHz: 15_360_000, bandwidthHz: 10_000_000 },
  'nr-n3-fdd-20m': { sampleRateHz: 30_720_000, bandwidthHz: 20_000_000 },
  'nr-n78-tdd-100m': { sampleRateHz: 122_880_000, bandwidthHz: 100_000_000 },
} as const;

describe('corpus-only operational-carrier PDSCH variants', () => {
  it('changes only PDSCH resource elements while preserving every reference/scheduling element', () => {
    for (const profile of OPERATIONAL_CARRIER_CORPUS_PROFILES) {
      const baseline = referenceGrid(profile);
      const first = buildOperationalCarrierCorpusFrame({
        profile,
        contentSeed: SEED,
        contentRowIndex: 7,
      });
      const repeated = buildOperationalCarrierCorpusFrame({
        profile,
        contentSeed: SEED,
        contentRowIndex: 7,
      });
      const changed = buildOperationalCarrierCorpusFrame({
        profile,
        contentSeed: SEED,
        contentRowIndex: 8,
      });
      expect(first.grid.real).toEqual(repeated.grid.real);
      expect(first.grid.imaginary).toEqual(repeated.grid.imaginary);
      expect(first.changedPdschResourceElements).toBeGreaterThan(0);
      expect(first.pdschResourceElements).toBeGreaterThan(first.changedPdschResourceElements);
      expect(first.grid.kinds).toEqual(baseline.kinds);
      expect(first.grid.real).not.toEqual(changed.grid.real);

      const pdschKinds = expectedPdschKinds(profile);
      let checkedPdsch = 0;
      for (let index = 0; index < baseline.kinds.length; index += 1) {
        if (pdschKinds.has(baseline.kinds[index]!)) {
          checkedPdsch += 1;
          // Seeded QPSK bits only flip existing I/Q signs; constellation power
          // and every allocation coordinate stay unchanged.
          expect(Math.abs(first.grid.real[index]!)).toBe(Math.abs(baseline.real[index]!));
          expect(Math.abs(first.grid.imaginary[index]!)).toBe(Math.abs(baseline.imaginary[index]!));
        } else {
          expect(first.grid.real[index]).toBe(baseline.real[index]);
          expect(first.grid.imaginary[index]).toBe(baseline.imaginary[index]);
        }
      }
      expect(checkedPdsch).toBe(first.pdschResourceElements);
    }
  });

  it('is chunk-exact, finite, and eight-way content-distinct at a fixed phase', () => {
    for (const profile of OPERATIONAL_CARRIER_CORPUS_PROFILES) {
      const input = {
        profile,
        ...INPUTS[profile],
        contentSeed: SEED,
        contentRowIndex: 11,
        startSampleIndex: 937,
      };
      const whole = synthesizeOperationalCarrierCorpusIq({ ...input, sampleCount: 4_096 });
      const prefix = synthesizeOperationalCarrierCorpusIq({ ...input, sampleCount: 1_231 });
      const suffix = synthesizeOperationalCarrierCorpusIq({
        ...input,
        startSampleIndex: input.startSampleIndex + 1_231,
        sampleCount: 2_865,
      });
      expect(Buffer.concat([prefix, suffix])).toEqual(Buffer.from(whole));
      expect(isFiniteCf32le(whole)).toBe(true);

      const hashes = new Set<string>();
      for (let row = 0; row < 8; row += 1) {
        hashes.add(createHash('sha256').update(synthesizeOperationalCarrierCorpusIq({
          ...input,
          contentRowIndex: row,
          startSampleIndex: 0,
          sampleCount: 4_096,
        })).digest('hex'));
      }
      expect(hashes.size).toBe(8);
    }
  });

  it('rejects unsupported corpus bindings', () => {
    expect(() => synthesizeOperationalCarrierCorpusIq({
      profile: 'nr-n3-fdd-20m',
      sampleRateHz: 20_000_000,
      bandwidthHz: 20_000_000,
      sampleCount: 1,
      contentSeed: SEED,
      contentRowIndex: 0,
    })).toThrow(/requires/i);
    expect(() => synthesizeOperationalCarrierCorpusIq({
      profile: 'lte-band3-fdd-20m',
      ...INPUTS['lte-band3-fdd-20m'],
      sampleCount: 1,
      contentSeed: 0,
      contentRowIndex: 0,
    })).toThrow(/seed/i);
  });
});

function referenceGrid(profile: OperationalCarrierCorpusProfile): {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
  readonly kinds: Uint8Array;
} {
  if (profile === 'lte-band3-fdd-20m') return generateLteBand3Fdd20mReferenceFrame().grid;
  if (profile === 'lte-band38-tdd-10m') return generateLteBand38Tdd10mReferenceFrame().grid;
  if (profile === 'nr-n3-fdd-20m') return generateNrN3Fdd20mFrame().grid;
  return generateNrN78Tdd100mFrame().grid;
}

function expectedPdschKinds(profile: OperationalCarrierCorpusProfile): ReadonlySet<number> {
  if (profile === 'lte-band3-fdd-20m' || profile === 'lte-band38-tdd-10m') {
    return new Set([LTE_RESOURCE_ELEMENT_KIND.pdsch]);
  }
  if (profile === 'nr-n3-fdd-20m') {
    return new Set([
      NR_RESOURCE_ELEMENT_KIND.pdschRnti0Data,
      NR_RESOURCE_ELEMENT_KIND.pdschRnti2Data,
    ]);
  }
  return new Set([
    NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdschRnti0Data,
    NR_N78_TDD_100M_RESOURCE_ELEMENT_KIND.pdschRnti2Data,
  ]);
}

function isFiniteCf32le(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.byteLength; offset += 8) {
    if (!Number.isFinite(view.getFloat32(offset, true))
      || !Number.isFinite(view.getFloat32(offset + 4, true))) {
      return false;
    }
  }
  return true;
}
