import { teamLogoUrl } from '../api/mlb'
import type { DivisionLeaders } from '../hooks/useDivisionLeaders'
import type { WildCardRace } from '../hooks/useWildCardRace'
import { buildPlayoffPicture, type ByeTeam, type SeededTeam, type WildCardSeries } from '../utils/playoffPicture'
import type { TiebreakerNote } from '../utils/tiebreakers'
import SectionHead from './SectionHead'

const PHILLIES_ID = 143

interface Props {
  /** Owned by Standings, shared with PlayoffPush and WildCardStandings. */
  wildCard: WildCardRace
  divisionLeaders: DivisionLeaders
}

/** One club's line inside a bracket card. */
function TeamLine({
  team,
  hosts,
  note,
}: {
  team: SeededTeam
  /** True for the higher seed in a Wild Card Series — every game is at their park. */
  hosts?: boolean
  note?: TiebreakerNote
}) {
  const isPhillies = team.teamId === PHILLIES_ID
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 sm:gap-3 ${isPhillies ? 'bg-hover' : ''}`}
    >
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

function ByeCard({ bye, notes }: { bye: ByeTeam; notes: Map<number, TiebreakerNote> }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-hairline px-3 py-1.5">
        <span className="card-label">First-round bye</span>
      </div>
      <TeamLine team={bye.team} note={notes.get(bye.team.teamId)} />
      <div className="border-t border-hairline px-3 py-1.5 text-xs text-gray-500">
        {bye.team.division}
        <span className="text-gray-400"> · </span>
        Opens the Division Series against the {bye.awaits[0]}/{bye.awaits[1]} winner
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

/**
 * The NL postseason field as the current standings would set it.
 *
 * Adds no request of its own: the wild card race is the same tiebreaker-corrected
 * ordering PlayoffPush and WildCardStandings already read, and the division
 * leaders come out of the standings response Standings has already fetched. See
 * the playoff-picture design spec.
 */
export default function PlayoffPicture({ wildCard, divisionLeaders }: Props) {
  // Secondary panel on a tab that renders without it: nothing while either half
  // is still resolving, nothing when the field is short of six clubs (the
  // offseason, opening week, a failed request). Same self-hide convention as
  // HeroStrip / MatchupPreview / WildCardStandings.
  if (wildCard.loading || divisionLeaders.loading) return null

  const picture = buildPlayoffPicture(divisionLeaders.leaders, wildCard.records)
  if (!picture) return null

  // One lookup for both halves — a club is tied within its own group, so the two
  // note maps never collide.
  const notes = new Map([...divisionLeaders.notes, ...wildCard.notes])
  // The wild card map carries notes for tied clubs BELOW the cutoff too, which
  // this panel never renders — so the footnote is keyed on the six clubs actually
  // marked, not on the map being non-empty.
  const marked = [
    ...picture.byes.map(b => b.team),
    ...picture.series.flatMap(s => [s.higher, s.lower]),
  ].some(t => notes.has(t.teamId))

  return (
    <div>
      <SectionHead
        title="NL Playoff Picture"
        hint="Seeds if the season ended today. The three division winners hold the top seeds whatever anyone's record is; the wild cards seed 4 through 6."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          {picture.byes.map(bye => (
            <ByeCard key={bye.team.teamId} bye={bye} notes={notes} />
          ))}
        </div>
        <div className="space-y-3">
          {picture.series.map(series => (
            <SeriesCard key={series.higher.teamId} series={series} notes={notes} />
          ))}
        </div>
      </div>

      {/* The boundary is the point of a picture like this — it says how close the
          field is to changing, which none of the six rows above can. */}
      {picture.firstOut && (
        <p className="mt-3 text-xs text-gray-500">
          First team out:{' '}
          <span className="font-medium text-gray-700">{picture.firstOut.name}</span>{' '}
          <span className="tabular-nums">
            {picture.firstOut.wins}-{picture.firstOut.losses}
          </span>
          {picture.firstOut.gamesBack !== '-' && (
            <>
              , <span className="tabular-nums">{picture.firstOut.gamesBack}</span> back of the
              final spot
            </>
          )}
        </p>
      )}

      {marked && (
        <p className="mt-1 text-xs text-gray-500">
          † Tied on record. Order set by MLB tiebreakers: head-to-head, then
          intradivision, then intraleague record.
        </p>
      )}
    </div>
  )
}
