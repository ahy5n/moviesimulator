// Production pipeline: development → pre-production → filming → post → ready.
import { tierInfo, tierOf } from '../constants';
import { makeRng, clamp } from '../rng';
import { genreFit, getDB, pairKey, talent } from '../talentDb';
import type { CrewRole, Film, GameState, Talent } from '../types';
import { headline, msg, spend } from './util';
import { setCommit } from './scripts';

const HOUSE_CREW = 45;

export type QualityBreakdown = {
  script: number; director: number; cast: number; chemistry: number; crew: number; budget: number; luck: number; traits: number; total: number;
};

export function castMembers(s: GameState, f: Film): { t: Talent; lead: boolean }[] {
  return f.cast.map((c) => ({ t: talent(s, c.talentId)!, lead: c.role === 'lead' })).filter((x) => x.t);
}

export function qualityBreakdown(s: GameState, f: Film): QualityBreakdown {
  const g = f.primaryGenre, g2 = f.secondaryGenre;
  const dir = f.crew.director ? talent(s, f.crew.director.talentId) : undefined;
  const director = dir ? 0.7 * dir.attrs.acting + 0.3 * genreFit(dir, g, g2) : 30;
  const members = castMembers(s, f);
  let cast = 58;
  if (members.length) {
    let w = 0, sum = 0;
    for (const m of members) {
      const k = m.lead ? 2 : 1;
      w += k; sum += k * (0.55 * genreFit(m.t, g, g2) + 0.45 * m.t.attrs.acting);
    }
    cast = sum / w;
    const missing = Math.max(0, f.leads - members.filter((m) => m.lead).length);
    cast -= missing * 12;
  }
  const leads = members.filter((m) => m.lead);
  let chem = leads.length ? leads.reduce((a, m) => a + m.t.attrs.chemistry, 0) / leads.length : 60;
  const db = getDB();
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const n = db.costars.get(pairKey(members[i].t.id, members[j].t.id));
    if (n) chem += Math.min(8, n * 2);
  }
  chem += members.filter((m) => m.t.traits.includes('Team Player')).length * 3;
  chem += members.filter((m) => m.t.traits.includes('Prankster')).length * 1.5;
  const chemistry = 0.92 + clamp(chem, 0, 100) / 100 * 0.16;

  let crew = 1;
  if (s.settings.crewMode === 'full') {
    const roles: CrewRole[] = ['composer', 'cinematographer', 'editor'];
    const avg = roles.reduce((a, r) => {
      const c = f.crew[r] ? talent(s, f.crew[r]!.talentId) : undefined;
      return a + (c ? 0.75 * c.attrs.acting + 0.25 * genreFit(c, g, g2) : HOUSE_CREW);
    }, 0) / roles.length;
    crew = 0.92 + avg / 100 * 0.16;
  }
  const ratio = f.budget / Math.max(1, f.suggestedBudget);
  const budget = ratio < 1 ? 0.72 + 0.28 * ratio : Math.min(1.05, 1 + (ratio - 1) * 0.1);
  let traits = 0;
  for (const m of members) {
    if (m.t.traits.includes('Method')) traits += m.lead ? 2.5 : 1;
    if (m.t.traits.includes('Perfectionist')) traits += 1.5;
  }
  if (dir?.traits.includes('Perfectionist')) traits += 2;
  const raw = 0.36 * f.scriptQuality + 0.26 * director + 0.38 * cast;
  let q = raw * chemistry * crew * budget * f.luck + traits;
  q = 50 + (q - 50) * 1.3;
  return { script: f.scriptQuality, director, cast, chemistry, crew, budget, luck: f.luck, traits, total: clamp(Math.round(q), 3, 98) };
}

export const computeQuality = (s: GameState, f: Film) => qualityBreakdown(s, f).total;

export function greenlightIssues(s: GameState, f: Film): string[] {
  const out: string[] = [];
  if (f.stage !== 'preproduction') out.push('Film is not in pre-production.');
  if (!f.crew.director) out.push('Hire a director.');
  const leads = f.cast.filter((c) => c.role === 'lead').length;
  if (leads < f.leads) out.push(`Cast ${f.leads - leads} more lead${f.leads - leads > 1 ? 's' : ''}.`);
  return out;
}

