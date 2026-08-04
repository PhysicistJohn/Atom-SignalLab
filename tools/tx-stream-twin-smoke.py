#!/usr/bin/env python3
"""Twin dry-run smoke for the SignalLab Tx streamer.

Hosts the NeptuneSDR QEMU-twin IIOD endpoint in-process, streams generated
I/Q into it through the bundled tx-stream CLI, and compares the bytes the
twin captured against a byte-identical ci16le file rendering of the same plan.
This is a rehearsal of the device sink (attribute handshake + WRITEBUF byte
accounting); it is NOT live-hardware evidence.

Usage:
  TWIN_REPO=/path/to/Atom-NeptuneSDR-Twin \
  LIBIIO_TESTS=/Users/johnelliott/src/libiio/build/tests \
  python3 tools/tx-stream-twin-smoke.py

The smoke is a manual gate (not part of `npm run check`).
"""
import os
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TWIN_REPO = os.environ.get(
    "TWIN_REPO",
    os.path.join(os.path.dirname(ROOT), "Atom-NeptuneSDR-Twin"),
)
LIBIIO_TESTS = os.environ.get(
    "LIBIIO_TESTS", "/Users/johnelliott/src/libiio/build/tests"
)
PORT = int(os.environ.get("TX_STREAM_TWIN_PORT", "40431"))
URI = "ip:127.0.0.1:%d" % PORT

sys.path.insert(0, os.path.join(TWIN_REPO, "src"))

try:
    from neptunesdr_twin import NeptuneSDRTwin
except Exception as error:  # pragma: no cover - environment guard
    print("twin smoke: cannot import neptunesdr_twin from %s: %s" % (TWIN_REPO, error))
    sys.exit(2)


def run_cli(extra_args, env):
    cmd = ["node", os.path.join(ROOT, "tools", "tx-stream.mjs")] + extra_args
    return subprocess.run(cmd, env=env, capture_output=True, text=True)


def main():
    # Ensure the bundled CLI is built.
    build = subprocess.run(
        ["npm", "run", "build:tx-stream"], cwd=ROOT, capture_output=True, text=True
    )
    if build.returncode != 0:
        print("twin smoke: build:tx-stream failed")
        print(build.stdout)
        print(build.stderr)
        return 1

    child_env = dict(os.environ)
    child_env["PATH"] = LIBIIO_TESTS + os.pathsep + child_env.get("PATH", "")

    failures = 0
    with NeptuneSDRTwin() as twin:
        twin.boot_to_userspace()
        # The board boots with an RFModel attached, which routes WRITEBUF
        # payloads into the RF model's tx FIFO. Detach it so the board's
        # tx_consumer captures raw wire bytes into the drain buffer, letting
        # this smoke compare byte-for-byte against the ci16le file rendering.
        # We only exercise TX here; no RX path is used.
        twin.rf = None
        host, port = twin.start_iiod("127.0.0.1", PORT)
        print("twin smoke: IIOD listening at ip:%s:%d" % (host, port))

        # Each case streams a plan into the twin and compares the captured
        # bytes against a byte-identical ci16le file rendering of the same
        # plan. Bounded cases use --samples; the device-loop case fills one
        # schedule period and lets the DAC repeat it.
        #   label, file-render args, iiod args
        cases = [
            ("cw@3MHz",
             ["--profile", "cw", "--rate", "3000000", "--center", "98000000",
              "--samples", "4096"],
             ["--profile", "cw", "--rate", "3000000", "--center", "98000000",
              "--samples", "4096", "--sink", "iiod", "--uri", URI,
              "--attenuation-db", "10"]),
            ("gsm-upsample@2.083333MHz",
             ["--profile", "gsm-900-loaded-bcch", "--rate", "2083333",
              "--center", "947400000", "--samples", "4096"],
             ["--profile", "gsm-900-loaded-bcch", "--rate", "2083333",
              "--center", "947400000", "--samples", "4096", "--sink", "iiod",
              "--uri", URI, "--attenuation-db", "10"]),
            ("custom-lte-1.4MHz@3MHz",
             ["--profile", "custom-lte",
              "--selections", '{"channelBandwidthMHz":"1.4"}',
              "--rate", "3000000", "--center", "1842500000", "--samples", "4096"],
             ["--profile", "custom-lte",
              "--selections", '{"channelBandwidthMHz":"1.4"}',
              "--rate", "3000000", "--center", "1842500000", "--samples", "4096",
              "--sink", "iiod", "--uri", URI, "--attenuation-db", "10"]),
            # Recipe via device loop: one 10 ms LTE period (307200 samples)
            # fills the cyclic buffer; the file renders the same period.
            ("lte-band3-recipe-device-loop",
             ["--recipe", "lte-band3-operational-v1", "--samples", "307200"],
             ["--recipe", "lte-band3-operational-v1", "--device-loop",
              "--sink", "iiod", "--uri", URI, "--attenuation-db", "10"]),
        ]

        import tempfile
        tmpdir = tempfile.mkdtemp(prefix="tx-stream-twin-")
        for label, file_args, iiod_args in cases:
            file_path = os.path.join(tmpdir, label + ".iq16le")
            # 1) Render the plan to a ci16le file.
            file_run = run_cli(
                file_args + ["--sink", "file:" + file_path, "--format", "ci16le"],
                child_env,
            )
            if file_run.returncode != 0:
                print("[FAIL] %s: file render exited %d" % (label, file_run.returncode))
                print(file_run.stderr)
                failures += 1
                continue
            # 2) Stream the plan into the twin.
            iiod_run = run_cli(iiod_args, child_env)
            if iiod_run.returncode != 0:
                print("[FAIL] %s: iiod stream exited %d" % (label, iiod_run.returncode))
                print(iiod_run.stderr)
                failures += 1
                continue
            drained = twin.drain_transmitted_bytes()
            expected = open(file_path, "rb").read()
            if drained == expected:
                print("[PASS] %s: %d ci16le bytes match" % (label, len(drained)))
            else:
                print("[FAIL] %s: drained %d bytes != file %d bytes" % (
                    label, len(drained), len(expected)))
                print("       head(drained)=%r" % drained[:16])
                print("       head(file)   =%r" % expected[:16])
                failures += 1

        twin.stop_iiod()

    print("twin smoke: %s" % ("FAILED (%d)" % failures if failures else "PASSED"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
