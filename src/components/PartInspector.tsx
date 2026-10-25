import { useStore } from '../store';
import { CROSSOVER_INFO, PART_SPECS } from '../data/exhaust';
import { Card, Segmented, Slider, Note, Tag } from './ui';
import type { CrossoverType } from '../types';

export function PartInspector() {
  const sel = useStore((s) => s.selected);
  const cfg = useStore((s) => s.project.exhaust);
  const symmetric = useStore((s) => s.symmetric);
  const updatePartParam = useStore((s) => s.updatePartParam);
  const removePart = useStore((s) => s.removePart);
  const movePart = useStore((s) => s.movePart);
  const setCrossover = useStore((s) => s.setCrossover);
  const editExhaust = useStore((s) => s.editExhaust);

  if (!sel) {
    return (
      <Card title="Inspector">
        <p className="text-xs text-metal-500">구조도에서 부품·크로스오버·프런트 파이프·촉매·팁을 클릭하면 파라미터를 편집할 수 있습니다. 모든 값은 즉시 오디오 처리와 분석 모델에 반영됩니다.</p>
        {cfg.notes && <p className="mt-2 text-[11px] leading-relaxed text-metal-500">설계 메모: {cfg.notes}</p>}
      </Card>
    );
  }

  if (sel.zone === 'part') {
    const part = cfg[sel.side].find((p) => p.uid === sel.uid);
    if (!part) return null;
    const spec = PART_SPECS[part.kind];
    const idx = cfg[sel.side].indexOf(part);
    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            {spec.label} <Tag>{sel.side === 'left' ? 'LH' : 'RH'} #{idx + 1}</Tag>
            {symmetric && <Tag tone="teal">대칭</Tag>}
          </span>
        }
        right={
          <>
            {!spec.isMuffler && (
              <>
                <button className="btn px-2 py-1" onClick={() => movePart(sel.side, part.uid, -1)} title="앞쪽으로">
                  ←
                </button>
                <button className="btn px-2 py-1" onClick={() => movePart(sel.side, part.uid, 1)} title="뒤쪽으로">
                  →
                </button>
                <button className="btn px-2 py-1 text-red-300" onClick={() => removePart(sel.side, part.uid)}>
                  제거
                </button>
              </>
            )}
          </>
        }
      >
        <p className="mb-2 text-[11px] text-metal-500">
          {spec.desc} <span className="text-metal-600">모델: {spec.model}</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {spec.params.map((d) => (
            <Slider
              key={d.key}
              label={d.label}
              value={part.params[d.key]}
              min={d.min}
              max={d.max}
              step={d.step}
              unit={d.unit}
              onChange={(v) => updatePartParam(sel.side, part.uid, d.key, v)}
            />
          ))}
        </div>
        {part.kind === 'muffler-valved' && (
          <div className="mt-3 border-t border-ink-700 pt-3">
            <div className="lbl mb-2">AUTO 밸브 로직 (가상 제어)</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Slider label="열림 RPM" value={cfg.valve.autoOpenRpm} min={1500} max={6000} step={50} onChange={(v) => editExhaust((c) => void (c.valve.autoOpenRpm = v, c.valve.autoCloseRpm = Math.min(c.valve.autoCloseRpm, v - 100)))} />
              <Slider label="닫힘 RPM" value={cfg.valve.autoCloseRpm} min={1200} max={5900} step={50} onChange={(v) => editExhaust((c) => void (c.valve.autoCloseRpm = Math.min(v, c.valve.autoOpenRpm - 100)))} />
              <Slider label="열림 스로틀" value={Math.round(cfg.valve.autoThrottle * 100)} min={10} max={100} step={5} unit="%" onChange={(v) => editExhaust((c) => void (c.valve.autoThrottle = v / 100))} />
            </div>
          </div>
        )}
      </Card>
    );
  }

  if (sel.zone === 'crossover') {
    return (
      <Card title="크로스오버 (좌우 배기라인 연결)">
        <Segmented<CrossoverType>
          value={cfg.crossover.type}
          onChange={setCrossover}
          options={[
            { value: 'none', label: '없음' },
            { value: 'h', label: 'H파이프' },
            { value: 'x', label: 'X파이프' },
          ]}
        />
        <p className="mt-2 text-[11px] text-metal-500">{CROSSOVER_INFO[cfg.crossover.type].model}</p>
        {cfg.crossover.type !== 'none' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Slider label="결합도 (모델 파라미터)" value={Math.round(cfg.crossover.coupling * 100)} min={5} max={100} step={1} unit="%" onChange={(v) => editExhaust((c) => void (c.crossover.coupling = v / 100))} />
            <Slider label="연결관 내경" value={cfg.crossover.diameterMm} min={45} max={76} step={0.5} unit="mm" onChange={(v) => editExhaust((c) => void (c.crossover.diameterMm = v))} />
          </div>
        )}
        <Note>결합도는 실측으로 검증되지 않은 모델 파라미터입니다. 실제 X/H파이프 효과는 위치·각도·내경·배압에 따라 달라집니다.</Note>
      </Card>
    );
  }

  if (sel.zone === 'front') {
    return (
      <Card title="프런트 파이프 (촉매 후단 → 크로스오버)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Slider label="길이" value={cfg.frontPipe.lengthMm} min={300} max={2000} step={10} unit="mm" onChange={(v) => editExhaust((c) => void (c.frontPipe.lengthMm = v))} />
          <Slider label="내경" value={cfg.frontPipe.diameterMm} min={45} max={80} step={0.5} unit="mm" onChange={(v) => editExhaust((c) => void (c.frontPipe.diameterMm = v))} />
        </div>
        <p className="mt-2 text-[11px] text-metal-500">모델: 길이 → 프런트 관 정재파 피크(c/2L), 내경 → 전체 출력 레벨.</p>
      </Card>
    );
  }

  if (sel.zone === 'catalyst') {
    return (
      <Card title="촉매 (순정 유지 · 잠김)">
        <Note tone="teal">
          V8 LAB은 순정 촉매 유지를 설계 조건으로 고정합니다. 촉매·배출가스 저감장치의 제거/변경 기능은 제공하지 않습니다. 모델: 1.5 kHz 이상 −5 dB 하이셸프(가정).
        </Note>
      </Card>
    );
  }

  return (
    <Card title="배기 팁">
      <Segmented
        value={cfg.tips.finish}
        onChange={(v) => editExhaust((c) => void (c.tips.finish = v))}
        options={[
          { value: 'black', label: '블랙' },
          { value: 'chrome', label: '크롬' },
          { value: 'titanium', label: '티타늄' },
        ]}
      />
      <div className="mt-3">
        <Slider label="팁 외경" value={cfg.tips.diameterMm} min={60} max={120} step={1} unit="mm" onChange={(v) => editExhaust((c) => void (c.tips.diameterMm = v))} />
      </div>
      <p className="mt-2 text-[11px] text-metal-500">팁 마감·외경은 시각화/보고서용이며 현재 음향 모델에 반영되지 않습니다 (방사 임피던스 효과 미모델링).</p>
    </Card>
  );
}
