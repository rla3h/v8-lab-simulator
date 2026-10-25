import type { ExhaustConfig } from '../types';
import type { ProjectData } from '../store';
import { PART_SPECS, stockExhaustFor, CROSSOVER_INFO } from '../data/exhaust';
import { engineById } from '../data/engines';

export type AutoStatus = 'ok' | 'info' | 'verify';

export interface LegalItem {
  id: string;
  category: string;
  title: string;
  detail: string;
  auto: (p: ProjectData) => { status: AutoStatus; text: string };
}

export function describeLine(cfg: ExhaustConfig, side: 'left' | 'right'): string {
  return cfg[side]
    .map((p) => {
      const s = PART_SPECS[p.kind];
      if (p.kind === 'pipe') return `관 ${p.params.lengthMm}mm Ø${p.params.diameterMm}`;
      return s.label;
    })
    .join(' → ');
}

export function mufflerOf(cfg: ExhaustConfig, side: 'left' | 'right') {
  return cfg[side].find((p) => PART_SPECS[p.kind].isMuffler) ?? null;
}

const stockOf = (p: ProjectData) => stockExhaustFor(engineById(p.engineId).stockExhaustId);

export const LEGAL_DISCLAIMER =
  '이 체크리스트는 구조변경(튜닝) 신청 준비를 돕는 사전 검토 도구이며, 법적 승인 가능 여부를 판정하지 않습니다. 기준·서식·절차는 개정될 수 있으므로 최신 법령과 한국교통안전공단(TS) 등 공식 기관 안내로 확인해야 합니다. "확인 필요" 항목은 V8 LAB이 검증하지 않은 사항입니다.';

