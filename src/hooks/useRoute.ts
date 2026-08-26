import { useSyncExternalStore } from 'react'

/**
 * A ~90-line hash router, replacing the app's previous lack of any routing.
 *
 * Before this, `tab` was a plain `useState` in App.tsx and each modal owned its
 * own `selected*` state, which meant the URL never changed: no view in the app
 * could be linked to, and — the reason this got fixed — the browser Back button
 * always left the site. On a phone the back swipe after opening a player's game
 * log exited the app instead of closing the modal.
 *
 * Hash-based rather than path-based on purpose. Path routing needs an SPA
 * fallback rewrite configured on BOTH deploy targets (nginx in k8s, vercel.json
 * on Vercel) or a hard refresh at /standings 404s. The hash needs nothing from
 * either server and cannot break a deploy.
 *
 * `?liveGamePk=` is intentionally untouched — it's a query param on the real URL,
 * not part of the hash, and remains the debug hook LiveGameStrip documents.
 */

export type Tab = 'batting' | 'pitching' | 'roster' | 'standings' | 'schedule'

const TABS: Tab[] = ['batting', 'pitching', 'roster', 'standings', 'schedule']
const DEFAULT_TAB: Tab = 'batting'

export interface Route {
  tab: Tab
  /** Open player-detail modal (MLB personId), or null. */
  player: number | null
  /** Open game-detail modal (gamePk), or null. */
  game: number | null
}

function num(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  // Rejects '', 'abc' and floats — these address a modal, so a bad value should
  // read as "no modal" rather than as an id that fetches nonsense.
  return Number.isInteger(n) && n > 0 ? n : null
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, query] = raw.split('?')
  const params = new URLSearchParams(query ?? '')
  return {
    tab: (TABS as string[]).includes(path) ? (path as Tab) : DEFAULT_TAB,
    player: num(params.get('player')),
    game: num(params.get('game')),
  }
}

function format(route: Route): string {
  const params = new URLSearchParams()
  if (route.player !== null) params.set('player', String(route.player))
  if (route.game !== null) params.set('game', String(route.game))
  const query = params.toString()
  return `#/${route.tab}${query ? `?${query}` : ''}`
}

const listeners = new Set<() => void>()

// useSyncExternalStore re-renders whenever getSnapshot returns a new reference,
// so the parsed route is cached and only rebuilt when the hash actually changes.
let snapshot: Route = parse()

function sync() {
  snapshot = parse()
  listeners.forEach(l => l())
}

// popstate covers Back/Forward; hashchange covers someone editing the URL bar.
window.addEventListener('popstate', sync)
window.addEventListener('hashchange', sync)

/**
 * Marks the entries this app pushed itself, so `dismiss` can tell them apart
 * from the entry the browser created for a cold page load.
 */
const OURS = { appPush: true }

export function navigate(patch: Partial<Route>, opts?: { replace?: boolean }) {
  const next = { ...snapshot, ...patch }
  const url = format(next)
  if (url === window.location.hash) return
  // pushState is what makes Back close a modal instead of leaving the site.
  if (opts?.replace) window.history.replaceState(OURS, '', url)
  else window.history.pushState(OURS, '', url)
  sync()
}

/**
 * Closes a modal — the X button, Escape, a click on the backdrop.
 *
 * Not simply `navigate({ player: null })`. That would push a third entry, so
 * Back immediately after closing would land on the still-open state and reopen
 * the modal, which is precisely the behaviour this router exists to fix. Going
 * back instead POPS the entry the modal's own opening pushed, leaving history
 * as if it had never been opened.
 *
 * The fallback matters: on a cold load of a shared ?player= link there is no
 * entry of ours to pop, and calling back() would leave the site. That case
 * rewrites the current entry instead, so the modal closes and Back still means
 * "wherever I came from".
 */
export function dismiss(patch: Partial<Route>) {
  if (window.history.state?.appPush === true) window.history.back()
  else navigate(patch, { replace: true })
}

/**
 * Switching tabs closes whatever modal was open. Carrying `player` across would
 * reopen it over an unrelated tab as soon as that tab's data loaded.
 */
export function setTab(tab: Tab, opts?: { replace?: boolean }) {
  navigate({ tab, player: null, game: null }, opts)
}

export function useRoute(): Route {
  return useSyncExternalStore(
    onChange => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => snapshot
  )
}

/**
 * Gives a bare "/" a real address on first load, so the URL in the bar is
 * always something a visitor can copy. replace, not push, or Back would have to
 * be pressed twice to leave.
 */
export function initRoute() {
  if (window.location.hash === '') navigate({}, { replace: true })
}
