import { useEffect, useRef, type RefObject } from 'react';

/** Canvas that tracks its CSS size × devicePixelRatio. draw() gets (ctx, w, h) in CSS pixels. */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]): RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const paint = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, w, h);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(cv);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** dB → colour (dark → teal → amber → white), for spectrograms & heatmaps. */
export function heat(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  const stops: [number, [number, number, number]][] = [
    [0, [11, 12, 14]],
    [0.3, [13, 70, 80]],
    [0.55, [20, 184, 166]],
    [0.78, [249, 146, 60]],
    [1, [255, 245, 230]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const a = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * a, c0[1] + (c1[1] - c0[1]) * a, c0[2] + (c1[2] - c0[2]) * a];
    }
  }
  return stops[stops.length - 1][1];
}

export const logX = (f: number, f0: number, f1: number, w: number) => (Math.log(f / f0) / Math.log(f1 / f0)) * w;

export function gridLog(ctx: CanvasRenderingContext2D, w: number, h: number, f0: number, f1: number, padB = 14) {
  ctx.strokeStyle = '#23272e';
  ctx.fillStyle = '#5c636e';
  ctx.font = '9px monospace';
  ctx.lineWidth = 1;
  for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    if (f < f0 || f > f1) continue;
    const x = logX(f, f0, f1, w);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h - padB);
    ctx.stroke();
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, h - 3);
  }
}

export interface Series {
  label: string;
  color: string;
  xs: number[];
  ys: number[];
  dash?: number[];
}

