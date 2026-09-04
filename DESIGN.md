---
name: Phillies Stats
description: A Phillies stats app drawn as a scorecard — hierarchy from rule weight, not from cards.
colors:
  stock: "#F2EDE1"
  panel: "#FAF7F0"
  ink: "#1B1811"
  mark: "#002D72"
  live: "#C21120"
  accent: "#E81828"
---

# Design System: Phillies Stats

## Overview

**Creative North Star: "Scorebook"**

The app is drawn as a scorecard: the ruled grid a fan fills in by hand while
the game happens. That instrument was chosen because it already does what this
product does — it records what happened, in a fixed grid, without predicting
anything. The app refuses playoff probabilities, bullpen availability verdicts
and who-has-the-edge highlights, and a visual world built from ledger rules
makes that restraint read as deliberate rather than as an unfinished feature.

The structural device is the **rule**, not the card. Every panel used to be a
white rounded box with a gray border, which meant a page carrying seven of them
had no hierarchy at all — the masthead banner, the season record and a footnote
were all drawn at the same volume. Now a heavy rule bounds a section, a hairline
separates rows inside it, and radius is 0 everywhere. Depth is spent only where
something genuinely floats above the page: two modal layers and two round
floating controls. Everything else sits flat on the stock.

Density is high and deliberately so. This is an Operate surface — people come to
read figures and leave — so numerals are the material: tabular everywhere, in
columns that align across panels and not merely within them.

**Key Characteristics:**
- Rule weight, never elevation, carries hierarchy.
- Radius 0; `rounded-full` survives only where a circle is real (avatars, the
  chat control, a circled mark).
- Saturated club color is *state*, not decoration.
- Both themes are one token set; no component carries a `dark:` class.

## Colors

Warm scorecard stock and ink in light; the same ruling in reverse ink at night,
biased toward the club navy rather than a neutral gray.

