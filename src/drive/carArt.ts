/**
 * Rear-view car illustrations for V8 LAB DRIVE.
 *
 * Drawn procedurally from each model's documented rear design cues (lamp shape, exhaust
 * outlet layout, spoiler, plate position). They are stylised illustrations, not photos,
 * and emblems are generic shapes rather than manufacturer logos.
 *
 * Coordinates: x in half-body-widths (−1 … 1), y in the same unit upward from the ground.
 */

export type BodyType = 'sedan' | 'wagon' | 'coupe' | 'hatch';
export type LampStyle = 'gs460' | 'gsf' | 'isf' | '86' | 'ls460' | 'avanteN' | 'tuscani' | 'e60' | 'e61';
export type TipLayout = 'dual' | 'quad-stacked' | 'quad-pairs' | 'dual-inner' | 'dual-big' | 'dual-rect';

export interface CarArt {
  color: string;
  finish: 'matte' | 'gloss' | 'metallic';
  body: BodyType;
  lamp: LampStyle;
  tips: { layout: TipLayout; finish: 'black' | 'chrome'; shape: 'round' | 'oval' };
  plate: 'trunk' | 'bumper';
  plateText: string;
  spoiler: 'none' | 'lip' | 'carbon' | 'ducktail' | 'wing' | 'roof' | 'n-wing';
  diffuser: 'none' | 'small' | 'fins' | 'n';
  emblem: 'oval' | 'round' | 'slant' | 'badge86';
  badgeL?: string;
  badgeR?: string;
  tire: number;
  wheelsBlack?: boolean;
  accent?: string;
  sensors?: boolean;
}

export interface Tip {
  x: number;
  y: number;
  r: number;
}

interface Shape {
  bumperBot: number;
  shoulder: number;
  belt: number;
  deck: number;
  winBot: number;
  winBotHW: number;
  winTop: number;
  winTopHW: number;
  roof: number;
  roofHW: number;
}

const SHAPES: Record<BodyType, Shape> = {
  sedan: { bumperBot: 0.27, shoulder: 0.62, belt: 0.98, deck: 1.04, winBot: 1.08, winBotHW: 0.7, winTop: 1.46, winTopHW: 0.53, roof: 1.56, roofHW: 0.58 },
  wagon: { bumperBot: 0.27, shoulder: 0.62, belt: 0.98, deck: 1.0, winBot: 1.03, winBotHW: 0.74, winTop: 1.47, winTopHW: 0.66, roof: 1.58, roofHW: 0.7 },
  coupe: { bumperBot: 0.25, shoulder: 0.58, belt: 0.92, deck: 0.96, winBot: 1.0, winBotHW: 0.66, winTop: 1.3, winTopHW: 0.5, roof: 1.38, roofHW: 0.54 },
  hatch: { bumperBot: 0.26, shoulder: 0.58, belt: 0.9, deck: 0.88, winBot: 0.93, winBotHW: 0.72, winTop: 1.34, winTopHW: 0.52, roof: 1.42, roofHW: 0.56 },
};

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

/**
 * Draws the car into ctx with its ground-centre at (cx, gy) and half-body-width u (px).
 * Returns exhaust tip centres in the same pixel space (for boost flames).
 */
