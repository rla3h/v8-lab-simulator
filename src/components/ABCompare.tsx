import { useEffect, useRef } from 'react';
import { useStore, SOURCE_LABEL, resolveSource } from '../store';
import { audioEngine } from '../audio/AudioEngine';
import { startAudio } from '../audio/control';
import { Card, Note, Segmented, Stat } from './ui';
import { logX } from './charts';
import { ControlPanel } from './ControlPanel';
import type { SourceKind } from '../types';

const F0 = 20;
const F1 = 8000;

/** Live overlay of A and B spectra (taps before monitor mixing; B after level matching when enabled). */
function DualSpectrum() {
  const ref = useRef<HTMLCanvasElement>(null);
  const audioOn = useStore((s) => s.audio.on);
  useEffect(() => {
    let raf = 0;
    let a: Float32Array | null = null;
    let b: Float32Array | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      const aA = audioEngine.analyserA;
      const aB = audioEngine.analyserB;
      if (!cv || !aA || !aB || !audioEngine.ctx) return;
      if (!a || a.length !== aA.frequencyBinCount) a = new Float32Array(aA.frequencyBinCount);
      if (!b || b.length !== aB.frequencyBinCount) b = new Float32Array(aB.frequencyBinCount);
      aA.getFloatFrequencyData(a);
      aB.getFloatFrequencyData(b);
      const dpr = window.devicePixelRatio || 1;
      const r = cv.getBoundingClientRect();
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      const g = cv.getContext('2d')!;
      g.fillStyle = '#0d0f12';
      g.fillRect(0, 0, w, h);
      const binHz = audioEngine.ctx.sampleRate / aA.fftSize;
      const top = h * 0.62;
      const dbMin = -120, dbMax = -10;
      g.font = `${9 * dpr}px monospace`;
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000]) {
        const x = logX(f, F0, F1, w);
        g.fillStyle = '#1a1d22';
        g.fillRect(x, 0, 1, h);
        g.fillStyle = '#5c636e';
        g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, h - 3 * dpr);
      }
      const val = (arr: Float32Array, x: number) => {
        const f = F0 * Math.pow(F1 / F0, x / w);
        const k = Math.round(f / binHz);
        let m = -200;
        for (let j = k - 1; j <= k + 1; j++) if (j > 0 && j < arr.length) m = Math.max(m, arr[j]);
        return m;
      };
      const line = (arr: Float32Array, col: string) => {
        g.strokeStyle = col;
        g.lineWidth = 1.4 * dpr;
        g.beginPath();
        for (let x = 0; x < w; x += 2) {
          const y = top - ((val(arr, x) - dbMin) / (dbMax - dbMin)) * top;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      };
      line(a, '#2dd4bf');
      line(b, '#f97316');
      // difference B − A (smoothed over ±1/12 oct)
      const mid = top + (h - top) / 2;
      g.strokeStyle = '#3d434d';
      g.beginPath();
      g.moveTo(0, mid);
      g.lineTo(w, mid);
      g.stroke();
      g.strokeStyle = '#e5e7eb';
      g.lineWidth = 1.2 * dpr;
      g.beginPath();
      const span = (h - top) / 2 - 4 * dpr;
      for (let x = 0; x < w; x += 2) {
        let s = 0, n = 0;
        for (let dx = -6; dx <= 6; dx += 2) {
          const xx = Math.min(w - 1, Math.max(0, x + dx * dpr));
          s += val(b, xx) - val(a, xx);
          n++;
        }
        const d = Math.max(-20, Math.min(20, s / n));
        const y = mid - (d / 20) * span;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#7d8591';
      g.fillText('A (teal) · B (orange) 스펙트럼, dBFS', 6, 11 * dpr);
      g.fillText('B − A 차이 (±20 dB)', 6, top + 12 * dpr);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [audioOn]);
  return <canvas ref={ref} className="h-72 w-full rounded-md border border-ink-700" aria-label="A/B 스펙트럼 비교" />;
}

