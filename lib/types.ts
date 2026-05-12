export interface Ad {
  id: string
  name: string
  status: string   // ACTIVE | ENABLED | PAUSED | DISABLED | REMOVED | UNKNOWN
  imageUrl: string
  headline: string
  campaign?: string
  adType?: string
}
