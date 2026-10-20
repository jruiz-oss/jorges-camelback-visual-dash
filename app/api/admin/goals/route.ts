import { NextResponse } from 'next/server'
import { requireAdminForClient } from '@/lib/admin-auth'
import { kvConfigured, kvGetJson, kvSetJson } from '@/lib/kv'
import {
  EMPTY_GOALS, sanitizeGoal, sanitizeGoals, isCampaignKey,
  type ClientGoals, type PerfPlatform,
} from '@/lib/goals'

/**
 * Shared performance goals for one client, stored in Postgres (lib/kv.ts) under
 * `goals:v1:<slug>`. Admin session + that client's login cookie required
 * (lib/admin-auth.ts).
 *
 * GET  ?client=slug → { goals, storage: 'ok' | 'missing' | 'error' }
 * PUT  ?client=slug with ONE change per request:
 *        { scope: 'account',  platform: 'meta'|'stackadapt', goal: Goal|null }
 *        { scope: 'campaign', key: campaignKey,               goal: Goal|null }
 *        { scope: 'settings', bandPct: number }
 *      The server reads the current doc, applies the change, and writes it
 *      back, so two admins editing different campaigns don't overwrite each
 *      other (whole-doc PUTs from the browser would).
 */

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const keyFor = (slug: string) => `goals:v1:${slug}`

async function load(slug: string): Promise<{ goals: ClientGoals; storage: 'ok' | 'missing' | 'error' }> {
  if (!kvConfigured()) return { goals: EMPTY_GOALS, storage: 'missing' }
  const raw = await kvGetJson<unknown>(keyFor(slug))
  if (raw === null) return { goals: EMPTY_GOALS, storage: 'error' }
  return { goals: raw === undefined ? EMPTY_GOALS : sanitizeGoals(raw), storage: 'ok' }
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })
  return NextResponse.json(await load(client.slug), { headers: NO_CACHE })
}

export async function PUT(request: Request) {
  const slug = new URL(request.url).searchParams.get('client')
  const client = await requireAdminForClient(request, slug)
  if (!client) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_CACHE })

  const current = await load(client.slug)
  if (current.storage !== 'ok') {
    return NextResponse.json(
      { error: current.storage === 'missing'
          ? 'Goals storage is not connected (set DATABASE_URL — see DEPLOY.md).'
          : 'Goals storage is unreachable right now.' },
      { status: 503, headers: NO_CACHE },
    )
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { body = {} }
  const next: ClientGoals = {
    ...current.goals,
    account:   { ...current.goals.account },
    campaigns: { ...current.goals.campaigns },
  }

  // `goal: null` clears; anything else must validate or the request fails
  // (never silently store half of a bad goal).
  const parseGoal = () => {
    if (body.goal === null) return { clear: true as const }
    const g = sanitizeGoal(body.goal)
    return g ? { goal: g } : null
  }

  if (body.scope === 'account') {
    const platform = body.platform as PerfPlatform
    if (platform !== 'meta' && platform !== 'stackadapt') return bad('bad platform')
    const g = parseGoal()
    if (!g) return bad('bad goal')
    if ('clear' in g) delete next.account[platform]
    else next.account[platform] = g.goal
  } else if (body.scope === 'campaign') {
    const key = typeof body.key === 'string' ? body.key : ''
    if (!isCampaignKey(key)) return bad('bad campaign key')
    const g = parseGoal()
    if (!g) return bad('bad goal')
    if ('clear' in g) delete next.campaigns[key]
    else {
      if (!(key in next.campaigns) && Object.keys(next.campaigns).length >= 500) return bad('too many campaign goals')
      next.campaigns[key] = g.goal
    }
  } else if (body.scope === 'settings') {
    const band = Number(body.bandPct)
    if (!Number.isFinite(band) || band < 1 || band > 100) return bad('bad band')
    next.bandPct = Math.round(band)
  } else {
    return bad('bad scope')
  }

  next.updatedAt = new Date().toISOString()
  const ok = await kvSetJson(keyFor(client.slug), next)
  if (!ok) return NextResponse.json({ error: 'save failed' }, { status: 502, headers: NO_CACHE })
  return NextResponse.json({ goals: next, storage: 'ok' }, { headers: NO_CACHE })
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400, headers: NO_CACHE })
}
