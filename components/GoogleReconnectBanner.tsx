'use client'

/**
 * Shown when fetchGoogleAds() returns authExpired:true (invalid_grant).
 * Links to /api/google-oauth/start which kicks off the OAuth re-auth flow.
 */
export default function GoogleReconnectBanner() {
  return (
    <div style={{
      background:    '#1a1a1a',
      border:        '1px solid #3f3f3f',
      borderLeft:    '3px solid #f87171',
      borderRadius:  6,
      padding:       '10px 16px',
      margin:        '12px 24px 0',
      display:       'flex',
      alignItems:    'center',
      justifyContent:'space-between',
      gap:           12,
    }}>
      <span style={{ color: '#f87171', fontSize: 13, fontFamily: 'monospace' }}>
        ⚠ Google Ads — refresh token expired or revoked
      </span>
      <a
        href="/api/google-oauth/start"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          background:    '#4285f4',
          color:         '#fff',
          padding:       '5px 14px',
          borderRadius:  5,
          fontSize:      12,
          fontWeight:    600,
          textDecoration:'none',
          whiteSpace:    'nowrap',
          letterSpacing: '0.02em',
        }}
      >
        Reconnect Google Ads
      </a>
    </div>
  )
}
