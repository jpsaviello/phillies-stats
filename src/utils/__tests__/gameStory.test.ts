import { describe, expect, it } from 'vitest'
import type { GameBoxscore, WinProbEntry } from '../../api/mlb'
import { battedBalls, hardestHit, inningLabel, outcomeClass, toPhilliesProbability, turningPoints } from '../gameStory'

const PHILLIES = 143

function entry(atBatIndex: number, home: number, added: number, description = 'Single'): WinProbEntry {
  return {
    atBatIndex,
    homeTeamWinProbability: home,
    homeTeamWinProbabilityAdded: added,
    result: { description },
    about: { inning: 1, halfInning: 'top' },
  }
}

// The bug this function exists to prevent is INVISIBLE on home games, so a
// sample of only home games passes vacuously. Every case below is stated from
// both sides deliberately.
describe('toPhilliesProbability', () => {
  it('passes the home probability through when the Phillies are home', () => {
    const points = toPhilliesProbability([entry(0, 73, 5)], true)
    expect(points[0].philliesWinProb).toBe(73)
    expect(points[0].added).toBe(5)
  })

  it('inverts the probability when the Phillies are the road club', () => {
    // MLB reports 73% for the HOME team; the Phillies' own number is 27%.
    // Plotted raw, a road game's curve falls when the Phillies do well.
    const points = toPhilliesProbability([entry(0, 73, 5)], false)
    expect(points[0].philliesWinProb).toBe(27)
  })

  it('flips the sign of the swing on the road too', () => {
    // Without this, the turning-points list credits the wrong side: a play that
    // helped the home team reads as a Phillies highlight.
    const points = toPhilliesProbability([entry(0, 73, 5)], false)
    expect(points[0].added).toBe(-5)
  })

  it('ends a road win at 100 percent', () => {
    // Regression guard modeled on gamePk 825038 (PHI 7-1 at Arizona): the final
    // entry must resolve to a Phillies certainty, not the home team's 0%.
    const points = toPhilliesProbability([entry(70, 0, -2)], false)
    expect(points.at(-1)?.philliesWinProb).toBe(100)
  })

  it('ends a road loss at 0 percent', () => {
    // gamePk 823019 (PHI 0-2 at St. Louis).
    const points = toPhilliesProbability([entry(70, 100, 2)], false)
    expect(points.at(-1)?.philliesWinProb).toBe(0)
  })

  it('drops entries with no probability rather than defaulting them', () => {
    const points = toPhilliesProbability([{ atBatIndex: 0 }, entry(1, 50, 0)], true)
    expect(points).toHaveLength(1)
    expect(points[0].atBatIndex).toBe(1)
  })

  it('falls back to array position when atBatIndex is absent', () => {
    const points = toPhilliesProbability([{ homeTeamWinProbability: 50 }], true)
    expect(points[0].atBatIndex).toBe(0)
  })

  it('treats a missing swing as zero rather than NaN', () => {
    const points = toPhilliesProbability([{ homeTeamWinProbability: 50 }], false)
    expect(points[0].added).toBe(0)
  })
})

describe('turningPoints', () => {
  const points = toPhilliesProbability(
    [entry(1, 50, 4, 'Groundout'), entry(2, 62, 12, 'Home Run'), entry(3, 55, -7, 'Double play'), entry(4, 58, 3, 'Walk')],
    true
  )

  it('picks the biggest swings by absolute value, in either direction', () => {
    const top = turningPoints(points, 2)
    expect(top.map(p => p.description)).toEqual(['Home Run', 'Double play'])
  })

  it('returns them in game order, not ranked order', () => {
    // The list reads as a narrative, so a later, larger swing must not jump
    // ahead of an earlier, smaller one.
    const top = turningPoints(points, 3)
    expect(top.map(p => p.atBatIndex)).toEqual([1, 2, 3])
  })

  it('skips plays with no swing or no description', () => {
    const flat = toPhilliesProbability([entry(1, 50, 0, 'Groundout'), entry(2, 50, 8, '')], true)
    expect(turningPoints(flat)).toHaveLength(0)
  })

  it('breaks ties toward the earlier at-bat', () => {
    const tied = toPhilliesProbability([entry(5, 50, 9, 'Later'), entry(1, 50, 9, 'Earlier')], true)
    expect(turningPoints(tied, 1)[0].description).toBe('Earlier')
  })
})

function boxWith(plays: NonNullable<NonNullable<GameBoxscore['liveData']['plays']>['allPlays']>): GameBoxscore {
  return {
    gameData: {
      status: { abstractGameState: 'Final', detailedState: 'Final' },
      teams: { home: { id: 109, name: 'Arizona Diamondbacks' }, away: { id: PHILLIES, name: 'Philadelphia Phillies' } },
    },
    liveData: { plays: { allPlays: plays } },
  }
}

