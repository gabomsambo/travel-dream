'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui-v2/sheet';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui-v2/dialog';
import { compareRows } from '@/lib/duplicate-workbench';
import type { QueuePlace } from '@/lib/duplicate-certainty';
import type { Attachment, Source } from '@/types/database';

type Picture = { src: string; label: string };

/**
 * One member in full: every field, its photos and its original screenshots.
 * A picture opens full size; Esc closes the picture first, then the panel.
 */
export function DuplicateMemberSheet({
  place,
  number,
  phone,
  onClose,
}: {
  place: QueuePlace | null;
  number: number;
  phone: boolean;
  onClose: () => void;
}) {
  const [media, setMedia] = useState<{ photos: Picture[]; shots: Picture[] } | null>(null);
  const [viewing, setViewing] = useState<Picture | null>(null);
  const placeId = place?.id;

  useEffect(() => {
    if (!placeId) return;
    let live = true;
    setMedia(null);
    fetch(`/api/places/${placeId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { attachments?: Attachment[]; sources?: Source[] } | null) => {
        if (!live) return;
        setMedia({
          photos: (data?.attachments ?? [])
            .filter((photo) => photo.type === 'photo')
            .map((photo) => ({ src: photo.uri, label: photo.caption || photo.filename || 'Photo' })),
          shots: (data?.sources ?? [])
            .filter((source) => source.type === 'screenshot' && source.uri)
            .map((source) => ({ src: source.uri as string, label: 'Screenshot' })),
        });
      })
      .catch(() => live && setMedia({ photos: [], shots: [] }));
    return () => { live = false; };
  }, [placeId]);

  const status = place?.status === 'library' ? 'Library' : 'Inbox';
  const where = [place?.kind, [place?.city, place?.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ');

  const strip = (pictures: Picture[] | undefined, empty: string) => (
    pictures === undefined ? (
      <p className="text-sm text-muted-foreground">Loading…</p>
    ) : pictures.length === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {pictures.map((picture, index) => (
          <button
            key={`${picture.src}:${index}`}
            type="button"
            onClick={() => setViewing(picture)}
            aria-label={`Open ${picture.label.toLowerCase()} full size`}
            className="h-20 w-28 overflow-hidden rounded-md border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={picture.src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    )
  );

  return (
    <Sheet open={place !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side={phone ? 'bottom' : 'right'}
        className={phone ? 'max-h-[85vh] overflow-y-auto' : 'w-full overflow-y-auto sm:max-w-md'}
      >
        {place && (
          <>
            <SheetHeader className="pb-0">
              <p className="text-xs text-muted-foreground">{number} · {status}</p>
              <SheetTitle className="text-lg">{place.name}</SheetTitle>
              <SheetDescription>{where || 'No kind or place yet'}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              <a
                href={`/place/${place.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Open place <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</h3>
                {strip(media?.photos, 'No photos.')}
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original screenshots</h3>
                {strip(media?.shots, 'No screenshots.')}
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Every field</h3>
                <dl className="divide-y text-sm">
                  {compareRows([place]).map((row) => (
                    <div key={row.label} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 py-1.5">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="whitespace-pre-line break-words">{row.values[0] || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </>
        )}
      </SheetContent>
      <Dialog open={viewing !== null} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-[95vw] p-2 sm:max-w-4xl">
          <DialogTitle className="sr-only">{viewing?.label ?? 'Picture'}</DialogTitle>
          {viewing && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewing.src} alt={viewing.label} className="max-h-[85vh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
