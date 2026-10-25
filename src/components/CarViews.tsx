import type { ExteriorPlan } from '../types';

const CHROME = '#b8bec7';
const MATTE_EDGE = '#2a2c30';

function Wheel({ cx, cy, r, black, caliperBlack }: { cx: number; cy: number; r: number; black: boolean; caliperBlack: boolean }) {
  const rim = black ? '#141518' : '#a9b0ba';
  const spokes = Array.from({ length: 5 }, (_, i) => (i * 72 * Math.PI) / 180);
  return (
    <g>
      <rect x={cx - r} y={cy - r * 1.05} width={r * 2} height={r * 2.1} rx={r * 0.35} fill="#0a0a0b" />
      <ellipse cx={cx} cy={cy} rx={r * 0.78} ry={r * 0.9} fill={rim} stroke={black ? '#26282c' : '#7c838d'} />
      <rect x={cx - r * 0.18} y={cy - r * 0.62} width={r * 0.36} height={r * 0.4} rx={3} fill={caliperBlack ? '#111214' : '#9f1d1d'} />
      {spokes.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + Math.sin(a) * r * 0.66} y2={cy - Math.cos(a) * r * 0.78} stroke={black ? '#1f2125' : '#cfd4da'} strokeWidth={r * 0.14} strokeLinecap="round" />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.12} fill={black ? '#0d0e10' : '#8a919b'} />
    </g>
  );
}

/** Simplified front & rear elevations for visualising the exterior plan. Not a likeness of any trademarked design. */
export function CarViews({ plan, tipsBlack }: { plan: ExteriorPlan; tipsBlack: boolean }) {
  const body = plan.items.body ? plan.colorHex : '#8b8f96';
  const trim = plan.items.chromeTrim ? '#16171a' : CHROME;
  const emblem = plan.items.grilleEmblem ? '#121315' : CHROME;
  const grille = plan.items.grilleEmblem ? '#1d1f23' : CHROME;
  const badge = plan.items.rearBadges ? '#121315' : CHROME;
  const tip = tipsBlack ? '#0b0b0c' : CHROME;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <figure>
        <svg viewBox="0 0 320 190" className="w-full rounded-lg border border-ink-700 bg-[#101215]" role="img" aria-label="전면 외장 미리보기">
          <defs>
            <linearGradient id="mb-front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={body} />
              <stop offset="1" stopColor={plan.items.body ? '#121315' : '#6b7079'} />
            </linearGradient>
          </defs>
          <Wheel cx={62} cy={150} r={22} black={plan.items.wheels} caliperBlack={plan.items.calipers} />
          <Wheel cx={258} cy={150} r={22} black={plan.items.wheels} caliperBlack={plan.items.calipers} />
          <path d="M 40 150 L 36 112 C 38 96 52 88 70 84 L 100 50 C 108 40 120 36 134 36 L 186 36 C 200 36 212 40 220 50 L 250 84 C 268 88 282 96 284 112 L 280 150 Z" fill="url(#mb-front)" stroke={MATTE_EDGE} />
          <path d="M 106 54 L 214 54 L 238 82 L 82 82 Z" fill="#0b0c0e" opacity="0.85" stroke={trim} strokeWidth="1.5" />
          <path d="M 52 100 L 98 96 L 96 110 L 54 114 Z" fill="#dfe6ee" opacity="0.85" />
          <path d="M 268 100 L 222 96 L 224 110 L 266 114 Z" fill="#dfe6ee" opacity="0.85" />
          <rect x={120} y={98} width={80} height={34} rx={8} fill="#0d0e10" stroke={grille} strokeWidth="2.5" />
          {Array.from({ length: 4 }, (_, i) => (
            <line key={i} x1={124} y1={105 + i * 7} x2={196} y2={105 + i * 7} stroke="#22252a" strokeWidth="2" />
          ))}
          <ellipse cx={160} cy={115} rx={11} ry={8} fill={emblem} stroke={plan.items.grilleEmblem ? '#2b2d31' : '#e5e7eb'} strokeWidth="1.2" />
          <rect x={60} y={150} width={200} height={6} rx={2} fill="#0c0d0f" />
          <rect x={150} y={136} width={20} height={9} rx={1} fill="#e5e7eb" opacity="0.9" />
          <text x={160} y={143} textAnchor="middle" fontSize="5" fill="#111">번호판</text>
        </svg>
        <figcaption className="mt-1 text-center text-[10px] text-metal-500">전면 — 그릴·엠블럼 {plan.items.grilleEmblem ? '무광 블랙' : '순정 크롬'}</figcaption>
      </figure>
      <figure>
        <svg viewBox="0 0 320 190" className="w-full rounded-lg border border-ink-700 bg-[#101215]" role="img" aria-label="후면 외장 미리보기">
          <defs>
            <linearGradient id="mb-rear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={body} />
              <stop offset="1" stopColor={plan.items.body ? '#121315' : '#6b7079'} />
            </linearGradient>
          </defs>
          <Wheel cx={62} cy={150} r={22} black={plan.items.wheels} caliperBlack={plan.items.calipers} />
          <Wheel cx={258} cy={150} r={22} black={plan.items.wheels} caliperBlack={plan.items.calipers} />
          <path d="M 40 152 L 38 108 C 40 94 54 88 72 86 L 104 52 C 112 44 122 40 136 40 L 184 40 C 198 40 208 44 216 52 L 248 86 C 266 88 280 94 282 108 L 280 152 Z" fill="url(#mb-rear)" stroke={MATTE_EDGE} />
          <path d="M 110 56 L 210 56 L 232 82 L 88 82 Z" fill="#0b0c0e" opacity="0.85" />
          <path d="M 48 98 L 106 96 L 104 112 L 50 114 Z" fill="#7f1d1d" />
          <path d="M 272 98 L 214 96 L 216 112 L 270 114 Z" fill="#7f1d1d" />
          <line x1={106} y1={104} x2={214} y2={104} stroke={trim} strokeWidth="2" />
          <ellipse cx={160} cy={96} rx={9} ry={6.5} fill={badge} />
          <rect x={146} y={114} width={28} height={13} rx={1} fill="#e5e7eb" opacity="0.9" />
          <text x={160} y={123} textAnchor="middle" fontSize="6" fill="#111">번호판</text>
          <path d="M 52 140 L 268 140 L 262 156 L 58 156 Z" fill="#0f1012" />
          <ellipse cx={92} cy={148} rx={12} ry={6} fill={tip} stroke="#3a3d42" strokeWidth="1.5" />
          <ellipse cx={228} cy={148} rx={12} ry={6} fill={tip} stroke="#3a3d42" strokeWidth="1.5" />
        </svg>
        <figcaption className="mt-1 text-center text-[10px] text-metal-500">후면 — 듀얼 팁 {tipsBlack ? '블랙' : '크롬'} · 램프/번호판은 도색 제외</figcaption>
      </figure>
    </div>
  );
}
