import React, { useRef, useState } from 'react';
import {
  BlockDef,
  KnobDef,
  LabDefinition,
  PortDef,
  SwitchDef,
  WireConnection,
  WiringCheckResult,
} from '../types/lab';

interface TrainerBoardProps {
  lab: LabDefinition;
  wires: WireConnection[];
  knobs: Record<string, number>;
  switches: Record<string, string>;
  ch1Port: string | null;
  ch2Port: string | null;
  probeAttachMode: 'CH1' | 'CH2' | null;
  showHints: boolean;
  checkResult: WiringCheckResult | null;
  onAddWire: (from: string, to: string) => void;
  onRemoveWire: (wireId: string) => void;
  onKnobChange: (knobId: string, value: number) => void;
  onSwitchChange: (switchId: string, value: string) => void;
  onAttachProbe: (channel: 'CH1' | 'CH2', portId: string) => void;
}

const VIEW_W = 920;
const VIEW_H = 560;

/** Generate a realistic drooping catenary-like cubic Bezier path between two sockets */
function buildWirePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seedIndex = 0
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  // Natural gravity sag + slight arc separation so overlapping wires stay readable
  const sag = Math.min(115, 30 + dist * 0.24) + (seedIndex % 3) * 10;
  const liftBias = y1 < 230 && y2 < 230 ? -0.45 : 0.75;
  const cx1 = x1 + dx * 0.28;
  const cy1 = y1 + sag * liftBias;
  const cx2 = x2 - dx * 0.28;
  const cy2 = y2 + sag * liftBias;
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