/** Start filming. Production budget is paid across the filming turns. */
export function greenlight(s: GameState, f: Film, cofinance?: { partner: string; share: number }) {
  if (greenlightIssues(s, f).length) return;
  const ti = tierInfo(f.tier);
  f.stage = 'filming';
  f.stageTurnsLeft = ti.filming + (f.primaryGenre === 'Animation' ? 2 : 0);
  f.luck = clamp(makeRng(s.seed, f.id, 'luck').normal(1, 0.035), 0.88, 1.12);
  if (cofinance) f.cofinance = cofinance;
  const until = s.t + f.stageTurnsLeft;
  for (const c of f.cast) setCommit(s, c.talentId, f.id, f.studioId, until);
  if (f.crew.director) setCommit(s, f.crew.director.talentId, f.id, f.studioId, until + tierInfo(f.tier).post);
}

export function setBudget(f: Film, budget: number) {
  f.budget = Math.max(300_000, Math.round(budget / 1e5) * 1e5);
  f.tier = tierOf(f.budget);
}

export function shelve(s: GameState, f: Film) {
  f.stage = 'shelved';
  for (const c of f.cast) if (s.commitments[c.talentId]?.filmId === f.id) delete s.commitments[c.talentId];
  for (const c of Object.values(f.crew)) if (c && s.commitments[c.talentId]?.filmId === f.id) delete s.commitments[c.talentId];
}

export const testScreeningCost = (f: Film) => Math.max(150_000, Math.round(f.budget * 0.006 / 10_000) * 10_000);
export const reshootCost = (f: Film) => Math.round(f.budget * 0.07 / 1e5) * 1e5;

export function testScreening(s: GameState, f: Film) {
  if (f.testRange || (f.stage !== 'post' && f.stage !== 'ready')) return;
  spend(s, f, testScreeningCost(f), 'Production');
  const q = computeQuality(s, f);
  const r = makeRng(s.seed, f.id, 'test');
  const mid = q + r.normal(0, 3);
  f.testRange = [clamp(Math.round(mid - 6)), clamp(Math.round(mid + 6))];
  f.events.push(`Test screening scored ${f.testRange[0]}–${f.testRange[1]}.`);
}

export function reshoots(s: GameState, f: Film) {
  if (!f.testRange || f.events.some((e) => e.startsWith('Reshoots'))) return;
  spend(s, f, reshootCost(f), 'Production');
  const r = makeRng(s.seed, f.id, 'reshoot');
  f.luck = clamp(f.luck + r.range(0.03, 0.08), 0.8, 1.2);
  if (f.stage === 'post') f.stageTurnsLeft += 1;
  else { f.stage = 'post'; f.stageTurnsLeft = 1; }
  f.testRange = undefined;
  f.events.push('Reshoots ordered to fix the third act.');
}

type Evt = { w: number; ok: (m: { t: Talent; lead: boolean }[]) => boolean; run: (r: ReturnType<typeof makeRng>) => string };

