import type { ExhaustConfig, Part, PartKind } from '../types';

export interface ParamDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  def: number;
}

export interface PartSpec {
  kind: PartKind;
  label: string;
  short: string;
  isMuffler: boolean;
  desc: string;
  /** What the acoustic model actually does with it — shown to the user. */
  model: string;
  params: ParamDef[];
}

export const PART_SPECS: Record<PartKind, PartSpec> = {
  pipe: {
    kind: 'pipe',
    label: '배기관',
    short: 'PIPE',
    isMuffler: false,
    desc: '직관 구간. 길이·내경 변경.',
    model: '길이 → 전파 지연 + 관 공명(c/2L) 주파수, 내경 → 출력 레벨·공명 Q (단순화 모델)',
    params: [
      { key: 'lengthMm', label: '길이', unit: 'mm', min: 100, max: 2500, step: 10, def: 800 },
      { key: 'diameterMm', label: '내경', unit: 'mm', min: 45, max: 80, step: 0.5, def: 60 },
    ],
  },
  'res-helmholtz': {
    kind: 'res-helmholtz',
    label: '헬름홀츠 레조네이터',
    short: 'HELM',
    isMuffler: false,
    desc: '특정 주파수(부밍 대역)를 좁게 감쇠.',
    model: '튜닝 주파수의 피킹 컷(감쇠량·Q)',
    params: [
      { key: 'tuneHz', label: '튜닝 주파수', unit: 'Hz', min: 30, max: 250, step: 1, def: 70 },
      { key: 'depthDb', label: '감쇠량', unit: 'dB', min: 0, max: 18, step: 0.5, def: 8 },
      { key: 'q', label: 'Q (대역폭)', unit: '', min: 0.5, max: 6, step: 0.1, def: 1.4 },
    ],
  },
  'res-absorptive': {
    kind: 'res-absorptive',
    label: '흡음형 레조네이터',
    short: 'ABS',
    isMuffler: false,
    desc: '고역 거친 소리(rasp)를 넓게 완화.',
    model: '코너 주파수 이상 하이셸프 컷',
    params: [
      { key: 'cornerHz', label: '코너 주파수', unit: 'Hz', min: 400, max: 3000, step: 10, def: 900 },
      { key: 'cutDb', label: '고역 감쇠', unit: 'dB', min: 0, max: 12, step: 0.5, def: 5 },
    ],
  },
  'quarter-wave': {
    kind: 'quarter-wave',
    label: '1/4파장 공진 억제관',
    short: 'λ/4',
    isMuffler: false,
    desc: '사이드 브랜치 튜브로 기본파+3배파 감쇠.',
    model: 'f, 3f 두 지점 노치형 컷',
    params: [
      { key: 'tuneHz', label: '기본 주파수', unit: 'Hz', min: 40, max: 300, step: 1, def: 110 },
      { key: 'depthDb', label: '감쇠량', unit: 'dB', min: 0, max: 15, step: 0.5, def: 7 },
    ],
  },
  'muffler-chambered': {
    kind: 'muffler-chambered',
    label: '챔버형 머플러',
    short: 'CHMB',
    isMuffler: true,
    desc: '반사형. 강한 감쇠, 저역 위주 통과.',
    model: '광대역 감쇠 + 2차 로우패스',
    params: [
      { key: 'attenDb', label: '감쇠량', unit: 'dB', min: 6, max: 26, step: 0.5, def: 18 },
      { key: 'lowpassHz', label: '로우패스', unit: 'Hz', min: 200, max: 1200, step: 10, def: 380 },
    ],
  },
  'muffler-straight': {
    kind: 'muffler-straight',
    label: '스트레이트 머플러',
    short: 'STRT',
    isMuffler: true,
    desc: '흡음형 직관. 낮은 감쇠, 고역 유지.',
    model: '약한 광대역 감쇠 + 고역 셸프 컷',
    params: [
      { key: 'attenDb', label: '감쇠량', unit: 'dB', min: 2, max: 12, step: 0.5, def: 6 },
      { key: 'hfCutDb', label: '고역 감쇠', unit: 'dB', min: 0, max: 10, step: 0.5, def: 4 },
    ],
  },
  'muffler-valved': {
    kind: 'muffler-valved',
    label: '가변밸브 엔드 머플러',
    short: 'VALV',
    isMuffler: true,
    desc: '밸브 닫힘=챔버 경로, 열림=바이패스 경로.',
    model: '닫힘/열림 두 경로를 밸브 개도(0–1)로 크로스페이드',
    params: [
      { key: 'closedAttenDb', label: '닫힘 감쇠', unit: 'dB', min: 8, max: 26, step: 0.5, def: 18 },
      { key: 'closedLowpassHz', label: '닫힘 로우패스', unit: 'Hz', min: 200, max: 1000, step: 10, def: 380 },
      { key: 'openAttenDb', label: '열림 감쇠', unit: 'dB', min: 2, max: 12, step: 0.5, def: 6 },
      { key: 'openHfCutDb', label: '열림 고역 감쇠', unit: 'dB', min: 0, max: 10, step: 0.5, def: 3 },
    ],
  },
};