export function drawCarRear(
  ctx: CanvasRenderingContext2D,
  art: CarArt,
  cx: number,
  gy: number,
  u: number,
  state: { brake: boolean; lights: boolean } = { brake: false, lights: false },
): Tip[] {
  const S = SHAPES[art.body];
  const X = (nx: number) => cx + nx * u;
  const Y = (ny: number) => gy - ny * u;
  const matte = art.finish === 'matte';
  const tips: Tip[] = [];

  const poly = (pts: [number, number][], mirror = false) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(X(mirror ? -x : x), Y(y)) : ctx.lineTo(X(mirror ? -x : x), Y(y))));
    ctx.closePath();
  };
  const both = (fn: (m: boolean) => void) => {
    fn(false);
    fn(true);
  };

  // ── shadow
  const sh = ctx.createRadialGradient(cx, gy, u * 0.2, cx, gy, u * 1.25);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(cx, gy, u * 1.22, u * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── tyres
  both((m) => {
    const x0 = m ? -(0.68 + art.tire) : 0.68;
    ctx.fillStyle = '#0c0c0e';
    ctx.beginPath();
    ctx.roundRect(X(x0), Y(0.36), art.tire * u, 0.36 * u, 0.05 * u);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = Math.max(1, u * 0.008);
    for (let i = 1; i < 4; i++) {
      const xx = X(x0 + (art.tire * i) / 4);
      ctx.beginPath();
      ctx.moveTo(xx, Y(0.34));
      ctx.lineTo(xx, Y(0.02));
      ctx.stroke();
    }
  });

  // ── main body (bumper → shoulders → deck)
  const body = ctx.createLinearGradient(0, Y(S.deck + 0.05), 0, Y(S.bumperBot));
  body.addColorStop(0, shade(art.color, matte ? 0.07 : 0.28));
  body.addColorStop(0.35, art.color);
  body.addColorStop(0.62, shade(art.color, matte ? -0.05 : -0.12));
  body.addColorStop(1, shade(art.color, matte ? -0.25 : -0.42));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(X(-0.86), Y(S.bumperBot));
  ctx.lineTo(X(0.86), Y(S.bumperBot));
  ctx.quadraticCurveTo(X(0.955), Y(S.bumperBot + 0.01), X(0.965), Y(S.bumperBot + 0.1));
  ctx.quadraticCurveTo(X(1.0), Y((S.bumperBot + S.shoulder) / 2), X(1.0), Y(S.shoulder));
  ctx.quadraticCurveTo(X(1.0), Y(S.belt - 0.06), X(0.96), Y(S.belt));
  ctx.quadraticCurveTo(X(0.94), Y(S.deck), X(0.86), Y(S.deck));
  ctx.lineTo(X(-0.86), Y(S.deck));
  ctx.quadraticCurveTo(X(-0.94), Y(S.deck), X(-0.96), Y(S.belt));
  ctx.quadraticCurveTo(X(-1.0), Y(S.belt - 0.06), X(-1.0), Y(S.shoulder));
  ctx.quadraticCurveTo(X(-1.0), Y((S.bumperBot + S.shoulder) / 2), X(-0.965), Y(S.bumperBot + 0.1));
  ctx.quadraticCurveTo(X(-0.955), Y(S.bumperBot + 0.01), X(-0.86), Y(S.bumperBot));
  ctx.closePath();
  ctx.fill();

  // ── greenhouse (pillars + roof)
  const gh = ctx.createLinearGradient(0, Y(S.roof), 0, Y(S.deck));
  gh.addColorStop(0, shade(art.color, matte ? 0.04 : 0.18));
  gh.addColorStop(1, shade(art.color, matte ? -0.08 : -0.1));
  ctx.fillStyle = gh;
  ctx.beginPath();
  ctx.moveTo(X(-0.9), Y(S.deck));
  ctx.quadraticCurveTo(X(-S.roofHW - 0.12), Y(S.roof - 0.25), X(-S.roofHW - 0.02), Y(S.roof - 0.04));
  ctx.quadraticCurveTo(X(-S.roofHW + 0.02), Y(S.roof), X(-S.roofHW + 0.1), Y(S.roof));
  ctx.lineTo(X(S.roofHW - 0.1), Y(S.roof));
  ctx.quadraticCurveTo(X(S.roofHW - 0.02), Y(S.roof), X(S.roofHW + 0.02), Y(S.roof - 0.04));
  ctx.quadraticCurveTo(X(S.roofHW + 0.12), Y(S.roof - 0.25), X(0.9), Y(S.deck));
  ctx.closePath();
  ctx.fill();

  // ── rear glass with cabin silhouettes and a reflection
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(X(-S.winBotHW), Y(S.winBot));
  ctx.quadraticCurveTo(X(-S.winTopHW - 0.08), Y(S.winTop - 0.06), X(-S.winTopHW), Y(S.winTop));
  ctx.lineTo(X(S.winTopHW), Y(S.winTop));
  ctx.quadraticCurveTo(X(S.winTopHW + 0.08), Y(S.winTop - 0.06), X(S.winBotHW), Y(S.winBot));
  ctx.closePath();
  const glass = ctx.createLinearGradient(0, Y(S.winTop), 0, Y(S.winBot));
  glass.addColorStop(0, '#2a3240');
  glass.addColorStop(0.5, '#10141b');
  glass.addColorStop(1, '#07090c');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const hx of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.roundRect(X(hx - 0.14), Y(S.winBot + 0.24), 0.28 * u, 0.2 * u, 0.06 * u);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.moveTo(X(-0.2), Y(S.winTop));
  ctx.lineTo(X(0.1), Y(S.winTop));
  ctx.lineTo(X(-0.25), Y(S.winBot));
  ctx.lineTo(X(-0.55), Y(S.winBot));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── shoulder highlight
  const hl = ctx.createLinearGradient(0, Y(S.belt + 0.02), 0, Y(S.belt - 0.12));
  hl.addColorStop(0, `rgba(255,255,255,${matte ? 0.04 : art.finish === 'metallic' ? 0.18 : 0.14})`);
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(X(-0.95), Y(S.belt + 0.02), 1.9 * u, 0.14 * u);

  // ── trunk shut line
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, u * 0.008);
  ctx.beginPath();
  const tl = art.body === 'wagon' || art.body === 'hatch' ? 0.62 : 0.62;
  ctx.moveTo(X(-tl), Y(S.deck - 0.01));
  ctx.lineTo(X(-tl), Y(0.66));
  ctx.lineTo(X(tl), Y(0.66));
  ctx.lineTo(X(tl), Y(S.deck - 0.01));
  ctx.stroke();

  // ── spoilers
  drawSpoiler(ctx, art, S, X, Y, u);

  // ── lower bumper / diffuser
  drawDiffuser(ctx, art, S, X, Y, u);

  // ── lamps
  drawLamps(ctx, art, S, X, Y, u, poly, state);

  // ── plate
  const plateY = art.plate === 'trunk' ? 0.7 : 0.4;
  if (art.plate === 'trunk') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.roundRect(X(-0.36), Y(plateY + 0.16), 0.72 * u, 0.19 * u, 0.03 * u);
    ctx.fill();
  }
  ctx.fillStyle = '#f2f3f5';
  ctx.strokeStyle = '#2a2d33';
  ctx.lineWidth = Math.max(1, u * 0.01);
  ctx.beginPath();
  ctx.roundRect(X(-0.28), Y(plateY + 0.13), 0.56 * u, 0.13 * u, 0.015 * u);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = `700 ${Math.round(u * 0.095)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(art.plateText, X(0), Y(plateY + 0.063));

  // ── emblem & badges (generic shapes, not logos)
  const ey = art.plate === 'trunk' ? 0.94 : 0.8;
  const metal = matte ? '#3a3d42' : '#d5d9de';
  ctx.strokeStyle = metal;
  ctx.fillStyle = metal;
  ctx.lineWidth = Math.max(1, u * 0.012);
  ctx.beginPath();
  if (art.emblem === 'oval') ctx.ellipse(X(0), Y(ey), 0.085 * u, 0.055 * u, 0, 0, Math.PI * 2);
  else if (art.emblem === 'round') ctx.arc(X(0), Y(ey), 0.055 * u, 0, Math.PI * 2);
  else if (art.emblem === 'slant') ctx.ellipse(X(0), Y(ey), 0.09 * u, 0.05 * u, -0.25, 0, Math.PI * 2);
  else ctx.roundRect(X(-0.07), Y(ey + 0.035), 0.14 * u, 0.07 * u, 0.02 * u);
  ctx.stroke();
  if (art.emblem === 'round') {
    ctx.beginPath();
    ctx.arc(X(0), Y(ey), 0.03 * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = `600 ${Math.round(u * 0.055)}px "Segoe UI", Arial, sans-serif`;
  if (art.badgeL) {
    ctx.textAlign = 'left';
    ctx.fillText(art.badgeL, X(-0.58), Y(0.72));
  }
  if (art.badgeR) {
    ctx.textAlign = 'right';
    ctx.fillText(art.badgeR, X(0.58), Y(0.72));
  }

  // ── exhaust tips
  const tipList = tipPositions(art);
  for (const t of tipList) {
    const px = X(t.x);
    const py = Y(t.y);
    const r = t.r * u;
    const rx = art.tips.shape === 'oval' ? r * 1.3 : r;
    const ry = art.tips.shape === 'oval' ? r * 0.82 : r;
    const ring = ctx.createLinearGradient(px, py - ry, px, py + ry);
    if (art.tips.finish === 'chrome') {
      ring.addColorStop(0, '#d9dde2');
      ring.addColorStop(0.5, '#5f646c');
      ring.addColorStop(1, '#aab0b8');
    } else {
      ring.addColorStop(0, '#4a4d52');
      ring.addColorStop(0.5, '#141518');
      ring.addColorStop(1, '#2d3035');
    }
    ctx.fillStyle = ring;
    ctx.beginPath();
    if (art.tips.layout === 'dual-rect') ctx.roundRect(px - rx * 1.6, py - ry * 0.75, rx * 3.2, ry * 1.5, ry * 0.6);
    else ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#050506';
    ctx.beginPath();
    if (art.tips.layout === 'dual-rect') ctx.roundRect(px - rx * 1.4, py - ry * 0.5, rx * 2.8, ry, ry * 0.45);
    else ctx.ellipse(px, py, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2);
    ctx.fill();
    tips.push({ x: px, y: py, r: Math.max(rx, ry) });
  }
  return tips;
}

function tipPositions(art: CarArt): Tip[] {
  const L: Tip[] = [];
  switch (art.tips.layout) {
    case 'dual':
      L.push({ x: -0.7, y: 0.31, r: 0.07 });
      break;
    case 'quad-stacked':
      L.push({ x: -0.6, y: 0.36, r: 0.052 }, { x: -0.7, y: 0.27, r: 0.052 });
      break;
    case 'quad-pairs':
      L.push({ x: -0.55, y: 0.31, r: 0.056 }, { x: -0.71, y: 0.31, r: 0.056 });
      break;
    case 'dual-inner':
      L.push({ x: -0.34, y: 0.3, r: 0.066 });
      break;
    case 'dual-big':
      L.push({ x: -0.63, y: 0.31, r: 0.088 });
      break;
    case 'dual-rect':
      L.push({ x: -0.7, y: 0.31, r: 0.045 });
      break;
  }
  return [...L, ...L.map((t) => ({ ...t, x: -t.x }))];
}

type XY = (n: number) => number;

function drawSpoiler(ctx: CanvasRenderingContext2D, art: CarArt, S: Shape, X: XY, Y: XY, u: number) {
  const dark = '#121316';
  switch (art.spoiler) {
    case 'lip':
      ctx.fillStyle = shade(art.color, -0.25);
      ctx.beginPath();
      ctx.roundRect(X(-0.6), Y(S.deck + 0.015), 1.2 * u, 0.03 * u, 0.012 * u);
      ctx.fill();
      break;
    case 'carbon': {
      ctx.fillStyle = '#18191c';
      ctx.beginPath();
      ctx.roundRect(X(-0.66), Y(S.deck + 0.035), 1.32 * u, 0.05 * u, 0.015 * u);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let i = -0.64; i < 0.64; i += 0.04) {
        ctx.beginPath();
        ctx.moveTo(X(i), Y(S.deck + 0.03));
        ctx.lineTo(X(i + 0.02), Y(S.deck - 0.01));
        ctx.stroke();
      }
      break;
    }
    case 'ducktail':
      ctx.fillStyle = shade(art.color, 0.1);
      ctx.beginPath();
      ctx.moveTo(X(-0.74), Y(S.deck));
      ctx.quadraticCurveTo(X(0), Y(S.deck + 0.07), X(0.74), Y(S.deck));
      ctx.lineTo(X(0.7), Y(S.deck - 0.03));
      ctx.lineTo(X(-0.7), Y(S.deck - 0.03));
      ctx.closePath();
      ctx.fill();
      break;
    case 'wing': {
      ctx.fillStyle = shade(art.color, -0.35);
      for (const sx of [-0.5, 0.5]) ctx.fillRect(X(sx - 0.018), Y(S.deck + 0.13), 0.036 * u, 0.14 * u);
      const wg = ctx.createLinearGradient(0, Y(S.deck + 0.2), 0, Y(S.deck + 0.1));
      wg.addColorStop(0, shade(art.color, 0.2));
      wg.addColorStop(1, shade(art.color, -0.3));
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.moveTo(X(-0.8), Y(S.deck + 0.2));
      ctx.lineTo(X(0.8), Y(S.deck + 0.2));
      ctx.lineTo(X(0.78), Y(S.deck + 0.11));
      ctx.lineTo(X(-0.78), Y(S.deck + 0.11));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(art.color, -0.45);
      for (const sx of [-0.82, 0.78]) ctx.fillRect(X(sx), Y(S.deck + 0.23), 0.04 * u, 0.14 * u);
      break;
    }
    case 'n-wing':
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(X(-0.8), Y(S.deck + 0.1));
      ctx.lineTo(X(-0.7), Y(S.deck + 0.05));
      ctx.lineTo(X(0.7), Y(S.deck + 0.05));
      ctx.lineTo(X(0.8), Y(S.deck + 0.1));
      ctx.lineTo(X(0.78), Y(S.deck + 0.01));
      ctx.lineTo(X(-0.78), Y(S.deck + 0.01));
      ctx.closePath();
      ctx.fill();
      break;
    case 'roof':
      ctx.fillStyle = shade(art.color, -0.15);
      ctx.beginPath();
      ctx.roundRect(X(-S.roofHW + 0.02), Y(S.roof + 0.02), (S.roofHW - 0.02) * 2 * u, 0.06 * u, 0.02 * u);
      ctx.fill();
      break;
  }
}

function drawDiffuser(ctx: CanvasRenderingContext2D, art: CarArt, S: Shape, X: XY, Y: XY, u: number) {
  // lower valance shade
  const vg = ctx.createLinearGradient(0, Y(0.5), 0, Y(S.bumperBot));
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(X(-0.98), Y(0.5), 1.96 * u, (0.5 - S.bumperBot) * u);

  ctx.fillStyle = '#101114';
  if (art.diffuser === 'small') {
    ctx.beginPath();
    ctx.roundRect(X(-0.82), Y(0.4), 1.64 * u, (0.4 - S.bumperBot) * u, 0.03 * u);
    ctx.fill();
  } else if (art.diffuser === 'fins' || art.diffuser === 'n') {
    ctx.beginPath();
    ctx.moveTo(X(-0.9), Y(0.44));
    ctx.lineTo(X(0.9), Y(0.44));
    ctx.lineTo(X(0.86), Y(S.bumperBot));
    ctx.lineTo(X(-0.86), Y(S.bumperBot));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#26282d';
    ctx.lineWidth = Math.max(1, u * 0.012);
    for (const fx of [-0.42, -0.2, 0, 0.2, 0.42]) {
      ctx.beginPath();
      ctx.moveTo(X(fx), Y(0.43));
      ctx.lineTo(X(fx * 1.05), Y(S.bumperBot));
      ctx.stroke();
    }
  }
  if (art.diffuser === 'n' && art.accent) {
    ctx.fillStyle = art.accent;
    ctx.fillRect(X(-0.88), Y(S.bumperBot + 0.018), 1.76 * u, 0.018 * u);
    // triangular centre lamp (N rear fog / stop lamp)
    ctx.fillStyle = '#c3121b';
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0.29));
    ctx.lineTo(X(-0.05), Y(0.38));
    ctx.lineTo(X(0.05), Y(0.38));
    ctx.closePath();
    ctx.fill();
  }
  if (art.lamp === '86') {
    ctx.fillStyle = '#b5121a';
    ctx.beginPath();
    ctx.roundRect(X(-0.06), Y(0.34), 0.12 * u, 0.06 * u, 0.02 * u);
    ctx.fill();
  }
  // corner reflectors
  ctx.fillStyle = '#7a0d12';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(X(s * 0.9 - 0.07), Y(0.47), 0.14 * u, 0.035 * u, 0.012 * u);
    ctx.fill();
  }
  if (art.sensors) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const sx of [-0.52, -0.2, 0.2, 0.52]) {
      ctx.beginPath();
      ctx.arc(X(sx), Y(0.52), 0.017 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLamps(
  ctx: CanvasRenderingContext2D,
  art: CarArt,
  S: Shape,
  X: XY,
  Y: XY,
  u: number,
  poly: (pts: [number, number][], mirror?: boolean) => void,
  state: { brake: boolean; lights: boolean },
) {
  const lit = state.brake ? 1 : state.lights ? 0.6 : 0.25;
  const red = (a: number) => `rgba(${Math.round(150 + 105 * a)},${Math.round(12 + 30 * a)},${Math.round(20 + 25 * a)},1)`;
  const glow = (fn: () => void) => {
    if (lit < 0.5) return fn();
    ctx.save();
    ctx.shadowColor = 'rgba(255,30,40,0.9)';
    ctx.shadowBlur = u * 0.18 * lit;
    fn();
    ctx.restore();
  };
  const bar = (x0: number, y0: number, x1: number, y1: number, w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, w * u);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(y0));
    ctx.lineTo(X(x1), Y(y1));
    ctx.stroke();
  };
  const sides = (fn: (m: boolean, s: number) => void) => {
    fn(false, 1);
    fn(true, -1);
  };
  const housing = (pts: [number, number][], base: string) =>
    sides((m) => {
      poly(pts, m);
      ctx.fillStyle = base;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(1, u * 0.008);
      ctx.stroke();
    });

  switch (art.lamp) {
    case 'gs460': {
      const pts: [number, number][] = [[-0.98, 0.79], [-0.97, 0.97], [-0.62, 0.995], [-0.37, 0.955], [-0.37, 0.86], [-0.7, 0.82]];
      glow(() => housing(pts, red(lit)));
      sides((m, s) => {
        bar(s * -0.93, 0.925, s * -0.42, 0.935, 0.022, 'rgba(235,238,242,0.85)');
        bar(s * -0.92, 0.84, s * -0.72, 0.85, 0.02, red(Math.min(1, lit + 0.2)));
        void m;
      });
      break;
    }
    case 'gsf': {
      const pts: [number, number][] = [[-0.985, 0.78], [-0.97, 0.985], [-0.42, 0.985], [-0.4, 0.9], [-0.8, 0.865], [-0.84, 0.78]];
      housing(pts, '#2b0a0d');
      glow(() =>
        sides((_, s) => {
          for (let i = 0; i < 3; i++) {
            const yy = 0.95 - i * 0.04;
            bar(s * (-0.92 + i * 0.03), 0.8 + i * 0.01, s * (-0.92 + i * 0.03), yy, 0.016, red(lit));
            bar(s * (-0.92 + i * 0.03), yy, s * (-0.48 - i * 0.05), yy + 0.005, 0.016, red(lit));
          }
        }),
      );
      break;
    }
    case 'isf': {
      const pts: [number, number][] = [[-0.98, 0.8], [-0.97, 0.965], [-0.68, 0.99], [-0.45, 0.94], [-0.5, 0.86], [-0.8, 0.82]];
      glow(() => housing(pts, red(lit)));
      sides((_, s) => {
        for (const [cx0, r] of [
          [-0.84, 0.032],
          [-0.67, 0.028],
        ]) {
          ctx.strokeStyle = 'rgba(230,234,240,0.55)';
          ctx.lineWidth = Math.max(1, u * 0.012);
          ctx.beginPath();
          ctx.arc(X(s * cx0), Y(0.9), r * u, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      break;
    }
    case '86': {
      const pts: [number, number][] = [[-0.975, 0.74], [-0.955, 0.88], [-0.56, 0.9], [-0.5, 0.82], [-0.8, 0.74]];
      housing(pts, 'rgba(210,214,220,0.9)');
      glow(() =>
        sides((_, s) => {
          for (let i = 0; i < 5; i++) bar(s * (-0.92 + i * 0.08), 0.77, s * (-0.88 + i * 0.08), 0.87, 0.022, red(lit));
        }),
      );
      break;
    }
    case 'ls460': {
      const pts: [number, number][] = [[-0.98, 0.8], [-0.975, 0.97], [-0.5, 0.97], [-0.5, 0.83]];
      glow(() => housing(pts, red(lit * 0.9)));
      sides((_, s) => bar(s * -0.94, 0.93, s * -0.55, 0.93, 0.016, 'rgba(240,242,245,0.85)'));
      bar(-0.5, 0.88, 0.5, 0.88, 0.028, 'rgba(220,224,230,0.95)');
      break;
    }
    case 'avanteN': {
      const pts: [number, number][] = [[-0.985, 0.84], [-0.965, 0.965], [-0.62, 0.955], [-0.55, 0.9], [-0.7, 0.85]];
      glow(() => {
        housing(pts, red(lit));
        bar(-0.55, 0.925, 0.55, 0.925, 0.014, red(lit));
        sides((_, s) => bar(s * -0.56, 0.885, s * -0.56, 0.965, 0.014, red(lit)));
      });
      break;
    }
    case 'tuscani': {
      glow(() =>
        sides((_, s) => {
          ctx.fillStyle = red(lit);
          ctx.beginPath();
          ctx.ellipse(X(s * -0.79), Y(0.79), 0.19 * u, 0.115 * u, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = Math.max(1, u * 0.008);
          ctx.stroke();
        }),
      );
      sides((_, s) => {
        for (const [cx0, r] of [
          [-0.88, 0.065],
          [-0.71, 0.06],
        ]) {
          ctx.strokeStyle = 'rgba(255,190,190,0.55)';
          ctx.lineWidth = Math.max(1, u * 0.012);
          ctx.beginPath();
          ctx.arc(X(s * cx0), Y(0.79), r * u, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      break;
    }
    case 'e60': {
      const pts: [number, number][] = [[-0.985, 0.74], [-0.965, 0.985], [-0.52, 0.985], [-0.52, 0.9], [-0.84, 0.885], [-0.86, 0.74]];
      housing(pts, '#4a0f13');
      glow(() =>
        sides((_, s) => {
          bar(s * -0.83, 0.955, s * -0.56, 0.955, 0.018, red(Math.max(0.55, lit)));
          bar(s * -0.83, 0.92, s * -0.56, 0.92, 0.018, red(Math.max(0.55, lit)));
          bar(s * -0.93, 0.78, s * -0.93, 0.95, 0.018, red(lit));
        }),
      );
      break;
    }
    case 'e61': {
      housing([[-0.995, 0.8], [-0.975, 1.05], [-0.86, 1.05], [-0.86, 0.8]], '#4a0f13');
      housing([[-0.84, 0.9], [-0.84, 1.0], [-0.6, 0.99], [-0.6, 0.92]], '#4a0f13');
      glow(() =>
        sides((_, s) => {
          bar(s * -0.93, 0.83, s * -0.93, 1.02, 0.018, red(lit));
          bar(s * -0.82, 0.965, s * -0.63, 0.96, 0.018, red(Math.max(0.55, lit)));
          bar(s * -0.82, 0.93, s * -0.63, 0.93, 0.018, red(Math.max(0.55, lit)));
        }),
      );
      break;
    }
  }
  void S;
}

/** Renders a car to a new canvas (menu cards, sprite cache). */
export function renderCarCanvas(art: CarArt, w: number, h: number, state = { brake: false, lights: false }) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const tips = drawCarRear(ctx, art, w / 2, h * 0.94, w * 0.44, state);
  return { canvas: c, tips };
}
