'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { useGame } from '@/store/game';
import { ageAt, formatShort, yearOf } from '@/lib/calendar';
import { GENRE_COLORS, MARKET_NAMES, TRAIT_INFO, countryName, flag } from '@/lib/constants';
import { money } from '@/lib/format';
import { availableFrom, bestGenre, isAvailable, talent } from '@/lib/talentDb';
import { studioById } from '@/lib/engine/util';
import { loyaltyDiscount, loyaltyLabel, loyaltyTo, PICKY_BYPASS_AT, SKIP_WAR_AT } from '@/lib/engine/loyalty';
import { GENRES, MARKETS } from '@/lib/types';
import { Badge, Bar, Empty, Panel } from '@/components/ui';
import { Avatar, OvrBadge } from '@/components/cards';

export default function TalentProfile() {
  const s = useGame((x) => x.state)!;
  const { id } = useParams<{ id: string }>();
  const t = talent(s, decodeURIComponent(id));
  if (!t) return <Empty>Person not found.</Empty>;
  const ov = s.talentOverrides[t.id];
  const commit = s.commitments[t.id];
  const free = isAvailable(s, t.id);
  const until = availableFrom(s, t.id);
  const bg = bestGenre(t);
  const radar = GENRES.map((g) => ({ g, v: t.genres[g] }));
  const inGame = s.films.filter((f) => f.cast.some((c) => c.talentId === t.id) || Object.values(f.crew).some((c) => c?.talentId === t.id));
  const myFilms = s.films.filter((f) => f.studioId === s.studio.id && ['development', 'preproduction'].includes(f.stage));
  const attrs: [string, number][] = [
    ['Star Power', t.attrs.starPower], [t.kind === 'actor' ? 'Acting Skill' : 'Craft', t.attrs.acting], ['Box Office Draw', t.attrs.boxOffice],
    ['Range', t.attrs.range], ['Chemistry', t.attrs.chemistry], ['Reliability', t.attrs.reliability], ['Experience', t.attrs.experience],
  ];
  return (
    <div>
      <div className="panel mb-5 flex flex-wrap items-center gap-4 p-5" style={{ background: `linear-gradient(120deg, ${GENRE_COLORS[bg]}22, transparent 60%)` }}>
        <Avatar t={t} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="h-display text-3xl font-bold">{t.name}</h1>
          <div className="mt-1 text-sm text-muted">{flag(t.nationality)} {countryName(t.nationality)} · Age {ageAt(t.birthDate, s.t)} · <span className="capitalize">{t.kind === 'actor' ? (t.gender === 'F' ? 'actress' : 'actor') : t.kind}</span>{t.isFictional ? ' · fictional' : ''}{ov?.retired ? ' · retired' : ''}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{t.traits.map((tr) => <span key={tr} className="chip" title={TRAIT_INFO[tr]}>{tr}</span>)}</div>
        </div>
        <div className="text-right">
          <OvrBadge value={t.attrs.overall} size="lg" />
          <div className="mt-2 text-sm">Fee <span className="font-semibold text-gold">{money(t.fee)}</span></div>
          {t.backendDemand > 0 && <div className="text-xs text-muted">wants {t.backendDemand}% backend</div>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Attributes">
          <div className="space-y-2.5">{attrs.map(([k, v]) => <Bar key={k} label={k} value={v} color={v >= 80 ? '#D4AF37' : v >= 60 ? '#9EA1AB' : '#B07A4F'} />)}</div>
          {t.potential > t.attrs.overall && <div className="mt-3 text-sm text-emerald-300">Scouts see potential of ~{t.potential}.</div>}
        </Panel>
        <Panel title="Genre ratings">
          <div className="h-64">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="#2A2A36" />
                <PolarAngleAxis dataKey="g" tick={{ fill: '#8A8A9A', fontSize: 9 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke="#D4AF37" strokeWidth={1.5} fill={GENRE_COLORS[bg]} fillOpacity={0.45} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Regional appeal">
          <div className="space-y-2">{MARKETS.map((m) => <Bar key={m} label={MARKET_NAMES[m]} value={t.regional[m]} color="#5C9EE6" />)}</div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Availability">
          {free ? <div className="text-emerald-400">Available now.</div> : (
            <div className="text-sm">
              <div className="text-amber-300">Busy until {formatShort(until)}</div>
              {commit && <div className="mt-1 text-muted">{commit.filmId ? <>On <Link className="link" href={`/film/${commit.filmId}`}>{s.films.find((f) => f.id === commit.filmId)?.title ?? 'a project'}</Link></> : 'Committed'} for {studioById(s, commit.studioId)?.name ?? 'a studio'}.</div>}
            </div>
          )}
          <div className="mt-3 flex h-4 overflow-hidden rounded bg-panel2" title="Next 12 fortnights">
            {Array.from({ length: 12 }, (_, i) => <div key={i} className={`flex-1 border-r border-ink ${s.t + i < until ? 'bg-amber-500/60' : 'bg-emerald-600/50'}`} />)}
          </div>
          <div className="mt-1 text-[10px] text-muted">Next 24 weeks</div>
          {free && myFilms.length > 0 && (
            <div className="mt-4"><div className="label mb-1">Approach for</div>
              {myFilms.map((f) => <Link key={f.id} href={`/casting/${f.id}?talent=${t.id}`} className="mb-1 block rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm hover:border-gold">{f.title} →</Link>)}
            </div>
          )}
          {(() => {
            const l = loyaltyTo(s, t.id, s.studio.id);
            if (!l.total) return null;
            return (
              <div className="mt-4 rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm">
                <div className="flex justify-between"><span className="label">Loyalty</span><span className="text-gold">{loyaltyLabel(l.total)}</span></div>
                <div className="mt-1 flex justify-between"><span className="text-muted">To {s.studio.name}</span><span className="tabular-nums">{l.studio.toFixed(1)}</span></div>
                <div className="flex justify-between"><span className="text-muted">To you (follows you)</span><span className="tabular-nums">{l.producer.toFixed(1)}</span></div>
                <div className="mt-1 text-xs text-muted">{Math.round(loyaltyDiscount(t, l.total) * 100)}% off their fee{l.total >= SKIP_WAR_AT ? ' · talks to you before rivals (no bidding war)' : ''}{t.traits.includes('Picky') && l.total >= PICKY_BYPASS_AT ? ' · will read non-prestige scripts for you' : ''}</div>
              </div>
            );
          })()}
        </Panel>
        <Panel title="Filmography" className="lg:col-span-2">
          {inGame.length > 0 && (
            <div className="mb-3">
              <div className="label mb-1">In-game</div>
              <div className="flex flex-wrap gap-1.5">{inGame.map((f) => <Link key={f.id} href={`/film/${f.id}`}><Badge color={studioById(s, f.studioId)?.color}>{f.title}{f.release ? ` (${yearOf(f.release.t)})` : ''}</Badge></Link>)}</div>
            </div>
          )}
          {t.credits.filter((c) => !c.inGame).length ? (
            <table className="tbl"><thead><tr><th>Year</th><th>Title</th><th className="text-right">Billing</th></tr></thead>
              <tbody>{t.credits.filter((c) => !c.inGame).map((c, i) => <tr key={i}><td className="text-muted">{c.year}</td><td>{c.title}</td><td className="text-right text-muted">{t.kind === 'actor' ? `#${c.billing}` : '—'}</td></tr>)}</tbody>
            </table>
          ) : <Empty>{t.isFictional ? 'A fresh face — no credits yet.' : 'No credits on file.'}</Empty>}
        </Panel>
      </div>
      <p className="mt-6 text-xs text-muted">Ratings are calculated from public filmography data and are not statements about any real person.</p>
    </div>
  );
}
