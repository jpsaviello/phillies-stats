# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Philadelphia Phillies fans, split by context rather than by segment — the same
person in two situations:

- **Game day, on a phone.** Checking in before, during, or after a game: is a
  game on, who is pitching, what is the score, what happened last night. Every
  mobile decision in the codebase was tuned at 375px.
- **Season browsing, on a desktop.** Sorting and comparing season tables —
  batting, pitching, roster, standings — where wide stat tables are the main
  event.

A signed-in account is optional and additive. Signed-out visitors see every
stat; accounts add starred players, a profile, and opt-in morning emails.

## Product Purpose

Show what is happening with the Phillies right now and across the season, from
official data, without the reader having to interpret a raw API. Success is a
fan getting the answer they came for — tonight's matchup, a hitter's recent
form, the wild card margin — in one glance, on whichever device they happen to
be holding.

## Positioning

Every figure is either read straight from MLB's published response or is
arithmetic a fan could redo by hand. The product **describes rather than
predicts**, and does so deliberately in places where a prediction would be easy
and expected:

- no playoff probability (that needs simulating the rest of the league);
- no bullpen "likely unavailable" badge (availability depends on score,
  leverage, and training-staff information this app does not have);
- no "who has the edge" highlight between two probable starters;
- no "due for a hit" or projection language in recent-form panels.

A neighboring product can copy the endpoints; the restraint is the position.

## Operating Context

- Data comes from the public MLB Stats API and The Odds API, through a small
  backend proxy so no keys reach the client bundle.
- Six tabs: Today (default), Batting, Pitching, Roster, Standings, Schedule.
  The active tab and any open modal live in the URL hash, so every view is
  linkable and Back moves between views instead of leaving the site.
- Above the tab bar sit up to seven self-hiding blocks: header, LaunchDarkly
  demo banner, All-Star banner, LiveGameStrip, HeroStrip, FavoritesCard, and
  TodayInPhils. Each appears only when it has something to say.
- "Today" is an **Eastern calendar date**, not the reader's local date. Every
  date MLB returns is ET, so the app has a single `baseballDay()` definition
  and measures against it. The one deliberate exception is first-pitch time,
  which converts into the reader's own timezone and names the zone when it is
  not ET.
- Two permanent deploy targets, not a migration: a local k8s cluster and
  Vercel (production tracks the `develop` branch).
- Feature flags are LaunchDarkly, client-side, each read with a code default so
  an unreachable or blocked LD never blanks a feature.

## Capabilities and Constraints

**Capabilities.** Season batting/pitching tables with sortable columns and
player detail modals (game log, situational splits, rolling trend); roster;
division standings, NL wild card race with real 2022-CBA tiebreakers, playoff
push panel, team-vs-league rankings; schedule with pregame matchup preview and
box-score modals containing win-probability and spray charts; a live game strip
during games; recent-form panels for hitters and bullpen workload for pitchers;
betting odds; a Claude-powered chat bot; email/password accounts with starred
players, a profile, and opt-in daily emails.

**Constraints.**

- React 19 + TypeScript + Vite, Tailwind v4 (CSS-first, no `tailwind.config.js`).
- No state-management library and no data-fetching library. Each tab component
  owns its own fetch lifecycle; a request cache sits below them.
- Hand-rolled by preference: a ~90-line hash router, own auth with `node:crypto`
  scrypt, own rate limiters, own SVG charts. New dependencies are the exception,
  not the default.
- Oxlint, not ESLint.
- Panels self-hide rather than erroring, and independent fetch chains fail
  independently so one dead request costs one card rather than the page.
- Verification layers: Vitest over pure utils, hermetic Playwright smoke tests
  at desktop and 375px, and a required manual browser pass before a feature is
  considered done.

## Brand Commitments

- **Fixed:** the Phillies palette — red `#E81828`, navy `#002D72`, cream
  `#FAF7F0` — currently defined as `@theme` tokens in `src/index.css`.
- **Not fixed (evidence, not commitment):** the Barlow Condensed display face
  and the `.bg-pinstripe` navy header texture. Both are the incumbent look and
  may be replaced if a stronger direction calls for it.
- The club's own name and logo are used; the app is a fan-facing stats site,
  not an official club property.

## Evidence on Hand

- Live official data: MLB Stats API (`statsapi.mlb.com`) and The Odds API.
- `public/briefing.json` and `public/on-this-day.json`, written daily by two
  automated reporter routines and never hand-edited. Both carry a staleness
  window; past 48h the surface drops rather than showing old copy.
- Recorded API fixtures under `tests/fixtures/` covering a real game day
  (2026-09-03), which render the whole app with no backend or keys.
- Hardcoded All-Star roster in `src/data/allStars.ts`, updated manually.
- No testimonials, customer logos, benchmarks, pricing, or usage figures exist.
  Future work must not fabricate any.

## Product Principles

1. **State facts, let the reader conclude.** Where a confident verdict would
   need information the app does not have, show the measurement instead.
2. **Every number is traceable.** Read from MLB's response, or arithmetic a fan
   could redo. No fabricated precision.
3. **Degrade one card at a time.** A failed request hides its own panel; it
   never blanks a tab or the page.
4. **The URL is the state.** Views and modals are linkable, and Back moves
   within the app rather than out of it.
5. **The day and the season are different questions.** Game-day surfaces answer
   what is happening now; season surfaces answer how the year has gone. Neither
   should be made to stand in for the other.

## Accessibility & Inclusion

No formal standard has been established for this project. Existing
product-specific requirements found in the codebase and treated as binding:

- Every chart carries a text equivalent that is the actual content, not a
  caption: the win-probability turning points and hardest-hit lists are
  simultaneously the screen-reader path and the touch path, since at 375px
  there is no hover.
- Scripted scrolling honors `prefers-reduced-motion`.
- Interactive rows and controls carry visible focus states and `aria-current`
  / `aria-label` where the control is not self-describing.
- Diacritic-insensitive player search, because the roster carries Sánchez,
  Suárez, and Alvarado and an exact-match filter reads as broken.
