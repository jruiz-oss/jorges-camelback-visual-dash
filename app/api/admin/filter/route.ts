import { NextResponse } from 'next/server'
import { requireAdminForClient } from '@/lib/admin-auth'
import { kvConfig, kvSetJson } from '@/lib/kv'
import { sanitizeAdFilter } from '@/lib/ad-filter'
import { adFilterKey, loadAdFilter } from '@/lib/ad-filter-store'

/**
 * Per-client ad filter, edited from the admin footer panel. Admin session +
 * that client's login cookie required (lib/admin-auth.ts).
 *
 * GET ?client=slug            → { filter, storage: 'ok' | 'missing' }
 * PUT ?client=slug { filter } → saves (empty filter = show everything)
 */

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })
  const filter = (await loadAdFilter(client.slug, client.adFilter)) ?? {}
  return NextResponse.json({ filter, storage: kvConfig() ? 'ok' : 'missing' }, { headers: NO_CACHE })
}

export async function PUT(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })
  if (!kvConfig()) {
    return NextResponse.json(
      { error: 'Storage is not connected (add Upstash Redis in Vercel → Storage).' },
      { status: 503, headers: NO_CACHE },
    )
  }
  let body: { filter?: unknown }
  try { body = await request.json() } catch { body = {} }
  const filter = sanitizeAdFilter(body.filter)
  if (!(await kvSetJson(adFilterKey(client.slug), filter))) {
    return NextResponse.json({ error: 'save failed' }, { status: 502, headers: NO_CACHE })
  }
  return NextResponse.json({ filter, storage: 'ok' }, { headers: NO_CACHE })
}
