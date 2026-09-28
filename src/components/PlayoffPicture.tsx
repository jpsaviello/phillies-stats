import { useEffect, useState } from 'react'
import { AL_LEAGUE_ID, fetchPostseasonGames, teamLogoUrl } from '../api/mlb'
import type { Game } from '../api/mlb'
import { useDivisionLeaders, type DivisionLeaders } from '../hooks/useDivisionLeaders'
import { useWildCardRace, type WildCardRace } from '../hooks/useWildCardRace'
import {
  BRACKET,
  BRACKET_COLUMNS,
  BRACKET_ROWS,
  BRACKET_WIDTH,
  buildPlayoffPicture,
  mirrorX,
  WILD_CARDS,
  type PlayoffPicture as Field,
  type SeededTeam,
  type WildCardSeries,
} from '../utils/playoffPicture'
import {
  buildLiveLeague,
  buildWorldSeries,
  ROUNDS,
  viewStatus,
  type LiveLeague,
  type SeriesView,
} from '../utils/postseason'
import type { TiebreakerNote } from '../utils/tiebreakers'
import { formatDate } from '../utils/date'
import SectionHead from './SectionHead'

const PHILLIES_ID = 143

interface Props {
  /**
   * The NL race, owned by Standings and shared with PlayoffPush and
   * WildCardStandings — three components stating a playoff position from one
   * ordering rather than three that can drift.
   */
  wildCard: WildCardRace
  divisionLeaders: DivisionLeaders
}

interface League {
  /** "National League" — the panel's own heading for this half. */
  name: string
  /** "NL" — the prefix the round labels are built from. */
  abbr: string
  loading: boolean
  field: Field | null
  notes: Map<number, TiebreakerNote>
  /**
   * The same field with series results filled in, once MLB's postseason
   * schedule agrees with it — null during the regular season, on a failed
   * schedule request, or if the schedule pairs clubs differently from our
   * standings. See buildLiveLeague.
   */
  live: LiveLeague | null
}

/* -------------------------------------------------------------------------- */
/* Series state                                                               */
/* -------------------------------------------------------------------------- */

/** One club's standing in one live slot, as the boxes draw it. */
interface Standing {
  /** This round's wins. */
  wins: number
  /** Out of the postseason — drawn at reduced emphasis. */
  eliminated: boolean
  /** Second line of the box: the round's state in words, or the season record. */
  line: string
  /**
   * Whether a game of the series has been decided. Until one has, the box shows
   * no win count — a column of zeros before first pitch is noise, not data.
   */
  started: boolean
}

/**
 * A club's line in a slot: "Won 2–0", "Trails 0–1", "Tied 1–1".
 *
 * Before a slot's first game there is nothing to say about the series, so the
 * regular-season record stays — it is still what a reader wants to compare
 * across a matchup nobody has played yet.
 */
function standing(v: SeriesView, index: 0 | 1, team: SeededTeam): Standing {
  const wins = v.wins[index]
  const theirs = v.wins[1 - index]
  const record = `${team.wins}-${team.losses}`
  if (!v.series || wins + theirs === 0) return { wins, eliminated: false, line: record, started: false }
  const score = `${wins}–${theirs}`
  if (v.winner === index) return { wins, eliminated: false, line: `Won ${score}`, started: true }
  if (v.winner !== null) return { wins, eliminated: true, line: `Lost ${score}`, started: true }
  if (wins > theirs) return { wins, eliminated: false, line: `Leads ${score}`, started: true }
  if (wins < theirs) return { wins, eliminated: false, line: `Trails ${score}`, started: true }
  return { wins, eliminated: false, line: `Tied ${score}`, started: true }
}

