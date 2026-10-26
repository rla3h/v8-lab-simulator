import { create } from 'zustand';
import type {
  CheckState,
  CrossoverType,
  EngineDef,
  ExhaustConfig,
  ExteriorPlan,
  ListenerMode,
  Part,
  PartKind,
  RecordingMeta,
  SourceKind,
  ValveMode,
} from './types';
import { engineById } from './data/engines';
import { defaultExterior } from './data/vehicles';
import { GS460_PRESETS, PART_SPECS, makePart, newUid, presetTiger5050, stockExhaustFor } from './data/exhaust';
import type { CoreTelemetry } from './dsp/core';
import type { AnalysisResult } from './analysis/analyze';

export type Tab = 'workspace' | 'drive' | 'engines' | 'ab' | 'analysis' | 'project' | 'legal' | 'report';
export type Side = 'left' | 'right';
export type Selection =
  | { zone: 'part'; side: Side; uid: string }
  | { zone: 'crossover' }
  | { zone: 'front' }
  | { zone: 'tips' }
  | { zone: 'catalyst' };

export interface ProjectData {
  name: string;
  vehicleId: string;
  engineId: string;
  targetEngineId: string;
  roarRefEngineId: string;
  presetId: string | null;
  exhaust: ExhaustConfig;
  snapshot: ExhaustConfig | null;
  /** Share of "AMG-style low rumble" in the tone target, 0..100 (50 = TIGER 50:50). */
  toneBalance: number;
  exterior: ExteriorPlan;
  legal: Record<string, CheckState>;
  legalNotes: Record<string, string>;
  recordings: RecordingMeta[];
}

export interface Controls {
  rpm: number;
  throttle: number;
  valveMode: ValveMode;
  listener: ListenerMode;
  normalize: boolean;
  monitor: 'A' | 'B';
  sourceA: SourceKind;
  sourceB: SourceKind;
  master: number;
  levelAssist: boolean;
  hybridBlend: number;
}

export interface State {
  project: ProjectData;
  controls: Controls;
  tab: Tab;
  selected: Selection | null;
  symmetric: boolean;
  toast: string | null;
  audio: { on: boolean; mode: string | null; error: string | null };
  /** Who drives the audio engine: the lab's A/B sync or the driving game. */
  audioOwner: 'lab' | 'drive';
  telemetry: CoreTelemetry | null;
  analysis: AnalysisResult | null;
  analysisStale: boolean;
  scenario: { id: string | null; loop: boolean; autoAB: boolean; custom: string };
  dirty: boolean;

  set: (patch: Partial<State>) => void;
  setControls: (patch: Partial<Controls>) => void;
  setProject: (patch: Partial<ProjectData>) => void;
  notify: (msg: string) => void;
  applyPreset: (id: string) => void;
  resetToOem: () => void;
  takeSnapshot: () => void;
  editExhaust: (fn: (cfg: ExhaustConfig) => void, label?: string) => void;
  updatePartParam: (side: Side, uid: string, key: string, value: number) => void;
  addPart: (side: Side, kind: PartKind) => void;
  removePart: (side: Side, uid: string) => void;
  movePart: (side: Side, uid: string, dir: -1 | 1) => void;
  setCrossover: (type: CrossoverType) => void;
  copyLeftToRight: () => void;
  loadProject: (p: ProjectData) => void;
}

