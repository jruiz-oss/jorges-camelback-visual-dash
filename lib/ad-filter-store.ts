/**
 * Where a client's ad filter lives. The admin panel saves it to Upstash Redis
 * (`adfilter:v1:<slug>`); if nothing is saved there, the optional `adFilter` in
 * lib/clients.ts is used. A saved doc (even an empty one) wins over the code
 * default, so clearing the filter in the panel really clears it.
 */

import { kvGetJson } from './kv'
import { sanitizeAdFilter, type AdFilter } from './ad-filter'

export const adFilterKey = (slug: string) => `adfilter:v1:${slug}`

export async function loadAdFilter(slug: string, codeDefault?: AdFilter): Promise<AdFilter | undefined> {
  const raw = await kvGetJson<unknown>(adFilterKey(slug))
  if (raw === undefined) return codeDefault      // nothing saved (or no Redis)
  if (raw === null) {
    console.error(`[ad-filter] Redis read failed for ${slug} — using code default`)
    return codeDefault
  }
  return sanitizeAdFilter(raw)
}
