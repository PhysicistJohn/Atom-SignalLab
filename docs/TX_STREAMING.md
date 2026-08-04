# SignalLab Tx streaming (host tooling)

SignalLab's Tx stream is a **host-tooling sample-stream surface** for feeding
operator transmit hardware. It is defined by
[`contracts/signal-lab-tx-stream-v1.json`](../contracts/signal-lab-tx-stream-v1.json)
and driven through `tools/tx-stream.mjs` (built from `src/tx-stream-cli.ts`).

**What it is not.** It is not the Atomizer measurement bridge and does not
change `acquireIq`. It is not an instrument or API contract and registers no
Atomizer-facing capability. It makes **no RF emission, conformance, or
calibration claim**: streamed bytes carry their source qualification unchanged,
and emission responsibility sits with the operator and their hardware.
`standardsCompliance` remains `not-claimed` and `rfConformance` remains
`not-qualified`. Device-loop (cyclic) transmission is waveform repetition at
the DAC, not a new qualified artifact.

## Stream model

- **Chunked pull, one chunk in flight.** The engine produces bounded chunks
  (default 16,384 samples, max 65,536); the pump awaits each sink
  acknowledgement before pulling the next.
- **Exact determinism.** Every output sample is a pure function of the plan
  and its absolute output sample coordinate. Any partition of the stream into
  consecutive chunks is byte-identical to the whole, and a stream resumed from
  any coordinate reproduces the tail exactly.
- **Receipts and manifest.** Each chunk carries a receipt (start sample,
  count, byte length, optional SHA-256, qualification, payload kind, boundary
  policy, transform operations). The final manifest records totals and a
  `completed` / `terminated` / `faulted` state.
- **Custom profiles.** The plan's validated selections are installed for the
  duration of each synthesized window and restored afterwards; the bytes always
  render the plan's disclosed configuration.

## Profile capability matrix

Sink classes: `file`/`stdout` accept any admitted rate; `iiod` (device) must
clear the device rate window and the link ceiling (or a feasible device loop).

| Class | Profiles | Live-iiod streamability |
|---|---|---|
| Fixed cyclic artifacts | 29 content-bound cyclic standards profiles | Streamable at native or a derived rate once the rate is inside the device window and at/below the link ceiling. Native rates above the link ceiling need device-loop (if inside the device window) or file/stdio. |
| Unbounded compositions | 2 Bluetooth long-dwell (native 80 MHz) | 80 MHz is above the device rate window, so the planner refuses iiod even with `--device-loop`: **file/stdio only**. |
| Rate-flexible | 8 lab references + 3 builders | Generated at any rate ≥ signal bandwidth; live-iiod streamable when inside the device window and at/below the link ceiling. |
| One-shot | 2 Bluetooth fixed | **Refuse streaming** with a typed refusal pointing to the matching long-dwell composition. |

Derived rates below the native artifact rate must clear the 0.95-Nyquist guard
(`ceil(signalBandwidthHz / 0.95)`); upsampling is lossless and admitted.
Wideband handling splits by rate: LTE-20M (30.72 MS/s) and Wi-Fi-20M
(20 MS/s) are inside the device window and may use device-loop (board support
is capability-probed) or file/stdio. NR-n78 (122.88 MS/s) and both 80 MHz
Bluetooth long-dwell compositions exceed the device rate window, so their only
admitted sink is file/stdio — device looping does not bypass the DAC rate
window.

## Timeline recipes (natural signals)

Recipes are unbounded, seeded, standards-derived engineering projections over
the frozen corpus generators. They read those generators only; they never
mutate sealed artifacts, catalog state, or classifier-corpus determinism.
Streamed recipe bytes are **source-clean** (no propagation channel, no receiver
impairment), unlike classifier corpus rows. Every recipe publishes its schedule
model, the mandated splatter/ramp/source-clean disclosure, and exact
later-promotion requirements (including a new trio version with coordinated
commits).

| Recipe | Rate | Schedule model | Device loop |
|---|---:|---|---|
| `gsm-900-xcch-cycle-v1` | 1.3 MHz | Corpus schedule as-is: TS0 seeded xCCH 4-frame cycle + fixed dummy bursts TS1–7; content rotates per cycle | 24,000 samples |
| `lte-band3-operational-v1` | 30.72 MHz | Continuous 10 ms frames; PDSCH content rotates per absolute frame ordinal | 307,200 samples |
| `nr-n78-tdd-pattern-v1` | 122.88 MHz | Continuous 20 ms artifact frames (4×5 ms TDD pattern); content rotates per frame; TDD phase from the absolute coordinate | 2,457,600 samples (exceeds device window) |
| `wifi-ofdm-ppdu-stream-v1` | 20 MHz | Seeded ACK PPDUs at prevEnd + DIFS(680) + backoff×slot(180); silence between PPDUs; NOT a MAC | none (no finite period) |
| `fm-broadcast-mpx-v1` | 20 MHz | Continuous stereo FM, 256 kHz Carson; closed-form, any sample independently evaluable | none |
| `am-voice-v1` | 20 MHz | Continuous voiced full-carrier AM, 10 kHz; closed-form | none |