/** The next unplayed game of a slot, as "Gm 2 · Wed, Sep 30". */
function nextGameText(v: SeriesView): string | null {
  const next = v.series?.next
  if (!next) return null
  const date = next.officialDate ?? next.gameDate.slice(0, 10)
  return `Gm ${next.seriesGameNumber ?? '?'} · ${formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}`
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The club's mark — how a bracket is read at a glance, before any name is.
 *
 * Hidden rather than broken when the image can't be fetched: every box is laid
 * out to read correctly without it, which is not hypothetical, since the
 * development sandbox blocks mlbstatic.com outright.
 */
function Logo({ teamId, size }: { teamId: number; size: string }) {
  return (
    <img
      src={teamLogoUrl(teamId)}
      alt=""
      className={`${size} shrink-0`}
      onError={e => {
        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
      }}
    />
  )
}

function SeedChip({ seed, size }: { seed: number; size: string }) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-xs border border-rule font-display text-[11px] font-semibold tabular-nums text-gray-600`}
    >
      <span className="sr-only">Seed </span>
      {seed}
    </span>
  )
}

function Marks({ team, note }: { team: SeededTeam; note?: TiebreakerNote }) {
  return (
    <>
      {team.clinch && (
        <span
          className="shrink-0 text-[11px] font-normal uppercase text-green-700"
          title="Clinched"
          aria-label="Clinched"
        >
          {team.clinch}
        </span>
      )}
      {note && (
        <span
          className="shrink-0 text-[11px] font-normal text-gray-500"
          title={note.detail}
          aria-label={note.detail}
        >
          †
        </span>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* The bracket (xl and up)                                                    */
/* -------------------------------------------------------------------------- */

/** One box, placed by its CENTRE line — every row in the geometry is a centre. */
function Box({
  x,
  y,
  width,
  children,
  className = '',
}: {
  x: number
  y: number
  width: number
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`absolute ${className}`}
      style={{ left: x, top: y - BRACKET.boxHeight / 2, width, height: BRACKET.boxHeight }}
    >
      {children}
    </div>
  )
}

function BracketTeam({
  x,
  y,
  team,
  note,
  live,
}: {
  x: number
  y: number
  team: SeededTeam
  note?: TiebreakerNote
  /** This round's state, once the postseason is under way. */
  live?: Standing
}) {
  const isPhillies = team.teamId === PHILLIES_ID
  return (
    <Box
      x={x}
      y={y}
      width={BRACKET.teamWidth}
      className={`card flex items-center gap-1.5 px-1.5 ${live?.eliminated ? 'opacity-60' : ''}`}
    >
      <SeedChip seed={team.seed} size="h-5 w-5" />
      <Logo teamId={team.teamId} size="h-5 w-5" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1">
          {isPhillies && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-phillies-red" />
          )}
          <span className={`truncate text-[13px] ${isPhillies ? 'font-semibold' : ''} text-gray-900`}>
            {team.name}
          </span>
          <Marks team={team} note={note} />
        </span>
        <span className="block truncate text-[11px] tabular-nums text-gray-500">
          {live ? live.line : `${team.wins}-${team.losses}`}
        </span>
      </span>
      {live?.started && (
        <span className="shrink-0 font-display text-lg font-bold tabular-nums text-mark" aria-label={`${live.wins} wins`}>
          {live.wins}
        </span>
      )}
    </Box>
  )
}

/**
 * A club in the two narrow columns (Championship Series and pennant), which
 * are 108px — room for the mark, the name and the round's wins, not the seed
 * chip or a second line. The seed is on the club's earlier box in the same row.
 */
function CompactTeam({
  x,
  y,
  team,
  live,
}: {
  x: number
  y: number
  team: SeededTeam
  live: Standing
}) {
  const isPhillies = team.teamId === PHILLIES_ID
  return (
    <Box
      x={x}
      y={y}
      width={BRACKET.roundWidth}
      className={`card flex items-center gap-1.5 px-1.5 ${live.eliminated ? 'opacity-60' : ''}`}
    >
      <Logo teamId={team.teamId} size="h-4 w-4" />
      <span
        className={`min-w-0 flex-1 truncate text-[12px] leading-tight ${isPhillies ? 'font-semibold' : ''} text-gray-900`}
        title={live.line}
      >
        {team.name}
        <span className="sr-only">, {live.line}</span>
      </span>
      {live.started && (
        <span className="shrink-0 font-display text-base font-bold tabular-nums text-mark" aria-hidden>
          {live.wins}
        </span>
      )}
    </Box>
  )
}

/**
 * A round nobody has played yet.
 *
 * Blank on purpose: an empty box is what makes this a bracket rather than a
 * list, and it is the honest rendering of a round the standings cannot decide.
 * The label is carried for screen readers, which get nothing from a dashed box.
 */
function EmptySlot({ x, y, width, label }: { x: number; y: number; width: number; label: string }) {
  return (
    <Box x={x} y={y} width={width} className="rounded-sm border border-dashed border-rule">
      <span className="sr-only">{label}</span>
    </Box>
  )
}

/**
 * One matchup's bracket line: two arms closing on a vertical bar, then a stub
 * carrying the winner into the next round's box.
 */
function Connector({
  x,
  from,
  to,
  side,
}: {
  x: number
  from: number
  to: number
  side: 'left' | 'right'
}) {
  const { barWidth, stubWidth } = BRACKET
  const flowsRight = side === 'left'
  return (
    <>
      <div
        aria-hidden
        className={`absolute border-y border-rule ${flowsRight ? 'border-r' : 'border-l'}`}
        style={{
          left: flowsRight ? x : x + stubWidth,
          top: from,
          width: barWidth,
          height: to - from,
        }}
      />
      <div
        aria-hidden
        className="absolute border-t border-rule"
        style={{ left: flowsRight ? x + barWidth : x, top: (from + to) / 2, width: stubWidth }}
      />
    </>
  )
}

/**
 * The round names, drawn in their own strip ABOVE the boxes.
 *
 * Deliberately not inside LeagueHalf: that renders into a container offset down
 * by labelHeight, so a label positioned at its top:0 lands on the first box of
 * the Wild Card column rather than above it — which is exactly what happened.
 */
function RoundLabels({ side, abbr }: { side: 'left' | 'right'; abbr: string }) {
  const { teamWidth, roundWidth } = BRACKET
  const place = (x: number, width: number) => (side === 'left' ? x : mirrorX(x, width))
  const columns: [number, number, string][] = [
    [place(BRACKET_COLUMNS.wildCard, teamWidth), teamWidth, `${abbr} Wild Card`],
    [place(BRACKET_COLUMNS.divisionSeries, teamWidth), teamWidth, `${abbr}DS`],
    [place(BRACKET_COLUMNS.championship, roundWidth), roundWidth, `${abbr}CS`],
    [place(BRACKET_COLUMNS.pennant, roundWidth), roundWidth, `${abbr} Pennant`],
  ]
  return (
    <>
      {columns.map(([x, width, label]) => (
        <div key={label} className="absolute top-0 text-center" style={{ left: x, width }}>
          <span className="card-label">{label}</span>
        </div>
      ))}
    </>
  )
}

/**
 * One league's half of the bracket, drawn from the outside in.
 *
 * `side` is the only difference between the two halves: it mirrors every x
 * through the centre line and turns the connectors around.
 */
function LeagueHalf({
  field,
  notes,
  side,
  abbr,
  live,
  pennant,
}: {
  field: Field
  notes: Map<number, TiebreakerNote>
  side: 'left' | 'right'
  abbr: string
  live: LiveLeague | null
  /** This league's champion's standing in the World Series, once there is one. */
  pennant: Standing | null
}) {
  const rows = BRACKET_ROWS
  const { teamWidth, roundWidth, connectorWidth } = BRACKET
  const place = (x: number, width: number) => (side === 'left' ? x : mirrorX(x, width))
  const after = (x: number, width: number) =>
    side === 'left' ? x + width : mirrorX(x, width) - connectorWidth

  const wcX = place(BRACKET_COLUMNS.wildCard, teamWidth)
  const dsX = place(BRACKET_COLUMNS.divisionSeries, teamWidth)
  const csX = place(BRACKET_COLUMNS.championship, roundWidth)
  const pennantX = place(BRACKET_COLUMNS.pennant, roundWidth)

  // series[1] is the 4/5 matchup and series[0] the 3/6 — top and bottom halves,
  // which is also the order LiveLeague.wildCard is built in.
  const [lower, upper] = field.series
  const pairs: [WildCardSeries, number, number, SeriesView | null][] = [
    [upper, rows.wildCard[0], rows.wildCard[1], live?.wildCard[0] ?? null],
    [lower, rows.wildCard[2], rows.wildCard[3], live?.wildCard[1] ?? null],
  ]

  return (
    <>
      {pairs.map(([series, topY, bottomY, slot]) => (
        <span key={series.higher.teamId}>
          <BracketTeam
            x={wcX}
            y={topY}
            team={series.higher}
            note={notes.get(series.higher.teamId)}
            live={slot ? standing(slot, 0, series.higher) : undefined}
          />
          <BracketTeam
            x={wcX}
            y={bottomY}
            team={series.lower}
            note={notes.get(series.lower.teamId)}
            live={slot ? standing(slot, 1, series.lower) : undefined}
          />
          <Connector x={after(BRACKET_COLUMNS.wildCard, teamWidth)} from={topY} to={bottomY} side={side} />
        </span>
      ))}

      {field.byes.map((bye, i) => {
        const division = live?.division[i] ?? null
        // The Wild Card winner's box fills in the moment its series is decided;
        // until then it is the same dashed slot the projection draws.
        const challenger = division?.entrants[1] ?? null
        return (
          <span key={bye.team.teamId}>
            {division && challenger ? (
              <BracketTeam
                x={dsX}
                y={rows.wildCardWinner[i]}
                team={challenger}
                note={notes.get(challenger.teamId)}
                live={standing(division, 1, challenger)}
              />
            ) : (
              <EmptySlot
                x={dsX}
                y={rows.wildCardWinner[i]}
                width={teamWidth}
                label={`${abbr} Wild Card Series winner, ${bye.awaits.join(' or ')} seed, to be decided`}
              />
            )}
            <BracketTeam
              x={dsX}
              y={rows.bye[i]}
              team={bye.team}
              note={notes.get(bye.team.teamId)}
              live={division ? standing(division, 0, bye.team) : undefined}
            />
          </span>
        )
      })}

      {/* The bye club and the Wild Card winner meet in the Division Series, so
          each connector spans one of each rather than two of a kind. */}
      <Connector
        x={after(BRACKET_COLUMNS.divisionSeries, teamWidth)}
        from={rows.wildCardWinner[0]}
        to={rows.bye[0]}
        side={side}
      />
      <Connector
        x={after(BRACKET_COLUMNS.divisionSeries, teamWidth)}
        from={rows.bye[1]}
        to={rows.wildCardWinner[1]}
        side={side}
      />

      {rows.championship.map((y, i) => {
        const cs = live?.championship ?? null
        const team = cs?.entrants[i] ?? null
        return cs && team ? (
          <CompactTeam key={y} x={csX} y={y} team={team} live={standing(cs, i as 0 | 1, team)} />
        ) : (
          <EmptySlot
            key={y}
            x={csX}
            y={y}
            width={roundWidth}
            label={`${abbr} Division Series winner ${i + 1}, to be decided`}
          />
        )
      })}
      <Connector
        x={after(BRACKET_COLUMNS.championship, roundWidth)}
        from={rows.championship[0]}
        to={rows.championship[1]}
        side={side}
      />

      {live?.champion && pennant ? (
        <CompactTeam x={pennantX} y={rows.pennant} team={live.champion} live={pennant} />
      ) : (
        <EmptySlot
          x={pennantX}
          y={rows.pennant}
          width={roundWidth}
          label={`${abbr} pennant winner, to be decided`}
        />
      )}
    </>
  )
}

function BracketDiagram({ leagues, worldSeries }: { leagues: [League, League]; worldSeries: SeriesView | null }) {
  const rows = BRACKET_ROWS
  const [left, right] = leagues
  // World Series entrants are [NL, AL]; the pennant box on each side shows its
  // own league's champion's World Series wins.
  const pennantFor = (league: League): Standing | null => {
    const champ = league.live?.champion
    if (!worldSeries || !champ) return null
    const i = worldSeries.entrants[0]?.teamId === champ.teamId ? 0 : 1
    return standing(worldSeries, i, champ)
  }
  const wsStatus = worldSeries ? viewStatus(worldSeries) ?? nextGameText(worldSeries) : null
  return (
    <div className="overflow-hidden">
      <div
        className="relative mx-auto"
        style={{ width: BRACKET_WIDTH, height: BRACKET.labelHeight + rows.height }}
      >
        <RoundLabels side="left" abbr={left.abbr} />
        <RoundLabels side="right" abbr={right.abbr} />
        <div
          className="absolute left-0 right-0"
          style={{ top: BRACKET.labelHeight, height: rows.height }}
        >
          {/* The two leagues meet here, so the channel between them is drawn. */}
          <div
            aria-hidden
            className="absolute border-l border-dashed border-hairline"
            style={{ left: BRACKET_WIDTH / 2, top: 0, height: rows.height }}
          />
          <LeagueHalf
            field={left.field!}
            notes={left.notes}
            side="left"
            abbr={left.abbr}
            live={left.live}
            pennant={pennantFor(left)}
          />
          <LeagueHalf
            field={right.field!}
            notes={right.notes}
            side="right"
            abbr={right.abbr}
            live={right.live}
            pennant={pennantFor(right)}
          />
          {/* No connector into this one: the two pennant boxes face each other
              across the gutter, which is the World Series. */}
          <div
            className="absolute flex flex-col items-center justify-center bg-stock text-center leading-tight"
            style={{
              left: BRACKET_COLUMNS.pennant + BRACKET.roundWidth,
              top: rows.pennant - BRACKET.boxHeight / 2,
              width: BRACKET.gutterWidth,
              height: BRACKET.boxHeight,
            }}
          >
            {/* The destination of the whole diagram, so it carries the heading
                voice rather than the quieter channel-label grey. */}
            <span className="font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-mark">
              World
            </span>
            <span className="font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-mark">
              Series
            </span>
          </div>
          {/* Below the label rather than inside its 44px box, so the label
              stays on the pennant centre line the two pennant boxes face. */}
          {wsStatus && (
            <div
              className="absolute text-center text-[11px] leading-tight tabular-nums text-gray-600"
              style={{
                left: BRACKET_COLUMNS.pennant + BRACKET.roundWidth,
                top: rows.pennant + BRACKET.boxHeight / 2 + 4,
                width: BRACKET.gutterWidth,
              }}
            >
              {wsStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* The stacked layout (below xl)                                              */
/* -------------------------------------------------------------------------- */

function TeamLine({
  team,
  detail,
  hosts,
  note,
}: {
  team: SeededTeam
  /** Right-hand context before the record — the division a bye winner won. */
  detail?: string | null
  /** True for the higher seed in a Wild Card Series — every game is at their park. */
  hosts?: boolean
  note?: TiebreakerNote
}) {
  const isPhillies = team.teamId === PHILLIES_ID
  return (
    <div className={`flex items-center gap-2 px-3 py-2 sm:gap-3 ${isPhillies ? 'bg-hover' : ''}`}>
      <SeedChip seed={team.seed} size="h-6 w-6" />
      <Logo teamId={team.teamId} size="h-5 w-5" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {isPhillies && (
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-phillies-red" />
        )}
        <span className={`truncate ${isPhillies ? 'font-semibold' : ''} text-gray-900`}>
          {team.name}
        </span>
        <Marks team={team} note={note} />
      </span>
      {/* Both of these are secondary to the seed and the record, so they are the
          first things dropped when the row runs out of width on a phone. */}
      {detail && <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">{detail}</span>}
      {hosts && (
        <span className="hidden shrink-0 rounded-xs bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600 sm:inline">
          Hosts
        </span>
      )}
      <span className="shrink-0 text-sm tabular-nums text-gray-600">
        {team.wins}-{team.losses}
      </span>
    </div>
  )
}

function StackedLeague({ league }: { league: League }) {
  const field = league.field!
  const { notes } = league
  return (
    <section className="min-w-0">
      <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-mark">
        {league.name}
      </h3>
      <div className="space-y-3">
        <div className="card overflow-hidden">
          <div className="border-b border-hairline px-3 py-1.5">
            <span className="card-label">First-round byes</span>
          </div>
          {field.byes.map((bye, i) => (
            <div key={bye.team.teamId} className={i > 0 ? 'border-t border-hairline' : ''}>
              <TeamLine team={bye.team} detail={bye.team.division} note={notes.get(bye.team.teamId)} />
            </div>
          ))}
          {/* Read off the model rather than hardcoded, so the pairing and this
              sentence can never disagree: there is no reseeding after the Wild
              Card round, which is why a bye knows who it is waiting on. */}
          <div className="border-t border-hairline px-3 py-1.5 text-xs text-gray-500">
            Straight to the Division Series ·{' '}
            {field.byes
              .map(bye => `${bye.team.seed} meets the ${bye.awaits.join('/')} winner`)
              .join(', ')}
          </div>
        </div>

        {field.series.map(series => (
          <div key={series.higher.teamId} className="card overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-hairline px-3 py-1.5">
              <span className="card-label">Wild Card Series</span>
              <span className="text-xs text-gray-500">Best of 3 · higher seed hosts</span>
            </div>
            <TeamLine team={series.higher} hosts note={notes.get(series.higher.teamId)} />
            <div className="border-t border-hairline" />
            <TeamLine team={series.lower} note={notes.get(series.lower.teamId)} />
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * One club's line in a live series card: seed, mark, name, the round's state in
 * words and its wins — or, for a slot whose feeding series isn't decided, what
 * it is waiting on.
 */
function LiveTeamLine({
  slot,
  index,
  pending,
}: {
  slot: SeriesView
  index: 0 | 1
  /** Shown in place of a club that hasn't been decided: "Winner of 4/5". */
  pending: string
}) {
  const team = slot.entrants[index]
  if (!team) {
    return <div className="px-3 py-2 text-sm italic text-gray-500">{pending}</div>
  }
  const isPhillies = team.teamId === PHILLIES_ID
  const st = standing(slot, index, team)
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 sm:gap-3 ${isPhillies ? 'bg-hover' : ''} ${st.eliminated ? 'opacity-60' : ''}`}
    >
      <SeedChip seed={team.seed} size="h-6 w-6" />
      <Logo teamId={team.teamId} size="h-5 w-5" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {isPhillies && (
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-phillies-red" />
        )}
        <span className={`truncate ${isPhillies ? 'font-semibold' : ''} text-gray-900`}>{team.name}</span>
      </span>
      <span className="shrink-0 text-xs tabular-nums text-gray-500">{st.line}</span>
      <span className="w-5 shrink-0 text-right font-display text-lg font-bold tabular-nums text-mark">
        {st.started ? st.wins : ''}
      </span>
    </div>
  )
}

