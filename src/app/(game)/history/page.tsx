'use client';
import Link from 'next/link';
import { useGame } from '@/store/game';
import { AWARD_BODIES } from '@/data/awards';
import { yearOf } from '@/lib/calendar';
import { compact, money, pct } from '@/lib/format';
import { myFilms, studioRecords } from '@/lib/selectors';
import { filmProfit } from '@/lib/engine/util';
import { talent } from '@/lib/talentDb';
import { Empty, PageHeader, Panel, Stat } from '@/components/ui';

export default function History() {
  const s = useGame((x) => x.state)!;
  const rec = studioRecords(s);
  const films = myFilms(s).filter((f) => f.stage === 'released' || f.stage === 'library').sort((a, b) => (b.release?.t ?? 0) - (a.release?.t ?? 0));
  const wins = films.flatMap((f) => f.awards.filter((a) => a.won).map((a) => ({ a, f })));
  const R = ({ label, f, v }: { label: string; f?: (typeof films)[number]; v?: string }) => (
    <div className="flex justify-between gap-2 py-1 text-sm"><span className="text-muted">{label}</span>{f ? <Link href={`/film/${f.id}`} className="truncate hover:text-gold">{f.title} <span className="text-gold">{v}</span></Link> : <span>—</span>}</div>
  );
  return (
    <div>
      <PageHeader title="Hall of Fame" sub={`${s.studio.name} · since 2026`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Films released" value={films.length} />
        <Stat label="Total gross" value={money(rec.total)} tone="gold" />
        <Stat label="Awards won" value={wins.length} />
        <Stat label="Academy Best Pictures" value={wins.filter((w) => w.a.body === 'academy' && w.a.category === 'Best Picture').length} tone="gold" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Records">
          <R label="Biggest hit" f={rec.biggest} v={rec.biggest && money(rec.biggest.gross)} />
          <R label="Biggest opening" f={rec.biggestOpening} v={rec.biggestOpening && money(rec.biggestOpening.weekly[0] ?? 0)} />
          <R label="Most profitable" f={rec.mostProfitable} v={rec.mostProfitable && money(filmProfit(rec.mostProfitable))} />
          <R label="Best reviewed" f={rec.bestReviewed} v={rec.bestReviewed && `${rec.bestReviewed.critic}%`} />
          <R label="Biggest flop" f={rec.worst} v={rec.worst && money(filmProfit(rec.worst))} />
        </Panel>
        <Panel title="Awards cabinet">
          {wins.length ? <ul className="space-y-1 text-sm">{wins.map(({ a, f }, i) => { const p = a.talentId && talent(s, a.talentId); return <li key={i}>🏆 <span className="text-gold">{AWARD_BODIES.find((b) => b.id === a.body)?.short ?? a.body}</span> {a.category} — <Link className="hover:text-gold" href={`/film/${f.id}`}>{f.title}</Link>{p && a.category !== 'Best Picture' ? ` (${p.name})` : ''} <span className="text-muted">{a.year}</span></li>; })}</ul> : <Empty>The shelf is waiting.</Empty>}
        </Panel>
      </div>
      <Panel title="Seasons" className="mt-5" pad={false}>
        {s.history.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Year</th><th>Studio</th><th className="text-right">Releases</th><th className="text-right">Gross</th><th className="text-right">Profit</th><th className="text-right">Share</th><th className="text-right">Rank</th><th className="text-right">Noms / wins</th><th className="text-right">Subs</th></tr></thead><tbody>
          {s.history.map((h) => <tr key={h.year}><td>{h.year}</td><td>{h.studioName}</td><td className="text-right">{h.released}</td><td className="text-right">{money(h.gross)}</td><td className={`text-right ${h.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(h.profit)}</td><td className="text-right">{pct(h.marketShare, 1)}</td><td className="text-right">#{h.rank}</td><td className="text-right">{h.noms} / {h.wins}</td><td className="text-right">{h.subs ? compact(h.subs) : '—'}</td></tr>)}
        </tbody></table></div> : <div className="p-4"><Empty>Your first season ends in December {yearOf(s.t)}.</Empty></div>}
      </Panel>
      <Panel title="Filmography" className="mt-5" pad={false}>
        {films.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Year</th><th>Title</th><th>Genre</th><th className="text-right">Gross</th><th className="text-right">Profit</th><th className="text-right">Critics</th></tr></thead><tbody>
          {films.map((f) => <tr key={f.id}><td>{f.release ? yearOf(f.release.t) : ''}</td><td><Link href={`/film/${f.id}`} className="hover:text-gold">{f.title}</Link></td><td className="text-muted">{f.primaryGenre}</td><td className="text-right">{money(f.gross)}</td><td className={`text-right ${filmProfit(f) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(filmProfit(f))}</td><td className="text-right">{f.critic ?? '—'}</td></tr>)}
        </tbody></table></div> : <div className="p-4"><Empty>No releases yet.</Empty></div>}
      </Panel>
    </div>
  );
}
