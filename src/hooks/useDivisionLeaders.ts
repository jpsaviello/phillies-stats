import { useEffect, useState } from 'react'
import { fetchDivisionLeaders, fetchSeasonResults } from '../api/mlb'
import type { DivisionLeaderRecord, SeasonGameResult } from '../types/mlb'
import { byRecord, DIVISION_WINNERS } from '../utils/playoffPicture'
import { applyTiebreakers, teamsNeedingTiebreak, type TiebreakerNote } from '../utils/tiebreakers'

export interface DivisionLeaders {
  /** In seeding order — best first, ties broken by the real MLB chain. */
  leaders: DivisionLeaderRecord[]
  notes: Map<number, TiebreakerNote>
  loading: boolean
}

/**
 * One league's three division leaders, in the order they would be seeded.
 *
 * Deliberately shaped like useWildCardRace, and for the same reason: MLB's API
 * does not apply tiebreakers — `leagueRank` orders tied clubs by ascending team
 * id — so a raw sort would hand a bye to the wrong club whenever two leaders
 * share a winning percentage. Ordering is therefore sort-then-tiebreak, using the
 * same chain (head-to-head, intradivision, intraleague) the wild card table uses.
 *
 * For the NL this costs NO request of its own: fetchDivisionLeaders(104) reads the
 * same URL fetchStandings already asked for, so it is served from the cache. The
 * AL is a request the app has no other reason to make. Either way the head-to-head
 * round trips fire only when two leaders are actually tied.
 */
export function useDivisionLeaders(leagueId: number): DivisionLeaders {
  const [leaders, setLeaders] = useState<DivisionLeaderRecord[]>([])
  const [notes, setNotes] = useState<Map<number, TiebreakerNote>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // applyTiebreakers groups CONSECUTIVE equal-percentage clubs, so the sort
      // has to happen before the tie detection, not after it.
      const ordered = byRecord(await fetchDivisionLeaders(leagueId))
      const ids = teamsNeedingTiebreak(ordered, DIVISION_WINNERS)
      if (!ids.length) return { ordered, notes: new Map<number, TiebreakerNote>() }

      const settled = await Promise.allSettled(ids.map(fetchSeasonResults))
      const results = new Map<number, SeasonGameResult[]>()
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') results.set(ids[i], s.value)
      })
      // Partial head-to-head data would order a tie against an incomplete
      // picture, which is worse than leaving the record order alone.
      if (results.size < ids.length) return { ordered, notes: new Map<number, TiebreakerNote>() }

      return applyTiebreakers(ordered, results, leagueId)
    }

    load()
      .then(({ ordered, notes }) => {
        setLeaders(ordered)
        setNotes(notes)
      })
      .catch(() => setLeaders([]))
      .finally(() => setLoading(false))
  }, [leagueId])

  return { leaders, notes, loading }
}
