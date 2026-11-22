import React from 'react';
import { Check, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import { LabDefinition, LabId } from '../types/lab';

interface SidebarProps {
  labs: LabDefinition[];
  activeLabId: LabId;
  completedLabs: Record<LabId, boolean>;
  wireCounts: Record<LabId, number>;
  theme: 'day' | 'night';
  soundEnabled: boolean;
  onSelectLab: (id: LabId) => void;
  onToggleTheme: (next: 'day' | 'night') => void;
  onToggleSound: () => void;
}

const SPRING_GLIDE = { type: 'spring' as const, stiffness: 460, damping: 36 };

export const Sidebar: React.FC<SidebarProps> = ({
  labs,
  activeLabId,
  completedLabs,
  wireCounts,
  theme,
  soundEnabled,
  onSelectLab,
  onToggleTheme,
  onToggleSound,
}) => {
  const verifiedCount = labs.filter((l) => completedLabs[l.id]).length;
  const progressRatio = labs.length > 0 ? verifiedCount / labs.length : 0;

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-[var(--hairline)] bg-[var(--bench-bg)] lg:sticky lg:top-0 lg:h-dvh lg:w-[270px] lg:border-b-0 lg:border-r">
      {/* Course Masthead + Tactile Bench Lighting / Sound Controls */}
      <div className="border-b border-[var(--hairline)] px-5 py-4">
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

        {/* Day / Night Bench Rocker & Tactile Audio Toggle */}
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <div
            role="radiogroup"
            aria-label="Bench lighting mode"
            className="relative inline-flex flex-1 rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--bench-recess)] p-0.5"
          >
            {(['day', 'night'] as const).map((mode) => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onToggleTheme(mode)}
                  className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 py-1 text-[11.5px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'text-[var(--ink-primary)]'
                      : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="theme-pill"
                      transition={SPRING_GLIDE}
                      className="absolute inset-0 -z-10 rounded-[4px] bg-[var(--sheet-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.14)] ring-1 ring-[var(--hairline)]"
                    />
                  )}
                  {mode === 'day' ? (
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-sky-400" />
                  )}
                  <span>{mode === 'day' ? 'Day' : 'Night'}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Mute bench audio feedback' : 'Enable bench audio feedback'}
            title={soundEnabled ? 'Bench sound: ON' : 'Bench sound: OFF'}
            className={`hw-key flex h-[30px] items-center gap-1 rounded-[var(--radius-sm)] border px-2 text-[11px] font-semibold cursor-pointer ${
              soundEnabled
                ? 'border-[var(--hairline-strong)] bg-[var(--sheet-surface)] text-[var(--ink-primary)]'
                : 'border-[var(--hairline)] bg-[var(--bench-recess)] text-[var(--ink-tertiary)]'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5 text-[var(--cord-cobalt)]" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* GPU-Composited Verified Progress Bar */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
            <span className="font-medium text-[var(--ink-secondary)]">
              Verified setups
            </span>
            <span className="font-mono font-semibold tabular-nums text-[var(--ink-primary)]">
              {verifiedCount}/{labs.length}
            </span>
          </div>
          <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--bench-recess)]">
            <motion.div
              className="h-full w-full origin-left rounded-full bg-[var(--signal-pass)]"
              initial={false}
              animate={{ scaleX: progressRatio }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            />
          </div>
        </div>
      </div>

      {/* Sequential Lab Experiment Index (01–06) with Spring-Gliding Active Frame */}
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
                    ? ''
                    : 'hover:bg-[var(--bench-recess)]/75'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-lab-card"
                    transition={SPRING_GLIDE}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[var(--radius-sm)] bg-[var(--sheet-surface)] shadow-[0_0_0_1px_var(--hairline),0_3px_8px_-3px_rgba(0,0,0,0.16)]"
                  />
                )}

                {isActive && (
                  <motion.span
                    layoutId="active-lab-bar"
                    transition={SPRING_GLIDE}
                    aria-hidden="true"
                    className="absolute left-0 top-2 bottom-2 z-10 w-[3px] rounded-r-full bg-[var(--cord-cobalt)]"
                  />
                )}

                <span
                  className={`relative z-10 mt-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                    isActive ? 'text-[var(--cord-cobalt)]' : 'text-[var(--ink-muted)]'
                  }`}
                >
                  0{lab.labNumber}
                </span>

                <div className="relative z-10 min-w-0 flex-1">
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

                  <div className="mt-1 truncate font-mono text-[10.5px] text-[var(--ink-tertiary)]">
                    {lab.modelName.replace('MODEL ', '')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Quiet Hardware Bench Note */}
      <div className="hidden border-t border-[var(--hairline)] px-5 py-3.5 text-[11.5px] leading-relaxed text-[var(--ink-tertiary)] lg:block">
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
