# Noor's Kitchen: working rules

These rules apply to anyone who changes this repository: Codex, Claude, or a person.
This file is the single source of the rules. `CLAUDE.md` imports it; do not copy rules
into other files.

## Start of every session

1. `git status` and `git log --oneline -10`. Do not discard work you did not make.
2. Read `docs/PLAN.md`, `docs/DECISIONS.md` and `pending-global-mistakes.md`.
   On Aly's machine, also read `C:\Users\Aly Jafferani\.codex\mistakes.md` if it exists.

## Who decides

Aly Jafferani owns the app and makes every decision. Noor is the main user. If a step
needs a decision, an account, a key, a password, a payment or a publication, stop and
ask Aly. Record decisions in `docs/DECISIONS.md` only after Aly makes them.

## Repository

- Remote: `https://github.com/ssdbank9/Noor-Kitchenette.git` (`origin`), branch `main`.
- Pull before starting (`git pull --ff-only`). Push your branch when the work is
  committed.
- The repository is **public** by Aly's decision (D-05, 2026-10-04). Never commit
  API keys, passwords, `.env` files or anything Aly has not agreed to publish.

## Working on a change

- Branch per piece of work: `codex/<slug>` or `claude/<slug>`, from an up-to-date
  `main`. Merge into `main` only when Aly says so.
- Commit messages: `type: summary`, for example `fix: keep search focus while typing`.
  Refer to features as `F<n>` and defects as `D<n>` from `docs/FEATURES.md` and
  `docs/PLAN.md`.
- Stage only the files you changed. Never `git add -A` or `git add .`. Never force-push,
  rebase or amend shared history.

## Source files

- `sources/` holds copies of the original v3 app and both workbooks. Treat them as
  read-only evidence. Never save a workbook through a parser.
- `audit/` is Codex's review evidence from 2026-10-04. Do not edit it; add new evidence
  in a new dated file.
- `docs/FEATURES.md` is generated: change `tools/build_feature_catalog.cjs` and run
  `node tools/build_feature_catalog.cjs`.

## Tests

From `app/`: `npm test` (logic) and `npm run test:e2e` (builds, then Chrome at 390 x 844,
Asia/Karachi; uses the installed Google Chrome, no browser download). Run both, plus
`npm run typecheck`, before every push and report the results.

## Quality bar

- Domain logic (units, availability, ranking, basket, events) gets unit tests.
- Every fix for D1 to D6 gets a regression test that would fail on the v3 behaviour.
- Browser checks run at 390 x 844 in time zone Asia/Karachi.
- State what you verified and how. Say "not verified" for anything you did not run,
  especially real-phone, camera, sync and external links.
- Before calling work ready, someone who did not write it reviews the diff.

## Privacy

This repository holds household data. Do not publish it, push it to a new remote, or
change a remote's visibility without Aly's instruction (see D-05). Never put API keys in
the app or the repository.
