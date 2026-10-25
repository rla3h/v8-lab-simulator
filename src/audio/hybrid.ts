import { fft } from '../analysis/fft';
import { sideResponseDb } from '../dsp/compile';
import type { CoreChain } from '../dsp/core';
import type { RecordingMeta } from '../types';

/** Decoded recordings live outside the store (AudioBuffers are not serialisable). */
export const recordingBuffers = new Map<string, AudioBuffer>();

/**
 * Linear-phase FIR that turns a recording made through `recorded` into an estimate
 * through `target`: |H_target| / |H_recorded| averaged over both sides, clamped ±12 dB.
 * Only the linear part of the exhaust model is captured (resonators, mufflers, pipe
 * resonance) — crossover pulse merging is non-linear in this model and is NOT applied.
 */
export function deltaFir(target: CoreChain, recorded: CoreChain, sr: number, vp: number, taps = 1024): Float32Array {
  const n = taps;
  const half = n / 2;
  const freqs = Array.from({ length: half + 1 }, (_, k) => Math.max((k * sr) / n, 10));
  const avg = (ch: CoreChain) => {
    const a = sideResponseDb(ch, 0, freqs, vp, sr);
    const b = sideResponseDb(ch, 1, freqs, vp, sr);
    return a.map((x, i) => 0.5 * (x + b[i]));
  };
  const t = avg(target);
  const r = avg(recorded);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k <= half; k++) {
    const dB = Math.max(-12, Math.min(12, t[k] - r[k]));
    const m = Math.pow(10, dB / 20);
    re[k] = m;
    if (k > 0 && k < half) re[n - k] = m;
  }
  // inverse FFT via conjugation (spectrum is real & symmetric → real, even impulse)
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const src = (i + half) % n; // centre the zero-phase impulse
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    out[i] = (re[src] / n) * w;
  }
  return out;
}

export function recordingFor(recs: RecordingMeta[], engineId: string, listener: string): RecordingMeta | null {
  const usable = recs.filter((r) => r.engineId === engineId && r.rightsConfirmed && recordingBuffers.has(r.id));
  return usable.find((r) => r.position === listener) ?? usable[0] ?? null;
}