Schedule disclosure (all recipes): transitions are sample-domain hard edges; no
power ramp is modeled (GSM power-time template absent, Wi-Fi TX ramp absent);
wideband splatter is expected at schedule edges; the stream is not
representative of a conformant transmitter's spectrum.

Recipe default seeds live in the reserved `0x51A7xxxx` domain, namespaced away
from classifier-corpus seeds.

## ci16le device encoding

Device sinks convert engine `cf32le` to `ci16le`: interleaved little-endian
int16 I/Q, scale ×32768, round-half-away-from-zero, clip to ±32767, non-finite
input fails closed. The Neptune P210 TX DAC scan format is `le:S16/16>>0` per
the live unit diagnostic; `le:S12/16>>0` with full-scale code 2048 is the
RX-direction ADC format and is not the TX convention. Emitted amplitude is
controlled only via the `hardwaregain` attribute; no amplitude verification
exists for this surface yet, and amplitude must never be inferred from this
encoding.

## Rate planner

The planner publishes its arithmetic in every verdict. Live P210 constants and
provenance:

| Constant | Value | Provenance |
|---|---:|---|
| Device rate window | 2,083,333 – 61,440,000 samples/s | live `sampling_frequency_available` |
| TX RF-bandwidth ceiling | 40 MHz (RX is 56 MHz) | live `rf_bandwidth_available` |
| Tune envelope | 46.875 MHz – 6 GHz | live LO range |
| Sustained link ceiling | ~19.3 MB/s (~4.825 Msps ci16le) | RX-direction measurement over the routed path; TX re-measured in the runbook |
| Device-loop buffer budget | 256 MiB | board CMA total (live diagnostic) |

Verdicts: `streamable-over-link` (iiod at/below the link ceiling),
`device-loop-required` (iiod above the link ceiling, feasible cyclic buffer),
`device-loop-infeasible` (device loop requested but the period/rate cannot fit),
`file-or-stdio-only` (admitted for file/stdio delivery; no device-link
constraint evaluated), `rejected-below-anti-alias-guard`, and
`rejected-outside-device-rate-window`.

FR2 band centers above the instrument maximum are clamped in the custom
builders; device-sink placement additionally requires the P210 tune envelope
above. No PLL lock-status attribute exists on this firmware, and this surface
performs no tuning verification; the RX shift-test procedure in
`Atom-Classifier/docs/ota-results.md` must precede any capture relied upon for
tuning sanity.

## Failure algebra

| Failure | Required result |
|---|---|
| Invalid input | reject before any state or synthesis |
| One-shot profile stream request | reject with guidance to the longdwell equivalent |
| Derived rate below the 0.95-Nyquist guard | reject before synthesis |
| Rate above sink sustained capacity | explicit warning, then reject unless device-loop or file/stdio |
| Sink write failure | stop at first failure and report `faulted` |
| Cursor bound exceeded | reject before synthesis |

## Twin dry-run

`tools/tx-stream-twin-smoke.py` hosts the NeptuneSDR QEMU-twin IIOD endpoint
in-process (no QEMU), streams generated I/Q into it through the bundled CLI,
and compares the bytes the twin captured against a byte-identical `ci16le`
file rendering of the same plan. It exercises the attribute handshake (LO,
adaptive rate/bandwidth ordering, attenuation ramp, RF port, ENSM), the
ci16le conversion, `iio_writedev`, and byte accounting across four shapes:

- a flexible lab profile (`cw`),
- a fixed cyclic artifact upsampled to the live-Tx rate (`gsm-900-loaded-bcch`),
- a builder (`custom-lte`),
- a timeline recipe via device-loop (`lte-band3-operational-v1`, one period).

The twin boots with an RF model attached; the smoke detaches it so WRITEBUF
payloads land in the drain buffer for the byte comparison. Run it with the
twin repo beside SignalLab:

```bash
TWIN_REPO=../Atom-NeptuneSDR-Twin \
LIBIIO_TESTS=/path/to/libiio/build/tests \
python3 tools/tx-stream-twin-smoke.py
```

This is a rehearsal of the device sink, **not** live-hardware evidence. The
twin's `sampling_frequency_available` floor and `rf_bandwidth` ceiling differ
from the real board (see the runbook), so twin success does not imply live
acceptance. It is a manual gate, not part of `npm run check`.

## Relationship to the classifier corpus

Recipes reuse the corpus generators but bypass `classification-corpus.ts` (the
propagation-channel-bearing classifier path). Streamed recipe bytes are
source-clean, whereas classifier corpus rows carry the propagation channel; do
not use a streamed recipe capture as a classifier training row without applying
the channel. Recipe streams are candidate stimulus for DACS v4.1 diagnostics
(notably the am-voice profile) via an RX-loopback capture, but that is a
separate, separately-evidenced step.