export const PART_ORDER: PartKind[] = [
  'pipe',
  'res-helmholtz',
  'res-absorptive',
  'quarter-wave',
  'muffler-chambered',
  'muffler-straight',
  'muffler-valved',
];

let uidCounter = 0;
export const newUid = (kind: string) => `${kind}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

export function makePart(kind: PartKind, overrides: Record<string, number> = {}): Part {
  const params: Record<string, number> = {};
  for (const p of PART_SPECS[kind].params) params[p.key] = p.def;
  return { uid: newUid(kind), kind, params: { ...params, ...overrides } };
}

export const CROSSOVER_INFO = {
  none: { label: '없음 (독립 듀얼)', model: '좌우 뱅크 완전 분리 → 뱅크별 불균등 점화 간격이 그대로 남음 (버블/럼블 강함)' },
  h: { label: 'H파이프', model: '좌우 저역만 교환(교환 경로 250 Hz 로우패스) → 저역 압력 균형' },
  x: { label: 'X파이프', model: '광대역 교환(교환 경로 4 kHz 로우패스) → 각 출구 펄스열이 균등해져 매끈하고 날카로워짐' },
} as const;

const DEFAULT_VALVE = { autoOpenRpm: 3000, autoCloseRpm: 2700, autoThrottle: 0.6 };

function sym(parts: () => Part[]): { left: Part[]; right: Part[] } {
  return { left: parts(), right: parts() };
}

// ───────────────────────── GS460 presets ─────────────────────────

export function presetOemSilence(): ExhaustConfig {
  return {
    id: 'gs460-oem',
    name: 'OEM SILENCE',
    basis: 'conceptual',
    catalyst: 'oem',
    frontPipe: { lengthMm: 1100, diameterMm: 57 },
    crossover: { type: 'none', coupling: 0, diameterMm: 57 },
    ...sym(() => [
      makePart('pipe', { lengthMm: 600, diameterMm: 57 }),
      makePart('res-absorptive', { cornerHz: 900, cutDb: 6 }),
      makePart('res-helmholtz', { tuneHz: 90, depthDb: 8, q: 1.2 }),
      makePart('pipe', { lengthMm: 900, diameterMm: 57 }),
      makePart('muffler-chambered', { attenDb: 22, lowpassHz: 320 }),
    ]),
    tips: { finish: 'chrome', diameterMm: 76 },
    valve: { ...DEFAULT_VALVE },
    notes: '순정 구조를 단순화한 개념 모델. 실제 GS460 순정 배기 구조(크로스오버 유무, 레조네이터 위치·용적)는 실측/정비지침서 확인 전 가정입니다.',
  };
}

export function presetDeepV8(): ExhaustConfig {
  return {
    id: 'gs460-deep-v8',
    name: 'DEEP V8',
    basis: 'conceptual',
    catalyst: 'oem',
    frontPipe: { lengthMm: 1100, diameterMm: 63.5 },
    crossover: { type: 'h', coupling: 0.6, diameterMm: 57 },
    ...sym(() => [
      makePart('pipe', { lengthMm: 600, diameterMm: 63.5 }),
      makePart('res-helmholtz', { tuneHz: 65, depthDb: 9, q: 1.3 }),
      makePart('pipe', { lengthMm: 900, diameterMm: 63.5 }),
      makePart('muffler-chambered', { attenDb: 14, lowpassHz: 520 }),
    ]),
    tips: { finish: 'black', diameterMm: 89 },
    valve: { ...DEFAULT_VALVE },
    notes: '묵직한 저음과 정숙성 강조. H파이프 + 부밍 대역 헬름홀츠 + 저감쇠 챔버 머플러.',
  };
}

export function presetTiger5050(): ExhaustConfig {
  return {
    id: 'gs460-tiger-5050',
    name: 'TIGER 50:50',
    basis: 'conceptual',
    catalyst: 'oem',
    frontPipe: { lengthMm: 1100, diameterMm: 63.5 },
    crossover: { type: 'x', coupling: 0.3, diameterMm: 63.5 },
    ...sym(() => [
      makePart('pipe', { lengthMm: 500, diameterMm: 63.5 }),
      makePart('res-helmholtz', { tuneHz: 62, depthDb: 10, q: 1.2 }),
      makePart('res-absorptive', { cornerHz: 1400, cutDb: 3 }),
      makePart('pipe', { lengthMm: 800, diameterMm: 63.5 }),
      makePart('quarter-wave', { tuneHz: 120, depthDb: 6 }),
      makePart('muffler-valved', { closedAttenDb: 20, closedLowpassHz: 420, openAttenDb: 5, openHfCutDb: 2 }),
    ]),
    tips: { finish: 'black', diameterMm: 89 },
    valve: { ...DEFAULT_VALVE },
    notes:
      '순정 촉매 유지 · 듀얼 · 저결합(30%) X파이프 · 듀얼 레조네이터(헬름홀츠 62 Hz + 흡음형) · λ/4 억제관 · 가변 엔드 머플러(AUTO: 3,000 rpm 또는 스로틀 60% 이상에서 열림, 닫힘 감쇠 20 dB) · 블랙 팁. 모델 분석상 X 결합도를 높일수록 M156식 뱅크 반차수 럼블이 줄어 결합도를 30%로 낮췄고, 1,500–2,500 rpm 실내 저역은 밸브 닫힘 감쇠로 억제. (모델 간 비교 결과이며 실측 검증 전)',
  };
}

export function presetHighRpmRoar(): ExhaustConfig {
  return {
    id: 'gs460-high-rpm-roar',
    name: 'HIGH RPM ROAR',
    basis: 'conceptual',
    catalyst: 'oem',
    frontPipe: { lengthMm: 1100, diameterMm: 70 },
    crossover: { type: 'x', coupling: 0.9, diameterMm: 70 },
    ...sym(() => [
      makePart('pipe', { lengthMm: 500, diameterMm: 70 }),
      makePart('res-absorptive', { cornerHz: 1800, cutDb: 2 }),
      makePart('pipe', { lengthMm: 900, diameterMm: 70 }),
      makePart('res-helmholtz', { tuneHz: 70, depthDb: 6, q: 1.5 }),
      makePart('muffler-straight', { attenDb: 5, hfCutDb: 1 }),
    ]),
    tips: { finish: 'black', diameterMm: 89 },
    valve: { ...DEFAULT_VALVE },
    notes: '고회전 선명도 강조. 강결합 X파이프 + 스트레이트 머플러. 저RPM 부밍 위험이 상대적으로 높음.',
  };
}

export const GS460_PRESETS: { id: string; make: () => ExhaustConfig; blurb: string }[] = [
  { id: 'gs460-oem', make: presetOemSilence, blurb: '순정 GS460 기준 (개념 모델)' },
  { id: 'gs460-deep-v8', make: presetDeepV8, blurb: '묵직한 저음 + 정숙성' },
  { id: 'gs460-tiger-5050', make: presetTiger5050, blurb: 'AMG풍 저음 50 : NA 포효 50' },
  { id: 'gs460-high-rpm-roar', make: presetHighRpmRoar, blurb: '고회전 선명·날카로움' },
];

// ───────────────────────── Stock exhausts of reference engines ─────────────────────────
// All of these are assumptions — the real OEM layouts have not been measured.

function stock(id: string, name: string, parts: () => Part[], notes: string, tips: ExhaustConfig['tips']['finish'] = 'chrome'): ExhaustConfig {
  return {
    id,
    name,
    basis: 'conceptual',
    catalyst: 'oem',
    frontPipe: { lengthMm: 1100, diameterMm: 63.5 },
    crossover: { type: 'none', coupling: 0, diameterMm: 63.5 },
    ...sym(parts),
    tips: { finish: tips, diameterMm: 89 },
    valve: { ...DEFAULT_VALVE },
    notes,
  };
}

export const STOCK_EXHAUSTS: Record<string, () => ExhaustConfig> = {
  'gs460-oem': presetOemSilence,
  'm156-c219-stock': () =>
    stock(
      'm156-c219-stock',
      'CLS63 AMG (C219) 순정 — 가정 모델',
      () => [
        makePart('pipe', { lengthMm: 700, diameterMm: 63.5 }),
        makePart('res-absorptive', { cornerHz: 1100, cutDb: 4 }),
        makePart('pipe', { lengthMm: 900, diameterMm: 63.5 }),
        makePart('muffler-straight', { attenDb: 9, hfCutDb: 4 }),
      ],
      'C219 순정 배기 구조는 확인되지 않았습니다. 독립 듀얼 + 저감쇠 흡음형 머플러로 가정한 레퍼런스 모델입니다.',
    ),
  'm157-c218-stock': () =>
    stock(
      'm157-c218-stock',
      'CLS63 AMG (C218) 순정 — 가정 모델',
      () => [
        makePart('pipe', { lengthMm: 700, diameterMm: 63.5 }),
        makePart('res-absorptive', { cornerHz: 1000, cutDb: 4 }),
        makePart('pipe', { lengthMm: 900, diameterMm: 63.5 }),
        makePart('muffler-valved', { closedAttenDb: 16, closedLowpassHz: 420, openAttenDb: 7, openHfCutDb: 3 }),
      ],
      'C218 순정 배기 구조 미확인 — 가정 모델.',
    ),
  '2ur-isf-stock': () =>
    stock(
      '2ur-isf-stock',
      'IS F 순정 — 가정 모델',
      () => [
        makePart('pipe', { lengthMm: 700, diameterMm: 60 }),
        makePart('res-helmholtz', { tuneHz: 80, depthDb: 6, q: 1.3 }),
        makePart('pipe', { lengthMm: 900, diameterMm: 60 }),
        makePart('muffler-chambered', { attenDb: 14, lowpassHz: 600 }),
      ],
      'IS F 순정 배기 구조 미확인 — 가정 모델.',
    ),
  'lt4-ct5vbw-stock': () =>
    stock(
      'lt4-ct5vbw-stock',
      'CT5-V Blackwing 순정 — 가정 모델',
      () => [
        makePart('pipe', { lengthMm: 700, diameterMm: 70 }),
        makePart('res-absorptive', { cornerHz: 1000, cutDb: 3 }),
        makePart('pipe', { lengthMm: 900, diameterMm: 70 }),
        makePart('muffler-valved', { closedAttenDb: 15, closedLowpassHz: 450, openAttenDb: 5, openHfCutDb: 2 }),
      ],
      'CT5-V Blackwing 순정 배기 구조 미확인 — 가정 모델.',
    ),
};

export function stockExhaustFor(stockId: string): ExhaustConfig {
  const make = STOCK_EXHAUSTS[stockId];
  if (!make) throw new Error(`Unknown stock exhaust: ${stockId}`);
  return make();
}

/** Validation used by the builder and by project import. Returns human-readable problems. */
export function validateExhaust(cfg: ExhaustConfig): string[] {
  const problems: string[] = [];
  for (const side of ['left', 'right'] as const) {
    const mufflers = cfg[side].filter((p) => PART_SPECS[p.kind]?.isMuffler);
    const name = side === 'left' ? '좌측(LH)' : '우측(RH)';
    if (mufflers.length === 0) problems.push(`${name} 라인에 머플러가 없습니다.`);
    if (mufflers.length > 1) problems.push(`${name} 라인에 머플러가 ${mufflers.length}개입니다 (1개만 허용).`);
    for (const p of cfg[side]) {
      const spec = PART_SPECS[p.kind];
      if (!spec) {
        problems.push(`알 수 없는 부품 종류: ${p.kind}`);
        continue;
      }
      for (const d of spec.params) {
        const v = p.params[d.key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < d.min || v > d.max)
          problems.push(`${name} ${spec.label}의 ${d.label} 값이 범위(${d.min}–${d.max}${d.unit})를 벗어났습니다.`);
      }
    }
  }
  if (cfg.catalyst !== 'oem') problems.push('순정 촉매 유지 조건 위반.');
  return problems;
}
