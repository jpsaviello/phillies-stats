# Design Spec: UI quality-of-life pass

## Goal

Four small frictions that every visit to this app runs into, none of which needs
a new endpoint, a dependency, a migration, or a secret. Nothing here adds
information the app doesn't already have — each item is about reaching
information that is already on screen.

The four, in the order they bite a visitor:

1. **You cannot find a player.** The Batting table lists every Phillie with an
   at-bat, the Roster tab lists ~40 players across three sections, and neither
   has a search box. Finding Schwarber means scanning a table sorted by AVG.
2. **You cannot tell the wide tables scroll.** Batting renders 17 columns,
   Pitching 14. At 375px the viewport shows Player + POS + maybe four stats,
   with a sticky first column and a hard right edge that looks like the table
   simply ends. OPS — arguably the column people came for — is off-screen with
   no affordance saying so.
3. **The Schedule tab opens two weeks in the past.** It fetches today ± 14 days
   and renders oldest first, so the first thing on screen is a game from two
   Tuesdays ago and today's game is ~14 rows down.
4. **Long pages have no way back up.** The Roster tab is three sections and ~40
   rows; scrolling to the bottom of it, or to the end of the schedule, leaves
   the tab bar and everything else a long flick away.

## Not in scope, and why

**Sticky table headers.** The obvious fifth item — freeze the column labels so
`HR` is still legible 30 rows down — cannot be done here without changing how
the page scrolls, and that is a bigger change than the problem justifies. The
tables live inside `<div class="overflow-x-auto">`. Specifying `overflow-x: auto`
computes `overflow-y` to `auto` as well, which makes that div a scroll container,
and a `position: sticky` `<thead>` inside it sticks to *that div's* scrollport —
not the viewport. Since the div's height is its content height and it never
scrolls vertically, the header would not stick at all. The fix is to cap the
wrapper's height and give the table its own vertical scrollbar, which changes
page scrolling on every stats tab. Deliberately left alone; item 2 addresses the
same table at much lower risk.

**Feature flags.** These are adjustments to components that already exist, not
new panels that could be wrong on their own, so they follow the first-pitch-time
precedent (no flag) rather than the BullpenUsage one (flag-gated panel). There is
nothing here for a kill switch to reveal or hide.

---

## 1. Player search

A single shared `PlayerSearch` input above the Batting, Pitching and Roster
tables. It filters the rows already loaded — no refetch, no new request, no
change to any fetch.

**Matching is diacritic-insensitive, and that is the point, not a nicety.** This
roster carries Cristopher Sánchez, Ranger Suárez and José Alvarado. A visitor
types `sanchez` on a US keyboard; a naive `includes()` returns nothing and the
feature reads as broken on the first name someone tries. `src/utils/search.ts`
normalizes both sides with `NFD` + combining-mark strip + lowercase.

Query tokens are ANDed, each as a substring: `kyle sch` matches `Kyle
Schwarber`, and so does `schw`. Token-AND rather than whole-string means word
order doesn't matter and a stray double space is harmless.

**The query is component state, not URL state.** Every other view-defining thing
in this app lives in the hash — tab, open player, open game — so putting `q`
there would look consistent. It isn't: `navigate()` pushes a history entry, so a
per-keystroke `q` would push one entry per character and Back would walk the
search backwards one letter at a time, which is exactly the Back behaviour
`useRoute` was written to fix. `replace` on every keystroke avoids that but
rewrites the URL 20 times a second for a transient filter. A search box is not
an address.

Display rules:

| State | Renders |
|---|---|
| Empty query | Every row, exactly as today. No count, no clear button. |
| Query with matches | Matching rows, plus `8 of 26` beside the input. |
| Query with no matches | The existing `EmptyState`, naming the query, with a Clear button. |

Escape inside the field clears it. The count is `aria-live="polite"` so the
result of typing is announced rather than silently changing under a screen
reader.

On the Roster tab the filter runs **before** `groupRoster()`, so section counts
(`Active Roster (26)`) describe what is actually rendered rather than the roster
the section came from, and sections and position subgroups with no matches drop
out instead of rendering an empty heading.

The Batting and Pitching tables filter **after** sorting and after their existing
`atBats > 0` / `inningsPitched > 0` filters, so the denominator in `8 of 26` is
the number of rows that tab would have shown anyway.

## 2. Horizontal scroll affordance

A shared `ScrollX` wrapper replaces the bare `overflow-x-auto` div on the three
wide tables. It renders a narrow gradient over the right edge whenever there is
more table to the right, and removes it once the table is scrolled to the end.

Right edge only. The left column is `sticky left-0` with an opaque background —
a matching left-edge fade would sit on top of the frozen Player column and
suggest the *name* was cut off, which it isn't.

The fade is `pointer-events-none` and `aria-hidden`, so it changes nothing about
hit-testing or the accessibility tree. Measurement is
`scrollWidth - clientWidth - scrollLeft > 1` (the 1px slack absorbs fractional
device-pixel widths, which otherwise leave the fade permanently on at the far
right), recomputed on scroll and on resize via `ResizeObserver` — the tables
change width when the star column appears on sign-in, and a mount-time-only
measurement would be stale from that moment on.

## 3. Schedule: jump to today

A `Today` button above the game list scrolls today's row into view and gives it a
brief ring so the eye lands on it. When today has no game, the button reads
`Next game` and targets the first upcoming row instead; when the window holds
neither (deep off-season), it does not render.

**No auto-scroll on load.** Jumping the page on mount would scroll straight past
`MatchupPreview` — the pregame panel this tab deliberately renders above the
list — and moving someone's scroll position out from under them on arrival is
disorienting even when the destination is right. The button makes the jump one
tap and leaves the decision with the reader.

Scrolling honours `prefers-reduced-motion`: smooth when allowed, instant when
not.

## 4. Back to top

A small circular button, bottom-right, appearing once the page is scrolled past
600px and hidden again at the top.

It stacks **above** the chat FAB rather than beside it: the chat button is
`fixed bottom-4 right-4` at 56px, so this one sits at `bottom-20` in the same
column, and at `z-30` — one below the chat widget's `z-40`, so the full-screen
mobile chat sheet covers it rather than having a stray arrow floating over the
conversation.

Same reduced-motion treatment as item 3. The scroll listener is `passive`.

---

## What does not change

No API call, no `fields=` parameter, no cache TTL, no backend route, no
`RouteResult` field, no migration, no env var, no k8s manifest, no dependency,
no LaunchDarkly flag. Every item is a render-layer change over data the app has
already fetched.
