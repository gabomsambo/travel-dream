'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/adapters/button';
import { editorialFont } from './fonts';
import { SaveCollectionDialog } from './save-collection-dialog';
import type { TripNudge } from '@/lib/explore/types';
import { useExplore } from './explore-provider';
import { slugify } from '@/lib/explore/geo';

const DISMISS_KEY = 'td:explore:dismissed-trips:v1';

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The bridge from daydreaming to planning on country and city pages: "you
 * have N places in X — start a trip?". Fanned photos of the user's own
 * saves sit beside the copy, like a stack of polaroids.
 *
 * On city pages the card is always shown (every city with two or more
 * unvisited saves deserves a planning moment); on country pages it can be
 * dismissed, because the home page and the city page already keep the idea
 * alive.
 */
export function TripNudgeCard({
  nudge,
  className,
  dismissible = true,
}: {
  nudge: TripNudge;
  className?: string;
  dismissible?: boolean;
}) {
  const { collections, addToTrip, busy } = useExplore();
  const key = `${nudge.country}/${nudge.city}`;
  const [checked, setChecked] = React.useState<{ key: string; hidden: boolean } | null>(null);
  React.useEffect(() => setChecked({ key, hidden: dismissible && readDismissed().includes(key) }), [dismissible, key]);
  if (dismissible && (checked?.key !== key || checked.hidden)) return null;

  const existing = nudge.existingCollection;
  const already = existing ? (collections.find((c) => c.id === existing.id)?.placeIds ?? []) : [];
  const missing = nudge.placeIds.filter((id) => !already.includes(id));
  const cityHref = `/explore/atlas/${slugify(nudge.country)}/${slugify(nudge.city)}`;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...readDismissed(), key]));
    } catch {
      /* private mode: dismissal just won't persist */
    }
    setChecked({ key, hidden: true });
  };

  return (
    <section className={cn(editorialFont.variable, 'relative mx-4 overflow-hidden rounded-3xl border bg-card sm:mx-8', className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" aria-hidden />
      <div className="relative grid items-center gap-6 p-6 sm:grid-cols-[minmax(0,260px)_1fr] sm:gap-10 sm:p-10">
        {/* A fanned stack of the user's own photos from that city. */}
        <div className="relative mx-auto h-44 w-56 sm:h-52 sm:w-64" aria-hidden>
          {nudge.photos.slice(0, 3).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              className={cn(
                'absolute h-40 w-32 rounded-2xl border-4 border-card object-cover shadow-xl sm:h-48 sm:w-36',
                i === 0 && 'left-1/2 top-0 z-30 -ml-16 sm:-ml-[72px]',
                i === 1 && 'left-0 top-3 z-20 -rotate-[9deg]',
                i === 2 && 'right-0 top-3 z-10 rotate-[9deg]',
              )}
            />
          ))}
        </div>
        <div className="space-y-4 text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Trip idea</p>
          {existing ? (
            <h2 className="font-editorial text-3xl leading-tight sm:text-4xl">
              {existing.name} has {already.filter((id) => nudge.placeIds.includes(id)).length} of your{' '}
              {nudge.placeIds.length} {nudge.city} places.
            </h2>
          ) : (
            <h2 className="font-editorial text-3xl leading-tight sm:text-4xl">
              You have {nudge.placeIds.length} places in {nudge.city}.{' '}
              <span className="italic text-muted-foreground">That&apos;s a trip.</span>
            </h2>
          )}
          <p className="text-sm text-muted-foreground">
            {existing
              ? missing.length > 0
                ? `Add the other ${missing.length} and keep sorting them into days.`
                : "Everything's in there — pick up the day planning where you left it."
              : "We'll put them in a new collection and open the day planner, so you can sort them into days."}
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
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
                buttonProps={{ className: 'rounded-full px-5' }}
              >
                Start a {nudge.city} trip <ArrowRight className="ml-1.5 h-4 w-4" />
              </SaveCollectionDialog>
            )}
            <Button asChild variant="ghost" className="rounded-full">
              <Link href={cityHref}>See them first</Link>
            </Button>
          </div>
        </div>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

