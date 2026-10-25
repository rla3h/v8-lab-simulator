/** In-place iterative radix-2 complex FFT. re/im length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const hannCache = new Map<number, Float64Array>();
export function hann(n: number): Float64Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannCache.set(n, w);
  }
  return w;
}

/**
 * Power spectrum (linear, |X|²·scale) of `n` samples starting at `offset`, Hann-windowed
 * and normalised so a full-scale sine reads ≈ 0 dBFS at its bin.
 */
export function powerSpectrum(x: ArrayLike<number>, offset: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const w = hann(n);
  for (let i = 0; i < n; i++) re[i] = (x[offset + i] ?? 0) * w[i];
  fft(re, im);
  const out = new Float64Array(n / 2);
  const norm = 2 / (n * 0.5); // Hann coherent gain 0.5
  for (let k = 0; k < n / 2; k++) {
    const m = Math.hypot(re[k], im[k]) * norm;
    out[k] = m * m;
  }
  return out;
}

export const toDb = (p: number) => 10 * Math.log10(p + 1e-14);

/** Sum of power between f0 and f1 (Hz). */
export function bandPower(ps: Float64Array, sr: number, f0: number, f1: number): number {
  const df = sr / (ps.length * 2);
  const k0 = Math.max(1, Math.floor(f0 / df));
  const k1 = Math.min(ps.length - 1, Math.ceil(f1 / df));
  let s = 0;
  for (let k = k0; k <= k1; k++) s += ps[k];
  return s;
}

/** Peak power within ±tolBins of frequency f. */
export function powerAt(ps: Float64Array, sr: number, f: number, tolBins = 1): number {
  const df = sr / (ps.length * 2);
  const k = Math.round(f / df);
  let m = 0;
  for (let j = k - tolBins; j <= k + tolBins; j++) if (j > 0 && j < ps.length && ps[j] > m) m = ps[j];
  return m;
}

export function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Power-weighted mean frequency. */
export function spectralCentroid(ps: Float64Array, sr: number, f0 = 20, f1 = 10000): number {
  const df = sr / (ps.length * 2);
  let num = 0, den = 0;
  for (let k = Math.max(1, Math.floor(f0 / df)); k < Math.min(ps.length, f1 / df); k++) {
    num += k * df * ps[k];
    den += ps[k];
  }
  return den > 0 ? num / den : 0;
}

/** Least-squares slope of the dB spectrum over log2(f) between f0 and f1, in dB/octave. */
export function spectralSlope(ps: Float64Array, sr: number, f0 = 100, f1 = 4000): number {
  const df = sr / (ps.length * 2);
  // average into 1/6-octave bands first so dense high bins don't dominate
  const xs: number[] = [];
  const ys: number[] = [];
  for (let f = f0; f < f1; f *= Math.pow(2, 1 / 6)) {
    const p = bandPower(ps, sr, f, f * Math.pow(2, 1 / 6)) / Math.max(1, (f * (Math.pow(2, 1 / 6) - 1)) / df);
    xs.push(Math.log2(f));
    ys.push(toDb(p));
  }
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : 0;
}
