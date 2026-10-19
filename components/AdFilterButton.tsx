'use client'

import { useState } from 'react'
import { useSegmentOverride } from './SegmentOverrideContext'
import { formatAdFilterEnv, type AdFilter } from '@/lib/ad-filter'

// Admin-only "Filter" button in the footer. Shows the filter that is live, and
// builds the value to paste into the client's {PREFIX}_AD_FILTER variable in
// Vercel. It does not save anything itself: the filter has to apply to every
// viewer, and only a server-side setting does that.
const ROWS = [
  { id: 'all',        name: 'All platforms' },
  { id: 'meta',       name: 'Meta' },
  { id: 'google',     name: 'Google' },
  { id: 'stackadapt', name: 'StackAdapt' },
] as const

type Draft = Record<string, { include: string; exclude: string }>

const toText = (l?: string[]) => (l ?? []).join(', ')
const toList = (s: string) => s.split(/[,|\n]/).map(t => t.trim().replace(/^[+-]\s*/, '')).filter(Boolean)

export default function AdFilterButton({ slug }: { slug: string }) {
  const { editMode } = useSegmentOverride()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({})
  const [envVar, setEnvVar] = useState('')
  const [active, setActive] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  if (!editMode) return null

  async function openPanel() {
    setOpen(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/filter?client=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Could not load filter'); return }
      const f: AdFilter = data.filter ?? {}
      const d: Draft = {}
      for (const r of ROWS) d[r.id] = { include: toText(f[r.id]?.include), exclude: toText(f[r.id]?.exclude) }
      setDraft(d); setEnvVar(data.envVar); setActive(data.value)
    } catch { setMsg('Could not load filter') }
  }

  const built: AdFilter = {}
  for (const r of ROWS) {
    const v = draft[r.id]
    if (!v) continue
    const include = toList(v.include), exclude = toList(v.exclude)
    if (include.length || exclude.length) built[r.id] = { ...(include.length && { include }), ...(exclude.length && { exclude }) }
  }
  const value = formatAdFilterEnv(built)

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
              Matches the ad name, campaign name or headline (any one term, ignoring case). Separate terms with commas.
              Fill this in, then paste the value below into <b>{envVar || 'the AD_FILTER variable'}</b> in Vercel and redeploy.
              Vercel is what makes it apply to everyone, not just this browser.
            </p>
            <p className="goals-help">Live now: <b>{active || 'no filter (all ads shown)'}</b></p>
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
            <label style={{ display: 'block', fontSize: 12, margin: '12px 0 2px' }}>Value to paste into Vercel</label>
            <input style={{ ...input, fontFamily: 'monospace' }} readOnly value={value} onFocus={e => e.currentTarget.select()} placeholder="(empty = show everything)" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="goal-form-save" onClick={async () => {
                try { await navigator.clipboard.writeText(value); setMsg('Copied') } catch { setMsg('Select the value and copy it') }
              }}>Copy value</button>
              <button type="button" className="goal-form-save" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
