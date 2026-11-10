'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGame } from '@/store/game';
import { formatShort } from '@/lib/calendar';
import { compact, money } from '@/lib/format';
import { AD_SHARE, adArpu, canLaunch, launchCost, licencePrice, licensableTitles, licenseIn, opCost, revenuePerSubMonth, setAdTier, setPrice, titlePull, launchStreaming } from '@/lib/engine/streaming';
import { seriesPull, seriesStageLabel } from '@/lib/engine/tv';
import { studioById } from '@/lib/engine/util';
import { channelById } from '@/data/channels';
import { Button, Empty, Field, LinkButton, PageHeader, Panel, Stat } from '@/components/ui';

export default function Streaming() {
  const { state: s, act } = useGame();
  const [name, setName] = useState(s ? `${s.studio.name.split(' ')[0]}+` : '');
  const [price, setP] = useState(9.99);
  const [note, setNote] = useState<string | null>(null);
  if (!s) return null;
  const sv = s.studio.streaming;
  const rivals = s.rivals.filter((r) => r.rivalSubs).sort((a, b) => b.rivalSubs! - a.rivalSubs!);

  if (!sv) {
    const block = canLaunch(s);
    return (
      <div>
        <PageHeader title="Streaming Service" sub="Own the window. Keep the subscribers." />
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Launch your service">
            <div className="space-y-4">
              <Field label="Service name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label={`Monthly price — $${price.toFixed(2)}`}><input type="range" min={3.99} max={19.99} step={1} value={price} onChange={(e) => setP(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field>
              <div className="text-sm text-muted">Set-up cost {money(launchCost(s))}. Your back catalogue moves onto the service and new films flow in after their cinema window.</div>
              {block && <div className="text-sm text-amber-300">{block}</div>}
              <Button variant="ticket" disabled={!!block || !name.trim()} onClick={() => act((d) => launchStreaming(d, name.trim(), price))}>Launch</Button>
            </div>
          </Panel>
          <Panel title="The competition">
            {rivals.map((r) => <div key={r.id} className="flex justify-between py-1 text-sm"><span>{r.streamName} <span className="text-muted">({r.name})</span></span><span className="tabular-nums">{compact(r.rivalSubs!)}</span></div>)}
          </Panel>
        </div>
      </div>
    );
  }

  const data = sv.history.map((h) => ({ t: formatShort(h.t), subs: Math.round(h.subs / 1e4) / 100, rev: Math.round(h.revenue / 1e5) / 10 }));
  const titles = s.films.filter((f) => f.studioId === s.studio.id).map((f) => ({ f, pull: titlePull(s, f) })).filter((x) => x.pull > 0).sort((a, b) => b.pull - a.pull);
  const originals = (s.series ?? []).filter((x) => x.studioId === s.studio.id && x.ownService).map((x) => ({ x, pull: seriesPull(s, x) })).sort((a, b) => b.pull - a.pull);
  const fortnightRev = sv.subscribers * revenuePerSubMonth(s, sv) * 12 / 26;
  const licensed = (sv.licensed ?? []).filter((l) => l.untilT > s.t);
  const market = licensableTitles(s);
  const war = [{ name: sv.name, owner: s.studio.name, subs: sv.subscribers, shows: originals.filter((o) => o.x.stage === 'airing').length, mine: true },
    ...rivals.map((r) => ({ name: r.streamName!, owner: r.name, subs: r.rivalSubs!, shows: (s.series ?? []).filter((x) => x.stage === 'airing' && channelById(x.contract?.channelId)?.studioId === r.id).length, mine: false }))].sort((a, b) => b.subs - a.subs);
  return (
    <div>
      <PageHeader title={sv.name} sub={`Launched ${formatShort(sv.launchedT)}`} right={<LinkButton href="/tv/new" variant="gold">+ Develop an original series</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Subscribers" value={compact(sv.subscribers)} tone="gold" sub={`#${war.findIndex((w) => w.mine) + 1} of ${war.length} services`} />
        <Stat label="Monthly churn" value={`${(sv.churn * 100).toFixed(1)}%`} tone={sv.churn > 0.05 ? 'bad' : undefined} />
        <Stat label="Revenue / fortnight" value={money(fortnightRev)} sub={`Costs ${money(opCost(sv.subscribers))}`} />
        <Stat label="Library pull" value={compact(sv.libraryValue)} sub={`${titles.length} films · ${originals.length} series · ${licensed.length} licensed`} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Subscribers (M)" className="lg:col-span-2">
          {data.length > 1 ? <div className="h-64"><ResponsiveContainer><AreaChart data={data}><CartesianGrid stroke="#2A2A36" vertical={false} /><XAxis dataKey="t" tick={{ fill: '#8A8A9A', fontSize: 10 }} /><YAxis tick={{ fill: '#8A8A9A', fontSize: 11 }} width={40} /><Tooltip contentStyle={{ background: '#1D1D26', border: '1px solid #2A2A36', borderRadius: 8, fontSize: 12 }} /><Area dataKey="subs" stroke="#D4AF37" fill="#D4AF3733" /></AreaChart></ResponsiveContainer></div> : <Empty>Data arrives after the first fortnight.</Empty>}
        </Panel>
        <Panel title="Pricing & plans">
          <Field label={`$${sv.price.toFixed(2)} / month`} hint="Higher prices raise revenue per user but increase churn.">
            <input type="range" min={2.99} max={24.99} step={0.5} value={sv.price} onChange={(e) => act((d) => setPrice(d, Number(e.target.value)))} className="w-full accent-[#D4AF37]" />
          </Field>
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-[#D4AF37]" checked={!!sv.adTier} onChange={(e) => act((d) => setAdTier(d, e.target.checked))} />
            <span><span className="font-medium">Ad-supported plan</span><span className="block text-xs text-muted">A cheaper tier with ads. About 25% more subscribers and lower churn; {Math.round(AD_SHARE * 100)}% of members pick it, paying 55% of the price plus ${adArpu(s).toFixed(2)}/month in ad revenue each.</span></span>
          </label>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Original series" pad={false}>
          {originals.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Series</th><th>Status</th><th className="text-right">Subscriber pull</th><th className="text-right">Value to service</th></tr></thead><tbody>
            {originals.map(({ x, pull }) => <tr key={x.id}><td><Link href={`/tv/${x.id}`} className="hover:text-gold">{x.title}</Link> <span className="text-xs text-muted">{x.format}</span></td><td className="text-muted">{x.stage === 'airing' ? <span className="text-emerald-300">On air · S{x.season}</span> : seriesStageLabel(x)}</td><td className="text-right tabular-nums">{compact(pull)}</td><td className="text-right tabular-nums">{money(x.revenue)}</td></tr>)}
          </tbody></table></div> : <div className="p-4"><Empty>No originals yet. A series kept on your service pulls subscribers every season it airs, and keeps pulling from the back catalogue. Choose “Keep on your service” when you pitch.</Empty></div>}
        </Panel>
        <Panel title="Streaming wars" pad={false}>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Service</th><th className="text-right">Shows on air</th><th className="text-right">Subscribers</th></tr></thead><tbody>
            {war.map((w) => <tr key={w.name} className={w.mine ? 'bg-gold/10' : ''}><td>{w.name} <span className="text-xs text-muted">{w.owner}</span></td><td className="text-right">{w.shows}</td><td className="text-right tabular-nums">{compact(w.subs)}</td></tr>)}
          </tbody></table></div>
          <p className="p-3 text-xs text-muted">Rival services grow with their originals and streaming premieres. Every subscriber you win comes partly out of theirs.</p>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="License titles from other studios" pad={false}>
          {market.length ? <div className="max-h-[420px] overflow-auto"><div><table className="tbl"><thead><tr><th>Title</th><th>From</th><th className="text-right">Pull</th><th className="text-right">2 years</th></tr></thead><tbody>
            {market.map((m) => <tr key={m.id}><td>{m.title} <span className="text-xs text-muted">{m.kind}</span></td><td className="text-muted">{studioById(s, m.from)?.name}</td><td className="text-right tabular-nums">{compact(m.pull)}</td><td className="text-right"><Button size="sm" variant="ghost" disabled={s.studio.cash < licencePrice(m.pull, 2)} onClick={() => setNote(act((d) => licenseIn(d, m.id, 2)) ?? `${m.title} is on ${sv.name} for two years.`)}>{money(licencePrice(m.pull, 2))}</Button></td></tr>)}
          </tbody></table></div></div> : <div className="p-4"><Empty>Nothing worth licensing right now.</Empty></div>}
          {note && <div className="px-3 pb-3 text-xs text-gold">{note}</div>}
        </Panel>
        <Panel title="Top titles" pad={false}>
          {titles.length || licensed.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Title</th><th>Type</th><th className="text-right">Subscriber pull</th></tr></thead><tbody>
            {titles.slice(0, 12).map(({ f, pull }) => <tr key={f.id}><td><Link href={`/film/${f.id}`} className="hover:text-gold">{f.title}</Link></td><td className="text-muted">{f.release?.type === 'streaming' ? 'Original film' : f.release?.type === 'dayanddate' ? 'Day-and-date' : 'Library'}</td><td className="text-right tabular-nums">{compact(pull)}</td></tr>)}
            {licensed.map((l) => <tr key={l.id}><td>{l.title}</td><td className="text-muted">Licensed to {formatShort(l.untilT)}</td><td className="text-right tabular-nums">{compact(l.pull)}</td></tr>)}
          </tbody></table></div> : <div className="p-4"><Empty>Release films exclusively or let theatrical films reach their home window to build the library.</Empty></div>}
        </Panel>
      </div>
    </div>
  );
}
