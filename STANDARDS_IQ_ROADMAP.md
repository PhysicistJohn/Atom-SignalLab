# Standards and complex-I/Q roadmap

Status: all-profile engineering-envelope baseline implemented; independently
generated and validated standards assets remain future work.

## Product boundary

SignalLab Studio is one controlled UI used in two shells. Standalone SignalLab
owns local lifecycle and state; Atomizer embeds the same `SignalLabStudio` when
the admitted source exposes the SignalLab feature. The six family tabs are
`LAB`, `GSM`, `LTE`, `5G NR`, `WI-FI`, and `BLUETOOTH`. Atomizer remains the
instrument/session owner and sends profile and channel changes through its
versioned driver boundary. Direct imports share the view; they do not create a
second bridge, hidden state channel, or cross-repository mutation path.

Complex-I/Q is likewise a driver-neutral Atomizer acquisition shape rather than
a SignalLab special case. A source advertises its center-frequency, sample-rate,
bandwidth, sample-count, and format ranges; Atomizer configures and validates a
complete capture before rendering time-domain I/Q and a constellation preview.
The v1 Atomizer contract can represent `cf32le`, `ci16le`, `ci8`, and `cu8`.
Each SignalLab acquisition currently produces one bounded, complete `cf32le`
buffer for any of the 34 closed profiles. Its independent 1 kHz through 245.76
MHz bandwidth setting drives a
deterministic causal first-order baseband low-pass applied identically to I and
Q, and may not exceed the selected sample rate. Bandwidth is the filter's
two-sided steady-state -3 dB span, with edges at `+-B/2`; initialization from
the first analytic sample preserves CW exactly. This is filtering, not
resampling or an analog-front-end claim. Chunking, continuous streaming,
backpressure, cancellation, and overrun reporting require a later streaming
contract before incoming I/Q hardware may claim them.

## What works now

| Family | Studio catalog | Scalar replay | Complex-I/Q |
|---|---|---|---|
| Lab (CW/AM/FM) | Yes | Yes | Deterministic analytic `cf32le`, at most 65,536 samples; `analytic-complex-baseband` |
| GSM / GERAN | Yes | Standards-derived visual projection | Deterministic burst/modulation engineering envelope; `standards-derived-complex-baseband` |
| LTE / E-UTRA | Yes | Standards-derived visual projection | Deterministic representative-grid engineering envelope; `standards-derived-complex-baseband` |
| 5G NR | Yes | Standards-derived visual projection | Deterministic representative-grid engineering envelope; `standards-derived-complex-baseband` |
| WLAN / Wi-Fi | Yes | Standards-derived visual projection | Deterministic representative-grid engineering envelope; `standards-derived-complex-baseband` |
| Bluetooth | Yes | Standards-derived visual projection | Deterministic GFSK/FHSS-style engineering envelope; `standards-derived-complex-baseband` |

The current producer therefore covers all 34 profiles, but it has two evidence
tiers. CW, AM, and FM are closed-form analytic laboratory envelopes. The other
31 buffers are standards-derived engineering projections. They are not
packet-decodable or bit-exact protocol reproductions, standards test vectors, or
conformance vectors, and their availability does not advance them through the
provider/evidence qualification ladder below. When the requested sample rate is
below a wideband profile's catalogued occupied support, its current output is a
deterministic discrete-time alias projection rather than an alias-free
reconstruction of the full channel.

The current standards preset schema also includes one concrete seed,
`lte-etm-1-1-10mhz-fdd`: LTE E-TM 1.1, 10 MHz FDD, 50 resource blocks,
15 kHz subcarrier spacing, normal cyclic prefix, one antenna port, physical cell
ID 0, 15.36 Msamples/s, and ten radio frames. It is `standards-derived`, has no
named generator, generated artifact, or independent evidence attached, and
makes no compliance claim. The schema does not admit `reference-generated`
qualification until a content-addressed I/Q artifact and generator identity are
both present.

## Future provider-neutral generation pipeline

