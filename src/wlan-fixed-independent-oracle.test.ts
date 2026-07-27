import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WIFI_FIXED_ACK_PSDU_HEX,
  buildWifiErpOfdmFixedPpdu,
} from './wlan-fixed-iq.js';

const EXPECTED_GR_IEEE802_11_COMMIT = 'ad0598e4a874f4b8e1f391a1e0323e80df2b34ff';
const EXPECTED_GR_UTILS_SHA256 =
  '33393aabfa040071f9542bc4b1df80199994ad38abd662522fc79d7e0b4d8fbd';
const EXPECTED_GR_CONSTELLATIONS_SHA256 =
  'b5590907632898ade9af646a7953985dde3056398cc4c062b2141a95e633d0ce';
const EXPECTED_GR_SIGNAL_FIELD_SHA256 =
  '4ab29b8a000b753181073082dd64bedda5826abee938fd008c988fe27d9aa128';
const EXPECTED_GR_FLOWGRAPH_SHA256 =
  'e99f82644cc0c99ce802480f53e23e912dd955c88b8df3842285042a5c646b41';
const EXPECTED_HARNESS_SOURCE_SHA256 =
  'b325128844d8e2f8046e9d14ad9947ddd03408bd04794c1d4110e5272e4bd8e8';
const EXPECTED_HARNESS_BINARY_SHA256 =
  '5bab3e33d5b4ec0d71eea1b1126389462edbac43872a097f76405b4d5643ded4';
const EXPECTED_RETAINED_VECTOR_SHA256 =
  '933e0e918284f1918953f65179fca03c20302627dd748e8e24ebe17f7045dfda';

const repositoryPath = process.env.SIGNALLAB_GR_IEEE80211_REPOSITORY;
const harnessSourcePath = process.env.SIGNALLAB_GR_IEEE80211_OFDM_HARNESS_SOURCE;
const harnessBinaryPath = process.env.SIGNALLAB_GR_IEEE80211_OFDM_HARNESS_BINARY;
const retainedVectorPath = process.env.SIGNALLAB_GR_IEEE80211_OFDM_VECTOR;
const liveRequired = process.env.SIGNALLAB_REQUIRE_WLAN_OFDM_ORACLE === '1';
const environmentComplete = [
  repositoryPath,
  harnessSourcePath,
  harnessBinaryPath,
  retainedVectorPath,
].every((value) => value !== undefined);

interface OracleVector {
  readonly psdu_octets: number;
  readonly ofdm_symbols: number;
  readonly pad_bits: number;
  readonly signal_uncoded: string;
  readonly signal_coded: string;
  readonly signal_interleaved: string;
  readonly data_uncoded: string;
  readonly data_scrambled: string;
  readonly data_coded: string;
  readonly data_interleaved: string;
}

describe('independent gr-ieee802-11 ERP-OFDM oracle', () => {
  it('fails closed if the explicitly required independent lane is incomplete', () => {
    if (liveRequired) expect(environmentComplete).toBe(true);
  });

  it.skipIf(!environmentComplete)(
    'reruns pinned upstream scrambling/BCC/interleaving code and matches every fixed-PPDU bit',
    () => {
      expect(execFileSync('git', ['-C', repositoryPath!, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim()).toBe(EXPECTED_GR_IEEE802_11_COMMIT);
      expect(execFileSync('git', ['-C', repositoryPath!, 'config', '--get', 'remote.origin.url'], {
        encoding: 'utf8',
      }).trim()).toBe('https://github.com/bastibl/gr-ieee802-11.git');
      expect(execFileSync('git', ['-C', repositoryPath!, 'diff', '--binary'])).toHaveLength(0);

      expect(sha256(readFileSync(join(repositoryPath!, 'lib/utils.cc'))))
        .toBe(EXPECTED_GR_UTILS_SHA256);
      expect(sha256(readFileSync(join(repositoryPath!, 'lib/constellations_impl.cc'))))
        .toBe(EXPECTED_GR_CONSTELLATIONS_SHA256);
      expect(sha256(readFileSync(join(repositoryPath!, 'lib/signal_field_impl.cc'))))
        .toBe(EXPECTED_GR_SIGNAL_FIELD_SHA256);
      expect(sha256(readFileSync(join(repositoryPath!, 'examples/wifi_phy_hier.grc'))))
        .toBe(EXPECTED_GR_FLOWGRAPH_SHA256);
      expect(sha256(readFileSync(harnessSourcePath!))).toBe(EXPECTED_HARNESS_SOURCE_SHA256);
      expect(sha256(readFileSync(harnessBinaryPath!))).toBe(EXPECTED_HARNESS_BINARY_SHA256);
      expect(sha256(readFileSync(retainedVectorPath!))).toBe(EXPECTED_RETAINED_VECTOR_SHA256);

      const freshBytes = execFileSync(
        harnessBinaryPath!,
        [WIFI_FIXED_ACK_PSDU_HEX, '93'],
        { timeout: 10_000 },
      );
      expect(sha256(freshBytes)).toBe(EXPECTED_RETAINED_VECTOR_SHA256);
      expect(freshBytes).toEqual(readFileSync(retainedVectorPath!));

      const oracle = JSON.parse(freshBytes.toString('utf8')) as OracleVector;
      const signalLab = buildWifiErpOfdmFixedPpdu();
      expect(oracle).toMatchObject({
        psdu_octets: 14,
        ofdm_symbols: 6,
        pad_bits: 10,
      });
      expect(oracle.signal_uncoded).toBe(bitsText(signalLab.signalUncodedBits));
      expect(oracle.signal_coded).toBe(bitsText(signalLab.signalCodedBits));
      expect(oracle.signal_interleaved).toBe(bitsText(signalLab.signalInterleavedBits));
      expect(oracle.data_uncoded).toBe(bitsText(signalLab.dataUncodedBits));
      expect(oracle.data_scrambled).toBe(bitsText(signalLab.dataScrambledBits));
      expect(oracle.data_coded).toBe(bitsText(signalLab.dataCodedBits));
      expect(oracle.data_interleaved).toBe(bitsText(signalLab.dataInterleavedBits));
    },
  );
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function bitsText(bits: Uint8Array): string {
  return [...bits].join('');
}
