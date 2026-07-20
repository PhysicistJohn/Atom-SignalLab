# SignalLab contract

Status: active standalone application and Atomizer measurement producer

- Standalone API version: `1`
- Atomizer measurement contract version: `1`
- Stimulus-intent version: `1`

Trio composition: [`trio-composition-v4.json`](./contracts/trio-composition-v4.json)

Owner: this repository

SignalLab is the sole owner of waveform descriptors, the closed synthetic catalog, seeded channel models, playback state, high-level synthetic measurement generation, and future stimulus intent. It does not own USB or TinySA emulation, firmware execution, Atom policy, operator instrument selection, or lifecycle orchestration.

## Standalone application boundary

The public source boundary is `src/contracts.ts`:

- `SignalLabApi.version = 1`.
- `status()` returns immutable current state.
- `select(profile)` accepts one of exactly 34 profile IDs.
- `configureChannel(config)` accepts the closed AWGN/Rayleigh schema.
- `subscribe(listener)` delivers status changes and returns explicit unsubscription.
- `SignalLabStimulusIntent` is reserved for a future Firmware-owned sink.

Every request is runtime validated. Invalid input rejects before state change; no profile, channel, seed, asset, or sink is substituted.

### Reusable Studio view

`SignalLabStudio` is a controlled React view, not a second state owner. It
renders the admitted catalog as `LAB`, `GSM`, `LTE`, `5G NR`, `WI-FI`, and
`BLUETOOTH` tabs plus AWGN/Rayleigh replay-channel controls. Standalone
SignalLab supplies state from its local API; Atomizer supplies state and actions
from its admitted `signal-lab` driver. The component reads no preload or window
global, and an embedding host may mark all source-truth controls human-only.
Profile and channel mutations still cross the owning host's validated boundary;
the view cannot mutate either repository directly.

## Atomizer measurement boundary

Atomizer's `signal-lab` driver imports `AtomizerMeasurementService` (`src/measurement-service.ts`) and runs it in process, in both the desktop and browser editions. [`contracts/signal-lab-measurement-bridge-v1.json`](./contracts/signal-lab-measurement-bridge-v1.json) is the bundled description of the measurement contract the service implements. The producer is platform neutral: `src/platform-bytes.ts` supplies pure-JS SHA-256 and base64 that are byte-identical to `node:crypto`, so the browser edition runs the same generators as desktop, complex I/Q included. The service is never a byte transport or TinySA protocol peer.

The in-process boundary is closed and bounded:

- Construction binds measurement contract version 1 plus exact contract and shipped runtime-generator SHA-256 build identity, published in every status and in every measurement's provenance.
- Claims are always `usbEmulated=false`, `firmwareExecuted=false`, and `rfEmitted=false`.
- The typed API is `status`, `selectProfile`, `configureChannel`, `acquireSpectrum`, `acquireDetectedPower`, and `acquireIq`. `dispatch` additionally accepts the wire-shaped contract requests (`status`, `select_profile`, `configure_channel`, `acquire_spectrum`, `acquire_detected_power`, `acquire_iq`, `shutdown`) and maps them to those methods. `shutdown` closes the service; every later call rejects with `SERVICE_CLOSED`.
- Every request and result is schema validated. Invalid input rejects before any state change; nothing is coerced, truncated, or substituted.
- Point counts, frequencies, sample periods, sample counts, and payload sizes are hard bounded.
- Detected-power capability declares `minimumFrequencyHz=1`, `maximumFrequencyHz=17922600000`, `frequencyStepHz=1`, and `frequencyUnit=Hz`. Every request supplies one safe-integer `centerFrequencyHz` in that range, synthesis is receiver-filtered at that exact tune, and the result returns the same integer exactly.
- Swept-spectrum and detected-power measurements are complete, finite, unit-declared, qualified `synthetic-visual-projection`, and bound to an opaque session/configuration revision and monotonic sequence.
- Complex-I/Q capability covers all 34 closed catalog profiles. `acquireIq` accepts safe-integer `centerHz` from 1 through 17,922,600,000, `sampleRateHz` from 1,000,000 through 245,760,000, independent `bandwidthHz` from 1,000 through 245,760,000 with `bandwidthHz <= sampleRateHz`, and `sampleCount` from 1 through 65,536. Capability declares `bandwidthMode=independent`. The bandwidth is the two-sided steady-state -3 dB span of the bounded causal real-coefficient low-pass applied identically to I and Q; initialization from the first sample preserves constant CW exactly. `sampleFormat=cf32le` is required.
- A complex-I/Q result is one complete canonical-base64 buffer of little-endian interleaved float32 I/Q, exactly eight bytes per complex sample, with exact byte length and SHA-256. It is a normalized, unit-peak complex envelope with `simulation-exact` timing. CW, AM, and FM results are qualified `analytic-complex-baseband`; the other 31 results are qualified `standards-derived-complex-baseband`. The requested center is the envelope reference and frequency-agile profiles can contain component offsets around it. Wideband standards profiles requested below their catalogued occupied support produce a disclosed deterministic discrete-time alias projection, not an alias-free full-channel reconstruction. The v1 result explicitly declares `channelApplication=not-applied`.
- Successive `acquireIq` calls advance the generator's time coordinate with the measurement sequence, so repeated captures are successive moments of one evolving waveform, not one frozen buffer. Constant CW remains legitimately constant.
- Profile/channel changes replace the producer configuration revision. Atomizer invalidates its admitted acquisition configuration before any later acquisition.
- Selected profile, waveform label, and catalog state appear only in status; measurements never copy them into detector, classifier, or exported-observation evidence.

