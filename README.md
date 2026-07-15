# TinySA SignalLab

SignalLab is the standalone synthetic-measurement and stimulus-authoring member of the TinySA trio. It owns deterministic CW, AM, FM, standards-derived GERAN/E-UTRA/NR/WLAN visual projections, seeded AWGN/Rayleigh channel models, and the separately built high-level measurement bridge used by Atomizer's `signal-lab` driver.

The SignalLab→Atomizer measurement edge is active. It emits only swept-spectrum and detected-power observations qualified `synthetic-visual-projection`; it does not impersonate a USB instrument, execute firmware, emit RF, control Atomizer, or own the executable twin. The separate SignalLab→Firmware integration surface is versioned `SignalLabStimulusIntent`; the Firmware repository will own any sink that applies that intent. That sink remains `reserved-not-connected`.

## Run

Requirements: Node.js 22.23.1 and npm 10.9.8 (the exact versions pinned by CI and `packageManager`).

```bash
npm install
npm run check
npm run dev
```

Build or run the version-1 Atomizer bridge directly with:

```bash
npm run build:bridge
npm run bridge
```

The bridge uses bounded UTF-8 NDJSON over stdio. Its first stdout line is an exact `ready` declaration binding the contract, catalog, and shipped generator hashes. It serializes `status`, `select_profile`, `configure_channel`, `acquire_spectrum`, `acquire_detected_power`, and `shutdown`, returns one response per admitted line (correlated whenever a valid request ID is available), and never retries. Every line—including invalid, duplicate, oversized, and overloaded input—consumes the lifetime line budget and one of at most 33 pending reply obligations; input pauses while stdout backpressure holds that bound. Atomizer treats any identity, framing, correlation, schema, timeout, or process failure as terminal for that source and never falls back to a TinySA or the Firmware twin.

The standalone Electron window admits privileged IPC only from its exact current main frame and selected file/development origin. Packaged execution ignores `VITE_DEV_SERVER_URL`, all Electron permissions and child windows are denied, and packaged HTML contains no development network origin.

Atomizer's owner-only startup preference selects the factory default; with no preference file, that default is `signal-lab`. SignalLab does not inspect or mutate that preference. Its selected profile and channel are visible in status/capability state, while measurements carry only observables, opaque session/configuration correlation, and source provenance. Profile identity is never copied into measurement, detector, classifier, or exported-observation evidence.

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
Bessel-series FM, standards-parameterized heuristic projections of GSM, LTE
FDD/TDD, NR FDD/TDD, Wi-Fi DSSS/OFDM and Bluetooth Classic/LE, plus explicit
hard negatives. These hand-built power projections are not standards-derived
waveforms. Every scenario records truth class, parameters, source clause,
seed, acquisition settings, and a non-conformance disclosure.

The hard-negative set includes independent regular and irregular CW groups,
stationary intermittent 2.4 GHz activity, a simultaneous full-band raster,
four time-interleaved independent sources, and proprietary off-raster FHSS.
The latter two are deliberately declared observationally compatible with the
Bluetooth activity leaf: scalar frequency agility cannot establish protocol
or emitter identity. Simultaneous lines likewise cannot establish a shared
emitter, oscillator, modulation process, or message identity.

The v7 corpus also contains byte-for-byte scalar-equivalence null pairs: a
receiver spur versus CW, coherent independent tones versus DSB-FC AM, an
independent Bessel-weighted comb versus FM, generic OFDM versus LTE/NR or
Wi-Fi-shaped projections, and proprietary DSSS versus HR-DSSS. A classifier
is correct—not mistaken—when it returns the declared equivalence class for
either member of one of these pairs.

The corpus intentionally emits only swept power and detected-power zero span.
It does not expose hidden I/Q or selected-profile state to a classifier. Its
physics/standards-derived projections verify inference code and observable
equivalence behavior; real-world probability calibration still requires
session-grouped physical captures.

See [CONTRACTS.md](./CONTRACTS.md) for the standalone API, measurement bridge, synthesis guarantees, failure algebra, and acceptance evidence. The byte-identical cross-repository composition is [contracts/trio-composition-v4.json](./contracts/trio-composition-v4.json).
