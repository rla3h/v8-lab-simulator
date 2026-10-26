import type { CarSpec } from './cars';
import { renderCarCanvas, type Tip } from './carArt';
import { BOOST_TIME, cornerSpeed, kmh, newDriveState, revNeutral, stepCar, tryBoost, type DriveState, type RoadSample } from './physics';
import { TrackRenderer } from './render';
import { buildBackdrop, buildSprites } from './sprites';
import { SEG_LEN, heightAt, type Track } from './tracks';
import type { DriveAudio } from './driveAudio';

export type Phase = 'countdown' | 'race' | 'paused' | 'finished';

export interface UiState {
  phase: Phase;
  timeMs: number;
  bestMs: number | null;
  lap: number;
  laps: number;
  progress: number;
  topKmh: number;
  boostsUsed: number;
  newBest: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  kind: 'smoke' | 'spark';
}

interface Line {
  a: number;
  r: number;
  len: number;
  sp: number;
}

const BEST_KEY = 'v8lab.drive.best.v1';

export function loadBest(trackId: string, carId: string): number | null {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    return all?.[trackId]?.[carId] ?? null;
  } catch {
    return null;
  }
}

function saveBest(trackId: string, carId: string, ms: number) {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    all[trackId] = { ...(all[trackId] || {}), [carId]: ms };
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — best times are a convenience only */
  }
}

