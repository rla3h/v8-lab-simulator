// Generates app icons (iOS home-screen / bookmarks, PWA, favicon, Windows .ico) from inline SVG.
// Run: node scripts/make-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#23262c"/><stop offset="1" stop-color="#0b0c0e"/>
    </linearGradient>
    <linearGradient id="arc" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#2dd4bf"/><stop offset="0.6" stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <path d="M 215 745 A 330 330 0 1 1 809 745" fill="none" stroke="#1d2026" stroke-width="64" stroke-linecap="round"/>
  <path d="M 215 745 A 330 330 0 1 1 809 745" fill="none" stroke="url(#arc)" stroke-width="64" stroke-linecap="round" stroke-dasharray="1580 2000"/>
  <g stroke="#5c636e" stroke-width="10" stroke-linecap="round">
    <line x1="512" y1="128" x2="512" y2="168"/><line x1="240" y1="240" x2="268" y2="268"/><line x1="784" y1="240" x2="756" y2="268"/>
  </g>
  <line x1="512" y1="520" x2="742" y2="330" stroke="#fb923c" stroke-width="22" stroke-linecap="round"/>
  <circle cx="512" cy="520" r="44" fill="#15181c" stroke="#fb923c" stroke-width="18"/>
  <text x="512" y="842" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="250" letter-spacing="10" fill="#f8fafc">V8</text>
  <text x="512" y="930" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="74" letter-spacing="34" fill="#f97316">LAB</text>
</svg>`;

const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#111316"/>
  <path d="M 13 47 A 22 22 0 1 1 51 47" fill="none" stroke="#f97316" stroke-width="5" stroke-linecap="round"/>
  <text x="32" y="42" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="24" fill="#f8fafc">V8</text>
</svg>`;

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true } }).render().asPng();

writeFileSync('public/icon.svg', full);
writeFileSync('public/favicon.svg', small);
writeFileSync('public/apple-touch-icon.png', png(full, 180));
writeFileSync('public/icon-192.png', png(full, 192));
writeFileSync('public/icon-512.png', png(full, 512));

// ICO with embedded PNGs (supported since Windows Vista)
const sizes = [16, 32, 48, 256];
const imgs = sizes.map((s) => png(s <= 48 ? small : full, s));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(imgs.length, 4);
let offset = 6 + 16 * imgs.length;
const dir = imgs.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0); e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(img.length, 8); e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync('public/favicon.ico', Buffer.concat([header, ...dir, ...imgs]));
console.log('icons written');
