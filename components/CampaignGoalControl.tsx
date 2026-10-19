'use client'

import { useState } from 'react'
import { usePerf } from './PerfContext'
import PerfDot from './PerfDot'
import GoalForm from './GoalForm'
import { fmtMetric, type PerfPlatform } from '@/lib/goals'
import { campaignKey } from '@/lib/segments'

// Admin-only, in each campaign lane header (Meta + StackAdapt only): the
// campaign's roll-up dot, which goal applies (campaign override or account
// default), and an editor to set/clear a campaign-specific goal.
export default function CampaignGoalControl({ platform, campaign, adIds, saCampaignId }: {
  platform: string
  campaign: string | undefined
  /** Tile ids in this lane — Meta roll-up sums these ads' metrics. */
  adIds:    string[]
  /** StackAdapt campaign id (metrics are campaign-level there). */
  saCampaignId?: string
}) {
  const { enabled, perf, goalFor, scoreCampaign, saveCampaignGoal, metaEvents, defaultMetaEvent } = usePerf()
  const [open, setOpen] = useState(false)
  if (!enabled || (platform !== 'meta' && platform !== 'stackadapt')) return null
  const p = platform as PerfPlatform

  const { goal, source } = goalFor(p, campaign)
  const key = campaignKey(p, campaign)
  const label = goal
    ? `${goal.metric.toUpperCase()} ${fmtMetric(goal.metric, goal.target)}${source === 'account' ? ' · account' : ''}`
    : 'No goal'

  return (
    <div className="campaign-goal" onClick={e => e.stopPropagation()}>
      {perf && <PerfDot score={scoreCampaign(p, campaign, adIds, saCampaignId)} />}
      <button
        type="button"
        className={`campaign-goal-btn${source === 'campaign' ? ' is-override' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={source === 'campaign' ? 'Campaign-specific goal (overrides account)' : 'Set a goal just for this campaign'}
      >
        🎯 {label}
      </button>
      {open && (
        <div className="campaign-goal-pop">
          <div className="campaign-goal-pop-head">
            Campaign goal {source === 'campaign' ? '(override)' : '— empty uses the account goal'}
          </div>
          <GoalForm
            key={JSON.stringify(source === 'campaign' ? goal : null)}
            platform={p}
            initial={source === 'campaign' ? goal : null}
            events={metaEvents}
            defaultEvent={defaultMetaEvent}
            onSave={g => saveCampaignGoal(key, g)}
            onClear={() => saveCampaignGoal(key, null)}
            clearLabel="Use account goal"
          />
        </div>
      )}
    </div>
  )
}
