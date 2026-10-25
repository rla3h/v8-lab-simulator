import { useMemo, useState } from 'react';
import { useStore, resolveSource } from '../store';
import { engineById } from '../data/engines';
import { stockExhaustFor } from '../data/exhaust';
import { runAnalysis, ORDERS, SIM_RPMS, RUMBLE_RPMS, ROAR_RPMS, type AnalysisResult, type SweepAnalysis } from '../analysis/analyze';
import { valveModeCode } from '../dsp/compile';
import { Card, Note, Segmented, Slider, Tag } from './ui';
import { Heatmap, LineChart, useCanvas } from './charts';

function maxOf(rows: (Float32Array | number[])[]) {
  let m = -200;
  for (const r of rows) for (let i = 0; i < r.length; i++) if (r[i] > m) m = r[i];
  return m;
}

function SweepMaps({ s, label, color }: { s: SweepAnalysis; label: string; color: string }) {
  const m = maxOf(s.spec);
  const mo = maxOf(s.orders);
  const xs = s.rpm.map((r) => Math.round(r));
  return (
    <div>
      <div className="mb-1 text-[11px]" style={{ color }}>
        {label}
      </div>
      <Heatmap data={s.spec} yMax={s.maxHz} yLabel="Hz (log)" xs={xs} xLabel="rpm" height={170} dbRange={[m - 70, m]} yTicks={[30, 50, 100, 200, 500, 1000, 2000]} yLog={{ f0: 25, f1: s.maxHz }} binHz={s.binHz} />
      <div className="mt-2" />
      <Heatmap data={s.orders} yMax={ORDERS.length} yLabel="엔진 차수 0.5–12" xs={xs} xLabel="rpm" height={150} dbRange={[mo - 50, mo]} yTicks={[]} />
      <div className="flex justify-between text-[9px] text-metal-600">
        <span>↑ 차수 맵: 아래 0.5차 → 위 12차 (4차 = V8 점화 주파수, 1.5·2.5차 = 뱅크별 불균등 점화 성분)</span>
      </div>
    </div>
  );
}

function OrderBars({ a, rpm }: { a: AnalysisResult; rpm: number }) {
  const sets = [
    { label: 'A', color: '#2dd4bf', f: a.features.A },
    { label: 'B', color: '#f97316', f: a.features.B },
    { label: '목표', color: '#a78bfa', f: a.features.target },
  ];
  const ref = useCanvas(
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const orders = ORDERS.filter((o) => o <= 10);
      const padL = 28, padB = 16;
      const bw = (w - padL) / orders.length;
      const y = (d: number) => (Math.max(-50, d) / -50) * (h - padB);
      g.font = '9px monospace';
      g.fillStyle = '#5c636e';
      for (const d of [0, -10, -20, -30, -40, -50]) {
        g.fillText(`${d}`, 2, y(d) + 3);
        g.fillStyle = '#1a1d22';
        g.fillRect(padL, y(d), w - padL, 1);
        g.fillStyle = '#5c636e';
      }
      orders.forEach((o, i) => {
        sets.forEach((s, j) => {
          const p = s.f.find((x) => x.rpm === rpm);
          if (!p) return;
          const d = p.orderDb[ORDERS.indexOf(o)];
          g.fillStyle = s.color;
          const x = padL + i * bw + 1 + j * ((bw - 2) / 3);
          g.fillRect(x, y(d), (bw - 2) / 3 - 1, h - padB - y(d));
        });
        if (Number.isInteger(o) || o === 1.5 || o === 2.5) {
          g.fillStyle = o === 4 ? '#f97316' : '#7d8591';
          g.fillText(`${o}`, padL + i * bw + 1, h - 3);
        }
      });
    },
    [a, rpm],
  );
  return (
    <div>
      <canvas ref={ref} style={{ width: '100%', height: 170 }} />
      <div className="mt-1 flex gap-3 text-[10px] text-metal-400">
        {sets.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="inline-block h-2 w-3" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="text-metal-600">dB re 최대 차수 · 정상상태 {rpm} rpm</span>
      </div>
    </div>
  );
}

