// Official-style brand marks for each platform.
// SVGs are inlined (no external network calls, no broken CDN links).

type Props = { size?: number }

export function MetaLogo({ size = 22 }: Props) {
  return (
    <svg viewBox="0 0 287.56 191" width={size} height={size} aria-label="Meta">
      <defs>
        <linearGradient id="meta-a" x1="62.49" y1="101.41" x2="260.84" y2="91.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0064e1"/>
          <stop offset=".4" stopColor="#0064e1"/>
          <stop offset=".83" stopColor="#0073ee"/>
          <stop offset="1" stopColor="#0082fb"/>
        </linearGradient>
        <linearGradient id="meta-b" x1="41.42" y1="53" x2="41.42" y2="126" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0082fb"/>
          <stop offset="1" stopColor="#0064e0"/>
        </linearGradient>
      </defs>
      <path fill="#0081fb" d="M31.06 126c0 11 2.41 19.41 5.56 24.51A19 19 0 0 0 53.19 160c8.1 0 15.51-2 29.79-21.76 11.44-15.83 24.92-38 34-52l15.36-23.6c10.67-16.39 23-34.61 37.18-47C181.07 5.6 193.54 0 206.09 0c21.07 0 41.14 12.21 56.5 35.11 16.81 25.08 25 56.67 25 89.27 0 19.38-3.82 33.62-10.32 44.87C271 180.13 258.72 191 238.13 191v-31c17.63 0 22-16.2 22-34.74 0-26.42-6.16-55.74-19.73-76.69-9.63-14.86-22.11-23.94-35.84-23.94-14.85 0-26.8 11.2-40.23 31.17-7.14 10.61-14.47 23.54-22.7 38.13l-9.06 16.05c-18.2 32.27-22.81 39.62-31.91 51.75C84.74 183 71.12 191 53.19 191c-21.27 0-34.72-9.21-43-23.09L10.14 167.91C3.34 156.6 0 141.85 0 125.04Z"/>
      <path fill="url(#meta-b)" d="M24.49 37.3C38.73 15.35 59.28 0 82.85 0c13.65 0 27.22 4 41.39 15.61 15.5 12.65 32 33.48 52.63 67.81l7.39 12.32c17.84 29.72 28 45 33.93 52.22 7.64 9.26 13 12 19.94 12 17.63 0 22-16.2 22-34.74l27.4-.86c0 19.38-3.82 33.62-10.32 44.87C271 180.13 258.72 191 238.13 191c-12.8 0-24.14-2.78-36.68-14.61-9.64-9.08-20.91-25.21-29.58-39.71L146.08 93.6c-12.94-21.62-24.81-37.74-31.68-45-7.4-7.85-16.9-17.33-32.1-17.33-12.3 0-22.74 8.63-31.48 21.84Z"/>
      <path fill="url(#meta-a)" d="M82.35 31.23c-12.3 0-22.74 8.63-31.48 21.84C38.49 71.62 31.06 99.34 31.06 126c0 11 2.41 19.41 5.56 24.51L10.14 167.91C3.34 156.6 0 141.85 0 125.04 0 94.27 8.44 62.2 24.49 37.3 38.73 15.35 59.28 0 82.85 0Z"/>
    </svg>
  )
}

export function GoogleAdsLogo({ size = 22 }: Props) {
  // Modern Google Ads mark:
  //   • two PARALLEL yellow parallelograms (one full opacity, one lighter)
  //     tilted ~20° to the right — NOT crossed like an X
  //   • blue circle at the bottom-left (NOT green; previous code used the
  //     Gmail green #34A853 by mistake)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Google Ads">
      {/* Left/main yellow bar */}
      <rect
        x="8.5" y="1.5" width="3.5" height="15" rx="1.75"
        transform="rotate(20 10.25 9)"
        fill="#FBBC04"
      />
      {/* Right/secondary lighter yellow bar, parallel to the first */}
      <rect
        x="13" y="1.5" width="3.5" height="15" rx="1.75"
        transform="rotate(20 14.75 9)"
        fill="#FBBC04"
        opacity="0.55"
      />
      {/* Blue circle at bottom-left */}
      <circle fill="#4285F4" cx="5.5" cy="18.7" r="3.25" />
    </svg>
  )
}

export function StackAdaptLogo({ size = 22 }: Props) {
  // StackAdapt mark — gradient triangular "S"
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-label="StackAdapt">
      <defs>
        <linearGradient id="sa-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00C2A8"/>
          <stop offset="1" stopColor="#0096FF"/>
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="10" fill="url(#sa-grad)"/>
      <path fill="#fff" d="M14 18.6c0-3.4 3-5.9 7.7-5.9 4 0 7 1.9 8.1 5.1l-4.4 1.4c-.5-1.4-1.7-2.3-3.6-2.3-1.9 0-3 .8-3 1.9 0 1.2 1 1.7 3.7 2.2 4.6.8 7.6 2.3 7.6 6.3 0 3.7-3.2 6.3-8.1 6.3-4.5 0-7.7-2-9-5.5l4.5-1.4c.7 1.8 2.2 2.7 4.5 2.7 2.2 0 3.4-.8 3.4-2 0-1.2-.9-1.7-3.7-2.2-4.5-.8-7.7-2.3-7.7-6.6Z"/>
    </svg>
  )
}
