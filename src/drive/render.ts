import { SEG_LEN, type Segment, type Track } from './tracks';
import type { Backdrop, SpriteImg } from './sprites';
import type { SpriteKind } from './tracks';

/**
 * Pseudo-3D road renderer (segment projection, painter's algorithm for sprites).
 * The lateral offset per segment uses the same curvature as the physics model, so the
 * road on screen bends exactly as hard as the car is pushed.
 */

/**
 * Lateral offset growth (cm per segment², per curve unit). The physics uses κ = 0.0028·curve 1/m;
 * after k segments of 6 m the true offset is 100·κ·(6k)²/2 = 5.04·curve·k² cm, and the
 * accumulated x of the renderer is C·curve·k²/2 → C = 10.08.
 */
export const CURVE_OFFSET = 10.08;

export interface View {
  position: number;
  playerX: number;
  playerY: number;
  fovDeg: number;
  shakeX: number;
  shakeY: number;
  bgFar: number;
  bgNear: number;
  bgPitch: number;
}

interface SegScreen {
  seg: Segment;
  x1: number;
  y1: number;
  w1: number;
  s1: number;
  x2: number;
  y2: number;
  w2: number;
  s2: number;
  clip: number;
  fog: number;
  visible: boolean;
}

export interface RenderOut {
  horizonY: number;
  focal: number;
  /** screen-space lamp glows for night additive pass */
  glows: { x: number; y: number; r: number }[];
}

export class TrackRenderer {
  private buf: SegScreen[] = [];
  readonly roadW: number;

  constructor(
    readonly track: Track,
    readonly sprites: Record<SpriteKind, SpriteImg>,
    readonly backdrop: Backdrop,
  ) {
    this.roadW = track.halfWidthM * 100;
  }

  render(g: CanvasRenderingContext2D, W: number, H: number, v: View): RenderOut {
    const t = this.track;
    const th = t.theme;
    const segs = t.segments;
    const n = segs.length;
    const depth = 1 / Math.tan(((v.fovDeg / 2) * Math.PI) / 180);
    const focal = (depth * Math.max(W, H * 1.5)) / 2;
    const horizonY = H * 0.47;
    const camH = t.cameraHeight;
    const camY = v.playerY + camH;
    const pX = v.playerX * this.roadW;
    const glows: RenderOut['glows'] = [];

    g.save();
    g.translate(v.shakeX, v.shakeY);

    // ── sky & parallax
    const sky = g.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, th.skyTop);
    sky.addColorStop(1, th.skyBottom);
    g.fillStyle = sky;
    g.fillRect(-20, -20, W + 40, horizonY + 40);
    const lay = (img: HTMLCanvasElement, hFrac: number, off: number) => {
      const lh = H * hFrac;
      const lw = (lh * img.width) / img.height;
      const y = horizonY + 2 - lh + v.bgPitch * H;
      let x = -(((off % 1) + 1) % 1) * lw;
      for (; x < W + 20; x += lw) g.drawImage(img, x - 10, y, lw, lh);
    };
    lay(this.backdrop.far, 0.36, v.bgFar);
    lay(this.backdrop.near, 0.17, v.bgNear);
    // ground below horizon (fallback colour behind segments)
    g.fillStyle = th.groundR[1];
    g.fillRect(-20, horizonY, W + 40, H - horizonY + 20);
    if (th.id === 'coast') {
      g.fillStyle = th.groundL[1];
      g.fillRect(-20, horizonY, W / 2 + 20, H - horizonY + 20);
    }

