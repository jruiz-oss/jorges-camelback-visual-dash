'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

// Persists custom segment name overrides, segment display order, and
// per-ad segment reassignments in browser storage so they survive page
// refreshes. Edit mode is PIN-gated — the PIN is checked server-side against
// the ADMIN_PIN env var (POST /api/admin-unlock). Previous versions inlined
// NEXT_PUBLIC_ADMIN_PIN into the client bundle, which any visitor could
// read in devtools.
//
// Name/order/color overrides are pure display tweaks applied client-side
// (see SegmentOrderStyle / SegmentColorStyle) after the server has already
// rendered the wall. Ad-segment reassignment is different: which segment an
// ad belongs to decides which server-rendered section it appears under, so
// that override has to be visible to the server component that does the
// bucketing (app/[client]/page.tsx). It's stored as a COOKIE rather than
// localStorage for that reason — cookies ride along on every request,
// localStorage doesn't. After writing the cookie we call router.refresh()
// so the wall re-buckets immediately instead of waiting for the next
// 60s soft-poll tick.
//
// Whole-campaign moves live in their OWN cookie keyed by campaign
// (lib/segments.ts campaignKey), not as one per-ad entry per tile. Two reasons:
// a Google RSA explodes into ~15 tiles with ids like "123456789-7", so a few
// 30-tile campaigns written per-ad would blow past the browser's ~4KB cookie
// limit (the browser then silently drops the whole cookie and every override
// vanishes); and exploded tile ids shift when headlines are added, while a
// campaign key keeps holding as the campaign's ads change.
// Server precedence (app/[client]/page.tsx): per-ad > campaign > auto.

const STORAGE_KEY      = 'seg-name-overrides-v1'
const ORDER_KEY        = 'seg-order-v1'
const COLOR_KEY        = 'seg-color-overrides-v1'
const AD_SEGMENT_COOKIE       = 'ad-seg-overrides-v1'
const CAMPAIGN_SEGMENT_COOKIE = 'camp-seg-overrides-v1'
// Browsers cap a single cookie at ~4096 bytes (name + value). Warn well before.
const COOKIE_SOFT_LIMIT = 3800

type Overrides   = Record<string, string> // segmentId → custom display name
type Colors      = Record<string, string> // segmentId → custom accent hex
type AdSegments  = Record<string, string> // adId → segmentId the admin moved it to
type CampSegments = Record<string, string> // campaignKey → segmentId

