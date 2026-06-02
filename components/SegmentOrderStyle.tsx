'use client'

import { useSegmentOverride } from './SegmentOverrideContext'

// Injects a <style> tag that applies CSS `order` to each segment <section>
// based on the admin-saved segmentOrder. The .platforms container is already
// `display:flex; flex-direction:column`, so `order` changes the visual
// sequence without touching the DOM — the IntersectionObserver in TopBar
// still fires on the correct elements since it tracks by viewport geometry.
//
// When segmentOrder is empty (no saved order yet), nothing is injected and
// the server-rendered DOM order is used as-is.
//
// New segments not present in segmentOrder fall back to order:999 so they
// appear after all explicitly ordered segments until the admin re-saves.

interface Props {
  /** Segment IDs as they appear in the server-rendered DOM (natural order). */
  segmentIds: string[]
}

export default function SegmentOrderStyle({ segmentIds }: Props) {
  const { segmentOrder } = useSegmentOverride()

  if (!segmentOrder.length) return null

  const css = segmentIds
    .map(id => {
      const rank  = segmentOrder.indexOf(id)
      const order = rank === -1 ? 999 : rank
      return `section#${CSS.escape(id)}{order:${order}}`
    })
    .join('')

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
