'use client';

import {
  CERTAINTY_LABEL,
  certaintyWord,
  keptPlace,
  queueContextLine,
  queueSubtitle,
  type QueueCluster,
  type QueuePlace,
} from '@/lib/duplicate-certainty';
import { cn } from '@/lib/utils';
import { CERTAINTY_WORD_CLASS as WORD_CLASS } from './certainty-word-class';

function stackPlaces(cluster: QueueCluster): QueuePlace[] {
  const withPhoto = cluster.places.filter((place) => place.photoUrl);
  const rest = cluster.places.filter((place) => !place.photoUrl);
  return [...withPhoto, ...rest].slice(0, 3);
}

export function DuplicateQueueRow({
  cluster,
  index,
  selected,
  onOpen,
}: {
  cluster: QueueCluster;
  index: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const word = certaintyWord(cluster);
  const kept = keptPlace(cluster);
  const context = queueContextLine(cluster);
  const stack = stackPlaces(cluster);

  return (
    <button
      type="button"
      data-cluster-index={index}
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen}
      className={cn(
        'flex w-full max-w-full min-w-0 items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40',
        selected && 'ring-2 ring-primary',
      )}
    >
      <span className="flex shrink-0 pt-0.5" aria-hidden="true">
        {stack.map((place, stackIndex) => (
          <span
            key={place.id}
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-medium text-muted-foreground',
              stackIndex > 0 && '-ml-4',
            )}
          >
            {place.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={place.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (place.name.trim().charAt(0) || '?').toUpperCase()
            )}
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{kept.name}</span>
        <span className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">{queueSubtitle(cluster)}</span>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', WORD_CLASS[word])}>
            {CERTAINTY_LABEL[word]}
          </span>
        </span>
        {context && (
          <span className="mt-1 block break-words text-sm text-muted-foreground">{context}</span>
        )}
      </span>
    </button>
  );
}
