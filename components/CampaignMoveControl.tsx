'use client'

import { useSegmentOverride } from './SegmentOverrideContext'

interface Props {
  /** lib/segments.ts campaignKey(platform, campaign) — what the move is stored under. */
  campaignKey: string
  /** Every tile id in this campaign lane — per-tile moves inside it get cleared
   *  when the whole campaign is moved or reset. */
  adIds: string[]
  /** Segment this campaign is currently rendered under (server-classified,
   *  overrides already applied) — used as the select's current value. */
  segmentId: string
  allSegments: { id: string; name: string }[]
}

// Admin-only: move a whole campaign to a different segment in one action,
// instead of changing each CreativeTile's own "Group" select one at a time.
// Stored as ONE campaign-level override (SegmentOverrideContext
// .setCampaignSegment), not one entry per tile — see that file for why.
export default function CampaignMoveControl({ campaignKey, adIds, segmentId, allSegments }: Props) {
  const {
    editMode, getName, adSegmentOverrides, campaignSegmentOverrides,
    setCampaignSegment, clearCampaignSegment,
  } = useSegmentOverride()
  if (!editMode || allSegments.length === 0) return null

  const campaignMoved = campaignKey in campaignSegmentOverrides
  const tileMoves     = adIds.filter(id => id in adSegmentOverrides).length
  const anyMoved      = campaignMoved || tileMoves > 0

  return (
    <div className="campaign-move-control" onClick={e => e.stopPropagation()}>
      <span className="campaign-move-label">Move campaign</span>
      <select
        className="campaign-move-select"
        value={segmentId}
        onChange={e => {
          const target = e.target.value
          if (!target || target === segmentId) return
          setCampaignSegment(campaignKey, target, adIds)
        }}
        title={`Move all ${adIds.length} ads in this campaign to a different group`}
        aria-label="Move entire campaign to a different group"
      >
        {allSegments.map(s => (
          <option key={s.id} value={s.id}>{getName(s.id, s.name)}</option>
        ))}
      </select>
      {anyMoved && (
        <button
          type="button"
          className="campaign-move-reset"
          onClick={() => clearCampaignSegment(campaignKey, adIds)}
          title="Undo manual moves for this campaign — restore auto-classification"
          aria-label="Undo campaign move"
        >
          ↺
        </button>
      )}
    </div>
  )
}
