'use client'

import { useState } from 'react'
import { METRIC_LABELS, type Goal, type GoalMetric, type PerfPlatform } from '@/lib/goals'

// Shared editor for one goal (account-level panel + per-campaign popover).
// Meta CPA/CVR goals also pick which conversion event counts.
export default function GoalForm({
  platform, initial, events, defaultEvent, onSave, onClear, clearLabel = 'Clear',
}: {
  platform:     PerfPlatform
  initial:      Goal | null
  events:       string[]
  defaultEvent: string | null
  onSave:       (goal: Goal) => Promise<string | null>
  onClear?:     () => Promise<string | null>
  clearLabel?:  string
}) {
  const [metric, setMetric] = useState<GoalMetric>(initial?.metric ?? 'cpa')
  const [target, setTarget] = useState(initial ? String(initial.target) : '')
  const [event, setEvent]   = useState(initial?.event ?? '')
  const [busy, setBusy]     = useState(false)
  const [msg, setMsg]       = useState<string | null>(null)

  const pct = metric === 'ctr' || metric === 'cvr'
  const usesEvent = platform === 'meta' && (metric === 'cpa' || metric === 'cvr')

  async function run(fn: () => Promise<string | null>) {
    setBusy(true); setMsg(null)
    const err = await fn()
    setBusy(false)
    setMsg(err ?? 'Saved')
  }

  function save() {
    const t = Number(target)
    if (!Number.isFinite(t) || t <= 0) { setMsg('Enter a target above 0'); return }
    run(() => onSave({ metric, target: t, ...(usesEvent && event ? { event } : {}) }))
  }

  return (
    <div className="goal-form" onClick={e => e.stopPropagation()}>
      <select value={metric} onChange={e => setMetric(e.target.value as GoalMetric)} aria-label="Goal metric">
        {(Object.keys(METRIC_LABELS) as GoalMetric[]).map(m => (
          <option key={m} value={m}>{METRIC_LABELS[m]}</option>
        ))}
      </select>
      <span className="goal-form-target">
        {!pct && <span className="goal-form-unit">$</span>}
        <input
          type="number" inputMode="decimal" min="0" step="any"
          value={target} placeholder={pct ? '1.0' : '25'}
          onChange={e => setTarget(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          aria-label="Goal target"
        />
        {pct && <span className="goal-form-unit">%</span>}
      </span>
      {usesEvent && (
        <select value={event} onChange={e => setEvent(e.target.value)} aria-label="Conversion event" className="goal-form-event">
          <option value="">Auto{defaultEvent ? ` (${defaultEvent})` : ' (none found)'}</option>
          {events.map(ev => <option key={ev} value={ev}>{ev}</option>)}
          {event && !events.includes(event) && <option value={event}>{event}</option>}
        </select>
      )}
      <button type="button" className="goal-form-save" onClick={save} disabled={busy}>Save</button>
      {onClear && initial && (
        <button type="button" className="goal-form-clear" onClick={() => run(onClear)} disabled={busy}>{clearLabel}</button>
      )}
      {msg && <span className={`goal-form-msg${msg === 'Saved' ? ' ok' : ''}`}>{msg}</span>}
    </div>
  )
}
