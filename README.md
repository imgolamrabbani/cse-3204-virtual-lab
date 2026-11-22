# CSE 3204 — Data Communication Sessional Virtual Lab

An interactive web-based hardware trainer & dual-channel oscilloscope simulator built for practicing all 6 **CSE 3204 (Data Communication Sessional)** laboratory experiments at home.

## Included Experiments
1. **Amplitude Modulation (AM) & Demodulation** — `MODEL TCM 005-01`
2. **Frequency Modulation (FM) & Demodulation** — `MODEL TCM 005-02`
3. **Analog-to-Digital Conversion (Sampling) Using PAM** — `MODEL TCM 001-02`
4. **Frequency Division Multiplexing (FDM)** — `MODEL TCM 001-11`
5. **Time Division Multiplexing (TDM)** — `MODEL TCM 001-03`
6. **Line Coding (`NRZ-L`, `NRZ-S`, `NRZ-M`, `URZ-AMI`)** — `MODEL TCM 002-01`

## Features
- **Interactive SVG Trainer Boxes**: Click any two sockets to route stackable patch cords, click a wire to disconnect, drag or scroll rotary knobs, and toggle DIP switches / jumpers / 8-bit binary patterns.
- **Graph-Driven Signal Simulation**: True netlist-based waveform evaluation reacting live to wiring topology, missing sync bridges, shorts to ground, modulation index, Nyquist sampling rate, and decoder mode.
- **Live Dual-Channel HTML5 Canvas Oscilloscope**: `CH1` (Yellow) & `CH2` (Blue) traces with oversampled RF envelope rendering, adjustable Timebase, Volts/Div, vertical offset, AC/DC coupling, movable probes, Quick Probe Stages, Autoset, and Freeze/Run.
- **Practice Mode**: Sidebar switcher with completion progress, **Check Wiring** validator, **Reset Wires**, **Show Hint / Correct Wiring** overlay + one-click Auto-Wire, and built-in **Lab Manual** reference.

## Local Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
npm run preview
```
