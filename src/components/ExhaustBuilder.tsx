import { useMemo, useState, type DragEvent } from 'react';
import { useStore, type Side } from '../store';
import { PART_SPECS } from '../data/exhaust';
import type { ExhaustConfig, Part, PartKind } from '../types';
import { compileExhaust, logFreqs, sideResponseDb } from '../dsp/compile';
import { Card, Tag } from './ui';
import { LineChart } from './charts';
import { exportSvg, exportSvgAsPng } from '../lib/download';
import { VehicleGallery } from './VehicleGallery';

const W = 1000;
const H = 380;
const Y: Record<Side, number> = { right: 128, left: 252 }; // top-down view, front at left → RH is on top
const X_CROSS = 430;
const X_POST0 = 500;
const X_POST1 = 905;

const PART_W: Partial<Record<PartKind, number>> = {
  'res-helmholtz': 62,
  'res-absorptive': 62,
  'quarter-wave': 48,
  'muffler-chambered': 92,
  'muffler-straight': 92,
  'muffler-valved': 96,
};

function layout(parts: Part[]) {
  const raw = parts.map((p) => (p.kind === 'pipe' ? Math.max(36, p.params.lengthMm / 18) : PART_W[p.kind] ?? 60));
  const total = raw.reduce((a, b) => a + b, 0);
  const avail = X_POST1 - X_POST0;
  const scale = Math.min(1.4, avail / total);
  let x = X_POST0;
  return parts.map((p, i) => {
    const w = raw[i] * scale;
    const r = { part: p, x, w };
    x += w;
    return r;
  });
}

export function CarTopView({ color, wheelsBlack }: { color: string; wheelsBlack: boolean }) {
  // simplified sedan plan view; conceptual, not to scale
  const wheel = wheelsBlack ? '#0c0d0f' : '#9aa1ab';
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id="matte" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#232529" stopOpacity="0.95" />
          <stop offset="1" stopColor={color} stopOpacity="0.95" />
        </linearGradient>
      </defs>
      {[160, 770].map((x) =>
        [22, 318].map((y) => <rect key={`${x}-${y}`} x={x - 46} y={y} width="92" height="40" rx="10" fill={wheel} stroke="#3d434d" />),
      )}
      <path
        d="M 60 120 C 60 60 110 38 200 34 L 820 34 C 900 36 952 60 958 110 L 958 270 C 952 320 900 344 820 346 L 200 346 C 110 342 60 320 60 260 Z"
        fill="url(#matte)"
        stroke="#3a3f47"
        strokeWidth="1.5"
      />
      <path d="M 300 70 L 660 70 C 700 72 720 100 722 130 L 722 250 C 720 280 700 308 660 310 L 300 310 C 262 306 246 280 244 250 L 244 130 C 246 100 262 74 300 70 Z" fill="#0f1012" opacity="0.65" />
      <text x={510} y={196} textAnchor="middle" fontSize="10" fill="#3d434d" letterSpacing="4">
        CABIN
      </text>
      <line x1={160} y1={364} x2={770} y2={364} stroke="#3d434d" strokeDasharray="4 4" />
      <text x={465} y={376} textAnchor="middle" fontSize="9" fill="#5c636e">
        휠베이스 (개념 표시 · 실측 아님)
      </text>
    </g>
  );
}

