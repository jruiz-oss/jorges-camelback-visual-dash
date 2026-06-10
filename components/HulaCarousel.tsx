'use client'

import { useEffect, useRef } from 'react'
import { GoogleAdsLogo, MetaLogo, StackAdaptLogo } from '@/components/PlatformLogo'

const LOGOS = [
  { id: 'google', el: <GoogleAdsLogo size={56} /> },
  { id: 'meta',   el: <MetaLogo size={56} /> },
  { id: 'stack',  el: <StackAdaptLogo size={56} /> },
]

const RADIUS = 52
const SPEED  = 0.85

// Position/scale/opacity for a given angle. Shared by the first paint
// (a=0) and every animation frame so the initial render already matches.
function poseFor(a: number, i: number) {
  const theta = a + (i / 3) * 2 * Math.PI
  const x = Math.sin(theta) * RADIUS
  const z = Math.cos(theta)
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

export default function HulaCarousel() {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([null, null, null])
  const rafRef   = useRef<number | null>(null)

  useEffect(() => {
    let start: number | null = null

    const tick = (ts: number) => {
      if (!start) start = ts
      const a = ((ts - start) / 1000) * SPEED

      itemRefs.current.forEach((el, i) => {
        if (!el) return
        const pose = poseFor(a, i)
        el.style.transform = pose.transform
        el.style.opacity   = pose.opacity
        el.style.zIndex    = String(pose.zIndex)
      })

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  return (
    <div style={{ position: 'relative', width: 200, height: 72, margin: '0 auto' }}>
      {LOGOS.map((logo, i) => {
        const pose = poseFor(0, i)
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
          }}
        >
          {logo.el}
        </div>
        )
      })}
    </div>
  )
}
