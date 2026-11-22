import React from 'react';
import { Check } from 'lucide-react';
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
    <aside className="flex w-full shrink-0 flex-col border-b border-[var(--hairline)] bg-[var(--bench-bg)] lg:sticky lg:top-0 lg:h-dvh lg:w-[264px] lg:border-b-0 lg:border-r">
      {/* Course Masthead — quiet Swiss engineering instrument typography */}
      <div className="border-b border-[var(--hairline)] px-5 py-5">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[15px] font-bold tracking-[-0.02em] text-[var(--ink-primary)]">
            CSE 3204 Lab Bench
          </h1>
          <span className="font-mono text-[11px] font-medium text-[var(--ink-tertiary)]">
            RUET
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">
          Data Communication Sessional
        </p>

        {/* Minimalist Hairline Progress Meter */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
            <span className="font-medium text-[var(--ink-secondary)]">
              Verified setups
            </span>
            <span className="font-mono font-semibold tabular-nums text-[var(--ink-primary)]">
              {verifiedCount}/{labs.length}
            </span>
          </div>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--bench-recess)]">
            <div
              className="h-full rounded-full bg-[var(--signal-pass)] transition-[width] duration-300 ease-out"
              style={{ width: `${(verifiedCount / labs.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sequential Lab Experiment Index (01–06) */}
      <nav aria-label="Lab experiments" className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 px-2 text-[11px] font-medium text-[var(--ink-tertiary)]">
          Experiments
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {labs.map((lab) => {
            const isActive = lab.id === activeLabId;
            const isVerified = completedLabs[lab.id];
            const wired = wireCounts[lab.id] ?? 0;

            return (
              <button
                key={lab.id}
                onClick={() => onSelectLab(lab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`btn-tactile relative flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-left cursor-pointer ${
                  isActive
                    ? 'bg-[var(--sheet-surface)] shadow-[0_0_0_1px_rgba(20,23,28,0.12),0_2px_6px_-2px_rgba(20,23,28,0.08)]'
                    : 'hover:bg-[var(--bench-recess)]/75'
                }`}
              >
                {/* Left Cobalt Active Index Bar */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[var(--cord-cobalt)]"
                  />
                )}

                <span
                  className={`mt-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                    isActive ? 'text-[var(--cord-cobalt)]' : 'text-[var(--ink-muted)]'
                  }`}
                >
                  0{lab.labNumber}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={`truncate text-[13px] leading-tight ${
                        isActive
                          ? 'font-semibold text-[var(--ink-primary)]'
                          : 'font-medium text-[var(--ink-secondary)]'
                      }`}
                    >
                      {lab.shortTitle}
                    </span>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {wired > 0 && (
                        <span className="font-mono text-[10px] font-medium tabular-nums text-[var(--cord-cobalt)]">
                          {wired}w
                        </span>
                      )}
                      {isVerified && (
                        <span
                          title="Verified"
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--signal-pass-soft)] text-[var(--signal-pass)]"
                        >
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 font-mono text-[10.5px] text-[var(--ink-tertiary)] truncate">
                    {lab.modelName.replace('MODEL ', '')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Quiet Hardware Bench Note */}
      <div className="hidden border-t border-[var(--hairline)] px-5 py-4 text-[11.5px] leading-relaxed text-[var(--ink-tertiary)] lg:block">
        <p>
          <strong className="font-semibold text-[var(--ink-secondary)]">
            Stackable leads:
          </strong>{' '}
          Plug multiple patch cords or scope probes onto the same banana terminal just like on the physical TCM kits.
        </p>
      </div>
    </aside>
  );
};
