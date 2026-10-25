import type { EngineDef, ExhaustConfig, Part, ValveMode, ListenerMode } from '../types';
import { V8Core, type BQ, type CoreChain, type CoreEngine, type CoreSide } from './core';

export const MODEL_VERSION = 'v8lab-dsp 0.1.0';

/** Speed of sound in hot exhaust gas — modelling assumption (≈ 400 °C). */
export const C_GAS = 480;

const db = (x: number) => Math.pow(10, x / 20);

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Firing-event angles (crank °, ascending in a 720° cycle) and the bank each event exhausts into. */
export function firingEvents(def: EngineDef): { angles: number[]; banks: number[]; cylinders: number[] } {
  const order = def.firingOrder.value;
  if (!order || order.length !== def.cylinders) throw new Error(`${def.code}: firing order unavailable`);
  const intervals = def.firingIntervalsDeg ?? new Array(def.cylinders).fill(720 / def.cylinders);
  const angles: number[] = [];
  let a = 0;
  for (let i = 0; i < order.length; i++) {
    angles.push(a);
    a += intervals[i];
  }
  const banks = order.map((cyl) => (def.bankOf[cyl] === 'L' ? 0 : 1));
  return { angles, banks, cylinders: order };
}

export function compileEngine(def: EngineDef): CoreEngine {
  const { angles, banks } = firingEvents(def);
  const v = def.voicing;
  const cc = def.displacementCc.value ?? 4600;
  const cylL = cc / 1000 / def.cylinders;
  let seed = hash(def.id) || 1;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  const gains = angles.map(() => 1 + v.cylSpread * rnd());
  return {
    key: `${def.id}:${JSON.stringify(v)}:${def.sim.idleRpm}-${def.sim.maxRpm}`,
    eventAngles: angles,
    eventBanks: banks,
    eventGain: gains,
    idleRpm: def.sim.idleRpm,
    maxRpm: def.sim.maxRpm,
    pulseWidthDeg: v.pulseWidthDeg,
    // per-pulse energy scales with cylinder swept volume (relative to 1UR-FSE's 576 cc)
    pulseGain: 1.5 * Math.sqrt(cylL / 0.576),
    rasp: v.rasp,
    raspHz: v.raspHz,
    intakeRoar: v.intakeRoar,
    intakeHz: v.intakeHz,
    mech: v.mech,
    idleJitter: v.idleJitter,
    induction: def.induction === 'NA' ? 0 : def.induction === 'turbo' ? 1 : 2,
    turboDamping: v.turboDamping ?? 0,
    whineOrder: v.whineOrder ?? 0,
    whineLevel: v.whineLevel ?? 0,
  };
}

function compileSide(parts: Part[], frontDiameterMm: number): CoreSide {
  const staticF: BQ[] = [];
  let closedF: BQ[] = [];
  let openF: BQ[] = [];
  let gainClosed = 1;
  let gainOpen = 1;
  let hasValve = false;
  let pipeLenMm = 0;
  let diaWeighted = 0;
  let mufflerDamping = 1;

  for (const p of parts) {
    const q = p.params;
    switch (p.kind) {
      case 'pipe':
        pipeLenMm += q.lengthMm;
        diaWeighted += q.lengthMm * q.diameterMm;
        break;
      case 'res-helmholtz':
        staticF.push({ t: 4, f: q.tuneHz, q: q.q, g: -q.depthDb });
        break;
      case 'res-absorptive':
        staticF.push({ t: 6, f: q.cornerHz, q: 0.707, g: -q.cutDb });
        break;
      case 'quarter-wave':
        staticF.push({ t: 4, f: q.tuneHz, q: 4, g: -q.depthDb });
        staticF.push({ t: 4, f: q.tuneHz * 3, q: 4, g: -q.depthDb * 0.7 });
        break;
      case 'muffler-chambered':
        closedF = [
          { t: 0, f: q.lowpassHz, q: 0.6, g: 0 },
          { t: 4, f: q.lowpassHz * 1.8, q: 1.5, g: -6 },
        ];
        gainClosed = db(-q.attenDb);
        mufflerDamping = 0.6;
        break;
      case 'muffler-straight':
        closedF = [
          { t: 6, f: 1500, q: 0.707, g: -q.hfCutDb },
          { t: 0, f: 9000, q: 0.7, g: 0 },
        ];
        gainClosed = db(-q.attenDb);
        mufflerDamping = 1;
        break;
      case 'muffler-valved':
        closedF = [
          { t: 0, f: q.closedLowpassHz, q: 0.6, g: 0 },
          { t: 4, f: q.closedLowpassHz * 1.8, q: 1.5, g: -6 },
        ];
        openF = [
          { t: 6, f: 1500, q: 0.707, g: -q.openHfCutDb },
          { t: 0, f: 9000, q: 0.7, g: 0 },
        ];
        gainClosed = db(-q.closedAttenDb);
        gainOpen = db(-q.openAttenDb);
        hasValve = true;
        mufflerDamping = 0.8;
        break;
    }
  }
  // wall losses: ~1 dB per metre above 3 kHz (heuristic)
  if (pipeLenMm > 0) staticF.push({ t: 6, f: 3000, q: 0.707, g: -pipeLenMm / 1000 });
  if (closedF.length === 0) closedF = [{ t: 0, f: 12000, q: 0.7, g: 0 }];

  const dAvg = pipeLenMm > 0 ? diaWeighted / pipeLenMm : frontDiameterMm;
  const totalLenM = (pipeLenMm + 600) / 1000; // + muffler body & tail (assumed 600 mm)
  const combHz = C_GAS / (2 * totalLenM);
  const combFb = Math.min(0.42, Math.max(0.12, 0.18 + (0.2 * (dAvg - 45)) / 35)) * mufflerDamping;
  const outGain = Math.pow(dAvg / 60, 1.2) * Math.pow(frontDiameterMm / 57, 0.5);
  return { staticF, closedF, openF, gainClosed, gainOpen, hasValve, combHz, combFb, outGain };
}

