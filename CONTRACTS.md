# TinySA SignalLab contract

Status: active standalone application and Atomizer measurement producer

- Standalone API version: `1`
- Atomizer measurement bridge version: `1`
- Stimulus-intent version: `1`

Trio composition: [`trio-composition-v4.json`](./contracts/trio-composition-v4.json)

Owner: this repository

SignalLab is the sole owner of waveform descriptors, the closed synthetic catalog, seeded channel models, playback state, high-level synthetic measurement generation, and future stimulus intent. It does not own USB or TinySA emulation, firmware execution, Atom policy, operator instrument selection, or lifecycle orchestration.

## Standalone application boundary

The public source boundary is `src/contracts.ts`:

- `SignalLabApi.version = 1`.
- `status()` returns immutable current state.
- `select(profile)` accepts one of exactly 88 profile IDs.
- `configureChannel(config)` accepts the closed AWGN/Rayleigh schema.
- `subscribe(listener)` delivers status changes and returns explicit unsubscription.
- `SignalLabStimulusIntent` is reserved for a future Firmware-owned sink.

Every request is runtime validated. Invalid input rejects before state change; no profile, channel, seed, asset, or sink is substituted.

## Atomizer measurement boundary

The separately built `dist/bridge/atomizer-bridge.js` implements [`contracts/signal-lab-measurement-bridge-v1.json`](./contracts/signal-lab-measurement-bridge-v1.json). Atomizer launches it behind the `signal-lab` driver as a high-level source; the bridge is never a byte transport or TinySA protocol peer.

Its UTF-8 NDJSON session is closed and bounded:

- The first stdout line is one exact `ready` declaration; stdout contains protocol messages only and stderr diagnostics only.
- Ready identity binds measurement contract version 1 plus exact contract, catalog, and shipped runtime-generator SHA-256 values.
- Claims are always `usbEmulated=false`, `firmwareExecuted=false`, and `rfEmitted=false`.
- The only methods are `status`, `select_profile`, `configure_channel`, `acquire_spectrum`, `acquire_detected_power`, and `shutdown`.
- Accepted requests execute serially, each request ID executes at most once, every admitted line receives one response (correlated whenever the bounded input exposes a valid request ID), and neither producer nor consumer retries.
- Every LF-delimited line and final unterminated fragment—including malformed, duplicate, oversized, and overloaded input—consumes the lifetime session-line budget and a reply obligation. At most 33 reply obligations exist at once; input pauses until blocked stdout releases one.
- Input chunks, lines, pending replies, queue depth, session lines, execution time, point counts, frequency, sample period, and response size are hard bounded.
- Detected-power capability declares `minimumFrequencyHz=1`, `maximumFrequencyHz=17922600000`, `frequencyStepHz=1`, and `frequencyUnit=Hz`. Every request supplies one safe-integer `centerFrequencyHz` in that range, synthesis is receiver-filtered at that exact tune, and the result returns the same integer exactly.
- Every measurement is complete, finite, unit-declared, qualified `synthetic-visual-projection`, and bound to an opaque session/configuration revision and monotonic sequence.
- Profile/channel changes replace the producer configuration revision. Atomizer invalidates its admitted acquisition configuration before any later acquisition.
- Selected profile, waveform label, and catalog state appear only in status; measurements never copy them into detector, classifier, or exported-observation evidence.

With no persisted Atomizer preference, `signal-lab` is Atomizer's factory default. SignalLab neither owns nor reads that preference. Ready, identity, framing, correlation, schema, timeout, or child-process failure terminates that admission attempt and cannot activate the physical ZS407 or Firmware twin.

## Closed catalog

| Family | Count | Qualification |
|---|---:|---|
| Tone | 1 | Visual |
| Analog AM/FM | 2 | Visual |
| GERAN canonized observable + EDGE normal-burst projections | 7 | Standards-derived |
| E-UTRA canonized FDD/TDD + Release 19 E-TM/sE-TM/N-TM projections | 27 | Standards-derived |
| NR canonized FDD/TDD + Release 19 FR1/N-TM/SBFD projections | 43 | Standards-derived |
| IEEE 802.11 canonized HR-DSSS/OFDM + 802.11ax HE PPDU projections | 6 | Standards-derived |
| Bluetooth BR/EDR + LE canonized observable projections | 2 | Standards-derived |
| Total | 88 | Closed |

