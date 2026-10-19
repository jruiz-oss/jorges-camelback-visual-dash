'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSegmentOverride } from './SegmentOverrideContext'
import type { Ad } from '@/lib/types'
import type { PerfPayload } from '@/lib/perf'
import {
  EMPTY_GOALS, addMetrics, pickDefaultEvent, scoreAgainstGoal, scoreRelative, sortEvents,
  type ClientGoals, type Goal, type PerfMetrics, type PerfPlatform, type Score,
} from '@/lib/goals'
import { campaignKey } from '@/lib/segments'

// Admin-only performance layer: 7-day metrics + shared goals, fetched from
// /api/admin/perf and /api/admin/goals ONLY while edit mode is unlocked.
// Nothing here runs for regular viewers, and the numbers never ship in the
// server-rendered HTML (they'd be readable in page source otherwise).
//
// Goal resolution per tile: campaign goal → platform account goal → relative
// CTR ranking inside the campaign (Meta only) → grey.

type Storage = 'ok' | 'missing' | 'error' | 'loading'

interface CtxValue {
  enabled:  boolean
  loading:  boolean
  error:    string | null
  perf:     PerfPayload | null
  goals:    ClientGoals
  storage:  Storage
  /** Meta action_types seen in the window, conversion-like first. */
  metaEvents: string[]
  /** What an empty goal.event resolves to for this account. */
  defaultMetaEvent: string | null
  refresh:  () => void
  scoreAd:  (ad: Ad, platform: string) => Score | null
  scoreCampaign: (platform: string, campaign: string | undefined, adIds: string[], saCampaignId?: string) => Score | null
  /** Effective goal + where it came from, for the campaign editor. */
  goalFor:  (platform: PerfPlatform, campaign: string | undefined) => { goal: Goal | null; source: 'campaign' | 'account' | 'none' }
  saveAccountGoal:  (platform: PerfPlatform, goal: Goal | null) => Promise<string | null>
  saveCampaignGoal: (key: string, goal: Goal | null) => Promise<string | null>
  saveBand:         (bandPct: number) => Promise<string | null>
}

const noop = async () => 'not available'
const Ctx = createContext<CtxValue>({
  enabled: false, loading: false, error: null, perf: null, goals: EMPTY_GOALS, storage: 'loading',
  metaEvents: [], defaultMetaEvent: null, refresh: () => {},
  scoreAd: () => null, scoreCampaign: () => null,
  goalFor: () => ({ goal: null, source: 'none' }),
  saveAccountGoal: noop, saveCampaignGoal: noop, saveBand: noop,
})

const isPerfPlatform = (p: string): p is PerfPlatform => p === 'meta' || p === 'stackadapt'

