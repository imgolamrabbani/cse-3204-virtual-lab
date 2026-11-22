import React, { useEffect, useMemo, useState } from 'react';
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
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
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
import { benchAudio } from './utils/benchAudio';

// Authentic cobalt-blue lab patch cord palette matching the physical RUET lab cords
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

function getInitialTheme(): 'day' | 'night' {
  if (typeof window === 'undefined') return 'day';
  try {
    const saved = window.localStorage.getItem('cse3204-theme');
    if (saved === 'night' || saved === 'day') return saved;
  } catch {
    // ignore storage restriction
  }
  return 'day';
}

export default function App() {
  const [theme, setTheme] = useState<'day' | 'night'>(getInitialTheme);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
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
  const [subModeByLab, setSubModeByLab] = useState<Record<string, string>>({ pam: 'pam' });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('cse3204-theme', theme);
    } catch {
      // ignore storage restriction
    }
  }, [theme]);

  useEffect(() => {
    benchAudio.enabled = soundEnabled;
  }, [soundEnabled]);

  const lab = useMemo(() => getLabById(activeLabId), [activeLabId]);
  const activeSubMode = useMemo(() => {
    if (!lab.subModes || lab.subModes.length === 0) return null;
    const chosenId = subModeByLab[lab.id] ?? lab.subModes[0].id;
    return lab.subModes.find((m) => m.id === chosenId) ?? lab.subModes[0];
  }, [lab, subModeByLab]);

  const activeWireRules = activeSubMode ? activeSubMode.wireRules : lab.wireRules;
  const wires = wiresByLab[activeLabId];
  const knobs = knobsByLab[activeLabId];
  const switches = switchesByLab[activeLabId];
  const scope = scopesByLab[activeLabId];

  const wireCounts = useMemo(() => {
    const counts = {} as Record<LabId, number>;
    for (const l of LABS) counts[l.id] = wiresByLab[l.id].length;
    return counts;
  }, [wiresByLab]);

  const ch1Signal = useMemo(
    () => evaluatePortSignal(lab, scope.ch1Port, wires, { knobs, switches }),
    [lab, scope.ch1Port, wires, knobs, switches]
  );

  const ch2Signal = useMemo(
    () => evaluatePortSignal(lab, scope.ch2Port, wires, { knobs, switches }),
    [lab, scope.ch2Port, wires, knobs, switches]
  );

  const handleToggleTheme = (next: 'day' | 'night') => {
    if (next !== theme) {
      benchAudio.click();
      setTheme(next);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    benchAudio.enabled = next;
    setSoundEnabled(next);
    if (next) benchAudio.click();
  };

  const handleSelectLab = (id: LabId) => {
    benchAudio.click();
    setActiveLabId(id);
    setProbeAttachMode(null);
    setCheckResult(null);
    setShowHints(false);
  };

  const handleAddWire = (from: string, to: string) => {
    let added = false;
    setWiresByLab((prev) => {
      const existing = prev[activeLabId];
      const dup = existing.some(
        (w) =>
          (w.from === from && w.to === to) || (w.from === to && w.to === from)
      );
      if (dup) return prev;
      added = true;
      const color = WIRE_PALETTE[existing.length % WIRE_PALETTE.length];
      const nextWires = [
        ...existing,
        { id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from, to, color },
      ];
      return { ...prev, [activeLabId]: nextWires };
    });
    if (added) benchAudio.plugIn();
    setCheckResult(null);
  };

  const handleRemoveWire = (wireId: string) => {
    benchAudio.unplug();
    setWiresByLab((prev) => ({
      ...prev,
      [activeLabId]: prev[activeLabId].filter((w) => w.id !== wireId),
    }));
    setCheckResult(null);
  };

  const handleResetWires = () => {
    if (wires.length > 0) benchAudio.unplug();
    else benchAudio.click();
    setWiresByLab((prev) => ({ ...prev, [activeLabId]: [] }));
    setCheckResult(null);
  };

  const handleCheckWiring = () => {
    const result = validateLabWiring(lab, wires, activeSubMode?.id);
    setCheckResult(result);
    if (result.detectedModeId && lab.subModes) {
      setSubModeByLab((prev) => ({ ...prev, [activeLabId]: result.detectedModeId! }));
    }
    if (result.isComplete) {
      benchAudio.verified();
      setCompletedLabs((prev) => ({ ...prev, [activeLabId]: true }));
    } else {
      benchAudio.click();
    }
  };

  const handleSelectSubMode = (modeId: string) => {
    const mode = lab.subModes?.find((m) => m.id === modeId);
    if (!mode) return;
    benchAudio.click();
    setSubModeByLab((prev) => ({ ...prev, [activeLabId]: modeId }));
    setCheckResult(null);
    handleUpdateScope({
      ch1Port: mode.defaultCh1Port,
      ch2Port: mode.defaultCh2Port,
      ch1Enabled: true,
      ch2Enabled: Boolean(mode.defaultCh2Port),
      timebaseUs: mode.defaultTimebaseUs,
    });
  };

  const handleApplyCorrectWiring = () => {
    const autoWires: WireConnection[] = activeWireRules.map((rule, idx) => ({
      id: `auto_${rule.id}_${idx}`,
      from: rule.hintFrom,
      to: rule.hintTo,
      color: WIRE_PALETTE[idx % WIRE_PALETTE.length],
    }));
    setWiresByLab((prev) => ({ ...prev, [activeLabId]: autoWires }));
    const verified = validateLabWiring(lab, autoWires, activeSubMode?.id);
    setCheckResult(verified);
    if (verified.isComplete) {
      benchAudio.verified();
      setCompletedLabs((prev) => ({ ...prev, [activeLabId]: true }));
    } else {
      benchAudio.plugIn();
    }
  };

  const handleKnobChange = (knobId: string, value: number) => {
    setKnobsByLab((prev) => ({
      ...prev,
      [activeLabId]: { ...prev[activeLabId], [knobId]: value },
    }));
  };

  const handleSwitchChange = (switchId: string, value: string) => {
    benchAudio.click();
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
    benchAudio.plugIn();
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
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col bg-[var(--bench-bg)] text-[var(--ink-primary)] lg:flex-row">
        {/* Unified-Canvas Sticky Sidebar */}
        <Sidebar
          labs={LABS}
          activeLabId={activeLabId}
          completedLabs={completedLabs}
          wireCounts={wireCounts}
          theme={theme}
          soundEnabled={soundEnabled}
          onSelectLab={handleSelectLab}
          onToggleTheme={handleToggleTheme}
          onToggleSound={handleToggleSound}
        />

        {/* Main Architectural ESD Workbench */}
        <main className="bench-mat-surface flex-1 overflow-y-auto px-4 py-5 sm:px-7">
          <div className="mx-auto max-w-[1080px] space-y-5">
            {/* Hairline-Separated Benchtop Header */}
            <header className="flex flex-col justify-between gap-3.5 border-b border-[var(--hairline)] pb-4 xl:flex-row xl:items-end">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-[var(--ink-tertiary)]">
                  <span className="font-semibold text-[var(--cord-cobalt)]">
                    Lab 0{lab.labNumber}
                  </span>
                  <span aria-hidden="true">/</span>
                  <span className="text-[var(--ink-secondary)]">{lab.modelName}</span>
                  <span aria-hidden="true">/</span>
                  <span className="tabular-nums text-[var(--ink-secondary)]">
                    {wires.length} of {activeWireRules.length} cords connected
                  </span>
                </div>

                <h2 className="mt-1 text-[20px] font-bold tracking-[-0.025em] text-[var(--ink-primary)] sm:text-[22px]">
                  {lab.title}
                </h2>

                {/* Tactile Segmented Hardware Mode Switch (Lab 3: PAM / PWM / PPM) */}
                {lab.subModes && activeSubMode && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <div
                      role="tablist"
                      aria-label="Modulation mode"
                      className="relative inline-flex rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--bench-recess)] p-0.5"
                    >
                      {lab.subModes.map((mode) => {
                        const isSelected = mode.id === activeSubMode.id;
                        return (
                          <button
                            key={mode.id}
                            role="tab"
                            aria-selected={isSelected}
                            onClick={() => handleSelectSubMode(mode.id)}
                            title={mode.shortDesc}
                            className={`relative z-10 rounded-[4px] px-3 py-1 font-mono text-xs font-semibold transition-colors cursor-pointer ${
                              isSelected
                                ? 'text-[var(--ink-primary)]'
                                : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]'
                            }`}
                          >
                            {isSelected && (
                              <motion.span
                                layoutId="active-mode-pill"
                                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                                className="absolute inset-0 -z-10 rounded-[4px] bg-[var(--sheet-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.14)] ring-1 ring-[var(--hairline)]"
                              />
                            )}
                            {mode.label.replace(' Mode', '')}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-xs text-[var(--ink-tertiary)]">
                      {activeSubMode.shortDesc}
                    </span>
                  </div>
                )}
              </div>

              {/* Machined Bench Action Keys */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  onClick={handleCheckWiring}
                  className="hw-key inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--cord-cobalt)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--cord-cobalt-hover)] cursor-pointer"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Check Wiring
                </button>

                <button
                  onClick={handleResetWires}
                  className="hw-key inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--hairline-strong)] bg-[var(--sheet-surface)] px-3 py-2 text-xs font-semibold text-[var(--ink-secondary)] hover:border-[var(--signal-fault)]/45 hover:text-[var(--signal-fault)] cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Wires
                </button>

                <button
                  onClick={() => {
                    benchAudio.click();
                    setShowHints((prev) => !prev);
                  }}
                  className={`hw-key inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-semibold cursor-pointer ${
                    showHints
                      ? 'border-[var(--signal-warn)]/50 bg-[var(--signal-warn-soft)] text-[var(--signal-warn-ink)]'
                      : 'border-[var(--hairline-strong)] bg-[var(--sheet-surface)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {showHints ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showHints ? 'Hide Hint' : 'Show Hint / Correct Wiring'}
                </button>

                <button
                  onClick={() => {
                    benchAudio.click();
                    setShowGuide(true);
                  }}
                  className="hw-key font-bn inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--hairline-strong)] bg-[var(--sheet-surface)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] cursor-pointer"
                >
                  <BookOpen className="h-3.5 w-3.5 text-[var(--cord-cobalt)]" />
                  ল্যাব ম্যানুয়াল (বাংলা)
                </button>
              </div>
            </header>

            {/* Animated Wiring Check Result Strip */}
            <AnimatePresence initial={false}>
              {checkResult && (
                <motion.div
                  key={checkResult.summary}
                  role="status"
                  initial={{ opacity: 0, y: -6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.99 }}
                  transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                  className={`rounded-[var(--radius-md)] border px-4 py-3 text-xs ${
                    checkResult.isComplete
                      ? 'border-[var(--signal-pass)]/35 bg-[var(--signal-pass-soft)] text-[var(--signal-pass-ink)]'
                      : 'border-[var(--signal-warn)]/40 bg-[var(--signal-warn-soft)] text-[var(--signal-warn-ink)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      {checkResult.isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--signal-pass)]" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-[var(--signal-warn)]" />
                      )}
                      <span>{checkResult.summary}</span>
                    </div>
                    <span className="font-mono text-xs font-bold tabular-nums">
                      {checkResult.scorePercent}%
                    </span>
                  </div>

                  {!checkResult.isComplete && (
                    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--hairline)] pt-2.5 md:grid-cols-2">
                      {checkResult.missing.length > 0 && (
                        <div>
                          <div className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--signal-fault)]">
                            <XCircle className="h-3.5 w-3.5" />
                            Missing connections ({checkResult.missing.length})
                          </div>
                          <ul className="space-y-1 font-mono text-[11px] text-[var(--ink-secondary)]">
                            {checkResult.missing.map((m) => (
                              <li key={m.ruleId}>• {m.label}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {checkResult.extra.length > 0 && (
                        <div>
                          <div className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--signal-warn)]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Unexpected or shorted wires ({checkResult.extra.length})
                          </div>
                          <ul className="space-y-1 font-mono text-[11px] text-[var(--ink-secondary)]">
                            {checkResult.extra.map((ex) => (
                              <li key={ex.wireId}>
                                • {ex.fromLabel} ↔ {ex.toLabel} (click orange wire to unplug)
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Animated Reference Wiring Hint Drawer */}
            <AnimatePresence initial={false}>
              {showHints && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.99 }}
                  transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                  className="rounded-[var(--radius-md)] border border-[var(--hairline-strong)] bg-[var(--sheet-surface)] p-3.5 text-xs"
                >
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-[var(--ink-primary)]">
                      Wiring guide — {lab.modelName}
                      {activeSubMode ? ` (${activeSubMode.label})` : ''}
                    </div>
                    <button
                      onClick={handleApplyCorrectWiring}
                      className="hw-key inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--cord-cobalt)]/35 bg-[var(--cord-cobalt-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--cord-cobalt)] cursor-pointer"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Auto-wire {activeSubMode ? activeSubMode.label : 'setup'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {activeWireRules.map((rule, idx) => (
                      <div
                        key={rule.id}
                        className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--bench-recess)]/70 px-2.5 py-1.5 font-mono text-[11px] leading-snug text-[var(--ink-primary)]"
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold tabular-nums text-white">
                          {idx + 1}
                        </span>
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Physical Green PCB Trainer Kit with Hardware Swap Transition */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeLabId}
                initial={{ opacity: 0, y: 6, scale: 0.992 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.995 }}
                transition={{ duration: 0.19, ease: [0.23, 1, 0.32, 1] }}
              >
                <TrainerBoard
                  lab={lab}
                  activeWireRules={activeWireRules}
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
              </motion.div>
            </AnimatePresence>

            {/* Rohde & Schwarz RTC1002 Dual-Channel Oscilloscope */}
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

        {/* Archival Datasheet Lab Manual Modal with Exit Animation */}
        <AnimatePresence>
          {showGuide && <LabGuideModal lab={lab} onClose={() => setShowGuide(false)} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
