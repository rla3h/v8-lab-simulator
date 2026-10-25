/* V8 LAB DSP core.
 *
 * IMPORTANT: V8Core must stay fully self-contained (no references to module-level
 * values or imports). Its source text is stringified into the AudioWorklet, and the
 * same class runs in Node tests, offline analysis and WAV export, so every audio
 * path in the app uses one implementation.
 *
 * Signal flow per voice:
 *   crank angle → firing events → per-bank blowdown pulses (+ turbulent rasp)
 *   → bank filters (catalyst / front pipe) → crossover (none / H / X)
 *   → per-side resonators & pipes → muffler (closed path ∥ valve-open path)
 *   → tail-pipe comb resonance → DC block → listener (exterior | interior estimate)
 *   + engine-bay sources (intake roar, mechanical, supercharger whine).
 */

/** Biquad spec. t: 0 lowpass, 1 highpass, 2 bandpass, 3 notch, 4 peak, 5 low-shelf, 6 high-shelf. */
export interface BQ {
  t: number;
  f: number;
  q: number;
  g: number;
}

export interface CoreEngine {
  key: string;
  eventAngles: number[];
  eventBanks: number[];
  eventGain: number[];
  idleRpm: number;
  maxRpm: number;
  pulseWidthDeg: number;
  pulseGain: number;
  rasp: number;
  raspHz: number;
  intakeRoar: number;
  intakeHz: number;
  mech: number;
  idleJitter: number;
  /** 0 NA, 1 turbo, 2 supercharger */
  induction: number;
  turboDamping: number;
  whineOrder: number;
  whineLevel: number;
}

export interface CoreSide {
  staticF: BQ[];
  closedF: BQ[];
  openF: BQ[];
  gainClosed: number;
  gainOpen: number;
  hasValve: boolean;
  combHz: number;
  combFb: number;
  outGain: number;
}

export interface CoreChain {
  bankPre: BQ[];
  crossCoupling: number;
  crossFilter: BQ[];
  side: CoreSide[];
  valveOpenRpm: number;
  valveCloseRpm: number;
  valveThrottle: number;
}

export interface CoreControl {
  rpm?: number;
  throttle?: number;
  /** 0 closed, 1 open, 2 auto */
  valveMode?: number;
  /** 0 = A audible, 1 = B audible */
  monitor?: number;
  normalize?: boolean;
  /** 0 exterior, 1 interior */
  listener?: number;
  master?: number;
  directRpm?: boolean;
  /** -1 both voices, 0 only A, 1 only B */
  solo?: number;
  /** Monitor level assist: slow boost referenced to voice A only, applied equally to A and B. */
  agc?: boolean;
}

export interface CoreTelemetry {
  rpm: number;
  throttle: number;
  valve: number[];
  levelDb: number[];
  normGainDb: number;
  monitor: number;
  peak: number;
  active: boolean[];
  recoveries: number;
  agcDb: number;
}

export class V8Core {
  sr: number;
  rpm: number;
  rpmT: number;
  thr: number;
  thrT: number;
  direct: boolean;
  solo: number;
  valveMode: number;
  monitor: number;
  mon: number;
  normalize: boolean;
  normG: number;
  lev: number[];
  master: number;
  listener: number;
  lm: number;
  voices: any[];
  olds: any[];
  pending: any[];
  xf: number[];
  xfStep: number;
  kR: number;
  kT: number;
  kV: number;
  kL: number;
  kG: number;
  kM: number;
  kS: number;
  kD: number;
  slewUp: number;
  slewDown: number;
  kw: any[];
  peak: number;
  oL: number;
  oR: number;
  oM: number;
  dcR: number;
  combLen: number;
  seed: number;
  recoveries: number;
  agcOn: boolean;
  agcG: number;
  kAu: number;
  kAd: number;

