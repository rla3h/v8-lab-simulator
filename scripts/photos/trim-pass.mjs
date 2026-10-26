// Pass 1: clean alpha (threshold, largest component, optional erase rects), trim, and write a grid preview.
// usage: node trim-pass.mjs <cutDir> <outDir>

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [cutDir, outDir] = process.argv.slice(2);
mkdirSync(join(outDir, 'trim'), { recursive: true });
mkdirSync(join(outDir, 'grid'), { recursive: true });
// erase rects are fractions of the untrimmed cut image
const jobs = {
  gs460: { src: 'gs460', erase: [] },
  gsf: { src: 'gsf', erase: [] },
  isf: { src: 'isf', erase: [] },
  '86gt': { src: '86gt-b', erase: [] },
  ls460: { src: 'ls460', erase: [] },
  avanten: { src: 'avanten', erase: [] },
  tuscani: { src: 'tuscani-b', erase: [] },
  m5touring: { src: 'm5touring-a', erase: [] },
  m5sedan: { src: 'm5sedan', erase: [] },
};
for (const [id, job] of Object.entries(jobs)) {
  const { data, info } = await sharp(join(cutDir, job.src + '.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const a = (i) => data[i * 4 + 3];
  for (let i = 0; i < W * H; i++) if (a(i) < 40) data[i * 4 + 3] = 0;
  for (const [x, y, w, h] of job.erase)
    for (let yy = Math.round(y * H); yy < Math.round((y + h) * H); yy++)
      for (let xx = Math.round(x * W); xx < Math.round((x + w) * W); xx++) data[(yy * W + xx) * 4 + 3] = 0;
  // largest 4-connected component
  const lab = new Int32Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let best = -1, bestN = 0, id2 = 0;
  for (let s = 0; s < W * H; s++) {
    if (!a(s) || lab[s] >= 0) continue;
    let h = 0, t = 0, n = 0;
    q[t++] = s; lab[s] = id2;
    while (h < t) {
      const i = q[h++]; n++;
      const x = i % W, y = (i / W) | 0;
      for (const j of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < H ? i + W : -1, y > 0 ? i - W : -1])
        if (j >= 0 && a(j) && lab[j] < 0) { lab[j] = id2; q[t++] = j; }
    }
    if (n > bestN) { bestN = n; best = id2; }
    id2++;
  }
  for (let i = 0; i < W * H; i++) if (lab[i] !== best) data[i * 4 + 3] = 0;
  const trimmed = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 0 }).resize({ width: 900, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  await sharp(trimmed.data).toFile(join(outDir, 'trim', id + '.png'));
  const tw = trimmed.info.width, th = trimmed.info.height;
  let lines = '';
  for (let k = 1; k < 10; k++) {
    lines += `<line x1="${(k * tw) / 10}" y1="0" x2="${(k * tw) / 10}" y2="${th}" stroke="#0ff" stroke-opacity="0.55" stroke-width="1"/><text x="${(k * tw) / 10 + 2}" y="12" font-size="11" fill="#0ff" font-family="Arial">${k / 10}</text>`;
    lines += `<line x1="0" y1="${(k * th) / 10}" x2="${tw}" y2="${(k * th) / 10}" stroke="#f0f" stroke-opacity="0.55" stroke-width="1"/><text x="2" y="${(k * th) / 10 - 2}" font-size="11" fill="#f0f" font-family="Arial">${k / 10}</text>`;
  }
  await sharp({ create: { width: tw, height: th, channels: 3, background: '#3a3d42' } })
    .composite([{ input: trimmed.data }, { input: Buffer.from(`<svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`) }])
    .jpeg({ quality: 85 })
    .toFile(join(outDir, 'grid', id + '.jpg'));
  console.log(id, tw, th);
}