export function ABCompare() {
  const c = useStore((s) => s.controls);
  const project = useStore((s) => s.project);
  const setControls = useStore((s) => s.setControls);
  const tel = useStore((s) => s.telemetry);
  const audioOn = useStore((s) => s.audio.on);
  const opts = (Object.keys(SOURCE_LABEL) as SourceKind[]).map((k) => ({ value: k, label: SOURCE_LABEL[k] }));

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex flex-col gap-3">
        <Card title="비교 대상">
          <div className="grid gap-3 md:grid-cols-2">
            {(['A', 'B'] as const).map((k) => {
              const kind = k === 'A' ? c.sourceA : c.sourceB;
              const src = resolveSource(kind, project);
              return (
                <div key={k}>
                  <div className={`mb-1 font-mono text-sm font-bold ${k === 'A' ? 'text-teal-300' : 'text-rpm-400'}`}>{k}</div>
                  <Segmented<SourceKind> value={kind} options={opts} onChange={(v) => setControls(k === 'A' ? { sourceA: v } : { sourceB: v })} />
                  <div className="mt-1 text-[11px] text-metal-400">{src.label}</div>
                  <div className="text-[10px] text-metal-600">
                    엔진 {src.engine.code} · 배기 {src.exhaust.name}
                  </div>
                </div>
              );
            })}
          </div>
          {(c.sourceA === 'snapshot' || c.sourceB === 'snapshot') && !project.snapshot && (
            <Note>스냅샷이 없습니다. Workspace의 "스냅샷" 버튼으로 변경 전 설계를 저장하면 변경 전·후를 비교할 수 있습니다. (현재는 순정으로 대체)</Note>
          )}
          {(c.sourceA === 'target' || c.sourceB === 'target') && (
            <Note>목표 엔진 출력도 SIMULATED 모델입니다(배기 구조 가정). 실제 차량 녹음이 아니므로 "모델 간 비교"로 해석해야 합니다.</Note>
          )}
        </Card>
        <Card
          title="실시간 스펙트럼 비교 (동일 RPM·스로틀)"
          right={<span className="num text-[10px] text-metal-500">{tel ? `${Math.round(tel.rpm)} rpm · ${Math.round(tel.throttle * 100)}%` : ''}</span>}
        >
          {!audioOn ? (
            <button className="btn btn-rpm w-full py-3" onClick={() => startAudio()}>
              ▶ 오디오 시작
            </button>
          ) : (
            <DualSpectrum />
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="A 레벨" value={tel ? tel.levelDb[0].toFixed(1) : '—'} unit="dBFS" tone="teal" />
            <Stat label="B 레벨 (원음)" value={tel ? tel.levelDb[1].toFixed(1) : '—'} unit="dBFS" tone="orange" />
            <Stat label="원음 차이 B−A" value={tel ? (tel.levelDb[1] - tel.levelDb[0]).toFixed(1) : '—'} unit="dB" />
            <Stat label="B 정규화 이득" value={tel && c.normalize ? tel.normGainDb.toFixed(1) : '0.0'} unit="dB" />
          </div>
          <p className="mt-2 text-[10px] text-metal-600">
            레벨은 K-가중 근사 단기(0.4 s) RMS, 디지털 dBFS입니다. 정규화 ON이면 B 스펙트럼은 A와 같은 라우드니스로 맞춘 뒤 표시·재생됩니다 — 음량 차이로 음색을 오판하지 않도록.
          </p>
        </Card>
        <Card title="비교 방법">
          <ol className="list-decimal space-y-1 pl-4 text-[11px] text-metal-400">
            <li>A/B는 같은 엔진 상태(RPM·스로틀·밸브 모드)를 공유하며 동시에 계산되므로 전환 시 조건이 동일합니다.</li>
            <li>A·B 버튼 또는 키보드 없이 우측 패널에서 즉시 전환(30 ms 크로스페이드)합니다.</li>
            <li>"반복 재생" + "2초마다 A/B 자동 전환"으로 같은 구간을 반복 비교할 수 있습니다.</li>
            <li>음량 정규화를 끄면 원래 음량 차이를 유지한 비교가 됩니다.</li>
          </ol>
        </Card>
      </div>
      <ControlPanel />
    </div>
  );
}