With no persisted Atomizer preference, `signal-lab` is Atomizer's factory default. SignalLab neither owns nor reads that preference. Identity, schema, or state failure terminates that admission attempt and cannot activate the physical ZS407 or Firmware twin.

Historical note (removed architecture): through contract v1's early lockstep phase this boundary was a separately built NDJSON-over-stdio child process (`dist/bridge/atomizer-bridge.js`) with line, session-budget, and reply-obligation bounds. That bridge has been deleted. The same contract schemas now validate the in-process service directly, and the wire-contract JSON is retained as the bundled contract description.

## Closed catalog

| Family | Count | Qualification |
|---|---:|---|
| Tone | 1 | Visual |
| Analog AM/FM | 2 | Visual |
| GERAN canonized observable + GERAN/EDGE burst projections | 7 | Standards-derived |
| E-UTRA-family canonized FDD/TDD + retained full-allocation E-TM + isolated N-TM component projections | 10 | Standards-derived |
| NR-family canonized FDD/TDD + retained full-allocation FR1 test-model projections | 6 | Standards-derived |
| IEEE 802.11 canonized HR-DSSS/OFDM + 802.11ax HE PPDU projections | 6 | Standards-derived |
| Bluetooth BR/EDR + LE canonized observable projections | 2 | Standards-derived |
| Total | 34 | Closed |

Every descriptor carries a stable ID, label, family/model, center, occupied bandwidth, recommended span, resource/timing projection, one normalized source basis with an ordered per-document specification/clause/revision/HTTPS reference list, qualification, and disclosure.

Catalog qualification `standards-derived` means a resource-allocation and timing projection rather than a conformance claim. The corresponding complex-I/Q results are deterministic engineering envelopes qualified `standards-derived-complex-baseband`; they are not packet-decodable, bit-exact protocol reproductions, or conformance vectors. Framework-generated independently validated assets remain future work. `conformance-validated` is impossible unless an immutable SHA-256 asset identity is present and independently admitted.

## Channel and playback guarantees

Assumptions:

- Frequencies are safe integer hertz.
- Power values are finite dBm.
- Sweep point grids are finite, ordered, and within the declared range.
- Channel seeds are integers from 1 through `0xffffffff`.

Guarantees:

