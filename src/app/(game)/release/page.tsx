'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { formatDate, formatShort, monthOf } from '@/lib/calendar';
import { MONTH_HEAT, SCREENS } from '@/lib/constants';
import { money } from '@/lib/format';
import { STREAMER_BUYERS } from '@/data/studios';
import { forecastGross, salePrice, scheduleRelease, unschedule } from '@/lib/engine/boxoffice';
import { filmById, studioById } from '@/lib/engine/util';
import type { ReleaseType, ScreenPlan } from '@/lib/types';
import { Button, Empty, Field, PageHeader, Panel } from '@/components/ui';

const TYPES: { id: ReleaseType; label: string; d: string }[] = [
  { id: 'theatrical', label: 'Theatrical', d: 'Cinemas worldwide, then home & streaming window.' },
  { id: 'dayanddate', label: 'Day-and-date', d: 'Cinemas + your service at once. Smaller box office, subscriber boost.' },
  { id: 'streaming', label: 'Your streaming service', d: 'Exclusive. No box office; big subscriber pull.' },
  { id: 'sold', label: 'Sell to a streamer', d: 'Flat fee now. No upside.' },
];

export default function ReleasePlanner() {
  const { state: s, act } = useGame();
  const params = useSearchParams();
  const router = useRouter();
  const ready = s ? s.films.filter((f) => f.studioId === s.studio.id && f.stage === 'ready') : [];
  const [filmId, setFilmId] = useState(params.get('film') ?? ready.find((f) => !f.release)?.id ?? ready[0]?.id ?? '');
  const f = s ? filmById(s, filmId) : undefined;
  const [type, setType] = useState<ReleaseType>('theatrical');
  const [t, setT] = useState((s?.t ?? 0) + 3);
  const [screens, setScreens] = useState<ScreenPlan>(f && (f.tier === 'Micro' || f.tier === 'Low') ? 'moderate' : 'wide');
  const [mkt, setMkt] = useState(0.5);
  const [buyer, setBuyer] = useState(STREAMER_BUYERS[0]);
  const [err, setErr] = useState<string | null>(null);

  const weeks = useMemo(() => s ? Array.from({ length: 26 }, (_, i) => s.t + i) : [], [s]);
  if (!s) return null;
  const marketing = f ? Math.round(f.budget * mkt / 1e5) * 1e5 : 0;
  const forecast = f && type !== 'sold' && type !== 'streaming' ? forecastGross(s, f, { t, screens, marketing, type }) : 0;
  const offer = f && type === 'sold' ? salePrice(s, f, buyer) : 0;
  const releasesAt = (tt: number) => s.films.filter((x) => x.release && x.release.t === tt && x.release.type !== 'sold');

  const confirm = () => {
    if (!f) return;
    const e = act((d) => scheduleRelease(d, filmById(d, f.id)!, { type, t: type === 'sold' ? d.t : t, screens, marketing, buyer, price: type === 'sold' ? offer : undefined }));
    if (e) setErr(e); else router.push(`/film/${f.id}`);
  };

  return (
    <div>
      <PageHeader title="Release Planner" sub="Summer and the holidays are big. January and September are quiet." />
      {!ready.length && <Empty>No finished films waiting. Check the <Link href="/slate" className="link">production slate</Link>.</Empty>}
      {ready.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Panel title="Plan">
            <Field label="Film"><select className="select w-full" value={filmId} onChange={(e) => setFilmId(e.target.value)}>{ready.map((x) => <option key={x.id} value={x.id}>{x.title}{x.release ? ` (scheduled ${formatShort(x.release.t)})` : ''}</option>)}</select></Field>
            {f?.release ? (
              <div className="mt-4 space-y-3 text-sm">
                <div>Scheduled: <span className="text-gold">{TYPES.find((x) => x.id === f.release!.type)?.label}</span> on {formatDate(f.release.t)} with {money(f.marketing)} marketing.</div>
                {f.release.t > s.t && <Button variant="ghost" size="sm" onClick={() => act((d) => unschedule(d, filmById(d, f.id)!))}>Unschedule (marketing spend is lost)</Button>}
              </div>
            ) : f && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {TYPES.map((x) => {
                    const off = (x.id === 'streaming' || x.id === 'dayanddate') && !s.studio.streaming;
                    return <button key={x.id} disabled={off} onClick={() => setType(x.id)} className={`rounded-lg border p-3 text-left disabled:opacity-40 ${type === x.id ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}><div className="font-semibold">{x.label}</div><div className="text-xs text-muted">{off ? 'Needs your own streaming service.' : x.d}</div></button>;
                  })}
                </div>
                {type === 'sold' ? (
                  <>
                    <Field label="Buyer"><select className="select w-full" value={buyer} onChange={(e) => setBuyer(e.target.value)}>{STREAMER_BUYERS.filter((b) => s.rivals.some((r) => r.id === b)).map((b) => <option key={b} value={b}>{studioById(s, b)?.name}</option>)}</select></Field>
                    <div className="rounded-lg bg-panel2 p-3">Offer: <span className="text-xl font-semibold text-gold">{money(offer)}</span></div>
                  </>
                ) : (
                  <>
                    <Field label={`Release date — ${formatDate(t)}`}>
                      <select className="select w-full" value={t} onChange={(e) => setT(Number(e.target.value))}>
                        {weeks.slice(type === 'streaming' ? 1 : 2).map((tt) => <option key={tt} value={tt}>{formatDate(tt)} · window {MONTH_HEAT[monthOf(tt)].toFixed(2)}× · {releasesAt(tt).length} other releases</option>)}
                      </select>
                    </Field>
                    {type !== 'streaming' && <Field label="Screens"><select className="select w-full" value={screens} onChange={(e) => setScreens(e.target.value as ScreenPlan)}>{(Object.keys(SCREENS) as ScreenPlan[]).map((k) => <option key={k} value={k}>{SCREENS[k].label}</option>)}</select></Field>}
                    <Field label={`Marketing (P&A) — ${money(marketing)}${type === 'streaming' ? ' (halved for streaming)' : ''}`} hint={`${Math.round(mkt * 100)}% of the production budget.`}>
                      <input type="range" min={0.05} max={1.5} step={0.05} value={mkt} onChange={(e) => setMkt(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
                    </Field>
                    {forecast > 0 && <div className="rounded-lg bg-panel2 p-3 text-sm">Tracking suggests <span className="font-semibold text-gold">{money(forecast * 0.6)} – {money(forecast * 1.5)}</span> worldwide. Reviews will move it a lot.</div>}
                  </>
                )}
                {err && <div className="text-sm text-red-400">{err}</div>}
                <Button variant="ticket" onClick={confirm} disabled={type !== 'sold' && s.studio.cash < marketing}>{type === 'sold' ? 'Sell' : 'Lock it in'}</Button>
              </div>
            )}
          </Panel>
          <Panel title="Release calendar" pad={false}>
            <div className="max-h-[600px] overflow-y-auto">
              {weeks.map((tt) => {
                const rel = releasesAt(tt);
                const heat = MONTH_HEAT[monthOf(tt)];
                return (
                  <div key={tt} className={`flex gap-3 border-b border-line px-4 py-2 text-sm ${tt === t ? 'bg-gold/10' : ''}`}>
                    <div className="w-24 shrink-0"><div>{formatShort(tt)}</div><div className="mt-1 h-1.5 rounded-full" style={{ width: `${heat * 50}px`, background: heat >= 1.15 ? '#D4AF37' : heat <= 0.85 ? '#5C6BC0' : '#8A8A9A' }} /></div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {rel.map((x) => { const st = studioById(s, x.studioId)!; return <Link key={x.id} href={`/film/${x.id}`} className="chip" style={{ borderColor: st.color, color: st.isPlayer ? '#D4AF37' : undefined }} title={`${st.name} · ${x.tier}`}>{x.title}{x.tier === 'Tentpole' ? ' ★' : ''}</Link>; })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
