import Anthropic from '@anthropic-ai/sdk'
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import { getOdds, type RouteResult } from './core.js'
import { checkChatLimit } from './rateLimit.js'

const PHILLIES_ID = 143
const SEASON = 2026
const MAX_HISTORY = 20
const MAX_MESSAGE_CHARS = 2000
const MAX_ITERATIONS = 8
// Answers are prompted to be a few sentences; a small cap bounds the
// worst-case cost of every abuse path at no UX cost.
const MAX_TOKENS = 1024

const MLB_BASE = 'https://statsapi.mlb.com/api/v1'

// Fetches an MLB Stats API path and returns the parsed JSON, or throws with
// the upstream status so callers can hand the model a readable error string.
async function mlbGet(path: string): Promise<unknown> {
  const res = await fetch(`${MLB_BASE}${path}`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  return res.json()
}

// Tool bodies return JSON strings (trimmed data or {"error": ...}) so the
// model can react to upstream failures instead of the request 500ing.
async function runTool(fn: () => Promise<unknown>): Promise<string> {
  try {
    return JSON.stringify(await fn())
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'tool failed' })
  }
}

interface ScheduleTeamSide {
  team?: { name?: string }
  score?: number
  isWinner?: boolean
  probablePitcher?: { fullName?: string }
}

interface ScheduleGame {
  gameDate?: string
  status?: { detailedState?: string }
  teams?: { home?: ScheduleTeamSide; away?: ScheduleTeamSide }
  decisions?: {
    winner?: { fullName?: string }
    loser?: { fullName?: string }
    save?: { fullName?: string }
  }
}

const getSchedule = betaTool({
  name: 'get_schedule',
  description:
    'Phillies schedule/results between two dates (YYYY-MM-DD), including scores, game status, and probable pitchers. Call this for any question about past game results, upcoming games, or who is pitching.',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'YYYY-MM-DD' },
      end_date: { type: 'string', description: 'YYYY-MM-DD' },
    },
    required: ['start_date', 'end_date'],
  },
  run: input =>
    runTool(async () => {
      const data = (await mlbGet(
        `/schedule?sportId=1&teamId=${PHILLIES_ID}&startDate=${encodeURIComponent(String(input.start_date))}&endDate=${encodeURIComponent(String(input.end_date))}&hydrate=probablePitcher,decisions,linescore`
      )) as { dates?: { date?: string; games?: ScheduleGame[] }[] }
      const side = (s?: ScheduleTeamSide) => ({
        team: s?.team?.name,
        score: s?.score,
        isWinner: s?.isWinner,
        probablePitcher: s?.probablePitcher?.fullName,
      })
      return (data.dates ?? []).flatMap(d =>
        (d.games ?? []).map(g => ({
          date: d.date,
          status: g.status?.detailedState,
          home: side(g.teams?.home),
          away: side(g.teams?.away),
          ...(g.decisions
            ? {
                winningPitcher: g.decisions.winner?.fullName,
                losingPitcher: g.decisions.loser?.fullName,
                savePitcher: g.decisions.save?.fullName,
              }
            : {}),
        }))
      )
    }),
})

interface StandingsTeamRecord {
  team?: { name?: string }
  wins?: number
  losses?: number
  winningPercentage?: string
  gamesBack?: string
  streak?: { streakCode?: string }
}

const getStandings = betaTool({
  name: 'get_standings',
  description:
    'Current National League standings by division (includes the NL East, where the Phillies play): wins, losses, win pct, games back, and streak per team.',
  inputSchema: { type: 'object', properties: {} },
  run: () =>
    runTool(async () => {
      const data = (await mlbGet(
        `/standings?leagueId=104&season=${SEASON}&standingsTypes=regularSeason`
      )) as {
        records?: { division?: { id?: number; name?: string }; teamRecords?: StandingsTeamRecord[] }[]
      }
      return (data.records ?? []).map(r => ({
        divisionId: r.division?.id,
        division: r.division?.name,
        teams: (r.teamRecords ?? []).map(t => ({
          name: t.team?.name,
          wins: t.wins,
          losses: t.losses,
          pct: t.winningPercentage,
          gamesBack: t.gamesBack,
          streak: t.streak?.streakCode,
        })),
      }))
    }),
})

interface SeasonSplit {
  player?: { id?: number; fullName?: string }
  stat?: Record<string, unknown>
}

