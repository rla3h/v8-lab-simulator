import { useState } from 'react';
import { useStore } from '../store';
import { ENGINES } from '../data/engines';
import { firingEvents } from '../dsp/compile';
import { audioEngine } from '../audio/AudioEngine';
import { recordingBuffers } from '../audio/hybrid';
import { Card, ConfBadge, Note, Slider, Tag } from './ui';
import type { EngineDef, RecordingMeta, SpecValue } from '../types';

function Spec<T>({ label, v, fmt }: { label: string; v: SpecValue<T>; fmt?: (x: T) => string }) {
  return (
    <>
      <dt className="text-metal-500">{label}</dt>
      <dd className="flex flex-wrap items-center gap-1">
        <span className="num text-metal-300">{v.value === null ? '—' : fmt ? fmt(v.value) : String(v.value)}</span>
        <ConfBadge c={v.confidence} />
        {v.note && <span className="text-[10px] text-metal-600">{v.note}</span>}
      </dd>
    </>
  );
}

/** 720° strip showing which bank each firing event exhausts into — the root of V8 "burble". */
function FiringStrip({ e }: { e: EngineDef }) {
  const { angles, banks, cylinders } = firingEvents(e);
  return (
    <svg viewBox="0 0 360 64" className="w-full">
      <text x="0" y="12" fontSize="8" fill="#7d8591">RH</text>
      <text x="0" y="46" fontSize="8" fill="#7d8591">LH</text>
      <line x1="16" y1="18" x2="356" y2="18" stroke="#2e333b" />
      <line x1="16" y1="52" x2="356" y2="52" stroke="#2e333b" />
      {angles.map((a, i) => {
        const x = 16 + (a / 720) * 340;
        const y = banks[i] === 1 ? 18 : 52;
        return (
          <g key={i}>
            <rect x={x - 6} y={y - 9} width="12" height="18" rx="3" fill={banks[i] === 1 ? '#f97316' : '#2dd4bf'} opacity="0.85" />
            <text x={x} y={y + 3} fontSize="8" textAnchor="middle" fill="#0b0c0e" fontWeight="700">
              {cylinders[i]}
            </text>
          </g>
        );
      })}
      {[0, 180, 360, 540, 720].map((a) => (
        <text key={a} x={16 + (a / 720) * 340} y="63" fontSize="7" fill="#5c636e" textAnchor="middle">
          {a}°
        </text>
      ))}
    </svg>
  );
}

