'use client'

import { useEffect, useState } from 'react'

/**
 * Renders "now" formatted in the visitor's browser locale + timezone.
 *
 * Why a client component: the dashboard page is a server component (it has to
 * be — it fetches Meta/Google data with secret keys). Calling
 * `new Date().toLocaleString(...)` on the server uses the SERVER's timezone,
 * which is whatever Vercel region the function ran in — not the viewer's. By
 * formatting in `useEffect`, we get the visitor's actual local time + TZ name.
 */
export default function LoadedAt() {
  const [text, setText] = useState<string>('')

  useEffect(() => {
    // `undefined` locale → browser default. `timeZoneName: 'short'` appends
    // the abbreviated TZ ("PDT", "EST", "GMT+1") so the viewer can confirm
    // the time matches their wall clock at a glance.
    const t = new Date().toLocaleString(undefined, {
      month:  'short',
      day:    'numeric',
      year:   'numeric',
      hour:   'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
    setText(t)
  }, [])

  // Empty string on initial SSR render → matches client's initial render →
  // no hydration warning. Real text appears within one frame of mount.
  return <span suppressHydrationWarning>{text || ' '}</span>
}
