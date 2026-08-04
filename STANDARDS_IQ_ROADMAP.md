# Standards and complex-I/Q roadmap

Status: all 31 fixed standards-linked catalog profiles now have immutable
`cf32le` digital artifacts and independent evidence for their exact declared
scope. The separate provider-neutral, fail-closed 3GPP promotion framework and
its callable LTE E-TM 1.1 runtime lane also remain implemented. Neither path
claims broad standards compliance, conducted-RF conformance, radiated/OTA
conformance, antenna behavior, or product certification.

## Product boundary

SignalLab Studio is one controlled UI used in two shells. Standalone SignalLab
owns local lifecycle and state; Atomizer embeds the same `SignalLabStudio` when
the admitted source exposes the SignalLab feature. The six family tabs are
`LAB`, `GSM`, `LTE`, `5G NR`, `WI-FI`, and `BLUETOOTH`. Atomizer remains the
instrument/session owner and sends profile and channel changes through its
versioned driver boundary. Direct imports share the view; they do not create a
second bridge, hidden state channel, or cross-repository mutation path.

Complex-I/Q is likewise a driver-neutral Atomizer acquisition shape rather than
a SignalLab special case. SignalLab measurement contract v3 returns one bounded,
complete `cf32le` buffer for any of the 44 profiles and advertises an ordered
per-profile transport record. Each fixed record declares its digital-envelope
reference center, native carrier offset, native sample rate, signal bandwidth,
and cyclic period or one-shot limit; the two unbounded Bluetooth long-dwell
composition records declare native 80 MHz geometry with no canonical artifact,
cyclic period, or one-shot limit. The 11 analytic/builder records declare
state-free continuous generation at the requested output rate.

`captureBandwidthHz` is distinct from the profile's `signalBandwidthHz` and
never activates a hidden I/Q filter. Exact native fixed bytes remain immutable.
When output rate, fractional phase, or carrier placement requires a
hardware-ready derivation, the result receives new bytes and a deterministic
receipt. Downsampling uses an explicit Blackman-windowed sinc only when its
95%-of-output-Nyquist passband contains the signal bandwidth; equal-rate
fractional delay and upsampling preserve source Nyquist. Requested RF center is
placement metadata and not artifact identity. Chunking, continuous streaming,
backpressure, cancellation, and overrun reporting on the Atomizer measurement
edge still require a later Atomizer-facing instrument streaming contract
(streaming v2 and a new trio version). SignalLab's separately versioned
`signal-lab-tx-stream-v1` surface is a host-tooling sample-stream boundary for
operator transmit hardware; it does not change `acquireIq`, registers no
Atomizer-facing capability, and is not an instrument contract. Streaming creates
no RF emission, conformance, or calibration claim; emission responsibility sits
with the operator and their hardware, and `standardsCompliance` remains
`not-claimed` while `rfConformance` remains `not-qualified`.

The provider-runtime LTE artifact lane is a separate generation and promotion
path. It does not silently replace, qualify, or promote an `acquireIq` catalog
profile.

## What works now

| Family or lane | Studio catalog | Scalar replay | Complex-I/Q |
|---|---|---|---|
| Lab (CW/AM/FM plus five references) | Yes | Visual projection | 8 state-free analytic `cf32le` sources at the output rate; `analytic-complex-baseband` |
| GSM / GERAN | Yes | Standards-derived visual projection | 7 immutable fixed artifacts with exact digital-scope evidence; native or explicitly derived output |
| LTE / E-UTRA catalog | Yes | Standards-derived visual projection | 9 immutable fixed artifacts plus one builder; fixed native bytes are independently verified for declared scope |
| 5G NR | Yes | Standards-derived visual projection | 7 immutable fixed artifacts plus one builder; fixed native bytes are independently verified for declared scope |
| WLAN / Wi-Fi | Yes | Standards-derived visual projection | 6 immutable fixed artifacts plus one builder; fixed native bytes are independently verified for declared scope |
| Bluetooth | Yes | Standards-derived visual projection | 2 immutable one-shot fixed artifacts with explicit native carrier offsets and limits, plus 2 unbounded long-dwell engineering compositions (native 80 MHz, no canonical artifact) |
| Fixed LTE E-TM 1.1 artifact lane | Not a catalog replacement | Not applicable | Content-addressed one-frame `cf64le` artifact; provider qualification remains `reference-generated` |

