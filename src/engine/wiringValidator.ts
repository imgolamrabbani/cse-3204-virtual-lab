import { LabDefinition, WireConnection, WiringCheckResult } from '../types/lab';

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

export function validateLabWiring(
  lab: LabDefinition,
  wires: WireConnection[]
): WiringCheckResult {
  const graph = new NetGraph(lab.id, wires);
  const portMap = new Map(lab.ports.map((p) => [p.id, p]));

  const matched: { ruleId: string; label: string }[] = [];
  const missing: { ruleId: string; label: string; hintFrom: string; hintTo: string }[] = [];

  // Track claimed targets for multi-channel labs (e.g. TDM CH0..CH3 or FDM SUM A/B)
  // so wiring two sources into the SAME input doesn't falsely satisfy both rules.
  const usedTargets = new Set<string>();

  for (const rule of lab.wireRules) {
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

  // Detect extra or invalid wires (wires that don't participate in any rule pair or short to GND)
  const extra: { wireId: string; fromLabel: string; toLabel: string }[] = [];
  for (const w of wires) {
    const pFrom = portMap.get(w.from);
    const pTo = portMap.get(w.to);
    const isShortToGnd = pFrom?.kind === 'gnd' || pTo?.kind === 'gnd';

    const matchesAnyRule = lab.wireRules.some((rule) => {
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
        fromLabel: pFrom?.label ?? w.from,
        toLabel: pTo?.label ?? w.to,
      });
    }
  }

  const totalRules = lab.wireRules.length;
  const scorePercent =
    totalRules === 0 ? 100 : Math.round((matched.length / totalRules) * 100);
  const isComplete = missing.length === 0 && extra.length === 0;

  let summary = '';
  if (isComplete) {
    summary = `Perfect wiring! All ${totalRules} required connections for ${lab.shortTitle} are verified.`;
  } else if (missing.length === 0 && extra.length > 0) {
    summary = `All required paths are wired, but ${extra.length} unexpected or shorted wire(s) were found.`;
  } else {
    summary = `${matched.length} of ${totalRules} required connections matched. ${missing.length} connection(s) still needed.`;
  }

  return {
    isComplete,
    scorePercent,
    matched,
    missing,
    extra,
    summary,
  };
}
