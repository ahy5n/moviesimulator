'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { formatShort, yearOf } from '@/lib/calendar';
import { GENRE_COLORS } from '@/lib/constants';
import { compact, money, pct } from '@/lib/format';
import { marketShares } from '@/lib/engine/finance';
import type { Genre } from '@/lib/types';
import { Badge, Empty, PageHeader, Panel } from '@/components/ui';
import { stageLabel } from '@/components/cards';

export default function Rivals() {
  const s = useGame((x) => x.state)!;
  const [sel, setSel] = useState(s.rivals[0]?.id);
  const shares = marketShares(s, yearOf(s.t));
  const r = s.rivals.find((x) => x.id === sel)!;
  const slate = s.films.filter((f) => f.studioId === r.id && f.stage !== 'library' && f.stage !== 'shelved').sort((a, b) => (a.release?.t ?? 999) - (b.release?.t ?? 999));
  const recent = s.films.filter((f) => f.studioId === r.id && f.stage === 'library').sort((a, b) => (b.release?.t ?? 0) - (a.release?.t ?? 0)).slice(0, 8);
  const prefs = Object.entries(r.personality?.genres ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 5);
  return (
    <div>
      <PageHeader title="Rival Studios" sub="Who's making what, and when it opens." />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {s.rivals.map((x) => {
          const sh = shares.find((y) => y.studio.id === x.id);
          return (
            <button key={x.id} onClick={() => setSel(x.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-left ${sel === x.id ? 'border-gold bg-gold/10' : 'border-line bg-panel'}`}>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} /><span className="text-sm font-semibold">{x.name}</span></div>
              <div className="text-xs text-muted">{pct(sh?.share ?? 0, 1)} share</div>
            </button>
          );
        })}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title={r.name}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Prestige</span><span>{Math.round(r.prestige)}</span></div>
            <div className="flex justify-between"><span className="text-muted">War chest</span><span>{money(r.cash)}</span></div>
            {r.streamName && <div className="flex justify-between"><span className="text-muted">{r.streamName}</span><span>{compact(r.rivalSubs ?? 0)} subs</span></div>}
            {r.personality && <>
              <div className="flex justify-between"><span className="text-muted">Films per year</span><span>~{r.personality.slate}</span></div>
              <div className="flex justify-between"><span className="text-muted">Style</span><span>{r.personality.prestige > 0.6 ? 'Prestige' : r.personality.prestige < 0.35 ? 'Commercial' : 'Balanced'} · {r.personality.risk > 0.65 ? 'risk-taker' : 'cautious'}{r.personality.streamingFirst > 0.5 ? ' · streaming-first' : ''}</span></div>
              <div><div className="label mb-1 mt-2">Loves</div><div className="flex flex-wrap gap-1">{prefs.map(([g]) => <Badge key={g} color={GENRE_COLORS[g as Genre]}>{g}</Badge>)}</div></div>
            </>}
          </div>
        </Panel>
        <Panel title="Upcoming slate" className="lg:col-span-2" pad={false}>
          {slate.length ? (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Title</th><th>Genre</th><th>Tier</th><th>Stage</th><th className="text-right">Release</th></tr></thead><tbody>
              {slate.map((f) => <tr key={f.id}><td><Link href={`/film/${f.id}`} className="hover:text-gold">{f.title}</Link></td><td style={{ color: GENRE_COLORS[f.primaryGenre] }}>{f.primaryGenre}</td><td>{f.tier}</td><td className="text-muted">{stageLabel(f)}</td><td className="text-right">{f.release ? `${formatShort(f.release.t)}${f.release.type === 'streaming' ? ' (stream)' : ''}` : 'TBC'}</td></tr>)}
            </tbody></table></div>
          ) : <div className="p-4"><Empty>Nothing announced.</Empty></div>}
        </Panel>
      </div>
      <Panel title="Recent releases" className="mt-5" pad={false}>
        {recent.length ? <table className="tbl"><thead><tr><th>Title</th><th className="text-right">Gross</th><th className="text-right">Critics</th></tr></thead><tbody>
          {recent.map((f) => <tr key={f.id}><td><Link href={`/film/${f.id}`} className="hover:text-gold">{f.title}</Link></td><td className="text-right">{f.release?.type === 'streaming' ? 'streaming' : money(f.gross)}</td><td className="text-right">{f.critic ?? '—'}</td></tr>)}
        </tbody></table> : <div className="p-4"><Empty>None yet.</Empty></div>}
      </Panel>
    </div>
  );
}