export const TrainerBoard: React.FC<TrainerBoardProps> = ({
  lab,
  wires,
  knobs,
  switches,
  ch1Port,
  ch2Port,
  probeAttachMode,
  showHints,
  checkResult,
  onAddWire,
  onRemoveWire,
  onKnobChange,
  onSwitchChange,
  onAttachProbe,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [hoveredWire, setHoveredWire] = useState<string | null>(null);
  const [draggingKnob, setDraggingKnob] = useState<{
    knob: KnobDef;
    startY: number;
    startVal: number;
  } | null>(null);

  const portMap = new Map(lab.ports.map((p) => [p.id, p]));

  const getSvgCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    return { x, y };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingKnob) {
      const { knob, startY, startVal } = draggingKnob;
      const dy = startY - e.clientY;
      const range = knob.max - knob.min;
      const raw = startVal + (dy / 120) * range;
      const snapped =
        Math.round(Math.min(knob.max, Math.max(knob.min, raw)) / knob.step) * knob.step;
      onKnobChange(knob.id, Number(snapped.toFixed(3)));
      return;
    }
    if (selectedPort) {
      const pt = getSvgCoords(e);
      if (pt) setMousePos(pt);
    }
  };

  const handleSvgMouseUp = () => {
    if (draggingKnob) setDraggingKnob(null);
  };

  const handleSvgBackgroundClick = () => {
    if (selectedPort) {
      setSelectedPort(null);
      setMousePos(null);
    }
  };

  const handlePortClick = (e: React.MouseEvent, port: PortDef) => {
    e.stopPropagation();

    if (probeAttachMode) {
      onAttachProbe(probeAttachMode, port.id);
      return;
    }

    if (!selectedPort) {
      setSelectedPort(port.id);
      setMousePos({ x: port.x, y: port.y });
      return;
    }

    if (selectedPort === port.id) {
      setSelectedPort(null);
      setMousePos(null);
      return;
    }

    onAddWire(selectedPort, port.id);
    setSelectedPort(null);
    setMousePos(null);
  };

  const renderBlockIcon = (block: BlockDef) => {
    const cx = block.id === 'fdm_acamp' ? block.x + block.w * 0.64 : block.x + block.w / 2;
    const cy = block.y + block.h / 2 - 4;
    if (block.icon === 'opamp' || block.icon === 'amp') {
      return (
        <g stroke="#e2f5ea" strokeWidth="1.8" fill="none" opacity="0.9">
          <polygon points={`${cx - 16},${cy - 16} ${cx - 16},${cy + 16} ${cx + 18},${cy}`} />
          <line x1={cx - 24} y1={cy - 7} x2={cx - 16} y2={cy - 7} />
          <line x1={cx - 24} y1={cy + 7} x2={cx - 16} y2={cy + 7} />
          <line x1={cx + 18} y1={cy} x2={cx + 28} y2={cy} />
        </g>
      );
    }
    if (block.icon === 'lpf') {
      return (
        <g stroke="#e2f5ea" strokeWidth="1.6" fill="none" opacity="0.9">
          <rect x={cx - 22} y={cy - 14} width={44} height={28} rx="2" strokeOpacity="0.45" />
          <polyline points={`${cx - 16},${cy - 6} ${cx},${cy - 6} ${cx + 14},${cy + 8}`} />
          <line x1={cx - 16} y1={cy + 8} x2={cx + 16} y2={cy + 8} strokeOpacity="0.5" />
        </g>
      );
    }
    return null;
  };

  const renderKnob = (knob: KnobDef) => {
    const val = knobs[knob.id] ?? knob.defaultValue;
    const pct = (val - knob.min) / Math.max(0.0001, knob.max - knob.min);
    const angle = -135 + pct * 270;
    const r = knob.size === 'sm' ? 18 : 23;

    const handleKnobWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY < 0 ? 1 : -1;
      const next = Math.min(knob.max, Math.max(knob.min, val + dir * knob.step));
      onKnobChange(knob.id, Number(next.toFixed(3)));
    };

    const isRedTrimmer = knob.color === 'red';

    return (
      <g
        key={knob.id}
        transform={`translate(${knob.x}, ${knob.y})`}
        className="cursor-ns-resize select-none"
        onMouseDown={(e) => {
          e.stopPropagation();
          setDraggingKnob({ knob, startY: e.clientY, startVal: val });
        }}
        onWheel={handleKnobWheel}
      >
        {/* Tick arc around knob */}
        <circle
          r={r + 5}
          fill="none"
          stroke="#c6f1d6"
          strokeWidth="1.2"
          strokeDasharray="2 4"
          opacity="0.7"
        />

        {isRedTrimmer ? (
          <>
            {/* Square blue trimmer housing (authentic TCM 001-11 FDM look!) */}
            <rect
              x={-r}
              y={-r}
              width={r * 2}
              height={r * 2}
              rx="4"
              fill="#1d65b8"
              stroke="#93c5fd"
              strokeWidth="1.2"
            />
            <circle r={r - 4} fill="#164e94" />
            <g transform={`rotate(${angle})`}>
              <polygon
                points={`0,${-r + 3} -5,6 5,6`}
                fill="#ef4444"
                stroke="#7f1d1d"
                strokeWidth="0.8"
              />
              <circle r="4" fill="#dc2626" />
            </g>
          </>
        ) : (
          <>
            {/* Classic fluted blue lab potentiometer knob (TCM 005-01 / 001-02 / 001-03) */}
            <circle r={r + 1} fill="#0c2d5c" />
            <circle
              r={r}
              fill="url(#blueKnobGrad)"
              stroke="#60a5fa"
              strokeWidth="1.2"
            />
            <circle r={r * 0.72} fill="#1e66c7" stroke="#93c5fd" strokeWidth="0.8" opacity="0.9" />
            <g transform={`rotate(${angle})`}>
              <line
                x1="0"
                y1={-r * 0.25}
                x2="0"
                y2={-r + 2}
                stroke="#ffffff"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </g>
          </>
        )}

        {/* Knob Label & Live Value */}
        <text
          y={r + 16}
          textAnchor="middle"
          fill="#ecfdf5"
          fontSize="8.5"
          fontWeight="700"
          className="tracking-wide"
        >
          {knob.label}
        </text>
        <text
          y={r + 26}
          textAnchor="middle"
          fill="#fde047"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="600"
        >
          {val} {knob.unit}
        </text>
      </g>
    );
  };

  const renderSwitch = (sw: SwitchDef) => {
    const curVal = switches[sw.id] ?? sw.defaultValue;

    if (sw.type === 'dip-select' && sw.options) {
      return (
        <g key={sw.id} transform={`translate(${sw.x}, ${sw.y})`}>
          <text
            x="0"
            y="-36"
            textAnchor="middle"
            fill="#ecfdf5"
            fontSize="8.5"
            fontWeight="700"
          >
            {sw.label}
          </text>
          <rect
            x="-46"
            y="-28"
            width="92"
            height={sw.options.length * 20 + 8}
            rx="4"
            fill="#1e293b"
            stroke="#cbd5e1"
            strokeWidth="1.2"
          />
          {sw.options.map((opt, idx) => {
            const active = curVal === opt;
            const yPos = -22 + idx * 20;
            return (
              <g
                key={opt}
                transform={`translate(0, ${yPos})`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchChange(sw.id, opt);
                }}
              >
                <text
                  x="-38"
                  y="11"
                  fill={active ? '#fde047' : '#94a3b8'}
                  fontSize="8.5"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {opt}
                </text>
                <rect x="6" y="1" width="30" height="12" rx="2" fill="#0f172a" />
                <rect
                  x={active ? 22 : 8}
                  y="2.5"
                  width="12"
                  height="9"
                  rx="1.5"
                  fill={active ? '#facc15' : '#cbd5e1'}
                />
              </g>
            );
          })}
        </g>
      );
    }

    if (sw.type === 'jumper' && sw.options) {
      return (
        <g key={sw.id} transform={`translate(${sw.x}, ${sw.y})`}>
          <text
            x="0"
            y="-24"
            textAnchor="middle"
            fill="#fde047"
            fontSize="8.5"
            fontWeight="700"
          >
            {sw.label}
          </text>
          <rect
            x="-72"
            y="-16"
            width="144"
            height="42"
            rx="4"
            fill="#0d3d24"
            stroke="#86efac"
            strokeWidth="1"
          />
          {sw.options.map((opt, idx) => {
            const active = curVal === opt;
            const xPos = -52 + idx * 35;
            return (
              <g
                key={opt}
                transform={`translate(${xPos}, 4)`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchChange(sw.id, opt);
                }}
              >
                <text
                  y="-10"
                  textAnchor="middle"
                  fill={active ? '#fde047' : '#d1fae5'}
                  fontSize="7.5"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {opt}
                </text>
                <rect
                  x="-12"
                  y="-4"
                  width="24"
                  height="18"
                  rx="3"
                  fill={active ? '#facc15' : '#1e293b'}
                  stroke={active ? '#fef08a' : '#64748b'}
                  strokeWidth="1.2"
                />
                <circle cx="-4" cy="5" r="2.2" fill={active ? '#1e293b' : '#cbd5e1'} />
                <circle cx="4" cy="5" r="2.2" fill={active ? '#1e293b' : '#cbd5e1'} />
              </g>
            );
          })}
        </g>
      );
    }

    if (sw.type === 'bit8') {
      const bits = curVal.padEnd(8, '0').slice(0, 8).split('');
      return (
        <g key={sw.id} transform={`translate(${sw.x}, ${sw.y})`}>
          <text
            x="0"
            y="-28"
            textAnchor="middle"
            fill="#ecfdf5"
            fontSize="8.5"
            fontWeight="700"
          >
            {sw.label} (CLICK BITS)
          </text>
          <rect
            x="-104"
            y="-20"
            width="208"
            height="46"
            rx="5"
            fill="#1e293b"
            stroke="#94a3b8"
            strokeWidth="1.2"
          />
          {bits.map((b, i) => {
            const isOne = b === '1';
            const bx = -90 + i * 25.5;
            return (
              <g
                key={i}
                transform={`translate(${bx}, 0)`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = [...bits];
                  next[i] = isOne ? '0' : '1';
                  onSwitchChange(sw.id, next.join(''));
                }}
              >
                <rect
                  x="-9"
                  y="-13"
                  width="18"
                  height="28"
                  rx="3"
                  fill={isOne ? '#16a34a' : '#0f172a'}
                  stroke={isOne ? '#86efac' : '#475569'}
                  strokeWidth="1.2"
                />
                <text
                  y="5"
                  textAnchor="middle"
                  fill={isOne ? '#ffffff' : '#94a3b8'}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {b}
                </text>
                <text
                  y="24"
                  textAnchor="middle"
                  fill="#a7f3d0"
                  fontSize="7"
                  fontFamily="JetBrains Mono, monospace"
                >
                  b{i}
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    if (sw.type === 'mode-select' && sw.options) {
      return (
        <g key={sw.id} transform={`translate(${sw.x}, ${sw.y})`}>
          <text
            x="0"
            y="-24"
            textAnchor="middle"
            fill="#fde047"
            fontSize="8.5"
            fontWeight="700"
          >
            {sw.label}
          </text>
          <rect
            x="-112"
            y="-16"
            width="224"
            height="32"
            rx="5"
            fill="#0d3d24"
            stroke="#86efac"
            strokeWidth="1"
          />
          {sw.options.map((opt, i) => {
            const active = curVal === opt;
            const bx = -82 + i * 55;
            return (
              <g
                key={opt}
                transform={`translate(${bx}, 0)`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchChange(sw.id, opt);
                }}
              >
                <rect
                  x="-24"
                  y="-11"
                  width="48"
                  height="22"
                  rx="3"
                  fill={active ? '#facc15' : '#1e293b'}
                  stroke={active ? '#fef08a' : '#475569'}
                  strokeWidth="1"
                />
                <text
                  y="3.5"
                  textAnchor="middle"
                  fill={active ? '#0f172a' : '#e2e8f0'}
                  fontSize="8"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {opt}
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    return null;
  };

  const renderPortLabel = (port: PortDef) => {
    // Always place GND label cleanly to the right so the ground symbol below the socket never overlaps it
    if (port.kind === 'gnd') {
      return (
        <g pointerEvents="none">
          <text
            x={port.x + 14}
            y={port.y + 3}
            textAnchor="start"
            fill="#cbd5e1"
            fontSize="8.2"
            fontWeight="700"
          >
            GND
          </text>
        </g>
      );
    }

    const pos = port.labelPos ?? 'top';
    let dx = 0;
    let dy = port.sublabel ? -22 : -15;
    let anchor: 'middle' | 'start' | 'end' = 'middle';
    if (pos === 'bottom') {
      dy = 21;
    } else if (pos === 'left') {
      dx = -15;
      dy = port.sublabel ? -1 : 3;
      anchor = 'end';
    } else if (pos === 'right') {
      dx = 15;
      dy = port.sublabel ? -1 : 3;
      anchor = 'start';
    }

    return (
      <g pointerEvents="none">
        <text
          x={port.x + dx}
          y={port.y + dy}
          textAnchor={anchor}
          fill="#f0fdf4"
          fontSize="8.5"
          fontWeight="700"
          className="tracking-tight"
        >
          {port.label}
        </text>
        {port.sublabel && (
          <text
            x={port.x + dx}
            y={port.y + dy + 9}
            textAnchor={anchor}
            fill="#a7f3d0"
            fontSize="7.2"
            fontFamily="JetBrains Mono, monospace"
          >
            {port.sublabel}
          </text>
        )}
      </g>
    );
  };

  const selectedPortObj = selectedPort ? portMap.get(selectedPort) : null;
  const hoveredPortObj = hoveredPort ? portMap.get(hoveredPort) : null;

  // Determine missing rules to highlight when Show Hints is enabled
  const hintRules = showHints ? lab.wireRules : [];
  const missingIds = new Set(checkResult?.missing.map((m) => m.ruleId) ?? []);
  const extraWireIds = new Set(checkResult?.extra.map((e) => e.wireId) ?? []);

  return (
    <div className="relative w-full select-none">
      {/* Contextual Status Ribbon above PCB */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {probeAttachMode ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold ${
                probeAttachMode === 'CH1'
                  ? 'border-yellow-400/60 bg-yellow-500/15 text-yellow-300'
                  : 'border-sky-400/60 bg-sky-500/15 text-sky-300'
              }`}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
              Click any terminal on the trainer box to attach {probeAttachMode} Probe
            </span>
          ) : selectedPortObj ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/60 bg-blue-500/15 px-2.5 py-1 font-medium text-blue-200">
              <span className="h-2 w-2 animate-ping rounded-full bg-blue-400" />
              Wiring from <strong className="font-mono text-white">{selectedPortObj.label}</strong> — click destination socket (or click empty area to cancel)
            </span>
          ) : (
            <span className="text-slate-400">
              Click any socket to patch a wire · Click a cord to unplug · Drag knobs to adjust
            </span>
          )}
        </div>

        {hoveredPortObj && (
          <div className="rounded bg-slate-800/90 px-2.5 py-1 font-mono text-[11px] text-emerald-300 border border-slate-700">
            {hoveredPortObj.label}: <span className="text-slate-300 font-sans">{hoveredPortObj.description}</span>
          </div>
        )}
      </div>

      {/* Interactive Physical Trainer Enclosure SVG */}
      <div className="relative overflow-hidden rounded-xl border border-slate-700/80 bg-[#1c2128] shadow-2xl">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full"
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onClick={handleSvgBackgroundClick}
        >
          <defs>
            <linearGradient id="pcbGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#19824c" />
              <stop offset="55%" stopColor="#136a3d" />
              <stop offset="100%" stopColor="#0f5531" />
            </linearGradient>
            <linearGradient id="caseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3c424c" />
              <stop offset="100%" stopColor="#262a31" />
            </linearGradient>
            <radialGradient id="blueKnobGrad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="55%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </radialGradient>
            <radialGradient id="ledGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff7b7b" />
              <stop offset="45%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            <filter id="wireShadow" x="-15%" y="-15%" width="130%" height="140%">
              <feDropShadow dx="0" dy="5" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.55" />
            </filter>
            <marker
              id="pcbArrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#d1fae5" />
            </marker>
            <pattern id="pcbTraceGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="0.4"
                strokeOpacity="0.1"
              />
            </pattern>
          </defs>

          {/* Outer Molded Dark Gray Trainer Case */}
          <rect x="2" y="2" width={VIEW_W - 4} height={VIEW_H - 4} rx="16" fill="url(#caseGrad)" stroke="#525a66" strokeWidth="2" />

          {/* Corner Case Screws */}
          {[
            [16, 16],
            [VIEW_W / 2, 12],
            [VIEW_W - 16, 16],
            [16, VIEW_H - 16],
            [VIEW_W / 2, VIEW_H - 12],
            [VIEW_W - 16, VIEW_H - 16],
          ].map(([sx, sy], idx) => (
            <g key={idx} transform={`translate(${sx}, ${sy})`}>
              <circle r="5.5" fill="#94a3b8" stroke="#334155" strokeWidth="1" />
              <line x1="-3.2" y1="0" x2="3.2" y2="0" stroke="#334155" strokeWidth="1.2" />
              <line x1="0" y1="-3.2" x2="0" y2="3.2" stroke="#334155" strokeWidth="1.2" />
            </g>
          ))}

          {/* Green Solder-Mask PCB Panel */}
          <rect
            x="20"
            y="24"
            width={VIEW_W - 40}
            height={VIEW_H - 48}
            rx="6"
            fill="url(#pcbGrad)"
            stroke="#86efac"
            strokeWidth="1.2"
            strokeOpacity="0.55"
          />
          <rect
            x="20"
            y="24"
            width={VIEW_W - 40}
            height={VIEW_H - 48}
            rx="6"
            fill="url(#pcbTraceGrid)"
          />

          {/* Top Hardware Circuit Strip Divider */}
          <line x1="24" y1="126" x2={VIEW_W - 24} y2="126" stroke="#dcfce7" strokeWidth="1.6" strokeOpacity="0.7" />

          {/* Top PCB DIP ICs & Passive Components */}
          <g opacity="0.95">
            {lab.ics.map((ic, idx) => (
              <g key={idx} transform={`translate(${ic.x}, ${ic.y})`}>
                {/* IC Legs */}
                {Array.from({ length: ic.pins }).map((_, p) => {
                  const py = 5 + (p * (ic.h - 10)) / Math.max(1, ic.pins - 1);
                  return (
                    <g key={p}>
                      <rect x="-4" y={py - 1.2} width="4" height="2.4" fill="#cbd5e1" />
                      <rect x={ic.w} y={py - 1.2} width="4" height="2.4" fill="#cbd5e1" />
                    </g>
                  );
                })}
                {/* Black DIP IC Body */}
                <rect
                  width={ic.w}
                  height={ic.h}
                  rx="2"
                  fill="#181b20"
                  stroke="#3f4652"
                  strokeWidth="1"
                />
                {/* Pin-1 Notch */}
                <path
                  d={`M ${ic.w / 2 - 4} 0 A 4 4 0 0 0 ${ic.w / 2 + 4} 0`}
                  fill="#334155"
                />
                {/* Decorative Resistor Bank next to each IC */}
                <g transform={`translate(${ic.w + 10}, 8)`}>
                  {[0, 10, 20, 30].map((ry) => (
                    <g key={ry} transform={`translate(0, ${ry})`}>
                      <line x1="-2" y1="2.5" x2="18" y2="2.5" stroke="#cbd5e1" strokeWidth="1" />
                      <rect x="2" y="0" width="12" height="5" rx="2" fill="#38bdf8" />
                      <rect x="4" y="0" width="1.6" height="5" fill="#92400e" />
                      <rect x="7" y="0" width="1.6" height="5" fill="#ef4444" />
                      <rect x="10" y="0" width="1.6" height="5" fill="#facc15" />
                    </g>
                  ))}
                </g>
                {/* IC Silkscreen Label */}
                <text
                  x={ic.w / 2}
                  y={ic.h + 12}
                  textAnchor="middle"
                  fill="#dcfce7"
                  fontSize="7.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  {ic.label}
                </text>
              </g>
            ))}

            {/* Crystal Oscillator (top-left authentic detail) */}
            <rect x="30" y="42" width="14" height="26" rx="5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />

            {/* Power LED & Power Header (top-right authentic detail) */}
            <g transform="translate(850, 62)">
              <circle r="18" fill="url(#ledGlow)" className="power-led-glow" />
              <circle r="6" fill="#ff4d4d" stroke="#fecaca" strokeWidth="1.2" />
              <circle cx="-1.5" cy="-1.5" r="2" fill="#ffffff" opacity="0.85" />
              <text
                y="18"
                textAnchor="middle"
                fill="#fecaca"
                fontSize="7.5"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                POWER LED
              </text>
            </g>
          </g>

          {/* Silkscreen Block Outlines */}
          {lab.blocks.map((b) => {
            const isSub = b.style === 'subblock';
            const isDashed = b.style === 'dashed';
            const lines = b.title.split('\n');
            let titleY = b.y + 15;
            if (b.titlePos === 'bottom') titleY = b.y + b.h - 8;
            if (b.titlePos === 'center') titleY = b.y + b.h / 2 - ((lines.length - 1) * 11) / 2 + 3;

            return (
              <g key={b.id}>
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={isSub ? 3 : 4}
                  fill={isSub ? '#0e5c34' : 'rgba(10, 58, 33, 0.25)'}
                  stroke="#dcfce7"
                  strokeWidth={isSub ? 1.5 : 1.3}
                  strokeDasharray={isDashed ? '6 4' : undefined}
                  strokeOpacity={isSub ? 0.9 : 0.72}
                />
                {renderBlockIcon(b)}
                {lines.map((line, i) => (
                  <text
                    key={i}
                    x={b.x + b.w / 2}
                    y={titleY + i * 11}
                    textAnchor="middle"
                    fill="#ecfdf5"
                    fontSize={isSub ? '8.5' : '9.5'}
                    fontWeight="700"
                    className="tracking-wide"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          {/* Internal Silkscreen Signal Arrows */}
          {lab.traces.map((tr, i) => (
            <line
              key={i}
              x1={tr.x1}
              y1={tr.y1}
              x2={tr.x2}
              y2={tr.y2}
              stroke="#d1fae5"
              strokeWidth="1.5"
              strokeDasharray={tr.dashed ? '4 3' : undefined}
              markerEnd={tr.arrow ? 'url(#pcbArrow)' : undefined}
              opacity="0.85"
            />
          ))}

          {/* Authentic Yellow "OK TESTED" & "Q.C. PASSED" Stickers (positioned cleanly in top component bay) */}
          {lab.hasOkTested && (
            <g transform="translate(806, 92) rotate(-10)">
              <circle r="13" fill="#fde047" stroke="#ca8a04" strokeWidth="1" />
              <text y="-1.5" textAnchor="middle" fill="#1e293b" fontSize="6" fontWeight="800">
                OK
              </text>
              <text y="5.5" textAnchor="middle" fill="#1e293b" fontSize="5.2" fontWeight="800">
                TESTED
              </text>
            </g>
          )}
          {lab.hasQcBadge && (
            <g transform="translate(850, 108) rotate(3)">
              <rect x="-15" y="-9" width="30" height="18" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.8" />
              <text y="-0.5" textAnchor="middle" fill="#dc2626" fontSize="6.5" fontWeight="800">
                Q.C.
              </text>
              <text y="6.5" textAnchor="middle" fill="#dc2626" fontSize="5.2" fontWeight="700">
                PASSED
              </text>
            </g>
          )}

          {/* Yellow Trainer Kit Model Nameplate (Bottom-Right Signature Badge) */}
          <g transform="translate(640, 484)">
            <rect
              width="250"
              height="44"
              rx="3"
              fill="#facc15"
              stroke="#a16207"
              strokeWidth="1.2"
            />
            <text
              x="125"
              y="17"
              textAnchor="middle"
              fill="#0f172a"
              fontSize="8.5"
              fontWeight="800"
              className="tracking-tight"
            >
              {lab.kitName}
            </text>
            <text
              x="125"
              y="34"
              textAnchor="middle"
              fill="#0f172a"
              fontSize="11"
              fontWeight="900"
              fontFamily="JetBrains Mono, monospace"
            >
              {lab.modelName}
            </text>
          </g>

          {/* Interactive Switches & Knobs */}
          {lab.switches.map(renderSwitch)}
          {lab.knobs.map(renderKnob)}

          {/* Banana Jack Terminals (Ports) */}
          {lab.ports.map((port) => {
            const isSelected = selectedPort === port.id;
            const isHovered = hoveredPort === port.id;
            const isCh1 = ch1Port === port.id;
            const isCh2 = ch2Port === port.id;
            const hasWire = wires.some((w) => w.from === port.id || w.to === port.id);

            const ringStroke =
              port.kind === 'gnd'
                ? '#94a3b8'
                : port.kind === 'output'
                  ? '#fde047'
                  : port.kind === 'test'
                    ? '#c084fc'
                    : '#e2e8f0';

            return (
              <g
                key={port.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredPort(port.id)}
                onMouseLeave={() => setHoveredPort(null)}
                onClick={(e) => handlePortClick(e, port)}
              >
                {renderPortLabel(port)}

                {/* Ground Symbol below GND ports */}
                {port.kind === 'gnd' && (
                  <g stroke="#e2e8f0" strokeWidth="1.2" opacity="0.85">
                    <line x1={port.x} y1={port.y + 11} x2={port.x} y2={port.y + 17} />
                    <line x1={port.x - 6} y1={port.y + 17} x2={port.x + 6} y2={port.y + 17} />
                    <line x1={port.x - 4} y1={port.y + 20} x2={port.x + 4} y2={port.y + 20} />
                    <line x1={port.x - 2} y1={port.y + 23} x2={port.x + 2} y2={port.y + 23} />
                  </g>
                )}

                {/* Hover / Probe Attach Halo */}
                {(isSelected || isHovered || probeAttachMode) && (
                  <circle
                    cx={port.x}
                    cy={port.y}
                    r={isSelected ? 16 : isHovered ? 15 : 13}
                    fill={
                      probeAttachMode === 'CH1'
                        ? 'rgba(250, 204, 21, 0.25)'
                        : probeAttachMode === 'CH2'
                          ? 'rgba(56, 189, 248, 0.25)'
                          : isSelected
                            ? 'rgba(59, 130, 246, 0.35)'
                            : 'rgba(255, 255, 255, 0.16)'
                    }
                    stroke={
                      probeAttachMode === 'CH1'
                        ? '#facc15'
                        : probeAttachMode === 'CH2'
                          ? '#38bdf8'
                          : isSelected
                            ? '#60a5fa'
                            : '#ffffff'
                    }
                    strokeWidth="1.5"
                    strokeDasharray={probeAttachMode && !isHovered ? '3 2' : undefined}
                  />
                )}

                {/* Metallic 2mm Banana Socket */}
                <circle
                  cx={port.x}
                  cy={port.y}
                  r="9.5"
                  fill="#cbd5e1"
                  stroke={ringStroke}
                  strokeWidth="1.8"
                />
                <circle cx={port.x} cy={port.y} r="6.5" fill="#475569" />
                <circle
                  cx={port.x}
                  cy={port.y}
                  r="4"
                  fill={hasWire ? '#2563eb' : '#0f172a'}
                />

                {/* CH1 / CH2 Scope Probe Badges placed opposite port label so they never overlap text */}
                {(() => {
                  const lp = port.labelPos ?? 'top';
                  const baseDx = lp === 'left' ? 23 : lp === 'right' ? -23 : 0;
                  const baseDy = lp === 'top' ? 19 : lp === 'bottom' ? -19 : 0;
                  const both = isCh1 && isCh2;
                  const c1x = port.x + baseDx + (both ? -13 : 0);
                  const c1y = port.y + baseDy;
                  const c2x = port.x + baseDx + (both ? 13 : 0);
                  const c2y = port.y + baseDy;
                  return (
                    <>
                      {isCh1 && (
                        <g transform={`translate(${c1x}, ${c1y})`} pointerEvents="none">
                          <rect x="-12" y="-6.5" width="24" height="13" rx="3" fill="#facc15" stroke="#422006" strokeWidth="1" />
                          <text y="3" textAnchor="middle" fill="#0f172a" fontSize="7.8" fontWeight="900" fontFamily="JetBrains Mono, monospace">
                            CH1
                          </text>
                        </g>
                      )}
                      {isCh2 && (
                        <g transform={`translate(${c2x}, ${c2y})`} pointerEvents="none">
                          <rect x="-12" y="-6.5" width="24" height="13" rx="3" fill="#38bdf8" stroke="#082f49" strokeWidth="1" />
                          <text y="3" textAnchor="middle" fill="#0f172a" fontSize="7.8" fontWeight="900" fontFamily="JetBrains Mono, monospace">
                            CH2
                          </text>
                        </g>
                      )}
                    </>
                  );
                })()}
              </g>
            );
          })}

          {/* Hint / Correct Wiring Ghost Overlay */}
          {showHints && (
            <g pointerEvents="none">
              {hintRules.map((rule, idx) => {
                const p1 = portMap.get(rule.hintFrom);
                const p2 = portMap.get(rule.hintTo);
                if (!p1 || !p2) return null;
                const d = buildWirePath(p1.x, p1.y, p2.x, p2.y, idx + 1);
                const isMissing = missingIds.size === 0 || missingIds.has(rule.id);
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2 + 16;

                return (
                  <g key={rule.id} opacity={isMissing ? 0.95 : 0.35}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isMissing ? '#fbbf24' : '#34d399'}
                      strokeWidth="3.5"
                      strokeDasharray="8 6"
                      className="hint-wire-flow"
                    />
                    <circle
                      cx={midX}
                      cy={midY}
                      r="9"
                      fill={isMissing ? '#f59e0b' : '#10b981'}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                    <text
                      x={midX}
                      y={midY + 3.2}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="9"
                      fontWeight="900"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {idx + 1}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* User-Connected Patch Cords (Realistic Blue Lab Cords with 3D Boots) */}
          <g filter="url(#wireShadow)">
            {wires.map((wire, idx) => {
              const p1 = portMap.get(wire.from);
              const p2 = portMap.get(wire.to);
              if (!p1 || !p2) return null;
              const d = buildWirePath(p1.x, p1.y, p2.x, p2.y, idx);
              const isHovered = hoveredWire === wire.id;
              const isExtra = extraWireIds.has(wire.id);
              const strokeCol = isHovered
                ? '#f87171'
                : isExtra
                  ? '#fb923c'
                  : wire.color;

              return (
                <g
                  key={wire.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredWire(wire.id)}
                  onMouseLeave={() => setHoveredWire(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveWire(wire.id);
                  }}
                >
                  {/* Wide invisible hit target for easy click-to-disconnect */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
                  {/* Dark outer casing */}
                  <path
                    d={d}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                  {/* Main colored flexible PVC wire */}
                  <path
                    d={d}
                    fill="none"
                    stroke={strokeCol}
                    strokeWidth={isHovered ? 5.2 : 4.4}
                    strokeLinecap="round"
                  />
                  {/* Subtle specular highlight along wire */}
                  <path
                    d={d}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    opacity="0.32"
                  />

                  {/* Stackable Banana Plug Boots at both ends */}
                  {[p1, p2].map((pt, endIdx) => (
                    <g key={endIdx} transform={`translate(${pt.x}, ${pt.y})`}>
                      <circle
                        r="7"
                        fill={strokeCol}
                        stroke="#0f172a"
                        strokeWidth="1.5"
                      />
                      <circle r="2.6" fill="#0f172a" />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>

          {/* Live Rubber Wire Preview while Dragging/Connecting */}
          {selectedPortObj && mousePos && (
            <g pointerEvents="none">
              <path
                d={buildWirePath(selectedPortObj.x, selectedPortObj.y, mousePos.x, mousePos.y, 0)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="4"
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
              <circle cx={mousePos.x} cy={mousePos.y} r="5" fill="#60a5fa" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
