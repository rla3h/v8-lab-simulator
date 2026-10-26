/**
 * Track geometry for the pseudo-3D renderer. A track is a list of short road segments, each with
 * a curve value (lateral bend; also the physics curvature) and start/end heights.
 * Units: segment length & heights in centimetres (renderer world units).
 */

export const SEG_LEN = 600; // 6 m

export type SpriteKind =
  | 'pine'
  | 'tree'
  | 'palm'
  | 'bush'
  | 'rock'
  | 'cliff'
  | 'lamp'
  | 'chevronL'
  | 'chevronR'
  | 'billboard1'
  | 'billboard2'
  | 'billboard3'
  | 'grandstand'
  | 'tirewall'
  | 'gantry'
  | 'flag'
  | 'board100'
  | 'board200';

export interface SpriteInst {
  kind: SpriteKind;
  /** Lateral position in road half-widths (±1 = road edge). */
  offset: number;
  collide: boolean;
}

export interface Segment {
  index: number;
  y1: number;
  y2: number;
  curve: number;
  band: number;
  sprites: SpriteInst[];
  marker?: 'start' | 'finish';
  railL: boolean;
  railR: boolean;
}

export interface Theme {
  id: 'circuit' | 'coast' | 'touge';
  night: boolean;
  skyTop: string;
  skyBottom: string;
  fog: string;
  fogDensity: number;
  road: [string, string];
  rumble: [string, string] | null;
  edge: string;
  center: 'none' | 'double-yellow' | 'dashed-white';
  groundL: [string, string];
  groundR: [string, string];
  rail: string;
  railPost: string;
}

export interface Track {
  id: 'circuit' | 'coast' | 'touge';
  name: string;
  nameKo: string;
  desc: string;
  theme: Theme;
  segments: Segment[];
  loop: boolean;
  laps: number;
  halfWidthM: number;
  finishIndex: number;
  wallL: number | null;
  wallR: number | null;
  offroadGrip: number;
  offroadDrag: number;
  cameraHeight: number;
  drawDistance: number;
  lengthKm: number;
  descentM: number;
}

// ───────────── helpers ─────────────

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const easeIn = (a: number, b: number, t: number) => a + (b - a) * t * t;
const easeInOut = (a: number, b: number, t: number) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

class Builder {
  segs: Segment[] = [];
  rails: [boolean, boolean] = [false, false];

  get lastY() {
    return this.segs.length ? this.segs[this.segs.length - 1].y2 : 0;
  }

  private add(curve: number, y: number) {
    const n = this.segs.length;
    this.segs.push({
      index: n,
      y1: this.lastY,
      y2: y,
      curve,
      band: Math.floor(n / 3) % 2,
      sprites: [],
      railL: this.rails[0],
      railR: this.rails[1],
    });
  }

  /** enter/hold/leave in segments, curve value, height change in metres over the whole piece. */
  road(enter: number, hold: number, leave: number, curve: number, dyM = 0) {
    const y0 = this.lastY;
    const y1 = y0 + dyM * 100;
    const total = enter + hold + leave;
    let k = 0;
    for (let i = 0; i < enter; i++, k++) this.add(easeIn(0, curve, i / enter), easeInOut(y0, y1, (k + 1) / total));
    for (let i = 0; i < hold; i++, k++) this.add(curve, easeInOut(y0, y1, (k + 1) / total));
    for (let i = 0; i < leave; i++, k++) this.add(easeInOut(curve, 0, i / leave), easeInOut(y0, y1, (k + 1) / total));
    return this;
  }

  straight(n: number, dyM = 0) {
    return this.road(0, n, 0, 0, dyM);
  }

  /** Downhill/uphill with gentle easing between pieces. */
  sprite(index: number, kind: SpriteKind, offset: number, collide = true) {
    const s = this.segs[index];
    if (s) s.sprites.push({ kind, offset, collide });
  }
}

/** Adds chevrons on the outside of sharp curves and "100/200 m" boards before them. */
function signCurves(b: Builder, threshold: number, every = 4, boards = false) {
  const segs = b.segs;
  for (let i = 0; i < segs.length; i++) {
    const c = segs[i].curve;
    if (Math.abs(c) >= threshold && i % every === 0) {
      const outside = c > 0 ? -1.35 : 1.35;
      b.sprite(i, c > 0 ? 'chevronR' : 'chevronL', outside, true);
    }
  }
  if (boards) {
    for (let i = 40; i < segs.length; i++) {
      if (Math.abs(segs[i].curve) >= threshold && Math.abs(segs[i - 1].curve) < threshold) {
        const side = segs[i].curve > 0 ? 1.45 : -1.45;
        if (i - 34 > 0) b.sprite(i - 34, 'board200', side, true);
        if (i - 17 > 0) b.sprite(i - 17, 'board100', side, true);
      }
    }
  }
}

// ───────────── tracks ─────────────

