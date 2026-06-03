import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CLIENTS } from '@/lib/clients'

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

  // Always public: root, login, Next.js internals.
  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next()
  }

  // API routes: only the login endpoint and Google OAuth flow are public.
  // All other /api/* routes (e.g. /api/meta-img, /api/meta-thumb) require
  // a valid dashboard session so they can't be used as an open proxy by
  // unauthenticated callers.
  if (pathname.startsWith('/api/')) {
    const PUBLIC_API = ['/api/auth', '/api/google-oauth/']
    if (PUBLIC_API.some(p => pathname.startsWith(p))) {
      return NextResponse.next()
    }

    // For shared API routes (no client slug in the URL), accept any valid
    // client session cookie — the caller is already logged in to *some*
    // client dashboard, which is sufficient.
    const secret = process.env.DASHBOARD_AUTH_SECRET
    if (secret) {
      for (const client of CLIENTS) {
        const password = process.env[`${client.envPrefix}_PASSWORD`]
        if (!password) continue
        const cookieName = `dashboard_auth_${client.slug}`
        const cookie     = request.cookies.get(cookieName)
        if (!cookie?.value) continue
        const expected = await hmacHex(password, secret)
        if (cookie.value === expected) return NextResponse.next()
      }
    }

    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Identify which client this path belongs to (first segment after /)
  const slug   = pathname.split('/')[1]
  const client = CLIENTS.find(c => c.slug === slug)
  if (!client) {
    return NextResponse.next() // unknown route — let Next.js 404 it
  }

  const password = process.env[`${client.envPrefix}_PASSWORD`]
  if (!password) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const cookieName = `dashboard_auth_${client.slug}`
  const cookie     = request.cookies.get(cookieName)
  const secret     = process.env.DASHBOARD_AUTH_SECRET || password
  const expected   = await hmacHex(password, secret)

  if (!cookie?.value || cookie.value !== expected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
