import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest;

const REQUIRED_LIVE_FLAGS = [
  'SIGNALLAB_REQUIRE_3GPP_ORACLE=1',
  'SIGNALLAB_REQUIRE_3GPP_CLAUSE_ARCHIVES=1',
  'SIGNALLAB_REQUIRE_LTE_ETM3_QAM_ORACLE=1',
  'SIGNALLAB_REQUIRE_LTE_ETM3_FULL_ORACLE=1',
  'SIGNALLAB_REQUIRE_LTE_BAND3_FDD20_ORACLE=1',
  'SIGNALLAB_REQUIRE_LTE_BAND38_TDD10_ORACLE=1',
  'SIGNALLAB_REQUIRE_LTE_NTM_ORACLE=1',
  'SIGNALLAB_REQUIRE_NR_FR1_TM_ORACLE=1',
  'SIGNALLAB_REQUIRE_NR_N78_TDD_100M_ORACLE=1',
  'SIGNALLAB_REQUIRE_WLAN_OFDM_ORACLE=1',
] as const;

const REQUIRED_LIVE_TESTS = [
  'src/lte-etm1-independent-oracle.test.ts',
  'src/lte-etm1-oracle-evidence.test.ts',
  'src/lte-etm1-clause-archive.test.ts',
  'src/lte-etm3-independent-oracle.test.ts',
  'src/lte-band3-fdd-20m-independent-oracle.test.ts',
  'src/lte-band38-tdd-10m-independent-oracle.test.ts',
  'src/lte-ntm-independent-oracle.test.ts',
  'src/nr-fr1-test-model-independent-oracle.test.ts',
  'src/nr-n78-tdd-100m-independent-oracle.test.ts',
  'src/wlan-fixed-independent-oracle.test.ts',
] as const;

describe('aggregate standards evidence gate', () => {
  it('makes every external oracle and official-archive lane mandatory', () => {
    const live = manifest.scripts?.['test:standards:live'];
    expect(live).toBeDefined();
    for (const flag of REQUIRED_LIVE_FLAGS) {
      expect(live, flag).toContain(flag);
    }
    for (const test of REQUIRED_LIVE_TESTS) {
      expect(live, test).toContain(test);
    }
  });

  it('runs repository-owned structural evidence before the mandatory live lanes', () => {
    expect(manifest.scripts?.['test:standards:structural'])
      .toBe('vitest run src');
    expect(manifest.scripts?.['test:standards'])
      .toBe(
        'npm run test:standards:structural && npm run test:standards:live',
      );
  });
});
