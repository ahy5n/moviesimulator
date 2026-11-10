'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { formatShort } from '@/lib/calendar';
import { money } from '@/lib/format';
import { buyLibrary, makeRightsOffer, rightsListings, type OfferResult, type RightsListing } from '@/lib/engine/rights';
import { studioById } from '@/lib/engine/util';
import { Button, Empty, PageHeader, Panel, Tabs } from '@/components/ui';

function Row({ l }: { l: RightsListing }) {
  const { state: s, act } = useGame();
  const [amount, setAmount] = useState('');
  const [res, setRes] = useState<OfferResult | null>(null);
  if (!s) return null;
  const owner = studioById(s, l.owner);
  const distressed = (owner?.distressUntil ?? -1) > s.t;
  const send = (v: number) => setRes(act((d) => makeRightsOffer(d, l.kind, l.id, v)) ?? null);
  return (
    <tr>
      <td>
        {l.kind === 'film' ? <Link href={`/film/${l.id}`} className="font-medium hover:text-gold">{l.title}</Link> : <span className="font-marquee text-lg tracking-wide">{l.title}</span>}
        <div className="text-xs text-muted">{l.detail}</div>
      </td>
      <td>{owner?.name}{distressed && <div className="text-xs text-amber-300">Distressed: selling cheap</div>}</td>
      <td className="text-right tabular-nums">{money(l.value)}</td>
      <td className="w-[320px]">
        {res?.status === 'accepted' ? <span className="text-emerald-300">Yours.</span> : (
          <div className="flex items-center gap-1.5">
            <input className="input w-24" placeholder={(l.value / 1e6).toFixed(1)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="text-xs text-muted">$M</span>
            <Button size="sm" disabled={!Number(amount)} onClick={() => send(Math.round(Number(amount) * 1e6))}>Offer</Button>
            {res?.status === 'countered' && res.ask && <Button size="sm" variant="ghost" disabled={s.studio.cash < res.ask} onClick={() => send(res.ask!)}>Pay {money(res.ask)}</Button>}
          </div>
        )}
        {res && res.status !== 'accepted' && <div className={`mt-1 text-xs ${res.status === 'countered' ? 'text-gold' : 'text-red-300'}`}>{res.note}</div>}
      </td>
    </tr>
  );
}

export default function RightsMarket() {
  const { state: s, act } = useGame();
  const [tab, setTab] = useState<'franchise' | 'ready' | 'library'>('franchise');
  const [note, setNote] = useState<string | null>(null);
  const listings = useMemo(() => (s ? rightsListings(s) : []), [s]);
  if (!s) return null;
  const rows = listings.filter((l) => (tab === 'franchise' ? l.kind === 'franchise' : l.kind === 'film' && (tab === 'ready' ? l.detail.startsWith('Finished') : !l.detail.startsWith('Finished')))).slice(0, 40);
  const sales = (s.librarySales ?? []).filter((x) => x.expires > s.t);
  return (
    <div>
      <PageHeader title="Rights Market" sub="Make offers for rivals' franchises, finished films and library titles. The valuation is a guide; owners want a premium, and lowballs get you shut out for a while." />
      {note && <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm">{note}</div>}
      {sales.length > 0 && (
        <Panel title="Library fire sales" className="mb-5">
          <div className="space-y-2">
            {sales.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div><span className="font-semibold">{studioById(s, x.studioId)?.name}</span> are selling {x.filmIds.length} library films: {x.filmIds.slice(0, 4).map((id) => s.films.find((f) => f.id === id)?.title).filter(Boolean).join(', ')}{x.filmIds.length > 4 ? '…' : ''} <span className="text-xs text-muted">· closes {formatShort(x.expires)}</span></div>
                <Button size="sm" disabled={s.studio.cash < x.price} onClick={() => setNote(act((d) => buyLibrary(d, x.id)) ?? 'The library is yours. The films now stream on your service or earn library income.')}>Buy all for {money(x.price)}</Button>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'franchise', label: 'Franchises' }, { id: 'ready', label: 'Finished, unreleased' }, { id: 'library', label: 'Library titles' }]} />
      <Panel className="mt-3" pad={false}>
        {rows.length ? (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Title</th><th>Owner</th><th className="text-right">Valuation</th><th>Your offer</th></tr></thead>
            <tbody>{rows.map((l) => <Row key={l.id} l={l} />)}</tbody>
          </table></div>
        ) : <div className="p-4"><Empty>Nothing in this category right now.</Empty></div>}
      </Panel>
      <p className="mt-3 text-xs text-muted">Buying a franchise gets you its sequel rights, its merch income and any finished films in it. Develop the next instalment from IP & Franchises. Bought films don’t count toward the board’s hit target.</p>
    </div>
  );
}
