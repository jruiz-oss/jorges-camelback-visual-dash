'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSegmentOverride } from './SegmentOverrideContext'
import { type AdFilter } from '@/lib/ad-filter'

// Admin-only "Filter" button in the footer. Edits the client's ad filter and
// saves it server-side (Redis, lib/ad-filter-store.ts) so it applies to every
// viewer right away. "Reset" drops the saved filter and falls back to the
// {PREFIX}_AD_FILTER env var / code default.
const ROWS = [
  { id: 'all',        name: 'All platforms' },
  { id: 'meta',       name: 'Meta' },
  { id: 'google',     name: 'Google' },
  { id: 'stackadapt', name: 'StackAdapt' },
] as const

type Draft = Record<string, { include: string; exclude: string }>
type Source = 'saved' | 'env' | 'code' | 'none'

const toText = (l?: string[]) => (l ?? []).join(', ')
const toList = (s: string) => s.split(/[,|\n]/).map(t => t.trim().replace(/^[+-]\s*/, '')).filter(Boolean)
const SOURCE_LABEL: Record<Source, string> = {
  saved: 'saved here (applies to everyone)',
  env:   'from the Vercel/Railway env var',
  code:  'from the code default',
  none:  'no filter, all ads shown',
}

export default function AdFilterButton({ slug }: { slug: string }) {
  const { editMode } = useSegmentOverride()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({})
  const [source, setSource] = useState<Source>('none')
  const [active, setActive] = useState('')
  const [envValue, setEnvValue] = useState('')
  const [storageOk, setStorageOk] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!editMode) return null

  const url = `/api/admin/filter?client=${encodeURIComponent(slug)}`

  function load(data: { filter?: AdFilter; source?: Source; value?: string; envValue?: string; storage?: string }) {
    const f: AdFilter = data.filter ?? {}
    const d: Draft = {}
    for (const r of ROWS) d[r.id] = { include: toText(f[r.id]?.include), exclude: toText(f[r.id]?.exclude) }
    setDraft(d)
    setSource(data.source ?? 'none')
    setActive(data.value ?? '')
    if (data.envValue !== undefined) setEnvValue(data.envValue)
    if (data.storage !== undefined) setStorageOk(data.storage === 'ok')
  }

  async function openPanel() {
    setOpen(true); setMsg(null)
    try {
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Could not load filter'); return }
      load(data)
    } catch { setMsg('Could not load filter') }
  }

  const built: AdFilter = {}
  for (const r of ROWS) {
    const v = draft[r.id]
    if (!v) continue
    const include = toList(v.include), exclude = toList(v.exclude)
    if (include.length || exclude.length) built[r.id] = { ...(include.length && { include }), ...(exclude.length && { exclude }) }
  }

  async function save(filter: AdFilter | null) {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Save failed'); return }
      load(data)
      setMsg(filter ? 'Saved. Every viewer sees this now.' : 'Reset to the default.')
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
              Matches the ad name, campaign name or headline (any one term, ignoring case). Separate terms with commas.
              Saving applies it to everyone viewing this dashboard.
            </p>
            <p className="goals-help">Live now: <b>{active || 'no filter (all ads shown)'}</b> ({SOURCE_LABEL[source]})</p>
            {source === 'saved' && envValue && (
              <p className="goals-help">Reset would go back to: <b>{envValue}</b></p>
            )}
            {!storageOk && <p className="goals-warn">Settings storage isn&apos;t connected, so the filter can&apos;t be saved here.</p>}
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
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="goal-form-save" disabled={busy || !storageOk} onClick={() => save(built)}>
                {busy ? 'Saving…' : 'Save for everyone'}
              </button>
              {source === 'saved' && (
                <button type="button" className="goal-form-save" disabled={busy} onClick={() => save(null)}>Reset to default</button>
              )}
              <button type="button" className="goal-form-save" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
