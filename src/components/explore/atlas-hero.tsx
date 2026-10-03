'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Shuffle } from 'lucide-react';
import { Button } from '@/components/adapters/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/adapters/dropdown-menu';
import { cn } from '@/lib/utils';
import { editorialFont } from './fonts';
import { SeasonStrip } from './season-strip';

interface Crumb {
  label: string;
  href: string;
}

interface Sibling {
  label: string;
  href: string;
  count: number;
}

/**
 * Full-bleed cover for a country or a city: breadcrumb with a sideways
 * switcher ("Japan ⌄" jumps to another country without going back), a giant
 * serif name, the counts, and the "when to go" strip built from the user's
 * own saves.
 */
export function AtlasHero({
  cover,
  eyebrow,
  title,
  stats,
  crumbs,
  siblings,
  curve,
  currentMonth,
  shuffleHref,
}: {
  cover: string | null;
  eyebrow: string;
  title: string;
  stats: string;
  crumbs: Crumb[];
  siblings: Sibling[];
  curve: number[];
  currentMonth: number;
  shuffleHref?: string;
}) {
  const router = useRouter();
  return (
    <header className="relative min-h-[62vh] overflow-hidden bg-neutral-900 sm:min-h-[68vh]">
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 animate-in object-cover fade-in-0 zoom-in-[1.02] duration-1000"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40" />
      <div className="relative flex min-h-[62vh] flex-col justify-between gap-8 px-4 pb-8 pt-6 sm:min-h-[68vh] sm:px-8 sm:pb-10 sm:pt-8">
        <nav className="flex flex-wrap items-center gap-1 text-xs font-medium text-white/75" aria-label="Breadcrumb">
          {crumbs.map((c) => (
            <span key={c.href} className="inline-flex items-center gap-1">
              <Link href={c.href} className="hover:text-white">
                {c.label}
              </Link>
              <ChevronRight className="h-3 w-3" />
            </span>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-white backdrop-blur hover:bg-white/25">
              {title} <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={cn(editorialFont.variable, 'max-h-80 w-56 overflow-y-auto')}>
              {siblings.map((s) => (
                <DropdownMenuItem key={s.href} onClick={() => router.push(s.href)} className="justify-between">
                  {s.label} <span className="text-xs text-muted-foreground">{s.count}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="grid items-end gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">{eyebrow}</p>
            <h1 className="font-editorial text-6xl leading-[0.9] tracking-tight text-white sm:text-8xl lg:text-9xl">{title}</h1>
            <p className="text-sm text-white/80">{stats}</p>
            {shuffleHref && (
              <div className="pt-4">
                <Button
                  asChild
                  variant="outline"
                  className="gap-2 rounded-full border-white/40 bg-white/10 px-5 text-white backdrop-blur hover:bg-white/20 hover:text-white"
                >
                  <Link href={shuffleHref}>
                    <Shuffle className="h-4 w-4" aria-hidden /> Shuffle
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <div className="max-w-sm rounded-2xl bg-black/30 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">When to go</p>
            <SeasonStrip curve={curve} currentMonth={currentMonth} tone="dark" />
          </div>
        </div>
      </div>
    </header>
  );
}