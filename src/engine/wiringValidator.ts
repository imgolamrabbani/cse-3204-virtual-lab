import { LabDefinition, WireConnection, WireRule, WiringCheckResult } from '../types/lab';

/**
 * Ports that are internally bridged on the physical PCB (dual banana jacks for the same node).
 */
const INTERNAL_BRIDGES: Record<string, [string, string][]> = {
  fdm: [
    ['carr_100a', 'carr_100b'],
    ['carr_200a', 'carr_200b'],
    ['sum_out_1', 'sum_out_2'],
  ],
  linecoding: [['lc_clk_a', 'lc_clk_b']],
};

export class NetGraph {
  private parent = new Map<string, string>();

  constructor(labId: string, wires: WireConnection[]) {
    const bridges = INTERNAL_BRIDGES[labId] ?? [];
    for (const [a, b] of bridges) {
      this.union(a, b);
    }
    for (const w of wires) {
      this.union(w.from, w.to);
    }
  }

  private find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  private union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  public isConnected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  public isAnyConnected(fromList: string[], toList: string[]): boolean {
    for (const f of fromList) {
      for (const t of toList) {
        if (this.isConnected(f, t)) return true;
      }
    }
    return false;
  }
}

function asArray(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

function evaluateRuleSet(
  lab: LabDefinition,
  wires: WireConnection[],
  rules: WireRule[],
  modeId?: string,
  modeLabel?: string
): WiringCheckResult {
  const graph = new NetGraph(lab.id, wires);
  const portMap = new Map(lab.ports.map((p) => [p.id, p]));
  const blockMap = new Map(lab.blocks.map((b) => [b.id, b.title.replace(/\n/g, ' ')]));

  const formatPortName = (pid: string) => {
    const p = portMap.get(pid);
    if (!p) return pid;
    if (p.label === 'INPUT' || p.label === 'OUTPUT' || p.label === 'IN' || p.label === 'OUT') {
      const bTitle = blockMap.get(p.blockId);
      if (bTitle) {
        const shortBlock = bTitle
          .replace(/ MODULATION BLOCK/i, '')
          .replace(/ BLOCK/i, '')
          .trim();
        return `${shortBlock} ${p.label}`;
      }
    }
    return p.label;
  };

  const matched: { ruleId: string; label: string }[] = [];
  const missing: { ruleId: string; label: string; hintFrom: string; hintTo: string }[] = [];

  const usedTargets = new Set<string>();

  for (const rule of rules) {
    const froms = asArray(rule.from);
    const tos = asArray(rule.to);

    let satisfiedTarget: string | null = null;
    for (const f of froms) {
      for (const t of tos) {
        if (usedTargets.has(t) && tos.length > 1) continue;
        if (graph.isConnected(f, t)) {
          satisfiedTarget = t;
          break;
        }
      }
      if (satisfiedTarget) break;
    }

    if (satisfiedTarget) {
      usedTargets.add(satisfiedTarget);
      matched.push({ ruleId: rule.id, label: rule.label });
    } else {
      missing.push({
        ruleId: rule.id,
        label: rule.label,
        hintFrom: rule.hintFrom,
        hintTo: rule.hintTo,
      });
    }
  }

  const extra: { wireId: string; fromLabel: string; toLabel: string }[] = [];
  for (const w of wires) {
    const pFrom = portMap.get(w.from);
    const pTo = portMap.get(w.to);
    const isShortToGnd = pFrom?.kind === 'gnd' || pTo?.kind === 'gnd';

    const matchesAnyRule = rules.some((rule) => {
      const fs = asArray(rule.from);
      const ts = asArray(rule.to);
      return (
        (fs.includes(w.from) && ts.includes(w.to)) ||
        (fs.includes(w.to) && ts.includes(w.from))
      );
    });

    if (isShortToGnd || !matchesAnyRule) {
      extra.push({
        wireId: w.id,
        fromLabel: formatPortName(w.from),
        toLabel: formatPortName(w.to),
      });
    }
  }

  const totalRules = rules.length;
  const scorePercent =
    totalRules === 0 ? 100 : Math.round((matched.length / totalRules) * 100);
  const isComplete = missing.length === 0 && extra.length === 0;
  const titleTag = modeLabel ? `${modeLabel}` : lab.shortTitle;

  let summary = '';
  if (isComplete) {
    summary = `Perfect wiring! All ${totalRules} required connections for ${titleTag} are verified.`;
  } else if (missing.length === 0 && extra.length > 0) {
    summary = `All required ${titleTag} paths are wired, but ${extra.length} unexpected or shorted wire(s) were found.`;
  } else {
    summary = `${matched.length} of ${totalRules} required connections matched (${titleTag}). ${missing.length} connection(s) still needed.`;
  }

  return {
    isComplete,
    scorePercent,
    detectedModeId: modeId,
    detectedModeLabel: modeLabel,
    matched,
    missing,
    extra,
    summary,
  };
}

export function validateLabWiring(
  lab: LabDefinition,
  wires: WireConnection[],
  preferredSubModeId?: string
): WiringCheckResult {
  if (!lab.subModes || lab.subModes.length === 0) {
    return evaluateRuleSet(lab, wires, lab.wireRules);
  }

  // Evaluate all sub-modes (e.g., PAM, PWM, PPM on TCM 001-02)
  const results = lab.subModes.map((mode) =>
    evaluateRuleSet(lab, wires, mode.wireRules, mode.id, mode.label)
  );

  // If ANY mode is 100% complete (even if user didn't click its pill first), return it immediately!
  const completeMatch = results.find((r) => r.isComplete);
  if (completeMatch) return completeMatch;

  // Otherwise pick whichever mode best matches the user's actual wires (highest matched, fewest extras),
  // breaking ties in favor of the currently selected sub-mode.
  if (wires.length > 0) {
    const sorted = [...results].sort((a, b) => {
      const scoreA = a.matched.length * 10 - a.extra.length * 5 + (a.detectedModeId === preferredSubModeId ? 1 : 0);
      const scoreB = b.matched.length * 10 - b.extra.length * 5 + (b.detectedModeId === preferredSubModeId ? 1 : 0);
      return scoreB - scoreA;
    });
    return sorted[0];
  }

  return (
    results.find((r) => r.detectedModeId === preferredSubModeId) ?? results[0]
  );
}
