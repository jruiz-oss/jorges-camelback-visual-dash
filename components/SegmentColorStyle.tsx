'use client'

import { useSegmentOverride } from './SegmentOverrideContext'

// Injects a <style> tag that overrides the `--accent` CSS variable for any
// segment the admin has recolored. One rule per overridden segment targets:
//   • the segment <section> (drives the card accent strip + tile hover ring), and
//   • the matching nav pills in TopBar (desktop + mobile menu).
//
// Both the <section> and the pills set `--accent` as an INLINE style server-side,
// so the injected rules use `!important` to win the cascade. Nothing is injected
// for segments without an override, so defaults render untouched.

export default function SegmentColorStyle() {
  const { colorOverrides } = useSegmentOverride()

  const entries = Object.entries(colorOverrides)
  if (!entries.length) return null

  const css = entries
    .map(([id, color]) => {
      const idSel   = CSS.escape(id)        // for #id selector
      const hrefVal = id.replace(/"/g, '\\"') // safe inside the quoted attr value
      return (
        `section#${idSel}{--accent:${color}!important}` +
        `.nav-jump a[href="#${hrefVal}"],` +
        `.nav-mobile-menu a[href="#${hrefVal}"]{--accent:${color}!important}`
      )
    })
    .join('')

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