Every descriptor carries a stable ID, label, family/model, center, occupied bandwidth, recommended span, resource/timing projection, one normalized source basis with an ordered per-document specification/clause/revision/HTTPS reference list, qualification, and disclosure.

`standards-derived` means a visual resource-allocation and timing projection. It is not bit-exact I/Q and is not a conformance vector. `conformance-validated` is impossible unless an immutable SHA-256 asset identity is present and independently admitted.

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
- Canonized detected-power synthesis uses the exact admitted sample period, exact requested integer-Hz receiver tune, and an explicit generator-internal 100 kHz receiver-filter width rather than a hidden clock, profile-center tune, or swept-spectrum bin width. The synthesis width is reproducibility provenance, not an observed or calibrated measurement RBW, and the bridge does not publish it as measurement evidence.
- Every canonized fixed-frequency profile applies its source-model occupied-band response at that tune; Bluetooth Classic and LE retain their time-varying hopping/advertising-channel receiver responses.
- Canonized LTE Band 38 is explicitly downlink-only UL/DL configuration 0 with normal-CP special-subframe configuration 7 and `srs-UpPtsAdd` absent. A special subframe contributes downlink energy only during its 21,952-`Ts` DwPTS; its 4,384-`Ts` guard period and 4,384-`Ts` UpPTS are inactive.
- Canonized NR n78 uses the versioned engineering schedule `nr-tdd-7dl-3ul-engineering-v1`: a valid 5 ms, 30 kHz-SCS `TDD-UL-DL-Pattern` selection with seven complete DL slots and three complete UL slots. It is not an n78 or deployment default.
- Canonized BLE primary advertising uses a versioned engineering schedule with fixed 37/38/39 center order, 1.5 ms packet-start spacing, fixed 376 us packet duration, a 20 ms interval, and a seeded per-event pseudorandom `advDelay` in `[0, 10 ms)`. These are not universal Bluetooth timing or channel-map requirements.
- Non-canonized standards-derived zero span uses an explicitly approximate descriptor-bounded occupied-band receiver response. Single-PRB profiles follow their deterministic swept allocation, while frequency-unmapped `survey` zero span fails instead of inventing a center. This remains a visual projection, not a calibrated filter or conformance waveform.
- GSM and WLAN zero-span projections preserve burst behavior.
- Every accepted profile produces finite, correctly sized spectrum and zero-span arrays or fails.

## Assume/guarantee composition

### SignalLab→Atomizer measurement edge

Consumer assumption `A_A`: Atomizer launches the separately built bridge and public contract as admitted regular files, accepts only an exact version-1 ready identity, binds its own source/session evidence, permits one request in flight, and treats protocol or process failure as terminal without retry or fallback.

Producer guarantee `G_M`: SignalLab returns only bounded high-level swept-spectrum and detected-power results with exact source identity, opaque state correlation, declared units and `synthetic-visual-projection` qualification. It exposes no USB, firmware, serial, RF-generator, display, touch, or complex-I/Q identity or capability. Selected profile remains status-only.

Trio composition v4 proves this edge active only while `G_M => A_A` and the three repositories' v4 manifests remain byte-identical.

### SignalLab→Firmware edge

Consumer assumption `A_F`: a Firmware-owned sink explicitly accepts `SignalLabStimulusIntent.contractVersion = 1` and declares its lifecycle, timing, acknowledgement, and evidence behavior.

Producer guarantee `G_S`: SignalLab emits only a validated version-1 intent containing sequence, issue time, complete waveform descriptor, complete channel configuration, and qualification.

The edge may activate only when `G_S => A_F` is proven by a coordinated trio contract revision. The current sink status is `reserved-not-connected`, so the only valid composed result is no delivery. SignalLab never discovers a process, writes shared files, scrapes another window, opens a serial port, or impersonates USB.

