---
id: 01M441ME68VC4RY6BDTP5NASPJ
title: "P3: weekly foodpanda refresh for order-by-mood (F84)"
status: done
ready: true
creator: Aly Jafferani
goal: "A script on Aly's computer refreshes the best-rated restaurants near home for each mood, and the app shows them on the Eat out screen."
context: "A script on Aly's computer refreshes the best-rated restaurants near home for each mood, and the app shows them on the Eat out screen. Approach changed 2026-10-05 (docs/DECISIONS.md D-13): no Apify and no paid service. tools/eatout/refresh_moods.mjs reads foodpanda's public listing, takes the search centre from NOOR_HOME_LAT/NOOR_HOME_LNG environment variables, and writes app/public/eatout/moods.json (published) plus data/eatout/moods.json (local only). The home coordinates never appear in the published file. Needs Aly to run it about weekly, review and commit the list."
definition-of-done: Script in tools/ refreshes a saved list per mood (top places by rating near home) using the token from an environment variable
tags:
  - p3
blocked-by:
  - 01M43TEV902MGP88SF35823HWF
related: []
commits: []
created-at: 2026-10-04T18:08:18Z
updated-at: 2026-10-06T18:18:31Z
assignee: Aly Jafferani
updated-by: Aly Jafferani
outcome-what: Weekly foodpanda mood list refresh script (F84)
outcome-why: Script built and the list published; approach revised to no paid service (D-13)
outcome-resolves: DoD met
---

# P3: weekly foodpanda refresh for order-by-mood (F84)

## Definition of Done

- [x] Script in tools/ refreshes a saved list per mood (top places by rating near home), configured by environment variables, no paid service (D-13)
  proof: tools/eatout/refresh_moods.mjs; app/public/eatout/moods.json generated 2026-10-05 (11 moods, 92 entries); verified in audit/verification-2026-10-06-claude-handoff.md

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

