import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CLIENTS, findClient } from '@/lib/clients'
import {
  makeSessionToken, verifySessionToken, sessionCookieName, sessionCookieOptions, slugFromPath,
} from '@/lib/session'

// Never let a browser or proxy cache a gated page: otherwise Back/forward or a
// shared cache could show a wall without a request reaching this check.
const NO_STORE = 'private, no-store, max-age=0, must-revalidate'

function toLogin(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', request.url))
  res.headers.set('Cache-Control', NO_STORE)
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always public: root (redirects to /login), login, Next.js internals.
  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next()
  }

  // API routes: only the login endpoint is public. Everything else needs a
  // valid session for SOME client (shared routes like /api/meta-img have no
  // slug); admin routes additionally check the specific client (lib/admin-auth).
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/auth')) return NextResponse.next()
    for (const client of CLIENTS) {
      const cookie = request.cookies.get(sessionCookieName(client.slug))?.value
      if (await verifySessionToken(client, cookie)) return NextResponse.next()
    }
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Every other path is gated. Slug is decoded + lowercased so encoded or
  // mixed-case variants of a client path can't skip the check.
  const slug = slugFromPath(pathname)
  if (slug === null) return toLogin(request)
  const client = findClient(slug)
  if (!client) {
    return NextResponse.next() // not a client route: static file or 404
  }

  const cookieName = sessionCookieName(client.slug)
  const cookie     = request.cookies.get(cookieName)?.value
  if (!(await verifySessionToken(client, cookie))) {
    const res = toLogin(request)
    if (cookie) res.cookies.delete(cookieName) // expired/invalid: clear it
    return res
  }

  // Sliding session: re-issue with a fresh timestamp on every authenticated
  // page request (incl. the wall's 60s soft refresh). See lib/session.ts.
  const res   = NextResponse.next()
  const token = await makeSessionToken(client)
  if (token) res.cookies.set(cookieName, token, sessionCookieOptions())
  res.headers.set('Cache-Control', NO_STORE)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
