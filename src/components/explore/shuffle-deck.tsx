"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion"
import { ArrowUp, FolderPlus, Heart, Loader2, RotateCcw, Shuffle, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { isDream, setDream } from "@/lib/explore/dreams"
import { flagFor } from "@/lib/explore/geo"
import { savedAgoLabel } from "@/lib/explore/rails"
import {
  applyVerdict,
  dreamIdsToAdd,
  dreamsFromHistory,
  finishEarly,
  isDeckComplete,
  undoVerdict,
  type ShuffleSession,
  type ShuffleVerdict,
} from "@/lib/explore/shuffle-session"
import type { ExplorePlace } from "@/lib/explore/types"
import { Button } from "@/components/adapters/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/adapters/select"
import { notify } from "@/lib/notify"
import { useExplore } from "./explore-provider"
import { FallbackArt } from "./fallback-art"
import { kindLabel } from "./kind-icon"
import { SaveCollectionDialog } from "./save-collection-dialog"

const COACH_KEY = "td:explore:shuffle-coach:v1"
const SWIPE_PX = 110

const emptySession = (): ShuffleSession => ({ index: 0, history: [], finishedEarly: false })

const TEXT_ENTRY = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=combobox], [role=listbox]"
const ACTIVATABLE = "button, a[href], [role=button], [role=link], [role=option], [role=menuitem]"

function deckShortcutsBlocked(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true
  if (document.querySelector("[role=dialog], [role=listbox]")) return true
  const target = e.target instanceof Element ? e.target : null
  if (!target) return false
  if (target.closest(TEXT_ENTRY)) return true
  return (e.key === "Enter" || e.key === " ") && !!target.closest(ACTIVATABLE)
}

/**
 * Daydream mode: one full-screen card at a time. Right (or ♥, or →) keeps the
 * place in your dreams; left (or ✕, or ←) moves on; ↑ opens the full story.
 * "Dreams" reuse the Library's existing favorites store, so a heart here is a
 * heart there too.
 */