/** Filming events. Negative stories about a person only ever target fictional talent. */
function filmingEvent(s: GameState, f: Film) {
  const r = makeRng(s.seed, s.t, 'shoot', f.id);
  const members = castMembers(s, f);
  const reliability = members.length ? members.reduce((a, m) => a + m.t.attrs.reliability, 0) / members.length : 70;
  const divas = members.filter((m) => m.t.traits.includes('Diva') || m.t.traits.includes('Perfectionist')).length;
  if (!r.chance(0.14 + divas * 0.06 + (70 - reliability) / 300)) return;
  const fict = members.filter((m) => m.t.isFictional);
  const real = members.filter((m) => !m.t.isFictional);
  const name = (list: typeof members) => r.pick(list).t.name;
  const overrun = (pct: number) => { f.overrun = (f.overrun ?? 0) + pct; spend(s, f, f.budget * pct, 'Production'); };
  const events: Evt[] = [
    { w: 3 + divas * 2, ok: () => true, run: () => { const p = r.range(0.04, 0.12); overrun(p); return `Budget overrun of ${Math.round(p * 100)}% on ${f.title}.`; } },
    { w: 2, ok: () => true, run: () => { f.stageTurnsLeft++; return `Bad weather halts the ${f.title} shoot for two weeks.`; } },
    { w: 2, ok: (m) => m.length > 0 && real.length > 0, run: () => { f.stageTurnsLeft++; return `${name(real)} has a scheduling clash; ${f.title} shuffles its shoot.`; } },
    { w: 2.5, ok: () => true, run: () => { f.luck = clamp(f.luck + 0.04, 0.8, 1.2); return `Dailies from ${f.title} are electric. The studio is thrilled.`; } },
    { w: 1.5, ok: (m) => m.some((x) => x.t.traits.includes('Method')), run: () => { f.luck += 0.03; f.stageTurnsLeft++; const m = members.find((x) => x.t.traits.includes('Method'))!; return `${m.t.name} stays in character between takes. Filming slows, performances soar.`; } },
    { w: 1, ok: (m) => m.some((x) => x.t.traits.includes('Prankster')), run: () => { f.luck += 0.01; return `${members.find((x) => x.t.traits.includes('Prankster'))!.t.name}'s on-set pranks keep spirits high.`; } },
    { w: 1.2, ok: () => true, run: () => { const p = r.range(0.03, 0.06); overrun(p); f.luck += 0.03; f.stageTurnsLeft++; return `${f.title} adds a week of reshoots to land the finale.`; } },
    // Fictional talent only.
    { w: 1.5, ok: () => fict.length > 0, run: () => { f.luck = clamp(f.luck - 0.05, 0.8, 1.2); return `Tabloids report an on-set feud involving ${name(fict)} on ${f.title}.`; } },
    { w: 1, ok: () => fict.length > 0, run: () => { f.stageTurnsLeft++; return `${name(fict)} walks off the ${f.title} set for a week after a row over a trailer.`; } },
  ];
  const ev = r.weighted(events.filter((e) => e.ok(members)), (e) => e.w);
  if (!ev) return;
  const text = ev.run(r);
  f.events.push(text);
  if (f.studioId === s.studio.id) { msg(s, 'event', 'Production update', text, { link: `/film/${f.id}` }); headline(text); }
}

export function advanceProduction(s: GameState) {
  for (const f of s.films) {
    const mine = f.studioId === s.studio.id;
    switch (f.stage) {
      case 'development':
        if (--f.stageTurnsLeft <= 0) {
          f.stage = 'preproduction';
          f.stageTurnsLeft = 0;
          if (!f.scriptRange) {
            const r = makeRng(s.seed, f.id, 'draft');
            const lo = clamp(Math.round(f.scriptQuality - r.int(3, 9)));
            f.scriptRange = [lo, clamp(lo + 12)];
          }
          if (mine) msg(s, 'news', `${f.title}: script ready`, `The draft is in (quality ${f.scriptRange[0]}–${f.scriptRange[1]}). Cast it and hire a director.`, { link: `/film/${f.id}` });
        }
        break;
      case 'filming': {
        const ti = tierInfo(f.tier);
        const instalment = Math.min(f.budget / (ti.filming + (f.primaryGenre === 'Animation' ? 2 : 0)), f.budget - (f.prodPaid ?? 0));
        f.prodPaid = (f.prodPaid ?? 0) + instalment;
        spend(s, f, instalment, 'Production');
        filmingEvent(s, f);
        if (--f.stageTurnsLeft <= 0) {
          f.stage = 'post';
          f.stageTurnsLeft = ti.post;
          for (const c of f.cast) if (s.commitments[c.talentId]?.filmId === f.id) s.commitments[c.talentId].until = s.t;
          if (mine) msg(s, 'news', `${f.title} wraps filming`, 'Into post-production.', { link: `/film/${f.id}` });
        }
        break;
      }
      case 'post':
        if (--f.stageTurnsLeft <= 0) {
          f.stage = 'ready';
          f.quality = computeQuality(s, f);
          if (mine) msg(s, 'news', `${f.title} is finished`, 'Pick a release strategy in the Release Planner.', { link: `/release?film=${f.id}` });
        }
        break;
    }
  }
}

/** Remaining production spend still to be paid. */
export function remainingProductionCost(f: Film): number {
  if (f.stage === 'filming') {
    const ti = tierInfo(f.tier);
    void ti;
    return Math.max(0, f.budget - (f.prodPaid ?? 0));
  }
  if (f.stage === 'development' || f.stage === 'preproduction') return f.budget;
  return 0;
}
