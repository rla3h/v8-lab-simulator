import type { ReactNode } from 'react';
import type { AudioProvenance, Confidence } from '../types';

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex min-w-0 flex-col ${className}`}>
      {title !== undefined && (
        <header className="card-h">
          <span className="truncate">{title}</span>
          {right && <span className="flex items-center gap-1.5 normal-case tracking-normal">{right}</span>}
        </header>
      )}
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

const PROV_STYLE: Record<AudioProvenance, string> = {
  SIMULATED: 'border-amber-500/60 bg-amber-500/10 text-amber-300',
  REFERENCE: 'border-sky-500/60 bg-sky-500/10 text-sky-300',
  VALIDATED: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300',
};

export function ProvBadge({ kind, extra }: { kind: AudioProvenance; extra?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${PROV_STYLE[kind]}`}>
      {kind}
      {extra && <span className="font-normal opacity-80">{extra}</span>}
    </span>
  );
}

const CONF: Record<Confidence, [string, string]> = {
  'public-spec': ['공개 제원', 'border-teal-600/50 text-teal-300'],
  assumption: ['가정', 'border-amber-600/50 text-amber-300'],
  unknown: ['미확인', 'border-red-500/50 text-red-300'],
};

export function ConfBadge({ c }: { c: Confidence }) {
  const [label, cls] = CONF[c];
  return <span className={`rounded border px-1 py-px text-[10px] ${cls}`}>{label}</span>;
}

export function Tag({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'teal' | 'orange' | 'red' | 'amber' | 'green' }) {
  const cls = {
    gray: 'border-ink-500 text-metal-400',
    teal: 'border-teal-600/60 text-teal-300',
    orange: 'border-rpm-600/60 text-rpm-400',
    red: 'border-red-500/60 text-red-300',
    amber: 'border-amber-500/60 text-amber-300',
    green: 'border-emerald-500/60 text-emerald-300',
  }[tone];
  return <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] ${cls}`}>{children}</span>;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  color,
  format,
  hint,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  color?: string;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const c = color ?? '#2dd4bf';
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="lbl">{label}</span>
        <span className="num text-xs text-metal-300">
          {format ? format(value) : value}
          {unit && <span className="ml-0.5 text-metal-500">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={typeof label === "string" ? label : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--thumb' as string]: c, background: `linear-gradient(90deg, ${c}88 ${pct}%, #23272e ${pct}%)` }}
      />
      {hint && <div className="mt-0.5 text-[10px] text-metal-600">{hint}</div>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-ink-600 bg-ink-850 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 ${size === 'md' ? 'py-1.5 text-xs' : 'py-1 text-[11px]'} font-medium transition disabled:opacity-40 ${
            value === o.value ? 'bg-ink-600 text-white shadow' : 'text-metal-500 hover:text-metal-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, unit, tone }: { label: ReactNode; value: ReactNode; unit?: string; tone?: 'teal' | 'orange' }) {
  return (
    <div className="min-w-0">
      <div className="lbl truncate">{label}</div>
      <div className={`num text-sm ${tone === 'orange' ? 'text-rpm-400' : tone === 'teal' ? 'text-teal-300' : 'text-metal-300'}`}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-metal-500">{unit}</span>}
      </div>
    </div>
  );
}

export function Note({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'teal' | 'red' }) {
  const cls = {
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-200/80',
    teal: 'border-teal-500/30 bg-teal-500/5 text-teal-200/80',
    red: 'border-red-500/30 bg-red-500/5 text-red-200/80',
  }[tone];
  return <div className={`rounded-md border px-2.5 py-1.5 text-[11px] leading-relaxed ${cls}`}>{children}</div>;
}
