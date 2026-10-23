/**
 * Builds the real talent database from the TMDB API. Run once, not at runtime:
 *
 *   TMDB_API_KEY=... npm run build:talent            (full build, ~10,000 actors)
 *   TMDB_API_KEY=... npm run build:talent -- --quick (500 actors, for testing the pipeline)
 *
 * Outputs public/data/{actors,directors,writers,crew,costars}.json and scripts/rating-report.md.
 * Raw responses are cached in scripts/cache/ so reruns are cheap.
 * No images are downloaded or referenced — the game never shows TMDB photos.
 *
 * This product uses the TMDB API but is not endorsed or certified by TMDB.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapGenres, rateFromCareer, type RawCredit, type RawPerson } from '../src/lib/ratings';
import { toCompact, type DbFile } from '../src/lib/talentDb';
import { GENRES, type Talent, type TalentKind } from '../src/lib/types';

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error('Missing TMDB_API_KEY. Copy .env.example to .env and add your key (https://www.themoviedb.org/settings/api).');
  process.exit(1);
}
const QUICK = process.argv.includes('--quick');
const SKIP_REVENUE = process.argv.includes('--no-revenue');
const TARGET = {
  actors: QUICK ? 500 : 10_000, directors: QUICK ? 60 : 800, writers: QUICK ? 60 : 800,
  composers: QUICK ? 30 : 400, cinematographers: QUICK ? 30 : 400, editors: QUICK ? 30 : 400,
};
const ROOT = process.cwd();
const CACHE = join(ROOT, 'scripts', 'cache');
const OUT = join(ROOT, 'public', 'data');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ---------- HTTP with cache, concurrency limit and backoff ----------
const BASE = 'https://api.themoviedb.org/3';
const bearer = KEY.length > 40;
let active = 0;
const queue: (() => void)[] = [];
const MAX_CONCURRENCY = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let calls = 0, cacheHits = 0;

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) await new Promise<void>((r) => queue.push(r));
  active++;
  try { return await fn(); } finally { active--; queue.shift()?.(); }
}

async function tmdb<T = any>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const key = createHash('sha1').update(path + '?' + qs.toString()).digest('hex');
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) { cacheHits++; return JSON.parse(readFileSync(file, 'utf8')); }
  if (!bearer) qs.set('api_key', KEY!);
  const url = `${BASE}${path}?${qs.toString()}`;
  return slot(async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${KEY}`, accept: 'application/json' } : { accept: 'application/json' } });
      calls++;
      if (res.status === 429 || res.status >= 500) { await sleep(500 * 2 ** attempt); continue; }
      if (res.status === 404) { writeFileSync(file, 'null'); return null as T; }
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      const json = await res.json();
      writeFileSync(file, JSON.stringify(json));
      return json as T;
    }
    throw new Error(`Gave up on ${path}`);
  });
}

// ---------- Nationality ----------
const COUNTRY: [RegExp, string][] = [
  [/\b(usa|u\.s\.a?\.?|united states|america|california|new york|texas|illinois)\b/i, 'US'],
  [/\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|london)\b/i, 'GB'],
  [/\bindia|mumbai|bombay|chennai|madras|kolkata|calcutta|hyderabad|bangalore|bengaluru|delhi|kerala|punjab\b/i, 'IN'],
  [/\bpakistan|karachi|lahore|islamabad\b/i, 'PK'], [/\b(south korea|korea|seoul|busan)\b/i, 'KR'],
  [/\bhong kong\b/i, 'HK'], [/\btaiwan|taipei\b/i, 'TW'], [/\b(china|beijing|shanghai|prc)\b/i, 'CN'], [/\bjapan|tokyo|osaka\b/i, 'JP'],
  [/\bfrance|paris\b/i, 'FR'], [/\bspain|madrid|barcelona\b/i, 'ES'], [/\bmexico|méxico\b/i, 'MX'], [/\bargentina\b/i, 'AR'],
  [/\bbrazil|brasil\b/i, 'BR'], [/\bcolombia\b/i, 'CO'], [/\bchile\b/i, 'CL'], [/\bnigeria|lagos\b/i, 'NG'], [/\bghana\b/i, 'GH'],
  [/\bcanada|ontario|quebec|british columbia\b/i, 'CA'], [/\baustralia\b/i, 'AU'], [/\bireland\b/i, 'IE'], [/\bnew zealand\b/i, 'NZ'],
  [/\bgermany|deutschland\b/i, 'DE'], [/\bitaly|italia\b/i, 'IT'], [/\bsweden\b/i, 'SE'], [/\bdenmark\b/i, 'DK'], [/\bnorway\b/i, 'NO'],
  [/\bnetherlands\b/i, 'NL'], [/\bbelgium\b/i, 'BE'], [/\bsouth africa\b/i, 'ZA'], [/\bturkey|türkiye\b/i, 'TR'], [/\biran\b/i, 'IR'],
  [/\begypt\b/i, 'EG'], [/\bthailand\b/i, 'TH'], [/\bphilippines\b/i, 'PH'], [/\bindonesia\b/i, 'ID'], [/\bpoland\b/i, 'PL'], [/\brussia|ussr\b/i, 'RU'],
  [/\bisrael\b/i, 'IL'], [/\blebanon\b/i, 'LB'], [/\bpuerto rico\b/i, 'PR'], [/\bcuba\b/i, 'CU'], [/\bkenya\b/i, 'KE'],
];
const LANG_COUNTRY: Record<string, string> = { hi: 'IN', te: 'IN', ta: 'IN', ml: 'IN', kn: 'IN', ur: 'PK', ko: 'KR', zh: 'CN', cn: 'HK', ja: 'JP', fr: 'FR', es: 'ES', yo: 'NG', ig: 'NG' };

function nationality(place: string | null | undefined, langs: Record<string, number>): string {
  if (place) {
    const last = place.split(',').slice(-2).join(',');
    for (const [re, c] of COUNTRY) if (re.test(last)) return c;
    for (const [re, c] of COUNTRY) if (re.test(place)) return c;
  }
  const top = Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0];
  return (top && LANG_COUNTRY[top]) || 'US';
}

// ---------- Collect people ----------
type Seed = { id: number; popularity: number };

async function popularPeople(): Promise<Map<number, Seed & { dept: string }>> {
  const out = new Map<number, Seed & { dept: string }>();
  const pages = Math.min(500, Math.ceil((TARGET.actors * 1.3) / 20));
  const batch: Promise<void>[] = [];
  for (let p = 1; p <= pages; p++) {
    batch.push(tmdb('/person/popular', { page: p }).then((d) => {
      for (const x of d?.results ?? []) out.set(x.id, { id: x.id, popularity: x.popularity, dept: x.known_for_department });
    }));
  }
  await Promise.all(batch);
  console.log(`popular people: ${out.size}`);
  return out;
}

/** Guarantee global coverage: top films per language, then their billed casts. */
const REGIONS: [string, number][] = [
  ['hi', 12], ['te', 5], ['ta', 5], ['ml', 4], ['kn', 2], ['ur', 3], ['pa', 2], ['ko', 10], ['zh', 8], ['cn', 6], ['ja', 8],
  ['fr', 8], ['es', 10], ['pt', 4], ['yo', 2], ['en', 0],
];

