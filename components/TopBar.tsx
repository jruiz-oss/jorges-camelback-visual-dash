'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useSegmentOverride } from './SegmentOverrideContext'

// Sticky two-row top nav for the redesigned "live wall" dashboard.
//
// Row 1 — brand H1 + sub, totals (live / campaigns / creatives), Refresh button.
// Row 2 — jump pills (with letter-mark chip + name + live/total count) and
// the live ticker (LIVE • date • clock • auto-refresh cadence).
//
// Nav items are *segments* (Aquatopia / Lodge / CMA) since the wall is now
// grouped that way; the component itself stays generic — pass anything with
// `{id, name, mark, accent}` and it renders a jump pill for it.
//
// Active section highlight uses an IntersectionObserver against the
// `<section id="…">` blocks rendered by SegmentSection. The rootMargin biases
// the trigger line ~1/3 down the viewport so the pill flips as the segment
// header crosses, not when the section first peeks in.
//
// Soft polling: every 60s we call `router.refresh()` (Next 14 app-router pattern)
// which re-runs the server component's data fetch in place — no full reload,
// no scroll jump, no auth re-handshake. Manual refresh button does the same.

export interface NavTotal {
  id:        string
  active:    number   // live creatives
  total:     number   // all creatives (regardless of status)
  campaigns: number
}

export interface NavItem {
  id:     string
  name:   string
  /** Short letter/abbr shown in the pill mark chip (e.g. "A", "L", "CMA"). */
  mark:   string
  /** CSS color used for the pill mark chip background. */
  accent: string
}

interface Props {
  brandH1?:  string
  brandSub?: string
  navItems:  NavItem[]
  totals:    NavTotal[]
  /** Display only — internal note that this lives in our codebase. */
  innerNote?: string
}

// ── Derive a short mark/initials from a display name.
// Rules (in priority order):
//   1. All-caps single token (e.g. "CMA") → use as-is, capped at 3 chars.
//   2. Multi-word name → first letter of each word, up to 3 words, uppercased.
//   3. Single word → first letter uppercased.
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) {
    const w = words[0]
    // All-caps or short acronym: keep as-is (up to 3 chars).
    if (w === w.toUpperCase() && w.length <= 4) return w.slice(0, 3)
    return w[0].toUpperCase()
  }
  return words
    .slice(0, 3)
    .map(w => w[0].toUpperCase())
    .join('')
}

// ── Jump-pill mark — segment letter chip. Color comes from the `--accent`
// CSS variable set on the parent <a>, so the mark + pill share one source
// of truth for the segment color (used by the active-state fill below).
// The mark is derived from the current display name so renames keep it in sync.
function JumpMark({ mark }: { mark: string }) {
  return (
    <span className="jump-mark" aria-hidden>
      {mark}
    </span>
  )
}

