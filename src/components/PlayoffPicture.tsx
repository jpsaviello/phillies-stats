import { AL_LEAGUE_ID, teamLogoUrl } from '../api/mlb'
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
import type { TiebreakerNote } from '../utils/tiebreakers'
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
}: {
  x: number
  y: number
  team: SeededTeam
  note?: TiebreakerNote
}) {
  const isPhillies = team.teamId === PHILLIES_ID
  return (
    <Box x={x} y={y} width={BRACKET.teamWidth} className="card flex items-center gap-1.5 px-1.5">
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
        <span className="block text-[11px] tabular-nums text-gray-500">
          {team.wins}-{team.losses}
        </span>
      </span>
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
}: {
  field: Field
  notes: Map<number, TiebreakerNote>
  side: 'left' | 'right'
  abbr: string
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

  // series[1] is the 4/5 matchup and series[0] the 3/6 — top and bottom halves.
  const [lower, upper] = field.series
  const pairs: [WildCardSeries, number, number][] = [
    [upper, rows.wildCard[0], rows.wildCard[1]],
    [lower, rows.wildCard[2], rows.wildCard[3]],
  ]

  return (
    <>
      {pairs.map(([series, topY, bottomY]) => (
        <span key={series.higher.teamId}>
          <BracketTeam x={wcX} y={topY} team={series.higher} note={notes.get(series.higher.teamId)} />
          <BracketTeam x={wcX} y={bottomY} team={series.lower} note={notes.get(series.lower.teamId)} />
          <Connector x={after(BRACKET_COLUMNS.wildCard, teamWidth)} from={topY} to={bottomY} side={side} />
        </span>
      ))}

      {field.byes.map((bye, i) => (
        <span key={bye.team.teamId}>
          <EmptySlot
            x={dsX}
            y={rows.wildCardWinner[i]}
            width={teamWidth}
            label={`${abbr} Wild Card Series winner, ${bye.awaits.join(' or ')} seed, to be decided`}
          />
          <BracketTeam x={dsX} y={rows.bye[i]} team={bye.team} note={notes.get(bye.team.teamId)} />
        </span>
      ))}

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

      {rows.championship.map((y, i) => (
        <EmptySlot
          key={y}
          x={csX}
          y={y}
          width={roundWidth}
          label={`${abbr} Division Series winner ${i + 1}, to be decided`}
        />
      ))}
      <Connector
        x={after(BRACKET_COLUMNS.championship, roundWidth)}
        from={rows.championship[0]}
        to={rows.championship[1]}
        side={side}
      />

      <EmptySlot
        x={pennantX}
        y={rows.pennant}
        width={roundWidth}
        label={`${abbr} pennant winner, to be decided`}
      />
    </>
  )
}

function BracketDiagram({ leagues }: { leagues: [League, League] }) {
  const rows = BRACKET_ROWS
  const [left, right] = leagues
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
          <LeagueHalf field={left.field!} notes={left.notes} side="left" abbr={left.abbr} />
          <LeagueHalf field={right.field!} notes={right.notes} side="right" abbr={right.abbr} />
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

  const leagues: League[] = [
    {
      name: 'National League',
      abbr: 'NL',
      loading: wildCard.loading || divisionLeaders.loading,
      field: buildPlayoffPicture(divisionLeaders.leaders, wildCard.records),
      notes: new Map([...divisionLeaders.notes, ...wildCard.notes]),
    },
    {
      name: 'American League',
      abbr: 'AL',
      loading: alWildCard.loading || alLeaders.loading,
      field: buildPlayoffPicture(alLeaders.leaders, alWildCard.records),
      notes: new Map([...alLeaders.notes, ...alWildCard.notes]),
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
        hint="Seeds if the season ended today. The three division winners hold the top seeds whatever anyone's record is; the wild cards seed 4 through 6, and the higher seed hosts every game of a Wild Card Series."
      />

      {bracket && (
        <div className="hidden xl:block">
          <BracketDiagram leagues={bracket} />
          <div className="mt-3 flex justify-between gap-4">
            <FirstOut league={bracket[0]} />
            <FirstOut league={bracket[1]} />
          </div>
        </div>
      )}

      <div className={bracket ? 'xl:hidden' : ''}>
        <div className={shown.length > 1 ? 'grid gap-6 lg:grid-cols-2' : ''}>
          {shown.map(league => (
            <div key={league.name} className="min-w-0">
              <StackedLeague league={league} />
              <div className="mt-2">
                <FirstOut league={league} />
              </div>
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
