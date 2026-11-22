import React from 'react';
import { CheckCircle2, Cpu, Radio, Waves } from 'lucide-react';
import { LabDefinition, LabId } from '../types/lab';

interface SidebarProps {
  labs: LabDefinition[];
  activeLabId: LabId;
  completedLabs: Record<LabId, boolean>;
  wireCounts: Record<LabId, number>;
  onSelectLab: (id: LabId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  labs,
  activeLabId,
  completedLabs,
  wireCounts,
  onSelectLab,
}) => {
  const verifiedCount = labs.filter((l) => completedLabs[l.id]).length;

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-800 bg-[#0d1420] lg:w-72 lg:border-b-0 lg:border-r">
      {/* Course Brand Header */}
      <div className="border-b border-slate-800/90 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Waves className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white">
              CSE 3204 Virtual Lab
            </h1>
            <p className="text-[11px] text-slate-400">
              Data Communication Sessional · RUET
            </p>
          </div>
        </div>

        {/* Practice Progress Bar */}
        <div className="mt-3.5">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-400">Practice Progress</span>
            <span className="font-mono font-semibold text-emerald-400">
              {verifiedCount} / {labs.length} Verified
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              style={{ width: `${(verifiedCount / labs.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 6 Experiments List */}
      <nav className="flex-1 overflow-y-auto p-2.5">
        <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Lab Experiments (1–6)
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
          {labs.map((lab) => {
            const isActive = lab.id === activeLabId;
            const isVerified = completedLabs[lab.id];
            const wired = wireCounts[lab.id] ?? 0;

            return (
              <button
                key={lab.id}
                onClick={() => onSelectLab(lab.id)}
                className={`group flex w-full flex-col rounded-lg border p-2.5 text-left transition cursor-pointer ${
                  isActive
                    ? 'border-emerald-500/60 bg-emerald-500/10 shadow-sm'
                    : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    LAB {lab.labNumber}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {wired > 0 && (
                      <span className="font-mono text-[10px] text-blue-300">
                        {wired}w
                      </span>
                    )}
                    {isVerified ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-700 group-hover:bg-slate-500" />
                    )}
                  </div>
                </div>

                <div
                  className={`mt-1.5 text-xs font-semibold leading-snug ${
                    isActive ? 'text-white' : 'text-slate-200'
                  }`}
                >
                  {lab.shortTitle}
                </div>

                <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-slate-400">
                  <Cpu className="h-3 w-3 shrink-0 text-slate-500" />
                  <span className="truncate">{lab.modelName}</span>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer Hardware Tip */}
      <div className="hidden border-t border-slate-800/90 p-3.5 text-[11px] text-slate-400 lg:block">
        <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <Radio className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="leading-relaxed">
            <strong className="text-slate-200">Bench Tip:</strong> Banana plugs are stackable—connect multiple patch cords or scope probes to the same terminal just like on the real TCM trainer kits.
          </p>
        </div>
      </div>
    </aside>
  );
};
