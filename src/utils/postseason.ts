import type { Game } from '../api/mlb'
import type { PlayoffPicture, SeededTeam } from './playoffPicture'

/**
 * Postseason series logic: who has won how many games of which series, what a
 * given game means, and how the bracket fills in as series are decided.
 *
 * Pure — no React, no fetch — for the reason playoffPicture.ts and today.ts are:
 * every state worth testing (a series 2–1, a sweep with its Game 3 still listed,
 * a World Series) can only be produced on demand from saved schedule JSON.
 * See the postseason-mode design spec.
 */

/**
 * The 30 clubs' ids.
 *
 * MLB posts the whole postseason schedule before anyone has qualified for the
 * later rounds, with PLACEHOLDER teams ("ATL/PHI", "NL Higher Seed", "Lower Seed
 * League Champion") in the undecided slots. Their ids are outside this set
 * (5517, 2711, …), and a fixed id set is sturdier than guessing at their names.
 */
export const MLB_CLUB_IDS: ReadonlySet<number> = new Set([
  108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 133,
  134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 158,
])

export function isClub(teamId: number): boolean {
  return MLB_CLUB_IDS.has(teamId)
}

export type Round = 'F' | 'D' | 'L' | 'W'

/** MLB's postseason gameType codes, in the order the rounds are played. */
export const ROUNDS: Record<Round, { name: string; short: string; bestOf: number }> = {
  F: { name: 'Wild Card Series', short: 'Wild Card', bestOf: 3 },
  D: { name: 'Division Series', short: 'Division Series', bestOf: 5 },
  L: { name: 'Championship Series', short: 'LCS', bestOf: 7 },
  W: { name: 'World Series', short: 'World Series', bestOf: 7 },
}

export function isPostseasonGame(game: Pick<Game, 'gameType'>): boolean {
  return game.gameType !== undefined && game.gameType in ROUNDS
}

/** Wins that decide a best-of-N series: 2 of 3, 3 of 5, 4 of 7. */
export function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1
}

const isFinal = (g: Game) => g.status.abstractGameState === 'Final'

/** The club that won a Final game, or null for one MLB hasn't flagged yet. */
function winnerOf(g: Game): number | null {
  if (g.teams.home.isWinner === true) return g.teams.home.team.id
  if (g.teams.away.isWinner === true) return g.teams.away.team.id
  return null
}

export interface Series {
  round: Round
  bestOf: number
  /** The two clubs, in the order they were asked for. */
  teamIds: [number, number]
  /** Wins for teamIds[0] and teamIds[1], counted from Final games. */
  wins: [number, number]
  /** Set once a club reaches winsNeeded(bestOf). */
  winnerId: number | null
  /** Every listed game of the series, in series order. */
  games: Game[]
  /** The first game not yet Final, while the series is undecided. */
  next: Game | null
}

function byGameNumber(a: Game, b: Game) {
  return (a.seriesGameNumber ?? 0) - (b.seriesGameNumber ?? 0) || a.gameDate.localeCompare(b.gameDate)
}

/**
 * One round's series between two clubs, or null when they have no games in it.
 *
 * Wins are COUNTED from Final games rather than read off `leagueRecord`, which
 * MLB uses for the series record on a postseason game but whose before/after
 * meaning depends on the game's state.
 */
export function seriesBetween(games: Game[], round: Round, a: number, b: number): Series | null {
  const pair = (g: Game) => {
    const ids = [g.teams.home.team.id, g.teams.away.team.id]
    return ids.includes(a) && ids.includes(b) && a !== b
  }
  const ofSeries = games.filter(g => g.gameType === round && pair(g)).sort(byGameNumber)
  if (!ofSeries.length) return null

  const bestOf = Math.max(ROUNDS[round].bestOf, ...ofSeries.map(g => g.gamesInSeries ?? 0))
  const need = winsNeeded(bestOf)
  const wins: [number, number] = [0, 0]
  for (const g of ofSeries) {
    if (!isFinal(g)) continue
    const w = winnerOf(g)
    if (w === a) wins[0]++
    else if (w === b) wins[1]++
  }
  const winnerId = wins[0] >= need ? a : wins[1] >= need ? b : null
  return {
    round,
    bestOf,
    teamIds: [a, b],
    wins,
    winnerId,
    games: ofSeries,
    next: winnerId === null ? ofSeries.find(g => !isFinal(g)) ?? null : null,
  }
}

/** The series a game belongs to — null for a regular-season or placeholder game. */
export function seriesOfGame(game: Game, games: Game[]): Series | null {
  if (!isPostseasonGame(game)) return null
  const home = game.teams.home.team.id
  const away = game.teams.away.team.id
  if (!isClub(home) || !isClub(away)) return null
  // The game itself is always part of its own series, even if the caller's list
  // somehow lacks it.
  const pool = games.some(g => g.gamePk === game.gamePk) ? games : [...games, game]
  return seriesBetween(pool, game.gameType as Round, home, away)
}

