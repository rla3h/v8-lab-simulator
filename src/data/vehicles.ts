import type { ExteriorPlan, VehicleDef } from '../types';

export const VEHICLES: VehicleDef[] = [
  {
    id: 'gs460-s190',
    name: 'Lexus GS460',
    chassis: 'S190',
    engineId: '1ur-fse',
    years: '2007–2011 (공개 자료 기준)',
    oemExhaustId: 'gs460-oem',
    notes: '초기 개발·검증 기준 차량. 하부 실측 치수 미확보 → 배기 빌더는 개념 구조 모드.',
  },
  {
    id: 'cls63-c219',
    name: 'Mercedes-Benz CLS63 AMG',
    chassis: 'C219',
    engineId: 'm156',
    years: '공개 자료 기준 확인 필요',
    oemExhaustId: 'm156-c219-stock',
    notes: '레퍼런스(목표 음색) 차량.',
  },
];

export const vehicleById = (id: string): VehicleDef => {
  const v = VEHICLES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown vehicle: ${id}`);
  return v;
};

/** The owner's stated exterior plan: matte black body, grille emblem and wheels. */
export function defaultExterior(): ExteriorPlan {
  return {
    finish: 'matte-black',
    colorHex: '#1b1c1f',
    items: {
      body: true,
      grilleEmblem: true,
      wheels: true,
      exhaustTips: true,
      chromeTrim: false,
      rearBadges: false,
      calipers: false,
    },
    note: '차체 전체 + 그릴/엠블럼 + 휠 무광 블랙 도색 계획. 외장 도색은 음향 시뮬레이션에 영향을 주지 않으며 시각화·보고서·구조변경 검토용으로만 사용됩니다.',
  };
}