async function regionalMovies(): Promise<{ lang: string; id: number }[]> {
  const out: { lang: string; id: number }[] = [];
  for (const [lang, pages] of REGIONS) {
    for (let p = 1; p <= (QUICK ? Math.min(1, pages) : pages); p++) {
      const d = await tmdb('/discover/movie', { with_original_language: lang, sort_by: 'vote_count.desc', page: p, 'primary_release_date.gte': '1985-01-01' });
      for (const m of d?.results ?? []) out.push({ lang, id: m.id });
    }
  }
  // Nollywood is mostly English-language: pull Nigerian productions by origin country.
  for (let p = 1; p <= (QUICK ? 1 : 4); p++) {
    const d = await tmdb('/discover/movie', { with_origin_country: 'NG', sort_by: 'popularity.desc', page: p });
    for (const m of d?.results ?? []) out.push({ lang: 'ng', id: m.id });
  }
  return out;
}

/** Top films by year for crew discovery. */
async function crewMovies(): Promise<number[]> {
  const ids: number[] = [];
  for (let y = 1990; y <= 2025; y++) {
    for (let p = 1; p <= (QUICK ? 1 : 3); p++) {
      const d = await tmdb('/discover/movie', { primary_release_year: y, sort_by: 'vote_count.desc', page: p });
      for (const m of d?.results ?? []) ids.push(m.id);
    }
  }
  return ids;
}

const movieCache = new Map<number, { revenue: number }>();
async function revenueOf(id: number): Promise<number> {
  if (SKIP_REVENUE) return 0;
  if (movieCache.has(id)) return movieCache.get(id)!.revenue;
  const d = await tmdb(`/movie/${id}`);
  const rev = d?.revenue ?? 0;
  movieCache.set(id, { revenue: rev });
  return rev;
}

type PersonDetail = {
  id: number; name: string; birthday: string | null; gender: number; place_of_birth: string | null; popularity: number;
  known_for_department: string; adult?: boolean;
  movie_credits?: { cast: any[]; crew: any[] };
};

