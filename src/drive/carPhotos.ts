/**
 * Real rear photos for V8 LAB DRIVE, from Wikimedia Commons under free licences.
 * Changes made for the game: background removed, cropped/resized, licence plates replaced with
 * a generic game plate (GS460 also re-badged). Derivatives keep the source licence (see CREDITS).
 *
 * Coordinates are fractions of the image: lamps [x, y, w, h], tips [x, y, r] (r in widths).
 * anchorX = centre of the car's rear face, rearFrac = rear-face width / image width,
 * groundY = where the tyres touch the ground. These were measured by hand on each image.
 */

export interface PhotoCredit {
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}

export interface CarPhoto {
  file: string;
  w: number;
  h: number;
  view: 'rear' | 'rear-3/4';
  anchorX: number;
  rearFrac: number;
  groundY: number;
  lamps: [number, number, number, number][];
  tips: [number, number, number][];
  /** Shown to the user when the photo is not exactly the listed model/trim. */
  note?: string;
  credit: PhotoCredit;
}

const CHANGES = '배경 제거 · 자르기 · 번호판을 게임용으로 교체';

export const PHOTO_CHANGES = CHANGES;

export const CAR_PHOTOS: Record<string, CarPhoto> = {
  gs460: {
    file: 'gs460.webp',
    w: 900,
    h: 538,
    view: 'rear-3/4',
    anchorX: 0.315,
    rearFrac: 0.63,
    groundY: 0.985,
    lamps: [
      [0.015, 0.37, 0.1, 0.13],
      [0.42, 0.39, 0.19, 0.13],
    ],
    tips: [
      [0.055, 0.845, 0.022],
      [0.505, 0.885, 0.022],
    ],
    note: '같은 S190 차체의 GS 450h(유광 블랙) 사진에 GS 460 배지를 합성했습니다.',
    credit: {
      title: 'Lexus GS 450h (III) – Heckansicht, 15. Mai 2011, Wuppertal',
      author: 'M 93',
      license: 'CC BY-SA 3.0 de',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/de/deed.en',
      source: 'https://commons.wikimedia.org/wiki/File:Lexus_GS_450h_(III)_%E2%80%93_Heckansicht,_15._Mai_2011,_Wuppertal.jpg',
    },
  },
  gsf: {
    file: 'gsf.webp',
    w: 900,
    h: 659,
    view: 'rear',
    anchorX: 0.5,
    rearFrac: 0.98,
    groundY: 0.97,
    lamps: [
      [0.02, 0.33, 0.28, 0.15],
      [0.7, 0.33, 0.28, 0.15],
    ],
    tips: [
      [0.135, 0.93, 0.03],
      [0.2, 0.905, 0.03],
      [0.8, 0.905, 0.03],
      [0.865, 0.93, 0.03],
    ],
    credit: {
      title: '2016 Lexus GS-F Fujiweiss Heckansicht frontal',
      author: 'Kickaffe (Mario von Berg)',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      source: 'https://commons.wikimedia.org/wiki/File:2016_Lexus_GS-F_Fujiweiss_Heckansicht_frontal.jpg',
    },
  },
  isf: {
    file: 'isf.webp',
    w: 830,
    h: 707,
    view: 'rear',
    anchorX: 0.5,
    rearFrac: 0.97,
    groundY: 0.97,
    lamps: [
      [0.015, 0.39, 0.21, 0.18],
      [0.7, 0.39, 0.26, 0.18],
    ],
    tips: [
      [0.12, 0.9, 0.03],
      [0.14, 0.945, 0.03],
      [0.82, 0.9, 0.03],
      [0.84, 0.945, 0.03],
    ],
    credit: {
      title: 'Lexus IS-F 2007 rear view',
      author: 'Tsukuba2000',
      license: 'Public domain',
      licenseUrl: '',
      source: 'https://commons.wikimedia.org/wiki/File:Lexus_IS-F_2007_rear_view.jpg',
    },
  },
  '86gt': {
    file: '86gt.webp',
    w: 900,
    h: 618,
    view: 'rear',
    anchorX: 0.485,
    rearFrac: 0.93,
    groundY: 0.94,
    lamps: [
      [0.05, 0.355, 0.165, 0.135],
      [0.74, 0.355, 0.17, 0.135],
      [0.445, 0.17, 0.11, 0.035],
    ],
    tips: [
      [0.195, 0.86, 0.034],
      [0.73, 0.86, 0.034],
    ],
    note: '후기형(4BA-ZN6) 86 GT 사진입니다.',
    credit: {
      title: 'Toyota 86 GT (4BA-ZN6)',
      author: 'Tokumeigakarinoaoshima',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Toyota_86_GT_(4BA-ZN6).jpg',
    },
  },
  ls460: {
    file: 'ls460.webp',
    w: 900,
    h: 470,
    view: 'rear-3/4',
    anchorX: 0.655,
    rearFrac: 0.65,
    groundY: 0.985,
    lamps: [
      [0.39, 0.37, 0.21, 0.15],
      [0.83, 0.37, 0.12, 0.12],
    ],
    tips: [
      [0.53, 0.84, 0.035],
      [0.91, 0.815, 0.03],
    ],
    note: 'XF40 후기형(2017년식) LS 460 사진입니다.',
    credit: {
      title: '2017 Lexus LS 460, rear 4.11.23',
      author: 'Kevauto',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      source: 'https://commons.wikimedia.org/wiki/File:2017_Lexus_LS_460,_rear_4.11.23.jpg',
    },
  },
  avanten: {
    file: 'avanten.webp',
    w: 900,
    h: 856,
    view: 'rear',
    anchorX: 0.5,
    rearFrac: 0.97,
    groundY: 0.9,
    lamps: [
      [0.02, 0.42, 0.11, 0.12],
      [0.87, 0.42, 0.11, 0.12],
      [0.1, 0.49, 0.8, 0.03],
    ],
    tips: [
      [0.12, 0.85, 0.035],
      [0.875, 0.855, 0.035],
    ],
    note: '엘란트라 N TCR 에디션(북미명, 2026년식) 사진입니다. 국내명 아반떼 N과 같은 차입니다.',
    credit: {
      title: 'Hyundai Elantra N TCR Edition (2026) (55210251000)',
      author: 'Charles from Port Chester, New York',
      license: 'CC0',
      licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/deed.en',
      source: 'https://commons.wikimedia.org/wiki/File:Hyundai_Elantra_N_TCR_Edition_(2026)_(55210251000).jpg',
    },
  },
  tuscani: {
    file: 'tuscani.webp',
    w: 900,
    h: 511,
    view: 'rear-3/4',
    anchorX: 0.24,
    rearFrac: 0.48,
    groundY: 0.975,
    lamps: [
      [0.022, 0.35, 0.04, 0.17],
      [0.29, 0.43, 0.16, 0.18],
    ],
    tips: [
      [0.04, 0.745, 0.02],
      [0.29, 0.87, 0.022],
    ],
    note: '같은 GK 차체의 투스카니 2.0 사진입니다(정후면 공개 사진이 없어 비스듬한 각도).',
    credit: {
      title: 'Hyundai Tuscani 2.0 DOHC GK Stone Black (15)',
      author: 'Damian B Oh',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Hyundai_Tuscani_2.0_DOHC_GK_Stone_Black_(15).jpg',
    },
  },
  m5touring: {
    file: 'm5touring.webp',
    w: 900,
    h: 476,
    view: 'rear-3/4',
    anchorX: 0.28,
    rearFrac: 0.56,
    groundY: 0.985,
    lamps: [
      [0.02, 0.35, 0.055, 0.14],
      [0.34, 0.39, 0.2, 0.15],
    ],
    tips: [
      [0.04, 0.765, 0.02],
      [0.075, 0.775, 0.02],
      [0.285, 0.835, 0.022],
      [0.335, 0.845, 0.022],
    ],
    note: '정후면 공개 사진이 없어 비스듬한 각도입니다.',
    credit: {
      title: '2007 BMW M5 Touring Rear',
      author: 'MrWalkr',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      source: 'https://commons.wikimedia.org/wiki/File:2007_BMW_M5_Touring_Rear.jpg',
    },
  },
  m5sedan: {
    file: 'm5sedan.webp',
    w: 900,
    h: 501,
    view: 'rear-3/4',
    anchorX: 0.695,
    rearFrac: 0.59,
    groundY: 0.985,
    lamps: [
      [0.43, 0.4, 0.2, 0.18],
      [0.92, 0.37, 0.06, 0.13],
    ],
    tips: [
      [0.615, 0.925, 0.02],
      [0.65, 0.92, 0.02],
      [0.93, 0.81, 0.018],
      [0.955, 0.81, 0.018],
    ],
    credit: {
      title: 'Black M5 (E60) sedan rear',
      author: 'Matti Blume, MB-one',
      license: 'CC BY-SA 3.0',
      licenseUrl: 'http://creativecommons.org/licenses/by-sa/3.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Black_M5_(E60)_sedan_rear.jpg',
    },
  },
};

