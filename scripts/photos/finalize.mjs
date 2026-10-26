// Pass 2: erase leftover background pieces, cover licence plates / badges, export WebP into public/cars.
// usage: node finalize.mjs <trimDir> <projectPublicCarsDir> <previewOut.jpg>

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [trimDir, outDir, previewOut] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
// all coordinates are fractions of the trimmed image
const plate = (pts, text, bg = '#f3f4f6') => ({ type: 'plate', pts, text, bg });
const J = {
  gs460: {
    erase: [[[0.36, 0], [0.7, 0], [0.7, 0.062], [0.36, 0.062]], [[0.76, 0.06], [0.88, 0.06], [0.88, 0.16], [0.76, 0.16]]],
    over: [
      plate([[0.165, 0.435], [0.372, 0.435], [0.372, 0.54], [0.165, 0.54]], 'GS460'),
      { type: 'badge', rect: [0.383, 0.56, 0.1, 0.045], text: 'GS 460', bg: '#151619' },
    ],
  },
  gsf: { erase: [], over: [plate([[0.333, 0.402], [0.665, 0.402], [0.665, 0.51], [0.333, 0.51]], 'GS F')] },
  isf: { erase: [], over: [] },
  '86gt': { erase: [], over: [plate([[0.381, 0.398], [0.574, 0.398], [0.574, 0.538], [0.381, 0.538]], '86')] },
  ls460: {
    erase: [[[0.585, 0], [1, 0], [1, 0.34], [0.86, 0.34], [0.79, 0.29], [0.62, 0.085], [0.585, 0.06]], [[0.966, 0.6], [1, 0.6], [1, 0.84], [0.966, 0.84]]],
    over: [plate([[0.684, 0.412], [0.786, 0.412], [0.786, 0.532], [0.684, 0.532]], 'LS460')],
  },
  avanten: { erase: [[[0.4, 0], [0.7, 0], [0.7, 0.032], [0.4, 0.032]], [[0.835, 0.1], [1, 0.1], [1, 0.2], [0.835, 0.2]], [[0, 0.95], [1, 0.95], [1, 1], [0, 1]]], over: [] },
  tuscani: {
    erase: [[[0.3, 0], [0.66, 0], [0.66, 0.074], [0.3, 0.074]]],
    over: [plate([[0.092, 0.672], [0.183, 0.705], [0.181, 0.826], [0.088, 0.792]], 'TUSCANI')],
  },
  m5touring: { erase: [], over: [plate([[0.143, 0.428], [0.262, 0.432], [0.26, 0.532], [0.141, 0.528]], 'M5', '#f3f4f6')] },
  m5sedan: { erase: [], over: [plate([[0.694, 0.452], [0.866, 0.452], [0.866, 0.562], [0.694, 0.562]], 'M5')] },
};
const tiles = [];
let k = 0;
for (const [id, job] of Object.entries(J)) {
  const img = sharp(join(trimDir, id + '.png'));
  const { width: W, height: H } = await img.metadata();
  const P = (pts) => pts.map(([x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`).join(' ');
  let base = await img.ensureAlpha().png().toBuffer();
  if (job.erase.length) {
    const mask = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${job.erase.map((pts) => `<polygon points="${P(pts)}" fill="#000"/>`).join('')}</svg>`;
    base = await sharp(base).composite([{ input: Buffer.from(mask), blend: 'dest-out' }]).png().toBuffer();
  }
  let svg = '';
  for (const o of job.over) {
    if (o.type === 'plate') {
      const xs = o.pts.map((p) => p[0] * W);
      const ys = o.pts.map((p) => p[1] * H);
      const cx = xs.reduce((a, b) => a + b) / 4;
      const cy = ys.reduce((a, b) => a + b) / 4;
      const pw = Math.max(...xs) - Math.min(...xs);
      const ph = Math.max(...ys) - Math.min(...ys);
      // slant of the top edge for perspective plates
      const ang = (Math.atan2(ys[1] - ys[0], xs[1] - xs[0]) * 180) / Math.PI;
      const fs = Math.min(ph * 0.55, (pw * 1.25) / Math.max(2, o.text.length));
      svg += `<polygon points="${P(o.pts)}" fill="${o.bg}" stroke="#1f2125" stroke-width="${Math.max(1.5, ph * 0.05)}" stroke-linejoin="round"/>`;
      svg += `<text x="${cx}" y="${cy}" transform="rotate(${ang.toFixed(1)} ${cx} ${cy})" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fs.toFixed(1)}" fill="#111" text-anchor="middle" dominant-baseline="central">${o.text}</text>`;
    } else if (o.type === 'badge') {
      const [x, y, w, h] = o.rect;
      svg += `<rect x="${x * W}" y="${y * H}" width="${w * W}" height="${h * H}" fill="${o.bg}"/>`;
      svg += `<text x="${(x + w / 2) * W}" y="${(y + h / 2) * H}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${h * H * 0.72}" fill="#c9ced6" text-anchor="middle" dominant-baseline="central">${o.text}</text>`;
    }
  }
  if (svg) base = await sharp(base).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`) }]).png().toBuffer();
  const info = await sharp(base).webp({ quality: 86, alphaQuality: 90, effort: 5 }).toFile(join(outDir, id + '.webp'));
  console.log(id, W, H, info.size);
  const prev = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#4a4f57' } }).composite([{ input: await sharp(base).resize(400, 300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() }]).png().toBuffer();
  tiles.push({ input: prev, left: (k % 3) * 400, top: Math.floor(k / 3) * 300 });
  k++;
}
await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#222' } }).composite(tiles).jpeg({ quality: 85 }).toFile(previewOut);
