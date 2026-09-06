/**
 * The reader's theme choice.
 *
 * Three states, not two. The token set in `index.css` already resolves all
 * three — bare `:root` is dark, `prefers-color-scheme: light` (guarded
 * `:not([data-theme="dark"])`) is light, and the two `[data-theme]` blocks let
 * an explicit choice win over the OS in either direction — so "follow the
 * system" is a real state the CSS supports, and collapsing this to a two-way
 * switch would take it away from everyone whose phone flips at sunset.
 *
 * `system` is represented by the ABSENCE of the attribute, which is what makes
 * the media query the deciding rule again.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

/**
 * Also hardcoded in the pre-paint script in `index.html`, which cannot import
 * this module because it runs before the bundle exists. If this key or the two
 * explicit values change, change them there too — the script is what stops a
 * light-preferring reader seeing a dark flash on every cold load.
 */
export const THEME_STORAGE_KEY = 'phl:theme'

const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark']

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as string[]).includes(value)
}

/** The stored choice, or `system` when nothing is stored or storage is unusable. */
export function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return isPreference(raw) ? raw : 'system'
  } catch {
    // Private mode, blocked site data. Fail open to the default, the same
    // idiom AllStarBanner uses for its dismiss flag.
    return 'system'
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // The choice still applies to this page; it just won't survive a reload.
  }
}

/**
 * Puts the choice on the document element, where the CSS reads it.
 *
 * `system` REMOVES the attribute rather than setting a value, because the media
 * query only gets to decide when neither `[data-theme]` block matches.
 */
export function applyThemePreference(preference: ThemePreference, root: HTMLElement): void {
  if (preference === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', preference)
}

/** Cycle order for the toggle: system → light → dark → system. */
export function nextThemePreference(preference: ThemePreference): ThemePreference {
  return PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length]
}

/** What the control says it will do, for its accessible name and tooltip. */
export function themeLabel(preference: ThemePreference): string {
  const now = preference === 'system' ? 'following your system' : preference
  return `Theme: ${now}. Switch to ${nextThemePreference(preference)}.`
}
