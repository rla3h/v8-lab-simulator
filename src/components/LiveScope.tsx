import { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { useStore } from '../store';
import { heat, logX } from './charts';

const F0 = 20;
const F1 = 8000;
const DB_MIN = -110;
const DB_MAX = -10;

/**
 * Real-time waveform, FFT spectrum with engine-order markers, and scrolling
 * spectrogram, all read from Web Audio AnalyserNodes on the actual output.
 */
export function LiveScope({ compact = false }: { compact?: boolean }) {
  const waveRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const sgRef = useRef<HTMLCanvasElement>(null);
  const audioOn = useStore((s) => s.audio.on);

  useEffect(() => {
    let raf = 0;
    let td: Float32Array | null = null;
    let fd: Float32Array | null = null;
    const fit = (cv: HTMLCanvasElement) => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      return { w, h, dpr };
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const an = audioEngine.analyserMain;
      const ctxA = audioEngine.ctx;
      if (!an || !ctxA) return;
      if (!td || td.length !== an.fftSize) td = new Float32Array(an.fftSize);
      if (!fd || fd.length !== an.frequencyBinCount) fd = new Float32Array(an.frequencyBinCount);
      an.getFloatTimeDomainData(td);
      an.getFloatFrequencyData(fd);
      const sr = ctxA.sampleRate;
      const binHz = sr / an.fftSize;
      const st = useStore.getState();
      const rpm = st.telemetry?.rpm ?? st.controls.rpm;

      // waveform
      const wv = waveRef.current;
      if (wv) {
        const { w, h } = fit(wv);
        const g = wv.getContext('2d')!;
        g.fillStyle = '#0d0f12';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#23272e';
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
        // show ~2 engine cycles (720° each) so the firing rhythm is visible
        const samples = Math.min(td.length, Math.round(((2 * 120) / Math.max(rpm, 300)) * sr));
        g.strokeStyle = '#2dd4bf';
        g.lineWidth = 1.2 * (window.devicePixelRatio || 1);
        g.beginPath();
        let pk = 1e-4;
        for (let i = 0; i < samples; i++) pk = Math.max(pk, Math.abs(td[td.length - samples + i]));
        const scale = (h / 2 - 4) / Math.max(pk, 0.02);
        for (let i = 0; i < samples; i++) {
          const x = (i / samples) * w;
          const y = h / 2 - td[td.length - samples + i] * scale;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.fillStyle = '#5c636e';
        g.font = `${9 * (window.devicePixelRatio || 1)}px monospace`;
        g.fillText(`WAVEFORM · 2 cycles · pk ${(20 * Math.log10(pk)).toFixed(1)} dBFS (auto-scale)`, 6, 12 * (window.devicePixelRatio || 1));
      }

      // spectrum
      const sp = specRef.current;
      if (sp) {
        const { w, h, dpr } = fit(sp);
        const g = sp.getContext('2d')!;
        g.fillStyle = '#0d0f12';
        g.fillRect(0, 0, w, h);
        g.font = `${9 * dpr}px monospace`;
        for (const f of [50, 100, 200, 500, 1000, 2000, 5000]) {
          const x = logX(f, F0, F1, w);
          g.fillStyle = '#1a1d22';
          g.fillRect(x, 0, 1, h);
          g.fillStyle = '#5c636e';
          g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, h - 3 * dpr);
        }
        // engine orders 1.5 (bank half-order), 4 (firing), 8
        const f1 = rpm / 60;
        for (const [o, col] of [
          [1.5, '#a78bfa'],
          [4, '#f97316'],
          [8, '#fbbf24'],
        ] as [number, string][]) {
          const x = logX(o * f1, F0, F1, w);
          g.strokeStyle = col;
          g.setLineDash([3 * dpr, 3 * dpr]);
          g.beginPath();
          g.moveTo(x, 12 * dpr);
          g.lineTo(x, h);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = col;
          g.fillText(`${o}차`, x + 2, 22 * dpr);
        }
        g.strokeStyle = '#2dd4bf';
        g.lineWidth = 1.3 * dpr;
        g.beginPath();
        let first = true;
        for (let x = 0; x < w; x += 1) {
          const f = F0 * Math.pow(F1 / F0, x / w);
          const k = Math.round(f / binHz);
          const v = fd[Math.min(fd.length - 1, k)];
          const y = h - ((v - DB_MIN) / (DB_MAX - DB_MIN)) * h;
          if (first) {
            g.moveTo(x, y);
            first = false;
          } else g.lineTo(x, y);
        }
        g.stroke();
        g.fillStyle = '#5c636e';
        g.fillText(`FFT ${an.fftSize} · ${binHz.toFixed(1)} Hz/bin · LH 채널 · ${DB_MIN}…${DB_MAX} dBFS`, 6, 10 * dpr);
      }

      // spectrogram (scrolls left)
      const sg = sgRef.current;
      if (sg) {
        const { w, h } = fit(sg);
        const g = sg.getContext('2d')!;
        g.drawImage(sg, -2, 0);
        const col = g.createImageData(2, h);
        for (let y = 0; y < h; y++) {
          const f = F0 * Math.pow(F1 / F0, 1 - y / h);
          const v = fd[Math.min(fd.length - 1, Math.round(f / binHz))];
          const [r, gg, b] = heat((v - DB_MIN) / (DB_MAX - DB_MIN));
          for (let x = 0; x < 2; x++) {
            const o = (y * 2 + x) * 4;
            col.data[o] = r;
            col.data[o + 1] = gg;
            col.data[o + 2] = b;
            col.data[o + 3] = 255;
          }
        }
        g.putImageData(col, w - 2, 0);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [audioOn]);

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 lg:grid-cols-3'}`}>
      <canvas ref={waveRef} className="h-28 w-full rounded-md border border-ink-700" aria-label="실시간 파형" />
      <canvas ref={specRef} className="h-28 w-full rounded-md border border-ink-700" aria-label="실시간 FFT 스펙트럼" />
      <div className="relative">
        <canvas ref={sgRef} className="h-28 w-full rounded-md border border-ink-700 bg-ink-950" aria-label="스펙트로그램" />
        <span className="pointer-events-none absolute left-1.5 top-1 font-mono text-[9px] text-metal-500">SPECTROGRAM 20 Hz–8 kHz (log)</span>
      </div>
      {!audioOn && <div className="text-[11px] text-metal-600 lg:col-span-3">오디오 시작 후 실제 출력 신호를 분석해 표시합니다.</div>}
    </div>
  );
}
