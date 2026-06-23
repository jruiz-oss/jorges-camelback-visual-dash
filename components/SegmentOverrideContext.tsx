'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Persists custom segment name overrides and segment display order in
// localStorage so renames and reordering survive page refreshes.
// Edit mode is PIN-gated — the PIN is checked server-side against the
// ADMIN_PIN env var (POST /api/admin-unlock). Previous versions inlined
// NEXT_PUBLIC_ADMIN_PIN into the client bundle, which any visitor could
// read in devtools.

const STORAGE_KEY  = 'seg-name-overrides-v1'
const ORDER_KEY    = 'seg-order-v1'
const COLOR_KEY    = 'seg-color-overrides-v1'

type Overrides = Record<string, string> // segmentId → custom display name
type Colors    = Record<string, string> // segmentId → custom accent hex

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
}

const Ctx = createContext<CtxValue>({
  editMode:        false,
  getName:         (_, f) => f,
  setName:         () => {},
  getColor:        (_, f) => f,
  setColor:        () => {},
  resetColor:      () => {},
  colorOverrides:  {},
  unlock:          async () => false,
  lock:            () => {},
  segmentOrder:    [],
  setSegmentOrder: () => {},
})

export function SegmentOverrideProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode]       = useState(false)
  const [overrides, setOverrides]     = useState<Overrides>({})
  const [colorOverrides, setColors]   = useState<Colors>({})
  const [segmentOrder, setOrderState] = useState<string[]>([])

  // Hydrate from localStorage on mount (client only)
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
  }, [])

  function getName(id: string, fallback: string): string {
    return overrides[id] ?? fallback
  }

  function setName(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return // don't save blank names
    setOverrides(prev => {
      const next = { ...prev, [id]: trimmed }
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
    <Ctx.Provider value={{ editMode, getName, setName, getColor, setColor, resetColor, colorOverrides, unlock, lock, segmentOrder, setSegmentOrder }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSegmentOverride() {
  return useContext(Ctx)
}
