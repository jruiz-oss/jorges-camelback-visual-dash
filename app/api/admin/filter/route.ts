import { NextResponse } from 'next/server'
import { requireAdminForClient } from '@/lib/admin-auth'
import { formatAdFilterEnv } from '@/lib/ad-filter'
import { kvConfigured } from '@/lib/kv'
import {
  adFilterEnvName, getAdFilter, getDefaultAdFilter, saveAdFilter, sanitizeAdFilter,
} from '@/lib/ad-filter-store'

/**
 * The ad filter for one client (lib/ad-filter-store.ts). Admin session + that
 * client's login cookie required — the terms can name another agency, so
 * they're never put in the public page payload.
 *
 * GET ?client=slug → { filter, value, source, envVar, envValue, storage }
 * PUT ?client=slug { filter: AdFilter | null } → saves for every viewer
 *     (null clears the saved filter, falling back to the env/code default)
 */

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })
  const { filter = {}, source } = await getAdFilter(client)
  const def = getDefaultAdFilter(client)
  return NextResponse.json(
    {
      filter, source,
      value:    formatAdFilterEnv(filter),
      envVar:   adFilterEnvName(client),
      envValue: def.filter ? formatAdFilterEnv(def.filter) : '',
      storage:  kvConfigured() ? 'ok' : 'missing',
    },
    { headers: NO_CACHE },
  )
}

export async function PUT(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { body = {} }
  // null or an empty filter clears the saved one (back to the env/code default).
  const filter = sanitizeAdFilter(body.filter)
  if (!(await saveAdFilter(client, filter))) {
    return NextResponse.json({ error: 'Filter storage is unavailable (set REDIS_URL, see DEPLOY.md).' }, { status: 503, headers: NO_CACHE })
  }
  const now = await getAdFilter(client)
  return NextResponse.json(
    { filter: now.filter ?? {}, source: now.source, value: formatAdFilterEnv(now.filter ?? {}) },
    { headers: NO_CACHE },
  )
}
