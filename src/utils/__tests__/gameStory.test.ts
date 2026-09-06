import { describe, expect, it } from 'vitest'
import type { GameBoxscore, WinProbEntry } from '../../api/mlb'
import type { BattedBall } from '../../types/mlb'
import { FENCE_CF_U, FENCE_POLE_U, HOME_PLATE, MAX_MARKER_RADIUS, SPRAY_FRAME, battedBalls, clearsFence, clipDuration, hardestHit, homeRunClips, indexClipsByPlayId, inningLabel, outcomeClass, toPhilliesProbability, turningPoints, withinSprayFrame } from '../gameStory'

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

  it('carries the play event\'s playId through, since it is the video join key', () => {
    // A highlight item's `guid` IS this value. Lose it here and every home run
    // silently renders without a clip.
    const box = boxWith([
      {
        result: { event: 'Home Run' },
        about: { inning: 4, isTopInning: true },
        matchup: { batter: { id: 3, fullName: 'Kyle Schwarber' } },
        playEvents: [
          { playId: 'not-the-ball-in-play' },
          {
            hitData: { coordinates: { coordX: 247.7, coordY: 69.6 }, launchSpeed: 108.7 },
            playId: 'a55f1cd4-de41-3c6c-8e98-07784a780448',
          },
        ],
      },
    ])
    expect(battedBalls(box, PHILLIES)[0].playId).toBe('a55f1cd4-de41-3c6c-8e98-07784a780448')
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

// The spray chart's frame used to be sized to the FENCE, which silently clipped
// any ball beyond it — an SVG dot outside the viewBox is not drawn and raises
// nothing. These are real coordinates from the 2026 season: the extremes of the
// full-season sample (6,987 balls, 139 games), the four extremes of the earlier
// 20-game sample, and the specific Schwarber home run (823419, 435 ft to right)
// that was reported missing from the chart.
describe('withinSprayFrame', () => {
  const R_MAX = 4.2

  it.each([
    ['460 ft HR to right, 824377', 254.79, 61.71],
    ['459 ft HR to centre, 823421', 121.84, 12.66],
    ['pop out behind the plate, 824249', 123.0, 227.54],
    ['leftmost ball in the season, 823436', 7.1, 128.0],
    ['Schwarber HR to right, 823419', 247.67, 69.6],
    ['deep HR to right, 823429', 244.8, 95.9],
    ['pop out behind the plate, 823423', 122.6, 222.0],
    ['pop out behind the plate, 823420', 127.8, 220.8],
    ['leftmost ball in the 20-game sample', 24.9, 120.0],
    ['shallowest ball in the 20-game sample', 126.0, 23.7],
  ])('draws %s', (_label, x, y) => {
    expect(withinSprayFrame(x, y, R_MAX)).toBe(true)
  })

  // The ring a home run is drawn with reaches further than the dot does, and
  // the frame was already snug: at MAX_MARKER_RADIUS the original bounds clipped
  // the right edge off that same Schwarber home run. This is the assertion that
  // fails if a future marker grows without the frame growing with it.
  it.each([
    ['460 ft HR to right, 824377', 254.79, 61.71],
    ['459 ft HR to centre, 823421', 121.84, 12.66],
    ['pop out behind the plate, 824249', 123.0, 227.54],
    ['Schwarber HR to right, 823419', 247.67, 69.6],
    ['deep HR to right, 823429', 244.8, 95.9],
    ['pop out behind the plate, 823423', 122.6, 222.0],
    ['leftmost ball in the 20-game sample', 24.9, 120.0],
    ['shallowest ball in the 20-game sample', 126.0, 23.7],
  ])('draws the full home-run marker for %s', (_label, x, y) => {
    expect(withinSprayFrame(x, y, MAX_MARKER_RADIUS)).toBe(true)
  })

  it('is symmetric about home plate, so the diamond sits centred', () => {
    // HOME_PLATE.x is 126; the frame must extend equally either side of it.
    expect(126 - SPRAY_FRAME.minX).toBe(SPRAY_FRAME.minX + SPRAY_FRAME.width - 126)
  })

  it('rejects a coordinate outside the frame', () => {
    expect(withinSprayFrame(SPRAY_FRAME.minX - 1, 100)).toBe(false)
    expect(withinSprayFrame(100, SPRAY_FRAME.minY - 1)).toBe(false)
  })
})

/**
 * The outfield fence, checked against real coordinates.
 *
 * This is the assertion the shipped fence failed for months: calibrated on five
 * games it drew 242 of the season's 328 home runs INSIDE the wall — a ball the
 * chart names as a home run in the list directly beneath it, plotted short of
 * the fence it cleared. Two readers reported it before it was fixed.
 *
 * Every coordinate below is real, and the three from 823417 are the game whose
 * screenshots reported the defect.
 */
describe('clearsFence', () => {
  it.each([
    ['Hill, 388 ft to left, 823417', 36.99, 68.94],
    ['Schwarber, 371 ft to right, 823417', 224.21, 84.68],
    ['Acuna, 414 ft to left-centre, 823417', 57.91, 45.7],
    ['McCann, 409 ft to left, 825037', 41.55, 59.91],
    ['Schwarber, 435 ft to right, 823419', 247.67, 69.6],
    ['460 ft to right, 824377', 254.79, 61.71],
    ['459 ft to centre, 823421', 121.84, 12.66],
    ['350 ft down the right-field line, 823671', 222.75, 97.46],
    ['346 ft to the left-field corner, 823436', 23.33, 102.65],
  ])('draws %s beyond the wall', (_label, x, y) => {
    expect(clearsFence(x, y)).toBe(true)
  })

  // The overlap is real and the fit does not pretend otherwise: a coordinate
  // records where a ball was FIELDED, so a catch on the track and a shot into
  // the first row land a few units apart. Eight of the season's 328 home runs
  // still draw inside the wall, and this is one of them — pinned so the number
  // is a measured trade-off rather than something that quietly grows back.
  it('still draws the shortest home runs inside the wall', () => {
    expect(clearsFence(41.28, 90.96)).toBe(false) // 339 ft down the LF line, 822804
  })

  // The other half of the fit. A fence tight enough to get every home run out
  // would put routine fly outs beyond the wall, which is its own visible lie —
  // these are real outs that must stay in front of it.
  it.each([
    ['308 ft fly out to centre, 824378', 143.46, 77.09],
    ['306 ft fly out to left, 824379', 69.25, 90.21],
    ['285 ft fly out to right, 823483', 166.21, 92.5],
    ['276 ft fly out to right, 824377', 180.19, 102.83],
    ['a ground ball through the infield', 100.0, 150.0],
  ])('keeps %s inside', (_label, x, y) => {
    expect(clearsFence(x, y)).toBe(false)
  })

  // Per-angle optima over the season sample run ~145 units at the poles and
  // ~168 in dead centre. These pin the shape the constants were fit to, so a
  // later nudge to one of the three has to face the measurement.
  it('is shallowest at the poles and deepest in centre', () => {
    const depth = (x: number, y: number) => Math.hypot(x - HOME_PLATE.x, HOME_PLATE.y - y)
    // Just outside the wall at each landmark, walked in until it stops clearing.
    const wallAt = (bearingDeg: number) => {
      const rad = (bearingDeg * Math.PI) / 180
      for (let r = 200; r > 60; r -= 0.1) {
        const x = HOME_PLATE.x + r * Math.sin(rad)
        const y = HOME_PLATE.y - r * Math.cos(rad)
        if (!clearsFence(x, y)) return depth(x, y)
      }
      return 0
    }
    expect(wallAt(0)).toBeCloseTo(FENCE_CF_U, 0)
    expect(wallAt(-45)).toBeCloseTo(FENCE_POLE_U, 0)
    expect(wallAt(45)).toBeCloseTo(FENCE_POLE_U, 0)
    // Symmetric, and the gaps sit between the two.
    expect(wallAt(-25)).toBeCloseTo(wallAt(25), 0)
    expect(wallAt(-25)).toBeGreaterThan(FENCE_POLE_U)
    expect(wallAt(-25)).toBeLessThan(FENCE_CF_U)
  })
})

// A batted ball, minimal but structurally real: only the fields the clip list
// reads are filled in.
function ball(over: Partial<BattedBall> = {}): BattedBall {
  return {
    batterId: 656941,
    batterName: 'Kyle Schwarber',
    event: 'Home Run',
    inning: 4,
    isTopInning: false,
    isPhillies: true,
    playId: 'a55f1cd4-de41-3c6c-8e98-07784a780448',
    hit: { coordinates: { coordX: 247.67, coordY: 69.6 }, launchSpeed: 108.7, totalDistance: 435 },
    ...over,
  }
}

describe('indexClipsByPlayId', () => {
  it('keys highlights by the guid that equals a play event playId', () => {
    // This IS the join. Verified against 121 home runs across 56 games of 2026:
    // 117 matched, and all four misses were one broadcast whose clips carry no
    // guid at all.
    const clips = indexClipsByPlayId([
      { guid: 'a55f1cd4', slug: 'schwarber-homers-41', title: "Kyle Schwarber's solo home run (41)" },
    ])
    expect(clips.get('a55f1cd4')?.slug).toBe('schwarber-homers-41')
  })

  it('skips items with no guid rather than letting them collide', () => {
    // The recap, the condensed game and the "Data Viz" segments all arrive in
    // the same list with no guid. Keyed on `undefined` they would overwrite each
    // other and hand an arbitrary survivor to the first home run asked about.
    const clips = indexClipsByPlayId([
      { slug: 'game-recap', title: 'Phillies win 4-2' },
      { slug: 'condensed-game', title: 'Condensed Game' },
      { guid: 'abc', slug: 'real-clip' },
    ])
    expect(clips.size).toBe(1)
    expect(clips.get('abc')?.slug).toBe('real-clip')
  })

  it('keeps the first item on a duplicate guid', () => {
    // MLB leads with the primary cut of a play; a later alternate edit sharing
    // the guid must not displace it.
    const clips = indexClipsByPlayId([
      { guid: 'abc', slug: 'primary' },
      { guid: 'abc', slug: 'alternate-angle' },
    ])
    expect(clips.get('abc')?.slug).toBe('primary')
  })
})

describe('clipDuration', () => {
  it('humanizes MLB\'s hh:mm:ss', () => {
    expect(clipDuration('00:00:29')).toBe('0:29')
    expect(clipDuration('00:03:15')).toBe('3:15')
  })

  it('keeps the hour when there is one', () => {
    expect(clipDuration('01:04:05')).toBe('1:04:05')
  })

  it('returns null rather than guessing at an unexpected shape', () => {
    for (const raw of [undefined, '', '29', '3:15', 'PT29S']) {
      expect(clipDuration(raw)).toBeNull()
    }
  })
})

describe('homeRunClips', () => {
  const clips = indexClipsByPlayId([
    {
      guid: 'a55f1cd4-de41-3c6c-8e98-07784a780448',
      slug: 'kyle-schwarber-homers-41-on-a-fly-ball-to-right-field-x9260',
      title: "Kyle Schwarber's solo home run (41)",
      duration: '00:00:29',
      image: { cuts: [{ aspectRatio: '16:9', width: 320, height: 180, src: 'https://img.example/thumb.jpg' }] },
    },
  ])

  it('links a home run to its clip page', () => {
    const [hr] = homeRunClips([ball()], clips)
    expect(hr.url).toBe(
      'https://www.mlb.com/video/kyle-schwarber-homers-41-on-a-fly-ball-to-right-field-x9260'
    )
    expect(hr.title).toBe("Kyle Schwarber's solo home run (41)")
    expect(hr.duration).toBe('0:29')
    expect(hr.thumbnailUrl).toBe('https://img.example/thumb.jpg')
  })

  it('keeps only home runs, in game order', () => {
    const balls = [
      ball({ event: 'Double', inning: 1, playId: 'x' }),
      ball({ inning: 2, playId: 'first-hr' }),
      ball({ event: 'Groundout', inning: 3, playId: 'y' }),
      ball({ inning: 7, playId: 'second-hr' }),
    ]
    expect(homeRunClips(balls, clips).map(h => h.ball.inning)).toEqual([2, 7])
  })

  it('still returns a home run MLB cut no clip for', () => {
    // 4 of 121 in the 2026 sample, all in one broadcast. A home run vanishing
    // from the list because its video is missing would be worse than a row with
    // no link — the reader watched it happen.
    const [hr] = homeRunClips([ball({ playId: 'no-clip-for-this' })], clips)
    expect(hr.ball.batterName).toBe('Kyle Schwarber')
    expect(hr.url).toBeNull()
    expect(hr.title).toBeNull()
    expect(hr.thumbnailUrl).toBeNull()
  })

  it('tolerates a batted ball with no playId at all', () => {
    const [hr] = homeRunClips([ball({ playId: undefined })], clips)
    expect(hr.url).toBeNull()
  })

  it('does not link a clip that has a guid but no slug', () => {
    // The slug IS the URL path; without it there is nowhere to point.
    const slugless = indexClipsByPlayId([{ guid: 'abc', title: 'A home run' }])
    const [hr] = homeRunClips([ball({ playId: 'abc' })], slugless)
    expect(hr.url).toBeNull()
    expect(hr.title).toBe('A home run')
  })
})
