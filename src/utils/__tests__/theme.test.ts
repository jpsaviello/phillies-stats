import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemePreference,
  nextThemePreference,
  readThemePreference,
  themeLabel,
  writeThemePreference,
  THEME_STORAGE_KEY,
} from '../theme'

// A minimal element stand-in: these tests are about which attribute ends up on
// the document, not about the DOM, and the suite runs in node.
function fakeRoot() {
  const attrs = new Map<string, string>()
  return {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    get: (k: string) => attrs.get(k),
  }
}

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
})

describe('theme preference cycle', () => {
  it('cycles system -> light -> dark -> system', () => {
    expect(nextThemePreference('system')).toBe('light')
    expect(nextThemePreference('light')).toBe('dark')
    expect(nextThemePreference('dark')).toBe('system')
  })

  it('names the current state and the next one', () => {
    expect(themeLabel('system')).toContain('following your system')
    expect(themeLabel('system')).toContain('Switch to light')
    expect(themeLabel('dark')).toContain('Switch to system')
  })
})

describe('applyThemePreference', () => {
  // `system` must REMOVE the attribute: the prefers-color-scheme rules in
  // index.css only decide when neither [data-theme] block matches, so writing
  // data-theme="system" would pin the app to the dark base for a light OS.
  it('removes the attribute for system rather than setting a value', () => {
    const root = fakeRoot()
    applyThemePreference('dark', root as unknown as HTMLElement)
    expect(root.get('data-theme')).toBe('dark')
    applyThemePreference('system', root as unknown as HTMLElement)
    expect(root.get('data-theme')).toBeUndefined()
  })

  it('sets the explicit choices', () => {
    const root = fakeRoot()
    applyThemePreference('light', root as unknown as HTMLElement)
    expect(root.get('data-theme')).toBe('light')
  })
})

describe('preference storage', () => {
  it('round-trips an explicit choice', () => {
    writeThemePreference('light')
    expect(readThemePreference()).toBe('light')
  })

  // Storing "system" would outlive a later change to the default, so the key is
  // removed instead and absence means system.
  it('clears the key for system', () => {
    writeThemePreference('dark')
    writeThemePreference('system')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(readThemePreference()).toBe('system')
  })

  it('falls back to system for an unrecognised stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readThemePreference()).toBe('system')
  })

  it('fails open when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(readThemePreference()).toBe('system')
    expect(() => writeThemePreference('dark')).not.toThrow()
  })
})
