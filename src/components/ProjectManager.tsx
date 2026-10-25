import { useRef, useState } from 'react';
import { useStore, DEFAULT_PROJECT } from '../store';
import { deleteStored, listStored, parseProject, saveStored, serializeProject, type StoredEntry } from '../lib/project';
import { downloadText } from '../lib/download';
import { exportScenarioWav } from '../lib/exportAudio';
import { exportSvg, exportSvgAsPng } from '../lib/download';
import { quoteText } from '../lib/quote';
import { SCENARIOS } from '../lib/scenario';
import { Card, Note, Tag } from './ui';
import { CarViews } from './CarViews';
import { ExhaustDiagram } from './ExhaustBuilder';
import type { ExteriorPlan } from '../types';

const EXT_ITEMS: { key: keyof ExteriorPlan['items']; label: string }[] = [
  { key: 'body', label: '차체 전체' },
  { key: 'grilleEmblem', label: '그릴 · 엠블럼' },
  { key: 'wheels', label: '휠' },
  { key: 'exhaustTips', label: '배기 팁 (블랙)' },
  { key: 'chromeTrim', label: '크롬 몰딩 / 윈도우 라인' },
  { key: 'rearBadges', label: '후면 엠블럼 · 레터링' },
  { key: 'calipers', label: '브레이크 캘리퍼' },
];

