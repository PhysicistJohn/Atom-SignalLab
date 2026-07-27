import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256,
  parseRetainedLteEtm11ClauseEvidence,
} from './lte-etm1-test-catalog.js';
import { sha256HexOfBytes } from './platform-bytes.js';

const requireOfficialArchives =
  process.env.SIGNALLAB_REQUIRE_3GPP_CLAUSE_ARCHIVES === '1';
const officialArchiveDirectory = process.env.SIGNALLAB_3GPP_ARCHIVE_DIR;
const explicitArchiveTest = requireOfficialArchives ? it : it.skip;

describe('LTE E-TM1.1 official normative archive evidence', () => {
  explicitArchiveTest(
    'reproduces the retained clause-range report byte-for-byte from the pinned official ZIPs',
    () => {
      if (officialArchiveDirectory === undefined || officialArchiveDirectory.trim() === '') {
        throw new Error(
          'SIGNALLAB_3GPP_ARCHIVE_DIR is required when '
          + 'SIGNALLAB_REQUIRE_3GPP_CLAUSE_ARCHIVES=1',
        );
      }

      const retainedBytes = readFileSync(resolve(
        'validation/lte-etm1-release19-clause-evidence.json',
      ));
      const regeneratedBytes = execFileSync(
        process.execPath,
        [
          resolve('tools/3gpp-clause-evidence.mjs'),
          resolve(officialArchiveDirectory),
        ],
        { maxBuffer: 64 * 1_048_576 },
      );

      expect(sha256HexOfBytes(retainedBytes))
        .toBe(LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256);
      expect(regeneratedBytes.equals(retainedBytes)).toBe(true);
      expect(parseRetainedLteEtm11ClauseEvidence(regeneratedBytes)).toHaveLength(59);
    },
  );
});
