import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { password } = await request.json()
  const correct = process.env.DASHBOARD_PASSWORD

  if (!correct || password !== correct) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('dashboard_auth', correct, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return res
}
