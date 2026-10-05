# Noor's Kitchen

A phone app for Noor's kitchen: what can I cook now, what should we cook this week,
what do we need to buy, and what is in the pantry.

Status (2026-10-05): the core app is live at https://endearing-zabaione-6c6cc1.netlify.app (Netlify builds `main`). Real-phone checks are next: docs/ACCEPTANCE-CORE.md.

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