export function fmtTime(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

const KEYMAP: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export class DriveGame {
  readonly st: DriveState;
  readonly renderer: TrackRenderer;
  phase: Phase = 'countdown';
  private prevPhase: Phase = 'countdown';
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private countdown = 3.6;
  private z: number;
  private startZ: number;
  private time = 0;
  private best: number | null;
  private topKmh = 0;
  private boostsUsed = 0;
  private newBest = false;
  private keys = { up: false, down: false, left: false, right: false };
  private touch = { up: false, down: false, left: false, right: false };
  private throttle = 0;
  private brake = 0;
  private bgFar = 0;
  private bgNear = 0;
  private particles: Particle[] = [];
  private lines: Line[] = [];
  private msgs: { text: string; t: number; color: string }[] = [];
  private crashCool = 0;
  private carCache: { w: number; normal: HTMLCanvasElement; brake: HTMLCanvasElement; tips: Tip[] } | null = null;
  private uiTimer = 0;
  private fps = 60;
  private zoomCanvas: HTMLCanvasElement | null = null;
  private lastOffroadMsg = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly car: CarSpec,
    readonly track: Track,
    private audio: DriveAudio | null,
    private onUi: (s: UiState) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.st = newDriveState(car);
    this.renderer = new TrackRenderer(track, buildSprites(track.theme), buildBackdrop(track.theme));
    this.startZ = (track.segments.findIndex((s) => s.marker === 'start') - 1.2) * SEG_LEN;
    this.z = this.startZ;
    this.best = loadBest(track.id, car.id);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    (window as any).__v8drive = this;
  }

  // ───────────── lifecycle ─────────────

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.flash('READY', '#f8fafc');
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    if ((window as any).__v8drive === this) delete (window as any).__v8drive;
  }

  togglePause() {
    if (this.phase === 'finished') return;
    if (this.phase === 'paused') {
      this.phase = this.prevPhase;
      this.last = performance.now();
    } else {
      this.prevPhase = this.phase;
      this.phase = 'paused';
    }
    this.emitUi(true);
  }

  setTouch(k: 'up' | 'down' | 'left' | 'right', on: boolean) {
    this.touch[k] = on;
  }

  pressBoost() {
    if (this.phase !== 'race') return;
    if (tryBoost(this.st)) {
      this.boostsUsed++;
      this.flash('X BOOST!', '#22d3ee');
      this.audio?.boost();
    } else if (this.st.boostT <= 0) this.flash(`게이지 충전 중 ${Math.floor(this.st.gauge * 100)}%`, '#94a3b8');
  }

  private onBlur = () => {
    this.keys = { up: false, down: false, left: false, right: false };
    if (this.phase === 'race' || this.phase === 'countdown') this.togglePause();
  };

  private onKey = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
    const down = e.type === 'keydown';
    const k = KEYMAP[e.code];
    if (k) {
      this.keys[k] = down;
      e.preventDefault();
      return;
    }
    if (!down || e.repeat) return;
    if (e.code === 'KeyX') {
      e.preventDefault();
      this.pressBoost();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      this.togglePause();
    }
  };

  private flash(text: string, color: string) {
    this.msgs = [{ text, t: 1.4, color }, ...this.msgs.filter((m) => m.text !== text)].slice(0, 3);
  }

  // ───────────── simulation ─────────────

  private segAt(z: number) {
    const n = this.track.segments.length;
    const i = Math.floor(z / SEG_LEN);
    return this.track.segments[((i % n) + n) % n];
  }

  private road(z: number): RoadSample {
    const seg = this.segAt(z);
    return {
      curve: seg.curve,
      slope: (seg.y2 - seg.y1) / SEG_LEN,
      halfWidthM: this.track.halfWidthM,
      wallL: this.track.wallL,
      wallR: this.track.wallR,
      offroadGrip: this.track.offroadGrip,
      offroadDrag: this.track.offroadDrag,
    };
  }

  private update(dt: number) {
    const st = this.st;
    const up = this.keys.up || this.touch.up;
    const dn = this.keys.down || this.touch.down;
    const steer = (this.keys.right || this.touch.right ? 1 : 0) - (this.keys.left || this.touch.left ? 1 : 0);
    this.throttle += ((up ? 1 : 0) - this.throttle) * (1 - Math.exp(-dt * 5));
    this.brake += ((dn ? 1 : 0) - this.brake) * (1 - Math.exp(-dt * 8));

    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      revNeutral(this.car, st, this.throttle, dt);
      const now = Math.ceil(this.countdown);
      if (now !== before && now >= 1 && now <= 3) this.flash(String(now), '#f8fafc');
      if (this.countdown <= 0) {
        this.phase = 'race';
        this.flash('GO!', '#22c55e');
      }
      return;
    }

    const finished = this.phase === 'finished';
    const inp = finished ? { throttle: 0, brake: 0.35, steer: -st.x * 0.8 } : { throttle: this.throttle, brake: this.brake, steer };
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const ev = stepCar(this.car, st, inp, this.road(this.z), h);
      this.z += st.v * 100 * h;
      if (ev.wall) {
        this.audio?.impact(ev.wall);
        this.sparks(ev.wall);
        this.flash('WALL!', '#f87171');
      }
      if (ev.boostEnd) this.flash('BOOST END', '#94a3b8');
    }
    if (!finished) this.time += dt;
    this.topKmh = Math.max(this.topKmh, kmh(st.v));
    this.collideSprites();

    const seg = this.segAt(this.z);
    const segsMoved = (st.v * dt * 100) / SEG_LEN;
    this.bgFar += seg.curve * segsMoved * 0.0009;
    this.bgNear += seg.curve * segsMoved * 0.0018;

    if (st.slip > 0.45 && !finished) this.flash('SLIDE!', '#fbbf24');
    if (st.offroad && st.v > 8 && performance.now() - this.lastOffroadMsg > 2500) {
      this.lastOffroadMsg = performance.now();
      this.flash('OFF ROAD', '#fb923c');
    }

    // laps / finish
    if (!finished) {
      const t = this.track;
      if (t.loop) {
        const lapLen = t.segments.length * SEG_LEN;
        const d = this.z - (this.startZ + 1.2 * SEG_LEN);
        const lap = Math.floor(d / lapLen) + 1;
        if (lap > t.laps) this.finish();
        else if (lap > this.lapShown) {
          this.lapShown = lap;
          if (lap > 1) this.flash(`LAP ${lap}/${t.laps}`, '#f97316');
        }
      } else if (this.z >= t.finishIndex * SEG_LEN) this.finish();
    }
  }

  private lapShown = 1;

  private finish() {
    this.phase = 'finished';
    const ms = Math.round(this.time * 1000);
    if (this.best === null || ms < this.best) {
      this.best = ms;
      this.newBest = true;
      saveBest(this.track.id, this.car.id, ms);
    }
    this.flash('FINISH', '#22c55e');
    this.emitUi(true);
  }

  private collideSprites() {
    if (this.crashCool > 0) return;
    const st = this.st;
    const seg = this.segAt(this.z);
    for (const sp of seg.sprites) {
      if (!sp.collide || Math.abs(sp.offset) < 1) continue;
      const img = this.renderer.sprites[sp.kind];
      const half = (img.w / 2 + 0.9) / this.track.halfWidthM;
      if (Math.abs(st.x - sp.offset) < half) {
        const impact = st.v;
        st.v *= 0.3;
        st.vLat = -Math.sign(sp.offset) * 4;
        st.x += -Math.sign(sp.offset) * 0.15;
        this.crashCool = 0.8;
        this.audio?.impact(impact * 0.3);
        this.sparks(impact * 0.4);
        this.flash('CRASH!', '#f87171');
        return;
      }
    }
  }

  private sparks(strength: number) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const side = this.st.x < 0 ? -1 : 1;
    for (let i = 0; i < Math.min(40, 10 + strength * 3); i++) {
      this.particles.push({
        x: W / 2 + side * W * 0.12,
        y: H * 0.85,
        vx: (Math.random() - 0.5) * W * 0.8 + side * W * 0.2,
        vy: -Math.random() * H * 0.8,
        r: 2 + Math.random() * 2,
        life: 0.5,
        max: 0.5,
        kind: 'spark',
      });
    }
  }

  // ───────────── frame ─────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dtRaw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.1, Math.max(0, dtRaw));
    if (dtRaw > 0) this.fps += (1 / Math.max(dtRaw, 1e-3) - this.fps) * 0.05;
    this.resize();
    if (this.phase !== 'paused') {
      this.update(dt);
      this.crashCool = Math.max(0, this.crashCool - dt);
      this.msgs.forEach((m) => (m.t -= dt));
      this.msgs = this.msgs.filter((m) => m.t > 0);
    }
    this.draw(this.phase === 'paused' ? 0 : dt);
    const st = this.st;
    this.audio?.update({
      rpm: st.rpm,
      throttle: this.phase === 'countdown' ? this.throttle : st.engineThrottle,
      v: st.v,
      slip: st.slip,
      spin: st.spin,
      boost: st.boostT > 0,
      paused: this.phase === 'paused',
    });
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) this.emitUi(false);
  };

  private emitUi(force: boolean) {
    if (!force && this.uiTimer > 0) return;
    this.uiTimer = 0.12;
    const t = this.track;
    const lapLen = t.segments.length * SEG_LEN;
    const progress = t.loop
      ? Math.min(1, Math.max(0, (this.z - this.startZ) / (lapLen * t.laps)))
      : Math.min(1, Math.max(0, (this.z - this.startZ) / (t.finishIndex * SEG_LEN - this.startZ)));
    this.onUi({
      phase: this.phase,
      timeMs: Math.round(this.time * 1000),
      bestMs: this.best,
      lap: Math.min(this.lapShown, t.laps),
      laps: t.laps,
      progress,
      topKmh: this.topKmh,
      boostsUsed: this.boostsUsed,
      newBest: this.newBest,
    });
  }

  private resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const r = c.getBoundingClientRect();
    const w = Math.max(320, Math.min(1920, Math.round(r.width * dpr)));
    const h = Math.max(180, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      this.zoomCanvas = null;
    }
  }

  private carSprites(carW: number) {
    if (this.carCache && Math.abs(this.carCache.w - carW) < 8) return this.carCache;
    const cw = Math.round(carW / 0.88);
    const ch = Math.round(cw * 0.86);
    const night = this.track.theme.night;
    const a = renderCarCanvas(this.car.art, cw, ch, { brake: false, lights: night });
    const b = renderCarCanvas(this.car.art, cw, ch, { brake: true, lights: true });
    this.carCache = { w: carW, normal: a.canvas, brake: b.canvas, tips: a.tips };
    return this.carCache;
  }

  private draw(dt: number) {
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const st = this.st;
    const speedFrac = Math.min(1, st.v / 80);
    const boosting = st.boostT > 0;
    const t = performance.now() / 1000;

    // camera
    const fov = 98 + speedFrac * 10 + (boosting ? 16 * Math.min(1, (BOOST_TIME - st.boostT) * 3, st.boostT * 2) : 0);
    const shakeAmp = (speedFrac * speedFrac * 1.4 + (st.wallT > 0 ? 7 : 0) + (st.offroad ? 4 * speedFrac : 0) + (boosting ? 2 : 0)) * (H / 720);
    const shakeX = (Math.random() - 0.5) * shakeAmp;
    const shakeY = (Math.random() - 0.5) * shakeAmp;
    const depth = 1 / Math.tan(((fov / 2) * Math.PI) / 180);
    const focal = (depth * Math.max(W, H * 1.5)) / 2;
    const carBottom = H * 0.965;
    const horizonY = H * 0.47;
    const playerZ = (this.track.cameraHeight * focal) / (carBottom - horizonY);
    const camZ = this.z - playerZ;
    const playerY = heightAt(this.track, this.z);
    const nextY = heightAt(this.track, this.z + 2000);
    const out = this.renderer.render(g, W, H, {
      position: camZ,
      playerX: st.x,
      playerY,
      fovDeg: fov,
      shakeX,
      shakeY,
      bgFar: this.bgFar,
      bgNear: this.bgNear,
      bgPitch: Math.max(-0.08, Math.min(0.08, (playerY - nextY) / 20000)),
    });

    // night: darkness outside the headlight pool + additive lamp glows
    if (this.track.theme.night) {
      const hl = g.createRadialGradient(W / 2, H * 0.78, H * 0.08, W / 2, H * 0.62, H * 0.95);
      hl.addColorStop(0, 'rgba(0,0,0,0)');
      hl.addColorStop(0.45, 'rgba(2,4,12,0.35)');
      hl.addColorStop(1, 'rgba(2,4,12,0.78)');
      g.fillStyle = hl;
      g.fillRect(0, 0, W, H);
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const gl of out.glows) {
        const rg = g.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r);
        rg.addColorStop(0, 'rgba(255,170,80,0.35)');
        rg.addColorStop(1, 'rgba(255,140,60,0)');
        g.fillStyle = rg;
        g.fillRect(gl.x - gl.r, gl.y - gl.r, gl.r * 2, gl.r * 2);
      }
      const beam = g.createLinearGradient(0, H * 0.55, 0, H);
      beam.addColorStop(0, 'rgba(255,245,220,0)');
      beam.addColorStop(1, 'rgba(255,245,220,0.12)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(W * 0.5 - W * 0.06, H * 0.55);
      g.lineTo(W * 0.5 + W * 0.06, H * 0.55);
      g.lineTo(W * 0.95, H);
      g.lineTo(W * 0.05, H);
      g.closePath();
      g.fill();
      g.restore();
    }

    // speed lines (behind the car)
    this.drawSpeedLines(g, W, H, horizonY, speedFrac, boosting, dt);

    // player car
    const carW = Math.min(W * 0.27, H * 0.62);
    const cs = this.carSprites(carW);
    const img = this.brake > 0.3 || this.phase === 'finished' ? cs.brake : cs.normal;
    const yaw = -st.steer * 0.03 - Math.sign(this.segAt(this.z).curve) * st.slip * 0.07;
    const bounce = (st.offroad ? Math.sin(t * 40) * H * 0.004 * speedFrac : 0) + Math.sin(t * 13) * H * 0.0012 * speedFrac;
    const cx = W / 2 + st.vLat * W * 0.004 + shakeX * 0.3;
    const cy = carBottom + bounce;
    g.save();
    g.translate(cx, cy);
    g.rotate(yaw);
    g.drawImage(img, -img.width / 2, -img.height * 0.94, img.width, img.height);
    // boost flames from each tip
    if (boosting) {
      for (const tip of cs.tips) {
        const fx = tip.x - img.width / 2;
        const fy = tip.y - img.height * 0.94;
        const len = tip.r * (2.4 + Math.random() * 1.6);
        const fg = g.createRadialGradient(fx, fy, 0, fx, fy + len * 0.2, len);
        fg.addColorStop(0, 'rgba(220,245,255,0.95)');
        fg.addColorStop(0.25, 'rgba(90,170,255,0.85)');
        fg.addColorStop(0.55, 'rgba(255,140,40,0.55)');
        fg.addColorStop(1, 'rgba(255,80,20,0)');
        g.fillStyle = fg;
        g.beginPath();
        g.ellipse(fx, fy + len * 0.15, len * 0.75, len * 0.6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();

    // tyre smoke (slides & wheelspin)
    if ((st.slip > 0.12 || st.spin > 0.15) && dt > 0) {
      const amount = Math.max(st.slip, st.spin);
      for (const side of [-1, 1]) {
        if (Math.random() < amount * 0.9)
          this.particles.push({
            x: cx + side * carW * 0.4,
            y: cy - carW * 0.06,
            vx: side * W * (0.05 + Math.random() * 0.12),
            vy: H * (0.02 + Math.random() * 0.05),
            r: carW * 0.06,
            life: 0.9,
            max: 0.9,
            kind: 'smoke',
          });
      }
    }
    this.drawParticles(g, dt);

    // boost: zoom blur + vignette
    if (boosting) this.drawBoostFx(g, W, H, horizonY, st.boostT);

    this.drawHud(g, W, H);
  }

  private drawSpeedLines(g: CanvasRenderingContext2D, W: number, H: number, hy: number, sf: number, boosting: boolean, dt: number) {
    const target = Math.round(Math.max(0, sf - 0.35) * 70 + (boosting ? 45 : 0));
    while (this.lines.length < target) this.lines.push({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.6 + 0.2, len: 0.05 + Math.random() * 0.12, sp: 0.8 + Math.random() * 1.2 });
    if (this.lines.length > target) this.lines.length = target;
    if (!target) return;
    const R = Math.hypot(W, H) * 0.6;
    const vx = W / 2;
    const vy = hy * 0.98;
    g.save();
    g.lineCap = 'round';
    for (const l of this.lines) {
      l.r += l.sp * dt * (1.2 + sf * 2.5) * (boosting ? 1.8 : 1);
      if (l.r > 1.25) {
        l.r = 0.18 + Math.random() * 0.25;
        l.a = Math.random() * Math.PI * 2;
      }
      // keep the centre (road ahead) mostly clear
      const ca = Math.cos(l.a);
      const sa = Math.sin(l.a);
      if (sa > 0.25 && Math.abs(ca) < 0.45) continue;
      const r0 = l.r * R;
      const r1 = (l.r + l.len * (0.6 + sf)) * R;
      g.strokeStyle = boosting ? `rgba(160,245,255,${0.18 + 0.25 * sf})` : `rgba(255,255,255,${0.08 + 0.22 * sf})`;
      g.lineWidth = (boosting ? 2.6 : 1.6) * (H / 720) * (0.6 + l.r);
      g.beginPath();
      g.moveTo(vx + ca * r0, vy + sa * r0);
      g.lineTo(vx + ca * r1, vy + sa * r1);
      g.stroke();
    }
    g.restore();
  }

  private drawParticles(g: CanvasRenderingContext2D, dt: number) {
    const H = this.canvas.height;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') p.vy += H * 2.2 * dt;
      else p.r *= 1 + dt * 1.8;
    }
    this.particles = this.particles.filter((p) => p.life > 0).slice(-160);
    for (const p of this.particles) {
      const a = p.life / p.max;
      if (p.kind === 'smoke') {
        g.fillStyle = `rgba(210,210,215,${0.28 * a})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      } else {
        g.strokeStyle = `rgba(255,${150 + Math.round(80 * a)},60,${a})`;
        g.lineWidth = p.r * 0.6;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        g.stroke();
      }
    }
  }

  private drawBoostFx(g: CanvasRenderingContext2D, W: number, H: number, hy: number, boostT: number) {
    if (!this.zoomCanvas) {
      this.zoomCanvas = document.createElement('canvas');
      this.zoomCanvas.width = Math.round(W / 2);
      this.zoomCanvas.height = Math.round(H / 2);
    }
    const zc = this.zoomCanvas;
    const zg = zc.getContext('2d')!;
    zg.drawImage(this.canvas, 0, 0, zc.width, zc.height);
    g.save();
    for (const [s, a] of [
      [1.04, 0.22],
      [1.09, 0.14],
    ] as const) {
      g.globalAlpha = a;
      const w = W * s;
      const h = H * s;
      g.drawImage(zc, W / 2 - w / 2, hy - (hy / H) * h, w, h);
    }
    g.globalAlpha = 1;
    const k = Math.min(1, boostT * 2);
    const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(34,211,238,${0.28 * k})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ───────────── HUD ─────────────

  private drawHud(g: CanvasRenderingContext2D, W: number, H: number) {
    const st = this.st;
    const car = this.car;
    // HUD scale: readable on small canvases (phones), not oversized on large ones
    const u = Math.max(0.78, Math.min(1.6, H / 620));
    const font = (px: number, w = 700) => `${w} ${Math.round(px * u)}px "Segoe UI", "Malgun Gothic", Arial, sans-serif`;
    const mono = (px: number) => `700 ${Math.round(px * u)}px "Consolas", ui-monospace, monospace`;
    const panel = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = 'rgba(8,10,14,0.55)';
      g.beginPath();
      g.roundRect(x, y, w, h, 10 * u);
      g.fill();
    };

    // top-left: track, time, best, lap, progress
    panel(14 * u, 14 * u, 300 * u, 112 * u);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#f97316';
    g.font = font(13);
    g.fillText(`${this.track.name} · ${this.track.nameKo}`, 26 * u, 36 * u);
    g.fillStyle = '#f8fafc';
    g.font = mono(32);
    g.fillText(fmtTime(this.time * 1000), 26 * u, 72 * u);
    g.font = font(12, 600);
    g.fillStyle = '#94a3b8';
    g.fillText(`BEST ${this.best !== null ? fmtTime(this.best) : '--:--.--'}`, 26 * u, 94 * u);
    if (this.track.loop) {
      g.textAlign = 'right';
      g.fillStyle = '#f8fafc';
      g.fillText(`LAP ${Math.min(this.lapShown, this.track.laps)}/${this.track.laps}`, 300 * u, 94 * u);
      g.textAlign = 'left';
    }
    const prog = (() => {
      const t = this.track;
      if (t.loop) return Math.min(1, Math.max(0, (this.z - this.startZ) / (t.segments.length * SEG_LEN * t.laps)));
      return Math.min(1, Math.max(0, (this.z - this.startZ) / (t.finishIndex * SEG_LEN - this.startZ)));
    })();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(26 * u, 106 * u, 276 * u, 6 * u);
    g.fillStyle = '#f97316';
    g.fillRect(26 * u, 106 * u, 276 * u * prog, 6 * u);

    // top-right: car
    g.textAlign = 'right';
    g.fillStyle = '#f8fafc';
    g.font = font(17);
    g.fillText(car.name, W - 20 * u, 38 * u);
    g.fillStyle = '#94a3b8';
    g.font = font(12, 600);
    g.fillText(`${car.engineLabel} · ${car.trans}`, W - 20 * u, 58 * u);
    g.fillStyle = '#fbbf24';
    g.font = font(10, 700);
    g.fillText('SIMULATED AUDIO · P 일시정지', W - 20 * u, 76 * u);

    // curve warning
    this.drawCurveWarning(g, W, u, font);

    // bottom-right: tach + speed + gear
    const cx = W - 120 * u;
    const cy = H - 100 * u;
    const rad = 82 * u;
    panel(cx - 108 * u, cy - 104 * u, 216 * u, 196 * u);
    const maxR = Math.ceil((car.redline + 400) / 1000) * 1000;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const ang = (r: number) => a0 + (a1 - a0) * Math.min(1, r / maxR);
    g.lineCap = 'round';
    g.lineWidth = 9 * u;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.arc(cx, cy, rad, a0, a1);
    g.stroke();
    g.strokeStyle = '#7f1d1d';
    g.beginPath();
    g.arc(cx, cy, rad, ang(car.redline - 300), a1);
    g.stroke();
    const shiftLight = st.rpm > car.redline * 0.93;
    g.strokeStyle = shiftLight ? '#ef4444' : '#f97316';
    g.beginPath();
    g.arc(cx, cy, rad, a0, ang(st.rpm));
    g.stroke();
    g.fillStyle = '#64748b';
    g.font = font(10, 600);
    g.textAlign = 'center';
    for (let r = 0; r <= maxR; r += 1000) {
      const a = ang(r);
      g.fillText(String(r / 1000), cx + Math.cos(a) * (rad - 20 * u), cy + Math.sin(a) * (rad - 20 * u) + 4 * u);
    }
    g.fillStyle = '#f8fafc';
    g.font = mono(40);
    g.fillText(String(Math.round(kmh(st.v))), cx, cy + 10 * u);
    g.fillStyle = '#94a3b8';
    g.font = font(11, 600);
    g.fillText('km/h', cx, cy + 28 * u);
    g.fillStyle = shiftLight ? '#ef4444' : '#22d3ee';
    g.font = mono(26);
    g.fillText(this.phase === 'countdown' ? 'N' : String(st.shiftT > 0 ? st.pendingGear : st.gear), cx, cy + 66 * u);
    g.fillStyle = '#64748b';
    g.font = font(10, 600);
    g.fillText(`${Math.round(st.rpm)} rpm`, cx, cy + 84 * u);

    // bottom-left: boost gauge
    const bx = 22 * u;
    const by = H - 70 * u;
    const bw = 260 * u;
    panel(bx - 8 * u, by - 34 * u, bw + 16 * u, 74 * u);
    const full = st.gauge >= 0.999 && st.boostT <= 0;
    const boosting = st.boostT > 0;
    g.textAlign = 'left';
    g.fillStyle = boosting ? '#22d3ee' : full ? '#fde047' : '#cbd5e1';
    g.font = font(13);
    g.fillText(boosting ? `X BOOST  ${st.boostT.toFixed(1)}s` : full ? 'X BOOST READY — X' : `X BOOST  ${Math.floor(st.gauge * 100)}%`, bx, by - 12 * u);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.beginPath();
    g.roundRect(bx, by, bw, 16 * u, 8 * u);
    g.fill();
    const gg = g.createLinearGradient(bx, 0, bx + bw, 0);
    gg.addColorStop(0, '#0891b2');
    gg.addColorStop(1, boosting ? '#a5f3fc' : full ? '#fde047' : '#22d3ee');
    g.fillStyle = gg;
    g.beginPath();
    g.roundRect(bx, by, Math.max(6 * u, bw * st.gauge), 16 * u, 8 * u);
    g.fill();
    if (full) {
      g.strokeStyle = `rgba(253,224,71,${0.5 + 0.5 * Math.sin(performance.now() / 120)})`;
      g.lineWidth = 2 * u;
      g.beginPath();
      g.roundRect(bx - 2 * u, by - 2 * u, bw + 4 * u, 20 * u, 9 * u);
      g.stroke();
    }
    g.fillStyle = '#64748b';
    g.font = font(10, 600);
    g.fillText('W 가속 · A/D 조향 · S 제동 · X 부스트 · P 일시정지', bx, by + 32 * u);

    // centre messages
    g.textAlign = 'center';
    this.msgs.forEach((m, i) => {
      const a = Math.min(1, m.t * 2);
      g.globalAlpha = a;
      g.fillStyle = m.color;
      g.font = font(i === 0 ? 46 : 22, 900);
      g.fillText(m.text, W / 2, H * 0.3 + i * 40 * u);
    });
    g.globalAlpha = 1;
    if (this.phase === 'countdown') {
      g.fillStyle = 'rgba(248,250,252,0.85)';
      g.font = font(14, 600);
      g.fillText('카운트다운 중 W로 공회전 레브 가능', W / 2, H * 0.3 + 70 * u);
    }
  }

  private drawCurveWarning(g: CanvasRenderingContext2D, W: number, u: number, font: (px: number, w?: number) => string) {
    const segs = this.track.segments;
    const n = segs.length;
    const i0 = Math.floor(this.z / SEG_LEN);
    let found = -1;
    let peak = 0;
    for (let k = 4; k < 75; k++) {
      const idx = i0 + k;
      if (!this.track.loop && idx >= n) break;
      const c = segs[idx % n].curve;
      if (Math.abs(c) >= 5.5) {
        if (found < 0) found = k;
        if (Math.abs(c) > Math.abs(peak)) peak = c;
      } else if (found >= 0) break;
    }
    if (found < 0) return;
    const adv = cornerSpeed(this.car, peak) * 3.6 * 0.95;
    const now = kmh(this.st.v);
    const over = now > adv * 1.08;
    const dist = Math.round((found * SEG_LEN) / 100);
    const x = W / 2;
    const y = 52 * u;
    g.fillStyle = over ? `rgba(220,38,38,${0.65 + 0.3 * Math.sin(performance.now() / 90)})` : 'rgba(234,179,8,0.85)';
    g.beginPath();
    g.roundRect(x - 150 * u, y - 30 * u, 300 * u, 58 * u, 10 * u);
    g.fill();
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.font = font(15, 900);
    g.fillText(`${peak > 0 ? '급커브 ▶' : '◀ 급커브'}  ${dist} m`, x, y - 6 * u);
    g.font = font(13, 700);
    g.fillText(over ? `감속! 권장 ${Math.round(adv)} km/h` : `권장 ${Math.round(adv)} km/h`, x, y + 16 * u);
  }
}

