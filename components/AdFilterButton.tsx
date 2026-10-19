'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSegmentOverride } from './SegmentOverrideContext'
import type { AdFilter } from '@/lib/ad-filter'

// Admin-only "Filter" button in the footer. Per platform (or all): only show
// ads whose name / campaign / headline contains any "show" term, and hide ads
// containing any "hide" term. Saved server-side, applied before segmentation.
const ROWS = [
  { id: 'all',        name: 'All platforms' },
  { id: 'meta',       name: 'Meta' },
  { id: 'google',     name: 'Google' },
  { id: 'stackadapt', name: 'StackAdapt' },
] as const

type Draft = Record<string, { include: string; exclude: string }>

const toText = (l?: string[]) => (l ?? []).join(', ')
const toList = (s: string) => s.split(/[,\n]/).map(t => t.trim()).filter(Boolean)

export default function AdFilterButton({ slug }: { slug: string }) {
  const { editMode } = useSegmentOverride()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!editMode) return null

  async function openPanel() {
    setOpen(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/filter?client=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Could not load filter'); return }
      if (data.storage === 'missing') setMsg('Storage is not connected yet (Upstash Redis in Vercel → Storage).')
      const f: AdFilter = data.filter ?? {}
      const d: Draft = {}
      for (const r of ROWS) d[r.id] = { include: toText(f[r.id]?.include), exclude: toText(f[r.id]?.exclude) }
      setDraft(d)
    } catch { setMsg('Could not load filter') }
  }

  async function save() {
    setBusy(true); setMsg(null)
    const filter: AdFilter = {}
    for (const r of ROWS) {
      const v = draft[r.id]
      if (!v) continue
      const include = toList(v.include), exclude = toList(v.exclude)
      if (include.length || exclude.length) filter[r.id] = { ...(include.length && { include }), ...(exclude.length && { exclude }) }
    }
    try {
      const res = await fetch(`/api/admin/filter?client=${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error ?? 'Save failed'); return }
      setOpen(false)
      router.refresh()
    } catch { setMsg('Save failed') } finally { setBusy(false) }
  }

  const set = (id: string, k: 'include' | 'exclude', v: string) =>
    setDraft(prev => ({ ...prev, [id]: { ...(prev[id] ?? { include: '', exclude: '' }), [k]: v } }))
  const input = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line-2)', font: 'inherit' } as const

  return (
    <>
      <button type="button" className="admin-lock goals-btn" onClick={openPanel} title="Ad filter">
        Filter
      </button>
      {open && (
        <div className="admin-modal-overlay" onClick={() => setOpen(false)}>
          <div className="admin-modal goals-modal" onClick={e => e.stopPropagation()}>
            <h3>Ad filter</h3>
            <p className="goals-help">
              Separate terms with commas. Matches the ad name, campaign name or headline (any one term, ignoring case).
              &ldquo;Show only&rdquo; empty = show everything. Segments are built from what is left.
            </p>
            {msg && <p className="goals-warn">{msg}</p>}
            {ROWS.map(r => (
              <div key={r.id} className="goals-row" style={{ display: 'block' }}>
                <div className="goals-row-name">{r.name}</div>
                <label style={{ display: 'block', fontSize: 12, margin: '4px 0 2px' }}>Show only ads containing</label>
                <input style={input} value={draft[r.id]?.include ?? ''} onChange={e => set(r.id, 'include', e.target.value)} placeholder="e.g. tscc, top shelf" />
                <label style={{ display: 'block', fontSize: 12, margin: '6px 0 2px' }}>Hide ads containing</label>
                <input style={input} value={draft[r.id]?.exclude ?? ''} onChange={e => set(r.id, 'exclude', e.target.value)} placeholder="e.g. other agency name" />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="goal-form-save" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="goal-form-save" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