The current `acquireIq` producer therefore has four source categories: 31
content-bound fixed digital artifacts, 2 unbounded composition timelines
without a canonical artifact, three standards-constrained builders, and eight
mathematical references (31 + 2 + 3 + 8 = 44). Independent digital
qualification attaches only to exact clean native artifact bytes. Resampling,
fractional delay, carrier translation, or receiver impairment produces a
separately hashed derived result and cannot inherit exact-byte qualification.
No category implies packet decoding, RF calibration, antenna qualification,
broad technology compliance, or product certification.

The fixed standards preset `lte-etm-1-1-10mhz-fdd` is revision `2.0.0`: LTE
E-TM 1.1, 10 MHz FDD, 50 resource blocks, 15 kHz subcarrier spacing, normal
cyclic prefix, antenna port 0, physical cell ID 1, and one radio frame. The
frame starts at SFN 0/slot 0, lasts 10 subframes or 10 ms, and contains 153,600
complex samples at 15.36 Msamples/s. Its full 140-symbol by 600-subcarrier grid
contains CRS, PSS, SSS, PBCH, PCFICH, PHICH, PDCCH, and full-allocation QPSK
PDSCH. Its fixed inputs include PBCH zeros, zero PHICH indicators, five
all-zero PDCCH inputs, all-zero PDSCH input bits at RNTI 0, and CFI 1 for
PCFICH. E-TM selects one layer on antenna port 0 and
`transmission.precoding=false`. The invoked TS 36.211 single-port layer-mapping
and precoding equations are explicit checked identity stages: finite channel
symbols pass through component-for-component unchanged.

The fixed provider recipe is
`lte-etm-1-1-10mhz-fdd-reference-frame@1.0.1`. It emits raw, one-channel,
little-endian interleaved complex float64 with no filtering, normalization,
resampling, scaling, or sample-value transform. The artifact SHA-256 is
`1cb66b49be2518ea33a2bbf1f7075b54e6e62e10a9c05491a0ba4727bfe05511`.
The provider verifies that digest and the fixed configuration digest before
admission.

An independently built srsRAN 4G implementation compared every one of the
84,000 resource elements and all 153,600 OFDM samples. The retained, hash-bound
report is
[`validation/lte-etm1-srsran-oracle-2026-07-27.json`](./validation/lte-etm1-srsran-oracle-2026-07-27.json).
The raw report SHA-256 is
`55cae4fcaa514dfe6ffdd6baf25c84a0915131b7403aad095c3d4727b593d34f`.
That report is passing evidence for this exact digital subject and dependency
state only. The generated artifact manifest deliberately remains
`reference-generated`, has `oracle=null`, and says external validation is not
provided. Retaining the report does not mutate or automatically promote the
manifest. The explicit oracle test does not trust the cached vectors alone: it
executes the pinned harness binary into a fresh temporary directory, requires
the new grid/time hashes and bytes to equal the cached vectors, and then compares
all 84,000 resource elements and 153,600 time samples.

The normative traceability input is separately content-addressed. The retained
report
[`validation/lte-etm1-release19-clause-evidence.json`](./validation/lte-etm1-release19-clause-evidence.json)
contains 59 exact Office Open XML (OOXML/WordprocessingML) ranges reproduced
from four pinned official ZIPs: TS 36.104 V19.2.0, TS 36.141 V19.1.0, and
TS 36.211/36.212 V19.3.0. Its SHA-256 is
`1171018747af96b84e9fe7874ae7bbf0c426fad9a43b300c1c2e5b8288be0775`.
Parent introductory ranges stop before the first child heading; whole-clause
ranges stop before the next heading at the same or higher level. The official
archive hash binds document parts outside the extracted `document.xml` range.

Those verified ranges are required to construct production catalog
`lte-etm1-1-release19-clause-tests@1.3.0`. The catalog has 74 exact
requirement/clause obligations and 12 semantic test definitions; its canonical
SHA-256 is
`830a2f03829a36b9dc249d64b50d821e6931d262115bccb529cb8db30db33072`.
The expanded set explicitly covers the TS 36.104 10 MHz-to-50-RB relationship,
the TS 36.211 resource-grid and synchronization parents, the TS 36.212 CFI and
HI parent clauses, and every invoked one-layer/single-port mapping and
precoding stage. The twelfth contract tests that identity stage directly.
Definitions are not executions, and a catalog is not evidence that its tests
ran or passed.

## Frozen 3GPP baseline

