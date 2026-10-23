'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { GENRE_COLORS } from '@/lib/constants';
import { money } from '@/lib/format';
import { allTalent, genreFit, isAvailable } from '@/lib/talentDb';
import { buyIP, commissionScript, createUniverse, linkToUniverse, sequelEligible, sequelTitle } from '@/lib/engine/scripts';
import { filmProfit, isReleased } from '@/lib/engine/util';
import type { BudgetTier, Genre, GameState } from '@/lib/types';
import { Badge, Bar, Button, Empty, Field, Modal, PageHeader, Panel } from '@/components/ui';

type Dev = { kind: 'ip'; id: string; g: Genre; g2?: Genre; title: string } | { kind: 'sequel'; id: string; g: Genre; g2?: Genre; title: string };

function bestWriters(s: GameState, g: Genre, g2?: Genre) {
  return allTalent(s, 'writer').filter((w) => isAvailable(s, w.id))
    .map((w) => ({ w, fit: Math.round(0.55 * w.attrs.acting + 0.45 * genreFit(w, g, g2)) }))
    .sort((a, b) => b.fit - a.fit).slice(0, 12);
}

export default function IPPage() {
  const { state: s, act } = useGame();
  const router = useRouter();
  const [dev, setDev] = useState<Dev | null>(null);
  const [writerId, setWriterId] = useState('');
  const [tier, setTier] = useState<BudgetTier>('Mid');
  const [uName, setUName] = useState('');
  const writers = useMemo(() => (s && dev ? bestWriters(s, dev.g, dev.g2) : []), [s, dev]);
  if (!s) return null;
  const market = s.ips.filter((x) => !x.owner);
  const owned = s.ips.filter((x) => x.owner === s.studio.id && !x.used);
  const franchises = s.franchises.filter((f) => f.studioId === s.studio.id);
  const sequels = s.films.filter((f) => sequelEligible(s, f));
  const linkable = s.films.filter((f) => f.studioId === s.studio.id && f.stage !== 'shelved');

  const start = () => {
    if (!dev) return;
    const w = writers.find((x) => x.w.id === writerId)?.w ?? writers[0]?.w;
    if (!w) return;
    const f = act((d) => commissionScript(d, {
      genre: dev.g, genre2: dev.g2, tone: 'balanced', tier, writerId: w.id, turns: 2, title: dev.title,
      premise: dev.kind === 'ip' ? `Based on the hit ${d.ips.find((x) => x.id === dev.id)?.kind.toLowerCase()}.` : 'The story continues.',
      ipId: dev.kind === 'ip' ? dev.id : undefined, sequelOf: dev.kind === 'sequel' ? dev.id : undefined,
    }));
    setDev(null);
    if (f) router.push(`/film/${f.id}`);
  };

  return (
    <div>
      <PageHeader title="IP Library & Franchises" sub="Adaptations, sequels and shared universes." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Rights for sale">
          {!market.length ? <Empty>New properties appear each January.</Empty> : (
            <div className="space-y-2">
              {market.map((ip) => (
                <div key={ip.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{ip.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs"><Badge>{ip.kind}</Badge>{ip.genres.filter(Boolean).map((g) => <Badge key={g} color={GENRE_COLORS[g!]}>{g}</Badge>)}</div>
                    <div className="mt-2 w-40"><Bar value={ip.buzz} label="Fan buzz" /></div>
                  </div>
                  <Button size="sm" disabled={s.studio.cash < ip.price} onClick={() => act((d) => buyIP(d, ip.id))}>Buy {money(ip.price)}</Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Your properties">
          {!owned.length && !sequels.length ? <Empty>Buy rights, or score a hit to unlock sequels.</Empty> : (
            <div className="space-y-2">
              {owned.map((ip) => (
                <div key={ip.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel2 p-3">
                  <div><div className="font-semibold">{ip.title}</div><div className="text-xs text-muted">{ip.kind} · buzz {ip.buzz} · opening boost +{Math.round(ip.buzz / 2.6)}%</div></div>
                  <Button size="sm" onClick={() => { setDev({ kind: 'ip', id: ip.id, g: ip.genres[0], g2: ip.genres[1], title: ip.title.replace(/ \(\d{4}\)$/, '') }); setWriterId(''); }}>Develop</Button>
                </div>
              ))}
              {sequels.map((f) => {
                const n = (s.franchises.find((x) => x.id === f.franchiseId)?.filmIds.length ?? 1) + 1;
                return (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
                    <div><div className="font-semibold">Sequel to {f.title}</div><div className="text-xs text-muted">{money(f.gross)} gross · profit {money(filmProfit(f))} · returning cast want more money</div></div>
                    <Button size="sm" onClick={() => { setDev({ kind: 'sequel', id: f.id, g: f.primaryGenre, g2: f.secondaryGenre, title: sequelTitle(f.title, n) }); setWriterId(''); setTier(f.tier); }}>Develop sequel</Button>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Franchises & cinematic universes" className="mt-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="New universe name…" value={uName} onChange={(e) => setUName(e.target.value)} />
          <Button variant="ghost" disabled={!uName.trim()} onClick={() => { act((d) => createUniverse(d, uName.trim())); setUName(''); }}>Create universe</Button>
        </div>
        {!franchises.length ? <Empty>No franchises yet.</Empty> : (
          <div className="grid gap-3 md:grid-cols-2">
            {franchises.map((fr) => (
              <div key={fr.id} className="rounded-lg border border-line bg-panel2 p-3">
                <div className="flex items-center justify-between"><span className="font-marquee text-xl tracking-wide">{fr.name}</span><Badge>{fr.isUniverse ? 'Universe' : 'Franchise'}</Badge></div>
                <div className="my-2 grid grid-cols-2 gap-3"><Bar value={fr.heat * 100} label="Heat" right={`+${Math.round(fr.heat * 60)}%`} color="#E4572E" /><Bar value={fr.fatigue * 100} label="Fatigue" right={`−${Math.round(fr.fatigue * 100)}%`} color="#5C6BC0" /></div>
                <ul className="text-sm">{fr.filmIds.map((id) => { const f = s.films.find((x) => x.id === id); return f ? <li key={id}><Link className="hover:text-gold" href={`/film/${id}`}>{f.title}</Link> <span className="text-xs text-muted">{isReleased(f) ? money(f.gross) : f.stage}</span></li> : null; })}</ul>
                {fr.isUniverse && (
                  <select className="select mt-2 w-full" value="" onChange={(e) => e.target.value && act((d) => linkToUniverse(d, e.target.value, fr.id))}>
                    <option value="">+ Link a film…</option>
                    {linkable.filter((f) => !fr.filmIds.includes(f.id)).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">A hit raises the heat of every film in its universe. Release too many too quickly and fatigue sets in.</p>
      </Panel>

      <Modal open={!!dev} onClose={() => setDev(null)} title={dev ? `Develop ${dev.title}` : ''}>
        {dev && (
          <div className="space-y-4">
            <Field label="Budget tier"><select className="select w-full" value={tier} onChange={(e) => setTier(e.target.value as BudgetTier)}>{['Micro', 'Low', 'Mid', 'High', 'Tentpole'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Writer (2 fortnights)">
              <select className="select w-full" value={writerId || writers[0]?.w.id} onChange={(e) => setWriterId(e.target.value)}>
                {writers.map(({ w, fit }) => <option key={w.id} value={w.id}>{w.name} — fit {fit} — {money(w.fee)}</option>)}
              </select>
            </Field>
            <div className="flex justify-end"><Button onClick={start} disabled={!writers.length}>Start development</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
