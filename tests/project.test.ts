import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type Controls } from '../src/store';
import { parseProject, serializeProject } from '../src/lib/project';
import { encodeWav, parseWavHeader } from '../src/lib/wav';
import { makePart } from '../src/data/exhaust';
import { quoteText } from '../src/lib/quote';
import { LEGAL_ITEMS } from '../src/lib/legal';

const controls: Controls = {
  rpm: 2400,
  throttle: 0.35,
  valveMode: 'open',
  listener: 'interior',
  normalize: false,
  monitor: 'B',
  sourceA: 'oem',
  sourceB: 'design',
  master: 1,
  levelAssist: true,
  hybridBlend: 0,
};

describe('project save / load', () => {
  it('round-trips every saved field exactly', () => {
    const p = DEFAULT_PROJECT();
    p.name = '테스트 프로젝트';
    p.toneBalance = 65;
    p.exhaust.left.splice(1, 0, makePart('quarter-wave', { tuneHz: 133, depthDb: 9 }));
    p.exhaust.crossover.coupling = 0.42;
    p.snapshot = JSON.parse(JSON.stringify(p.exhaust));
    p.legal = { 'cat-keep': 'done', valve: 'na' };
    p.legalNotes = { valve: 'TS 문의 2026-10-25' };
    p.exterior.items.calipers = true;
    const file = serializeProject(p, controls, null, true);
    const { file: back, errors } = parseProject(JSON.stringify(file));
    expect(errors).toEqual([]);
    expect(back!.project).toEqual(p);
    expect(back!.controls).toMatchObject({ valveMode: 'open', listener: 'interior', normalize: false, rpm: 2400, throttle: 0.35 });
    expect(back!.modelVersion).toMatch(/v8lab-dsp/);
    expect(back!.provenance.audio).toBe('SIMULATED');
  });

  it('rejects foreign or corrupted files with readable errors', () => {
    expect(parseProject('not json').errors[0]).toContain('JSON');
    expect(parseProject('{"schema":"other"}').errors[0]).toContain('schema');
    const p = DEFAULT_PROJECT();
    const bad = serializeProject(p, controls, null, true);
    (bad.project as any).engineId = 'v12-mystery';
    bad.project.exhaust.right = bad.project.exhaust.right.filter((x) => !x.kind.startsWith('muffler'));
    const { file, errors } = parseProject(JSON.stringify(bad));
    expect(file).toBeNull();
    expect(errors.join(' ')).toContain('v12-mystery');
    expect(errors.join(' ')).toContain('머플러');
  });
});

describe('exports', () => {
  it('WAV encoder writes a valid PCM header and the SIMULATED comment', () => {
    const n = 1000;
    const L = new Float32Array(n).map((_, i) => Math.sin(i / 10));
    const wav = encodeWav([L, L], 44100, 'V8 LAB SIMULATED AUDIO test');
    const h = parseWavHeader(wav);
    expect(h).toMatchObject({ sr: 44100, channels: 2, bits: 16, frames: n });
    expect(h.comment).toContain('SIMULATED');
  });

  it('quote request carries the hard constraints and flags dimensions as conceptual', () => {
    const q = quoteText(DEFAULT_PROJECT());
    expect(q).toContain('순정 촉매');
    expect(q).toContain('X파이프');
    expect(q).toContain('가변밸브');
    expect(q).toContain('개념 파라미터');
    expect(q).toContain('무광 블랙');
  });

  it('legal pre-check never claims approval and tracks the matte-black exterior', () => {
    const p = DEFAULT_PROJECT();
    const texts = LEGAL_ITEMS.map((i) => i.auto(p).text).join(' ');
    expect(texts).not.toMatch(/승인 가능|적법함|합법입니다/);
    expect(LEGAL_ITEMS.find((i) => i.id === 'exterior-color')!.auto(p).status).toBe('verify');
    expect(LEGAL_ITEMS.find((i) => i.id === 'noise-standard')!.auto(p).status).toBe('verify');
  });
});
