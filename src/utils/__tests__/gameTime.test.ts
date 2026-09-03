import { describe, expect, it } from 'vitest'
import type { Game } from '../../api/mlb'
import { firstPitch } from '../gameTime'

function game(status: Partial<Game['status']>, gameDate = '2026-09-03T22:45:00Z'): Game {
  return {
    gamePk: 800001,
    gameDate,
    status: { abstractGameState: 'Preview', detailedState: 'Scheduled', ...status },
    teams: {
      home: { team: { id: 143, name: 'Philadelphia Phillies' } },
      away: { team: { id: 121, name: 'New York Mets' } },
    },
  }
}

describe('firstPitch', () => {
  it('prints a time for a scheduled game', () => {
    expect(firstPitch(game({}))).toMatch(/\d{1,2}:\d{2}/)
  })

  it('still prints a time once MLB flips the state to Pre-Game', () => {
    // The load-bearing case: MLB moves detailedState to 'Pre-Game' a few hours
    // before first pitch, so a check for detailedState === 'Scheduled' would go
    // blank during exactly the window a fan is looking. abstractGameState keeps
    // both under 'Preview'.
    expect(firstPitch(game({ detailedState: 'Pre-Game' }))).toMatch(/\d{1,2}:\d{2}/)
    expect(firstPitch(game({ detailedState: 'Warmup' }))).toMatch(/\d{1,2}:\d{2}/)
  })

  it('says TBD when the start time is not set', () => {
    expect(firstPitch(game({ startTimeTBD: true }))).toBe('TBD')
  })

  it('says TBD even for a game that would otherwise be voided', () => {
    // The TBD check runs first; a postponed game with no known time has nothing
    // more specific to say.
    expect(firstPitch(game({ startTimeTBD: true, detailedState: 'Postponed' }))).toBe('TBD')
  })

  it('prints nothing for a game that is not happening in its slot', () => {
    // A postponed game keeps its ORIGINAL gameDate and gains a sibling
    // rescheduleDate, so printing gameDate would state a first pitch that will
    // never occur.
    for (const detailedState of ['Postponed', 'Cancelled', 'Suspended']) {
      expect(firstPitch(game({ detailedState }))).toBeNull()
    }
  })

  it('matches a voided state that carries a reason suffix', () => {
    expect(firstPitch(game({ detailedState: 'Postponed: Rain' }))).toBeNull()
  })

  it('defers to the live state once the game has started', () => {
    // Live and Final rows fall back to detailedState unchanged.
    expect(firstPitch(game({ abstractGameState: 'Live', detailedState: 'In Progress' }))).toBeNull()
    expect(firstPitch(game({ abstractGameState: 'Final', detailedState: 'Final' }))).toBeNull()
  })

  it('prints nothing rather than "Invalid Date" for an unparseable date', () => {
    expect(firstPitch(game({}, 'not-a-date'))).toBeNull()
  })

  it('names the zone for a visitor outside Eastern Time', () => {
    // The runner sits in America/Los_Angeles, so the abbreviation is what tells
    // an out-of-market fan the time has been converted for them.
    expect(firstPitch(game({}))).toMatch(/[A-Z]{2,5}$/)
  })
})
