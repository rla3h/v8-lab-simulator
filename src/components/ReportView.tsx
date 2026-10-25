import type { ReactNode } from 'react';
import { useStore, resolveSource } from '../store';
import { engineById } from '../data/engines';
import { CROSSOVER_INFO, PART_SPECS, validateExhaust } from '../data/exhaust';
import { MODEL_VERSION } from '../dsp/compile';
import { LEGAL_DISCLAIMER, LEGAL_ITEMS } from '../lib/legal';
import { ExhaustDiagram } from './ExhaustBuilder';
import { CarViews } from './CarViews';
import { VehicleGallery } from './VehicleGallery';
import { ConfBadge } from './ui';

export const LIMITATIONS = [
  '사용자가 권한을 확인한 녹음을 등록하지 않는 한 모든 오디오는 물리 기반 합성(SIMULATED)이며, 실제 차량 소리와 같다고 주장하지 않습니다. VALIDATED(측정 검증) 데이터는 아직 없습니다.',
  '순정 배기 구조(GS460 및 비교 차량)는 실측·정비지침서 확인 전의 가정 모델입니다. 배기 빌더는 개념 구조 모드이며 치수는 축척이 아닙니다.',
  'X/H파이프 결합도, 레조네이터·머플러 감쇠량, 관 공명 모델은 단순화된 필터/전달함수이며 측정으로 검증되지 않았습니다.',
  '실내 청취 모드는 차체 투과(260 Hz 4차 로우패스)와 가정 실내 모드(45·72 Hz)로 만든 추정이며, 구조 전달 진동(행거·차체)은 포함하지 않습니다.',
  '화면의 레벨은 디지털 dBFS(K-가중 근사)이며 실제 음압 dB(A)가 아닙니다. 법정 소음 기준과 비교할 수 없습니다.',
  '엔진 voicing 파라미터(펄스 폭, rasp, 흡기음 등)는 모델 조율용 주관적 설정입니다. 제원은 공개 자료 기준이며 1차 출처 대조가 필요합니다.',
  '목표 음색 점수는 두 시뮬레이션 모델 간 정의된 음향 특징 비교이며, 실제 AMG M156 차량과의 일치도를 의미하지 않습니다.',
  '하이브리드 녹음 재생은 RPM 비율 재생속도 방식이라 피치와 함께 공명 주파수도 이동하며, 배기 변경은 선형 응답 차이만 반영합니다.',
  '구조변경 사전 검토는 법적 승인 여부를 판정하지 않습니다.',
];

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-ink-700 pt-4">
      <h2 className="mb-2 text-sm font-semibold text-white">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

