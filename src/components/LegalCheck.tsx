import { useStore } from '../store';
import { LEGAL_DISCLAIMER, LEGAL_ITEMS, describeLine, type AutoStatus } from '../lib/legal';
import { engineById } from '../data/engines';
import { CROSSOVER_INFO, stockExhaustFor } from '../data/exhaust';
import { Card, Note, Segmented, Tag } from './ui';
import type { CheckState } from '../types';

const STATUS: Record<AutoStatus, [string, 'green' | 'gray' | 'amber']> = {
  ok: ['설계상 충족', 'green'],
  info: ['정보', 'gray'],
  verify: ['확인 필요', 'amber'],
};

export function LegalCheck() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const stock = stockExhaustFor(engineById(project.engineId).stockExhaustId);
  const cats = [...new Set(LEGAL_ITEMS.map((i) => i.category))];
  const done = LEGAL_ITEMS.filter((i) => project.legal[i.id] === 'done' || project.legal[i.id] === 'na').length;

  return (
    <div className="flex flex-col gap-3">
      <Note>{LEGAL_DISCLAIMER}</Note>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-3">
          {cats.map((cat) => (
            <Card key={cat} title={cat}>
              <ul className="divide-y divide-ink-700">
                {LEGAL_ITEMS.filter((i) => i.category === cat).map((item) => {
                  const a = item.auto(project);
                  const [label, tone] = STATUS[a.status];
                  const st: CheckState = project.legal[item.id] ?? 'todo';
                  return (
                    <li key={item.id} className="py-2.5">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm text-metal-300">
                            {item.title} <Tag tone={tone}>{label}</Tag>
                          </div>
                          <div className="mt-0.5 text-[11px] text-metal-500">{item.detail}</div>
                          <div className="mt-1 text-[11px] text-metal-400">↳ {a.text}</div>
                        </div>
                        <div className="w-56 shrink-0">
                          <Segmented<CheckState>
                            value={st}
                            onChange={(v) => setProject({ legal: { ...project.legal, [item.id]: v } })}
                            options={[
                              { value: 'todo', label: '미확인' },
                              { value: 'done', label: '확인 완료' },
                              { value: 'na', label: '해당 없음' },
                            ]}
                          />
                        </div>
                      </div>
                      <input
                        className="input mt-1.5 w-full"
                        placeholder="확인 내용 메모 (기관 답변, 담당자, 날짜 등)"
                        value={project.legalNotes[item.id] ?? ''}
                        onChange={(e) => setProject({ legalNotes: { ...project.legalNotes, [item.id]: e.target.value } })}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Card title="진행 상황">
            <div className="num text-2xl text-white">
              {done} / {LEGAL_ITEMS.length}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink-700">
              <div className="h-full bg-teal-400" style={{ width: `${(done / LEGAL_ITEMS.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-metal-500">"확인 완료"는 사용자가 직접 확인했다는 기록일 뿐, 승인 여부를 의미하지 않습니다.</p>
          </Card>
          <Card title="튜닝 전·후 구조 비교">
            <table className="w-full text-[11px]">
              <thead className="text-metal-500">
                <tr>
                  <th className="py-1 text-left font-normal">항목</th>
                  <th className="py-1 text-left font-normal">순정 (모델)</th>
                  <th className="py-1 text-left font-normal">튜닝 설계</th>
                </tr>
              </thead>
              <tbody className="align-top text-metal-300">
                <tr className="border-t border-ink-700">
                  <td className="py-1 text-metal-500">촉매</td>
                  <td>순정</td>
                  <td>순정 유지</td>
                </tr>
                <tr className="border-t border-ink-700">
                  <td className="py-1 text-metal-500">크로스오버</td>
                  <td>{CROSSOVER_INFO[stock.crossover.type].label}</td>
                  <td>{CROSSOVER_INFO[project.exhaust.crossover.type].label}</td>
                </tr>
                <tr className="border-t border-ink-700">
                  <td className="py-1 text-metal-500">LH 라인</td>
                  <td>{describeLine(stock, 'left')}</td>
                  <td>{describeLine(project.exhaust, 'left')}</td>
                </tr>
                <tr className="border-t border-ink-700">
                  <td className="py-1 text-metal-500">RH 라인</td>
                  <td>{describeLine(stock, 'right')}</td>
                  <td>{describeLine(project.exhaust, 'right')}</td>
                </tr>
                <tr className="border-t border-ink-700">
                  <td className="py-1 text-metal-500">팁</td>
                  <td>
                    {stock.tips.finish} Ø{stock.tips.diameterMm}
                  </td>
                  <td>
                    {project.exhaust.tips.finish} Ø{project.exhaust.tips.diameterMm}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-metal-600">순정 구조는 실측 전 가정 모델입니다.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
