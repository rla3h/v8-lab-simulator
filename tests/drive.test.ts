import { describe, expect, it } from 'vitest';
import { CARS } from '../src/drive/cars';
import {
  BOOST_TIME,
  carPerformance,
  kmh,
  newDriveState,
  stepCar,
  tryBoost,
  type DriveState,
  type RoadSample,
} from '../src/drive/physics';
import { getTrack, SEG_LEN, TRACK_IDS } from '../src/drive/tracks';
import { engineById } from '../src/data/engines';
import { stockExhaustFor, presetTiger5050 } from '../src/data/exhaust';
import { compileEngine, compileExhaust } from '../src/dsp/compile';
import { renderOffline, steady } from '../src/dsp/offline';
import { powerAt, powerSpectrum, rms } from '../src/analysis/fft';

const flat = (over: Partial<RoadSample> = {}): RoadSample => ({
  curve: 0,
  slope: 0,
  halfWidthM: 4,
  wallL: null,
  wallR: null,
  offroadGrip: 0.6,
  offroadDrag: 0.3,
  ...over,
});
const car = (id: string) => CARS.find((c) => c.id === id)!;
const run = (c = car('gs460'), st: DriveState, secs: number, inp = { throttle: 1, brake: 0, steer: 0 }, road = flat()) => {
  for (let t = 0; t < secs - 1e-9; t += 1 / 120) stepCar(c, st, inp, road, 1 / 120);
};

describe('vehicle line-up', () => {
  it('has the nine requested cars', () => {
    expect(CARS.map((c) => c.id)).toEqual(['gs460', 'gsf', 'isf', '86gt', 'ls460', 'avanten', 'tuscani', 'm5touring', 'm5sedan']);
  });

  it('GS460 uses the project exhaust design; every other car a stock model that exists', () => {
    for (const c of CARS) {
      if (c.id === 'gs460') expect(c.exhaust.kind).toBe('project');
      else if (c.exhaust.kind === 'stock') expect(() => stockExhaustFor(c.exhaust.kind === 'stock' ? c.exhaust.id : '')).not.toThrow();
    }
  });

  it.each(CARS.map((c) => [c.short, c] as const))('%s: engine sound renders, finite, with the right firing order dominant', (_, c) => {
    const def = engineById(c.engineId);
    const engine = { ...compileEngine(def), maxRpm: c.redline, idleRpm: c.idleRpm };
    const exhaust = c.exhaust.kind === 'project' ? presetTiger5050() : stockExhaustFor(c.exhaust.id);
    const sr = 24000;
    const rpm = 3000;
    const r = renderOffline({ sr, seconds: 0.8, voice: { engine, chain: compileExhaust(exhaust) }, listener: 0, valveMode: 1, drive: steady(rpm, 0.6), warmup: 0.5 });
    expect(r.L.every(Number.isFinite)).toBe(true);
    expect(rms(r.L)).toBeGreaterThan(1e-4);
    // Even-firing engines: the firing order is cylinders/2. One tailpipe alone legitimately carries
    // per-bank orders (e.g. 2.5 for a V10), so judge the L+R sum, where bank imbalance cancels.
    const mono = r.L.map((v, i) => 0.5 * (v + r.R[i]));
    const ps = powerSpectrum(mono, 0, 16384);
    const order = def.cylinders / 2;
    const at = (o: number) => powerAt(ps, sr, (o * rpm) / 60, 1);
    const family = [1, 2, 3].map((k) => at(order * k));
    const others = Array.from({ length: 12 }, (_, i) => (i + 1) / 2).filter((o) => Math.abs(o / order - Math.round(o / order)) > 1e-6).map(at);
    expect(Math.max(...family)).toBeGreaterThan(Math.max(...others));
  });
});

describe('longitudinal physics', () => {
  it('accelerates through the gears and orders the cars sensibly', () => {
    const p = Object.fromEntries(CARS.map((c) => [c.id, carPerformance(c)]));
    expect(p.m5sedan.t100).toBeLessThan(p.gs460.t100);
    expect(p.gs460.t100).toBeLessThan(p.tuscani.t100);
    expect(p['86gt'].t100).toBeLessThan(p.tuscani.t100);
    for (const c of CARS) {
      expect(p[c.id].t100).toBeGreaterThan(3.5);
      expect(p[c.id].t100).toBeLessThan(10);
      expect(p[c.id].topKmh).toBeGreaterThan(200);
      expect(p[c.id].topKmh).toBeLessThan(340);
    }
    const st = newDriveState(car('gs460'));
    run(car('gs460'), st, 15);
    expect(st.gear).toBeGreaterThanOrEqual(5);
  });

  it('S brakes hard; lifting off only engine-brakes', () => {
    const c = car('gs460');
    const a = newDriveState(c);
    run(c, a, 14);
    const b: DriveState = JSON.parse(JSON.stringify(a));
    const v0 = a.v;
    run(c, a, 2, { throttle: 0, brake: 1, steer: 0 });
    run(c, b, 2, { throttle: 0, brake: 0, steer: 0 });
    expect(kmh(v0 - a.v)).toBeGreaterThan(55);
    expect(kmh(v0 - b.v)).toBeLessThan(kmh(v0 - a.v) / 3);
  });

  it('downhill: the car rolls away unless braked', () => {
    const c = car('86gt');
    const down = flat({ slope: -0.08 });
    const rolling = newDriveState(c);
    run(c, rolling, 3, { throttle: 0, brake: 0, steer: 0 }, down);
    const held = newDriveState(c);
    run(c, held, 3, { throttle: 0, brake: 1, steer: 0 }, down);
    expect(rolling.v).toBeGreaterThan(1);
    expect(held.v).toBe(0);
  });
});

