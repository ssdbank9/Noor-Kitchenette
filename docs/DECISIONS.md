# Decisions

Aly is the only decision-maker. An agent may propose; it records a decision here only
after Aly states it, with the date and Aly's words or a link to them.

## Open

| ID | Question | Proposed answer | Why it matters |
|---|---|---|---|
| D-02 | Should Noor and Aly share one live household? | Not in P1 to P4. Design events so sync can be added in P5 | Shared sync needs accounts and a server |
| D-08 | Where does the Gemini key live, and are photos kept after review? | Key held by a small server function on the host, never in the app or the repo; photos discarded after review unless Noor keeps them | The repo is public and the app runs on phones, so a key in either would be exposed |
| D-07 | What does the recipe "match %" mean? | Share of required amounts available, scaled to servings | Ranking must be explainable to Noor |

## Decided

| ID | Date | Decision | Source |
|---|---|---|---|
| D-06 | 2026-10-04 | Track work with Jaira (board in `.jaira/`) and keep the project in a local git repository that Codex and Claude both work from | Aly, Claude session 2026-10-04: "commit to git so both we can work with codex and claude interchangably", "jaira skill use. as well" |
| D-05 | 2026-10-04 | GitHub remote is `ssdbank9/Noor-Kitchenette`, kept **public**. Household recipes, stock and audit evidence are published there knowingly | Aly, Claude session 2026-10-04: "Keep it public I am okay with it" |
| D-03 | 2026-10-04 | Photo recognition is a must-have in the first release (moved to P2, before the pilot), and Google Gemini does it | Aly, Claude session 2026-10-04: "Photo recognition is must we can have gemini do it for us" |
| D-09 | 2026-10-04 | The app shows recipes from current stock, tracks what is cooked and what can be cooked, keeps a database of cooked meals to analyse how often each dish is cooked (F79), and every dish shows a recipe from the internet (F78) | Aly, same session: "every dish should pop up a recipe from the internet" |
| D-10 | 2026-10-04 | Noor can add a new dish by name; the app looks it up live, loads its ingredients, checks whether stock is enough, and shows the recipe and video (F80, in P2 with the other Gemini features). Recipes and videos are ranked by rating, views, and Reddit and YouTube-comment feedback (F78) | Aly, Claude session 2026-10-04 |
| D-01 | 2026-10-04 | Build an installable phone web app (PWA) with React + TypeScript and Vite. Node.js is used only on the computer to build and test; there is no app server. Data lives on Noor's phone (IndexedDB). Tests: Vitest and Playwright | Aly, Claude session 2026-10-04, choosing Netlify after this stack was proposed ("Let's go with netlify") |
| D-04 | 2026-10-04 | Host on Netlify (static hosting only, no server functions; works with a private repo). Not Cloudflare | Aly, same session: "Non cloud flare option please", "Let's go [with] netlify" |
| D-11 | 2026-10-04 | Design: fantastic visuals; the workflow is mostly buttons with very little typing; questions are answered with one-tap yes/no buttons in Noor's words (exact Roman Urdu wording to confirm with Aly). Designs are made with Claude Design | Aly, same session |
