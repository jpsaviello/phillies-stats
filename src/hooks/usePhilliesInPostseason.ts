import { useEffect, useState } from 'react'
import { fetchPostseasonGames } from '../api/mlb'

const PHILLIES_ID = 143

/**
 * Whether the Phillies appear as a real club anywhere in this season's
 * postseason schedule — which is what decides whether the stat tables offer a
 * postseason view at all. Outside October (or in a year they miss) the toggle
 * would be a control with nothing behind it.
 *
 * The same request the live bracket makes, so it shares one cache entry.
 * Placeholder entrants ("ATL/PHI") carry non-club ids and never match 143.
 * Fails closed: a dead request means no toggle, and the tables read as before.
 */
export function usePhilliesInPostseason(): boolean {
  const [inIt, setInIt] = useState(false)
  useEffect(() => {
    let current = true
    fetchPostseasonGames()
      .then(games => {
        if (!current) return
        setInIt(
          games.some(g => g.teams.home.team.id === PHILLIES_ID || g.teams.away.team.id === PHILLIES_ID)
        )
      })
      .catch(() => {
        if (current) setInIt(false)
      })
    return () => {
      current = false
    }
  }, [])
  return inIt
}
