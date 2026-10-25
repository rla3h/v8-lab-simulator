import { V8Core, type CoreChain, type CoreControl, type CoreEngine, type CoreTelemetry } from '../dsp/core';

const PROCESSOR = 'v8lab-core';

/** Worklet module text: the very same V8Core class, stringified. */
function workletSource(): string {
  return `const Core = (${V8Core.toString()});
class V8Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.core = new Core(sampleRate);
    this.n = 0;
    this.port.onmessage = (e) => this.core.handle(e.data);
  }
  process(_inputs, outputs) {
    const o = outputs[0];
    const L = o[0];
    if (!L) return true;
    this.core.render(L, o[1] || L, o[2] || null, o[3] || null, L.length);
    if ((++this.n & 15) === 0) this.port.postMessage(this.core.telemetry());
    return true;
  }
}
registerProcessor('${PROCESSOR}', V8Processor);`;
}

export type AudioMode = 'worklet' | 'script';

export interface HybridPath {
  buffer: AudioBuffer;
  recordedRpm: number;
  /** Linear-phase FIR applying (target exhaust / recorded exhaust); null = as recorded. */
  fir: Float32Array | null;
}

type Listener = (t: CoreTelemetry) => void;

export class AudioEngine {
  ctx: AudioContext | null = null;
  mode: AudioMode | null = null;
  analyserMain: AnalyserNode | null = null;
  analyserA: AnalyserNode | null = null;
  analyserB: AnalyserNode | null = null;
  lastError: string | null = null;
  telemetry: CoreTelemetry | null = null;

  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private core: V8Core | null = null; // ScriptProcessor fallback only
  private synthGain: GainNode | null = null;
  private master: GainNode | null = null;
  private listeners = new Set<Listener>();
  private voices: ({ engine: CoreEngine; chain: CoreChain } | null)[] = [null, null];
  private control: CoreControl = {};
  private hybrid: {
    blend: number;
    paths: (HybridPath | null)[];
    nodes: ({ src: AudioBufferSourceNode; gain: GainNode; conv: ConvolverNode | null } | null)[];
  } = { blend: 0, paths: [null, null], nodes: [null, null] };

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  async start(forceMode?: AudioMode): Promise<AudioMode> {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return this.mode!;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // resume() inside the same gesture; awaiting addModule first can lose the gesture
    const resumed = ctx.resume();

    const splitter = ctx.createChannelSplitter(4);
    const merger = ctx.createChannelMerger(2);
    this.synthGain = ctx.createGain();
    this.master = ctx.createGain();
    this.analyserMain = ctx.createAnalyser();
    this.analyserA = ctx.createAnalyser();
    this.analyserB = ctx.createAnalyser();
    for (const a of [this.analyserMain, this.analyserA, this.analyserB]) {
      a.fftSize = 8192;
      a.smoothingTimeConstant = 0.6;
      // analyse channel 0 (LH-tip side) only — see V8Core.render taps
      a.channelCount = 1;
      a.channelCountMode = 'explicit';
      a.channelInterpretation = 'discrete';
    }
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    splitter.connect(this.analyserA, 2);
    splitter.connect(this.analyserB, 3);
    merger.connect(this.synthGain);
    this.synthGain.connect(this.master);
    this.master.connect(ctx.destination);
    this.master.connect(this.analyserMain);

    let mode: AudioMode = forceMode ?? 'worklet';
    if (mode === 'worklet') {
      try {
        if (!ctx.audioWorklet) throw new Error('AudioWorklet unsupported');
        const url = URL.createObjectURL(new Blob([workletSource()], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, PROCESSOR, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [4],
        });
        node.port.onmessage = (e) => this.emit(e.data as CoreTelemetry);
        node.connect(splitter);
        this.node = node;
      } catch (err) {
        this.lastError = `AudioWorklet 사용 불가 → ScriptProcessor 폴백: ${(err as Error).message}`;
        console.warn(this.lastError);
        mode = 'script';
      }
    }
    if (mode === 'script') {
      const core = new V8Core(ctx.sampleRate);
      this.core = core;
      let sp: ScriptProcessorNode;
      try {
        sp = ctx.createScriptProcessor(2048, 0, 4);
      } catch {
        sp = ctx.createScriptProcessor(2048, 1, 4);
      }
      let n = 0;
      sp.onaudioprocess = (e) => {
        const ob = e.outputBuffer;
        const L = ob.getChannelData(0);
        core.render(L, ob.getChannelData(1), ob.getChannelData(2), ob.getChannelData(3), L.length);
        if ((++n & 1) === 0) this.emit(core.telemetry());
      };
      sp.connect(splitter);
      this.node = sp;
    }
    this.mode = mode;
    await resumed;
    // replay state that was set before audio started
    this.post({ type: 'control', control: this.control });
    this.voices.forEach((v, slot) => v && this.post({ type: 'voice', slot, engine: v.engine, chain: v.chain }));
    this.applyHybrid();
    return mode;
  }

