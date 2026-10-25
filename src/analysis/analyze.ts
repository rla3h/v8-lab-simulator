import type { EngineDef, ExhaustConfig } from '../types';
import { compileEngine, compileExhaust, MODEL_VERSION } from '../dsp/compile';
import { linearSweep, renderOfflineAsync, steady, type OfflineResult } from '../dsp/offline';
import { bandPower, powerAt, powerSpectrum, spectralCentroid, spectralSlope, toDb } from './fft';

export const ORDERS = Array.from({ length: 24 }, (_, i) => (i + 1) / 2); // 0.5 … 12
export const HALF_ORDERS = [0.5, 1.5, 2.5, 3.5];
export const SIM_RPMS = [1500, 2500, 3500, 4500, 5500];
export const RUMBLE_RPMS = [2500, 3500];
export const ROAR_RPMS = [4500, 5500];
const SR = 24000;
const FRAME = 4096;
const HOP = 1024;

export interface SourceSpec {
  label: string;
  engine: EngineDef;
  exhaust: ExhaustConfig;
}

export interface SweepAnalysis {
  rpm: number[];
  /** dB spectrogram, frames × bins (bins up to maxHz). */
  spec: Float32Array[];
  binHz: number;
  maxHz: number;
  /** order dB, frames × ORDERS */
  orders: number[][];
  levelDb: number[];
  lfDb: number[];
}

export interface PointFeatures {
  rpm: number;
  orderDb: number[];
  centroidHz: number;
  slopeDbOct: number;
  lfRatioDb: number;
  rumbleIdx: number;
  roarIdx: number;
}

export interface Similarity {
  rpm: number;
  orderCorr: number;
  centroid: number;
  slope: number;
  lf: number;
  total: number;
}

export interface BoomRow {
  rpm: number;
  lfA: number;
  lfB: number;
  delta: number;
  promA: number;
  promB: number;
}

export interface AnalysisResult {
  modelVersion: string;
  createdAt: string;
  throttle: number;
  valveMode: number;
  labels: { A: string; B: string; target: string; roarRef: string };
  sweepA: SweepAnalysis;
  sweepB: SweepAnalysis;
  boom: { rows: BoomRow[]; maxDelta: number; maxProm: number; level: 'LOW' | 'MED' | 'HIGH'; band: [number, number] };
  features: { A: PointFeatures[]; B: PointFeatures[]; target: PointFeatures[]; roarRef: PointFeatures[] };
  similarity: {
    B: { rumble: Similarity[]; roar: Similarity[]; score: number };
    A: { rumble: Similarity[]; roar: Similarity[]; score: number };
    weightRumble: number;
  };
}

/**
 * Analysis channel. Exterior: the LH-tip-side channel — the crossover model conserves L+R
 * exactly, so a mono sum would be blind to X/H-pipe effects; people also hear an exhaust from
 * near one tip. Interior: L+R (the cabin sums both outlets).
 */
export type Channel = 'near-tip' | 'sum';

function pick(r: OfflineResult, off: number, n: number, ch: Channel): Float32Array {
  const out = new Float32Array(n);
  if (ch === 'near-tip') out.set(r.L.subarray(off, off + n));
  else for (let i = 0; i < n; i++) out[i] = 0.5 * (r.L[off + i] + r.R[off + i]);
  return out;
}

function frames(r: OfflineResult, f: (ps: Float64Array, rpm: number) => void, ch: Channel = 'near-tip') {
  for (let off = 0; off + FRAME <= r.L.length; off += HOP) {
    const mono = pick(r, off, FRAME, ch);
    const ps = powerSpectrum(mono, 0, FRAME);
    const rpm = r.rpm[Math.min(r.rpm.length - 1, Math.floor((off + FRAME / 2) / r.block))];
    f(ps, rpm);
  }
}

export function orderVector(ps: Float64Array, sr: number, rpm: number): number[] {
  const f1 = rpm / 60;
  return ORDERS.map((o) => toDb(powerAt(ps, sr, o * f1, 1)));
}

function sweepAnalysis(r: OfflineResult, maxHz = 3000): SweepAnalysis {
  const binHz = SR / FRAME;
  const nb = Math.ceil(maxHz / binHz);
  const out: SweepAnalysis = { rpm: [], spec: [], binHz, maxHz, orders: [], levelDb: [], lfDb: [] };
  frames(r, (ps, rpm) => {
    out.rpm.push(rpm);
    const row = new Float32Array(nb);
    for (let k = 0; k < nb; k++) row[k] = toDb(ps[k]);
    out.spec.push(row);
    out.orders.push(orderVector(ps, SR, rpm));
    out.levelDb.push(toDb(bandPower(ps, SR, 20, 10000)));
    out.lfDb.push(toDb(bandPower(ps, SR, 25, 100)));
  });
  return out;
}

