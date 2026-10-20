'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LEGACY_OWNER_SLUG, scopedKey, scopedCookie } from '@/lib/override-keys'
import { customSegmentId, CUSTOM_SEGMENT_PREFIX } from '@/lib/segments'
import type { Overrides, OverridesStorage } from '@/lib/overrides'
import { VIEW_MODE_COOKIE, type ViewMode } from '@/lib/view-mode'

// Admin overrides for the wall: segment renames, colors, order, per-ad and
// per-campaign moves, admin-created segments and the view mode.
//
// Source of truth is the server (Postgres, lib/overrides.ts). app/[client]/page.tsx
// reads the doc on every render and passes it in as `initial`, so every viewer
// gets the same wall, and the 60s soft refresh picks up an admin's changes on
// other screens. Edits are applied optimistically here, then sent one op at a
// time to PUT /api/admin/overrides through a serial queue (so "create segment"
// always lands before the "move into it" that follows), and the page is
// refreshed after anything that changes server-side bucketing.
//
// Edit mode is PIN-gated: POST /api/admin-unlock checks ADMIN_PIN server-side
// and sets the httpOnly admin cookie the PUT route requires.
//
// Settings that older versions kept in this browser (localStorage + cookies)
// are imported once on unlock, then cleared locally.

// Legacy browser storage names (before server storage), only read for the one-time import.
const LEGACY = {
  name:   'seg-name-overrides-v1',
  order:  'seg-order-v1',
  color:  'seg-color-overrides-v1',
  adCk:   'ad-seg-overrides-v1',
  campCk: 'camp-seg-overrides-v1',
  customCk: 'custom-seg-v1',
}
const IMPORTED_FLAG = 'overrides-imported-v1'

/** <option value> of the "+ New segment…" entry in the move menus. */
export const NEW_SEGMENT_VALUE = '__new__'

type Colors       = Record<string, string>
type AdSegments   = Record<string, string>
type CampSegments = Record<string, string>
type CustomSegments = Record<string, string>

interface CtxValue {
  editMode:        boolean
  /** Whether the shared settings store is connected ('ok') — shown to admins. */
  storage:         OverridesStorage
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
  /** Admin-created segments (id → name). */
  customSegments: CustomSegments
  /** Ask for a name and create a new segment. Returns its id, or null if cancelled. */
  createSegment: () => string | null
  /** Delete an admin-created segment; its ads fall back to auto-classification. */
  removeCustomSegment: (id: string) => void
  /** Save the wall layout for everyone (null = back to the env default). */
  setViewMode: (mode: ViewMode | null) => void
}

const noop = () => {}
const Ctx = createContext<CtxValue>({
  editMode: false, storage: 'missing',
  getName: (_, f) => f, setName: noop,
  getColor: (_, f) => f, setColor: noop, resetColor: noop, colorOverrides: {},
  unlock: async () => false, lock: noop,
  segmentOrder: [], setSegmentOrder: noop,
  adSegmentOverrides: {}, setAdSegment: noop, clearAdSegment: noop,
  campaignSegmentOverrides: {}, setCampaignSegment: noop, clearCampaignSegment: noop,
  customSegments: {}, createSegment: () => null, removeCustomSegment: noop,
  setViewMode: noop,
})

// ─── Legacy browser storage (import once) ────────────────────────────────────
function readCookieJson(name: string): Record<string, string> {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    if (!m) return {}
    const parsed = JSON.parse(decodeURIComponent(m[1]))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}
function readCookieRaw(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}
function readLocalJson(key: string): unknown {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null }
}