/**
 * An if-necessary game that is no longer necessary.
 *
 * MLB does remove these once a series ends (2025's schedule holds exactly the 47
 * games played), but not instantly — until it does, a swept series' Game 3 sits
 * in the schedule as `Scheduled`, and Today would headline it as the next game.
 */
export function isMoot(game: Game, games: Game[]): boolean {
  if (game.status.abstractGameState !== 'Preview') return false
  return seriesOfGame(game, games)?.winnerId != null
}

const TWO_WORD_NICKNAMES = ['Red Sox', 'White Sox', 'Blue Jays']

/**
 * "Atlanta Braves" → "Braves". Schedule games carry only the full club name, and
 * a series line reads as the nickname everywhere else in this app.
 */
export function clubName(fullName: string): string {
  const two = TWO_WORD_NICKNAMES.find(n => fullName.endsWith(n))
  if (two) return two
  const words = fullName.trim().split(/\s+/)
  return words[words.length - 1] ?? fullName
}

/**
 * The series score in a sentence, from the leader's side.
 *
 * Null at 0–0: before the first pitch there is no status worth a line, and
 * "Series tied 0–0" reads like filler. MLB nicknames are all plural ("Phillies",
 * "Red Sox", "Athletics"), which is what lets `lead`/`win` agree without a table.
 */
export function seriesStatusText(
  names: [string, string],
  wins: [number, number],
  decided: boolean
): string | null {
  const [a, b] = wins
  if (a === 0 && b === 0) return null
  if (a === b) return `Series tied ${a}–${b}`
  const leader = a > b ? 0 : 1
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return `${names[leader]} ${decided ? 'win' : 'lead'} ${hi}–${lo}`
}

export type Stakes = 'Winner take all' | 'Elimination game' | 'Chance to clinch'

export interface SeriesContext {
  round: Round
  /** MLB's own name for it — "NL Wild Card Series" — or the generic round name. */
  roundName: string
  gameNumber: number | null
  bestOf: number
  /**
   * The series score GOING INTO an unplayed or live game, and AFTER a Final one —
   * a schedule row that shows a result should show the series that result left.
   */
  status: string | null
  /** Only for the series' NEXT game, and from the focus club's side. */
  stakes: Stakes | null
  /**
   * An unplayed game beyond the next one that MLB lists as if-necessary. Its
   * "going in" score depends on games not yet played, so it gets this instead
   * of a status.
   */
  ifNecessary: boolean
}

/**
 * What a postseason game means, for the one-line context under it on Today and
 * Schedule. Null for anything that isn't a postseason game between two real clubs.
 */
export function seriesContext(game: Game, games: Game[], focusId: number): SeriesContext | null {
  const series = seriesOfGame(game, games)
  if (!series) return null

  const final = isFinal(game)
  const number = game.seriesGameNumber ?? null
  // Only a played game and the series' next game have a knowable "going in"
  // score. Game 3 of a series that is 1–0 with Game 2 still to play could be
  // entered at 2–0 (and never happen) or 1–1 — so it states neither.
  const isNext = series.next?.gamePk === game.gamePk
  if (!final && !isNext && game.status.abstractGameState === 'Preview') {
    return {
      round: series.round,
      roundName: game.seriesDescription || ROUNDS[series.round].name,
      gameNumber: number,
      bestOf: series.bestOf,
      status: null,
      stakes: null,
      ifNecessary: game.ifNecessary === 'Y',
    }
  }
  const counted = series.games.filter(g => {
    if (!isFinal(g)) return false
    if (g.gamePk === game.gamePk) return final
    return number === null || (g.seriesGameNumber ?? 0) < number
  })
  const [a, b] = series.teamIds
  const wins: [number, number] = [0, 0]
  for (const g of counted) {
    const w = winnerOf(g)
    if (w === a) wins[0]++
    else if (w === b) wins[1]++
  }

  const need = winsNeeded(series.bestOf)
  const decided = wins[0] >= need || wins[1] >= need
  const nameOf = (id: number) =>
    clubName(game.teams.home.team.id === id ? game.teams.home.team.name : game.teams.away.team.name)

  let stakes: Stakes | null = null
  if (!final && !decided) {
    const focusIdx = a === focusId ? 0 : b === focusId ? 1 : null
    const us = focusIdx === null ? null : wins[focusIdx]
    const them = focusIdx === null ? null : wins[1 - focusIdx]
    if (wins[0] === need - 1 && wins[1] === need - 1) stakes = 'Winner take all'
    else if (them === need - 1) stakes = 'Elimination game'
    else if (us === need - 1) stakes = 'Chance to clinch'
  }

  return {
    round: series.round,
    roundName: game.seriesDescription || ROUNDS[series.round].name,
    gameNumber: number,
    bestOf: series.bestOf,
    status: seriesStatusText([nameOf(a), nameOf(b)], wins, decided),
    stakes,
    ifNecessary: false,
  }
}

