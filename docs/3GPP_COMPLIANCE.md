# 3GPP qualification and evidence

This document records the exact implemented boundary. SignalLab now has a
test-driven 3GPP qualification foundation and one fixed LTE E-TM 1.1 digital
waveform milestone. It does **not** have broad or all-3GPP compliance, and it
does not claim conducted-RF or radiated/OTA conformance.

## Claim boundary

The admissible unit of a claim is not “SignalLab,” “LTE,” or “Release 19.” It is
one immutable combination of:

- technology, preset, and requested qualification;
- specification version and exact clauses;
- deterministic generator and configuration;
- complex-I/Q artifact and canonical manifest hashes;
- test catalog, executable assertions, executor identity, and execution time;
- independent oracle or external-lab evidence when required; and
- expiration and revalidation policy.

A pass for one combination does not qualify another profile, cell ID,
bandwidth, duplex mode, cyclic prefix, generator revision, dependency state,
artifact, or standards revision.

All current cellular profile admissions remain `unpromoted`. That includes the
GERAN and NR catalogs, the existing LTE engineering projections, and the fixed
LTE E-TM 1.1 preset described below. The exact LTE provider emits a
`reference-generated` manifest; it does not emit an independently verified or
3GPP-compliant manifest. The promotion gate and the composite fixed-profile
policy both enforce the immutable Release 19 `profileAdmissions` matrix, so a
caller cannot promote the exact lane by supplying otherwise complete-looking
artifacts, reports, or test executions.

## Frozen Release 19 specification lock

The immutable baseline in `src/3gpp-compliance-release-19.ts` is
`3gpp-release-19-2026-07-26`, verified as of 2026-07-26. It pins the official
3GPP archive URL and SHA-256 for every document rather than resolving a moving
“latest” alias.

| Technology | Frozen specifications |
|---|---|
| GERAN | TS 45.002 V19.0.0; TS 45.003 V19.0.0; TS 45.004 V19.0.0; TS 45.005 V19.0.0 |
| LTE | TS 36.104 V19.2.0; TS 36.141 V19.1.0; TS 36.211 V19.3.0; TS 36.212 V19.3.0; TS 36.213 V19.4.0 |
| NR | TS 38.104 V19.5.0; TS 38.141-1 V19.5.0; TS 38.141-2 V19.5.0; TS 38.211 V19.4.0; TS 38.212 V19.4.0; TS 38.213 V19.4.0; TS 38.214 V19.4.0 |

Each lock entry also declares the selected clauses, the document's role, and
whether a clause applies to digital baseband, conducted RF, or radiated OTA.
The lock prevents revision ambiguity; it is not evidence of adherence. A new or
unknown revision is a mandatory revalidation event.

## Fixed LTE E-TM 1.1 digital milestone

The only exact generated cellular artifact currently implemented is preset
`lte-etm-1-1-10mhz-fdd@2.0.0` with this immutable scope:

| Property | Fixed value |
|---|---|
| Radio access and direction | E-UTRA downlink |
| Test model | E-TM 1.1 |
| Channel | 10 MHz FDD, 50 resource blocks |
| Numerology | 15 kHz subcarrier spacing, normal cyclic prefix |
| Identity and start | physical cell ID 1, SFN 0, slot 0 |
| Transmission | antenna port 0, one codeword, one layer, no precoding |
| Frame geometry | 10 subframes / 10 ms; 140 OFDM symbols by 600 active subcarriers |
| Sampling | 15.36 Msamples/s, 1024-point IFFT, 153,600 complex samples |
| Included grid content | CRS, PSS, SSS, PBCH, PCFICH, PHICH, PDCCH, and full-allocation QPSK PDSCH |
| E-TM channel inputs | PBCH zeros; zero PHICH indicators; five all-zero PDCCH inputs; all-zero PDSCH input bits at RNTI 0; PCFICH CFI 1 |

The scope follows selected digital clauses in TS 36.104 V19.2.0, TS 36.141
V19.1.0, and TS 36.211/36.212 V19.3.0. TS 36.104 clause 5.6 supplies the
10 MHz-to-50-RB relationship. The preset explicitly fixes one layer on antenna
port 0 and `transmission.precoding=false`. The invoked TS 36.211 single-port
layer-mapping and precoding equations are therefore no-ops, but they are
implemented as a checked identity function instead of being silently skipped.
It preserves every finite complex component exactly, including signed zero,
returns non-aliased frozen output, and rejects non-finite symbols before mapping.

The prescribed E-TM physical-channel inputs are not a claim that SignalLab
generates protocol-decodable BCH, DCI, or transport-block payloads.

