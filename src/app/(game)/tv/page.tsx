'use client';
import Link from 'next/link';
import { useGame } from '@/store/game';
import { CHANNELS } from '@/data/channels';
import { GENRE_COLORS } from '@/lib/constants';
import { money } from '@/lib/format';
import { langName } from '@/lib/languages';
import { seriesProfit, seriesStageLabel } from '@/lib/engine/tv';
import { tvChart } from '@/lib/selectors';
import type { Genre, Series } from '@/lib/types';
import { Badge, Empty, LinkButton, PageHeader, Panel } from '@/components/ui';
import { channelById } from '@/data/channels';

export default function TVStudio() {
  const s = useGame((x) => x.state)!;
  const mine = (s.series ?? []).filter((x) => x.studioId === s.studio.id);
  const active = mine.filter((x) => x.stage !== 'ended' && x.stage !== 'cancelled');
  const past = mine.filter((x) => x.stage === 'ended' || x.stage === 'cancelled');
  const chart = tvChart(s);
  const channels = CHANNELS.filter((c) => !c.studioId || s.rivals.some((r) => r.id === c.studioId));

  const Card = ({ x }: { x: Series }) => {
    const ch = channelById(x.contract?.channelId);
    const last = x.seasons.at(-1);
    return (
      <Link href={`/tv/${x.id}`} className="panel block p-3 transition hover:border-gold/60">
        <div className="font-marquee text-xl leading-tight tracking-wide">{x.title}</div>
        <div className="mt-0.5 text-xs text-muted">{x.format} · {x.primaryGenre}{x.secondaryGenre ? ` / ${x.secondaryGenre}` : ''} · {langName(x.language)} · {x.episodes}×{x.runtime}m</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="chip">{seriesStageLabel(x)}</span>
          {x.season > 0 && <span className="chip">Season {x.season}</span>}
          {ch && <span className="chip text-gold">{ch.name}</span>}
          {x.ownService && <span className="chip text-gold">{s.studio.streaming?.name ?? 'Own service'}</span>}
          {x.offers.length > 0 && <span className="chip border-gold text-gold">{x.offers.length} offer{x.offers.length > 1 ? 's' : ''}</span>}
        </div>
        {last && <div className="mt-2 text-xs text-muted">Last season: {last.viewers.toFixed(2)}M viewers/ep · critics {last.critic}</div>}
      </Link>
    );
  };

  return (
    <div>
      <PageHeader title="TV Studio" sub="Develop series, sell them to channels, and chase the long run." right={<LinkButton href="/tv/new" variant="gold">+ Develop a series</LinkButton>} />
      <Panel title="Your series">
        {active.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{active.map((x) => <Card key={x.id} x={x} />)}</div>
          : <Empty>No series yet. <Link href="/tv/new" className="link">Develop your first show</Link>: write a pilot, attach stars, then pitch it to the channels below.</Empty>}
      </Panel>

      <Panel title="Now on air — TV ratings" className="mt-5" pad={false}>
        {chart.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>Show</th><th>Studio</th><th>Channel</th><th className="text-right">Latest ep</th><th className="text-right">Season avg</th><th className="text-right">Critics</th></tr></thead>
              <tbody>{chart.slice(0, 15).map((row, i) => (
                <tr key={row.x.id} className={row.mine ? 'bg-gold/10' : ''}>
                  <td className="text-muted">{i + 1}</td>
                  <td><Link href={`/tv/${row.x.id}`} className="hover:text-gold">{row.x.title}</Link> <span className="text-xs text-muted">S{row.x.season} · {row.x.format}</span></td>
                  <td><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: row.color }} />{row.studio}</td>
                  <td className="text-muted">{row.x.ownService ? s.studio.streaming?.name : channelById(row.x.contract?.channelId)?.name}</td>
                  <td className="text-right tabular-nums">{row.latest.toFixed(2)}M</td>
                  <td className="text-right tabular-nums text-muted">{row.avg.toFixed(2)}M</td>
                  <td className="text-right">{row.x.current?.critic}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="p-4"><Empty>Nothing on air this fortnight.</Empty></div>}
      </Panel>

      <Panel title="Channels & streamers" className="mt-5" pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Channel</th><th>Type</th><th>Languages</th><th>Loves</th><th className="text-right">Audience</th><th className="text-right">Max / ep</th><th className="text-right">Your shows</th></tr></thead>
            <tbody>
              {channels.map((c) => {
                const loves = (Object.entries(c.genres) as [Genre, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3);
                const formats = Object.entries(c.formats).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 2).map(([f]) => f);
                return (
                  <tr key={c.id}>
                    <td><div className="font-medium">{c.name}</div><div className="max-w-xs whitespace-normal text-xs text-muted">{c.blurb}</div></td>
                    <td className="capitalize text-muted">{c.kind}</td>
                    <td className="text-xs">{c.languages.slice(0, 4).map(langName).join(', ')}{c.languages.length > 4 ? '…' : ''}</td>
                    <td><div className="flex flex-wrap gap-1">{loves.map(([g]) => <Badge key={g} color={GENRE_COLORS[g]}>{g}</Badge>)}</div><div className="mt-1 text-xs text-muted">{formats.join(', ')}</div></td>
                    <td className="text-right tabular-nums">~{c.reach}M</td>
                    <td className="text-right tabular-nums">{money(c.maxBudgetPerEp)}</td>
                    <td className="text-right">{mine.filter((x) => x.contract?.channelId === c.id).length || '—'}<div className="text-[10px] text-muted">{(s.series ?? []).filter((x) => x.contract?.channelId === c.id && ['filming', 'post', 'airing', 'preproduction'].includes(x.stage)).length} active</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {past.length > 0 && (
        <Panel title="Past series" className="mt-5" pad={false}>
          <table className="tbl"><thead><tr><th>Title</th><th>Seasons</th><th>Episodes</th><th className="text-right">Profit</th></tr></thead><tbody>
            {past.map((x) => <tr key={x.id}><td><Link href={`/tv/${x.id}`} className="hover:text-gold">{x.title}</Link> <span className="text-xs text-muted">{x.stage}</span></td><td>{x.seasons.length}</td><td>{x.seasons.reduce((a, b) => a + b.episodes, 0)}</td><td className={`text-right ${seriesProfit(x) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(seriesProfit(x))}</td></tr>)}
          </tbody></table>
        </Panel>
      )}
    </div>
  );
}
