'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { dealBlock, dealFeeMult, dealFor } from '@/lib/engine/deals';
import { writersStrike } from '@/lib/engine/shocks';
import { CHANNELS } from '@/data/channels';
import { GENRE_COLORS } from '@/lib/constants';
import { money } from '@/lib/format';
import { LANGUAGE_CODES, langName } from '@/lib/languages';
import { makeRng } from '@/lib/rng';
import { allTalent, genreFit, isAvailable } from '@/lib/talentDb';
import { genPremises, genTitle } from '@/lib/titles';
import { FORMAT_INFO, developSeries, suggestedBudget } from '@/lib/engine/tv';
import { GENRES, SERIES_FORMATS, type Genre, type SeriesFormat, type Tone } from '@/lib/types';
import { Button, Field, PageHeader, Panel } from '@/components/ui';
import { Avatar, OvrBadge } from '@/components/cards';

export default function NewSeries() {
  const { state: s, act } = useGame();
  const router = useRouter();
  // Spin-offs arrive with ?from=<film or series id>.
  const fromId = useSearchParams().get('from') ?? '';
  const srcFilm = s?.films.find((f) => f.id === fromId && f.studioId === s.studio.id);
  const srcSeries = (s?.series ?? []).find((x) => x.id === fromId && x.studioId === s?.studio.id);
  const src = srcFilm ?? srcSeries;
  const [format, setFormat] = useState<SeriesFormat>('Drama');
  const [g, setG] = useState<Genre>(src?.primaryGenre ?? 'Crime');
  const [g2, setG2] = useState<Genre | ''>(src?.secondaryGenre ?? '');
  const [tone, setTone] = useState<Tone>('balanced');
  const [language, setLanguage] = useState(src?.language ?? 'en');
  const [episodes, setEpisodes] = useState(FORMAT_INFO.Drama.lengths[2]);
  const [runtime, setRuntime] = useState<30 | 45 | 60>(60);
  const [budgetMult, setBudgetMult] = useState(1);
  const [roll, setRoll] = useState(0);
  const [premiseIdx, setPremiseIdx] = useState(0);
  const [title, setTitle] = useState(srcFilm ? `${srcFilm.title}: The Series` : srcSeries ? `${srcSeries.title}: Origins` : '');
  const [writerId, setWriterId] = useState('');
  const [turns, setTurns] = useState(2);
  const [q, setQ] = useState('');

  const info = FORMAT_INFO[format];
  const budgetPerEp = Math.round((suggestedBudget({ format, runtime }) * budgetMult) / 50_000) * 50_000;
  const premises = useMemo(() => (s ? genPremises(makeRng(s.seed, s.t, 'tvpremise', format, g, g2, tone, roll), g, g2 || undefined, tone) : []), [s, format, g, g2, tone, roll]);
  const suggestedTitle = useMemo(() => (s ? genTitle(makeRng(s.seed, s.t, 'tvtitle', g, g2, roll), g, g2 || undefined) : ''), [s, g, g2, roll]);
  const writers = useMemo(() => {
    if (!s) return [];
    return allTalent(s, 'writer').filter((w) => isAvailable(s, w.id) && !dealBlock(s, w.id, s.studio.id) && (!q || w.name.toLowerCase().includes(q.toLowerCase())))
      .map((w) => ({ w, fit: Math.round(0.55 * w.attrs.acting + 0.45 * genreFit(w, g, g2 || undefined)) - ((w.languages ?? []).includes(language) ? 0 : 8) }))
      .sort((a, b) => b.fit - a.fit).slice(0, 40);
  }, [s, g, g2, q, language]);
  // Which channels would even look at this?
  const buyers = useMemo(() => CHANNELS.filter((c) => (!c.studioId || s?.rivals.some((r) => r.id === c.studioId)) && budgetPerEp <= c.maxBudgetPerEp && (c.languages.includes(language) || c.kind === 'streamer') && (c.formats[format] ?? 0.6) >= 1 && ((c.genres[g] ?? 0.7) >= 1.1)), [s, budgetPerEp, language, format, g]);
  if (!s) return null;
  const writer = writers.find((x) => x.w.id === writerId)?.w;
  const fee = writer ? Math.round((writer.fee * (0.6 + turns * 0.15) * dealFeeMult(s, writer.id, s.studio.id)) / 10_000) * 10_000 : 0;
  const strike = writersStrike(s);

  const pickFormat = (f: SeriesFormat) => {
    setFormat(f);
    const fi = FORMAT_INFO[f];
    setEpisodes(fi.lengths[Math.min(fi.lengths.length - 1, 1)]);
    setRuntime(fi.runtimes[0]);
    if (f === 'Docuseries') setG('Documentary');
    if (f === 'Animated') setG('Animation');
    if (f === 'Sitcom') setG('Comedy');
    if (f === 'Procedural') setG('Crime');
  };

  const go = () => {
    const x = act((d) => developSeries(d, { title: title || suggestedTitle, logline: premises[premiseIdx], format, genre: g, genre2: g2 || undefined, tone, language, episodes, runtime, budgetPerEp, writerId, turns, spinoffOf: src?.id }));
    if (x) router.push(`/tv/${x.id}`);
  };

  return (
    <div>
      <PageHeader title={src ? `Spin-off: ${src.title}` : 'Develop a series'} sub={src ? 'A series built on a hit you own. It starts with the original’s audience and joins its franchise.' : 'Pick a format, write a pilot, then package and pitch it.'} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="1. The show">
          <div className="space-y-4">
            <Field label="Format">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SERIES_FORMATS.map((f) => (
                  <button key={f} onClick={() => pickFormat(f)} className={`rounded-lg border px-2 py-2 text-left text-sm ${format === f ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{f}</button>
                ))}
              </div>
              <div className="mt-1 text-xs text-muted">{info.blurb}{info.oneSeason ? ' One season only.' : ''}{info.syndicates ? ' Reaches syndication at 88 episodes.' : ''}</div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Genre"><select className="select w-full" value={g} onChange={(e) => setG(e.target.value as Genre)}>{GENRES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Second genre"><select className="select w-full" value={g2} onChange={(e) => setG2(e.target.value as Genre | '')}><option value="">—</option>{GENRES.filter((x) => x !== g).map((x) => <option key={x}>{x}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Language"><select className="select w-full" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGUAGE_CODES.map((l) => <option key={l} value={l}>{langName(l)}</option>)}</select></Field>
              <Field label="Tone"><select className="select w-full" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>{(['light', 'balanced', 'dark'] as Tone[]).map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Episodes per season"><div className="flex flex-wrap gap-1.5">{info.lengths.map((n) => <button key={n} onClick={() => setEpisodes(n)} className={`rounded-lg border px-3 py-1.5 text-sm ${episodes === n ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{n}</button>)}</div></Field>
              <Field label="Episode length"><div className="flex flex-wrap gap-1.5">{info.runtimes.map((n) => <button key={n} onClick={() => setRuntime(n)} className={`rounded-lg border px-3 py-1.5 text-sm ${runtime === n ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{n} min</button>)}</div></Field>
            </div>
            <Field label={`Budget per episode — ${money(budgetPerEp)}`} hint={`Typical for this format: ${money(suggestedBudget({ format, runtime }))}. Season cost before cast ≈ ${money(budgetPerEp * episodes)}.`}>
              <input type="range" min={0.5} max={4} step={0.1} value={budgetMult} onChange={(e) => setBudgetMult(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
            </Field>
            <Field label="Premise">
              <div className="space-y-2">
                {premises.map((p, i) => <button key={p} onClick={() => setPremiseIdx(i)} className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${premiseIdx === i ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{p}</button>)}
                <Button size="sm" variant="ghost" onClick={() => { setRoll(roll + 1); setPremiseIdx(0); }}>↻ More ideas</Button>
              </div>
            </Field>
            <Field label="Title"><input className="input" value={title} placeholder={suggestedTitle} onChange={(e) => setTitle(e.target.value)} /></Field>
            <div className="rounded-lg border border-line bg-panel2 p-3 text-sm">
              <div className="label mb-1">Likely buyers</div>
              {buyers.length ? <div className="flex flex-wrap gap-1.5">{buyers.map((c) => <span key={c.id} className="chip text-gold">{c.name}</span>)}</div>
                : <div className="text-amber-300">No channel is a natural fit for this mix of format, genre, language and budget. You can still pitch, or keep it for your own streaming service.</div>}
            </div>
          </div>
        </Panel>
        <Panel title="2. The showrunner">
          <input className="input mb-3" placeholder="Search writers…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
            {writers.map(({ w, fit }) => (
              <button key={w.id} onClick={() => setWriterId(w.id)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${writerId === w.id ? 'border-gold bg-gold/10' : 'border-line bg-panel2 hover:border-gold/40'}`}>
                <Avatar t={w} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{w.name}{dealFor(s, w.id)?.studioId === s.studio.id && <span className="ml-1 text-xs text-gold">· your deal</span>}</span>
                  <span className="text-xs text-muted">Fit {fit} · <span style={{ color: GENRE_COLORS[g] }}>{g}</span> {w.genres[g]} · {(w.languages ?? []).includes(language) ? `writes in ${langName(language)}` : <span className="text-amber-300">no {langName(language)}</span>}</span>
                </span>
                <OvrBadge value={w.attrs.overall} size="sm" />
                <span className="w-16 text-right text-xs text-gold">{money(w.fee)}</span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Field label={`Pilot & bible: ${turns} fortnight${turns > 1 ? 's' : ''}`} hint="More time = a stronger pilot and a higher fee.">
              <input type="range" min={1} max={4} value={turns} onChange={(e) => setTurns(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <div className="text-sm">{writer ? <>Showrunner fee <span className="font-semibold text-gold">{money(fee)}</span></> : <span className="text-muted">Pick a showrunner</span>}</div>
            <Button variant="ticket" onClick={go} disabled={!writer || s.studio.cash < fee || strike} title={strike ? "The writers are on strike" : undefined}>Write the pilot</Button>
          </div>
          {strike && <p className="mt-2 text-xs text-amber-300">The writers are on strike. Nothing can be written until it ends.</p>}
        </Panel>
      </div>
    </div>
  );
}
