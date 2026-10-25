import { useStore } from '../store';
import { engineById } from '../data/engines';
import { GS460_PRESETS, PART_ORDER, PART_SPECS } from '../data/exhaust';
import { Card, ConfBadge, Slider, Tag } from './ui';
import { PHOTOS, photoUrl } from './VehicleGallery';

export function LibraryPanel() {
  const project = useStore((s) => s.project);
  const applyPreset = useStore((s) => s.applyPreset);
  const addPart = useStore((s) => s.addPart);
  const selected = useStore((s) => s.selected);
  const setProject = useStore((s) => s.setProject);
  const set = useStore((s) => s.set);
  const eng = engineById(project.engineId);
  const target = engineById(project.targetEngineId);
  const side = selected && selected.zone === 'part' ? selected.side : 'left';

  return (
    <div className="flex flex-col gap-3">
      <Card title="Engine" right={<button className="text-[10px] text-teal-300 hover:underline" onClick={() => set({ tab: 'engines' })}>라이브러리 →</button>}>
        {eng.id === '1ur-fse' && (
          <button className="mb-2 block w-full overflow-hidden rounded-md border border-ink-700" onClick={() => set({ tab: 'project' })} title="외장 계획·사진 보기">
            <img src={photoUrl(PHOTOS[0])} alt="GS460 무광 블랙 전면" loading="lazy" width={1344} height={896} className="aspect-[3/2] w-full object-cover" />
          </button>
        )}
        <div className="font-mono text-lg font-bold text-white">{eng.code}</div>
        <div className="text-[11px] text-metal-500">{eng.application}</div>
        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <dt className="text-metal-500">배기량</dt>
          <dd className="num flex items-center gap-1">
            {eng.displacementCc.value?.toLocaleString()} cc <ConfBadge c={eng.displacementCc.confidence} />
          </dd>
          <dt className="text-metal-500">형식</dt>
          <dd>
            V{eng.cylinders} {eng.induction === 'NA' ? '자연흡기' : eng.induction === 'turbo' ? '트윈터보' : '슈퍼차저'}
          </dd>
          <dt className="text-metal-500">점화 순서</dt>
          <dd className="num">{eng.firingOrder.value?.join('-')}</dd>
          <dt className="text-metal-500">시뮬 범위</dt>
          <dd className="num flex items-center gap-1">
            {eng.sim.idleRpm}–{eng.sim.maxRpm} <ConfBadge c="assumption" />
          </dd>
        </dl>
        <div className="mt-2 border-t border-ink-700 pt-2 text-[11px] text-metal-500">
          목표 음색: <span className="text-metal-300">{target.code}</span> ({target.application})
        </div>
      </Card>

      <Card title="Sound Presets">
        <div className="flex flex-col gap-1.5">
          {GS460_PRESETS.map((p) => {
            const active = project.presetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`rounded-lg border px-2.5 py-2 text-left transition ${active ? 'border-rpm-500 bg-rpm-500/10' : 'border-ink-600 bg-ink-850 hover:border-ink-500'}`}
                data-testid={`preset-${p.id}`}
              >
                <div className={`font-mono text-xs font-bold ${active ? 'text-rpm-400' : 'text-metal-300'}`}>{p.make().name}</div>
                <div className="text-[10px] text-metal-500">{p.blurb}</div>
              </button>
            );
          })}
          {project.presetId === null && (
            <div className="rounded-lg border border-teal-600/50 bg-teal-600/10 px-2.5 py-1.5 text-[11px] text-teal-200">
              사용자 수정: {project.exhaust.name}
            </div>
          )}
        </div>
        <p className="mt-2 text-[10px] text-metal-600">GS460 기준 개념 프리셋. 프리셋마다 크로스오버·레조네이터·머플러 파라미터가 달라 실제 오디오 처리가 바뀝니다.</p>
      </Card>

      <Card title="음색 목표">
        <Slider
          label={
            <span>
              AMG풍 저음 {project.toneBalance} : NA 포효 {100 - project.toneBalance}
            </span>
          }
          value={project.toneBalance}
          min={0}
          max={100}
          step={5}
          onChange={(v) => setProject({ toneBalance: v })}
          color="#f97316"
          hint="선호도 가중치. 분석의 '목표 일치 점수'에서 2,500–3,500 rpm(목표 엔진 비교)과 4,500–5,500 rpm(고회전 레퍼런스 비교)의 비중으로 쓰입니다. 오디오를 섞는 비율이 아닙니다."
        />
      </Card>

      <Card title="Exhaust Parts" right={<Tag>{side === 'left' ? 'LH' : 'RH'}에 추가</Tag>}>
        <div className="flex flex-col gap-1.5">
          {PART_ORDER.map((k) => {
            const spec = PART_SPECS[k];
            return (
              <div
                key={k}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-v8lab-part', k);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="group flex cursor-grab items-center gap-2 rounded-md border border-ink-600 bg-ink-850 px-2 py-1.5 active:cursor-grabbing"
              >
                <span className="w-10 shrink-0 rounded bg-ink-700 px-1 py-0.5 text-center font-mono text-[9px] text-metal-300">{spec.short}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-metal-300">{spec.label}</span>
                  <span className="block truncate text-[10px] text-metal-600">{spec.desc}</span>
                </span>
                <button className="btn px-1.5 py-0.5 text-[10px]" onClick={() => addPart(side, k)} aria-label={`${spec.label} 추가`}>
                  {spec.isMuffler ? '교체' : '+'}
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
