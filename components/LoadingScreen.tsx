'use client'

// Shared premium-light loading view. Rendered both by the route-level
// app/[client]/loading.tsx (server) and by the login page's "navigating"
// branch, so the hand-off from login → dashboard is one seamless screen.
//
// Design: a soft light gradient base with two slowly drifting color "aurora"
// blobs (kept very low-opacity so it stays premium, not playful), the
// orbiting HulaCarousel with brand-tinted tile glows, a refined headline with
// rotating status copy, and an indeterminate shimmer line that signals motion.

import { useEffect, useState } from 'react'
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

export default function LoadingScreen() {
  const [i, setI] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % MESSAGES.length), 1900)
    return () => clearInterval(id)
  }, [])

  return (
    <main
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
