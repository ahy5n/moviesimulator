'use client';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { formatShort } from '@/lib/calendar';
import { money } from '@/lib/format';
import { dealLabel, canHaveDeal, dealFor, dealWillingness, retainerPerTurn, signDeal } from '@/lib/engine/deals';
import { studioById } from '@/lib/engine/util';
import type { DealKind, Talent } from '@/lib/types';
import { Button } from './ui';

/** Offer (or renew) a first-look or overall deal from a director's or writer's profile. */
export function DealPanel({ t }: { t: Talent }) {
  const { state: s, act } = useGame();
  const [kind, setKind] = useState<DealKind>('first-look');
  const [years, setYears] = useState(2);
  const [note, setNote] = useState<string | null>(null);
  if (!s || !canHaveDeal(t)) return null;
  const d = dealFor(s, t.id);
  const theirs = d && d.studioId !== s.studio.id;
  const w = dealWillingness(s, t, kind);
  const per = retainerPerTurn(t, kind);
  return (
    <div className="mt-4 rounded-lg border border-line bg-panel2 p-3 text-sm">
      <div className="label mb-1">Studio deals</div>
      {theirs ? (
        <div className="text-amber-300">On a {dealLabel(d.kind, t).name.toLowerCase()} with {studioById(s, d.studioId)?.name} until {formatShort(d.untilT)}.{d.kind === 'overall' ? ' You can’t hire them.' : ' They cost you 20% more.'}</div>
      ) : (
        <>
          {d && <div className="mb-2 text-emerald-300">On your {dealLabel(d.kind, t).name.toLowerCase()} until {formatShort(d.untilT)}.</div>}
          <div className="flex gap-1.5">
            {(['first-look', 'overall'] as DealKind[]).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${kind === k ? 'border-gold bg-gold/10' : 'border-line'}`}>{dealLabel(k, t).name}</button>
            ))}
          </div>
          <div className="mt-1.5 text-xs text-muted">{dealLabel(kind, t).blurb}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted">Years</span>
            {[1, 2, 3, 4].map((y) => <button key={y} onClick={() => setYears(y)} className={`rounded border px-2 py-0.5 text-xs ${years === y ? 'border-gold text-gold' : 'border-line'}`}>{y}</button>)}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span>Retainer <span className="text-gold">{money(per * 26)}</span>/yr</span>
            <Button size="sm" disabled={!w.ok && !d} onClick={() => setNote(act((x) => signDeal(x, t.id, kind, years)) ?? 'Deal signed.')}>{d ? 'Extend' : 'Offer deal'}</Button>
          </div>
          {!d && <div className={`mt-1 text-xs ${w.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{w.reason}</div>}
          {note && <div className="mt-1 text-xs text-gold">{note}</div>}
        </>
      )}
    </div>
  );
}
