import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Cable,
  CheckSquare,
  GraduationCap,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { LabDefinition } from '../types/lab';
import { BANGLA_MANUALS } from '../data/banglaManuals';
import { benchAudio } from '../utils/benchAudio';

interface LabGuideModalProps {
  lab: LabDefinition;
  onClose: () => void;
}

export const LabGuideModal: React.FC<LabGuideModalProps> = ({ lab, onClose }) => {
  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const bn = BANGLA_MANUALS[lab.id];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'bn' ? bn.titleBn : lab.title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.965 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.975 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--hairline-strong)] bg-[var(--sheet-surface)] text-[var(--ink-primary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Archival Datasheet Masthead */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--bench-recess)] px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium text-[var(--ink-tertiary)]">
              <span>Lab 0{lab.labNumber}</span>
              <span aria-hidden="true">/</span>
              <span className="text-[var(--ink-secondary)]">{lab.modelName}</span>
            </div>
            <h2 className="font-bn mt-0.5 text-base font-bold tracking-[-0.015em] text-[var(--ink-primary)] sm:text-lg">
              {lang === 'bn' ? bn.titleBn : lab.title}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {/* Tactile Segmented Language Switcher with Spring Glide */}
            <div className="relative inline-flex rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--chassis-well)] p-0.5 text-xs font-semibold">
              {(['bn', 'en'] as const).map((code) => {
                const active = lang === code;
                return (
                  <button
                    key={code}
                    onClick={() => {
                      benchAudio.click();
                      setLang(code);
                    }}
                    className={`relative z-10 rounded-[4px] px-3 py-1 transition-colors cursor-pointer ${
                      code === 'bn' ? 'font-bn' : ''
                    } ${
                      active
                        ? 'text-[var(--ink-primary)]'
                        : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="manual-lang-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        className="absolute inset-0 -z-10 rounded-[4px] bg-[var(--sheet-surface)] shadow-xs ring-1 ring-[var(--hairline)]"
                      />
                    )}
                    {code === 'bn' ? 'বাংলা' : 'English'}
                  </button>
                );
              })}
            </div>

            <button
              onClick={onClose}
              aria-label="Close manual"
              className="hw-key flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--hairline-strong)] bg-[var(--sheet-surface)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Readable Technical Sheet Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {lang === 'bn' ? (
            <div className="font-bn space-y-7 text-[14.5px] leading-[1.7] text-[var(--ink-secondary)]">
              {/* 1. Full Objective & Big Picture */}
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bench-recess)]/55 p-4">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                    <BookOpen className="h-4 w-4 text-[var(--cord-cobalt)]" />
                    ১. এক্সপেরিমেন্টের পূর্ণ উদ্দেশ্য (Full Objective)
                  </h3>
                  <p className="text-[var(--ink-secondary)]">{bn.fullObjective}</p>
                </div>

                <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bench-recess)]/55 p-4">
                  <h3 className="mb-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                    সহজ ভাষায় পুরো ব্যাপারটা কী?
                  </h3>
                  <p className="text-[var(--ink-secondary)]">{bn.bigPicture}</p>
                </div>
              </section>

              {/* 2. End-to-End Signal Flow */}
              <section>
                <h3 className="mb-2.5 text-[13px] font-bold text-[var(--ink-primary)]">
                  ২. সম্পূর্ণ সিগন্যাল ফ্লো (ব্লক থেকে ব্লক)
                </h3>
                <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bench-recess)]/65 p-3.5">
                  {bn.signalFlowSteps.map((node, idx) => (
                    <React.Fragment key={idx}>
                      <span className="rounded-[var(--radius-sm)] border border-[var(--hairline-strong)] bg-[var(--sheet-surface)] px-2.5 py-1 font-mono text-[11.5px] font-semibold text-[var(--ink-primary)]">
                        {node}
                      </span>
                      {idx < bn.signalFlowSteps.length - 1 && (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--cord-cobalt)]" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </section>

              {/* 3. Wire-by-Wire Complete Flow Breakdown */}
              <section>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                    <Cable className="h-4 w-4 text-[var(--cord-cobalt)]" />
                    ৩. প্রতিটি তারের সম্পূর্ণ ফ্লো — কেন ঢুকাচ্ছি ও ঢুকালে কী হচ্ছে?
                  </h3>
                  <span className="font-mono text-[11px] font-medium tabular-nums text-[var(--ink-tertiary)]">
                    মোট {bn.wireFlow.length} ধাপ
                  </span>
                </div>

                <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--sheet-surface)]">
                  {bn.wireFlow.map((w) => (
                    <div key={w.step} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink-primary)] font-mono text-[11px] font-bold tabular-nums text-[var(--sheet-surface)]">
                            {w.step}
                          </span>
                          <span className="font-bold text-[var(--ink-primary)]">
                            {w.title}
                          </span>
                        </div>
                        <span className="rounded-[var(--radius-sm)] border border-[var(--cord-cobalt)]/25 bg-[var(--cord-cobalt-soft)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--cord-cobalt)]">
                          {w.connection}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 text-[13.5px]">
                        <div className="border-l-2 border-[var(--cord-cobalt)]/50 pl-3">
                          <div className="mb-0.5 text-[11.5px] font-bold text-[var(--cord-cobalt)]">
                            কেন এই তার ঢুকাচ্ছি?
                          </div>
                          <p className="text-[var(--ink-secondary)]">{w.why}</p>
                        </div>

                        <div className="border-l-2 border-[var(--signal-pass)]/55 pl-3">
                          <div className="mb-0.5 text-[11.5px] font-bold text-[var(--signal-pass)]">
                            ঢুকালে ভেতরে কী হচ্ছে?
                          </div>
                          <p className="text-[var(--ink-secondary)]">{w.whatHappens}</p>
                        </div>

                        <div className="border-l-2 border-[var(--signal-fault)]/50 pl-3">
                          <div className="mb-0.5 flex items-center gap-1 text-[11.5px] font-bold text-[var(--signal-fault)]">
                            <AlertCircle className="h-3.5 w-3.5" />
                            না ঢুকালে কী হবে?
                          </div>
                          <p className="text-[var(--ink-secondary)]">{w.ifMissing}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 4. Core Theory */}
              <section>
                <h3 className="mb-2 text-[13px] font-bold text-[var(--ink-primary)]">
                  ৪. মূল তত্ত্ব (Theory)
                </h3>
                <ul className="space-y-2 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bench-recess)]/50 p-4 text-[14px]">
                  {bn.theoryBn.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink-tertiary)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 5. Oscilloscope Observation Guide */}
              <section>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                  <Activity className="h-4 w-4 text-[var(--probe-ch1)]" />
                  ৫. অসিলোস্কোপে কী দেখবে (Observation Guide)
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {bn.scopeGuide.map((obs, i) => (
                    <div
                      key={i}
                      className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bench-recess)]/55 p-3.5 text-[13.5px]"
                    >
                      <div className="font-bold text-[var(--ink-primary)]">
                        {obs.stage}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10.5px]">
                        <span className="rounded bg-[var(--probe-ch1-soft)] px-1.5 py-0.5 font-semibold text-[var(--probe-ch1-ink)]">
                          CH1: {obs.ch1}
                        </span>
                        <span className="rounded bg-[var(--probe-ch2-soft)] px-1.5 py-0.5 font-semibold text-[var(--probe-ch2-ink)]">
                          CH2: {obs.ch2}
                        </span>
                      </div>
                      <p className="mt-2 text-[var(--ink-secondary)]">{obs.whatYouSee}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 6. Viva Notes */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                  <GraduationCap className="h-4 w-4 text-[var(--cord-cobalt)]" />
                  ৬. ভাইভা ও ল্যাব ফাইনাল কুইক নোটস
                </h3>
                <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bench-recess)]/70 p-4 text-[14px]">
                  {bn.vivaTips.map((tip, i) => (
                    <p key={i} className="text-[var(--ink-primary)]">
                      {i + 1}. {tip}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            /* English Reference Tab */
            <div className="space-y-6 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
              <section>
                <h3 className="mb-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                  1. Objective
                </h3>
                <p className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--bench-recess)]/55 p-3.5">
                  {lab.objective}
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                  2. Key Theory
                </h3>
                <ul className="list-disc space-y-1.5 pl-5">
                  {lab.theory.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-bold text-[var(--ink-primary)]">
                  3. Experimental Wiring &amp; Observation Procedure
                </h3>
                <ol className="space-y-2">
                  {lab.procedureSteps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--bench-recess)]/50 p-3 text-[13px]"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ink-primary)] font-mono text-[10.5px] font-bold tabular-nums text-[var(--sheet-surface)]">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[var(--ink-primary)]">
                  <CheckSquare className="h-4 w-4 text-[var(--cord-cobalt)]" />
                  Required Patch Cord Checklist ({lab.wireRules.length} wires)
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {lab.wireRules.map((rule, idx) => (
                    <div
                      key={rule.id}
                      className="rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--bench-recess)]/65 px-3 py-2 font-mono text-[11.5px] text-[var(--ink-primary)]"
                    >
                      <span className="mr-2 font-bold text-[var(--cord-cobalt)]">
                        {idx + 1}.
                      </span>
                      {rule.label}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
