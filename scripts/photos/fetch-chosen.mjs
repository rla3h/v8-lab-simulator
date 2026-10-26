// Download chosen Commons files at 1600 px and record licence metadata. usage: node fetch-chosen.mjs <scratchDir> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const UA = 'V8LAB/0.1 (personal non-commercial project; github.com/rla3h)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = {
  gs460: ['commons-dl2/gs460', 1],
  gsf: ['commons-dl/gsf', 0],
  isf: ['commons-dl/isf', 0],
  '86gt-a': ['commons-dl/86gt', 8],
  '86gt-b': ['commons-dl/86gt', 20],
  ls460: ['commons-dl/ls460', 15],
  avanten: ['commons-dl/avanten', 15],
  'tuscani-a': ['commons-dl/tuscani', 6],
  'tuscani-b': ['commons-dl2/tuscani', 20],
  'm5touring-a': ['commons-dl/m5touring', 0],
  'm5touring-b': ['commons-dl2/m5touring', 8],
  m5sedan: ['commons-dl/m5sedan', 1],
};
const credits = {};
for (const [id, [dir, idx]] of Object.entries(pick)) {
  const meta = JSON.parse(readFileSync(join(base, dir, 'meta.json'), 'utf8'))[idx];
  const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '1600', titles: meta.title });
  await sleep(1500);
  const j = await (await fetch(api, { headers: { 'User-Agent': UA } })).json();
  const ii = Object.values(j.query.pages)[0].imageinfo[0];
  await sleep(800);
  const buf = Buffer.from(await (await fetch(ii.thumburl, { headers: { 'User-Agent': UA } })).arrayBuffer());
  writeFileSync(join(out, `${id}.jpg`), buf);
  credits[id] = { title: meta.title, page: meta.page, license: meta.license, licenseUrl: meta.licenseUrl, artist: meta.artist, credit: meta.credit };
  console.log(id, buf.length, meta.license, '|', meta.artist.slice(0, 50));
}
writeFileSync(join(out, 'credits.json'), JSON.stringify(credits, null, 2));