### Content-addressed artifact

The provider recipe and output identity are:

| Field | Value |
|---|---|
| Provider implementation | `signallab.lte-etm1-reference` |
| Recipe | `lte-etm-1-1-10mhz-fdd-reference-frame@1.0.1` |
| Configuration SHA-256 | `60e4b8ab807a79952863f556f8580e723dbf93bf951203822908e02e7719bb18` |
| Artifact format | raw, one-channel, interleaved-IQ float64, little-endian (`cf64le`) |
| Artifact byte length | 2,457,600 |
| Artifact SHA-256 | `1cb66b49be2518ea33a2bbf1f7075b54e6e62e10a9c05491a0ba4727bfe05511` |
| Post-provider processing | filtering, normalization, resampling, scaling, and sample-value transform are all `none` |

Generation fails if the preset/configuration binding or frozen output digest
changes without a recipe revision. Artifact admission independently recomputes
the canonical manifest and payload identities and retains replayable bytes only
after the complete candidate passes.

The provider manifest remains `reference-generated`, with `oracle=null`,
`externalValidationEvidence=not-provided`, and
`complianceClaim=not-claimed`. The retained independent report below does not
rewrite that manifest or bypass normal admission.

### Callable runtime API

The package exposes this byte-pinned lane to developers as
`./standards-runtime`, built from `src/standards-runtime.ts` into
`dist/standards/standards-runtime.js`, without a SignalLab Studio UI change:

- `listStandardsRuntimeRecipes()` lists the one registered runtime recipe,
  `lte-etm-1-1-10mhz-fdd-release19`, and its fixed non-claim metadata.
- `generateStandardsRuntimeArtifact()` accepts that recipe ID, generates the
  expected bytes, and admits them through the normal content-addressed provider
  boundary. An unknown ID fails closed rather than selecting a fallback.

The returned artifact remains `reference-generated`. The callable API does not
add an operator selector, replace an `acquireIq` catalog profile, attach the
separate oracle report, or change any qualification state. The normal build
includes the developer bundle, and `npm run test:standards-bundle` imports that
built output, regenerates and re-hashes the exact 2,457,600-byte artifact,
checks the non-claim metadata, and verifies that an unknown recipe is rejected.

## Normative clause-range evidence

The retained report
[`validation/lte-etm1-release19-clause-evidence.json`](../validation/lte-etm1-release19-clause-evidence.json)
has SHA-256
`1171018747af96b84e9fe7874ae7bbf0c426fad9a43b300c1c2e5b8288be0775`.
It contains 59 exact Office Open XML (OOXML/WordprocessingML) ranges from four
pinned official archives: TS 36.104 V19.2.0, TS 36.141 V19.1.0, and
TS 36.211/36.212 V19.3.0.

Each range hashes the UTF-8 bytes from its numbered Heading paragraph through
the applicable boundary after newline normalization and removal of outer
whitespace. A parent introductory range stops before its first child Heading; a
whole-clause range stops before the next Heading at the same or higher level.
The evidence also binds the source ZIP, DOCX, and `document.xml` digests.
Archive hashes cover equations, tables, drawings, relationships, and media that
are outside a selected XML text range.

`tools/3gpp-clause-evidence.mjs` reproduces the retained report from the four
official ZIPs. The opt-in archive test requires the regenerated bytes to equal
the retained JSON byte-for-byte; merely presenting the retained digest is not a
fresh source reproduction.

### Production clause/test catalog

The 59 verified ranges are mandatory input to catalog:

| Field | Value |
|---|---|
| Catalog ID | `lte-etm1-1-release19-clause-tests` |
| Revision | `1.3.0` |
| Exact requirement/clause obligations | 74 |
| Semantic test definitions | 12 |
| Canonical catalog SHA-256 | `90445a00cee8e5ab753c2cf4a3ce7ff18b146424cdec4cf121de3e9c6c693e3c` |

Every obligation is applicable digital-baseband scope, has an implemented
disposition, and maps bidirectionally to at least one test definition. The 12
definitions span unit, property, integration, and independent-oracle methods.
Each definition includes the full `sourceFileSha256`; its assertion SHA-256 is
derived from a canonical semantic contract containing the source location and
file digest, preconditions, assertions, covered requirements, method, and
executor identity. Structural tests re-hash the three referenced test files and
require them to match the pins.

The expanded obligation set includes:

- TS 36.104 clause 5.6 for the 10 MHz transmission bandwidth to 50-resource-
  block relationship;
- TS 36.211 grid parents including 6.2.1, synchronization parents 6.11,
  6.11.1, and 6.11.2, and the applicable channel-specific layer-mapping and
  precoding stages;
