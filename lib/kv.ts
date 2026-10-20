/**
 * Shared key-value store (server only), backed by Postgres via DATABASE_URL,
 * same setup as the other Railway projects.
 *
 *   - Railway: the web service references ${{Postgres.DATABASE_URL}} (private
 *     network).
 *   - Vercel: DATABASE_URL = the Postgres service's public URL
 *     (DATABASE_PUBLIC_URL in Railway), so both hosts share the same settings.
 *
 * Two small tables, created on first use (no migrations to run):
 *   kv_store    — JSON documents: admin overrides, ad filter, goals
 *   kv_counters — rate-limit counters with an expiry window
 *
 * Used by lib/rate-limit.ts, the admin goals store, lib/overrides.ts and the
 * ad filter. Every call returns null/false on any failure so a database outage
 * degrades features instead of throwing through a page render. Timeouts are
 * short for the same reason.
 */

import { Pool } from 'pg'

/** True when a database is configured (it may still be unreachable). */
export function kvConfigured(): boolean {
  return !!process.env.DATABASE_URL
}

// One small pool per server process. globalThis survives Next dev hot reloads.
// max 3: on Railway it's one process; on Vercel every warm instance gets its
// own pool, so keep it small to stay far under Postgres' connection limit.
const g = globalThis as unknown as { __adDashPg?: Pool; __adDashPgReady?: Promise<boolean> }

function pool(): Pool | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  if (!g.__adDashPg) {
    const noSsl = /\.railway\.internal(:|\/|$)/.test(url) || /[?&]sslmode=disable/.test(url)
    const p = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 3_000,
      query_timeout: 3_000,
      // Railway's Postgres uses a self-signed cert on its public proxy; the
      // private network needs no TLS (`?sslmode=disable` forces it off too).
      ssl: noSsl ? false : { rejectUnauthorized: false },
    })
    let lastLog = 0
    p.on('error', err => {
      if (Date.now() - lastLog < 30_000) return
      lastLog = Date.now()
      console.error('[kv] postgres error:', err.message)
    })
    g.__adDashPg = p
  }
  return g.__adDashPg
}

// Create the tables once per process. A failed attempt is retried next call.
async function ready(p: Pool): Promise<boolean> {
  if (!g.__adDashPgReady) {
    g.__adDashPgReady = p.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key        text PRIMARY KEY,
        value      jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS kv_counters (
        key        text PRIMARY KEY,
        count      integer NOT NULL,
        expires_at timestamptz NOT NULL
      );
    `).then(() => true).catch(err => {
      console.error('[kv] table setup failed:', err.message)
      g.__adDashPgReady = undefined
      return false
    })
  }
  return g.__adDashPgReady
}

async function db(): Promise<Pool | null> {
  const p = pool()
  if (!p) return null
  return (await ready(p)) ? p : null
}

/** GET a JSON value. `undefined` = key missing, `null` = store unavailable. */
export async function kvGetJson<T>(key: string): Promise<T | undefined | null> {
  try {
    const p = await db()
    if (!p) return null
    const r = await p.query('SELECT value FROM kv_store WHERE key = $1', [key])
    return r.rowCount ? (r.rows[0].value as T) : undefined
  } catch (err) {
    console.error('[kv] get failed:', (err as Error).message)
    return null
  }
}

/** SET a JSON value. Returns false if the store is unavailable. */
export async function kvSetJson(key: string, value: unknown): Promise<boolean> {
  try {
    const p = await db()
    if (!p) return false
    await p.query(
      `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    )
    return true
  } catch (err) {
    console.error('[kv] set failed:', (err as Error).message)
    return false
  }
}

/** DEL a key. Returns false if the store is unavailable. */
export async function kvDel(key: string): Promise<boolean> {
  try {
    const p = await db()
    if (!p) return false
    await p.query('DELETE FROM kv_store WHERE key = $1', [key])
    return true
  } catch (err) {
    console.error('[kv] delete failed:', (err as Error).message)
    return false
  }
}

/**
 * Increment a counter that resets `windowSec` after its first hit (fixed
 * window, like Redis INCR + EXPIRE NX). Returns the new count, or null if the
 * store is unavailable (the rate limiter then falls back to memory).
 */
export async function kvIncrWindow(key: string, windowSec: number): Promise<number | null> {
  try {
    const p = await db()
    if (!p) return null
    const r = await p.query(
      `INSERT INTO kv_counters (key, count, expires_at)
         VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (key) DO UPDATE SET
         count      = CASE WHEN kv_counters.expires_at <= now() THEN 1 ELSE kv_counters.count + 1 END,
         expires_at = CASE WHEN kv_counters.expires_at <= now() THEN now() + make_interval(secs => $2) ELSE kv_counters.expires_at END
       RETURNING count`,
      [key, windowSec],
    )
    // Opportunistic cleanup so the table doesn't grow forever under attack.
    if (Math.random() < 0.02) p.query('DELETE FROM kv_counters WHERE expires_at < now()').catch(() => {})
    return Number(r.rows[0]?.count) || null
  } catch (err) {
    console.error('[kv] incr failed:', (err as Error).message)
    return null
  }
}

/** Take one hit back off a live counter (never below 0). False if unavailable. */
export async function kvDecrWindow(key: string): Promise<boolean> {
  try {
    const p = await db()
    if (!p) return false
    await p.query(
      'UPDATE kv_counters SET count = GREATEST(count - 1, 0) WHERE key = $1 AND expires_at > now()',
      [key],
    )
    return true
  } catch (err) {
    console.error('[kv] decr failed:', (err as Error).message)
    return false
  }
}