// ── Clock for the live ticker. 1s tick. Avoids hydration mismatch by
// rendering empty until the effect runs on the client.
function useClock(): Date | null {
  const [t, setT] = useState<Date | null>(null)
  useEffect(() => {
    setT(new Date())
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

function fmtTime(d: Date): string {
  // 24h with seconds. TZ abbreviation comes from the browser's locale so the
  // viewer sees their wall-clock time, not the server's region.
  const time = d.toLocaleTimeString(undefined, {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  // Browser timeZoneName: 'short' on its own returns "GMT-4" in some locales;
  // attach via toLocaleString and pick the trailing zone token.
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? ''
  return zone ? `${time} ${zone}` : time
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Active-section tracking. Single observer covering all section ids.
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const els = ids
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el)
    if (!els.length) return

    const obs = new IntersectionObserver(
      (entries) => {
        // Among currently-intersecting entries, pick the one whose top is
        // closest to the trigger line (~140px from viewport top).
        const visible = entries.filter(e => e.isIntersecting)
        if (!visible.length) return
        visible.sort((a, b) =>
          Math.abs(a.boundingClientRect.top - 140) -
          Math.abs(b.boundingClientRect.top - 140)
        )
        setActive(visible[0].target.id)
      },
      { rootMargin: '-130px 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  // ids are stable strings derived from a constant; join for dep equality.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|')])

  return active
}

export default function TopBar({
  brandH1   = 'Camelback Resort',
  brandSub  = 'Ad Dashboard · Powered by Commit Agency',
  navItems,
  totals,
  innerNote,
}: Props) {
  const now      = useClock()
  const active   = useActiveSection(navItems.map(p => p.id))
  const { getName } = useSegmentOverride()
  const navRef   = useRef<HTMLElement>(null)

  // Auto-scroll the nav pill strip so the active tab stays visible.
  // `inline: 'nearest'` means: do nothing if already fully in view,
  // scroll just enough if it's clipped on either side.
  useEffect(() => {
    if (!active || !navRef.current) return
    const pill = navRef.current.querySelector<HTMLElement>(`a[href="#${active}"]`)
    if (pill) pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [active])

  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const allActive    = totals.reduce((s, t) => s + t.active,    0)
  const allCampaigns = totals.reduce((s, t) => s + t.campaigns, 0)
  const allCreatives = totals.reduce((s, t) => s + t.total,     0)

  // Soft 60s refresh — re-runs the server component's fetch in place. No full
  // page reload (preserves scroll + auth cookie roundtrip).
  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => router.refresh())
    }, 60_000)
    return () => clearInterval(id)
  }, [router])

  const onRefreshClick = () => {
    startTransition(() => router.refresh())
  }

  const onJumpClick = (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Row 1 — brand + totals + refresh */}
        <div className="topbar-row r1">
          <div className="brand">
            <span className="dot" aria-hidden />
            <div className="brand-text">
              <div className="brand-h1">{brandH1}</div>
              <div className="brand-sub">
                {brandSub}
                {innerNote && (
                  <>
                    {' '}
                    <span style={{
                      color: 'var(--ink-3)', fontWeight: 400,
                    }}>
                      · {innerNote}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="top-totals">
            <div className="stat">
              <span className="stat-n">{allActive}</span>
              <span className="stat-l">Live</span>
            </div>
            <div className="stat">
              <span className="stat-n">{allCampaigns}</span>
              <span className="stat-l">Campaigns</span>
            </div>
            <div className="stat">
              <span className="stat-n">{allCreatives}</span>
              <span className="stat-l">Creatives</span>
            </div>
          </div>

          <button
            type="button"
            className={`refresh ${isPending ? 'is-spinning' : ''}`}
            onClick={onRefreshClick}
            aria-label="Refresh dashboard data"
          >
            <span className="spinner" aria-hidden>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 8a6 6 0 1 1-1.76-4.24M14 2v3.5h-3.5"/>
              </svg>
            </span>
            Refresh
          </button>
        </div>

        {/* Row 2 — segment jump pills + ticker */}
        <div className="topbar-row r2">
          <div className="nav-jump-wrap">
            <nav ref={navRef} className="nav-jump" aria-label="Jump to segment">
              {navItems.map(p => {
                const t           = totals.find(x => x.id === p.id)
                const displayName = getName(p.id, p.name)
                const mark        = getInitials(displayName)
                return (
                  <a
                    key={p.id}
                    href={`#${p.id}`}
                    onClick={onJumpClick(p.id)}
                    className={active === p.id ? 'active' : ''}
                    style={{ ['--accent' as string]: p.accent }}
                  >
                    <JumpMark mark={mark} />
                    <span>{displayName}</span>
                    {t && (
                      <span className="jump-count">{t.active}/{t.total}</span>
                    )}
                  </a>
                )
              })}
            </nav>
            <div className="nav-jump-fade" aria-hidden />
          </div>

          <div className="ticker">
            <span className="live-mark">● LIVE</span>
            <span className="sep hide-narrow" />
            <span className="hide-narrow">{now ? fmtDate(now) : ''}</span>
            <span className="sep" />
            <span>{now ? fmtTime(now) : ''}</span>
            <span className="sep hide-narrow" />
            <span className="hide-narrow">auto-refresh · 60s</span>
          </div>
        </div>
      </div>
    </header>
  )
}
