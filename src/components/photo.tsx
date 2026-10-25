import Image from "next/image"
import { cn } from "@/lib/utils"
import { photoRoute, photoTint, resolverSrc, resolverSrcSet } from "@/lib/photo-url"

const FULL_WIDTHS = [320, 640, 960, 1280] as const
const THUMB_WIDTHS = [160, 320] as const

/**
 * A photo that fills its (positioned) parent and downloads only the pixels the
 * box needs. `sizes` is the box's CSS width, as for any responsive image.
 *
 * - `use="thumb"` for boxes up to ~160px wide: the 400px thumbnail is plenty.
 *   Everything bigger starts from the full image, because the thumbnail is a
 *   400px square and goes soft in a 3:4 poster on a 2x screen.
 * - Blob, Pexels and Wikimedia photos are resized by the Next optimizer.
 * - Google photos (the resolver URL) are sized with `?w=`; they never go through
 *   the optimizer, whose cache would keep Google image bytes.
 * - `priority` is for the image that is the page's LCP: it is preloaded.
 *
 * Until the photo arrives the box shows a tint, not a grey hole.
 */
export function Photo({
  src,
  thumb,
  use = "full",
  sizes,
  priority = false,
  alt = "",
  draggable,
  className,
}: {
  src: string
  thumb?: string
  use?: "thumb" | "full"
  sizes: string
  priority?: boolean
  alt?: string
  draggable?: boolean
  className?: string
}) {
  const small = use === "thumb"
  const url = small && thumb ? thumb : src
  const classes = cn("absolute inset-0 h-full w-full object-cover", photoTint(url), className)
  const route = photoRoute(url)

  if (route === "optimized") {
    return (
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        fetchPriority={priority ? "high" : undefined}
        draggable={draggable}
        className={classes}
      />
    )
  }

  const widths = small ? THUMB_WIDTHS : FULL_WIDTHS
  return (
    // Resolver and unknown hosts stay out of the optimizer (see above).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={route === "resolver" ? resolverSrc(url, widths[1]) : url}
      srcSet={route === "resolver" ? resolverSrcSet(url, widths) : undefined}
      sizes={route === "resolver" ? sizes : undefined}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      draggable={draggable}
      className={classes}
    />
  )
}
