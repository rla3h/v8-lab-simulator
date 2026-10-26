import { useEffect } from 'react';
import { audioEngine, type HybridPath } from '../audio/AudioEngine';
import { deltaFir, recordingBuffers, recordingFor } from '../audio/hybrid';
import { compileEngine, compileExhaust, listenerCode, valveModeCode } from '../dsp/compile';
import { stockExhaustFor } from '../data/exhaust';
import { resolveSource, useStore, type State } from '../store';

/** Pushes store state to the audio engine; pulls telemetry back at ~20 Hz. */
export function useAudioSync() {
  useEffect(() => {
    const voiceKeys = ['', ''];
    let controlKey = '';
    let hybridKey = '';
    const hybridPaths: (HybridPath | null)[] = [null, null];

    let owner: State['audioOwner'] = 'lab';
    const sync = (s: State) => {
      if (s.audioOwner === 'drive') {
        owner = 'drive';
        return;
      }
      if (owner === 'drive') {
        // the game changed voices/controls: push everything again
        owner = 'lab';
        voiceKeys[0] = voiceKeys[1] = '';
        controlKey = '';
        hybridKey = '';
        audioEngine.setControl({ slewUp: 6000, slewDown: 4200 });
      }
      const p = s.project;
      const c = s.controls;
      ([0, 1] as const).forEach((slot) => {
        const src = resolveSource(slot === 0 ? c.sourceA : c.sourceB, p);
        const key = JSON.stringify([src.engine.id, src.exhaust]);
        if (key !== voiceKeys[slot]) {
          voiceKeys[slot] = key;
          audioEngine.setVoice(slot, compileEngine(src.engine), compileExhaust(src.exhaust));
        }
      });
      const control = {
        rpm: c.rpm,
        throttle: c.throttle,
        valveMode: valveModeCode(c.valveMode),
        monitor: c.monitor === 'B' ? 1 : 0,
        normalize: c.normalize,
        listener: listenerCode(c.listener),
        master: c.master,
        agc: c.levelAssist,
      };
      const ck = JSON.stringify(control);
      if (ck !== controlKey) {
        controlKey = ck;
        audioEngine.setControl(control);
      }

      // hybrid: a recording of the voice's engine (if the user supplied one with rights confirmed)
      const hk = JSON.stringify([voiceKeys, p.recordings, c.listener, c.hybridBlend, s.audio.on, recordingBuffers.size]);
      if (hk !== hybridKey && audioEngine.ctx) {
        hybridKey = hk;
        ([0, 1] as const).forEach((slot) => {
          const src = resolveSource(slot === 0 ? c.sourceA : c.sourceB, p);
          const rec = recordingFor(p.recordings, src.engine.id, c.listener);
          if (!rec) {
            hybridPaths[slot] = null;
            return;
          }
          const buffer = recordingBuffers.get(rec.id)!;
          let fir: Float32Array | null = null;
          if (rec.exhaust === 'oem') {
            const stock = compileExhaust(stockExhaustFor(src.engine.stockExhaustId));
            const target = compileExhaust(src.exhaust);
            if (JSON.stringify(stock) !== JSON.stringify(target)) fir = deltaFir(target, stock, audioEngine.ctx!.sampleRate, 0.5);
          }
          const prev = hybridPaths[slot];
          if (prev && prev.buffer === buffer && JSON.stringify(prev.fir ? Array.from(prev.fir.slice(0, 8)) : null) === JSON.stringify(fir ? Array.from(fir.slice(0, 8)) : null) && prev.recordedRpm === rec.recordedRpm) return;
          hybridPaths[slot] = { buffer, recordedRpm: rec.recordedRpm, fir };
        });
        audioEngine.setHybrid(c.hybridBlend, [...hybridPaths]);
      } else if (audioEngine.ctx) audioEngine.setHybrid(c.hybridBlend, [...hybridPaths]);
    };

    sync(useStore.getState());
    const unsub = useStore.subscribe(sync);
    let last = 0;
    const unT = audioEngine.onTelemetry((t) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      useStore.setState({ telemetry: t });
    });
    return () => {
      unsub();
      unT();
    };
  }, []);
}
