'use client';
import { useMemo, useState, type CSSProperties } from 'react';
import { useGame } from '@/store/game';
import { GENRE_COLORS } from '@/lib/constants';
import { money } from '@/lib/format';
import { allTalent, genreFit } from '@/lib/talentDb';
import { LANGUAGES, GENRES, type Genre, type Language, type TVFormat } from '@/lib/types';
import { nextId, pay } from '@/lib/engine/util';
import { Button, Field, PageHeader, Panel } from '@/components/ui';

const FORMATS: TVFormat[] = ['Drama', 'Comedy', 'Limited series', 'Reality', 'Docuseries', 'Animation', 'Competition'];
const CHANNELS = [
  { id: 'crown', name: 'Crown+', color: '#d8b35a', genres: ['Drama','Crime','Romance','Historical','Fantasy'] as string[], languages: ['English','French','German'] as string[], prestige: 82, ratePerEpisode: 1_450_000 },
  { id: 'pulse', name: 'Pulse Network', color: '#fb7185', genres: ['Comedy','Reality','Romance','Competition','Family'] as string[], languages: ['English','Spanish','Portuguese'] as string[], prestige: 58, ratePerEpisode: 760_000 },
  { id: 'orbit', name: 'Orbit Stream', color: '#60a5fa', genres: ['Sci-Fi','Fantasy','Animation','Action','Documentary'] as string[], languages: ['English','Japanese','Korean','Mandarin'] as string[], prestige: 72, ratePerEpisode: 1_100_000 },
  { id: 'world', name: 'WorldView', color: '#4ade80', genres: [...GENRES] as string[], languages: [...LANGUAGES] as string[], prestige: 64, ratePerEpisode: 880_000 },
];

