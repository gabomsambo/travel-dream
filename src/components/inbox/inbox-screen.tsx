import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  CircleOff,
  Library,
  Repeat2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { InboxActions, ThumbStrip } from '@/components/inbox/inbox-actions'
import { CancelRemaining, InboxDropLink, InboxLiveRefresh, ReviewEnterKey } from '@/components/inbox/inbox-behaviors'
import { InboxUploadDetail } from '@/components/inbox/inbox-upload-detail'
import { cn } from '@/lib/utils'
import type {
  InboxHero,
  InboxLink,
  InboxOutcomeRow,
  InboxRowTone,
  InboxScreenModel,
  InboxUploadCard,
} from '@/lib/inbox-page-model'

const TONE_ICON: Record<InboxRowTone, LucideIcon> = {
  new: Sparkles,
  ok: Library,
  info: Repeat2,
  quiet: CircleOff,
  check: AlertTriangle,
}

const TONE_CLASS: Record<InboxRowTone, string> = {
  new: 'bg-primary/10 text-primary',
  ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  info: 'bg-primary/10 text-primary',
  quiet: 'bg-muted text-muted-foreground',
  check: 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
}

function pluralScreenshots(count: number): string {
  return `${count} screenshot${count === 1 ? '' : 's'}`
}

function Dock({ dock, sub }: { dock: InboxLink | null; sub?: InboxLink }) {
  if (!dock && !sub) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      {sub && (
        <Link href={sub.href} className="mb-2 block text-center text-sm font-medium text-primary">
          {sub.label}
        </Link>
      )}
      {dock && (
        <Link
          href={dock.href}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-4 text-base font-semibold text-primary-foreground"
        >
          {dock.label}
        </Link>
      )}
    </div>
  )
}

function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </header>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-3 mt-8 text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  )
}

