# Design Spec: First pitch time on the Schedule tab

## Goal

Answer "what time is the game?" on the tab whose entire job is telling you when
games are.

Today every upcoming row on the Schedule tab ends in the string
`game.status.detailedState` — "Scheduled", "Pre-Game", "Warmup". For a finished
game that slot carries the score ("W 5–3"), which is the row's whole payload. For
an upcoming game it carries a word that tells the reader nothing they didn't
already know from the fact that the row exists.

Concretely, as of 2026-08-25 the Mariners game is on screen as:

```
Aug 25, Tue   TODAY   vs   [SEA logo]   Seattle Mariners           Pre-Game
```

First pitch is 9:40 PM ET. The app already has that number in memory and throws
it away.

## The data is already fetched

`fetchSchedule()` in `src/api/mlb.ts` passes **no** `fields=` parameter, so the
full schedule payload arrives. Every game carries:

```json
{
  "gameDate": "2026-08-26T01:40:00Z",
  "officialDate": "2026-08-25",
  "status": { "detailedState": "Pre-Game", "startTimeTBD": false },
  "gameNumber": 1,
  "doubleHeader": "N"
}
```

`gameDate` is a UTC instant; `dates[].date` (the grouping key the row already
renders) is MLB's Eastern *official date*. They deliberately disagree for night
games — 01:40Z on 8/26 is 9:40 PM ET on 8/25 — and that is correct, not a bug.

`MatchupPreview.tsx:151` and `HeroStrip.tsx:184` both already read `gameDate` and
format it with `toLocaleTimeString`. This feature is the Schedule tab catching up
to two components that already do it.

**No backend change, no new endpoint, no new request, no dependency, no
migration, no secret.** The only non-render change in the whole feature is adding
`startTimeTBD?: boolean` to the `Game` interface's `status` object.

## The load-bearing detail: gate on `abstractGameState`, never `detailedState`

The obvious implementation is "if the status says Scheduled, show a time." That
implementation **fails on the exact game that prompted this work**: tonight's
Mariners game reads `Pre-Game`, not `Scheduled`, because MLB flips
`detailedState` a few hours before first pitch.

Surveying the full 2026 regular season, `detailedState` takes at least these
values: `Scheduled` (441), `Final` (1973), `Postponed` (27), `Pre-Game` (9),
`Warmup` (3), `In Progress` (3), `Completed Early` (2). Enumerating that list in
a component is a standing invitation to miss a value.

`abstractGameState` collapses all of it to three: `Preview`, `Live`, `Final`.
`Preview` covers `Scheduled` **and** `Pre-Game` — every state where a scheduled
first pitch is still in the future — and the codebase already leans on this exact
distinction twice (`Schedule.tsx`'s `clickable` check and its `upcoming` pick,
both of which key on `abstractGameState !== 'Preview'` / `=== 'Preview'`).

## Display rules

The time **replaces** `detailedState` in the existing right-hand slot. No new
column, no second line, no row-height change, no layout work. It is a straight
swap of the least informative element in the row for the most requested one.

| Condition | Right-hand slot renders | Why |
|---|---|---|
| `abstractGameState === 'Final'` | `W 5–3` (unchanged) | Existing behavior, untouched |
| `status.startTimeTBD === true` | `TBD` | `gameDate` carries a placeholder time; printing it would be a lie |
| Postponed / Cancelled / Suspended | `detailedState` (unchanged) | The game is not happening at `gameDate`; see below |
| `abstractGameState === 'Live'` | `detailedState` (unchanged) | `LiveGameStrip` owns the live story; a start time is stale news |
| `abstractGameState === 'Preview'` | `7:40 PM` | The feature |

### Postponed games keep a live-looking `gameDate`

Verified against the season: a postponed game does **not** null out its start
time. It keeps the original slot and adds a sibling `rescheduleDate`:

```json
{ "gameDate": "2026-04-29T22:10:00Z",
  "rescheduleDate": "2026-04-30T21:35:00Z",
  "status": { "detailedState": "Postponed" } }
```

A naive "show the time unless it's Final" rule would print `6:10 PM` next to a
game that was rained out — worse than the "Scheduled" string this feature is
replacing, because it reads as authoritative. The Phillies have one such game
this season (2026-04-29). Postponed rows keep their status word.

`rescheduleDate` is deliberately **not** surfaced. Making the row say "→ Apr 30"
is a separate, larger feature (it needs to reconcile against the makeup game that
already appears elsewhere in the list), and this spec's scope is the start time.

### Timezone: local, with an abbreviation only when it matters

