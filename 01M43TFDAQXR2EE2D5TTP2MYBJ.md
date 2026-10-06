---
id: 01M43TFDAQXR2EE2D5TTP2MYBJ
title: "Internal acceptance before handing over the core (D-15)"
status: human
ready: true
creator: Aly Jafferani
goal: "Learn from Noor's real use before building the planner or photo entry."
context: |-
  All requirements so far come from the files and from Aly; Noor has not been asked (docs/WORKFLOW_REVIEW.md).
  Plan: Noor uses the P1 app for a week, then a short walkthrough of journey steps 3 (pantry), 4 (what to cook) and 7 (cooking).
  Her answers decide whether P2 (planner and basket) or P3 (photo pantry) comes next.
definition-of-done: Aly decides the next phase
tags:
  - pilot
blocked-by:
  - 01M43TFD367D8YENFPXCEXKCPT
  - 01M43TFDSZ5VYKXJF97JAFKHDS
related: []
commits: []
created-at: 2026-10-04T16:03:13Z
updated-at: 2026-10-06T19:21:56Z
updated-by: Aly Jafferani
assignee: Aly Jafferani
question: "Run the physical-phone acceptance (docs/ACCEPTANCE-CORE.md), enter the live Gemini key, then accept or send back."
---

# Pilot: one week with Noor, then walkthrough

## Definition of Done

- [ ] Acceptance checklist for every core feature passes: synthetic data walkthrough, browser tests, real-phone check
  proof: Browser tests 111/111 pass; synthetic walkthrough done. Real-phone check not yet run.
- [-] Noor's feedback recorded in docs/DECISIONS.md

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress
- **2026-10-06 19:21 · Aly Jafferani** — 2026-10-06 real-phone test by Aly: took a photo in Snap pantry. Two defects found, now fixed in NDB36P: (1) 'unable to complete previous options due to low memory' when a large photo was decoded at full resolution; (2) after alt-tabbing to another app and back, the page reloaded and the Snap screen and Gemini reading were gone. P2MYBJ stays open until the phone pass is re-run on the fixed build.