  constructor(sampleRate: number) {
    const sr = sampleRate;
    this.sr = sr;
    this.rpm = 800;
    this.rpmT = 800;
    this.thr = 0;
    this.thrT = 0;
    this.direct = false;
    this.solo = -1;
    this.valveMode = 2;
    this.monitor = 0;
    this.mon = 0;
    this.normalize = true;
    this.normG = 1;
    this.lev = [1e-12, 1e-12];
    this.master = 0.8;
    this.listener = 0;
    this.lm = 0;
    this.voices = [null, null];
    this.olds = [null, null];
    this.pending = [null, null];
    this.xf = [1, 1];
    this.xfStep = 1 / (0.09 * sr);
    const k = (tau: number) => 1 - Math.exp(-1 / (tau * sr));
    this.kR = k(0.12);
    this.kT = k(0.06);
    this.kV = k(0.35);
    this.kL = k(0.4);
    this.kG = k(0.25);
    this.kM = k(0.03);
    this.kS = k(0.02);
    this.kD = 1 - Math.exp((-2 * Math.PI * 1800) / sr);
    this.slewUp = 6000;
    this.slewDown = 4200;
    this.kw = [this.mkKW(), this.mkKW()];
    this.peak = 0;
    this.oL = 0;
    this.oR = 0;
    this.oM = 0;
    this.dcR = 1 - (2 * Math.PI * 18) / sr;
    this.combLen = Math.ceil(sr / 18) + 4;
    this.seed = 0;
    this.recoveries = 0;
    this.agcOn = false;
    this.agcG = 1;
    this.kAu = k(1.5);
    this.kAd = k(0.25);
  }

  // ───────────── filters ─────────────

