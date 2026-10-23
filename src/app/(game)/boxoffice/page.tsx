'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGame } from '@/store/game';
import { formatDate, yearOf } from '@/lib/calendar';
import { money, pct } from '@/lib/format';
import { chartFor } from '@/lib/selectors';
import { marketShares } from '@/lib/engine/finance';
import { Button, Empty, PageHeader, Panel } from '@/components/ui';
import { ScoreBadge } from '@/components/cards';

export default function BoxOffice() {
  const s = useGame((x) => x.state)!;
  const [t, setT] = useState(s.t - 1);
  const rows = chartFor(s, t);
  const year = yearOf(Math.max(0, t));
  const shares = marketShares(s, year).filter((x) => x.gross > 0);
  return (
    <div>
      <PageHeader title="Box Office" sub={t >= 0 ? `Fortnight of ${formatDate(t)}` : 'No weekends yet'} right={
        <>
          <Button size="sm" variant="ghost" disabled={t <= 0} onClick={() => setT(t - 1)}>←</Button>
          <Button size="sm" variant="ghost" disabled={t >= s.t - 1} onClick={() => setT(t + 1)}>→</Button>
        </>
      } />
      <Panel pad={false}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>Film</th><th>Studio</th><th className="text-right">Fortnight</th><th className="text-right">Change</th><th className="text-right">Total</th><th className="text-right">Week</th><th>Reviews</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const prev = chartFor(s, t - 1).find((x) => x.f.id === r.f.id);
                  const ch = prev ? r.gross / prev.gross - 1 : null;
                  return (
                    <tr key={r.f.id} className={r.mine ? 'bg-gold/10' : ''}>
                      <td className="font-marquee text-lg text-muted">{i + 1}</td>
                      <td><Link className="font-medium hover:text-gold" href={`/film/${r.f.id}`}>{r.f.title}</Link>{r.week === 1 && <span className="ml-2 chip text-gold">NEW</span>}</td>
                      <td><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />{r.studio}</td>
                      <td className="text-right tabular-nums">{money(r.gross)}</td>
                      <td className={`text-right tabular-nums ${ch === null ? 'text-muted' : ch >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{ch === null ? '—' : pct(ch)}</td>
                      <td className="text-right tabular-nums">{money(r.total)}</td>
                      <td className="text-right text-muted">{r.week}</td>
                      <td className="space-x-1"><ScoreBadge label="C" value={r.f.critic} /><ScoreBadge label="A" value={r.f.audience} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="p-4"><Empty>Nothing in cinemas this fortnight.</Empty></div>}
      </Panel>
      <Panel title={`${year} market share`} className="mt-5">
        {shares.length ? (
          <div style={{ height: Math.max(200, shares.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={shares.map((x) => ({ name: x.studio.name, share: Math.round(x.share * 1000) / 10, color: x.studio.color, mine: x.studio.isPlayer }))} layout="vertical" margin={{ left: 30 }}>
                <XAxis type="number" unit="%" tick={{ fill: '#8A8A9A', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#CFCAC0', fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: '#1D1D26', border: '1px solid #2A2A36', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="share" radius={[0, 4, 4, 0]}>{shares.map((x) => <Cell key={x.studio.id} fill={x.studio.isPlayer ? '#D4AF37' : x.studio.color + 'AA'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty>No grosses yet this year.</Empty>}
      </Panel>
    </div>
  );
}