- Legacy visual/test-model AWGN is derived from a seeded complex-Gaussian periodogram plus bounded receiver ripple and stable low-level spurs. Canonized observable profiles use the same deterministic corpus periodogram process at a fixed in-support 32 dB SNR.
- Rayleigh output adds reproducible correlated frequency-selective signal fading rather than relabeling AWGN.
- Equal profile, channel, point grid, seed, and sweep index produce equal output.
- A changed sweep index evolves the live replay.
- Canonized AM uses the physical DSB full-carrier power ratio and receiver-filtered envelope projection.
- Canonized FM uses the sinusoidal-FM Bessel-series line-power and receiver-filtered envelope projections; non-line adjacent bins retain the channel noise floor rather than a false occupied pedestal.
- The 2 kHz CW descriptor width is a nominal display-support floor for a mathematical line, not analyzer RBW or source occupied bandwidth. The 52 kHz AM descriptor width is the 50 kHz outer-sideband spacing plus that nominal 2 kHz display floor. Actual rendered line width follows the per-observation RBW and may extend beyond either nominal display-support field.
- Canonized detected-power synthesis uses the exact admitted sample period, exact requested integer-Hz receiver tune, and an explicit generator-internal 100 kHz receiver-filter width rather than a hidden clock, profile-center tune, or swept-spectrum bin width. The synthesis width is reproducibility provenance, not an observed or calibrated measurement RBW, and the service does not publish it as measurement evidence.
- Every canonized fixed-frequency profile applies its source-model occupied-band response at that tune; Bluetooth Classic and LE retain their time-varying hopping/advertising-channel receiver responses.
- Canonized LTE Band 38 is explicitly downlink-only UL/DL configuration 0 with normal-CP special-subframe configuration 7 and `srs-UpPtsAdd` absent. A special subframe contributes downlink energy only during its 21,952-`Ts` DwPTS; its 4,384-`Ts` guard period and 4,384-`Ts` UpPTS are inactive.
- Canonized NR n78 uses the versioned engineering schedule `nr-tdd-7dl-3ul-engineering-v1`: a valid 5 ms, 30 kHz-SCS `TDD-UL-DL-Pattern` selection with seven complete DL slots and three complete UL slots. It is not an n78 or deployment default.
- Canonized BLE primary advertising uses all three primary centers in sequential 37/38/39 order, 1.5 ms packet-start spacing, fixed 376 us packet duration, a 20 ms interval, and a seeded per-event pseudorandom `advDelay` in `[0, 10 ms)`. The sequence is standards-consistent for the modeled legacy all-three-channel event; configured subsets, early event closure, and extended advertising differ. The all-three use, timing, interval, and deterministic delay generator are engineering choices, not universal Bluetooth traffic or PDU behavior.
- Retained non-canonized standards-derived zero span uses an explicitly approximate descriptor-bounded occupied-band receiver response at the descriptor center. Frequency-unmapped `survey` zero span fails instead of inventing a center. This remains a visual projection, not a calibrated filter or conformance waveform.
- GSM and WLAN zero-span projections preserve burst behavior.
- Every accepted profile produces finite, correctly sized spectrum and zero-span arrays or fails.

## Assume/guarantee composition

### SignalLab→Atomizer measurement edge

Consumer assumption `A_A`: Atomizer constructs the in-process service with an exact version-1 contract and generator build identity, binds its own source/session evidence, permits one request in flight, and treats validation or state failure as terminal without retry or fallback.

Producer guarantee `G_M`: SignalLab returns bounded high-level swept-spectrum and detected-power results with exact source identity, opaque state correlation, declared units and `synthetic-visual-projection` qualification. It additionally exposes bounded deterministic complex-I/Q for all 34 closed profiles, with exact payload geometry, content digest, profile-dependent `analytic-complex-baseband` or `standards-derived-complex-baseband` qualification, and an explicit no-channel declaration. Standards-labelled envelopes are engineering projections, not packet-decodable or conformance vectors. It exposes no USB, firmware, serial, RF-generator, display, or touch identity or capability. Selected profile remains status-only.

Trio composition v4 proves this edge active only while `G_M => A_A` and the three repositories' v4 manifests remain byte-identical.

### SignalLab→Firmware edge

Consumer assumption `A_F`: a Firmware-owned sink explicitly accepts `SignalLabStimulusIntent.contractVersion = 1` and declares its lifecycle, timing, acknowledgement, and evidence behavior.

Producer guarantee `G_S`: SignalLab emits only a validated version-1 intent containing sequence, issue time, complete waveform descriptor, complete channel configuration, and qualification.

