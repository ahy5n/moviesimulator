'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGame } from '@/store/game';
import { formatShort } from '@/lib/calendar';
import { compact, money } from '@/lib/format';
import { canLaunch, launchCost, opCost, setPrice, titlePull, launchStreaming } from '@/lib/engine/streaming';
import { Button, Empty, Field, PageHeader, Panel, Stat } from '@/components/ui';

export default function Streaming() {
  const { state: s, act } = useGame();
  const [name, setName] = useState(s ? `${s.studio.name.split(' ')[0]}+` : '');
  const [price, setP] = useState(9.99);
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
  const fortnightRev = sv.subscribers * sv.price * 12 / 26;
  return (
    <div>
      <PageHeader title={sv.name} sub={`Launched ${formatShort(sv.launchedT)}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Subscribers" value={compact(sv.subscribers)} tone="gold" />
        <Stat label="Monthly churn" value={`${(sv.churn * 100).toFixed(1)}%`} tone={sv.churn > 0.05 ? 'bad' : undefined} />
        <Stat label="Revenue / fortnight" value={money(fortnightRev)} sub={`Costs ${money(opCost(sv.subscribers))}`} />
        <Stat label="Library pull" value={compact(sv.libraryValue)} sub={`${titles.length} titles`} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Subscribers (M)" className="lg:col-span-2">
          {data.length > 1 ? <div className="h-64"><ResponsiveContainer><AreaChart data={data}><CartesianGrid stroke="#2A2A36" vertical={false} /><XAxis dataKey="t" tick={{ fill: '#8A8A9A', fontSize: 10 }} /><YAxis tick={{ fill: '#8A8A9A', fontSize: 11 }} width={40} /><Tooltip contentStyle={{ background: '#1D1D26', border: '1px solid #2A2A36', borderRadius: 8, fontSize: 12 }} /><Area dataKey="subs" stroke="#D4AF37" fill="#D4AF3733" /></AreaChart></ResponsiveContainer></div> : <Empty>Data arrives after the first fortnight.</Empty>}
        </Panel>
        <Panel title="Pricing">
          <Field label={`$${sv.price.toFixed(2)} / month`} hint="Higher prices raise revenue per user but increase churn.">
            <input type="range" min={2.99} max={24.99} step={0.5} value={sv.price} onChange={(e) => act((d) => setPrice(d, Number(e.target.value)))} className="w-full accent-[#D4AF37]" />
          </Field>
          <div className="mt-4 label">Rivals</div>
          {rivals.map((r) => <div key={r.id} className="flex justify-between py-0.5 text-sm"><span>{r.streamName}</span><span className="tabular-nums text-muted">{compact(r.rivalSubs!)}</span></div>)}
        </Panel>
      </div>
      <Panel title="Top titles" className="mt-5">
        {titles.length ? <table className="tbl"><thead><tr><th>Title</th><th>Type</th><th className="text-right">Subscriber pull</th></tr></thead><tbody>
          {titles.slice(0, 15).map(({ f, pull }) => <tr key={f.id}><td><Link href={`/film/${f.id}`} className="hover:text-gold">{f.title}</Link></td><td className="text-muted">{f.release?.type === 'streaming' ? 'Original' : f.release?.type === 'dayanddate' ? 'Day-and-date' : 'Library'}</td><td className="text-right tabular-nums">{compact(pull)}</td></tr>)}
        </tbody></table> : <Empty>Release films exclusively or let theatrical films reach their home window to build the library.</Empty>}
      </Panel>
    </div>
  );
}
