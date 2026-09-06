---
name: Phillies Stats
description: A Phillies stats app drawn as a measuring instrument — a dark plotting canvas, one diverging scale, figures as the material.
colors:
  canvas: "#0B0F14"
  panel: "#131A22"
  ink: "#EDF1F6"
  mark: "#9CC1F0"
  live: "#FF5C68"
  accent: "#E81828"
---

# Design System: Phillies Stats

## Overview

**Creative North Star: "Instrument"**

The app is the thing that **measures** the game, not the paper that records it.
The surface is a plotting canvas: a dark emissive ground carrying a faint
coordinate grid, with panels seated on it as plot surfaces. Figures are the
material and they are tabular everywhere.

This replaced a scorecard world — warm cream stock, radius 0, ruled paper,
condensed newspaper lettering. That world was a faithful period pastiche, and
that is exactly why it read as dated: it was drawn to look like a 20th-century
paper artifact. It was also, independently, the single look AI design work
converges on most reliably (warm cream ground, high-contrast display face,
signal-red accent), so it read as generic as well as old. Structural repair
could not fix either problem, because neither was a structural problem.

The product refuses playoff probabilities, bullpen availability verdicts and
who-has-the-edge highlights. An instrument makes that restraint legible: an
instrument states what it measured and does not editorialise.

**Key Characteristics:**
- One diverging measurement scale carries magnitude; the club red is its hot end.
- Dark is the base, not an alternate. Light is the same instrument in daylight.
- The canvas carries a coordinate grid; panels sit opaque on top of it.
- Both themes are one token set; no component carries a `dark:` class.

## Colors

### The measurement scale
`--color-scale-1` … `--color-scale-5` run cool blue `#3E7CB8` → `#5C9FD6` →
neutral `#8AA0B4` → warm `#E8734A` → **`#E81828`, the club red**.

This is the whole colour idea, and it is the reason the brand does not sit on
this page as decoration. A red cell means *this is the high end of the
measurement*. The Phillies' own red is where a cool-to-hot scale naturally
terminates, so the brand commitment and the data language are one decision
rather than two that have to be reconciled.

