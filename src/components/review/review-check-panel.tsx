"use client"

import * as React from "react"
import { Check, CircleAlert, Pencil, Search } from "lucide-react"
import { Button } from "@/components/adapters/button"
import { usablePin } from "@/lib/place-coords"
import { reviewChecks, type ReviewCheckId } from "@/lib/review/review-checks"
import type { BranchCandidate, CitySuggestion, PinDetails } from "@/lib/review/lookup-types"
import type { PlaceWithRelations } from "@/types/database"

const CHECK_BOX = "rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50"
const CHECK_PILL = "inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-100"
const OK_PILL = "inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"

interface ReviewCheckPanelProps {
  place: PlaceWithRelations
  onRename: () => void
  onNotAPlace?: () => void
  onUpdated: () => Promise<void> | void
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { message?: string } | null
  return body?.message || fallback
}

function blankText(value: string | null | undefined): boolean {
  return value == null || value.trim() === ""
}

function townLabel(suggestion: CitySuggestion): string | null {
  if (!suggestion.locality) return null
  return suggestion.admin ? `${suggestion.locality}, ${suggestion.admin}` : suggestion.locality
}

function suggestionSentence(suggestion: CitySuggestion): string {
  const where = [suggestion.areaLabel, suggestion.admin].filter(Boolean).join(", ")
  if (where && suggestion.locality) return `The pin is in ${where}. Use the nearest town?`
  if (suggestion.locality) {
    const town = townLabel(suggestion)
    return town ? `The nearest town is ${town}.` : "Use the nearest town?"
  }
  if (where) return `The pin is in ${where}.`
  return "We have a pin, and no city."
}

export function ReviewCheckPanel({
  place,
  onRename,
  onNotAPlace,
  onUpdated,
  visibleChecks,
  onDismiss,
}: ReviewCheckPanelProps & {
  visibleChecks?: ReviewCheckId[]
  onDismiss?: (id: ReviewCheckId) => void
}) {
  const checks = reviewChecks(place)
  const [dismissed, setDismissed] = React.useState<ReviewCheckId[]>([])
  const controlled = visibleChecks !== undefined
  const visible = visibleChecks ?? checks.filter((id) => !dismissed.includes(id))

  React.useEffect(() => {
    if (controlled) return
    setDismissed([])
  }, [controlled, place.id, place.city, place.coords, place.confidence, place.kind, place.name])

  const dismiss = (id: ReviewCheckId) => {
    if (onDismiss) {
      onDismiss(id)
      return
    }
    setDismissed((current) => current.includes(id) ? current : [...current, id])
  }

  const summary = visible.length === 0
    ? "Nothing to check"
    : `${visible.length} ${visible.length === 1 ? "thing" : "things"} to check`

  return (
    <div className="space-y-3 px-4 pb-2 pt-4 sm:px-8" data-review-check-panel="">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {visible.length === 0 ? (
          <span className={OK_PILL}><Check className="h-3.5 w-3.5" aria-hidden />{summary}</span>
        ) : (
          <span className={CHECK_PILL}><CircleAlert className="h-3.5 w-3.5" aria-hidden />{summary}</span>
        )}
        <span>
          {visible.length === 0
            ? "Everything we read matches a real place."
            : "We marked them below. Everything else looks right."}
        </span>
      </p>
      {visible.includes("confidence") && (
        <CheckBox title={`Is “${place.name}” the right name?`}>
          <p>We&apos;re not sure this name is right. Rename it, or mark it not a place.</p>
          <Actions>
            <Button type="button" variant="outline" size="sm" onClick={onRename}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />Rename
            </Button>
            {onNotAPlace && (
              <Button type="button" variant="ghost" size="sm" onClick={onNotAPlace}>Not a place</Button>
            )}
          </Actions>
        </CheckBox>
      )}
      {visible.includes("tip") && (
        <CheckBox title="This looks like a tip, not a place">
          <p>Tips are general advice. Rename it into a place, or mark it not a place.</p>
          <Actions>
            <Button type="button" variant="outline" size="sm" onClick={onRename}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />Rename
            </Button>
            {onNotAPlace && (
              <Button type="button" variant="ghost" size="sm" onClick={onNotAPlace}>Not a place</Button>
            )}
          </Actions>
        </CheckBox>
      )}
      {visible.includes("pin") && <PinCheck place={place} onUpdated={onUpdated} />}
      {visible.includes("city") && (
        <CityCheck
          place={place}
          onDismiss={() => dismiss("city")}
          onUpdated={onUpdated}
        />
      )}
    </div>
  )
}

function CheckBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={CHECK_BOX}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <CircleAlert className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        {title}
      </h2>
      <div className="mt-1 space-y-2 text-sm text-amber-950/80 dark:text-amber-50/80">{children}</div>
    </section>
  )
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 pt-1">{children}</div>
}

function PinCheck({ place, onUpdated }: { place: PlaceWithRelations; onUpdated: () => Promise<void> | void }) {
  const [candidates, setCandidates] = React.useState<BranchCandidate[] | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)
  const [pending, setPending] = React.useState<"search" | "pin" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [other, setOther] = React.useState("")
  const hasCity = !blankText(place.city)

  const search = async (query: string) => {
    if (pending) return
    setPending("search")
    setError(null)
    setUnavailable(false)
    try {
      const params = new URLSearchParams({ q: query })
      const response = await fetch(`/api/review/places/${encodeURIComponent(place.id)}/branches?${params}`)
      const body = await response.json().catch(() => null) as { candidates?: BranchCandidate[]; unavailable?: boolean; message?: string } | null
      if (!response.ok) throw new Error(body?.message || "We couldn't look this up. Try again.")
      setCandidates(body?.candidates ?? [])
      setUnavailable(Boolean(body?.unavailable))
    } catch (searchError) {
      setCandidates([])
      setError(searchError instanceof Error ? searchError.message : "We couldn't look this up. Try again.")
    } finally {
      setPending(null)
    }
  }

  const choose = async (candidate: BranchCandidate) => {
    if (pending) return
    setPending("pin")
    setError(null)
    try {
      const params = new URLSearchParams({ googlePlaceId: candidate.googlePlaceId })
      const response = await fetch(`/api/review/places/${encodeURIComponent(place.id)}/pin?${params}`)
      const body = await response.json().catch(() => null) as { pin?: PinDetails | null; unavailable?: boolean; message?: string } | null
      if (!response.ok) throw new Error(body?.message || "We couldn't pin that one. Try again.")
      if (body?.unavailable || !body?.pin) throw new Error("Place search isn't available right now.")
      if (!body.pin.coords) throw new Error("That match has no pin. Try another.")
      const patch: Record<string, unknown> = {
        coords: body.pin.coords,
        googlePlaceId: body.pin.googlePlaceId,
      }
      if (typeof body.pin.address === "string" && body.pin.address.length > 0) {
        patch.address = body.pin.address
      }
      if (blankText(place.city) && !blankText(body.pin.city)) patch.city = body.pin.city
      if (blankText(place.admin) && !blankText(body.pin.admin)) patch.admin = body.pin.admin
      if (blankText(place.country) && !blankText(body.pin.country)) patch.country = body.pin.country
      const saved = await fetch(`/api/places/${encodeURIComponent(place.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!saved.ok) throw new Error(await readError(saved, "We couldn't save that pin. Try again."))
      await onUpdated()
    } catch (chooseError) {
      setError(chooseError instanceof Error ? chooseError.message : "We couldn't pin that one. Try again.")
    } finally {
      setPending(null)
    }
  }

  return (
    <CheckBox title={hasCity ? "Which one?" : "Where is it?"}>
      <p>
        {hasCity
          ? `${place.name} may have more than one location, so we didn't guess. Look it up and pick the right one.`
          : "We couldn't find a city or a pin. Look it up and pick the right one."}
      </p>
      {candidates === null ? (
        <Actions>
          <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void search([place.name, place.city, place.country].filter(Boolean).join(", "))}>
            <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {pending === "search" ? "Looking up…" : "Look up this place"}
          </Button>
        </Actions>
      ) : (
        <>
          {unavailable && <p>Place search isn&apos;t available right now.</p>}
          {!unavailable && candidates.length === 0 && <p>Nothing matched. Try a more specific name.</p>}
          {candidates.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1" role="list">
              {candidates.map((candidate) => (
                <button
                  key={candidate.googlePlaceId}
                  type="button"
                  role="listitem"
                  disabled={pending !== null}
                  onClick={() => void choose(candidate)}
                  className="flex items-start gap-2 rounded-xl border border-amber-200 bg-background px-3 py-2 text-left text-foreground transition hover:border-primary disabled:opacity-60 dark:border-amber-900"
                >
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold">{candidate.name}</span>
                    {candidate.detail && <span className="block text-xs text-muted-foreground">{candidate.detail}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          <form
            className="flex flex-wrap gap-2 pt-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (other.trim().length < 2 || pending) return
              void search(other.trim())
            }}
          >
            <input
              value={other}
              onChange={(event) => setOther(event.target.value)}
              aria-label="Search for another place"
              placeholder="Search another"
              className="h-9 min-w-0 flex-1 rounded-full border bg-background px-3 text-sm text-foreground"
            />
            <Button type="submit" variant="ghost" size="sm" disabled={pending !== null || other.trim().length < 2}>
              <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden />Search another
            </Button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </CheckBox>
  )
}

function CityCheck({
  place,
  onDismiss,
  onUpdated,
}: {
  place: PlaceWithRelations
  onDismiss: () => void
  onUpdated: () => Promise<void> | void
}) {
  const pin = usablePin(place.coords)
  const lat = pin?.lat
  const lon = pin?.lon
  const pinKey = lat === undefined || lon === undefined ? `${place.id}:none` : `${place.id}:${lat}:${lon}`
  const [suggestion, setSuggestion] = React.useState<CitySuggestion | null>(null)
  const [trackedPinKey, setTrackedPinKey] = React.useState(pinKey)
  if (trackedPinKey !== pinKey) {
    setTrackedPinKey(pinKey)
    setSuggestion(null)
  }
  const [typing, setTyping] = React.useState(false)
  const [city, setCity] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setSuggestion(null)
    if (lat === undefined || lon === undefined) return
    const controller = new AbortController()
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`/api/review/places/${encodeURIComponent(place.id)}/city-suggestion`, { signal: controller.signal })
        const body = await response.json().catch(() => null) as { suggestion?: CitySuggestion | null } | null
        if (cancelled) return
        if (!response.ok) {
          setSuggestion(null)
          return
        }
        setSuggestion(body?.suggestion ?? null)
      } catch (loadError) {
        if (cancelled || (loadError instanceof DOMException && loadError.name === "AbortError")) return
        setSuggestion(null)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [place.id, lat, lon])

  const saveCity = async (next: string, extra?: { admin?: string | null; country?: string | null }) => {
    const trimmed = next.trim()
    if (!trimmed || pending) return
    setPending(true)
    setError(null)
    try {
      const patch: Record<string, unknown> = { city: trimmed }
      if (blankText(place.admin) && !blankText(extra?.admin)) patch.admin = extra?.admin
      if (blankText(place.country) && !blankText(extra?.country)) patch.country = extra?.country
      const response = await fetch(`/api/places/${encodeURIComponent(place.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!response.ok) throw new Error(await readError(response, "We couldn't save that city. Try again."))
      await onUpdated()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We couldn't save that city. Try again.")
    } finally {
      setPending(false)
    }
  }

  const town = suggestion ? townLabel(suggestion) : null

  return (
    <CheckBox title="No city">
      <p>{suggestion ? suggestionSentence(suggestion) : pin ? "We have a pin, and no city." : "There's no city yet. Type one, or look the place up above."}</p>
      {!typing ? (
        <Actions>
          {town && suggestion && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void saveCity(suggestion.locality || "", suggestion)}>
              {pending ? "Saving…" : town}
            </Button>
          )}
          {place.admin && (
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>Leave it as {place.admin}</Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setTyping(true)}>Type a city</Button>
        </Actions>
      ) : (
        <form
          className="flex flex-wrap gap-2 pt-1"
          onSubmit={(event) => {
            event.preventDefault()
            void saveCity(city)
          }}
        >
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            aria-label="City"
            placeholder="City"
            className="h-9 min-w-0 flex-1 rounded-full border bg-background px-3 text-sm text-foreground"
          />
          <Button type="submit" variant="outline" size="sm" disabled={pending || city.trim() === ""}>Save city</Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </CheckBox>
  )
}
