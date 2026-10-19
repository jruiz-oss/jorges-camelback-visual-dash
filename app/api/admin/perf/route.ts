import { NextResponse } from 'next/server'
import { requireAdminForClient } from '@/lib/admin-auth'
import { getPerf } from '@/lib/perf'

/**
 * Admin-only 7-day performance metrics for one client (see lib/perf.ts).
 * Called by components/PerfContext.tsx when edit mode is unlocked — never
 * during the normal page render, so viewers never trigger these API calls
 * and spend/CPA numbers never reach a non-admin browser.
 *
 * GET ?client=slug[&fresh=1]  — fresh bypasses the 10 min cache (but not
 * more often than once a minute per client).
 */

export const runtime = 'nodejs'
export const maxDuration = 30
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const client = await requireAdminForClient(request, params.get('client'))
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })

  const p = client.envPrefix
  const data = await getPerf(client.slug, {
    metaAccountId:  process.env[`${p}_META_AD_ACCOUNT_ID`] ?? '',
    saApiKey:       process.env[`${p}_STACKADAPT_API_KEY`] ?? '',
    saAdvertiserId: process.env[`${p}_STACKADAPT_ADVERTISER_ID`] || client.stackadaptAdvertiserId,
  }, params.get('fresh') === '1')
  return NextResponse.json(data, { headers: NO_CACHE })
}
