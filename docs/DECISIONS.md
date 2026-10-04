# Decisions

Aly is the only decision-maker. An agent may propose; it records a decision here only
after Aly states it, with the date and Aly's words or a link to them.

## Open

| ID | Question | Proposed answer | Why it matters |
|---|---|---|---|
| D-01 | What do we build on? | Installable PWA, local-first (IndexedDB), TypeScript + Vite, Vitest + Playwright | Every phase from P0 depends on it |
| D-02 | Should Noor and Aly share one live household? | Not in P1 to P4. Design events so sync can be added in P5 | Shared sync needs accounts and a server |
| D-03 | Photo recognition: which provider, who holds the key, where do photos go? | Claude vision through a small server function; photos not stored after review unless Noor keeps them | Cost, privacy, and the key must never be in the app |
| D-04 | Where is the app hosted? | A free static HTTPS host (GitHub Pages, Netlify or Cloudflare Pages) | Phones install PWAs only from HTTPS |
| D-05 | Is there a GitHub remote, and is it private? | Private repository. Astra was published public before visibility was checked | The repo holds household recipes, stock and the review evidence |
| D-07 | What does the recipe "match %" mean? | Share of required amounts available, scaled to servings | Ranking must be explainable to Noor |

## Decided

| ID | Date | Decision | Source |
|---|---|---|---|
| D-06 | 2026-10-04 | Track work with Jaira (board in `.jaira/`) and keep the project in a local git repository that Codex and Claude both work from | Aly, Claude session 2026-10-04: "commit to git so both we can work with codex and claude interchangably", "jaira skill use. as well" |