### Brand
- **Phillies Red** (#E81828): the scale's hot end, and fills — the primary
  button, the chat control, the active tab's rule, a live marker. Literal in
  both themes.
- **Phillies Navy** (#002D72): a plotted field colour. **No longer a ground.**
  A saturated navy block at the top of a dark canvas fights everything beneath
  it, so the masthead is the panel surface closing on a red rule instead.
- **Phillies Cream** (#FAF7F0): defined, because it is a brand commitment, but
  used nowhere. The club mark is a red script "P" that reads cleanly on the dark
  ground, so it sits bare on the instrument bar with no disc behind it.

### Grounds
- **Canvas** (#0B0F14 / #EEF1F6): the page, carrying the coordinate grid.
- **Panel** (#131A22 / #FFFFFF): the plot surface laid on it. Opaque, so the
  grid stops at its edge.
- **Panel Raised** (#1A222C / #FFFFFF): modals and the chat sheet.

### Grid
**Hairline / Rule / Rule Heavy** (#1C2530 / #26313E / #3A4859 dark;
#E2E8F0 / #CFD8E3 / #A9B6C6 light) — faint gridline, gridline, axis.

### Ink
- **Mark** (#9CC1F0 / #16437E): the heading voice.
- **Live** (#FF5C68 / #C21120): state — a game in progress, a loss, the active
  sort. Never decoration.
- **Ink ramp** (`--color-gray-50` … `--color-gray-900`): cool and emissive,
  #151C25 → #EDF1F6 dark, inverted light.
- **Band** (#17202B / #EDF2F9): the tint the sorted column holds.

### Named Rules
**The State Rule.** Red means a thing is happening — a live game, the active
tab, a loss. It is never used to rank or to say "this is the Phillies' number."
The scale is the exception that proves it: there, red means *high*, and the
footnote says so.

**The Scale Rule.** Anything stating a magnitude uses the five-stop scale.
Inventing a one-off colour for a magnitude is how a system stops being one.

**The Reverse Ink Rule.** There is exactly one token set. Light re-points the
same names, which is why no component carries a `dark:` class. A colour whose
only definition lives inside a media query is the bug this structure forbids.

**Dark is chosen, not defaulted.** The game-day reader is on a phone in a dim
room with the broadcast on, first pitch between 6:40 and 10 PM ET. Light is for
desk browsing and is cool neutral throughout — warmth is what the old world
was, and a cream ground would drag it straight back.

**The reader can override it.** The masthead carries a three-state control —
system, light, dark — and `system` is the ABSENCE of `data-theme`, so the media
query stays the deciding rule. Dark remains the base the app is designed
against; the control says which way the ink runs, not which theme is primary.
It is applied before first paint by an inline script, never by a React effect.

## Typography

**Face:** Archivo (variable, self-hosted via `@fontsource-variable/archivo`),
falling back to `ui-sans-serif, system-ui, sans-serif`. One family for display
and body.
**Numerals:** `font-variant-numeric: tabular-nums` on every `table` and
`.tabular`.

**Character:** A grotesque built for dense settings, with figures that hold a
column. It replaced Barlow Condensed, whose condensed newspaper lettering
belonged to the paper world.

**Archivo is materially wider than the condensed face it replaced.** Every
size tuned against the old face had to be re-measured — the nav and the
masthead both broke on the swap. Re-measure them if the face changes again.

### Hierarchy
- **Masthead** (700, 1.5–1.875rem, uppercase): the club name. Two lines on a
  phone rather than shrunk or clipped.
- **Section heading** (600, 1.125rem): `SectionHead`, panel titles.
- **Figure** (700, 1.125–1.875rem, tabular): a record, a score, a stat tile.
- **Body** (400, 0.875rem).
- **Label** (600, 0.75rem, tracking-[0.1em], uppercase, gray-500): `card-label`,
  an instrument's channel label.
- **Fine print** (400, 0.75rem, gray-500): the caveats. Load-bearing content.

### Named Rules
**The Column Head Rule.** A label is quiet because the figure under it is the
thing being read. If a label competes with its own value, the label is wrong.

## Layout

Two widths. Everything in the masthead — header, banners, live strip, summary
strip, favorites, story rows, nav — is `max-w-7xl mx-auto px-4`. Below the nav
each tab holds one width for its whole length: the full `max-w-7xl` for the
table tabs, and that same width for Today and Standings as a two-column grid
from `lg` up; Schedule is a `max-w-2xl mx-auto` reading column.

**A reading column is centred, never merely capped.** `max-w-2xl` alone
left-aligns inside a `max-w-7xl` parent and leaves half a desktop screen empty.

**Tables drop columns by priority, they do not shrink.** Below `sm` each table
renders only the columns carrying its claim — AVG and OPS on batting, ERA and
WHIP on pitching, ±OPS in Hot & Cold — and defers the counting detail. Ranking
the columns is the design decision; keeping all seventeen and letting the reader
scroll moves that decision onto them and puts the sorted column off screen.

## Elevation & Depth

Separation is tonal (canvas → panel → panel-raised) and by grid weight. On a
dark ground a border separates where a shadow cannot, so panels are bordered
rather than floated.

Two exceptions: **modal layers** (dimmed page plus a 2px heavy rule) and the
**floating controls** (chat button, back-to-top) at `0 3px 10px rgb(0 0 0 /
0.28)`.

## Shapes

Radius is small and precise — 2px through 12px. The old world was radius 0
because a scorecard has square corners; an instrument's readouts are milled,
not sheared. `rounded-full` survives where a circle is real: avatars, the chat
control, status dots.

## Signature interaction

**The plot cursor.** The sorted column holds a persistent vertical tint band
(`col-band`), so a reader tracking one row across seventeen columns keeps their
place. It is the world's own device and a real scanning aid, not decoration.

Motion is mechanical: ~140ms, exponential ease-out from a visible resting
state, `prefers-reduced-motion` honoured. The active tab's rule drawing in from
the left is the one authored moment.

## Components

- **Masthead** — the instrument bar: panel ground with a cool wash off the
  scale's cold end, closing on a 1px red rule. Club mark on its cream disc.
- **Nav** — sticky, `bg-panel`, 2px heavy bottom rule. Active tab: `--color-mark`
  plus a 3px red rule. Below `sm` every tab takes an equal share and nothing
  scrolls.
- **Summary cell** — `bg-panel`, collapsed borders, label over figure. Owns its
  loading and failed presentations; a failed cell never becomes an error.
- **Table** — a plot panel: `card` wrapper, `bg-gray-50` header, hairline row
  dividers, sticky first column, `hover:bg-hover`, the sorted column banded.
- **Section head** — heading plus optional fine print naming what the reader can
  do. Carries the affordance for anything a row opens.
- **Header control** — bordered, 40px minimum so it clears a thumb, `gray-600`
  ink warming to `gray-900` on hover. The theme toggle and the account control
  share it; a third does not fit at 375px, so measure before adding one.
- **Freshness control** — in the footer beside the attribution, stating how old
  the data could be and refreshing it. Reads "as of", never "updated": the
  figure is an upper bound, not a measurement.
- **Modal** — `bg-panel-raised`, 2px heavy rule, dimmed backdrop.
- **Panel footnote** — fine print stating the window, the threshold, and what
  the panel does not claim.

## Do's and Don'ts

**Do** express magnitude with the scale, and hierarchy with grid weight and type.
**Do** give every panel that states a measurement its fine print.
**Do** let a failing panel hide itself; a tab never fails as a whole.
**Do** define every colour in the base token set so both themes resolve.

**Don't** write a `dark:` class. Re-point a token instead.
**Don't** put a saturated block behind content. Navy was a ground in the old
world and is a field colour here.
**Don't** use red to rank or decorate. See The State Rule.
**Don't** invent a one-off colour for a magnitude. See The Scale Rule.
**Don't** reintroduce warmth. Cream, buff and paper tone are the discarded
world, and the light theme is where they creep back first.
**Don't** put a colored border on one side of a card or row. Use grid weight.
**Don't** carry a type size across a face change without re-measuring it.
