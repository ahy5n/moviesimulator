'use client';
import Link from 'next/link';
import { ageAt, formatShort } from '@/lib/calendar';
import { GENRE_COLORS, flag } from '@/lib/constants';
import { initials, money } from '@/lib/format';
import { bestGenre } from '@/lib/talentDb';
import type { Film, GameState, Talent } from '@/lib/types';

export function ratingTier(ovr: number) {
  if (ovr >= 80) return { name: 'Gold', bg: 'linear-gradient(135deg,#F7E08A,#C69A2B)', fg: '#1A1408' };
  if (ovr >= 68) return { name: 'Silver', bg: 'linear-gradient(135deg,#F1F1F4,#9EA1AB)', fg: '#16171B' };
  return { name: 'Bronze', bg: 'linear-gradient(135deg,#E2A574,#8B5A32)', fg: '#1A0F06' };
}

export function OvrBadge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const t = ratingTier(value);
  const s = size === 'lg' ? 'h-14 w-14 text-2xl' : size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-base';
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-lg font-marquee tracking-wide ${s}`} style={{ background: t.bg, color: t.fg }} title={`${t.name} tier`}>{value}</span>;
}

/** Initials avatar coloured by best genre, with a silhouette — never a photo. */
export function Avatar({ t, size = 56 }: { t: Talent; size?: number }) {
  const c = GENRE_COLORS[bestGenre(t)];
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, background: `radial-gradient(circle at 30% 25%, ${c}, ${c}55 60%, #111 100%)` }}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full opacity-25" aria-hidden>
        <circle cx="32" cy="24" r="12" fill="#000" />
        <path d="M8 64c2-14 12-22 24-22s22 8 24 22z" fill="#000" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-marquee tracking-wider text-white drop-shadow" style={{ fontSize: size * 0.4 }}>{initials(t.name)}</span>
    </div>
  );
}

export function TalentCard({ t, s, onClick, footer }: { t: Talent; s: GameState; onClick?: () => void; footer?: React.ReactNode }) {
  const busy = s.commitments[t.id] && s.commitments[t.id].until > s.t;
  const inner = (
    <div className="panel group relative flex h-full flex-col gap-3 p-3 transition hover:border-gold/60">
      <div className="flex items-start gap-3">
        <Avatar t={t} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{t.name}</div>
          <div className="text-xs text-muted">{flag(t.nationality)} {t.nationality} · {ageAt(t.birthDate, s.t)} · {t.kind === 'actor' ? (t.gender === 'F' ? 'Actress' : 'Actor') : t.kind}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {t.isFictional && t.debutYear && t.debutYear >= 2027 && <span className="chip border-emerald-700 text-emerald-300">Newcomer</span>}
            {busy && <span className="chip text-amber-300">Busy</span>}
          </div>
        </div>
        <OvrBadge value={t.attrs.overall} />
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
        {([['STAR', t.attrs.starPower], ['ACT', t.attrs.acting], ['BOX', t.attrs.boxOffice]] as const).map(([k, v]) => (
          <div key={k} className="rounded bg-panel2 py-1"><div className="text-muted">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between text-xs">
        <span className="text-muted">Best: <span style={{ color: GENRE_COLORS[bestGenre(t)] }}>{bestGenre(t)}</span></span>
        <span className="font-semibold text-gold">{money(t.fee)}</span>
      </div>
      {footer}
    </div>
  );
  if (onClick) return <button className="text-left" onClick={onClick}>{inner}</button>;
  return <Link href={`/talent/${t.id}`} className="block">{inner}</Link>;
}

const STAGE_LABEL: Record<Film['stage'], string> = {
  development: 'Development', preproduction: 'Pre-production', filming: 'Filming', post: 'Post-production',
  ready: 'Awaiting release', released: 'In release', library: 'Library', shelved: 'Shelved',
};
export const stageLabel = (f: Film) => (f.stage === 'ready' && f.release ? 'Marketing' : STAGE_LABEL[f.stage]);

export function FilmCard({ f, s, premiere }: { f: Film; s: GameState; premiere?: boolean }) {
  const c = GENRE_COLORS[f.primaryGenre];
  return (
    <Link href={`/film/${f.id}`} className={`block ${premiere ? 'marquee' : ''}`}>
      <div className="panel relative h-full overflow-hidden p-3 transition hover:border-gold/60">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${c}, transparent)` }} />
        <div className="font-marquee text-xl leading-tight tracking-wide text-[#F3EEDF]">{f.title}</div>
        <div className="mt-0.5 text-xs text-muted">{f.primaryGenre}{f.secondaryGenre ? ` / ${f.secondaryGenre}` : ''} · {f.tier}</div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="chip">{stageLabel(f)}{f.stage === 'development' || f.stage === 'filming' || f.stage === 'post' ? ` · ${f.stageTurnsLeft} fn` : ''}</span>
          {f.release && f.release.t >= s.t && <span className="text-gold">{formatShort(f.release.t)}</span>}
          {f.gross > 0 && <span className="font-semibold text-gold">{money(f.gross)}</span>}
        </div>
      </div>
    </Link>
  );
}

export function ScoreBadge({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return <span className="chip">{label} —</span>;
  const color = value >= 75 ? '#34D399' : value >= 55 ? '#FBBF24' : '#F87171';
  return <span className="chip font-semibold" style={{ borderColor: color, color }}>{label} {value}</span>;
}
