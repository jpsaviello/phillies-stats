// Neon Postgres connection for the auth routes. Framework-agnostic, same
// no-Hono-import rule as core.ts.
//
// A Pool is a stateful connection manager, so it can't follow core.ts/chat.ts's
// literal "construct from process.env on every call" convention without leaking
// connections. Reconciled: DATABASE_URL is still READ every call (so a pod that
// starts without the secret keeps reporting "not configured" rather than
// caching that verdict), but the Pool itself is built once, lazily, the first
// time a connection string is actually present, then reused for the process
// lifetime.
//
// Lifetime caveat matches the odds cache and the rate-limit counters: one pool
// for the long-running k8s replica, one per instance on Vercel (a cold start
// makes a fresh one). DATABASE_URL points at Neon's pooled (PgBouncer)
// endpoint, which is what makes that fan-out fine.

import { Pool } from 'pg'

let pool: Pool | undefined

export function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return null
  if (pool === undefined) {
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    // Required: an idle client erroring out (Neon scaling to zero, network
    // blip) emits on the pool, and an unhandled 'error' event would take the
    // whole process down.
    pool.on('error', err => console.error('pg pool error', err))
  }
  return pool
}