export function ReportView() {
  const project = useStore((s) => s.project);
  const controls = useStore((s) => s.controls);
  const analysis = useStore((s) => s.analysis);
  const stale = useStore((s) => s.analysisStale);
  const eng = engineById(project.engineId);
  const tgt = engineById(project.targetEngineId);
  const ex = project.exhaust;
  const problems = validateExhaust(ex);
  const hasValve = [...ex.left, ...ex.right].some((p) => p.kind === 'muffler-valved');
  const A = resolveSource(controls.sourceA, project);
  const B = resolveSource(controls.sourceB, project);

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={() => window.print()}>
          인쇄 / PDF로 저장
        </button>
        <span className="text-[11px] text-metal-500">브라우저 인쇄 대화상자에서 "PDF로 저장"을 선택하면 PDF 보고서가 됩니다.</span>
      </div>
      <article className="print-area card mx-auto max-w-4xl space-y-4 p-6 text-[12px] leading-relaxed text-metal-300">
        <header>
          <div className="font-mono text-[10px] tracking-[0.3em] text-rpm-400">V8 LAB · ENGINEERING REPORT</div>
          <h1 className="mt-1 text-xl font-bold text-white">{project.name}</h1>
          <div className="mt-1 text-[11px] text-metal-500">
            작성 {new Date().toLocaleString('ko-KR')} · 모델 {MODEL_VERSION} · 오디오 출처 SIMULATED · 배기 레이아웃 개념 구조
          </div>
          <p className="mt-2 rounded border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200/80">
            본 보고서는 시뮬레이션 설계 요약이며, 구조변경 승인용 도면·측정 성적서·법적 판단 자료가 아닙니다.
          </p>
        </header>

        <Section n={1} title="차량 · 엔진">
          <table className="w-full">
            <tbody>
              <tr><td className="w-40 text-metal-500">설계 대상</td><td>{eng.application} / {eng.code}</td></tr>
              <tr><td className="text-metal-500">배기량</td><td>{eng.displacementCc.value?.toLocaleString()} cc <ConfBadge c={eng.displacementCc.confidence} /></td></tr>
              <tr><td className="text-metal-500">형식</td><td>V{eng.cylinders} {eng.crank.value} · {eng.induction === 'NA' ? '자연흡기' : eng.induction}</td></tr>
              <tr><td className="text-metal-500">점화 순서</td><td>{eng.firingOrder.value?.join('-')} <ConfBadge c={eng.firingOrder.confidence} /></td></tr>
              <tr><td className="text-metal-500">출력</td><td>{eng.powerNote.value} <ConfBadge c={eng.powerNote.confidence} /></td></tr>
              <tr><td className="text-metal-500">공회전 / 레드라인</td><td>미확인 (시뮬레이션 {eng.sim.idleRpm}–{eng.sim.maxRpm} rpm 가정)</td></tr>
              <tr><td className="text-metal-500">목표 음색 엔진</td><td>{tgt.code} ({tgt.application}) — 배기 구조 가정 모델</td></tr>
              <tr><td className="text-metal-500">음색 목표</td><td>AMG풍 저음 {project.toneBalance} : 자연흡기 포효 {100 - project.toneBalance}</td></tr>
            </tbody>
          </table>
        </Section>

        <Section n={2} title="외장 계획 — 무광 블랙">
          <VehicleGallery ids={['front', 'rear', 'side']} cols={4} />
          <div className="mt-3" />
          <CarViews plan={project.exterior} tipsBlack={project.exterior.items.exhaustTips && ex.tips.finish === 'black'} />
          <p className="mt-2">
            도색 범위:{' '}
            {[
              project.exterior.items.body && '차체 전체',
              project.exterior.items.grilleEmblem && '그릴·엠블럼',
              project.exterior.items.wheels && '휠',
              project.exterior.items.exhaustTips && '배기 팁',
              project.exterior.items.chromeTrim && '크롬 몰딩',
              project.exterior.items.rearBadges && '후면 엠블럼',
              project.exterior.items.calipers && '캘리퍼',
            ]
              .filter(Boolean)
              .join(', ')}{' '}
            (무광 블랙 {project.exterior.colorHex}). 등화장치·반사기·번호판 제외. 외장은 음향 모델에 영향 없음.
          </p>
        </Section>

        <Section n={3} title={`배기 시스템 설계 — ${ex.name}`}>
          <div className="overflow-hidden rounded border border-ink-700">
            <ExhaustDiagram cfg={ex} interactive={false} exteriorColor={project.exterior.items.body ? project.exterior.colorHex : '#4b5563'} wheelsBlack={project.exterior.items.wheels} />
          </div>
          <table className="mt-2 w-full">
            <tbody>
              <tr><td className="w-40 text-metal-500">촉매</td><td>순정 유지 (설계 고정)</td></tr>
              <tr><td className="text-metal-500">프런트 파이프</td><td>{ex.frontPipe.lengthMm} mm × Ø{ex.frontPipe.diameterMm} mm</td></tr>
              <tr><td className="text-metal-500">크로스오버</td><td>{CROSSOVER_INFO[ex.crossover.type].label}{ex.crossover.type !== 'none' && ` · 결합도 ${Math.round(ex.crossover.coupling * 100)}% (모델 파라미터) · Ø${ex.crossover.diameterMm} mm`}</td></tr>
              {(['left', 'right'] as const).map((side) => (
                <tr key={side}>
                  <td className="align-top text-metal-500">{side === 'left' ? 'LH 라인' : 'RH 라인'}</td>
                  <td>
                    <ol className="list-decimal pl-4">
                      {ex[side].map((p) => (
                        <li key={p.uid}>
                          {PART_SPECS[p.kind].label}: {PART_SPECS[p.kind].params.map((d) => `${d.label} ${p.params[d.key]}${d.unit}`).join(', ')}
                        </li>
                      ))}
                    </ol>
                  </td>
                </tr>
              ))}
              <tr><td className="text-metal-500">가변밸브</td><td>{hasValve ? `있음 · AUTO(가상): ${ex.valve.autoOpenRpm} rpm 초과 또는 스로틀 ${Math.round(ex.valve.autoThrottle * 100)}% 초과 시 개방, ${ex.valve.autoCloseRpm} rpm 미만에서 닫힘 · 현재 모드 ${controls.valveMode.toUpperCase()}` : '없음'}</td></tr>
              <tr><td className="text-metal-500">배기 팁</td><td>{ex.tips.finish} · Ø{ex.tips.diameterMm} mm · 듀얼</td></tr>
              <tr><td className="text-metal-500">검증</td><td>{problems.length ? problems.join(' / ') : '구성 규칙 위반 없음'}</td></tr>
            </tbody>
          </table>
          {ex.notes && <p className="mt-1 text-metal-500">메모: {ex.notes}</p>}
          <div className="mt-3 max-w-md">
            <VehicleGallery ids={['underbody']} cols={1} />
          </div>
        </Section>

        <Section n={4} title="음향 분석 요약">
          {!analysis ? (
            <p className="text-metal-500">분석 미실행 — Acoustic Analysis 화면에서 실행하면 이 보고서에 요약이 포함됩니다.</p>
          ) : (
            <>
              {stale && <p className="text-amber-300">※ 아래 결과는 현재 설정 이전에 계산되었습니다. 재분석 권장.</p>}
              <table className="w-full">
                <tbody>
                  <tr><td className="w-40 text-metal-500">비교</td><td>A: {analysis.labels.A} / B: {analysis.labels.B}</td></tr>
                  <tr><td className="text-metal-500">조건</td><td>스로틀 {Math.round(analysis.throttle * 100)}% · 계산 {new Date(analysis.createdAt).toLocaleString('ko-KR')}</td></tr>
                  <tr><td className="text-metal-500">실내 부밍 위험 (추정)</td><td><b>{analysis.boom.level}</b> — 1,500–2,500 rpm 최대 Δ(B−A) {analysis.boom.maxDelta.toFixed(1)} dB, 최대 Δ돌출도 {analysis.boom.maxProm.toFixed(1)} dB</td></tr>
                  <tr><td className="text-metal-500">목표 일치 점수 (모델 간)</td><td>A {analysis.similarity.A.score.toFixed(0)} / B {analysis.similarity.B.score.toFixed(0)} (저음 가중 {Math.round(analysis.similarity.weightRumble * 100)}%)</td></tr>
                  <tr>
                    <td className="text-metal-500">럼블 지수 B (2.5k/3.5k)</td>
                    <td>{analysis.features.B.filter((f) => f.rpm === 2500 || f.rpm === 3500).map((f) => f.rumbleIdx.toFixed(1)).join(' / ')} dB (목표 {analysis.features.target.filter((f) => f.rpm === 2500 || f.rpm === 3500).map((f) => f.rumbleIdx.toFixed(1)).join(' / ')} dB)</td>
                  </tr>
                  <tr>
                    <td className="text-metal-500">포효 지수 B (4.5k/5.5k)</td>
                    <td>{analysis.features.B.filter((f) => f.rpm >= 4500).map((f) => f.roarIdx.toFixed(1)).join(' / ')} dB (레퍼런스 {analysis.features.roarRef.filter((f) => f.rpm >= 4500).map((f) => f.roarIdx.toFixed(1)).join(' / ')} dB)</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          <p className="mt-1 text-metal-500">현재 A/B 설정: A = {A.label}, B = {B.label}</p>
        </Section>

        <Section n={5} title="구조변경 사전 검토">
          <p className="mb-2 text-[11px] text-metal-500">{LEGAL_DISCLAIMER}</p>
          <table className="w-full">
            <tbody>
              {LEGAL_ITEMS.map((it) => {
                const a = it.auto(project);
                const st = project.legal[it.id] ?? 'todo';
                return (
                  <tr key={it.id} className="border-t border-ink-700 align-top">
                    <td className="w-44 py-1">{it.title}</td>
                    <td className="w-20 py-1">{a.status === 'ok' ? '설계상 충족' : a.status === 'info' ? '정보' : '확인 필요'}</td>
                    <td className="py-1">
                      {a.text}
                      {project.legalNotes[it.id] && <div className="text-metal-500">메모: {project.legalNotes[it.id]}</div>}
                    </td>
                    <td className="w-16 py-1 text-right">{st === 'done' ? '확인 완료' : st === 'na' ? '해당 없음' : '미확인'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section n={6} title="데이터 출처 · 모델 한계">
          <ul className="list-disc space-y-1 pl-4">
            {LIMITATIONS.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>등록된 녹음: {project.recordings.length ? project.recordings.map((r) => `${r.fileName} (${r.source})`).join(', ') : '없음'}</li>
          </ul>
        </Section>
      </article>
    </div>
  );
}
