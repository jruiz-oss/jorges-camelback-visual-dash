/**
 * Server-only isolation guard. Two clients sharing a password or an ad
 * account / customer / advertiser ID would silently show each other's data
 * (or make login land on the wrong dashboard), so refuse loudly instead.
 */

import { CLIENTS, type ClientConfig } from './clients'

const GUARDED = [
  'PASSWORD',
  'META_AD_ACCOUNT_ID',
  'GOOGLE_CUSTOMER_ID',
  'STACKADAPT_ADVERTISER_ID',
] as const

const norm = (v: string | undefined) => (v ?? '').replace(/[\s-]/g, '').toLowerCase()

/** Returns a human-readable collision message, or null when the client is isolated. */
export function findCredentialCollision(client: ClientConfig): string | null {
  for (const name of GUARDED) {
    const mine = norm(process.env[`${client.envPrefix}_${name}`])
    if (!mine) continue
    for (const other of CLIENTS) {
      if (other.slug === client.slug) continue
      if (norm(process.env[`${other.envPrefix}_${name}`]) === mine) {
        // Never print the value — PASSWORD is a secret.
        return `${client.envPrefix}_${name} has the same value as ${other.envPrefix}_${name}`
      }
    }
  }
  return null
}