The edge may activate only when `G_S => A_F` is proven by a coordinated trio contract revision. The current sink status is `reserved-not-connected`, so the only valid composed result is no delivery. SignalLab never discovers a process, writes shared files, scrapes another window, opens a serial port, or impersonates USB.

### Repository ownership

- SignalLab owns synthetic measurement generation, the measurement contract and its in-process producer, waveform/profile/channel state, and stimulus intent.
- `Atom-Firmware` owns executable-twin state and the future intent sink.
- `Atom-Atomizer` owns Atomizer, its driver registry/manager, physical USB, factory-default preference, Atom, approvals, and instrument orchestration.
- `Atom-Flasher` independently owns firmware artifacts and physical update transactions. Its active interface catalog v3 retains active application contract v2 (`deviceContractVersion: 2`); interface catalog v2 and legacy application contract v1 are frozen. It is not a runtime-trio party.

No repository may reach into another repository's state directly or silently infer it. Cross-owner state changes occur only through the admitted versioned request, validation, response, and evidence boundary; ownership remains with the producer.

## Safety invariants

1. The catalog contains every declared ID exactly once and contains no undeclared ID.
2. A recommended span contains the occupied bandwidth.
3. A conformance claim requires an immutable admitted asset hash.
4. Channel configuration is closed and bounded.
5. Playback never claims calibrated RF emission.
6. SignalLab never identifies as a tinySA or USB device.
7. The active Atomizer measurement edge does not imply or activate the absent Firmware sink.
8. Failure never activates another profile, channel, driver, transport, or process.
9. Complex-I/Q capability is source-declared and driver-neutral. SignalLab admits one bounded `cf32le` complex envelope for every closed profile, while preserving analytic-laboratory versus standards-derived-engineering qualification; no current result claims RF calibration, packet decoding, protocol identity, conformance, continuous streaming, or NeptuneSDR support.
10. Standalone IPC is admitted only from the exact current main frame and renderer origin; packaged execution cannot select a development renderer, request an Electron permission, open a child window, or navigate to an untrusted URL.
11. The standalone content viewport is fixed at 520 × 709 CSS px, the measured no-scroll floor across all 34 collapsed profiles with Rayleigh controls.

## Liveness and failure algebra

Every local API request settles exactly once as a validated new status or an explicit error. Status subscriptions are removable and stop after teardown. Playback sequence is monotonic.

| Failure | Required result |
|---|---|
| Unknown profile | Reject before mutation |
| Invalid channel/range/seed | Reject before mutation |
| Missing descriptor/source | Fail catalog initialization |
| Non-finite synthesis | Reject the frame |
| Missing or mismatched complex-envelope generator for a closed profile | Reject without substituting another profile or qualification |
| Invalid I/Q rate, bandwidth, count, format, base64, byte geometry, or digest | Reject the request/result; never coerce, truncate, or substitute samples |
| Contract or generator build-identity mismatch | Terminate the measurement admission; no retry or fallback |
| Request after shutdown | Reject with `SERVICE_CLOSED`; no retry or fallback |
| Missing conformance asset | Refuse conformance promotion |
| Absent Firmware sink | Report `reserved-not-connected` |
| Version mismatch | Reject without downgrade |
| Future sink timeout/failure | Surface failure; never retry or reroute |

## Acceptance

`npm run check` must prove:

