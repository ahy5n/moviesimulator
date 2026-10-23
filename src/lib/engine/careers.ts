// Talent careers: newcomers, retirements and life events.
// Rule: real people only ever get neutral or positive events. Negative stories are for fictional talent only.
import { ageAt, yearOf } from '../calendar';
import { fictionalName } from '../names';
import { fictionalPerson } from '../ratings';
import { makeRng, type RNG } from '../rng';
import { getDB, isAvailable, override, talent } from '../talentDb';
import type { GameState, Gender, Talent, TalentKind } from '../types';
import { headline, msg } from './util';
import { setCommit } from './scripts';

export function generateNewcomers(s: GameState, count = 150) {
  const year = yearOf(s.t);
  const r = makeRng(s.seed, year, 'newcomers');
  const used = new Set([...getDB().all.map((t) => t.name), ...s.newTalent.map((t) => t.name)]);
  const mix: [TalentKind, number][] = s.settings.crewMode === 'full'
    ? [['actor', 0.72], ['director', 0.1], ['writer', 0.1], ['composer', 0.03], ['cinematographer', 0.03], ['editor', 0.02]]
    : [['actor', 0.78], ['director', 0.11], ['writer', 0.11]];
  const out: Talent[] = [];
  for (let i = 0; i < count; i++) {
    const kind = r.weighted(mix, ([, w]) => w)[0];
    const gender: Gender = r.chance(0.49) ? 'F' : r.chance(0.97) ? 'M' : 'X';
    const { name, nationality } = fictionalName(r, gender, used);
    const age = kind === 'actor' ? r.int(18, 25) : r.int(24, 32);
    out.push(fictionalPerson({ id: `n${year}_${i}`, name, gender, nationality, birthYear: year - age, kind, tier: r.range(0, 0.25), seed: s.seed, year }));
  }
  s.newTalent.push(...out);
  const wonder = out.filter((t) => t.potential >= 80).sort((a, b) => b.potential - a.potential).slice(0, 3);
  if (wonder.length) msg(s, 'news', `Class of ${year}: ${out.length} newcomers arrive`, `Scouts are excited about ${wonder.map((t) => t.name).join(', ')}.`, { link: '/talent?newcomers=1' });
}

export function retirements(s: GameState) {
  const year = yearOf(s.t);
  const notable: string[] = [];
  for (const b of [...getDB().all, ...s.newTalent]) {
    if (s.talentOverrides[b.id]?.retired) continue;
    const age = ageAt(b.birthDate, s.t);
    if (age < 68) continue;
    const p = age >= 85 ? 0.3 : age >= 78 ? 0.12 : 0.04;
    if (!makeRng(s.seed, year, 'retire', b.id).chance(p)) continue;
    if (!isAvailable(s, b.id)) continue;
    override(s, b.id).retired = true;
    if (b.attrs.overall >= 68) notable.push(b.name);
  }
  if (notable.length) msg(s, 'news', 'Retirements announced', `${notable.slice(0, 6).join(', ')}${notable.length > 6 ? ` and ${notable.length - 6} others` : ''} have announced their retirement from film.`);
}

type Ev = { w: number; fictionalOnly?: boolean; run: (t: Talent, r: RNG) => string | null };

const EVENTS: Ev[] = [
  { w: 3, run: (t) => `${t.name} is taking a short break from acting to spend time with family.` },
  { w: 2, run: (t) => `${t.name} says they want to step behind the camera and direct.` },
  { w: 2, run: (t) => `${t.name} is campaigning to get a long-held passion project made.` },
  { w: 2, run: (t) => `${t.name} has signed on for a rival studio's franchise.` },
  { w: 1.5, run: (t) => `${t.name} publicly praised your studio in a trade interview.` },
  // Fictional talent only from here.
  { w: 2, fictionalOnly: true, run: (t) => `Tabloid scandal: ${t.name} under fire after a leaked voicemail.` },
  { w: 1.5, fictionalOnly: true, run: (t) => `${t.name} is in a very public feud with a former co-star.` },
  { w: 1, fictionalOnly: true, run: (t) => `${t.name} was dropped by their agency amid a backstage dispute.` },
];