export function pointFeatures(ps: Float64Array, sr: number, rpm: number): PointFeatures {
  const ord = orderVector(ps, sr, rpm);
  const mx = Math.max(...ord);
  const p4 = powerAt(ps, sr, (4 * rpm) / 60, 1);
  const half = HALF_ORDERS.reduce((a, o) => a + powerAt(ps, sr, (o * rpm) / 60, 1), 0);
  return {
    rpm,
    orderDb: ord.map((d) => d - mx),
    centroidHz: spectralCentroid(ps, sr, 20, 10000),
    slopeDbOct: spectralSlope(ps, sr, 100, 4000),
    lfRatioDb: toDb(bandPower(ps, sr, 20, 150)) - toDb(bandPower(ps, sr, 20, 10000)),
    rumbleIdx: toDb(half) - toDb(p4),
    roarIdx: toDb(bandPower(ps, sr, 800, 5000)) - toDb(bandPower(ps, sr, 20, 800)),
  };
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/**
 * Feature similarity (0–100). Defined formula, shown verbatim in the UI:
 * total = 0.4·orderCorr + 0.2·centroid + 0.2·slope + 0.2·lf
 *   orderCorr = 100·max(0, pearson(order dB vectors, orders 0.5–12))
 *   centroid  = 100·exp(−|log2(Cd/Cr)| / 0.5)
 *   slope     = 100·exp(−|Sd − Sr| / 3 dB/oct)
 *   lf        = 100·exp(−|LFd − LFr| / 6 dB)
 */
export function similarity(d: PointFeatures, r: PointFeatures): Similarity {
  const orderCorr = 100 * Math.max(0, pearson(d.orderDb, r.orderDb));
  const centroid = 100 * Math.exp(-Math.abs(Math.log2(Math.max(d.centroidHz, 1) / Math.max(r.centroidHz, 1))) / 0.5);
  const slope = 100 * Math.exp(-Math.abs(d.slopeDbOct - r.slopeDbOct) / 3);
  const lf = 100 * Math.exp(-Math.abs(d.lfRatioDb - r.lfRatioDb) / 6);
  return { rpm: d.rpm, orderCorr, centroid, slope, lf, total: 0.4 * orderCorr + 0.2 * centroid + 0.2 * slope + 0.2 * lf };
}

/**
 * maxDelta: largest B−A rise of 25–100 Hz interior energy in the band.
 * maxProm: largest rise of B's low-frequency peak prominence over A's (how much more tonal the boom gets).
 */
export function boomLevel(maxDelta: number, maxProm: number): 'LOW' | 'MED' | 'HIGH' {
  let lvl = maxDelta <= 3 ? 0 : maxDelta <= 6 ? 1 : 2;
  if (maxProm > 6) lvl = Math.min(2, lvl + 1);
  return (['LOW', 'MED', 'HIGH'] as const)[lvl];
}

export interface AnalysisInput {
  A: SourceSpec;
  B: SourceSpec;
  target: SourceSpec;
  roarRef: SourceSpec;
  throttle: number;
  valveMode: number;
  toneBalance: number;
}

export async function runAnalysis(inp: AnalysisInput, onProgress?: (p: number, label: string) => void): Promise<AnalysisResult> {
  const jobs = 4 + 3 * SIM_RPMS.length;
  let done = 0;
  const step = (label: string) => onProgress?.(++done / jobs, label);
  const voice = (s: SourceSpec) => ({ engine: compileEngine(s.engine), chain: compileExhaust(s.exhaust) });

  const sweep = async (s: SourceSpec, listener: number, r0: number, r1: number, secs: number) => {
    const res = await renderOfflineAsync({
      sr: SR,
      seconds: secs,
      voice: voice(s),
      listener,
      valveMode: inp.valveMode,
      drive: linearSweep(r0, r1, secs, inp.throttle),
      directRpm: true,
    });
    return res;
  };

  const idleA = inp.A.engine.sim.idleRpm;
  const maxA = Math.min(inp.A.engine.sim.maxRpm, inp.B.engine.sim.maxRpm);
  const exA = await sweep(inp.A, 0, idleA, maxA, 12);
  step('A 실외 스윕');
  const exB = await sweep(inp.B, 0, idleA, maxA, 12);
  step('B 실외 스윕');
  // interior sweeps at light cruise load — that is where low-RPM boom matters
  const boomThr = Math.min(inp.throttle, 0.3);
  const boomSweep = async (s: SourceSpec) =>
    renderOfflineAsync({
      sr: SR,
      seconds: 8,
      voice: voice(s),
      listener: 1,
      valveMode: inp.valveMode,
      drive: linearSweep(1000, 3000, 8, boomThr),
      directRpm: true,
    });
  const inA = await boomSweep(inp.A);
  step('A 실내 스윕');
  const inB = await boomSweep(inp.B);
  step('B 실내 스윕');

  const lfCurve = (r: OfflineResult) => {
    const pts: { rpm: number; lf: number; prom: number }[] = [];
    frames(
      r,
      (ps, rpm) => {
      const binHz = SR / FRAME;
      let peak = -200;
      for (let k = Math.ceil(25 / binHz); k <= 100 / binHz; k++) peak = Math.max(peak, toDb(ps[k]));
      const mid: number[] = [];
      for (let k = Math.ceil(100 / binHz); k <= 400 / binHz; k++) mid.push(toDb(ps[k]));
      mid.sort((a, b) => a - b);
      pts.push({ rpm, lf: toDb(bandPower(ps, SR, 25, 100)), prom: peak - mid[mid.length >> 1] });
      },
      'sum',
    );
    return pts;
  };
  const la = lfCurve(inA);
  const lb = lfCurve(inB);
  const rows: BoomRow[] = [];
  for (let rpm = 1000; rpm <= 3000; rpm += 250) {
    const pick = (pts: typeof la) => {
      const sel = pts.filter((p) => Math.abs(p.rpm - rpm) <= 125);
      const avg = (k: 'lf' | 'prom') => (sel.length ? sel.reduce((a, p) => a + p[k], 0) / sel.length : NaN);
      return { lf: avg('lf'), prom: avg('prom') };
    };
    const a = pick(la);
    const b = pick(lb);
    rows.push({ rpm, lfA: a.lf, lfB: b.lf, delta: b.lf - a.lf, promA: a.prom, promB: b.prom });
  }
  const band: [number, number] = [1500, 2500];
  const inBand = rows.filter((r) => r.rpm >= band[0] && r.rpm <= band[1]);
  const maxDelta = Math.max(...inBand.map((r) => r.delta));
  const maxProm = Math.max(...inBand.map((r) => r.promB - r.promA));

  const pointSet = async (s: SourceSpec, label: string) => {
    const out: PointFeatures[] = [];
    for (const rpm of SIM_RPMS) {
      const r = await renderOfflineAsync({
        sr: SR,
        seconds: 0.75,
        voice: voice(s),
        listener: 0,
        valveMode: inp.valveMode,
        drive: steady(Math.min(rpm, s.engine.sim.maxRpm), inp.throttle),
        directRpm: true,
        warmup: 0.6,
      });
      out.push(pointFeatures(powerSpectrum(pick(r, 0, 16384, 'near-tip'), 0, 16384), SR, rpm));
      step(label);
    }
    return out;
  };
  const fB = await pointSet(inp.B, 'B 정상상태 특징');
  const fT = await pointSet(inp.target, '목표 엔진 특징');
  const fR = await pointSet(inp.roarRef, '고회전 레퍼런스 특징');
  // A features reuse the sweep render is not steady-state; compute them separately but cheaply
  const fA: PointFeatures[] = [];
  for (const rpm of SIM_RPMS) {
    const r = await renderOfflineAsync({
      sr: SR,
      seconds: 0.75,
      voice: voice(inp.A),
      listener: 0,
      valveMode: inp.valveMode,
      drive: steady(rpm, inp.throttle),
      directRpm: true,
      warmup: 0.6,
    });
    fA.push(pointFeatures(powerSpectrum(pick(r, 0, 16384, 'near-tip'), 0, 16384), SR, rpm));
  }

  const w = inp.toneBalance / 100;
  const score = (f: PointFeatures[]) => {
    const rumble = RUMBLE_RPMS.map((rpm) => similarity(f.find((x) => x.rpm === rpm)!, fT.find((x) => x.rpm === rpm)!));
    const roar = ROAR_RPMS.map((rpm) => similarity(f.find((x) => x.rpm === rpm)!, fR.find((x) => x.rpm === rpm)!));
    const mean = (xs: Similarity[]) => xs.reduce((a, s) => a + s.total, 0) / xs.length;
    return { rumble, roar, score: w * mean(rumble) + (1 - w) * mean(roar) };
  };

  return {
    modelVersion: MODEL_VERSION,
    createdAt: new Date().toISOString(),
    throttle: inp.throttle,
    valveMode: inp.valveMode,
    labels: { A: inp.A.label, B: inp.B.label, target: inp.target.label, roarRef: inp.roarRef.label },
    sweepA: sweepAnalysis(exA),
    sweepB: sweepAnalysis(exB),
    boom: { rows, maxDelta, maxProm, level: boomLevel(maxDelta, maxProm), band },
    features: { A: fA, B: fB, target: fT, roarRef: fR },
    similarity: { B: score(fB), A: score(fA), weightRumble: w },
  };
}
