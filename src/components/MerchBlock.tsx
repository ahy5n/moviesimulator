'use client';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { formatShort } from '@/lib/calendar';
import { money } from '@/lib/format';
import { LICENCES, franchiseGross, licenceFilm, merchPerYear, parkPerYear, signLicence } from '@/lib/engine/merch';
import type { Franchise, LicenceKind } from '@/lib/types';
import { Button } from './ui';

const KINDS: LicenceKind[] = ['toys', 'game', 'park'];

/** Merch income and licensing deals for a franchise (or a standalone hit, via filmId). */
export function MerchBlock({ fr, filmId, gross }: { fr?: Franchise; filmId?: string; gross?: number }) {
  const { state: s, act } = useGame();
  const [note, setNote] = useState<string | null>(null);
  if (!s) return null;
  const g = fr ? franchiseGross(s, fr) : gross ?? 0;
  const perYear = fr ? merchPerYear(s, fr) + parkPerYear(s, fr) : 0;
  const sign = (k: LicenceKind) => setNote(act((d) => (fr ? signLicence(d, fr.id, k) : licenceFilm(d, filmId!, k))) ?? `${LICENCES[k].name} signed.`);
  return (
    <div className="mt-3 border-t border-line pt-2 text-xs">
      {fr && <div className="mb-1.5 flex justify-between"><span className="label">Merch & licensing</span><span>{perYear > 0 ? <span className="text-emerald-300">{money(perYear)}/yr</span> : <span className="text-muted">—</span>}{fr.merchTotal ? <span className="text-muted"> · {money(fr.merchTotal)} so far</span> : null}</span></div>}
      <div className="space-y-1">
        {KINDS.map((k) => {
          const L = LICENCES[k];
          const l = fr?.licences?.filter((x) => x.kind === k).at(-1);
          const pending = l && !l.live;
          const done = l && l.live && k !== 'game';
          return (
            <div key={k} className="flex items-center justify-between gap-2" title={L.blurb}>
              <span className={g < L.minGross ? 'text-muted' : ''}>{L.name}</span>
              {pending ? <span className="text-amber-300">Launches {formatShort(l.readyT)}</span>
                : done ? <span className="text-emerald-300">Live · {money(l.earned)}</span>
                : g < L.minGross ? <span className="text-muted">needs {money(L.minGross, 0)} gross</span>
                : <Button size="sm" variant="ghost" disabled={s.studio.cash < L.cost(g)} onClick={() => sign(k)}>{l?.live ? 'Sequel game' : 'Sign'} {money(L.cost(g))}</Button>}
            </div>
          );
        })}
      </div>
      {note && <div className="mt-1 text-gold">{note}</div>}
    </div>
  );
}
