'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MetaLogo, GoogleAdsLogo, StackAdaptLogo } from './PlatformLogo'

// Sticky two-row top nav for the redesigned "live wall" dashboard.
//
// Row 1 — brand H1 + sub, totals (live / campaigns / creatives), Refresh button.
// Row 2 — platform jump pills (with brand-mark + name + live/total count) and
// the live ticker (LIVE • date • clock • auto-refresh cadence).
//
// Active platform highlight uses an IntersectionObserver against the
// `<section id="…">` blocks rendered by PlatformSection. The rootMargin biases
// the trigger line ~1/3 down the viewport so the pill flips as the platform
// header crosses, not when the section first peeks in.
//
// Soft polling: every 60s we call `router.refresh()` (Next 14 app-router pattern)
// which re-runs the server component's data fetch in place — no full reload,
// no scroll jump, no auth re-handshake. Manual refresh button does the same.

export interface PlatformTotal {
  id: string
  active: number   // live creatives
  total: number    // all creatives (regardless of status)
  campaigns: number
}

export interface PlatformNavItem {
  id: string
  name: string
  suffix?: string
  icon: 'meta' | 'google' | 'stackadapt'
}

interface Props {
  brandH1?: string
  brandSub?: string
  platforms: PlatformNavItem[]
  totals: PlatformTotal[]
  /** Display only — internal note that this lives in our codebase. */
  innerNote?: string
}

// ── Jump-pill marks — render the actual brand SVGs (full color) sourced from
// components/PlatformLogo.tsx. Meta + Google Ads come from the canonical
// simple-icons geometry; StackAdapt is a placeholder until the official SVG
// is dropped in.
function JumpMark({ icon }: { icon: PlatformNavItem['icon'] }) {
  return (
    <span className="jump-mark" aria-hidden>
      {icon === 'meta'   && <MetaLogo size={14} />}
      {icon === 'google' && <GoogleAdsLogo size={14} />}
      {icon === 'stackadapt' && <StackAdaptLogo size={14} />}
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

// ── Active-platform tracking. Single observer covering all section ids.
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
        // closest to the trigger line (~130px from viewport top).
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
  platforms,
  totals,
  innerNote,
}: Props) {
  const now    = useClock()
  const active = useActiveSection(platforms.map(p => p.id))

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

        {/* Row 2 — platform jump pills + ticker */}
        <div className="topbar-row r2">
          <nav className="nav-jump" aria-label="Jump to platform">
            {platforms.map(p => {
              const t = totals.find(x => x.id === p.id)
              return (
                <a
                  key={p.id}
                  href={`#${p.id}`}
                  onClick={onJumpClick(p.id)}
                  className={active === p.id ? 'active' : ''}
                >
                  <JumpMark icon={p.icon} />
                  <span>{p.name}{p.suffix ? ` ${p.suffix}` : ''}</span>
                  {t && (
                    <span className="jump-count">{t.active}/{t.total}</span>
                  )}
                </a>
              )
            })}
          </nav>

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
