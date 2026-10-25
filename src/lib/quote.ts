import type { ProjectData } from '../store';
import { engineById } from '../data/engines';
import { CROSSOVER_INFO, PART_SPECS } from '../data/exhaust';
import type { Part } from '../types';

function partLine(p: Part): string {
  const s = PART_SPECS[p.kind];
  const params = s.params.map((d) => `${d.label} ${p.params[d.key]}${d.unit}`).join(', ');
  return `${s.label} (${params})`;
}

/** Plain-text quote request for an exhaust shop. Dimensions are flagged as conceptual. */
export function quoteText(p: ProjectData): string {
  const eng = engineById(p.engineId);
  const ex = p.exhaust;
  const ext = p.exterior.items;
  const L: string[] = [];
  L.push('[배기 시스템 시공 견적 요청서]');
  L.push(`작성: V8 LAB / ${new Date().toLocaleDateString('ko-KR')}`);
  L.push(`프로젝트: ${p.name}`);
  L.push('');
  L.push('1. 차량');
  L.push(`  - ${eng.application} / 엔진 ${eng.code} (${eng.displacementCc.value ?? '?'} cc, V${eng.cylinders} ${eng.induction === 'NA' ? '자연흡기' : eng.induction})`);
  L.push('');
  L.push('2. 필수 조건');
  L.push('  - 순정 촉매 및 배출가스 관련 부품 유지 (제거·이설 불가)');
  L.push('  - 대한민국 구조변경(튜닝) 승인 및 검사 기준 충족 가능한 구성으로 제안 요청');
  L.push('  - 저RPM(1,500–2,500 rpm) 실내 부밍 최소화');
  L.push('');
  L.push('3. 희망 구성 (V8 LAB 시뮬레이션 기준 개념값 — 실측 후 확정 요청)');
  L.push(`  - 크로스오버: ${CROSSOVER_INFO[ex.crossover.type].label}${ex.crossover.type !== 'none' ? `, 연결관 Ø${ex.crossover.diameterMm}mm` : ''}`);
  L.push(`  - 프런트 파이프: Ø${ex.frontPipe.diameterMm}mm (촉매 후단 ~ 크로스오버)`);
  for (const side of ['left', 'right'] as const) {
    L.push(`  - ${side === 'left' ? '좌측(LH)' : '우측(RH)'} 라인 (앞→뒤):`);
    ex[side].forEach((part, i) => L.push(`      ${i + 1}) ${partLine(part)}`));
  }
  if ([...ex.left, ...ex.right].some((x) => x.kind === 'muffler-valved'))
    L.push(`  - 가변밸브: 시뮬레이션상 ${ex.valve.autoOpenRpm} rpm 또는 스로틀 ${Math.round(ex.valve.autoThrottle * 100)}% 이상에서 개방. 실차 제어 방식(진공/전자식, 수동 스위치 여부) 제안 요청.`);
  L.push(`  - 배기 팁: ${ex.tips.finish === 'black' ? '블랙' : ex.tips.finish} Ø${ex.tips.diameterMm}mm, 듀얼`);
  L.push('');
  L.push('4. 음색 목표');
  L.push(`  - AMG(M156)풍 거친 저음 ${p.toneBalance}% : 자연흡기 고회전 포효 ${100 - p.toneBalance}%`);
  L.push('  - 공회전: 정숙하지만 묵직한 맥동 / 2,500–4,000 rpm: 깊고 거친 음색 / 4,000 rpm+: 선명한 포효');
  L.push('');
  L.push('5. 요청 자료');
  L.push('  - 부품별 견적 및 공임, 시공 기간');
  L.push('  - 머플러·레조네이터 제조사 사양서 및 소음 시험 성적서');
  L.push('  - 시공 전·후 배기소음 측정 가능 여부');
  L.push('  - 구조변경(튜닝) 승인 신청 대행 가능 여부 및 필요 서류');
  L.push('');
  L.push('6. 참고 (별도 시공)');
  const ext2 = [ext.body && '차체 전체', ext.grilleEmblem && '그릴·엠블럼', ext.wheels && '휠', ext.chromeTrim && '크롬 몰딩', ext.rearBadges && '후면 엠블럼', ext.calipers && '캘리퍼'].filter(Boolean);
  L.push(`  - 외장 무광 블랙 도색 계획: ${ext2.join(', ') || '없음'} (등화장치·반사기·번호판 제외)`);
  L.push('');
  L.push('※ 본 요청서의 치수·감쇠량·주파수는 V8 LAB 시뮬레이션의 개념 파라미터이며 실측·검증된 값이 아닙니다.');
  return L.join('\n');
}
