'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { TRAIT_INFO } from '@/lib/constants';
import { money } from '@/lib/format';
import { allTalent, genreFit, isAvailable, talent } from '@/lib/talentDb';
import { askingFee, canApproach, clampOffer, expectedBilling, negKey, openNegotiation, release, respond, type Role } from '@/lib/engine/negotiation';
import { filmById } from '@/lib/engine/util';
import { loyaltyDiscount, loyaltyLabel, loyaltyTo, SKIP_WAR_AT } from '@/lib/engine/loyalty';
import type { CrewRole, Film, GameState, Talent, TalentKind } from '@/lib/types';
import { Button, Empty, Field, PageHeader, Panel } from '@/components/ui';
import { Avatar, OvrBadge } from '@/components/cards';

const CREW: CrewRole[] = ['director', 'composer', 'cinematographer', 'editor'];
const roleKind = (r: Role): TalentKind => (r === 'lead' || r === 'support' ? 'actor' : r);

function suggestions(s: GameState, f: Film, role: Role): Talent[] {
  const kind = roleKind(role);
  const cap = role === 'lead' ? f.budget * 0.25 + 5e5 : role === 'support' ? f.budget * 0.06 + 3e5 : f.budget * 0.1 + 5e5;
  return allTalent(s, kind)
    .filter((t) => isAvailable(s, t.id) && t.fee <= cap && !f.cast.some((c) => c.talentId === t.id))
    .map((t) => ({ t, score: 0.55 * genreFit(t, f.primaryGenre, f.secondaryGenre) + 0.45 * t.attrs.overall + (role === 'lead' ? t.attrs.starPower * 0.15 : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.t);
}

export default function Casting() {
  const { state: s, act } = useGame();
  const { filmId } = useParams<{ filmId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [talentId, setTalentId] = useState(params.get('talent') ?? '');
  const f = s ? filmById(s, filmId) : undefined;
  const t = s && talentId ? talent(s, talentId) : undefined;
  const defaultRole: Role = t ? (t.kind === 'actor' ? (f && f.cast.filter((c) => c.role === 'lead').length < f.leads ? 'lead' : 'support') : (t.kind as Role)) : 'lead';
  const [role, setRole] = useState<Role>(defaultRole);
  useEffect(() => setRole(defaultRole), [talentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [offer, setOffer] = useState({ fee: 0, backend: 0, billing: 1, options: 1 });
  const [suggestRole, setSuggestRole] = useState<Role>('lead');
  const sugg = useMemo(() => (s && f ? suggestions(s, f, suggestRole) : []), [s, f, suggestRole]);

  const neg = s && f && t ? s.negotiations[negKey(f.id, t.id)] : undefined;
  const asking = s && f && t ? askingFee(s, t, f, role) : 0;
  useEffect(() => {
    if (!t) return;
    const last = neg?.history.filter((h) => h.from === 'agent' && h.fee > 0).at(-1);
    setOffer(last ? { fee: last.fee, backend: last.backend, billing: last.billing, options: last.options }
      : { fee: Math.round(asking * 0.9 / 10_000) * 10_000, backend: t.backendDemand, billing: expectedBilling(t, role), options: 1 });
  }, [talentId, role, neg?.history.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s || !f) return <Empty>Film not found.</Empty>;
  if (f.studioId !== s.studio.id) return <Empty>That isn&apos;t your film.</Empty>;
  const editable = f.stage === 'development' || f.stage === 'preproduction';
  const leads = f.cast.filter((c) => c.role === 'lead');
  const supports = f.cast.filter((c) => c.role === 'support');
  const block = t ? canApproach(s, t, f) : null;
  const original = f.sequelOf ? filmById(s, f.sequelOf) : undefined;

  const start = () => {
    const res = act((d) => openNegotiation(d, t!.id, f.id, role));
    if (res?.kind === 'bidding') router.push('/bidding');
  };
  const send = () => act((d) => respond(d, negKey(f.id, t!.id), clampOffer(offer)));

  const Slot = ({ id, label, fee, onRemove }: { id?: string; label: string; fee?: number; onRemove?: () => void }) => {
    const p = id ? talent(s, id) : undefined;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-2">
        <span className="label w-20 shrink-0">{label}</span>
        {p ? <><Avatar t={p} size={28} /><Link href={`/talent/${p.id}`} className="min-w-0 flex-1 truncate text-sm hover:text-gold">{p.name}</Link><span className="text-xs text-gold">{fee ? money(fee) : ''}</span>
          {onRemove && editable && <button className="text-xs text-muted hover:text-red-400" onClick={onRemove} title="Release (fee is not refunded)">✕</button>}</>
          : <span className="text-sm text-muted">Open</span>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title={`Casting: ${f.title}`} sub={<>{f.primaryGenre}{f.secondaryGenre ? ` / ${f.secondaryGenre}` : ''} · {money(f.budget)} budget · <Link href={`/film/${f.id}`} className="link">Film page</Link></>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <Panel title="Roles">
            <div className="space-y-1.5">
              {Array.from({ length: Math.max(f.leads, leads.length) }, (_, i) => <Slot key={`l${i}`} label={`Lead ${i + 1}`} id={leads[i]?.talentId} fee={leads[i]?.fee} onRemove={() => act((d) => release(d, filmById(d, f.id)!, leads[i].talentId))} />)}
              {Array.from({ length: Math.max(f.supports, supports.length) }, (_, i) => <Slot key={`s${i}`} label={`Support ${i + 1}`} id={supports[i]?.talentId} fee={supports[i]?.fee} onRemove={() => act((d) => release(d, filmById(d, f.id)!, supports[i].talentId))} />)}
              <Slot label="Writer" id={f.crew.writer?.talentId} />
              {CREW.filter((r) => r === 'director' || s.settings.crewMode === 'full').map((r) => <Slot key={r} label={r} id={f.crew[r]?.talentId} fee={f.crew[r]?.fee} onRemove={() => act((d) => release(d, filmById(d, f.id)!, f.crew[r]!.talentId))} />)}
            </div>
            {editable && f.supports < 4 && <Button size="sm" variant="subtle" className="mt-2" onClick={() => act((d) => { filmById(d, f.id)!.supports++; })}>+ Add supporting role</Button>}
          </Panel>
          {original && (
            <Panel title="Original cast">
              <p className="mb-2 text-xs text-muted">Returning stars expect a 40% raise unless they signed an option for more films.</p>
              {original.cast.map((c) => { const p = talent(s, c.talentId); return p ? <button key={c.talentId} onClick={() => setTalentId(p.id)} className="mb-1 flex w-full items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-left text-sm hover:border-gold"><Avatar t={p} size={24} />{p.name}<span className="ml-auto text-xs text-muted">{c.options > 1 ? 'option' : ''}</span></button> : null; })}
            </Panel>
          )}
          <Panel title="Suggestions" right={<select className="select" value={suggestRole} onChange={(e) => setSuggestRole(e.target.value as Role)}><option value="lead">Leads</option><option value="support">Support</option>{CREW.filter((r) => r === 'director' || s.settings.crewMode === 'full').map((r) => <option key={r} value={r}>{r}</option>)}</select>}>
            <div className="space-y-1.5">
              {sugg.map((p) => (
                <button key={p.id} onClick={() => { setTalentId(p.id); setRole(suggestRole); }} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm ${talentId === p.id ? 'border-gold bg-gold/10' : 'border-line bg-panel2 hover:border-gold/50'}`}>
                  <Avatar t={p} size={28} /><span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted">fit {Math.round(genreFit(p, f.primaryGenre, f.secondaryGenre))}</span>
                  <OvrBadge value={p.attrs.overall} size="sm" /><span className="w-14 text-right text-xs text-gold">{money(p.fee)}</span>
                </button>
              ))}
              {!sugg.length && <Empty>No one available in this price range.</Empty>}
            </div>
            <Link href={`/talent?cast=${f.id}&kind=${roleKind(suggestRole)}`} className="link mt-3 inline-block text-sm">Search the full database →</Link>
          </Panel>
        </div>

        <Panel title="Negotiation room">
          {!t ? <Empty>Pick someone from the suggestions or the talent database.</Empty> : (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <Avatar t={t} size={56} />
                <div className="min-w-0 flex-1">
                  <Link href={`/talent/${t.id}`} className="text-lg font-semibold hover:text-gold">{t.name}</Link>
                  <div className="text-xs text-muted">Genre fit {Math.round(genreFit(t, f.primaryGenre, f.secondaryGenre))} · Star {t.attrs.starPower} · {t.traits.map((x) => <span key={x} title={TRAIT_INFO[x]} className="mr-1 underline decoration-dotted">{x}</span>)}</div>
                </div>
                <OvrBadge value={t.attrs.overall} />
              </div>
              {neg?.status === 'accepted' ? null : block ? <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">{block}</div>
                : !editable ? <Empty>Casting is locked once filming starts.</Empty>
                : !neg || neg.status !== 'open' ? (
                  <div className="space-y-3">
                    {t.kind === 'actor' && <Field label="Role"><div className="grid grid-cols-2 gap-2">{(['lead', 'support'] as const).map((r) => <button key={r} onClick={() => setRole(r)} className={`rounded-lg border px-3 py-2 text-sm capitalize ${role === r ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{r}</button>)}</div></Field>}
                    <div className="rounded-lg bg-panel2 p-3 text-sm">Agent&apos;s opening number: <span className="font-semibold text-gold">{money(asking)}</span>{t.backendDemand > 0 && role === 'lead' ? ` + ${t.backendDemand}% backend` : ''}</div>
                    {(() => { const l = loyaltyTo(s, t.id, s.studio.id); return l.total > 0 ? <div className="text-sm text-gold">{loyaltyLabel(l.total)} to you: {Math.round(loyaltyDiscount(t, l.total) * 100)}% loyalty discount already applied{l.total >= SKIP_WAR_AT ? ', and they\'ll talk to you before any rival' : ''}.</div> : null; })()}
                    {neg?.status && <div className="text-sm text-muted">Last talks: {neg.status}.</div>}
                    <Button onClick={start}>Open talks</Button>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4 max-h-72 space-y-2 overflow-y-auto">
                      {neg.history.map((h, i) => (
                        <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${h.from === 'you' ? 'ml-auto bg-gold/15' : 'bg-panel2'}`}>
                          <div className="label mb-0.5">{h.from === 'you' ? 'You' : 'Agent'}</div>
                          {h.fee > 0 && <div className="tabular-nums">{money(h.fee)} · {h.backend}% backend{neg.role === 'lead' || neg.role === 'support' ? ` · billing #${h.billing}` : ''}{h.options > 1 ? ` · ${h.options} films` : ''}</div>}
                          {h.note && <div className="italic text-[#D8D3C8]">{h.note}</div>}
                        </div>
                      ))}
                      {!neg.history.length && <div className="text-sm text-muted">The agent is waiting for your offer. Asking: {money(neg.asking)}.</div>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={`Upfront fee — ${money(offer.fee)}`}>
                        <input type="range" min={Math.round(neg.asking * 0.4)} max={Math.round(neg.asking * 1.8)} step={10_000} value={offer.fee} onChange={(e) => setOffer({ ...offer, fee: Number(e.target.value) })} className="w-full accent-[#D4AF37]" />
                      </Field>
                      <Field label={`Backend — ${offer.backend}%`}>
                        <input type="range" min={0} max={20} value={offer.backend} onChange={(e) => setOffer({ ...offer, backend: Number(e.target.value) })} className="w-full accent-[#D4AF37]" />
                      </Field>
                      {(role === 'lead' || role === 'support') && <Field label="Billing"><select className="select w-full" value={offer.billing} onChange={(e) => setOffer({ ...offer, billing: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((b) => <option key={b} value={b}>#{b}</option>)}</select></Field>}
                      <Field label="Films (sequel options)"><select className="select w-full" value={offer.options} onChange={(e) => setOffer({ ...offer, options: Number(e.target.value) })}>{[1, 2, 3].map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-muted">Round {neg.round + 1} of 3</span>
                      <Button onClick={send} disabled={s.studio.cash < offer.fee}>Send offer</Button>
                    </div>
                  </div>
                )}
              {neg?.status === 'accepted' && <div className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">Signed! {t.name} is attached to {f.title}.</div>}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
