import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { fetchRoster } from '../api/mlb'
import { changePassword, deleteAccount, fetchProfile, updateAvatar, updateProfile } from '../api/profile'
import { fileToAvatarDataUrl } from '../utils/avatar'
import { profileInitials } from '../utils/profileDisplay'
import type { RosterEntry } from '../types/mlb'
import type { Profile, ProfileUpdate } from '../types/profile'
import type { User } from '../types/auth'

interface ProfileModalProps {
  user: User
  profile: Profile | null
  onProfileChange: (profile: Profile) => void
  onClose: () => void
  // Called after a successful account deletion so App can clear user,
  // profile, and favorites in one pass — the same reset sign-out already does.
  onAccountDeleted: () => void
}

// Local editable copy of the text/select/checkbox fields — separate from
// Profile so number fields can be plain strings while the user is typing
// (an empty <input type="number"> can't round-trip through `number | null`).
interface FormState {
  displayName: string
  phone: string
  location: string
  favoritePlayerId: string
  favoriteNumber: string
  fanSince: string
  notifyDailyBriefing: boolean
  notifyOnThisDay: boolean
  notifyGameReminders: boolean
}

const EMPTY_FORM: FormState = {
  displayName: '',
  phone: '',
  location: '',
  favoritePlayerId: '',
  favoriteNumber: '',
  fanSince: '',
  notifyDailyBriefing: false,
  notifyOnThisDay: false,
  notifyGameReminders: false,
}

function formFrom(profile: Profile): FormState {
  return {
    displayName: profile.displayName ?? '',
    phone: profile.phone ?? '',
    location: profile.location ?? '',
    favoritePlayerId: profile.favoritePlayerId !== null ? String(profile.favoritePlayerId) : '',
    favoriteNumber: profile.favoriteNumber ?? '',
    fanSince: profile.fanSince !== null ? String(profile.fanSince) : '',
    notifyDailyBriefing: profile.notifyDailyBriefing,
    notifyOnThisDay: profile.notifyOnThisDay,
    notifyGameReminders: profile.notifyGameReminders,
  }
}

