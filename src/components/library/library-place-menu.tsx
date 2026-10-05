"use client"

import Link from "next/link"
import { Archive, ArrowUpRight, Eye, Heart, ImagePlus, MoreHorizontal, SquareCheck, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import type { LibraryItem } from "@/lib/library/types"
import { useLibraryActions } from "./library-actions"

/**
 * The ⋯ menu every Library view shares: look, open, heart, find a photo,
 * select, archive, delete. Archive and delete go through the page's existing
 * confirmation dialogs.
 */
export function LibraryPlaceMenu({
  item,
  siblings,
  tone = "glass",
  className,
}: {
  item: LibraryItem
  siblings: string[]
  tone?: "glass" | "plain"
  className?: string
}) {
  const a = useLibraryActions()
  const hearted = a.hearts.has(item.id)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More for ${item.name}`}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
            tone === "glass"
              ? "bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            className
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => a.openPlace(item.id, siblings)}>
          <Eye className="mr-2 h-4 w-4" /> Quick look
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/place/${item.id}`}>
            <ArrowUpRight className="mr-2 h-4 w-4" /> Open place
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => a.toggleHeart(item.id)}>
          <Heart className={cn("mr-2 h-4 w-4", hearted && "fill-current text-rose-500")} />
          {hearted ? "Remove heart" : "Heart it"}
        </DropdownMenuItem>
        {item.photos.length === 0 && (
          <DropdownMenuItem onClick={() => a.findImage(item)}>
            <ImagePlus className="mr-2 h-4 w-4" /> Find image
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => a.select(item.id)}>
          <SquareCheck className="mr-2 h-4 w-4" /> {a.selected.has(item.id) ? "Deselect" : "Select"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => a.archive([item.id])}>
          <Archive className="mr-2 h-4 w-4" /> Archive
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => a.remove([item.id])} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The round selection mark tiles and rows share. */
export function SelectMark({
  checked,
  label,
  onToggle,
  tone = "glass",
  className,
}: {
  checked: boolean
  label: string
  onToggle: () => void
  tone?: "glass" | "plain"
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : tone === "glass"
            ? "border-white bg-black/25 text-transparent backdrop-blur"
            : "border-muted-foreground/40 bg-background text-transparent",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  )
}

/** The glass heart on a tile; the same hearts Shuffle keeps (this device only until they sync). */
export function HeartButton({ id, name, className }: { id: string; name: string; className?: string }) {
  const a = useLibraryActions()
  const on = a.hearts.has(id)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove heart from ${name}` : `Heart ${name}`}
      onClick={() => a.toggleHeart(id)}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-white outline-none backdrop-blur-md transition hover:bg-black/55 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Heart className={cn("h-3.5 w-3.5", on && "fill-[#ff5a6e] text-[#ff5a6e]")} />
    </button>
  )
}