function RecordingUpload({ engine }: { engine: EngineDef }) {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const notify = useStore((s) => s.notify);
  const [rpm, setRpm] = useState(2000);
  const [position, setPosition] = useState<'exterior' | 'interior'>('exterior');
  const [exhaust, setExhaust] = useState<RecordingMeta['exhaust']>('oem');
  const [source, setSource] = useState('');
  const [rights, setRights] = useState(false);
  const recs = project.recordings.filter((r) => r.engineId === engine.id);

  const onFile = async (f: File) => {
    if (!rights || !source.trim()) {
      notify('출처를 입력하고 사용 권한 보유를 확인해야 업로드할 수 있습니다.');
      return;
    }
    try {
      const buf = await audioEngine.decode(f);
      const id = `rec-${Date.now().toString(36)}`;
      recordingBuffers.set(id, buf);
      const meta: RecordingMeta = { id, engineId: engine.id, fileName: f.name, durationSec: buf.duration, recordedRpm: rpm, position, exhaust, source: source.trim(), rightsConfirmed: true };
      setProject({ recordings: [...project.recordings, meta] });
      notify(`${f.name} 등록 — Workspace의 하이브리드 블렌드로 재생할 수 있습니다.`);
    } catch (e) {
      notify(`오디오 디코딩 실패: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mt-3 border-t border-ink-700 pt-3">
      <div className="lbl mb-2">실제 녹음 (REFERENCE)</div>
      {recs.length === 0 && <div className="mb-2 text-[11px] text-metal-600">등록된 녹음 없음 → 이 엔진의 모든 출력은 SIMULATED입니다.</div>}
      {recs.map((r) => (
        <div key={r.id} className="mb-1.5 flex items-center gap-2 rounded border border-ink-700 bg-ink-850 px-2 py-1 text-[11px]">
          <Tag tone={recordingBuffers.has(r.id) ? 'teal' : 'red'}>{recordingBuffers.has(r.id) ? 'REFERENCE' : '파일 재첨부 필요'}</Tag>
          <span className="min-w-0 flex-1 truncate text-metal-300">
            {r.fileName} · {r.recordedRpm} rpm · {r.position === 'exterior' ? '외부' : '실내'} · 배기 {r.exhaust} · {r.durationSec.toFixed(1)}s
          </span>
          <button className="text-red-300 hover:underline" onClick={() => setProject({ recordings: project.recordings.filter((x) => x.id !== r.id) })}>
            제거
          </button>
        </div>
      ))}
      <details>
        <summary className="cursor-pointer text-[11px] text-teal-300">녹음 추가 (정속 RPM 루프)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Slider label="녹음 당시 RPM" value={rpm} min={500} max={7000} step={50} onChange={setRpm} />
          <label className="text-[11px] text-metal-400">
            위치
            <select className="input mt-1 w-full" value={position} onChange={(e) => setPosition(e.target.value as 'exterior' | 'interior')}>
              <option value="exterior">차량 외부</option>
              <option value="interior">차량 실내</option>
            </select>
          </label>
          <label className="text-[11px] text-metal-400">
            녹음 차량 배기 상태
            <select className="input mt-1 w-full" value={exhaust} onChange={(e) => setExhaust(e.target.value as RecordingMeta['exhaust'])}>
              <option value="oem">순정 배기</option>
              <option value="modified">튜닝 배기</option>
              <option value="unknown">모름</option>
            </select>
          </label>
          <label className="text-[11px] text-metal-400">
            출처 (본인 녹음, 라이선스 등)
            <input className="input mt-1 w-full" value={source} onChange={(e) => setSource(e.target.value)} placeholder="예: 본인 차량 직접 녹음 2026-10" />
          </label>
        </div>
        <label className="mt-2 flex items-start gap-1.5 text-[11px] text-metal-400">
          <input type="checkbox" className="mt-0.5 accent-teal-500" checked={rights} onChange={(e) => setRights(e.target.checked)} />
          이 파일을 사용할 권한이 있습니다 (직접 녹음했거나 사용 허가를 받음). 출처가 불분명한 영상의 음원은 사용하지 않습니다.
        </label>
        <input
          type="file"
          accept="audio/*"
          disabled={!rights || !source.trim()}
          className="mt-2 block text-[11px] text-metal-400 file:mr-2 file:rounded file:border file:border-ink-500 file:bg-ink-800 file:px-2 file:py-1 file:text-metal-300 disabled:opacity-40"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <p className="mt-1 text-[10px] text-metal-600">
          재생 방식: 루프 + 재생속도 = 현재 RPM / 녹음 RPM (피치·공명 주파수도 함께 이동하는 한계 있음). 순정 배기 녹음이면 B(튜닝)에서 순정→설계의 선형 응답 차이(±12 dB)를 FIR로 적용합니다. X/H파이프 결합 효과는 녹음에 적용되지 않습니다.
        </p>
      </details>
    </div>
  );
}

export function EngineLibrary() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  return (
    <div className="flex flex-col gap-3">
      <Note>
        제원 신뢰도: <b>공개 제원</b>은 널리 공개된 수치이나 1차 출처와 아직 대조하지 않은 값, <b>가정</b>은 V8 LAB 모델링 가정, <b>미확인</b>은 값을 비워 둔 항목입니다. 확인되지 않은 제원을 임의로 채우지 않습니다.
      </Note>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {ENGINES.map((e) => (
          <Card
            key={e.id}
            title={
              <span className="flex items-center gap-2">
                {e.code} {e.status === 'ready' ? <Tag tone="teal">구현</Tag> : <Tag tone="amber">데이터 준비 중</Tag>}
              </span>
            }
            right={
              <>
                {project.engineId === e.id && <Tag tone="orange">설계 대상</Tag>}
                {project.targetEngineId === e.id && <Tag tone="teal">목표</Tag>}
              </>
            }
          >
            <div className="text-xs text-metal-400">
              {e.manufacturer} · {e.application}
            </div>
            <dl className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
              <Spec label="배기량" v={e.displacementCc} fmt={(x) => `${x.toLocaleString()} cc`} />
              <dt className="text-metal-500">배열</dt>
              <dd className="text-metal-300">
                V{e.cylinders} · {e.induction === 'NA' ? '자연흡기' : e.induction === 'turbo' ? '터보차저' : '슈퍼차저'}
              </dd>
              <Spec label="뱅크각" v={e.bankAngleDeg} fmt={(x) => `${x}°`} />
              <Spec label="크랭크" v={e.crank} />
              <Spec label="점화 순서" v={e.firingOrder} fmt={(x) => x.join('-')} />
              <Spec label="보어×스트로크" v={{ value: e.boreMm.value && e.strokeMm.value ? `${e.boreMm.value} × ${e.strokeMm.value} mm` : null, confidence: e.boreMm.confidence }} />
              <Spec label="출력" v={e.powerNote} />
              <Spec label="공회전" v={e.idleRpm} />
              <Spec label="레드라인" v={e.redlineRpm} />
              <dt className="text-metal-500">시뮬 범위</dt>
              <dd className="flex items-center gap-1">
                <span className="num text-metal-300">
                  {e.sim.idleRpm}–{e.sim.maxRpm} rpm
                </span>
                <ConfBadge c="assumption" />
              </dd>
            </dl>
            <div className="mt-2">
              <div className="lbl mb-1">점화 이벤트 → 배기 뱅크 (720°)</div>
              <FiringStrip e={e} />
              <p className="text-[10px] text-metal-600">{e.bankNote}</p>
            </div>
            <p className="mt-1 text-[10px] text-metal-600">{e.voicingNote}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn" disabled={project.engineId === e.id} onClick={() => setProject({ engineId: e.id })}>
                설계 대상으로
              </button>
              <button className="btn" disabled={project.targetEngineId === e.id} onClick={() => setProject({ targetEngineId: e.id })}>
                목표 음색으로
              </button>
              <button className="btn" disabled={project.roarRefEngineId === e.id} onClick={() => setProject({ roarRefEngineId: e.id })}>
                고회전 레퍼런스로
              </button>
            </div>
            <RecordingUpload engine={e} />
          </Card>
        ))}
      </div>
    </div>
  );
}
