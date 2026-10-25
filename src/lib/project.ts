import type { ProjectData, Controls } from '../store';
import type { AnalysisResult } from '../analysis/analyze';
import { ENGINES, engineById } from '../data/engines';
import { validateExhaust } from '../data/exhaust';
import { defaultExterior } from '../data/vehicles';
import { MODEL_VERSION } from '../dsp/compile';

export const SCHEMA = 'v8lab.project';
export const SCHEMA_VERSION = 1;
const LS_KEY = 'v8lab.projects.v1';

export interface AnalysisSummary {
  createdAt: string;
  modelVersion: string;
  throttle: number;
  labels: AnalysisResult['labels'];
  boom: { level: string; maxDelta: number; maxProm: number; band: [number, number] };
  targetScore: { A: number; B: number; weightRumble: number };
}

export interface ProjectFile {
  schema: typeof SCHEMA;
  schemaVersion: number;
  modelVersion: string;
  savedAt: string;
  project: ProjectData;
  controls: Pick<Controls, 'valveMode' | 'listener' | 'normalize' | 'throttle' | 'rpm' | 'sourceA' | 'sourceB'>;
  analysis: AnalysisSummary | null;
  provenance: {
    audio: 'SIMULATED';
    engineSpecs: string;
    exhaustLayout: string;
    recordingsIncluded: false;
  };
}

export function summarize(a: AnalysisResult | null): AnalysisSummary | null {
  if (!a) return null;
  return {
    createdAt: a.createdAt,
    modelVersion: a.modelVersion,
    throttle: a.throttle,
    labels: a.labels,
    boom: { level: a.boom.level, maxDelta: a.boom.maxDelta, maxProm: a.boom.maxProm, band: a.boom.band },
    targetScore: { A: a.similarity.A.score, B: a.similarity.B.score, weightRumble: a.similarity.weightRumble },
  };
}

export function serializeProject(project: ProjectData, controls: Controls, analysis: AnalysisResult | null, analysisStale: boolean): ProjectFile {
  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    savedAt: new Date().toISOString(),
    project: JSON.parse(JSON.stringify(project)),
    controls: {
      valveMode: controls.valveMode,
      listener: controls.listener,
      normalize: controls.normalize,
      throttle: controls.throttle,
      rpm: controls.rpm,
      sourceA: controls.sourceA,
      sourceB: controls.sourceB,
    },
    analysis: analysisStale ? null : summarize(analysis),
    provenance: {
      audio: 'SIMULATED',
      engineSpecs: '공개 제원(2차 자료) — 항목별 신뢰도 표시 참조',
      exhaustLayout: '개념 구조 (실측 치수 없음)',
      recordingsIncluded: false,
    },
  };
}

export function parseProject(text: string): { file: ProjectFile | null; errors: string[] } {
  const errors: string[] = [];
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return { file: null, errors: ['JSON 형식이 아닙니다.'] };
  }
  if (!raw || raw.schema !== SCHEMA) return { file: null, errors: ['V8 LAB 프로젝트 파일이 아닙니다 (schema 불일치).'] };
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION)
    return { file: null, errors: [`지원하지 않는 schemaVersion: ${raw.schemaVersion}`] };
  const p = raw.project;
  if (!p || typeof p !== 'object') return { file: null, errors: ['project 항목이 없습니다.'] };
  for (const key of ['engineId', 'targetEngineId'] as const) {
    if (!ENGINES.some((e) => e.id === p[key])) errors.push(`알 수 없는 엔진 ID: ${p[key]}`);
  }
  if (!p.exhaust || !Array.isArray(p.exhaust.left) || !Array.isArray(p.exhaust.right)) errors.push('배기 구성이 손상되었습니다.');
  else errors.push(...validateExhaust(p.exhaust));
  if (p.snapshot) errors.push(...validateExhaust(p.snapshot).map((e) => `스냅샷: ${e}`));
  if (errors.length) return { file: null, errors };
  // fill fields added after v1 files were written
  p.toneBalance = Math.min(100, Math.max(0, Number(p.toneBalance ?? 50)));
  p.exterior = p.exterior ?? defaultExterior();
  p.legal = p.legal ?? {};
  p.legalNotes = p.legalNotes ?? {};
  p.recordings = Array.isArray(p.recordings) ? p.recordings : [];
  p.roarRefEngineId = ENGINES.some((e) => e.id === p.roarRefEngineId) ? p.roarRefEngineId : '2ur-gse';
  p.vehicleId = p.vehicleId ?? 'gs460-s190';
  engineById(p.engineId);
  return { file: raw as ProjectFile, errors: [] };
}

export interface StoredEntry {
  id: string;
  name: string;
  savedAt: string;
  file: ProjectFile;
}

export function listStored(): StoredEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveStored(file: ProjectFile, id?: string): StoredEntry {
  const list = listStored();
  const entry: StoredEntry = { id: id ?? `p-${Date.now().toString(36)}`, name: file.project.name, savedAt: file.savedAt, file };
  const i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) list[i] = entry;
  else list.unshift(entry);
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  return entry;
}

export function deleteStored(id: string) {
  localStorage.setItem(LS_KEY, JSON.stringify(listStored().filter((e) => e.id !== id)));
}
