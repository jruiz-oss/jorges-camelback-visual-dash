import { NextResponse } from 'next/server'
import { requireAdminForClient } from '@/lib/admin-auth'
import { applyOp, loadOverrides, saveOverrides } from '@/lib/overrides'

/**
 * Shared admin overrides for one client (lib/overrides.ts): renames, colors,
 * order, moves, admin-created segments, view mode. Admin session + that
 * client's login cookie required (lib/admin-auth.ts).
 *
 * PUT ?client=slug with ONE op per request (see OverrideOp). The server reads
 * the current doc, applies the op, validates and writes it back.
 * Reads happen in app/[client]/page.tsx, so there is no GET.
 */

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function PUT(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })

  const current = await loadOverrides(client.slug)
  if (current.storage !== 'ok') {
    return NextResponse.json(
      { error: current.storage === 'missing'
          ? 'Settings storage is not connected (set REDIS_URL, see DEPLOY.md).'
          : 'Settings storage is unreachable right now. Try again in a minute.' },
      { status: 503, headers: NO_CACHE },
    )
  }

  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const next = applyOp(current.overrides, body)
  if (typeof next === 'string') {
    return NextResponse.json({ error: next }, { status: 400, headers: NO_CACHE })
  }
  if (!(await saveOverrides(client.slug, next))) {
    return NextResponse.json({ error: 'save failed' }, { status: 502, headers: NO_CACHE })
  }
  return NextResponse.json({ overrides: next }, { headers: NO_CACHE })
}
