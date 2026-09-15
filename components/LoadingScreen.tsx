'use client'

// Shared premium-light loading view. Rendered both by the route-level
// app/[client]/loading.tsx (server) and by the login page's "navigating"
// branch, so the hand-off from login → dashboard is one seamless screen.
//
// Design: a soft light gradient base with two slowly drifting color "aurora"
// blobs (kept very low-opacity so it stays premium, not playful), the
// orbiting HulaCarousel with brand-tinted tile glows, a refined headline with
// rotating status copy, and an indeterminate shimmer line that signals motion.

import { useLayoutEffect, useRef, useState } from 'react'
import HulaCarousel from '@/components/HulaCarousel'

const MESSAGES = [
  'Connecting to your ad platforms…',
  'Syncing Google Ads…',
  'Fetching Meta creatives…',
  'Loading StackAdapt placements…',
  'Building your live wall…',
]

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif'

// Animation periods (seconds). Every looping animation on this screen is
// anchored to wall-clock time via a negative animation-delay, the same trick
// HulaCarousel uses, so a fresh mount picks up mid-cycle instead of
// restarting from frame 0.
const MSG_PERIOD   = 1.9
const DRIFT_A      = 14
const DRIFT_B      = 16
const SHIMMER      = 1.6

// Module-level flag: true once any LoadingScreen instance has mounted in
// this browser session. The login page's "navigating" branch and the
// route-level app/[client]/loading.tsx each mount their own instance, so
// without this the second one replays the ls-fade entrance (opacity 0 → 1)
// and reads as a visible cut. A hard reload resets module state, so the
// very first screen a visitor sees still fades in.
let hasMountedOnce = false

export default function LoadingScreen() {
  const [i, setI] = useState(0)
  const mainRef    = useRef<HTMLElement | null>(null)
  const blobARef   = useRef<HTMLDivElement | null>(null)
  const blobBRef   = useRef<HTMLDivElement | null>(null)
  const shimmerRef = useRef<HTMLDivElement | null>(null)
  const textRef    = useRef<HTMLParagraphElement | null>(null)

  // Phase-align everything before first paint (useLayoutEffect is
  // client-only, so no hydration mismatch — the SSR markup keeps its
  // static delays and gets patched on the client).
  useLayoutEffect(() => {
    const now = Date.now() / 1000

    if (hasMountedOnce && mainRef.current) {
      mainRef.current.style.animation = 'none'
      mainRef.current.style.opacity = '1'
    }
    hasMountedOnce = true

    if (blobARef.current)   blobARef.current.style.animationDelay   = `-${(now % DRIFT_A).toFixed(3)}s`
    if (blobBRef.current)   blobBRef.current.style.animationDelay   = `-${(now % DRIFT_B).toFixed(3)}s`
    if (shimmerRef.current) shimmerRef.current.style.animationDelay = `-${(now % SHIMMER).toFixed(3)}s`

    // Status copy: index and fade phase both derive from the wall clock so
    // the message and its in/out fade continue across the remount.
    const tick = Math.floor(now / MSG_PERIOD)
    setI(tick % MESSAGES.length)
    const untilNext = (tick + 1) * MSG_PERIOD - now

    let interval: ReturnType<typeof setInterval> | undefined
    const timeout = setTimeout(() => {
      setI(n => (n + 1) % MESSAGES.length)
      interval = setInterval(() => setI(n => (n + 1) % MESSAGES.length), MSG_PERIOD * 1000)
    }, untilNext * 1000)

    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  // Re-run on each message change: the <p> is re-keyed so it's a new node,
  // and its fade needs to start at the clock-derived offset (≈0 on normal
  // ticks; mid-fade on the remount).
  useLayoutEffect(() => {
    if (!textRef.current) return
    const now = Date.now() / 1000
    textRef.current.style.animationDelay = `-${(now % MSG_PERIOD).toFixed(3)}s`
  }, [i])

  return (
    <main
      ref={mainRef}
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: FONT,
        gap: 28,
        // Light premium base: near-white center falling off to cool slate.
        background:
          'radial-gradient(120% 120% at 50% 30%, #ffffff 0%, #eef2f8 55%, #e2e8f1 100%)',
        animation: 'ls-fade 0.6s ease both',
      }}
    >
      <style>{`
        @keyframes ls-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ls-drift-a {
          0%   { transform: translate(-12%, -8%) scale(1);   }
          50%  { transform: translate(10%, 6%)  scale(1.15); }
          100% { transform: translate(-12%, -8%) scale(1);   }
        }
        @keyframes ls-drift-b {
          0%   { transform: translate(10%, 8%)  scale(1.1); }
          50%  { transform: translate(-8%, -6%) scale(0.95);}
          100% { transform: translate(10%, 8%)  scale(1.1); }
        }
        @keyframes ls-text {
          0%, 100% { opacity: 0; transform: translateY(4px); }
          15%, 85% { opacity: 1; transform: translateY(0);  }
        }
        @keyframes ls-shimmer {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(420%);  }
        }
      `}</style>

      {/* Aurora blobs — subtle, blurred, drifting */}
      <div
        ref={blobARef}
        aria-hidden
        style={{
          position: 'absolute',
          width: 460,
          height: 460,
          top: '14%',
          left: '50%',
          marginLeft: -340,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(96,165,250,0.22) 0%, rgba(96,165,250,0) 70%)',
          filter: 'blur(8px)',
          animation: 'ls-drift-a 14s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <div
        ref={blobBRef}
        aria-hidden
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          top: '24%',
          left: '50%',
          marginLeft: -40,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(167,139,250,0.20) 0%, rgba(167,139,250,0) 70%)',
          filter: 'blur(8px)',
          animation: 'ls-drift-b 16s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Foreground content */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 26,
        }}
      >
        <HulaCarousel />

        <div style={{ textAlign: 'center', minHeight: 44 }}>
          {/* key forces the fade-in to replay on each message change */}
          <p
            key={i}
            ref={textRef}
            style={{
              fontSize: 16,
              color: '#334155',
              letterSpacing: 0.2,
              fontWeight: 600,
              margin: 0,
              animation: 'ls-text 1.9s ease both',
            }}
          >
            {MESSAGES[i]}
          </p>
          <p
            style={{
              fontSize: 12.5,
              color: '#94a3b8',
              letterSpacing: 0.4,
              fontWeight: 500,
              margin: '6px 0 0',
              textTransform: 'uppercase',
            }}
          >
            Live Ad Wall
          </p>
        </div>

        {/* Indeterminate shimmer line */}
        <div
          style={{
            position: 'relative',
            width: 180,
            height: 3,
            borderRadius: 3,
            background: 'rgba(148,163,184,0.22)',
            overflow: 'hidden',
          }}
        >
          <div
            ref={shimmerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '40%',
              height: '100%',
              borderRadius: 3,
              background:
                'linear-gradient(90deg, rgba(99,102,241,0) 0%, #6366f1 50%, rgba(99,102,241,0) 100%)',
              animation: 'ls-shimmer 1.6s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </main>
  )
}
