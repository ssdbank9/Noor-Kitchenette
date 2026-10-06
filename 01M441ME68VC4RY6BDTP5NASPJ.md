---
id: 01M441ME68VC4RY6BDTP5NASPJ
title: "P3: weekly foodpanda refresh for order-by-mood (F84)"
status: backlog
ready: false
creator: Aly Jafferani
goal: "A script on Aly's computer refreshes the best-rated restaurants near home for each mood, and the app shows them on the Eat out screen."
context: |-
  Aly approved using the Apify foodpanda scraper and accepted the terms risk on 2026-10-04 (docs/DECISIONS.md D-13).
  Actor: https://apify.com/crawlerbros/foodpanda-scraper - supports Pakistan and Islamabad; inputs: lat/lng or city, radius, max restaurants, menus on/off; returns name, rating, review count, cuisines, delivery time and fee, menu items and prices. About $1 per 1,000 results.
  Needs Aly's Apify account and API token, read from an environment variable on Aly's computer. Never commit it, never put it in the app.
  Moods: Pasta, Pizza, BBQ, Karahi, Chinese, Korean wings, Handi, Burgers, Donuts, Croissants, Desserts, plus Noor's own. Map each mood to foodpanda cuisines and menu keywords; check the mapping by hand once.
  Read the actor's input schema on its Apify page before writing the call; do not guess field names.
  Design: Eat out screen in the canvas linked from README.md.
definition-of-done: Script in tools/ refreshes a saved list per mood (top places by rating near home) using the token from an environment variable
tags:
  - p3
blocked-by:
  - 01M43TEV902MGP88SF35823HWF
related: []
commits: []
created-at: 2026-10-04T18:08:18Z
updated-at: 2026-10-06T18:18:14Z
assignee: Aly Jafferani
updated-by: Aly Jafferani
---

# P3: weekly foodpanda refresh for order-by-mood (F84)

## Definition of Done

- [ ] Script in tools/ refreshes a saved list per mood (top places by rating near home) using the token from an environment variable

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

