'use client'

import { useState } from 'react'
import { usePerf } from './PerfContext'
import GoalForm from './GoalForm'
import type { PerfPlatform } from '@/lib/goals'

// Admin-only "Goals" button in the footer (next to the lock). Opens the
// account-level goal panel: one default goal per platform, the yellow band,
// and the status of the 7-day metrics pull.
const PLATFORMS: Array<{ id: PerfPlatform; name: string }> = [
  { id: 'meta',       name: 'Meta' },
  { id: 'stackadapt', name: 'StackAdapt' },
]

export default function AccountGoalsButton() {
  const {
    enabled, loading, error, perf, goals, storage, refresh,
    metaEvents, defaultMetaEvent, saveAccountGoal, saveBand,
  } = usePerf()
  const [open, setOpen] = useState(false)
  const [band, setBand] = useState<string>('')
  const [bandMsg, setBandMsg] = useState<string | null>(null)
  if (!enabled) return null

  const fetched = perf ? new Date(perf.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null

  return (
    <>
      <button type="button" className="admin-lock goals-btn" onClick={() => setOpen(true)} title="Performance goals">
        🎯 Goals
      </button>
      {open && (
        <div className="admin-modal-overlay" onClick={() => setOpen(false)}>
          <div className="admin-modal goals-modal" onClick={e => e.stopPropagation()}>
            <h3>Account goals</h3>
            <p className="goals-help">
              Default goal per platform. Any campaign can override it from its lane header (🎯).
              Green = at or better than goal, yellow = within the band, red = worse, grey = not enough data.
            </p>

            {storage === 'missing' && (
              <p className="goals-warn">Goals storage isn&apos;t connected yet. Set REDIS_URL (see DEPLOY.md), then redeploy.</p>
            )}
            {storage === 'error' && <p className="goals-warn">Goals storage is unreachable right now.</p>}
            {error && <p className="goals-warn">{error}</p>}

            {PLATFORMS.map(p => (
              <div key={p.id} className="goals-row">
                <div className="goals-row-name">{p.name}</div>
                <GoalForm
                  key={JSON.stringify(goals.account[p.id] ?? null)}
                  platform={p.id}
                  initial={goals.account[p.id] ?? null}
                  events={metaEvents}
                  defaultEvent={defaultMetaEvent}
                  onSave={g => saveAccountGoal(p.id, g)}
                  onClear={() => saveAccountGoal(p.id, null)}
                />
              </div>
            ))}

            <div className="goals-row">
              <div className="goals-row-name">Yellow band</div>
              <div className="goal-form">
                <span className="goal-form-target">
                  <input
                    type="number" min="1" max="100" step="1"
                    value={band || String(goals.bandPct)}
                    onChange={e => { setBand(e.target.value); setBandMsg(null) }}
                    aria-label="Yellow band percent"
                  />
                  <span className="goal-form-unit">% worse than goal</span>
                </span>
                <button type="button" className="goal-form-save" onClick={async () => {
                  const err = await saveBand(Number(band || goals.bandPct))
                  setBandMsg(err ?? 'Saved')
                }}>Save</button>
                {bandMsg && <span className={`goal-form-msg${bandMsg === 'Saved' ? ' ok' : ''}`}>{bandMsg}</span>}
              </div>
            </div>

            <div className="goals-status">
              {loading ? 'Loading metrics…' : perf ? (
                <>
                  Metrics: {perf.window.label} ({perf.window.since} → {perf.window.until}) · pulled {fetched}
                  {' · '}Meta {perf.meta.ok ? `${Object.keys(perf.meta.ads).length} ads` : `error: ${perf.meta.error ?? 'unknown'}`}
                  {' · '}StackAdapt {!perf.stackadapt.connected ? 'not connected'
                    : perf.stackadapt.ok ? `${Object.keys(perf.stackadapt.campaigns).length} campaigns (campaign-level)`
                    : `error: ${perf.stackadapt.error ?? 'unknown'}`}
                  {perf.stackadapt.fields && (
                    <details className="goals-debug">
                      <summary>StackAdapt fields used</summary>
                      <code>{Object.entries(perf.stackadapt.fields).map(([k, v]) => `${k}: ${v}`).join(' · ')}</code>
                    </details>
                  )}
                </>
              ) : 'No metrics loaded'}
              <button type="button" className="goals-refresh" onClick={refresh} disabled={loading}>Refresh</button>
            </div>

            <div className="admin-modal-btns">
              <button onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
