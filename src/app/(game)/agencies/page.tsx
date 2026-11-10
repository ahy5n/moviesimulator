'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { formatShort } from '@/lib/calendar';
import { GENRE_COLORS } from '@/lib/constants';
import { money } from '@/lib/format';
import { getDB, talent } from '@/lib/talentDb';
import { AGENCIES, acceptPackage, agencyOf, agencyRel, blacklisted, packageIssues } from '@/lib/engine/agencies';
import { Badge, Bar, Button, Empty, PageHeader, Panel } from '@/components/ui';

const relLabel = (v: number) => (v >= 6 ? 'Close friends' : v >= 4 ? 'Friendly (5% off)' : v >= 1 ? 'Warm' : v > -2 ? 'Neutral' : v > -4 ? 'Cold' : 'Hostile');

export default function Agencies() {
  const { state: s, act } = useGame();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const top = useMemo(() => {
    const out: Record<string, { name: string; id: string; ovr: number }[]> = {};
    for (const t of getDB().all) {
      if (t.attrs.overall < 72) continue;
      (out[agencyOf(t)] ??= []).push({ name: t.name, id: t.id, ovr: t.attrs.overall });
    }
    for (const k of Object.keys(out)) out[k] = out[k].sort((a, b) => b.ovr - a.ovr).slice(0, 4);
    return out;
  }, []);
  if (!s) return null;
  const packages = (s.packages ?? []).filter((p) => p.expires > s.t);
  return (
    <div>
      <PageHeader title="Agencies" sub="Every actor, director and writer is repped by one of five agencies. Sign their clients and they'll bring you packages; walk out on deals and drop clients and they'll freeze you out." />
      {note && <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm">{note}</div>}
      <Panel title="Packages on offer">
        {packages.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {packages.map((p) => {
              const issues = packageIssues(s, p);
              const dir = talent(s, p.directorId);
              const w = talent(s, p.writerId);
              return (
                <div key={p.id} className="rounded-lg border border-line bg-panel2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-marquee text-2xl tracking-wide">{p.title}</div>
                    <span className="chip">{AGENCIES.find((a) => a.id === p.agencyId)?.name}</span>
                  </div>
                  <div className="my-1 flex flex-wrap gap-1"><Badge color={GENRE_COLORS[p.primaryGenre]}>{p.primaryGenre}</Badge><Badge>{p.tier} · {money(p.budget)}</Badge><Badge>Script {p.scriptQuality - 5}–{p.scriptQuality + 5}</Badge></div>
                  <p className="text-sm italic text-[#CFC9BC]">“{p.logline}”</p>
                  <div className="mt-2 text-sm">
                    <div>Director: {dir && <Link href={`/talent/${dir.id}`} className="link">{dir.name}</Link>} <span className="text-xs text-muted">({dir?.attrs.overall})</span></div>
                    <div>Writer: {w && <Link href={`/talent/${w.id}`} className="link">{w.name}</Link>}</div>
                    {p.actorIds.length > 0 && <div>Starring: {p.actorIds.map((id, i) => { const t = talent(s, id); return t && <span key={id}>{i ? ', ' : ''}<Link href={`/talent/${id}`} className="link">{t.name}</Link> <span className="text-xs text-muted">({t.attrs.starPower} star)</span></span>; })}</div>}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm">All fees <span className="text-gold">{money(p.fees)}</span> <span className="text-xs text-muted">({Math.round(p.discount * 100)}% off · expires {formatShort(p.expires)})</span></span>
                    <Button size="sm" disabled={issues.length > 0} onClick={() => { const f = act((d) => acceptPackage(d, p.id)); if (f) router.push(`/film/${f.id}`); else setNote('The package fell apart.'); }}>Take the package</Button>
                  </div>
                  {issues.length > 0 && <div className="mt-1 text-xs text-amber-300">{issues.join(' ')}</div>}
                </div>
              );
            })}
          </div>
        ) : <Empty>No packages right now. Agencies that like you send them more often.</Empty>}
      </Panel>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AGENCIES.map((a) => {
          const rel = agencyRel(s, a.id);
          const frozen = blacklisted(s, a.id);
          return (
            <Panel key={a.id} title={a.name}>
              <p className="text-sm text-muted">{a.blurb}</p>
              <div className="mt-3"><Bar value={(rel + 10) * 5} label="Relationship" right={frozen ? 'Frozen out' : relLabel(rel)} color={frozen ? '#C0392B' : rel >= 4 ? '#2ECC71' : '#D4AF37'} /></div>
              {frozen && <div className="mt-1 text-xs text-red-300">Their clients won't take your calls until {formatShort(s.agencies![a.id].blacklistUntil!)}.</div>}
              <div className="mt-3 label">Top clients</div>
              <div className="text-sm">{(top[a.id] ?? []).map((t, i) => <span key={t.id}>{i ? ', ' : ''}<Link href={`/talent/${t.id}`} className="hover:text-gold">{t.name}</Link></span>)}</div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
