# TinySA SignalLab

SignalLab is the standalone stimulus-authoring member of the TinySA trio. It owns deterministic CW, AM, FM, standards-derived GERAN/E-UTRA/NR/WLAN visual projections, and seeded AWGN/Rayleigh channel models.

It does not impersonate a USB instrument, emit RF, control Atomizer, or own the executable twin. Its future integration surface is a versioned `SignalLabStimulusIntent`; the Firmware repository will own any sink that applies that intent. That sink is currently `reserved-not-connected`.

## Run

Requirements: Node.js 22+ and npm 11+.

```bash
npm install
npm run check
npm run dev
```

The catalog contains exactly 79 profiles:

- 3 visual CW/AM/FM profiles.
- 6 standards-derived GERAN/EDGE normal-burst modulation projections.
- 25 standards-derived Release 19 E-UTRA E-TM/sE-TM/N-TM projections.
- 41 standards-derived Release 19 NR FR1/N-TM/SBFD projections.
- 4 standards-derived IEEE 802.11ax HE PPDU projections.

These are spectrum/time projections, not conformance-grade I/Q. A profile cannot be labeled `conformance-validated` without an admitted immutable SHA-256 asset.

## Canonical classification corpus

`src/classification-corpus.ts` is separate from the 79-profile UI catalog. It
canonizes deterministic scalar observations for Bayesian detector/classifier
development, including CW, physical DSB full-carrier AM sideband ratios,
Bessel-series FM, GSM, LTE FDD/TDD, NR FDD/TDD, Wi-Fi DSSS/OFDM, Bluetooth
Classic/LE, and explicit hard negatives. Every scenario records truth class,
parameters, source clause, seed, acquisition settings, and a non-conformance
disclosure.

The corpus intentionally emits only swept power and detected-power zero span.
It does not expose hidden I/Q or selected-profile state to a classifier. Its
physics/standards-derived projections verify inference code and observable
equivalence behavior; real-world probability calibration still requires
session-grouped physical captures.

See [CONTRACTS.md](./CONTRACTS.md) for the closed API, synthesis guarantees, failure algebra, and acceptance evidence. The byte-identical cross-repository composition is [contracts/trio-composition-v2.json](./contracts/trio-composition-v2.json).
