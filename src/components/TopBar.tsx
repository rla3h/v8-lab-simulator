import { useStore, type Tab } from '../store';
import { ENGINES, engineById } from '../data/engines';
import { toggleAudio, useAudibleProvenance } from '../audio/control';
import { ProvBadge } from './ui';
import { stockExhaustFor } from '../data/exhaust';

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: 'workspace', label: 'Workspace', sub: '배기 빌더 · 라이브' },
  { id: 'engines', label: 'Engine Library', sub: '엔진 라이브러리' },
  { id: 'ab', label: 'A/B Comparison', sub: '순정 vs 튜닝' },
  { id: 'analysis', label: 'Acoustic Analysis', sub: '음향 분석' },
  { id: 'project', label: 'Project Manager', sub: '저장 · 내보내기 · 외장' },
  { id: 'legal', label: 'Legal Pre-check', sub: '구조변경 사전 검토' },
  { id: 'report', label: 'Engineering Report', sub: '설계 보고서' },
];

export function TopBar() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const tab = useStore((s) => s.tab);
  const set = useStore((s) => s.set);
  const audio = useStore((s) => s.audio);
  const dirty = useStore((s) => s.dirty);
  const prov = useAudibleProvenance();
  const eng = engineById(project.engineId);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-ink-700 bg-ink-950/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md border border-rpm-600/60 bg-rpm-600/10 font-mono text-xs font-bold text-rpm-400">V8</div>
          <div className="leading-tight">
            <div className="font-mono text-sm font-bold tracking-[0.2em] text-white">V8 LAB</div>
            <div className="text-[10px] text-metal-500">Engine & Exhaust Acoustic Simulation</div>
          </div>
        </div>
        <input
          className="input w-52 min-w-0 flex-1 sm:flex-none"
          value={project.name}
          aria-label="프로젝트 이름"
          onChange={(e) => setProject({ name: e.target.value })}
        />
        <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-metal-500">
          엔진
          <select
            className="input max-w-[220px]"
            value={project.engineId}
            onChange={(e) => {
              const ne = engineById(e.target.value);
              setProject({ engineId: ne.id, exhaust: project.presetId === eng.stockExhaustId ? stockExhaustFor(ne.stockExhaustId) : project.exhaust });
            }}
          >
            {ENGINES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.application} · {e.code}
                {e.status !== 'ready' ? ' (데이터 준비 중)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-metal-500">
          목표 음색
          <select className="input max-w-[200px]" value={project.targetEngineId} onChange={(e) => setProject({ targetEngineId: e.target.value })}>
            {ENGINES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.application}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[10px] text-amber-300/80">● 저장 안 됨</span>}
          <ProvBadge kind={prov.kind} extra={prov.extra} />
          <button className={`btn ${audio.on ? 'btn-primary' : 'btn-rpm'}`} onClick={() => toggleAudio()} data-testid="audio-toggle">
            {audio.on ? '■ 오디오 정지' : '▶ 오디오 시작'}
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3" aria-label="화면">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => set({ tab: t.id })}
            className={`shrink-0 border-b-2 px-3 py-1.5 text-left transition ${tab === t.id ? 'border-rpm-500 text-white' : 'border-transparent text-metal-500 hover:text-metal-300'}`}
          >
            <div className="text-xs font-semibold">{t.label}</div>
            <div className="text-[10px] opacity-70">{t.sub}</div>
          </button>
        ))}
      </nav>
    </header>
  );
}
