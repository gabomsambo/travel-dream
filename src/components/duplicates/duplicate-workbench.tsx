'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui-v2/button';
import { DuplicateMemberSheet } from './duplicate-member-sheet';
import {
  CERTAINTY_LABEL,
  certaintyWord,
  formatMergedOn,
  type QueueCluster,
  type QueuePlace,
} from '@/lib/duplicate-certainty';
import {
  buildMergePlan,
  cardLines,
  combinedScreenshotCount,
  compareRows,
  compareStartsOpen,
  edgeFor,
  fieldText,
  linkLines,
  notesResultLine,
  orderMembers,
  pairEvidence,
  resolvePairs,
  suggestedOut,
  type Pair,
  type Tone,
} from '@/lib/duplicate-workbench';
import { recommendMergeTarget } from '@/lib/duplicate-target-selector';
import { fieldsFilledByMerge, MERGE_OVERRIDE_FIELD_LABELS, type MergeFieldOverrides, type MergeOverrideField } from '@/lib/place-merge';
import { cn } from '@/lib/utils';

/** What the open group would send: the merge request plus the pairs each answer remembers. */
export interface OpenGroupMergeIntent {
  clusterId: string;
  targetId: string;
  sourceIds: string[];
  fieldOverrides?: MergeFieldOverrides;
  mergePairs?: Pair[];
  dismissPairs?: Pair[];
}

const WORD_CLASS = {
  same: 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100',
  'very-likely': 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100',
  likely: 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-100 dark:ring-emerald-800',
  maybe: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
  possible: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
  'probably-not': 'bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100',
} as const;

const TONE_CLASS: Record<Tone, string> = {
  for: 'text-foreground',
  weak: 'text-muted-foreground',
  against: 'text-red-700 dark:text-red-300',
};

const CHIP_CLASS = {
  for: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
  against: 'bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-100',
  unknown: 'border border-dashed text-muted-foreground',
} as const;

const LIST_FIELDS = ['tags', 'vibes', 'cuisine', 'activities', 'amenities'] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function shortName(name: string): string {
  return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}

