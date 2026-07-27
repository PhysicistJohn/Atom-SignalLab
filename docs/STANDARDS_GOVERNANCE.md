# Standards governance ledger

This is the human-readable ledger for all 42 SignalLab catalog profiles. The executable authority is [`src/profile-governance.ts`](../src/profile-governance.ts), validated by [`src/profile-governance-schema.ts`](../src/profile-governance-schema.ts) and [`src/profile-governance.test.ts`](../src/profile-governance.test.ts). The digital-envelope reference center, native carrier offset, native sample rate, signal bandwidth, replay policy, and artifact binding for every qualified lane are executable in [`src/fixed-digital-profile-binding.ts`](../src/fixed-digital-profile-binding.ts).

## Result at a glance

| Category | Count | Permitted statement |
|---|---:|---|
| Fixed standards-linked digital artifacts | 31 | Verified standards adherence **only for the declared content-bound digital scope** |
| Operator-configurable builders | 3 | Standards-constrained configuration options only; no operator-selected builder output is a fixed qualified artifact |
| Mathematical laboratory references | 8 | Standards adherence is not applicable because no unique external waveform standard governs the construction |
| Total | 42 | Broad standards compliance and RF conformance remain unclaimed for every row |

All 31 positive digital claims attach only to the exact source-preserved, unnormalized, clean `cf32le` artifact bytes at the declared native sample rate, signal bandwidth, and native carrier offset. Requested RF center is separate output-placement metadata and is not part of the artifact hash; changing it alone neither qualifies nor disqualifies unchanged native bytes. Resampling, fractional delay, carrier translation, filtering, receiver impairment, any artifact-byte change, or an unadmitted evidence/standards revision is outside the exact-byte claim and must carry derived or impaired qualification instead.

## Governing authorities

