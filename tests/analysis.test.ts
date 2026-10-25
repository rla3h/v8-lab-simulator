import { describe, expect, it } from 'vitest';
import { powerSpectrum, toDb } from '../src/analysis/fft';
import { boomLevel, pointFeatures, runAnalysis, similarity } from '../src/analysis/analyze';
import { engineById } from '../src/data/engines';
import { presetOemSilence, presetHighRpmRoar, presetTiger5050, stockExhaustFor } from '../src/data/exhaust';
import { deltaFir } from '../src/audio/hybrid';
import { compileExhaust } from '../src/dsp/compile';

describe('FFT & features', () => {
  it('a full-scale 1 kHz sine reads 0 dBFS at 1 kHz', () => {
    const sr = 24000;
    const x = new Float32Array(8192).map((_, i) => Math.sin((2 * Math.PI * 1000 * i) / sr));
    const ps = powerSpectrum(x, 0, 8192);
    let k = 0;
    for (let i = 1; i < ps.length; i++) if (ps[i] > ps[k]) k = i;
    expect(Math.abs((k * sr) / 8192 - 1000)).toBeLessThan(sr / 8192);
    expect(Math.abs(toDb(ps[k]))).toBeLessThan(1);
  });

  it('similarity of a signal with itself is 100', () => {
    const sr = 24000;
    const x = new Float32Array(16384).map((_, i) => Math.sin(i / 7) + 0.3 * Math.sin(i / 3));
    const f = pointFeatures(powerSpectrum(x, 0, 16384), sr, 3000);
    expect(similarity(f, f).total).toBeCloseTo(100, 5);
  });

  it('boom classification follows the documented thresholds', () => {
    expect(boomLevel(2, 5)).toBe('LOW');
    expect(boomLevel(5, 5)).toBe('MED');
    expect(boomLevel(7, 5)).toBe('HIGH');
    expect(boomLevel(2, 8)).toBe('MED');
    expect(boomLevel(7, 8)).toBe('HIGH');
  });
});

describe('hybrid delta EQ', () => {
  it('identical exhausts give an identity FIR', () => {
    const c = compileExhaust(presetTiger5050());
    const fir = deltaFir(c, c, 48000, 0.5, 512);
    const sum = fir.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 2);
    expect(fir[256]).toBeGreaterThan(0.95);
  });
});

describe('full analysis pipeline', () => {
  it('runs on real renders and ranks low-RPM boom risk sensibly', async () => {
    const gs = engineById('1ur-fse');
    const m156 = engineById('m156');
    const isf = engineById('2ur-gse');
    const common = {
      A: { engine: gs, exhaust: presetOemSilence(), label: 'OEM' },
      target: { engine: m156, exhaust: stockExhaustFor(m156.stockExhaustId), label: 'M156' },
      roarRef: { engine: isf, exhaust: stockExhaustFor(isf.stockExhaustId), label: 'IS F' },
      throttle: 0.7,
      valveMode: 2,
      toneBalance: 50,
    };
    const tiger = await runAnalysis({ ...common, B: { engine: gs, exhaust: presetTiger5050(), label: 'TIGER' } });
    const roar = await runAnalysis({ ...common, B: { engine: gs, exhaust: presetHighRpmRoar(), label: 'ROAR' } });
    expect(tiger.sweepA.rpm.length).toBeGreaterThan(50);
    expect(tiger.sweepA.orders[0]).toHaveLength(24);
    // HIGH RPM ROAR (straight-through, no boom-targeted resonators) must not look better than TIGER at low RPM
    expect(roar.boom.maxDelta).toBeGreaterThan(tiger.boom.maxDelta);
    expect(['LOW', 'MED', 'HIGH']).toContain(tiger.boom.level);
    expect(tiger.similarity.B.score).toBeGreaterThanOrEqual(0);
    expect(tiger.similarity.B.score).toBeLessThanOrEqual(100);
  }, 120000);
});
