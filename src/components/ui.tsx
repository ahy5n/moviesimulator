'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { money } from '@/lib/format';

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h-display text-2xl font-bold text-[#F3EEDF] sm:text-3xl">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Panel({ title, right, children, className = '', pad = true }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="font-marquee text-lg tracking-wider text-gold">{title}</h2>
          {right}
        </div>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'gold' }) {
  const c = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : tone === 'gold' ? 'text-gold' : 'text-[#F3EEDF]';
  return (
    <div className="panel px-4 py-3">
      <div className="label">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

type BtnProps = { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'gold' | 'ghost' | 'danger' | 'ticket' | 'subtle'; size?: 'sm' | 'md'; title?: string; type?: 'button' | 'submit'; className?: string };
export function Button({ children, onClick, disabled, variant = 'gold', size = 'md', title, type = 'button', className = '' }: BtnProps) {
  const sz = variant === 'ticket' ? 'pl-4 py-1.5' : size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm';
  const v = {
    gold: 'bg-gold text-[#16120A] hover:bg-gold-light font-semibold',
    ghost: 'border border-line bg-panel2 text-[#ECE8DF] hover:border-gold/60',
    subtle: 'text-muted hover:text-[#ECE8DF]',
    danger: 'border border-red-900 bg-red-950/40 text-red-300 hover:bg-red-900/40',
    ticket: 'ticket pr-9 font-marquee text-lg leading-none whitespace-nowrap tracking-wider hover:brightness-110',
  }[variant];
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${v} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = 'ghost', size = 'md' }: { href: string; children: ReactNode; variant?: 'gold' | 'ghost'; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm';
  const v = variant === 'gold' ? 'bg-gold text-[#16120A] font-semibold hover:bg-gold-light' : 'border border-line bg-panel2 hover:border-gold/60';
  return <Link href={href} className={`inline-flex items-center gap-1.5 rounded-lg transition ${sz} ${v}`}>{children}</Link>;
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return <span className="chip" style={color ? { borderColor: color + '88', color } : undefined}>{children}</span>;
}

export function Bar({ value, max = 100, color = '#D4AF37', label, right }: { value: number; max?: number; color?: string; label?: ReactNode; right?: ReactNode }) {
  return (
    <div>
      {(label || right) && <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{label}</span><span className="tabular-nums">{right ?? Math.round(value)}</span></div>}
      <div className="h-2 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-line bg-panel p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${value === t.id ? 'bg-gold text-[#16120A] font-semibold' : 'text-muted hover:text-[#ECE8DF]'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} animate-rise`} onClick={(e) => e.stopPropagation()}>
        {title && <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-5 py-3"><h3 className="h-display text-xl font-bold">{title}</h3><button onClick={onClose} className="text-muted hover:text-white" aria-label="Close">✕</button></div>}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Count-up animation for big numbers. */
export function CountUp({ value, format = money, ms = 900 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular-nums">{format(v)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <div className="label mb-1">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </label>
  );
}

export function Toast({ text, onDone }: { text: string | null; onDone: () => void }) {
  useEffect(() => { if (!text) return; const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [text, onDone]);
  if (!text) return null;
  return <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-gold/40 bg-panel2 px-4 py-2 text-sm shadow-xl lg:bottom-6">{text}</div>;
}

export function useToast() {
  const [text, setText] = useState<string | null>(null);
  return { text, show: setText, clear: () => setText(null) };
}

export const signed = (n: number) => (n >= 0 ? `+${money(n)}` : money(n));