function PartGlyph({ p, x, w, y, selected }: { p: Part; x: number; w: number; y: number; selected: boolean }) {
  const spec = PART_SPECS[p.kind];
  const stroke = selected ? '#2dd4bf' : '#7d8591';
  if (p.kind === 'pipe') {
    const th = Math.max(5, (p.params.diameterMm / 76) * 12);
    return (
      <g>
        <rect x={x} y={y - th / 2} width={w} height={th} fill="#3d434d" stroke={stroke} strokeWidth={selected ? 2 : 1} rx="2" />
        <text x={x + w / 2} y={y - th / 2 - 4} textAnchor="middle" fontSize="9" fill="#a3aab5">
          {Math.round(p.params.lengthMm)}×Ø{p.params.diameterMm}
        </text>
      </g>
    );
  }
  const h = spec.isMuffler ? 46 : p.kind === 'quarter-wave' ? 20 : 30;
  const fill = spec.isMuffler ? '#1f2329' : '#262b33';
  return (
    <g>
      <rect x={x + 2} y={y - h / 2} width={w - 4} height={h} rx={spec.isMuffler ? 8 : 12} fill={fill} stroke={stroke} strokeWidth={selected ? 2.2 : 1.2} />
      {p.kind === 'quarter-wave' && <line x1={x + w / 2} y1={y + h / 2} x2={x + w / 2} y2={y + h / 2 + 18} stroke={stroke} strokeWidth="5" />}
      <text x={x + w / 2} y={y + 3} textAnchor="middle" fontSize="10" fontWeight="600" fill={selected ? '#5eead4' : '#c9ced6'} fontFamily="monospace">
        {spec.short}
      </text>
      <text x={x + w / 2} y={y + h / 2 + (p.kind === 'quarter-wave' ? 30 : 12)} textAnchor="middle" fontSize="8.5" fill="#7d8591">
        {p.kind === 'res-helmholtz' || p.kind === 'quarter-wave'
          ? `${p.params.tuneHz}Hz −${p.params.depthDb}dB`
          : p.kind === 'res-absorptive'
            ? `>${p.params.cornerHz}Hz −${p.params.cutDb}dB`
            : p.kind === 'muffler-valved'
              ? `닫힘 −${p.params.closedAttenDb} / 열림 −${p.params.openAttenDb}dB`
              : `−${p.params.attenDb}dB`}
      </text>
      {p.kind === 'muffler-valved' && <circle cx={x + w - 12} cy={y - h / 2 + 10} r="5" fill="none" stroke="#f97316" strokeWidth="1.5" />}
    </g>
  );
}

