"use client"

import { ImagePlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlaceTile } from "@/components/explore/place-tile"
import { captionFor } from "@/lib/library/chapters"
import type { LibraryItem } from "@/lib/library/types"
import { useLibraryActions } from "./library-actions"
import { HeartButton, LibraryPlaceMenu, SelectMark } from "./library-place-menu"

/**
 * Explore's PlaceTile with the Library's own controls: the heart, a ⋯ menu,
 * the selection mark (on hover, or always while selecting) and, for a place
 * with no photo yet, a "Find image" pill over the poster.
 */
export function LibraryTile({
  item,
  siblings,
  className,
}: {
  item: LibraryItem
  siblings: string[]
  className?: string
}) {
  const a = useLibraryActions()
  const caption = captionFor(item)
  const checked = a.selected.has(item.id)

  return (
    <div className="relative">
      <PlaceTile
        place={item}
        shape="poster"
        caption={caption?.text}
        captionQuote={caption?.quote}
        showPlanned
        compact={a.selecting ? true : "mobile"}
        selected={checked}
        onOpen={() => a.activate(item.id, siblings)}
        className={cn("aspect-[3/4] w-full sm:w-full", className)}
        leading={
          <SelectMark
            checked={checked}
            label={`Select ${item.name}`}
            onToggle={() => a.toggleSelect(item.id)}
            className={cn(
              !a.selecting &&
                "hidden [@media(hover:hover)]:group-hover:flex [@media(hover:hover)]:group-has-[:focus-visible]:flex"
            )}
          />
        }
        actions={
          <>
            <HeartButton id={item.id} name={item.name} />
            <LibraryPlaceMenu
              item={item}
              siblings={siblings}
              className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:data-[state=open]:opacity-100"
            />
          </>
        }
      />
      {item.photos.length === 0 && !a.selecting && (
        <button
          type="button"
          onClick={() => a.findImage(item)}
          className="absolute left-1/2 top-[46%] z-[3] inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/35 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md transition hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ImagePlus className="h-3.5 w-3.5" /> Find image
        </button>
      )}
    </div>
  )
}