export const DEFAULT_PROJECT = (): ProjectData => ({
  name: 'GS460 TIGER 50:50',
  vehicleId: 'gs460-s190',
  engineId: '1ur-fse',
  targetEngineId: 'm156',
  roarRefEngineId: '2ur-gse',
  presetId: 'gs460-tiger-5050',
  exhaust: presetTiger5050(),
  snapshot: null,
  toneBalance: 50,
  exterior: defaultExterior(),
  legal: {},
  legalNotes: {},
  recordings: [],
});

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Engine + exhaust that an A/B source refers to. */
export function resolveSource(kind: SourceKind, p: ProjectData): { engine: EngineDef; exhaust: ExhaustConfig; label: string } {
  const eng = engineById(p.engineId);
  switch (kind) {
    case 'oem':
      return { engine: eng, exhaust: stockExhaustFor(eng.stockExhaustId), label: `${eng.application} 순정` };
    case 'design':
      return { engine: eng, exhaust: p.exhaust, label: `튜닝 설계 (${p.exhaust.name})` };
    case 'snapshot':
      return {
        engine: eng,
        exhaust: p.snapshot ?? stockExhaustFor(eng.stockExhaustId),
        label: p.snapshot ? `변경 전 스냅샷 (${p.snapshot.name})` : '스냅샷 없음 → 순정',
      };
    case 'target': {
      const t = engineById(p.targetEngineId);
      return { engine: t, exhaust: stockExhaustFor(t.stockExhaustId), label: `목표: ${t.code} (${t.application})` };
    }
  }
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  oem: '순정 (OEM)',
  design: '튜닝 설계',
  snapshot: '변경 전 스냅샷',
  target: '목표 엔진',
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<State>((set, get) => {
  /** Mutates a cloned exhaust; mirrors edits to the other side when symmetric mode is on. */
  const editExhaust = (fn: (cfg: ExhaustConfig) => void, label?: string) => {
    const s = get();
    const cfg = clone(s.project.exhaust);
    fn(cfg);
    cfg.name = cfg.name.endsWith(' (수정)') || cfg.id === 'custom' ? cfg.name : `${cfg.name} (수정)`;
    cfg.id = 'custom';
    const switchToB = s.controls.monitor === 'A' && s.controls.sourceB === 'design';
    set({
      project: { ...s.project, exhaust: cfg, presetId: null },
      dirty: true,
      analysisStale: true,
      controls: switchToB ? { ...s.controls, monitor: 'B' } : s.controls,
    });
    if (switchToB) get().notify('배기 변경을 들을 수 있도록 B(튜닝)로 전환했습니다.');
    else if (label) get().notify(label);
  };

  const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left');

  return {
    project: DEFAULT_PROJECT(),
    controls: {
      rpm: 650,
      throttle: 0,
      valveMode: 'auto',
      listener: 'exterior',
      normalize: true,
      monitor: 'A',
      sourceA: 'oem',
      sourceB: 'design',
      master: 1,
      levelAssist: true,
      hybridBlend: 0,
    },
    tab: 'workspace',
    selected: null,
    symmetric: true,
    toast: null,
    audio: { on: false, mode: null, error: null },
    audioOwner: 'lab',
    telemetry: null,
    analysis: null,
    analysisStale: true,
    scenario: { id: null, loop: false, autoAB: false, custom: '0:800:0\n2:3000:0.5\n5:6000:1\n6:6000:0\n9:1200:0' },
    dirty: false,

    set: (patch) => set(patch),
    setControls: (patch) => set((s) => ({ controls: { ...s.controls, ...patch } })),
    setProject: (patch) => set((s) => ({ project: { ...s.project, ...patch }, dirty: true })),
    notify: (msg) => {
      set({ toast: msg });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 3200);
    },

    applyPreset: (id) => {
      const p = GS460_PRESETS.find((x) => x.id === id);
      if (!p) return;
      const s = get();
      set({
        project: { ...s.project, exhaust: p.make(), presetId: id },
        selected: null,
        dirty: true,
        analysisStale: true,
        controls: { ...s.controls, monitor: s.controls.sourceB === 'design' ? 'B' : s.controls.monitor },
      });
      get().notify(`프리셋 ${p.make().name} 적용 → B(튜닝)로 청취`);
    },

    resetToOem: () => {
      const s = get();
      const stockId = engineById(s.project.engineId).stockExhaustId;
      set({
        project: { ...s.project, exhaust: stockExhaustFor(stockId), presetId: stockId },
        selected: null,
        dirty: true,
        analysisStale: true,
      });
      get().notify('순정 구성으로 초기화했습니다.');
    },

    takeSnapshot: () => {
      const s = get();
      set({ project: { ...s.project, snapshot: clone(s.project.exhaust) }, dirty: true });
      get().notify('현재 설계를 "변경 전 스냅샷"으로 저장했습니다. A/B에서 스냅샷과 비교할 수 있습니다.');
    },

    editExhaust,

    updatePartParam: (side, uid, key, value) =>
      editExhaust((cfg) => {
        const list = cfg[side];
        const idx = list.findIndex((p) => p.uid === uid);
        if (idx < 0) return;
        list[idx].params[key] = value;
        if (get().symmetric) {
          const mirror = cfg[otherSide(side)][idx];
          if (mirror && mirror.kind === list[idx].kind) mirror.params[key] = value;
        }
      }),

    addPart: (side, kind) => {
      const spec = PART_SPECS[kind];
      editExhaust((cfg) => {
        const apply = (sd: Side) => {
          const list = cfg[sd];
          const part = makePart(kind);
          if (spec.isMuffler) {
            const mi = list.findIndex((p) => PART_SPECS[p.kind].isMuffler);
            if (mi >= 0) list[mi] = part;
            else list.push(part);
          } else {
            // insert before the muffler so the muffler stays last
            const mi = list.findIndex((p) => PART_SPECS[p.kind].isMuffler);
            if (mi >= 0) list.splice(mi, 0, part);
            else list.push(part);
          }
        };
        apply(side);
        if (get().symmetric) apply(otherSide(side));
      }, spec.isMuffler ? `${spec.label}로 교체` : `${spec.label} 추가`);
    },

    removePart: (side, uid) => {
      const s = get();
      const list = s.project.exhaust[side];
      const idx = list.findIndex((p) => p.uid === uid);
      if (idx < 0) return;
      if (PART_SPECS[list[idx].kind].isMuffler) {
        get().notify('머플러는 제거할 수 없습니다. 라이브러리에서 다른 머플러를 선택해 교체하세요.');
        return;
      }
      editExhaust((cfg) => {
        const kind = cfg[side][idx].kind;
        cfg[side].splice(idx, 1);
        if (get().symmetric) {
          const o = cfg[otherSide(side)];
          if (o[idx] && o[idx].kind === kind) o.splice(idx, 1);
        }
      }, '부품 제거');
      set({ selected: null });
    },

    movePart: (side, uid, dir) =>
      editExhaust((cfg) => {
        const mv = (list: Part[], i: number) => {
          const j = i + dir;
          if (j < 0 || j >= list.length) return;
          if (PART_SPECS[list[j].kind].isMuffler || PART_SPECS[list[i].kind].isMuffler) return;
          [list[i], list[j]] = [list[j], list[i]];
        };
        const i = cfg[side].findIndex((p) => p.uid === uid);
        if (i < 0) return;
        mv(cfg[side], i);
        if (get().symmetric) mv(cfg[otherSide(side)], i);
      }),

    setCrossover: (type) =>
      editExhaust((cfg) => {
        cfg.crossover.type = type;
        if (type === 'none') cfg.crossover.coupling = 0;
        else if (cfg.crossover.coupling === 0) cfg.crossover.coupling = type === 'x' ? 0.7 : 0.6;
      }, `크로스오버: ${type === 'none' ? '없음' : type === 'h' ? 'H파이프' : 'X파이프'}`),

    copyLeftToRight: () =>
      editExhaust((cfg) => {
        cfg.right = cfg.left.map((p) => ({ ...clone(p), uid: newUid(p.kind) }));
      }, '좌측 구성을 우측에 복사했습니다.'),

    loadProject: (p) =>
      set({ project: p, selected: null, dirty: false, analysis: null, analysisStale: true }),
  };
});

if (typeof window !== 'undefined') (window as any).__v8store = useStore;
