export type LabId = 'am' | 'fm' | 'pam' | 'fdm' | 'tdm' | 'linecoding';

export type PortKind = 'output' | 'input' | 'gnd' | 'test';

export interface PortDef {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  labelPos?: 'top' | 'bottom' | 'left' | 'right';
  kind: PortKind;
  blockId: string;
  description: string;
}

export interface BlockDef {
  id: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style?: 'solid' | 'dashed' | 'subblock' | 'panel';
  icon?: 'opamp' | 'lpf' | 'amp';
  titlePos?: 'top' | 'center' | 'bottom' | 'vertical';
}

export interface KnobDef {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  min: number;
  max: number;
  defaultValue: number;
  step: number;
  unit: string;
  color: 'blue' | 'red';
  size?: 'sm' | 'md';
}

export interface SwitchDef {
  id: string;
  label: string;
  x: number;
  y: number;
  type: 'dip-select' | 'jumper' | 'bit8' | 'mode-select';
  options?: string[];
  defaultValue: string;
}

export interface InternalTrace {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  arrow?: boolean;
  dashed?: boolean;
}

export interface DecorativeIC {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  pins: number;
}

export interface WireRule {
  id: string;
  /** Port ID (or any of these equivalent port IDs) on one end */
  from: string | string[];
  /** Port ID (or any of these equivalent port IDs) on the other end */
  to: string | string[];
  /** Human-readable instruction for this connection */
  label: string;
  /** Canonical hint wire endpoints used when displaying or auto-applying hints */
  hintFrom: string;
  hintTo: string;
}

export interface ProbePreset {
  id: string;
  label: string;
  ch1: string;
  ch2: string | null;
  timebaseUs: number;
  ch1Vdiv: number;
  ch2Vdiv: number;
  description: string;
}

export interface LabDefinition {
  id: LabId;
  labNumber: number;
  shortTitle: string;
  title: string;
  modelName: string;
  kitName: string;
  objective: string;
  theory: string[];
  procedureSteps: string[];
  hasQcBadge?: boolean;
  hasOkTested?: boolean;
  ics: DecorativeIC[];
  blocks: BlockDef[];
  traces: InternalTrace[];
  ports: PortDef[];
  knobs: KnobDef[];
  switches: SwitchDef[];
  wireRules: WireRule[];
  probePresets: ProbePreset[];
  defaultCh1Port: string;
  defaultCh2Port: string | null;
  defaultTimebaseUs: number;
  defaultCh1Vdiv: number;
  defaultCh2Vdiv: number;
}

export interface WireConnection {
  id: string;
  from: string;
  to: string;
  color: string;
}

export interface WiringCheckResult {
  isComplete: boolean;
  scorePercent: number;
  matched: { ruleId: string; label: string }[];
  missing: { ruleId: string; label: string; hintFrom: string; hintTo: string }[];
  extra: { wireId: string; fromLabel: string; toLabel: string }[];
  summary: string;
}

export interface ChannelSampleInfo {
  portId: string | null;
  portLabel: string;
  signalName: string;
  isConnected: boolean;
  vpp: number;
  freqHz: number;
  isDigital?: boolean;
  warning?: string;
  /** Evaluate voltage in Volts at time t (seconds) */
  sample: (t: number) => number;
}

export interface WireFlowStep {
  step: number;
  connection: string;
  title: string;
  why: string;
  whatHappens: string;
  ifMissing: string;
}

export interface ScopeObserveStage {
  stage: string;
  ch1: string;
  ch2: string;
  whatYouSee: string;
}

export interface BanglaManual {
  titleBn: string;
  fullObjective: string;
  bigPicture: string;
  signalFlowSteps: string[];
  theoryBn: string[];
  wireFlow: WireFlowStep[];
  scopeGuide: ScopeObserveStage[];
  vivaTips: string[];
}

export interface ScopeState {
  ch1Port: string | null;
  ch2Port: string | null;
  ch1Enabled: boolean;
  ch2Enabled: boolean;
  ch1Vdiv: number;
  ch2Vdiv: number;
  ch1OffsetDiv: number;
  ch2OffsetDiv: number;
  ch1Coupling: 'DC' | 'AC';
  ch2Coupling: 'DC' | 'AC';
  timebaseUs: number;
  running: boolean;
  triggerSource: 'CH1' | 'CH2';
  triggerLevelV: number;
}
