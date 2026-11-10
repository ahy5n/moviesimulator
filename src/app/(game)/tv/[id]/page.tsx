'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Bar as RBar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGame } from '@/store/game';
import { channelById } from '@/data/channels';
import { GENRE_COLORS } from '@/lib/constants';
import { compact, money } from '@/lib/format';
import { langName } from '@/lib/languages';
import { allTalent, genreFit, isAvailable, talent } from '@/lib/talentDb';
import {
  acceptOffer, airingTurns, approachRegular, askingPerEp, canApproachRegular, dropRegular, endSeries, expectation, filmingTurns,
  keepOnOwnService, pitch, postTurns, readyToPitch, seasonCost, seriesById, seriesProfit, seriesPull, seriesQuality, seriesStageLabel, startIssues, startSeason,
  type RegularResponse,
} from '@/lib/engine/tv';
import type { Series } from '@/lib/types';
import { canMakeMovie, canSpinOffSeries } from '@/lib/engine/spinoffs';

import { Badge, Button, Empty, Field, LinkButton, Panel, Stat } from '@/components/ui';
import { Avatar, OvrBadge } from '@/components/cards';

const STEPS = ['Pilot', 'Package & pitch', 'Sign a deal', 'Shoot', 'On air', 'Renewal'];
function stepOf(x: Series) {
  switch (x.stage) {
    case 'development': return 0;
    case 'pitching': return x.offers.length ? 2 : 1;
    case 'preproduction': return 3;
    case 'filming': case 'post': return 3;
    case 'airing': return 4;
    default: return 5;
  }
}
const tip = { contentStyle: { background: '#1D1D26', border: '1px solid #2A2A36', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#8A8A9A' } };

export default function SeriesPage() {
  const { state: s, act } = useGame();
  const { id } = useParams<{ id: string }>();
  const [role, setRole] = useState<'lead' | 'support'>('lead');
  const [pick, setPick] = useState('');
  const [fee, setFee] = useState(0);
  const [reply, setReply] = useState<RegularResponse | null>(null);
  const x = s ? seriesById(s, decodeURIComponent(id)) : undefined;

  const suggestions = useMemo(() => {
    if (!s || !x) return [];
    const cap = role === 'lead' ? Math.max(60_000, x.budgetPerEp * 0.25) : Math.max(20_000, x.budgetPerEp * 0.08);
    return allTalent(s, 'actor')
      .filter((t) => isAvailable(s, t.id) && !x.regulars.some((r) => r.talentId === t.id) && askingPerEp(s, t, x, role) <= cap)
      .map((t) => ({ t, score: 0.5 * genreFit(t, x.primaryGenre, x.secondaryGenre) + 0.35 * t.attrs.overall + (role === 'lead' ? 0.2 * t.attrs.starPower : 0) - ((t.languages ?? []).includes(x.language) ? 0 : 40) }))
      .sort((a, b) => b.score - a.score).slice(0, 10).map((v) => v.t);
  }, [s, x, role]);

  if (!s || !x) return <Empty>Series not found. <Link href="/tv" className="link">Back to TV Studio</Link></Empty>;
  const mine = x.studioId === s.studio.id;
  const ch = channelById(x.contract?.channelId);
  const step = stepOf(x);
  const castingOpen = mine && ['development', 'pitching', 'preproduction'].includes(x.stage);
  const picked = pick ? talent(s, pick) : undefined;
  const asking = picked ? askingPerEp(s, picked, x, role) : 0;
  const issues = startIssues(s, x);
  const costPerEp = x.budgetPerEp + x.regulars.reduce((a, r) => a + r.feePerEp, 0);
  const totalEps = x.seasons.reduce((a, b) => a + b.episodes, 0) + (x.current?.aired ?? 0);
  const choose = (tid: string) => {
    const t = talent(s, tid)!;
    setPick(tid);
    setReply(null);
    setFee(askingPerEp(s, t, x, role));
  };
  const offer = (amount: number) => {
    const res = act((d) => approachRegular(d, x.id, pick, role, amount));
    if (res) { setReply(res); if (res.status === 'accepted') setPick(''); }
  };
  const seasonChart = x.seasons.map((r) => ({ s: `S${r.n}`, viewers: Math.round(r.viewers * 100) / 100, outcome: r.outcome }));
  const live = x.current?.viewers.map((v, i) => ({ s: `E${i + 1}`, viewers: Math.round(v * 100) / 100 })) ?? [];

  return (
    <div>
      <div className="panel relative mb-5 overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${GENRE_COLORS[x.primaryGenre]}, transparent)` }} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label"><Link href="/tv" className="hover:text-gold">TV Studio</Link> · {x.format} series</div>
            <h1 className="font-marquee text-4xl leading-none tracking-wide text-[#F7F1E0] sm:text-5xl">{x.title}</h1>
            <p className="mt-2 max-w-2xl text-sm italic text-[#CFC9BC]">“{x.logline}”</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge color={GENRE_COLORS[x.primaryGenre]}>{x.primaryGenre}</Badge>{x.secondaryGenre && <Badge color={GENRE_COLORS[x.secondaryGenre]}>{x.secondaryGenre}</Badge>}
              <Badge>{langName(x.language)}</Badge><Badge>{x.episodes} × {x.runtime} min</Badge><Badge>{money(x.budgetPerEp)}/ep</Badge>
              <Badge color="#D4AF37">{seriesStageLabel(x)}</Badge>
              {ch && <Badge color="#D4AF37">{ch.name}</Badge>}
              {x.ownService && <Badge color="#D4AF37">{s.studio.streaming?.name} original</Badge>}
              {x.syndicated && <Badge color="#34D399">Syndicated</Badge>}
            </div>
          </div>
          {x.season > 0 && <div className="text-right"><div className="label">Season</div><div className="font-marquee text-5xl text-gold">{x.season}</div></div>}
        </div>
        <ol className="mt-5 grid grid-cols-3 gap-1 sm:grid-cols-6">
          {STEPS.map((label, i) => (
            <li key={label} className={`rounded-md px-2 py-1.5 text-center text-[11px] ${i < step ? 'bg-gold/20 text-gold' : i === step ? 'bg-gold text-[#16120A] font-semibold' : 'bg-panel2 text-muted'}`}>{i + 1}. {label}</li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Spent" value={money(x.spent)} />
        <Stat label="Revenue" value={money(x.revenue)} tone="gold" sub={x.ownService ? `Share of ${s.studio.streaming?.name ?? 'service'} revenue it earns` : 'Licence fees, international, syndication'} />
        <Stat label="Profit" value={money(seriesProfit(x))} tone={seriesProfit(x) >= 0 ? 'good' : 'bad'} />
        {x.ownService
          ? <Stat label="Subscriber pull" value={compact(seriesPull(s, x))} sub={x.stage === 'airing' ? 'On air: pulling hardest now' : 'Back catalogue keeps pulling'} />
          : <Stat label="Episodes made" value={totalEps} sub={x.syndicated ? 'In syndication' : 'Syndication at 88 (long-running formats)'} />}
      </div>
      {mine && (canSpinOffSeries(s, x) || canMakeMovie(s, x)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {canSpinOffSeries(s, x) && <LinkButton href={`/tv/new?from=${x.id}`} size="sm">Develop a spin-off series</LinkButton>}
          {canMakeMovie(s, x) && <LinkButton href={`/develop?fromSeries=${x.id}`} size="sm">Make the movie</LinkButton>}
          <span className="text-xs text-muted">Spin-offs inherit the audience{x.franchiseId ? ' and the franchise' : ''}.</span>
        </div>
      )}

      {/* ---------------- What to do now ---------------- */}
      {mine && (
        <Panel title="Next step" className="mt-5">
          {x.stage === 'development' && (
            <p className="text-sm">The pilot is being written: {x.stageTurnsLeft} fortnight{x.stageTurnsLeft > 1 ? 's' : ''} to go. Start attaching stars now. A strong package gets better offers.</p>
          )}

          {x.stage === 'pitching' && !x.offers.length && (
            <div className="space-y-3 text-sm">
              <p>Pilot quality estimate: <span className="text-gold">{x.scriptRange[0]}–{x.scriptRange[1]}</span>. Channels look at the script, your stars, the budget and whether the language and format suit them.</p>
              {x.pitchedT !== undefined ? <div className="rounded-lg bg-panel2 p-3">Out to buyers. Offers arrive when you press Advance.</div>
                : (x.pitchCooldown ?? 0) > 0 ? <div className="rounded-lg bg-panel2 p-3 text-amber-300">Everyone passed. You can pitch again in {x.pitchCooldown} fortnight{x.pitchCooldown! > 1 ? 's' : ''}. Try attaching bigger stars or a better fit.</div>
                : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="ticket" disabled={!readyToPitch(x)} onClick={() => act((d) => pitch(d, x.id))}>Pitch to channels</Button>
                {s.studio.streaming && <Button variant="ghost" onClick={() => act((d) => keepOnOwnService(d, x.id))}>Keep it for {s.studio.streaming.name}</Button>}
              </div>
              {s.studio.streaming && <p className="text-xs text-muted">Keeping it in-house means no licence fees, but every season brings a wave of sign-ups to {s.studio.streaming.name}, the back catalogue keeps pulling subscribers, and a breakout hit lifts the whole service.</p>}
            </div>
          )}

          {x.offers.length > 0 && (
            <div>
              <p className="mb-3 text-sm text-muted">{x.offers[0].renewal ? `${channelById(x.offers[0].channelId)?.name} wants more. Take the deal or end the show.` : 'Pick a deal. Guaranteed seasons are locked in; option seasons happen only if the ratings are good enough.'}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {x.offers.map((o) => {
                  const c = channelById(o.channelId)!;
                  const perSeason = (o.feePerEp - costPerEp) * x.episodes;
                  return (
                    <div key={o.id} className="rounded-xl border border-gold/30 bg-panel2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div><div className="font-semibold">{c.name}</div><div className="text-xs capitalize text-muted">{c.kind} · ~{c.reach}M audience</div></div>
                        <div className="text-right"><div className="font-marquee text-3xl leading-none text-gold">{o.guaranteed}{o.options ? <span className="text-lg">+{o.options}</span> : null}</div><div className="text-[10px] text-muted">season{o.guaranteed + o.options > 1 ? 's' : ''}</div></div>
                      </div>
                      <div className="mt-2 text-sm italic">{o.note}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div><div className="label">Fee per episode</div><div className="text-base font-semibold">{money(o.feePerEp)}</div></div>
                        <div><div className="label">Guaranteed money</div><div className="text-base font-semibold">{money(o.feePerEp * x.episodes * o.guaranteed)}</div></div>
                        <div><div className="label">Per season vs costs</div><div className={`text-base font-semibold ${perSeason >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(perSeason)}</div></div>
                        <div><div className="label">To earn the option</div><div className="text-base font-semibold">{o.options ? `${expectation(c).toFixed(1)}M/ep` : '—'}</div></div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[11px] text-muted">Expires {o.expires <= s.t ? 'this fortnight' : `in ${o.expires - s.t} fortnight${o.expires - s.t > 1 ? 's' : ''}`}</span>
                        <Button onClick={() => act((d) => acceptOffer(d, x.id, o.id))}>Sign</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">Per season vs costs = licence fees minus production and regulars. Studios usually run a deficit on the licence and make it back on international sales and syndication.</p>
              {x.offers[0].renewal && <div className="mt-3"><Button variant="danger" size="sm" onClick={() => act((d) => endSeries(d, x.id))}>End the series</Button></div>}
            </div>
          )}

          {x.stage === 'preproduction' && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-panel2 p-3"><div className="label">Season {x.season + 1} cost</div><div className="text-lg font-semibold">{money(seasonCost(s, x))}</div><div className="text-xs text-muted">Regulars paid up front, production while shooting</div></div>
                <div className="rounded-lg bg-panel2 p-3"><div className="label">Schedule</div><div className="text-lg font-semibold">{filmingTurns(x) + postTurns(x)} fn to air</div><div className="text-xs text-muted">then {airingTurns(x)} fn on air</div></div>
                <div className="rounded-lg bg-panel2 p-3"><div className="label">Expected quality</div><div className="text-lg font-semibold">~{seriesQuality(s, x)}</div><div className="text-xs text-muted">from pilot, showrunner and cast</div></div>
              </div>
              {issues.length > 0 && <div className="text-amber-300">Before shooting: {issues.join(' ')}</div>}
              <div className="flex flex-wrap gap-2">
                <Button variant="ticket" disabled={issues.length > 0} onClick={() => act((d) => startSeason(d, x.id))}>Shoot season {x.season + 1}</Button>
                <Button variant="danger" size="sm" onClick={() => { if (confirm('End this series?')) act((d) => endSeries(d, x.id)); }}>End series</Button>
              </div>
            </div>
          )}

          {(x.stage === 'filming' || x.stage === 'post') && (
            <div className="text-sm">
              <div className="mb-1">{x.stage === 'filming' ? 'Shooting' : 'In post-production'}: season {x.season}, {x.stageTurnsLeft} fortnight{x.stageTurnsLeft > 1 ? 's' : ''} left.</div>
              <div className="h-2 rounded-full bg-panel2"><div className="h-2 rounded-full bg-gold" style={{ width: `${100 - (x.stageTurnsLeft / (x.stage === 'filming' ? filmingTurns(x) : postTurns(x))) * 100}%` }} /></div>
            </div>
          )}

          {x.stage === 'airing' && x.current && (
            <div className="text-sm">
              <div className="mb-2">Season {x.season} on air: {x.current.aired}/{x.episodes} episodes · critics {x.current.critic} · audience {x.current.audience}{ch ? ` · ${ch.name} needs ~${expectation(ch).toFixed(1)}M/ep` : ''}</div>
              {live.length > 0 && (
                <div className="h-48"><ResponsiveContainer><BarChart data={live}><CartesianGrid stroke="#2A2A36" vertical={false} /><XAxis dataKey="s" tick={{ fill: '#8A8A9A', fontSize: 10 }} /><YAxis tick={{ fill: '#8A8A9A', fontSize: 11 }} width={35} unit="M" /><Tooltip {...tip} /><RBar dataKey="viewers" fill="#D4AF37" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
              )}
            </div>
          )}

          {x.stage === 'between' && x.ownService && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ticket" onClick={() => act((d) => keepOnOwnService(d, x.id))}>Order season {x.season + 1}</Button>
              <Button variant="danger" size="sm" onClick={() => act((d) => endSeries(d, x.id))}>End the series</Button>
            </div>
          )}

          {(x.stage === 'ended' || x.stage === 'cancelled') && (
            <p className="text-sm">{x.stage === 'cancelled' ? 'Cancelled' : 'Ended'} after {x.seasons.length} season{x.seasons.length === 1 ? '' : 's'} and {totalEps} episodes. Profit {money(seriesProfit(x))}.</p>
          )}
        </Panel>
      )}

      {x.contract && (
        <Panel title="Contract" className="mt-5">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div><div className="label">Channel</div>{ch?.name}</div>
            <div><div className="label">Guaranteed seasons left</div>{x.contract.guaranteedLeft}</div>
            <div><div className="label">Option seasons left</div>{x.contract.optionsLeft}</div>
            <div><div className="label">Fee per episode</div>{money(x.contract.feePerEp)}</div>
          </div>
        </Panel>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Series regulars">
          <div className="space-y-1.5">
            {Array.from({ length: Math.max(x.leads, x.regulars.filter((r) => r.role === 'lead').length) }).map((_, i) => {
              const r = x.regulars.filter((y) => y.role === 'lead')[i];
              const t = r && talent(s, r.talentId);
              return <Regular key={`l${i}`} label={`Lead ${i + 1}`} name={t?.name} tid={t?.id} fee={r?.feePerEp} speaks={t ? (t.languages ?? []).includes(x.language) : true} onDrop={castingOpen && t ? () => act((d) => dropRegular(d, x.id, t.id)) : undefined} />;
            })}
            {x.regulars.filter((r) => r.role === 'support').map((r) => {
              const t = talent(s, r.talentId);
              return <Regular key={r.talentId} label="Support" name={t?.name} tid={t?.id} fee={r.feePerEp} speaks={t ? (t.languages ?? []).includes(x.language) : true} onDrop={castingOpen && t ? () => act((d) => dropRegular(d, x.id, t.id)) : undefined} />;
            })}
          </div>
          <div className="mt-2 text-xs text-muted">Regulars cost {money(x.regulars.reduce((a, r) => a + r.feePerEp, 0))} per episode in total and get a 6% raise each season.</div>
          {!castingOpen && mine && <div className="mt-2 text-xs text-muted">Casting reopens between seasons.</div>}
        </Panel>

        {castingOpen ? (
          <Panel title="Casting" right={<div className="flex gap-1">{(['lead', 'support'] as const).map((r) => <Button key={r} size="sm" variant={role === r ? 'gold' : 'ghost'} onClick={() => { setRole(r); setPick(''); setReply(null); }}>{r === 'lead' ? 'Leads' : 'Support'}</Button>)}</div>}>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {suggestions.map((t) => (
                <button key={t.id} onClick={() => choose(t.id)} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm ${pick === t.id ? 'border-gold bg-gold/10' : 'border-line bg-panel2 hover:border-gold/50'}`}>
                  <Avatar t={t} size={28} /><span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {!(t.languages ?? []).includes(x.language) && <span className="text-[10px] text-amber-300">no {langName(x.language)}</span>}
                  <OvrBadge value={t.attrs.overall} size="sm" />
                  <span className="w-20 text-right text-xs text-gold">{money(askingPerEp(s, t, x, role))}/ep</span>
                </button>
              ))}
              {!suggestions.length && <Empty>No one available in this price range.</Empty>}
            </div>
            {picked && (
              <div className="mt-4 rounded-lg border border-line bg-panel2 p-3">
                <div className="mb-2 flex items-center gap-2"><Avatar t={picked} size={36} /><div className="min-w-0 flex-1"><Link href={`/talent/${picked.id}`} className="font-semibold hover:text-gold">{picked.name}</Link><div className="text-xs text-muted">Asking {money(asking)}/ep · {money(asking * x.episodes)} a season</div></div></div>
                {(() => { const block = canApproachRegular(s, picked, x); return block ? <div className="text-sm text-amber-300">{block}</div> : (
                  <>
                    <Field label={`Your offer — ${money(fee)} per episode (${money(fee * x.episodes)} a season)`}>
                      <input type="range" min={Math.round(asking * 0.5)} max={Math.round(asking * 1.6)} step={1000} value={fee} onChange={(e) => setFee(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
                    </Field>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button onClick={() => offer(fee)}>Make offer</Button>
                      {reply?.status === 'countered' && reply.counter && <Button variant="ghost" onClick={() => offer(reply.counter!)}>Meet their {money(reply.counter)}/ep</Button>}
                    </div>
                  </>
                ); })()}
                {reply && <div className={`mt-2 text-sm ${reply.status === 'accepted' ? 'text-emerald-300' : reply.status === 'countered' ? 'text-gold' : 'text-red-300'}`}>{reply.note}</div>}
              </div>
            )}
            {reply?.status === 'accepted' && !picked && <div className="mt-3 text-sm text-emerald-300">{reply.note}</div>}
          </Panel>
        ) : (
          <Panel title="Seasons">
            {x.seasons.length ? (
              <>
                <div className="h-48"><ResponsiveContainer><BarChart data={seasonChart}><CartesianGrid stroke="#2A2A36" vertical={false} /><XAxis dataKey="s" tick={{ fill: '#8A8A9A', fontSize: 11 }} /><YAxis tick={{ fill: '#8A8A9A', fontSize: 11 }} width={35} unit="M" /><Tooltip {...tip} />
                  <RBar dataKey="viewers" radius={[3, 3, 0, 0]}>{seasonChart.map((d) => <Cell key={d.s} fill={d.outcome === 'cancelled' ? '#F87171' : '#D4AF37'} />)}</RBar></BarChart></ResponsiveContainer></div>
                <table className="tbl mt-3"><thead><tr><th>Season</th><th className="text-right">Viewers/ep</th><th className="text-right">Critics</th><th className="text-right">Audience</th>{x.ownService && <th className="text-right">Sub pull</th>}<th>Result</th></tr></thead><tbody>
                  {x.seasons.map((r) => <tr key={r.n}><td>S{r.n}</td><td className="text-right">{r.viewers.toFixed(2)}M</td><td className="text-right">{r.critic}</td><td className="text-right">{r.audience}</td>{x.ownService && <td className="text-right">{r.pull ? compact(r.pull) : '—'}</td>}<td className="capitalize text-muted">{r.outcome === 'ended' && x.ownService ? 'complete' : r.outcome}</td></tr>)}
                </tbody></table>
              </>
            ) : <Empty>No seasons aired yet.</Empty>}
          </Panel>
        )}
      </div>

      {castingOpen && x.seasons.length > 0 && (
        <Panel title="Seasons" className="mt-5" pad={false}>
          <table className="tbl"><thead><tr><th>Season</th><th className="text-right">Viewers/ep</th><th className="text-right">Critics</th><th>Result</th></tr></thead><tbody>
            {x.seasons.map((r) => <tr key={r.n}><td>S{r.n}</td><td className="text-right">{r.viewers.toFixed(2)}M</td><td className="text-right">{r.critic}</td><td className="capitalize text-muted">{r.outcome}</td></tr>)}
          </tbody></table>
        </Panel>
      )}

      {(x.awards?.length ?? 0) > 0 && (
        <Panel title="Awards" className="mt-5"><ul className="space-y-1 text-sm">{x.awards!.map((a, i) => { const p = a.talentId ? talent(s, a.talentId) : undefined; return <li key={i}>{a.won ? '🏆' : '•'} {a.body === 'crystal' ? 'Crystal Awards' : a.body === 'lens' ? 'Golden Lens' : a.body} {a.year} — {a.category}{p ? ` (${p.name})` : ''} <span className="text-muted">{a.won ? 'won' : 'nominated'}</span></li>; })}</ul></Panel>
      )}

      {x.events.length > 0 && (
        <Panel title="Log" className="mt-5"><ul className="space-y-1 text-sm">{x.events.map((e, i) => <li key={i}>• {e}</li>)}</ul></Panel>
      )}
    </div>
  );
}

function Regular({ label, name, tid, fee, speaks, onDrop }: { label: string; name?: string; tid?: string; fee?: number; speaks: boolean; onDrop?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm">
      <span className="label w-16 shrink-0">{label}</span>
      {name && tid ? <>
        <Link href={`/talent/${tid}`} className="min-w-0 flex-1 truncate hover:text-gold">{name}</Link>
        {!speaks && <span className="text-[10px] text-amber-300">language</span>}
        <span className="text-xs text-gold">{fee ? `${money(fee)}/ep` : ''}</span>
        {onDrop && <button className="text-xs text-muted hover:text-red-400" onClick={onDrop} title="Release">✕</button>}
      </> : <span className="text-muted">Open</span>}
    </div>
  );
}
