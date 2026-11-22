import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Cable,
  CheckSquare,
  GraduationCap,
  Lightbulb,
  Sparkles,
  X,
} from 'lucide-react';
import { LabDefinition } from '../types/lab';
import { BANGLA_MANUALS } from '../data/banglaManuals';

interface LabGuideModalProps {
  lab: LabDefinition;
  onClose: () => void;
}

export const LabGuideModal: React.FC<LabGuideModalProps> = ({ lab, onClose }) => {
  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const bn = BANGLA_MANUALS[lab.id];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1524] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#101a2d] px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-400">
                  LAB {lab.labNumber} · {lab.modelName}
                </span>
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                  CSE 3204 Manual
                </span>
              </div>
              <h2 className="font-bn mt-0.5 truncate text-base font-bold text-white">
                {lang === 'bn' ? bn.titleBn : lab.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Language Switcher: Bangla Default | English */}
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setLang('bn')}
                className={`font-bn rounded-md px-2.5 py-1 transition cursor-pointer ${
                  lang === 'bn'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                বাংলা
              </button>
              <button
                onClick={() => setLang('en')}
                className={`rounded-md px-2.5 py-1 transition cursor-pointer ${
                  lang === 'en'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                English
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              aria-label="Close manual"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {lang === 'bn' ? (
            <div className="font-bn space-y-6 text-[14px] leading-relaxed text-slate-200">
              {/* 1. Full Objective & Big Picture */}
              <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-emerald-400 uppercase">
                    <Sparkles className="h-4 w-4" />
                    ১. এক্সপেরিমেন্টের পূর্ণ উদ্দেশ্য (Full Objective)
                  </h3>
                  <p className="text-slate-200">{bn.fullObjective}</p>
                </div>

                <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-4">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-sky-300 uppercase">
                    <Lightbulb className="h-4 w-4" />
                    সহজ ভাষায় পুরো ব্যাপারটা কী?
                  </h3>
                  <p className="text-slate-200">{bn.bigPicture}</p>
                </div>
              </section>

              {/* 2. End-to-End Signal Flow Diagram */}
              <section>
                <h3 className="mb-2.5 text-xs font-bold tracking-wide text-amber-400 uppercase">
                  ২. সম্পূর্ণ সিগন্যাল ফ্লো (ব্লক থেকে ব্লক)
                </h3>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                  {bn.signalFlowSteps.map((node, idx) => (
                    <React.Fragment key={idx}>
                      <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 font-mono text-xs font-semibold text-emerald-200">
                        {node}
                      </span>
                      {idx < bn.signalFlowSteps.length - 1 && (
                        <ArrowRight className="h-4 w-4 shrink-0 text-amber-400" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </section>

              {/* 3. Wire-by-Wire Complete Flow Explanation */}
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-emerald-400 uppercase">
                    <Cable className="h-4 w-4" />
                    ৩. প্রতিটি তারের সম্পূর্ণ ফ্লো — কেন ঢুকাচ্ছি ও ঢুকালে কী হচ্ছে?
                  </h3>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                    মোট {bn.wireFlow.length} ধাপ
                  </span>
                </div>

                <div className="space-y-3">
                  {bn.wireFlow.map((w) => (
                    <div
                      key={w.step}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 font-mono text-xs font-black text-slate-950">
                            {w.step}
                          </span>
                          <span className="font-bold text-white">{w.title}</span>
                        </div>
                        <span className="rounded-md border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-blue-200">
                          {w.connection}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3 text-[13px]">
                        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-2.5">
                          <div className="mb-1 text-[11px] font-bold text-sky-300">
                            কেন এই তার ঢুকাচ্ছি?
                          </div>
                          <p className="text-slate-300">{w.why}</p>
                        </div>

                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-2.5">
                          <div className="mb-1 text-[11px] font-bold text-emerald-300">
                            ঢুকালে ভেতরে কী হচ্ছে?
                          </div>
                          <p className="text-slate-300">{w.whatHappens}</p>
                        </div>

                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.05] p-2.5">
                          <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-rose-300">
                            <AlertCircle className="h-3.5 w-3.5" />
                            না ঢুকালে কী হবে?
                          </div>
                          <p className="text-slate-300">{w.ifMissing}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 4. Core Theory */}
              <section>
                <h3 className="mb-2 text-xs font-bold tracking-wide text-emerald-400 uppercase">
                  ৪. মূল তত্ত্ব (Theory)
                </h3>
                <ul className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  {bn.theoryBn.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-slate-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 5. Oscilloscope Observation Guide */}
              <section>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-yellow-400 uppercase">
                  <Activity className="h-4 w-4" />
                  ৫. অসিলোস্কোপে কী দেখবে (Observation Guide)
                </h3>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  {bn.scopeGuide.map((obs, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[13px]"
                    >
                      <div className="font-bold text-white">{obs.stage}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10.5px]">
                        <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-300">
                          CH1: {obs.ch1}
                        </span>
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-300">
                          CH2: {obs.ch2}
                        </span>
                      </div>
                      <p className="mt-2 text-slate-300">{obs.whatYouSee}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 6. Viva & Lab Final Tips */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-purple-300 uppercase">
                  <GraduationCap className="h-4 w-4" />
                  ৬. ভাইভা ও ল্যাব ফাইনাল কুইক নোটস
                </h3>
                <div className="space-y-2 rounded-xl border border-purple-500/30 bg-purple-500/[0.06] p-4 text-[13.5px]">
                  {bn.vivaTips.map((tip, i) => (
                    <p key={i} className="text-slate-200">
                      • {tip}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            /* English Reference Tab */
            <div className="space-y-5 text-sm leading-relaxed text-slate-300">
              <section>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  1. Objective
                </h3>
                <p className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  {lab.objective}
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  2. Key Theory
                </h3>
                <ul className="list-disc space-y-1.5 pl-5 text-slate-300">
                  {lab.theory.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  3. Experimental Wiring &amp; Observation Procedure
                </h3>
                <ol className="space-y-2">
                  {lab.procedureSteps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg border border-slate-800/80 bg-slate-900/50 p-2.5 text-xs"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-[11px] font-bold text-emerald-300">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <CheckSquare className="h-3.5 w-3.5" />
                  Required Patch Cord Checklist ({lab.wireRules.length} wires)
                </h3>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {lab.wireRules.map((rule, idx) => (
                    <div
                      key={rule.id}
                      className="rounded-md border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 font-mono text-[11px] text-slate-200"
                    >
                      <span className="mr-1.5 text-amber-400">{idx + 1}.</span>
                      {rule.label}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
