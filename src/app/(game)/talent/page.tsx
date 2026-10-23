'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { ageAt } from '@/lib/calendar';
import { GENRE_COLORS, countryName, flag } from '@/lib/constants';
import { money } from '@/lib/format';
import { allTalent, bestGenre, isAvailable } from '@/lib/talentDb';
import { GENRES, type Genre, type TalentKind } from '@/lib/types';
import { Button, Empty, PageHeader, Tabs } from '@/components/ui';
import { Avatar, OvrBadge, TalentCard } from '@/components/cards';

type SortKey = 'overall' | 'starPower' | 'acting' | 'boxOffice' | 'fee' | 'age' | 'genre' | 'name' | 'potential';
const PAGE = 48;

export default function TalentDB() {
  const s = useGame((x) => x.state)!;
  const params = useSearchParams();
  const castFor = params.get('cast');
  const [kind, setKind] = useState<TalentKind>((params.get('kind') as TalentKind) || 'actor');
  const [q, setQ] = useState('');
  const [nat, setNat] = useState('');
  const [gender, setGender] = useState('');
  const [genre, setGenre] = useState<Genre | ''>('');
  const [minOvr, setMinOvr] = useState(0);
  const [maxFee, setMaxFee] = useState(0);
  const [ageMin, setAgeMin] = useState(0);
  const [ageMax, setAgeMax] = useState(100);
  const [avail, setAvail] = useState(false);
  const [newcomers, setNewcomers] = useState(params.get('newcomers') === '1');
  const [sort, setSort] = useState<SortKey>('overall');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [page, setPage] = useState(0);

  const all = useMemo(() => allTalent(s, kind), [s, kind]);
  const nats = useMemo(() => [...new Set(all.map((t) => t.nationality))].sort(), [all]);
  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    const list = all.filter((t) => {
      if (ql && !t.name.toLowerCase().includes(ql)) return false;
      if (nat && t.nationality !== nat) return false;
      if (gender && t.gender !== gender) return false;
      if (minOvr && t.attrs.overall < minOvr) return false;
      if (maxFee && t.fee > maxFee) return false;
      const age = ageAt(t.birthDate, s.t);
      if (age < ageMin || age > ageMax) return false;
      if (newcomers && !(t.isFictional && (t.debutYear ?? 0) >= 2027)) return false;
      if (avail && !isAvailable(s, t.id)) return false;
      return true;
    });
    const key = (t: (typeof list)[number]): number | string => {
      switch (sort) {
        case 'fee': return t.fee;
        case 'age': return ageAt(t.birthDate, s.t);
        case 'genre': return genre ? t.genres[genre] : t.genres[bestGenre(t)];
        case 'name': return t.name;
        case 'potential': return t.potential;
        default: return t.attrs[sort];
      }
    };
    return list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [all, q, nat, gender, minOvr, maxFee, ageMin, ageMax, newcomers, avail, sort, dir, genre, s]);

  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const th = (k: SortKey, label: string, right = false) => (
    <th className={`cursor-pointer select-none hover:text-gold ${right ? 'text-right' : ''}`} onClick={() => { if (sort === k) setDir(dir === 1 ? -1 : 1); else { setSort(k); setDir(k === 'name' || k === 'fee' || k === 'age' ? 1 : -1); } setPage(0); }}>
      {label}{sort === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  const href = (id: string) => (castFor ? `/casting/${castFor}?talent=${id}` : `/talent/${id}`);

  return (
    <div>
      <PageHeader title="Talent Database" sub={<>{rows.length.toLocaleString()} of {all.length.toLocaleString()} people{castFor && <> · <span className="text-gold">picking for casting</span></>}</>}
        right={<><Button size="sm" variant={view === 'table' ? 'gold' : 'ghost'} onClick={() => setView('table')}>Table</Button><Button size="sm" variant={view === 'cards' ? 'gold' : 'ghost'} onClick={() => setView('cards')}>Cards</Button></>} />
      <Tabs value={kind} onChange={(k) => { setKind(k); setPage(0); }} tabs={[
        { id: 'actor', label: 'Actors' }, { id: 'director', label: 'Directors' }, { id: 'writer', label: 'Writers' },
        ...(s.settings.crewMode === 'full' ? [{ id: 'composer' as const, label: 'Composers' }, { id: 'cinematographer' as const, label: 'Cinematographers' }, { id: 'editor' as const, label: 'Editors' }] : []),
      ]} />
      <div className="panel mb-4 grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <input className="input col-span-2" placeholder="Search name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="select" value={nat} onChange={(e) => { setNat(e.target.value); setPage(0); }}><option value="">All nationalities</option>{nats.map((n) => <option key={n} value={n}>{flag(n)} {countryName(n)}</option>)}</select>
        <select className="select" value={gender} onChange={(e) => { setGender(e.target.value); setPage(0); }}><option value="">Any gender</option><option value="F">Female</option><option value="M">Male</option><option value="X">Non-binary</option></select>
        <select className="select" value={genre} onChange={(e) => { setGenre(e.target.value as Genre | ''); if (e.target.value) setSort('genre'); setPage(0); }}><option value="">Genre rating…</option>{GENRES.map((g) => <option key={g}>{g}</option>)}</select>
        <select className="select" value={minOvr} onChange={(e) => { setMinOvr(Number(e.target.value)); setPage(0); }}><option value={0}>Any overall</option>{[50, 60, 70, 80].map((v) => <option key={v} value={v}>{v}+ overall</option>)}</select>
        <select className="select" value={maxFee} onChange={(e) => { setMaxFee(Number(e.target.value)); setPage(0); }}><option value={0}>Any fee</option>{[250e3, 1e6, 3e6, 10e6].map((v) => <option key={v} value={v}>≤ {money(v)}</option>)}</select>
        <select className="select" value={`${ageMin}-${ageMax}`} onChange={(e) => { const [a, b] = e.target.value.split('-').map(Number); setAgeMin(a); setAgeMax(b); setPage(0); }}>
          <option value="0-100">Any age</option><option value="0-25">Under 26</option><option value="26-40">26–40</option><option value="41-60">41–60</option><option value="61-100">61+</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={avail} onChange={(e) => { setAvail(e.target.checked); setPage(0); }} className="accent-[#D4AF37]" /> Available now</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newcomers} onChange={(e) => { setNewcomers(e.target.checked); setPage(0); }} className="accent-[#D4AF37]" /> Newcomers only</label>
      </div>

      {!rows.length && <Empty>No one matches those filters.</Empty>}
      {view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown.map((t) => <Link key={t.id} href={href(t.id)}><TalentCard t={t} s={s} onClick={undefined} /></Link>)}</div>
      ) : rows.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="tbl">
            <thead><tr>{th('name', 'Name')}<th>Nat</th>{th('age', 'Age', true)}{th('overall', 'OVR', true)}{th('starPower', 'Star', true)}{th('acting', kind === 'actor' ? 'Acting' : 'Craft', true)}{th('boxOffice', 'Box', true)}{th('genre', genre || 'Best genre', true)}{newcomers && th('potential', 'Pot.', true)}{th('fee', 'Fee', true)}<th>Status</th></tr></thead>
            <tbody>
              {shown.map((t) => {
                const bg = bestGenre(t);
                const free = isAvailable(s, t.id);
                return (
                  <tr key={t.id}>
                    <td><Link href={href(t.id)} className="flex items-center gap-2 hover:text-gold"><Avatar t={t} size={28} /><span className="font-medium">{t.name}</span>{t.isFictional && <span className="text-[10px] text-muted">fict.</span>}</Link></td>
                    <td title={countryName(t.nationality)}>{flag(t.nationality)}</td>
                    <td className="text-right tabular-nums">{ageAt(t.birthDate, s.t)}</td>
                    <td className="text-right"><OvrBadge value={t.attrs.overall} size="sm" /></td>
                    <td className="text-right tabular-nums">{t.attrs.starPower}</td>
                    <td className="text-right tabular-nums">{t.attrs.acting}</td>
                    <td className="text-right tabular-nums">{t.attrs.boxOffice}</td>
                    <td className="text-right tabular-nums">{genre ? t.genres[genre] : <span style={{ color: GENRE_COLORS[bg] }}>{bg} {t.genres[bg]}</span>}</td>
                    {newcomers && <td className="text-right tabular-nums text-emerald-300">{t.potential}</td>}
                    <td className="text-right tabular-nums text-gold">{money(t.fee)}</td>
                    <td>{free ? <span className="text-emerald-400">Free</span> : <span className="text-amber-300">Busy</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > PAGE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</Button>
          <span className="text-muted">Page {page + 1} / {Math.ceil(rows.length / PAGE)}</span>
          <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next →</Button>
        </div>
      )}
    </div>
  );
}