export function DuplicateWorkbench({
  cluster,
  position,
  phone,
  isLoading,
  onMerge,
  onDismiss,
  onIntentChange,
  onPrevious,
  onNext,
  onBack,
}: {
  cluster: QueueCluster;
  position: string;
  phone: boolean;
  isLoading: boolean;
  onMerge: (intent: OpenGroupMergeIntent) => void;
  onDismiss: (intent: OpenGroupMergeIntent) => void;
  onIntentChange?: (intent: OpenGroupMergeIntent | null) => void;
  onPrevious: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [keptId, setKeptId] = useState(() => recommendMergeTarget(cluster.places));
  const [outIds, setOutIds] = useState<Set<string>>(() => new Set(suggestedOut(cluster, keptId).keys()));
  const [picks, setPicks] = useState<Partial<Record<MergeOverrideField, string>>>({});
  const [panelId, setPanelId] = useState<string | null>(null);
  const [changingKept, setChangingKept] = useState(false);

  const order = useMemo(() => orderMembers(cluster.places, keptId), [cluster.places, keptId]);
  const number = (id: string) => order.findIndex((place) => place.id === id) + 1;
  const reasons = useMemo(() => suggestedOut(cluster, keptId), [cluster, keptId]);
  const inIds = useMemo(() => new Set(order.filter((place) => !outIds.has(place.id)).map((place) => place.id)), [order, outIds]);
  const plan = useMemo(
    () => buildMergePlan({ places: order, keptId, inIds, picks }),
    [order, keptId, inIds, picks],
  );
  const word = certaintyWord(cluster);
  const kept = order[0];
  const [compareOpen, setCompareOpen] = useState(() => compareStartsOpen(cluster, plan?.conflicts ?? []));

  const intent = useMemo<OpenGroupMergeIntent | null>(() => plan && {
    clusterId: cluster.cluster_id,
    targetId: plan.targetId,
    sourceIds: plan.sourceIds,
    fieldOverrides: plan.fieldOverrides,
    mergePairs: resolvePairs(cluster, inIds, 'merge'),
    dismissPairs: resolvePairs(cluster, inIds, 'dismiss'),
  }, [cluster, inIds, plan]);

  useEffect(() => {
    onIntentChange?.(intent);
    return () => onIntentChange?.(null);
  }, [intent, onIntentChange]);

  const toggle = (id: string) => {
    if (id === keptId) return;
    setOutIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 1-9 toggle that member In / Not this one. Never while a panel or field has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || !/^[1-9]$/.test(event.key)) return;
      const active = document.activeElement;
      if (
        active?.tagName === 'INPUT' ||
        active?.tagName === 'TEXTAREA' ||
        active?.tagName === 'SELECT' ||
        document.querySelector('[role="dialog"]')
      ) return;
      const member = order[Number(event.key) - 1];
      if (!member) return;
      event.preventDefault();
      toggle(member.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const mergeCount = inIds.size;
  const outNames = order.filter((place) => outIds.has(place.id)).map((place) => `#${number(place.id)} ${place.name}`);
  const pairKey = (edge: { a: string; b: string }) => {
    const [x, y] = [number(edge.a), number(edge.b)].sort((p, q) => p - q);
    return x * 100 + y;
  };
  const pairs = [...(cluster.edges ?? [])].sort((p, q) => pairKey(p) - pairKey(q));
  const rows = compareRows(order);
  const differing = rows.filter((row) => row.differs).length;
  const sources = order.filter((place) => place.id !== keptId && inIds.has(place.id));
  const notesLine = kept ? notesResultLine(kept, sources) : null;
  const notDuplicatesFirst = word === 'probably-not';
  const panelPlace = order.find((place) => place.id === panelId) ?? null;

  const resultColumn = plan && (
    <aside aria-label="Result" className="flex min-w-0 flex-col gap-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>Result</SectionTitle>
        <span className="text-xs font-semibold text-muted-foreground">{mergeCount} places → 1</span>
      </div>
      <div>
        <p className="text-base font-semibold">{plan.result.name}</p>
        <p className="text-muted-foreground">
          {[plan.result.kind, [plan.result.city, plan.result.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        </p>
      </div>
      {plan.conflicts.map((conflict) => (
        <fieldset key={conflict.field} className="rounded-lg border border-amber-300 p-3 dark:border-amber-800">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide">
            {conflict.label} · pick one · {conflict.options.length} values
          </legend>
          {conflict.options.map((option) => (
            <label key={option.placeId} className="flex cursor-pointer items-start gap-2 py-1">
              <input
                type="radio"
                name={`pick-${cluster.cluster_id}-${conflict.field}`}
                className="mt-1"
                checked={plan.chosen[conflict.field] === option.placeId}
                onChange={() => setPicks((current) => ({ ...current, [conflict.field]: option.placeId }))}
              />
              <span className="min-w-0">
                <span className="block break-words">{option.value}</span>
                <span className="block text-xs text-muted-foreground">
                  {option.memberIds.map((id) => `#${number(id)}`).join(', ')}
                  {option.memberIds.includes(keptId) ? ' · kept record' : ''}
                </span>
              </span>
            </label>
          ))}
          {conflict.field === 'name' && (
            <p className="mt-1 text-xs text-muted-foreground">The other names are kept as other names, so a later screenshot with them still finds this place.</p>
          )}
        </fieldset>
      ))}
      {plan.conflicts.every((conflict) => conflict.field === 'name') && (
        <p className="rounded-md bg-emerald-50 p-2 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100">
          Nothing else differs. Everything below is combined.
        </p>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {fieldsFilledByMerge(kept, plan.result).map((field) => (
          <div key={field} className="contents">
            <dt className="text-muted-foreground">{MERGE_OVERRIDE_FIELD_LABELS[field]}</dt>
            <dd className="break-words text-right">{fieldText(plan.result, field)} <span className="text-emerald-700 dark:text-emerald-300">(filled)</span></dd>
          </div>
        ))}
        {LIST_FIELDS.map((field) => {
          const all = plan.result[field] ?? [];
          if (all.length === 0) return null;
          const had = new Set((kept[field] ?? []).map((value) => value.toLowerCase()));
          return (
            <div key={field} className="contents">
              <dt className="capitalize text-muted-foreground">{field}</dt>
              <dd className="break-words text-right">
                {all.map((value, index) => (
                  <span key={value}>
                    {index > 0 && ', '}
                    {had.has(value.toLowerCase()) ? value : <span className="text-emerald-700 dark:text-emerald-300">+ {value}</span>}
                  </span>
                ))}
              </dd>
            </div>
          );
        })}
        <dt className="text-muted-foreground">Screenshots</dt>
        <dd className="text-right">{combinedScreenshotCount([kept, ...sources])}</dd>
        <dt className="text-muted-foreground">Photos</dt>
        <dd className="text-right">{sources.reduce((sum, place) => sum + (place.photoCount ?? 0), kept.photoCount ?? 0)}</dd>
        {notesLine && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="break-words text-right">
              {notesLine.filled ? <>{notesLine.text} <span className="text-emerald-700 dark:text-emerald-300">(filled)</span></> : notesLine.text}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Status</dt>
        <dd className="text-right">
          {plan.result.status === 'library' ? 'Library' : 'Inbox'}
          {plan.result.status === 'library' && kept.status !== 'library' ? ' (one was in Library)' : ''}
        </dd>
      </dl>
      <div className="border-t pt-3 text-xs text-muted-foreground">
        <p>
          Keeps the record of <span className="font-medium text-foreground">{kept.name}</span>
          {keptId === recommendMergeTarget(cluster.places) ? ' (most complete)' : ''} ·{' '}
          <button type="button" className="text-primary underline" onClick={() => setChangingKept((open) => !open)}>change</button>
        </p>
        {changingKept && (
          <select
            aria-label="Kept record"
            className="mt-2 w-full rounded-md border bg-background p-1.5 text-sm text-foreground"
            value={keptId}
            onChange={(event) => {
              const next = event.target.value;
              setKeptId(next);
              setPicks({});
              setOutIds((current) => { const copy = new Set(current); copy.delete(next); return copy; });
              setChangingKept(false);
            }}
          >
            {order.map((place) => <option key={place.id} value={place.id}>#{number(place.id)} {place.name}</option>)}
          </select>
        )}
        <p className="mt-1">{Math.max(0, mergeCount - 1)} {mergeCount - 1 === 1 ? 'place' : 'places'} archived, not deleted. You can undo from Merged.</p>
      </div>
    </aside>
  );

  return (
    <section aria-label="Is this one place?" className="flex min-w-0 flex-col rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3 md:p-4">
        {phone && (
          <div className="flex w-full items-center justify-between text-sm">
            <button type="button" className="font-medium text-primary" onClick={onBack}>‹ Duplicates</button>
            <span className="text-muted-foreground">{position}</span>
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Is this one place?</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="min-w-0 break-words">{[kept.name, kept.city].filter(Boolean).join(' · ')}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', WORD_CLASS[word])}>{CERTAINTY_LABEL[word]}</span>
          </p>
        </div>
        {!phone && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onPrevious}>Previous <kbd className="text-xs text-muted-foreground">k</kbd></Button>
            <Button size="sm" variant="outline" onClick={onNext}>Skip <kbd className="text-xs text-muted-foreground">j</kbd></Button>
          </div>
        )}
      </header>

      {(word === 'probably-not' || word === 'possible' || cluster.mergedOn) && (
        <p className={cn(
          'mx-3 mt-3 flex items-start gap-2 rounded-md p-2 text-sm md:mx-4',
          word === 'probably-not' ? 'bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100' : 'bg-muted text-muted-foreground',
        )}>
          {word === 'probably-not' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          {word === 'probably-not'
            ? 'Probably two different places. "Not duplicates" is the suggested answer.'
            : word === 'possible'
              ? 'A weaker match. Shown here because To review only lists matches of 70% and up.'
              : `Matches a place you merged on ${formatMergedOn(cluster.mergedOn as string)}.`}
        </p>
      )}

      <div className="grid min-w-0 gap-4 p-3 md:p-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section>
            <SectionTitle>Who matches whom</SectionTitle>
            <ul className="text-sm">
              {linkLines(cluster, order).map((line) => (
                <li key={line.key} className={cn('py-0.5', TONE_CLASS[line.tone])}>{line.text}</li>
              ))}
            </ul>
          </section>

          <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" aria-label="Places in this group">
            {order.map((place: QueuePlace, index) => {
              const isOut = outIds.has(place.id);
              const isKept = place.id === keptId;
              return (
                <li
                  key={place.id}
                  data-member={index + 1}
                  className={cn(
                    'flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-lg border bg-background md:w-auto md:min-w-[13.5rem] md:flex-1 md:basis-0',
                    isOut && 'border-dashed opacity-70',
                  )}
                >
                  <button type="button" onClick={() => setPanelId(place.id)} className="text-left" aria-label={`See everything about ${place.name}`}>
                    <span className={cn('relative flex h-28 items-center justify-center bg-muted text-3xl font-semibold text-muted-foreground', isOut && 'grayscale')}>
                      {place.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={place.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (place.name.trim().charAt(0) || '?').toUpperCase()}
                      <span className={cn(
                        'absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-semibold',
                        place.status === 'library' ? 'bg-primary text-primary-foreground' : 'border bg-background text-foreground',
                      )}>
                        {place.status === 'library' ? 'Library' : 'Inbox'}
                      </span>
                      {isKept && <span className="absolute right-2 top-2 rounded bg-background px-1.5 py-0.5 text-xs font-semibold text-foreground">Kept record</span>}
                    </span>
                    <span className="block p-3 pb-0">
                      <span className="block font-semibold">{index + 1}. {place.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {[place.kind, [place.city, place.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Only a name'}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {place.screenshotCount ?? 0} {place.screenshotCount === 1 ? 'screenshot' : 'screenshots'} · {place.photoCount ?? 0} {place.photoCount === 1 ? 'photo' : 'photos'}
                      </span>
                      {place.address && <span className="mt-1 block truncate text-sm">{place.address}</span>}
                    </span>
                  </button>
                  <div className="mt-auto flex flex-col gap-2 p-3">
                    <ul className="text-sm">
                      {cardLines(cluster, order, place.id).map((line) => (
                        <li key={line.text} className={TONE_CLASS[line.tone]}>{line.text}</li>
                      ))}
                    </ul>
                    {reasons.get(place.id) && isOut && (
                      <p className="text-sm text-red-700 dark:text-red-300">{reasons.get(place.id)}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                      <button type="button" className="text-primary underline" onClick={() => setPanelId(place.id)}>See everything</button>
                      <a href={`/place/${place.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                        Open place <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div role="group" aria-label={`Is ${place.name} part of this place?`} className="grid grid-cols-2 overflow-hidden rounded-md border text-sm">
                      <button
                        type="button"
                        aria-pressed={!isOut}
                        disabled={isKept}
                        onClick={() => isOut && toggle(place.id)}
                        className={cn('py-1.5 font-medium', !isOut ? 'bg-foreground text-background' : 'hover:bg-muted')}
                      >
                        In {!phone && <kbd className="ml-1 text-xs opacity-70">{index + 1}</kbd>}
                      </button>
                      <button
                        type="button"
                        aria-pressed={isOut}
                        disabled={isKept}
                        onClick={() => !isOut && toggle(place.id)}
                        className={cn('py-1.5', isOut ? 'bg-foreground text-background' : 'hover:bg-muted', isKept && 'text-muted-foreground')}
                      >
                        Not this one
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <section>
            <button
              type="button"
              aria-expanded={compareOpen}
              onClick={() => setCompareOpen((open) => !open)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <span className="flex items-center gap-1">
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !compareOpen && '-rotate-90')} />
                Compare all fields
              </span>
              <span className="font-normal normal-case">{differing} differ</span>
            </button>
            {compareOpen && (
              <div className="mt-2 overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="p-2 font-medium">Field</th>
                      {order.map((place, index) => <th key={place.id} className="p-2 font-medium">{index + 1}. {shortName(place.name)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label} className={cn('border-t', row.differs && 'bg-amber-50 dark:bg-amber-950/40')}>
                        <th scope="row" className="p-2 text-left font-medium">{row.label}{row.differs ? ' · differs' : ''}</th>
                        {row.values.map((value, index) => (
                          <td key={order[index].id} className="break-words p-2 align-top">{value || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <SectionTitle>Why we think so</SectionTitle>
              <span className="text-xs text-muted-foreground">✓ for · ✕ against · ? can&apos;t tell</span>
            </div>
            <ul className="divide-y rounded-lg border">
              {pairs.map((edge) => {
                const a = order.find((place) => place.id === edge.a);
                const b = order.find((place) => place.id === edge.b);
                if (!a || !b) return null;
                const [first, second] = number(a.id) < number(b.id) ? [a, b] : [b, a];
                const evidence = pairEvidence(edgeFor(cluster, a.id, b.id) ?? edge, a, b);
                return (
                  <li key={`${edge.a}:${edge.b}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                    <p className="text-sm font-medium sm:w-48 sm:shrink-0">
                      {number(first.id)}. {shortName(first.name)} ↔ {number(second.id)}. {shortName(second.name)}
                    </p>
                    <span className="flex flex-wrap gap-1.5 text-xs">
                      {evidence.for.map((text) => <span key={`f${text}`} className={cn('rounded-full px-2 py-0.5', CHIP_CLASS.for)}>✓ {text}</span>)}
                      {evidence.against.map((text) => <span key={`a${text}`} className={cn('rounded-full px-2 py-0.5', CHIP_CLASS.against)}>✕ {text}</span>)}
                      {evidence.unknown.map((text) => <span key={`u${text}`} className={cn('rounded-full px-2 py-0.5', CHIP_CLASS.unknown)}>? {text}</span>)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {resultColumn}
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-card/95 p-3 backdrop-blur md:px-4">
        <Button
          variant={notDuplicatesFirst ? 'default' : 'outline'}
          disabled={isLoading || !intent}
          onClick={() => intent && onDismiss(intent)}
          className="flex-1 md:flex-none"
        >
          Not duplicates {!phone && <kbd className="text-xs opacity-70">d</kbd>}
        </Button>
        <p className="order-last w-full text-xs text-muted-foreground md:order-none md:w-auto md:flex-1">
          {outNames.length > 0
            ? `${outNames.join(', ')} ${outNames.length === 1 ? 'stays' : 'stay'} separate. We remember ${outNames.length === 1 ? 'it is' : 'they are'} not the same as the others.`
            : `"Not duplicates" remembers these ${order.length} as different places.`}
        </p>
        <Button
          variant={notDuplicatesFirst ? 'outline' : 'default'}
          disabled={isLoading || !intent || mergeCount < 2}
          onClick={() => intent && onMerge(intent)}
          className="flex-1 md:flex-none"
        >
          Merge {mergeCount} into one place {!phone && <kbd className="text-xs opacity-70">m</kbd>}
        </Button>
      </div>

      <DuplicateMemberSheet place={panelPlace} number={panelPlace ? number(panelPlace.id) : 0} phone={phone} onClose={() => setPanelId(null)} />
    </section>
  );
}