describe('X boost', () => {
  it('fires only at a full gauge and lasts exactly 3.2 s', () => {
    const c = car('gsf');
    const st = newDriveState(c);
    run(c, st, 5);
    expect(st.gauge).toBeLessThan(1);
    expect(tryBoost(st)).toBe(false);
    st.gauge = 1;
    expect(tryBoost(st)).toBe(true);
    expect(st.boostT).toBe(BOOST_TIME);
    run(c, st, 3.15);
    expect(st.boostT).toBeGreaterThan(0);
    run(c, st, 0.1);
    expect(st.boostT).toBe(0);
    expect(st.gauge).toBeLessThan(0.05);
  });

  it('adds real acceleration', () => {
    const c = car('ls460');
    const a = newDriveState(c);
    run(c, a, 10);
    const b: DriveState = JSON.parse(JSON.stringify(a));
    b.gauge = 1;
    tryBoost(b);
    const v0 = a.v;
    run(c, a, 1);
    run(c, b, 1);
    expect(b.v - v0).toBeGreaterThan(a.v - v0 + 2); // ≥ 7 km/h more per second
  });

  it('gauge charges faster at speed and while sliding', () => {
    const c = car('gs460');
    const slow = newDriveState(c);
    const fast = newDriveState(c);
    fast.v = 60;
    stepCar(c, slow, { throttle: 0, brake: 0, steer: 0 }, flat(), 1);
    stepCar(c, fast, { throttle: 0, brake: 0, steer: 0 }, flat(), 1);
    expect(fast.gauge).toBeGreaterThan(slow.gauge * 1.5);
  });
});

describe('cornering: outward push and slides', () => {
  const hairpin = flat({ curve: 10, halfWidthM: 4 });

  it('too fast into a hairpin: slides wide even with full steering', () => {
    const c = car('m5sedan');
    const st = newDriveState(c);
    st.v = 120 / 3.6;
    st.gear = 4;
    let maxSlip = 0;
    for (let t = 0; t < 1.5; t += 1 / 120) {
      stepCar(c, st, { throttle: 0.4, brake: 0, steer: 1 }, hairpin, 1 / 120);
      maxSlip = Math.max(maxSlip, st.slip);
    }
    expect(maxSlip).toBeGreaterThan(0.5);
    expect(st.x).toBeLessThan(-1); // curve bends right → car ends up off the left (outside) edge
    expect(kmh(st.v)).toBeLessThan(110); // the slide scrubs speed
  });

  it('slow enough + steering: holds the line', () => {
    const c = car('m5sedan');
    const st = newDriveState(c);
    st.v = 55 / 3.6;
    st.gear = 2;
    for (let t = 0; t < 3; t += 1 / 120) {
      const steer = Math.max(-1, Math.min(1, 0.65 + (0 - st.x) * 1.5));
      stepCar(c, st, { throttle: 0.25, brake: 0, steer }, hairpin, 1 / 120);
    }
    expect(Math.abs(st.x)).toBeLessThan(0.6);
    expect(st.slip).toBeLessThan(0.1);
  });

  it('no steering in a bend drifts the car outward', () => {
    const c = car('gs460');
    const st = newDriveState(c);
    st.v = 30;
    st.gear = 4;
    run(c, st, 1, { throttle: 0.3, brake: 0, steer: 0 }, flat({ curve: -3, halfWidthM: 4 }));
    expect(st.x).toBeGreaterThan(0.3); // left-hand bend → pushed to the right
  });

  it('barriers stop the car and cost speed', () => {
    const c = car('gs460');
    const st = newDriveState(c);
    st.v = 40;
    st.gear = 5;
    st.x = 1.17;
    st.vLat = 6;
    const ev = stepCar(c, st, { throttle: 0.5, brake: 0, steer: 0 }, flat({ wallR: 1.18 }), 1 / 30);
    expect(ev.wall).toBeGreaterThan(0);
    expect(st.x).toBeLessThanOrEqual(1.18);
    expect(st.v).toBeLessThan(40);
  });
});

describe('tracks', () => {
  it.each(TRACK_IDS)('%s is well formed', (id) => {
    const t = getTrack(id);
    expect(t.segments.length).toBeGreaterThan(300);
    expect(t.segments.some((s) => s.marker === 'start')).toBe(true);
    for (const s of t.segments) {
      expect(Number.isFinite(s.curve) && Number.isFinite(s.y1) && Number.isFinite(s.y2)).toBe(true);
      expect(Math.abs(s.curve)).toBeLessThanOrEqual(12);
    }
    if (t.loop) {
      expect(Math.abs(t.segments[t.segments.length - 1].y2 - t.segments[0].y1)).toBeLessThan(1);
    } else {
      expect(t.segments[t.finishIndex].marker).toBe('finish');
      expect(t.segments.length - t.finishIndex).toBeGreaterThanOrEqual(100);
    }
  });

  it('the downhill drops >250 m and has five consecutive hairpins', () => {
    const t = getTrack('touge');
    expect(t.descentM).toBeGreaterThan(250);
    let runs = 0;
    let inRun = false;
    for (const s of t.segments) {
      const hp = Math.abs(s.curve) >= 10;
      if (hp && !inRun) runs++;
      inRun = hp;
    }
    expect(runs).toBeGreaterThanOrEqual(5);
    expect(t.theme.night).toBe(true);
  });

  it('the coast road keeps the sea and its guardrail on the left', () => {
    const t = getTrack('coast');
    expect(t.segments.every((s) => s.railL)).toBe(true);
    expect(t.wallL).toBeCloseTo(-1.18);
    expect(t.lengthKm).toBeGreaterThan(4);
    expect(SEG_LEN).toBe(600);
  });
});