async function person(id: number): Promise<PersonDetail | null> {
  return tmdb(`/person/${id}`, { append_to_response: 'movie_credits' });
}

const JOBS: Record<string, TalentKind> = {
  Director: 'director', Screenplay: 'writer', Writer: 'writer', 'Original Music Composer': 'composer', 'Music': 'composer',
  'Director of Photography': 'cinematographer', Editor: 'editor',
};

async function toRaw(d: PersonDetail, kind: TalentKind): Promise<RawPerson> {
  const list = kind === 'actor' ? d.movie_credits?.cast ?? [] : (d.movie_credits?.crew ?? []).filter((c: any) => JOBS[c.job] === kind);
  const seen = new Set<number>();
  const langs: Record<string, number> = {};
  const credits: RawCredit[] = [];
  for (const c of list) {
    if (seen.has(c.id) || !c.release_date) continue;
    seen.add(c.id);
    const year = Number(String(c.release_date).slice(0, 4));
    if (!year || year > 2026) continue;
    if (c.original_language) langs[c.original_language] = (langs[c.original_language] ?? 0) + 1;
    const order = kind === 'actor' ? c.order ?? 20 : 0;
    // Revenue only for well-known films where they are top-billed (keeps API usage sane).
    const revenue = (kind !== 'actor' || order <= 2) && c.vote_count >= 300 ? await revenueOf(c.id) : 0;
    credits.push({ title: c.title, year, order, vote_average: c.vote_average, vote_count: c.vote_count, genres: mapGenres(c.genre_ids ?? [], c.title, revenue), revenue, language: c.original_language });
  }
  return {
    tmdbId: d.id, name: d.name, birthday: d.birthday, gender: d.gender, place_of_birth: d.place_of_birth, popularity: d.popularity,
    kind, credits, nationality: nationality(d.place_of_birth, langs),
  };
}