- TS 36.212 parent clauses 5.3.4 and 5.3.5 for CFI and HI coding; and
- an additional semantic test contract that directly exercises the explicit
  one-layer/single-port identity stage for all invoked physical channels.

This catalog contains definitions only. Its counts, coverage, and digest do not
say that any execution occurred or passed. The campaign helper deliberately
cannot invent `outcome`, execution time, report digest, or runner metadata.

## Independent digital comparison

The retained report
[`validation/lte-etm1-srsran-oracle-2026-07-27.json`](../validation/lte-etm1-srsran-oracle-2026-07-27.json)
has raw SHA-256
`55cae4fcaa514dfe6ffdd6baf25c84a0915131b7403aad095c3d4727b593d34f`
and records a passing comparison against a separately built srsRAN 4G LTE PHY
plus E-TM harness at source commit
`6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16`.

The report binds the SignalLab generator and provider source digests,
`package-lock.json`, configuration and artifact digests, srsRAN source commit,
macOS build-only patch, harness source and binary, oracle dependencies, raw
oracle-vector hashes, test source, runner versions, and Vitest JSON report.

The explicit oracle test verifies the checkout, build-only patch, harness source
and executable identities, then runs the pinned harness binary with fresh grid
and time output paths in a temporary directory. Both fresh outputs must have the
expected hashes and be byte-identical to the cached vectors. Only those fresh
bytes are then used for the complete resource-grid and OFDM comparisons; the
temporary directory is removed afterward.

| Comparison | Count | Maximum component error | Acceptance tolerance |
|---|---:|---:|---:|
| Non-PSS resource-grid elements | within the full 84,000-RE grid | `5.960464499743523e-8` | `1e-6` |
| PSS resource-grid elements | within the full 84,000-RE grid | `0.00022353510823804046` | `0.00023` |
| Time-domain OFDM samples | 153,600 complex samples | `1.1386674185279166e-6` | `2e-6` |

The distinct PSS tolerance accounts for srsRAN's float32 phase evaluation
versus SignalLab's float64 evaluation of the normative closed form. The
comparison first verifies the pinned oracle vector SHA-256 values:

- resource-grid `cf32le`:
  `8be0dd55e7f8104f720876696e9b65d3c6d1bcdc480ac54e235e90ee8da99413`;
- time-domain `cf32le`:
  `6e7ce0f4070c8f61cdc53c688064d673e62762833828c7243bc2261ff5d3f3e9`.

This establishes a retained independent comparison for the exact digital frame
and source/dependency state in the report. It supplies no conducted-RF or
radiated/OTA evidence and makes no broad 3GPP claim.

## Tests are the adherence evidence

The implemented gates treat passing, content-bound tests as necessary evidence,
not as supporting commentary:

1. The Release 19 promotion gate validates the requested claim, specification
   lock, exact citations, artifact identities, generator and validator
   identities, metrics, reports, equipment/calibration data where applicable,
   freshness, and revalidation triggers. It compares the revalidation instant
   with the current system clock: more than five minutes in the future or more
   than 24 hours old is rejected.
2. The clause/test gate requires every in-scope normative requirement to name
   an exact specification, version, release, clause, and normative-text
   SHA-256. Every requirement must map to at least one executable test.
3. The campaign binds the canonical catalog SHA-256 and exact subject artifact.
   Each current execution binds its test/assertion digest, subject artifact
   SHA-256, executor identity, result, report, and time. Missing, failed,
   skipped, stale, drifted, or differently bound execution denies the campaign.
   Campaign evaluation is also compared with the real wall clock rather than
   trusted as an arbitrary historical snapshot.
4. Revalidation fingerprints are recomputed from the candidate, compiled
   Release 19 lock, and complete evidence state. Missing or mismatched trigger
   fingerprints deny promotion; changing the claim, toolchain, dependencies,
   artifact, report, metric, test run, or RF state invalidates the stored
   fingerprints.
5. The composite gate replays and re-hashes the admitted waveform. It also
   requires the caller to supply the actual bytes of every declared
   non-waveform evidence artifact, then checks each byte length and SHA-256.
   Missing, duplicate, unreferenced, extra, or mismatched evidence bytes deny
   qualification.
6. The composite qualification gate requires both lower gates to pass with
   matching preset, artifact, manifest, recipe, citations, evidence, assurance
   level, and identities, and then enforces the fixed LTE catalog ID/revision/
   digest, complete clause set, artifact digest, and compiled
   `profileAdmissions` state.

