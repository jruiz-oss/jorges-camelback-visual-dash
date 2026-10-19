'use client'

import type { Score } from '@/lib/goals'

// Small green/yellow/red/grey performance indicator. Admin-only — callers get
// `null` scores from PerfContext outside edit mode, so this renders nothing.
export default function PerfDot({ score, showLabel = true }: { score: Score | null; showLabel?: boolean }) {
  if (!score) return null
  return (
    <span className={`perf-badge perf-${score.color}`} title={score.detail}>
      <span className="perf-dot" aria-hidden="true" />
      {showLabel && <span className="perf-label">{score.label}</span>}
      <span className="sr-only">{score.detail}</span>
    </span>
  )
}
