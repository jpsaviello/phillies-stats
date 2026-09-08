import { AL_LEAGUE_ID, teamLogoUrl } from '../api/mlb'
import { useDivisionLeaders, type DivisionLeaders } from '../hooks/useDivisionLeaders'
import { useWildCardRace, type WildCardRace } from '../hooks/useWildCardRace'
import {
  buildPlayoffPicture,
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

/** One club's line inside a bracket card. */
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
      {/* The seed is the one figure that orders this whole panel, so it is set
          in the display face and boxed rather than left inline in the name. */}
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-xs border border-rule font-display text-xs font-semibold tabular-nums text-gray-600">
        <span className="sr-only">Seed </span>
        {team.seed}
      </span>
      {/* Same onError hide teamLogoUrl's other call sites take: a blocked or
          missing logo must leave the row readable, not leave a broken icon. */}
      <img
        src={teamLogoUrl(team.teamId)}
        alt=""
        className="h-5 w-5 shrink-0"
        onError={e => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {isPhillies && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-phillies-red" />}
        <span className={`truncate ${isPhillies ? 'font-semibold' : ''} text-gray-900`}>{team.name}</span>
        {team.clinch && (
          <span className="text-xs font-normal uppercase text-green-700" title="Clinched" aria-label="Clinched">
            {team.clinch}
          </span>
        )}
        {note && (
          <span className="text-xs font-normal text-gray-500" title={note.detail} aria-label={note.detail}>
            †
          </span>
        )}
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

function ByesCard({ field, notes }: { field: Field; notes: Map<number, TiebreakerNote> }) {
  return (
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
          sentence can never disagree: there is no reseeding after the Wild Card
          round, which is the whole reason a bye knows who it is waiting on. */}
      <div className="border-t border-hairline px-3 py-1.5 text-xs text-gray-500">
        Straight to the Division Series ·{' '}
        {field.byes
          .map(bye => `${bye.team.seed} meets the ${bye.awaits.join('/')} winner`)
          .join(', ')}
      </div>
    </div>
  )
}

function SeriesCard({ series, notes }: { series: WildCardSeries; notes: Map<number, TiebreakerNote> }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-hairline px-3 py-1.5">
        <span className="card-label">Wild Card Series</span>
        {/* Where it is played is a fact about the format, not a prediction: all
            three games are at the higher seed's park. Said here rather than only
            in the HOSTS tag, which the row drops below `sm`. */}
        <span className="text-xs text-gray-500">Best of 3 · higher seed hosts</span>
      </div>
      <TeamLine team={series.higher} hosts note={notes.get(series.higher.teamId)} />
      <div className="border-t border-hairline" />
      <TeamLine team={series.lower} note={notes.get(series.lower.teamId)} />
    </div>
  )
}

/** One league's half of the bracket. */
function LeagueBracket({
  name,
  field,
  notes,
}: {
  name: string
  field: Field
  notes: Map<number, TiebreakerNote>
}) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-mark">
        {name}
      </h3>
      <div className="space-y-3">
        <ByesCard field={field} notes={notes} />
        {field.series.map(series => (
          <SeriesCard key={series.higher.teamId} series={series} notes={notes} />
        ))}
      </div>
      {/* The boundary is half the point of a picture like this — it says how
          close the field is to changing, which none of the six rows can. */}
      {field.firstOut && (
        <p className="mt-2 text-xs text-gray-500">
          First team out:{' '}
          <span className="font-medium text-gray-700">{field.firstOut.name}</span>{' '}
          <span className="tabular-nums">
            {field.firstOut.wins}-{field.firstOut.losses}
          </span>
          {field.firstOut.gamesBack !== '-' && (
            <>
              , <span className="tabular-nums">{field.firstOut.gamesBack}</span> back of the final
              spot
            </>
          )}
        </p>
      )}
    </section>
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

  const leagues = [
    {
      name: 'National League',
      loading: wildCard.loading || divisionLeaders.loading,
      field: buildPlayoffPicture(divisionLeaders.leaders, wildCard.records),
      notes: new Map([...divisionLeaders.notes, ...wildCard.notes]),
    },
    {
      name: 'American League',
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

  return (
    <div>
      <SectionHead
        title="Playoff Picture"
        hint="Seeds if the season ended today. The three division winners hold the top seeds whatever anyone's record is; the wild cards seed 4 through 6."
      />

      {/* Two leagues side by side from `lg`, stacked below it. Each league is one
          column of three cards rather than byes-beside-series, so both fit in
          about the height one league used to take. */}
      <div className={shown.length > 1 ? 'grid gap-6 lg:grid-cols-2' : ''}>
        {shown.map(league => (
          <LeagueBracket key={league.name} name={league.name} field={league.field!} notes={league.notes} />
        ))}
      </div>

      {marked && (
        <p className="mt-3 text-xs text-gray-500">
          † Tied on record. Order set by MLB tiebreakers: head-to-head, then
          intradivision, then intraleague record.
        </p>
      )}
    </div>
  )
}