function OutcomeList({ rows }: { rows: InboxOutcomeRow[] }) {
  return (
    <ul className="border-t border-border">
      {rows.map((row) => {
        const Icon = TONE_ICON[row.tone]
        return (
          <li
            key={row.id}
            className={cn(
              'grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3 border-t border-dashed border-border px-3.5 py-3 first:border-t-0 md:grid-cols-[28px_minmax(0,1fr)_auto] md:px-5',
              row.tone === 'check' && 'border-solid border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30'
            )}
          >
            <span className={cn('grid h-7 w-7 place-items-center rounded-lg', TONE_CLASS[row.tone])}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="font-semibold">
                <span className="tabular-nums">{row.count}</span> {row.label}
              </div>
              {row.detail && (
                <p className="text-sm text-muted-foreground md:truncate">
                  {row.detail}
                  {row.note && (
                    <span className="ml-1.5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      {row.note}
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="col-start-2 md:col-start-auto">
              <InboxActions actions={row.actions} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function UploadCardView({ card }: { card: InboxUploadCard }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3.5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-4 md:px-5">
        <ThumbStrip thumbs={card.thumbs} variant="card" />
        <div className="min-w-0">
          <h3 className="font-semibold">{card.heading}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{card.meta}</p>
        </div>
        {card.pill && (
          <span className={cn('col-span-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold md:col-span-1', TONE_CLASS[card.pill.tone])}>
            {card.pill.tone === 'check' && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
            {card.pill.label}
          </span>
        )}
      </div>
      {card.rows.length > 0 && <OutcomeList rows={card.rows} />}
      <div className="flex items-center border-t border-border px-3.5 py-2.5 md:px-5">
        <Link href={card.showAllHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          Show all {pluralScreenshots(card.screenshotCount)}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  )
}

function HeroView({ hero }: { hero: InboxHero }) {
  if (hero.kind === 'first') {
    return (
      <section className="rounded-[20px] border border-dashed border-border bg-card px-6 py-10 text-center md:px-8 md:py-14">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Start here</p>
        <h2 className="mt-2 font-editorial text-4xl leading-tight tracking-tight md:text-5xl">Drop your travel screenshots</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          TikToks, reels, blog lists. We find the places in them and bring them back here for you to check.
        </p>
        <InboxDropLink />
        <div className="mx-auto mt-7 grid max-w-3xl gap-3 text-left md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">1</p>
            <p className="mt-1 font-semibold">Upload</p>
            <p className="text-sm text-muted-foreground">Drop as many as you like and walk away.</p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">2</p>
            <p className="mt-1 font-semibold">We read them</p>
            <p className="text-sm text-muted-foreground">Each screenshot reports back here: new places, ones you already have, and any we couldn&apos;t read.</p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">3</p>
            <p className="mt-1 font-semibold">You review</p>
            <p className="text-sm text-muted-foreground">One place at a time, with your screenshot beside it. Then it&apos;s in your Library.</p>
          </div>
        </div>
      </section>
    )
  }

  if (hero.kind === 'caught-up') {
    return (
      <section className="rounded-[20px] border border-dashed border-border bg-card px-6 py-12 text-center md:px-8">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">All caught up</p>
        <h2 className="mt-2 font-editorial text-4xl leading-tight tracking-tight">{hero.title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{hero.line}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hero.library && (
            <Link href={hero.library.href} className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
              {hero.library.label}
            </Link>
          )}
          <Link href={hero.upload.href} className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium">
            {hero.upload.label}
          </Link>
        </div>
      </section>
    )
  }

  if (hero.kind === 'attention') {
    return (
      <section className="rounded-[20px] border border-border bg-card px-5 py-6 md:px-7">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Still here</p>
        <h2 className="mt-1 font-editorial text-3xl leading-tight md:text-4xl">{hero.title}</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{hero.line}</p>
      </section>
    )
  }

  const progress = hero.kind === 'reading' ? (hero.total > 0 ? Math.round((hero.read / hero.total) * 100) : 0) : 0
  const actions = hero.kind === 'reading'
    ? (hero.cta ? { cta: hero.cta, sub: undefined } : null)
    : { cta: hero.cta, sub: hero.sub }

  return (
    <section className="grid grid-cols-1 items-center gap-4 rounded-[20px] bg-[linear-gradient(120deg,#2b2bb5,#5b3fd8)] px-5 py-5 text-white dark:bg-[linear-gradient(120deg,#22238a,#3f2aa6)] md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-6 md:px-7 md:py-6">
      <ThumbStrip thumbs={hero.images} variant="hero" />
      <div className="min-w-0">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-white/75">
          {hero.kind === 'reading' ? 'Reading your screenshots' : 'Up next'}
        </p>
        <h2 className="mt-1 font-editorial text-4xl leading-none md:text-5xl">{hero.title}</h2>
        {hero.kind === 'reading' && (
          <div
            className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-white/25"
            role="progressbar"
            aria-valuenow={hero.read}
            aria-valuemin={0}
            aria-valuemax={hero.total}
            aria-label={hero.title}
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="mt-2 text-sm text-white/85">{hero.line}</p>
        {hero.kind === 'reading' && <CancelRemaining sessionId={hero.sessionId} />}
      </div>
      {actions && (
        <div className="hidden flex-col items-end gap-2 md:flex">
          <Link
            href={actions.cta.href}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-base font-semibold text-neutral-900"
          >
            {actions.cta.label}
            <kbd className="rounded border border-neutral-900/30 px-1.5 font-mono text-[11px] text-neutral-900" aria-hidden>
              ↵
            </kbd>
          </Link>
          {actions.sub && (
            <Link href={actions.sub.href} className="text-sm text-white/85 underline underline-offset-4">
              {actions.sub.label}
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

function HomeView({ model }: { model: Extract<InboxScreenModel, { view: 'home' }> }) {
  return (
    <>
      <PageTitle title="Inbox" description={model.description} />
      <HeroView hero={model.hero} />
      {model.reading && (
        <>
          <SectionLabel>{model.reading.heading}</SectionLabel>
          <article className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-3 gap-3 p-3.5 md:grid-cols-6 md:p-5">
              {model.reading.tiles.map((tile) => (
                <div key={tile.id} className="relative overflow-hidden rounded-xl border border-border">
                  {tile.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tile.imageUrl}
                      alt={tile.alt}
                      className={cn('aspect-[9/14] w-full object-cover object-top', tile.waiting && 'opacity-50 grayscale')}
                    />
                  ) : (
                    <div className={cn('grid aspect-[9/14] place-items-center bg-muted text-xs text-muted-foreground', tile.waiting && 'opacity-60')}>
                      {tile.alt}
                    </div>
                  )}
                  <span className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 rounded-lg bg-white/95 px-1.5 py-1 text-[11px] font-semibold text-neutral-900">
                    {tile.spinning && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" aria-hidden />
                    )}
                    {tile.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-2.5 text-sm text-muted-foreground md:px-5">
              <span>{model.reading.footer}</span>
              <Link href={model.reading.showAllHref} className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
                Show all
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </article>
        </>
      )}
      {model.uploadsHeading && model.uploads.length > 0 && (
        <>
          <SectionLabel>{model.uploadsHeading}</SectionLabel>
          <div className="space-y-3.5">
            {model.uploads.map((card) => (
              <UploadCardView key={card.sessionId} card={card} />
            ))}
          </div>
        </>
      )}
      {model.addedAnotherWay && (
        <article className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Added another way</p>
            <p className="mt-0.5 font-semibold">
              {model.addedAnotherWay.count} {model.addedAnotherWay.count === 1 ? 'place' : 'places'}
            </p>
            <p className="text-sm text-muted-foreground">{model.addedAnotherWay.names}</p>
          </div>
          <Link href={model.addedAnotherWay.href} className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium">
            Review
          </Link>
        </article>
      )}
      {model.earlierHeading && model.earlier.length > 0 && (
        <>
          <SectionLabel>{model.earlierHeading}</SectionLabel>
          <article className="overflow-hidden rounded-2xl border border-border bg-card">
            {model.earlier.map((line) => (
              <div
                key={line.sessionId}
                className="grid grid-cols-1 items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0 md:grid-cols-[auto_minmax(0,1fr)_auto] md:px-5"
              >
                <ThumbStrip thumbs={line.thumbs} variant="mini" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{line.when} · {pluralScreenshots(line.screenshotCount)}</span>
                  {' · '}
                  {line.summary}
                </p>
                <Link href={line.href} className="text-sm font-medium text-primary">
                  View
                </Link>
              </div>
            ))}
          </article>
        </>
      )}
    </>
  )
}

function DetailView({ model }: { model: Extract<InboxScreenModel, { view: 'detail' }> }) {
  return (
    <>
      <Link href="/inbox" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Inbox
      </Link>
      <PageTitle title={model.title} description={model.subtitle} />
      <InboxUploadDetail chips={model.chips} rows={model.rows} />
    </>
  )
}

export function InboxScreen({ model }: { model: InboxScreenModel }) {
  const dock = model.dock
  const sub = model.view === 'home' && model.hero.kind === 'review' ? model.hero.sub : undefined
  return (
    <div className="mx-auto max-w-[1080px] pb-24 md:pb-8">
      <InboxLiveRefresh active={model.live} />
      <ReviewEnterKey href={model.enterHref} />
      {model.view === 'detail' ? <DetailView model={model} /> : <HomeView model={model} />}
      <Dock dock={dock} sub={sub} />
    </div>
  )
}
