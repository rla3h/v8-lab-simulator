import { audioEngine, type AudioMode } from './AudioEngine';
import { useStore } from '../store';
import { recordingFor } from './hybrid';
import { resolveSource } from '../store';
import type { AudioProvenance } from '../types';

export async function startAudio(mode?: AudioMode) {
  try {
    const m = await audioEngine.start(mode);
    useStore.setState({ audio: { on: true, mode: m, error: audioEngine.lastError } });
  } catch (e) {
    useStore.setState({ audio: { on: false, mode: null, error: `오디오 시작 실패: ${(e as Error).message}` } });
  }
}

export async function toggleAudio() {
  const s = useStore.getState();
  if (!s.audio.on) return startAudio();
  await audioEngine.suspend();
  useStore.setState({ audio: { ...s.audio, on: false } });
}

/** Provenance of what is currently audible (spec §6-D). */
export function useAudibleProvenance(): { kind: AudioProvenance; extra?: string } {
  const project = useStore((s) => s.project);
  const c = useStore((s) => s.controls);
  const src = resolveSource(c.monitor === 'A' ? c.sourceA : c.sourceB, project);
  const rec = recordingFor(project.recordings, src.engine.id, c.listener);
  if (rec && c.hybridBlend > 0) {
    if (c.hybridBlend >= 0.999) return { kind: 'REFERENCE', extra: rec.exhaust === 'oem' && c.monitor === 'B' ? '+Δ배기EQ' : undefined };
    return { kind: 'REFERENCE', extra: `${Math.round(c.hybridBlend * 100)}% + SIM ${Math.round((1 - c.hybridBlend) * 100)}%` };
  }
  return { kind: 'SIMULATED' };
}
