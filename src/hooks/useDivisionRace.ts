import { useCallback, useEffect, useState } from 'react'
import { fetchSeasonResults, fetchStandings, NL_LEAGUE_ID } from '../api/mlb'
import type { SeasonGameResult, StandingsRecord } from '../types/mlb'
import { applyTiebreakers, teamsNeedingTiebreak, type TiebreakerNote } from '../utils/tiebreakers'

export interface DivisionRace {
  /** In true standings order — ties broken by the real MLB chain, not by team id. */
  records: StandingsRecord[]
  notes: Map<number, TiebreakerNote>
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * The NL East standings, ordered the way the division actually stands.
 *
 * Deliberately shaped like useWildCardRace and useDivisionLeaders, and for the
 * same reason all three exist: MLB's Stats API does not apply tiebreakers.
 * `divisionRank` orders clubs on equal winning percentage by ascending team id,
 * so two clubs tied at 84-64 print in id order and the table quietly disagrees
 * with the division. This table carried that flaw from the day it shipped; it was
 * left alone while the wild card table was fixed because it draws no playoff
 * cutoff line, which made the same defect much quieter rather than absent.
 *
 * Ties are resolved BEFORE first paint, as they are for the wild card race: the
 * alternative is painting MLB's order and then visibly rearranging the table in
 * front of the reader.
 *
 * Unlike its two siblings this one carries error/reload as well as loading. They
 * are secondary self-hiding panels on someone else's tab; the division table is
 * the Standings tab's primary content and owns that tab's error state and its
 * "Try again" button.
 */
export function useDivisionRace(): DivisionRace {
  const [records, setRecords] = useState<StandingsRecord[]>([])
  const [notes, setNotes] = useState<Map<number, TiebreakerNote>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)

    async function load() {
      const standings = await fetchStandings()
      // Every row fetched is a row rendered, so the whole table is the window:
      // a tie for fourth prints in team-id order just as visibly as one for first.
      // The head-to-head round trips fire only when clubs are actually tied, so
      // the usual case costs nothing.
      const ids = teamsNeedingTiebreak(standings, standings.length)
      if (!ids.length) return { ordered: standings, notes: new Map<number, TiebreakerNote>() }

      const settled = await Promise.allSettled(ids.map(fetchSeasonResults))
      const results = new Map<number, SeasonGameResult[]>()
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') results.set(ids[i], s.value)
      })
      // Partial data would order a tie against an incomplete head-to-head
      // picture, which is worse than not reordering at all.
      if (results.size < ids.length) return { ordered: standings, notes: new Map<number, TiebreakerNote>() }

      return applyTiebreakers(standings, results, NL_LEAGUE_ID)
    }

    load()
      .then(({ ordered, notes }) => {
        setRecords(ordered)
        setNotes(notes)
      })
      .catch(e => {
        // Only fetchStandings can reach here — the tiebreaker leg degrades to the
        // API's order on its own rather than failing the table.
        console.error('Failed to load standings', e)
        setError("Couldn't load the standings right now.")
      })
      .finally(() => setLoading(false))
  }, [reloadKey])

  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  return { records, notes, loading, error, reload }
}