export function talentEvents(s: GameState) {
  const r = makeRng(s.seed, s.t, 'tevents');
  const n = r.chance(0.5) ? 1 : 0;
  const db = getDB().all;
  for (let i = 0; i < n; i++) {
    const pool = r.chance(0.35) && s.newTalent.length ? s.newTalent : db;
    let base = pool[Math.floor(r() * pool.length)];
    for (let k = 0; k < 8 && (base.kind !== 'actor' || base.attrs.starPower < 45); k++) base = pool[Math.floor(r() * pool.length)];
    const t = talent(s, base.id);
    if (!t || s.talentOverrides[t.id]?.retired) continue;
    const allowed = EVENTS.filter((e) => !e.fictionalOnly || t.isFictional);
    const idx = EVENTS.indexOf(r.weighted(allowed, (e) => e.w));
    const ev = EVENTS[idx];
    if (ev.fictionalOnly && !t.isFictional) continue; // hard guard
    const text = ev.run(t, r);
    if (!text) continue;
    const ov = () => override(s, t.id);
    switch (idx) {
      case 0: if (!isAvailable(s, t.id)) continue; ov().breakUntil = s.t + 6; break;
      case 3: { if (!isAvailable(s, t.id)) continue; const rv = r.pick(s.rivals); setCommit(s, t.id, '', rv.id, s.t + 8); break; }
      case 4: {
        const worked = s.films.some((f) => f.studioId === s.studio.id && f.cast.some((c) => c.talentId === t.id));
        if (!worked) continue;
        s.studio.prestige = Math.min(100, s.studio.prestige + 1);
        break;
      }
      case 5: { const o = ov(); o.star = (o.star ?? 0) - 8; o.feeMult = (o.feeMult ?? 1) * 0.85; break; }
      case 6: { const o = ov(); o.star = (o.star ?? 0) - 3; break; }
      case 7: { const o = ov(); o.star = (o.star ?? 0) - 4; break; }
    }
    msg(s, 'news', 'Talent news', text, { link: `/talent/${t.id}`, read: idx !== 4 && t.attrs.starPower < 70 });
    if (idx === 4) headline(text);
  }
}

/** Studio-wide random events. */
export function studioEvents(s: GameState) {
  const r = makeRng(s.seed, s.t, 'sevents');
  if (!r.chance(0.12)) return;
  const upcoming = s.films.filter((f) => f.studioId === s.studio.id && f.release && f.release.t > s.t && f.stage === 'ready');
  const pick = r.int(0, 3);
  if (pick === 0 && upcoming.length) {
    const f = r.pick(upcoming);
    f.buzz = Math.min(2, f.buzz + 0.3);
    msg(s, 'event', `${f.title} trailer goes viral`, '50 million views in 48 hours. Expect a bigger opening.', { link: `/film/${f.id}` });
    headline(`${f.title} trailer goes viral`);
  } else if (pick === 1) {
    const g = r.pick(Object.keys(s.genreHeat)) as keyof typeof s.genreHeat;
    s.genreHeat[g] = Math.min(1.4, s.genreHeat[g] + 0.08);
    msg(s, 'news', `${g} is having a moment`, `Audience research shows growing appetite for ${g.toLowerCase()} films.`, { link: '/scripts' });
  } else if (pick === 2) {
    s.studio.prestige = Math.min(100, s.studio.prestige + 1);
    msg(s, 'news', 'Industry profile', 'A glowing magazine profile of your studio raises its standing with talent.');
  } else {
    const g = r.pick(Object.keys(s.genreHeat)) as keyof typeof s.genreHeat;
    s.genreHeat[g] = Math.max(0.6, s.genreHeat[g] - 0.08);
    msg(s, 'news', `${g} fatigue`, `Analysts warn audiences are tiring of ${g.toLowerCase()} films.`);
  }
}
