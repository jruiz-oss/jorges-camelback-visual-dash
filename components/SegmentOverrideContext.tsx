'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Persists custom segment name overrides in localStorage so renames survive
// page refreshes. Edit mode is PIN-gated — the PIN is checked server-side
// against the ADMIN_PIN env var (POST /api/admin-unlock). Previous versions
// inlined NEXT_PUBLIC_ADMIN_PIN into the client bundle, which any visitor
// could read in devtools.

const STORAGE_KEY = 'seg-name-overrides-v1'

type Overrides = Record<string, string> // segmentId → custom display name

interface CtxValue {
  editMode: boolean
  getName:  (id: string, fallback: string) => string
  setName:  (id: string, name: string) => void
  unlock:   (pin: string) => Promise<boolean>
  lock:     () => void
}

const Ctx = createContext<CtxValue>({
  editMode: false,
  getName:  (_, f) => f,
  setName:  () => {},
  unlock:   async () => false,
  lock:     () => {},
})

export function SegmentOverrideProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false)
  const [overrides, setOverrides] = useState<Overrides>({})

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setOverrides(JSON.parse(raw))
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
    <Ctx.Provider value={{ editMode, getName, setName, unlock, lock }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSegmentOverride() {
  return useContext(Ctx)
}
