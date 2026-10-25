import { useEffect, useState } from 'react';

export type PhotoId = 'front' | 'rear' | 'side' | 'underbody';

export interface Photo {
  id: PhotoId;
  file: string;
  title: string;
  caption: string;
}

/** Owner-supplied reference images of the planned matte-black GS460 (public/gallery). */
export const PHOTOS: Photo[] = [
  { id: 'front', file: 'gs460-front.webp', title: '전면 3/4', caption: '무광 블랙 차체 · 블랙 그릴/엠블럼 · 블랙 휠' },
  { id: 'rear', file: 'gs460-rear.webp', title: '후면 3/4', caption: '듀얼 블랙 팁 · 램프·번호판 도색 제외' },
  { id: 'side', file: 'gs460-side.webp', title: '측면', caption: '무광 블랙 차체 · 블랙 5스포크 휠' },
  { id: 'underbody', file: 'gs460-underbody.webp', title: '하부 배기', caption: '듀얼 · X파이프 · 엔드 머플러 · 블랙 팁 (구조 참고용)' },
];

export const photoUrl = (p: Photo) => `${import.meta.env.BASE_URL}gallery/${p.file}`;

export const PHOTO_NOTE = '사용자 제공 레퍼런스 이미지입니다. 외장·배기 구성의 시각 참고용이며 실측 치수나 구조변경 승인 자료가 아닙니다.';

export function VehicleGallery({ ids = ['front', 'rear', 'side', 'underbody'], cols = 2, note = true }: { ids?: PhotoId[]; cols?: 1 | 2 | 4; note?: boolean }) {
  const photos = PHOTOS.filter((p) => ids.includes(p.id));
  const [open, setOpen] = useState<Photo | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const grid = cols === 1 ? 'grid-cols-1' : cols === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2';
  return (
    <div>
      <div className={`grid gap-2 ${grid}`}>
        {photos.map((p) => (
          <figure key={p.id} className="break-inside-avoid">
            <button type="button" onClick={() => setOpen(p)} className="block w-full overflow-hidden rounded-lg border border-ink-700 bg-ink-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" aria-label={`${p.title} 크게 보기`}>
              <img src={photoUrl(p)} alt={`GS460 무광 블랙 — ${p.title}`} loading="lazy" width={1344} height={896} className="aspect-[3/2] w-full object-cover transition hover:scale-[1.02]" />
            </button>
            <figcaption className="mt-1 text-[10px] text-metal-500">
              <span className="text-metal-300">{p.title}</span> — {p.caption}
            </figcaption>
          </figure>
        ))}
      </div>
      {note && <p className="mt-2 text-[10px] text-metal-600">{PHOTO_NOTE}</p>}
      {open && (
        <div role="dialog" aria-modal="true" aria-label={open.title} className="no-print fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <img src={photoUrl(open)} alt={`GS460 무광 블랙 — ${open.title}`} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          <div className="mt-2 text-center text-xs text-metal-300">
            {open.title} — {open.caption}
            <div className="text-[10px] text-metal-500">탭하거나 Esc로 닫기</div>
          </div>
        </div>
      )}
    </div>
  );
}
