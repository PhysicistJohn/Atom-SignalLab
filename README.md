# TinySA SignalLab

SignalLab is the standalone stimulus-authoring member of the TinySA trio. It owns deterministic CW, AM, FM, 3GPP-derived and IEEE-derived visual replay profiles plus seeded AWGN and Rayleigh channel models.

It does **not** impersonate a USB instrument, emit RF, or claim conformance-grade I/Q. Its future integration surface is a versioned `SignalLabStimulusIntent`; the Firmware repository will own any sink that applies that intent to the executable twin.

```bash
npm install
npm run dev
```
