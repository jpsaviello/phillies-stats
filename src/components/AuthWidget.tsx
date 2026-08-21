import { useEffect, useState, type FormEvent } from 'react'
import { login, logout, signup } from '../api/auth'
import ProfileModal from './ProfileModal'
import { profileInitials } from '../utils/profileDisplay'
import type { User } from '../types/auth'
import type { Profile } from '../types/profile'

interface AuthWidgetProps {
  user: User | null
  onAuthChange: (user: User | null) => void
  profile: Profile | null
  onProfileChange: (profile: Profile) => void
}

type Mode = 'signin' | 'signup'

// Sign-in entry point for the header. A modal rather than a persistent panel
// like ChatWidget: signing in is an occasional action, not an ongoing one.
// Only UI state lives here — whether someone is signed in is App-level state,
// since future features will need to read it too.
export default function AuthWidget({ user, onAuthChange, profile, onProfileChange }: AuthWidgetProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function resetForm() {
    setEmail('')
    setPassword('')
    setError(null)
    setSubmitting(false)
  }

  function openModal() {
    setMode('signin')
    resetForm()
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
    resetForm()
  }

  // Keep whatever was typed when flipping modes — the fields mean the same
  // thing on both sides, and retyping an email to correct a wrong guess is
  // pure friction. The stale error goes, though.
  function switchMode() {
    setMode(current => (current === 'signin' ? 'signup' : 'signin'))
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const authed =
        mode === 'signup' ? await signup({ email, password }) : await login({ email, password })
      onAuthChange(authed)
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      // Deliberately not closing: the form stays filled so the user can fix a
      // typo instead of starting over.
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    await logout()
    onAuthChange(null)
  }

  if (user !== null) {
    const displayName = profile?.displayName?.trim() || user.email
    return (
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label="Open profile"
          onClick={() => setProfileModalOpen(true)}
          className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10"
        >
          {profile?.avatarDataUrl ? (
            <img
              src={profile.avatarDataUrl}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
              {profileInitials(profile, user)}
            </span>
          )}
          <span className="hidden max-w-[14rem] truncate text-sm text-blue-100 sm:inline">
            {displayName}
          </span>
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-lg border border-white/40 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
        >
          Sign out
        </button>

        {profileModalOpen && (
          <ProfileModal
            user={user}
            profile={profile}
            onProfileChange={onProfileChange}
            onClose={() => setProfileModalOpen(false)}
            onAccountDeleted={() => {
              setProfileModalOpen(false)
              onAuthChange(null)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Sign in"
        onClick={openModal}
        className="shrink-0 rounded-lg border border-white/40 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
      >
        Sign In
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={mode === 'signup' ? 'Create account' : 'Sign in'}
            // text-gray-900 is load-bearing: the modal renders inside the header,
            // which sets text-white, so anything without an explicit color would
            // inherit white on this white panel — including input carets.
            className="w-full max-w-sm rounded-lg bg-white p-6 text-gray-900 shadow-2xl"
            // Clicks inside the panel must not reach the backdrop's close handler.
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl uppercase tracking-wide text-phillies-navy">
                {mode === 'signup' ? 'Create Account' : 'Sign In'}
              </h2>
              <button
                type="button"
                aria-label="Close sign in"
                onClick={closeModal}
                className="rounded p-1 text-gray-500 hover:text-gray-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={submitting}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 caret-phillies-navy placeholder:text-gray-500 focus:border-phillies-navy focus:outline-none disabled:bg-gray-50"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                  minLength={8}
                  maxLength={200}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 caret-phillies-navy placeholder:text-gray-500 focus:border-phillies-navy focus:outline-none disabled:bg-gray-50"
                />
              </div>

              {error !== null && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-phillies-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? 'Working…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-600">
              {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
              <button
                type="button"
                onClick={switchMode}
                disabled={submitting}
                className="font-semibold text-phillies-navy underline disabled:opacity-50"
              >
                {mode === 'signup' ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>
      )}
    </>
  )
}
