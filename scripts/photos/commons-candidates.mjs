// Collect Wikimedia Commons candidates (free licences only) per car, download small thumbnails, write metadata.
// usage: node commons-candidates.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const out = process.argv[2];
const UA = 'V8LAB/0.1 (personal non-commercial project; github.com/rla3h)';
const Q = {
  gs460: ['Lexus GS 460 rear', 'Lexus GS460 rear', 'Lexus GS S190 rear', 'Lexus GS 460 Heck'],
  gsf: ['Lexus GS F rear', 'Lexus GS-F rear', 'Lexus GS F URL10 rear'],
  isf: ['Lexus IS F rear', 'Lexus IS-F rear'],
  '86gt': ['Toyota 86 GT rear', 'Toyota 86 rear', 'Toyota GT86 rear', 'Toyota 86 ZN6 rear'],
  ls460: ['Lexus LS 460 rear', 'Lexus LS460 rear', 'Lexus LS XF40 rear'],
  avanten: ['Hyundai Elantra N rear', 'Hyundai Avante N rear', 'Elantra N CN7 rear'],
  tuscani: ['Hyundai Tiburon rear', 'Hyundai Tuscani rear', 'Hyundai Coupe GK rear', 'Hyundai Tiburon GK rear'],
  m5touring: ['BMW M5 Touring E61 rear', 'BMW M5 E61 rear', 'BMW M5 Touring rear'],
  m5sedan: ['BMW M5 E60 rear', 'BMW M5 (E60) rear', 'BMW E60 M5 rear'],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (params) => {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', maxlag: '5', ...params });
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(1500 + attempt * 4000);
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    const t = await r.text();
    try { return JSON.parse(t); } catch { console.error('retry', r.status, t.slice(0, 60)); }
  }
  throw new Error('Commons API unavailable');
};
const strip = (h) => String(h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const FREE = /^(cc[ -]?by|cc0|public domain|pd|attribution|cc-by)/i;
for (const [car, queries] of Object.entries(Q)) {
  const titles = new Set();
  for (const q of queries) {
    const j = await api({ action: 'query', list: 'search', srnamespace: '6', srlimit: '25', srsearch: q });
    for (const s of j.query?.search ?? []) if (/\.(jpe?g|png|webp)$/i.test(s.title)) titles.add(s.title);
  }
  const list = [...titles];
  const meta = [];
  for (let i = 0; i < list.length; i += 40) {
    const j = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '360', titles: list.slice(i, i + 40).join('|') });
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const em = ii.extmetadata ?? {};
      const lic = strip(em.LicenseShortName?.value);
      if (!FREE.test(lic)) continue;
      meta.push({ title: p.title, w: ii.width, h: ii.height, thumb: ii.thumburl, url: ii.url, page: ii.descriptionurl, license: lic, licenseUrl: em.LicenseUrl?.value ?? '', artist: strip(em.Artist?.value), credit: strip(em.Credit?.value) });
    }
  }
  // keep relevant model names only
  const want = {
    gs460: /gs ?460|gs.*s19/i, gsf: /gs[ -]?f\b/i, isf: /is[ -]?f\b/i, '86gt': /86|gt86/i, ls460: /ls ?460|ls.*xf40/i,
    avanten: /elantra n|avante n|elantra.*n\b/i, tuscani: /tiburon|tuscani|coupe/i, m5touring: /m5.*touring|e61/i, m5sedan: /m5.*e60|e60.*m5/i,
  }[car];
  const sel = meta.filter((m) => want.test(m.title)).slice(0, 24);
  const dir = join(out, car);
  mkdirSync(dir, { recursive: true });
  for (let k = 0; k < sel.length; k++) {
    await sleep(700);
    const r = await fetch(sel[k].thumb, { headers: { 'User-Agent': UA } });
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(join(dir, `${String(k).padStart(2, '0')}.jpg`), buf);
    sel[k].idx = k;
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(sel, null, 2));
  console.log(car, sel.length);
}