function collectLegacy(slug: string): { doc: Partial<Overrides>; found: boolean; clear: () => void } {
  const owner = slug === LEGACY_OWNER_SLUG
  const ls = (base: string) => readLocalJson(scopedKey(base, slug)) ?? (owner ? readLocalJson(base) : null)
  const ck = (base: string) => {
    const scoped = readCookieJson(scopedCookie(base, slug))
    return Object.keys(scoped).length ? scoped : (owner ? readCookieJson(base) : {})
  }
  const doc: Partial<Overrides> = {
    names:          (ls(LEGACY.name)  as Record<string, string>) ?? {},
    colors:         (ls(LEGACY.color) as Record<string, string>) ?? {},
    order:          Array.isArray(ls(LEGACY.order)) ? (ls(LEGACY.order) as string[]) : [],
    adMoves:        ck(LEGACY.adCk),
    campaignMoves:  ck(LEGACY.campCk),
    customSegments: readCookieJson(scopedCookie(LEGACY.customCk, slug)),
  }
  const vm = readCookieRaw(scopedCookie(VIEW_MODE_COOKIE, slug))
  if (vm === 'segment' || vm === 'channel') doc.viewMode = vm
  const found = Object.values(doc).some(v => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : !!v))

  const clear = () => {
    const kill = (n: string) => { document.cookie = `${n}=;path=/;max-age=0` }
    try {
      for (const base of [LEGACY.name, LEGACY.color, LEGACY.order]) {
        localStorage.removeItem(scopedKey(base, slug))
        if (owner) localStorage.removeItem(base)
      }
    } catch {}
    for (const base of [LEGACY.adCk, LEGACY.campCk, LEGACY.customCk, VIEW_MODE_COOKIE]) {
      kill(scopedCookie(base, slug))
      if (owner) kill(base)
    }
  }
  return { doc, found, clear }
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function SegmentOverrideProvider({
  slug, initial, storage, children,
}: {
  slug: string
  initial: Overrides
  storage: OverridesStorage
  children: ReactNode
}) {
  const router = useRouter()
  const [editMode, setEditMode] = useState(false)
  const [doc, setDoc]           = useState<Overrides>(initial)

  // Server is the source of truth: adopt every fresh server render (soft
  // refresh, another admin's change). Keyed on content, not identity.
  const initialKey = JSON.stringify(initial)
  useEffect(() => { setDoc(initial) }, [initialKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Serial queue of PUTs; refresh once the queue drains if any op asked for it.
  const queue       = useRef<Promise<void>>(Promise.resolve())
  const pending     = useRef(0)
  const wantRefresh = useRef(false)
  const alerted     = useRef(false)

  function send(op: Record<string, unknown>, refresh: boolean): Promise<boolean> {
    pending.current++
    if (refresh) wantRefresh.current = true
    const p = queue.current.then(async (): Promise<boolean> => {
      try {
        const res = await fetch(`/api/admin/overrides?client=${encodeURIComponent(slug)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        return true
      } catch (err) {
        console.error('[overrides] save failed:', err)
        if (!alerted.current) {
          alerted.current = true
          window.alert(`Couldn't save that change for everyone: ${(err as Error).message}`)
          setTimeout(() => { alerted.current = false }, 10_000)
        }
        wantRefresh.current = true // re-sync with what the server actually has
        return false
      } finally {
        pending.current--
        if (pending.current === 0 && wantRefresh.current) {
          wantRefresh.current = false
          router.refresh()
        }
      }
    })
    queue.current = p.then(() => {})
    return p
  }

  // The native color picker fires onChange continuously while dragging; only
  // the value it settles on is sent.
  const colorTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  function sendColorDebounced(id: string, color: string | null) {
    clearTimeout(colorTimers.current[id])
    colorTimers.current[id] = setTimeout(() => send({ op: 'color', id, color }, false), 400)
  }

  const update = (fn: (d: Overrides) => Overrides) => setDoc(d => fn(d))

  function setName(id: string, name: string) {
    const trimmed = name.trim().slice(0, 60)
    update(d => {
      const names = { ...d.names }
      if (trimmed) names[id] = trimmed
      else delete names[id]
      return { ...d, names }
    })
    send({ op: 'name', id, name: trimmed }, false)
  }

  function setColor(id: string, color: string) {
    update(d => ({ ...d, colors: { ...d.colors, [id]: color } }))
    sendColorDebounced(id, color)
  }

  function resetColor(id: string) {
    update(d => { const colors = { ...d.colors }; delete colors[id]; return { ...d, colors } })
    sendColorDebounced(id, null)
  }

  function setSegmentOrder(ids: string[]) {
    update(d => ({ ...d, order: ids }))
    send({ op: 'order', ids }, false)
  }

  function setAdSegment(adId: string, segmentId: string) {
    update(d => ({ ...d, adMoves: { ...d.adMoves, [adId]: segmentId } }))
    send({ op: 'moveAd', adId, segmentId }, true)
  }

  function clearAdSegment(adId: string) {
    update(d => { const adMoves = { ...d.adMoves }; delete adMoves[adId]; return { ...d, adMoves } })
    send({ op: 'moveAd', adId, segmentId: null }, true)
  }

  function setCampaignSegment(key: string, segmentId: string, adIds: string[]) {
    update(d => {
      const adMoves = { ...d.adMoves }
      for (const id of adIds) delete adMoves[id]
      return { ...d, adMoves, campaignMoves: { ...d.campaignMoves, [key]: segmentId } }
    })
    send({ op: 'moveCampaign', key, segmentId, adIds }, true)
  }

  function clearCampaignSegment(key: string, adIds: string[]) {
    update(d => {
      const adMoves = { ...d.adMoves }
      for (const id of adIds) delete adMoves[id]
      const campaignMoves = { ...d.campaignMoves }
      delete campaignMoves[key]
      return { ...d, adMoves, campaignMoves }
    })
    send({ op: 'moveCampaign', key, segmentId: null, adIds }, true)
  }

  // Queued before the move that follows it, so the server knows the segment
  // id by the time the move is applied and the page re-buckets.
  function createSegment(): string | null {
    const raw = window.prompt('Name for the new segment:')
    const name = (raw ?? '').trim().slice(0, 60)
    if (!name) return null
    const id = customSegmentId(name)
    update(d => ({ ...d, customSegments: { ...d.customSegments, [id]: d.customSegments[id] ?? name } }))
    send({ op: 'createSegment', id, name }, true)
    return id
  }

  function removeCustomSegment(id: string) {
    if (!id.startsWith(CUSTOM_SEGMENT_PREFIX)) return
    update(d => { const customSegments = { ...d.customSegments }; delete customSegments[id]; return { ...d, customSegments } })
    send({ op: 'removeSegment', id }, true)
  }

  function setViewMode(mode: ViewMode | null) {
    update(d => { const n = { ...d }; if (mode) n.viewMode = mode; else delete n.viewMode; return n })
    send({ op: 'viewMode', mode }, true)
  }

  async function unlock(pin: string): Promise<boolean> {
    try {
      const res = await fetch('/api/admin-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!res.ok) return false
      setEditMode(true)
      importLegacy()
      return true
    } catch {
      return false
    }
  }

  // One-time move of this browser's old local settings onto the server.
  function importLegacy() {
    if (storage !== 'ok') return
    try { if (localStorage.getItem(scopedKey(IMPORTED_FLAG, slug))) return } catch {}
    const legacy = collectLegacy(slug)
    if (!legacy.found) {
      try { localStorage.setItem(scopedKey(IMPORTED_FLAG, slug), '1') } catch {}
      return
    }
    send({ op: 'import', doc: legacy.doc }, true).then(ok => {
      if (!ok) return // keep the local copy; retried on the next unlock
      legacy.clear()
      try { localStorage.setItem(scopedKey(IMPORTED_FLAG, slug), '1') } catch {}
    })
  }

  function lock() {
    setEditMode(false)
    // Drop the httpOnly admin session cookie too, so /api/admin/* stops
    // answering this browser. Fire-and-forget.
    fetch('/api/admin-unlock', { method: 'DELETE' }).catch(() => {})
  }

  return (
    <Ctx.Provider value={{
      editMode, storage,
      getName: (id, fallback) => doc.names[id] ?? fallback,
      setName,
      getColor: (id, fallback) => doc.colors[id] ?? fallback,
      setColor, resetColor, colorOverrides: doc.colors,
      unlock, lock,
      segmentOrder: doc.order, setSegmentOrder,
      adSegmentOverrides: doc.adMoves, setAdSegment, clearAdSegment,
      campaignSegmentOverrides: doc.campaignMoves, setCampaignSegment, clearCampaignSegment,
      customSegments: doc.customSegments, createSegment, removeCustomSegment,
      setViewMode,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSegmentOverride() {
  return useContext(Ctx)
}