`src/3gpp-compliance-release-19.ts` freezes lock
`3gpp-release-19-2026-07-26`. It binds each selected Release 19 specification
to an explicit version, official 3GPP HTTPS ZIP, archive SHA-256, clauses, role,
and digital/conducted/radiated applicability:

- GERAN: TS 45.002, 45.003, 45.004, and 45.005 V19.0.0.
- LTE: TS 36.104 V19.2.0, TS 36.141 V19.1.0, TS 36.211 and 36.212 V19.3.0,
  and TS 36.213 V19.4.0.
- NR: TS 38.104, 38.141-1, and 38.141-2 V19.5.0, plus TS 38.211, 38.212,
  38.213, and 38.214 V19.4.0.

The lock never tracks “latest” automatically. A new or unknown document
revision, changed clause, changed publication digest, changed generator,
changed oracle, changed dependency lock, or changed artifact is a revalidation
event. The lock itself is not proof that a waveform satisfies a clause. All
current cellular profile admissions remain `unpromoted`, including GERAN, NR,
the existing LTE catalog profiles, and the fixed LTE E-TM 1.1 preset. Both the
promotion gate and the composite fixed-profile policy enforce this compiled
`profileAdmissions` state; caller-supplied evidence cannot override it.

## Implemented provider and evidence pipeline

Each exact standards asset moves through one closed pipeline:

1. A preset pins the standards organization, document revision, clauses, and
   official publication for every relevant parameter.
2. A deterministic recipe binds a named provider, product/version,
   implementation, recipe revision, and canonical configuration SHA-256.
3. Generation emits a content-addressed complex-I/Q artifact with exact sample
   format, channel geometry, sample rate, timing, content SHA-256, and explicit
   declarations for every post-provider transformation.
4. Admission recomputes the canonical manifest and payload hashes and retains a
   replayable bounded copy. Malformed geometry, unsafe paths, unsupported
   transforms, hash drift, truncation, extra bytes, or an unsupported request
   fail closed.
5. A clause/test catalog binds each claimed requirement to an exact
   specification/version/release/clause and a content-verified normative OOXML
   range. Each executable test definition binds its semantic assertion contract,
   source location, full `sourceFileSha256`, assertion digest, coverage, method,
   and executor identity.
6. A current test campaign must bind the same catalog and subject artifact.
   Missing coverage, missing execution, `fail`, `skipped`, stale execution,
   assertion drift, catalog drift, artifact drift, or the wrong executor denies
   admission. Campaign evaluation is checked against the current wall clock,
   not merely a caller-selected historic time. Independent-oracle and
   external-lab tests must use identities distinct from the generator.
7. Revalidation fingerprints are recomputed from the candidate, compiled
   specification lock, and evidence state. Missing, fabricated, or drifted
   fingerprints and a future or older-than-24-hours evaluation deny promotion.
8. The composite 3GPP gate replays and re-hashes the admitted waveform bytes and
   re-hashes the exact supplied bytes for every non-waveform evidence artifact.
   It rejects missing, duplicate, extra, length-mismatched, or digest-mismatched
   evidence and checks all artifact/manifest/recipe/citation/campaign
   cross-bindings.
9. Both the 3GPP promotion assessment and clause-level test campaign must admit,
   and the compiled profile matrix must permit promotion. No gate compensates
   for failure in another.

The qualification ladder is `synthetic-projection`, `standards-derived`,
`reference-generated`, and `independently-verified`. Even independent digital
waveform verification is not automatically broad 3GPP compliance, regulatory
approval, device certification, RF calibration, or proof of every
receiver/transmitter behavior.

For the exact implementation boundary, evidence policy, and reproducible test
commands, see [`docs/3GPP_COMPLIANCE.md`](./docs/3GPP_COMPLIANCE.md).

## Callable exact runtime lane

The package exposes `./standards-runtime` as a bundled developer-library entry
built from `src/standards-runtime.ts` to `dist/standards`, without changing the
Studio UI:

- `listStandardsRuntimeRecipes()` returns only the immutable
  `lte-etm-1-1-10mhz-fdd-release19` descriptor.
- `generateStandardsRuntimeArtifact()` generates and admits that recipe only,
  including the pinned artifact digest; an unknown recipe fails rather than
  falling back.

The returned artifact still has `qualification=reference-generated`,
`complianceClaim=not-claimed`, `oracle=null`, and separately available digital
evidence. This callable API does not add a selector, replace a catalog waveform,
or promote the result. `npm run test:standards-bundle` imports the built export,
reproduces and hashes all 2,457,600 artifact bytes, checks the non-claim
metadata, and proves an unknown recipe is rejected.

