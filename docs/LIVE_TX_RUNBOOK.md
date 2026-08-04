# Live Tx runbook — Neptune P210

Runbook for transmitting SignalLab-streamed I/Q on the real Neptune P210
(XC7Z020 + AD9361, `ip:10.0.0.250` eth0 / `192.168.2.1` usb0) with RX-loopback
verification. This is a **low-rate, dummy-load, observability-first** procedure.
It demonstrates the digital→DAC→RX chain at a low sample rate; it does **not**
demonstrate calibrated output power, spectral mask, EVM, ACLR, spurious
behavior, antenna behavior, regulatory compliance, or any standards conformance
of the emitted signal. Emission responsibility remains with the operator and
hardware. SignalLab's claims are unchanged: `standardsCompliance=not-claimed`,
`rfConformance=not-qualified`.

## Hard safety rules

- Dummy load on the TX output **before any transmit**; low power, low rate.
- **Never** `fw_setenv`, never any vendor flash path, never firmware files. The
  vendor flash and `fw_env.config` are known-broken; see
  `Atom-NeptuneSDR-Firmware/docs/live-unit` and
  `Atom-Classifier/docs/ota-results.md`.
- Reboot only via MSD eject or power cycle.
- Attribute writes are runtime-only; teardown restores the prior ENSM state.
- Known unit failure: a latching stuck-RX-LO (readbacks accept, spectrum never
  moves) clears only on cold boot. Run the RX health gate before trusting any
  capture.

## Owner-supplied prerequisites

50 Ω dummy load; ≥60 dB SMA attenuator rated for the test frequency; SMA
cabling; a reachable board; an FFT/envelope tool for the RX capture. **If RF
parts are absent, stop after the twin dry-run** (Phase 5); the deliverable is
complete without live transmission.

## Preflight (no RF)

1. **RX health gate.** Tune-a/tune-b shift test; on stuck-LO symptoms,
   cold-boot and re-test before any capture. Capture a named pre-TX noise-floor
   baseline.
2. **Interface and link.** Record `ifconfig` state; prefer eth0
   (`10.0.0.250`), fall back to usb0 (`192.168.2.1`). Annotate the 19.3 MB/s
   constant with its interface of provenance.
3. **Enumerate.** `iio_info` full enumeration; compare scan elements, formats,
   and attribute names against `NEPTUNE_TX_IIO_NAMES`. Stop on any mismatch
   before writing. Read `ensm_mode_available`.
4. **Client launch check.** `iio_writedev` version banner with the DYLD
   framework path set. TX throughput probe at 2,083,333 and 5 Msps into the
   dummy load; if materially different from 19.3 MB/s, annotate the planner
   constant.
5. **Cyclic probe.** A small one-period `iio_writedev -c` buffer for ~5 s under
   a deadline wrapper; record supported / unavailable-on-this-firmware. Nothing
   downstream depends on cyclic being available.

## Live transmit (low rate, dummy load, RX loopback)

- **Signal.** `gsm-900-loaded-bcch` upsampled 1.3 MHz → 2,083,333 samples/s
  ci16le (~8.3 MB/s, under the ceiling), center 947.4 MHz, ENSM `fdd`,
  hardwaregain at the documented low-power attenuation, rf_port confirmed
  against the physical wiring. Bounded duration (~2 s).
- **Loopback.** TX → ≥60 dB attenuator → RX SMA. RX configured per the proven
  `runme.py` recipe (`gain_control_mode slow_attack`). Run a CW
  level-calibration preflight first (tone at the live rate; sweep
  attenuator/gain; record peak-vs-floor) and choose loopback attenuation from
  that evidence. Capture with a bounded `iio_readdev -s <samples>`.

### Pass criteria (all must hold)

1. `iio_writedev` accepts 100% of planned bytes; manifest `completed`;
   underruns 0 (or recorded non-zero with honest accounting).
2. **Expected-vs-measured amplitude gate:** RX peak within the
   evidence-calibrated window of the predicted level, ≥20 dB above floor.
3. Occupancy matches GSM burst structure (slot-clocked on/off at 4.615 ms frame
   periodicity) in the envelope; save an evidence plot.
4. Attribute readbacks still equal planned values after the run.

### Abort / recovery

Kill `iio_writedev` → write `ensm_mode` back → read it back → RX energy check
below threshold at center (the noise-floor capture is pass/fail =
stop-confirmed). If iiod is unreachable with a stream active, power-cycle
immediately or verify/kill via the board's persistent SSH. Three consecutive
failures → power-cycle, re-run preflight, never blind-retry. Optional second
profile: `lte-ntm` at the same pass criteria.

## Evidence record

Write artifacts to an owner-chosen scratch directory with a fixed naming
convention (`step-timestamp`) and a manifest JSON listing every artifact with
its exact command line. These are **scratch evidence, not governed artifacts**;
they are not committed as sealed assets.

## Honest reporting line (verbatim)

> Live validation demonstrates that SignalLab's streamed bytes traverse the
> host link, the AD9361 DAC path, and an RX-loopback capture with expected
> center-frequency energy, amplitude, and burst occupancy at a low sample rate
> into a dummy load. It does NOT demonstrate calibrated output power, spectral
> mask, EVM, ACLR, spurious behavior, antenna behavior, regulatory compliance,
> or any standards conformance of the emitted signal. Emission responsibility
> remains with the operator and hardware. SignalLab's claims are unchanged:
> standardsCompliance=not-claimed, rfConformance=not-qualified.
