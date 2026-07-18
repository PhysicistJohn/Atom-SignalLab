# SignalLab

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

The bridge uses bounded UTF-8 NDJSON over stdio. Its first stdout line is an exact `ready` declaration binding the contract, catalog, and shipped generator hashes. It serializes `status`, `select_profile`, `configure_channel`, `acquire_spectrum`, `acquire_detected_power`, and `shutdown`, returns one response per admitted line (correlated whenever a valid request ID is available), and never retries. Every detected-power request must supply a safe-integer `centerFrequencyHz`; ready capability declares an exact 1 through 17,922,600,000 Hz range in 1 Hz steps, and the result returns that requested center exactly. Every line—including invalid, duplicate, oversized, and overloaded input—consumes the 10,000-line process budget and one of at most 33 pending reply obligations; one additional valid shutdown line is separately reserved, and input pauses while stdout backpressure holds the bound. Atomizer renews a long-lived synthetic session before that process budget is reached by joining the retired child and handing its exact session ID, producer epoch, profile/channel state, and next measurement sequence to a freshly verified child. Any state drift, overlapping generation, identity change, framing/correlation/schema failure, timeout, or process failure remains terminal for that source, and Atomizer never falls back to a TinySA or the Firmware twin.

Contract v1 is still a pre-publication, lockstep Atomizer/SignalLab boundary.
The reserved-shutdown field, normalized descriptor `source` basis, and required
detected-power tune were added before a stable external release and intentionally
change the exact contract/catalog or generator hashes; an older strict client
therefore rejects the new bridge before dispatch rather than misreading it.
After v1 is published outside this paired workspace, any wire-field or semantic
change must use a new contract version with an explicit compatibility policy.

The standalone Electron window admits privileged IPC only from its exact current main frame and selected file/development origin. Packaged execution ignores `VITE_DEV_SERVER_URL`, all Electron permissions and child windows are denied, and packaged HTML contains no development network origin.

Atomizer's owner-only startup preference selects the factory default; with no preference file, that default is `signal-lab`. SignalLab does not inspect or mutate that preference. Its selected profile and channel are visible in status/capability state, while measurements carry only observables, opaque session/configuration correlation, and source provenance. Profile identity is never copied into measurement, detector, classifier, or exported-observation evidence.

The catalog contains exactly 34 profiles:

- 3 canonized CW/AM/FM scalar-observable profiles.
- 7 GERAN profiles: one canonized loaded GSM observable plus 6 standards-derived GERAN/EDGE burst projections.
- 10 E-UTRA-family profiles: canonized Band 3 FDD and Band 38 TDD observables; 4 retained full-allocation Release 19 E-TM projections; 3 isolated N-TM component presentations; and the isolated E-UTRA/NB-IoT component imported by NR-N-TM.
- 6 NR-family profiles: canonized n3 FDD and n78 TDD observables plus 4 retained full-allocation Release 19 FR1 test-model projections.
- 6 IEEE 802.11 profiles: canonized HR-DSSS and 20 MHz OFDM observables plus 4 802.11ax HE PPDU projections.
- 2 canonized Bluetooth scalar-observable profiles for BR/EDR connected hopping and LE primary advertising.

Named test models whose power-balanced allocation, per-slot PRB sequence,
subslot/slot timing, or SBFD spectral partition is not reproduced are excluded
from the selectable catalog. The retained entries are spectrum/time projections,
not conformance-grade I/Q. A profile cannot be labeled `conformance-validated`
without an admitted immutable SHA-256 asset.

## Canonical classification corpus

`src/waveforms.ts` owns the executable definitions and synthesis kernel shared
by the public canonized observable profiles and `src/classification-corpus.ts`.
Corpus v13 canonizes deterministic scalar observations for Bayesian
detector/classifier development, including CW, physical DSB full-carrier AM
sideband ratios, Bessel-series FM, standards-parameterized heuristic
projections of GSM, LTE FDD/TDD, NR FDD/TDD, Wi-Fi DSSS/OFDM and Bluetooth
Classic/LE, plus corpus-only explicit hard negatives. These hand-built power
projections are not conformance waveforms. Every scenario records truth class,
parameters, seed, acquisition settings, and a non-conformance disclosure. Its
source provenance is an ordered per-document reference list: independently
versioned 3GPP specifications never share an invented aggregate revision or a
URL that resolves only half of the stated basis. Live profile identity remains
status-only and never enters the shared measurement evidence or classifier.

Version 13 retains the explicit TDD and LE timing choices introduced in v11.
It also separates swept-spectrum bin-equivalent RBW from the generator-internal
receiver-filter width used for detected-power synthesis. Public replays and the
corpus both pin that synthesis width to 100 kHz, record it for reproducibility,
and never represent it as observed or calibrated measurement metadata. The LTE Band 38
projection is downlink-only UL/DL configuration 0 with normal downlink/uplink
cyclic prefixes and special-subframe configuration 7 (`srs-UpPtsAdd` absent):
DwPTS is 21,952 `Ts`, while GP and UpPTS are 4,384 `Ts` each. Guard and UpPTS
time is never modeled as downlink energy. The NR n78 projection is the versioned
SignalLab engineering schedule `nr-tdd-7dl-3ul-engineering-v1`: one valid 5 ms,
30 kHz-SCS selection with seven complete downlink slots followed by three
complete uplink slots, not a pattern prescribed for n78 or all NR deployments.
The BLE engineering schedule uses all three primary centers in sequential
37-to-38-to-39 order plus a seeded per-event pseudorandom 0–10 ms `advDelay`.
That sequence is standards-consistent for the modeled legacy all-three-channel
event; configured subsets, early event closure, and extended advertising differ.
Its all-three use, packet timing, interval, and deterministic delay generator
are engineering choices, not universal Bluetooth traffic or PDU behavior. The n3 `carrierRasterHz`
metadata is the ordinary 100 kHz band-specific channel raster, not the 5 kHz
global NR-ARFCN step.

The catalog's 2 kHz CW width is a nominal display-support floor for a
mathematical line, not analyzer RBW or source occupied bandwidth. The 52 kHz AM
width is the 50 kHz outer-sideband spacing plus that nominal 2 kHz display
floor. Actual rendered line width follows each observation's RBW and may extend
beyond those nominal display-support fields.

The hard-negative set includes independent regular and irregular CW groups,
stationary intermittent 2.4 GHz activity, a simultaneous full-band raster,
four time-interleaved independent sources, and proprietary off-raster FHSS.
The latter two are deliberately declared observationally compatible with the
Bluetooth activity leaf: scalar frequency agility cannot establish protocol
or emitter identity. Simultaneous lines likewise cannot establish a shared
emitter, oscillator, modulation process, or message identity.

The v13 corpus also contains byte-for-byte scalar-equivalence null pairs: a
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
