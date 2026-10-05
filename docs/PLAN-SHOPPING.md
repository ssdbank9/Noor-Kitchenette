# Plan: To-buy cart, where to buy, shopping trips, nearest eat-out

Status: **agreed by Aly 2026-10-05, not yet built** (D-22). Builds on the existing Shop tab
(manual list, low-stock button, weekly basket from the Plan tab).

## 1. To-buy cart that builds itself
- One list, fed by: items below their minimum (automatically), the week's plan, "+ List" on a
  dish, and items added by hand (including non-recipe items).
- Each line: item, amount and unit, why it is there (low / for <dish> on <day> / added), and
  where to get it. The same item never appears twice (low stock and plan combine into one line).
- "Always keep" staples: any item can have a minimum and a usual buy amount. Snooze ("not this
  week") or remove; it returns only when it runs lower again.
- **Buldak noodles**: one item, new aisle "Snacks & noodles", count in packs, keep 5 (added to
  the list when fewer than 5 are left). Added through the seed so every install has it.

## 2. Shopping trip mode
- Big checklist grouped by aisle or by store, quantities shown, tap to cross off, "Got 1 of 2"
  for partial buys. Works offline.
- "Done shopping" saves ONE purchase for the trip (idempotent, existing safe-save rules), asking
  for actual amounts only where they differ; prices optional.

## 3. Where to buy (stores: Al-Fatah, pandamart, Carrefour, local I-8 Markaz shops)
- Editable store list; each store has an online link and/or Maps directions; per-item preferred
  store; the cart can split by store.
- Al-Fatah: per-item "Find on Al-Fatah" link (`https://alfatah.pk/search?q=<item>`; the page
  responded on 2026-10-05, result quality unverified).
- Pandamart: no per-item link is known; copy the list and open foodpanda.
- Carrefour: verify the online search link before shipping; otherwise "open the store".
- Local I-8 Markaz shops: Google Maps directions only.
- Never claims prices or stock; never adds to a store's cart; a broken search link falls back to
  opening the store.
- Share the list (WhatsApp etc.) grouped by store.

## 4. Eat out: nearest to I-8
- Home area stored on the phone (Settings: "I-8", or "Use my location" with permission).
  I-8 Markaz is at 33.668, 73.075 (OpenStreetMap).
- The refresh script searches from I-8 Markaz and keeps each restaurant's public coordinates;
  the phone works out the distance and offers "Nearest first" with "~2 km".
- Aly accepted publishing the list in the public repo (it shows the household is near I-8;
  never the house location).

## Order
1. To-buy cart and staples (incl. Buldak). 2. Shopping trip mode. 3. Stores and where to buy.
4. Eat-out distance (can run alongside 1-2).
