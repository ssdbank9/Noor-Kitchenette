# Noor's Kitchen: working rules

These rules apply to anyone who changes this repository: Codex, Claude, or a person.
This file is the single source of the rules. `CLAUDE.md` imports it; do not copy rules
into other files.

## Start of every session

1. `git status` and `git log --oneline -10`. Do not discard work you did not make.
2. Read `docs/PLAN.md`, `docs/DECISIONS.md` and `pending-global-mistakes.md`.
   On Aly's machine, also read `C:\Users\Aly Jafferani\.codex\mistakes.md` if it exists.
3. Check the board: `jaira validate`, `jaira resume --json`, `jaira next --json`.
   (Binary: `C:\Users\Aly Jafferani\go\bin\jaira.exe`; upstream
   `github.com/BeMuCa/jaira` v0.2.0.) Never run `jaira init` again and never
   regenerate the board.

## Who decides

Aly Jafferani owns the app and makes every decision. Noor is the main user. If a step
needs a decision, an account, a key, a password, a payment or a publication, stop and
ask Aly. Record decisions in `docs/DECISIONS.md` only after Aly makes them.

## Working on a ticket

- Claim the ticket before editing (`jaira claim <id>`, or move it to in-progress).
  Only one agent works a ticket at a time. Release it (`jaira release <id>`) if you stop
  before it is finished, and leave a `jaira note` saying where you got to.
- Branch per ticket: `codex/<ticket-id>-<slug>` or `claude/<ticket-id>-<slug>`, from an
  up-to-date `main`. Merge into `main` only when Aly says so.
- Commit messages: `type(<ticket-id>): summary`, for example
  `fix(AB12CD): keep search focus while typing`. Refer to features as `F<n>` and
  defects as `D<n>` from `docs/FEATURES.md` and `docs/PLAN.md`.
- Stage only the files you changed. Never `git add -A` or `git add .`. Never force-push,
  rebase or amend shared history.

## Source files

- `sources/` holds copies of the original v3 app and both workbooks. Treat them as
  read-only evidence. Never save a workbook through a parser.
- `audit/` is Codex's review evidence from 2026-10-04. Do not edit it; add new evidence
  in a new dated file.
- `docs/FEATURES.md` is generated: change `tools/build_feature_catalog.cjs` and run
  `node tools/build_feature_catalog.cjs`.

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