/** Simple line chart with linear axes. */
export function LineChart({
  series,
  xLabel,
  yLabel,
  height = 180,
  yRange,
  xRange,
  bands,
  xLog,
}: {
  xLog?: boolean;
  series: Series[];
  xLabel: string;
  yLabel: string;
  height?: number;
  yRange?: [number, number];
  xRange?: [number, number];
  bands?: { x0: number; x1: number; color: string; label?: string }[];
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const padL = 36, padB = 22, padT = 8, padR = 8;
      const all = series.flatMap((s) => s.ys.filter(Number.isFinite));
      const allX = series.flatMap((s) => s.xs);
      if (!all.length) return;
      let [y0, y1] = yRange ?? [Math.min(...all), Math.max(...all)];
      if (y1 - y0 < 1e-6) {
        y0 -= 1;
        y1 += 1;
      }
      const [x0, x1] = xRange ?? [Math.min(...allX), Math.max(...allX)];
      const X = xLog
        ? (x: number) => padL + (Math.log(x / x0) / Math.log(x1 / x0)) * (w - padL - padR)
        : (x: number) => padL + ((x - x0) / (x1 - x0)) * (w - padL - padR);
      const Y = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (h - padT - padB);
      for (const b of bands ?? []) {
        ctx.fillStyle = b.color;
        ctx.fillRect(X(b.x0), padT, X(b.x1) - X(b.x0), h - padT - padB);
        if (b.label) {
          ctx.fillStyle = '#7d8591';
          ctx.font = '9px sans-serif';
          ctx.fillText(b.label, X(b.x0) + 3, padT + 10);
        }
      }
      ctx.strokeStyle = '#23272e';
      ctx.fillStyle = '#5c636e';
      ctx.font = '9px monospace';
      const yStep = niceStep((y1 - y0) / 5);
      for (let y = Math.ceil(y0 / yStep) * yStep; y <= y1; y += yStep) {
        ctx.beginPath();
        ctx.moveTo(padL, Y(y) + 0.5);
        ctx.lineTo(w - padR, Y(y) + 0.5);
        ctx.stroke();
        ctx.fillText(y.toFixed(Math.abs(yStep) < 1 ? 1 : 0), 2, Y(y) + 3);
      }
      const xStep = niceStep((x1 - x0) / 6);
      const xTicks: number[] = [];
      if (xLog) for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) f >= x0 && f <= x1 && xTicks.push(f);
      else for (let x = Math.ceil(x0 / xStep) * xStep; x <= x1; x += xStep) xTicks.push(x);
      for (const x of xTicks) {
        ctx.beginPath();
        ctx.moveTo(X(x) + 0.5, padT);
        ctx.lineTo(X(x) + 0.5, h - padB);
        ctx.stroke();
        ctx.fillText(x >= 1000 ? `${(x / 1000).toFixed(x % 1000 ? 1 : 0)}k` : `${x}`, X(x) - 8, h - 8);
      }
      ctx.fillStyle = '#7d8591';
      ctx.fillText(xLabel, w - padR - ctx.measureText(xLabel).width, h - 0.5);
      ctx.save();
      ctx.translate(9, padT + 2);
      ctx.fillText(yLabel, 18, 6);
      ctx.restore();
      for (const s of series) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.8;
        ctx.setLineDash(s.dash ?? []);
        ctx.beginPath();
        let pen = false;
        s.xs.forEach((x, i) => {
          const y = s.ys[i];
          if (!Number.isFinite(y)) {
            pen = false;
            return;
          }
          const yy = Y(Math.min(y1, Math.max(y0, y)));
          if (!pen) ctx.moveTo(X(x), yy);
          else ctx.lineTo(X(x), yy);
          pen = true;
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
    },
    [series, yRange, xRange, bands, xLog],
  );
  return (
    <div>
      <canvas ref={ref} style={{ width: '100%', height }} className="block" />
      <div className="mt-1 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1 text-[10px] text-metal-400">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Heatmap: rows = frames (x axis), cols = bins (y axis). */
export function Heatmap({
  data,
  yMax,
  yLabel,
  xs,
  xLabel,
  height = 200,
  dbRange,
  yTicks,
  yLog,
  binHz,
}: {
  data: (Float32Array | number[])[];
  yMax: number;
  yLabel: string;
  xs: number[];
  xLabel: string;
  height?: number;
  dbRange: [number, number];
  yTicks: number[];
  yLog?: { f0: number; f1: number };
  binHz?: number;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const padL = 34, padB = 18;
      const iw = Math.max(1, w - padL);
      const ih = Math.max(1, h - padB);
      if (!data.length) return;
      const img = ctx.createImageData(iw, ih);
      const [d0, d1] = dbRange;
      for (let x = 0; x < iw; x++) {
        const row = data[Math.min(data.length - 1, Math.floor((x / iw) * data.length))];
        for (let y = 0; y < ih; y++) {
          let idx: number;
          if (yLog && binHz) {
            const f = yLog.f0 * Math.pow(yLog.f1 / yLog.f0, 1 - y / ih);
            idx = Math.round(f / binHz);
          } else idx = Math.floor((1 - y / ih) * row.length);
          const v = row[Math.min(row.length - 1, Math.max(0, idx))];
          const [r, g, b] = heat((v - d0) / (d1 - d0));
          const o = (y * iw + x) * 4;
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = b;
          img.data[o + 3] = 255;
        }
      }
      // putImageData ignores transforms → draw via an offscreen canvas
      const tmp = document.createElement('canvas');
      tmp.width = iw;
      tmp.height = ih;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, padL, 0, iw, ih);
      ctx.fillStyle = '#5c636e';
      ctx.font = '9px monospace';
      for (const t of yTicks) {
        const y = yLog ? ih * (1 - Math.log(t / yLog.f0) / Math.log(yLog.f1 / yLog.f0)) : ih * (1 - t / yMax);
        if (y < 0 || y > ih) continue;
        ctx.fillText(t >= 1000 ? `${t / 1000}k` : `${t}`, 2, y + 3);
        ctx.fillRect(padL - 3, y, 3, 1);
      }
      const xmin = xs[0], xmax = xs[xs.length - 1];
      const step = niceStep((xmax - xmin) / 6);
      for (let v = Math.ceil(xmin / step) * step; v <= xmax; v += step) {
        const x = padL + ((v - xmin) / (xmax - xmin)) * iw;
        ctx.fillText(`${v}`, x - 10, h - 4);
      }
      ctx.fillStyle = '#7d8591';
      ctx.fillText(xLabel, w - ctx.measureText(xLabel).width - 2, h - 4);
      ctx.fillText(yLabel, padL + 4, 10);
    },
    [data, dbRange, yMax, xs],
  );
  return <canvas ref={ref} style={{ width: '100%', height }} className="block rounded" />;
}
