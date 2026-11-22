import { ChannelSampleInfo, LabDefinition, WireConnection } from '../types/lab';
import { NetGraph } from './wiringValidator';

const TWO_PI = Math.PI * 2;

export interface CircuitParams {
  knobs: Record<string, number>;
  switches: Record<string, string>;
}

const ZERO_FN = () => 0;

function makeZero(
  portId: string | null,
  portLabel: string,
  signalName: string,
  warning?: string
): ChannelSampleInfo {
  return {
    portId,
    portLabel,
    signalName,
    isConnected: false,
    vpp: 0,
    freqHz: 0,
    warning,
    sample: ZERO_FN,
  };
}

/**
 * Evaluates the live electrical waveform at any probed port on the active trainer kit,
 * strictly respecting the user's current patch cord topology, knob values, and switch positions.
 */
export function evaluatePortSignal(
  lab: LabDefinition,
  portId: string | null,
  wires: WireConnection[],
  params: CircuitParams
): ChannelSampleInfo {
  if (!portId) {
    return makeZero(null, 'Unattached', 'Probe disconnected');
  }

  const port = lab.ports.find((p) => p.id === portId);
  const portLabel = port ? port.label : portId;

  if (port?.kind === 'gnd') {
    return {
      portId,
      portLabel,
      signalName: '0V Ground Reference',
      isConnected: true,
      vpp: 0,
      freqHz: 0,
      sample: ZERO_FN,
    };
  }

  const graph = new NetGraph(lab.id, wires);

  // Helper: check if a port is shorted to any GND terminal
  const gndPorts = lab.ports.filter((p) => p.kind === 'gnd').map((p) => p.id);
  const isShortedToGnd = (pid: string) =>
    gndPorts.some((g) => g !== pid && graph.isConnected(pid, g));

  if (isShortedToGnd(portId)) {
    return makeZero(portId, portLabel, 'Shorted to GND (0V)', 'Port is shorted to Ground!');
  }

  // Resolve signal by lab
  switch (lab.id) {
    case 'am':
      return evalAM(portId, portLabel, graph, params, isShortedToGnd);
    case 'fm':
      return evalFM(portId, portLabel, graph, params, isShortedToGnd);
    case 'pam':
      return evalPAM(portId, portLabel, graph, params, isShortedToGnd);
    case 'fdm':
      return evalFDM(portId, portLabel, graph, params, isShortedToGnd);
    case 'tdm':
      return evalTDM(portId, portLabel, graph, params, isShortedToGnd);
    case 'linecoding':
      return evalLineCoding(portId, portLabel, graph, params, isShortedToGnd);
    default:
      return makeZero(portId, portLabel, 'No Signal');
  }
}

// =========================================================================
// LAB 1: AM (TCM 005-01)
// =========================================================================
function evalAM(
  portId: string,
  portLabel: string,
  graph: NetGraph,
  params: CircuitParams,
  isShorted: (p: string) => boolean
): ChannelSampleInfo {
  const range = params.switches['freq_range'] ?? '2KHz';
  const baseKnobKhz = params.knobs['msg_freq'] ?? 2.15;
  const fmHz =
    range === '2KHz'
      ? baseKnobKhz * 1000
      : range === '200Hz'
        ? baseKnobKhz * 100
        : baseKnobKhz * 10;
  const msgVpp = params.knobs['msg_amp'] ?? 2.8;
  const msgAmp = msgVpp / 2;
  const carrVpp = params.knobs['carr_amp'] ?? 4.0;
  const carrAmp = carrVpp / 2;
  const fcHz = 100000; // 100 kHz carrier
  const demodGain = params.knobs['demod_gain'] ?? 1.0;

  const msgFn = (t: number) => msgAmp * Math.sin(TWO_PI * fmHz * t);
  const carrFn = (t: number) => carrAmp * Math.sin(TWO_PI * fcHz * t);

  const hasMsgIn = graph.isConnected('sine_out', 'mod_msg_in') && !isShorted('mod_msg_in');
  const hasCarrIn = graph.isConnected('carrier_out', 'mod_carrier_in') && !isShorted('mod_carrier_in');

  // Modulation index μ (capped smoothly at 1.35 to show overmodulation if msg >> carrier)
  const mu = Math.min(1.35, (msgAmp / Math.max(0.6, carrAmp)) * 0.95);

  const amFn = (t: number) => {
    if (!hasCarrIn && !hasMsgIn) return 0;
    if (hasCarrIn && !hasMsgIn) return carrAmp * Math.sin(TWO_PI * fcHz * t);
    if (!hasCarrIn && hasMsgIn) return 0; // Balanced/multiplier modulator needs carrier
    return carrAmp * (1 + mu * Math.sin(TWO_PI * fmHz * t)) * Math.sin(TWO_PI * fcHz * t);
  };

  const hasDemodIn = graph.isConnected('am_out', 'demod_in') && !isShorted('demod_in');
  const demodActive = hasDemodIn && hasCarrIn && hasMsgIn;

  // Envelope detector (half-wave rectified + slight ripple)
  const envTpFn = (t: number) => {
    if (!demodActive) return hasDemodIn && hasCarrIn ? carrAmp * 0.45 : 0;
    const env = Math.max(0, 1 + mu * Math.sin(TWO_PI * fmHz * t));
    const ripple = 0.06 * Math.sin(TWO_PI * fcHz * t);
    return carrAmp * 0.65 * env + ripple;
  };

  // Filtered demodulated message output
  const demodOutFn = (t: number) => {
    if (!demodActive) return 0;
    // If overmodulated (mu > 1), envelope detector clips negative troughs realistically!
    const raw = Math.sin(TWO_PI * fmHz * t);
    const recovered = mu > 1.0 ? Math.max(-1 / mu, raw) : raw;
    const tinyRipple = 0.025 * Math.sin(TWO_PI * fcHz * t);
    return msgAmp * demodGain * recovered + tinyRipple;
  };

  // Resolve any port connected to a driving output
  if (graph.isConnected(portId, 'sine_out')) {
    return {
      portId,
      portLabel,
      signalName: `Message Sine (${(fmHz / 1000).toFixed(2)} kHz)`,
      isConnected: true,
      vpp: msgVpp,
      freqHz: fmHz,
      sample: msgFn,
    };
  }
  if (graph.isConnected(portId, 'carrier_out')) {
    return {
      portId,
      portLabel,
      signalName: 'Carrier Wave (100 kHz)',
      isConnected: true,
      vpp: carrVpp,
      freqHz: fcHz,
      sample: carrFn,
    };
  }
  if (graph.isConnected(portId, 'am_out')) {
    if (!hasCarrIn && !hasMsgIn) {
      return makeZero(portId, portLabel, 'AM O/P (No Inputs)', 'Wire SINE O/P & CARRIER to AM Modulator');
    }
    if (!hasCarrIn) {
      return makeZero(portId, portLabel, 'AM O/P (Missing Carrier)', 'Connect CARRIER → CARRIER I/P');
    }
    if (!hasMsgIn) {
      return {
        portId,
        portLabel,
        signalName: 'Unmodulated Carrier (No Message)',
        isConnected: true,
        vpp: carrVpp,
        freqHz: fcHz,
        warning: 'Connect SINE O/P → MODULATING I/P to modulate',
        sample: carrFn,
      };
    }
    return {
      portId,
      portLabel,
      signalName: `AM Modulated (μ = ${(mu * 100).toFixed(0)}%)`,
      isConnected: true,
      vpp: carrVpp * (1 + mu),
      freqHz: fmHz,
      sample: amFn,
    };
  }
  if (portId === 'demod_env_tp') {
    if (!demodActive) {
      return makeZero(portId, portLabel, 'Envelope TP (Idle)', 'Connect AM O/P → AM I/P');
    }
    return {
      portId,
      portLabel,
      signalName: 'Rectified AM Envelope (TP)',
      isConnected: true,
      vpp: carrVpp * 0.65 * mu,
      freqHz: fmHz,
      sample: envTpFn,
    };
  }
  if (graph.isConnected(portId, 'demod_out')) {
    if (!hasDemodIn) {
      return makeZero(portId, portLabel, 'Demod O/P (Unwired)', 'Connect AM O/P → AM I/P');
    }
    if (!demodActive) {
      return makeZero(portId, portLabel, 'Demod O/P (No Modulated Input)', 'Complete AM Modulator inputs');
    }
    return {
      portId,
      portLabel,
      signalName: `Demodulated Message (${(fmHz / 1000).toFixed(2)} kHz)`,
      isConnected: true,
      vpp: msgVpp * demodGain,
      freqHz: fmHz,
      sample: demodOutFn,
    };
  }

  return makeZero(portId, portLabel, 'Unconnected Input', 'Connect a signal source to this port');
}