export function ShuffleDeck({ title, backHref, deck }: { title: string; backHref: string; deck: string[] }) {
  const router = useRouter()
  const { places, openPlace, busy } = useExplore()
  const [activeDeck, setActiveDeck] = React.useState(deck)
  const cards = React.useMemo(
    () => activeDeck.map((id) => places.get(id)).filter((p): p is ExplorePlace => !!p),
    [activeDeck, places]
  )

  const [session, setSession] = React.useState<ShuffleSession>(emptySession)
  const [coach, setCoach] = React.useState(false)
  const [exitDir, setExitDir] = React.useState<1 | -1>(1)

  React.useEffect(() => {
    try {
      if (!localStorage.getItem(COACH_KEY)) setCoach(true)
    } catch {
      /* storage blocked: skip the coach */
    }
  }, [])
  const closeCoach = () => {
    setCoach(false)
    try {
      localStorage.setItem(COACH_KEY, "1")
    } catch {
      /* ignore */
    }
  }

  const scopeKey = `${backHref}|${title}`
  const scopeRef = React.useRef(scopeKey)
  const reshuffleRequested = React.useRef(false)
  React.useEffect(() => {
    if (!reshuffleRequested.current && scopeRef.current === scopeKey) return
    reshuffleRequested.current = false
    scopeRef.current = scopeKey
    setActiveDeck(deck)
    setSession(emptySession())
  }, [deck, scopeKey])

  const shuffleAgain = React.useCallback(() => {
    reshuffleRequested.current = true
    router.refresh()
  }, [router])

  const current = cards[session.index]
  const done = isDeckComplete(session, cards.length)
  const dreams = dreamsFromHistory(session.history)
  const backdrop = (current ?? places.get(dreams[dreams.length - 1] ?? ""))?.photos[0]?.uri

  const decide = React.useCallback(
    (verdict: ShuffleVerdict) => {
      if (!current) return
      if (verdict === "dream") {
        const wasAlready = isDream(current.id)
        setDream(current.id, true)
        setSession((s) => applyVerdict(s, current.id, verdict, wasAlready))
      } else {
        setSession((s) => applyVerdict(s, current.id, verdict))
      }
      setExitDir(verdict === "dream" ? 1 : -1)
      setCoach(false)
    },
    [current]
  )

  const undo = React.useCallback(() => {
    setSession((s) => {
      const next = undoVerdict(s)
      if (!next) return s
      const last = s.history[s.history.length - 1]
      if (last?.verdict === "dream" && !last.dreamPreExisting) setDream(last.id, false)
      return next
    })
  }, [])

  const onDone = React.useCallback(() => {
    setSession((s) => finishEarly(s))
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (deckShortcutsBlocked(e)) return
      if (!done && (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Enter")) {
        if (e.key === "ArrowRight") decide("dream")
        else if (e.key === "ArrowLeft") decide("next")
        else if (current) openPlace(current.id)
      } else if (e.key === "Backspace" || e.key.toLowerCase() === "z") {
        undo()
      } else if (e.key === "Escape") {
        router.push(backHref)
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [decide, undo, current, openPlace, router, backHref, done])

  React.useEffect(() => {
    for (const p of cards.slice(session.index + 1, session.index + 3)) {
      const uri = p.photos[0]?.uri
      if (uri) new window.Image().src = uri
    }
  }, [session.index, cards])

  const defaultCollectionName = `Daydreams · ${new Date().toLocaleDateString("en", { month: "short", year: "numeric" })}`

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-neutral-950 text-white">
      {backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={backdrop}
          src={backdrop}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl animate-in fade-in-0 duration-700"
        />
      )}
      <div className="absolute inset-0 bg-black/30" aria-hidden />

      <header className="relative z-10 flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
        <Link
          href={backHref}
          aria-label="Close shuffle"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </Link>
        <div className="mx-auto flex min-w-0 items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-medium backdrop-blur sm:px-4">
          <Shuffle className="h-4 w-4 shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        {!done && (
          <button
            type="button"
            onClick={onDone}
            aria-label="Finish shuffle early"
            className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-xs font-semibold tabular-nums backdrop-blur transition hover:bg-white/25 sm:text-sm"
          >
            Done{dreams.length > 0 ? ` · ${dreams.length}` : ""}
          </button>
        )}
        {done && <span className="w-10 shrink-0" aria-hidden />}
        {!done && (
          <span className="hidden w-10 shrink-0 text-right text-xs tabular-nums text-white/70 sm:block">
            {Math.min(session.index + 1, cards.length)}/{cards.length}
          </span>
        )}
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-3 pb-3 sm:px-6">
        {done ? (
          <EndOfDeck
            dreams={dreams.map((id) => places.get(id)).filter((p): p is ExplorePlace => !!p)}
            seen={session.history.length}
            backHref={backHref}
            busy={busy}
            defaultCollectionName={defaultCollectionName}
            dreamIds={dreams}
            onAgain={shuffleAgain}
            onUndo={undo}
          />
        ) : (
          <div className="relative h-full max-h-[calc(100dvh-170px)] w-full max-w-[min(100%,calc((100dvh-170px)*0.66))]">
            {cards[session.index + 1] && (
              <div className="absolute inset-0 translate-y-3 scale-[0.95] overflow-hidden rounded-[28px] opacity-60">
                <CardFace place={cards[session.index + 1]} />
              </div>
            )}
            {current && (
              <AnimatePresence initial={false} custom={exitDir}>
                <SwipeCard key={current.id} place={current} onDecide={decide} onOpen={() => openPlace(current.id)} />
              </AnimatePresence>
            )}
            {coach && <Coach onClose={closeCoach} />}
          </div>
        )}
      </main>

      {!done && (
        <footer className="relative z-10 flex items-center justify-center gap-4 pb-6 pt-1 sm:gap-6">
          <RoundButton label="Undo" onClick={undo} disabled={session.history.length === 0} small>
            <RotateCcw className="h-4 w-4" />
          </RoundButton>
          <RoundButton label="Next place" onClick={() => decide("next")}>
            <X className="h-6 w-6" />
          </RoundButton>
          <RoundButton label="More about this place" onClick={() => current && openPlace(current.id)} small>
            <ArrowUp className="h-4 w-4" />
          </RoundButton>
          <RoundButton label="Keep dreaming" onClick={() => decide("dream")} accent>
            <Heart className="h-6 w-6" />
          </RoundButton>
          <span className="absolute bottom-2 hidden text-[11px] text-white/50 sm:block">
            ← next · → keep dreaming · ↑ details · Z undo · Esc close
          </span>
        </footer>
      )}
    </div>
  )
}