describe('battedBalls', () => {
  it('credits the batting side from the half-inning, not a roster lookup', () => {
    // Phillies are away here, so they bat in the TOP half. Deriving this from
    // the half-inning is what makes it correct for callups and substitutes a
    // roster snapshot might not carry.
    const box = boxWith([
      {
        result: { event: 'Single' },
        about: { inning: 1, isTopInning: true },
        matchup: { batter: { id: 1, fullName: 'Trea Turner' } },
        playEvents: [{ hitData: { coordinates: { coordX: 150, coordY: 120 }, launchSpeed: 101 } }],
      },
      {
        result: { event: 'Double' },
        about: { inning: 1, isTopInning: false },
        matchup: { batter: { id: 2, fullName: 'Ketel Marte' } },
        playEvents: [{ hitData: { coordinates: { coordX: 90, coordY: 110 }, launchSpeed: 98 } }],
      },
    ])
    const balls = battedBalls(box, PHILLIES)
    expect(balls.map(b => b.isPhillies)).toEqual([true, false])
  })

  it('drops balls with no coordinates rather than defaulting them', () => {
    // A defaulted coordinate draws a phantom dot behind the backstop that looks
    // like a real batted ball.
    const box = boxWith([
      {
        result: { event: 'Strikeout' },
        about: { inning: 1, isTopInning: true },
        matchup: { batter: { id: 1, fullName: 'Trea Turner' } },
        playEvents: [{ hitData: { launchSpeed: 0 } }, {}],
      },
    ])
    expect(battedBalls(box, PHILLIES)).toHaveLength(0)
  })

  it('flattens every batted ball out of the play events', () => {
    const box = boxWith([
      {
        result: { event: 'Home Run' },
        about: { inning: 4, isTopInning: true },
        matchup: { batter: { id: 3, fullName: 'Kyle Schwarber' } },
        playEvents: [{}, { hitData: { coordinates: { coordX: 170, coordY: 40 }, launchSpeed: 110 } }],
      },
    ])
    const balls = battedBalls(box, PHILLIES)
    expect(balls).toHaveLength(1)
    expect(balls[0]).toMatchObject({ batterName: 'Kyle Schwarber', event: 'Home Run', inning: 4 })
  })

  it('returns nothing for a game with no plays', () => {
    expect(battedBalls({ gameData: boxWith([]).gameData, liveData: {} }, PHILLIES)).toEqual([])
  })
})

describe('outcomeClass', () => {
  it('counts the four hit events as hits', () => {
    for (const event of ['Single', 'Double', 'Triple', 'Home Run']) {
      expect(outcomeClass(event)).toBe('hit')
    }
  })

  it('draws everything else as an out, reached base or not', () => {
    // The chart is about where the ball was struck, not how the scorer ruled it.
    for (const event of ['Field Error', 'Fielders Choice', 'Walk', 'Flyout']) {
      expect(outcomeClass(event)).toBe('out')
    }
  })
})

describe('hardestHit', () => {
  it('ranks by exit velocity and skips balls without one', () => {
    const box = boxWith([1, 2, 3].map((id, i) => ({
      result: { event: 'Single' },
      about: { inning: 1, isTopInning: true },
      matchup: { batter: { id, fullName: `Batter ${id}` } },
      playEvents: [{ hitData: { coordinates: { coordX: 100 + i, coordY: 100 }, launchSpeed: i === 2 ? undefined : 90 + i * 10 } }],
    })))
    const hardest = hardestHit(battedBalls(box, PHILLIES), 2)
    expect(hardest.map(b => b.hit.launchSpeed)).toEqual([100, 90])
  })
})

describe('inningLabel', () => {
  it('abbreviates the half and ordinalizes the inning', () => {
    expect(inningLabel(1, 'top')).toBe('Top 1st')
    expect(inningLabel(2, 'bottom')).toBe('Bot 2nd')
    expect(inningLabel(3, 'bottom')).toBe('Bot 3rd')
    expect(inningLabel(9, 'top')).toBe('Top 9th')
  })

  it('handles extra innings past the teens', () => {
    expect(inningLabel(11, 'top')).toBe('Top 11th')
    expect(inningLabel(12, 'top')).toBe('Top 12th')
    expect(inningLabel(13, 'top')).toBe('Top 13th')
    expect(inningLabel(21, 'bottom')).toBe('Bot 21st')
  })
})
