import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  RotateCcw,
  Wand2,
  XCircle,
  Zap,
} from 'lucide-react';
import { LABS, getLabById } from './data/labs';
import {
  LabId,
  ScopeState,
  WireConnection,
  WiringCheckResult,
} from './types/lab';
import { validateLabWiring } from './engine/wiringValidator';
import { evaluatePortSignal } from './engine/signalEngine';
import { Sidebar } from './components/Sidebar';
import { TrainerBoard } from './components/TrainerBoard';
import { Oscilloscope } from './components/Oscilloscope';
import { LabGuideModal } from './components/LabGuideModal';

// Authentic blue lab patch cord shades (just like the lab videos!)
const WIRE_PALETTE = [
  '#2563eb',
  '#1d4ed8',
  '#3b82f6',
  '#0284c7',
  '#2563eb',
  '#1e40af',
];

function createDefaultKnobs(): Record<LabId, Record<string, number>> {
  const out = {} as Record<LabId, Record<string, number>>;
  for (const lab of LABS) {
    out[lab.id] = {};
    for (const k of lab.knobs) out[lab.id][k.id] = k.defaultValue;
  }
  return out;
}

function createDefaultSwitches(): Record<LabId, Record<string, string>> {
  const out = {} as Record<LabId, Record<string, string>>;
  for (const lab of LABS) {
    out[lab.id] = {};
    for (const s of lab.switches) out[lab.id][s.id] = s.defaultValue;
  }
  return out;
}

function createDefaultScopes(): Record<LabId, ScopeState> {
  const out = {} as Record<LabId, ScopeState>;
  for (const lab of LABS) {
    out[lab.id] = {
      ch1Port: lab.defaultCh1Port,
      ch2Port: lab.defaultCh2Port,
      ch1Enabled: true,
      ch2Enabled: Boolean(lab.defaultCh2Port),
      ch1Vdiv: lab.defaultCh1Vdiv,
      ch2Vdiv: lab.defaultCh2Vdiv,
      ch1OffsetDiv: 1.4,
      ch2OffsetDiv: -1.6,
      ch1Coupling: 'DC',
      ch2Coupling: 'DC',
      timebaseUs: lab.defaultTimebaseUs,
      running: true,
      triggerSource: lab.defaultCh2Port ? 'CH2' : 'CH1',
      triggerLevelV: 0.05,
    };
  }
  return out;
}

function createEmptyWires(): Record<LabId, WireConnection[]> {
  return {
    am: [],
    fm: [],
    pam: [],
    fdm: [],
    tdm: [],
    linecoding: [],
  };
}

function createEmptyCompleted(): Record<LabId, boolean> {
  return {
    am: false,
    fm: false,
    pam: false,
    fdm: false,
    tdm: false,
    linecoding: false,
  };
}