const cardVariants = {
  enter: { scale: 0.95, opacity: 0, y: 12 },
  center: { scale: 1, opacity: 1, y: 0 },
  exit: (dir: 1 | -1) => ({ x: dir * 640, rotate: dir * 18, opacity: 0, transition: { duration: 0.3 } }),
}

function SwipeCard({
  place,
  onDecide,
  onOpen,
}: {
  place: ExplorePlace
  onDecide: (v: ShuffleVerdict) => void
  onOpen: () => void
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 300], [-14, 14])
  const dreamOpacity = useTransform(x, [20, SWIPE_PX], [0, 1])
  const nextOpacity = useTransform(x, [-SWIPE_PX, -20], [1, 0])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const fling = Math.abs(info.velocity.x) > 600
    if (info.offset.x > SWIPE_PX || (fling && info.velocity.x > 0)) {
      onDecide("dream")
    } else if (info.offset.x < -SWIPE_PX || (fling && info.velocity.x < 0)) {
      onDecide("next")
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 })
    }
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-pan-y overflow-hidden rounded-[28px] shadow-2xl ring-1 ring-white/10 active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragElastic={0.9}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={onDragEnd}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <CardFace place={place} interactive onOpen={onOpen} />
      <motion.span
        style={{ opacity: dreamOpacity }}
        className="pointer-events-none absolute left-6 top-16 -rotate-12 rounded-xl border-4 border-emerald-400 px-3 py-1 text-3xl font-black uppercase tracking-wider text-emerald-400"
      >
        Dream
      </motion.span>
      <motion.span
        style={{ opacity: nextOpacity }}
        className="pointer-events-none absolute right-6 top-16 rotate-12 rounded-xl border-4 border-white px-3 py-1 text-3xl font-black uppercase tracking-wider text-white"
      >
        Next
      </motion.span>
    </motion.div>
  )
}

function CardFace({ place, interactive, onOpen }: { place: ExplorePlace; interactive?: boolean; onOpen?: () => void }) {
  const [photo, setPhoto] = React.useState(0)
  const photos = place.photos
  const src = photos[photo]?.uri
  return (
    <div className="absolute inset-0 bg-neutral-800">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={place.name} draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />
      ) : (
        <FallbackArt name={place.name} kind={place.kind} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/30" />

      {photos.length > 1 && (
        <div className="absolute inset-x-4 top-3 flex gap-1">
          {photos.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i === photo ? "bg-white" : "bg-white/35")} />
          ))}
        </div>
      )}
      {interactive && photos.length > 1 && (
        <>
          <button aria-label="Previous photo" className="absolute left-0 top-0 h-2/3 w-1/3" onClick={() => setPhoto((p) => Math.max(0, p - 1))} />
          <button aria-label="Next photo" className="absolute right-0 top-0 h-2/3 w-1/3" onClick={() => setPhoto((p) => Math.min(photos.length - 1, p + 1))} />
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 space-y-2 p-6 sm:p-7">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
          {flagFor(place.country) && <span className="text-base">{flagFor(place.country)}</span>}
          {[place.city, place.country].filter(Boolean).join(", ")}
        </p>
        <h2 className="font-editorial text-5xl leading-[0.95] sm:text-6xl">{place.name}</h2>
        <p className="text-xs text-white/70">
          {kindLabel(place.kind)} · {savedAgoLabel(place.createdAt, new Date())}
          {place.recommendedBy ? ` · via ${place.recommendedBy}` : ""}
        </p>
        {(place.notes || place.description) && (
          <p className="line-clamp-2 font-editorial text-lg italic leading-snug text-white/90">&ldquo;{place.notes || place.description}&rdquo;</p>
        )}
        {place.vibes.length > 0 && (
          <p className="text-xs text-white/60">{place.vibes.slice(0, 4).map((v) => v.replace(/-/g, " ")).join("  ·  ")}</p>
        )}
        {interactive && onOpen && (
          <button type="button" onClick={onOpen} className="pt-1 text-xs font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
            Read more ↑
          </button>
        )}
      </div>
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  disabled,
  small,
  accent,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  small?: boolean
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center rounded-full backdrop-blur transition active:scale-90 disabled:opacity-30",
        small ? "h-11 w-11 bg-white/10 hover:bg-white/20" : "h-16 w-16 bg-white/15 hover:bg-white/25",
        accent && "bg-rose-500 text-white hover:bg-rose-500/90"
      )}
    >
      {children}
    </button>
  )
}