export function AnalysisView() {
  const project = useStore((s) => s.project);
  const controls = useStore((s) => s.controls);
  const analysis = useStore((s) => s.analysis);
  const stale = useStore((s) => s.analysisStale);
  const set = useStore((s) => s.set);
  const setProject = useStore((s) => s.setProject);
  const [throttle, setThrottle] = useState(70);
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null);
  const [rpmSel, setRpmSel] = useState(3500);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null);
    setBusy({ p: 0, label: '준비' });
    try {
      const A = resolveSource(controls.sourceA, project);
      const B = resolveSource(controls.sourceB, project);
      const t = engineById(project.targetEngineId);
      const r = engineById(project.roarRefEngineId);
      const res = await runAnalysis(
        {
          A,
          B,
          target: { engine: t, exhaust: stockExhaustFor(t.stockExhaustId), label: `목표 ${t.code} (순정 가정 배기)` },
          roarRef: { engine: r, exhaust: stockExhaustFor(r.stockExhaustId), label: `고회전 레퍼런스 ${r.code} (순정 가정 배기)` },
          throttle: throttle / 100,
          valveMode: valveModeCode(controls.valveMode),
          toneBalance: project.toneBalance,
        },
        (p, label) => setBusy({ p, label }),
      );
      set({ analysis: res, analysisStale: false });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const a = analysis;
  const lvlSeries = useMemo(
    () =>
      a
        ? [
            { label: 'A 전체 레벨', color: '#2dd4bf', xs: a.sweepA.rpm, ys: a.sweepA.levelDb },
            { label: 'B 전체 레벨', color: '#f97316', xs: a.sweepB.rpm, ys: a.sweepB.levelDb },
            { label: 'A 저주파 25–100 Hz', color: '#2dd4bf', xs: a.sweepA.rpm, ys: a.sweepA.lfDb, dash: [4, 3] },
            { label: 'B 저주파 25–100 Hz', color: '#f97316', xs: a.sweepB.rpm, ys: a.sweepB.lfDb, dash: [4, 3] },
          ]
        : [],
    [a],
  );
  const boomSeries = useMemo(
    () =>
      a
        ? [
            { label: 'A 실내 25–100 Hz', color: '#2dd4bf', xs: a.boom.rows.map((r) => r.rpm), ys: a.boom.rows.map((r) => r.lfA) },
            { label: 'B 실내 25–100 Hz', color: '#f97316', xs: a.boom.rows.map((r) => r.rpm), ys: a.boom.rows.map((r) => r.lfB) },
          ]
        : [],
    [a],
  );
  const levelTone = a?.boom.level === 'LOW' ? 'green' : a?.boom.level === 'MED' ? 'amber' : 'red';

  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Acoustic Analysis — 오프라인 스윕 분석"
        right={
          <button className="btn btn-primary" onClick={run} disabled={!!busy} data-testid="run-analysis">
            {busy ? `분석 중 ${Math.round(busy.p * 100)}%` : a ? '다시 분석' : '분석 실행'}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
          <Slider label="스윕·특징 스로틀" value={throttle} min={10} max={100} step={5} unit="%" onChange={setThrottle} hint="부밍 스윕은 순항 부하(최대 30%)로 별도 계산" />
          <Slider
            label={`음색 목표 가중치 (저음 ${project.toneBalance} : 포효 ${100 - project.toneBalance})`}
            value={project.toneBalance}
            min={0}
            max={100}
            step={5}
            onChange={(v) => {
              setProject({ toneBalance: v });
              set({ analysisStale: true });
            }}
          />
          <div className="text-[11px] text-metal-500">
            A: {resolveSource(controls.sourceA, project).label}
            <br />
            B: {resolveSource(controls.sourceB, project).label}
            <br />
            밸브 모드: {controls.valveMode.toUpperCase()} · 고회전 레퍼런스: {engineById(project.roarRefEngineId).code}
          </div>
        </div>
        {busy && <div className="mt-2 text-[11px] text-teal-300">{busy.label}…</div>}
        {err && <Note tone="red">분석 오류: {err}</Note>}
        {a && stale && <Note>설정이 분석 이후 변경되었습니다. 결과를 갱신하려면 다시 분석하세요.</Note>}
        <p className="mt-2 text-[10px] text-metal-600">
          모든 그래프는 V8 LAB DSP 엔진이 실제로 렌더링한 오디오(24 kHz)를 FFT(4096, Hann)로 분석한 결과입니다. 실외 분석 위치 = 좌측(LH) 팁 쪽 채널(크로스오버 모델은 좌우 합을 보존하므로 합산 신호로는 X/H 효과가 보이지 않음), 실내 = 좌우 합. 임의 데이터가 아니며, 동시에 실제 차량 측정값도 아닙니다(SIMULATED).
        </p>
      </Card>

      {!a ? (
        <Card title="결과">
          <div className="text-sm text-metal-500">"분석 실행"을 누르면 A/B 실외 스윕(공회전→최대 RPM), 실내 부밍 스윕(1,000→3,000 rpm), 목표·레퍼런스 엔진 정상상태 특징을 계산합니다 (수 초 소요).</div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <Card title="Spectrogram + Engine-order Map — A">
              <SweepMaps s={a.sweepA} label={a.labels.A} color="#2dd4bf" />
            </Card>
            <Card title="Spectrogram + Engine-order Map — B">
              <SweepMaps s={a.sweepB} label={a.labels.B} color="#f97316" />
            </Card>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <Card title="RPM별 레벨 · 저주파 에너지 (실외, dBFS)">
              <LineChart series={lvlSeries} xLabel="rpm" yLabel="dBFS" height={200} />
            </Card>
            <Card
              title="실내 부밍 위험 추정"
              right={
                <span className="flex items-center gap-1">
                  <Tag tone={levelTone as 'green' | 'amber' | 'red'}>{a.boom.level}</Tag>
                  <Tag tone="amber">추정</Tag>
                </span>
              }
            >
              <LineChart series={boomSeries} xLabel="rpm" yLabel="dBFS" height={160} bands={[{ x0: 1500, x1: 2500, color: '#f9731614', label: '목표 대역' }]} />
              <table className="mt-2 w-full text-[10.5px]">
                <thead className="text-metal-500">
                  <tr>
                    <th className="text-left font-normal">rpm</th>
                    <th className="text-right font-normal">A LF</th>
                    <th className="text-right font-normal">B LF</th>
                    <th className="text-right font-normal">Δ B−A</th>
                    <th className="text-right font-normal">Δ 돌출도</th>
                  </tr>
                </thead>
                <tbody className="num text-metal-300">
                  {a.boom.rows.map((r) => (
                    <tr key={r.rpm} className={r.rpm >= 1500 && r.rpm <= 2500 ? 'text-white' : 'text-metal-500'}>
                      <td>{r.rpm}</td>
                      <td className="text-right">{r.lfA.toFixed(1)}</td>
                      <td className="text-right">{r.lfB.toFixed(1)}</td>
                      <td className={`text-right ${r.delta > 6 ? 'text-red-300' : r.delta > 3 ? 'text-amber-300' : ''}`}>{r.delta >= 0 ? '+' : ''}{r.delta.toFixed(1)}</td>
                      <td className={`text-right ${r.promB - r.promA > 6 ? 'text-amber-300' : ''}`}>{(r.promB - r.promA).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] leading-relaxed text-metal-600">
                정의: 실내 추정 모델 출력의 25–100 Hz 대역 에너지. 1,500–2,500 rpm에서 max Δ(B−A) ≤ 3 dB → LOW, ≤ 6 dB → MED, &gt; 6 dB → HIGH; 저역 피크 돌출도(25–100 Hz 최대 bin − 100–400 Hz 중앙값)가 A보다 6 dB 넘게 커지면(더 '웅' 하는 단일 톤) 한 단계 상향. 현재: max Δ {a.boom.maxDelta.toFixed(1)} dB, 최대 Δ돌출도 {a.boom.maxProm.toFixed(1)} dB. 실내 모델(차체 투과·실내 모드)은 가정이며 구조 전달 진동은 미포함 — 실측 검증 필요.
              </p>
            </Card>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <Card title="차수 스펙트럼 비교 (정상상태)" right={<div className="w-64"><Segmented value={String(rpmSel)} onChange={(v) => setRpmSel(Number(v))} options={SIM_RPMS.map((r) => ({ value: String(r), label: `${r / 1000}k` }))} /></div>}>
              <OrderBars a={a} rpm={rpmSel} />
            </Card>
            <Card title="목표 음색 비교" right={<Tag tone="amber">모델 간 비교</Tag>}>
              <div className="grid grid-cols-2 gap-3">
                {(['A', 'B'] as const).map((k) => (
                  <div key={k} className="rounded-lg border border-ink-700 bg-ink-850 p-2">
                    <div className="lbl">{k} 목표 일치 점수</div>
                    <div className={`num text-2xl ${k === 'A' ? 'text-teal-300' : 'text-rpm-400'}`}>{a.similarity[k].score.toFixed(0)}<span className="text-xs text-metal-500"> / 100</span></div>
                  </div>
                ))}
              </div>
              <table className="mt-2 w-full text-[10.5px]">
                <thead className="text-metal-500">
                  <tr>
                    <th className="text-left font-normal">B vs</th>
                    <th className="text-right font-normal">rpm</th>
                    <th className="text-right font-normal">차수상관</th>
                    <th className="text-right font-normal">중심주파수</th>
                    <th className="text-right font-normal">기울기</th>
                    <th className="text-right font-normal">저역비</th>
                    <th className="text-right font-normal">합계</th>
                  </tr>
                </thead>
                <tbody className="num text-metal-300">
                  {[...a.similarity.B.rumble.map((s) => ({ s, ref: '목표' })), ...a.similarity.B.roar.map((s) => ({ s, ref: '고회전 레퍼런스' }))].map(({ s, ref }) => (
                    <tr key={ref + s.rpm}>
                      <td className="text-left text-metal-500">{ref}</td>
                      <td className="text-right">{s.rpm}</td>
                      <td className="text-right">{s.orderCorr.toFixed(0)}</td>
                      <td className="text-right">{s.centroid.toFixed(0)}</td>
                      <td className="text-right">{s.slope.toFixed(0)}</td>
                      <td className="text-right">{s.lf.toFixed(0)}</td>
                      <td className="text-right text-white">{s.total.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="mt-3 w-full text-[10.5px]">
                <thead className="text-metal-500">
                  <tr>
                    <th className="text-left font-normal">지표 (rpm)</th>
                    {SIM_RPMS.map((r) => (
                      <th key={r} className="text-right font-normal">{r / 1000}k</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num text-metal-300">
                  {(['A', 'B', 'target', 'roarRef'] as const).map((k) => (
                    <tr key={k}>
                      <td className="text-metal-500">럼블 지수 {k === 'target' ? '목표' : k === 'roarRef' ? '레퍼런스' : k}</td>
                      {a.features[k].map((f) => (
                        <td key={f.rpm} className="text-right">{f.rumbleIdx.toFixed(1)}</td>
                      ))}
                    </tr>
                  ))}
                  {(['A', 'B', 'target', 'roarRef'] as const).map((k) => (
                    <tr key={'r' + k}>
                      <td className="text-metal-500">포효 지수 {k === 'target' ? '목표' : k === 'roarRef' ? '레퍼런스' : k}</td>
                      {a.features[k].map((f) => (
                        <td key={f.rpm} className="text-right">{f.roarIdx.toFixed(1)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] leading-relaxed text-metal-600">
                점수 = {Math.round(a.similarity.weightRumble * 100)}% × 평균(목표 엔진과의 유사도 @ {RUMBLE_RPMS.join(', ')} rpm) + {Math.round((1 - a.similarity.weightRumble) * 100)}% × 평균(고회전 레퍼런스와의 유사도 @ {ROAR_RPMS.join(', ')} rpm).
                유사도 = 0.4·차수 dB 벡터 상관(0.5–12차) + 0.2·exp(−|log₂ 중심주파수 비|/0.5) + 0.2·exp(−|기울기 차|/3 dB/oct) + 0.2·exp(−|저역비 차|/6 dB), 각 ×100.
                럼블 지수 = 반차수(0.5·1.5·2.5·3.5) 합 − 4차 [dB], 포효 지수 = 0.8–5 kHz − 20–800 Hz [dB].
                목표·레퍼런스 모두 SIMULATED 모델이므로 이 점수는 실제 차량 소리와의 일치도가 아닙니다.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
