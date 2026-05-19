/**
 * RETIRED — this endpoint used to dump raw Meta creative fields for
 * diagnostic purposes, gated by a passcode passed in the URL query string.
 * That design had two problems:
 *
 *   1. The passcode landed in Vercel access logs, browser history, and
 *      Referer headers (anything that captures URLs).
 *   2. The default `ADMIN_PIN || '1234'` fallback meant a missing env var
 *      silently granted access with the default PIN.
 *
 * The route now returns 410 Gone. If you need to inspect creative data,
 * run the relevant code path locally with a dev server instead of exposing
 * a public diagnostic endpoint.
 */

export async function GET() {
  return new Response('gone', { status: 410 })
}

export async function POST() {
  return new Response('gone', { status: 410 })
}
