import type { SpriteKind, Theme } from './tracks';

/** Procedurally drawn roadside sprites and parallax backgrounds (no external images). */

export interface SpriteImg {
  canvas: HTMLCanvasElement;
  /** World size in metres (anchor: bottom centre). */
  w: number;
  h: number;
}

const PX_PER_M = 26;

function make(wM: number, hM: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): SpriteImg {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(wM * PX_PER_M));
  c.height = Math.max(8, Math.round(hM * PX_PER_M));
  const g = c.getContext('2d')!;
  draw(g, c.width, c.height);
  return { canvas: c, w: wM, h: hM };
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function boardText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 900) {
  g.fillStyle = color;
  g.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

export function buildSprites(theme: Theme): Record<SpriteKind, SpriteImg> {
  const night = theme.night;
  const R = rng(theme.id.length * 977);
  const green = night ? ['#0e2216', '#12291b', '#0a1a10'] : theme.id === 'coast' ? ['#2f6b35', '#3a7d3f', '#28592c'] : ['#2f7a33', '#3b8f3f', '#256427'];

  const pine = make(4.6, 12.5, (g, w, h) => {
    g.fillStyle = night ? '#1a120c' : '#4b3424';
    g.fillRect(w * 0.46, h * 0.82, w * 0.08, h * 0.18);
    for (let i = 0; i < 6; i++) {
      const y0 = h * (0.06 + i * 0.13);
      const half = w * (0.18 + i * 0.065);
      g.fillStyle = green[i % 3];
      g.beginPath();
      g.moveTo(w / 2, y0);
      g.lineTo(w / 2 - half, y0 + h * 0.2);
      g.lineTo(w / 2 + half, y0 + h * 0.2);
      g.closePath();
      g.fill();
    }
  });

  const tree = make(6.5, 8, (g, w, h) => {
    g.fillStyle = '#5a3d27';
    g.fillRect(w * 0.45, h * 0.6, w * 0.1, h * 0.4);
    const blobs = [
      [0.5, 0.36, 0.32],
      [0.32, 0.46, 0.22],
      [0.68, 0.46, 0.22],
      [0.42, 0.24, 0.2],
      [0.6, 0.26, 0.2],
    ];
    blobs.forEach(([x, y, r], i) => {
      g.fillStyle = green[i % 3];
      g.beginPath();
      g.arc(x * w, y * h, r * w, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(w * 0.42, h * 0.22, w * 0.12, 0, Math.PI * 2);
    g.fill();
  });

  const palm = make(5.5, 10, (g, w, h) => {
    g.strokeStyle = '#6b4a2b';
    g.lineWidth = w * 0.07;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.5, h);
    g.quadraticCurveTo(w * 0.62, h * 0.55, w * 0.52, h * 0.16);
    g.stroke();
    g.strokeStyle = '#2f6b35';
    g.lineWidth = w * 0.06;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI;
      g.beginPath();
      g.moveTo(w * 0.52, h * 0.16);
      g.quadraticCurveTo(w * (0.52 + Math.cos(a) * 0.3), h * (0.16 + Math.sin(a) * 0.12 - 0.05), w * (0.52 + Math.cos(a) * 0.46), h * (0.16 + 0.14 + Math.abs(Math.cos(a)) * 0.08));
      g.stroke();
    }
  });

  const bush = make(3.2, 1.7, (g, w, h) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = green[i % 3];
      g.beginPath();
      g.ellipse(w * (0.25 + i * 0.17), h * 0.62, w * 0.2, h * 0.42, 0, 0, Math.PI * 2);
      g.fill();
    }
  });

  const rock = make(3.4, 2.2, (g, w, h) => {
    g.fillStyle = '#7b6650';
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(w * 0.1, h * 0.4);
    g.lineTo(w * 0.4, h * 0.08);
    g.lineTo(w * 0.75, h * 0.2);
    g.lineTo(w, h * 0.7);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,190,120,0.25)';
    g.beginPath();
    g.moveTo(w * 0.4, h * 0.08);
    g.lineTo(w * 0.75, h * 0.2);
    g.lineTo(w * 0.6, h * 0.5);
    g.closePath();
    g.fill();
  });

  const cliff = make(15, 11, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#9a5d3a');
    grd.addColorStop(1, '#5c3424');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, h);
    let x = 0;
    while (x < w) {
      g.lineTo(x, h * (0.05 + R() * 0.35));
      x += w * (0.06 + R() * 0.08);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    g.fillStyle = '#3e6b34';
    g.fillRect(0, h * 0.02, w, h * 0.05);
  });

  const lamp = make(2.6, 8.5, (g, w, h) => {
    g.fillStyle = '#3a3d44';
    g.fillRect(w * 0.47, h * 0.12, w * 0.06, h * 0.88);
    g.fillRect(w * 0.2, h * 0.11, w * 0.32, h * 0.025);
    const glow = g.createRadialGradient(w * 0.24, h * 0.15, 0, w * 0.24, h * 0.15, w * 0.5);
    glow.addColorStop(0, 'rgba(255,200,120,0.95)');
    glow.addColorStop(0.25, 'rgba(255,170,80,0.45)');
    glow.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h * 0.45);
    g.fillStyle = '#ffe2b0';
    g.fillRect(w * 0.16, h * 0.13, w * 0.16, h * 0.02);
  });

  const chevron = (dir: 1 | -1) =>
    make(1.4, 2.2, (g, w, h) => {
      g.fillStyle = '#555a61';
      g.fillRect(w * 0.45, h * 0.45, w * 0.1, h * 0.55);
      g.fillStyle = '#f2c919';
      g.fillRect(0, 0, w, h * 0.5);
      g.strokeStyle = '#111';
      g.lineWidth = w * 0.11;
      for (const o of [0.2, 0.5, 0.8]) {
        g.beginPath();
        g.moveTo(w * (o - 0.1 * dir), h * 0.08);
        g.lineTo(w * (o + 0.1 * dir), h * 0.25);
        g.lineTo(w * (o - 0.1 * dir), h * 0.42);
        g.stroke();
      }
    });

  const billboard = (title: string, sub: string, bg: string, fg: string) =>
    make(10, 5.6, (g, w, h) => {
      g.fillStyle = '#4b4f57';
      g.fillRect(w * 0.15, h * 0.6, w * 0.05, h * 0.4);
      g.fillRect(w * 0.8, h * 0.6, w * 0.05, h * 0.4);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h * 0.62);
      g.strokeStyle = '#1a1c20';
      g.lineWidth = w * 0.012;
      g.strokeRect(0, 0, w, h * 0.62);
      boardText(g, title, w / 2, h * 0.24, h * 0.24, fg);
      boardText(g, sub, w / 2, h * 0.48, h * 0.1, fg, 700);
    });

  const grandstand = make(26, 9, (g, w, h) => {
    g.fillStyle = '#9aa1ab';
    g.fillRect(0, h * 0.05, w, h * 0.06);
    g.fillStyle = '#5c636e';
    for (const x of [0.04, 0.5, 0.95]) g.fillRect(w * x - w * 0.006, h * 0.08, w * 0.012, h * 0.3);
    for (let r = 0; r < 7; r++) {
      const y = h * (0.35 + r * 0.09);
      g.fillStyle = r % 2 ? '#c7ccd3' : '#b3b9c2';
      g.fillRect(0, y, w, h * 0.09);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = ['#e74c3c', '#f1c40f', '#3498db', '#ecf0f1', '#2ecc71', '#e67e22'][(R() * 6) | 0];
        g.fillRect(R() * w, y + h * 0.01, w * 0.008, h * 0.05);
      }
    }
  });

  const tirewall = make(7, 1.4, (g, w, h) => {
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 9; i++) {
        g.fillStyle = (i + row) % 2 ? '#d93a3a' : '#f2f2f2';
        g.beginPath();
        g.ellipse(w * (0.06 + i * 0.11), h * (0.72 - row * 0.42), w * 0.055, h * 0.24, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111';
        g.beginPath();
        g.ellipse(w * (0.06 + i * 0.11), h * (0.72 - row * 0.42), w * 0.025, h * 0.1, 0, 0, Math.PI * 2);
        g.fill();
      }
  });

  const gantry = make(22, 8, (g, w, h) => {
    g.fillStyle = night ? '#262a31' : '#3b4049';
    g.fillRect(w * 0.02, h * 0.2, w * 0.045, h * 0.8);
    g.fillRect(w * 0.935, h * 0.2, w * 0.045, h * 0.8);
    g.fillStyle = '#16181c';
    g.fillRect(0, h * 0.08, w, h * 0.22);
    const sq = h * 0.055;
    for (let x = 0; x < w; x += sq)
      for (let y = 0; y < 2; y++) {
        g.fillStyle = (Math.floor(x / sq) + y) % 2 ? '#f5f5f5' : '#111';
        g.fillRect(x, h * 0.08 + y * sq, sq, sq);
      }
    boardText(g, 'V8 LAB', w / 2, h * 0.24, h * 0.1, '#f97316');
  });

  const flag = make(1.6, 6.5, (g, w, h) => {
    g.fillStyle = '#d0d4da';
    g.fillRect(w * 0.08, 0, w * 0.06, h);
    g.fillStyle = R() < 0.5 ? '#f97316' : '#2dd4bf';
    g.beginPath();
    g.moveTo(w * 0.14, h * 0.02);
    g.lineTo(w, h * 0.1);
    g.lineTo(w * 0.14, h * 0.22);
    g.closePath();
    g.fill();
  });

  const board = (label: string) =>
    make(1.5, 2.3, (g, w, h) => {
      g.fillStyle = '#6b7079';
      g.fillRect(w * 0.44, h * 0.5, w * 0.12, h * 0.5);
      g.fillStyle = '#f5f5f5';
      g.fillRect(0, 0, w, h * 0.55);
      g.strokeStyle = '#111';
      g.lineWidth = w * 0.05;
      g.strokeRect(w * 0.03, h * 0.02, w * 0.94, h * 0.5);
      boardText(g, label, w / 2, h * 0.28, h * 0.2, '#111');
    });

  return {
    pine,
    tree,
    palm,
    bush,
    rock,
    cliff,
    lamp,
    chevronL: chevron(-1),
    chevronR: chevron(1),
    billboard1: billboard('V8 LAB', 'ENGINE · EXHAUST · SOUND', '#111316', '#f97316'),
    billboard2: billboard('TIGER 50:50', 'GS460 · 1UR-FSE · V8', '#f97316', '#111316'),
    billboard3: billboard('X BOOST', 'GAUGE 100% → 3.2s', '#14b8a6', '#06201d'),
    grandstand,
    tirewall,
    gantry,
    flag,
    board100: board('100'),
    board200: board('200'),
  };
}