    // ── project segments (near → far) and draw the road
    const baseIdx = Math.floor(v.position / SEG_LEN);
    const basePct = (v.position % SEG_LEN) / SEG_LEN;
    let x = 0;
    let dx = -segs[((baseIdx % n) + n) % n].curve * CURVE_OFFSET * basePct;
    let maxy = H;
    const count = t.drawDistance;
    this.buf.length = 0;
    for (let k = 0; k < count; k++) {
      const idx = baseIdx + k;
      if (!t.loop && idx >= n) break;
      const seg = segs[((idx % n) + n) % n];
      let z1 = idx * SEG_LEN - v.position;
      const z2 = z1 + SEG_LEN;
      let xa = x;
      const xb = x + dx;
      let ya = seg.y1;
      x += dx;
      dx += seg.curve * CURVE_OFFSET;
      if (z2 <= 25) continue;
      if (z1 < 25) {
        // segment straddles the camera plane: start it just in front of the camera so the road reaches the screen bottom
        const f = (25 - z1) / SEG_LEN;
        xa += (xb - xa) * f;
        ya += (seg.y2 - seg.y1) * f;
        z1 = 25;
      }
      const s1 = focal / z1;
      const s2 = focal / z2;
      const sc: SegScreen = {
        seg,
        x1: W / 2 + (xa - pX) * s1,
        y1: horizonY - (ya - camY) * s1,
        w1: this.roadW * s1,
        s1,
        x2: W / 2 + (xb - pX) * s2,
        y2: horizonY - (seg.y2 - camY) * s2,
        w2: this.roadW * s2,
        s2,
        clip: maxy,
        fog: 1 - Math.exp(-Math.pow(k / count, 2) * th.fogDensity),
        visible: false,
      };
      this.buf.push(sc);
      if (sc.y2 >= sc.y1 || sc.y2 >= maxy) continue;
      sc.visible = true;
      this.drawSegment(g, W, sc, Math.min(sc.y1, maxy));
      maxy = sc.y2;
    }

