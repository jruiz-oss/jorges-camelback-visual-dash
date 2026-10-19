import { NextResponse } from 'next/server'
import { requireAdminForClient } from '@/lib/admin-auth'
import { formatAdFilterEnv } from '@/lib/ad-filter'
import { adFilterEnvName, getAdFilter } from '@/lib/ad-filter-store'

/**
 * Read-only: the ad filter currently in effect for one client, plus the Vercel
 * env var name it comes from. Admin session + that client's login cookie
 * required — the terms can name another agency, so they're never put in the
 * public page payload.
 *
 * GET ?client=slug → { filter, value, envVar }
 */

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })
  const filter = getAdFilter(client) ?? {}
  return NextResponse.json(
    { filter, value: formatAdFilterEnv(filter), envVar: adFilterEnvName(client) },
    { headers: NO_CACHE },
  )
}
