import { audioEngine } from '../audio/AudioEngine';
import { compileEngine, compileExhaust } from '../dsp/compile';
import { engineById } from '../data/engines';
import { stockExhaustFor } from '../data/exhaust';
import { useStore } from '../store';
import type { CarSpec } from './cars';

/**
 * Engine sound for the driving game: the car's engine through V8 LAB's own DSP core (voice A),
 * plus wind, tyre squeal, boost and impact sounds on the master bus. While the game owns the
 * audio, the lab's A/B sync is paused (store.audioOwner = 'drive').
 */
export class DriveAudio {
  private nodes: AudioNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private wind: GainNode | null = null;
  private tyre: GainNode | null = null;
  private tyreBp: BiquadFilterNode | null = null;
  private whistle: GainNode | null = null;
  private whistleOsc: OscillatorNode | null = null;
  private lastControl = 0;
  active = false;

  /** Call from a user gesture (START click) so the AudioContext may start. */
  async start(car: CarSpec) {
    await audioEngine.start();
    useStore.setState({ audioOwner: 'drive', audio: { on: true, mode: audioEngine.mode, error: audioEngine.lastError } });
    const def = engineById(car.engineId);
    const exhaust = car.exhaust.kind === 'project' ? useStore.getState().project.exhaust : stockExhaustFor(car.exhaust.id);
    const eng = compileEngine(def);
    // the car's own rev range (e.g. GS F revs higher than the IS F the engine entry describes)
    const engine = { ...eng, maxRpm: car.redline, idleRpm: car.idleRpm, key: `${eng.key}|${car.id}` };
    audioEngine.setHybrid(0, [null, null]);
    audioEngine.setVoice(0, engine, compileExhaust(exhaust));
    audioEngine.setVoice(1, null, null);
    audioEngine.setControl({
      rpm: car.idleRpm,
      throttle: 0,
      monitor: 0,
      normalize: false,
      listener: 0,
      valveMode: 2,
      agc: true,
      master: 1.1,
      slewUp: 40000,
      slewDown: 30000,
    });
    this.buildAux();
    this.active = true;
  }

  private buildAux() {
    const ctx = audioEngine.ctx;
    const out = audioEngine.output;
    if (!ctx || !out || this.noiseSrc) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const windHp = ctx.createBiquadFilter();
    windHp.type = 'highpass';
    windHp.frequency.value = 160;
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 900;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    src.connect(windHp).connect(windLp).connect(this.wind).connect(out);

    this.tyreBp = ctx.createBiquadFilter();
    this.tyreBp.type = 'bandpass';
    this.tyreBp.frequency.value = 1400;
    this.tyreBp.Q.value = 7;
    const tyreBp2 = ctx.createBiquadFilter();
    tyreBp2.type = 'peaking';
    tyreBp2.frequency.value = 2600;
    tyreBp2.Q.value = 6;
    tyreBp2.gain.value = 10;
    this.tyre = ctx.createGain();
    this.tyre.gain.value = 0;
    src.connect(this.tyreBp).connect(tyreBp2).connect(this.tyre).connect(out);

    this.whistleOsc = ctx.createOscillator();
    this.whistleOsc.type = 'sine';
    this.whistleOsc.frequency.value = 2400;
    this.whistle = ctx.createGain();
    this.whistle.gain.value = 0;
    this.whistleOsc.connect(this.whistle).connect(out);
    this.whistleOsc.start();
    src.start();
    this.noiseSrc = src;
    this.nodes = [windHp, windLp, this.wind, this.tyreBp, tyreBp2, this.tyre, this.whistle, this.whistleOsc];
  }

  update(s: { rpm: number; throttle: number; v: number; slip: number; spin: number; boost: boolean; paused: boolean }) {
    if (!this.active) return;
    const ctx = audioEngine.ctx;
    if (!ctx) return;
    const now = performance.now();
    if (now - this.lastControl > 12) {
      this.lastControl = now;
      audioEngine.setControl({ rpm: s.rpm, throttle: s.paused ? 0 : s.throttle });
    }
    const t = ctx.currentTime;
    const mute = s.paused ? 0 : 1;
    const speed = Math.min(1, s.v / 80);
    this.wind?.gain.setTargetAtTime(mute * speed * speed * 0.09, t, 0.08);
    const squeal = Math.min(1, Math.max(s.slip, s.spin * 0.8));
    this.tyre?.gain.setTargetAtTime(mute * (squeal > 0.08 ? 0.035 + squeal * 0.09 : 0), t, 0.05);
    this.tyreBp?.frequency.setTargetAtTime(1150 + squeal * 700 + Math.random() * 120, t, 0.05);
    this.whistle?.gain.setTargetAtTime(mute * (s.boost ? 0.012 : 0), t, 0.15);
    this.whistleOsc?.frequency.setTargetAtTime(2200 + speed * 1600, t, 0.2);
  }

  /** One-shot noise burst through a sweeping filter. */
  private burst(f0: number, f1: number, dur: number, gain: number, q = 1.2) {
    const ctx = audioEngine.ctx;
    const out = audioEngine.output;
    if (!ctx || !out) return;
    const len = Math.round(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
    const gn = ctx.createGain();
    gn.gain.value = gain;
    src.connect(bp).connect(gn).connect(out);
    src.start();
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      gn.disconnect();
    };
  }

  boost() {
    this.burst(300, 3200, 0.7, 0.5, 1.6);
  }

  impact(strength: number) {
    this.burst(900, 120, 0.25, Math.min(0.6, 0.15 + strength * 0.05), 0.8);
  }

  stop() {
    this.active = false;
    try {
      this.noiseSrc?.stop();
      this.whistleOsc?.stop();
    } catch {
      /* already stopped */
    }
    this.noiseSrc?.disconnect();
    this.nodes.forEach((n) => n.disconnect());
    this.nodes = [];
    this.noiseSrc = null;
    this.whistleOsc = null;
    audioEngine.setControl({ throttle: 0, slewUp: 6000, slewDown: 4200 });
    useStore.setState({ audioOwner: 'lab' });
  }
}