export function ProjectManager() {
  const project = useStore((s) => s.project);
  const controls = useStore((s) => s.controls);
  const analysis = useStore((s) => s.analysis);
  const analysisStale = useStore((s) => s.analysisStale);
  const setProject = useStore((s) => s.setProject);
  const loadProject = useStore((s) => s.loadProject);
  const notify = useStore((s) => s.notify);
  const editExhaust = useStore((s) => s.editExhaust);
  const [stored, setStored] = useState<StoredEntry[]>(() => listStored());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string[]>([]);
  const [wavBusy, setWavBusy] = useState<number | null>(null);
  const [wavScenario, setWavScenario] = useState('hard');
  const fileRef = useRef<HTMLInputElement>(null);
  const quote = quoteText(project);

  const save = () => {
    try {
      const e = saveStored(serializeProject(project, controls, analysis, analysisStale), currentId ?? undefined);
      setCurrentId(e.id);
      setStored(listStored());
      useStore.setState({ dirty: false });
      notify(`"${e.name}" 저장 완료 (브라우저 저장소)`);
    } catch (err) {
      notify(`저장 실패: ${(err as Error).message}`);
    }
  };

  const open = (e: StoredEntry) => {
    const { file, errors } = parseProject(JSON.stringify(e.file));
    if (!file) return notify(`불러오기 실패: ${errors.join(' / ')}`);
    loadProject(file.project);
    useStore.getState().setControls({ ...file.controls });
    setCurrentId(e.id);
    notify(`"${e.name}" 불러옴`);
  };

  const onImport = async (f: File) => {
    const { file, errors } = parseProject(await f.text());
    setImportErr(errors);
    if (!file) return;
    loadProject(file.project);
    useStore.getState().setControls({ ...file.controls });
    setCurrentId(null);
    notify(`${f.name} 가져오기 완료`);
  };

  const exportWav = async (which: 'A' | 'B' | 'AB') => {
    setWavBusy(0);
    try {
      await exportScenarioWav(which, wavScenario, (p) => setWavBusy(p));
    } catch (e) {
      notify(`WAV 내보내기 실패: ${(e as Error).message}`);
    } finally {
      setWavBusy(null);
    }
  };

  const ext = project.exterior;

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card
          title="프로젝트 저장 · 불러오기"
          right={
            <>
              <button className="btn btn-primary" onClick={save} data-testid="save-project">
                저장
              </button>
              <button
                className="btn"
                onClick={() => {
                  loadProject(DEFAULT_PROJECT());
                  setCurrentId(null);
                  notify('새 프로젝트 (GS460 TIGER 50:50 기본값)');
                }}
              >
                새로 만들기
              </button>
            </>
          }
        >
          <p className="mb-2 text-[11px] text-metal-500">
            저장 항목: 차량·엔진, 배기 구성과 부품 파라미터, 프리셋, 가변밸브 설정, 목표 음색, 스냅샷, 구조변경 체크 상태, 외장 계획, 분석 요약(최신일 때), 데이터 출처, 모델 버전. 녹음 오디오 파일은 포함되지 않습니다.
          </p>
          {stored.length === 0 ? (
            <div className="text-xs text-metal-600">저장된 프로젝트가 없습니다.</div>
          ) : (
            <ul className="divide-y divide-ink-700">
              {stored.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-metal-300">
                      {e.name} {currentId === e.id && <Tag tone="teal">열림</Tag>}
                    </div>
                    <div className="num text-[10px] text-metal-600">
                      {new Date(e.savedAt).toLocaleString('ko-KR')} · {e.file.project.exhaust.name} · {e.file.modelVersion}
                    </div>
                  </div>
                  <button className="btn px-2 py-1" onClick={() => open(e)}>
                    열기
                  </button>
                  <button
                    className="btn px-2 py-1 text-red-300"
                    onClick={() => {
                      if (!confirm(`"${e.name}"을(를) 브라우저 저장소에서 삭제할까요?`)) return;
                      deleteStored(e.id);
                      setStored(listStored());
                      if (currentId === e.id) setCurrentId(null);
                    }}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-700 pt-3">
            <button className="btn" onClick={() => downloadText(JSON.stringify(serializeProject(project, controls, analysis, analysisStale), null, 2), `${project.name}.v8lab.json`, 'application/json')}>
              프로젝트 JSON 내보내기
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              JSON 가져오기
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </div>
          {importErr.length > 0 && <Note tone="red">가져오기 실패: {importErr.join(' / ')}</Note>}
        </Card>

        <Card title="시뮬레이션 오디오 내보내기 (WAV)" right={<Tag tone="amber">SIMULATED</Tag>}>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input" value={wavScenario} onChange={(e) => setWavScenario(e.target.value)}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="btn" disabled={wavBusy !== null} onClick={() => exportWav('A')}>
              A WAV
            </button>
            <button className="btn" disabled={wavBusy !== null} onClick={() => exportWav('B')}>
              B WAV
            </button>
            <button className="btn btn-primary" disabled={wavBusy !== null} onClick={() => exportWav('AB')}>
              A → B 연속 WAV
            </button>
            {wavBusy !== null && <span className="num text-[11px] text-teal-300">렌더링 {Math.round(wavBusy * 100)}%</span>}
          </div>
          <p className="mt-2 text-[11px] text-metal-500">
            44.1 kHz 16-bit 스테레오. 현재 A/B 소스·청취 위치·가변밸브 모드로 렌더링. WAV 메타데이터(ICMT)와 파일명에 "SIMULATED"를 기록합니다. A→B 파일은 음량 정규화 설정({controls.normalize ? '켜짐' : '꺼짐'})을 따릅니다.
          </p>
        </Card>

        <Card title="튜닝업체 견적 요청서" right={
          <>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(quote).then(() => notify('클립보드에 복사했습니다.'))}>복사</button>
            <button className="btn" onClick={() => downloadText(quote, `${project.name}_견적요청서.txt`)}>TXT</button>
          </>
        }>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-ink-950 p-2 font-mono text-[10.5px] leading-relaxed text-metal-400">{quote}</pre>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <Card title="외장 계획 — 무광 블랙" right={<Tag tone="gray">음향 영향 없음</Tag>}>
          <CarViews plan={ext} tipsBlack={ext.items.exhaustTips && project.exhaust.tips.finish === 'black'} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {EXT_ITEMS.map((it) => (
              <label key={it.key} className="flex items-center gap-1.5 text-[11px] text-metal-300">
                <input
                  type="checkbox"
                  className="accent-teal-500"
                  checked={ext.items[it.key]}
                  onChange={(e) => {
                    setProject({ exterior: { ...ext, items: { ...ext.items, [it.key]: e.target.checked } } });
                    if (it.key === 'exhaustTips') editExhaust((c) => void (c.tips.finish = e.target.checked ? 'black' : 'chrome'));
                  }}
                />
                {it.label}
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px] text-metal-400">
            무광 블랙 색상값
            <input type="color" value={ext.colorHex} onChange={(e) => setProject({ exterior: { ...ext, colorHex: e.target.value } })} className="h-6 w-10 cursor-pointer rounded border border-ink-500 bg-transparent" />
            <span className="num text-metal-500">{ext.colorHex}</span>
          </label>
          <Note>
            외장 도색은 배기음 시뮬레이션에 반영되지 않습니다(시각화·보고서·구조변경 검토용). 등화장치·반사기·번호판은 도색 대상에서 제외해야 하며, 차체 색상 변경 등록 필요 여부는 "Legal Pre-check"에서 확인 항목으로 관리됩니다.
          </Note>
        </Card>

        <Card title="배기 구조 이미지" right={
          <>
            <button className="btn" onClick={() => exportSvg('exhaust-diagram-pm', `${project.exhaust.name}-concept.svg`)}>SVG</button>
            <button className="btn" onClick={() => exportSvgAsPng('exhaust-diagram-pm', `${project.exhaust.name}-concept.png`)}>PNG</button>
          </>
        }>
          <div className="overflow-hidden rounded-lg border border-ink-700">
            <ExhaustDiagram cfg={project.exhaust} interactive={false} idSvg="exhaust-diagram-pm" exteriorColor={ext.items.body ? ext.colorHex : '#4b5563'} wheelsBlack={ext.items.wheels} />
          </div>
          <p className="mt-2 text-[11px] text-metal-500">개념도 워터마크("CONCEPTUAL · NOT TO SCALE · 구조변경 승인 도면 아님")가 이미지에 포함됩니다.</p>
        </Card>
      </div>
    </div>
  );
}