export default function SeriesPage() {
  const { state: s, act } = useGame();
  const [title, setTitle] = useState(''); const [format, setFormat] = useState<TVFormat>('Drama');
  const [genre, setGenre] = useState<Genre>('Drama'); const [language, setLanguage] = useState<Language>('English');
  const [episodes, setEpisodes] = useState(8); const [minutes, setMinutes] = useState(45);
  const [budget, setBudget] = useState(1_000_000); const [seasons, setSeasons] = useState(1);
  const [renewal, setRenewal] = useState(true); const [castIds, setCastIds] = useState<string[]>([]);
  const actors = useMemo(() => s ? allTalent(s, 'actor').map((a) => ({ a, fit: genreFit(a, genre) })).sort((a,b) => b.fit-a.fit).slice(0,80) : [], [s, genre]);
  if (!s) return null;
  const seasonCost = episodes * budget;
  const offerFor = (channel: typeof CHANNELS[number]) => {
    const genreFitBonus = channel.genres.includes(genre) ? 1.12 : 0.78;
    const languageFitBonus = channel.languages.includes(language) ? 1.12 : 0.82;
    const quality = Math.round(Math.min(95, 45 + channel.prestige * 0.35 + (castIds.length ? castIds.reduce((n,id) => n + (allTalent(s,'actor').find((x) => x.id === id)?.attrs.overall ?? 50), 0) / castIds.length * 0.2 : 0)));
    return { rate: Math.round(channel.ratePerEpisode * genreFitBonus * languageFitBonus * (0.72 + quality / 200)), quality };
  };
  const sign = (channel: typeof CHANNELS[number]) => {
    const offer = offerFor(channel);
    if (s.studio.cash < seasonCost) return;
    act((d) => {
      const id = nextId(d, 'tv');
      pay(d, d.studio.id, -seasonCost, 'TV production');
      const series = { id, title: title.trim() || `${genre} Nights`, format, genre, language, episodes, episodeMinutes: minutes, budgetPerEpisode: budget,
        quality: offer.quality, channelId: channel.id, channelName: channel.name, seasonsGuaranteed: seasons, renewalOption: renewal,
        totalSeasons: seasons, seasonsProduced: 1, nextSeasonT: d.t + 13, status: seasons > 1 || renewal ? 'airing' as const : 'complete' as const, castIds: [...castIds], revenue: offer.rate * episodes, spent: seasonCost, createdT: d.t };
      d.series ??= []; d.series.push(series);
      // The channel guarantees the first season's licence fee up front. Future seasons renew on performance.
      pay(d, d.studio.id, offer.rate * episodes, `TV licence · ${channel.name}`);
    });
    setTitle(''); setCastIds([]);
  };
  const active = (s.series ?? []).filter((x) => x.status !== 'complete');
  return <div className="space-y-6">
    <PageHeader title="Television Studio" sub="Pitch a show, compare channel offers, and build a run that lasts." />
    <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <Panel title="Build your series pitch" className="series-pitch">
        <div className="space-y-4">
          <Field label="Series title"><input className="input" value={title} maxLength={48} onChange={(e)=>setTitle(e.target.value)} placeholder="A title that belongs on a marquee" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Format"><select className="select w-full" value={format} onChange={(e)=>setFormat(e.target.value as TVFormat)}>{FORMATS.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Genre"><select className="select w-full" value={genre} onChange={(e)=>setGenre(e.target.value as Genre)}>{GENRES.map(x=><option key={x}>{x}</option>)}</select></Field></div>
          <Field label="Production language"><select className="select w-full" value={language} onChange={(e)=>setLanguage(e.target.value as Language)}>{LANGUAGES.map(x=><option key={x}>{x}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={`Episodes per season: ${episodes}`}><input type="range" min="4" max="24" step="1" value={episodes} onChange={e=>setEpisodes(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field><Field label={`Episode length: ${minutes} min`}><input type="range" min="15" max="90" step="5" value={minutes} onChange={e=>setMinutes(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label={`Budget per episode · ${money(budget)}`}><input type="range" min="250000" max="6000000" step="250000" value={budget} onChange={e=>setBudget(Number(e.target.value))} className="w-full accent-[#D4AF37]" /></Field><Field label="Guaranteed seasons"><select className="select w-full" value={seasons} onChange={e=>setSeasons(Number(e.target.value))}><option value={1}>1 season</option><option value={2}>2 seasons</option><option value={3}>3 seasons</option><option value={5}>5 seasons</option></select></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={renewal} onChange={e=>setRenewal(e.target.checked)} className="accent-[#D4AF37]" /> Add a one-season renewal option if the channel wants more</label>
          <div className="rounded-xl border border-gold/20 bg-gold/5 p-3 text-sm"><span className="label">Season production cost</span><div className="mt-1 text-xl font-semibold text-gold">{money(seasonCost)}</div><span className="text-xs text-muted">A {seasons}-season commitment means up to {money(seasonCost * seasons)} of production.</span></div>
          <Field label={`Cast · ${castIds.length} selected`}><div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-auto">{actors.map(({a,fit})=><button type="button" key={a.id} onClick={()=>setCastIds(ids=>ids.includes(a.id)?ids.filter(x=>x!==a.id):ids.length<5?[...ids,a.id]:ids)} className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-left text-xs ${castIds.includes(a.id)?'border-gold bg-gold/10':'border-line bg-panel2 hover:border-gold/40'}`}><span className="truncate">{a.name}</span><span className="ml-2 shrink-0 text-muted">{a.languages?.join(', ') ?? 'English'} · {Math.round(fit)}</span></button>)}</div></Field>
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Channel offers" right={<span className="chip">Pick a deal to greenlight</span>}>
          <div className="space-y-3">{CHANNELS.map((channel)=>{const offer=offerFor(channel);const payout=offer.rate*episodes;return <article key={channel.id} className="channel-card rounded-xl border border-line bg-panel2 p-4" style={{'--channel':channel.color} as CSSProperties}>
          <div className="flex items-start justify-between gap-3"><div><div className="font-display text-lg font-bold">{channel.name}</div><div className="mt-1 flex flex-wrap gap-1.5"><span className="chip">★ {channel.prestige} prestige</span><span className="chip">{channel.genres.includes(genre)?'Genre match':'Wider audience'}</span><span className="chip">{channel.languages.includes(language)?'Language match':'Global reach'}</span></div></div><span className="rounded-lg px-2 py-1 text-xs" style={{background:channel.color+'22',color:channel.color}}>CH {channel.id.slice(0,2).toUpperCase()}</span></div>
            <div className="my-3 grid grid-cols-2 gap-3"><div><div className="label">Licence per episode</div><div className="text-lg font-semibold">{money(offer.rate)}</div></div><div><div className="label">Season 1 advance</div><div className="text-lg font-semibold text-emerald-300">{money(payout)}</div></div></div>
            <div className="mb-3 text-xs text-muted">Offer: {seasons} guaranteed season{seasons===1?'':'s'}{renewal?' + one-season renewal option':''} · estimated quality {offer.quality}</div>
            <Button variant="ticket" className="w-full" disabled={s.studio.cash<seasonCost} onClick={()=>sign(channel)}>Accept contract · greenlight</Button>
          </article>})}</div>
        </Panel>
        <Panel title="Your television slate" right={<span className="chip">{active.length} active</span>}>
          {!s.series?.length?<div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No shows in production yet. A great series can turn one hit into five seasons.</div>:<div className="space-y-2">{s.series.map(show=><div key={show.id} className="rounded-lg border border-line bg-panel2 p-3"><div className="flex items-center justify-between"><div className="font-semibold">{show.title}</div><span className="chip" style={{color:GENRE_COLORS[show.genre]}}>{show.genre}</span></div><div className="mt-1 text-xs text-muted">{show.format} · {show.language} · {show.episodes} × {show.episodeMinutes} min · {show.channelName}</div><div className="mt-2 flex gap-3 text-xs"><span>Season {Math.max(1,show.seasonsProduced)} / {show.totalSeasons}</span><span className="text-emerald-300">Revenue {money(show.revenue)}</span><span className="text-muted">Quality {show.quality}</span></div></div>)}</div>}
        </Panel>
      </div>
    </div>
  </div>;
}
