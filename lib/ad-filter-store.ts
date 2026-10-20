/**
 * Where a client's ad filter comes from (server only), first match wins:
 *   1. 'saved' — set by an admin from the footer "Filter" panel, stored in
 *      the database under `adfilter:v1:<slug>` (lib/kv.ts). Applies to every viewer.
 *   2. 'env'   — the {PREFIX}_AD_FILTER env var (format in lib/ad-filter.ts).
 *   3. 'code'  — the optional `adFilter` in lib/clients.ts.
 * If the database is unreachable the env/code default is used (logged), same as when
 * nothing is saved. The terms can name another agency, so they are never put
 * in the page payload — only /api/admin/filter returns them.
 */

import type { ClientConfig } from './clients'
import { parseAdFilterEnv, type AdFilter } from './ad-filter'
import { kvConfigured, kvDel, kvGetJson, kvSetJson } from './kv'

export type AdFilterSource = 'saved' | 'env' | 'code' | 'none'

export const adFilterEnvName = (client: ClientConfig) => `${client.envPrefix}_AD_FILTER`
const keyFor = (slug: string) => `adfilter:v1:${slug}`

const KEYS = ['all', 'meta', 'google', 'stackadapt'] as const

/** Validate a filter from the database or a PUT body. Empty → undefined. */
export function sanitizeAdFilter(raw: unknown): AdFilter | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const terms = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((t): t is string => typeof t === 'string').map(t => t.trim().slice(0, 80)).filter(Boolean).slice(0, 50)
      : []
  const out: AdFilter = {}
  for (const k of KEYS) {
    const rule = r[k] as Record<string, unknown> | undefined
    if (!rule || typeof rule !== 'object') continue
    const include = terms(rule.include), exclude = terms(rule.exclude)
    if (include.length || exclude.length) out[k] = { ...(include.length && { include }), ...(exclude.length && { exclude }) }
  }
  return Object.keys(out).length ? out : undefined
}

function defaultFilter(client: ClientConfig): { filter?: AdFilter; source: AdFilterSource } {
  const env = parseAdFilterEnv(process.env[adFilterEnvName(client)])
  if (env) return { filter: env, source: 'env' }
  if (client.adFilter) return { filter: client.adFilter, source: 'code' }
  return { source: 'none' }
}

export async function getAdFilter(client: ClientConfig): Promise<{ filter?: AdFilter; source: AdFilterSource }> {
  if (kvConfigured()) {
    const raw = await kvGetJson<unknown>(keyFor(client.slug))
    if (raw === null) console.error(`[ad-filter] database read failed for ${client.slug} — using env/code default`)
    else if (raw !== undefined) {
      const saved = sanitizeAdFilter(raw)
      if (saved) return { filter: saved, source: 'saved' }
    }
  }
  return defaultFilter(client)
}

/** Save (or clear with `undefined`) the admin filter. False = store unavailable. */
export async function saveAdFilter(client: ClientConfig, filter: AdFilter | undefined): Promise<boolean> {
  if (!kvConfigured()) return false
  return filter ? kvSetJson(keyFor(client.slug), filter) : kvDel(keyFor(client.slug))
}

export { defaultFilter as getDefaultAdFilter }
