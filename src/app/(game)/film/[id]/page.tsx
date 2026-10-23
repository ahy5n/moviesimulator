'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Bar as RBar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGame } from '@/store/game';
import { formatDate, formatShort, yearOf } from '@/lib/calendar';
import { GENRE_COLORS, MARKET_NAMES, tierInfo } from '@/lib/constants';
import { COFINANCIERS } from '@/data/studios';
import { FESTIVALS } from '@/data/awards';
import { AWARD_BODIES } from '@/data/awards';
import { money } from '@/lib/format';
import { talent } from '@/lib/talentDb';
import { greenlight, greenlightIssues, qualityBreakdown, reshootCost, reshoots, setBudget, shelve, testScreening, testScreeningCost } from '@/lib/engine/production';
import { enterFestival } from '@/lib/engine/awards';
import { filmById, filmProfit, filmRevenue, isReleased, pay, studioById, totalCost } from '@/lib/engine/util';
import { MARKETS } from '@/lib/types';
import { Badge, Button, Empty, Field, LinkButton, Panel, Stat } from '@/components/ui';
import { Avatar, ScoreBadge, stageLabel } from '@/components/cards';

const tip = { contentStyle: { background: '#1D1D26', border: '1px solid #2A2A36', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#8A8A9A' } };

export default function FilmPage() {
  const { state: s, act } = useGame();
  const { id } = useParams<{ id: string }>();
  const [cofi, setCofi] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  if (!s) return null;
  const f = filmById(s, id);
  if (!f) return <Empty>Film not found (older rival films are archived).</Empty>;
  const st = studioById(s, f.studioId)!;
  const mine = st.isPlayer;
  const ti = tierInfo(f.tier);
  const issues = greenlightIssues(s, f);
  const released = isReleased(f);
  const weekly = f.weekly.map((g, i) => ({ w: `W${i + 1}`, gross: Math.round(g / 1e5) / 10 }));
  const markets = MARKETS.filter((m) => (f.byMarket[m] ?? 0) > 0).map((m) => ({ m: MARKET_NAMES[m], gross: Math.round((f.byMarket[m] ?? 0) / 1e5) / 10 })).sort((a, b) => b.gross - a.gross);
  const qb = mine && !released ? qualityBreakdown(s, f) : null;
  const year = yearOf(s.t);
  const festOptions = FESTIVALS.map((x) => ({ ...x, t: s.t - (s.t % 26) + x.turn })).filter((x) => x.t >= s.t);

  return (
    <div>
      <div className={`panel relative mb-5 overflow-hidden p-5 ${f.release?.t === s.t ? 'marquee' : ''}`}>
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${GENRE_COLORS[f.primaryGenre]}, ${GENRE_COLORS[f.secondaryGenre ?? f.primaryGenre]}, transparent)` }} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label">{st.name}</div>
            <h1 className="font-marquee text-4xl leading-none tracking-wide text-[#F7F1E0] sm:text-5xl">{f.title}</h1>
            <p className="mt-2 max-w-2xl text-sm italic text-[#CFC9BC]">“{f.logline}”</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge color={GENRE_COLORS[f.primaryGenre]}>{f.primaryGenre}</Badge>{f.secondaryGenre && <Badge color={GENRE_COLORS[f.secondaryGenre]}>{f.secondaryGenre}</Badge>}
              <Badge>{f.tone}</Badge><Badge>{f.tier}</Badge><Badge>{stageLabel(f)}</Badge>
              {f.franchiseId && <Badge color="#D4AF37">{s.franchises.find((x) => x.id === f.franchiseId)?.name}</Badge>}
              {f.chinaBlocked && <Badge color="#F87171">No China release</Badge>}
              {f.soldTo && <Badge>Sold to {studioById(s, f.soldTo)?.name}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {f.qualityKnown && <><ScoreBadge label="Critics" value={f.critic} /><ScoreBadge label="Audience" value={f.audience} /></>}
          </div>
        </div>
      </div>

      {msg && <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">{msg}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total cost" value={money(released ? f.spent : totalCost(f))} sub={`Production ${money(f.budget)}${f.overrun ? ` (+${Math.round(f.overrun * 100)}% overrun)` : ''}`} />
        <Stat label="Worldwide gross" value={money(f.gross)} sub={f.inTheatres ? `Week ${f.weeksOut} in cinemas` : f.release ? formatDate(f.release.t) : '—'} tone="gold" />
        <Stat label="Studio revenue" value={money(filmRevenue(f))} sub="Rentals, licensing, streaming, sales" />
        <Stat label="Profit" value={money(filmProfit(f))} tone={filmProfit(f) >= 0 ? 'good' : 'bad'} sub={released ? 'to date' : 'spent so far'} />
      </div>

      {mine && !released && f.stage !== 'shelved' && (
        <Panel title="Production" className="mt-5">
          {f.stage === 'development' && <p className="text-sm">Script in development — {f.stageTurnsLeft} fortnight{f.stageTurnsLeft > 1 ? 's' : ''} to go. You can start casting now.</p>}
          {(f.stage === 'filming' || f.stage === 'post') && (
            <div className="mb-3">
              <div className="mb-1 text-sm">{f.stage === 'filming' ? 'Filming' : 'Post-production'} — {f.stageTurnsLeft} fortnight{f.stageTurnsLeft > 1 ? 's' : ''} left</div>
              <div className="h-2 rounded-full bg-panel2"><div className="h-2 rounded-full bg-gold" style={{ width: `${100 - (f.stageTurnsLeft / (f.stage === 'filming' ? ti.filming : ti.post)) * 100}%` }} /></div>
            </div>
          )}
          {f.scriptRange && <div className="mb-3 text-sm">Script quality estimate: <span className="text-gold">{f.scriptRange[0]}–{f.scriptRange[1]}</span></div>}
          {(f.stage === 'development' || f.stage === 'preproduction') && (
            <div className="space-y-4">
              <Field label={`Production budget — ${money(f.budget)} (${f.tier})`} hint={`Script suggests ${money(f.suggestedBudget)}. Spending less hurts quality.`}>
                <input type="range" min={Math.max(3e5, f.suggestedBudget * 0.5)} max={f.suggestedBudget * 1.5} step={1e5} value={f.budget} onChange={(e) => act((d) => setBudget(filmById(d, f.id)!, Number(e.target.value)))} className="w-full accent-[#D4AF37]" />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <LinkButton href={`/casting/${f.id}`} variant="gold">Casting & crew</LinkButton>
                {f.stage === 'preproduction' && s.settings.difficulty === 'hard' && (
                  <select className="select" value={cofi} onChange={(e) => setCofi(Number(e.target.value))}>
                    <option value={0}>No co-financing</option>
                    {[0.25, 0.4, 0.5].map((x) => <option key={x} value={x}>Co-finance {x * 100}% ({money(f.budget * x)} in, {x * 100}% of revenue out)</option>)}
                  </select>
                )}
                {f.stage === 'preproduction' && (
                  <Button variant="ticket" disabled={issues.length > 0} onClick={() => act((d) => {
                    const film = filmById(d, f.id)!;
                    if (cofi) { const partner = COFINANCIERS[d.idCounter % COFINANCIERS.length]; pay(d, d.studio.id, film.budget * cofi, 'Co-financing'); film.spent -= film.budget * cofi; greenlight(d, film, { partner, share: cofi }); }
                    else greenlight(d, film);
                  })}>Greenlight</Button>
                )}
                <Button variant="danger" size="sm" onClick={() => { if (confirm('Shelve this project? Money spent is lost.')) act((d) => shelve(d, filmById(d, f.id)!)); }}>Shelve</Button>
              </div>
              {issues.length > 0 && f.stage === 'preproduction' && <div className="text-sm text-amber-300">Before filming: {issues.join(' ')}</div>}
              <div className="text-xs text-muted">Filming takes {ti.filming + (f.primaryGenre === 'Animation' ? 2 : 0)} fortnights, post-production {ti.post}. The budget is paid as you shoot.</div>
            </div>
          )}
          {(f.stage === 'post' || f.stage === 'ready') && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!f.testRange && <Button variant="ghost" onClick={() => act((d) => testScreening(d, filmById(d, f.id)!))}>Test screening ({money(testScreeningCost(f))})</Button>}
              {f.testRange && <span className="chip">Test screening: {f.testRange[0]}–{f.testRange[1]}</span>}
              {f.testRange && !f.events.some((e) => e.startsWith('Reshoots')) && <Button variant="ghost" onClick={() => act((d) => reshoots(d, filmById(d, f.id)!))}>Order reshoots ({money(reshootCost(f))})</Button>}
              {f.stage === 'ready' && <LinkButton href={`/release?film=${f.id}`} variant="gold">{f.release ? `Releases ${formatShort(f.release.t)}` : 'Plan release'}</LinkButton>}
            </div>
          )}
          {(f.stage === 'post' || f.stage === 'ready') && !f.festival && festOptions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Premiere at a festival ($150K):</span>
              {festOptions.map((x) => <Button key={x.id} size="sm" variant="ghost" disabled={s.festivalEntries.some((e) => e.filmId === f.id)} onClick={() => setMsg(act((d) => enterFestival(d, f.id, x.id)) ?? `Entered in the ${x.name}.`)}>{x.name} ({x.month})</Button>)}
              {s.festivalEntries.some((e) => e.filmId === f.id && e.year === year) && <span className="text-emerald-300">Entered ✓</span>}
            </div>
          )}
          {qb && f.stage !== 'development' && (
            <details className="mt-4 text-sm"><summary className="cursor-pointer text-muted">Producer&apos;s read (rough)</summary>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <span className="chip">Director {Math.round(qb.director)}</span><span className="chip">Cast fit {Math.round(qb.cast)}</span>
                <span className="chip">Chemistry ×{qb.chemistry.toFixed(2)}</span><span className="chip">Budget ×{qb.budget.toFixed(2)}</span>
                {s.settings.crewMode === 'full' && <span className="chip">Crew ×{qb.crew.toFixed(2)}</span>}
              </div>
            </details>
          )}
        </Panel>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Cast & crew">
          <div className="space-y-1.5">
            {f.cast.map((c) => { const t = talent(s, c.talentId); return t ? (
              <Link key={c.talentId} href={`/talent/${t.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-panel2">
                <Avatar t={t} size={30} /><span className="min-w-0 flex-1 truncate text-sm">{t.name}</span><span className="text-xs capitalize text-muted">{c.role}{c.backend ? ` · ${c.backend}%` : ''}</span>
              </Link>) : null; })}
            {(Object.entries(f.crew) as [string, { talentId: string } | undefined][]).map(([role, c]) => { const t = c && talent(s, c.talentId); return t ? (
              <Link key={role} href={`/talent/${t.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-panel2">
                <Avatar t={t} size={30} /><span className="min-w-0 flex-1 truncate text-sm">{t.name}</span><span className="text-xs capitalize text-muted">{role}</span>
              </Link>) : null; })}
            {!f.cast.length && <div className="text-sm text-muted">No cast yet.</div>}
          </div>
        </Panel>
        <Panel title="Weekly box office ($M)" className="lg:col-span-2">
          {weekly.length ? (
            <div className="h-56"><ResponsiveContainer>
              <LineChart data={weekly}><CartesianGrid stroke="#2A2A36" vertical={false} /><XAxis dataKey="w" tick={{ fill: '#8A8A9A', fontSize: 11 }} /><YAxis tick={{ fill: '#8A8A9A', fontSize: 11 }} width={40} /><Tooltip {...tip} /><Line dataKey="gross" stroke="#D4AF37" strokeWidth={2} dot={false} /></LineChart>
            </ResponsiveContainer></div>
          ) : <Empty>{f.release?.type === 'streaming' ? 'Streaming exclusive — no box office.' : 'Not in cinemas yet.'}</Empty>}
        </Panel>
      </div>

      {(markets.length > 0 || f.reviews) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {markets.length > 0 && (
            <Panel title="Gross by market ($M)">
              <div className="h-64"><ResponsiveContainer>
                <BarChart data={markets} layout="vertical" margin={{ left: 20 }}><CartesianGrid stroke="#2A2A36" horizontal={false} /><XAxis type="number" tick={{ fill: '#8A8A9A', fontSize: 11 }} /><YAxis type="category" dataKey="m" tick={{ fill: '#CFCAC0', fontSize: 11 }} width={90} /><Tooltip {...tip} /><RBar dataKey="gross" fill="#D4AF37" radius={[0, 4, 4, 0]} /></BarChart>
              </ResponsiveContainer></div>
            </Panel>
          )}
          {f.reviews && (
            <Panel title="Reviews" right={<span className="text-xs text-muted">Fresh-o-Meter</span>}>
              <div className="mb-3 flex gap-4">
                <div><div className="label">Critics</div><div className={`text-3xl font-bold ${f.critic! >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{f.critic}%</div></div>
                <div><div className="label">Audience</div><div className={`text-3xl font-bold ${f.audience! >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{f.audience}%</div></div>
                <div><div className="label">Quality</div><div className="text-3xl font-bold text-gold">{f.quality}</div></div>
              </div>
              <ul className="space-y-2">{f.reviews.map((r, i) => <li key={i} className="border-l-2 pl-3 text-sm" style={{ borderColor: r.score >= 60 ? '#34D399' : '#F87171' }}><span className="italic">“{r.quote}”</span><div className="text-xs text-muted">— {r.critic}, {r.outlet} · {r.score}/100</div></li>)}</ul>
            </Panel>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Awards">
          {f.awards.length ? <ul className="space-y-1 text-sm">{f.awards.map((a, i) => { const t = a.talentId && talent(s, a.talentId); return <li key={i}>{a.won ? '🏆' : '•'} {AWARD_BODIES.find((b) => b.id === a.body)?.short ?? FESTIVALS.find((x) => x.id === a.body)?.name} — {a.category}{t ? ` (${t.name})` : ''} <span className="text-muted">{a.won ? 'won' : 'nominated'}</span></li>; })}</ul> : <Empty>No awards yet.</Empty>}
          {f.festival && <div className="mt-2 text-sm text-muted">Premiered at {FESTIVALS.find((x) => x.id === f.festival!.id)?.name}: reception {f.festival.reception > 0 ? '+' : ''}{f.festival.reception}</div>}
        </Panel>
        <Panel title="Production log">
          {f.events.length ? <ul className="space-y-1 text-sm">{f.events.map((e, i) => <li key={i}>• {e}</li>)}</ul> : <Empty>Quiet so far.</Empty>}
          {f.cofinance && <div className="mt-2 text-sm text-muted">Co-financed by {f.cofinance.partner} ({f.cofinance.share * 100}% of revenue).</div>}
        </Panel>
      </div>
    </div>
  );
}