    // ── sprites & rails (far → near)
    for (let i = this.buf.length - 1; i >= 0; i--) {
      const sc = this.buf[i];
      const seg = sc.seg;
      if (seg.railL || seg.railR) this.drawRails(g, sc);
      for (const sp of seg.sprites) {
        const img = this.sprites[sp.kind];
        if (!img) continue;
        const dw = img.w * 100 * sc.s1;
        const dh = img.h * 100 * sc.s1;
        if (dw < 1.5) continue;
        const cx = sc.x1 + sp.offset * sc.w1;
        const bottom = sc.y1;
        const top = bottom - dh;
        if (top >= sc.clip || cx + dw / 2 < -50 || cx - dw / 2 > W + 50) continue;
        const visH = Math.min(dh, sc.clip - top);
        const srcH = (img.canvas.height * visH) / dh;
        g.globalAlpha = 1 - sc.fog * 0.85;
        g.drawImage(img.canvas, 0, 0, img.canvas.width, srcH, cx - dw / 2, top, dw, visH);
        g.globalAlpha = 1;
        if (th.night && sp.kind === 'lamp') glows.push({ x: cx - dw * 0.26, y: top + dh * 0.15, r: dw * 2.2 });
      }
    }
    g.restore();
    return { horizonY, focal, glows };
  }

  private drawSegment(g: CanvasRenderingContext2D, W: number, sc: SegScreen, yNear: number) {
    const th = this.track.theme;
    const seg = sc.seg;
    const dark = seg.band;
    const { x1, w1, x2, y2, w2 } = sc;
    const y1 = yNear;
    const quad = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.lineTo(cx, cy);
      g.lineTo(dx, dy);
      g.closePath();
      g.fill();
    };
    const rk = th.rumble ? 1.1 : 1.04;
    // ground (left/right can differ — sea on the coast road)
    quad(-20, y2, x2 - w2 * rk, y2, x1 - w1 * rk, y1, -20, y1, th.groundL[dark]);
    quad(x2 + w2 * rk, y2, W + 20, y2, W + 20, y1, x1 + w1 * rk, y1, th.groundR[dark]);
    if (th.id === 'coast') {
      // sand/foam strip on the sea side
      quad(x2 - w2 * 1.32, y2, x2 - w2 * rk, y2, x1 - w1 * rk, y1, x1 - w1 * 1.32, y1, dark ? '#d9c08d' : '#e6cf9c');
    }
    // rumble strips / kerbs
    if (th.rumble) {
      const c = th.rumble[dark];
      quad(x2 - w2 * rk, y2, x2 - w2, y2, x1 - w1, y1, x1 - w1 * rk, y1, c);
      quad(x2 + w2, y2, x2 + w2 * rk, y2, x1 + w1 * rk, y1, x1 + w1, y1, c);
    } else {
      quad(x2 - w2 * rk, y2, x2 - w2, y2, x1 - w1, y1, x1 - w1 * rk, y1, th.road[dark]);
      quad(x2 + w2, y2, x2 + w2 * rk, y2, x1 + w1 * rk, y1, x1 + w1, y1, th.road[dark]);
    }
    // asphalt
    quad(x2 - w2, y2, x2 + w2, y2, x1 + w1, y1, x1 - w1, y1, th.road[dark]);
    // edge lines
    const el = 0.035;
    quad(x2 - w2 * 0.97, y2, x2 - w2 * (0.97 - el), y2, x1 - w1 * (0.97 - el), y1, x1 - w1 * 0.97, y1, th.edge);
    quad(x2 + w2 * (0.97 - el), y2, x2 + w2 * 0.97, y2, x1 + w1 * 0.97, y1, x1 + w1 * (0.97 - el), y1, th.edge);
    // centre line
    if (th.center === 'double-yellow') {
      for (const o of [-0.035, 0.015]) quad(x2 + w2 * o, y2, x2 + w2 * (o + 0.02), y2, x1 + w1 * (o + 0.02), y1, x1 + w1 * o, y1, '#e8b923');
    } else if (th.center === 'dashed-white' && !dark) {
      quad(x2 - w2 * 0.015, y2, x2 + w2 * 0.015, y2, x1 + w1 * 0.015, y1, x1 - w1 * 0.015, y1, '#e6e6e6');
    }
    // start / finish chequer
    if (seg.marker) {
      const cols = 12;
      const ym = (y1 + y2) / 2;
      for (let r = 0; r < 2; r++) {
        const ya = r === 0 ? y1 : ym;
        const yb = r === 0 ? ym : y2;
        const ta = r === 0 ? 0 : 0.5;
        const tb = r === 0 ? 0.5 : 1;
        const xa = x1 + (x2 - x1) * ta;
        const wa = w1 + (w2 - w1) * ta;
        const xb = x1 + (x2 - x1) * tb;
        const wb = w1 + (w2 - w1) * tb;
        for (let c = 0; c < cols; c++) {
          if ((c + r) % 2) continue;
          const f0 = -1 + (2 * c) / cols;
          const f1 = -1 + (2 * (c + 1)) / cols;
          quad(xb + wb * f0, yb, xb + wb * f1, yb, xa + wa * f1, ya, xa + wa * f0, ya, '#f4f4f4');
        }
      }
    }
    // fog
    if (sc.fog > 0.01) {
      g.globalAlpha = sc.fog;
      g.fillStyle = th.fog;
      g.fillRect(-20, y2, W + 40, y1 - y2 + 1);
      g.globalAlpha = 1;
    }
  }

  private drawRails(g: CanvasRenderingContext2D, sc: SegScreen) {
    const th = this.track.theme;
    const railX = 1.16;
    const h1 = 80 * sc.s1;
    const h2 = 80 * sc.s2;
    if (sc.y2 - h2 >= sc.clip) return;
    g.globalAlpha = 1 - sc.fog * 0.9;
    for (const side of [-1, 1]) {
      if ((side < 0 && !sc.seg.railL) || (side > 0 && !sc.seg.railR)) continue;
      const xa = sc.x1 + side * sc.w1 * railX;
      const xb = sc.x2 + side * sc.w2 * railX;
      // post
      g.fillStyle = th.railPost;
      const pw = Math.max(1, 14 * sc.s1);
      g.fillRect(xa - pw / 2, sc.y1 - h1, pw, Math.min(h1, sc.clip - (sc.y1 - h1)));
      // W-beam
      g.fillStyle = sc.seg.band ? th.rail : shadeHex(th.rail, -0.12);
      g.beginPath();
      g.moveTo(xa, sc.y1 - h1);
      g.lineTo(xb, sc.y2 - h2);
      g.lineTo(xb, sc.y2 - h2 * 0.6);
      g.lineTo(xa, sc.y1 - h1 * 0.6);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
