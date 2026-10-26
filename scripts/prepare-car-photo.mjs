// Prepares a user-supplied rear photo as a V8 LAB DRIVE car sprite.
//
//   node scripts/prepare-car-photo.mjs <input> <carId> [options]
//
// Options
//   --crop x,y,w,h     crop first (fractions of the input, e.g. 0.1,0.2,0.8,0.7)
//   --ground y         cut everything below this line (fraction of the cropped height) — removes floor reflections
//   --tol n            local colour step for the background flood fill (default 14)
//   --global n         max distance from the border colours (default 90)
//   --keep-bg          do not remove the background (photo already cut out, or for a quick test)
//   --preview path     also write a preview on a checkerboard (PNG)
//
// Images that already have transparency (e.g. iPhone "lift subject" PNGs) skip background removal.
// Output: public/cars/<carId>.webp (max 960 px wide, with alpha) + a JSON summary on stdout.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node scripts/prepare-car-photo.mjs <input> <carId> [--crop x,y,w,h] [--ground y] [--tol n] [--global n] [--keep-bg] [--preview path]');
  process.exit(1);
}
const [input, carId] = args;
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const tol = Number(opt('tol', 14));
const globalTol = Number(opt('global', 90));
const preview = opt('preview', null);

let img = sharp(input, { failOn: 'none' }).rotate(); // honour EXIF orientation
const meta0 = await img.metadata();
const crop = opt('crop', null);
if (crop) {
  const [x, y, w, h] = crop.split(',').map(Number);
  img = img.extract({
    left: Math.round(x * meta0.width),
    top: Math.round(y * meta0.height),
    width: Math.round(w * meta0.width),
    height: Math.round(h * meta0.height),
  });
}
// work at a sensible resolution
img = img.resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = new Uint8ClampedArray(data);

let transparent = 0;
for (let i = 3; i < px.length; i += 4) if (px[i] < 250) transparent++;
const hasAlpha = transparent > W * H * 0.02;

const bg = new Uint8Array(W * H); // 1 = background
if (!hasAlpha && !flag('keep-bg')) {
  // border colour samples (for the global guard)
  const seeds = [];
  for (let x = 0; x < W; x += 4) seeds.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y += 4) seeds.push(y * W, y * W + W - 1);
  const samples = seeds.map((i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const nearBorder = (r, g, b) => {
    let m = Infinity;
    for (const s of samples) {
      const d = Math.hypot(r - s[0], g - s[1], b - s[2]);
      if (d < m) m = d;
      if (m < 6) break;
    }
    return m;
  };
  const queue = new Int32Array(W * H);
  let qh = 0;
  let qt = 0;
  for (const i of seeds) {
    if (!bg[i]) {
      bg[i] = 1;
      queue[qt++] = i;
    }
  }
  const globalOk = new Map();
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % W;
    const y = (i / W) | 0;
    const c = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (bg[j]) continue;
      const d = [px[j * 4], px[j * 4 + 1], px[j * 4 + 2]];
      if (dist(c, d) > tol) continue;
      const key = (d[0] >> 2) * 4096 + (d[1] >> 2) * 64 + (d[2] >> 2);
      let ok = globalOk.get(key);
      if (ok === undefined) {
        ok = nearBorder(d[0], d[1], d[2]) < globalTol;
        globalOk.set(key, ok);
      }
      if (!ok) continue;
      bg[j] = 1;
      queue[qt++] = j;
    }
  }
  // keep the largest foreground component (drops specks)
  const label = new Int32Array(W * H).fill(-1);
  let best = -1;
  let bestSize = 0;
  let id = 0;
  for (let s = 0; s < W * H; s++) {
    if (bg[s] || label[s] >= 0) continue;
    let size = 0;
    qh = qt = 0;
    queue[qt++] = s;
    label[s] = id;
    while (qh < qt) {
      const i = queue[qh++];
      size++;
      const x = i % W;
      const y = (i / W) | 0;
      for (const j of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < H ? i + W : -1, y > 0 ? i - W : -1]) {
        if (j < 0 || bg[j] || label[j] >= 0) continue;
        label[j] = id;
        queue[qt++] = j;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
    id++;
  }
  for (let i = 0; i < W * H; i++) if (!bg[i] && label[i] !== best) bg[i] = 1;
  // soft edge: 3×3 average of the mask
  const alpha = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          s += bg[yy * W + xx] ? 0 : 1;
          n++;
        }
      alpha[y * W + x] = Math.round((s / n) * 255);
    }
  for (let i = 0; i < W * H; i++) px[i * 4 + 3] = bg[i] ? 0 : alpha[i];
}

// ground cut (floor reflections etc.)
const ground = opt('ground', null);
if (ground) {
  const gy = Math.round(Number(ground) * H);
  for (let y = gy; y < H; y++) for (let x = 0; x < W; x++) px[(y * W + x) * 4 + 3] = 0;
}

// bounding box of the car
let minX = W;
let minY = H;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (px[(y * W + x) * 4 + 3] > 24) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
if (maxX <= minX || maxY <= minY) {
  console.error('nothing left after background removal — try --keep-bg, a smaller --global, or a cut-out PNG');
  process.exit(2);
}
const pad = Math.round((maxX - minX) * 0.02);
const left = Math.max(0, minX - pad);
const top = Math.max(0, minY - pad);
const width = Math.min(W - left, maxX - minX + 1 + pad * 2);
const height = Math.min(H - top, maxY - minY + 1 + pad);

const out = resolve('public/cars', `${carId}.webp`);
mkdirSync(dirname(out), { recursive: true });
const cut = sharp(Buffer.from(px.buffer), { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width, height })
  .resize({ width: 960, withoutEnlargement: true });
const outInfo = await cut.clone().webp({ quality: 90, alphaQuality: 95 }).toFile(out);

if (preview) {
  const tile = 24;
  const cw = outInfo.width;
  const ch = outInfo.height;
  const board = Buffer.alloc(cw * ch * 3);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const v = ((x / tile) | 0) % 2 === ((y / tile) | 0) % 2 ? 70 : 110;
      board.fill(v, (y * cw + x) * 3, (y * cw + x) * 3 + 3);
    }
  await sharp(board, { raw: { width: cw, height: ch, channels: 3 } })
    .composite([{ input: await cut.clone().png().toBuffer() }])
    .png()
    .toFile(preview);
}

console.log(
  JSON.stringify({
    carId,
    out,
    size: [outInfo.width, outInfo.height],
    backgroundRemoved: !hasAlpha && !flag('keep-bg'),
    inputHadAlpha: hasAlpha,
    aspect: +(outInfo.height / outInfo.width).toFixed(3),
  }),
);
