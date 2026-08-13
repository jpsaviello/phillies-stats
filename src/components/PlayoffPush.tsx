import { useEffect, useState } from 'react'
import { fetchLeagueRecords, fetchRemainingSchedule } from '../api/mlb'
import type { RemainingGame, StandingsRecord, TeamRecord } from '../types/mlb'
import { PLAYOFF_SPOTS, type WildCardRace } from '../hooks/useWildCardRace'
import {
  clinchNumber,
  cutoffMargin,
  formatGames,
  formatPct,
  ordinal,
  projectedRecord,
  splitHomeAway,
  strengthOfSchedule,
} from '../utils/playoffPush'

const PHILLIES_ID = 143

interface Props extends WildCardRace {
  /** Passed down from Standings, which already has them — this adds no fetch. */
  divisionRecords: StandingsRecord[]
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 card px-4 py-3">
      <div className="card-label">{label}</div>
      {children}
    </div>
  )
}

function Stat({ children }: { children: React.ReactNode }) {
  return <div className="font-display text-2xl leading-tight text-phillies-navy">{children}</div>
}

export default function PlayoffPush({ divisionRecords, records, notes, loading }: Props) {
  const [remaining, setRemaining] = useState<RemainingGame[] | null>(null)
  const [leagueRecords, setLeagueRecords] = useState<Map<number, TeamRecord> | null>(null)

  useEffect(() => {
    // Independent and fail-soft: a strength-of-schedule failure must not take
    // the games-left figure down with it, so these don't share a Promise.all.
    fetchRemainingSchedule()
      .then(setRemaining)
      .catch(() => setRemaining(null))
    fetchLeagueRecords()
      .then(setLeagueRecords)
      .catch(() => setLeagueRecords(null))
  }, [])

  const phillies = divisionRecords.find(r => r.team.id === PHILLIES_ID)
  if (!phillies) return null

  const wildCardIndex = records.findIndex(r => r.team.id === PHILLIES_ID)
  const margin = cutoffMargin(records, wildCardIndex, PLAYOFF_SPOTS)
  // Absent from the wild card response means they LEAD the division — that
  // endpoint excludes division leaders. Not an error, and not "out of it".
  const leadsDivision = !loading && records.length > 0 && wildCardIndex === -1

  const schedule = remaining ? splitHomeAway(remaining) : null
  const sos = remaining && leagueRecords ? strengthOfSchedule(remaining, leagueRecords) : null
  const pace = schedule ? projectedRecord(phillies.wins, phillies.losses, schedule.total) : null

  const divisionElim = clinchNumber(phillies.eliminationNumber)
  const divisionMagic = clinchNumber(phillies.magicNumber)
  const wildCardElim = clinchNumber(phillies.wildCardEliminationNumber)
  const tiebreakerNote = notes.get(PHILLIES_ID)

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Playoff Push</h2>

      <div className="flex flex-col sm:flex-row gap-3">
        <Card label="NL Wild Card">
          {leadsDivision ? (
            <>
              <Stat>Leading the NL East</Stat>
              <p className="mt-1 text-xs text-gray-500">
                Division leaders don't appear in the wild card race.
              </p>
            </>
          ) : margin ? (
            <>
              <div className="flex items-baseline gap-2">
                <Stat>{ordinal(wildCardIndex + 1)}</Stat>
                <span
                  // text-xs, and darkened text on the tinted backgrounds: at
                  // 10px with green-700/phillies-red this pill sat near 3.5:1.
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                    margin.inSpot ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {margin.inSpot ? 'In' : 'Out'}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {/* A 0.0 margin is a tiebreaker, not a rounding artifact — saying
                    "0.0 back" alone reads like the app is confused. */}
                {margin.games === 0 ? (
                  <>
                    Tied with {margin.rivalName};{' '}
                    {margin.inSpot ? 'Phillies hold' : `${margin.rivalName} holds`} the tiebreaker
                  </>
                ) : margin.inSpot ? (
                  <>
                    +{formatGames(margin.games)} on {margin.rivalName}, first team out
                  </>
                ) : (
                  <>
                    {formatGames(margin.games)} back of {margin.rivalName} for the final spot
                  </>
                )}
              </p>
              {tiebreakerNote && (
                <p className="mt-0.5 text-[11px] text-gray-500">{tiebreakerNote.detail}</p>
              )}
              {/* The definition used to live only in a title attribute, so it
                  was invisible on touch and to keyboard users. */}
              {wildCardElim !== null && (
                <p className="mt-1 text-xs text-gray-500">
                  Elimination number:{' '}
                  <span className="tabular-nums font-medium">{wildCardElim}</span> — Phillies losses
                  plus wins by the final wild card team
                </p>
              )}
            </>
          ) : (
            <Stat>—</Stat>
          )}
        </Card>

        <Card label="NL East">
          <Stat>{phillies.gamesBack === '-' ? 'First' : `${phillies.gamesBack} GB`}</Stat>
          <p className="mt-1 text-xs text-gray-600">
            {ordinal(Number(phillies.divisionRank))} of {divisionRecords.length} · {phillies.wins}-
            {phillies.losses}
          </p>
          {divisionMagic !== null ? (
            <p className="mt-1 text-xs text-gray-500">
              Magic number: <span className="tabular-nums font-medium">{divisionMagic}</span> —
              Phillies wins plus second-place losses to clinch
            </p>
          ) : divisionElim !== null ? (
            <p className="mt-1 text-xs text-gray-500">
              Elimination number:{' '}
              <span className="tabular-nums font-medium">{divisionElim}</span> — Phillies losses plus
              division-leader wins
            </p>
          ) : null}
        </Card>
      </div>

      {schedule && schedule.total > 0 && (
        <div className="mt-3 card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-gray-700">
            <span className="font-display text-xl text-phillies-navy tabular-nums">
              {schedule.total}
            </span>
            <span>games left</span>
            <span className="text-gray-300">·</span>
            <span className="tabular-nums">
              {schedule.home} home / {schedule.away} away
            </span>
            {sos !== null && (
              <>
                <span className="text-gray-300">·</span>
                <span
                  className="tabular-nums"
                  title="Combined winning percentage of the clubs left on the schedule, weighted by games played against each."
                >
                  opponent win rate {formatPct(sos)}
                </span>
                <span className="text-xs text-gray-500">
                  ({sos > 0.5 ? 'tougher' : 'easier'} than average)
                </span>
              </>
            )}
          </div>
          {pace && (
            <p className="mt-1 text-xs text-gray-500">
              At the current {formatPct(pace.pct)} clip, that projects to{' '}
              <span className="tabular-nums font-medium text-gray-700">
                {pace.wins}-{pace.losses}
              </span>
              .
            </p>
          )}
        </div>
      )}
    </div>
  )
}
