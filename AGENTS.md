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

## Repository

- Remote: `https://github.com/ssdbank9/Noor-Kitchenette.git` (`origin`), branch `main`.
- Pull before starting (`git pull --ff-only`). Do not push until Aly has settled
  the repository's visibility (D-05); the repository was public when it was linked
  on 2026-10-04.

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

<!-- jaira:start -->
## Task tracking: jaira

This repository has a jaira board (`.jaira/`). Multi-step work is tracked
there as markdown tickets so it survives session boundaries.

Capturing and picking work:

- `jaira create <title> --goal <...> --context <...> --dod <...>` — one call files a
  complete ticket; without a goal, a definition of done, the context it came from
  and an assignee it cannot leave the backlog
- the context is the only record of why a ticket exists. Write it for someone who
  was not in this conversation and reads it weeks from now: what is wrong today,
  what triggered it, what is already known or ruled out. Write it as if that
  reader has mild ADHD and knows none of what you know — lead with what is wrong,
  short concrete lines with one point each, names and paths rather than
  adjectives, no jargon and no preamble. It may span several lines, but someone
  should be able to act after the first two. If acting on it would need a
  question answered first, it is not finished
- `jaira list --actionable --json` — everything that could be started right now
- `jaira next --json` — the single next actionable ticket
- `jaira tags` — the tags this board already uses, with how many open tickets
  carry each. **Read it before you tag anything** and reuse the name that is
  already there for that subject; never invent a synonym — "ui", "frontend" and
  "gui" on one board are three names for one thing and filter to nothing.
  `jaira tag <id> <name>...` adds tags, and `jaira create --tag <name>` sets them
  at capture. A name jaira has not seen is new and gets a colour in the
  hand-editable `.jaira/tags`; the board filter and `jaira list --tag <name>`
  read them back

Working a ticket:

- `jaira claim <id>` — take it first; other sessions read this board too
- `jaira show <id> --for-lane <lane> --json` — the lane's prompt, the bounded input,
  the model tier, and the outputs the lane expects back
- `jaira dod <id> <n> --done --proof "<file:line or test name>"` — tick an
  acceptance criterion and say what makes it true. These are what the terminal
  lane's gate reads: one left unticked refuses the move however finished the
  work is, and it refuses it at the end, when the cost of finding out is
  highest
- `jaira dod <id> <n> --doing|--done --plan` — the method, a second and
  separate list. Ticking the plan does not tick the definition of done
- `jaira note <id> <text>` — at every pause, write down what the repository does
  not already say: dead ends, why this and not that, what you had to find out.
  Not what the checklist and git already record. A killed session never gets a
  turn to write anything down, so do not save it for the end
- `jaira move <id> --to <lane> --what <...> --why <...> --resolves <...>` — finish
  the step. jaira works out the commit list itself from git history — the union
  of the ticket file's own history and commits naming its id — so nothing needs
  to be typed here; it is written onto the ticket once, when the ticket leaves
  the board
- `jaira resume` — work left in progress, with everything recorded about it
- on a board that has not been shared yet (`jaira init` gitignores `.jaira/`
  until `jaira share`), the ticket file is untracked, so the only thing tying a
  commit to a ticket is its handle in the commit message. Name it there —
  `fix(A3K9QP): ...` — or the derived list stays empty and the move is refused
- **the ticket rides in the same commit as the code.** Move the ticket first,
  then `git add` the changed file under `.jaira/tickets/` alongside your source
  changes and commit them together. A reviewer then sees the change and what it
  was for in one place, instead of a diff whose ticket is still in whatever
  state the last commit left it. Same for a ticket you create and hand to
  someone else: commit it, or nobody but you knows it exists — and now this is
  also what makes the commit list derivable at all: that shared commit is how
  git ties the ticket to the change
- `jaira logbook <id>` — once a ticket reaches the terminal lane, stamps its
  commits and files it under `.jaira/logbook/<you>-<date>/`, taking it off the
  board. `jaira restore <file>` brings it back

`jaira <command> --help` for everything else.

Do not edit files under `.jaira/tickets/` directly; the CLI is the write path.
The human review lane cannot be left by an agent — a person accepts the work there.

A `jaira:local` marker — an HTML comment of that name — added by hand anywhere
inside this block makes everything between it and the end marker survive the
next regeneration. Nothing writes it for you, and there is none here until
somebody adds one; project-specific rules belong behind it rather than fighting
this note from outside the block.

## This board's lanes

Order: backlog → brainstorm → todo → pre-process → in-progress → human → review → signoff → done → blocked

- `backlog` — no agent step; move through it
  Captured but not yet specified enough to work on.
- `brainstorm` — yours to work; tier strong; must produce goal
  Working out what the ticket should even be.
- `todo` — no agent step; move through it
  Specified and ready to be picked up.
- `pre-process` — yours to work; tier strong; must produce plan
  Working out how the change will be made.
- `in-progress` — yours to work; tier cheap; must produce outcome-what, outcome-why, outcome-resolves
  Carrying out the plan.
- `human` — **a person's, not yours** — you may move work in, never out
  Human in the loop.
- `review` — yours to work; tier strong; must produce review-summary, review-gaps, review-verdict, review-check
  A second model has judged the diff.
- `signoff` — **a person's, not yours** — you may move work in, never out
  Reviewed by a model, waiting for a person to accept it or send it back.
- `done` — no agent step; move through it; terminal
  Accepted.
- `blocked` — no agent step; move through it; parking: work returns to the lane it left
  Waiting on an external dependency.

Nothing moves a ticket for you. There is no daemon and no runner: a lane's
prompt runs because a session ran it. Drive the board from the session you are
in — `jaira next --per-lane --json` says which lanes have work waiting and
which of them you are allowed to work, `jaira show <id> --for-lane <lane> --json`
hands you that lane's prompt and its bounded input, and `jaira move` puts the
result in the next lane. Work one lane to empty before starting the next, or
the lane nobody drives is the one that fills up.

Told to start or work a ticket, drive it this way yourself — lane by lane,
loops included — until it sits in a human lane, then continue once the human
has answered. Told an agent should work it, hand it to a subagent that
babysits the ticket through the same route.
<!-- jaira:end -->
