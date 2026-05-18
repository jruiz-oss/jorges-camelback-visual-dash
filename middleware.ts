import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// HMAC helper — must mirror app/api/auth/route.ts. Edge runtime can't use
// Node's `crypto` module, so we use Web Crypto here.
async function hmacHex(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let login page and auth API through
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next()
  }

  const password = process.env.DASHBOARD_PASSWORD
  if (!password) {
    // Misconfigured environment — never let unauthenticated traffic through
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const cookie   = request.cookies.get('dashboard_auth')
  const secret   = process.env.DASHBOARD_AUTH_SECRET || password
  const expected = await hmacHex(password, secret)

  if (!cookie?.value || cookie.value !== expected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
