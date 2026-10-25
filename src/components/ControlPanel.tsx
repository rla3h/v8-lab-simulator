import { useStore, SOURCE_LABEL, resolveSource } from '../store';
import { engineById } from '../data/engines';
import { Card, Segmented, Slider, Stat, Note, ProvBadge } from './ui';
import { SCENARIOS, startScenario, stopScenario, parseCustom } from '../lib/scenario';
import { startAudio, useAudibleProvenance } from '../audio/control';
import type { ListenerMode, ValveMode } from '../types';
import { recordingFor } from '../audio/hybrid';

function RpmGauge({ rpm, target, max, idle }: { rpm: number; target: number; max: number; idle: number }) {
  const R = 78;
  const cx = 100;
  const cy = 100;
  const a0 = -225;
  const sweep = 270;
  const top = Math.ceil(max / 1000) * 1000;
  const ang = (v: number) => ((a0 + (Math.min(Math.max(v, 0), top) / top) * sweep) * Math.PI) / 180;
  const pt = (v: number, r: number) => [cx + r * Math.cos(ang(v)), cy + r * Math.sin(ang(v))];
  const arc = (v0: number, v1: number, r: number) => {
    const [x0, y0] = pt(v0, r);
    const [x1, y1] = pt(v1, r);
    const large = ((v1 - v0) / top) * sweep > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const ticks = [];
  for (let v = 0; v <= top; v += 500) {
    const major = v % 1000 === 0;
    const [x0, y0] = pt(v, major ? R - 10 : R - 5);
    const [x1, y1] = pt(v, R);
    ticks.push(<line key={v} x1={x0} y1={y0} x2={x1} y2={y1} stroke={v >= max - 400 ? '#ef4444' : '#5c636e'} strokeWidth={major ? 2 : 1} />);
    if (major) {
      const [tx, ty] = pt(v, R - 20);
      ticks.push(
        <text key={`t${v}`} x={tx} y={ty + 3} textAnchor="middle" fontSize="9" fill="#7d8591" fontFamily="monospace">
          {v / 1000}
        </text>,
      );
    }
  }
  const [nx, ny] = pt(rpm, R - 6);
  const [tx, ty] = pt(target, R + 6);
  return (
    <svg viewBox="0 0 200 172" className="mx-auto w-full max-w-[220px]" role="img" aria-label={`엔진 회전수 ${Math.round(rpm)} rpm`}>
      <path d={arc(0, top, R)} stroke="#23272e" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d={arc(max - 400, top, R)} stroke="#7f1d1d" strokeWidth="8" fill="none" />
      <path d={arc(0, Math.max(rpm, 1), R)} stroke="#f97316" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.9" />
      {ticks}
      <circle cx={tx} cy={ty} r="3" fill="#2dd4bf" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#15181c" stroke="#fb923c" strokeWidth="2" />
      <text x={cx} y={cy + 32} textAnchor="middle" fontSize="22" fill="#f1f5f9" fontFamily="monospace" fontWeight="700">
        {Math.round(rpm).toLocaleString()}
      </text>
      <text x={cx} y={cy + 66} textAnchor="middle" fontSize="8" fill="#7d8591" letterSpacing="1">
        RPM · 공회전 {idle} · 한계 {max}
      </text>
    </svg>
  );
}

export function ControlPanel() {
  const c = useStore((s) => s.controls);
  const setControls = useStore((s) => s.setControls);
  const project = useStore((s) => s.project);
  const tel = useStore((s) => s.telemetry);
  const audio = useStore((s) => s.audio);
  const scenario = useStore((s) => s.scenario);
  const set = useStore((s) => s.set);
  const eng = engineById(project.engineId);
  const prov = useAudibleProvenance();
  const srcA = resolveSource(c.sourceA, project);
  const srcB = resolveSource(c.sourceB, project);
  const hasValve = (c.monitor === 'A' ? srcA : srcB).exhaust.left.some((p) => p.kind === 'muffler-valved');
  const valvePos = tel ? tel.valve[c.monitor === 'A' ? 0 : 1] : 0;
  const customErr = scenario.id === null ? parseCustom(scenario.custom).error : null;

  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Live Simulator"
        right={<ProvBadge kind={prov.kind} extra={prov.extra} />}
      >
        {!audio.on && (
          <button className="btn btn-rpm mb-3 w-full py-2.5 text-sm" onClick={() => startAudio()} data-testid="start-audio">
            ▶ 오디오 시작 (브라우저 정책상 클릭 필요)
          </button>
        )}
        {audio.error && <Note tone="red">{audio.error}</Note>}
        <RpmGauge rpm={tel?.rpm ?? c.rpm} target={c.rpm} max={eng.sim.maxRpm} idle={eng.sim.idleRpm} />
        <div className="mt-1 space-y-3">
          <Slider
            label="RPM (목표)"
            value={Math.round(c.rpm)}
            min={eng.sim.idleRpm}
            max={eng.sim.maxRpm}
            step={10}
            color="#f97316"
            format={(v) => v.toLocaleString()}
            onChange={(v) => {
              stopScenario();
              setControls({ rpm: v });
            }}
            hint="엔진 관성 모델: 상승 최대 6,000 rpm/s, 하강 4,200 rpm/s로 실제 RPM이 따라감"
          />
          <Slider
            label="스로틀 (부하)"
            value={Math.round(c.throttle * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(v) => {
              stopScenario();
              setControls({ throttle: v / 100 });
            }}
            hint="RPM과 독립. 펄스 세기·어택·흡기음·가변밸브(AUTO)에 반영"
          />
        </div>
      </Card>

      <Card title="A / B 청취" right={<span className="num text-[10px] text-metal-500">동일 RPM·부하</span>}>
        <div className="grid grid-cols-2 gap-2">
          {(['A', 'B'] as const).map((k) => {
            const src = k === 'A' ? srcA : srcB;
            const active = c.monitor === k;
            return (
              <button
                key={k}
                onClick={() => setControls({ monitor: k })}
                data-testid={`monitor-${k}`}
                className={`rounded-lg border p-2 text-left transition ${active ? (k === 'A' ? 'border-teal-500 bg-teal-500/10' : 'border-rpm-500 bg-rpm-500/10') : 'border-ink-600 bg-ink-850 hover:border-ink-500'}`}
              >
                <div className={`font-mono text-lg font-bold ${active ? (k === 'A' ? 'text-teal-300' : 'text-rpm-400') : 'text-metal-500'}`}>{k}</div>
                <div className="text-[10px] text-metal-500">{SOURCE_LABEL[k === 'A' ? c.sourceA : c.sourceB]}</div>
                <div className="truncate text-[11px] text-metal-300">{src.exhaust.name}</div>
              </button>
            );
          })}
        </div>
        <label className="mt-2 flex items-center justify-between gap-2 text-[11px] text-metal-400">
          <span>음량 정규화 (B를 A 라우드니스에 맞춤)</span>
          <input type="checkbox" checked={c.normalize} onChange={(e) => setControls({ normalize: e.target.checked })} className="accent-teal-500" />
        </label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <Stat label="A 레벨" value={tel ? tel.levelDb[0].toFixed(1) : '—'} unit="dBFS" />
          <Stat label="B 레벨(원음)" value={tel ? tel.levelDb[1].toFixed(1) : '—'} unit="dBFS" />
          <Stat label="B 보정" value={tel ? (c.normalize ? tel.normGainDb.toFixed(1) : '0.0') : '—'} unit="dB" tone="teal" />
        </div>
        <p className="mt-1 text-[10px] text-metal-600">디지털 레벨(K-가중 근사, dBFS)이며 실제 음압 dB(A)가 아닙니다.</p>
        {(recordingFor(project.recordings, srcA.engine.id, c.listener) || recordingFor(project.recordings, srcB.engine.id, c.listener)) && (
          <div className="mt-3 border-t border-ink-700 pt-2">
            <Slider
              label="하이브리드: 녹음 ↔ 합성"
              value={Math.round(c.hybridBlend * 100)}
              min={0}
              max={100}
              step={5}
              unit="% 녹음"
              onChange={(v) => setControls({ hybridBlend: v / 100 })}
              hint="녹음이 있는 엔진에만 적용. 녹음은 RPM 비율로 재생속도 변경, B는 순정→설계 선형 응답 차이 FIR 적용."
            />
          </div>
        )}
      </Card>

      <Card title="가변밸브 · 청취 위치">
        <div className="space-y-2">
          <Segmented<ValveMode>
            value={c.valveMode}
            onChange={(v) => setControls({ valveMode: v })}
            options={[
              { value: 'closed', label: 'CLOSED' },
              { value: 'open', label: 'OPEN' },
              { value: 'auto', label: 'AUTO' },
            ]}
          />
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink-700">
              <div className="h-full bg-teal-400 transition-[width]" style={{ width: `${valvePos * 100}%` }} />
            </div>
            <span className="num w-20 text-right text-[11px] text-metal-400">{hasValve ? `개도 ${Math.round(valvePos * 100)}%` : '밸브 없음'}</span>
          </div>
          <p className="text-[10px] leading-relaxed text-metal-600">
            AUTO = RPM·스로틀 기반 히스테리시스 제어(시뮬레이터 가상 제어). 실차 적용 시 검사 조건(밸브 최대 개방 상태) 기준의 소음 확인이 필요하며, 검사 회피용 제어 로직은 제공하지 않습니다.
          </p>
          <Segmented<ListenerMode>
            value={c.listener}
            onChange={(v) => setControls({ listener: v })}
            options={[
              { value: 'exterior', label: '차량 외부 (후방)' },
              { value: 'interior', label: '차량 실내 · 추정' },
            ]}
          />
          {c.listener === 'interior' && (
            <Note>실내 녹음/측정 자료가 없어 차체 투과(4차 로우패스 260 Hz)와 가정 실내 모드(45·72 Hz)로 만든 가상 추정입니다.</Note>
          )}
        </div>
      </Card>

      <Card title="주행 시나리오" right={scenario.id && <span className="text-[10px] text-rpm-400">● 재생 중</span>}>
        <div className="grid grid-cols-3 gap-1.5">
          {SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              title={sc.desc}
              onClick={() => (scenario.id === sc.id ? stopScenario() : startScenario(sc.id))}
              className={`btn px-1.5 text-[11px] ${scenario.id === sc.id ? 'btn-rpm' : ''}`}
            >
              {sc.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-metal-400">
          <label className="flex items-center gap-1">
            <input type="checkbox" className="accent-teal-500" checked={scenario.loop} onChange={(e) => set({ scenario: { ...scenario, loop: e.target.checked } })} />
            반복 재생
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" className="accent-teal-500" checked={scenario.autoAB} onChange={(e) => set({ scenario: { ...scenario, autoAB: e.target.checked } })} />
            2초마다 A/B 자동 전환
          </label>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-metal-500">사용자 정의 RPM 시퀀스 (시간초:RPM:스로틀)</summary>
          <textarea
            className="input mt-1 h-24 w-full font-mono"
            value={scenario.custom}
            onChange={(e) => set({ scenario: { ...scenario, custom: e.target.value } })}
            spellCheck={false}
          />
          {customErr && <div className="text-[10px] text-red-300">{customErr}</div>}
        </details>
      </Card>

      <Card title="출력">
        <Slider label="마스터 볼륨" value={Math.round(c.master * 100)} min={0} max={200} step={1} unit="%" onChange={(v) => setControls({ master: v / 100 })} />
        <label className="mt-2 flex items-start justify-between gap-2 text-[11px] text-metal-400">
          <span>
            청취 레벨 보정 {tel && c.levelAssist && <span className="num text-teal-300">+{tel.agcDb.toFixed(1)} dB</span>}
            <span className="block text-[10px] text-metal-600">조용한 구간(공회전 등)을 최대 +24 dB 올려 들려줌. A·B 중 큰 쪽 기준으로 두 보이스에 같은 이득 → A/B 상대 차이는 유지, RPM에 따른 절대 음량 변화는 줄어듦.</span>
          </span>
          <input type="checkbox" className="mt-0.5 accent-teal-500" checked={c.levelAssist} onChange={(e) => setControls({ levelAssist: e.target.checked })} />
        </label>
        <div className="mt-2 flex items-center justify-between text-[10px] text-metal-600">
          <span>엔진: {audio.mode === 'worklet' ? 'AudioWorklet' : audio.mode === 'script' ? 'ScriptProcessor(폴백)' : '정지'}</span>
          <span className="num">피크 {tel ? (20 * Math.log10(tel.peak + 1e-9)).toFixed(1) : '—'} dBFS</span>
        </div>
      </Card>
    </div>
  );
}
