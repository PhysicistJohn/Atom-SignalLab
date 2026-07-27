import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WIFI_ERP_OFDM_CF32LE_SHA256,
  WIFI_HR_DSSS_CF32LE_SHA256,
  WIFI_HE_ER_SU_CF32LE_SHA256,
  WIFI_HE_MU_CF32LE_SHA256,
  WIFI_HE_SU_CF32LE_SHA256,
  WIFI_HE_TB_CF32LE_SHA256,
  buildWifiErpOfdmFixedPpdu,
  buildWifiHrDsssFixedPpdu,
  buildWifiHeFixedPpdu,
} from './wlan-fixed-iq.js';

export const WLAN_FIXED_ORACLE_REPORT_SHA256 =
  '9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18' as const;

const REPORT_PATH =
  'validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json';

const EXPECTED_SOURCE_IDENTITIES = Object.freeze({
  'src/wlan-fixed-iq.ts':
    '7f87906985ae078b0e652a181b2eb62ed99448fb188b37666cb78202957da40b',
  'src/wlan-he-fixed-iq.ts':
    'dc7ccacf80619f4d89f7d99a0f55c4626914955ca9d34917469cdb0ab68fe65d',
  'src/wlan-fixed-iq.test.ts':
    '04df9973fa04f58191c05a38ee77b954a2c03b49223b9cb7e00436363641e5d2',
  'src/wlan-he-fixed-iq.test.ts':
    'f91cea8713e6747fa24bebc95495271c98d0a83991720c04c312118fcc3ee4cf',
  'src/wlan-fixed-independent-oracle.test.ts':
    '106970868237264ef1aad09269cbe098023c5cd8885d96cd7f0e76e7a0b41598',
} as const);

const EXPECTED_ARTIFACTS = Object.freeze({
  'wifi-hr-dsss-11m': Object.freeze({
    sampleRateHz: 11_000_000,
    sampleCount: 2_224,
    sha256: WIFI_HR_DSSS_CF32LE_SHA256,
    bytes: () => buildWifiHrDsssFixedPpdu().cf32le,
  }),
  'wifi-ofdm-20m': Object.freeze({
    sampleRateHz: 20_000_000,
    sampleCount: 1_000,
    sha256: WIFI_ERP_OFDM_CF32LE_SHA256,
    bytes: () => buildWifiErpOfdmFixedPpdu().cf32le,
  }),
  'wifi6-he-su': Object.freeze({
    sampleRateHz: 20_000_000,
    sampleCount: 10_640,
    sha256: WIFI_HE_SU_CF32LE_SHA256,
    bytes: () => buildWifiHeFixedPpdu('wifi6-he-su').cf32le,
  }),
  'wifi6-he-er-su': Object.freeze({
    sampleRateHz: 20_000_000,
    sampleCount: 6_960,
    sha256: WIFI_HE_ER_SU_CF32LE_SHA256,
    bytes: () => buildWifiHeFixedPpdu('wifi6-he-er-su').cf32le,
  }),
  'wifi6-he-mu': Object.freeze({
    sampleRateHz: 20_000_000,
    sampleCount: 7_040,
    sha256: WIFI_HE_MU_CF32LE_SHA256,
    bytes: () => buildWifiHeFixedPpdu('wifi6-he-mu').cf32le,
  }),
  'wifi6-he-tb': Object.freeze({
    sampleRateHz: 20_000_000,
    sampleCount: 6_880,
    sha256: WIFI_HE_TB_CF32LE_SHA256,
    bytes: () => buildWifiHeFixedPpdu('wifi6-he-tb').cf32le,
  }),
} as const);

interface EvidenceReport {
  readonly schemaVersion: number;
  readonly result: string;
  readonly governingOrganization: string;
  readonly specification: {
    readonly documentId: string;
    readonly revision: string;
  };
  readonly generatorSources: readonly { readonly path: string; readonly sha256: string }[];
  readonly independentOracleSources: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly scope: string;
  }[];
  readonly upstreamOracle: {
    readonly project: string;
    readonly commit: string;
    readonly result: string;
  };
  readonly artifacts: readonly {
    readonly profileId: keyof typeof EXPECTED_ARTIFACTS;
    readonly sampleRateHz: number;
    readonly sampleCount: number;
    readonly mediaType: string;
    readonly sha256: string;
    readonly oracle: string;
    readonly result: string;
  }[];
}

describe('retained IEEE 802.11-2024 fixed-PPDU oracle evidence', () => {
  const reportBytes = readFileSync(resolve(REPORT_PATH));
  const report = JSON.parse(reportBytes.toString('utf8')) as EvidenceReport;

  it('pins the immutable passing report and its exact standards boundary', () => {
    expect(sha256(reportBytes)).toBe(WLAN_FIXED_ORACLE_REPORT_SHA256);
    expect(report).toMatchObject({
      schemaVersion: 1,
      result: 'pass',
      governingOrganization: 'IEEE Standards Association / IEEE 802.11 Working Group',
      specification: {
        documentId: 'IEEE 802.11-2024',
        revision: '2024',
      },
      upstreamOracle: {
        project: 'gr-ieee802-11',
        commit: 'ad0598e4a874f4b8e1f391a1e0323e80df2b34ff',
        result: 'pass',
      },
    });
  });

  it('fails if a generator or independently structured oracle source changes', () => {
    const reported = [...report.generatorSources, ...report.independentOracleSources];
    expect(reported.map(({ path }) => path).sort())
      .toEqual(Object.keys(EXPECTED_SOURCE_IDENTITIES).sort());
    for (const [path, expectedSha256] of Object.entries(EXPECTED_SOURCE_IDENTITIES)) {
      expect(sha256(readFileSync(resolve(path)))).toBe(expectedSha256);
      expect(reported.find((entry) => entry.path === path)?.sha256).toBe(expectedSha256);
    }
    for (const oracle of report.independentOracleSources) {
      expect(oracle.scope.length).toBeGreaterThan(40);
    }
  });

  it('regenerates and hashes every complete fixed digital artifact named by the report', () => {
    expect(report.artifacts.map(({ profileId }) => profileId).sort())
      .toEqual(Object.keys(EXPECTED_ARTIFACTS).sort());
    for (const artifact of report.artifacts) {
      const expected = EXPECTED_ARTIFACTS[artifact.profileId];
      expect(artifact).toMatchObject({
        sampleRateHz: expected.sampleRateHz,
        sampleCount: expected.sampleCount,
        mediaType: 'application/vnd.tinysa.complex-f32',
        sha256: expected.sha256,
        result: 'pass',
      });
      expect(artifact.oracle.length).toBeGreaterThan(30);
      const bytes = expected.bytes();
      expect(bytes.byteLength).toBe(expected.sampleCount * 8);
      expect(sha256(bytes)).toBe(expected.sha256);
    }
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
