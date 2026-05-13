export interface Ad {
  id: string
  name: string
  status: string   // ACTIVE | ENABLED | PAUSED | DISABLED | REMOVED | UNKNOWN
  imageUrl: string
  videoUrl?: string   // Playable MP4 source URL — set for Meta video ads
  previewUrl?: string // Meta ad preview iframe src — shows live ad including video
  headline: string
  // Multi-variant text + images. Used pre-explode; cards in the UI always show one of each.
  headlines?: string[]
  descriptions?: string[]
  imageUrls?: string[]
  campaign?: string
  adType?: string
}