async function main() {
  console.time('build');
  const popular = await popularPeople();
  const actorSeeds = new Map<number, number>(); // id -> popularity
  for (const p of popular.values()) if (p.dept === 'Acting') actorSeeds.set(p.id, p.popularity);

  // Regional coverage.
  const regional = await regionalMovies();
  const regionalIds = new Map<number, string>();
  await Promise.all(regional.map(async (m) => {
    const c = await tmdb(`/movie/${m.id}/credits`);
    for (const x of (c?.cast ?? []).slice(0, 6)) if (!regionalIds.has(x.id)) regionalIds.set(x.id, m.lang);
  }));
  console.log(`regional cast candidates: ${regionalIds.size}`);

  // Crew discovery.
  const crewCount: Record<TalentKind, Map<number, number>> = {
    actor: new Map(), director: new Map(), writer: new Map(), composer: new Map(), cinematographer: new Map(), editor: new Map(),
  };
  const crewIds = await crewMovies();
  await Promise.all(crewIds.map(async (id) => {
    const c = await tmdb(`/movie/${id}/credits`);
    for (const x of c?.crew ?? []) {
      const k = JOBS[x.job];
      if (k) crewCount[k].set(x.id, (crewCount[k].get(x.id) ?? 0) + 1 + x.popularity / 10);
    }
  }));

  // Actors: popular first, then fill regional quotas so every region is represented.
  const regionalList = [...regionalIds.keys()].filter((id) => !actorSeeds.has(id));
  const popularTarget = Math.round(TARGET.actors * 0.82);
  const actorIds = [...actorSeeds.entries()].sort((a, b) => b[1] - a[1]).slice(0, popularTarget).map(([id]) => id);
  for (const id of regionalList) { if (actorIds.length >= TARGET.actors) break; actorIds.push(id); }
  for (const [id] of [...actorSeeds.entries()].sort((a, b) => b[1] - a[1]).slice(popularTarget)) { if (actorIds.length >= TARGET.actors) break; if (!actorIds.includes(id)) actorIds.push(id); }

  const out: Record<string, Talent[]> = { actors: [], directors: [], writers: [], crew: [] };
  let done = 0;
  const costarFilms = new Map<number, string[]>();
  await Promise.all(actorIds.map(async (id) => {
    const d = await person(id);
    if (!d || d.adult) return;
    const raw = await toRaw(d, 'actor');
    if (raw.credits.length < 2) return;
    const t = rateFromCareer(raw);
    out.actors.push(t);
    for (const c of d.movie_credits?.cast ?? []) if ((c.order ?? 99) <= 5) {
      const arr = costarFilms.get(c.id) ?? [];
      arr.push(t.id);
      costarFilms.set(c.id, arr);
    }
    if (++done % 250 === 0) console.log(`actors ${done}/${actorIds.length} (api ${calls}, cache ${cacheHits})`);
  }));

  const crewBuild = async (kind: TalentKind, n: number, bucket: string) => {
    const ids = [...crewCount[kind].entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
    await Promise.all(ids.map(async (id) => {
      const d = await person(id);
      if (!d) return;
      const raw = await toRaw(d, kind);
      if (raw.credits.length < 2) return;
      out[bucket].push(rateFromCareer(raw));
    }));
    console.log(`${kind}: ${ids.length}`);
  };
  await crewBuild('director', TARGET.directors, 'directors');
  await crewBuild('writer', TARGET.writers, 'writers');
  await crewBuild('composer', TARGET.composers, 'crew');
  await crewBuild('cinematographer', TARGET.cinematographers, 'crew');
  await crewBuild('editor', TARGET.editors, 'crew');

  // Co-star pairs table (2+ films together, both billed top 6).
  const pairs = new Map<string, number>();
  for (const ids of costarFilms.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const k = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
  }
  const costars = [...pairs.entries()].filter(([, n]) => n >= 2).map(([k, n]) => [...k.split('|'), n]);
  // Frequent co-stars get a chemistry nudge.
  const chemBoost = new Map<string, number>();
  for (const [a, b, n] of costars as [string, string, number][]) { chemBoost.set(a, (chemBoost.get(a) ?? 0) + n); chemBoost.set(b, (chemBoost.get(b) ?? 0) + n); }
  for (const t of out.actors) t.attrs.chemistry = Math.min(95, t.attrs.chemistry + Math.min(12, (chemBoost.get(t.id) ?? 0) * 1.5));

  const write = (file: string, people: Talent[]) => {
    const data: DbFile = { v: 1, source: 'tmdb', generated: new Date().toISOString(), people: people.map(toCompact) };
    writeFileSync(join(OUT, `${file}.json`), JSON.stringify(data));
    console.log(`wrote ${file}.json (${people.length})`);
  };
  write('actors', out.actors);
  write('directors', out.directors);
  write('writers', out.writers);
  write('crew', out.crew);
  writeFileSync(join(OUT, 'costars.json'), JSON.stringify(costars));
  writeReport(out);
  console.timeEnd('build');
  console.log(`API calls: ${calls}, cache hits: ${cacheHits}`);
}

function writeReport(out: Record<string, Talent[]>) {
  const L: string[] = ['# Ratings sanity report', '', `Generated ${new Date().toISOString()}. Tune the formulas in \`src/lib/ratings.ts\` and rerun.`, ''];
  const row = (t: Talent, i: number) => `| ${i + 1} | ${t.name} | ${t.nationality} | ${t.attrs.overall} | ${t.attrs.starPower} | ${t.attrs.acting} | ${t.attrs.boxOffice} | ${t.attrs.range} | $${(t.fee / 1e6).toFixed(2)}M |`;
  L.push('## Top 50 actors by Overall', '', '| # | Name | Nat | OVR | Star | Acting | Box | Range | Fee |', '|---|---|---|---|---|---|---|---|---|');
  [...out.actors].sort((a, b) => b.attrs.overall - a.attrs.overall).slice(0, 50).forEach((t, i) => L.push(row(t, i)));
  for (const g of GENRES) {
    L.push('', `## Top 10 — ${g}`, '', '| # | Name | Rating | OVR |', '|---|---|---|---|');
    [...out.actors].sort((a, b) => b.genres[g] - a.genres[g]).slice(0, 10).forEach((t, i) => L.push(`| ${i + 1} | ${t.name} | ${t.genres[g]} | ${t.attrs.overall} |`));
  }
  const byNat: Record<string, number> = {};
  for (const t of out.actors) byNat[t.nationality] = (byNat[t.nationality] ?? 0) + 1;
  L.push('', '## Coverage by nationality', '', ...Object.entries(byNat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`));
  L.push('', '## Top 20 directors', '', '| # | Name | Nat | OVR | Craft | Box | Fee |', '|---|---|---|---|---|---|---|');
  [...out.directors].sort((a, b) => b.attrs.overall - a.attrs.overall).slice(0, 20).forEach((t, i) => L.push(`| ${i + 1} | ${t.name} | ${t.nationality} | ${t.attrs.overall} | ${t.attrs.acting} | ${t.attrs.boxOffice} | $${(t.fee / 1e6).toFixed(2)}M |`));
  writeFileSync(join(ROOT, 'scripts', 'rating-report.md'), L.join('\n'));
  console.log('wrote scripts/rating-report.md');
}

main().catch((e) => { console.error(e); process.exit(1); });
