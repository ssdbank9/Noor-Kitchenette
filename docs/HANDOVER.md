# Handover: Noor's Kitchen

Last updated: **2026-10-24**, by Claude (Sonnet 5.5), before Aly moves to another Claude account on
the same PC. Read this file first, then `AGENTS.md`. The repo may have moved on in other tools
since this was written: run the checks in section 2 before trusting anything below.

Owner and sole decision maker: **Aly Jafferani**. Main user: **Noor**. Anything needing a
decision, key, account, payment or publication goes to Aly.

---

## 0. Paste this prompt into the next assistant (Claude, Codex or any other)

```text
You are picking up Noor's Kitchen, a React + TypeScript phone app (PWA) owned by Aly Jafferani.
Work in the repo at C:\Users\Aly Jafferani\Documents\ChatGPT\Noors Kitchen (remote:
https://github.com/ssdbank9/Noor-Kitchenette, public).

1. Run: git status; git branch --show-current; git log --oneline -15; git fetch; git log --oneline origin/main -5
   Do NOT discard, stash, reset or clean anything: the working tree may hold uncommitted work
   by other tools (see docs/HANDOVER.md section 3).
2. Read docs/HANDOVER.md (all of it), then AGENTS.md, docs/DECISIONS.md and docs/PLAN.md.
3. From app/ run: npm install; npm run typecheck; npm test; npm run test:e2e.
   Report your numbers. Last known: typecheck clean, 761 logic tests, 107 browser tests.
   (Under machine load some browser tests pass only on retry; say which.)
4. Do not start new work until Aly answers the questions in section 6 of the handover.
   First job: help Aly decide what to do with the uncommitted work (section 3): review it, run the
   checks, and commit it on a branch (claude/<slug> or codex/<slug>) only after he agrees.

Rules: Aly decides everything. Never push to main, force-push, rebase shared history or use
git add -A. Stage only files you changed. Never put API keys or passwords in the repo (it is public).
Mark anything you did not run as "not verified" (especially real phone, camera, store links,
live model behaviour). Merge into main only when Aly says so; each push to main is a Netlify
deploy and Netlify's free plan is credit based, so batch pushes.
```

---

## 1. What this is
A button-first phone app (PWA) for Noor's household kitchen in I-8, Islamabad (time zone
Asia/Karachi). React 19 + TypeScript 7, Vite 8, vite-plugin-pwa (`registerType: 'prompt'`),
IndexedDB via `idb`, Vitest, Playwright. No server, no accounts: all data is on the phone.
Static hosting on Netlify (`https://nooris-kitchenette.netlify.app`, deploys `main`, `netlify.toml`).
App code in `app/`, seed generation and eat-out scripts in `tools/`, decisions in `docs/DECISIONS.md`
(D-01 to D-25).