- Exactly 34 descriptors with family counts `1/2/7/10/6/6/2`.
- Every descriptor has a normalized non-empty source basis and valid range.
- Every profile produces finite spectrum output.
- Seeded AWGN is repeatable and evolves by sweep.
- Rayleigh fading is reproducible and measurably frequency-selective.
- Every public canonized observable profile is byte-identical to its shared corpus source under equal spectrum and detected-power geometry, seed, SNR, and look index. Tests independently vary swept-spectrum RBW and detected-power synthesis-filter width so one cannot silently substitute for the other.
- Every live descriptor and corpus source carries one immutable HTTPS reference per independently versioned document; combined specification names, aggregate revisions, duplicate references, and partial provenance URLs are rejected. The 12 public canonized descriptors and their corpus scenarios must carry the same source basis exactly.
- LTE/NR FDD/TDD and Bluetooth BR/EDR/LE profiles are explicit selectable capabilities with non-conformance and observable-equivalence disclosures.
- LTE special-subframe tests pin the exact normal-CP configuration-7 `Ts` partition and prove GP/UpPTS inactivity; NR and BLE tests pin their engineering-schedule versions and non-universal disclosures; n3 metadata pins the ordinary 100 kHz band-specific channel raster.
- FM adjacent noise has no false pedestal.
- GERAN/WLAN zero-span burst behavior is present.
- Detected-power requests require a bounded integer-Hz tune, capability advertises the exact 1 Hz grid, results echo the admitted tune, every canonized public profile changes under an out-of-band tune, and non-canonized zero span never silently ignores frequency.
- Status capability advertises complex-I/Q for all 34 closed profiles; deterministic generation produces finite `cf32le` samples with exact base64, byte geometry, and SHA-256 through the public service. CW/AM/FM retain `analytic-complex-baseband`; every standards-labelled profile retains `standards-derived-complex-baseband`.
- I/Q requests pin the center/rate/bandwidth/count bounds, advertise independent bandwidth, and enforce `bandwidthHz <= sampleRateHz`. Tests prove the exact steady-state -3 dB response, bandwidth-dependent spectra, bit-exact CW invariance, finite unit-peak maximum-size output, complete catalog generator coverage, and explicit non-conformance qualification for all standards-labelled envelopes. Replay channel state is never silently applied to the clean v1 buffer.
- Invalid conformance promotion fails.
- The in-process service and the public measurement contract interoperate through the exact build identity and every admitted method, typed and wire-shaped.
- Malformed input, out-of-bounds requests, shutdown, and post-shutdown calls settle once without retry or fallback.
- Generator outputs are bit-frozen by golden SHA-256 hashes; successive acquisitions advance the time coordinate while coordinate-zero goldens stay byte-identical.
- Exact renderer/WebContents/frame trust, strict IPC arity, permission denial, navigation denial, and production CSP are adversarially tested.
- Electron main/preload and renderer build from this repository alone.
- The validation-only Auto-v4 corpus pins four SHA-256-addressed competing-emission sweeps: both narrow/wide integrated-power orders, an exact deterministic tie, and a runtime-unavailable rank-0 winner with no lower-rank substitution. It remains outside the 34-profile catalog and all classifier likelihood, training, calibration, and model artifacts.

Cross-repository release additionally requires the byte-identical trio-v4 manifest check and real producer/consumer interoperation from `../Atom-Atomizer`. Activating the stimulus edge requires a new coordinated trio version and tests in both SignalLab and Firmware.

## Source traceability

| Contract | Source |
|---|---|
| Public API, profile/channel/descriptor schemas | `src/contracts.ts` |
| Atomizer measurement schemas and contract manifest | `src/measurement-contract.ts`, `contracts/signal-lab-measurement-bridge-v1.json` |
| Stateful in-process measurement source and platform-neutral bytes | `src/measurement-service.ts`, `src/platform-bytes.ts` |
| Catalog and standards clauses | `src/catalog.ts`, `src/source-provenance.ts` |
| Versioned LTE/NR/BLE timing choices | `src/canonical-timing.ts` |
| Spectrum/zero-span/channel synthesis | `src/waveforms.ts` |
| Profile-dependent complex-I/Q synthesis | `src/complex-iq.ts`, `src/geran-iq.ts`, `src/ofdm-iq.ts`, `src/bluetooth-iq.ts` |
| Provider-neutral standards preset/evidence schema | `src/standards-waveform.ts` |
| Auto-v4 integrated-excess selection fixtures | `src/auto-target-selection-corpus.ts`, `src/auto-target-selection-corpus.test.ts` |
| Standalone Electron boundary | `src/main-process.ts`, `src/preload.ts` |
| Reusable and standalone operator UI | `src/SignalLabStudio.tsx`, `src/DemoLab.tsx` |
| Contract evidence | `src/waveforms.test.ts`, `src/complex-iq.test.ts`, `src/geran-iq.test.ts`, `src/ofdm-iq.test.ts`, `src/bluetooth-iq.test.ts`, `src/standards-waveform.test.ts`, `src/measurement-service.test.ts`, `src/generator-goldens.test.ts` |
