import { describe, expect, it } from 'vitest';
import { ENGINES } from '../src/data/engines';
import { GS460_PRESETS, STOCK_EXHAUSTS, validateExhaust, makePart, presetTiger5050 } from '../src/data/exhaust';
import { firingEvents } from '../src/dsp/compile';

describe('engine library', () => {
  it.each(ENGINES.map((e) => [e.code, e] as const))('%s: firing order, banks and intervals are consistent', (_, e) => {
    const order = e.firingOrder.value!;
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: e.cylinders }, (_, i) => i + 1));
    for (let c = 1; c <= e.cylinders; c++) expect(['L', 'R']).toContain(e.bankOf[c]);
    const { angles, banks } = firingEvents(e);
    expect(angles[0]).toBe(0);
    expect(angles[angles.length - 1]).toBeLessThan(720);
    expect(banks.filter((b) => b === 0)).toHaveLength(e.cylinders / 2);
  });

  it('cross-plane V8s fire the same bank twice in a row somewhere in the cycle (source of burble)', () => {
    for (const e of ENGINES.filter((x) => x.cylinders === 8 && x.crank.value === 'cross-plane')) {
      const { banks } = firingEvents(e);
      const repeats = banks.filter((b, i) => b === banks[(i + 1) % banks.length]).length;
      expect(repeats).toBeGreaterThan(0);
    }
  });

  it('unverified specs are left empty rather than invented', () => {
    for (const e of ENGINES) {
      expect(e.idleRpm.value).toBeNull();
      expect(e.idleRpm.confidence).toBe('unknown');
      expect(e.redlineRpm.value).toBeNull();
    }
  });

  it('even-firing V10 / V6 / inline-4 alternate banks (no double firing per bank)', () => {
    for (const id of ['s85', 'g6ba', 'g20t']) {
      const { banks } = firingEvents(ENGINES.find((e) => e.id === id)!);
      expect(banks.every((b, i) => b !== banks[(i + 1) % banks.length])).toBe(true);
    }
  });

  it('GS460 and M156 are implemented, others are flagged as pending data', () => {
    const ready = ENGINES.filter((e) => e.status === 'ready').map((e) => e.code);
    expect(ready).toEqual(['1UR-FSE', 'M156']);
  });
});

describe('exhaust library', () => {
  it('all presets and stock models are valid and keep the OEM catalyst', () => {
    for (const cfg of [...GS460_PRESETS.map((p) => p.make()), ...Object.values(STOCK_EXHAUSTS).map((m) => m())]) {
      expect(validateExhaust(cfg)).toEqual([]);
      expect(cfg.catalyst).toBe('oem');
      expect(cfg.basis).toBe('conceptual');
    }
  });

  it('TIGER 50:50 matches the brief: X-pipe, dual resonators, valved end mufflers, black tips', () => {
    const t = presetTiger5050();
    expect(t.name).toBe('TIGER 50:50');
    expect(t.crossover.type).toBe('x');
    for (const side of [t.left, t.right]) {
      expect(side.filter((p) => p.kind.startsWith('res-')).length).toBeGreaterThanOrEqual(1);
      expect(side[side.length - 1].kind).toBe('muffler-valved');
    }
    expect(t.tips.finish).toBe('black');
  });

  it('validation catches a missing muffler and out-of-range parameters', () => {
    const t = presetTiger5050();
    t.left = t.left.filter((p) => !p.kind.startsWith('muffler'));
    t.right[0] = makePart('pipe', { lengthMm: 99999 });
    const errs = validateExhaust(t);
    expect(errs.some((e) => e.includes('머플러가 없습니다'))).toBe(true);
    expect(errs.some((e) => e.includes('범위'))).toBe(true);
  });
});
