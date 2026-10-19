/**
 * Shared key-value store (server only). Two backends, picked by env:
 *
 *   - REDIS_URL  — a normal Redis server (Railway's Redis service). Preferred.
 *     On Railway the web service references ${{Redis.REDIS_URL}} (private
 *     network); a Vercel deployment can point at the same database through its
 *     public TCP proxy URL so both hosts read and write the same settings.
 *   - UPSTASH_REDIS_REST_URL / _TOKEN or KV_REST_API_URL / _TOKEN — Upstash's
 *     HTTP API (the Vercel Marketplace integration). Kept as a fallback.
 *
 * Used by lib/rate-limit.ts (auth brute-force counters), the admin goals store,
 * the shared admin overrides (lib/overrides.ts) and the ad filter. Every call
 * returns null on any failure so a Redis outage degrades features instead of
 * throwing through a page render. Timeouts are short for the same reason.
 */

import Redis from 'ioredis'

type PipelineResult = Array<{ result?: unknown; error?: unknown }>

function upstashConfig(): { url: string; token: string } | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

/** True when some store is configured (it may still be unreachable). */
export function kvConfigured(): boolean {
  return !!process.env.REDIS_URL || !!upstashConfig()
}

// One client per server process. globalThis survives Next dev hot reloads.
const g = globalThis as unknown as { __adDashRedis?: Redis }
function redis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!g.__adDashRedis) {
    const client = new Redis(url, {
      // Railway's private network is IPv6-only; family 0 lets DNS pick v4 or v6
      // so the same code works on the private URL and the public proxy.
      family: 0,
      connectTimeout: 3000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      lazyConnect: false,
    })
    // ioredis reconnects on its own every couple of seconds; log at most
    // once per 30s so an outage doesn't flood the logs.
    let lastLog = 0
    client.on('error', err => {
      if (Date.now() - lastLog < 30_000) return
      lastLog = Date.now()
      console.error('[kv] redis error:', err.message)
    })
    g.__adDashRedis = client
  }
  return g.__adDashRedis
}

/** Run several Redis commands in one round trip. Null if unconfigured or failed. */
export async function kvPipeline(commands: string[][]): Promise<PipelineResult | null> {
  const client = redis()
  if (client) {
    try {
      // ioredis command names are lowercase methods ('get', not 'GET').
      const out = await client.pipeline(commands.map(([cmd, ...args]) => [cmd.toLowerCase(), ...args])).exec()
      if (!out) return null
      return out.map(([err, result]) => (err ? { error: err.message } : { result }))
    } catch (err) {
      console.error('[kv] pipeline failed:', err)
      return null
    }
  }

  const cfg = upstashConfig()
  if (!cfg) return null
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[kv] pipeline HTTP', res.status)
      return null
    }
    return (await res.json()) as PipelineResult
  } catch (err) {
    console.error('[kv] pipeline failed:', err)
    return null
  }
}

/** GET a JSON value. `undefined` = key missing, `null` = store unavailable. */
export async function kvGetJson<T>(key: string): Promise<T | undefined | null> {
  const out = await kvPipeline([['GET', key]])
  if (!out || out[0]?.error) return null
  const raw = out[0]?.result
  if (raw == null) return undefined
  try { return JSON.parse(String(raw)) as T } catch { return undefined }
}

/** SET a JSON value. Returns false if the store is unavailable. */
export async function kvSetJson(key: string, value: unknown): Promise<boolean> {
  const out = await kvPipeline([['SET', key, JSON.stringify(value)]])
  return !!out && out[0]?.result === 'OK'
}

/** DEL a key. Returns false if the store is unavailable. */
export async function kvDel(key: string): Promise<boolean> {
  const out = await kvPipeline([['DEL', key]])
  return !!out && !out[0]?.error
}