Digital independent verification requires an independently verified artifact
manifest and an independent-oracle campaign whose provider and implementation
are distinct from the generator. Conducted and radiated claims require the
`external-lab` assurance level. Unit-test fixtures demonstrate both admission
and denial behavior; fixtures are not production qualification evidence.

The retained srsRAN JSON is deliberately not auto-ingested as an independently
verified manifest or a complete promotion campaign. A release process must
construct and admit those records explicitly, with current bindings, before a
qualification label can change. At present the compiled profile matrix still
denies that change.

## Running the evidence lanes

The default repository suite is:

```bash
npm test
```

It runs structural tests and retained-report checks. In the absence of the
explicit external environment, the official-archive byte reproduction and live
srsRAN comparison are skipped. A default `npm test` pass is therefore not
compliance evidence and must not be represented as a fresh execution of either
evidence lane.

Run the explicit no-external-assets structural set with:

```bash
npm run test:3gpp:structural
```

That target covers the frozen lock and promotion schemas, artifact/provider
admission, test and composite gates, exact preset/generator/provider, retained
clause and oracle report integrity, catalog pins, and callable runtime API. It
still does not rerun either external source.

The full evidence command on the validated host is:

```bash
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH \
SIGNALLAB_3GPP_ARCHIVE_DIR=/Users/johnelliott/Library/Caches/signallab-3gpp-specs/official-archives \
SIGNALLAB_SRSRAN_ETM1_GRID=/Users/johnelliott/Library/Caches/signallab-3gpp-oracles/lte-etm1-harness/grid-f32le.bin \
SIGNALLAB_SRSRAN_ETM1_TIME=/Users/johnelliott/Library/Caches/signallab-3gpp-oracles/lte-etm1-harness/time-f32le.bin \
SIGNALLAB_SRSRAN_REPOSITORY=/Users/johnelliott/Library/Caches/signallab-3gpp-oracles/srsRAN_4G \
SIGNALLAB_SRSRAN_HARNESS_SOURCE=/Users/johnelliott/Library/Caches/signallab-3gpp-oracles/lte-etm1-harness/lte_etm1_oracle.c \
SIGNALLAB_SRSRAN_HARNESS_BINARY=/Users/johnelliott/Library/Caches/signallab-3gpp-oracles/lte-etm1-harness/lte_etm1_oracle \
SIGNALLAB_SRSRAN_VITEST_REPORT=/Users/johnelliott/Library/Caches/signallab-3gpp-oracles/lte-etm1-harness/vitest-report-final-v2.json \
npm run test:3gpp
```

`npm run test:3gpp` sets
`SIGNALLAB_REQUIRE_3GPP_CLAUSE_ARCHIVES=1` and
`SIGNALLAB_REQUIRE_3GPP_ORACLE=1`. Consequently all seven paths above are
required:

- `SIGNALLAB_3GPP_ARCHIVE_DIR` contains the exact `36104-j20.zip`,
  `36141-j10.zip`, `36211-j30.zip`, and `36212-j30.zip` archives;
- the grid and time paths identify the pinned raw oracle `cf32le` vectors;
- the repository path identifies the pinned srsRAN checkout and build-only
  patch;
- the harness source and binary paths identify the exact independently built
  oracle implementation; and
- `SIGNALLAB_SRSRAN_VITEST_REPORT` identifies the retained current
  oracle-test run report whose digest is bound by the oracle evidence record.

The tests hash every supplied input before use and fail closed for missing or
wrong identities. A full command pass reproduces the retained OOXML report and
reruns the full-grid/full-frame comparison. It still does not synthesize a
current qualification campaign, change the provider manifest, override the
compiled unpromoted profile state, or constitute broad/RF/OTA compliance.

## Evidence still required

- GERAN and NR have frozen Release 19 document locks but no exact admitted
  waveform, independent campaign, or promotion. Their current profiles remain
  engineering projections.
- The other LTE catalog profiles remain engineering projections and unpromoted.
  The one fixed E-TM 1.1 result cannot be generalized to them.
- No conducted-RF result exists. Claims under TS 45.005, TS 36.104/36.141, or
  TS 38.104/38.141-1 require a calibrated external laboratory, identified
  equipment and RF path, valid calibration records, environmental state,
  uncertainty budget, limits, observations, artifact binding, and current
  report.
- No radiated/OTA result exists. Radiated claims, including TS 38.141-2 scope,
  require the corresponding calibrated chamber/path and external-lab evidence.

SignalLab itself emits normalized digital baseband and never emits RF. Software
tests and simulated impairment checks cannot substitute for conducted or OTA
measurements.
