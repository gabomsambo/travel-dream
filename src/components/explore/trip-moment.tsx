"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/adapters/button"
import { flagFor } from "@/lib/explore/geo"
import type { TripNudge } from "@/lib/explore/types"
import { useExplore } from "./explore-provider"
import { SaveCollectionDialog } from "./save-collection-dialog"

const DISMISS_KEY = "td:explore:dismissed-trips:v1"

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]")
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

/**
 * "From saves to suitcase": the moment that interrupts the rails when a city
 * has enough unvisited saves to be a trip. One confirm turns them into a
 * collection in the existing day planner; if a collection already holds most of
 * the city, it offers to add the rest to that one instead.
 */
export function TripMoment({ nudge, className }: { nudge: TripNudge; className?: string }) {
  const { addToTrip, collections, busy } = useExplore()
  const key = `${nudge.countrySlug}/${nudge.citySlug}`
  // localStorage can't be read during render, so the check lands in an effect:
  // render nothing until it has run for this key, or a nudge the user already
  // dismissed flashes for one paint on every Explore load.
  const [checked, setChecked] = React.useState<{ key: string; hidden: boolean } | null>(null)
  React.useEffect(() => setChecked({ key, hidden: readDismissed().includes(key) }), [key])
  if (checked?.key !== key || checked.hidden) return null

  const existing = nudge.existingCollection
  const already = existing ? (collections.find((c) => c.id === existing.id)?.placeIds ?? []) : []
  const missing = nudge.placeIds.filter((id) => !already.includes(id))
  const kinds = nudge.kinds.slice(0, 3).join(", ").toLowerCase()

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...readDismissed(), key]))
    } catch {
      /* private mode: dismissal just won't persist */
    }
    setChecked({ key, hidden: true })
  }

  return (
    <section
      aria-label={`Plan a trip to ${nudge.city}`}
      className={cn("relative mx-4 overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm sm:mx-8", className)}
    >
      <div className="grid min-w-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* The user's own photos from that city, as a collage. */}
        <div className="grid h-56 grid-cols-3 grid-rows-2 gap-1 sm:h-72 md:order-2 md:h-[22rem]" aria-hidden>
          {[0, 1, 2].map((slot) => (
            <div key={slot} className={cn("relative min-h-0 overflow-hidden bg-muted", slot === 0 && "col-span-2 row-span-2")}>
              {nudge.photos[slot] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={nudge.photos[slot]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-4 p-6 sm:p-8 lg:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            From saves to suitcase · {nudge.city}
          </p>
          {existing ? (
            <h2 className="font-editorial text-4xl leading-[1.05] [text-wrap:balance] sm:text-5xl">
              {existing.name} has {already.filter((id) => nudge.placeIds.includes(id)).length} of your{" "}
              {nudge.placeIds.length} {nudge.city} places.
            </h2>
          ) : (
            <h2 className="font-editorial text-4xl leading-[1.05] [text-wrap:balance] sm:text-5xl">
              {nudge.placeIds.length} places in {nudge.city}. <span className="italic text-muted-foreground">That&apos;s a trip.</span>
            </h2>
          )}
          <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
            {flagFor(nudge.country) && <span className="mr-1">{flagFor(nudge.country)}</span>}
            {existing
              ? missing.length > 0
                ? `Add the other ${missing.length} and keep sorting them into days.`
                : "Everything's in there. Pick up the day planning where you left it."
              : `You've saved ${kinds ? `${kinds} and more` : "all sorts"} in ${nudge.city}, none visited yet. Turn them into a collection and lay out the days in Day Planner.`}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {existing ? (
              missing.length > 0 ? (
                <Button disabled={busy} className="rounded-full px-5" onClick={() => addToTrip(existing.id, missing)}>
                  Add {missing.length} to {existing.name} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button asChild className="rounded-full px-5">
                  <Link href={`/collections/${existing.id}/planner`}>
                    Open the planner <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              )
            ) : (
              <SaveCollectionDialog
                title={`Turn ${nudge.city} into a trip?`}
                defaultName={`${nudge.city} trip`}
                description={`Planned from ${nudge.placeIds.length} saved places in ${nudge.city}, ${nudge.country}.`}
                placeIds={nudge.placeIds}
                landing="planner"
                buttonProps={{ className: "rounded-full px-5" }}
              >
                <Sparkles className="mr-1.5 h-4 w-4" /> Plan {nudge.city}
              </SaveCollectionDialog>
            )}
            <Button variant="ghost" className="rounded-full" asChild>
              <Link href={`/explore/atlas/${nudge.countrySlug}/${nudge.citySlug}`}>
                Browse {nudge.city} first
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={`Not now: hide the ${nudge.city} trip idea`}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur transition hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  )
}
