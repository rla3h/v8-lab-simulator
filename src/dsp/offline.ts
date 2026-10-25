import { V8Core, type CoreChain, type CoreEngine } from './core';

export interface DriveState {
  rpm: number;
  throttle: number;
}

export interface OfflineVoice {
  engine: CoreEngine;
  chain: CoreChain;
}

export interface OfflineOptions {
  sr: number;
  seconds: number;
  voice: OfflineVoice;
  /** 0 exterior, 1 interior */
  listener: number;
  /** 0 closed, 1 open, 2 auto */
  valveMode: number;
  /** Operating point at time t (s). */
  drive: (t: number) => DriveState;
  /**
   * true: RPM follows drive() exactly (analysis sweeps, known RPM per frame).
   * false: RPM is smoothed like the live engine (WAV export of scenarios).
   */
  directRpm?: boolean;
  seed?: number;
  master?: number;
  /** Seconds rendered and discarded first so filters/valve settle. */
  warmup?: number;
}

export interface OfflineResult {
  sr: number;
  L: Float32Array;
  R: Float32Array;
  /** Actual RPM per block of `block` samples. */
  rpm: Float32Array;
  block: number;
}

const BLOCK = 64;

function setup(o: OfflineOptions) {
  const core = new V8Core(o.sr);
  core.seed = o.seed ?? 4242;
  const d0 = o.drive(0);
  core.control({
    rpm: d0.rpm,
    throttle: d0.throttle,
    valveMode: o.valveMode,
    listener: o.listener,
    monitor: 0,
    normalize: false,
    master: o.master ?? 1,
    directRpm: o.directRpm ?? true,
    solo: 0,
  });
  core.rpm = d0.rpm;
  core.handle({ type: 'snap' });
  core.setVoice(0, o.voice.engine, o.voice.chain);
  const warm = Math.round((o.warmup ?? 0.4) * o.sr);
  const scratchL = new Float32Array(BLOCK);
  const scratchR = new Float32Array(BLOCK);
  for (let i = 0; i < warm; i += BLOCK) core.render(scratchL, scratchR, null, null, BLOCK);
  return core;
}

function renderRange(core: V8Core, o: OfflineOptions, res: OfflineResult, from: number, to: number) {
  const n = res.L.length;
  for (let i = from; i < to && i < n; i += BLOCK) {
    const t = i / o.sr;
    const d = o.drive(t);
    core.control({ rpm: d.rpm, throttle: d.throttle });
    const len = Math.min(BLOCK, n - i);
    core.render(res.L.subarray(i, i + len), res.R.subarray(i, i + len), null, null, len);
    res.rpm[(i / BLOCK) | 0] = core.rpm;
  }
}

function alloc(o: OfflineOptions): OfflineResult {
  const n = Math.round(o.seconds * o.sr);
  return {
    sr: o.sr,
    L: new Float32Array(n),
    R: new Float32Array(n),
    rpm: new Float32Array(Math.ceil(n / BLOCK)),
    block: BLOCK,
  };
}

export function renderOffline(o: OfflineOptions): OfflineResult {
  const core = setup(o);
  const res = alloc(o);
  renderRange(core, o, res, 0, res.L.length);
  return res;
}

/** Same as renderOffline but yields to the event loop so the UI stays responsive. */
export async function renderOfflineAsync(o: OfflineOptions, onProgress?: (p: number) => void): Promise<OfflineResult> {
  const core = setup(o);
  const res = alloc(o);
  const chunk = BLOCK * Math.round((o.sr * 0.25) / BLOCK);
  for (let i = 0; i < res.L.length; i += chunk) {
    renderRange(core, o, res, i, i + chunk);
    onProgress?.(Math.min(1, (i + chunk) / res.L.length));
    await new Promise((r) => setTimeout(r, 0));
  }
  return res;
}

export const linearSweep =
  (rpm0: number, rpm1: number, seconds: number, throttle: number) =>
  (t: number): DriveState => ({ rpm: rpm0 + (rpm1 - rpm0) * Math.min(1, t / seconds), throttle });

export const steady = (rpm: number, throttle: number) => (): DriveState => ({ rpm, throttle });