// ───────────── parallax backgrounds ─────────────

export interface Backdrop {
  far: HTMLCanvasElement;
  near: HTMLCanvasElement;
}

const BW = 2048;
const BH = 400;

function layer(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = BW;
  c.height = BH;
  draw(c.getContext('2d')!);
  return c;
}

function ridge(g: CanvasRenderingContext2D, R: () => number, base: number, amp: number, step: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, BH);
  let y = base;
  for (let x = 0; x <= BW; x += step) {
    y = Math.max(base - amp, Math.min(base, y + (R() - 0.5) * amp * 0.6));
    if (x === 0 || x + step > BW) y = base - amp * 0.4; // seamless wrap
    g.lineTo(x, y);
  }
  g.lineTo(BW, BH);
  g.closePath();
  g.fill();
}

export function buildBackdrop(theme: Theme): Backdrop {
  const R = rng(theme.id.length * 31 + 5);
  if (theme.id === 'circuit') {
    return {
      far: layer((g) => {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < 14; i++) {
          const x = R() * BW;
          const y = 40 + R() * 120;
          for (let k = 0; k < 4; k++) {
            g.beginPath();
            g.ellipse(x + k * 34, y + (k % 2) * 8, 46, 18, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
        ridge(g, R, BH - 70, 70, 64, '#7d9bb8');
        g.fillStyle = '#8fa7bd';
        for (let i = 0; i < 26; i++) {
          const x = 900 + i * 22 + R() * 6;
          const hgt = 20 + R() * 60;
          g.fillRect(x, BH - 60 - hgt, 16, hgt);
        }
      }),
      near: layer((g) => {
        ridge(g, R, BH - 18, 38, 24, '#2f6d34');
        g.fillStyle = '#2a5f2e';
        for (let x = 0; x < BW; x += 18) {
          g.beginPath();
          g.arc(x, BH - 22 - R() * 10, 14 + R() * 8, 0, Math.PI * 2);
          g.fill();
        }
      }),
    };
  }
  if (theme.id === 'coast') {
    return {
      far: layer((g) => {
        const sun = g.createRadialGradient(1300, BH - 70, 10, 1300, BH - 70, 260);
        sun.addColorStop(0, 'rgba(255,240,190,1)');
        sun.addColorStop(0.15, 'rgba(255,200,120,0.9)');
        sun.addColorStop(1, 'rgba(255,140,80,0)');
        g.fillStyle = sun;
        g.fillRect(0, 0, BW, BH);
        ridge(g, R, BH - 40, 60, 48, '#5b3b63');
        g.fillStyle = '#7a4d6e';
        g.beginPath();
        g.ellipse(400, BH - 40, 160, 34, 0, Math.PI, 0);
        g.fill();
      }),
      near: layer((g) => {
        g.fillStyle = '#3a2a3c';
        g.beginPath();
        g.moveTo(1500, BH);
        g.lineTo(1560, BH - 90);
        g.lineTo(1700, BH - 140);
        g.lineTo(1850, BH - 100);
        g.lineTo(1950, BH - 40);
        g.lineTo(2000, BH);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,220,170,0.25)';
        g.fillRect(0, BH - 6, BW, 3);
      }),
    };
  }
  return {
    far: layer((g) => {
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.7})`;
        g.fillRect(R() * BW, R() * (BH - 120), R() < 0.1 ? 2 : 1, R() < 0.1 ? 2 : 1);
      }
      const moon = g.createRadialGradient(560, 90, 0, 560, 90, 90);
      moon.addColorStop(0, 'rgba(250,248,230,1)');
      moon.addColorStop(0.3, 'rgba(250,248,230,1)');
      moon.addColorStop(0.36, 'rgba(200,210,255,0.25)');
      moon.addColorStop(1, 'rgba(200,210,255,0)');
      g.fillStyle = moon;
      g.fillRect(400, 0, 320, 260);
      ridge(g, R, BH - 60, 140, 40, '#0b1124');
      ridge(g, R, BH - 30, 90, 30, '#070b18');
    }),
    near: layer((g) => {
      for (let i = 0; i < 180; i++) {
        g.fillStyle = R() < 0.6 ? 'rgba(255,200,120,0.85)' : 'rgba(220,230,255,0.75)';
        g.fillRect(R() * BW, BH - 40 + R() * 20, 2, 2);
      }
      g.fillStyle = '#050906';
      for (let x = 0; x < BW; x += 12) {
        const hgt = 30 + R() * 50;
        g.beginPath();
        g.moveTo(x - 10, BH);
        g.lineTo(x, BH - hgt);
        g.lineTo(x + 10, BH);
        g.closePath();
        g.fill();
      }
    }),
  };
}
