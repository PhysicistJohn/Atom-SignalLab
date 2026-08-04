<p align="center"><img src="docs/brand/logo.jpg" alt="AtomOS SignalLab" width="520"></p>

# AtomOS SignalLab

AtomOS SignalLab is a standalone signal-generation lab: an Electron/Vite/TypeScript app that synthesizes deterministic CW, AM, FM, GERAN/EDGE, LTE, 5G NR, Wi-Fi, and Bluetooth reference signals, and doubles as the built-in simulated measurement source for [Atom-Atomizer](https://github.com/PhysicistJohn/Atom-Atomizer). It was built to exercise the Atomizer end to end before any hardware arrived, and it remains the Atomizer's factory-default signal source.

SignalLab owns the closed waveform catalog, seeded AWGN/Rayleigh scalar replay-channel models, swept-spectrum and detected-power synthesis, and bounded complex-envelope (I/Q) generation. Its I/Q path also provides selectable seeded receiver scenarios for AWGN, multipath, carrier offset, phase noise, I/Q imbalance, DC offset, PA compression, and a composite stress case. SignalLab never impersonates a USB instrument, executes firmware, or emits RF.

## Run

Requirements: Node.js 22.23.1 and npm 10.9.8 (the versions pinned by CI), plus
two sibling checkouts next to this repository:

- `../Atom-DSP` at tag `v0.1.0`, installed and built. Supplies the numerical
  kernels the app builds against.
- `../Atom-Classifier` at commit `4e281ff9ce7d4444bb941f81de793c48ad6634ec`.
  `src/reference-iq.test.ts` imports `src/embedding/recover.js` from it, so
  `npm run typecheck` and `npm test` both fail without it. No install or build
  is needed for that checkout.

Those are the exact refs `.github/workflows/ci.yml` checks out. From the parent
directory of this repository:

```bash
git clone --branch v0.1.0 https://github.com/PhysicistJohn/Atom-DSP.git Atom-DSP
git clone https://github.com/PhysicistJohn/Atom-Classifier.git Atom-Classifier
git -C Atom-Classifier checkout 4e281ff9ce7d4444bb941f81de793c48ad6634ec
```

Then, back in this repository:

```bash
npm --prefix ../Atom-DSP ci
npm --prefix ../Atom-DSP run build
npm ci
npm run check   # typecheck + build + all tests
npm run dev     # Vite + Electron development window
```

`npm run dev:install-app` installs the reusable development launcher app on macOS. `npm run package:mac`, `package:win`, and `package:linux` build installers with electron-builder.

The standalone Electron window admits privileged IPC only from its exact current main frame and selected file or development origin. Packaged execution ignores `VITE_DEV_SERVER_URL`, all Electron permission requests and child windows are denied, and packaged HTML contains no development network origin.

The window uses a fixed 520 x 709 CSS-pixel content area. That is the measured minimum that keeps every one of the 44 collapsed profile views, including the largest provenance set with channel and receiver-I/Q controls, free of a catalog scrollbar.

## Atomizer integration

Atomizer's `signal-lab` driver imports SignalLab's `AtomizerMeasurementService` (`src/measurement-service.ts`) directly and runs it in process, in both the desktop and browser editions. The producer is platform neutral: `src/platform-bytes.ts` supplies pure-JS SHA-256 and base64 that are byte-identical to `node:crypto`, including for cross-realm typed arrays. [`contracts/signal-lab-measurement-bridge-v3.json`](./contracts/signal-lab-measurement-bridge-v3.json) is the only active measurement contract. The earlier NDJSON/subprocess v1 and bridge v2 documents are retained as immutable history and are not runtime compatibility modes.

The service exposes `status`, `selectProfile`, `configureChannel`, `acquireSpectrum`, `acquireDetectedPower`, and `acquireIq`. Every request is schema validated; invalid input rejects before any state change. Source identity always claims `usbEmulated=false`, `firmwareExecuted=false`, and `rfEmitted=false`. Detected-power capability declares an exact 1 through 17,922,600,000 Hz range in 1 Hz steps; every request supplies a safe-integer `centerFrequencyHz`, synthesis is receiver-filtered at that exact tune, and the result returns that requested center exactly. Swept-spectrum and detected-power results are qualified `synthetic-visual-projection`; complex-I/Q results are separately qualified as described below. Measurements carry only observables, opaque session/configuration correlation, and source provenance. Profile identity is visible in status but is never copied into measurement, detector, classifier, or exported-observation evidence.

Per the cross-repository v7 composition contract, Atomizer's factory default source is `signal-lab` with no fallback; SignalLab neither owns nor reads that preference. Atomizer binds the parsed v3 contract hash and catalog hash. `generatorContractBindingSha256` binds the in-process generator domain to that contract hash; it is deliberately not a claim about generator code identity.

The separate SignalLab-to-Firmware integration surface is the versioned `SignalLabStimulusIntent` (`src/contracts.ts`). The [Atom-Firmware](https://github.com/PhysicistJohn/Atom-Firmware) repository will own any sink that applies that intent; the sink remains `reserved-not-connected`.

## Catalog

The catalog contains exactly 44 profiles, and every one has a machine-validated governance record:

- 31 fixed standards-linked profiles have content-addressed digital-baseband artifacts and passing independent-oracle evidence for their exact declared scope: 7 GERAN, 9 E-UTRA/LTE, 7 NR, 6 IEEE 802.11, and 2 Bluetooth.
- 2 Bluetooth long-dwell compositions reuse qualified packet content on an unbounded deterministic timeline. They have native 80 MHz geometry but no canonical artifact, cyclic period, or terminal capture bound; their qualification remains `standards-derived-complex-baseband`.
- 3 operator-configurable builders (`custom-lte`, `custom-nr`, and `custom-wifi`) are standards-constrained configuration tools, not fixed qualified waveforms.
- 8 SignalLab mathematical references (`cw`, `am`, `fm`, and five PSK/QAM references) have no unique governing waveform standard, so standards adherence is not applicable.

The applicable technical bodies are 3GPP TSG RAN, the IEEE Standards Association / IEEE 802.11 Working Group, and the Bluetooth SIG Core Specification Working Group. SignalLab governs only the eight mathematical references. The complete per-profile matrix, exact clauses, artifact hashes, evidence hashes, and test commands are in [`docs/STANDARDS_GOVERNANCE.md`](./docs/STANDARDS_GOVERNANCE.md).

“Digitally qualified” here is deliberately narrow. It means that the exact fixed clean `cf32le` artifact is bound by SHA-256 and its declared digital construction passed the named independent oracle. It does not mean that SignalLab, a technology family, an arbitrary configuration, or a device is broadly standards compliant. Every governance record therefore keeps `standardsCompliance=not-claimed` and `rfConformance=not-qualified`; no conducted-RF, radiated/OTA, interoperability, regulatory, Wi-Fi Alliance, Bluetooth product-qualification, or 3GPP device-certification claim is made.

## Complex I/Q v3

`acquireIq` is a deliberately bounded complex-envelope boundary, not a generic standards waveform or packet generator:

- All 44 closed catalog profiles are admitted. Each of the 31 fixed standards-linked profiles declares an immutable artifact, native sample rate, signal bandwidth, digital-envelope reference center, native carrier offset, and cyclic period or one-shot limit. A clean capture retains exact native digital qualification only when rate, exact phase, and admitted RF tuning preserve those bytes. A hardware-ready derivation gets new bytes, a new digest, an explicit transform receipt, and derived lineage rather than canonical byte identity. The two Bluetooth long-dwell compositions declare unbounded native-rate replay without a canonical artifact, cyclic period, or terminal capture bound and retain `standards-derived-complex-baseband`; the three builders return `standards-derived-complex-baseband`; the eight mathematical references return `analytic-complex-baseband`.
- The only sample format is little-endian interleaved `cf32le`, encoded as canonical base64 with an exact SHA-256 digest and exactly eight bytes per complex sample.
- `sampleCount` is 1 through 65,536; `sampleRateHz` is 1,000,000 through 491,520,000; `centerHz` is 1 through 17,922,600,000. All are safe integers.
- `captureBandwidthHz` is a safe integer from 1,000 through 491,520,000 Hz, may not exceed the output rate, and must contain the separately reported `signalBandwidthHz`. It is a capture/output setting, never a hidden filter. Actual downsampling is admitted only when the resampler's 95%-of-output-Nyquist passband contains the signal bandwidth; equal-rate fractional delay and upsampling preserve the full source Nyquist interval.
- The requested `centerHz` is RF placement metadata, not part of the immutable digital byte identity and not a sampled absolute RF carrier. `profileReferenceCenterHz`, `rfReferenceCenterHz`, native/output carrier offsets, and `rfTuneCenterHz` make the mapping explicit. Bluetooth's artifact carrier offset is therefore translated to DC only when a derived output requires it; admissible exact-native placement keeps the artifact bytes unchanged.
- Every result includes a deterministic receipt with the exact rational source-time coordinate, complete FIR/source support, continuous/cyclic/one-shot boundary policy, source and output hashes, carrier offsets, and ordered translation, resampling, fractional-delay, and receiver-impairment operations. Unbounded long-dwell profiles use `continuous-session-origin-zero-extended`, no source artifact, and no period. Fractions that cannot be represented deterministically fail before synthesis or state change.
- Successive acquisitions advance an exact rational elapsed-time cursor for analytic, builder, cyclic fixed, and unbounded long-dwell profiles; output-rate changes do not change elapsed time. Cyclic artifacts wrap their declared native period. One-shot Bluetooth re-acquisition starts from the same bounded artifact and zero-extends only outside it for declared FIR support; unbounded long-dwell output zero-extends only negative derived FIR preroll before session origin.
- The scalar AWGN/Rayleigh setting remains specific to spectrum and detected-power replays. A receiver-I/Q impairment explicitly downgrades any fixed artifact to `receiver-impaired-complex-baseband`; it cannot inherit the content-bound claim. Every result declares `receiverImpairment`, `channelApplication`, representation, normalization, and the profile-dependent qualification.

This is an I/Q interface. It does not need an antenna qualification: `hardware-ready` means only that the digital rate, carrier placement, and finite buffer are explicit and reproducible. DAC behavior, reconstruction filtering, analog gain, antenna coupling, radiated power, RF conformance, and product certification remain outside SignalLab's claim.

The AM vector is full-carrier DSB with a 25 kHz message and 0.72 modulation index. The FM vector uses a 25 kHz message and ±75 kHz deviation. These closed forms are deterministic laboratory stimuli; they are not broadcast-service profiles, RF calibration, protocol, or standards-conformance evidence.

The five constellation references use SignalLab-defined direct symbol-state indexing (natural, non-Gray level indexing on each square-QAM axis), a fixed 7 Msym/s rate, an RRC pulse with beta 0.35 truncated to ±8 symbols, and intrinsic deterministic complex AWGN at 40 dB SNR. Their 9.45 MHz catalog field is the nominal `7 Msym/s × (1 + 0.35)` raised-cosine support before finite-span truncation, broadband noise, and downstream receiver filtering; it is not measured, 99%-power, necessary, or regulatory occupied bandwidth. “Clean I/Q” means that no additional receiver-impairment preset is applied; it does not remove the reference generator's declared intrinsic 40 dB dither.

Each fixed standards-linked acquisition preserves the hash-bound source as a separate identity. Exact clean native bytes may retain the declared digital qualification; resampling, fractional delay, carrier translation, or receiver impairment produces a separately hashed result whose qualification says what was derived. RF-center metadata alone neither qualifies nor disqualifies the bytes. Qualification applies to the digital source construction—not to the scalar spectrum renderer or to downstream RF hardware. The GERAN component fixtures begin at frozen modulator-input fields where stated; the E-UTRA/NR narrowband component fixtures omit their declared host/composite context; the WLAN artifacts stop at their declared ideal complex-chip or complex-baseband interface; and the Bluetooth artifacts use ideal analytic GFSK. Those boundaries are part of the claim, not footnotes.

## Tx streaming (host tooling)

`acquireIq` remains the bounded measurement boundary. Separately, SignalLab ships a host-tooling Tx sample stream under [`contracts/signal-lab-tx-stream-v1.json`](./contracts/signal-lab-tx-stream-v1.json) for feeding operator transmit hardware. It is not an instrument contract, registers no Atomizer-facing capability, and does not change `acquireIq`. Streamed bytes carry their source qualification unchanged; emission responsibility sits with the operator and their hardware, and no RF, conformance, or calibration claim is created. Full capability matrix, recipe ledger, rate planner rules, and the live Tx runbook are in [`docs/TX_STREAMING.md`](./docs/TX_STREAMING.md) and [`docs/LIVE_TX_RUNBOOK.md`](./docs/LIVE_TX_RUNBOOK.md).

Build and use the CLI:

```bash
npm run build:tx-stream
# file sink (cf32le or --format ci16le)
node tools/tx-stream.mjs --profile gsm-900-loaded-bcch --samples 3000 --sink file:gsm.iq.cf32le
# a natural (unbounded, seeded, scheduled) timeline recipe
node tools/tx-stream.mjs --recipe lte-band3-operational-v1 --duration-seconds 1 --sink file:lte.iq.cf32le
# stdout pipe, or the Neptune P210 device sink
node tools/tx-stream.mjs --profile cw --unbounded --sink stdout
node tools/tx-stream.mjs --profile gsm-900-loaded-bcch --rate 2083333 --samples 65536 --sink iiod --uri ip:10.0.0.250 --attenuation-db 10
# inspect the resolved plan + rate-planner verdict without streaming
node tools/tx-stream.mjs --profile lte-band3-fdd-20m --rate 15360000 --unbounded --sink stdout --plan-only
```

The rate planner publishes the feasibility arithmetic instead of hiding it. For the Neptune P210 (live unit, AD9361): the device sample-rate window is 2,083,333–61,440,000 samples/s, the TX RF-bandwidth ceiling is 40 MHz, and the measured host-link ceiling is about 19.3 MB/s (≈4.825 Msps of ci16le). Wideband profiles cannot stream live over that link: LTE-20M and Wi-Fi-20M are inside the device sample-rate window and may use device-loop (cyclic) transmission or file/stdout sinks, while NR-n78 (122.88 MS/s) and the 80 MHz Bluetooth long-dwell compositions exceed the device window and are file/stdout sinks only. The QEMU twin (`Atom-NeptuneSDR-Twin`) provides a dry-run IIOD target; its byte accounting is a rehearsal, not live-hardware evidence.

### Exact 3GPP evidence lane

All 23 fixed 3GPP-linked catalog profiles now use content-addressed exact digital artifacts: 7 GERAN, 9 E-UTRA/LTE, and 7 NR. The suite checks complete fixed constructions at the applicable boundary—among them all samples and resource elements for the LTE/NR frame lanes, every GERAN component sample, pinned coding or constellation oracles, and retained evidence-file hashes. Each LTE E-TM3 variant is checked across all 84,000 resource elements and all 153,600 OFDM samples by a separately structured full-frame oracle. Five GERAN higher-order profiles, three narrowband/composite presentations, and the Band 38 downlink fixture are explicitly component fixtures; their evidence does not silently claim omitted coding, host placement, relative power, or a named test model.

The earlier Release 19 promotion framework and its `standards-runtime` LTE E-TM 1.1 provider remain useful fail-closed infrastructure, but broad manifest promotion is a different claim from the catalog's content-bound digital qualification. Neither path claims RF, OTA, a certified product, or “all of 3GPP.”

Run `npm run test:standards:structural` for repository-owned structural, hash, and internal-oracle checks. After supplying the documented pinned external checkouts, binaries, vectors, scripts, reports, and archives, `npm run test:standards:live` makes every srsRAN, py3gpp/NumPy, OCUDU, gr-ieee802-11, and official-archive lane mandatory; missing evidence fails rather than skips. [`docs/3GPP_COMPLIANCE.md`](./docs/3GPP_COMPLIANCE.md) records the exact cellular boundary and commands; [`docs/STANDARDS_GOVERNANCE.md`](./docs/STANDARDS_GOVERNANCE.md) is the complete 44-profile ledger.

## Canonical classification corpus

`src/waveforms.ts` owns the executable definitions and synthesis kernel shared by the public canonized observable profiles and `src/classification-corpus.ts`. Corpus v13 canonizes deterministic scalar observations for Bayesian detector/classifier development, including CW, physical DSB full-carrier AM sideband ratios, Bessel-series FM, standards-parameterized heuristic projections of GSM, LTE FDD/TDD, NR FDD/TDD, Wi-Fi DSSS/OFDM and Bluetooth Classic/LE, plus corpus-only explicit hard negatives. These hand-built power projections are not conformance waveforms. Every scenario records truth class, parameters, seed, acquisition settings, and a non-conformance disclosure. Its source provenance is an ordered per-document reference list: independently versioned 3GPP specifications never share an invented aggregate revision or a URL that resolves only half of the stated basis. Live profile identity remains status-only and never enters the shared measurement evidence or classifier.

Version 13 retains the explicit TDD and LE timing choices introduced in v11. It also separates swept-spectrum bin-equivalent RBW from the generator-internal receiver-filter width used for detected-power synthesis. Public replays and the corpus both pin that synthesis width to 100 kHz, record it for reproducibility, and never represent it as observed or calibrated measurement metadata. The LTE Band 38 scalar projection is downlink-only UL/DL configuration 0 with normal downlink/uplink cyclic prefixes and special-subframe configuration 7 (`srs-UpPtsAdd` absent): DwPTS is 21,952 `Ts`, while GP and UpPTS are 4,384 `Ts` each. Guard and UpPTS time is never modeled as downlink energy. The separate fixed n78 complex-I/Q artifact covers the required 20 ms (two radio frames) and repeats the TS 38.141-1 Table 4.9.2.2-1 five-millisecond pattern four times: seven full downlink slots, one mixed slot with six downlink and four uplink symbols, and two full uplink slots per repetition. The corpus's scalar power projection remains non-decodable and cannot inherit that digital claim. The BLE engineering schedule uses all three primary centers in sequential 37-to-38-to-39 order plus a seeded per-event pseudorandom 0 to 10 ms `advDelay`. That sequence is standards-consistent for the modeled legacy all-three-channel event; configured subsets, early event closure, and extended advertising differ. Its all-three use, packet timing, interval, and deterministic delay generator are engineering choices, not universal Bluetooth traffic or PDU behavior. The n3 `carrierRasterHz` metadata is the ordinary 100 kHz band-specific channel raster, not the 5 kHz global NR-ARFCN step.

The catalog's 2 kHz CW width is a nominal display-support floor for a mathematical line, not analyzer RBW or source occupied bandwidth. The 52 kHz AM width is the 50 kHz outer-sideband spacing plus that nominal 2 kHz display floor. Actual rendered line width follows each observation's RBW and may extend beyond those nominal display-support fields.

The hard-negative set includes independent regular and irregular CW groups, stationary intermittent 2.4 GHz activity, a simultaneous full-band raster, four time-interleaved independent sources, and proprietary off-raster FHSS. The latter two are deliberately declared observationally compatible with the Bluetooth activity leaf: scalar frequency agility cannot establish protocol or emitter identity. Simultaneous lines likewise cannot establish a shared emitter, oscillator, modulation process, or message identity.

The v13 corpus also contains byte-for-byte scalar-equivalence null pairs: a receiver spur versus CW, coherent independent tones versus DSB-FC AM, an independent Bessel-weighted comb versus FM, generic OFDM versus LTE/NR or Wi-Fi-shaped projections, and proprietary DSSS versus HR-DSSS. A classifier is correct, not mistaken, when it returns the declared equivalence class for either member of one of these pairs.

The Bayesian scalar-classification corpus intentionally emits only swept power and detected-power zero span. The separate live `acquireIq` method does not enter that Bayesian pipeline and never exposes selected-profile state as evidence; its returned I/Q can be classified independently by Atomizer's deployed embedding classifier. The physics/standards-derived projections verify inference code and observable equivalence behavior, while real-world probability calibration still requires session-grouped physical captures.

## Auto-v4 target-selection validation corpus

`src/auto-target-selection-corpus.ts` is a separate, validation-only corpus for Atomizer's current-source-sweep integrated-excess target policy. Its four content-addressed analytic cases prove a higher-peak narrow component losing to greater wideband integrated excess, the inverse winner, an exact power tie with stable tie keys, and a runtime-unavailable rank-0 winner blocking without a rank-1 fallback. Each case pins complete sweep geometry, linear-milliwatt component composition, source/disclosure, readiness, expected rank/outcome, and SHA-256 identities. These fixtures never enter the 44-profile operator catalog, the Bayesian classification corpus, likelihoods, training, calibration, or model artifacts.

## Part of the AtomOS suite

SignalLab is one of nine AtomOS repositories:

- [Atom-Atomizer](https://github.com/PhysicistJohn/Atom-Atomizer): AI-native spectrum analyzer application.
- [Atom-Classifier](https://github.com/PhysicistJohn/Atom-Classifier): deployed local embedding classifier plus retained Bayesian RF research pipeline.
- [Atom-DSP](https://github.com/PhysicistJohn/Atom-DSP): dependency-free numerical kernels and cross-language conformance vectors.
- [Atom-Firmware](https://github.com/PhysicistJohn/Atom-Firmware): reproducibly built tinySA firmware research and modernization.
- [Atom-Flasher](https://github.com/PhysicistJohn/Atom-Flasher): fail-closed firmware flasher.
- [Atom-NeptuneSDR-Twin](https://github.com/PhysicistJohn/Atom-NeptuneSDR-Twin): QEMU-backed firmware-executing digital twin of the NeptuneSDR/HAMGEEK P210.
- [Atom-SignalLab](https://github.com/PhysicistJohn/Atom-SignalLab): 3GPP and reference signal generation.
- [Atom-TinySA-Twin](https://github.com/PhysicistJohn/Atom-TinySA-Twin): Renode digital twin booting real ZS407 firmware.
- [Atom-Website](https://github.com/PhysicistJohn/Atom-Website): product site.

## Further reading

See [CONTRACTS.md](./CONTRACTS.md) for the standalone API, measurement contract, synthesis guarantees, failure algebra, and acceptance evidence. [docs/STANDARDS_GOVERNANCE.md](./docs/STANDARDS_GOVERNANCE.md) is the complete 44-profile authority, clause, artifact, evidence, and limitation ledger; [docs/3GPP_COMPLIANCE.md](./docs/3GPP_COMPLIANCE.md) expands the cellular claim boundary. [STANDARDS_IQ_ROADMAP.md](./STANDARDS_IQ_ROADMAP.md) describes the provider-neutral framework. The active byte-identical cross-repository composition is [contracts/trio-composition-v7.json](./contracts/trio-composition-v7.json); v4, v5, and v6 remain immutable history.
