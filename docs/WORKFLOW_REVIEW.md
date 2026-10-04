# Review of Codex's review and workflow

Reviewer: Claude, 2026-10-04. Read: `Noor_Kitchen_Coverage_Review.html`'s data
(`audit/coverage-matrix.json`), the audit scripts and evidence, `pending-global-mistakes.md`,
and `sources/Noor_Kitchen_App_v3.html`. I did not re-run Codex's browser checks.

## Verdict

The review is thorough and trustworthy. The proposed nine-step workflow is the right
user journey. The main risks are now **scope and sequencing**, not missing ideas: 77
features with no agreed platform, no input from Noor yet, and a recommendation to
design everything before choosing phases.

## What is solid

- **The defects are real.** I checked the v3 source for four of the six causes and
  each matches: save errors swallowed (`catch(e){}`, line 121), quantity parsed with
  `parseFloat` and no unit (line 143), UTC date via `toISOString()` (line 209), and
  focus restored to a search box the re-render has already replaced (lines 213, 239).
  The undo defects (D3, D4) follow from the snapshot design Codex describes.
- **The shopping diagnosis is correct and important.** Excel's "Total Needed" sums the
  whole recipe catalogue, so it is not a shopping list. Keeping minimum-stock top-ups
  and single-dish shopping beside a basket for the planned meals is the right fix.
- **Traceability.** Every feature has an origin and separate status columns for the
  earlier workflow and for v3. The 22 recipes, 62 ingredients and 276 recipe rows were
  reconciled between both workbooks. This is what made it possible to turn the review
  straight into a phased plan (`FEATURES.md`).
- **Honest limits.** It says clearly what was not tested (real phone, camera, cloud
  recognition, sync, external links).

## Where I disagree or would change the workflow

1. **"Design the full scope before choosing phases" risks never shipping.** Design the
   parts that are expensive to change later now: the event ledger, quantities with
   units, local dates, stable IDs, backup format. Build screens phase by phase. Noor
   gets a working replacement for v3 (P1) before the planner exists.
2. **Noor has not been asked yet.** Every requirement comes from the files or from Aly.
   Before P2, run the one-week pilot and a short walkthrough with Noor of steps 3, 4
   and 7. Her answers should decide whether the planner or photo entry comes next.
3. **Step 1 is a lot of work before any value.** Confirming starting stock for 62
   ingredients is a chore. Allow "not sure" as a real amount (F59) and confirm stock
   gradually as items are used or bought. Default everything else in setup.
4. **Step 6's "receipt and grocery photo update stock once" is the hardest item in the
   list.** Matching two photos of one shop needs a purchase record that both attach to.
   Build manual purchase entry first (P2) and photo matching later (P3).
5. **Step 8 bundles too much.** Everyday use and "finished" (P1) are common daily
   actions. Leftovers, freezer movements and waste (P4) are a different, less frequent
   job. Chai is best handled as a one-tap "quick use" preset rather than a special case.
6. **Define the ranking.** "Pantry coverage %" in Excel and v3 can mean share of
   ingredients present or share of required amounts available. Pick one, show it in
   words ("missing 2: onions 500 g, yoghurt 250 g").
7. **Missing from the workflow:**
   - The platform and hosting choice (D-01, D-04). It changes everything from P0 on.
   - Who pays for and holds the photo-recognition key, and where photos go (D-03).
   - Urdu or local ingredient names. Aliases are listed (F69) but not as a requirement.
   - Recipe versions. If Noor edits a recipe, past cooking history should still show
     what was cooked (noted in F63; make it explicit in the data model).

## Feedback on the process and tooling

- **The work was not in git.** Sources were spread across the Desktop and a Codex
  output folder. Now fixed: this folder is a git repository and the sources are
  copied into `sources/` (originals untouched, hashes match the audit).
- **The audit scripts only run on this machine and in Codex.** `browser-review.cjs`
  loads Playwright from Codex's private runtime folder, and the Python scripts point to
  absolute paths on the Desktop. Claude cannot re-run them as they are. When the app's
  test harness is set up (P0), move these checks into it with paths relative to the repo.
- **Product defects are filed in the agent mistakes log.** `pending-global-mistakes.md`
  mixes agent tooling lessons (output truncation, cp1252 errors) with product defects
  (D1 to D6). Keep the log for process lessons; product defects now live in
  `PLAN.md` section 4 and on the board.
- **`report-verification.json` checks the review page, not the app.** That is fine,
  but it should not be read as app testing.
- **`audit/workbook-evidence.json` is 2.4 MB.** It is committed as evidence. If the repo
  goes to GitHub, decide whether household data should be in a public repository at
  all (D-05).