function Coach({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-[28px] bg-black/60 p-8 text-center backdrop-blur-sm">
      <div className="flex w-full justify-between text-sm font-semibold uppercase tracking-[0.2em]">
        <span>← Next</span>
        <span className="text-rose-300">Dream →</span>
      </div>
      <p className="font-editorial text-3xl leading-tight">Swipe through everything you&apos;ve saved.</p>
      <p className="text-sm text-white/70">Tap the sides of a photo for more photos. ↑ for the full story.</p>
      <span className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">Got it</span>
    </button>
  )
}

function EndOfDeck({
  dreams,
  seen,
  backHref,
  busy,
  defaultCollectionName,
  dreamIds,
  onAgain,
  onUndo,
}: {
  dreams: ExplorePlace[]
  seen: number
  backHref: string
  busy: boolean
  defaultCollectionName: string
  dreamIds: string[]
  onAgain: () => void
  onUndo: () => void
}) {
  const { collections, addToTrip } = useExplore()
  const [collectionId, setCollectionId] = React.useState<string>("")

  const addExisting = async () => {
    if (!collectionId || dreamIds.length === 0) return
    const collection = collections.find((c) => c.id === collectionId)
    const toAdd = dreamIdsToAdd(dreamIds, collection?.placeIds ?? [])
    if (toAdd.length === 0) {
      notify.info(`Already in ${collection?.name ?? "that collection"}`)
      return
    }
    await addToTrip(collectionId, toAdd)
  }

  return (
    <div className="w-full max-w-lg space-y-6 text-center animate-in fade-in-0 zoom-in-95">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">End of the deck</p>
      <h2 className="font-editorial text-5xl leading-tight">
        {dreams.length > 0 ? (
          <>
            {dreams.length} {dreams.length === 1 ? "dream" : "dreams"} out of {seen}.
          </>
        ) : (
          <>Nothing grabbed you this time.</>
        )}
      </h2>
      {dreams.length > 0 && (
        <div className="flex justify-center -space-x-4">
          {dreams.slice(0, 7).map((p, i) => (
            <div
              key={p.id}
              className={cn("relative h-24 w-[72px] overflow-hidden rounded-xl border-2 border-neutral-950 shadow-lg", i % 2 ? "rotate-6" : "-rotate-6")}
            >
              {p.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photos[0].uri} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <FallbackArt name={p.name} kind={p.kind} />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col items-stretch gap-3 px-2">
        {dreams.length > 0 && (
          <>
            <SaveCollectionDialog
              title="Save your dreams?"
              defaultName={defaultCollectionName}
              placeIds={dreamIds}
              landing="collection"
              buttonProps={{
                className: "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50",
                disabled: busy,
              }}
            >
              <FolderPlus className="h-4 w-4" /> Save {dreams.length} as a new collection
            </SaveCollectionDialog>
            {collections.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl bg-white/10 p-3 text-left backdrop-blur">
                <p className="text-xs font-medium text-white/70">Or add to a collection you already have</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={collectionId} onValueChange={setCollectionId}>
                    <SelectTrigger className="h-11 flex-1 border-white/20 bg-black/30 text-white">
                      <SelectValue placeholder="Choose a collection" />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      {collections.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 shrink-0 rounded-full px-5"
                    disabled={busy || !collectionId}
                    onClick={() => addExisting()}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add places"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onAgain} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-semibold hover:bg-white/25">
            <Shuffle className="h-4 w-4" /> Shuffle again
          </button>
          <button type="button" onClick={onUndo} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm text-white/70 hover:text-white">
            <RotateCcw className="h-4 w-4" /> Back one
          </button>
        </div>
      </div>
      <Link href={backHref} className="inline-block text-sm text-white/60 underline-offset-4 hover:text-white hover:underline">
        Done for now
      </Link>
    </div>
  )
}