// =========================================================================
// LAB 2: FM (TCM 005-02)
// =========================================================================
function evalFM(
  portId: string,
  portLabel: string,
  graph: NetGraph,
  params: CircuitParams,
  isShorted: (p: string) => boolean
): ChannelSampleInfo {
  const fmHz = (params.knobs['fm_msg_freq'] ?? 1.0) * 1000;
  const msgVpp = params.knobs['fm_msg_amp'] ?? 2.0;
  const msgAmp = msgVpp / 2;
  const deltaF = (params.knobs['fm_dev'] ?? 10) * 1000; // ±10 kHz
  const loopGain = params.knobs['fm_loop_tune'] ?? 1.0;

  // For crystal-clear visual FM compression/expansion at 200us/div, we render carrier at 18kHz visual scale
  // while reporting true 100kHz carrier spec, OR true 25kHz visual carrier when zoomed out.
  // Actually 24 kHz carrier with ±12 kHz deviation looks unmistakable and textbook-perfect at 200µs/div!
  const fcDisplay = 24000;
  const beta = (deltaF / fmHz) * (msgVpp / 2.0) * 0.55;
  const carrAmp = 2.5; // 5 Vpp constant amplitude

  const msgFn = (t: number) => msgAmp * Math.sin(TWO_PI * fmHz * t);
  const carrRefFn = (t: number) => carrAmp * Math.sin(TWO_PI * fcDisplay * t);

  const hasModIn = graph.isConnected('fm_msg_out', 'fm_mod_in') && !isShorted('fm_mod_in');
  const fmFn = (t: number) => {
    if (!hasModIn) return carrRefFn(t);
    const phase = TWO_PI * fcDisplay * t + beta * Math.sin(TWO_PI * fmHz * t);
    return carrAmp * Math.cos(phase);
  };

  const hasDemodIn = graph.isConnected('fm_out', 'fm_demod_in') && !isShorted('fm_demod_in');
  const demodRawFn = (t: number) => {
    if (!hasDemodIn || !hasModIn) return 0;
    const clean = msgAmp * loopGain * Math.sin(TWO_PI * fmHz * t);
    const pllRipple = 0.16 * Math.sin(TWO_PI * fcDisplay * 2 * t);
    return clean + pllRipple;
  };

  const hasLpfIn = graph.isConnected('fm_demod_out', 'fm_lpf_in') && !isShorted('fm_lpf_in');
  const finalOutFn = (t: number) => {
    if (!hasLpfIn || !hasDemodIn || !hasModIn) return 0;
    return msgAmp * loopGain * 1.15 * Math.sin(TWO_PI * fmHz * t - 0.12);
  };

  if (graph.isConnected(portId, 'fm_msg_out')) {
    return {
      portId,
      portLabel,
      signalName: `Modulating Sine (${(fmHz / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: msgVpp,
      freqHz: fmHz,
      sample: msgFn,
    };
  }
  if (graph.isConnected(portId, 'fm_carrier_mon')) {
    return {
      portId,
      portLabel,
      signalName: 'Unmodulated VCO Carrier (100 kHz)',
      isConnected: true,
      vpp: carrAmp * 2,
      freqHz: 100000,
      sample: carrRefFn,
    };
  }
  if (graph.isConnected(portId, 'fm_out')) {
    return {
      portId,
      portLabel,
      signalName: hasModIn
        ? `FM Modulated (100kHz ± ${(deltaF / 1000).toFixed(0)}kHz)`
        : 'VCO Free-Running Carrier (No Mod I/P)',
      isConnected: true,
      vpp: carrAmp * 2,
      freqHz: hasModIn ? fmHz : 100000,
      warning: hasModIn ? undefined : 'Connect MOD O/P → MOD I/P to frequency-modulate',
      sample: fmFn,
    };
  }
  if (graph.isConnected(portId, 'fm_demod_out')) {
    if (!hasDemodIn) {
      return makeZero(portId, portLabel, 'PLL Demod O/P (Unwired)', 'Connect FM O/P → FM I/P');
    }
    if (!hasModIn) {
      return makeZero(portId, portLabel, 'PLL Demod O/P (Unmodulated)', 'Connect MOD O/P → MOD I/P');
    }
    return {
      portId,
      portLabel,
      signalName: `Raw PLL Demodulated (${(fmHz / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: msgVpp * loopGain,
      freqHz: fmHz,
      sample: demodRawFn,
    };
  }
  if (graph.isConnected(portId, 'fm_final_out')) {
    if (!hasLpfIn) {
      return makeZero(portId, portLabel, 'Final O/P (Unwired)', 'Connect DEMOD O/P → LPF I/P');
    }
    if (!hasDemodIn || !hasModIn) {
      return makeZero(portId, portLabel, 'Final O/P (No Signal)', 'Complete upstream FM wiring');
    }
    return {
      portId,
      portLabel,
      signalName: `Reconstructed Message (${(fmHz / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: msgVpp * loopGain * 1.15,
      freqHz: fmHz,
      sample: finalOutFn,
    };
  }

  return makeZero(portId, portLabel, 'Unconnected Input', 'Connect a signal source to this port');
}

// =========================================================================
// LAB 3: PAM SAMPLING (TCM 001-02)
// =========================================================================
function evalPAM(
  portId: string,
  portLabel: string,
  graph: NetGraph,
  params: CircuitParams,
  isShorted: (p: string) => boolean
): ChannelSampleInfo {
  const rateStr = params.switches['jp1_rate'] ?? '32KHz';
  const fsHz =
    rateStr === '4KHz' ? 4000 : rateStr === '8KHz' ? 8000 : rateStr === '16KHz' ? 16000 : 32000;
  const p1Gain = params.knobs['p1_gain'] ?? 1.4;

  const genMap: Record<string, { freq: number; amp: number; name: string }> = {
    gen_250: { freq: 250, amp: (params.knobs['p2_amp'] ?? 3.0) / 2, name: '250 Hz Sine' },
    gen_500: { freq: 500, amp: (params.knobs['p3_amp'] ?? 3.2) / 2, name: '500 Hz Sine' },
    gen_1k: { freq: 1000, amp: (params.knobs['p4_amp'] ?? 3.6) / 2, name: '1 kHz Sine' },
    gen_2k: { freq: 2000, amp: (params.knobs['p5_amp'] ?? 3.0) / 2, name: '2 kHz Sine' },
  };

  // Check if probed port is directly on one of the 4 generators
  for (const [gid, cfg] of Object.entries(genMap)) {
    if (graph.isConnected(portId, gid)) {
      return {
        portId,
        portLabel,
        signalName: cfg.name,
        isConnected: true,
        vpp: cfg.amp * 2,
        freqHz: cfg.freq,
        sample: (t) => cfg.amp * Math.sin(TWO_PI * cfg.freq * t),
      };
    }
  }

  // Find which generator drives Sample & Hold Input
  let srcCfg: { freq: number; amp: number; name: string } | null = null;
  if (!isShorted('sh_in')) {
    for (const [gid, cfg] of Object.entries(genMap)) {
      if (graph.isConnected(gid, 'sh_in')) {
        srcCfg = cfg;
        break;
      }
    }
  }

  const ts = 1 / fsHz;
  const sampleNaturalFn = (t: number) => {
    if (!srcCfg) return 0;
    const phase = ((t % ts) + ts) % ts;
    const duty = 0.42;
    if (phase < ts * duty) {
      // Unipolar-biased PAM pulse train (just like TCM 001-02 lab scope!)
      return srcCfg.amp * Math.sin(TWO_PI * srcCfg.freq * t);
    }
    return 0;
  };

  const sampleHoldFn = (t: number) => {
    if (!srcCfg) return 0;
    const tHeld = Math.floor(t / ts) * ts;
    return srcCfg.amp * Math.sin(TWO_PI * srcCfg.freq * tHeld);
  };

  // PAM Modulation Block input
  const pamFromNatural = graph.isConnected('sh_sample_out', 'pam_in') && !isShorted('pam_in');
  const pamFromHold = graph.isConnected('sh_hold_out', 'pam_in') && !isShorted('pam_in');
  const pamActive = Boolean(srcCfg && (pamFromNatural || pamFromHold));

  const pamOutFn = (t: number) => {
    if (!pamActive || !srcCfg) return 0;
    const phase = ((t % ts) + ts) % ts;
    if (pamFromHold && !pamFromNatural) {
      const tHeld = Math.floor(t / ts) * ts;
      return phase < ts * 0.5 ? srcCfg.amp * Math.sin(TWO_PI * srcCfg.freq * tHeld) : 0;
    }
    return phase < ts * 0.45 ? srcCfg.amp * Math.sin(TWO_PI * srcCfg.freq * t) : 0;
  };

  // PWM Modulation Block input (can be driven by S&H O/P, SAMPLE O/P, or directly by a sine generator!)
  let pwmSrcCfg: { freq: number; amp: number; name: string } | null = null;
  let pwmFromHold = false;
  if (!isShorted('pwm_in')) {
    if (srcCfg && (graph.isConnected('sh_hold_out', 'pwm_in') || graph.isConnected('sh_sample_out', 'pwm_in'))) {
      pwmSrcCfg = srcCfg;
      pwmFromHold = graph.isConnected('sh_hold_out', 'pwm_in');
    } else {
      for (const [gid, cfg] of Object.entries(genMap)) {
        if (graph.isConnected(gid, 'pwm_in')) {
          pwmSrcCfg = cfg;
          break;
        }
      }
    }
  }
  const pwmActive = Boolean(pwmSrcCfg);

  // PWM carrier period follows JP1 sampling clock (fsHz)
  const pwmDutyAt = (t: number): number => {
    if (!pwmSrcCfg) return 0.5;
    const tEval = pwmFromHold ? Math.floor(t / ts) * ts : t;
    const norm = Math.sin(TWO_PI * pwmSrcCfg.freq * tEval) * Math.min(1, pwmSrcCfg.amp / 1.8);
    // Duty cycle varies smoothly from 12% to 88% with modulating sine!
    return Math.min(0.88, Math.max(0.12, 0.5 + 0.36 * norm));
  };

  const pwmOutFn = (t: number) => {
    if (!pwmActive) return 0;
    const phase = (((t % ts) + ts) % ts) / ts;
    return phase < pwmDutyAt(t) ? 3.8 : 0;
  };

  // PPM Modulation Block is internally driven by the falling/trailing edge of PWM (dashed trace on TCM 001-02 PCB!)
  const ppmActive = pwmActive;
  const ppmOutFn = (t: number) => {
    if (!ppmActive) return 0;
    const phase = (((t % ts) + ts) % ts) / ts;
    const pulsePos = pwmDutyAt(t) * 0.85; // pulse shifts across 10%..75% of the period
    const pulseWidth = 0.12; // narrow fixed-width pulse!
    return phase >= pulsePos && phase < pulsePos + pulseWidth ? 3.8 : 0;
  };

  // Buffer block: accepts PAM OUTPUT, PWM OUTPUT, or PPM OUTPUT!
  let bufMode: 'PAM' | 'PWM' | 'PPM' | null = null;
  let activeSrcCfg: { freq: number; amp: number; name: string } | null = null;
  if (!isShorted('buf_in')) {
    if (pamActive && graph.isConnected('pam_out', 'buf_in')) {
      bufMode = 'PAM';
      activeSrcCfg = srcCfg;
    } else if (pwmActive && graph.isConnected('pwm_out', 'buf_in')) {
      bufMode = 'PWM';
      activeSrcCfg = pwmSrcCfg;
    } else if (ppmActive && graph.isConnected('ppm_out', 'buf_in')) {
      bufMode = 'PPM';
      activeSrcCfg = pwmSrcCfg;
    }
  }
  const bufActive = Boolean(bufMode && activeSrcCfg);

  const bufOutFn = (t: number) => {
    if (!bufActive) return 0;
    if (bufMode === 'PAM') return pamOutFn(t) * 0.96;
    if (bufMode === 'PWM') return pwmOutFn(t) * 0.96;
    return ppmOutFn(t) * 0.96;
  };

  // Amplifier block
  const ampActive = bufActive && graph.isConnected('buf_out', 'amp_in') && !isShorted('amp_in');
  const ampOutFn = (t: number) => (ampActive ? bufOutFn(t) * p1Gain : 0);

  // 4th-Order Butterworth Filter block (reconstructs analog sine from PAM, PWM, OR PPM!)
  const bwActive = ampActive && graph.isConnected('amp_out', 'bw_in') && !isShorted('bw_in');
  const bwOutFn = (t: number) => {
    if (!bwActive || !activeSrcCfg) return 0;
    const ratio = fsHz / activeSrcCfg.freq;
    const ripple =
      ratio <= 4
        ? 0.22 * activeSrcCfg.amp * Math.sin(TWO_PI * (fsHz - activeSrcCfg.freq) * t)
        : 0.025 * activeSrcCfg.amp * Math.sin(TWO_PI * fsHz * t);
    const phaseLag = bufMode === 'PPM' ? 0.24 : bufMode === 'PWM' ? 0.2 : 0.16;
    return activeSrcCfg.amp * p1Gain * 0.85 * Math.sin(TWO_PI * activeSrcCfg.freq * t - phaseLag) + ripple;
  };

  if (graph.isConnected(portId, 'sh_sample_out')) {
    if (!srcCfg) return makeZero(portId, portLabel, 'Sample O/P (No Input)', 'Connect 1KHZ or 500HZ → S/S&H INPUT');
    return {
      portId,
      portLabel,
      signalName: `Natural Sampled (${(fsHz / 1000).toFixed(0)} kHz)`,
      isConnected: true,
      vpp: srcCfg.amp * 2,
      freqHz: srcCfg.freq,
      sample: sampleNaturalFn,
    };
  }
  if (graph.isConnected(portId, 'sh_hold_out')) {
    if (!srcCfg) return makeZero(portId, portLabel, 'S&H O/P (No Input)', 'Connect 1KHZ or 500HZ → S/S&H INPUT');
    return {
      portId,
      portLabel,
      signalName: `Sample & Hold (${(fsHz / 1000).toFixed(0)} kHz)`,
      isConnected: true,
      vpp: srcCfg.amp * 2,
      freqHz: srcCfg.freq,
      sample: sampleHoldFn,
    };
  }
  if (graph.isConnected(portId, 'pam_out')) {
    if (!pamActive || !srcCfg) return makeZero(portId, portLabel, 'PAM O/P (Unwired)', 'Connect SAMPLE O/P → PAM INPUT');
    return {
      portId,
      portLabel,
      signalName: `PAM Modulated (${(fsHz / 1000).toFixed(0)} kHz pulses)`,
      isConnected: true,
      vpp: srcCfg.amp * 2,
      freqHz: srcCfg.freq,
      sample: pamOutFn,
    };
  }
  if (graph.isConnected(portId, 'pwm_out')) {
    if (!pwmActive || !pwmSrcCfg) {
      return makeZero(portId, portLabel, 'PWM O/P (Unwired)', 'Connect S&H O/P (or SAMPLE O/P) → PWM INPUT');
    }
    return {
      portId,
      portLabel,
      signalName: `PWM Modulated (${(fsHz / 1000).toFixed(0)} kHz variable width)`,
      isConnected: true,
      vpp: 3.8,
      freqHz: pwmSrcCfg.freq,
      isDigital: true,
      sample: pwmOutFn,
    };
  }
  if (graph.isConnected(portId, 'ppm_out')) {
    if (!ppmActive || !pwmSrcCfg) {
      return makeZero(portId, portLabel, 'PPM O/P (Unwired)', 'Connect S&H O/P → PWM INPUT (drives PPM internally)');
    }
    return {
      portId,
      portLabel,
      signalName: `PPM Modulated (${(fsHz / 1000).toFixed(0)} kHz shifted pulses)`,
      isConnected: true,
      vpp: 3.8,
      freqHz: pwmSrcCfg.freq,
      isDigital: true,
      sample: ppmOutFn,
    };
  }
  if (graph.isConnected(portId, 'buf_out')) {
    if (!bufActive || !activeSrcCfg) {
      return makeZero(portId, portLabel, 'Buffer O/P (Unwired)', 'Connect PAM / PWM / PPM OUTPUT → BUFFER INPUT');
    }
    return {
      portId,
      portLabel,
      signalName: `Buffered ${bufMode} (${(fsHz / 1000).toFixed(0)} kHz)`,
      isConnected: true,
      vpp: bufMode === 'PAM' ? activeSrcCfg.amp * 1.92 : 3.65,
      freqHz: activeSrcCfg.freq,
      isDigital: bufMode !== 'PAM',
      sample: bufOutFn,
    };
  }
  if (graph.isConnected(portId, 'amp_out')) {
    if (!ampActive || !activeSrcCfg) {
      return makeZero(portId, portLabel, 'Amplifier O/P (Unwired)', 'Connect BUFFER OUTPUT → AMPLIFIER INPUT');
    }
    return {
      portId,
      portLabel,
      signalName: `Amplified ${bufMode} (${p1Gain.toFixed(1)}x)`,
      isConnected: true,
      vpp: (bufMode === 'PAM' ? activeSrcCfg.amp * 2 : 3.8) * p1Gain,
      freqHz: activeSrcCfg.freq,
      isDigital: bufMode !== 'PAM',
      sample: ampOutFn,
    };
  }
  if (graph.isConnected(portId, 'bw_out')) {
    if (!bwActive || !activeSrcCfg) {
      return makeZero(portId, portLabel, 'Demodulated O/P (Unwired)', 'Connect AMPLIFIER O/P → 4th ORDER BUTTERWORTH I/P');
    }
    return {
      portId,
      portLabel,
      signalName: `Demodulated ${bufMode} Sine (${activeSrcCfg.freq} Hz)`,
      isConnected: true,
      vpp: activeSrcCfg.amp * 2 * p1Gain * 0.85,
      freqHz: activeSrcCfg.freq,
      warning: fsHz / activeSrcCfg.freq <= 4 ? 'Low sampling rate — slight aliasing ripple visible!' : undefined,
      sample: bwOutFn,
    };
  }

  return makeZero(portId, portLabel, 'Unconnected Port', 'Wire upstream blocks to energize this port');
}

// =========================================================================
// LAB 4: FDM (TCM 001-11)
// =========================================================================
function evalFDM(
  portId: string,
  portLabel: string,
  graph: NetGraph,
  params: CircuitParams,
  isShorted: (p: string) => boolean
): ChannelSampleInfo {
  const f1 = (params.knobs['fg1_freq'] ?? 1.0) * 1000;
  const a1 = (params.knobs['fg1_amp'] ?? 2.2) / 2;
  const f2 = (params.knobs['fg2_freq'] ?? 2.5) * 1000;
  const a2 = (params.knobs['fg2_amp'] ?? 2.2) / 2;
  const g1 = params.knobs['bm1_gain'] ?? 1.1;
  const g2 = params.knobs['bm2_gain'] ?? 1.1;
  const ampGain = params.knobs['acamp_gain'] ?? 1.4;

  const fc1 = 100000; // 100 kHz
  const fc2 = 200000; // 200 kHz

  const fg1Fn = (t: number) => a1 * Math.sin(TWO_PI * f1 * t);
  const fg2Fn = (t: number) => a2 * Math.sin(TWO_PI * f2 * t);
  const c1Fn = (t: number) => 1.8 * Math.sin(TWO_PI * fc1 * t);
  const c2Fn = (t: number) => 1.8 * Math.sin(TWO_PI * fc2 * t);

  // Check Balanced Modulator 1 inputs
  const bm1ModSrc = !isShorted('bm1_mod_in')
    ? graph.isConnected('fg1_out', 'bm1_mod_in')
      ? 1
      : graph.isConnected('fg2_out', 'bm1_mod_in')
        ? 2
        : 0
    : 0;
  const bm1CarrSrc = !isShorted('bm1_carr_in')
    ? graph.isConnected('carr_100a', 'bm1_carr_in')
      ? 100
      : graph.isConnected('carr_200a', 'bm1_carr_in')
        ? 200
        : 0
    : 0;

  // Check Balanced Modulator 2 inputs
  const bm2ModSrc = !isShorted('bm2_mod_in')
    ? graph.isConnected('fg2_out', 'bm2_mod_in')
      ? 2
      : graph.isConnected('fg1_out', 'bm2_mod_in')
        ? 1
        : 0
    : 0;
  const bm2CarrSrc = !isShorted('bm2_carr_in')
    ? graph.isConnected('carr_200a', 'bm2_carr_in')
      ? 200
      : graph.isConnected('carr_100a', 'bm2_carr_in')
        ? 100
        : 0
    : 0;

  const bm1Active = bm1ModSrc !== 0 && bm1CarrSrc !== 0;
  const bm2Active = bm2ModSrc !== 0 && bm2CarrSrc !== 0;

  const bm1Fn = (t: number) => {
    if (!bm1Active) return 0;
    const m = bm1ModSrc === 1 ? fg1Fn(t) : fg2Fn(t);
    const fc = bm1CarrSrc === 100 ? fc1 : fc2;
    return g1 * (1.2 + 0.7 * m) * Math.sin(TWO_PI * fc * t);
  };

  const bm2Fn = (t: number) => {
    if (!bm2Active) return 0;
    const m = bm2ModSrc === 2 ? fg2Fn(t) : fg1Fn(t);
    const fc = bm2CarrSrc === 200 ? fc2 : fc1;
    return g2 * (1.2 + 0.7 * m) * Math.sin(TWO_PI * fc * t);
  };

  // Summing Amplifier
  const sumHasBm1 =
    bm1Active &&
    ((graph.isConnected('bm1_out', 'sum_a') && !isShorted('sum_a')) ||
      (graph.isConnected('bm1_out', 'sum_b') && !isShorted('sum_b')));
  const sumHasBm2 =
    bm2Active &&
    ((graph.isConnected('bm2_out', 'sum_b') && !isShorted('sum_b')) ||
      (graph.isConnected('bm2_out', 'sum_a') && !isShorted('sum_a')));

  const sumFn = (t: number) => (sumHasBm1 ? bm1Fn(t) * 0.75 : 0) + (sumHasBm2 ? bm2Fn(t) * 0.75 : 0);

  // Coherent Balanced Demodulator 1
  const bd1HasSum = graph.isConnected('sum_out_1', 'bd1_mod_in') && !isShorted('bd1_mod_in');
  const bd1Carr = !isShorted('bd1_carr_in')
    ? graph.isConnected('carr_100a', 'bd1_carr_in')
      ? 100
      : graph.isConnected('carr_200a', 'bd1_carr_in')
        ? 200
        : 0
    : 0;

  // Which baseband signal does BD1 recover?
  const bd1MatchCh1 = bd1HasSum && sumHasBm1 && bd1Carr === bm1CarrSrc;
  const bd1MatchCh2 = bd1HasSum && sumHasBm2 && bd1Carr === bm2CarrSrc;

  const bd1OutFn = (t: number) => {
    if (!bd1HasSum || bd1Carr === 0) return 0;
    const lo = Math.sin(TWO_PI * (bd1Carr === 100 ? fc1 : fc2) * t);
    return sumFn(t) * lo * 1.4;
  };

  const lpf1HasBd1 = graph.isConnected('bd1_out', 'lpf1_in') && !isShorted('lpf1_in');
  const lpf1OutFn = (t: number) => {
    if (!lpf1HasBd1) return 0;
    let v = 0;
    if (bd1MatchCh1) v += (bm1ModSrc === 1 ? fg1Fn(t) : fg2Fn(t)) * g1 * 0.85;
    if (bd1MatchCh2) v += (bm2ModSrc === 2 ? fg2Fn(t) : fg1Fn(t)) * g2 * 0.85;
    return v;
  };

  // Coherent Balanced Demodulator 2
  const bd2HasSum = graph.isConnected('sum_out_1', 'bd2_mod_in') && !isShorted('bd2_mod_in');
  const bd2Carr = !isShorted('bd2_carr_in')
    ? graph.isConnected('carr_200a', 'bd2_carr_in')
      ? 200
      : graph.isConnected('carr_100a', 'bd2_carr_in')
        ? 100
        : 0
    : 0;

  const bd2MatchCh1 = bd2HasSum && sumHasBm1 && bd2Carr === bm1CarrSrc;
  const bd2MatchCh2 = bd2HasSum && sumHasBm2 && bd2Carr === bm2CarrSrc;

  const bd2OutFn = (t: number) => {
    if (!bd2HasSum || bd2Carr === 0) return 0;
    const lo = Math.sin(TWO_PI * (bd2Carr === 100 ? fc1 : fc2) * t);
    return sumFn(t) * lo * 1.4;
  };

  const lpf2HasBd2 = graph.isConnected('bd2_out', 'lpf2_in') && !isShorted('lpf2_in');
  const lpf2OutFn = (t: number) => {
    if (!lpf2HasBd2) return 0;
    let v = 0;
    if (bd2MatchCh1) v += (bm1ModSrc === 1 ? fg1Fn(t) : fg2Fn(t)) * g1 * 0.85;
    if (bd2MatchCh2) v += (bm2ModSrc === 2 ? fg2Fn(t) : fg1Fn(t)) * g2 * 0.85;
    return v;
  };

  // AC Amplifier (can be fed by LPF-1 or LPF-2)
  const ampFromLpf1 = graph.isConnected('lpf1_out', 'acamp_in') && !isShorted('acamp_in');
  const ampFromLpf2 = graph.isConnected('lpf2_out', 'acamp_in') && !isShorted('acamp_in');
  const acAmpOutFn = (t: number) => {
    if (ampFromLpf1) return lpf1OutFn(t) * ampGain;
    if (ampFromLpf2) return lpf2OutFn(t) * ampGain;
    return 0;
  };

  // Return probed port
  if (graph.isConnected(portId, 'fg1_out')) {
    return {
      portId,
      portLabel,
      signalName: `FG1 Baseband (${(f1 / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: a1 * 2,
      freqHz: f1,
      sample: fg1Fn,
    };
  }
  if (graph.isConnected(portId, 'fg2_out')) {
    return {
      portId,
      portLabel,
      signalName: `FG2 Baseband (${(f2 / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: a2 * 2,
      freqHz: f2,
      sample: fg2Fn,
    };
  }
  if (graph.isConnected(portId, 'carr_100a')) {
    return {
      portId,
      portLabel,
      signalName: 'Carrier 1 (100 kHz)',
      isConnected: true,
      vpp: 3.6,
      freqHz: fc1,
      sample: c1Fn,
    };
  }
  if (graph.isConnected(portId, 'carr_200a')) {
    return {
      portId,
      portLabel,
      signalName: 'Carrier 2 (200 kHz)',
      isConnected: true,
      vpp: 3.6,
      freqHz: fc2,
      sample: c2Fn,
    };
  }
  if (graph.isConnected(portId, 'bm1_out')) {
    if (!bm1Active) return makeZero(portId, portLabel, 'BM1 OUT (Incomplete)', 'Wire FG1 + 100KHz to Balanced Modulator 1');
    return {
      portId,
      portLabel,
      signalName: `Modulated Ch1 (${bm1CarrSrc} kHz carrier)`,
      isConnected: true,
      vpp: g1 * (1.2 + 0.7 * a1) * 2,
      freqHz: bm1ModSrc === 1 ? f1 : f2,
      sample: bm1Fn,
    };
  }
  if (graph.isConnected(portId, 'bm2_out')) {
    if (!bm2Active) return makeZero(portId, portLabel, 'BM2 OUT (Incomplete)', 'Wire FG2 + 200KHz to Balanced Modulator 2');
    return {
      portId,
      portLabel,
      signalName: `Modulated Ch2 (${bm2CarrSrc} kHz carrier)`,
      isConnected: true,
      vpp: g2 * (1.2 + 0.7 * a2) * 2,
      freqHz: bm2ModSrc === 2 ? f2 : f1,
      sample: bm2Fn,
    };
  }
  if (graph.isConnected(portId, 'sum_out_1')) {
    if (!sumHasBm1 && !sumHasBm2) {
      return makeZero(portId, portLabel, 'Summing Amp OUT (Empty)', 'Connect BM1 OUT → A and BM2 OUT → B');
    }
    const chDesc = sumHasBm1 && sumHasBm2 ? 'Ch1 (100kHz) + Ch2 (200kHz)' : sumHasBm1 ? 'Ch1 Only' : 'Ch2 Only';
    return {
      portId,
      portLabel,
      signalName: `Composite FDM (${chDesc})`,
      isConnected: true,
      vpp: (sumHasBm1 ? 2.4 : 0) + (sumHasBm2 ? 2.4 : 0),
      freqHz: sumHasBm1 ? f1 : f2,
      sample: sumFn,
    };
  }
  if (graph.isConnected(portId, 'bd1_out')) {
    if (!bd1HasSum || bd1Carr === 0) return makeZero(portId, portLabel, 'BD1 OUT (Unwired)', 'Connect SUM OUT & 100KHz to BD1');
    return {
      portId,
      portLabel,
      signalName: 'Demodulator 1 Raw Output',
      isConnected: true,
      vpp: 3.0,
      freqHz: f1,
      sample: bd1OutFn,
    };
  }
  if (graph.isConnected(portId, 'bd2_out')) {
    if (!bd2HasSum || bd2Carr === 0) return makeZero(portId, portLabel, 'BD2 OUT (Unwired)', 'Connect SUM OUT & 200KHz to BD2');
    return {
      portId,
      portLabel,
      signalName: 'Demodulator 2 Raw Output',
      isConnected: true,
      vpp: 3.0,
      freqHz: f2,
      sample: bd2OutFn,
    };
  }
  if (graph.isConnected(portId, 'lpf1_out')) {
    if (!lpf1HasBd1 || (!bd1MatchCh1 && !bd1MatchCh2)) {
      return makeZero(portId, portLabel, 'LPF-1 OUT (No Signal)', 'Connect BD1 OUT → LPF-1 IN with matching 100KHz carrier');
    }
    return {
      portId,
      portLabel,
      signalName: `Recovered Signal 1 (${(f1 / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: a1 * 2 * g1 * 0.85,
      freqHz: bd1MatchCh1 ? (bm1ModSrc === 1 ? f1 : f2) : f2,
      sample: lpf1OutFn,
    };
  }
  if (graph.isConnected(portId, 'lpf2_out')) {
    if (!lpf2HasBd2 || (!bd2MatchCh1 && !bd2MatchCh2)) {
      return makeZero(portId, portLabel, 'LPF-2 OUT (No Signal)', 'Connect BD2 OUT → LPF-2 IN with matching 200KHz carrier');
    }
    return {
      portId,
      portLabel,
      signalName: `Recovered Signal 2 (${(f2 / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: a2 * 2 * g2 * 0.85,
      freqHz: bd2MatchCh2 ? (bm2ModSrc === 2 ? f2 : f1) : f1,
      sample: lpf2OutFn,
    };
  }
  if (graph.isConnected(portId, 'acamp_out')) {
    const active =
      (ampFromLpf1 && lpf1HasBd1 && (bd1MatchCh1 || bd1MatchCh2)) ||
      (ampFromLpf2 && lpf2HasBd2 && (bd2MatchCh1 || bd2MatchCh2));
    if (!active) {
      return makeZero(portId, portLabel, 'AC Amp OUT (No Signal)', 'Connect LPF-1 OUT (or LPF-2 OUT) → AC AMPLIFIER IN');
    }
    const freq = ampFromLpf1 ? f1 : f2;
    const amp = ampFromLpf1 ? a1 * g1 : a2 * g2;
    return {
      portId,
      portLabel,
      signalName: `Amplified Recovered Ch${ampFromLpf1 ? '1' : '2'} (${(freq / 1000).toFixed(1)} kHz)`,
      isConnected: true,
      vpp: amp * 2 * 0.85 * ampGain,
      freqHz: freq,
      sample: acAmpOutFn,
    };
  }

  return makeZero(portId, portLabel, 'Unconnected Port', 'Wire upstream blocks to observe this signal');
}

// =========================================================================
// LAB 5: TDM (TCM 001-03)
// =========================================================================
function evalTDM(
  portId: string,
  portLabel: string,
  graph: NetGraph,
  params: CircuitParams,
  isShorted: (p: string) => boolean
): ChannelSampleInfo {
  const syncV = params.knobs['tdm_p2'] ?? 4.0;
  const gens: Record<string, { freq: number; amp: number; label: string }> = {
    tdm_250: { freq: 250, amp: (params.knobs['tdm_p3'] ?? 2.6) / 2, label: '250 Hz Sine' },
    tdm_500: { freq: 500, amp: (params.knobs['tdm_p4'] ?? 2.8) / 2, label: '500 Hz Sine' },
    tdm_1k: { freq: 1000, amp: (params.knobs['tdm_p5'] ?? 3.0) / 2, label: '1 kHz Sine' },
    tdm_2k: { freq: 2000, amp: (params.knobs['tdm_p6'] ?? 3.2) / 2, label: '2 kHz Sine' },
  };

  // Direct generator probing
  if (graph.isConnected(portId, 'tdm_sync_gen')) {
    return {
      portId,
      portLabel,
      signalName: `Sync Level DC (${syncV.toFixed(1)}V)`,
      isConnected: true,
      vpp: 0,
      freqHz: 0,
      sample: () => syncV,
    };
  }
  for (const [gid, cfg] of Object.entries(gens)) {
    if (graph.isConnected(portId, gid)) {
      return {
        portId,
        portLabel,
        signalName: cfg.label,
        isConnected: true,
        vpp: cfg.amp * 2,
        freqHz: cfg.freq,
        sample: (t) => cfg.amp * Math.sin(TWO_PI * cfg.freq * t),
      };
    }
  }

  // Determine what is connected to TX CH0..CH3
  const txInputs = ['tx_ch0_in', 'tx_ch1_in', 'tx_ch2_in', 'tx_ch3_in'];
  const chSources: ({ freq: number; amp: number; label: string } | null)[] = txInputs.map((inp) => {
    if (isShorted(inp)) return null;
    for (const [gid, cfg] of Object.entries(gens)) {
      if (graph.isConnected(gid, inp)) return cfg;
    }
    return null;
  });

  // TDM frame: 4 slots at 16 kHz frame rate (62.5 µs frame = 15.625 µs per slot)
  const frameHz = 8000;
  const tFrame = 1 / frameHz;
  const tSlot = tFrame / 4;

  const txCh0SyncFn = (t: number) => {
    const pos = ((t % tFrame) + tFrame) % tFrame;
    return pos < tSlot * 0.55 ? 3.8 : 0;
  };

  const txClkFn = (t: number) => {
    const pos = ((t % tSlot) + tSlot) % tSlot;
    return pos < tSlot * 0.5 ? 3.8 : 0;
  };

  const activeCount = chSources.filter(Boolean).length;

  const txdFn = (t: number) => {
    if (activeCount === 0) return 0;
    const posInFrame = ((t % tFrame) + tFrame) % tFrame;
    const slotIdx = Math.min(3, Math.floor(posInFrame / tSlot));
    const posInSlot = posInFrame - slotIdx * tSlot;
    if (posInSlot > tSlot * 0.65) return 0; // guard time between slots
    const src = chSources[slotIdx];
    if (!src) return 0;
    return src.amp * Math.sin(TWO_PI * src.freq * t);
  };

  const hasRxd = graph.isConnected('txd_out', 'rxd_in') && !isShorted('rxd_in');
  const hasSync = graph.isConnected('tx_ch0_sync', 'rx_ch0_sync') && !isShorted('rx_ch0_sync');
  const hasClk = graph.isConnected('tx_clk', 'rx_clk') && !isShorted('rx_clk');
  const isSynced = hasSync && hasClk;

  if (graph.isConnected(portId, 'tx_ch0_sync')) {
    return {
      portId,
      portLabel,
      signalName: 'TX-CH0 Frame Sync (8 kHz)',
      isConnected: true,
      vpp: 3.8,
      freqHz: frameHz,
      isDigital: true,
      sample: txCh0SyncFn,
    };
  }
  if (graph.isConnected(portId, 'tx_clk')) {
    return {
      portId,
      portLabel,
      signalName: 'TX-CLK Slot Clock (32 kHz)',
      isConnected: true,
      vpp: 3.8,
      freqHz: frameHz * 4,
      isDigital: true,
      sample: txClkFn,
    };
  }
  if (graph.isConnected(portId, 'txd_out')) {
    if (activeCount === 0) {
      return makeZero(portId, portLabel, 'TXD Composite (Empty)', 'Connect 250Hz–2KHz to CH0–CH3');
    }
    return {
      portId,
      portLabel,
      signalName: `Composite TDM-PAM (${activeCount}/4 Channels)`,
      isConnected: true,
      vpp: 3.2,
      freqHz: frameHz,
      sample: txdFn,
    };
  }

  // Receiver outputs RX CH0..CH3
  const rxOutputs = ['rx_ch0_out', 'rx_ch1_out', 'rx_ch2_out', 'rx_ch3_out'];
  const rxIdx = rxOutputs.findIndex((id) => graph.isConnected(portId, id));
  if (rxIdx !== -1) {
    if (!hasRxd) {
      return makeZero(portId, portLabel, `RX CH${rxIdx} (No RXD)`, 'Connect TXD → RXD');
    }
    const src = chSources[rxIdx];
    if (!isSynced) {
      // Unsynchronized crosstalk demo!
      return {
        portId,
        portLabel,
        signalName: `RX CH${rxIdx} (OUT OF SYNC!)`,
        isConnected: true,
        vpp: 2.2,
        freqHz: 0,
        warning: !hasSync && !hasClk
          ? 'Missing TX-CH0→RX-CH0 and TX-CLK→RX-CLK sync!'
          : !hasSync
            ? 'Missing TX-CH0 → RX-CH0 Frame Sync!'
            : 'Missing TX-CLK → RX-CLK Clock Sync!',
        sample: (t) => {
          // Scrambled mixture of channels due to drifting slot clock
          let s = 0;
          chSources.forEach((c, idx) => {
            if (c) s += 0.38 * c.amp * Math.sin(TWO_PI * c.freq * t + idx * 1.1) * Math.sin(TWO_PI * 180 * t + idx);
          });
          return s;
        },
      };
    }
    if (!src) {
      return makeZero(portId, portLabel, `RX CH${rxIdx} (Channel Unused)`, `Connect a generator to TX CH${rxIdx}`);
    }
    return {
      portId,
      portLabel,
      signalName: `Demux CH${rxIdx} (${src.freq} Hz Recovered)`,
      isConnected: true,
      vpp: src.amp * 1.9,
      freqHz: src.freq,
      sample: (t) => src.amp * 0.95 * Math.sin(TWO_PI * src.freq * t - 0.14),
    };
  }

  return makeZero(portId, portLabel, 'Unconnected Port', 'Wire upstream signals to energize this port');
}

// =========================================================================
// LAB 6: LINE CODING (NRZ-L, NRZ-S, NRZ-M, URZ-AMI) (TCM 002-01)
// =========================================================================
function evalLineCoding(
  portId: string,
  portLabel: string,
  graph: NetGraph,
  params: CircuitParams,
  isShorted: (p: string) => boolean
): ChannelSampleInfo {
  const patternStr = params.switches['bit_pattern'] ?? '10110011';
  const bits = patternStr
    .split('')
    .map((c) => (c === '1' ? 1 : 0));
  if (bits.length === 0) bits.push(1, 0, 1, 1, 0, 0, 1, 1);

  const decMode = params.switches['decoder_mode'] ?? 'URZ-AMI';
  const bitRateKbps = params.knobs['lc_bitrate'] ?? 100; // 100 kbps => 10 µs per bit!
  const bitRateHz = bitRateKbps * 1000;
  const tb = 1 / bitRateHz;
  const nBits = bits.length;

  // Precompute steady-state arrays for the 8-bit repeating sequence
  const nrzL: number[] = bits.map((b) => (b === 1 ? 2.5 : -2.5));

  // NRZ-S: transition on '0', hold on '1'
  const nrzS: number[] = [];
  let levelS = 2.5;
  for (let i = 0; i < nBits; i++) {
    if (bits[i] === 0) levelS = -levelS;
    nrzS.push(levelS);
  }

  // NRZ-M: transition on '1', hold on '0'
  const nrzM: number[] = [];
  let levelM = -2.5;
  for (let i = 0; i < nBits; i++) {
    if (bits[i] === 1) levelM = -levelM;
    nrzM.push(levelM);
  }

  // URZ-AMI: '0' -> 0V, '1' -> alternating +2.5V / -2.5V for first half of bit, then returns to 0V!
  const amiPolarity: number[] = [];
  let nextMark = 2.5;
  for (let i = 0; i < nBits; i++) {
    if (bits[i] === 1) {
      amiPolarity.push(nextMark);
      nextMark = -nextMark;
    } else {
      amiPolarity.push(0);
    }
  }

  const getBitIndex = (t: number) => {
    const total = nBits * tb;
    const wrapped = ((t % total) + total) % total;
    const idx = Math.floor(wrapped / tb);
    const frac = (wrapped - idx * tb) / tb;
    return { idx: Math.min(nBits - 1, idx), frac };
  };

  const dataFn = (t: number) => {
    const { idx } = getBitIndex(t);
    return bits[idx] === 1 ? 3.2 : 0;
  };

  const clkFn = (t: number) => {
    const { frac } = getBitIndex(t);
    return frac < 0.5 ? 3.2 : 0;
  };

  const encHasData = graph.isConnected('lc_data_out', 'enc_data_in') && !isShorted('enc_data_in');
  const encHasClk = graph.isConnected('lc_clk_a', 'enc_clk_in') && !isShorted('enc_clk_in');
  const encActive = encHasData && encHasClk;

  const nrzLFn = (t: number) => (encActive ? nrzL[getBitIndex(t).idx] : 0);
  const nrzSFn = (t: number) => (encActive ? nrzS[getBitIndex(t).idx] : 0);
  const nrzMFn = (t: number) => (encActive ? nrzM[getBitIndex(t).idx] : 0);
  const urzAmiFn = (t: number) => {
    if (!encActive) return 0;
    const { idx, frac } = getBitIndex(t);
    return frac < 0.5 ? amiPolarity[idx] : 0;
  };

  // Decoder check
  const decHasClk = graph.isConnected('lc_clk_a', 'dec_clk_in') && !isShorted('dec_clk_in');
  let wiredScheme: string | null = null;
  if (!isShorted('dec_in') && encActive) {
    if (graph.isConnected('enc_nrz_l', 'dec_in')) wiredScheme = 'NRZ-L';
    else if (graph.isConnected('enc_nrz_s', 'dec_in')) wiredScheme = 'NRZ-S';
    else if (graph.isConnected('enc_nrz_m', 'dec_in')) wiredScheme = 'NRZ-M';
    else if (graph.isConnected('enc_urz_ami', 'dec_in')) wiredScheme = 'URZ-AMI';
  }

  if (graph.isConnected(portId, 'lc_data_out')) {
    return {
      portId,
      portLabel,
      signalName: `Binary Data (${patternStr})`,
      isConnected: true,
      vpp: 3.2,
      freqHz: bitRateHz / 2,
      isDigital: true,
      sample: dataFn,
    };
  }
  if (graph.isConnected(portId, 'lc_clk_a')) {
    return {
      portId,
      portLabel,
      signalName: `Bit Clock (${bitRateKbps} kbps)`,
      isConnected: true,
      vpp: 3.2,
      freqHz: bitRateHz,
      isDigital: true,
      sample: clkFn,
    };
  }
  if (graph.isConnected(portId, 'enc_nrz_l')) {
    if (!encActive) return makeZero(portId, portLabel, 'NRZ-L (No Encoder Inputs)', 'Wire DATA OUT & CLK OUT to Encoder');
    return {
      portId,
      portLabel,
      signalName: `NRZ-L Encoded (${patternStr})`,
      isConnected: true,
      vpp: 5.0,
      freqHz: bitRateHz / 2,
      isDigital: true,
      sample: nrzLFn,
    };
  }
  if (graph.isConnected(portId, 'enc_nrz_s')) {
    if (!encActive) return makeZero(portId, portLabel, 'NRZ-S (No Encoder Inputs)', 'Wire DATA OUT & CLK OUT to Encoder');
    return {
      portId,
      portLabel,
      signalName: `NRZ-S Encoded (${patternStr})`,
      isConnected: true,
      vpp: 5.0,
      freqHz: bitRateHz / 2,
      isDigital: true,
      sample: nrzSFn,
    };
  }
  if (graph.isConnected(portId, 'enc_nrz_m')) {
    if (!encActive) return makeZero(portId, portLabel, 'NRZ-M (No Encoder Inputs)', 'Wire DATA OUT & CLK OUT to Encoder');
    return {
      portId,
      portLabel,
      signalName: `NRZ-M Encoded (${patternStr})`,
      isConnected: true,
      vpp: 5.0,
      freqHz: bitRateHz / 2,
      isDigital: true,
      sample: nrzMFn,
    };
  }
  if (graph.isConnected(portId, 'enc_urz_ami')) {
    if (!encActive) return makeZero(portId, portLabel, 'URZ-AMI (No Encoder Inputs)', 'Wire DATA OUT & CLK OUT to Encoder');
    return {
      portId,
      portLabel,
      signalName: `URZ-AMI Encoded (${patternStr})`,
      isConnected: true,
      vpp: 5.0,
      freqHz: bitRateHz,
      isDigital: true,
      sample: urzAmiFn,
    };
  }
  if (graph.isConnected(portId, 'dec_out')) {
    if (!wiredScheme) {
      return makeZero(portId, portLabel, 'Decoded Out (No Encoded Input)', 'Wire an Encoder output → DECODER ENCODED IN');
    }
    if (!decHasClk) {
      return makeZero(portId, portLabel, 'Decoded Out (Missing CLK)', 'Wire CLK OUT (B) → DECODER CLK IN');
    }
    const modeMatches = wiredScheme === decMode;
    if (!modeMatches) {
      return {
        portId,
        portLabel,
        signalName: `Decoded Error (${wiredScheme} ≠ ${decMode})`,
        isConnected: true,
        vpp: 3.2,
        freqHz: bitRateHz / 2,
        isDigital: true,
        warning: `Switch DECODER SCHEME to ${wiredScheme} to match wired cable!`,
        sample: (t) => {
          const { idx } = getBitIndex(t);
          // Corrupted decoding when scheme mismatches
          return (bits[idx] ^ (idx % 2)) === 1 ? 3.2 : 0;
        },
      };
    }
    return {
      portId,
      portLabel,
      signalName: `Decoded ${wiredScheme} (${patternStr})`,
      isConnected: true,
      vpp: 3.2,
      freqHz: bitRateHz / 2,
      isDigital: true,
      sample: dataFn,
    };
  }

  return makeZero(portId, portLabel, 'Unconnected Port', 'Wire upstream signals to observe this node');
}
