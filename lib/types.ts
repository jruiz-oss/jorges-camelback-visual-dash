export interface Ad {
  id: string
  name: string
  status: string   // ACTIVE | ENABLED | PAUSED | DISABLED | REMOVED | UNKNOWN
  imageUrl: string
  headline: string
  // Multi-variant text for RSA/RDA/ETA — used to render text-only ads as cards
  headlines?: string[]
  descriptions?: string[]
  campaign?: string
  adType?: string
}