export const photoUrl = (p: CarPhoto) => `${import.meta.env.BASE_URL}cars/${p.file}`;

const cache = new Map<string, Promise<HTMLImageElement | null>>();

/** Loads a car photo once; resolves null if it is missing or fails (the illustration is used then). */
export function loadCarPhoto(carId: string): Promise<HTMLImageElement | null> {
  const p = CAR_PHOTOS[carId];
  if (!p) return Promise.resolve(null);
  let pr = cache.get(carId);
  if (!pr) {
    pr = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = photoUrl(p);
    });
    cache.set(carId, pr);
  }
  return pr;
}

export interface CarSprite {
  normal: HTMLCanvasElement;
  brake: HTMLCanvasElement;
  /** pixel position (in the sprite canvases) that must sit on the car's screen position */
  ax: number;
  gy: number;
  tips: { x: number; y: number; r: number }[];
  /** true when the sprite has no built-in ground shadow */
  needsShadow?: boolean;
}

/** Builds game sprites (normal + brake-lit) from a photo, sized so the rear face is carW px wide. */
export function photoSprites(img: HTMLImageElement, p: CarPhoto, carW: number, night: boolean): CarSprite {
  const dw = Math.round(carW / p.rearFrac);
  const dh = Math.round((dw * p.h) / p.w);
  const pad = Math.round(carW * 0.12);
  const make = (brake: boolean) => {
    const c = document.createElement('canvas');
    c.width = dw + pad * 2;
    c.height = dh + pad;
    const g = c.getContext('2d')!;
    // (the ground shadow is drawn by the game on the main canvas so it is never clipped here)
    g.drawImage(img, pad, 0, dw, dh);
    const glow = brake ? 0.85 : night ? 0.35 : 0;
    if (glow > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const [x, y, w, h] of p.lamps) {
        const cx = pad + (x + w / 2) * dw;
        const cy = (y + h / 2) * dh;
        const r = Math.max(w * dw, h * dh) * 0.9;
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, `rgba(255,40,40,${0.55 * glow})`);
        rg.addColorStop(0.5, `rgba(255,20,20,${0.25 * glow})`);
        rg.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      g.restore();
    }
    return c;
  };
  return {
    normal: make(false),
    brake: make(true),
    ax: pad + p.anchorX * dw,
    gy: p.groundY * dh,
    tips: p.tips.map(([x, y, r]) => ({ x: pad + x * dw, y: y * dh, r: r * dw })),
    needsShadow: true,
  };
}