| Catalog scope | Governing technical body | Authority represented here |
|---|---|---|
| GERAN, E-UTRA/LTE, NR | [3GPP TSG RAN](https://www.3gpp.org/3gpp-groups/radio-access-networks-ran) | Radio-access physical-layer construction and test-model specifications. No 3GPP organizational certification is implied. |
| HR-DSSS, ERP-OFDM, HE WLAN | [IEEE Standards Association / IEEE 802.11 Working Group](https://www.ieee802.org/11/overview.html) | IEEE 802.11 PHY/PPDU clauses. No Wi-Fi Alliance certification or regulatory approval is implied. |
| Bluetooth BR and LE | [Bluetooth SIG Core Specification Working Group](https://www.bluetooth.com/specifications/working-groups/groups-and-committees/) | [Bluetooth Core Specification 6.3](https://www.bluetooth.com/specifications/specs/core-specification-6-3/) radio, baseband/link-layer, and sample-data clauses. No Bluetooth product qualification is implied. |
| CW, AM, FM, generic PSK/QAM references | TinySA SignalLab project | Project-defined deterministic mathematics where no unique external waveform standard applies. |

## Standards-reference keys

The matrix uses these compact keys. Revisions and clauses are exact; URLs are stored with every reference in the executable registry.

| Key | Normative basis |
|---|---|
| G1 | TS 45.002 V19.0.0 4.3, 5.2.3.1, 5.2.6; TS 45.003 V19.0.0 4.1.1–4.1.5, 4.4; TS 45.004 V19.0.0 2.1–2.6 |
| G2 | TS 45.002 V19.0.0 4.3, 5.2.3.1; TS 45.003 V19.0.0 4.1.1–4.1.5; TS 45.004 V19.0.0 2.1–2.6 |
| G3 | TS 45.002 V19.0.0 4.3, 5.2.3a; TS 45.004 V19.0.0 5.1–5.6 |
| G4 | TS 45.002 V19.0.0 4.3, 5.2.3.2; TS 45.004 V19.0.0 6.1–6.6 |
| G5 | TS 45.002 V19.0.0 4.3, 5.2.3.3; TS 45.004 V19.0.0 3.1–3.6 |
| L-B3 | TS 36.104 V19.2.0 5.5, 5.6; TS 36.141 V19.1.0 6.1.1.1, Table 6.1.1.1-1, 6.1.2; TS 36.211/36.212 V19.3.0 physical construction |
| L-B38 | TS 36.104 V19.2.0 5.5, 5.6; TS 36.211 V19.3.0 4.2 and 6.2–6.12; TS 36.213 V19.3.0 6.9 (PHICH mi mapping) |
| L-E1 | L-B3 test-model construction specialized to TS 36.141 V19.1.0 6.1.1.1/Table 6.1.1.1-1 and TS 36.211 V19.3.0 7.1.2 |
| L-E31 | TS 36.104 V19.2.0 5.5, 5.6; TS 36.141 V19.1.0 6.1.1.4/Table 6.1.1.4-1 and 6.1.2; TS 36.211 V19.3.0 4.1, 6.2–6.12, 7.2, 7.1.4; TS 36.212 V19.3.0 5.3.4–5.3.5 |
| L-E31a | L-E31 specialized to TS 36.141 6.1.1.4a and TS 36.211 7.1.5 |
| L-E31b | L-E31 specialized to TS 36.141 6.1.1.4b and TS 36.211 7.1.6 |
| L-N | TS 36.141 V19.1.0 6.1.3, 6.1.4.1–6.1.4.5; TS 36.211 V19.3.0 6.2.3, 10.2.3–10.2.8 |
| L-NG | L-N plus TS 36.141 6.1.5 |
| L-NI | L-N plus TS 36.141 6.1.6 |
| N-1 | TS 38.104 V19.4.0 band/grid tables; TS 38.141-1 V19.4.0 4.9.2.2.1 and 4.9.2.3; TS 38.211 V19.4.0 physical construction including 5.1.3; TS 38.214 V19.4.0 5.1.2.2.2 |
| N-78 | N-1 over the required 20 ms/two-radio-frame artifact, with four repetitions of the TS 38.141-1 Table 4.9.2.2-1 prescribed 5 ms TDD pattern; plus TS 38.331 V19.1.0 6.3.2 and TS 38.213 V19.3.0 11.1 |
| N-31 | N-1 specialized to TS 38.141-1 4.9.2.2.5 and TS 38.211 5.1.5 |
| N-31a | N-1 specialized to TS 38.141-1 4.9.2.2.6 and TS 38.211 5.1.6 |
| N-31b | N-1 specialized to TS 38.141-1 4.9.2.2.6A and TS 38.211 5.1.7 |
| N-NB | TS 38.141-1 V19.4.0 4.9.2.2.9, 4.9.2.4; TS 36.141 V19.1.0 6.1.3, 6.1.4.1–6.1.4.5; TS 36.211 V19.3.0 6.2.3, 10.2.3–10.2.8 |
| W-HR | IEEE 802.11-2024 clauses 9.2.4.8, 9.3.1.4, 16.2.2.2, 16.2.3.2–16.2.3.8, 16.2.4–16.2.5, 16.3.6.3–16.3.6.4, 16.3.6.6.1–16.3.6.6.4 |
| W-ERP | IEEE 802.11-2024 clauses 9.2.4.8, 9.3.1.4, 17.3.2–17.3.5.10, 17.3.11, 18.3.2.4, 18.3.3.2, 18.4.3 |
| W-SU | IEEE 802.11-2024 clauses 27.1.4, 27.3.2.2, 27.3.4, 27.3.6.1–27.3.6.10, 27.3.7, 27.3.9–27.3.13 |
| W-ERSU | IEEE 802.11-2024 clauses 27.1.4, 27.3.2.2, 27.3.4, 27.3.6.1–27.3.6.10, 27.3.6.6, 27.3.11.7, 27.3.12–27.3.13 |
| W-MU | IEEE 802.11-2024 clauses 27.3.1.1, 27.3.2.2, 27.3.2.5, 27.3.3.1, 27.3.4, 27.3.6.11, 27.3.8, 27.3.10–27.3.13, 27.3.16 |
| W-TB | IEEE 802.11-2024 clauses 9.3.1.22, 26.5.2, 27.2.3, 27.3.1.1–27.3.1.2, 27.3.2.6, 27.3.3.2, 27.3.4, 27.3.6.10, 27.3.10–27.3.13, 27.3.15 |
| B-BR | Bluetooth Core 6.3 Vol 2 Part A 2, 3.1.1; Vol 2 Part B 6.1–6.6, 7.1–7.4; Vol 2 Part G 2.1, 3, 4, 5, 6.1, 8 |
| B-LE | Bluetooth Core 6.3 Vol 6 Part A 2, 3; Vol 6 Part B 2.1, 2.3.1, 3.1, 3.2, 4.4.2; Vol 6 Part C 4.1, 4.2.1 |
| C-LTE | TS 36.104 V19.2.0 5.5, 5.6; TS 36.141 V19.1.0 6.1.1; TS 36.211 V19.3.0 4, 6, 7.1; TS 36.213 V19.4.0 Table 7.1.7.1-1A |
| C-NR | TS 38.101-1/-2 V19.4.0; TS 38.104 and TS 38.141-1/-2 V19.5.0; TS 38.211/38.214 V19.4.0; TS 38.213 V19.3.0, limited to the exact parameter clauses in the registry |
| C-WLAN | IEEE 802.11-2024 clauses 16, 17, 18, 19, 21, 27, Annex E |

## Complete 42-profile matrix

`Qualified` means `digitalStandardsAdherence=verified-for-declared-digital-scope` and `digitalQualification=qualified`. `Config-only` and `N/A` have no waveform evidence. `A` is the full artifact SHA-256; `E` is the retained-evidence key defined after the matrix.

| Profile | Governing body | Kind | Basis | State | A | E |
|---|---|---|---|---|---|---|
| `cw` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `am` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `fm` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `gsm-900-loaded-bcch` | 3GPP TSG RAN | Fixed profile | G1 | Qualified | `6c1b8392da569af1e7d8466f0bab0fc67a3ad486c37238e737dc3e7aaa00e468` | G |
| `gsm-normal-burst` | 3GPP TSG RAN | Fixed profile | G2 | Qualified | `eeb6cdcc00a228d85a2cea80a31af4250498e035cbd7fa7ef38d82316b4a465b` | G |
| `gsm-qpsk-higher-symbol-rate-burst` | 3GPP TSG RAN | Component fixture | G3 | Qualified | `467dab110023dc884c8d3de95b88a640cc3beda2f15845e01aaf397dd6772114` | G |
| `gsm-aqpsk-normal-burst` | 3GPP TSG RAN | Component fixture | G4 | Qualified | `cd51921ed2038c6c2f26bc8f05dd94e19a802030c471594993dac16c568b0ae2` | G |
| `gsm-8psk-normal-burst` | 3GPP TSG RAN | Component fixture | G5 | Qualified | `a8d02b7c21c1040d02285cf885b02a9d0760ad7a6367aea44c1486c68d99692a` | G |
| `gsm-16qam-higher-symbol-rate-burst` | 3GPP TSG RAN | Component fixture | G3 | Qualified | `d1ee47875e59ab0619770855ca47e6dc309e7af20e2cb8480152ec2aa9d3232a` | G |
| `gsm-32qam-higher-symbol-rate-burst` | 3GPP TSG RAN | Component fixture | G3 | Qualified | `26b84953d9299e63a198ca04f0d42d61d89f7e00a4c6e9c512677a8f6b162203` | G |
| `lte-band3-fdd-20m` | 3GPP TSG RAN | Fixed profile | L-B3 | Qualified | `685b5f3808e0792c1803d3c398358d7e308291db6b3769d5efd8dc3e17713d0b` | LF |
| `lte-band38-tdd-10m` | 3GPP TSG RAN | Component fixture (not a named E-TM) | L-B38 | Qualified | `bf022e7a3f45b42fd05a801c686ea7247aae04db9d439d907e349a20d4a218e0` | LF |
| `lte-etm1.1` | 3GPP TSG RAN | Fixed profile | L-E1 | Qualified | `64515628a900f0422e67c8cdd9b2209c70aaaa467f1d533f99080ac110f340c7` | L1 |
| `lte-etm3.1` | 3GPP TSG RAN | Fixed profile | L-E31 | Qualified | `5472e9cd8c923bd62da527d0b2f5d655aa516b5e762a27ed29ca21817f124219` | L3 |
| `lte-etm3.1a` | 3GPP TSG RAN | Fixed profile | L-E31a | Qualified | `4e552324f32862337b31f9cb6a94deb8a306655770570f2ec84b30ec808ffc85` | L3 |
| `lte-etm3.1b` | 3GPP TSG RAN | Fixed profile | L-E31b | Qualified | `e55e2253f32ff9ff7cfb04f6c4ca36bb5acf53e00764f547a5788f7221310e9f` | L3 |
| `lte-ntm` | 3GPP TSG RAN | Fixed profile | L-N | Qualified | `5cb11d59c16e0241a68948783aef0384c329f2b73f1f20336d38a7e08fb72a9d` | LF |
| `lte-nbiot-guard-isolated-component` | 3GPP TSG RAN | Component fixture | L-NG | Qualified | `5cb11d59c16e0241a68948783aef0384c329f2b73f1f20336d38a7e08fb72a9d` | LF |
| `lte-nbiot-inband-isolated-component` | 3GPP TSG RAN | Component fixture | L-NI | Qualified | `cf307a838902a1283757ff0f90b7d879e37c2e96331de86f8c8e07ccbff9ba0f` | LF |
| `nr-n3-fdd-20m` | 3GPP TSG RAN | Fixed profile | N-1 | Qualified | `7f414f94209d56138a6d43d66230f2d851794c740fd668d330673c87251514f1` | NR |
| `nr-n78-tdd-100m` | 3GPP TSG RAN | Fixed profile | N-78 | Qualified | `9bf4024dc1f6f0ad2b335d56917e5ac1129f5a3011ccffc0c6049ee7dce78260` | NR |
| `nr-fr1-tm1.1` | 3GPP TSG RAN | Fixed profile | N-1 | Qualified | `7f414f94209d56138a6d43d66230f2d851794c740fd668d330673c87251514f1` | NT |
| `nr-fr1-tm3.1` | 3GPP TSG RAN | Fixed profile | N-31 | Qualified | `e890371a8fa9a484692859cf9ed447bbee09ba5b32b25ed8d92b55146d062839` | NT |
| `nr-fr1-tm3.1a` | 3GPP TSG RAN | Fixed profile | N-31a | Qualified | `fc205447482fe7929fdc52b8f5684f50557511903e7e2c387011169dea06dabb` | NT |
| `nr-fr1-tm3.1b` | 3GPP TSG RAN | Fixed profile | N-31b | Qualified | `d18a5441ea8bcfb3fbc0478241ce6e3e4b916594c8646ce50829939b97e47671` | NT |
| `nr-nbiot-inband-isolated-component` | 3GPP TSG RAN | Component fixture | N-NB | Qualified | `cf307a838902a1283757ff0f90b7d879e37c2e96331de86f8c8e07ccbff9ba0f` | NR |
| `wifi-hr-dsss-11m` | IEEE SA / IEEE 802.11 WG | Fixed profile | W-HR | Qualified | `e356f1009fd814d667952673ed230320bcd463369bcf2eb219eb69ca2b3595e8` | W |
| `wifi-ofdm-20m` | IEEE SA / IEEE 802.11 WG | Fixed profile | W-ERP | Qualified | `c035c7661b7c2b5b1ad6bcfb65dda903f6ef92bc230c0c54b332f974cb92a1c8` | W |
| `wifi6-he-su` | IEEE SA / IEEE 802.11 WG | Fixed profile | W-SU | Qualified | `640fd2bfe140511d14ac9f9583ceadbe86e904e2759fb154bc5fc1fc002e7453` | W |
| `wifi6-he-er-su` | IEEE SA / IEEE 802.11 WG | Fixed profile | W-ERSU | Qualified | `9b183de8f31f5002c3d03fbe39bf4d68477e67a69b04e06ba4008e6ffceec74f` | W |
| `wifi6-he-mu` | IEEE SA / IEEE 802.11 WG | Fixed profile | W-MU | Qualified | `5f403d8407c1d02177c59dd03333599c4ebf658af9a936fa790ccd8930b63392` | W |
| `wifi6-he-tb` | IEEE SA / IEEE 802.11 WG | Fixed profile | W-TB | Qualified | `b465c7a7a56c537b17d7f2e0aa7dd996591d7e5a3b1bcdc2503bb167becdf789` | W |
| `bluetooth-classic-connected` | Bluetooth SIG Core WG | Fixed profile | B-BR | Qualified | `ee2975f261478a52e95e454423e5d4f36ff175a515befd34d6370bea980fe158` | B |
| `bluetooth-le-advertising` | Bluetooth SIG Core WG | Fixed profile | B-LE | Qualified | `2e139351a0deefe58a17eeff9146e720eaac5f674474c465778dce859be64f11` | B |
| `ref-qpsk` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `ref-8psk` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `ref-16qam` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `ref-64qam` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `ref-256qam` | SignalLab | Mathematical reference | No unique external standard | N/A | — | — |
| `custom-lte` | 3GPP TSG RAN | Operator-defined builder | C-LTE | Config-only | — | — |
| `custom-nr` | 3GPP TSG RAN | Operator-defined builder | C-NR | Config-only | — | — |
| `custom-wifi` | IEEE SA / IEEE 802.11 WG | Operator-defined builder | C-WLAN | Config-only | — | — |

## Evidence records

Every digest is the raw SHA-256 of the linked JSON bytes.

| E | Profiles | Retained evidence | SHA-256 |
|---|---|---|---|
| G | 7 GERAN | [`geran-release19-fixed-digital-baseband-oracles-2026-07-27.json`](../validation/geran-release19-fixed-digital-baseband-oracles-2026-07-27.json) | `b24f818661bf6ced2d5f2c0a01e7305ba21c4ce49e21fb08ab9799c51e6b051b` |
| LF | LTE Band 3, Band 38, N-TM, and two LTE NB-IoT components | [`lte-fixed-independent-oracles-2026-07-27.json`](../validation/lte-fixed-independent-oracles-2026-07-27.json) | `f25ebfb28e6f967907516731cee10d7642ff46f774482bb3399f9d7d023cd5b9` |
| L1 | LTE E-TM1.1 | [`lte-etm1-srsran-oracle-2026-07-27.json`](../validation/lte-etm1-srsran-oracle-2026-07-27.json) | `55cae4fcaa514dfe6ffdd6baf25c84a0915131b7403aad095c3d4727b593d34f` |
| L3 | LTE E-TM3.1/3.1a/3.1b | [`lte-etm3-independent-full-frame-oracles-2026-07-27.json`](../validation/lte-etm3-independent-full-frame-oracles-2026-07-27.json) | `e3c3eed68d9453573569821e0c56ac045d8b898012e584ccd09dae9590fb6dab` |
| NT | 4 NR FR1 test models | [`nr-fr1-test-model-independent-oracles-2026-07-27.json`](../validation/nr-fr1-test-model-independent-oracles-2026-07-27.json) | `1fd89861ba3757eaba62328703a9d725b4cc82300db0ff842c90635277507e54` |
| NR | NR n3, 20 ms n78, and narrowband component | [`nr-remaining-fixed-digital-oracles-2026-07-27.json`](../validation/nr-remaining-fixed-digital-oracles-2026-07-27.json) | `47950c3f49b63275302101be61b46035f0ec628cc26e80ff0e1e32af5fc454ce` |
| W | 6 fixed IEEE 802.11 PPDUs | [`ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json`](../validation/ieee80211-2024-fixed-ppdu-digital-oracles-2026-07-27.json) | `9948a2cf857e46d5935dbb8f3f7573796bce780b36de17a647b0ecec6aa9ba18` |
| B | 2 Bluetooth packets | [`bluetooth-core63-fixed-packet-digital-oracles-2026-07-27.json`](../validation/bluetooth-core63-fixed-packet-digital-oracles-2026-07-27.json) | `f44813b259f8cc52e39fe63cd635918a2a01e5bba257343b54b6ca53084633e2` |

The GERAN xCCH coding sub-oracle is additionally retained as [`geran-libosmocore-oracle-2026-07-27.json`](../validation/geran-libosmocore-oracle-2026-07-27.json), SHA-256 `3e861d35a4abb4acb6c5c2b8e8e06017e76db313dfd0f87e01d9ac3b629040bd`. The LTE E-TM1.1 official-clause extraction is [`lte-etm1-release19-clause-evidence.json`](../validation/lte-etm1-release19-clause-evidence.json), SHA-256 `1171018747af96b84e9fe7874ae7bbf0c426fad9a43b300c1c2e5b8288be0775`.

The oracles deliberately differ by applicable boundary:

- GERAN rederives every I/Q component; xCCH coding is also matched to pinned libosmocore. The five higher-order fixtures start at frozen modulator-input fields and make no TS 45.003 claim.
- LTE full-frame lanes use pinned srsRAN comparisons. For each E-TM3.1/3.1a/3.1b artifact, the zero-import independent oracle classifies and compares all 84,000 resource elements, including 74,436 PDSCH and 9,564 non-PDSCH elements, then compares all 153,600 OFDM samples. It separately implements the PDSCH mask, circular-LFSR Gold sequence, recursive 64/256/1024-QAM equations, radix-2 inverse FFT, and cyclic prefix; fresh srsRAN and OCUDU executions anchor the external base and constellation mappings. Narrowband components disclose omitted host placement and power.
- NR full-frame lanes compare complete resource grids and OFDM samples with pinned py3gpp/NumPy; the n78 oracle covers 560 symbols, 1,834,560 resource elements/kinds, and 2,457,600 samples across both required radio frames. NR 1024-QAM additionally uses OCUDU. Content-identical n3 and narrowband lanes use their already verified source artifacts compositionally.
- WLAN uses separately structured sample-domain decoders for all six PPDUs and a pinned live gr-ieee802-11 oracle for ERP-OFDM.
- Bluetooth checks published Core sample data and independently reconstructs every active ideal-GFSK sample. Its adapter rejects any window that would extend beyond the hash-bound one-shot BR or LE capture.

## Executing the tests

Repository-owned structural, artifact, evidence-hash, and internal-oracle checks:

```bash
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm run typecheck
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm test
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm run test:standards:structural
PATH=/Users/johnelliott/.nvm/versions/node/v22.23.1/bin:$PATH npm run check
```

Some independent oracles require pinned external checkouts, binaries, Python environments, vectors, or official archives. Their Vitest cases skip if the environment is absent. To make absence fail, set the appropriate requirement flag and run the named test:

| External lane | Requirement flag | Test file |
|---|---|---|
| LTE E-TM1.1 frame and retained run report / srsRAN | `SIGNALLAB_REQUIRE_3GPP_ORACLE=1` | `src/lte-etm1-independent-oracle.test.ts`, `src/lte-etm1-oracle-evidence.test.ts` |
| LTE E-TM3 full frame / srsRAN + independent oracle | `SIGNALLAB_REQUIRE_LTE_ETM3_FULL_ORACLE=1` | `src/lte-etm3-independent-oracle.test.ts` |
| LTE E-TM3 QAM anchors / srsRAN + OCUDU | `SIGNALLAB_REQUIRE_LTE_ETM3_QAM_ORACLE=1` | `src/lte-etm3-independent-oracle.test.ts` |
| LTE Band 3 / srsRAN | `SIGNALLAB_REQUIRE_LTE_BAND3_FDD20_ORACLE=1` | `src/lte-band3-fdd-20m-independent-oracle.test.ts` |
| LTE Band 38 / srsRAN | `SIGNALLAB_REQUIRE_LTE_BAND38_TDD10_ORACLE=1` | `src/lte-band38-tdd-10m-independent-oracle.test.ts` |
| LTE N-TM / srsRAN | `SIGNALLAB_REQUIRE_LTE_NTM_ORACLE=1` | `src/lte-ntm-independent-oracle.test.ts` |
| NR FR1 test models / py3gpp + OCUDU | `SIGNALLAB_REQUIRE_NR_FR1_TM_ORACLE=1` | `src/nr-fr1-test-model-independent-oracle.test.ts` |
| NR n78 / py3gpp | `SIGNALLAB_REQUIRE_NR_N78_TDD_100M_ORACLE=1` | `src/nr-n78-tdd-100m-independent-oracle.test.ts` |
| WLAN ERP-OFDM / gr-ieee802-11 | `SIGNALLAB_REQUIRE_WLAN_OFDM_ORACLE=1` | `src/wlan-fixed-independent-oracle.test.ts` |
| Official 3GPP E-TM1.1 archives | `SIGNALLAB_REQUIRE_3GPP_CLAUSE_ARCHIVES=1` | `src/lte-etm1-clause-archive.test.ts` |

With every external binding supplied, this command sets every requirement flag and runs all live lanes in one fail-closed process:

```bash
npm run test:standards:live
```

`npm run test:standards` runs the complete structural suite and then the mandatory live suite. It intentionally fails rather than skips if any required checkout, binary, script, vector, report, or archive path is absent or does not match its pin.

Example WLAN live execution:

```bash
SIGNALLAB_REQUIRE_WLAN_OFDM_ORACLE=1 \
SIGNALLAB_GR_IEEE80211_REPOSITORY=/path/to/pinned/gr-ieee802-11 \
SIGNALLAB_GR_IEEE80211_OFDM_HARNESS_SOURCE=/path/to/gr_ofdm_oracle.cc \
SIGNALLAB_GR_IEEE80211_OFDM_HARNESS_BINARY=/path/to/gr_ofdm_oracle \
SIGNALLAB_GR_IEEE80211_OFDM_VECTOR=/path/to/fixed-ack-6mbps.json \
npx vitest run src/wlan-fixed-independent-oracle.test.ts
```

Each live test verifies its checkout, source, binary/script, and vector identities before comparing fresh output. See the test source for the exact environment-variable set and pinned hashes.

## Limitations that remain

The following are explicitly **not** established:

- blanket compliance of SignalLab, an entire technology family, or an arbitrary generated configuration;
- calibrated output level, EVM, frequency error, spectral mask, occupied bandwidth, ACLR, spurious emissions, receiver performance, or any other conducted-RF requirement;
- radiated/OTA behavior;
- MAC channel access or a complete network schedule beyond fields explicitly present in a fixed artifact;
- interoperability, operator acceptance, regulatory authorization, Wi-Fi Alliance certification, Bluetooth SIG product qualification, or 3GPP device certification; or
- transfer of a passing result to changed bytes, settings, code, dependencies, standards revisions, or hardware.

Those claims require separately governed artifacts and, where applicable, current calibrated external-laboratory or program evidence. Software tests and simulated receiver impairments cannot supply them.
