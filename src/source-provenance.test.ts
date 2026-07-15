import { describe, expect, it } from 'vitest';
import {
  BLUETOOTH_OBSERVABLE_SOURCE,
  LTE_OBSERVABLE_SOURCE,
  LTE_TDD_OBSERVABLE_SOURCE,
  NR_OBSERVABLE_SOURCE,
  NR_TDD_OBSERVABLE_SOURCE,
  sourceBasis,
  sourceBasisSchema,
} from './source-provenance.js';

describe('source provenance', () => {
  it('retains one immutable reference per independently versioned document', () => {
    expect(LTE_OBSERVABLE_SOURCE.references.map((reference) => [reference.specification, reference.revision])).toEqual([
      ['TS 36.101', '19.5.0'],
      ['TS 36.211', '19.3.0'],
    ]);
    expect(LTE_TDD_OBSERVABLE_SOURCE.references.map((reference) => reference.specification))
      .toEqual(['TS 36.101', 'TS 36.211']);
    expect(LTE_TDD_OBSERVABLE_SOURCE.references[1]?.clause)
      .toMatch(/Tables 4\.2-1 and 4\.2-2.*configuration 0.*configuration 7/i);
    expect(NR_OBSERVABLE_SOURCE.references.map((reference) => reference.specification))
      .toEqual(['TS 38.104', 'TS 38.211']);
    expect(NR_OBSERVABLE_SOURCE.references[0]?.clause).toMatch(/5\.4\.2\.3.*band-specific channel raster/i);
    expect(NR_TDD_OBSERVABLE_SOURCE.references.map((reference) => [reference.specification, reference.revision])).toEqual([
      ['TS 38.104', '19.4.0'],
      ['TS 38.211', '19.3.0'],
      ['TS 38.331', '19.1.0'],
      ['TS 38.213', '19.3.0'],
    ]);
    expect(NR_TDD_OBSERVABLE_SOURCE.references[2]?.clause).toMatch(/TDD-UL-DL-Pattern/i);
    expect(NR_TDD_OBSERVABLE_SOURCE.references[3]?.clause).toMatch(/11\.1.*slot configuration/i);
    expect(BLUETOOTH_OBSERVABLE_SOURCE.references).toHaveLength(4);
    expect(BLUETOOTH_OBSERVABLE_SOURCE.references[3]?.clause).toMatch(/2\.3\.1.*4\.4\.2\.1.*4\.4\.2\.2\.1.*advDelay/i);
    expect(Object.isFrozen(LTE_OBSERVABLE_SOURCE)).toBe(true);
    expect(Object.isFrozen(LTE_OBSERVABLE_SOURCE.references)).toBe(true);
    expect(LTE_OBSERVABLE_SOURCE.references.every(Object.isFrozen)).toBe(true);
  });

  it('rejects insecure, duplicate, empty, and partially identified sources', () => {
    const reference = {
      specification: 'TS 1.2.3', clause: 'Clause 4', revision: '1.0.0',
      url: 'https://example.invalid/ts-1.2.3-v1.pdf',
    };
    expect(() => sourceBasis('3GPP', [reference, reference])).toThrow(/duplicate/i);
    expect(() => sourceBasis('3GPP', [{ ...reference, specification: 'TS 1.2.4' }, reference])).toThrow(/one URL/i);
    expect(sourceBasisSchema.safeParse({ organization: '3GPP', references: [{ ...reference, url: 'http://example.invalid/spec.pdf' }] }).success).toBe(false);
    expect(sourceBasisSchema.safeParse({ organization: '3GPP', references: [] }).success).toBe(false);
  });
});
