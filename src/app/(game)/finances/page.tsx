'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGame } from '@/store/game';
import { yearOf } from '@/lib/calendar';
import { money } from '@/lib/format';
import { debt, loanRate, maxDebt, overheadPerTurn, repayLoan, takeLoan } from '@/lib/engine/finance';
import { filmProfit, filmRevenue } from '@/lib/engine/util';
import { Button, Empty, Field, PageHeader, Panel, Stat } from '@/components/ui';

export default function Finances() {
  const { state: s, act } = useGame();
  const [year, setYear] = useState(s ? yearOf(s.t) : 2026);
  const [amt, setAmt] = useState(50e6);
  const [term, setTerm] = useState(52);
  const [err, setErr] = useState<string | null>(null);
  if (!s) return null;
  const hard = s.settings.difficulty === 'hard';
  const L = s.ledger[year] ?? {};
  const inc = Object.entries(L).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const exp = Object.entries(L).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const net = Object.values(L).reduce((a, b) => a + b, 0);
  const years = Object.keys(s.ledger).map(Number).sort();
  const chart = years.map((y) => { const l = s.ledger[y]; return { y, income: Math.round(Object.values(l).filter((v) => v > 0).reduce((a, b) => a + b, 0) / 1e6), costs: Math.round(-Object.values(l).filter((v) => v < 0).reduce((a, b) => a + b, 0) / 1e6) }; });
  const films = s.films.filter((f) => f.studioId === s.studio.id && f.spent > 0).sort((a, b) => (b.release?.t ?? 9e9) - (a.release?.t ?? 9e9));

  return (
    <div>
      <PageHeader title="Finances" sub={hard ? 'Hard mode: overheads, loans and co-financing.' : 'Easy mode: cash in, cash out.'} right={<select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>{(years.length ? years : [year]).map((y) => <option key={y}>{y}</option>)}</select>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cash" value={money(s.studio.cash)} tone={s.studio.cash < 0 ? 'bad' : 'gold'} />
        <Stat label={`${year} net`} value={money(net)} tone={net >= 0 ? 'good' : 'bad'} />
        {hard ? <Stat label="Overheads / fortnight" value={money(overheadPerTurn(s))} /> : <Stat label="Bailout" value={s.bailoutUsed ? 'Used' : 'Available'} sub="One more chance if you go broke" />}
        {hard ? <Stat label="Debt" value={money(debt(s))} sub={`Limit ${money(maxDebt(s))}`} /> : <Stat label="Films made" value={films.length} />}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title={`${year} income`}>{inc.length ? inc.map(([k, v]) => <div key={k} className="flex justify-between py-1 text-sm"><span>{k}</span><span className="text-emerald-400">{money(v)}</span></div>) : <Empty>None yet.</Empty>}</Panel>
        <Panel title={`${year} costs`}>{exp.length ? exp.map(([k, v]) => <div key={k} className="flex justify-between py-1 text-sm"><span>{k}</span><span className="text-red-400">{money(-v)}</span></div>) : <Empty>None yet.</Empty>}</Panel>
      </div>
      {chart.length > 1 && (
        <Panel title="By year ($M)" className="mt-5"><div className="h-56"><ResponsiveContainer><BarChart data={chart}><CartesianGrid stroke="#2A2A36" vertical={false} /><XAxis dataKey="y" tick={{ fill: '#8A8A9A', fontSize: 11 }} /><YAxis tick={{ fill: '#8A8A9A', fontSize: 11 }} width={45} /><Tooltip contentStyle={{ background: '#1D1D26', border: '1px solid #2A2A36', borderRadius: 8, fontSize: 12 }} /><Bar dataKey="income" fill="#34D399" /><Bar dataKey="costs" fill="#F87171" /></BarChart></ResponsiveContainer></div></Panel>
      )}
      {hard && (
        <Panel title="Loans" className="mt-5">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Field label={`Amount — ${money(amt)}`}><input type="range" min={5e6} max={Math.max(10e6, maxDebt(s) - debt(s))} step={5e6} value={amt} onChange={(e) => setAmt(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field>
            <Field label={`Term — ${term / 26} year${term > 26 ? 's' : ''}`}><select className="select w-full" value={term} onChange={(e) => setTerm(Number(e.target.value))}>{[26, 52, 78].map((t) => <option key={t} value={t}>{t / 26} year{t > 26 ? 's' : ''}</option>)}</select></Field>
            <Button onClick={() => setErr(act((d) => takeLoan(d, amt, term)) ?? null)}>Borrow at {(loanRate(s) * 100).toFixed(1)}%</Button>
          </div>
          {err && <div className="mt-2 text-sm text-red-400">{err}</div>}
          {s.loans.length > 0 && <table className="tbl mt-4"><thead><tr><th>Principal</th><th>Balance</th><th>Rate</th><th>Payment</th><th>Left</th><th /></tr></thead><tbody>
            {s.loans.map((l) => <tr key={l.id}><td>{money(l.principal)}</td><td>{money(l.balance)}</td><td>{(l.rate * 100).toFixed(1)}%</td><td>{money(l.payment)}/fn</td><td>{l.turnsLeft} fn</td><td><Button size="sm" variant="ghost" disabled={s.studio.cash < l.balance} onClick={() => act((d) => repayLoan(d, l.id))}>Repay</Button></td></tr>)}
          </tbody></table>}
        </Panel>
      )}
      <Panel title="Film P&L" className="mt-5" pad={false}>
        {films.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Film</th><th className="text-right">Spent</th><th className="text-right">Gross</th><th className="text-right">Revenue</th><th className="text-right">Profit</th></tr></thead><tbody>
          {films.map((f) => <tr key={f.id}><td><Link href={`/film/${f.id}`} className="hover:text-gold">{f.title}</Link></td><td className="text-right">{money(f.spent)}</td><td className="text-right">{money(f.gross)}</td><td className="text-right">{money(filmRevenue(f))}</td><td className={`text-right ${filmProfit(f) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(filmProfit(f))}</td></tr>)}
        </tbody></table></div> : <div className="p-4"><Empty>No films yet.</Empty></div>}
      </Panel>
    </div>
  );
}
