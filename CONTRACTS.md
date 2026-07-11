# SignalLab contract

Contract version: `1`.

Owner: this repository. Consumers may select a closed profile, configure the seeded channel, observe immutable status, and eventually deliver `SignalLabStimulusIntent` to a separately versioned sink.

Assumptions:

- Frequencies are integer hertz and levels are finite dBm.
- A descriptor marked `standards-derived` is a visual resource/timing projection, not validated I/Q.
- AWGN and Rayleigh outputs are deterministic for profile, channel, sweep index, and point grid.

Guarantees:

- Every accepted profile has exactly one descriptor and source clause.
- Invalid profile/channel input fails at the boundary; nothing is substituted.
- SignalLab never presents itself as USB CDC hardware.
- `conformance-validated` requires an immutable SHA-256 asset identity.

Composition rule: SignalLab produces stimulus intent; TinySA Firmware may consume it; TinySA Atomizer observes and controls the instrument/twin. No repository may silently assume ownership of another repository’s state.
