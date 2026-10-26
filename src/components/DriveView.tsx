import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { CARS, carById, type CarSpec } from '../drive/cars';
import { renderCarCanvas } from '../drive/carArt';
import { carPerformance } from '../drive/physics';
import { getTrack, TRACK_IDS, SEG_LEN, type TrackId } from '../drive/tracks';
import { TrackRenderer } from '../drive/render';
import { buildBackdrop, buildSprites } from '../drive/sprites';
import { DriveGame, fmtTime, loadBest, type UiState } from '../drive/game';
import { DriveAudio } from '../drive/driveAudio';
import { Note, Tag } from './ui';

const PREF_KEY = 'v8lab.drive.pref.v1';

function CarPreview({ car, w = 300, h = 190 }: { car: CarSpec; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, 0, c.height);
    bg.addColorStop(0, '#1c2028');
    bg.addColorStop(0.62, '#0f1115');
    bg.addColorStop(1, '#2a2d33');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    const { canvas } = renderCarCanvas(car.art, Math.round(c.width * 0.82), Math.round(c.width * 0.82 * 0.86));
    g.drawImage(canvas, (c.width - canvas.width) / 2, c.height * 0.96 - canvas.height * 0.94);
  }, [car, w, h]);
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: `${w} / ${h}` }} className="block rounded-md" aria-label={`${car.name} 후면 일러스트`} />;
}

function TrackPreview({ id }: { id: TrackId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 480;
    c.height = 270;
    const track = getTrack(id);
    const r = new TrackRenderer(track, buildSprites(track.theme), buildBackdrop(track.theme));
    const start = track.segments.findIndex((s) => s.marker === 'start');
    const z = (start + (id === 'touge' ? 70 : 48)) * SEG_LEN;
    const seg = track.segments[Math.floor(z / SEG_LEN)];
    r.render(c.getContext('2d')!, c.width, c.height, {
      position: z,
      playerX: 0,
      playerY: seg.y1,
      fovDeg: 100,
      shakeX: 0,
      shakeY: 0,
      bgFar: 0.3,
      bgNear: 0.3,
      bgPitch: 0,
    });
    if (track.theme.night) {
      const g = c.getContext('2d')!;
      const hl = g.createRadialGradient(240, 220, 20, 240, 170, 260);
      hl.addColorStop(0, 'rgba(0,0,0,0)');
      hl.addColorStop(1, 'rgba(2,4,12,0.7)');
      g.fillStyle = hl;
      g.fillRect(0, 0, 480, 270);
    }
  }, [id]);
  return <canvas ref={ref} className="block aspect-video w-full rounded-md" aria-label={`${getTrack(id).name} 미리보기`} />;
}

function Stat({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-metal-500">
        <span>{label}</span>
        <span className="num text-metal-300">{value}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded bg-ink-700">
        <div className="h-full" style={{ width: `${Math.max(4, Math.min(100, pct))}%`, background: color }} />
      </div>
    </div>
  );
}

function TouchControls({ game }: { game: DriveGame }) {
  const hold = (k: 'up' | 'down' | 'left' | 'right') => ({
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      game.setTouch(k, true);
    },
    onPointerUp: () => game.setTouch(k, false),
    onPointerCancel: () => game.setTouch(k, false),
    onPointerLeave: () => game.setTouch(k, false),
  });
  const btn = 'pointer-events-auto select-none touch-none rounded-2xl border border-white/20 bg-black/35 font-bold text-white/90 backdrop-blur-sm active:bg-white/25';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
      <div className="flex gap-2">
        <button className={`${btn} h-16 w-16 text-2xl`} {...hold('left')} aria-label="왼쪽 조향">
          ◀
        </button>
        <button className={`${btn} h-16 w-16 text-2xl`} {...hold('right')} aria-label="오른쪽 조향">
          ▶
        </button>
      </div>
      <div className="flex items-end gap-2">
        <button className={`${btn} h-14 w-16 text-xs`} {...hold('down')} aria-label="제동">
          BRAKE
        </button>
        <div className="flex flex-col gap-2">
          <button
            className={`${btn} h-12 w-20 border-cyan-300/50 text-xs text-cyan-200`}
            onPointerDown={(e) => {
              e.preventDefault();
              game.pressBoost();
            }}
            aria-label="부스트"
          >
            X BOOST
          </button>
          <button className={`${btn} h-16 w-20 text-sm`} {...hold('up')} aria-label="가속">
            GAS
          </button>
        </div>
      </div>
    </div>
  );
}