/**
 * The round as a fan abbreviates it — "NL Wild Card", "NLDS", "ALCS", "World
 * Series" — for a schedule row, which at 375px has about 100px to say it in.
 * The league comes off MLB's own series name; without one it is left out.
 */
export function shortRoundName(context: Pick<SeriesContext, 'round' | 'roundName'>): string {
  const league = /^(NL|AL)\b/.exec(context.roundName)?.[1] ?? ''
  switch (context.round) {
    case 'F':
      return league ? `${league} Wild Card` : 'Wild Card'
    case 'D':
      return `${league}DS`
    case 'L':
      return `${league}CS`
    case 'W':
      return 'World Series'
  }
}

/* ---------------------------------------------------------------------------
   The live bracket.
   --------------------------------------------------------------------------- */

/** One matchup slot in the bracket: two entrants and this round's wins. */
export interface SeriesView {
  round: Round
  /** Null while the series that feeds that slot is undecided. */
  entrants: [SeededTeam | null, SeededTeam | null]
  wins: [number, number]
  /** Index into `entrants` of the club that won, once decided. */
  winner: 0 | 1 | null
  series: Series | null
}

export interface LiveLeague {
  /** [0] is the 4/5 series (drawn on top), [1] the 3/6 — the bracket's order. */
  wildCard: [SeriesView, SeriesView]
  /** [0] is the 1 seed against the 4/5 winner, [1] the 2 seed against the 3/6. */
  division: [SeriesView, SeriesView]
  championship: SeriesView
  /** The pennant winner, once the Championship Series is decided. */
  champion: SeededTeam | null
}

function view(round: Round, a: SeededTeam | null, b: SeededTeam | null, games: Game[]): SeriesView {
  const series = a && b ? seriesBetween(games, round, a.teamId, b.teamId) : null
  const winnerId = series?.winnerId ?? null
  return {
    round,
    entrants: [a, b],
    wins: series?.wins ?? [0, 0],
    winner: winnerId === null ? null : winnerId === a?.teamId ? 0 : 1,
    series,
  }
}

/** The club that came out of a slot, or null while it's undecided. */
export function advancing(v: SeriesView): SeededTeam | null {
  return v.winner === null ? null : v.entrants[v.winner]
}

/**
 * Does MLB's schedule agree with the standings' pairings?
 *
 * The seeds come from the standings (useDivisionLeaders + useWildCardRace), whose
 * tiebreaker chain stops at criterion 3. If it ever resolves a tie differently
 * from MLB, the standings would pair clubs that aren't actually playing each
 * other — so a league only goes live when BOTH Wild Card pairings appear in the
 * schedule as real games at the higher seed's park.
 */
export function scheduleAgrees(picture: PlayoffPicture, games: Game[]): boolean {
  return picture.series.every(s =>
    games.some(
      g =>
        g.gameType === 'F' &&
        g.teams.home.team.id === s.higher.teamId &&
        g.teams.away.team.id === s.lower.teamId
    )
  )
}

/**
 * One league's bracket with the series results filled in, or null when the
 * schedule doesn't (yet) agree with the standings — during the regular season,
 * on a failed schedule request, or on a seeding disagreement. Callers fall back
 * to the projection.
 *
 * No reseeding: the 1 seed meets the 4/5 winner and the 2 seed the 3/6 winner,
 * which is exactly how buildPlayoffPicture pairs the byes.
 */
export function buildLiveLeague(picture: PlayoffPicture | null, games: Game[]): LiveLeague | null {
  if (!picture || !scheduleAgrees(picture, games)) return null
  const [s36, s45] = picture.series
  const [bye1, bye2] = picture.byes

  const wildCard: [SeriesView, SeriesView] = [
    view('F', s45.higher, s45.lower, games),
    view('F', s36.higher, s36.lower, games),
  ]
  const division: [SeriesView, SeriesView] = [
    view('D', bye1.team, advancing(wildCard[0]), games),
    view('D', bye2.team, advancing(wildCard[1]), games),
  ]
  const championship = view('L', advancing(division[0]), advancing(division[1]), games)
  return { wildCard, division, championship, champion: advancing(championship) }
}

/** The World Series slot: the two pennant winners, NL first. */
export function buildWorldSeries(nl: LiveLeague | null, al: LiveLeague | null, games: Game[]): SeriesView {
  return view('W', nl?.champion ?? null, al?.champion ?? null, games)
}

/** A slot's series score in a sentence, using the seeded clubs' short names. */
export function viewStatus(v: SeriesView): string | null {
  const [a, b] = v.entrants
  if (!a || !b) return null
  return seriesStatusText([a.name, b.name], v.wins, v.winner !== null)
}