## Structural and explicit evidence lanes

The default `npm test` suite validates the generator, content-addressed
provider, retained-report integrity, clause catalog, pinned test-source and
semantic assertion identities, fail-closed admission rules, runtime API, and
composite gate behavior. Without the external environment it skips the
official-archive byte reproduction and live srsRAN comparison. It is not
compliance evidence and must not be reported as though either explicit lane
executed.

Run the deterministic structural subset with no external assets:

```bash
npm run test:3gpp:structural
```

Run `npm run test:3gpp` only after supplying all official-archive, srsRAN
checkout, harness source/binary, vector, and retained Vitest-report paths. That
script sets both fail-closed requirement flags. The exact validated-host command
and portable environment-variable contract are in
[`docs/3GPP_COMPLIANCE.md`](./docs/3GPP_COMPLIANCE.md). A pass reproduces the
retained source ranges and reruns the fixed digital comparison; it still does
not create a current promotion campaign, rewrite the reference-generated
manifest, or override `profileAdmissions`.

## Framework acceleration

The implementation direction remains adapters around established frameworks,
with the common preset/artifact/evidence contract around them:

- [NVIDIA Sionna](https://nvlabs.github.io/sionna/) is a candidate
  GPU/PyTorch research and differentiable-PHY adapter, especially for 5G NR.
  Its output still needs independent cross-validation before qualification
  promotion.
- [srsRAN 4G](https://docs.srsran.com/projects/4g/en/latest/) supplies the
  current independent LTE digital oracle. srsRAN Project remains a candidate
  for an NR adapter/oracle. Provider identity, commit, build-only patch, harness,
  dependencies, and vector hashes must be pinned for every admitted execution.
- [OpenAirInterface](https://gitlab.eurecom.fr/oai/openairinterface5g) is a
  candidate second cellular implementation where its supported configuration
  and licensing fit the preset. It is not assumed interchangeable with srsRAN.
- [GNU Radio](https://www.gnuradio.org/) and
  [SoapySDR](https://github.com/pothosware/SoapySDR) are candidate flowgraph and
  hardware-adapter layers. Hardware identity, clocking, gain, scaling, dropped
  samples, and calibration remain driver evidence rather than being inferred
  from the framework name.

No one framework is authoritative for every family. Exact GERAN, NR, WLAN, and
Bluetooth adapters should be selected only after a
configuration-by-configuration coverage and license audit; unsupported
configurations remain unavailable. Generation and independent validation must
use distinct implementations wherever the assurance level requires it.

MATLAB is optional, not a baseline dependency or required release gate. A
future MATLAB exporter or test-vector importer may contribute an additional
provider/evidence record, but the primary pipeline must build and validate
without it.

## Remaining delivery order

1. Keep the present all-profile deterministic complex-envelope path and
   embedded Studio as the integration reference, preserving
   analytic-laboratory versus standards-derived-engineering qualification.
2. Convert the fixed LTE independent comparison into an explicitly admitted,
   current clause-level campaign and independently verified manifest only when
   every required binding passes; never promote from the retained JSON report
   alone.
3. Obtain calibrated external-lab evidence before making any conducted-RF or
   radiated/OTA claim. The evidence must identify equipment, RF path,
   environment, calibration validity, measurement uncertainty, limits,
   artifact, clauses, and execution time.
4. Add one narrow exact asset at a time for NR, GERAN, WLAN, and Bluetooth.
   Retain each current engineering envelope and its lower qualification until
   its own complete test campaign passes.
5. Add incoming I/Q hardware through a new Atomizer driver using the same
   complete-buffer contract when its limits fit; design streaming v2 before
   advertising continuous acquisition. SignalLab's host-side
   `signal-lab-tx-stream-v1` contract and engine are delivered as host tooling
   for operator transmit hardware; they are not an Atomizer-facing
   continuous-acquisition capability, which still requires streaming v2 and a
   new trio version.
6. Automate the explicit independent and external evidence lanes in CI without
   treating CI success as broad standards or regulatory certification.

Qualification remains fail-closed: unavailable provider, unsupported preset,
revision drift, tool drift, missing artifact, hash mismatch, failed or skipped
test, stale report, absent independent evidence, or absent calibrated lab
evidence leaves the lower qualification visible and cannot be relabelled as
verified or compliant.