`toLocaleTimeString` renders in the *viewer's* zone. For a Philadelphia fan that
is ET and unambiguous. For a fan watching from Denver, the row header says
"Aug 25" (MLB's Eastern official date) and the time says "7:40 PM" (Mountain) —
correct, but silently mixing two frames of reference.

Getting first pitch wrong by three hours is the one failure mode this feature can
actually cause, so:

> Append a short timezone name (`7:40 PM MDT`) **only when the viewer's resolved
> IANA zone is not `America/New_York`.**

`Intl.DateTimeFormat().resolvedOptions().timeZone` gives the check for free. The
result is zero added noise for the overwhelming majority of this app's users
(a Phillies stats site), and unambiguous copy for everyone else. Twenty rows all
reading "EDT" would be visual static; one reading "MDT" is information.

*Alternative considered:* always show the abbreviation. Rejected — it is noise
for the primary audience and inconsistent with `HeroStrip`/`MatchupPreview`,
which show a bare time. *Also considered:* always render in ET regardless of
viewer. Rejected — it contradicts the two components already shipping local
time, and a fan in Denver planning their evening wants their own clock.

### Doubleheaders get disambiguated for free

The Phillies play one split doubleheader in 2026 (April 30, 16:35Z and 21:35Z).
Today those are two rows with **identical** date text, identical opponent, and
identical everything else — indistinguishable until both go Final. With first
pitch times they read `12:35 PM` and `5:35 PM`.

The API returns the two games in chronological order within `dates[].games`.
Do **not** add a sort; the existing render order is already correct, and sorting
would be new logic guarding against a problem that does not exist.

## Formatting lives in a pure util, not in the component

New `src/utils/gameTime.ts`, matching the repo's existing shape
(`utils/odds.ts`, `utils/matchup.ts`, `utils/bullpen.ts`, `utils/tiebreakers.ts`
are all pure and component-free).

This is not architectural tidiness for its own sake — it is what makes the
feature verifiable. The ±14-day schedule window is live data. On any given day
it contains no TBD game, no postponed game, and no doubleheader, so the three
interesting branches are **unreachable in a browser** on most days. As a pure
function they are all exercisable against captured JSON in seconds.

```ts
export function firstPitch(game: Game, now?: Date): string | null
```

Returns the formatted time for a `Preview` game, `'TBD'` when `startTimeTBD`,
and `null` for every case where the caller should fall back to `detailedState`.
`null` — rather than a thrown error or an empty string — keeps the component's
branch a plain `?? game.status.detailedState`.

## Accessibility

The clickable-row `aria-label` currently reads
`Box score: vs Seattle Mariners, Aug 25, Tue`. It is built only for rows that
open the box-score modal, which by definition are **not** `Preview` rows, so it
needs no change for the primary case. It stays as-is.

The time itself is plain text in the existing slot and inherits `tabular-nums`
treatment consistent with the score it replaces.

## Edge cases

| Case | Behavior |
|---|---|
| `gameDate` missing or unparseable | `firstPitch` returns `null`; row falls back to `detailedState`, exactly today's behavior |
| `startTimeTBD: true` | `TBD` |
| Postponed / Cancelled / Suspended | Status word, no time |
| In Progress / Warmup / Delayed | Status word, no time |
| Split doubleheader | Two rows, two distinct times |
| Viewer outside ET | Local time + zone abbreviation |
| Whole schedule fetch fails | Unchanged — existing `ErrorState` |

## Deliberately out of scope

- **`rescheduleDate` on postponed rows.** Separate feature, needs makeup-game reconciliation.
- **A "starts in 2h 15m" countdown.** Requires a ticking timer in a list of ~28 rows; the absolute time is what was asked for.
- **Local-vs-ET toggle.** No setting exists to hang it on, and the zone-abbreviation rule removes the ambiguity that would justify it.
- **Backfilling times into `HeroStrip`/`MatchupPreview`.** Both already show a time.
- **Fixing `Schedule.tsx`'s browser-local `today` string.** It computes `today` from the browser clock while `dates[].date` is MLB's Eastern official date, so the "TODAY" pill and the odds gating can be off by a day for a viewer west of ET late at night. Real, pre-existing, and untouched by this change — noted here so it is not mistaken for a regression introduced by the time display appearing next to it.

## Feature flag: none

`enableGameDetail`, `enableMatchupPreview`, `enableBullpenUsage` etc. gate whole
new panels that could fail and take screen real estate with them. This is a text
substitution inside a row that already renders, with a `null` fallback to exactly
today's output — the same reasoning CLAUDE.md records for shipping auth,
favorites, and the user profile unflagged. Adding an LD flag here would cost more
lines than the feature.

## Verification

Per CLAUDE.md, `webapp-testing` is required before this is considered done.

1. **Free/deterministic:** unit-exercise `firstPitch` against captured JSON for all five branches (Preview, Pre-Game, TBD, Postponed, Final) using the real season responses cited in this spec.
2. **Browser:** `npm run dev:server` + `npm run dev`, open the Schedule tab, screenshot at 1440px and 375px, confirm tonight's Mariners row reads `9:40 PM` (not "Pre-Game"), confirm past rows still read `W 5–3`, confirm no console errors.

No chat request is involved, so this costs nothing to verify.