export const LEGAL_ITEMS: LegalItem[] = [
  {
    id: 'cat-keep',
    category: '배출가스',
    title: '순정 촉매 유지',
    detail: '촉매 위치·형식·용량을 순정 그대로 유지하는지 시공 단계에서 확인.',
    auto: (p) =>
      p.exhaust.catalyst === 'oem'
        ? { status: 'ok', text: '설계상 순정 촉매 유지 (V8 LAB에서 촉매 변경 불가). 시공 시 위치·형식 불변 확인 필요.' }
        : { status: 'verify', text: '촉매 변경 감지 — 배출가스 관련 검토 필요.' },
  },
  {
    id: 'emission-devices',
    category: '배출가스',
    title: '배출가스 저감장치 변경 여부',
    detail: '촉매, 산소센서, 기타 배출가스 관련 부품의 제거·이설 여부.',
    auto: () => ({ status: 'verify', text: '설계 범위에서 변경 없음. 산소센서 위치·배선 변경이 없는지 시공업체 확인 필요.' }),
  },
  {
    id: 'layout',
    category: '배기 구조',
    title: '배기 유로 구조',
    detail: '튜닝 전·후 유로(크로스오버, 레조네이터, 머플러, 출구) 비교.',
    auto: (p) => ({
      status: 'info',
      text: `크로스오버: ${CROSSOVER_INFO[p.exhaust.crossover.type].label} / LH: ${describeLine(p.exhaust, 'left')} / RH: ${describeLine(p.exhaust, 'right')}`,
    }),
  },
  {
    id: 'muffler-change',
    category: '배기 구조',
    title: '소음기(머플러) 변경',
    detail: '순정 대비 소음기 형식 변경 시 튜닝 승인 대상 여부 확인.',
    auto: (p) => {
      const a = mufflerOf(stockOf(p), 'left');
      const b = mufflerOf(p.exhaust, 'left');
      const changed = !a || !b || a.kind !== b.kind || JSON.stringify(a.params) !== JSON.stringify(b.params);
      return changed
        ? { status: 'verify', text: `순정(${a ? PART_SPECS[a.kind].label : '-'}) → 설계(${b ? PART_SPECS[b.kind].label : '-'}) 변경. 튜닝 승인 대상 여부 TS 확인 필요.` }
        : { status: 'ok', text: '머플러 형식·파라미터가 순정 모델과 동일.' };
    },
  },
  {
    id: 'valve',
    category: '배기 구조',
    title: '가변밸브 구성 및 제어 방식',
    detail: '밸브 유무, 제어 방식(수동/자동 조건), 검사 시 밸브 상태.',
    auto: (p) => {
      const has = [...p.exhaust.left, ...p.exhaust.right].some((x) => x.kind === 'muffler-valved');
      return has
        ? {
            status: 'verify',
            text: `가변밸브 있음. 시뮬레이터 AUTO 조건: ${p.exhaust.valve.autoOpenRpm} rpm 초과 또는 스로틀 ${Math.round(p.exhaust.valve.autoThrottle * 100)}% 초과 시 개방(가상 제어). 실차 제어 방식은 별도 문서화하고, 검사 시 밸브 최대 개방 상태 기준 측정 여부를 확인할 것. 검사 조건을 감지해 소음을 낮추는 방식은 사용하지 않음.`,
          }
        : { status: 'ok', text: '가변밸브 없음.' };
    },
  },
  {
    id: 'noise-standard',
    category: '소음',
    title: '운행차 배기소음 허용기준',
    detail: '소음·진동관리법 시행규칙의 최신 배기소음 기준 및 튜닝 차량 적용 기준 확인.',
    auto: () => ({ status: 'verify', text: 'V8 LAB은 절대 음압(dB(A))을 산출하지 않습니다. 화면의 dBFS는 디지털 레벨로, 법정 기준과 비교할 수 없습니다. 최신 기준 확인 필요.' }),
  },
  {
    id: 'noise-measure',
    category: '소음',
    title: '튜닝 전·후 배기소음 실측',
    detail: '공인 장비·규정 측정 조건으로 순정 상태와 튜닝 후 상태를 측정.',
    auto: () => ({ status: 'verify', text: '실측 데이터 없음. 측정 전까지 소음 적합성은 판단할 수 없음.' }),
  },
  {
    id: 'parts-docs',
    category: '서류',
    title: '부품 자료 (제조사 성적서·도면)',
    detail: '머플러·레조네이터·X파이프 제조사 사양서, 소음 시험 성적서 확보 여부.',
    auto: () => ({ status: 'verify', text: '부품 제조사 자료 확보 필요. 시뮬레이션 파라미터는 성적서를 대신할 수 없음.' }),
  },
  {
    id: 'application-docs',
    category: '서류',
    title: '구조변경(튜닝) 신청 자료 목록',
    detail:
      '일반적으로 요구되는 자료: 튜닝승인신청서, 튜닝 전·후 주요제원 대비표, 튜닝 전·후 외관도/사진, 변경 구조·장치 설계도(시공업체 작성). 최신 서식과 추가 요구 자료는 TS 확인.',
    auto: () => ({ status: 'verify', text: 'V8 LAB 보고서의 구조도는 "개념도"이며 승인용 설계도로 사용할 수 없음.' }),
  },
  {
    id: 'inspection',
    category: '서류',
    title: '검사기관 확인 항목',
    detail: '튜닝 승인 대상 여부, 튜닝검사 일정·장소, 소음 측정 조건, 가변밸브 차량의 검사 방법.',
    auto: () => ({ status: 'verify', text: '검사기관(한국교통안전공단) 사전 문의 필요.' }),
  },
  {
    id: 'exterior-color',
    category: '외장 (무광 블랙)',
    title: '차체 색상 변경 등록',
    detail: '무광 블랙 전체 도색에 따른 등록 사항 변경(신고) 필요 여부.',
    auto: (p) =>
      p.exterior.items.body
        ? { status: 'verify', text: '차체 전체 색상 변경 계획 있음. 관할 차량등록사업소에 변경 등록 필요 여부·기한 확인 필요.' }
        : { status: 'ok', text: '차체 색상 변경 계획 없음.' },
  },
  {
    id: 'exterior-exclusions',
    category: '외장 (무광 블랙)',
    title: '등화장치·반사기·번호판 도색 제외',
    detail: '헤드램프·리어램프·반사기·번호판·번호판등은 도색·필름 대상에서 제외.',
    auto: () => ({ status: 'verify', text: '도색 범위에서 등화·반사기·번호판이 제외되는지 시공 전 확인 필요.' }),
  },
  {
    id: 'exterior-wheels',
    category: '외장 (무광 블랙)',
    title: '휠 도색',
    detail: '휠 규격(직경·폭·오프셋) 변경 없이 도색만 하는지 확인. 규격 변경 시 별도 검토.',
    auto: (p) => (p.exterior.items.wheels ? { status: 'info', text: '휠 무광 블랙 도색 계획 (규격 변경 없음 가정).' } : { status: 'ok', text: '휠 도색 계획 없음.' }),
  },
  {
    id: 'exterior-emblem',
    category: '외장 (무광 블랙)',
    title: '그릴·엠블럼 도색',
    detail: '그릴 및 제조사 엠블럼 블랙 처리. 센서(레이더 등)가 그릴/엠블럼 뒤에 있는 경우 도료가 기능에 영향을 주지 않는지 확인.',
    auto: (p) =>
      p.exterior.items.grilleEmblem
        ? { status: 'verify', text: '그릴·엠블럼 무광 블랙 계획. 엠블럼 뒤 센서 장착 여부 확인 필요 (사양별 상이).' }
        : { status: 'ok', text: '그릴·엠블럼 도색 계획 없음.' },
  },
];
