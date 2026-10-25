import { useStore } from '../store';
import { engineById } from '../data/engines';

export type Keyframe = [t: number, rpm: number, throttle: number];

export const SCENARIOS: { id: string; label: string; desc: string }[] = [
  { id: 'idle', label: '공회전', desc: '공회전 RPM, 스로틀 0' },
  { id: 'steady', label: '일정 RPM', desc: '현재 RPM·스로틀 10초 유지' },
  { id: 'gentle', label: '완만한 가속', desc: '1,200 → 4,200 rpm, 스로틀 30–35%' },
  { id: 'hard', label: '급가속', desc: '1,500 → 최대 RPM, 스로틀 100% 후 오프' },
  { id: 'decel', label: '감속', desc: '5,500 rpm → 공회전, 스로틀 0 (오버런)' },
  { id: 'custom', label: '사용자 정의', desc: '시간:RPM:스로틀 시퀀스' },
];

export function parseCustom(text: string): { frames: Keyframe[]; error: string | null } {
  const frames: Keyframe[] = [];
  const lines = text.split(/\n|,/).map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    const m = l.split(':').map(Number);
    if (m.length !== 3 || m.some((x) => !Number.isFinite(x))) return { frames: [], error: `형식 오류: "${l}" (예: 2:3000:0.5)` };
    frames.push([m[0], m[1], Math.min(1, Math.max(0, m[2]))]);
  }
  if (frames.length < 2) return { frames: [], error: '키프레임이 2개 이상 필요합니다.' };
  for (let i = 1; i < frames.length; i++)
    if (frames[i][0] <= frames[i - 1][0]) return { frames: [], error: '시간은 증가해야 합니다.' };
  return { frames, error: null };
}

export function scenarioFrames(id: string): Keyframe[] {
  const s = useStore.getState();
  const eng = engineById(s.project.engineId);
  const idle = eng.sim.idleRpm;
  const max = eng.sim.maxRpm;
  const { rpm, throttle } = s.controls;
  switch (id) {
    case 'idle':
      return [[0, idle, 0], [6, idle, 0]];
    case 'steady':
      return [[0, rpm, throttle], [10, rpm, throttle]];
    case 'gentle':
      return [[0, 1200, 0.3], [8, 4200, 0.35], [8.4, 4200, 0], [10, 2500, 0]];
    case 'hard':
      return [[0, 1500, 1], [4.2, max - 200, 1], [4.5, max - 200, 0], [7, 2000, 0], [8, 1200, 0]];
    case 'decel':
      return [[0, 5500, 0], [5.5, idle, 0], [7, idle, 0]];
    case 'custom':
      return parseCustom(s.scenario.custom).frames;
  }
  return [];
}

export function sampleFrames(frames: Keyframe[], t: number): { rpm: number; throttle: number } {
  if (t <= frames[0][0]) return { rpm: frames[0][1], throttle: frames[0][2] };
  for (let i = 1; i < frames.length; i++) {
    const [t1, r1, h1] = frames[i];
    const [t0, r0, h0] = frames[i - 1];
    if (t <= t1) {
      const a = (t - t0) / (t1 - t0);
      return { rpm: r0 + (r1 - r0) * a, throttle: h0 + (h1 - h0) * a };
    }
  }
  const last = frames[frames.length - 1];
  return { rpm: last[1], throttle: last[2] };
}

let raf = 0;
let t0 = 0;
let lastAB = 0;

export function stopScenario() {
  cancelAnimationFrame(raf);
  raf = 0;
  const s = useStore.getState();
  if (s.scenario.id) useStore.setState({ scenario: { ...s.scenario, id: null } });
}

export function startScenario(id: string) {
  const frames = scenarioFrames(id);
  if (frames.length < 2) {
    useStore.getState().notify('시나리오 키프레임 오류 — 사용자 정의 시퀀스를 확인하세요.');
    return;
  }
  cancelAnimationFrame(raf);
  const s = useStore.getState();
  useStore.setState({ scenario: { ...s.scenario, id } });
  t0 = performance.now();
  lastAB = t0;
  const end = frames[frames.length - 1][0];
  const tick = (now: number) => {
    const st = useStore.getState();
    if (st.scenario.id !== id) return;
    let t = (now - t0) / 1000;
    if (t > end) {
      if (st.scenario.loop) {
        t0 = now;
        t = 0;
      } else {
        const v = sampleFrames(frames, end);
        st.setControls({ rpm: v.rpm, throttle: v.throttle });
        stopScenario();
        return;
      }
    }
    const v = sampleFrames(frames, t);
    const patch: Partial<typeof st.controls> = { rpm: v.rpm, throttle: v.throttle };
    if (st.scenario.autoAB && now - lastAB > 2000) {
      lastAB = now;
      patch.monitor = st.controls.monitor === 'A' ? 'B' : 'A';
    }
    st.setControls(patch);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
