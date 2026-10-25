import { compileEngine, compileExhaust, listenerCode, valveModeCode, MODEL_VERSION } from '../dsp/compile';
import { renderOfflineAsync } from '../dsp/offline';
import { resolveSource, useStore } from '../store';
import { sampleFrames, scenarioFrames, SCENARIOS } from './scenario';
import { encodeWav } from './wav';
import { downloadBlob } from './download';
import { rms } from '../analysis/fft';

const SR = 44100;

export async function exportScenarioWav(which: 'A' | 'B' | 'AB', scenarioId: string, onProgress?: (p: number) => void) {
  const s = useStore.getState();
  const frames = scenarioFrames(scenarioId);
  if (frames.length < 2) throw new Error('시나리오 키프레임이 올바르지 않습니다.');
  const seconds = frames[frames.length - 1][0] + 0.5;
  const render = async (slot: 'A' | 'B', base: number) => {
    const src = resolveSource(slot === 'A' ? s.controls.sourceA : s.controls.sourceB, s.project);
    const r = await renderOfflineAsync(
      {
        sr: SR,
        seconds,
        voice: { engine: compileEngine(src.engine), chain: compileExhaust(src.exhaust) },
        listener: listenerCode(s.controls.listener),
        valveMode: valveModeCode(s.controls.valveMode),
        drive: (t) => sampleFrames(frames, t),
        directRpm: false,
        warmup: 0.5,
        master: 1,
      },
      (p) => onProgress?.(base + p * (which === 'AB' ? 0.5 : 1)),
    );
    return { r, label: src.label };
  };
  const parts: { r: Awaited<ReturnType<typeof render>>['r']; label: string; slot: string }[] = [];
  if (which !== 'B') parts.push({ ...(await render('A', 0)), slot: 'A' });
  if (which !== 'A') parts.push({ ...(await render('B', which === 'AB' ? 0.5 : 0)), slot: 'B' });

  let normNote = '원 레벨 유지';
  if (which === 'AB' && s.controls.normalize) {
    const ra = rms(parts[0].r.L) + rms(parts[0].r.R);
    const rb = rms(parts[1].r.L) + rms(parts[1].r.R);
    const g = rb > 0 ? ra / rb : 1;
    for (const ch of [parts[1].r.L, parts[1].r.R]) for (let i = 0; i < ch.length; i++) ch[i] *= g;
    normNote = `B를 A의 RMS에 맞춤(${(20 * Math.log10(g)).toFixed(1)} dB)`;
  }
  const gap = which === 'AB' ? Math.round(SR * 0.6) : 0;
  const total = parts.reduce((a, p) => a + p.r.L.length, 0) + gap * (parts.length - 1);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  let o = 0;
  let peak = 0;
  for (const p of parts) {
    L.set(p.r.L, o);
    R.set(p.r.R, o);
    o += p.r.L.length + gap;
  }
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (peak > 0.98) for (let i = 0; i < total; i++) (L[i] *= 0.98 / peak), (R[i] *= 0.98 / peak);
  const sc = SCENARIOS.find((x) => x.id === scenarioId)?.label ?? scenarioId;
  const comment = `V8 LAB SIMULATED AUDIO (${MODEL_VERSION}) - model synthesis, not a recording of a real vehicle. Scenario: ${sc}. ${parts
    .map((p) => `${p.slot}: ${p.label}`)
    .join(' | ')}. Listener: ${s.controls.listener}. Valve: ${s.controls.valveMode}. Level: ${normNote}.`;
  const wav = encodeWav([L, R], SR, comment);
  downloadBlob(new Blob([wav], { type: 'audio/wav' }), `V8LAB_SIMULATED_${which}_${scenarioId}.wav`);
}