export function DriveView() {
  const pref = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as { car?: string; track?: TrackId };
    } catch {
      return {};
    }
  }, []);
  const [carId, setCarId] = useState(pref.car && CARS.some((c) => c.id === pref.car) ? pref.car : 'gs460');
  const [trackId, setTrackId] = useState<TrackId>(pref.track && TRACK_IDS.includes(pref.track) ? pref.track : 'circuit');
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [ui, setUi] = useState<UiState | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const [showTouch, setShowTouch] = useState(isTouch);
  // immersive = the game covers the whole viewport (works on iPhone, where element fullscreen is unavailable)
  const [immersive, setImmersive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<DriveGame | null>(null);
  const audioRef = useRef<DriveAudio | null>(null);
  const perf = useMemo(() => Object.fromEntries(CARS.map((c) => [c.id, carPerformance(c)])), []);
  const car = carById(carId);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ car: carId, track: trackId }));
    } catch {
      /* ignore */
    }
  }, [carId, trackId]);

  const stopGame = () => {
    gameRef.current?.destroy();
    gameRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
  };

  useEffect(() => stopGame, []);

  const launch = async () => {
    stopGame();
    setAudioNote(null);
    const audio = new DriveAudio();
    try {
      await audio.start(car);
      audioRef.current = audio;
    } catch (e) {
      setAudioNote(`오디오를 시작하지 못해 무음으로 진행합니다: ${(e as Error).message}`);
    }
    setRunning(true);
    setRunId((n) => n + 1);
    if (isTouch || window.innerHeight < 560) setImmersive(true);
  };

  // create the game once the canvas is mounted
  useEffect(() => {
    if (!running || !canvasRef.current) return;
    const game = new DriveGame(canvasRef.current, car, getTrack(trackId), audioRef.current, setUi);
    gameRef.current = game;
    game.start();
    wrapRef.current?.focus();
    return () => {
      game.destroy();
      if (gameRef.current === game) gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, runId]);

  const backToMenu = () => {
    stopGame();
    setRunning(false);
    setUi(null);
    setImmersive(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (immersive || document.fullscreenElement) {
      setImmersive(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    setImmersive(true);
    el?.requestFullscreen?.().catch(() => undefined);
  };

  const restart = async () => {
    setUi(null);
    await launch();
  };

  if (running) {
    const g = gameRef.current;
    return (
      <div className="flex flex-col gap-2">
        <div className="no-print flex flex-wrap items-center gap-2">
          <button className="btn" onClick={backToMenu}>
            ← 차량·트랙 선택
          </button>
          <button className="btn" onClick={() => g?.togglePause()}>
            {ui?.phase === 'paused' ? '▶ 재개 (P)' : '⏸ 일시정지 (P)'}
          </button>
          <button className="btn" onClick={toggleFullscreen}>
            전체 화면
          </button>
          <label className="flex items-center gap-1 text-[11px] text-metal-400">
            <input type="checkbox" className="accent-teal-500" checked={showTouch} onChange={(e) => setShowTouch(e.target.checked)} />
            터치 버튼
          </label>
          <span className="ml-auto text-[11px] text-metal-500">
            {car.name} · {getTrack(trackId).name}
          </span>
        </div>
        {audioNote && <Note tone="red">{audioNote}</Note>}
        <div
          ref={wrapRef}
          tabIndex={0}
          className={immersive ? 'fixed inset-0 z-[60] bg-black outline-none' : 'relative w-full overflow-hidden rounded-xl border border-ink-600 bg-black outline-none'}
          style={immersive ? { touchAction: 'none' } : { aspectRatio: '16 / 9', maxHeight: 'calc(100vh - 150px)' }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {immersive && (
            <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 gap-1.5">
              <button className="rounded-lg border border-white/25 bg-black/50 px-2.5 py-1 text-[11px] text-white/90" onClick={() => g?.togglePause()}>
                {ui?.phase === 'paused' ? '▶' : '⏸'} P
              </button>
              <button className="rounded-lg border border-white/25 bg-black/50 px-2.5 py-1 text-[11px] text-white/90" onClick={toggleFullscreen}>
                ✕ 축소
              </button>
            </div>
          )}
          {g && showTouch && ui?.phase !== 'finished' && ui?.phase !== 'paused' && <TouchControls game={g} />}
          {ui?.phase === 'paused' && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-sm">
              <div className="w-72 rounded-xl border border-ink-500 bg-ink-900/95 p-5 text-center">
                <div className="font-mono text-2xl font-bold text-white">PAUSED</div>
                <div className="mt-1 text-xs text-metal-500">P 또는 Esc로 재개</div>
                <div className="mt-4 flex flex-col gap-2">
                  <button className="btn btn-primary py-2" onClick={() => g?.togglePause()}>
                    재개
                  </button>
                  <button className="btn py-2" onClick={restart}>
                    처음부터
                  </button>
                  <button className="btn py-2" onClick={backToMenu}>
                    차량·트랙 선택
                  </button>
                </div>
              </div>
            </div>
          )}
          {ui?.phase === 'finished' && (
            <div className="absolute inset-0 grid place-items-center bg-black/45">
              <div className="w-80 rounded-xl border border-ink-500 bg-ink-900/95 p-5 text-center">
                <div className="font-mono text-xs tracking-[0.3em] text-rpm-400">FINISH</div>
                <div className="num mt-1 text-4xl font-bold text-white">{fmtTime(ui.timeMs)}</div>
                {ui.newBest && <div className="mt-1 text-sm font-bold text-yellow-300">NEW BEST!</div>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-metal-400">
                  <div>
                    최고 기록
                    <div className="num text-metal-200">{ui.bestMs !== null ? fmtTime(ui.bestMs) : '—'}</div>
                  </div>
                  <div>
                    최고 속도
                    <div className="num text-metal-200">{Math.round(ui.topKmh)} km/h</div>
                  </div>
                  <div>
                    부스트
                    <div className="num text-metal-200">{ui.boostsUsed}회</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <button className="btn btn-primary py-2" onClick={restart}>
                    다시 달리기
                  </button>
                  <button className="btn py-2" onClick={backToMenu}>
                    차량·트랙 선택
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="text-[10px] text-metal-600">
          엔진음은 V8 LAB DSP 합성(SIMULATED)이며 GS460은 현재 배기 설계를 사용합니다. 주행 물리와 기어비·공기저항은 게임용 근사입니다. 차량 그림은 실제 후면 디자인 특징을 참고한 일러스트입니다(사진 아님).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div>
          <div className="font-mono text-xl font-bold tracking-[0.25em] text-white">
            V8 LAB <span className="text-rpm-400">DRIVE</span>
          </div>
          <div className="text-xs text-metal-500">9대 · 3트랙 · 실시간 엔진음(V8 LAB DSP) · X 부스트</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
          {[
            ['W', '가속'],
            ['A / D', '조향'],
            ['S', '제동'],
            ['X', '부스트'],
            ['P', '일시정지'],
          ].map(([k, l]) => (
            <span key={k} className="rounded-md border border-ink-500 bg-ink-850 px-2 py-1 text-metal-300">
              <span className="font-mono font-bold text-white">{k}</span> {l}
            </span>
          ))}
        </div>
      </div>

      <section className="card p-3">
        <div className="card-h -mx-3 -mt-3 mb-3">차량 선택 — 후면 일러스트</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {CARS.map((c) => {
            const p = perf[c.id];
            const active = c.id === carId;
            const best = loadBest(trackId, c.id);
            return (
              <button
                key={c.id}
                onClick={() => setCarId(c.id)}
                data-testid={`car-${c.id}`}
                className={`rounded-lg border p-2 text-left transition ${active ? 'border-rpm-500 bg-rpm-500/10' : 'border-ink-600 bg-ink-850 hover:border-ink-500'}`}
              >
                <CarPreview car={c} />
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className={`truncate text-sm font-bold ${active ? 'text-rpm-400' : 'text-white'}`}>{c.short}</span>
                  <span className="shrink-0 text-[10px] text-metal-500">{c.drive} · {c.trans}</span>
                </div>
                <div className="truncate text-[10px] text-metal-500">
                  {c.years} · {c.engineLabel}
                </div>
                <div className="mt-1.5 space-y-1">
                  <Stat label="출력" value={`${c.powerPs} PS`} pct={(c.powerPs / 520) * 100} color="#f97316" />
                  <Stat label="0→100 (게임)" value={`${p.t100.toFixed(1)} s`} pct={((9 - p.t100) / 5) * 100} color="#22d3ee" />
                  <Stat label="최고속 (게임)" value={`${Math.round(p.topKmh)}`} pct={((p.topKmh - 180) / 150) * 100} color="#a78bfa" />
                  <Stat label="그립" value={c.grip.toFixed(2)} pct={((c.grip - 0.85) / 0.3) * 100} color="#4ade80" />
                </div>
                {best !== null && <div className="mt-1 text-[10px] text-yellow-300/80">이 트랙 최고 {fmtTime(best)}</div>}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-metal-500">
          <span className="text-metal-300">{car.name}</span> — {car.note}
        </div>
      </section>

      <section className="card p-3">
        <div className="card-h -mx-3 -mt-3 mb-3">트랙 선택</div>
        <div className="grid gap-2 md:grid-cols-3">
          {TRACK_IDS.map((id) => {
            const t = getTrack(id);
            const active = id === trackId;
            return (
              <button
                key={id}
                onClick={() => setTrackId(id)}
                data-testid={`track-${id}`}
                className={`rounded-lg border p-2 text-left transition ${active ? 'border-rpm-500 bg-rpm-500/10' : 'border-ink-600 bg-ink-850 hover:border-ink-500'}`}
              >
                <TrackPreview id={id} />
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`text-sm font-bold ${active ? 'text-rpm-400' : 'text-white'}`}>{t.name}</span>
                  <Tag tone={t.theme.night ? 'teal' : 'gray'}>{t.nameKo}</Tag>
                </div>
                <div className="text-[11px] text-metal-500">{t.desc}</div>
                <div className="num mt-1 text-[10px] text-metal-500">
                  {t.lengthKm.toFixed(1)} km{t.loop ? ` × ${t.laps}랩` : ''} · 노폭 {(t.halfWidthM * 2).toFixed(1)} m{t.descentM > 0 ? ` · 고도차 −${Math.round(t.descentM)} m` : ''}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-rpm px-6 py-3 text-base" onClick={launch} data-testid="drive-start">
          ▶ START — {car.short} @ {getTrack(trackId).name}
        </button>
        <span className="text-[11px] text-metal-500">
          부스트: 게이지 100%에서 X → 3.2초 · 급커브에서 과속하면 바깥으로 밀리며 미끄러짐 → S로 미리 감속 · 상단 경고판의 권장 속도 참고
        </span>
      </div>
      <p className="text-[10px] text-metal-600">
        차량 그림은 실제 차량의 후면 디자인 특징(램프 형태·머플러 배치·스포일러)을 참고한 일러스트이며 사진·로고를 사용하지 않았습니다. 출력·중량은 공개 제원, 기어비·공기저항·그립은 게임용 근사값입니다.
      </p>
    </div>
  );
}
