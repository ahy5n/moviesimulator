# Studio Head Sim

Run a Hollywood studio from January 2026. Buy scripts, cast real actors, greenlight films, fight rival studios for talent, release in cinemas and on streaming, chase awards, and try not to get fired. Sister game to T20 Franchise Sim.

Next.js (App Router) + TypeScript + Tailwind + Zustand + Recharts. Everything runs client-side; saves live in IndexedDB (localStorage fallback), five slots, autosave every turn. Seeded RNG (`seedrandom`): the same seed and the same choices give the same results.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

The repo ships with a **fictional demo roster** (8,200 generated people) so the game is playable immediately.

## Real actors (TMDB)

1. Get a free API key: themoviedb.org → Settings → API.
2. `cp .env.example .env` and set `TMDB_API_KEY=...` (v3 key or v4 read token both work). Never commit `.env`.
3. Test the pipeline: `npm run build:talent -- --quick` (500 actors)
4. Full build: `npm run build:talent` (~10,000 actors, 800 directors, 800 writers, 400 each of composers / cinematographers / editors)
5. Check `scripts/rating-report.md` (top 50 overall, top 10 per genre, coverage by nationality) and tune `src/lib/ratings.ts` if anything looks off. Rerunning is cheap because raw responses are cached in `scripts/cache/`.

Flags: `--no-revenue` skips per-film revenue lookups (fewer API calls; Box Office Draw then falls back to defaults).

The builder guarantees global coverage by pulling top films per language (Hindi, Telugu, Tamil, Malayalam, Kannada, Urdu, Korean, Chinese, Cantonese, Japanese, French, Spanish, Portuguese, Yoruba) plus Nigerian productions, and adding their billed casts. **No images are ever downloaded or shown.**

To go back to the fictional roster: `npm run build:demo-talent`.

## Balance check

```bash
npm run simulate -- --years 10 --games 6 --difficulty hard --budget minimajor
```

A bot plays N years headless and reports gross/budget by tier, % of films losing money, $1B films, bankruptcy and sacking rates, and bidding wars per year. Last run: mid-budget films median 2.5× budget, ~35% lose money; tentpoles top out around $2B; 0 bankruptcies; ~25% of average bots sacked by year 3; ~2–3 bidding wars a year.

## Deploy (Vercel)

Push to GitHub, import into Vercel, deploy. No environment variables are needed at runtime; the talent JSON in `public/data/` is static. Run the TMDB build locally and commit the generated `public/data/*.json`.

## Where things live

| Path | What |
|---|---|
| `src/lib/engine/` | Simulation: `turn.ts` (fortnight loop), `production.ts`, `boxoffice.ts`, `negotiation.ts`, `rivals.ts`, `streaming.ts`, `awards.ts`, `finance.ts` (loans, board, sacking), `careers.ts`, `scripts.ts` (marketplace, IP, sequels, universes) |
| `src/lib/ratings.ts` | Rating formulas from career data (shared by the TMDB builder and the generator) |
| `src/lib/talentDb.ts` | Read-only DB + per-save `talentOverrides` (ageing, growth, fame) |
| `src/data/studios.ts` | **All real studio names**, plain text only. Rename here. |
| `src/data/awards.ts` | Fictional awards and festivals |
| `src/app/(game)/` | The 21 screens |
| `scripts/` | TMDB builder, demo roster generator, headless simulator |

## Non-negotiables (enforced in code)

- No actor photos or TMDB images. Talent cards use initials + silhouette.
- Studio names are text only, all in `src/data/studios.ts`.
- Negative events (scandals, feuds, walk-offs) can only target fictional people. See `careers.ts` and `production.ts`, which filter on `isFictional`.
- TMDB attribution is in the footer and on the About page.
- Disclaimer: real names are used for simulation only; ratings are calculated from public filmography data and are not statements about any real person.

## Licensing

// TODO: commercial licence. The TMDB API is free for **non-commercial** use only. If the game ever adds ads, payments or subscriptions, a TMDB commercial licence is required first. Also replace the text "TMDB" badge with TMDB's official logo from their branding page.
