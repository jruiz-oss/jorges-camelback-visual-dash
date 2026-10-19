/**
 * Where a client's ad filter comes from (server only): the
 * {PREFIX}_AD_FILTER env var in Vercel (format in lib/ad-filter.ts), else the
 * optional `adFilter` in lib/clients.ts. Env vars are shared by every viewer,
 * which is the point: a browser-side filter would only hide ads on the admin's
 * own screen.
 */

import type { ClientConfig } from './clients'
import { parseAdFilterEnv, type AdFilter } from './ad-filter'

export const adFilterEnvName = (client: ClientConfig) => `${client.envPrefix}_AD_FILTER`

export function getAdFilter(client: ClientConfig): AdFilter | undefined {
  return parseAdFilterEnv(process.env[adFilterEnvName(client)]) ?? client.adFilter
}
