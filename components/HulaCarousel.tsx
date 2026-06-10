'use client'

import { useLayoutEffect, useRef } from 'react'
import { GoogleAdsLogo, MetaLogo, StackAdaptLogo } from '@/components/PlatformLogo'

const LOGOS = [
  { id: 'google', el: <GoogleAdsLogo size={56} /> },
  { id: 'meta',   el: <MetaLogo size={56} /> },
  { id: 'stack',  el: <StackAdaptLogo size={56} /> },
]

const RADIUS = 52
const SPEED  = 0.85                       // rad / sec
const PERIOD = (2 * Math.PI) / SPEED      // sec for one full orbit
const STEPS  = 36                         // keyframe samples (every 10°)

// Pose at a given orbit angle. Used to bake the CSS keyframes (below) and
// to seed each logo's first paint so there's no jump before animation.
function poseFor(a: number) {
  const x = Math.sin(a) * RADIUS
  const z = Math.cos(a)
  const t = (z + 1) / 2

  const scale   = 0.55 + 0.45 * t
  const opacity = z < -0.75
    ? Math.max(0, (z + 1) * 4)
    : 0.3 + 0.7 * t

  return {
    transform: `translateX(calc(-50% + ${x.toFixed(2)}px)) translateY(-50%) scale(${scale.toFixed(3)})`,
    opacity: opacity.toFixed(3),
    zIndex: Math.round(t * 100),
  }
}

// Build the @keyframes string once at module load. transform + opacity are
// compositor-animatable, so the orbit runs off the main thread and can't
// stutter while React hydrates or the dashboard data is fetching.
const KEYFRAMES = (() => {
  let frames = ''
  for (let s = 0; s <= STEPS; s++) {
    const pct  = ((s / STEPS) * 100).toFixed(3)
    const pose = poseFor((s / STEPS) * 2 * Math.PI)
    frames += `${pct}%{transform:${pose.transform};opacity:${pose.opacity};z-index:${pose.zIndex};}`
  }
  return `@keyframes hulaOrbit{${frames}}`
})()

export default function HulaCarousel() {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([null, null, null])

  // Anchor the orbit to shared wall-clock time so a fresh mount (e.g. the
  // login "navigating" view handing off to the route-level loading.tsx)
  // resumes exactly where the previous instance was, instead of restarting
  // the animation clock from 0 and visibly jumping. Runs in useLayoutEffect
  // (client-only, before paint) so there's no hydration mismatch or flash.
  useLayoutEffect(() => {
    const elapsed = (Date.now() / 1000) % PERIOD   // position in current cycle
    itemRefs.current.forEach((el, i) => {
      if (!el) return
      const phaseSec = (i / 3) * PERIOD
      el.style.animationDelay = `${(-(elapsed + phaseSec)).toFixed(3)}s`
    })
  }, [])

  return (
    <div style={{ position: 'relative', width: 200, height: 72, margin: '0 auto' }}>
      <style>{KEYFRAMES}</style>
      {LOGOS.map((logo, i) => {
        const phase = (i / 3) * 2 * Math.PI
        const pose  = poseFor(phase)        // first-paint pose = animation start
        return (
          <div
            key={logo.id}
            ref={el => { itemRefs.current[i] = el }}
            style={{
              position: 'absolute', left: '50%', top: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              willChange: 'transform, opacity',
              width: 76, height: 76,
              background: '#ffffff',
              borderRadius: 18,
              boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
              transform: pose.transform,
              opacity: pose.opacity,
              zIndex: pose.zIndex,
              // negative delay starts each logo at its phase offset; the layout
              // effect above replaces this with a wall-clock-anchored delay.
              animation: `hulaOrbit ${PERIOD.toFixed(3)}s linear ${(-(i / 3) * PERIOD).toFixed(3)}s infinite`,
            }}
          >
            {logo.el}
          </div>
        )
      })}
    </div>
  )
}