export function ExhaustDiagram({ cfg, interactive = true, exteriorColor = '#1b1c1f', wheelsBlack = true, idSvg }: { cfg: ExhaustConfig; interactive?: boolean; exteriorColor?: string; wheelsBlack?: boolean; idSvg?: string }) {
  const selected = useStore((s) => s.selected);
  const set = useStore((s) => s.set);
  const addPart = useStore((s) => s.addPart);
  const [dropSide, setDropSide] = useState<Side | null>(null);
  const isSel = (z: string, side?: Side, uid?: string) =>
    interactive && !!selected && selected.zone === z && (z !== 'part' || ((selected as any).side === side && (selected as any).uid === uid));
  const sel = (s: any) => interactive && set({ selected: s });

  const onDrop = (side: Side) => (e: DragEvent) => {
    e.preventDefault();
    setDropSide(null);
    const kind = e.dataTransfer.getData('application/x-v8lab-part') as PartKind;
    if (kind && PART_SPECS[kind]) addPart(side, kind);
  };

  const tipColor = cfg.tips.finish === 'black' ? '#0b0b0c' : cfg.tips.finish === 'titanium' ? '#6b6fa8' : '#c9ced6';

  return (
    <svg id={idSvg} viewBox={`0 0 ${W} ${H + 10}`} className="w-full select-none" role="img" aria-label="배기 시스템 2D 개념 구조도">
      <rect x="0" y="0" width={W} height={H + 10} fill="#0d0f12" />
      <CarTopView color={exteriorColor} wheelsBlack={wheelsBlack} />
      {/* engine */}
      <g onClick={() => sel(null)} className={interactive ? 'cursor-pointer' : ''}>
        <rect x={92} y={120} width={140} height={140} rx={10} fill="#16181c" stroke="#5c636e" />
        <text x={162} y={186} textAnchor="middle" fontSize="12" fill="#f97316" fontFamily="monospace" fontWeight="700">
          V8
        </text>
        <text x={162} y={202} textAnchor="middle" fontSize="8" fill="#7d8591">
          RH 뱅크 ↑ · LH 뱅크 ↓
        </text>
      </g>
      {(['right', 'left'] as Side[]).map((side) => {
        const y = Y[side];
        const items = layout(cfg[side]);
        const lastX = items.length ? items[items.length - 1].x + items[items.length - 1].w : X_POST0;
        return (
          <g key={side}>
            {/* header → catalyst → front pipe */}
            <path d={`M 232 ${side === 'right' ? 150 : 230} C 252 ${side === 'right' ? 150 : 230} 252 ${y} 272 ${y}`} stroke="#5c636e" strokeWidth="7" fill="none" />
            <g onClick={() => sel({ zone: 'catalyst' })} className={interactive ? 'cursor-pointer' : ''}>
              <rect x={272} y={y - 16} width={54} height={32} rx={8} fill="#1d2420" stroke={isSel('catalyst') ? '#2dd4bf' : '#3f7a60'} strokeWidth={isSel('catalyst') ? 2 : 1.2} />
              <text x={299} y={y + 3} textAnchor="middle" fontSize="9" fill="#86efac" fontFamily="monospace">
                OEM CAT
              </text>
              <text x={299} y={y + (side === 'right' ? -21 : 29)} textAnchor="middle" fontSize="8" fill="#4ade80">
                🔒 순정 유지
              </text>
            </g>
            <g onClick={() => sel({ zone: 'front' })} className={interactive ? 'cursor-pointer' : ''}>
              <rect x={326} y={y - 5} width={X_CROSS - 326} height={10} fill="#3d434d" stroke={isSel('front') ? '#2dd4bf' : '#5c636e'} />
              <text x={(326 + X_CROSS) / 2} y={y + (side === 'right' ? -9 : 19)} textAnchor="middle" fontSize="8.5" fill="#a3aab5">
                프런트 {cfg.frontPipe.lengthMm}×Ø{cfg.frontPipe.diameterMm}
              </text>
            </g>
            <line x1={X_CROSS} y1={y} x2={X_POST0} y2={y} stroke="#5c636e" strokeWidth="8" />
            {/* drop zone + post parts */}
            <rect
              x={X_POST0 - 6}
              y={y - 34}
              width={X_POST1 - X_POST0 + 12}
              height={68}
              rx={8}
              fill={dropSide === side ? '#14b8a622' : 'transparent'}
              stroke={dropSide === side ? '#2dd4bf' : 'transparent'}
              strokeDasharray="5 4"
              onDragOver={(e) => {
                e.preventDefault();
                setDropSide(side);
              }}
              onDragLeave={() => setDropSide(null)}
              onDrop={onDrop(side)}
            />
            <line x1={X_POST0} y1={y} x2={lastX} y2={y} stroke="#4a5059" strokeWidth="6" />
            {items.map(({ part, x, w }) => (
              <g
                key={part.uid}
                className={interactive ? 'cursor-pointer' : ''}
                onClick={() => sel({ zone: 'part', side, uid: part.uid })}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropSide(side);
                }}
                onDrop={onDrop(side)}
              >
                <PartGlyph p={part} x={x} w={w} y={y} selected={isSel('part', side, part.uid)} />
              </g>
            ))}
            {/* tail + tip at rear bumper */}
            <line x1={lastX} y1={y} x2={950} y2={y} stroke="#4a5059" strokeWidth="6" />
            <g onClick={() => sel({ zone: 'tips' })} className={interactive ? 'cursor-pointer' : ''}>
              <rect x={944} y={y - 11} width={30} height={22} rx={5} fill={tipColor} stroke={isSel('tips') ? '#2dd4bf' : '#5c636e'} strokeWidth={isSel('tips') ? 2 : 1} />
              <text x={959} y={y + (side === 'right' ? -16 : 24)} textAnchor="middle" fontSize="8" fill="#7d8591">
                팁 Ø{cfg.tips.diameterMm}
              </text>
            </g>
            <text x={X_POST1 + 10} y={y - 30} textAnchor="end" fontSize="9" fill="#5c636e" letterSpacing="1">
              {side === 'right' ? 'RH (우측)' : 'LH (좌측)'}
            </text>
          </g>
        );
      })}
      {/* crossover */}
      <g onClick={() => sel({ zone: 'crossover' })} className={interactive ? 'cursor-pointer' : ''}>
        <rect x={X_CROSS - 8} y={Y.right - 20} width={X_POST0 - X_CROSS + 16} height={Y.left - Y.right + 40} fill="transparent" stroke={isSel('crossover') ? '#2dd4bf' : 'transparent'} strokeDasharray="4 3" rx={8} />
        {cfg.crossover.type === 'x' && (
          <>
            <line x1={X_CROSS + 8} y1={Y.right} x2={X_POST0 - 8} y2={Y.left} stroke="#f97316" strokeWidth={4 + cfg.crossover.coupling * 4} opacity="0.85" />
            <line x1={X_CROSS + 8} y1={Y.left} x2={X_POST0 - 8} y2={Y.right} stroke="#f97316" strokeWidth={4 + cfg.crossover.coupling * 4} opacity="0.85" />
          </>
        )}
        {cfg.crossover.type === 'h' && <line x1={(X_CROSS + X_POST0) / 2} y1={Y.right} x2={(X_CROSS + X_POST0) / 2} y2={Y.left} stroke="#f97316" strokeWidth={4 + cfg.crossover.coupling * 4} opacity="0.85" />}
        <text x={(X_CROSS + X_POST0) / 2} y={(Y.right + Y.left) / 2 + 4} textAnchor="middle" fontSize="10" fill={cfg.crossover.type === 'none' ? '#5c636e' : '#fdba74'} fontFamily="monospace" fontWeight="700">
          {cfg.crossover.type === 'none' ? '독립' : cfg.crossover.type === 'x' ? `X ${Math.round(cfg.crossover.coupling * 100)}%` : `H ${Math.round(cfg.crossover.coupling * 100)}%`}
        </text>
      </g>
      <text x={W - 10} y={H + 4} textAnchor="end" fontSize="9" fill="#7d8591" letterSpacing="1">
        CONCEPTUAL · NOT TO SCALE · 구조변경 승인 도면 아님 · V8 LAB
      </text>
      <text x={12} y={H + 4} fontSize="9" fill="#5c636e">
        외장: 무광 블랙 차체·휠 (시각화 전용)
      </text>
    </svg>
  );
}

