'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { GENRE_COLORS, TIERS, tierOf } from '@/lib/constants';
import { money } from '@/lib/format';
import { makeRng } from '@/lib/rng';
import { allTalent, genreFit, isAvailable } from '@/lib/talentDb';
import { genPremises, genTitle } from '@/lib/titles';
import { commissionScript } from '@/lib/engine/scripts';
import { GENRES, LANGUAGES, type BudgetTier, type Genre, type Language, type Tone, type TVFormat } from '@/lib/types';
import { Button, Field, PageHeader, Panel } from '@/components/ui';
import { Avatar, OvrBadge } from '@/components/cards';

export default function Develop() {
  const { state: s, act } = useGame();
  const router = useRouter();
  const params = useSearchParams();
  const [medium, setMedium] = useState<'film' | 'tv'>(params.get('medium') === 'tv' ? 'tv' : 'film');
  const [tvFormat, setTvFormat] = useState<TVFormat>('Drama');
  const [episodes, setEpisodes] = useState(8);
  const [episodeMinutes, setEpisodeMinutes] = useState(45);
  const [episodeBudget, setEpisodeBudget] = useState(1_000_000);
  const [seasons, setSeasons] = useState(1);
  const [renewalOption, setRenewalOption] = useState(true);
  const [g, setG] = useState<Genre>('Thriller');
  const [language, setLanguage] = useState<Language>('English');
  const [g2, setG2] = useState<Genre | ''>('');
  const [tone, setTone] = useState<Tone>('balanced');
  const [tier, setTier] = useState<BudgetTier>('Mid');
  const [roll, setRoll] = useState(0);
  const [premiseIdx, setPremiseIdx] = useState(0);
  const [title, setTitle] = useState('');
  const [writerId, setWriterId] = useState('');
  const [turns, setTurns] = useState(2);
  const [q, setQ] = useState('');

  const premises = useMemo(() => s ? genPremises(makeRng(s.seed, s.t, 'premise', g, g2, tone, roll), g, g2 || undefined, tone) : [], [s, g, g2, tone, roll]);
  const suggestedTitle = useMemo(() => s ? genTitle(makeRng(s.seed, s.t, 'title', g, g2, roll), g, g2 || undefined) : '', [s, g, g2, roll]);
  const writers = useMemo(() => {
    if (!s) return [];
    return allTalent(s, 'writer').filter((w) => isAvailable(s, w.id) && (!q || w.name.toLowerCase().includes(q.toLowerCase())))
      .map((w) => ({ w, fit: Math.round(0.55 * w.attrs.acting + 0.45 * genreFit(w, g, g2 || undefined)) }))
      .sort((a, b) => b.fit - a.fit).slice(0, 40);
  }, [s, g, g2, q]);
  if (!s) return null;
  const writer = writers.find((x) => x.w.id === writerId)?.w;
  const fee = writer ? Math.round(writer.fee * (0.7 + turns * 0.15) / 10_000) * 10_000 : 0;

  const go = () => {
    const id = act((d) => {
      const seasonBudget = episodes * episodeBudget;
      const selectedTier = medium === 'tv' ? tierOf(seasonBudget) : tier;
      const f = commissionScript(d, { genre: g, genre2: g2 || undefined, tone, tier: selectedTier, premise: premises[premiseIdx], writerId, turns, title: title || suggestedTitle });
      if (!f) return undefined;
      f.language = language;
      if (medium === 'tv') {
        f.budget = seasonBudget;
        f.suggestedBudget = seasonBudget;
        f.tv = { format: tvFormat, episodes, episodeMinutes, budgetPerEpisode: episodeBudget, seasonsGuaranteed: seasons,
          totalSeasons: seasons, seasonsProduced: 0, renewalOption, status: 'development' };
      }
      return f.id;
    });
    if (id) router.push(`/film/${id}`);
  };

  return (
    <div>
      <PageHeader title="Development Studio" sub="Movies and television move through the same script, casting and production pipeline." />
      <div className="mb-5 inline-flex rounded-xl border border-line bg-panel p-1">
        {([['film', '🎞 Feature film'], ['tv', '▣ TV series']] as const).map(([id, label]) => <button key={id} onClick={() => setMedium(id)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${medium === id ? 'bg-gold text-[#16120A]' : 'text-muted hover:text-white'}`}>{label}</button>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`1. The ${medium === 'film' ? 'film' : 'series'} idea`}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary genre"><select className="select w-full" value={g} onChange={(e) => setG(e.target.value as Genre)}>{GENRES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Secondary (optional)"><select className="select w-full" value={g2} onChange={(e) => setG2(e.target.value as Genre | '')}><option value="">—</option>{GENRES.filter((x) => x !== g).map((x) => <option key={x}>{x}</option>)}</select></Field>
            </div>
            <Field label="Tone">
              <div className="grid grid-cols-3 gap-2">{(['light', 'balanced', 'dark'] as Tone[]).map((t) => <button key={t} onClick={() => setTone(t)} className={`rounded-lg border px-3 py-2 text-sm capitalize ${tone === t ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{t}</button>)}</div>
            </Field>
            <Field label="Primary language"><select className="select w-full" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>{LANGUAGES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            {medium === 'tv' && <>
              <Field label="Series format"><select className="select w-full" value={tvFormat} onChange={(e) => setTvFormat(e.target.value as TVFormat)}>{(['Drama','Comedy','Limited series','Reality','Docuseries','Animation','Competition'] as TVFormat[]).map((x) => <option key={x}>{x}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3"><Field label={`Episodes per season: ${episodes}`}><input type="range" min="4" max="24" value={episodes} onChange={(e) => setEpisodes(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field><Field label={`Episode length: ${episodeMinutes} min`}><input type="range" min="15" max="90" step="5" value={episodeMinutes} onChange={(e) => setEpisodeMinutes(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field></div>
              <div className="grid grid-cols-2 gap-3"><Field label={`Budget per episode: ${money(episodeBudget)}`}><input type="range" min="250000" max="6000000" step="250000" value={episodeBudget} onChange={(e) => setEpisodeBudget(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field><Field label="Channel contract length"><select className="select w-full" value={seasons} onChange={(e) => setSeasons(Number(e.target.value))}><option value={1}>1 season</option><option value={2}>2 seasons</option><option value={3}>3 seasons</option><option value={5}>5 seasons</option></select></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={renewalOption} onChange={(e) => setRenewalOption(e.target.checked)} className="accent-[#D4AF37]" /> Include a one-season renewal option</label>
              <div className="rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-sm">Season budget <strong className="text-gold">{money(episodes * episodeBudget)}</strong> · {seasons} guaranteed season{seasons === 1 ? '' : 's'}{renewalOption ? ' + option' : ''}</div>
            </>}
            {medium === 'film' && <Field label="Budget tier">
              <div className="grid grid-cols-5 gap-1.5">{TIERS.map((t) => <button key={t.tier} onClick={() => setTier(t.tier)} className={`rounded-lg border px-1 py-2 text-xs ${tier === t.tier ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{t.tier}<div className="text-[10px] text-muted">{money(t.min, 0)}+</div></button>)}</div>
            </Field>}
            <Field label="Premise">
              <div className="space-y-2">
                {premises.map((p, i) => <button key={p} onClick={() => setPremiseIdx(i)} className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${premiseIdx === i ? 'border-gold bg-gold/10' : 'border-line bg-panel2'}`}>{p}</button>)}
                <Button size="sm" variant="ghost" onClick={() => { setRoll(roll + 1); setPremiseIdx(0); }}>↻ More ideas</Button>
              </div>
            </Field>
            <Field label="Working title"><input className="input" value={title} placeholder={suggestedTitle} onChange={(e) => setTitle(e.target.value)} /></Field>
          </div>
        </Panel>
        <Panel title="2. The writer">
          <input className="input mb-3" placeholder="Search writers…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {writers.map(({ w, fit }) => (
              <button key={w.id} onClick={() => setWriterId(w.id)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${writerId === w.id ? 'border-gold bg-gold/10' : 'border-line bg-panel2 hover:border-gold/40'}`}>
                <Avatar t={w} size={36} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{w.name}</span><span className="text-xs text-muted">Fit {fit} · <span style={{ color: GENRE_COLORS[g] }}>{g}</span> {w.genres[g]}</span></span>
                <OvrBadge value={w.attrs.overall} size="sm" />
                <span className="w-16 text-right text-xs text-gold">{money(w.fee)}</span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Field label={`Development time: ${turns} fortnight${turns > 1 ? 's' : ''}`} hint="More time = better script, higher fee.">
              <input type="range" min={1} max={4} value={turns} onChange={(e) => setTurns(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <div className="text-sm">{writer ? <>Writer fee <span className="font-semibold text-gold">{money(fee)}</span></> : <span className="text-muted">Pick a writer</span>}</div>
            <Button variant="ticket" onClick={go} disabled={!writer || s.studio.cash < fee}>Commission</Button>
          </div>
          <p className="mt-3 text-xs text-muted">Adapting a book, game or comic? Buy rights in <Link href="/ip" className="link">IP & Franchises</Link>.</p>
        </Panel>
      </div>
    </div>
  );
}
