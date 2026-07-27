# 3GPP digital qualification and evidence

SignalLab has 23 fixed 3GPP-linked catalog profiles: 7 GERAN, 9 E-UTRA/LTE, and 7 NR. Each has a content-addressed clean digital-baseband artifact and passing evidence for the exact scope declared in its governance record.

That is the whole positive claim. SignalLab does **not** claim that the application, an arbitrary configuration, a radio, or a product is broadly “3GPP compliant.” It emits digital baseband, not RF; the fixed qualified lanes preserve their source scaling without normalization. Conducted-RF, radiated/OTA, interoperability, regulatory, and device-certification claims are all outside the implemented evidence.

## Governing body and claim model

[3GPP TSG RAN](https://www.3gpp.org/3gpp-groups/radio-access-networks-ran) is the applicable technical body for GERAN, E-UTRA, and NR radio-access specifications. The catalog governance contract records the exact 3GPP document, revision, and clauses for every profile.

A fixed profile may report `digitalStandardsAdherence=verified-for-declared-digital-scope` only when all of the following are present:

1. an immutable fixed configuration and exact native digital interface;
2. a SHA-256-bound `cf32le` artifact;
3. executable tests for the cited digital construction;
4. a separately implemented oracle, or a precisely disclosed compositional oracle;
5. a retained passing evidence record whose own bytes are SHA-256 bound; and
6. explicit exclusions for everything not represented by those tests.

The schema has no positive value for broad standards compliance or RF conformance. Every profile therefore keeps `standardsCompliance=not-claimed` and `rfConformance=not-qualified`. A different band, bandwidth, numerology, cell ID, schedule, input field, artifact byte, sample rate, bandwidth binding, receiver impairment, implementation, dependency, or standards revision is a different subject and requires revalidation.

## Frozen specification revisions

The exact clauses appear in [`src/profile-governance.ts`](../src/profile-governance.ts). These are the revisions used by the 23 fixed profiles:

| Family | Governing documents |
|---|---|
| GERAN | TS 45.002 V19.0.0; TS 45.003 V19.0.0 where channel coding is in scope; TS 45.004 V19.0.0 |
| E-UTRA/LTE | TS 36.104 V19.2.0; TS 36.141 V19.1.0; TS 36.211 and TS 36.212 V19.3.0; TS 36.213 V19.3.0 for the Band 38 PHICH mapping and V19.4.0 for the configurable LTE builder |
| NR | TS 38.104, TS 38.141-1, TS 38.211, and TS 38.214 V19.4.0 for the fixed FR1 lanes; TS 38.213 V19.3.0 and TS 38.331 V19.1.0 for the n78 TDD binding; the narrowband component also cites TS 36.141 V19.1.0 and TS 36.211 V19.3.0 |

The configurable `custom-lte` and `custom-nr` selectors cite a wider parameter-constraint set, including TS 38.101-1/-2 and TS 38.141-2. They are not part of the 23 fixed qualified artifacts.

## Complete 3GPP profile matrix

“Profile” means a complete fixed normative profile. “Component” means that qualification starts or stops at the disclosed component boundary; omitted host, scheduling, placement, coding, or power context is not claimed. `A` is the artifact SHA-256. `E` points to the evidence ledger below.

| Catalog profile | Kind and exact digital scope | Primary clauses | A | E |
|---|---|---|---|---|
| `gsm-900-loaded-bcch` | Profile: four fixed TS0 xCCH GMSK bursts plus exact dummy bursts in TS1–TS7 | TS 45.002 4.3, 5.2.3.1, 5.2.6; TS 45.003 4.1.1–4.1.5, 4.4; TS 45.004 2.1–2.6 | `6c1b8392da569af1e7d8466f0bab0fc67a3ad486c37238e737dc3e7aaa00e468` | G |
| `gsm-normal-burst` | Profile: fixed TSC0 xCCH GMSK normal burst | TS 45.002 4.3, 5.2.3.1; TS 45.003 4.1.1–4.1.5; TS 45.004 2.1–2.6 | `eeb6cdcc00a228d85a2cea80a31af4250498e035cbd7fa7ef38d82316b4a465b` | G |
| `gsm-qpsk-higher-symbol-rate-burst` | Component: fixed TS 45.002 modulator input through QPSK modulation; no TS 45.003 coding claim | TS 45.002 4.3, 5.2.3a; TS 45.004 5.1–5.6 | `467dab110023dc884c8d3de95b88a640cc3beda2f15845e01aaf397dd6772114` | G |
| `gsm-aqpsk-normal-burst` | Component: fixed TS 45.002 modulator input through AQPSK modulation; no TS 45.003 coding claim | TS 45.002 4.3, 5.2.3.2; TS 45.004 6.1–6.6 | `cd51921ed2038c6c2f26bc8f05dd94e19a802030c471594993dac16c568b0ae2` | G |
| `gsm-8psk-normal-burst` | Component: fixed TS 45.002 modulator input through 8-PSK modulation; no TS 45.003 coding claim | TS 45.002 4.3, 5.2.3.3; TS 45.004 3.1–3.6 | `a8d02b7c21c1040d02285cf885b02a9d0760ad7a6367aea44c1486c68d99692a` | G |
| `gsm-16qam-higher-symbol-rate-burst` | Component: fixed TS 45.002 modulator input through 16-QAM modulation; no TS 45.003 coding claim | TS 45.002 4.3, 5.2.3a; TS 45.004 5.1–5.6 | `d1ee47875e59ab0619770855ca47e6dc309e7af20e2cb8480152ec2aa9d3232a` | G |
| `gsm-32qam-higher-symbol-rate-burst` | Component: fixed TS 45.002 modulator input through 32-QAM modulation; no TS 45.003 coding claim | TS 45.002 4.3, 5.2.3a; TS 45.004 5.1–5.6 | `26b84953d9299e63a198ca04f0d42d61d89f7e00a4c6e9c512677a8f6b162203` | G |
| `lte-band3-fdd-20m` | Profile: fixed 20 MHz Band 3 FDD E-TM1.1, PCI 1 | TS 36.104 5.5, 5.6; TS 36.141 6.1.1.1, Table 6.1.1.1-1, 6.1.2; TS 36.211/36.212 physical construction | `685b5f3808e0792c1803d3c398358d7e308291db6b3769d5efd8dc3e17713d0b` | LF |
| `lte-band38-tdd-10m` | Component: fixed TS 36.211-valid 10 MHz TDD downlink fixture, not a named E-TM | TS 36.104 5.5, 5.6; TS 36.211 4.2, 6.2–6.12; TS 36.213 V19.3.0 6.9 PHICH mi mapping | `bf022e7a3f45b42fd05a801c686ea7247aae04db9d439d907e349a20d4a218e0` | LF |
| `lte-etm1.1` | Profile: fixed 10 MHz FDD E-TM1.1, normal CP, PCI 1 | TS 36.141 6.1.1.1, Table 6.1.1.1-1, 6.1.2; TS 36.211 7.1.2; TS 36.104/36.212 supporting clauses | `64515628a900f0422e67c8cdd9b2209c70aaaa467f1d533f99080ac110f340c7` | L1 |
| `lte-etm3.1` | Profile: fixed 10 MHz FDD E-TM3.1, 64-QAM, PCI 1 | TS 36.141 6.1.1.4, Table 6.1.1.4-1, 6.1.2; TS 36.211 7.1.4; TS 36.104/36.212 supporting clauses | `5472e9cd8c923bd62da527d0b2f5d655aa516b5e762a27ed29ca21817f124219` | L3 |
| `lte-etm3.1a` | Profile: fixed 10 MHz FDD E-TM3.1a, 256-QAM, PCI 1 | TS 36.141 6.1.1.4a, 6.1.2; TS 36.211 7.1.5; TS 36.104/36.212 supporting clauses | `4e552324f32862337b31f9cb6a94deb8a306655770570f2ec84b30ec808ffc85` | L3 |
| `lte-etm3.1b` | Profile: fixed 10 MHz FDD E-TM3.1b, 1024-QAM, PCI 1 | TS 36.141 6.1.1.4b, 6.1.2; TS 36.211 7.1.6; TS 36.104/36.212 supporting clauses | `e55e2253f32ff9ff7cfb04f6c4ca36bb5acf53e00764f547a5788f7221310e9f` | L3 |
| `lte-ntm` | Profile: fixed standalone N-TM | TS 36.141 6.1.3, 6.1.4.1–6.1.4.5; TS 36.211 6.2.3, 10.2.3–10.2.8 | `5cb11d59c16e0241a68948783aef0384c329f2b73f1f20336d38a7e08fb72a9d` | LF |
| `lte-nbiot-guard-isolated-component` | Component: fixed N-TM waveform; host E-TM1.1, guard placement, and relative power omitted | TS 36.141 6.1.3, 6.1.4.1–6.1.4.5, 6.1.5; TS 36.211 6.2.3, 10.2.3–10.2.8 | `5cb11d59c16e0241a68948783aef0384c329f2b73f1f20336d38a7e08fb72a9d` | LF |
| `lte-nbiot-inband-isolated-component` | Component: fixed N-TM waveform; host E-TM1.1, in-band placement, and relative power omitted | TS 36.141 6.1.3, 6.1.4.1–6.1.4.5, 6.1.6; TS 36.211 6.2.3, 10.2.3–10.2.8 | `cf307a838902a1283757ff0f90b7d879e37c2e96331de86f8c8e07ccbff9ba0f` | LF |
| `nr-n3-fdd-20m` | Profile: fixed n3 FDD 20 MHz NR-FR1-TM1.1, 15 kHz SCS, 106 RB, PCI 1 | TS 38.104 band/grid tables; TS 38.141-1 4.9.2.2.1 and 4.9.2.3; TS 38.211/38.214 physical construction | `7f414f94209d56138a6d43d66230f2d851794c740fd668d330673c87251514f1` | NR |
| `nr-n78-tdd-100m` | Profile: fixed 20 ms/two-radio-frame n78 TDD 100 MHz NR-FR1-TM1.1, 30 kHz SCS, 273 RB, four repetitions of the prescribed 5 ms TDD pattern | TS 38.104 band/grid tables; TS 38.141-1 4.9.2.2.1/Table 4.9.2.2-1 and 4.9.2.3; TS 38.211/38.214; TS 38.331 6.3.2; TS 38.213 11.1 | `9bf4024dc1f6f0ad2b335d56917e5ac1129f5a3011ccffc0c6049ee7dce78260` | NR |
| `nr-fr1-tm1.1` | Profile: fixed n3 FDD 20 MHz NR-FR1-TM1.1 | TS 38.141-1 4.9.2.2.1; TS 38.104/38.211/38.214 supporting clauses | `7f414f94209d56138a6d43d66230f2d851794c740fd668d330673c87251514f1` | NT |
| `nr-fr1-tm3.1` | Profile: fixed n3 FDD 20 MHz NR-FR1-TM3.1, 64-QAM | TS 38.141-1 4.9.2.2.5; TS 38.211 5.1.5; TS 38.104/38.214 supporting clauses | `e890371a8fa9a484692859cf9ed447bbee09ba5b32b25ed8d92b55146d062839` | NT |
| `nr-fr1-tm3.1a` | Profile: fixed n3 FDD 20 MHz NR-FR1-TM3.1a, 256-QAM | TS 38.141-1 4.9.2.2.6; TS 38.211 5.1.6; TS 38.104/38.214 supporting clauses | `fc205447482fe7929fdc52b8f5684f50557511903e7e2c387011169dea06dabb` | NT |
| `nr-fr1-tm3.1b` | Profile: fixed n3 FDD 20 MHz NR-FR1-TM3.1b, 1024-QAM | TS 38.141-1 4.9.2.2.6A; TS 38.211 5.1.7; TS 38.104/38.214 supporting clauses | `d18a5441ea8bcfb3fbc0478241ce6e3e4b916594c8646ce50829939b97e47671` | NT |
| `nr-nbiot-inband-isolated-component` | Component: fixed different-PCI narrowband waveform; NR host, eligible punctured-RB placement, and relative power omitted | TS 38.141-1 4.9.2.2.9, 4.9.2.4; TS 36.141 6.1.3, 6.1.4.1–6.1.4.5; TS 36.211 6.2.3, 10.2.3–10.2.8 | `cf307a838902a1283757ff0f90b7d879e37c2e96331de86f8c8e07ccbff9ba0f` | NR |

## Evidence ledger

Every digest below is the raw SHA-256 of the retained JSON file, not a value copied from inside it.

| Code | Retained evidence | SHA-256 and principal oracle |
|---|---|---|
| G | [`geran-release19-fixed-digital-baseband-oracles-2026-07-27.json`](../validation/geran-release19-fixed-digital-baseband-oracles-2026-07-27.json) | `b24f818661bf6ced2d5f2c0a01e7305ba21c4ce49e21fb08ab9799c51e6b051b`; independent TS rederivation of every complex sample, plus pinned libosmocore for xCCH coding |
| LF | [`lte-fixed-independent-oracles-2026-07-27.json`](../validation/lte-fixed-independent-oracles-2026-07-27.json) | `f25ebfb28e6f967907516731cee10d7642ff46f774482bb3399f9d7d023cd5b9`; pinned srsRAN LTE PHY harnesses |
| L1 | [`lte-etm1-srsran-oracle-2026-07-27.json`](../validation/lte-etm1-srsran-oracle-2026-07-27.json) | `55cae4fcaa514dfe6ffdd6baf25c84a0915131b7403aad095c3d4727b593d34f`; pinned srsRAN full grid/frame comparison |
| L3 | [`lte-etm3-independent-full-frame-oracles-2026-07-27.json`](../validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json) | `e3c3eed68d9453573569821e0c56ac045d8b898012e584ccd09dae9590fb6dab`; for each E-TM3 variant, exhaustive independent comparison of all 84,000 resource elements and all 153,600 OFDM samples, with fresh srsRAN and OCUDU anchors |
| NT | [`nr-fr1-test-model-independent-oracles-2026-07-27.json`](../validation/nr-fr1-test-model-independent-oracles-2026-07-27.json) | `1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54`; pinned py3gpp 0.6.0/NumPy 2.0.2 full grid/frame oracle, with OCUDU for 1024-QAM |
| NR | [`nr-remaining-fixed-digital-oracles-2026-07-27.json`](../validation/nr-remaining-fixed-digital-oracles-2026-07-27.json) | `47950c3f49b63275302101be61b46035f0ec628cc26e80ff0e1e32af5fc454ce`; compositional NT/LF evidence for byte-identical lanes and an exhaustive py3gpp comparison of all 1,834,560 RE/kinds and 2,457,600 samples in the 20 ms n78 artifact |

The original E-TM1.1 official-clause extraction remains in [`lte-etm1-release19-clause-evidence.json`](../validation/lte-etm1-release19-clause-evidence.json), SHA-256 `1171018747af96b84e9fe7874ae7bbf0c426fad9a43b300c1c2e5b8288be0775`. It reproduces selected ranges from pinned official 3GPP archives. It is source-provenance evidence, not RF evidence and not a substitute for the executable waveform oracles.

## What the tests verify

The repository-owned tests:

- require every catalog ID to have exactly one schema-valid governance record;
- require every fixed qualified record to cite exact documents/revisions/clauses, bind an artifact hash, bind a distinct passing oracle/report hash, and name executable test locations;
- reject positive broad-compliance or RF-conformance states because those states do not exist in the schema;
- regenerate every complete fixed catalog artifact and check its full `cf32le` SHA-256;
- compare the implemented digital construction at its declared boundary with a separately structured implementation;
- verify the retained evidence-file bytes and hash, rather than trusting an unbound result string;
- enforce the exact native sample-rate and bandwidth interface; and
- ensure receiver impairment or other transformation cannot inherit the content-bound qualification.

The tests do not measure output power, error vector magnitude at an RF connector, occupied bandwidth, ACLR, SEM, spurious emissions, receiver characteristics, radiated performance, or any other external radio/product property.

## Running the evidence

The repository-owned structural, retained-evidence, and pure TypeScript oracle checks run with:

```bash
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm test
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm run typecheck
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm run test:standards:structural
```

The legacy fail-closed Release 19 framework and exact E-TM1.1 runtime bundle remain covered by:

```bash
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm run test:3gpp:structural
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm run test:standards-bundle
```

External live oracles are intentionally opt-in. Their tests skip when the exact environment is absent; set the corresponding `SIGNALLAB_REQUIRE_*` flag to `1` to turn absence into failure:

| Test | Required external bindings |
|---|---|
| `lte-etm1-independent-oracle.test.ts`, `lte-etm1-oracle-evidence.test.ts` | `SIGNALLAB_REQUIRE_3GPP_ORACLE`; srsRAN repository, E-TM1 harness source/binary, retained grid/time vectors, and retained current-run report |
| `lte-band3-fdd-20m-independent-oracle.test.ts` | `SIGNALLAB_REQUIRE_LTE_BAND3_FDD20_ORACLE`; srsRAN repository, Band 3 harness source/binary, grid/time vectors |
| `lte-band38-tdd-10m-independent-oracle.test.ts` | `SIGNALLAB_REQUIRE_LTE_BAND38_TDD10_ORACLE`; srsRAN repository, Band 38 harness source/binary, grid/time vectors |
| `lte-ntm-independent-oracle.test.ts` | `SIGNALLAB_REQUIRE_LTE_NTM_ORACLE`; srsRAN repository, N-TM harness source/binary, retained-vector directory |
| `lte-etm3-independent-oracle.test.ts` | `SIGNALLAB_REQUIRE_LTE_ETM3_FULL_ORACLE` and `SIGNALLAB_REQUIRE_LTE_ETM3_QAM_ORACLE`; srsRAN repository and E-TM1.1 harness/grid/time bindings, srsRAN and OCUDU QAM harnesses/vectors, and pinned OCUDU overlays |
| `nr-fr1-test-model-independent-oracle.test.ts` | `SIGNALLAB_REQUIRE_NR_FR1_TM_ORACLE`; pinned py3gpp Python/script plus OCUDU 1024-QAM bindings |
| `nr-n78-tdd-100m-independent-oracle.test.ts` | `SIGNALLAB_REQUIRE_NR_N78_TDD_100M_ORACLE`; pinned py3gpp Python and n78 oracle script |
| `lte-etm1-clause-archive.test.ts` | `SIGNALLAB_REQUIRE_3GPP_CLAUSE_ARCHIVES`; directory containing the pinned official 3GPP archives |

The aggregate package command also requires the WLAN live bindings listed in the [complete governance ledger](./STANDARDS_GOVERNANCE.md). After supplying those and every external path in the table above, one command makes all live-oracle and official-archive lanes mandatory:

```bash
npm run test:standards:live
```

`npm run test:standards` runs the complete structural suite first and then that fail-closed live suite. It intentionally fails—not skips—if any required external binding is absent or has the wrong identity.

For example, the n78 lane is executed—not skipped—with:

```bash
SIGNALLAB_REQUIRE_NR_N78_TDD_100M_ORACLE=1 \
SIGNALLAB_PY3GPP_PYTHON=/path/to/pinned/py3gpp-venv/bin/python \
SIGNALLAB_NR_N78_TDD_100M_ORACLE_SCRIPT=/path/to/nr_n78_tdd_100m_oracle.py \
npx vitest run src/nr-n78-tdd-100m-independent-oracle.test.ts
```

The exact names, identity pins, and fail-closed preconditions are executable in the listed test files. A live pass re-executes those digital comparisons; it still does not create RF, OTA, product, regulatory, or blanket 3GPP compliance.

## Separate legacy promotion framework

`src/3gpp-compliance-release-19.ts` and the `./standards-runtime` E-TM1.1 provider predate the complete catalog qualification ledger. They remain conservative: their broad promotion/admission state is unpromoted and their provider manifest remains `reference-generated`. That does not contradict the narrower catalog claim. The catalog says only that exact fixed artifact bytes have verified adherence for their declared digital scope; it does not promote a generic provider, arbitrary configuration, implementation, radio, or product.

## Evidence still required for broader claims

Any broader claim would need a new governed contract and evidence appropriate to that claim. In particular:

- conducted-RF claims require calibrated equipment, identified RF paths, current calibration records, environmental state, uncertainty budgets, limits, observations, and artifact/report binding;
- radiated/OTA claims require the corresponding calibrated chamber/path and external-lab evidence;
- product, interoperability, operator-acceptance, and regulatory claims require the applicable independent programs and authorities; and
- a new fixed digital profile or standards revision requires its own content-addressed artifact and complete executable oracle evidence.

Software tests and simulated impairments cannot substitute for those measurements or programs.