export function ExhaustBuilder() {
  const cfg = useStore((s) => s.project.exhaust);
  const exterior = useStore((s) => s.project.exterior);
  const symmetric = useStore((s) => s.symmetric);
  const set = useStore((s) => s.set);
  const resetToOem = useStore((s) => s.resetToOem);
  const takeSnapshot = useStore((s) => s.takeSnapshot);
  const copyLeftToRight = useStore((s) => s.copyLeftToRight);
  const snapshot = useStore((s) => s.project.snapshot);
  const freqs = useMemo(() => logFreqs(160, 20, 8000), []);
  const chain = useMemo(() => compileExhaust(cfg), [cfg]);
  const series = useMemo(() => {
    const hasValve = cfg.left.some((p) => p.kind === 'muffler-valved');
    const xs = freqs;
    const s = [
      { label: hasValve ? 'LH 밸브 닫힘' : 'LH 선형 응답', color: '#2dd4bf', xs, ys: sideResponseDb(chain, 0, freqs, 0) },
    ];
    if (hasValve) s.push({ label: 'LH 밸브 열림', color: '#f97316', xs, ys: sideResponseDb(chain, 0, freqs, 1) });
    return s;
  }, [chain, cfg, freqs]);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Exhaust Builder <Tag tone="amber">개념 구조 모드</Tag>
        </span>
      }
      right={
        <>
          <button className="btn" onClick={resetToOem} title="엔진의 순정(가정) 배기로 초기화">
            순정 불러오기
          </button>
          <button className="btn" onClick={takeSnapshot} title="A/B에서 '변경 전'과 비교">
            스냅샷{snapshot ? ' ✓' : ''}
          </button>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-metal-400">
        <label className="flex items-center gap-1">
          <input type="checkbox" className="accent-teal-500" checked={symmetric} onChange={(e) => set({ symmetric: e.target.checked })} />
          좌우 대칭 편집
        </label>
        <button className="btn px-2 py-1 text-[11px]" onClick={copyLeftToRight}>
          LH → RH 복사
        </button>
        <span className="text-metal-600">부품 클릭 = 편집 · 라이브러리에서 라인 위로 드래그 = 추가</span>
        <span className="ml-auto flex gap-1">
          <button className="btn px-2 py-1 text-[11px]" onClick={() => exportSvg('exhaust-diagram', `${cfg.name}-concept.svg`)}>
            SVG
          </button>
          <button className="btn px-2 py-1 text-[11px]" onClick={() => exportSvgAsPng('exhaust-diagram', `${cfg.name}-concept.png`)}>
            PNG
          </button>
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-700">
        <ExhaustDiagram cfg={cfg} idSvg="exhaust-diagram" exteriorColor={exterior.items.body ? exterior.colorHex : '#4b5563'} wheelsBlack={exterior.items.wheels} />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-teal-300">하부 레퍼런스 사진 (사용자 제공 · 구조 참고용)</summary>
        <div className="mt-2">
          <VehicleGallery ids={['underbody']} cols={1} />
        </div>
      </details>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="lbl">배기 라인 선형 전달함수 (모델) — 촉매·레조네이터·머플러·관 공명</span>
          <span className="text-[10px] text-metal-600">X/H 결합 효과는 펄스 간 상호작용이라 이 곡선에 포함되지 않음</span>
        </div>
        <LineChart
          series={series}
          xLabel="Hz (log)"
          yLabel="dB"
          height={130}
          xLog
          xRange={[20, 8000]}
          bands={[{ x0: 37, x1: 167, color: '#f9731612', label: '1,500–2,500 rpm 저차수 대역 (1.5–4차)' }]}
        />
      </div>
    </Card>
  );
}
