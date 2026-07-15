import type { OddsGame } from '../api/mlb'

export function getPhilliesOdds(oddsGame: OddsGame) {
  const dk = oddsGame.bookmakers[0]
  if (!dk) return null
  const h2h = dk.markets.find(m => m.key === 'h2h')
  const spreads = dk.markets.find(m => m.key === 'spreads')
  const ml = h2h?.outcomes.find(o => o.name === 'Philadelphia Phillies')?.price
  const rl = spreads?.outcomes.find(o => o.name === 'Philadelphia Phillies')
  if (ml === undefined || !rl) return null
  return { ml, rlPoint: rl.point ?? -1.5, rlJuice: rl.price }
}