  static coef(b: BQ, sr: number, c: Float64Array, o: number) {
    const f = Math.min(Math.max(b.f, 5), sr * 0.45);
    const w = (2 * Math.PI * f) / sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const q = Math.max(b.q, 0.05);
    const al = sn / (2 * q);
    const A = Math.pow(10, b.g / 40);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    switch (b.t) {
      case 0:
        b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
        break;
      case 1:
        b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
        break;
      case 2:
        b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
        break;
      case 3:
        b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
        break;
      case 4:
        b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
        break;
      case 5: {
        const sq = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 - (A - 1) * cs + sq);
        b1 = 2 * A * (A - 1 - (A + 1) * cs);
        b2 = A * (A + 1 - (A - 1) * cs - sq);
        a0 = A + 1 + (A - 1) * cs + sq;
        a1 = -2 * (A - 1 + (A + 1) * cs);
        a2 = A + 1 + (A - 1) * cs - sq;
        break;
      }
      case 6: {
        const sq = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 + (A - 1) * cs + sq);
        b1 = -2 * A * (A - 1 + (A + 1) * cs);
        b2 = A * (A + 1 + (A - 1) * cs - sq);
        a0 = A + 1 - (A - 1) * cs + sq;
        a1 = 2 * (A - 1 - (A + 1) * cs);
        a2 = A + 1 - (A - 1) * cs - sq;
        break;
      }
    }
    c[o] = b0 / a0;
    c[o + 1] = b1 / a0;
    c[o + 2] = b2 / a0;
    c[o + 3] = a1 / a0;
    c[o + 4] = a2 / a0;
  }

  mkFB(specs: BQ[]) {
    const n = specs.length;
    const c = new Float64Array(5 * n);
    const s = new Float64Array(4 * n);
    for (let i = 0; i < n; i++) (this.constructor as typeof V8Core).coef(specs[i], this.sr, c, 5 * i);
    return { n, c, s };
  }

  setFB(fb: any, specs: BQ[]) {
    for (let i = 0; i < fb.n; i++) (this.constructor as typeof V8Core).coef(specs[i], this.sr, fb.c, 5 * i);
  }

  runFB(fb: any, x: number) {
    const c = fb.c;
    const s = fb.s;
    for (let i = 0, j = 0, k = 0; i < fb.n; i++, j += 5, k += 4) {
      const y = c[j] * x + c[j + 1] * s[k] + c[j + 2] * s[k + 1] - c[j + 3] * s[k + 2] - c[j + 4] * s[k + 3];
      s[k + 1] = s[k];
      s[k] = x;
      s[k + 3] = s[k + 2];
      s[k + 2] = y;
      x = y;
    }
    return x;
  }

  /** Approximate K-weighting (high-pass + presence shelf) for loudness matching. */
  mkKW() {
    return this.mkFB([
      { t: 1, f: 40, q: 0.5, g: 0 },
      { t: 6, f: 1500, q: 0.707, g: 4 },
    ]);
  }

  // ───────────── random ─────────────

  vrand(v: any) {
    let x = v.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    v.rng = x;
    return (x >>> 0) / 4294967296;
  }

  // ───────────── voices ─────────────

  topo(ch: CoreChain) {
    let s = ch.bankPre.length + '|' + ch.crossFilter.length;
    for (let i = 0; i < 2; i++) {
      const d = ch.side[i];
      s += '|' + d.staticF.length + ',' + d.closedF.length + ',' + d.openF.length + ',' + (d.hasValve ? 1 : 0);
    }
    return s;
  }

  mkSide(d: CoreSide) {
    const sr = this.sr;
    return {
      st: this.mkFB(d.staticF),
      cl: this.mkFB(d.closedF),
      op: this.mkFB(d.openF),
      hasValve: d.hasValve,
      gC: d.gainClosed,
      gCt: d.gainClosed,
      gO: d.gainOpen,
      gOt: d.gainOpen,
      out: d.outGain,
      outT: d.outGain,
      line: new Float64Array(this.combLen),
      w: 0,
      D: sr / Math.max(d.combHz, 20),
      Dt: sr / Math.max(d.combHz, 20),
      fb: d.combFb,
      fbT: d.combFb,
      damp: 0,
      hx: 0,
      hy: 0,
    };
  }

  mkVoice(eng: CoreEngine, ch: CoreChain, seed: number) {
    const sr = this.sr;
    const pool0 = new Float64Array(32);
    const pool1 = new Float64Array(32);
    for (let i = 0; i < 8; i++) {
      pool0[i * 4] = 2;
      pool1[i * 4] = 2;
    }
    const noise = [{ t: 2, f: eng.raspHz, q: 0.8, g: 0 }];
    return {
      eng,
      ch,
      engKey: eng.key,
      topo: this.topo(ch),
      rng: seed | 0 || 1,
      theta: 0,
      ev: 0,
      nextAng: eng.eventAngles[0],
      pool: [pool0, pool1],
      noiseF: [this.mkFB(noise), this.mkFB(noise)],
      turboF: [this.mkFB([{ t: 0, f: 260, q: 0.7, g: 0 }]), this.mkFB([{ t: 0, f: 260, q: 0.7, g: 0 }])],
      pre: [this.mkFB(ch.bankPre), this.mkFB(ch.bankPre)],
      cross: [this.mkFB(ch.crossFilter), this.mkFB(ch.crossFilter)],
      cc: ch.crossCoupling,
      ccT: ch.crossCoupling,
      side: [this.mkSide(ch.side[0]), this.mkSide(ch.side[1])],
      intakeF: this.mkFB([{ t: 2, f: eng.intakeHz, q: 1.6, g: 0 }]),
      intakeF2: this.mkFB([{ t: 2, f: eng.intakeHz * 2.7, q: 3, g: 0 }]),
      intakeN: this.mkFB([{ t: 2, f: eng.intakeHz * 1.6, q: 0.7, g: 0 }]),
      mechF: this.mkFB([{ t: 1, f: 2600, q: 0.7, g: 0 }]),
      // Interior: assumed body transmission loss (4th-order low-pass) + two assumed cabin modes.
      cabin: this.mkFB([
        { t: 0, f: 260, q: 0.7, g: 0 },
        { t: 0, f: 260, q: 0.7, g: 0 },
        { t: 4, f: 45, q: 3, g: 7 },
        { t: 4, f: 72, q: 4, g: 5 },
        { t: 1, f: 18, q: 0.7, g: 0 },
      ]),
      firewall: this.mkFB([{ t: 2, f: 320, q: 0.8, g: 0 }]),
      xdL: new Float64Array(512),
      xdR: new Float64Array(512),
      xw: 0,
      xDelay: Math.min(511, Math.round(0.0025 * sr)),
      vOpen: false,
      vp: 0,
      whinePh: 0,
      sr,
    };
  }

  updateChainInPlace(v: any, ch: CoreChain) {
    const sr = this.sr;
    v.ch = ch;
    this.setFB(v.pre[0], ch.bankPre);
    this.setFB(v.pre[1], ch.bankPre);
    this.setFB(v.cross[0], ch.crossFilter);
    this.setFB(v.cross[1], ch.crossFilter);
    v.ccT = ch.crossCoupling;
    for (let i = 0; i < 2; i++) {
      const d = ch.side[i];
      const s = v.side[i];
      this.setFB(s.st, d.staticF);
      this.setFB(s.cl, d.closedF);
      this.setFB(s.op, d.openF);
      s.gCt = d.gainClosed;
      s.gOt = d.gainOpen;
      s.outT = d.outGain;
      s.Dt = sr / Math.max(d.combHz, 20);
      s.fbT = d.combFb;
    }
  }

  setVoice(slot: number, eng: CoreEngine | null, ch: CoreChain | null) {
    if (!eng || !ch) {
      this.voices[slot] = null;
      this.olds[slot] = null;
      this.pending[slot] = null;
      return;
    }
    const cur = this.voices[slot];
    if (cur && cur.engKey === eng.key && cur.topo === this.topo(ch) && this.xf[slot] >= 1) {
      this.updateChainInPlace(cur, ch);
      return;
    }
    if (cur && this.xf[slot] < 1) {
      // A crossfade is running: apply once it finishes to avoid cutting the old voice.
      this.pending[slot] = { eng, ch };
      return;
    }
    const seed = this.seed ? this.seed + slot * 7919 : (Math.random() * 1e9) | 0;
    const nv = this.mkVoice(eng, ch, seed);
    if (cur && cur.engKey === eng.key) {
      nv.theta = cur.theta;
      nv.ev = cur.ev;
      nv.nextAng = cur.nextAng;
    }
    if (cur) {
      this.olds[slot] = cur;
      this.xf[slot] = 0;
    }
    this.voices[slot] = nv;
  }

  spawn(v: any, rpm: number, load: number, rpmN: number) {
    const e = v.eng;
    const k = v.ev;
    const pool = v.pool[e.eventBanks[k]];
    let slot = 0;
    for (let i = 0; i < 8; i++) {
      if (pool[i * 4] >= 1) {
        slot = i;
        break;
      }
    }
    const durSec = Math.max(e.pulseWidthDeg / (rpm * 6), 0.0012);
    const jit = (e.idleJitter * (1 - 0.7 * rpmN) + 0.02) * (this.vrand(v) + this.vrand(v) - 1) * 2;
    const amp = e.pulseGain * (0.15 + 0.85 * load) * (0.75 + 0.35 * rpmN) * e.eventGain[k] * (1 + jit);
    const o = slot * 4;
    pool[o] = 0;
    pool[o + 1] = 1 / (durSec * this.sr);
    pool[o + 2] = amp;
    pool[o + 3] = 0.24 - 0.13 * load;
  }

  sideTick(s: any, y: number, vp: number) {
    s.gC += (s.gCt - s.gC) * this.kS;
    s.gO += (s.gOt - s.gO) * this.kS;
    s.out += (s.outT - s.out) * this.kS;
    s.fb += (s.fbT - s.fb) * this.kS;
    s.D += (s.Dt - s.D) * 0.0005;
    const z = this.runFB(s.st, y);
    let m = this.runFB(s.cl, z) * s.gC;
    if (s.hasValve) {
      const o = this.runFB(s.op, z) * s.gO;
      m = m * (1 - vp) + o * vp;
    }
    // tail-pipe comb resonance with damping inside the loop
    const L = this.combLen;
    let rp = s.w - s.D;
    if (rp < 0) rp += L;
    // w − D can be a tiny negative number; adding L then rounds to exactly L
    if (rp >= L) rp -= L;
    const i0 = rp | 0;
    const fr = rp - i0;
    const i1 = i0 + 1 >= L ? 0 : i0 + 1;
    const d = s.line[i0] * (1 - fr) + s.line[i1] * fr;
    s.damp += (d - s.damp) * this.kD;
    const yc = m + s.fb * s.damp;
    s.line[s.w] = yc;
    s.w = s.w + 1 >= L ? 0 : s.w + 1;
    // DC blocker (the pulse train carries a large mean-flow component)
    const h = yc - s.hx + this.dcR * s.hy;
    s.hx = yc;
    s.hy = h;
    return h * s.out;
  }

  /** Renders one sample of voice v into this.oL / oR / oM. */
  tickVoice(v: any) {
    const e = v.eng;
    const ch = v.ch;
    const sr = this.sr;
    const thr = this.thr;
    const rpm = Math.min(Math.max(this.rpm, e.idleRpm * 0.85), e.maxRpm);
    const rpmN = Math.min(Math.max((rpm - e.idleRpm) / (e.maxRpm - e.idleRpm), 0), 1);
    const over = Math.min(Math.max((rpm - e.idleRpm - 300) / 1000, 0), 1);
    const base = 0.12 * (1 - over) + 0.025 * over;
    const load = base + (1 - base) * thr;

    // crank advance & firing events
    v.theta += (rpm * 6) / sr;
    let guard = 0;
    while (v.theta >= v.nextAng && guard++ < 16) {
      this.spawn(v, rpm, load, rpmN);
      v.ev++;
      if (v.ev >= e.eventAngles.length) {
        v.ev = 0;
        v.theta -= 720;
      }
      const jitDeg = e.idleJitter * (1 - rpmN) * 6 * (this.vrand(v) - 0.5);
      v.nextAng = e.eventAngles[v.ev] + jitDeg;
    }

    // per-bank pulse trains
    let sL = 0;
    let sR = 0;
    let xL = 0;
    let xR = 0;
    for (let b = 0; b < 2; b++) {
      const pool = v.pool[b];
      let s = 0;
      for (let i = 0; i < 8; i++) {
        const o = i * 4;
        const ph = pool[o];
        if (ph < 1) {
          const r = pool[o + 3];
          const w = ph < r ? 0.5 - 0.5 * Math.cos((Math.PI * ph) / r) : 1;
          const d = 1 - ph;
          s += pool[o + 2] * w * d * d;
          pool[o] = ph + pool[o + 1];
        }
      }
      const n = this.runFB(v.noiseF[b], this.vrand(v) * 2 - 1);
      let src = s + e.rasp * 2.5 * n * s * (0.4 + 0.6 * load) + 1e-9;
      if (e.induction === 1) {
        const lp = this.runFB(v.turboF[b], src);
        src = src * (1 - e.turboDamping) + lp * e.turboDamping;
      }
      const x = this.runFB(v.pre[b], src);
      if (b === 0) {
        sL = s;
        xL = x;
      } else {
        sR = s;
        xR = x;
      }
    }

    // crossover: exchange the band selected by the cross filter
    v.cc += (v.ccT - v.cc) * this.kS;
    const c = v.cc * 0.5;
    const fL = this.runFB(v.cross[0], xL);
    const fR = this.runFB(v.cross[1], xR);
    const yL = xL + c * (fR - fL);
    const yR = xR + c * (fL - fR);

    // valve actuator
    let target = 0;
    if (this.valveMode === 1) target = 1;
    else if (this.valveMode === 2) {
      if (!v.vOpen && (rpm > ch.valveOpenRpm || thr > ch.valveThrottle)) v.vOpen = true;
      else if (v.vOpen && rpm < ch.valveCloseRpm && thr < ch.valveThrottle - 0.1) v.vOpen = false;
      target = v.vOpen ? 1 : 0;
    }
    v.vp += (target - v.vp) * this.kV;

    const tL = this.sideTick(v.side[0], yL, v.vp);
    const tR = this.sideTick(v.side[1], yR, v.vp);

    // engine bay: intake roar, mechanical noise, supercharger whine
    const raw = sL + sR;
    const ib = this.runFB(v.intakeF, raw) + 0.5 * this.runFB(v.intakeF2, raw);
    const inN = this.runFB(v.intakeN, this.vrand(v) * 2 - 1);
    const intakeAmt = e.intakeRoar * (0.08 + thr * thr * 1.2) * (0.15 + rpmN * rpmN * 1.6) * 0.3;
    const intake = (ib * 1.5 + inN * 0.35 * (0.3 + rpmN)) * intakeAmt;
    const mech = this.runFB(v.mechF, this.vrand(v) * 2 - 1) * e.mech * (0.003 + 0.035 * rpmN);
    let whine = 0;
    if (e.induction === 2) {
      v.whinePh += (e.whineOrder * rpm) / 60 / sr;
      if (v.whinePh > 1) v.whinePh -= 1;
      whine = Math.sin(2 * Math.PI * v.whinePh) * e.whineLevel * (0.2 + 0.8 * thr) * (0.2 + rpmN);
    }
    const bay = intake + mech + whine;

    // listener: the far tip arrives ~2.5 ms later (≈0.85 m path difference, assumed)
    v.xdL[v.xw] = tL;
    v.xdR[v.xw] = tR;
    let ri = v.xw - v.xDelay;
    if (ri < 0) ri += 512;
    const dL = v.xdL[ri];
    const dR = v.xdR[ri];
    v.xw = v.xw + 1 >= 512 ? 0 : v.xw + 1;
    const exL = tL + 0.45 * dR + 0.18 * bay;
    const exR = tR + 0.45 * dL + 0.18 * bay;
    const cab = this.runFB(v.cabin, 0.5 * (tL + dR)) * 0.32 + this.runFB(v.firewall, bay) * 0.1;
    const lm = this.lm;
    this.oL = exL * (1 - lm) + cab * lm;
    this.oR = exR * (1 - lm) + cab * lm;
    this.oM = 0.5 * (this.oL + this.oR);
  }

  voiceOut(slot: number) {
    const v = this.voices[slot];
    if (!v) {
      this.oL = 0;
      this.oR = 0;
      this.oM = 0;
      return;
    }
    const old = this.olds[slot];
    if (old && this.xf[slot] < 1) {
      this.tickVoice(old);
      const l0 = this.oL, r0 = this.oR;
      this.tickVoice(v);
      const a = this.xf[slot];
      this.oL = l0 * (1 - a) + this.oL * a;
      this.oR = r0 * (1 - a) + this.oR * a;
      this.oM = 0.5 * (this.oL + this.oR);
      this.xf[slot] = a + this.xfStep;
      if (this.xf[slot] >= 1) {
        this.xf[slot] = 1;
        this.olds[slot] = null;
        const p = this.pending[slot];
        if (p) {
          this.pending[slot] = null;
          this.setVoice(slot, p.eng, p.ch);
        }
      }
      return;
    }
    this.tickVoice(v);
  }

  recover(slot: number) {
    const v = this.voices[slot];
    this.recoveries++;
    this.olds[slot] = null;
    this.xf[slot] = 1;
    if (v) this.voices[slot] = this.mkVoice(v.eng, v.ch, (v.rng | 0) || 1);
    this.kw[slot] = this.mkKW();
    this.lev[slot] = 1e-12;
    this.normG = 1;
  }

  // ───────────── control & render ─────────────

  control(c: CoreControl) {
    if (c.rpm !== undefined) {
      this.rpmT = c.rpm;
      if (c.directRpm || this.direct) this.rpm = c.rpm;
    }
    if (c.throttle !== undefined) this.thrT = Math.min(Math.max(c.throttle, 0), 1);
    if (c.valveMode !== undefined) this.valveMode = c.valveMode;
    if (c.monitor !== undefined) this.monitor = c.monitor;
    if (c.normalize !== undefined) this.normalize = c.normalize;
    if (c.listener !== undefined) this.listener = c.listener;
    if (c.master !== undefined) this.master = c.master;
    if (c.directRpm !== undefined) this.direct = c.directRpm;
    if (c.solo !== undefined) this.solo = c.solo;
    if (c.agc !== undefined) this.agcOn = c.agc;
  }

  /** Message entry point shared by the worklet and the ScriptProcessor fallback. */
  handle(msg: any) {
    if (!msg) return;
    if (msg.type === 'voice') this.setVoice(msg.slot, msg.engine, msg.chain);
    else if (msg.type === 'control') this.control(msg.control);
    else if (msg.type === 'snap') {
      // jump state without smoothing (offline renders)
      this.thr = this.thrT;
      this.lm = this.listener;
      this.mon = this.monitor;
    }
  }

  clip(x: number) {
    const a = x < 0 ? -x : x;
    if (a < 0.6) return x;
    const y = 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
    return x < 0 ? -y : y;
  }

  render(outL: Float32Array, outR: Float32Array, tapA: Float32Array | null, tapB: Float32Array | null, n: number) {
    for (let i = 0; i < n; i++) {
      if (!this.direct) {
        let d = (this.rpmT - this.rpm) * this.kR;
        const up = this.slewUp / this.sr;
        const dn = this.slewDown / this.sr;
        if (d > up) d = up;
        else if (d < -dn) d = -dn;
        this.rpm += d;
      }
      this.thr += (this.thrT - this.thr) * this.kT;
      this.lm += (this.listener - this.lm) * this.kM;

      let aL = 0, aR = 0, aM = 0, bL = 0, bR = 0, bM = 0;
      if (this.solo !== 1 && this.voices[0]) {
        this.voiceOut(0);
        aL = this.oL; aR = this.oR; aM = this.oM;
      }
      if (this.solo !== 0 && this.voices[1]) {
        this.voiceOut(1);
        bL = this.oL; bR = this.oR; bM = this.oM;
      }
      // NaN guard: a non-finite value would poison every recursive filter state forever
      if (aM !== aM || aM === Infinity || aM === -Infinity) {
        this.recover(0);
        aL = aR = aM = 0;
      }
      if (bM !== bM || bM === Infinity || bM === -Infinity) {
        this.recover(1);
        bL = bR = bM = 0;
      }

      const ka = this.runFB(this.kw[0], aM);
      const kb = this.runFB(this.kw[1], bM);
      this.lev[0] += (ka * ka - this.lev[0]) * this.kL;
      this.lev[1] += (kb * kb - this.lev[1]) * this.kL;
      let g = 1;
      if (this.normalize && this.lev[0] > 1e-10 && this.lev[1] > 1e-10) {
        g = Math.sqrt(this.lev[0] / this.lev[1]);
        if (g < 0.063) g = 0.063;
        else if (g > 16) g = 16;
      }
      this.normG += (g - this.normG) * this.kG;
      this.mon += (this.monitor - this.mon) * this.kM;
      // assist gain: boost only (≤ +24 dB) towards −24 dB K-weighted. Referenced to the louder of
      // A and B-as-heard and applied equally to both → A/B ratio untouched and no clipping.
      let ag = 1;
      const levB = this.normalize ? this.lev[1] * this.normG * this.normG : this.lev[1];
      const ref = this.voices[1] && this.solo !== 0 ? Math.max(this.lev[0], levB) : this.lev[0];
      if (this.agcOn && ref > 1e-12) {
        ag = Math.sqrt(0.004 / ref);
        if (ag < 1) ag = 1;
        else if (ag > 16) ag = 16;
      }
      this.agcG += (ag - this.agcG) * (ag < this.agcG ? this.kAd : this.kAu);
      const ga = (1 - this.mon) * this.master * this.agcG;
      const gb = this.mon * this.normG * this.master * this.agcG;
      const l = this.clip(aL * ga + bL * gb);
      const r = this.clip(aR * ga + bR * gb);
      outL[i] = l;
      outR[i] = r;
      const pk = l < 0 ? -l : l;
      if (pk > this.peak) this.peak = pk;
      // analysis taps use the LH-tip-side channel: the crossover conserves L+R, so a sum would hide X/H effects
      if (tapA) tapA[i] = aL * this.master;
      if (tapB) tapB[i] = bL * this.normG * this.master;
    }
  }

  telemetry(): CoreTelemetry {
    const t = {
      rpm: this.rpm,
      throttle: this.thr,
      valve: [this.voices[0] ? this.voices[0].vp : 0, this.voices[1] ? this.voices[1].vp : 0],
      levelDb: [10 * Math.log10(this.lev[0] + 1e-12), 10 * Math.log10(this.lev[1] + 1e-12)],
      normGainDb: 20 * Math.log10(this.normG),
      monitor: this.mon,
      peak: this.peak,
      active: [!!this.voices[0], !!this.voices[1]],
      recoveries: this.recoveries,
      agcDb: 20 * Math.log10(this.agcG),
    };
    this.peak = 0;
    return t;
  }
}
