import { describe, expect, it } from 'vitest';
import { engineById, ENGINES } from '../src/data/engines';
import { GS460_PRESETS, STOCK_EXHAUSTS, makePart, presetOemSilence, presetTiger5050 } from '../src/data/exhaust';
import { compileEngine, compileExhaust } from '../src/dsp/compile';
import { V8Core } from '../src/dsp/core';
import { linearSweep, renderOffline, steady } from '../src/dsp/offline';
import { bandPower, powerAt, powerSpectrum, rms, spectralCentroid, toDb } from '../src/analysis/fft';
import type { ExhaustConfig } from '../src/types';

const SR = 24000;
const gs = compileEngine(engineById('1ur-fse'));

function render(cfg: ExhaustConfig, rpm: number, thr: number, opts: { listener?: number; valveMode?: number; seconds?: number } = {}) {
  return renderOffline({
    sr: SR,
    seconds: opts.seconds ?? 1,
    voice: { engine: gs, chain: compileExhaust(cfg) },
    listener: opts.listener ?? 0,
    valveMode: opts.valveMode ?? 2,
    drive: steady(rpm, thr),
    warmup: 0.6,
  });
}

const spec = (x: Float32Array) => powerSpectrum(x, 0, 16384);
const halfOrderDb = (ps: Float64Array, rpm: number) => toDb([0.5, 1.5, 2.5, 3.5].reduce((a, o) => a + powerAt(ps, SR, (o * rpm) / 60, 1), 0));
const o4Db = (ps: Float64Array, rpm: number) => toDb(powerAt(ps, SR, (4 * rpm) / 60, 1));

describe('engine source', () => {
  it('firing order 4 (V8 firing frequency) dominates the engine orders at steady RPM', () => {
    const rpm = 3000;
    const ps = spec(render(presetTiger5050(), rpm, 0.5).L);
    const orders = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6];
    const db = orders.map((o) => toDb(powerAt(ps, SR, (o * rpm) / 60, 1)));
    expect(orders[db.indexOf(Math.max(...db))]).toBe(4);
  });

  it('changing RPM moves the firing frequency and brightens the spectrum', () => {
    const a = spec(render(presetTiger5050(), 2000, 0.4).L);
    const b = spec(render(presetTiger5050(), 4000, 0.4).L);
    // order-4 line is where it should be at each RPM
    expect(o4Db(a, 2000)).toBeGreaterThan(toDb(powerAt(a, SR, (4 * 4000) / 60, 1)));
    expect(o4Db(b, 4000)).toBeGreaterThan(toDb(powerAt(b, SR, (4 * 2000) / 60, 1)));
    expect(spectralCentroid(b, SR)).toBeGreaterThan(spectralCentroid(a, SR));
  });

  it('throttle (load) is independent of RPM and raises level and exhaust brightness', () => {
    const lo = render(presetOemSilence(), 3000, 0.1).L;
    const hi = render(presetOemSilence(), 3000, 0.9).L;
    expect(toDb(rms(hi) ** 2) - toDb(rms(lo) ** 2)).toBeGreaterThan(6);
    // harder pulses → more upper harmonics. (The spectral centroid is not used here: at light load the
    // quiet OEM exhaust lets the load-independent mechanical noise floor dominate above 3 kHz.)
    const bright = (x: Float32Array) => {
      const ps = spec(x);
      return toDb(bandPower(ps, SR, 800, 3200)) - toDb(bandPower(ps, SR, 50, 400));
    };
    expect(bright(hi) - bright(lo)).toBeGreaterThan(2);
  });

  it('RPM sweep is continuous (no clicks, no NaN)', () => {
    const r = renderOffline({
      sr: SR,
      seconds: 4,
      voice: { engine: gs, chain: compileExhaust(presetTiger5050()) },
      listener: 0,
      valveMode: 2,
      drive: linearSweep(800, 6400, 3.5, 1),
      directRpm: false,
    });
    let maxD = 0;
    let sumD = 0;
    for (let i = 1; i < r.L.length; i++) {
      const d = Math.abs(r.L[i] - r.L[i - 1]);
      expect(Number.isFinite(r.L[i])).toBe(true);
      maxD = Math.max(maxD, d);
      sumD += d * d;
    }
    const rmsD = Math.sqrt(sumD / r.L.length);
    expect(maxD).toBeLessThan(0.35);
    expect(maxD / rmsD).toBeLessThan(25);
    // RPM actually followed the drive (engine inertia model)
    expect(r.rpm[r.rpm.length - 1]).toBeGreaterThan(6000);
  });
});

