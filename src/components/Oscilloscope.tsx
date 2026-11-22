import React, { useEffect, useRef } from 'react';
import {
  Activity,
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

  // Store latest props in ref for smooth 60fps canvas animation loop without recreating RAF
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

          // 1. Deep CRT / Rohde & Schwarz LCD Dark Background
          const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
          bgGrad.addColorStop(0, '#070b12');
          bgGrad.addColorStop(1, '#0b1220');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, cssW, cssH);

          // 2. Graticule (10 horizontal divs × 8 vertical divs)
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

          // Center axes with fine 0.2-div ticks
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.36)';
          ctx.beginPath();
          ctx.moveTo(padL, midY);
          ctx.lineTo(padL + gw, midY);
          ctx.moveTo(midX, padT);
          ctx.lineTo(midX, padT + gh);
          // Sub-ticks
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

          // Subtle live trigger jitter for analog realism
          const microDrift = sc.running ? Math.sin(phaseRef.current * 4.5) * 1.2e-7 : 0;
          const totalTimeSec = (sc.timebaseUs * 1e-6) * cols;

          // Compute rising-edge trigger offset on trigger source so periodic waves lock cleanly
          const trigSig = sc.triggerSource === 'CH1' ? s1 : s2;
          let tStart = microDrift;
          if (trigSig.isConnected && trigSig.freqHz > 0) {
            // Find rising edge near t=0 within 1 period
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

          // Helper to render one trace with high-frequency envelope oversampling
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

            // Left channel ground marker arrow
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(padL, zeroY);
            ctx.lineTo(padL + 7, zeroY - 4.5);
            ctx.lineTo(padL + 7, zeroY + 4.5);
            ctx.closePath();
            ctx.fill();

            // Estimate DC mean if AC coupling is selected
            let dcMean = 0;
            if (coupling === 'AC' && sig.isConnected) {
              const nMean = 64;
              for (let m = 0; m < nMean; m++) {
                dcMean += sig.sample(tStart + (m / nMean) * totalTimeSec);
              }
              dcMean /= nMean;
            }

            // Clip to graticule area
            ctx.save();
            ctx.beginPath();
            ctx.rect(padL, padT, gw, gh);
            ctx.clip();

            const numCols = Math.floor(gw);
            // Determine sub-samples per pixel column:
            // High-frequency carriers (e.g. AM/FM/FDM) get 10 sub-samples/px to render solid RF envelope!
            const estimatedCycles = Math.max(sig.freqHz, 100000) * totalTimeSec;
            const isHighFreq =
              sig.signalName.includes('AM ') ||
              sig.signalName.includes('Carrier') ||
              sig.signalName.includes('FDM') ||
              sig.signalName.includes('Modulated Ch') ||
              sig.signalName.includes('Demodulator') ||
              sig.signalName.includes('FM ') ||
              sig.signalName.includes('PAM') ||
              sig.signalName.includes('TDM') ||
              estimatedCycles > 40;
            const subSamples = isHighFreq ? 10 : 2;

            ctx.strokeStyle = color;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 6;
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

            // Subtle tag on left edge
            ctx.fillStyle = color;
            ctx.font = '700 9px "JetBrains Mono", monospace';
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

          // 3. Top Oscilloscope Status Bar (Rohde & Schwarz RTC1002 style!)
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.fillRect(0, 0, cssW, padT - 1);
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
          ctx.beginPath();
          ctx.moveTo(0, padT - 1);
          ctx.lineTo(cssW, padT - 1);
          ctx.stroke();

          ctx.font = '600 10.5px "JetBrains Mono", monospace';
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(`TB: ${formatTimebase(sc.timebaseUs)}`, 10, 15);

          ctx.fillStyle = sc.running ? '#4ade80' : '#f87171';
          ctx.fillText(sc.running ? '● RUN' : '❚❚ STOP', 132, 15);

          ctx.fillStyle = '#facc15';
          ctx.fillText(
            `CH1: ${sc.ch1Vdiv}V/d ${sc.ch1Coupling}  f=${formatFreq(s1.freqHz)}  Vpp=${s1.vpp.toFixed(1)}V`,
            205,
            15
          );

          // 4. Bottom Status Bar (CH2 Readout)
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.fillRect(0, cssH - padB + 1, cssW, padB);
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
          ctx.beginPath();
          ctx.moveTo(0, cssH - padB + 1);
          ctx.lineTo(cssW, cssH - padB + 1);
          ctx.stroke();

          ctx.fillStyle = '#facc15';
          ctx.fillText(
            `CH1 [${s1.portLabel}]: ${s1.signalName}`,
            10,
            cssH - 7
          );

          ctx.fillStyle = '#38bdf8';
          const ch2Text = `CH2 [${s2.portLabel}]: ${sc.ch2Vdiv}V/d  f=${formatFreq(s2.freqHz)}`;
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
    <div className="rounded-xl border border-slate-700/80 bg-[#121824] p-3 shadow-2xl">
      {/* Scope Bezel Header */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-slate-200 uppercase">
                RTC1002 Dual-Channel Digital Oscilloscope
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400 border border-slate-700">
                LIVE DSP
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Attach CH1 (Yellow) &amp; CH2 (Blue) probes to any trainer terminal or pick a preset stage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onAutoset}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 cursor-pointer"
            title="Auto-scale Timebase and Volts/Div to fit probed signals"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Autoset
          </button>
          <button
            onClick={() => onUpdateScope({ running: !scope.running })}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              scope.running
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            {scope.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {scope.running ? 'Freeze' : 'Run'}
          </button>
        </div>
      </div>

      {/* Main Split: Canvas Screen + Hardware Control Deck */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* HTML5 Canvas CRT Display */}
        <div className="xl:col-span-8 flex flex-col gap-2">
          <div className="relative overflow-hidden rounded-lg border-2 border-slate-700 bg-black shadow-inner">
            <canvas
              ref={canvasRef}
              className="block h-[270px] w-full sm:h-[295px]"
            />
          </div>

          {/* Warnings if probed node is missing upstream wiring */}
          {(ch1Signal.warning || ch2Signal.warning) && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {ch1Signal.warning && (
                <div className="rounded-md border border-yellow-500/35 bg-yellow-500/10 px-2.5 py-1 text-yellow-200">
                  <strong>CH1 ({ch1Signal.portLabel}):</strong> {ch1Signal.warning}
                </div>
              )}
              {ch2Signal.warning && (
                <div className="rounded-md border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-sky-200">
                  <strong>CH2 ({ch2Signal.portLabel}):</strong> {ch2Signal.warning}
                </div>
              )}
            </div>
          )}

          {/* Quick Observation Stage Presets (matches Lab Manual figures!) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
              Quick Probe Stages:
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
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                    isActive
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                      : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side Hardware Control Deck (CH1, CH2, Horizontal Timebase) */}
        <div className="xl:col-span-4 flex flex-col justify-between gap-2.5">
          {/* CH1 Controls (Yellow) */}
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/[0.04] p-2.5">
            <div className="mb-2 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="text-xs font-bold text-yellow-300">CH1</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-yellow-200">
                  {ch1Signal.portLabel}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggleProbeMode('CH1')}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                    probeAttachMode === 'CH1'
                      ? 'bg-yellow-400 text-slate-950'
                      : 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                  }`}
                >
                  <Crosshair className="h-3 w-3" />
                  {probeAttachMode === 'CH1' ? 'Pick Port...' : 'Move Probe'}
                </button>
                <button
                  onClick={() => onUpdateScope({ ch1Enabled: !scope.ch1Enabled })}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold cursor-pointer ${
                    scope.ch1Enabled
                      ? 'bg-yellow-400/20 text-yellow-300'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {scope.ch1Enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="mb-1 flex justify-between text-slate-400">
                  <span>Volts/Div</span>
                  <span className="font-mono text-yellow-200">{scope.ch1Vdiv}V</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => stepVdiv('ch1Vdiv', -1)}
                    className="flex-1 rounded bg-slate-800 py-1 font-mono font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    −
                  </button>
                  <button
                    onClick={() => stepVdiv('ch1Vdiv', 1)}
                    className="flex-1 rounded bg-slate-800 py-1 font-mono font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    onClick={() =>
                      onUpdateScope({
                        ch1Coupling: scope.ch1Coupling === 'DC' ? 'AC' : 'DC',
                      })
                    }
                    className="rounded bg-slate-800 px-2 py-1 font-mono text-[10px] text-yellow-300 hover:bg-slate-700 cursor-pointer"
                  >
                    {scope.ch1Coupling}
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-slate-400">
                  <span>Position</span>
                  <span className="font-mono text-yellow-200">
                    {scope.ch1OffsetDiv >= 0 ? '+' : ''}
                    {scope.ch1OffsetDiv.toFixed(1)}d
                  </span>
                </div>
                <input
                  type="range"
                  min={-3}
                  max={3}
                  step={0.2}
                  value={scope.ch1OffsetDiv}
                  onChange={(e) =>
                    onUpdateScope({ ch1OffsetDiv: parseFloat(e.target.value) })
                  }
                  className="w-full accent-yellow-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* CH2 Controls (Blue) */}
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.04] p-2.5">
            <div className="mb-2 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                <span className="text-xs font-bold text-sky-300">CH2</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-sky-200">
                  {ch2Signal.portLabel}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggleProbeMode('CH2')}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                    probeAttachMode === 'CH2'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
                  }`}
                >
                  <Crosshair className="h-3 w-3" />
                  {probeAttachMode === 'CH2' ? 'Pick Port...' : 'Move Probe'}
                </button>
                {scope.ch2Port && (
                  <button
                    onClick={() => onUpdateScope({ ch2Port: null })}
                    title="Detach CH2 Probe"
                    className="rounded bg-slate-800 p-1 text-slate-400 hover:text-red-300 cursor-pointer"
                  >
                    <Unplug className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => onUpdateScope({ ch2Enabled: !scope.ch2Enabled })}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold cursor-pointer ${
                    scope.ch2Enabled
                      ? 'bg-sky-400/20 text-sky-300'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {scope.ch2Enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="mb-1 flex justify-between text-slate-400">
                  <span>Volts/Div</span>
                  <span className="font-mono text-sky-200">{scope.ch2Vdiv}V</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => stepVdiv('ch2Vdiv', -1)}
                    className="flex-1 rounded bg-slate-800 py-1 font-mono font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    −
                  </button>
                  <button
                    onClick={() => stepVdiv('ch2Vdiv', 1)}
                    className="flex-1 rounded bg-slate-800 py-1 font-mono font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    onClick={() =>
                      onUpdateScope({
                        ch2Coupling: scope.ch2Coupling === 'DC' ? 'AC' : 'DC',
                      })
                    }
                    className="rounded bg-slate-800 px-2 py-1 font-mono text-[10px] text-sky-300 hover:bg-slate-700 cursor-pointer"
                  >
                    {scope.ch2Coupling}
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-slate-400">
                  <span>Position</span>
                  <span className="font-mono text-sky-200">
                    {scope.ch2OffsetDiv >= 0 ? '+' : ''}
                    {scope.ch2OffsetDiv.toFixed(1)}d
                  </span>
                </div>
                <input
                  type="range"
                  min={-3}
                  max={3}
                  step={0.2}
                  value={scope.ch2OffsetDiv}
                  onChange={(e) =>
                    onUpdateScope({ ch2OffsetDiv: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Horizontal Timebase Control */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-2.5 text-[11px]">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-slate-300">
                Horizontal Timebase
              </span>
              <span className="font-mono font-semibold text-emerald-300">
                {formatTimebase(scope.timebaseUs)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => stepTimebase(-1)}
                className="rounded bg-slate-800 px-2.5 py-1 font-mono font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                title="Zoom In (faster timebase)"
              >
                −
              </button>
              <select
                value={scope.timebaseUs}
                onChange={(e) =>
                  onUpdateScope({ timebaseUs: Number(e.target.value) })
                }
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-emerald-500"
              >
                {TIMEBASE_STEPS_US.map((us) => (
                  <option key={us} value={us}>
                    {formatTimebase(us)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => stepTimebase(1)}
                className="rounded bg-slate-800 px-2.5 py-1 font-mono font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                title="Zoom Out (slower timebase)"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