export function PerfProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const { editMode } = useSegmentOverride()
  const [perf, setPerf]       = useState<PerfPayload | null>(null)
  const [goals, setGoals]     = useState<ClientGoals>(EMPTY_GOALS)
  const [storage, setStorage] = useState<Storage>('loading')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true); setError(null)
    const q = `client=${encodeURIComponent(slug)}`
    try {
      const [pRes, gRes] = await Promise.all([
        fetch(`/api/admin/perf?${q}${fresh ? '&fresh=1' : ''}`, { cache: 'no-store' }),
        fetch(`/api/admin/goals?${q}`, { cache: 'no-store' }),
      ])
      if (pRes.status === 401 || gRes.status === 401) {
        setError('Admin session expired. Lock and unlock again.')
      } else {
        if (pRes.ok) setPerf(await pRes.json())
        else setError('Could not load performance data.')
        if (gRes.ok) {
          const g = await gRes.json()
          setGoals(g.goals ?? EMPTY_GOALS); setStorage(g.storage ?? 'error')
        } else setStorage('error')
      }
    } catch {
      setError('Could not load performance data.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  // Load when edit mode turns on; drop everything when it turns off.
  useEffect(() => {
    if (editMode) load(false)
    else { setPerf(null); setGoals(EMPTY_GOALS); setStorage('loading'); setError(null) }
  }, [editMode, load])

  const metaEvents = useMemo(() => sortEvents(perf?.meta.events ?? []), [perf])
  const defaultMetaEvent = useMemo(() => pickDefaultEvent(perf?.meta.actionTotals ?? {}), [perf])

  // Meta metrics grouped by campaign name (lowercased, same as campaignKey)
  // for relative ranking and campaign roll-ups.
  const metaByCampaign = useMemo(() => {
    const m = new Map<string, PerfMetrics[]>()
    for (const a of Object.values(perf?.meta.ads ?? {})) {
      const k = a.campaign.trim().toLowerCase()
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return m
  }, [perf])

  const goalFor = useCallback((platform: PerfPlatform, campaign: string | undefined) => {
    const c = goals.campaigns[campaignKey(platform, campaign)]
    if (c) return { goal: c, source: 'campaign' as const }
    const a = goals.account[platform]
    if (a) return { goal: a, source: 'account' as const }
    return { goal: null, source: 'none' as const }
  }, [goals])

  const windowLabel = perf?.window.label ?? 'last 7 days'

  const score = useCallback((m: PerfMetrics | undefined, platform: PerfPlatform, campaign: string | undefined, allowRelative: boolean): Score | null => {
    if (!perf) return null
    if (!m) return { color: 'grey', label: 'No 7d data', source: 'none', detail: `No delivery in the ${windowLabel}` }
    const { goal, source } = goalFor(platform, campaign)
    if (goal) {
      const event = platform === 'meta' ? (goal.event || defaultMetaEvent) : null
      return scoreAgainstGoal(m, goal, platform, event, goals.bandPct, source, windowLabel)
    }
    if (allowRelative && platform === 'meta') {
      return scoreRelative(m, metaByCampaign.get((campaign ?? '').trim().toLowerCase()) ?? [], windowLabel)
    }
    return { color: 'grey', label: 'Set a goal', source: 'none', detail: `No goal set for this campaign or account · ${windowLabel}` }
  }, [perf, goalFor, defaultMetaEvent, goals.bandPct, metaByCampaign, windowLabel])

  const scoreAd = useCallback((ad: Ad, platform: string): Score | null => {
    if (!editMode || !perf || !isPerfPlatform(platform)) return null
    if (platform === 'meta') {
      if (!perf.meta.ok) return { color: 'grey', label: 'Meta error', source: 'none', detail: perf.meta.error ?? 'Meta metrics unavailable' }
      return score(perf.meta.ads[ad.id], 'meta', ad.campaign, true)
    }
    if (!perf.stackadapt.ok) return { color: 'grey', label: 'No SA data', source: 'none', detail: perf.stackadapt.error ?? 'StackAdapt metrics unavailable' }
    return score(ad.campaignId ? perf.stackadapt.campaigns[ad.campaignId] : undefined, 'stackadapt', ad.campaign, false)
  }, [editMode, perf, score])

  const scoreCampaign = useCallback((platform: string, campaign: string | undefined, adIds: string[], saCampaignId?: string): Score | null => {
    if (!editMode || !perf || !isPerfPlatform(platform)) return null
    let m: PerfMetrics | undefined
    if (platform === 'meta') {
      if (!perf.meta.ok) return null
      // Roll up only the ads on this lane (a campaign can be split across
      // segments by manual moves; the lane's own ads are what you're looking at).
      for (const id of adIds) { const x = perf.meta.ads[id]; if (x) m = m ? addMetrics(m, x) : { ...x } }
    } else {
      if (!perf.stackadapt.ok) return null
      m = saCampaignId ? perf.stackadapt.campaigns[saCampaignId] : undefined
    }
    return score(m, platform, campaign, false)
  }, [editMode, perf, score])

  const put = useCallback(async (body: unknown): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/goals?client=${encodeURIComponent(slug)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return data.error ?? `Save failed (${res.status})`
      setGoals(data.goals); setStorage('ok')
      return null
    } catch {
      return 'Save failed (network)'
    }
  }, [slug])

  const value: CtxValue = {
    enabled: editMode, loading, error, perf, goals, storage, metaEvents, defaultMetaEvent,
    refresh: () => load(true),
    scoreAd, scoreCampaign, goalFor,
    saveAccountGoal:  (platform, goal) => put({ scope: 'account', platform, goal }),
    saveCampaignGoal: (key, goal)      => put({ scope: 'campaign', key, goal }),
    saveBand:         bandPct          => put({ scope: 'settings', bandPct }),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePerf() { return useContext(Ctx) }