## 2. Git state on 2026-10-24 (verified with git, not assumed)
| Item | Value |
|---|---|
| Current branch | `claude/review-fixes`, HEAD `fe78139`, pushed (`origin/claude/review-fixes`) |
| `main` and `origin/main` | `b56b5aa` (what Netlify deploys, as far as I know; the Netlify dashboard was not checked) |
| `claude/review-fixes` vs `main` | 1 commit ahead: `fe78139`, a board-only commit (ticket status changes) |
| Last commits (all dated 2026-10-06 to 10-07, author shown as Aly) | adversarial-review defect fixes AR01-AR16, Snap photo memory/reload fixes, **Command Code photo provider** (D-24), ticket board reconciliation |
| Uncommitted | **86 modified tracked files, 20 deleted `.jaira/` files, many untracked files**, see section 3 |
| Other remote branches | `codex/adversarial-review` (Codex's review, 2026-10-06), `claude/*` feature branches (all merged, safe to delete), `jaira/board` |
| Stashes | none |

Merge history of the main line: core (10-05) -> updates 1 and 2 -> shopping extension (D-22) ->
Snacks tab, order costs (D-23) -> adversarial-review fixes -> Command Code provider (D-24).
A recent full history is `git log --oneline -40`.

## 3. UNCOMMITTED WORK in the working tree (not mine; read before touching anything)
The working tree is ahead of `fe78139` with changes I did not make and did not review line by
line. I ran the checks on it on 2026-10-24: `npm run typecheck` clean, `npm test` **761/761**,
`npm run test:e2e` **107 passed**, but 14 browser tests (adddish, adjust, adversarial AR08,
eatdistance, plan, settings, stock, stores specs) passed only on the automatic retry because
the machine was busy (4.2 min run). Treat the green result as likely, not proven.

What the diff shows (summary, from `git diff`):
- **Board removed (D-25):** `.jaira/` deleted from disk (20 tracked ticket files show as deleted),
  jaira sections removed from `AGENTS.md` and `CLAUDE.md`, `.gitignore` and README and PLAN
  updated, `docs/DECISIONS.md` has D-25 and D-06 amended. Board history stays in git history.
- **Snap review rewrite:** `ui/PhotoReview.tsx` (+~280 lines), `ui/SnapPantry.tsx`,
  new `gemini/thumbs.ts` (per-item thumbnail crops, in memory only), new `gemini/suggest.ts`
  (one batched text-only call guesses unmatched labels), `domain/photoDraft.ts`, `gemini/photo.ts`.
- **Recipes and cooking:** `tools/build_seed.cjs` + `data/seed.json` gain home-style cooking
  **steps for every dish** (147 lines; draft "reviewed with Aly 2026-10-07"); new
  `lib/youtubeId.ts`; `ui/RecipeScreen.tsx`, `AddDishScreen.tsx`, `DishReview.tsx` changed.
- **Navigation:** bottom bar now has **7 tabs**: Today, Plan, Pantry, Snacks, Shop, **Recipes**
  (new), **Cooked** (History renamed). `App.tsx` / `BottomNav.tsx` / `Icons.tsx` (BookIcon).
  Check `.bottom-nav` in `styles.css` has 7 grid columns and fits at 390 px.
- **History:** custom date range (`HistoryRange` adds `'custom'` in `domain/ledger.ts`).
- **Yes/no words:** the "Jee" option removed; `'jee'` in old backups restores as Haan
  (`domain/words.ts`, `storage/backup.ts`, settings type).
- **Command Code default model changed** to `Qwen/Qwen3.8-Omni-Flash` in
  `app/src/commandcode/client.ts` (type comment says Qwen), but **D-24 in `docs/DECISIONS.md`
  still says deepseek**. The docs disagree with the code: ask Aly which is right.
- **Mostly line-ending noise:** `git config core.autocrlf` is `true`, so many files show as
  modified only because of CRLF. Use `git diff --ignore-cr-at-eol` to see real changes
  (about 43 source and doc files, +1055/-281 lines).
- **Untracked:** `.claude/` (local launch config and agent worktrees), `.commandcode/taste`,
  `app/src/gemini/suggest*.ts`, `thumbs*.ts`, `app/src/lib/youtubeId*.ts`, and many
  `audit/adversarial-2026-10-05-*` and `audit/verification-2026-10-06-*` evidence files
  (JSON, screenshots incl. `...-live-phone.png`, coverage folders).

**Before committing the untracked audit files:** the repo is public. Look at the screenshots and
JSON for household data, keys or tokens first. Never commit `.claude/`.

Safe way to preserve this work: ask Aly, then create a branch from the current tree
(`git switch -c claude/wip-2026-10-24`), `git add` only the intended files by name, commit, and
push the branch (not `main`). Nothing in this handover has been committed for it yet.

## 4. Features (as of `main` plus section 3)
- **Cook from stock** with Haan/Nahi buttons, less or more than the recipe recorded, undo; own
  recipes; recipe steps; history of what was cooked.
- **Pantry:** actions, units, "unknown is never zero", leftovers, places, expiry, Use soon, Waste.
- **Plan tab + weekly basket** (planning never changes stock).
- **Photo reading (Snap pantry) and Add-a-dish lookup:** Gemini (`gemini-3.8-flash`, grounded
  search) and Command Code (photo reading only, key on the phone). Model output is a draft the
  user confirms; keys never leave the phone or enter backups.
- **Shop (D-22):** self-filling To-buy cart, snooze/remove/always-keep, shopping trip mode (one
  purchase per trip), stores (Al-Fatah, pandamart, Carrefour, I-8 shops), no prices.
- **Snacks tab and order costs (D-23):** Snacks & noodles with search-and-add; Eat out "Orders Aly
  paid for": log cost, pay back all or half, Paid keeps the log.
- **Eat out:** moods, favourites, foodpanda handoff, nearest-first from the home area.
- **Backup/restore** (hand-validated), safe update banner.

## 5. Where to look when reviewing
| Area | Files | Challenge |
|---|---|---|
| Stock ledger | `app/src/domain/ledger.ts`, `usage.ts` | recorded-order stock (`recordedAt ?? at`), reversals, `set-stock`, no double counting |
| Cart and trips | `domain/cart.ts`, `trip.ts`, `shopPrefs.ts` | merge rule, dismissals, low = recorded or always-keep items only, trip = one idempotent purchase |
| Storage | `storage/db.ts`, `useKitchen.ts`, `saveQueue.ts`, `backup.ts` | DB layout 3, pending-write replay, every new field needs a backup reader (`orderCosts`, `shopPrefs` ...) |
| Model calls | `app/src/gemini/*`, `app/src/commandcode/*` | untrusted output (`sanitize.ts`), keys in headers only, limits and timeouts |
| Eat-out list | `tools/eatout/*`, `domain/geo.ts`, `eatout.ts` | public list keeps restaurant lat/lng only, refuses to write home coordinates |
| Order costs | `domain/orderCosts.ts`, `ui/OrderCostsPanel.tsx` | half rounds up, unchosen orders not in due total |
| UI | `ui/*`, `styles.css` | 390 px layout, tab bar columns, Netlify badge lift, toast above nav |

## 6. Questions only Aly can answer (ask before acting)
1. Commit the uncommitted work from section 3? On which branch, and merge to `main`?
2. Command Code default model: `Qwen/Qwen3.8-Omni-Flash` (code) or deepseek (D-24 text)? Update whichever is wrong.
3. Are the 7 tabs final? Check they fit on Noor's phone.
4. May the `audit/` evidence files be published in the public repo?
5. Delete the merged `claude/*` branches and the old agent worktrees under `.claude/worktrees`?
6. "Frisky" snack spelling (Aly wrote "frisky" and "firstky"; both are searchable aliases).

## 7. Not verified (never assume these work)
- Anything on a real phone beyond Aly's 2026-10-06 Snap test (which found a photo-memory crash and a
  lost reading after switching apps; both were fixed in `8d5df8c`, not re-tested on the phone here).