function updateFrom(form: FormState): ProfileUpdate {
  return {
    displayName: form.displayName.trim() || null,
    phone: form.phone.trim() || null,
    location: form.location.trim() || null,
    favoritePlayerId: form.favoritePlayerId !== '' ? Number(form.favoritePlayerId) : null,
    favoriteNumber: form.favoriteNumber.trim() || null,
    fanSince: form.fanSince !== '' ? Number(form.fanSince) : null,
    notifyDailyBriefing: form.notifyDailyBriefing,
    notifyOnThisDay: form.notifyOnThisDay,
    notifyGameReminders: form.notifyGameReminders,
  }
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 caret-phillies-navy placeholder:text-gray-500 focus:border-phillies-navy focus:outline-none disabled:bg-gray-50'
const labelClass = 'mb-1 block text-sm font-medium text-gray-700'

// Modal mechanics (backdrop click, Escape, role="dialog", stopPropagation,
// the load-bearing text-gray-900) are copied from AuthWidget — this panel
// also renders inside the text-white header.
export default function ProfileModal({
  user,
  profile,
  onProfileChange,
  onClose,
  onAccountDeleted,
}: ProfileModalProps) {
  const [form, setForm] = useState<FormState>(profile !== null ? formFrom(profile) : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [avatarWorking, setAvatarWorking] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [roster, setRoster] = useState<RosterEntry[] | null>(null)
  const [rosterFailed, setRosterFailed] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Hydrate the form from the first profile that arrives, and only that
  // first one — NOT on every profile-prop change. updateAvatar's response
  // also flows through onProfileChange, and re-syncing on every profile
  // change would silently discard any unsaved edits to the other fields
  // (display name, phone, ...) the moment a photo save landed, since the
  // avatar-only response reflects the *old* values for everything else.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (profile !== null && !hydratedRef.current) {
      setForm(formFrom(profile))
      hydratedRef.current = true
    }
  }, [profile])

  const [profileLoadFailed, setProfileLoadFailed] = useState(false)

  // profile is usually already resolved by the time this modal opens (App
  // fetches it right after sign-in), but that fetch can still be in flight,
  // or may have failed soft to null (fetchProfile's documented contract —
  // same as fetchCurrentUser). Retry once here so the modal can distinguish
  // "still loading" from "failed to load" instead of spinning forever.
  useEffect(() => {
    if (profile !== null) return
    let cancelled = false
    fetchProfile().then(result => {
      if (cancelled) return
      if (result !== null) onProfileChange(result)
      else setProfileLoadFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [profile, onProfileChange])

  function retryProfileLoad() {
    setProfileLoadFailed(false)
    fetchProfile().then(result => {
      if (result !== null) onProfileChange(result)
      else setProfileLoadFailed(true)
    })
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetchRoster()
      .then(r => {
        if (!cancelled) setRoster(r)
      })
      .catch(() => {
        if (!cancelled) setRosterFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sortedRoster = useMemo(
    () => (roster ?? []).slice().sort((a, b) => a.person.fullName.localeCompare(b.person.fullName)),
    [roster]
  )

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const next = await updateProfile(updateFrom(form))
      onProfileChange(next)
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file === undefined) return
    setAvatarWorking(true)
    setAvatarError(null)
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      const next = await updateAvatar(dataUrl)
      onProfileChange(next)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't update your photo.")
    } finally {
      setAvatarWorking(false)
    }
  }

  async function handleAvatarRemove() {
    setAvatarWorking(true)
    setAvatarError(null)
    try {
      const next = await updateAvatar(null)
      onProfileChange(next)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't remove your photo.")
    } finally {
      setAvatarWorking(false)
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    if (passwordSubmitting) return
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    setPasswordSubmitting(true)
    setPasswordError(null)
    setPasswordSuccess(false)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  async function handleDeleteSubmit(e: FormEvent) {
    e.preventDefault()
    if (deleteSubmitting) return
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.')
      return
    }
    setDeleteSubmitting(true)
    setDeleteError(null)
    try {
      await deleteAccount(deletePassword)
      onAccountDeleted()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setDeleteSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your profile"
        // text-gray-900 is load-bearing: this modal renders inside the header,
        // which sets text-white — see AuthWidget for the same note.
        className="flex h-full w-full flex-col overflow-y-auto bg-white text-gray-900 shadow-2xl sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="font-display text-xl uppercase tracking-wide text-phillies-navy">
            Your Profile
          </h2>
          <button
            type="button"
            aria-label="Close profile"
            onClick={onClose}
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

        <div className="space-y-6 px-6 py-5">
          {profile === null ? (
            profileLoadFailed ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-red-600">
                  Couldn't load your profile.
                </p>
                <button
                  type="button"
                  onClick={retryProfileLoad}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Loading your profile…</p>
            )
          ) : (
            <form className="space-y-6" onSubmit={handleSave}>
              <section className="space-y-3">
                <h3 className="card-label">You</h3>

                <div className="flex items-center gap-4">
                  {profile.avatarDataUrl ? (
                    <img
                      src={profile.avatarDataUrl}
                      alt=""
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-phillies-navy font-display text-xl text-white">
                      {profileInitials(profile, user)}
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={avatarWorking}
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {avatarWorking ? 'Working…' : 'Change photo'}
                      </button>
                      {profile.avatarDataUrl !== null && (
                        <button
                          type="button"
                          disabled={avatarWorking}
                          onClick={handleAvatarRemove}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleAvatarPick}
                    />
                    {avatarError !== null && (
                      <p role="alert" className="text-xs text-red-600">
                        {avatarError}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="profile-display-name" className={labelClass}>
                    Display name
                  </label>
                  <input
                    id="profile-display-name"
                    type="text"
                    value={form.displayName}
                    maxLength={60}
                    onChange={e => setForm({ ...form, displayName: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="profile-phone" className={labelClass}>
                    Phone number
                  </label>
                  <input
                    id="profile-phone"
                    type="tel"
                    value={form.phone}
                    maxLength={32}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="profile-location" className={labelClass}>
                    Hometown
                  </label>
                  <input
                    id="profile-location"
                    type="text"
                    value={form.location}
                    maxLength={80}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="card-label">Phillies</h3>

                <div>
                  <label htmlFor="profile-favorite-player" className={labelClass}>
                    Favorite player
                  </label>
                  <select
                    id="profile-favorite-player"
                    value={form.favoritePlayerId}
                    disabled={rosterFailed}
                    onChange={e => setForm({ ...form, favoritePlayerId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    {sortedRoster.map(entry => (
                      <option key={entry.person.id} value={entry.person.id}>
                        {entry.person.fullName}
                      </option>
                    ))}
                  </select>
                  {rosterFailed && (
                    <p className="mt-1 text-xs text-gray-500">
                      Couldn't load the roster — try again later.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="profile-favorite-number" className={labelClass}>
                    Favorite jersey number
                  </label>
                  <input
                    id="profile-favorite-number"
                    type="text"
                    inputMode="numeric"
                    value={form.favoriteNumber}
                    maxLength={3}
                    onChange={e => setForm({ ...form, favoriteNumber: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="profile-fan-since" className={labelClass}>
                    Fan since
                  </label>
                  <input
                    id="profile-fan-since"
                    type="number"
                    inputMode="numeric"
                    min={1883}
                    max={new Date().getFullYear()}
                    value={form.fanSince}
                    onChange={e => setForm({ ...form, fanSince: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="card-label">Notifications</h3>
                <p className="text-xs text-gray-500">
                  We send one email each morning to <strong>{user.email}</strong>, with whichever
                  sections you pick below. Unsubscribe any time from the link in the email, or by
                  clearing these boxes.
                </p>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.notifyDailyBriefing}
                    onChange={e => setForm({ ...form, notifyDailyBriefing: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-phillies-red focus:ring-phillies-red"
                  />
                  Email me the daily briefing
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.notifyOnThisDay}
                    onChange={e => setForm({ ...form, notifyOnThisDay: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-phillies-red focus:ring-phillies-red"
                  />
                  Email me "On this day"
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.notifyGameReminders}
                    onChange={e => setForm({ ...form, notifyGameReminders: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-phillies-red focus:ring-phillies-red"
                  />
                  Remind me before game time
                </label>
                {/* Scoped to this one pref now that the other two actually
                    send -- the old blanket "we don't send anything yet" line
                    above them would be false. */}
                <p className="text-xs text-gray-500">
                  Game reminders aren't built yet — that box just saves your preference for when
                  they are.
                </p>
              </section>

              {saveError !== null && (
                <p role="alert" className="text-sm text-red-600">
                  {saveError}
                </p>
              )}
              {saved && saveError === null && (
                <p className="text-sm text-green-700">Saved.</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-phillies-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          )}

          <section className="space-y-3 border-t border-gray-200 pt-5">
            <h3 className="card-label">Account</h3>

            <form className="space-y-3" onSubmit={handlePasswordSubmit}>
              <p className="text-sm font-semibold text-gray-700">Change password</p>
              <div>
                <label htmlFor="profile-current-password" className={labelClass}>
                  Current password
                </label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  disabled={passwordSubmitting}
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="profile-new-password" className={labelClass}>
                  New password
                </label>
                <input
                  id="profile-new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  disabled={passwordSubmitting}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={200}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="profile-confirm-password" className={labelClass}>
                  Confirm new password
                </label>
                <input
                  id="profile-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={passwordSubmitting}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={200}
                  required
                  className={inputClass}
                />
              </div>
              {passwordError !== null && (
                <p role="alert" className="text-sm text-red-600">
                  {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-green-700">
                  Password changed. Your other devices have been signed out.
                </p>
              )}
              <button
                type="submit"
                disabled={passwordSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {passwordSubmitting ? 'Changing…' : 'Change password'}
              </button>
            </form>

            <div className="border-t border-gray-100 pt-4">
              {!deleteOpen ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Delete account
                </button>
              ) : (
                <form className="space-y-3" onSubmit={handleDeleteSubmit}>
                  <p className="text-sm text-gray-700">
                    This closes your account and frees {user.email} to be used again. Your data
                    will no longer appear anywhere in the app.
                  </p>
                  <div>
                    <label htmlFor="profile-delete-password" className={labelClass}>
                      Password
                    </label>
                    <input
                      id="profile-delete-password"
                      type="password"
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                      disabled={deleteSubmitting}
                      autoComplete="current-password"
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-delete-confirm" className={labelClass}>
                      Type DELETE to confirm
                    </label>
                    <input
                      id="profile-delete-confirm"
                      type="text"
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      disabled={deleteSubmitting}
                      required
                      className={inputClass}
                    />
                  </div>
                  {deleteError !== null && (
                    <p role="alert" className="text-sm text-red-600">
                      {deleteError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={deleteSubmitting}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteSubmitting ? 'Deleting…' : 'Permanently delete account'}
                    </button>
                    <button
                      type="button"
                      disabled={deleteSubmitting}
                      onClick={() => {
                        setDeleteOpen(false)
                        setDeleteError(null)
                        setDeletePassword('')
                        setDeleteConfirmText('')
                      }}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
