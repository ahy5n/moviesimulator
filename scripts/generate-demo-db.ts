/**
 * Offline fallback roster: fully fictional people so the game is playable before the TMDB build has run.
 * Run `npm run build:talent` with TMDB_API_KEY set to replace these files with real filmography-based ratings.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fictionalName } from '../src/lib/names';
import { fictionalPerson } from '../src/lib/ratings';
import { makeRng } from '../src/lib/rng';
import { toCompact, type DbFile } from '../src/lib/talentDb';
import type { Gender, Talent, TalentKind } from '../src/lib/types';

const OUT = join(process.cwd(), 'public', 'data');
mkdirSync(OUT, { recursive: true });
const r = makeRng('demo-roster-v1');
const used = new Set<string>();

function make(kind: TalentKind, n: number, prefix: string): Talent[] {
  const out: Talent[] = [];
  for (let i = 0; i < n; i++) {
    const gender: Gender = r.chance(kind === 'actor' ? 0.48 : 0.3) ? 'F' : r.chance(0.98) ? 'M' : 'X';
    const { name, nationality } = fictionalName(r, gender, used);
    // Power law: most people are journeymen, a few are stars.
    const tier = Math.min(1, Math.pow(r(), 2.3) * 1.05);
    const age = kind === 'actor' ? Math.round(18 + Math.pow(r(), 1.2) * 62) : Math.round(26 + r() * 50);
    out.push(fictionalPerson({ id: `${prefix}${i}`, name, gender, nationality, birthYear: 2026 - age, kind, tier: Math.min(1, tier * (0.6 + Math.min(age, 50) / 100)), seed: 'demo', year: 2026 }));
  }
  return out;
}

const write = (file: string, people: Talent[]) => {
  const data: DbFile = { v: 1, source: 'demo', generated: new Date().toISOString(), people: people.map(toCompact) };
  writeFileSync(join(OUT, `${file}.json`), JSON.stringify(data));
  console.log(`${file}.json: ${people.length}`);
};

write('actors', make('actor', 5000, 'da'));
write('directors', make('director', 800, 'dd'));
write('writers', make('writer', 800, 'dw'));
write('crew', [...make('composer', 400, 'dc'), ...make('cinematographer', 400, 'dp'), ...make('editor', 400, 'de')]);
writeFileSync(join(OUT, 'costars.json'), '[]');