export default function App() {
  const [activeLabId, setActiveLabId] = useState<LabId>('am');
  const [wiresByLab, setWiresByLab] = useState<Record<LabId, WireConnection[]>>(createEmptyWires);
  const [knobsByLab, setKnobsByLab] = useState<Record<LabId, Record<string, number>>>(createDefaultKnobs);
  const [switchesByLab, setSwitchesByLab] = useState<Record<LabId, Record<string, string>>>(createDefaultSwitches);
  const [scopesByLab, setScopesByLab] = useState<Record<LabId, ScopeState>>(createDefaultScopes);
  const [completedLabs, setCompletedLabs] = useState<Record<LabId, boolean>>(createEmptyCompleted);

  const [probeAttachMode, setProbeAttachMode] = useState<'CH1' | 'CH2' | null>(null);
  const [showHints, setShowHints] = useState<boolean>(false);
  const [checkResult, setCheckResult] = useState<WiringCheckResult | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  const lab = useMemo(() => getLabById(activeLabId), [activeLabId]);
  const wires = wiresByLab[activeLabId];
  const knobs = knobsByLab[activeLabId];
  const switches = switchesByLab[activeLabId];
  const scope = scopesByLab[activeLabId];

  const wireCounts = useMemo(() => {
    const counts = {} as Record<LabId, number>;
    for (const l of LABS) counts[l.id] = wiresByLab[l.id].length;
    return counts;
  }, [wiresByLab]);

  // Evaluate live signals at CH1 & CH2 from actual wire graph + knobs + switches
  const ch1Signal = useMemo(
    () => evaluatePortSignal(lab, scope.ch1Port, wires, { knobs, switches }),
    [lab, scope.ch1Port, wires, knobs, switches]
  );

  const ch2Signal = useMemo(
    () => evaluatePortSignal(lab, scope.ch2Port, wires, { knobs, switches }),
    [lab, scope.ch2Port, wires, knobs, switches]
  );

  const handleSelectLab = (id: LabId) => {
    setActiveLabId(id);
    setProbeAttachMode(null);
    setCheckResult(null);
    setShowHints(false);
  };

  const handleAddWire = (from: string, to: string) => {
    setWiresByLab((prev) => {
      const existing = prev[activeLabId];
      // Prevent duplicate exact wire between the same two sockets
      const dup = existing.some(
        (w) =>
          (w.from === from && w.to === to) || (w.from === to && w.to === from)
      );
      if (dup) return prev;
      const color = WIRE_PALETTE[existing.length % WIRE_PALETTE.length];
      const nextWires = [
        ...existing,
        { id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from, to, color },
      ];
      return { ...prev, [activeLabId]: nextWires };
    });
    setCheckResult(null);
  };

  const handleRemoveWire = (wireId: string) => {
    setWiresByLab((prev) => ({
      ...prev,
      [activeLabId]: prev[activeLabId].filter((w) => w.id !== wireId),
    }));
    setCheckResult(null);
  };

  const handleResetWires = () => {
    setWiresByLab((prev) => ({ ...prev, [activeLabId]: [] }));
    setCheckResult(null);
  };

  const handleCheckWiring = () => {
    const result = validateLabWiring(lab, wires);
    setCheckResult(result);
    if (result.isComplete) {
      setCompletedLabs((prev) => ({ ...prev, [activeLabId]: true }));
    }
  };

  const handleApplyCorrectWiring = () => {
    const autoWires: WireConnection[] = lab.wireRules.map((rule, idx) => ({
      id: `auto_${rule.id}_${idx}`,
      from: rule.hintFrom,
      to: rule.hintTo,
      color: WIRE_PALETTE[idx % WIRE_PALETTE.length],
    }));
    setWiresByLab((prev) => ({ ...prev, [activeLabId]: autoWires }));
    const verified = validateLabWiring(lab, autoWires);
    setCheckResult(verified);
    if (verified.isComplete) {
      setCompletedLabs((prev) => ({ ...prev, [activeLabId]: true }));
    }
  };

  const handleKnobChange = (knobId: string, value: number) => {
    setKnobsByLab((prev) => ({
      ...prev,
      [activeLabId]: { ...prev[activeLabId], [knobId]: value },
    }));
  };

  const handleSwitchChange = (switchId: string, value: string) => {
    setSwitchesByLab((prev) => ({
      ...prev,
      [activeLabId]: { ...prev[activeLabId], [switchId]: value },
    }));
  };

  const handleUpdateScope = (patch: Partial<ScopeState>) => {
    setScopesByLab((prev) => ({
      ...prev,
      [activeLabId]: { ...prev[activeLabId], ...patch },
    }));
  };

  const handleToggleProbeMode = (channel: 'CH1' | 'CH2') => {
    setProbeAttachMode((prev) => (prev === channel ? null : channel));
  };

  const handleAttachProbe = (channel: 'CH1' | 'CH2', portId: string) => {
    handleUpdateScope(
      channel === 'CH1'
        ? { ch1Port: portId, ch1Enabled: true }
        : { ch2Port: portId, ch2Enabled: true }
    );
    setProbeAttachMode(null);
  };

  const handleAutoset = () => {
    const activeFreq = Math.max(ch1Signal.freqHz, ch2Signal.freqHz);
    let idealTbUs = lab.defaultTimebaseUs;
    if (activeFreq > 0) {
      // Aim for ~3-4 cycles across the 10 horizontal divisions
      const periodUs = 1e6 / activeFreq;
      const targetUsPerDiv = (periodUs * 3.5) / 10;
      const steps = [5, 10, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
      idealTbUs = steps.reduce((best, s) =>
        Math.abs(s - targetUsPerDiv) < Math.abs(best - targetUsPerDiv) ? s : best
      );
    }

    const pickVdiv = (vpp: number) => {
      if (vpp <= 1.2) return 0.5;
      if (vpp <= 2.6) return 1;
      if (vpp <= 5.5) return 2;
      return 5;
    };

    handleUpdateScope({
      timebaseUs: idealTbUs,
      ch1Vdiv: ch1Signal.isConnected ? pickVdiv(ch1Signal.vpp) : lab.defaultCh1Vdiv,
      ch2Vdiv: ch2Signal.isConnected ? pickVdiv(ch2Signal.vpp) : lab.defaultCh2Vdiv,
      ch1OffsetDiv: scope.ch2Enabled && scope.ch2Port ? 1.5 : 0,
      ch2OffsetDiv: -1.6,
      running: true,
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1018] text-slate-100 lg:flex-row">
      {/* Left Lab Switcher Sidebar */}
      <Sidebar
        labs={LABS}
        activeLabId={activeLabId}
        completedLabs={completedLabs}
        wireCounts={wireCounts}
        onSelectLab={handleSelectLab}
      />

      {/* Main Bench Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-4">
          {/* Experiment Header & Practice Action Toolbar */}
          <header className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-[#101826] p-4 shadow-lg xl:flex-row xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300 border border-emerald-500/30">
                  LAB {lab.labNumber}
                </span>
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300 border border-amber-500/30">
                  {lab.modelName}
                </span>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                  {wires.length} / {lab.wireRules.length} wires
                </span>
              </div>
              <h2 className="mt-1.5 text-lg font-bold tracking-tight text-white">
                {lab.title}
              </h2>
            </div>

            {/* Required Practice Buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={handleCheckWiring}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-emerald-950/50 transition hover:bg-emerald-500 cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" />
                Check Wiring
              </button>

              <button
                onClick={handleResetWires}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-200 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Wires
              </button>

              <button
                onClick={() => setShowHints((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                  showHints
                    ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                    : 'border-slate-700 bg-slate-800/90 text-slate-200 hover:border-amber-500/50 hover:text-amber-200'
                }`}
              >
                {showHints ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showHints ? 'Hide Hint' : 'Show Hint / Correct Wiring'}
              </button>

              <button
                onClick={() => setShowGuide(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Lab Manual
              </button>
            </div>
          </header>

          {/* Wiring Check Result Panel */}
          {checkResult && (
            <div
              className={`rounded-xl border p-3.5 text-xs shadow-lg ${
                checkResult.isComplete
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-500/50 bg-amber-500/10 text-amber-100'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  {checkResult.isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  )}
                  <span>{checkResult.summary}</span>
                </div>
                <span className="rounded-full bg-slate-950/60 px-2.5 py-0.5 font-mono font-bold">
                  Score: {checkResult.scorePercent}%
                </span>
              </div>

              {!checkResult.isComplete && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {checkResult.missing.length > 0 && (
                    <div className="rounded-lg border border-rose-500/30 bg-slate-950/50 p-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5 font-bold text-rose-300">
                        <XCircle className="h-3.5 w-3.5" />
                        Missing Connections ({checkResult.missing.length})
                      </div>
                      <ul className="space-y-1 font-mono text-[11px] text-slate-300">
                        {checkResult.missing.map((m) => (
                          <li key={m.ruleId}>• {m.label}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {checkResult.extra.length > 0 && (
                    <div className="rounded-lg border border-orange-500/30 bg-slate-950/50 p-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5 font-bold text-orange-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Unexpected / Shorted Wires ({checkResult.extra.length})
                      </div>
                      <ul className="space-y-1 font-mono text-[11px] text-slate-300">
                        {checkResult.extra.map((ex) => (
                          <li key={ex.wireId}>
                            • {ex.fromLabel} ↔ {ex.toLabel} (click orange wire to remove)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Hint / Correct Wiring Step-by-Step Checklist Drawer */}
          {showHints && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3.5 text-xs">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-amber-300">
                  Correct Wiring Reference ({lab.modelName}) — Dashed numbered guides shown on PCB
                </div>
                <button
                  onClick={handleApplyCorrectWiring}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/30 cursor-pointer"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto-Wire Correct Setup
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {lab.wireRules.map((rule, idx) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 font-mono text-[11px] text-slate-200"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-slate-950">
                      {idx + 1}
                    </span>
                    <span className="truncate" title={rule.label}>
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive SVG Hardware Trainer Box */}
          <TrainerBoard
            lab={lab}
            wires={wires}
            knobs={knobs}
            switches={switches}
            ch1Port={scope.ch1Port}
            ch2Port={scope.ch2Port}
            probeAttachMode={probeAttachMode}
            showHints={showHints}
            checkResult={checkResult}
            onAddWire={handleAddWire}
            onRemoveWire={handleRemoveWire}
            onKnobChange={handleKnobChange}
            onSwitchChange={handleSwitchChange}
            onAttachProbe={handleAttachProbe}
          />

          {/* Live Dual-Channel HTML5 Canvas Oscilloscope */}
          <Oscilloscope
            lab={lab}
            scope={scope}
            ch1Signal={ch1Signal}
            ch2Signal={ch2Signal}
            probeAttachMode={probeAttachMode}
            onUpdateScope={handleUpdateScope}
            onToggleProbeMode={handleToggleProbeMode}
            onAutoset={handleAutoset}
          />
        </div>
      </main>

      {/* Lab Manual Reference Modal */}
      {showGuide && <LabGuideModal lab={lab} onClose={() => setShowGuide(false)} />}
    </div>
  );
}
