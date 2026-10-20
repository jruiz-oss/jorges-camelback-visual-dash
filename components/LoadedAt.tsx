'use client'

import { useEffect, useState } from 'react'

/**
 * Footer "last sync" time, formatted in the VIEWER's browser timezone.
 *
 * The page is a server component, and formatting the time there used the
 * server's timezone (UTC on Vercel), so a Phoenix viewer saw a time 7 hours
 * off. The server passes the render time as an ISO string; this formats it in
 * `useEffect`, so the server HTML and first client render are both empty (no
 * hydration mismatch) and every soft refresh passes a new `at`.
 */
export default function LoadedAt({ at }: { at: string }) {
  const [text, setText] = useState<string>('')

  useEffect(() => {
    const d = new Date(at)
    setText(Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour12: false }))
  }, [at])

  return <span suppressHydrationWarning>{text || ' '}</span>
}
