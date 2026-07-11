# TinySA SignalLab contract

Status: active standalone application

Contract version: `1`

Trio composition: [`trio-composition-v1.json`](./contracts/trio-composition-v1.json)

Owner: this repository

SignalLab is the sole owner of waveform descriptors, the closed synthetic catalog, seeded channel models, playback state, and future stimulus intent. It does not own instrument emulation, USB, Atom policy, or operator-device orchestration.

## Public boundary

The public source boundary is `src/contracts.ts`:

- `SignalLabApi.version = 1`.
- `status()` returns immutable current state.
- `select(profile)` accepts one of exactly 79 profile IDs.
- `configureChannel(config)` accepts the closed AWGN/Rayleigh schema.
- `subscribe(listener)` delivers status changes and returns explicit unsubscription.
- `SignalLabStimulusIntent` is reserved for a future Firmware-owned sink.

Every request is runtime validated. Invalid input rejects before state change; no profile, channel, seed, asset, or sink is substituted.

## Closed catalog

| Family | Count | Qualification |
|---|---:|---|
| Tone | 1 | Visual |
| Analog AM/FM | 2 | Visual |
| GERAN/EDGE normal-burst projections | 6 | Standards-derived |
| E-UTRA Release 19 E-TM/sE-TM/N-TM projections | 25 | Standards-derived |
| NR Release 19 FR1/N-TM/SBFD projections | 41 | Standards-derived |
| IEEE 802.11ax HE PPDU projections | 4 | Standards-derived |
| Total | 79 | Closed |

Every descriptor carries a stable ID, label, family/model, center, occupied bandwidth, recommended span, resource/timing projection, source organization/specification/clause/revision/URL, qualification, and disclosure.

`standards-derived` means a visual resource-allocation and timing projection. It is not bit-exact I/Q and is not a conformance vector. `conformance-validated` is impossible unless an immutable SHA-256 asset identity is present and independently admitted.

## Channel and playback guarantees

Assumptions:

- Frequencies are safe integer hertz.
- Power values are finite dBm.
- Sweep point grids are finite, ordered, and within the declared range.
- Channel seeds are integers from 1 through `0xffffffff`.

Guarantees:

- AWGN output is derived from a seeded complex-Gaussian periodogram plus bounded receiver ripple and stable low-level spurs.
- Rayleigh output adds reproducible correlated frequency-selective fading rather than relabeling AWGN.
- Equal profile, channel, point grid, seed, and sweep index produce equal output.
- A changed sweep index evolves the live replay.
- AM varies envelope amplitude across replay time.
- FM moves carrier energy laterally through its deviation; non-line adjacent bins retain the channel noise floor rather than a false occupied pedestal.
- GSM and WLAN zero-span projections preserve burst behavior.
- Every accepted profile produces finite, correctly sized spectrum and zero-span arrays or fails.

## Assume/guarantee composition

### SignalLab→Firmware edge

Consumer assumption `A_F`: a Firmware-owned sink explicitly accepts `SignalLabStimulusIntent.contractVersion = 1` and declares its lifecycle, timing, acknowledgement, and evidence behavior.

Producer guarantee `G_S`: SignalLab emits only a validated version-1 intent containing sequence, issue time, complete waveform descriptor, complete channel configuration, and qualification.

The edge may activate only when `G_S => A_F` is proven by a coordinated trio contract revision. The current sink status is `reserved-not-connected`, so the only valid composed result is no delivery. SignalLab never discovers a process, writes shared files, scrapes another window, opens a serial port, or impersonates USB.

### Repository ownership

- SignalLab owns stimulus intent.
- `TinySA_Firmware` owns executable-twin state and the future intent sink.
- `TinySA` owns Atomizer, physical USB, Atom, approvals, and instrument orchestration.

No repository may mutate or silently infer another repository’s state.

## Safety invariants

1. The catalog contains every declared ID exactly once and contains no undeclared ID.
2. A recommended span contains the occupied bandwidth.
3. A conformance claim requires an immutable admitted asset hash.
4. Channel configuration is closed and bounded.
5. Playback never claims calibrated RF emission.
6. SignalLab never identifies as a tinySA or USB device.
7. The absent sink remains visibly absent.
8. Failure never activates another profile, channel, transport, or process.

## Liveness and failure algebra

Every local API request settles exactly once as a validated new status or an explicit error. Status subscriptions are removable and stop after teardown. Playback sequence is monotonic.

| Failure | Required result |
|---|---|
| Unknown profile | Reject before mutation |
| Invalid channel/range/seed | Reject before mutation |
| Missing descriptor/source | Fail catalog initialization |
| Non-finite synthesis | Reject the frame |
| Missing conformance asset | Refuse conformance promotion |
| Absent Firmware sink | Report `reserved-not-connected` |
| Version mismatch | Reject without downgrade |
| Future sink timeout/failure | Surface failure; never retry or reroute |

## Acceptance

`npm run check` must prove:

- Exactly 79 descriptors with family counts `1/2/6/25/41/4`.
- Every descriptor has a source clause and valid range.
- Every profile produces finite spectrum output.
- Seeded AWGN is repeatable and evolves by sweep.
- Rayleigh fading is reproducible and measurably frequency-selective.
- AM and FM replay behaviors are distinct and visible.
- FM adjacent noise has no false pedestal.
- GERAN/WLAN zero-span burst behavior is present.
- Invalid conformance promotion fails.
- Electron main/preload and renderer build from this repository alone.

Cross-repository release additionally requires the byte-identical trio manifest check from `../TinySA`. Activating the stimulus edge requires new tests in both SignalLab and Firmware.

## Source traceability

| Contract | Source |
|---|---|
| Public API, profile/channel/descriptor schemas | `src/contracts.ts` |
| Catalog and standards clauses | `src/catalog.ts` |
| Spectrum/zero-span/channel synthesis | `src/waveforms.ts` |
| Standalone Electron boundary | `src/main-process.ts`, `src/preload.ts` |
| Operator UI | `src/DemoLab.tsx` |
| Contract evidence | `src/waveforms.test.ts` |