function LiveSeriesCard({
  title,
  slot,
  pending,
}: {
  title: string
  slot: SeriesView
  pending: [string, string]
}) {
  const bestOf = slot.series?.bestOf ?? ROUNDS[slot.round].bestOf
  // The series score in words once it has one, otherwise when it resumes.
  const footer = slot.winner !== null ? viewStatus(slot) : nextGameText(slot) ?? viewStatus(slot)
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-hairline px-3 py-1.5">
        <span className="card-label">{title}</span>
        <span className="text-xs text-gray-500">Best of {bestOf}</span>
      </div>
      <LiveTeamLine slot={slot} index={0} pending={pending[0]} />
      <div className="border-t border-hairline" />
      <LiveTeamLine slot={slot} index={1} pending={pending[1]} />
      {footer && (
        <div className="border-t border-hairline px-3 py-1.5 text-xs tabular-nums text-gray-500">{footer}</div>
      )}
    </div>
  )
}

const hasEntrant = (v: SeriesView) => v.entrants.some(t => t !== null)

/**
 * A live league as stacked cards, the most advanced round first: in October the
 * question is "where does it stand now", and on a phone the Wild Card Series
 * cards would otherwise push the current round below the fold for the rest of
 * the month. A round appears once it has at least one known club.
 */
function StackedLiveLeague({ league }: { league: League }) {
  const live = league.live!
  const field = league.field!
  const { abbr } = league
  const awaits = (i: number) => `Winner of ${field.byes[i].awaits.join('/')}`
  const cards: { key: string; title: string; slot: SeriesView; pending: [string, string] }[] = []
  if (hasEntrant(live.championship)) {
    cards.push({
      key: 'cs',
      title: `${abbr} Championship Series`,
      slot: live.championship,
      pending: [`${abbr}DS winner`, `${abbr}DS winner`],
    })
  }
  live.division.forEach((slot, i) =>
    cards.push({ key: `ds${i}`, title: `${abbr} Division Series`, slot, pending: ['', awaits(i)] })
  )
  live.wildCard.forEach((slot, i) =>
    cards.push({ key: `wc${i}`, title: `${abbr} Wild Card Series`, slot, pending: ['', ''] })
  )
  return (
    <section className="min-w-0">
      <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-mark">
        {league.name}
      </h3>
      <div className="space-y-3">
        {cards.map(c => (
          <LiveSeriesCard key={c.key} title={c.title} slot={c.slot} pending={c.pending} />
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/** The best club currently outside a league's field — the boundary line. */
function FirstOut({ league }: { league: League }) {
  const out = league.field?.firstOut
  if (!out) return null
  return (
    <p className="text-xs text-gray-500">
      <span className="text-gray-400">{league.abbr}</span> first team out:{' '}
      <span className="font-medium text-gray-700">{out.name}</span>{' '}
      <span className="tabular-nums">
        {out.wins}-{out.losses}
      </span>
      {out.gamesBack !== '-' && (
        <>
          , <span className="tabular-nums">{out.gamesBack}</span> back
        </>
      )}
    </p>
  )
}

/**
 * Both leagues' postseason fields as the current standings would set them.
 *
 * The NL half adds no request: it reads the same tiebreaker-corrected race
 * PlayoffPush and WildCardStandings already have, and its division leaders come
 * out of the standings response Standings has already fetched. The AL half is
 * two requests the app has no other reason to make, and they are made here — the
 * same arrangement as LeagueRankings, which also owns data nothing else wants.
 *
 * See the playoff-picture design spec.
 */
export default function PlayoffPicture({ wildCard, divisionLeaders }: Props) {
  // The bracket needs the three clubs in plus the first out, so ties below rank
  // 4 are nobody's business here — see WildCardRaceOptions.tiebreakWindow.
  const alWildCard = useWildCardRace({ leagueId: AL_LEAGUE_ID, tiebreakWindow: WILD_CARDS + 1 })
  const alLeaders = useDivisionLeaders(AL_LEAGUE_ID)

  // The whole postseason schedule, both leagues. Waited on before first paint
  // like the tiebreakers are: drawing the projection and then swapping in the
  // live bracket a moment later would visibly rebuild the panel. A failure
  // is an empty list, which leaves every league in projection mode.
  const [postseason, setPostseason] = useState<Game[]>([])
  const [postseasonLoading, setPostseasonLoading] = useState(true)
  useEffect(() => {
    let current = true
    fetchPostseasonGames()
      .then(games => { if (current) setPostseason(games) })
      .catch(() => { if (current) setPostseason([]) })
      .finally(() => { if (current) setPostseasonLoading(false) })
    return () => { current = false }
  }, [])

  const nlField = buildPlayoffPicture(divisionLeaders.leaders, wildCard.records)
  const alField = buildPlayoffPicture(alLeaders.leaders, alWildCard.records)

  const leagues: League[] = [
    {
      name: 'National League',
      abbr: 'NL',
      loading: wildCard.loading || divisionLeaders.loading || postseasonLoading,
      field: nlField,
      notes: new Map([...divisionLeaders.notes, ...wildCard.notes]),
      live: buildLiveLeague(nlField, postseason),
    },
    {
      name: 'American League',
      abbr: 'AL',
      loading: alWildCard.loading || alLeaders.loading || postseasonLoading,
      field: alField,
      notes: new Map([...alLeaders.notes, ...alWildCard.notes]),
      live: buildLiveLeague(alField, postseason),
    },
  ]

  // Each league resolves and fails on its own: one league's dead request leaves
  // the other's bracket standing, the same independence LeagueRankings' two
  // cards and PlayoffPush's two fetches already have. Nothing renders while a
  // league is still loading, and nothing renders for a field short of six clubs
  // — the offseason, opening week, a failed request, or any future format that
  // isn't a six-team bracket.
  const shown = leagues.filter(l => !l.loading && l.field !== null)
  if (!shown.length) return null

  const isLive = shown.some(l => l.live !== null)
  const [nl, al] = leagues
  // Only once BOTH leagues are live: the World Series needs a pennant from each.
  const worldSeries = nl.live && al.live ? buildWorldSeries(nl.live, al.live, postseason) : null

  const marked = shown.some(l =>
    [...l.field!.byes.map(b => b.team), ...l.field!.series.flatMap(s => [s.higher, s.lower])].some(
      t => l.notes.has(t.teamId)
    )
  )
  // The bracket is a mirrored diagram: it needs two leagues to mirror, and it
  // needs a viewport wide enough to draw 1,164px of fixed geometry. Below that,
  // or with only one field resolved, the stacked cards say the same thing.
  const bracket = shown.length === 2 ? (shown as [League, League]) : null

  return (
    // A labelled region rather than a bare div: this is a large, self-contained
    // block on a tab full of them, and it is the one a reader navigating by
    // landmark would want to jump to.
    <section aria-label="Playoff Picture">
      <SectionHead
        title="Playoff Picture"
        hint={
          isLive
            ? 'The postseason as it stands. Seeds are from the final standings and series wins sit at the right of each club. There is no reseeding: the 1 seed meets the 4/5 winner and the 2 seed the 3/6 winner.'
            : "Seeds if the season ended today. The three division winners hold the top seeds whatever anyone's record is; the wild cards seed 4 through 6, and the higher seed hosts every game of a Wild Card Series."
        }
      />

      {bracket && (
        <div className="hidden xl:block">
          <BracketDiagram leagues={bracket} worldSeries={worldSeries} />
          {/* The race for the last spot is over once the postseason starts. */}
          {!isLive && (
            <div className="mt-3 flex justify-between gap-4">
              <FirstOut league={bracket[0]} />
              <FirstOut league={bracket[1]} />
            </div>
          )}
        </div>
      )}

      <div className={bracket ? 'xl:hidden' : ''}>
        {worldSeries && hasEntrant(worldSeries) && (
          // First, above both leagues: once it has a club in it, it is the
          // most advanced round there is.
          <div className="mb-6">
            <LiveSeriesCard
              title="World Series"
              slot={worldSeries}
              pending={['NL champion', 'AL champion']}
            />
          </div>
        )}
        <div className={shown.length > 1 ? 'grid gap-6 lg:grid-cols-2' : ''}>
          {shown.map(league => (
            <div key={league.name} className="min-w-0">
              {league.live ? <StackedLiveLeague league={league} /> : <StackedLeague league={league} />}
              {!league.live && (
                <div className="mt-2">
                  <FirstOut league={league} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {marked && (
        <p className="mt-3 text-xs text-gray-500">
          † Tied on record. Order set by MLB tiebreakers: head-to-head, then
          intradivision, then intraleague record.
        </p>
      )}
    </section>
  )
}
