# Noor's Kitchen

A phone app for Noor's kitchen: what can I cook now, what should we cook this week,
what do we need to buy, and what is in the pantry.

Status (2026-10-05): the core app is live at https://nooris-kitchenette.netlify.app (Netlify builds `main`). Real-phone checks are next: docs/ACCEPTANCE-CORE.md.

| Start here | |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | What we are building, architecture, defects to avoid, phases |
| [`docs/FEATURES.md`](docs/FEATURES.md) | All 84 features by phase (generated) |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Open questions for Aly, and decisions made |
| [`docs/RECIPE_SOURCES.md`](docs/RECIPE_SOURCES.md) | Best-rated recipe and video for each of the 22 dishes (researched 2026-10-04) |
| [`docs/WORKFLOW_REVIEW.md`](docs/WORKFLOW_REVIEW.md) | Claude's review of Codex's review and workflow |
| [Screen designs](https://claude.ai/artifact/1xG287oNN3QgPTKzEWPs1A) | Claude Design canvas: Today, Recipe, I cooked it, Snap pantry, Add a new dish, History (private to Aly) |
| [`AGENTS.md`](AGENTS.md) | Rules for Codex, Claude and people working here |
| `Noor_Kitchen_Coverage_Review.html` | Codex's coverage review (open in a browser) |
| `audit/` | Codex's evidence: workbook extraction, browser checks, reconciliation |
| `sources/` | Copies of the v3 HTML app and the two Excel planners |
| `.jaira/` | Task board (`jaira list`, `jaira next`) |

## Running the app

From `app/` (Node 24):

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (first time) |
| `npm run dev` | Run the app locally while working on it |
| `npm test` | Logic tests (Vitest) |
| `npm run test:e2e` | Builds the app and runs browser tests in the installed Google Chrome at 390 x 844, Asia/Karachi |
| `npm run build` | Type-check and build the installable app into `app/dist` |
| `npm run icons` | Regenerate app icons from `app/public/logo.svg` |

Netlify builds from `app/` using `netlify.toml` at the repo root (D-04).

## Eat out list

The Eat out screen shows restaurants per mood (Pizza, Karahi, ...) from a list refreshed from foodpanda's public listing (D-13). Ratings and review counts are shown; the price is only foodpanda's category (Rs, Rs Rs, Rs Rs Rs), and Order opens foodpanda for live prices. Without a list the screen still works with Noor's favourites.

Weekly steps, on Aly's computer (about once a week; Node 24):

1. Set the search centre for this PowerShell session: `$env:NOOR_HOME_LAT = "33.668"` and `$env:NOOR_HOME_LNG = "73.075"` (I-8 Markaz, a public place). Use I-8 Markaz, never the house's own location: the publish step refuses to write a list that contains these values anywhere.
2. From `app/`: `npm run refresh:eatout`. This writes `data/eatout/moods.json` (gitignored; also keeps distance and delivery time for Aly's own use) and, because of `--publish`, the app's copy `app/public/eatout/moods.json`. To keep the list private, run `node tools/eatout/refresh_moods.mjs` from the repo root instead (no `--publish`).
3. If foodpanda refuses (an HTTP error or a challenge page), the script stops. Do not work around it.
4. Aly decides whether to publish: commit `app/public/eatout/moods.json` and push, and Netlify ships it with the app (it is also cached for offline use). Otherwise load `data/eatout/moods.json` on a phone through Settings, "Load a restaurant list file". Whichever list is newer is the one used. The app shows "Updated <date>" and says "This list is old" after 30 days.

Nearest first (D-22): every restaurant keeps its own `lat` and `lng` (rounded to 4 decimals), in both files. These are public business locations, not private data. The phone works out the distance from the area chosen in Settings, "Where we live", which is stored only on the phone.

Privacy: this repository is public. The published copy drops distance (it is measured from the search centre), delivery time and the search centre itself, and strips query strings from links. It does show that the household is near I-8 Markaz (Aly accepted publishing this, D-22), and nothing finer. Look at the file before committing it. Never commit `data/eatout/`.