async function seasonStats(group: 'hitting' | 'pitching', fields: string[]) {
  const data = (await mlbGet(
    `/stats?stats=season&group=${group}&teamId=${PHILLIES_ID}&season=${SEASON}&sportId=1&playerPool=all&limit=100`
  )) as { stats?: { splits?: SeasonSplit[] }[] }
  return (data.stats?.[0]?.splits ?? [])
    .filter(s => s.player != null)
    .map(s => ({
      name: s.player?.fullName,
      id: s.player?.id,
      ...Object.fromEntries(fields.map(f => [f, s.stat?.[f]])),
    }))
}

const getBattingStats = betaTool({
  name: 'get_batting_stats',
  description:
    `Season batting stats for every Phillies hitter (${SEASON}): games, avg, obp, slg, ops, home runs, RBI, stolen bases, hits, at-bats. Includes each player's id for use with get_player_game_log.`,
  inputSchema: { type: 'object', properties: {} },
  run: () =>
    runTool(() =>
      seasonStats('hitting', [
        'gamesPlayed',
        'avg',
        'obp',
        'slg',
        'ops',
        'homeRuns',
        'rbi',
        'stolenBases',
        'hits',
        'atBats',
      ])
    ),
})

const getPitchingStats = betaTool({
  name: 'get_pitching_stats',
  description:
    `Season pitching stats for every Phillies pitcher (${SEASON}): ERA, wins, losses, innings, strikeouts, WHIP, saves, games. Includes each player's id for use with get_player_game_log.`,
  inputSchema: { type: 'object', properties: {} },
  run: () =>
    runTool(() =>
      seasonStats('pitching', [
        'era',
        'wins',
        'losses',
        'inningsPitched',
        'strikeOuts',
        'whip',
        'saves',
        'gamesPitched',
      ])
    ),
})

interface GameLogSplit {
  date?: string
  opponent?: { name?: string }
  stat?: Record<string, unknown>
}

const HITTING_LOG_FIELDS = ['atBats', 'hits', 'homeRuns', 'rbi', 'runs', 'baseOnBalls', 'strikeOuts', 'stolenBases']
const PITCHING_LOG_FIELDS = ['inningsPitched', 'hits', 'runs', 'earnedRuns', 'baseOnBalls', 'strikeOuts', 'homeRuns']

const getPlayerGameLog = betaTool({
  name: 'get_player_game_log',
  description:
    'Per-game stats for one player over their last 10 games. Get the person_id from get_batting_stats or get_pitching_stats first.',
  inputSchema: {
    type: 'object',
    properties: {
      person_id: { type: 'integer', description: 'MLB person id of the player' },
      group: { type: 'string', enum: ['hitting', 'pitching'] },
    },
    required: ['person_id', 'group'],
  },
  run: input =>
    runTool(async () => {
      const data = (await mlbGet(
        `/people/${encodeURIComponent(String(input.person_id))}/stats?stats=gameLog&group=${encodeURIComponent(String(input.group))}&season=${SEASON}&sportId=1`
      )) as { stats?: { splits?: GameLogSplit[] }[] }
      const fields = input.group === 'hitting' ? HITTING_LOG_FIELDS : PITCHING_LOG_FIELDS
      // API returns the season oldest-first; keep the last 10 games.
      return (data.stats?.[0]?.splits ?? []).slice(-10).map(s => ({
        date: s.date,
        opponent: s.opponent?.name,
        ...Object.fromEntries(fields.map(f => [f, s.stat?.[f]])),
      }))
    }),
})

interface OddsOutcome {
  name?: string
  price?: number
  point?: number
}

interface OddsMarket {
  key?: string
  outcomes?: OddsOutcome[]
}

interface OddsBookmaker {
  key?: string
  title?: string
  markets?: OddsMarket[]
}

interface OddsApiGame {
  commence_time?: string
  home_team?: string
  away_team?: string
  bookmakers?: OddsBookmaker[]
}