- Store links opening store apps; Al-Fatah and Carrefour search result quality; pandamart (copy then
  open); Maps directions; "Use my location".
- Live Gemini and Command Code behaviour (grounded search, JSON output, photo handling) beyond mocks.
- Restaurant list: `app/public/eatout/moods.json` does not exist yet. Aly runs, from `app/` in
  PowerShell: `$env:NOOR_HOME_LAT = "33.668"; $env:NOOR_HOME_LNG = "73.075"; npm run refresh:eatout`,
  reviews the file, then commits it.
- Netlify: free plan is credit based; each push to `main` is a deploy.

## 8. Open items for Aly (not for the assistant)
Real-phone pass of `docs/ACCEPTANCE-CORE.md`; Settings -> Remove sample pantry before Noor
starts; generate and commit the restaurant list; confirm keys work (Settings -> Test my key).

## 9. Deferred on purpose (D-21, D-02)
Custom and Ramadan meal slots; menu-level matching for Korean wings and Donuts; family recipe
photos; shared household and sync (D-02: single device for now). Live prices are out of scope.

## 10. Working rules (summary; `AGENTS.md` is authoritative)
Branch per piece of work (`claude/<slug>` or `codex/<slug>`), commit messages `type: summary`,
stage files by name, never force-push or rebase shared history, run typecheck + unit + browser
tests before every push and report the results, keep decisions in `docs/DECISIONS.md` only after
Aly states them. Account note: this project's history shows Claude, Codex, GLM 5.3 and Command Code
all touching the repo, so always re-check `git log` and `git status` before assuming this file is current.
