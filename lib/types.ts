export interface Ad {
  id: string
  name: string
  status: string   // ACTIVE | ENABLED | PAUSED | DISABLED | REMOVED | UNKNOWN
  imageUrl: string
  videoUrl?: string   // Playable MP4 source URL — set for Meta video ads
  videoId?: string    // Meta video_id — used by /api/meta-thumb for on-demand thumbnails
  previewUrl?: string // Meta ad preview iframe src — shows live ad including video
  headline: string
  // Multi-variant text + images. Used pre-explode; cards in the UI always show one of each.
  headlines?: string[]
  descriptions?: string[]
  imageUrls?: string[]
  campaign?: string
  adType?: string
  // Human-readable channel label derived from adType (Google) or channelType (StackAdapt).
  // e.g. "Search", "Display", "YouTube", "Native", "Audio".
  // Used to build the dynamic handle string in the platform header.
  channel?: string
  // Landing page URL path extracted from the ad's destination URL.
  // e.g. "/aquatopia-waterpark" from "https://camelbackresort.com/aquatopia-waterpark/"
  // Meta: sourced from link_data.link · Google: sourced from ad.final_urls[0]
  destinationUrl?: string
}