describe('exhaust model is wired into the audio', () => {
  it('every GS460 preset produces a distinct sound', () => {
    const levels = GS460_PRESETS.map((p) => toDb(rms(render(p.make(), 3500, 0.6).L) ** 2));
    for (let i = 0; i < levels.length; i++)
      for (let j = i + 1; j < levels.length; j++) expect(Math.abs(levels[i] - levels[j])).toBeGreaterThan(0.5);
  });

  it('a Helmholtz resonator attenuates its tuning frequency', () => {
    const rpm = 1500; // order 4 = 100 Hz
    const base = presetOemSilence();
    const withRes: ExhaustConfig = JSON.parse(JSON.stringify(base));
    for (const side of ['left', 'right'] as const) withRes[side].splice(0, 0, makePart('res-helmholtz', { tuneHz: 100, depthDb: 15, q: 2 }));
    const a = spec(render(base, rpm, 0.3).L);
    const b = spec(render(withRes, rpm, 0.3).L);
    expect(o4Db(a, rpm) - o4Db(b, rpm)).toBeGreaterThan(6);
  });

  it('X-pipe merges the banks: per-side half-order burble drops relative to the firing order', () => {
    const rpm = 2500;
    const none = presetTiger5050();
    none.crossover = { type: 'none', coupling: 0, diameterMm: 63.5 };
    const x = presetTiger5050();
    x.crossover = { type: 'x', coupling: 1, diameterMm: 63.5 };
    const pn = spec(render(none, rpm, 0.6, { valveMode: 1 }).L);
    const px = spec(render(x, rpm, 0.6, { valveMode: 1 }).L);
    const rumbleNone = halfOrderDb(pn, rpm) - o4Db(pn, rpm);
    const rumbleX = halfOrderDb(px, rpm) - o4Db(px, rpm);
    expect(rumbleNone - rumbleX).toBeGreaterThan(6);
  });

  it('variable valve: OPEN is louder than CLOSED; AUTO follows RPM with hysteresis', () => {
    const open = rms(render(presetTiger5050(), 4000, 0.5, { valveMode: 1 }).L);
    const closed = rms(render(presetTiger5050(), 4000, 0.5, { valveMode: 0 }).L);
    expect(20 * Math.log10(open / closed)).toBeGreaterThan(6);

    const core = new V8Core(SR);
    core.seed = 7;
    core.control({ rpm: 2000, throttle: 0.2, valveMode: 2, directRpm: true, solo: 0, normalize: false });
    core.setVoice(0, gs, compileExhaust(presetTiger5050()));
    const buf = new Float32Array(SR);
    const run = (rpm: number) => {
      core.control({ rpm });
      core.render(buf, buf, null, null, buf.length);
      core.render(buf, buf, null, null, buf.length);
      return core.telemetry().valve[0];
    };
    expect(run(2000)).toBeLessThan(0.05);
    expect(run(3200)).toBeGreaterThan(0.95); // > autoOpenRpm 3000
    expect(run(2800)).toBeGreaterThan(0.95); // still above autoCloseRpm 2700 → stays open
    expect(run(2400)).toBeLessThan(0.05);
  });

  it('interior (estimated) listener is darker than exterior', () => {
    const ex = spec(render(presetTiger5050(), 3000, 0.5, { listener: 0 }).L);
    const inn = spec(render(presetTiger5050(), 3000, 0.5, { listener: 1 }).L);
    expect(spectralCentroid(inn, SR)).toBeLessThan(spectralCentroid(ex, SR) * 0.8);
  });
});

describe('A/B engine', () => {
  it('loudness normalisation matches B to A at the same operating point', () => {
    // what the listener hears: stereo output with A monitored vs B monitored (normalised)
    const heard = (monitor: number) => {
      const core = new V8Core(SR);
      core.seed = 11;
      core.control({ rpm: 3500, throttle: 0.6, valveMode: 2, monitor, normalize: true, master: 1, directRpm: true });
      core.handle({ type: 'snap' });
      core.setVoice(0, gs, compileExhaust(presetOemSilence()));
      core.setVoice(1, gs, compileExhaust(presetTiger5050()));
      const L = new Float32Array(SR * 3), R = new Float32Array(SR * 3);
      core.render(L, R, null, null, L.length);
      const mono = L.map((v, i) => 0.5 * (v + R[i]));
      // K-weighting-like emphasis (presence region) via the analysis band ratio is not needed here:
      // compare level in the 100 Hz–4 kHz band, where the K-weighted meter and plain RMS agree best
      const ps = powerSpectrum(mono, mono.length - 16384, 16384);
      return { t: core.telemetry(), db: toDb(bandPower(ps, SR, 100, 4000)) };
    };
    const a = heard(0);
    const b = heard(1);
    expect(b.t.levelDb[1] - b.t.levelDb[0]).toBeGreaterThan(6); // B really is louder
    expect(Math.abs(b.t.normGainDb + (b.t.levelDb[1] - b.t.levelDb[0]))).toBeLessThan(1); // gain compensates it
    expect(Math.abs(b.db - a.db)).toBeLessThan(2.5);
  });

  it('regression: no NaN at common sample rates for every exhaust model (comb read-index bug)', () => {
    const chains = [...GS460_PRESETS.map((p) => p.make()), ...Object.values(STOCK_EXHAUSTS).map((m) => m())];
    for (const sr of [22050, 44100, 48000, 96000]) {
      for (const cfg of chains) {
        for (const e of ENGINES) {
          const core = new V8Core(sr);
          core.control({ rpm: 650, throttle: 0, valveMode: 2, directRpm: true, solo: 0 });
          core.setVoice(0, compileEngine(e), compileExhaust(cfg));
          const buf = new Float32Array(Math.round(sr * 0.05));
          core.render(buf, buf, null, null, buf.length);
          expect(buf.every(Number.isFinite)).toBe(true);
          expect(core.telemetry().recoveries).toBe(0);
        }
      }
    }
  });
});