function readJsonCookie(name: string): Record<string, string> {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    if (!match) return {}
    const parsed = JSON.parse(decodeURIComponent(match[1]))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeJsonCookie(name: string, map: Record<string, string>) {
  try {
    const value = encodeURIComponent(JSON.stringify(map))
    if (name.length + value.length > COOKIE_SOFT_LIMIT) {
      console.warn(
        `[overrides] ${name} is ${value.length} bytes — near the browser's 4KB cookie cap. ` +
        `Prefer campaign-level moves over many per-tile moves.`
      )
    }
    // 1 year expiry, same-site so it still rides along on the soft-poll
    // router.refresh() calls TopBar makes on this same origin.
    document.cookie = `${name}=${value};path=/;max-age=31536000;samesite=lax`
  } catch {}
}

interface CtxValue {
  editMode:        boolean
  getName:         (id: string, fallback: string) => string
  setName:         (id: string, name: string) => void
  /** Resolve a segment's accent — admin override if set, else the fallback. */
  getColor:        (id: string, fallback: string) => string
  /** Save a custom accent for a segment (admin mode). */
  setColor:        (id: string, color: string) => void
  /** Clear a segment's custom accent, reverting to its default. */
  resetColor:      (id: string) => void
  /** Raw override map — used by the style injector to re-render on change. */
  colorOverrides:  Colors
  unlock:          (pin: string) => Promise<boolean>
  lock:            () => void
  /** Ordered list of segment IDs. Empty = use server-rendered order. */
  segmentOrder:    string[]
  setSegmentOrder: (ids: string[]) => void
  /** adId → segmentId for ads the admin has manually moved. */
  adSegmentOverrides: AdSegments
  /** Move a single ad into a different segment (persists + refreshes the wall). */
  setAdSegment:    (adId: string, segmentId: string) => void
  /** Undo a manual move, letting the ad fall back to auto-classification. */
  clearAdSegment:  (adId: string) => void
  /** campaignKey → segmentId for whole campaigns the admin has moved. */
  campaignSegmentOverrides: CampSegments
  /** Move a whole campaign. Also drops any per-tile moves for `adIds` so the
   *  campaign move isn't silently out-voted by an older single-tile move. */
  setCampaignSegment:   (key: string, segmentId: string, adIds: string[]) => void
  /** Undo a campaign move plus any per-tile moves inside it. */
  clearCampaignSegment: (key: string, adIds: string[]) => void
}

const Ctx = createContext<CtxValue>({
  editMode:           false,
  getName:            (_, f) => f,
  setName:            () => {},
  getColor:           (_, f) => f,
  setColor:           () => {},
  resetColor:         () => {},
  colorOverrides:     {},
  unlock:             async () => false,
  lock:               () => {},
  segmentOrder:       [],
  setSegmentOrder:    () => {},
  adSegmentOverrides: {},
  setAdSegment:       () => {},
  clearAdSegment:     () => {},
  campaignSegmentOverrides: {},
  setCampaignSegment:   () => {},
  clearCampaignSegment: () => {},
})

export function SegmentOverrideProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [editMode, setEditMode]             = useState(false)
  const [overrides, setOverrides]           = useState<Overrides>({})
  const [colorOverrides, setColors]         = useState<Colors>({})
  const [segmentOrder, setOrderState]       = useState<string[]>([])
  const [adSegmentOverrides, setAdOverrides] = useState<AdSegments>({})
  const [campaignSegmentOverrides, setCampOverrides] = useState<CampSegments>({})

  // Hydrate from localStorage / cookies on mount (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setOverrides(JSON.parse(raw))
    } catch {}
    try {
      const rawOrder = localStorage.getItem(ORDER_KEY)
      if (rawOrder) setOrderState(JSON.parse(rawOrder))
    } catch {}
    try {
      const rawColors = localStorage.getItem(COLOR_KEY)
      if (rawColors) setColors(JSON.parse(rawColors))
    } catch {}
    setAdOverrides(readJsonCookie(AD_SEGMENT_COOKIE))
    setCampOverrides(readJsonCookie(CAMPAIGN_SEGMENT_COOKIE))
  }, [])

  function getName(id: string, fallback: string): string {
    return overrides[id] ?? fallback
  }

  function setName(id: string, name: string) {
    const trimmed = name.trim()
    // Saving a blank name clears the override (back to the default name) —
    // previously blank was ignored, so a rename could never be undone.
    setOverrides(prev => {
      const next = { ...prev }
      if (trimmed) next[id] = trimmed
      else delete next[id]
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function getColor(id: string, fallback: string): string {
    return colorOverrides[id] ?? fallback
  }

  function setColor(id: string, color: string) {
    setColors(prev => {
      const next = { ...prev, [id]: color }
      try { localStorage.setItem(COLOR_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function resetColor(id: string) {
    setColors(prev => {
      const next = { ...prev }
      delete next[id]
      try { localStorage.setItem(COLOR_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function setSegmentOrder(ids: string[]) {
    setOrderState(ids)
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)) } catch {}
  }

  function setAdSegment(adId: string, segmentId: string) {
    setAdOverrides(prev => {
      const next = { ...prev, [adId]: segmentId }
      writeJsonCookie(AD_SEGMENT_COOKIE, next)
      return next
    })
    router.refresh()
  }

  function clearAdSegment(adId: string) {
    setAdOverrides(prev => {
      const next = { ...prev }
      delete next[adId]
      writeJsonCookie(AD_SEGMENT_COOKIE, next)
      return next
    })
    router.refresh()
  }

  function dropAdOverrides(adIds: string[]) {
    setAdOverrides(prev => {
      if (!adIds.some(id => id in prev)) return prev
      const next = { ...prev }
      for (const id of adIds) delete next[id]
      writeJsonCookie(AD_SEGMENT_COOKIE, next)
      return next
    })
  }

  function setCampaignSegment(key: string, segmentId: string, adIds: string[]) {
    setCampOverrides(prev => {
      const next = { ...prev, [key]: segmentId }
      writeJsonCookie(CAMPAIGN_SEGMENT_COOKIE, next)
      return next
    })
    dropAdOverrides(adIds)
    router.refresh()
  }

  function clearCampaignSegment(key: string, adIds: string[]) {
    setCampOverrides(prev => {
      const next = { ...prev }
      delete next[key]
      writeJsonCookie(CAMPAIGN_SEGMENT_COOKIE, next)
      return next
    })
    dropAdOverrides(adIds)
    router.refresh()
  }

  async function unlock(pin: string): Promise<boolean> {
    try {
      const res = await fetch('/api/admin-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (res.ok) { setEditMode(true); return true }
      return false
    } catch {
      return false
    }
  }

  function lock() { setEditMode(false) }

  return (
    <Ctx.Provider value={{
      editMode, getName, setName, getColor, setColor, resetColor, colorOverrides,
      unlock, lock, segmentOrder, setSegmentOrder,
      adSegmentOverrides, setAdSegment, clearAdSegment,
      campaignSegmentOverrides, setCampaignSegment, clearCampaignSegment,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSegmentOverride() {
  return useContext(Ctx)
}
