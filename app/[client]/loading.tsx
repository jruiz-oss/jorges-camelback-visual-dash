// Route-level loading screen shown by Next.js while app/[client]/page.tsx
// runs its server-side connector fetches (Meta / Google / StackAdapt).
// Pure static markup — reuses the real layout's chrome classes (.topbar,
// .platforms, .segment, .lane) so the skeleton occupies the same space the
// real content will, then swaps in without layout shift. Shimmer/skeleton
// styles live in app/layout.tsx (.skel, .skel-tile, .skel-loading-note).

function SkeletonSection({ tiles }: { tiles: number }) {
  return (
    <section className="segment" style={{ ['--accent' as string]: 'rgba(36,40,65,.35)' }}>
      <div className="segment-head">
        <div className="segment-id">
          <div className="skel" style={{ width: 40, height: 40, borderRadius: 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div className="skel" style={{ width: 180, height: 18 }} />
            <div className="skel" style={{ width: 260, height: 11 }} />
          </div>
        </div>
      </div>
      <div className="lane" style={{ overflowX: 'hidden' }}>
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="skel skel-tile" />
        ))}
      </div>
    </section>
  )
}

export default function Loading() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-row r1">
            <div className="brand">
              <span className="dot" />
              <div className="brand-text" style={{ gap: 7 }}>
                <div className="skel" style={{ width: 220, height: 22 }} />
                <div className="skel" style={{ width: 150, height: 10 }} />
              </div>
            </div>
            <span className="skel-loading-note">Loading live placements</span>
          </div>
        </div>
      </header>
      <main className="platforms">
        <SkeletonSection tiles={5} />
        <SkeletonSection tiles={4} />
        <SkeletonSection tiles={5} />
      </main>
    </>
  )
}
