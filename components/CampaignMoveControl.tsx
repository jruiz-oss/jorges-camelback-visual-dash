'use client'

import { useSegmentOverride } from './SegmentOverrideContext'

interface Props {
  /** Every ad id in this one campaign lane — what gets moved together. */
  adIds: string[]
  /** Segment this campaign is currently rendered under (server-classified,
   *  overrides already applied) — used as the select's current value. */
  segmentId: string
  allSegments: { id: string; name: string }[]
}

// Admin-only: reassign every ad in a campaign to a different segment in one
// action, instead of moving each CreativeTile's own "Group" select one at a
// time. Mirrors that per-ad control (see CreativeTile.tsx) but writes all ad
// ids in a single cookie update via SegmentOverrideContext.setAdSegments, so
// a 30-ad campaign moves in one click instead of thirty.
export default function CampaignMoveControl({ adIds, segmentId, allSegments }: Props) {
  const { editMode, adSegmentOverrides, setAdSegments, clearAdSegments } = useSegmentOverride()
  if (!editMode || allSegments.length === 0) return null

  const movedCount = adIds.filter(id => id in adSegmentOverrides).length
  const anyMoved = movedCount > 0

  return (
    <div className="campaign-move-control" onClick={e => e.stopPropagation()}>
      <span className="campaign-move-label">Move all {adIds.length}</span>
      <select
        className="campaign-move-select"
        value={segmentId}
        onChange={e => {
          const target = e.target.value
          if (!target || target === segmentId) return
          setAdSegments(adIds, target)
        }}
        title={`Move all ${adIds.length} ads in this campaign to a different group`}
        aria-label="Move entire campaign to a different group"
      >
        {allSegments.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {anyMoved && (
        <button
          type="button"
          className="campaign-move-reset"
          onClick={() => clearAdSegments(adIds)}
          title="Undo manual moves for this campaign — restore auto-classification"
          aria-label="Undo campaign move"
        >
          ↺{movedCount < adIds.length ? ` ${movedCount}` : ''}
        </button>
      )}
    </div>
  )
}
