import React from 'react';
import { BookOpen, CheckSquare, X } from 'lucide-react';
import { LabDefinition } from '../types/lab';

interface LabGuideModalProps {
  lab: LabDefinition;
  onClose: () => void;
}

export const LabGuideModal: React.FC<LabGuideModalProps> = ({ lab, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0f172a] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-emerald-400">
                LAB {lab.labNumber} · {lab.modelName}
              </span>
              <h2 className="text-base font-bold text-white">{lab.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5 text-sm leading-relaxed text-slate-300">
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
      </div>
    </div>
  );
};