Each future framework-generated standards asset must move through the same
closed pipeline:

1. A preset pins the standards organization, document revision, clauses, and
   HTTPS publication for every relevant parameter.
2. A deterministic recipe binds a named provider, product/version,
   implementation, and recipe revision.
3. Generation emits a content-addressed complex-I/Q artifact with exact sample
   format, channel count, sample rate, center, byte geometry, content SHA-256,
   and generator-configuration SHA-256.
4. Internal checks bind their method, acceptance criterion, result, report
   digest, artifact digest, and cited standards clauses.
5. Independent validation uses a different provider and implementation and
   binds the same artifact by SHA-256. A passing evidence record requires every
   declared check to pass.
6. Only then may the preset reach `independently-verified`. Missing or
   inconclusive evidence remains visible and cannot be promoted by UI copy.

The qualification ladder is `synthetic-projection`, `standards-derived`,
`reference-generated`, and `independently-verified`. The current schema fixes
`complianceClaim` to `not-claimed`: even independent waveform verification is
not automatically regulatory approval, device certification, RF calibration,
or a claim that every receiver/transmitter behavior complies with a standard.
If a later product requirement needs the word *compliant*, it must define the
exact conformance-test scope, version, lab/equipment, uncertainty, pass report,
artifact identity, and expiration/revalidation policy first.

## Future framework acceleration

The implementation direction is adapters around established frameworks, with a
common preset/artifact/evidence contract around them:

- [NVIDIA Sionna](https://nvlabs.github.io/sionna/) is the preferred
  GPU/PyTorch research and differentiable-PHY adapter candidate, especially for
  5G NR experiments. Its output still needs independent cross-validation before
  qualification promotion.
- [srsRAN 4G](https://docs.srsran.com/projects/4g/en/latest/) and
  [srsRAN Project](https://docs.srsran.com/projects/project/en/latest/) are
  candidate independent LTE and 5G implementations and integration-test
  oracles. Provider identity and version must be pinned per artifact.
- [OpenAirInterface](https://gitlab.eurecom.fr/oai/openairinterface5g) is a
  candidate second cellular implementation where its supported configuration
  and licensing fit the preset. It is not assumed interchangeable with srsRAN.
- [GNU Radio](https://www.gnuradio.org/) and
  [SoapySDR](https://github.com/pothosware/SoapySDR) are candidate flowgraph and
  hardware-adapter layers. Hardware identity, clocking, gain, scaling, dropped
  samples, and calibration remain driver evidence rather than being inferred
  from the framework name.

No one framework is declared authoritative for every family. GSM, WLAN, and
Bluetooth adapters should be selected only after a configuration-by-
configuration coverage and license audit; an unsupported configuration remains
unavailable. Generation and independent validation should use distinct
implementations wherever possible.

MATLAB is optional, not a baseline dependency or required release gate. A
future MATLAB exporter or test-vector importer may contribute an additional
provider/evidence record, but the primary pipeline must build and validate
without it.

## Delivery order

1. Keep the present all-profile deterministic complex-envelope path and embedded
   Studio as the integration reference, preserving analytic-laboratory versus
   standards-derived-engineering qualification.
2. Finish the LTE E-TM 1.1 provider adapter, persist its artifact and recipe
   hashes, and compare it with a distinct implementation.
3. Add one narrow, exact generated asset at a time for NR, WLAN, GSM, and
   Bluetooth; retain the current engineering envelope and its lower
   qualification until that asset has a truthful provider and evidence record.
4. Add incoming I/Q hardware through a new Atomizer driver using the same
   complete-buffer contract when its limits fit; design streaming v2 before
   advertising continuous acquisition.
5. Automate independent evidence admission in CI without treating CI success as
   standards or regulatory certification.

Qualification promotion remains fail-closed: unavailable provider, unsupported
preset, drifted tool version, missing artifact, hash mismatch, failed check, or
absent independent evidence leaves the current engineering qualification visible
and cannot be relabelled as independently verified or compliant.
