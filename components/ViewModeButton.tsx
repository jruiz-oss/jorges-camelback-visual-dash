'use client'

import { useRouter } from 'next/navigation'
import { useSegmentOverride } from './SegmentOverrideContext'
import { scopedCookie } from '@/lib/override-keys'
import { VIEW_MODE_COOKIE, type ViewMode } from '@/lib/view-mode'

// Admin-only footer button: flip the wall between "by segment" and "by
// channel". Writes a per-client cookie (read by app/[client]/page.tsx) and
// refreshes. The cookie only affects this browser; to change what everyone
// sees, set {PREFIX}_VIEW_MODE=segment|channel in Vercel.
export default function ViewModeButton({ slug, mode }: { slug: string; mode: ViewMode }) {
  const { editMode } = useSegmentOverride()
  const router = useRouter()
  if (!editMode) return null

  const next: ViewMode = mode === 'segment' ? 'channel' : 'segment'
  function toggle() {
    try {
      document.cookie = `${scopedCookie(VIEW_MODE_COOKIE, slug)}=${next};path=/;max-age=31536000;samesite=lax`
    } catch {}
    router.refresh()
  }

  return (
    <button
      type="button"
      className="admin-lock goals-btn"
      onClick={toggle}
      title={`Switch to ${next === 'channel' ? 'by channel (Meta / Google / StackAdapt)' : 'by segment'}. Only changes this browser; set the VIEW_MODE env var in Vercel to change it for everyone.`}
    >
      View: {mode === 'segment' ? 'Segments' : 'Channels'} ⇄
    </button>
  )
}
