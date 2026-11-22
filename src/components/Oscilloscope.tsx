import React, { useEffect, useRef } from 'react';
import {
  Crosshair,
  Pause,
  Play,
  Sparkles,
  Unplug,
} from 'lucide-react';
import { ChannelSampleInfo, LabDefinition, ScopeState } from '../types/lab';

interface OscilloscopeProps {
  lab: LabDefinition;
  scope: ScopeState;
  ch1Signal: ChannelSampleInfo;
  ch2Signal: ChannelSampleInfo;
  probeAttachMode: 'CH1' | 'CH2' | null;
  onUpdateScope: (patch: Partial<ScopeState>) => void;
  onToggleProbeMode: (channel: 'CH1' | 'CH2') => void;
  onAutoset: () => void;
}

const TIMEBASE_STEPS_US = [5, 10, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
const VDIV_STEPS = [0.5, 1, 2, 5, 10];

function formatTimebase(us: number): string {
  if (us >= 1000) return `${(us / 1000).toFixed(us % 1000 === 0 ? 0 : 1)} ms/div`;
  return `${us} µs/div`;
}

function formatFreq(hz: number): string {
  if (!hz || hz <= 0) return '---';
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz`;
  return `${hz.toFixed(0)} Hz`;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({
  lab,
  scope,
  ch1Signal,
  ch2Signal,
  probeAttachMode,
  onUpdateScope,
  onToggleProbeMode,
  onAutoset,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<number>(0);

  const stateRef = useRef({ scope, ch1Signal, ch2Signal });
  stateRef.current = { scope, ch1Signal, ch2Signal };

  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const draw = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;

      const { scope: sc, ch1Signal: s1, ch2Signal: s2 } = stateRef.current;
      if (sc.running) {
        phaseRef.current += dt;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = canvas.clientWidth || 640;
        const cssH = canvas.clientHeight || 300;
        if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
          canvas.width = Math.floor(cssW * dpr);
          canvas.height = Math.floor(cssH * dpr);
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // 1. Deep CRT / Rohde & Schwarz LCD Dark Glass
          ctx.fillStyle = '#090d13';
          ctx.fillRect(0, 0, cssW, cssH);

          // 2. Precision 10×8 Graticule
          const padL = 6;
          const padR = 6;
          const padT = 24;
          const padB = 22;
          const gw = cssW - padL - padR;
          const gh = cssH - padT - padB;
          const cols = 10;
          const rows = 8;
          const midX = padL + gw / 2;
          const midY = padT + gh / 2;

          ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let c = 0; c <= cols; c++) {
            const x = padL + (c * gw) / cols;
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + gh);
          }
          for (let r = 0; r <= rows; r++) {
            const y = padT + (r * gh) / rows;
            ctx.moveTo(padL, y);
            ctx.lineTo(padL + gw, y);
          }
          ctx.stroke();

          ctx.strokeStyle = 'rgba(148, 163, 184, 0.36)';
          ctx.beginPath();
          ctx.moveTo(padL, midY);
          ctx.lineTo(padL + gw, midY);
          ctx.moveTo(midX, padT);
          ctx.lineTo(midX, padT + gh);
          for (let i = 0; i <= cols * 5; i++) {
            const x = padL + (i * gw) / (cols * 5);
            ctx.moveTo(x, midY - 2.5);
            ctx.lineTo(x, midY + 2.5);
          }
          for (let j = 0; j <= rows * 5; j++) {
            const y = padT + (j * gh) / (rows * 5);
            ctx.moveTo(midX - 2.5, y);
            ctx.lineTo(midX + 2.5, y);
          }
          ctx.stroke();

          const microDrift = sc.running ? Math.sin(phaseRef.current * 4.5) * 1.2e-7 : 0;
          const totalTimeSec = (sc.timebaseUs * 1e-6) * cols;

          // Rising-edge trigger lock
          const trigSig = sc.triggerSource === 'CH1' ? s1 : s2;
          let tStart = microDrift;
          if (trigSig.isConnected && trigSig.freqHz > 0) {
            const searchSpan = Math.min(totalTimeSec, 1 / Math.max(50, trigSig.freqHz));
            const steps = 120;
            const dtSearch = searchSpan / steps;
            let prev = trigSig.sample(0);
            for (let k = 1; k <= steps; k++) {
              const tk = k * dtSearch;
              const cur = trigSig.sample(tk);
              if (prev < sc.triggerLevelV && cur >= sc.triggerLevelV) {
                tStart = tk + microDrift;
                break;
              }
              prev = cur;
            }
          }

          const renderTrace = (
            sig: ChannelSampleInfo,
            vdiv: number,
            offsetDiv: number,
            coupling: 'DC' | 'AC',
            color: string,
            glowColor: string,
            tag: string
          ) => {
            const pxPerDivY = gh / rows;
            const zeroY = midY - offsetDiv * pxPerDivY;

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(padL, zeroY);
            ctx.lineTo(padL + 7, zeroY - 4.5);
            ctx.lineTo(padL + 7, zeroY + 4.5);
            ctx.closePath();
            ctx.fill();

            let dcMean = 0;
            if (coupling === 'AC' && sig.isConnected) {
              const nMean = 64;
              for (let m = 0; m < nMean; m++) {
                dcMean += sig.sample(tStart + (m / nMean) * totalTimeSec);
              }
              dcMean /= nMean;
            }

            ctx.save();
            ctx.beginPath();
            ctx.rect(padL, padT, gw, gh);
            ctx.clip();

            const numCols = Math.floor(gw);
            const estimatedCycles = Math.max(sig.freqHz, 100000) * totalTimeSec;
            const isHighFreq =
              sig.signalName.includes('AM ') ||
              sig.signalName.includes('Carrier') ||
              sig.signalName.includes('FDM') ||
              sig.signalName.includes('Modulated Ch') ||
              sig.signalName.includes('Demodulator') ||
              sig.signalName.includes('FM ') ||
              sig.signalName.includes('PAM') ||
              sig.signalName.includes('PWM') ||
              sig.signalName.includes('PPM') ||
              sig.signalName.includes('TDM') ||
              estimatedCycles > 40;
            const subSamples = isHighFreq ? 10 : 2;

            ctx.strokeStyle = color;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 5;
            ctx.lineWidth = sig.isDigital ? 2.0 : 1.7;
            ctx.lineJoin = 'round';

            ctx.beginPath();
            for (let px = 0; px <= numCols; px++) {
              const x = padL + px;
              const tCol = tStart + (px / numCols) * totalTimeSec;
              const tNext = tStart + ((px + 1) / numCols) * totalTimeSec;

              let minV = Infinity;
              let maxV = -Infinity;
              for (let s = 0; s < subSamples; s++) {
                const ts = tCol + ((tNext - tCol) * s) / subSamples;
                const v = sig.sample(ts) - dcMean;
                if (v < minV) minV = v;
                if (v > maxV) maxV = v;
              }

              const yMax = zeroY - (maxV / vdiv) * pxPerDivY;
              const yMin = zeroY - (minV / vdiv) * pxPerDivY;

              if (px === 0) {
                ctx.moveTo(x, (yMax + yMin) / 2);
              } else if (Math.abs(yMin - yMax) > 1.8) {
                ctx.lineTo(x, yMax);
                ctx.lineTo(x, yMin);
              } else {
                ctx.lineTo(x, (yMax + yMin) / 2);
              }
            }
            ctx.stroke();
            ctx.restore();

            ctx.fillStyle = color;
            ctx.font = '700 9px "IBM Plex Mono", monospace';
            ctx.fillText(tag, padL + 10, zeroY + 3);
          };

          if (sc.ch2Enabled) {
            renderTrace(
              s2,
              sc.ch2Vdiv,
              sc.ch2OffsetDiv,
              sc.ch2Coupling,
              '#38bdf8',
              'rgba(56, 189, 248, 0.7)',
              '2'
            );
          }
          if (sc.ch1Enabled) {
            renderTrace(
              s1,
              sc.ch1Vdiv,
              sc.ch1OffsetDiv,
              sc.ch1Coupling,
              '#facc15',
              'rgba(250, 204, 21, 0.75)',
              '1'
            );
          }

          // Top CRT HUD Bar
          ctx.fillStyle = 'rgba(13, 18, 26, 0.94)';
          ctx.fillRect(0, 0, cssW, padT - 1);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.beginPath();
          ctx.moveTo(0, padT - 1);
          ctx.lineTo(cssW, padT - 1);
          ctx.stroke();

          ctx.font = '600 10.5px "IBM Plex Mono", monospace';
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(`TB ${formatTimebase(sc.timebaseUs)}`, 10, 15);

          ctx.fillStyle = sc.running ? '#4ade80' : '#f87171';
          ctx.fillText(sc.running ? 'RUN' : 'STOP', 132, 15);

          ctx.fillStyle = '#facc15';
          ctx.fillText(
            `CH1 ${sc.ch1Vdiv}V/d ${sc.ch1Coupling}  f=${formatFreq(s1.freqHz)}  Vpp=${s1.vpp.toFixed(1)}V`,
            188,
            15
          );

          // Bottom CRT HUD Bar
          ctx.fillStyle = 'rgba(13, 18, 26, 0.94)';
          ctx.fillRect(0, cssH - padB + 1, cssW, padB);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.beginPath();
          ctx.moveTo(0, cssH - padB + 1);
          ctx.lineTo(cssW, cssH - padB + 1);
          ctx.stroke();

          ctx.fillStyle = '#facc15';
          ctx.fillText(`CH1 [${s1.portLabel}] ${s1.signalName}`, 10, cssH - 7);

          ctx.fillStyle = '#38bdf8';
          const ch2Text = `CH2 [${s2.portLabel}] ${sc.ch2Vdiv}V/d  f=${formatFreq(s2.freqHz)}`;
          ctx.fillText(ch2Text, Math.max(330, cssW - 265), cssH - 7);

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const stepTimebase = (delta: number) => {
    const idx = TIMEBASE_STEPS_US.indexOf(scope.timebaseUs);
    const cur = idx === -1 ? 5 : idx;
    const next = Math.min(TIMEBASE_STEPS_US.length - 1, Math.max(0, cur + delta));
    onUpdateScope({ timebaseUs: TIMEBASE_STEPS_US[next] });
  };

  const stepVdiv = (ch: 'ch1Vdiv' | 'ch2Vdiv', delta: number) => {
    const idx = VDIV_STEPS.indexOf(scope[ch]);
    const cur = idx === -1 ? 2 : idx;
    const next = Math.min(VDIV_STEPS.length - 1, Math.max(0, cur + delta));
    onUpdateScope({ [ch]: VDIV_STEPS[next] });
  };

  return (
    <section
      aria-label="Dual-channel digital oscilloscope"
      className="scope-chassis-shadow rounded-[var(--radius-lg)] bg-[var(--chassis-bezel)] p-3.5 sm:p-4"
    >
      {/* Rohde & Schwarz RTC1002 Anodized Instrument Faceplate Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-2.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-mono text-xs font-bold tracking-[0.04em] text-[var(--ink-primary)]">
            ROHDE &amp; SCHWARZ
          </span>
          <span className="font-mono text-xs font-semibold text-[var(--cord-cobalt)]">
            RTC1002
          </span>
          <span className="text-xs text-[var(--ink-tertiary)]">
            Dual-Channel Digital Oscilloscope
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onAutoset}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--hairline-strong)] bg-[var(--sheet-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] hover:bg-white cursor-pointer"
            title="Auto-scale Timebase and Volts/Div to fit probed signals"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--cord-cobalt)]" />
            Autoset
          </button>
          <button
            onClick={() => onUpdateScope({ running: !scope.running })}
            className={`btn-tactile inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
              scope.running
                ? 'border-[var(--signal-pass)]/35 bg-[var(--signal-pass-soft)] text-[var(--signal-pass)] hover:bg-emerald-600/15'
                : 'border-[var(--signal-fault)]/35 bg-[var(--signal-fault-soft)] text-[var(--signal-fault)] hover:bg-rose-600/15'
            }`}
          >
            {scope.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {scope.running ? 'Freeze' : 'Run'}
          </button>
        </div>
      </div>

      {/* Main Split: Recessed Dark CRT Glass + Anodized Physical Control Pods */}
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-12">
        {/* Left 8 cols: Recessed CRT Display + Stage Probe Bar */}
        <div className="flex flex-col gap-2.5 xl:col-span-8">
          <div className="relative overflow-hidden rounded-[var(--radius-md)] border-[3px] border-[#262b33] bg-[var(--crt-glass)] shadow-[inset_0_2px_10px_rgba(0,0,0,0.85)]">
            <canvas
              ref={canvasRef}
              className="block h-[270px] w-full sm:h-[296px]"
            />
          </div>

          {/* Actionable inline probe warnings */}
          {(ch1Signal.warning || ch2Signal.warning) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {ch1Signal.warning && (
                <div className="rounded-[var(--radius-sm)] border border-amber-600/30 bg-amber-500/10 px-2.5 py-1 text-amber-950">
                  <strong className="font-mono">CH1 ({ch1Signal.portLabel}):</strong>{' '}
                  {ch1Signal.warning}
                </div>
              )}
              {ch2Signal.warning && (
                <div className="rounded-[var(--radius-sm)] border border-sky-700/30 bg-sky-500/10 px-2.5 py-1 text-sky-950">
                  <strong className="font-mono">CH2 ({ch2Signal.portLabel}):</strong>{' '}
                  {ch2Signal.warning}
                </div>
              )}
            </div>
          )}

          {/* Quick Observation Stage Buttons (recessed hardware button strip) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="mr-1 text-[11.5px] font-medium text-[var(--ink-tertiary)]">
              Probe stage:
            </span>
            {lab.probePresets.map((preset) => {
              const isActive =
                scope.ch1Port === preset.ch1 && scope.ch2Port === preset.ch2;
              return (
                <button
                  key={preset.id}
                  onClick={() =>
                    onUpdateScope({
                      ch1Port: preset.ch1,
                      ch2Port: preset.ch2,
                      ch1Enabled: true,
                      ch2Enabled: Boolean(preset.ch2),
                      timebaseUs: preset.timebaseUs,
                      ch1Vdiv: preset.ch1Vdiv,
                      ch2Vdiv: preset.ch2Vdiv,
                    })
                  }
                  title={preset.description}
                  className={`btn-tactile rounded-[var(--radius-sm)] border px-2.5 py-1 text-[11.5px] font-medium cursor-pointer ${
                    isActive
                      ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-white'
                      : 'border-[var(--hairline-strong)] bg-[var(--sheet-surface)] text-[var(--ink-secondary)] hover:bg-white hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 4 cols: Physical Channel Pods & Horizontal Timebase */}
        <div className="flex flex-col justify-between gap-2.5 xl:col-span-4">
          {/* CH1 Hardware Pod (Yellow Channel) */}
          <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--sheet-surface)] p-3">
            <div className="mb-2.5 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 ring-1 ring-amber-700/40" />
                <span className="font-mono text-xs font-bold text-[var(--ink-primary)]">
                  CH1
                </span>
                <span className="truncate rounded bg-[var(--bench-recess)] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[var(--ink-secondary)]">
                  {ch1Signal.portLabel}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onToggleProbeMode('CH1')}
                  className={`btn-tactile inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${
                    probeAttachMode === 'CH1'
                      ? 'border-amber-700 bg-amber-400 text-[#14171c]'
                      : 'border-[var(--hairline-strong)] bg-[var(--bench-bg)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  <Crosshair className="h-3 w-3" />
                  {probeAttachMode === 'CH1' ? 'Select port' : 'Probe'}
                </button>
                <button
                  onClick={() => onUpdateScope({ ch1Enabled: !scope.ch1Enabled })}
                  aria-label="Toggle Channel 1"
                  className={`btn-tactile rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-bold cursor-pointer ${
                    scope.ch1Enabled
                      ? 'border-amber-600/40 bg-amber-500/15 text-amber-900'
                      : 'border-[var(--hairline)] bg-[var(--bench-recess)] text-[var(--ink-muted)]'
                  }`}
                >
                  {scope.ch1Enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-[11px]">
              <div>
                <div className="mb-1 flex justify-between text-[var(--ink-tertiary)]">
                  <span>Volts/div</span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--ink-primary)]">
                    {scope.ch1Vdiv}V
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => stepVdiv('ch1Vdiv', -1)}
                    aria-label="Decrease CH1 volts per division"
                    className="btn-tactile flex-1 rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] py-1 font-mono font-bold text-[var(--ink-primary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                  >
                    −
                  </button>
                  <button
                    onClick={() => stepVdiv('ch1Vdiv', 1)}
                    aria-label="Increase CH1 volts per division"
                    className="btn-tactile flex-1 rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] py-1 font-mono font-bold text-[var(--ink-primary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    onClick={() =>
                      onUpdateScope({
                        ch1Coupling: scope.ch1Coupling === 'DC' ? 'AC' : 'DC',
                      })
                    }
                    className="btn-tactile rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                  >
                    {scope.ch1Coupling}
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[var(--ink-tertiary)]">
                  <span>Vertical</span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--ink-primary)]">
                    {scope.ch1OffsetDiv >= 0 ? '+' : ''}
                    {scope.ch1OffsetDiv.toFixed(1)}d
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="CH1 vertical position"
                  min={-3}
                  max={3}
                  step={0.2}
                  value={scope.ch1OffsetDiv}
                  onChange={(e) =>
                    onUpdateScope({ ch1OffsetDiv: parseFloat(e.target.value) })
                  }
                  className="mt-1 w-full accent-amber-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* CH2 Hardware Pod (Cyan/Blue Channel) */}
          <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--sheet-surface)] p-3">
            <div className="mb-2.5 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500 ring-1 ring-sky-800/40" />
                <span className="font-mono text-xs font-bold text-[var(--ink-primary)]">
                  CH2
                </span>
                <span className="truncate rounded bg-[var(--bench-recess)] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[var(--ink-secondary)]">
                  {ch2Signal.portLabel}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onToggleProbeMode('CH2')}
                  className={`btn-tactile inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${
                    probeAttachMode === 'CH2'
                      ? 'border-sky-700 bg-sky-400 text-[#14171c]'
                      : 'border-[var(--hairline-strong)] bg-[var(--bench-bg)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  <Crosshair className="h-3 w-3" />
                  {probeAttachMode === 'CH2' ? 'Select port' : 'Probe'}
                </button>
                {scope.ch2Port && (
                  <button
                    onClick={() => onUpdateScope({ ch2Port: null })}
                    title="Detach CH2 Probe"
                    aria-label="Detach CH2 Probe"
                    className="btn-tactile rounded-[4px] border border-[var(--hairline)] bg-[var(--bench-bg)] p-1 text-[var(--ink-tertiary)] hover:text-[var(--signal-fault)] cursor-pointer"
                  >
                    <Unplug className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => onUpdateScope({ ch2Enabled: !scope.ch2Enabled })}
                  aria-label="Toggle Channel 2"
                  className={`btn-tactile rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-bold cursor-pointer ${
                    scope.ch2Enabled
                      ? 'border-sky-600/40 bg-sky-500/15 text-sky-900'
                      : 'border-[var(--hairline)] bg-[var(--bench-recess)] text-[var(--ink-muted)]'
                  }`}
                >
                  {scope.ch2Enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-[11px]">
              <div>
                <div className="mb-1 flex justify-between text-[var(--ink-tertiary)]">
                  <span>Volts/div</span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--ink-primary)]">
                    {scope.ch2Vdiv}V
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => stepVdiv('ch2Vdiv', -1)}
                    aria-label="Decrease CH2 volts per division"
                    className="btn-tactile flex-1 rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] py-1 font-mono font-bold text-[var(--ink-primary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                  >
                    −
                  </button>
                  <button
                    onClick={() => stepVdiv('ch2Vdiv', 1)}
                    aria-label="Increase CH2 volts per division"
                    className="btn-tactile flex-1 rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] py-1 font-mono font-bold text-[var(--ink-primary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    onClick={() =>
                      onUpdateScope({
                        ch2Coupling: scope.ch2Coupling === 'DC' ? 'AC' : 'DC',
                      })
                    }
                    className="btn-tactile rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                  >
                    {scope.ch2Coupling}
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[var(--ink-tertiary)]">
                  <span>Vertical</span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--ink-primary)]">
                    {scope.ch2OffsetDiv >= 0 ? '+' : ''}
                    {scope.ch2OffsetDiv.toFixed(1)}d
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="CH2 vertical position"
                  min={-3}
                  max={3}
                  step={0.2}
                  value={scope.ch2OffsetDiv}
                  onChange={(e) =>
                    onUpdateScope({ ch2OffsetDiv: parseFloat(e.target.value) })
                  }
                  className="mt-1 w-full accent-sky-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Horizontal Timebase Pod */}
          <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--sheet-surface)] p-3 text-[11px]">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-semibold text-[var(--ink-secondary)]">
                Horizontal timebase
              </span>
              <span className="font-mono font-semibold tabular-nums text-[var(--ink-primary)]">
                {formatTimebase(scope.timebaseUs)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => stepTimebase(-1)}
                aria-label="Zoom in timebase"
                className="btn-tactile rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] px-2.5 py-1 font-mono font-bold text-[var(--ink-primary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                title="Zoom In (faster timebase)"
              >
                −
              </button>
              <select
                aria-label="Timebase scale"
                value={scope.timebaseUs}
                onChange={(e) =>
                  onUpdateScope({ timebaseUs: Number(e.target.value) })
                }
                className="flex-1 rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] px-2 py-1 font-mono text-xs font-medium text-[var(--ink-primary)]"
              >
                {TIMEBASE_STEPS_US.map((us) => (
                  <option key={us} value={us}>
                    {formatTimebase(us)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => stepTimebase(1)}
                aria-label="Zoom out timebase"
                className="btn-tactile rounded-[4px] border border-[var(--hairline-strong)] bg-[var(--bench-bg)] px-2.5 py-1 font-mono font-bold text-[var(--ink-primary)] hover:bg-[var(--bench-recess)] cursor-pointer"
                title="Zoom Out (slower timebase)"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