function circuit(): Track {
  const b = new Builder();
  b.straight(70)
    .road(15, 35, 15, 2.4, 0)
    .straight(45, 2)
    .road(10, 26, 10, -10, 0)
    .straight(25)
    .road(8, 10, 8, 5.5, 0)
    .road(8, 10, 8, -5.5, 3)
    .straight(30, 3)
    .road(20, 55, 20, -2.6, -4)
    .straight(115, -4)
    .road(12, 24, 12, 7.5, 0)
    .straight(22)
    .road(10, 18, 10, 4.8, 2)
    .road(10, 18, 10, -4.2, 0)
    .road(15, 38, 15, 3, -2);
  // close the loop back to y = 0 on the main straight
  b.straight(40, -b.lastY / 100);
  const R = rng(7);
  const n = b.segs.length;
  b.segs[8].marker = 'start';
  b.sprite(8, 'gantry', 0, false);
  for (let i = 0; i < n; i++) {
    const s = b.segs[i];
    if (i % 3 === 0) {
      b.sprite(i, R() < 0.7 ? 'tree' : 'bush', -(2.6 + R() * 3));
      b.sprite(i, R() < 0.7 ? 'tree' : 'bush', 2.6 + R() * 3);
    }
    if (i % 46 === 20) b.sprite(i, (['billboard1', 'billboard2', 'billboard3'] as const)[(i / 46) % 3 | 0], i % 92 < 46 ? -1.7 : 1.7);
    if (Math.abs(s.curve) >= 7 && i % 3 === 0) b.sprite(i, 'tirewall', s.curve > 0 ? -1.45 : 1.45);
    if (i > 20 && i < 70 && i % 12 === 0) b.sprite(i, 'grandstand', -2.4);
    if (i > 20 && i < 70 && i % 12 === 6) b.sprite(i, 'grandstand', 2.4);
    if (i % 20 === 10) b.sprite(i, 'flag', i % 40 < 20 ? -1.25 : 1.25);
  }
  signCurves(b, 7, 6, true);
  return {
    id: 'circuit',
    name: 'V8 LAB RACEWAY',
    nameKo: '서킷',
    desc: '헤어핀 · 시케인 · 롱 스트레이트. 2랩.',
    theme: {
      id: 'circuit',
      night: false,
      skyTop: '#3f86d8',
      skyBottom: '#bfe2ff',
      fog: '#b7d6ee',
      fogDensity: 4,
      road: ['#5a5d63', '#55585e'],
      rumble: ['#e8e8e8', '#cf2a2a'],
      edge: '#f4f4f4',
      center: 'none',
      groundL: ['#3e8d3a', '#378233'],
      groundR: ['#3e8d3a', '#378233'],
      rail: '#c9ccd2',
      railPost: '#8b9098',
    },
    segments: b.segs,
    loop: true,
    laps: 2,
    halfWidthM: 10,
    finishIndex: 8,
    wallL: -1.9,
    wallR: 1.9,
    offroadGrip: 0.55,
    offroadDrag: 0.35,
    cameraHeight: 340,
    drawDistance: 260,
    lengthKm: (n * SEG_LEN) / 100000,
    descentM: 0,
  };
}

function coast(): Track {
  const b = new Builder();
  b.rails = [true, false];
  b.straight(40)
    .road(15, 25, 15, 3.5, 12)
    .road(12, 20, 12, -4.5, -8)
    .straight(30, 6)
    .road(15, 30, 15, 6, 0)
    .road(10, 20, 10, -3, -10)
    .road(10, 16, 10, 7.5, 0)
    .straight(25, 8)
    .road(15, 35, 15, -5, 10)
    .road(12, 18, 12, 4, -14)
    .road(12, 22, 12, -6.5, 0)
    .straight(40, -6)
    .road(14, 26, 14, 3.2, 12)
    .road(10, 20, 10, 8, 0)
    .road(10, 20, 10, -8, -8)
    .road(15, 30, 15, 4.5, 6)
    .straight(30, -4)
    .road(12, 24, 12, -5.5, 0)
    .road(12, 20, 12, 3.8, -6)
    .straight(60);
  const finish = b.segs.length - 40;
  b.straight(140);
  const R = rng(21);
  const n = b.segs.length;
  b.segs[6].marker = 'start';
  b.segs[finish].marker = 'finish';
  b.sprite(6, 'gantry', 0, false);
  b.sprite(finish, 'gantry', 0, false);
  for (let i = 0; i < n; i++) {
    if (i % 4 === 0) b.sprite(i, R() < 0.55 ? 'palm' : 'rock', 1.6 + R() * 1.8);
    if (i % 9 === 3) b.sprite(i, 'cliff', 3.6 + R() * 2.5);
    if (i % 5 === 2) b.sprite(i, 'bush', 2.2 + R() * 2);
  }
  signCurves(b, 6, 5);
  return {
    id: 'coast',
    name: 'SUNSET COAST',
    nameKo: '해안 와인딩',
    desc: '바다를 낀 와인딩 로드. 언덕과 중·고속 코너 연속.',
    theme: {
      id: 'coast',
      night: false,
      skyTop: '#2a2f6b',
      skyBottom: '#ff9a52',
      fog: '#f2a46d',
      fogDensity: 5,
      road: ['#3f4146', '#3a3c41'],
      rumble: null,
      edge: '#f1f1f1',
      center: 'double-yellow',
      groundL: ['#1d5f9c', '#1b5893'],
      groundR: ['#c9a66b', '#bf9c61'],
      rail: '#d9dce1',
      railPost: '#7d828a',
    },
    segments: b.segs,
    loop: false,
    laps: 1,
    halfWidthM: 6.6,
    finishIndex: finish,
    wallL: -1.18,
    wallR: 2.4,
    offroadGrip: 0.6,
    offroadDrag: 0.3,
    cameraHeight: 320,
    drawDistance: 240,
    lengthKm: (finish * SEG_LEN) / 100000,
    descentM: 0,
  };
}