const getGameOdds = betaTool({
  name: 'get_odds',
  description:
    'Current betting odds (DraftKings moneyline and run line) for upcoming MLB games on the near-term slate, including any Phillies game. Use for questions about betting lines, spreads, favorites, or who is favored. Odds cover only the next day or so, so a game may not have lines posted yet — an empty result means no games are currently priced.',
  inputSchema: { type: 'object', properties: {} },
  run: () =>
    runTool(async () => {
      // Reuse the shared odds path so the key and 30-min cache stay in one
      // place; a non-200 means keyless (503) or an upstream failure.
      const result = await getOdds()
      if (result.status !== 200) {
        throw new Error(`odds unavailable (${result.status})`)
      }
      const games = (result.body as OddsApiGame[] | null) ?? []
      return games.map(g => {
        const dk = g.bookmakers?.find(b => b.key === 'draftkings') ?? g.bookmakers?.[0]
        const h2h = dk?.markets?.find(m => m.key === 'h2h')
        const spreads = dk?.markets?.find(m => m.key === 'spreads')
        const line = (team?: string) => {
          const rl = spreads?.outcomes?.find(o => o.name === team)
          return {
            moneyline: h2h?.outcomes?.find(o => o.name === team)?.price,
            runLine: rl ? { point: rl.point, price: rl.price } : undefined,
          }
        }
        return {
          commenceTime: g.commence_time,
          home: g.home_team,
          away: g.away_team,
          bookmaker: dk?.title,
          homeOdds: line(g.home_team),
          awayOdds: line(g.away_team),
        }
      })
    }),
})

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Returns a human-readable problem, or null when the body is valid.
function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'messages must be a non-empty array'
  }
  if (messages.length > MAX_HISTORY) {
    return `messages must contain at most ${MAX_HISTORY} entries`
  }
  for (const m of messages) {
    if (typeof m !== 'object' || m === null) return 'each message must be an object'
    const { role, content } = m as { role?: unknown; content?: unknown }
    if (role !== 'user' && role !== 'assistant') {
      return "each message role must be 'user' or 'assistant'"
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return 'each message content must be a non-empty string'
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return `each message content must be at most ${MAX_MESSAGE_CHARS} characters`
    }
  }
  const first = messages[0] as { role?: unknown }
  if (first.role !== 'user') return "the first message must have role 'user'"
  const last = messages[messages.length - 1] as { role?: unknown }
  if (last.role !== 'user') return "the last message must have role 'user'"
  return null
}

function buildSystemPrompt(): string {
  // Games run past midnight UTC; use the team's local (ET) date so "today"
  // doesn't roll over to tomorrow during evening games. en-CA gives YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date()
  )
  return (
    `You are a Philadelphia Phillies (team id ${PHILLIES_ID}, ${SEASON} season) stats assistant embedded in a Phillies stats website. ` +
    `Today's date is ${today}. ` +
    `You MUST use your tools for any factual claim about games, stats, pitchers, standings, or betting odds — never answer those from memory. ` +
    `When asked about betting lines or odds, use get_odds; if it returns no game for the matchup asked about, say odds aren't posted yet rather than guessing. ` +
    `Keep answers short and conversational: a few sentences at most; small inline lists are fine. ` +
    `Politely decline questions unrelated to the Phillies or MLB. ` +
    `Reply in plain text only — no markdown headings or tables.`
  )
}

// Takes an already-parsed request body (parsing/malformed-JSON handling is
// the caller's job, since that's framework-specific) and returns a plain
// { status, body } result — no Hono/Vercel types here, see core.ts for why.
export async function handleChat(requestBody: unknown, clientIp: string): Promise<RouteResult> {
  // Rate limit first, ahead of the key check and validation: the 429 paths
  // stay verifiable without a key (no paid requests), a misconfigured deploy
  // is still protected, and hammering invalid bodies is capped too.
  const limited = checkChatLimit(clientIp)
  if (limited !== null) return limited

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { status: 503, body: { error: 'chat not configured' } }

  const messages = (requestBody as { messages?: unknown } | null)?.messages
  const problem = validateMessages(messages)
  if (problem !== null) return { status: 400, body: { error: problem } }

  // Rebuild the messages so only the validated shape reaches the API — any
  // extra keys the client sent would otherwise surface as a 502.
  const cleanMessages: ChatMessage[] = (messages as ChatMessage[]).map(m => ({
    role: m.role,
    content: m.content,
  }))

  try {
    const client = new Anthropic({ apiKey })
    const finalMessage = await client.beta.messages.toolRunner({
      model: 'claude-opus-4-8',
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: buildSystemPrompt(),
      tools: [getSchedule, getStandings, getBattingStats, getPitchingStats, getPlayerGameLog, getGameOdds],
      messages: cleanMessages,
      max_iterations: MAX_ITERATIONS,
    })
    const reply =
      finalMessage.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n') || "Sorry — I couldn't finish that one. Try asking again."
    return { status: 200, body: { reply } }
  } catch (err) {
    console.error('chat request failed', err)
    return { status: 502, body: { error: 'chat request failed' } }
  }
}
