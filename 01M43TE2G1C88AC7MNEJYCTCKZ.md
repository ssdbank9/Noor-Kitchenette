---
id: 01M43TE2G1C88AC7MNEJYCTCKZ
title: "Decide platform and hosting (D-01, D-04)"
status: backlog
ready: true
creator: Aly Jafferani
goal: "Aly chooses what the app is built on and where it is hosted, so P0 can start."
context: |-
  No app code exists. Every P0 ticket depends on this choice.
  Proposal in docs/DECISIONS.md: installable PWA, local-first (IndexedDB), TypeScript + Vite, Vitest + Playwright; hosted on a free HTTPS static host.
  Phones only install a PWA from HTTPS, so hosting matters for F51 (home-screen icon).
  Only Aly can decide. An agent must not record the decision until Aly states it.
definition-of-done: "D-01 and D-04 moved to the Decided table in docs/DECISIONS.md with date and Aly's words"
tags:
  - decision
blocked-by: []
related: []
commits: []
created-at: 2026-10-04T16:02:30Z
updated-at: 2026-10-04T17:47:50Z
assignee: Aly Jafferani
updated-by: Aly Jafferani
---

# Decide platform and hosting (D-01, D-04)

## Definition of Done

- [x] D-01 and D-04 moved to the Decided table in docs/DECISIONS.md with date and Aly's words
  proof: docs/DECISIONS.md D-01 and D-04 rows, 2026-10-04

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress
- **2026-10-04 17:47 · Aly Jafferani** — Aly chose Netlify (not Cloudflare) and accepted React + TypeScript + Vite PWA. Gemini key is to be entered on Noor's phone in Settings, so no server functions; D-08 still to be confirmed by Aly.
