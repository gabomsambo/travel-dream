import type { AttributionMeta } from '@/db/schema/attachments';
import { PhotoAttribution } from '@/components/attribution/photo-attribution';
import { PoweredByGoogle } from '@/components/attribution/powered-by-google';
import { cn } from '@/lib/utils';

interface CoverPhotoCreditProps {
  attribution: AttributionMeta | null | undefined;
  source?: string | null;
  /** When the credit sits on a photo (tiles, cards). */
  variant?: 'on-photo' | 'inline';
  className?: string;
}

/** Minimal cover attribution for card grids. Omits user uploads. */
export function CoverPhotoCredit({
  attribution,
  source,
  variant = 'on-photo',
  className,
}: CoverPhotoCreditProps) {
  const onPhoto = variant === 'on-photo';
  const hasAttribution = attribution && attribution.kind !== 'upload';
  if (!hasAttribution && source !== 'google_places') return null;

  return (
    <div
      className={cn(
        'pointer-events-auto flex max-w-[min(100%,14rem)] flex-wrap items-center gap-1.5',
        onPhoto &&
          'rounded-md bg-black/45 px-1.5 py-0.5 backdrop-blur-sm [@media(prefers-color-scheme:light)]:bg-black/35',
        className
      )}
    >
      {hasAttribution && (
        <PhotoAttribution
          attribution={attribution}
          className={cn(
            '!mt-0 line-clamp-1 text-[9px] leading-tight sm:text-[10px]',
            onPhoto ? '!text-white/75 [&_a]:text-white/90 [&_a]:hover:text-white' : '!text-muted-foreground/80'
          )}
        />
      )}
      {source === 'google_places' && (
        <PoweredByGoogle onPhoto={onPhoto} className={onPhoto ? 'shrink-0' : undefined} />
      )}
    </div>
  );
}
