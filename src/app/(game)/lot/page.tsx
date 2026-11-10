'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { formatDate, formatShort } from '@/lib/calendar';
import { money } from '@/lib/format';
import { talent } from '@/lib/talentDb';
import { FACILITIES, buildFacility, facilityLevel, upkeepPerTurn } from '@/lib/engine/facilities';
import { dealLabel, endDeal, matchPoach } from '@/lib/engine/deals';
import { studioById } from '@/lib/engine/util';
import { Button, Empty, PageHeader, Panel } from '@/components/ui';

export default function StudioLot() {
  const { state: s, act } = useGame();
  const [note, setNote] = useState<string | null>(null);
  if (!s) return null;
  const deals = (s.deals ?? []).filter((d) => d.untilT > s.t);
  const mine = deals.filter((d) => d.studioId === s.studio.id);
  const theirs = deals.filter((d) => d.studioId !== s.studio.id).sort((a, b) => (talent(s, b.talentId)?.attrs.overall ?? 0) - (talent(s, a.talentId)?.attrs.overall ?? 0));
  const upkeep = FACILITIES.reduce((a, f) => a + upkeepPerTurn(f.id, facilityLevel(s, f.id)), 0) * 26;
  const retainers = mine.reduce((a, d) => a + d.perTurn, 0) * 26;
  return (
    <div>
      <PageHeader title="Studio Lot" sub="Build facilities that make every later production cheaper and better, and lock up the people you want to keep." />
      {note && <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm">{note}</div>}
      <Panel title="Facilities" right={<span className="text-xs text-muted">Upkeep {money(upkeep)}/yr</span>}>
        <div className="grid gap-4 md:grid-cols-2">
          {FACILITIES.map((f) => {
            const cur = s.facilities?.[f.id];
            const built = facilityLevel(s, f.id);
            const building = cur && cur.readyT > s.t;
            const nextCost = f.costs[cur?.level ?? 0];
            const max = f.costs.length;
            return (
              <div key={f.id} className="rounded-lg border border-line bg-panel2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{f.name}</div>
                    <div className="text-xs text-muted">{f.appliesTo}</div>
                  </div>
                  <div className="flex gap-1">{Array.from({ length: max }, (_, i) => <span key={i} className={`h-2.5 w-6 rounded ${i < built ? 'bg-gold' : i < (cur?.level ?? 0) ? 'bg-gold/30' : 'bg-line'}`} />)}</div>
                </div>
                <p className="mt-2 text-sm text-[#CFC9BC]">{f.blurb}</p>
                <div className="mt-2 text-xs">
                  {built ? <>Now: <span className="text-emerald-300">−{Math.round(f.saving * built * 100)}% production cost, +{(f.quality * built).toFixed(1)} quality</span></> : <span className="text-muted">Not built. Each level: −{Math.round(f.saving * 100)}% cost, +{f.quality} quality.</span>}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {building ? <span className="text-sm text-amber-300">Building level {cur!.level} · ready {formatShort(cur!.readyT)}</span>
                    : nextCost ? <span className="text-sm">{built ? `Level ${built + 1}` : 'Build'}: <span className="text-gold">{money(nextCost)}</span> <span className="text-xs text-muted">· {f.buildTurns * 2} weeks · +{money(upkeepPerTurn(f.id, (cur?.level ?? 0) + 1) * 26 - upkeepPerTurn(f.id, cur?.level ?? 0) * 26)}/yr upkeep</span></span>
                    : <span className="text-sm text-emerald-300">Fully built</span>}
                  {!building && nextCost && <Button size="sm" disabled={s.studio.cash < nextCost} onClick={() => setNote(act((d) => buildFacility(d, f.id)) ?? `Construction started on the ${f.name.toLowerCase()}.`)}>{built ? 'Upgrade' : 'Build'}</Button>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">Savings and quality are locked in when a film is greenlit, so build before you shoot. Your sound stages earn rental income in fortnights when you have nothing filming.</p>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Your deals" right={<span className="text-xs text-muted">Retainers {money(retainers)}/yr</span>} pad={false}>
          {mine.length ? (
            <div className="divide-y divide-line">
              {mine.map((d) => {
                const t = talent(s, d.talentId);
                if (!t) return null;
                return (
                  <div key={d.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div><Link href={`/talent/${t.id}`} className="font-medium hover:text-gold">{t.name}</Link> <span className="text-xs capitalize text-muted">{t.kind} · {dealLabel(d.kind, t).name} · to {formatShort(d.untilT)}</span></div>
                      <div className="flex gap-1.5">
                        <Link href={`/talent/${t.id}`} className="rounded-lg border border-line px-2 py-1 text-xs hover:border-gold">Renew</Link>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm(`End ${t.name}'s deal? Buying out the rest of the term costs ${money(Math.max(0, d.untilT - s.t) * d.perTurn * 0.25)}.`)) act((x) => endDeal(x, d.id)); }}>End</Button>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted">{money(d.perTurn * 26)}/yr · next pitch around {formatShort(d.nextPitchT)}</div>
                    {d.poach && (
                      <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                        <span className="text-amber-200">{studioById(s, d.poach.studioId)?.name} want them. Match by {formatDate(d.poach.expires)} or lose them.</span>
                        <Button size="sm" disabled={s.studio.cash < d.poach.raise} onClick={() => setNote(act((x) => matchPoach(x, d.id)) ?? `${t.name} stays.`)}>Match {money(d.poach.raise)}</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <div className="p-4"><Empty>No deals yet. Offer one from a <Link href="/talent" className="link">director’s or writer’s profile</Link>. People who’ve worked with you are far more likely to sign.</Empty></div>}
        </Panel>
        <Panel title="Locked up by rivals" pad={false}>
          {theirs.length ? (
            <div className="max-h-[420px] overflow-auto"><table className="tbl">
              <thead><tr><th>Who</th><th>Studio</th><th>Deal</th><th className="text-right">Until</th></tr></thead>
              <tbody>{theirs.map((d) => {
                const t = talent(s, d.talentId);
                return t && (
                  <tr key={d.id}>
                    <td><Link href={`/talent/${t.id}`} className="hover:text-gold">{t.name}</Link> <span className="text-xs capitalize text-muted">{t.kind} · {t.attrs.overall}</span></td>
                    <td>{studioById(s, d.studioId)?.name}</td>
                    <td className="text-xs">{d.kind === 'overall' ? <span className="text-amber-300">Exclusive</span> : 'First look (+20% for you)'}</td>
                    <td className="text-right text-muted">{formatShort(d.untilT)}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          ) : <div className="p-4"><Empty>No rival deals yet.</Empty></div>}
        </Panel>
      </div>
    </div>
  );
}