function touge(): Track {
  const b = new Builder();
  b.rails = [true, true];
  const D = 1.5; // descent scale (≈ 7 % average grade)
  b.straight(40, -3 * D)
    .road(12, 20, 12, 4, -10 * D)
    .road(12, 18, 12, -5, -9 * D)
    .straight(30, -7 * D)
    .road(10, 16, 10, 6.5, -7 * D);
  // five consecutive hairpins
  for (let k = 0; k < 5; k++) b.straight(16, -6 * D).road(8, 22, 8, k % 2 === 0 ? -11 : 11, -9 * D);
  b.straight(45, -14 * D)
    .road(14, 26, 14, 3.5, -12 * D)
    .road(12, 20, 12, -4.5, -11 * D)
    .road(10, 18, 10, 6, -9 * D)
    .straight(40, -14 * D)
    .road(8, 22, 8, 10.5, -8 * D)
    .straight(14, -5 * D)
    .road(8, 22, 8, -10.5, -8 * D)
    .road(12, 20, 12, 5, -10 * D)
    .straight(50, -9 * D);
  const finish = b.segs.length - 30;
  b.straight(140, -6);
  const R = rng(99);
  const n = b.segs.length;
  b.segs[6].marker = 'start';
  b.segs[finish].marker = 'finish';
  b.sprite(6, 'gantry', 0, false);
  b.sprite(finish, 'gantry', 0, false);
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) {
      b.sprite(i, 'pine', -(1.6 + R() * 2.6));
      b.sprite(i, 'pine', 1.6 + R() * 2.6);
    }
    if (i % 26 === 13) b.sprite(i, 'lamp', i % 52 < 26 ? -1.32 : 1.32);
  }
  signCurves(b, 6, 3);
  const descent = -b.segs[finish].y2 / 100;
  return {
    id: 'touge',
    name: 'MIDNIGHT TOUGE',
    nameKo: '가상 다운힐',
    desc: '심야 산길 내리막. 5연속 헤어핀 — 아키나 분위기의 가상 코스.',
    theme: {
      id: 'touge',
      night: true,
      skyTop: '#03050b',
      skyBottom: '#141b33',
      fog: '#04060c',
      fogDensity: 7,
      road: ['#2a2b2f', '#26272b'],
      rumble: null,
      edge: '#d9d9d9',
      center: 'dashed-white',
      groundL: ['#0d1a10', '#0b170e'],
      groundR: ['#0d1a10', '#0b170e'],
      rail: '#c9ccd2',
      railPost: '#6b7079',
    },
    segments: b.segs,
    loop: false,
    laps: 1,
    halfWidthM: 5.6,
    finishIndex: finish,
    wallL: -1.18,
    wallR: 1.18,
    offroadGrip: 0.6,
    offroadDrag: 0.3,
    cameraHeight: 300,
    drawDistance: 200,
    lengthKm: (finish * SEG_LEN) / 100000,
    descentM: descent,
  };
}

export const TRACK_BUILDERS = { circuit, coast, touge } as const;
export type TrackId = keyof typeof TRACK_BUILDERS;
export const TRACK_IDS: TrackId[] = ['circuit', 'coast', 'touge'];

const cache = new Map<TrackId, Track>();
export function getTrack(id: TrackId): Track {
  let t = cache.get(id);
  if (!t) {
    t = TRACK_BUILDERS[id]();
    cache.set(id, t);
  }
  return t;
}

/** Interpolated road height (cm) at world position z (cm). */
export function heightAt(track: Track, z: number): number {
  const n = track.segments.length;
  const idx = Math.floor(z / SEG_LEN);
  const seg = track.segments[((idx % n) + n) % n];
  const t = (z % SEG_LEN) / SEG_LEN;
  return seg.y1 + (seg.y2 - seg.y1) * t;
}