export function compileExhaust(cfg: ExhaustConfig): CoreChain {
  const frontRes = C_GAS / (2 * Math.max(cfg.frontPipe.lengthMm / 1000, 0.2));
  const bankPre: BQ[] = [
    { t: 6, f: 1500, q: 0.707, g: -5 }, // OEM catalyst (assumed HF damping)
    { t: 0, f: 7000, q: 0.7, g: 0 },
    { t: 4, f: frontRes, q: 2, g: 2 }, // front-pipe standing wave
  ];
  let crossFilter: BQ[] = [];
  let crossCoupling = 0;
  const dScale = Math.min(1.15, Math.sqrt(cfg.crossover.diameterMm / 60));
  if (cfg.crossover.type === 'h') {
    crossFilter = [{ t: 0, f: 250, q: 0.707, g: 0 }];
    crossCoupling = Math.min(1, cfg.crossover.coupling * dScale);
  } else if (cfg.crossover.type === 'x') {
    crossFilter = [{ t: 0, f: 4000, q: 0.707, g: 0 }];
    crossCoupling = Math.min(1, cfg.crossover.coupling * dScale);
  } else {
    crossFilter = [{ t: 0, f: 4000, q: 0.707, g: 0 }];
    crossCoupling = 0;
  }
  return {
    bankPre,
    crossCoupling,
    crossFilter,
    side: [compileSide(cfg.left, cfg.frontPipe.diameterMm), compileSide(cfg.right, cfg.frontPipe.diameterMm)],
    valveOpenRpm: cfg.valve.autoOpenRpm,
    valveCloseRpm: cfg.valve.autoCloseRpm,
    valveThrottle: cfg.valve.autoThrottle,
  };
}

export const valveModeCode = (m: ValveMode) => (m === 'closed' ? 0 : m === 'open' ? 1 : 2);
export const listenerCode = (m: ListenerMode) => (m === 'exterior' ? 0 : 1);

// ───────────── frequency response (for the builder & hybrid delta-EQ) ─────────────

function bqMag(specs: BQ[], f: number, sr: number): number {
  const c = new Float64Array(5);
  const w = (2 * Math.PI * f) / sr;
  const cr = Math.cos(w), ci = -Math.sin(w);
  const c2r = Math.cos(2 * w), c2i = -Math.sin(2 * w);
  let mag = 1;
  for (const s of specs) {
    V8Core.coef(s, sr, c, 0);
    const nr = c[0] + c[1] * cr + c[2] * c2r;
    const ni = c[1] * ci + c[2] * c2i;
    const dr = 1 + c[3] * cr + c[4] * c2r;
    const di = c[3] * ci + c[4] * c2i;
    mag *= Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return mag;
}

/**
 * Linear (small-signal) magnitude response of one side of the chain, in dB, for
 * valve position vp. The crossover is excluded: its effect depends on the phase
 * relation of the two banks' pulse trains, so it is not a single transfer function.
 */
export function sideResponseDb(chain: CoreChain, sideIdx: number, freqs: number[], vp: number, sr = 48000): number[] {
  const s = chain.side[sideIdx];
  return freqs.map((f) => {
    const common = bqMag(chain.bankPre, f, sr) * bqMag(s.staticF, f, sr);
    const closed = bqMag(s.closedF, f, sr) * s.gainClosed;
    const open = s.hasValve ? bqMag(s.openF, f, sr) * s.gainOpen : closed;
    const m = closed * (1 - vp) + open * vp;
    // comb peak approximation: 1 / |1 - fb e^{-jωD}|
    const D = 1 / s.combHz;
    const wr = Math.cos(2 * Math.PI * f * D), wi = Math.sin(2 * Math.PI * f * D);
    const fbEff = s.combFb * (1 / Math.sqrt(1 + (f / 1800) ** 2));
    const comb = 1 / Math.sqrt((1 - fbEff * wr) ** 2 + (fbEff * wi) ** 2);
    return 20 * Math.log10(common * m * comb * s.outGain + 1e-9);
  });
}

export const logFreqs = (n: number, f0 = 20, f1 = 8000) =>
  Array.from({ length: n }, (_, i) => f0 * Math.pow(f1 / f0, i / (n - 1)));
