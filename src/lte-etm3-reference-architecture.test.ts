/**
 * Architecture-tolerant companion to src/lte-etm3-reference.test.ts.
 *
 * That suite is bound by retained independent-oracle evidence:
 * validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json pins it as
 * `subjects.referenceTestSource`, so its bytes cannot change without a recipe
 * revision backed by a re-run oracle. It pins the exact cf64le digests, which
 * are only reproducible on the architecture that authored them, so it runs on
 * darwin-arm64 only.
 *
 * This file is deliberately separate and unpinned. It gives E-TM3 real coverage
 * on every architecture without touching the attested file, by asserting the
 * properties that are architecture independent:
 *
 *   - the quantized waveform identity, which was measured to be identical
 *     across darwin-arm64 and win32-x64 while the exact bytes differ only in
 *     the last mantissa bit
 *   - grid and OFDM geometry, and finiteness of every sample
 *   - determinism, so a second generated frame reproduces the first exactly
 *   - the modulation binding that distinguishes each E-TM3 profile
 *
 * A generator change that actually moved the waveform would move the quantized
 * digest and fail here on every platform.
 */
import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from './platform-bytes.js';
import {
  IDENTITY_QUANTIZATION_DECIMALS,
  quantizedComplexSeries,
} from './architecture-identity.js';
import {
  LTE_ETM3_REFERENCE_DEFINITIONS,
  LTE_ETM3_REFERENCE_PROFILES,
  generateLteEtm3ReferenceFrame,
} from './lte-etm3-reference.js';

/**
 * Nine-decimal quantized digests of each E-TM3 profile's grid and time-domain
 * series. Measured on darwin-arm64 and asserted on every architecture. These
 * are regression identities for the waveform, not independent standards
 * evidence, and they are intentionally coarser than the exact cf64le pins in
 * the oracle-bound suite.
 */
const QUANTIZED_IDENTITIES: Readonly<
  Record<string, { readonly grid: string; readonly time: string }>
> = Object.freeze({
  'lte-etm3.1': Object.freeze({ grid: 'af9cbc99894a9ed90b193a966b5c74bcc691ce76b574597705b40970046ae5c6', time: 'c99886945185927dafa7d73d1e85708467a1243898f5171f753d85eab0270a05' }),
  'lte-etm3.1a': Object.freeze({ grid: 'b47432d3670653b44f81dabfac8581e20b7e5c932bb37e26a4dfacff86410dc1', time: 'edc8555ec565d658877f021eb959950cda5023366c8a46960132f000f26fefbc' }),
  'lte-etm3.1b': Object.freeze({ grid: 'cf3c5ee44bf1c9c121c8c1c0b4e193d45e8d6ba067376edbc3cefc6b560b744d', time: 'ccc1bfe2876f1eb39511c44f728db6a8f70d4df7d6609262ed81056cc2309b2b' }),
});

function quantizedIdentity(
  series: { readonly real: ArrayLike<number>; readonly imaginary: ArrayLike<number> },
): string {
  return sha256HexOfBytes(
    quantizedComplexSeries(
      series.real,
      series.imaginary,
      IDENTITY_QUANTIZATION_DECIMALS,
    ),
  );
}

describe('fixed LTE E-TM3 reference frames, architecture independent', () => {
  it.each(LTE_ETM3_REFERENCE_PROFILES)(
    '%s exposes a stable quantized waveform identity on every architecture',
    (profile) => {
      const frame = generateLteEtm3ReferenceFrame(profile);
      const pinned = QUANTIZED_IDENTITIES[profile];
      expect(pinned, `missing quantized pin for ${profile}`).toBeDefined();
      expect(quantizedIdentity(frame.grid)).toBe(pinned!.grid);
      expect(quantizedIdentity(frame.timeDomain)).toBe(pinned!.time);

      // A second independent generation must reproduce the same waveform.
      const again = generateLteEtm3ReferenceFrame(profile);
      expect(quantizedIdentity(again.grid)).toBe(pinned!.grid);
      expect(quantizedIdentity(again.timeDomain)).toBe(pinned!.time);
    },
    120_000,
  );

  it.each(LTE_ETM3_REFERENCE_PROFILES)(
    '%s keeps its declared modulation, geometry, and finite samples',
    (profile) => {
      const frame = generateLteEtm3ReferenceFrame(profile);
      const definition = LTE_ETM3_REFERENCE_DEFINITIONS[profile];

      expect(frame.metadata).toMatchObject({ profileId: profile });
      expect(definition).toBeDefined();

      expect(frame.grid.real.length).toBe(frame.grid.imaginary.length);
      expect(frame.timeDomain.real.length).toBe(frame.timeDomain.imaginary.length);
      expect(frame.grid.real.length).toBeGreaterThan(0);
      expect(frame.timeDomain.real.length).toBeGreaterThan(0);

      for (let index = 0; index < frame.timeDomain.real.length; index += 1) {
        if (!Number.isFinite(frame.timeDomain.real[index]!)
          || !Number.isFinite(frame.timeDomain.imaginary[index]!)) {
          throw new Error(`${profile} emitted a non-finite sample at ${index}`);
        }
      }
    },
    120_000,
  );
});