### Primary
- **Phillies Red** (#E81828): fills only — the primary button, the chat control,
  the active tab's rule, a live-game marker. A brand commitment, literal in both
  themes.
- **Live** (#C21120 light / #FF5464 dark): red as *text*. Separate from the brand
  red because #E81828 on cream is 3.6:1 and fails as body text.

### Secondary
- **Mark** (#002D72 light / #A9C2EA dark): the heading voice. Named separately
  from Phillies Navy because navy is a fill that stays literal, while headings
  must invert to stay readable.
- **Phillies Navy** (#002D72): the masthead ground, with the home-uniform
  pinstripe over it. Literal in both themes.

### Neutral
- **Stock** (#F2EDE1 / #101318): the page. The deeper buff of scorecard card stock.
- **Panel** (#FAF7F0 / #171B21): the sheet laid on it. The lift is ~3% — enough to
  seat a panel, far too little to read as a floating card.
- **Panel Raised** (#FFFDF8 / #1D222A): modals and the chat sheet only.
- **Hairline / Rule / Rule Heavy** (#E3DBC8 / #D3C9B0 / #B9AC8C): the three-weight
  hierarchy system. Dark: #232831 / #2C323C / #3D4550.
- **Ink ramp** (`--color-gray-50` … `--color-gray-900`): Tailwind's cool gray ramp
  re-pointed onto warm stock ink, #EFE9DA through #1B1811.
- **Hover** (#F0E9D8 / #1F252E): the row highlight. A pencil mark on the stock.

### Named Rules
**The State Rule.** Red means a thing is happening — a live game, today's row,
the active tab. It is never used to decorate, to rank, or to say "this is the
Phillies' number." An earlier matchup panel drew the *better* ERA in club red,
which made the opponent light up in Philadelphia's own color; that is the failure
this rule exists to prevent.

**The Reverse Ink Rule.** There is exactly one token set. Dark is the same rules
and the same ramp with the values re-pointed, which is why no component in the
app carries a `dark:` class. A color whose only definition lives inside a media
query is the bug this structure forbids.

## Typography

**Display Font:** Barlow Condensed (self-hosted via `@fontsource`, falling back to
`ui-sans-serif, system-ui, sans-serif`)
**Body Font:** the platform UI stack
**Numerals:** `font-variant-numeric: tabular-nums`, applied to every `table` and
anything marked `.tabular`

**Character:** A condensed grotesque against a plain UI stack. The condensed face
does the work of a scoreboard's stencilled lettering — it carries names and dates
at width — while the body face stays out of the way of the figures, which are the
actual content.

### Hierarchy
- **Masthead** (700, 1.5–1.875rem, leading-none, uppercase, tracking-wide): the club
  name. Once per page.
- **Section heading** (700, 1.25–1.875rem): panel titles and the day's opponent.
- **Figure** (700, 1.125–1.875rem, tabular): the record, a score, a stat tile's value.
- **Body** (400, 0.875rem): table cells and prose.
- **Label** (600, 0.75rem, tracking-[0.12em], uppercase, `--color-gray-500`): the
  `card-label` utility — a scorecard's column head.
- **Fine print** (400, 0.75rem, `--color-gray-500`): the caveats. Load-bearing
  content in this product, not an afterthought.

### Named Rules
**The Column Head Rule.** A label is quiet because the figure under it is the
thing being read. If a label competes with its own value, the label is wrong.

## Layout

Two widths, and only two. Everything in the masthead — header, banners, live
strip, summary strip, favorites, story rows, and the nav — is `max-w-7xl mx-auto
px-4`, so they share a left and right edge on every tab. Below the nav each tab
holds ONE width for its whole length: `max-w-2xl` for the reading-column tabs
(Standings, Schedule), the full `max-w-7xl` for the table tabs, and that same
full width for Today as a two-column grid from `lg` up.

The masthead is one object, not a stack. Its rows are separated by hairlines and
carry no individual borders; the sticky nav is its last row and carries its
closing heavy rule. Measured on the Batting tab, chrome above the content is
486px at 1280 and 553px at 375.

Summary cells join rather than float: the strip is a grid with collapsed borders
(`-ml-px -mt-px`) so four cells read as one boxed row — a scorecard's header —
instead of four tiles separated by gaps.

## Elevation & Depth

The system is flat. Separation is tonal (stock → panel → panel-raised) and by
rule weight. There is no shadow vocabulary and no shadow token.

Two exceptions, both genuine:
- **Modal layers** (auth, game log, game detail, profile, chat sheet): a dimmed
  page behind plus a 2px heavy rule. Deliberately *not* a shadow — a black blur
  on a black ground does nothing in dark mode, while a rule reads in both.
- **Floating controls** (chat button, back-to-top): `0 3px 10px rgb(0 0 0 /
  0.22–0.28)`. Real offset, real blur; these are the only elements that hover
  over scrolling content.

## Shapes

Radius is 0. Every radius token — `--radius-xs` through `--radius-3xl` — is
`0px`, so the app's existing `rounded-lg` / `rounded-md` classes resolve square
without a sweep through 33 components. `rounded-full` is a separate token and
survives on purpose: avatars, the chat control, and status dots. A circled mark
is real scorekeeping notation.

## Components

- **Masthead** — navy ground, pinstripe overlay, 2px red closing rule, club name
  and the Eastern-date line. Tight vertical padding: everything below it is what
  the reader came for.
- **Nav** — sticky, `bg-panel`, 2px heavy bottom rule so it still reads as the
  chrome boundary once it detaches. Active tab: `--color-mark` text plus a 3px
  red rule that draws in from the left.
- **Summary cell** — `bg-panel`, 1px rule, collapsed borders, label over figure.
  Owns its own loading and failed presentations: a pulse, then an em-dash. A
  failed cell never becomes an error.
- **Table** — `bg-gray-50` ruled header, hairline row dividers, sticky first
  column on the panel ground, `hover:bg-hover` row tint. Sortable headers mark
  the active column in `--color-live`.
- **Modal** — `bg-panel-raised`, 2px heavy rule, dimmed backdrop.
- **Panel footnote** — fine print in `--color-gray-500`, stating the window, the
  qualification threshold, and what the panel does not claim.

## Do's and Don'ts

**Do** express hierarchy with rule weight and type scale.
**Do** give every panel that states a measurement its fine print.
**Do** let a failing panel hide itself; a tab never fails as a whole.
**Do** define every color in the base token set so both themes resolve.

**Don't** add a drop shadow to a panel. Flat is the system, not an oversight.
**Don't** put a colored border on one side of a card. That device was removed
from the live strip and the schedule row precisely because it reads as an
AI-generated tell; use rule weight or a full 1px live rule instead.
**Don't** use red to rank, highlight a winner, or decorate. See The State Rule.
**Don't** write a `dark:` class. Re-point a token instead.
**Don't** name a token for a color it isn't. The row hover was `bg-red-50` while
resolving to a warm tint, which lied to every reader after the first.
