"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, FolderPlus, Shuffle } from "lucide-react"
import { cn } from "@/lib/utils"
import { flagFor } from "@/lib/explore/geo"
import { countriesIn, orderRail, type RailOrder } from "@/lib/explore/rails"
import type { RailRef } from "@/lib/explore/types"
import { useExplore } from "./explore-provider"
import { PlaceTile } from "./place-tile"
import { SaveCollectionDialog } from "./save-collection-dialog"

// Alternating aspect ratios give the grid a magazine rhythm instead of a catalogue.
const ASPECTS = ["aspect-[3/4]", "aspect-[4/5]", "aspect-square", "aspect-[3/4]", "aspect-[4/3]", "aspect-[4/5]"]

const ORDERS: Array<{ value: Exclude<RailOrder, "shuffle">; label: string }> = [
  { value: "top", label: "Top" },
  { value: "newest", label: "Newest" },
]

/**
 * The opened row: the rail's cover and title, a quick country filter, Top /
 * Newest / Shuffle ordering, and one action that saves what you see as a
 * collection.
 */
export function RailGridPage({ rail }: { rail: RailRef }) {
  const { places, openPlace } = useExplore()
  const list = React.useMemo(
    () => rail.placeIds.map((id) => places.get(id)).filter((p) => p !== undefined),
    [rail.placeIds, places]
  )
  const [country, setCountry] = React.useState<string | null>(null)
  const [order, setOrder] = React.useState<RailOrder>("top")
  const [seed, setSeed] = React.useState(0)

  const countries = React.useMemo(() => countriesIn(list), [list])
  const visible = React.useMemo(
    () => orderRail(country ? list.filter((p) => p.country === country) : list, order, seed),
    [list, country, order, seed]
  )
  const visibleIds = visible.map((p) => p.id)
  const cover = list.filter((p) => p.photos.length).slice(0, 4)
  const collectionName = country ? `${rail.title} · ${country}` : rail.title

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition",
      active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-secondary"
    )

  return (
    <div>
      {/* Cover: a four-photo spread with the rail's title set over it. */}
      <header className="relative h-[46vh] min-h-[340px] overflow-hidden bg-foreground">
        <div className="absolute inset-0 grid grid-cols-2 gap-0.5 sm:grid-cols-4" aria-hidden>
          {cover.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.photos[0]} alt="" className={cn("h-full w-full object-cover", i > 1 && "hidden sm:block")} />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 space-y-3 px-4 pb-8 sm:px-8 sm:pb-10">
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Explore
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{rail.eyebrow}</p>
          <h1 className="max-w-3xl font-editorial text-5xl leading-[0.95] text-white [text-wrap:balance] sm:text-7xl">{rail.title}</h1>
          <p className="max-w-xl text-sm text-white/80">
            {rail.blurb}{" "}
            <span className="text-white/60">
              · {list.length} places in {countries.length} {countries.length === 1 ? "country" : "countries"}
            </span>
          </p>
          <div className="pt-1">
            <SaveCollectionDialog
              title={`Save “${collectionName}”?`}
              defaultName={collectionName}
              description={rail.blurb}
              placeIds={visibleIds}
              landing="collection"
              buttonProps={{ size: "sm", className: "rounded-full" }}
            >
              <FolderPlus className="mr-1.5 h-4 w-4" />
              Save {country ? `these ${visible.length}` : "as collection"}
            </SaveCollectionDialog>
          </div>
        </div>
      </header>

      {/* Negative top: <main> pads its scrollport, and sticky offsets are measured inside that padding. */}
      <div className="sticky -top-3 z-20 flex min-w-0 flex-col gap-2 border-b bg-background/85 px-4 py-3 backdrop-blur-xl sm:-top-6 sm:flex-row sm:items-center sm:px-8">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto hide-scrollbar" role="group" aria-label="Filter by country">
          {countries.length > 1 && (
            <>
              <button type="button" className={chip(country === null)} aria-pressed={country === null} onClick={() => setCountry(null)}>
                All <span className="opacity-60">{list.length}</span>
              </button>
              {countries.map((c) => (
                <button
                  key={c.country}
                  type="button"
                  className={chip(country === c.country)}
                  aria-pressed={country === c.country}
                  onClick={() => setCountry(country === c.country ? null : c.country)}
                >
                  {flagFor(c.country) && <span aria-hidden>{flagFor(c.country)}</span>}
                  {c.country} <span className="opacity-60">{c.count}</span>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 self-start rounded-full border bg-card p-0.5 text-sm sm:self-auto" role="group" aria-label="Order">
          {ORDERS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={order === o.value}
              onClick={() => setOrder(o.value)}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition",
                order === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={order === "shuffle"}
            onClick={() => {
              setOrder("shuffle")
              setSeed((s) => s + 1)
            }}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1 font-medium transition",
              order === "shuffle" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Shuffle className="h-3.5 w-3.5" /> Shuffle
          </button>
        </div>
      </div>

      <div className="columns-2 gap-3 px-4 pt-6 sm:columns-3 sm:gap-4 sm:px-8 sm:pt-8 lg:columns-4 2xl:columns-5">
        {visible.map((p, i) => (
          <PlaceTile
            key={p.id}
            place={p}
            shape="poster"
            caption={rail.captions[p.id]}
            onOpen={() => openPlace(p.id, visibleIds)}
            className={cn("mb-3 block w-full break-inside-avoid sm:mb-4 sm:w-full", ASPECTS[i % ASPECTS.length])}
          />
        ))}
      </div>
    </div>
  )
}
