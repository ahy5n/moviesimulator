'use client';
import Link from 'next/link';
import { useGame } from '@/store/game';
import { formatShort, yearOf } from '@/lib/calendar';
import { money, pct } from '@/lib/format';
import { GENRE_COLORS } from '@/lib/constants';
import { alerts, chartFor, marketPulse, myFilms } from '@/lib/selectors';
import { marketShares } from '@/lib/engine/finance';
import { studioById } from '@/lib/engine/util';
import { Bar, CountUp, Empty, LinkButton, PageHeader, Panel, Stat } from '@/components/ui';
import { FilmCard } from '@/components/cards';

export default function HQ() {
  const s = useGame((x) => x.state)!;
  const year = yearOf(s.t);
  const mine = myFilms(s);
  const active = mine.filter((f) => ['development', 'preproduction', 'filming', 'post', 'ready'].includes(f.stage));
  const upcoming = s.films.filter((f) => f.release && f.release.t >= s.t && f.stage === 'ready').sort((a, b) => a.release!.t - b.release!.t);
  const chart = chartFor(s, s.t - 1).slice(0, 10);
  const shares = marketShares(s, year);
  const myShare = shares.find((x) => x.studio.id === s.studio.id);
  const rank = shares.findIndex((x) => x.studio.id === s.studio.id) + 1;
  const al = alerts(s);

  return (
    <div>
      <PageHeader title="Studio HQ" sub={`${s.studio.name} · ${s.studio.hq}`} right={<><LinkButton href="/scripts" variant="gold">Find scripts</LinkButton><LinkButton href="/slate">Slate</LinkButton></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cash" value={<CountUp value={s.studio.cash} />} tone={s.studio.cash < 0 ? 'bad' : 'gold'} />
        <Stat label="Prestige" value={Math.round(s.studio.prestige)} sub="Attracts talent and voters" />
        <Stat label={`${year} market share`} value={pct(myShare?.share ?? 0, 1)} sub={myShare?.gross ? `#${rank} · ${money(myShare.gross)}` : 'No releases yet'} />
        {s.board ? <Stat label="Board confidence" value={Math.round(s.board.confidence)} tone={s.board.confidence < 30 ? 'bad' : s.board.confidence > 65 ? 'good' : undefined} sub="Below 20 = sacked" />
          : <Stat label="Active projects" value={active.length} sub={`${mine.filter((f) => f.stage === 'released').length} in release`} />}
      </div>

      {al.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {al.slice(0, 6).map((a, i) => (
            <Link key={i} href={a.href} className={`block rounded-lg border px-3 py-2 text-sm transition hover:brightness-125 ${a.tone === 'red' ? 'border-red-900 bg-red-950/40 text-red-200' : 'border-gold/30 bg-gold/5'}`}>⚑ {a.text}</Link>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Box office — last fortnight" className="lg:col-span-2" right={<Link className="link text-xs" href="/boxoffice">Full chart</Link>} pad={false}>
          {chart.length ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>#</th><th>Film</th><th>Studio</th><th className="text-right">Fortnight</th><th className="text-right">Total</th><th className="text-right">Wk</th></tr></thead>
                <tbody>{chart.map((r, i) => (
                  <tr key={r.f.id} className={r.mine ? 'bg-gold/10' : ''}>
                    <td className="text-muted">{i + 1}</td>
                    <td><Link href={`/film/${r.f.id}`} className="hover:text-gold">{r.f.title}</Link></td>
                    <td><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />{r.studio}</td>
                    <td className="text-right tabular-nums">{money(r.gross)}</td>
                    <td className="text-right tabular-nums text-muted">{money(r.total)}</td>
                    <td className="text-right text-muted">{r.week}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-4"><Empty>No films in cinemas yet. Press Advance to roll the calendar.</Empty></div>}
        </Panel>

        <Panel title="Market pulse" right={<span className="text-[10px] text-muted">research is noisy</span>}>
          <div className="space-y-2">
            {marketPulse(s).map((m) => (
              <Bar key={m.g} value={m.shown} max={1.5} color={GENRE_COLORS[m.g]} label={m.g} right={m.shown >= 1.12 ? '🔥 Hot' : m.shown <= 0.88 ? '❄ Cold' : `${m.shown.toFixed(2)}×`} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Your slate" className="lg:col-span-2" right={<Link className="link text-xs" href="/slate">Production slate</Link>}>
          {active.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{active.slice(0, 9).map((f) => <FilmCard key={f.id} f={f} s={s} premiere={f.release?.t === s.t} />)}</div>
          ) : <Empty>No projects yet. <Link href="/scripts" className="link">Buy a script</Link> or <Link href="/develop" className="link">develop your own</Link>.</Empty>}
        </Panel>
        <Panel title="Coming soon">
          {upcoming.length ? (
            <ul className="space-y-2 text-sm">
              {upcoming.slice(0, 10).map((f) => {
                const st = studioById(s, f.studioId)!;
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <Link href={`/film/${f.id}`} className={`truncate hover:text-gold ${st.isPlayer ? 'font-semibold text-gold' : ''}`}>{f.title}</Link>
                    <span className="shrink-0 text-xs text-muted">{st.isPlayer ? 'You' : st.name} · {formatShort(f.release!.t)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>Nothing scheduled.</Empty>}
        </Panel>
      </div>

      <Panel title="Latest news" className="mt-5" right={<Link className="link text-xs" href="/inbox">Inbox</Link>}>
        <ul className="divide-y divide-line text-sm">
          {s.inbox.slice(0, 6).map((m) => (
            <li key={m.id} className="py-2"><Link href={m.link ?? '/inbox'} className="hover:text-gold"><span className="mr-2 text-xs text-muted">{formatShort(m.t)}</span>{m.title}</Link></li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
