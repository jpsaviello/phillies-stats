import { useEffect, useState } from 'react'
import { fetchSeasonResults, fetchWildCardStandings } from '../api/mlb'
import type { SeasonGameResult, WildCardRecord } from '../types/mlb'
import { applyTiebreakers, teamsNeedingTiebreak, type TiebreakerNote } from '../utils/tiebreakers'

const PHILLIES_ID = 143
const NL_LEAGUE_ID = 104
/** The NL sends its top 3 wild card teams to the postseason (2022 format). */
export const PLAYOFF_SPOTS = 3
const MIN_ROWS_SHOWN = 7

/**
 * The Phillies are absent from this response entirely whenever they lead the
 * NL East (the endpoint excludes division leaders), so philliesIndex may be -1.
 */
export function windowSize(records: WildCardRecord[]) {
  const philliesIndex = records.findIndex(r => r.team.id === PHILLIES_ID)
  return philliesIndex >= 0 ? Math.max(MIN_ROWS_SHOWN, philliesIndex + 1) : MIN_ROWS_SHOWN
}

export interface WildCardRace {
  records: WildCardRecord[]
  notes: Map<number, TiebreakerNote>
  loading: boolean
}

/**
 * The tiebreaker-corrected wild card race, fetched once per Standings mount.
 *
 * This lives in a hook rather than inside WildCardStandings because the Playoff
 * Push panel states a playoff position from the same ordering. Two independent
 * copies would double the tiebreaker round trips and, worse, could drift apart —
 * a panel claiming 4th above a table showing 3rd is worse than either alone.
 */
export function useWildCardRace(): WildCardRace {
  const [records, setRecords] = useState<WildCardRecord[]>([])
  const [notes, setNotes] = useState<Map<number, TiebreakerNote>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Ties are resolved BEFORE first paint. Consumers render nothing while
    // loading, so the extra round trip costs a slightly later paint but avoids
    // visibly rearranging the playoff cutoff in front of the user.
    async function load() {
      const wildCard = await fetchWildCardStandings()
      const ids = teamsNeedingTiebreak(wildCard, windowSize(wildCard))
      if (!ids.length) return { ordered: wildCard, notes: new Map<number, TiebreakerNote>() }

      const settled = await Promise.allSettled(ids.map(fetchSeasonResults))
      const results = new Map<number, SeasonGameResult[]>()
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') results.set(ids[i], s.value)
      })
      // Partial data would order a tie against an incomplete head-to-head picture,
      // which is worse than not reordering at all.
      if (results.size < ids.length) return { ordered: wildCard, notes: new Map<number, TiebreakerNote>() }

      return applyTiebreakers(wildCard, results, NL_LEAGUE_ID)
    }

    load()
      .then(({ ordered, notes }) => {
        setRecords(ordered)
        setNotes(notes)
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  return { records, notes, loading }
}
