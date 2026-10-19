'use client'

import { useSegmentOverride } from './SegmentOverrideContext'
import type { ViewMode } from '@/lib/view-mode'

// Admin-only footer button: flip the wall between "by segment" and "by
// channel". Saved to the shared overrides (lib/overrides.ts), so it changes
// the layout for every viewer of this client, not just this browser. The
// {PREFIX}_VIEW_MODE env var is only the default until a mode is saved here.
export default function ViewModeButton({ mode }: { mode: ViewMode }) {
  const { editMode, setViewMode } = useSegmentOverride()
  if (!editMode) return null

  const next: ViewMode = mode === 'segment' ? 'channel' : 'segment'
  return (
    <button
      type="button"
      className="admin-lock goals-btn"
      onClick={() => setViewMode(next)}
      title={`Switch everyone's wall to ${next === 'channel' ? 'by channel (Meta / Google / StackAdapt)' : 'by segment'}.`}
    >
      View: {mode === 'segment' ? 'Segments' : 'Channels'} ⇄
    </button>
  )
}