### Repository ownership

- SignalLab owns synthetic measurement generation, the measurement bridge, waveform/profile/channel state, and stimulus intent.
- `TinySA_Firmware` owns executable-twin state and the future intent sink.
- `TinySA` owns Atomizer, its driver registry/manager, physical USB, factory-default preference, Atom, approvals, and instrument orchestration.
- `TinySA_Flasher` independently owns firmware artifacts and physical update transactions. Its active interface catalog v3 retains active application contract v2 (`deviceContractVersion: 2`); interface catalog v2 and legacy application contract v1 are frozen. It is not a runtime-trio party.

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
9. Neither SignalLab nor TinySA's present drivers claim complex I/Q; NeptuneSDR remains a future Atomizer driver/contract evolution, not current support.
10. Standalone IPC is admitted only from the exact current main frame and renderer origin; packaged execution cannot select a development renderer, request an Electron permission, open a child window, or navigate to an untrusted URL.

## Liveness and failure algebra

Every local API request settles exactly once as a validated new status or an explicit error. Status subscriptions are removable and stop after teardown. Playback sequence is monotonic.

| Failure | Required result |
|---|---|
| Unknown profile | Reject before mutation |
| Invalid channel/range/seed | Reject before mutation |
| Missing descriptor/source | Fail catalog initialization |
| Non-finite synthesis | Reject the frame |
| Ready/hash/framing/correlation mismatch | Terminate the measurement session; no retry or fallback |
| Measurement timeout/process exit | Terminate the measurement session; no retry or fallback |
| Missing conformance asset | Refuse conformance promotion |
| Absent Firmware sink | Report `reserved-not-connected` |
| Version mismatch | Reject without downgrade |
| Future sink timeout/failure | Surface failure; never retry or reroute |

## Acceptance

`npm run check` must prove:

- Exactly 88 descriptors with family counts `1/2/7/27/43/6/2`.
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
- Detected-power requests require a bounded integer-Hz tune, ready advertises the exact 1 Hz grid, results echo the admitted tune, every canonized public profile changes under an out-of-band tune, and non-canonized zero span never silently ignores frequency.
- Invalid conformance promotion fails.
- The shipped bridge and public contract interoperate through the exact ready identity and every admitted method.
- Bridge bounds, duplicate IDs, malformed input, overload, timeout, shutdown and process exit settle once without retry or fallback.
- Permanently blocked stdout plus invalid, duplicate, oversized, or overloaded input cannot exceed the total reply-obligation bound.
- Exact renderer/WebContents/frame trust, strict IPC arity, permission denial, navigation denial, and production CSP are adversarially tested.
- Electron main/preload and renderer build from this repository alone.

Cross-repository release additionally requires the byte-identical trio-v4 manifest check and real producer/consumer interoperation from `../TinySA`. Activating the stimulus edge requires a new coordinated trio version and tests in both SignalLab and Firmware.

## Source traceability

| Contract | Source |
|---|---|
| Public API, profile/channel/descriptor schemas | `src/contracts.ts` |
| Atomizer measurement schemas and bridge manifest | `src/measurement-contract.ts`, `contracts/signal-lab-measurement-bridge-v1.json` |
| Stateful measurement source and bounded NDJSON process | `src/measurement-service.ts`, `src/measurement-bridge.ts`, `src/atomizer-bridge.ts` |
| Catalog and standards clauses | `src/catalog.ts`, `src/source-provenance.ts` |
| Versioned LTE/NR/BLE timing choices | `src/canonical-timing.ts` |
| Spectrum/zero-span/channel synthesis | `src/waveforms.ts` |
| Standalone Electron boundary | `src/main-process.ts`, `src/preload.ts` |
| Operator UI | `src/DemoLab.tsx` |
| Contract evidence | `src/waveforms.test.ts`, `src/measurement-service.test.ts`, `src/measurement-bridge.test.ts`, `src/atomizer-bridge.integration.test.ts` |