  async suspend() {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  private post(msg: unknown) {
    if (this.node instanceof AudioWorkletNode) this.node.port.postMessage(msg);
    else if (this.core) this.core.handle(msg);
  }

  private emit(t: CoreTelemetry) {
    this.telemetry = t;
    this.updateHybridRate(t.rpm);
    this.listeners.forEach((l) => l(t));
  }

  onTelemetry(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setVoice(slot: 0 | 1, engine: CoreEngine | null, chain: CoreChain | null) {
    this.voices[slot] = engine && chain ? { engine, chain } : null;
    this.post({ type: 'voice', slot, engine, chain });
  }

  setControl(c: CoreControl) {
    this.control = { ...this.control, ...c };
    this.post({ type: 'control', control: c });
    if (c.monitor !== undefined || c.master !== undefined) this.applyHybridGains();
  }

  // ───────────── hybrid (recording) playback ─────────────

  setHybrid(blend: number, paths: (HybridPath | null)[]) {
    const changed = paths.some((p, i) => p !== this.hybrid.paths[i]);
    this.hybrid.blend = blend;
    if (changed) this.hybrid.paths = paths;
    if (changed) this.applyHybrid();
    else this.applyHybridGains();
  }

  private applyHybrid() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.hybrid.nodes.forEach((n) => {
      if (n) {
        try {
          n.src.stop();
        } catch {
          /* already stopped */
        }
        n.src.disconnect();
        n.gain.disconnect();
        n.conv?.disconnect();
      }
    });
    this.hybrid.nodes = this.hybrid.paths.map((p) => {
      if (!p) return null;
      const src = ctx.createBufferSource();
      src.buffer = p.buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      let conv: ConvolverNode | null = null;
      if (p.fir) {
        conv = ctx.createConvolver();
        conv.normalize = false;
        const ir = ctx.createBuffer(1, p.fir.length, ctx.sampleRate);
        ir.copyToChannel(p.fir, 0);
        conv.buffer = ir;
        src.connect(conv);
        conv.connect(gain);
      } else src.connect(gain);
      gain.connect(this.master!);
      src.start();
      return { src, gain, conv };
    });
    this.applyHybridGains();
  }

  private applyHybridGains() {
    const ctx = this.ctx;
    if (!ctx || !this.synthGain) return;
    const t = ctx.currentTime;
    const mon = this.control.monitor ?? 0;
    const master = this.control.master ?? 0.8;
    const anyRec = this.hybrid.nodes.some(Boolean);
    const blend = anyRec ? this.hybrid.blend : 0;
    // synthesis is scaled by (1 - blend) only for voices that actually have a recording
    const recAudible = (mon < 0.5 ? this.hybrid.nodes[0] : this.hybrid.nodes[1]) != null;
    this.synthGain.gain.setTargetAtTime(recAudible ? 1 - blend : 1, t, 0.03);
    this.hybrid.nodes.forEach((n, i) => {
      if (!n) return;
      const on = (i === 0 ? 1 - mon : mon) * blend * master;
      n.gain.gain.setTargetAtTime(on, t, 0.03);
    });
  }

  private updateHybridRate(rpm: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.hybrid.nodes.forEach((n, i) => {
      const p = this.hybrid.paths[i];
      if (!n || !p) return;
      const rate = Math.min(4, Math.max(0.25, rpm / p.recordedRpm));
      n.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.05);
    });
  }

  async decode(file: File | ArrayBuffer): Promise<AudioBuffer> {
    const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const ctx = this.ctx ?? new OfflineAudioContext(1, 1, 48000);
    return await ctx.decodeAudioData(data.slice(0));
  }
}

export const audioEngine = new AudioEngine();
