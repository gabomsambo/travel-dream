'use client';

import { useState, useCallback, useOptimistic, useEffect, useMemo, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, MoreHorizontal, RefreshCw } from 'lucide-react';
import { DuplicateExpandedView, type OpenGroupMergeIntent } from './duplicate-expanded-view';
import { DuplicateQueueRow } from './duplicate-queue-row';
import { Button } from '@/components/ui-v2/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-v2/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui-v2/alert-dialog';
import { notify } from '@/lib/notify';
import { recommendMergeTarget } from '@/lib/duplicate-target-selector';
import {
  certainGroups,
  dismissPairsForCluster,
  distinctPlaceCount,
  emptyReviewCopy,
  formatMergedOn,
  sortQueueGroups,
  unionGroupsSharingPlace,
  type DismissedPairView,
  type MergedGroupView,
  type QueueCluster,
} from '@/lib/duplicate-certainty';
import type { MergeFieldOverrides } from '@/lib/place-merge';
import { cn } from '@/lib/utils';

interface DuplicatesPageClientProps {
  initialData: QueueCluster[];
  possible?: QueueCluster[];
  dismissed?: DismissedPairView[];
  merged?: MergedGroupView[];
  fetchedAt: string | null;
  fetchError: string | null;
}

type ClusterAction =
  | { type: 'dismiss'; clusterId: string }
  | { type: 'merge'; clusterId: string };

type QueueTab = 'review' | 'possible' | 'dismissed' | 'merged';

type ConfirmState =
  | { kind: 'merge-certain'; groups: QueueCluster[] }
  | { kind: 'dismiss'; groups: QueueCluster[] }
  | null;

function clusterReducer(state: QueueCluster[], action: ClusterAction): QueueCluster[] {
  switch (action.type) {
    case 'dismiss':
    case 'merge':
      return state.filter((cluster) => cluster.cluster_id !== action.clusterId);
    default:
      return state;
  }
}

function formatChecked(isoString: string | null): string {
  if (!isoString) return 'Not checked yet';
  try {
    return `Checked ${formatDistanceToNow(new Date(isoString), { addSuffix: true })}`;
  } catch {
    return 'Checked time unknown';
  }
}

function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
}

const BULK_MERGE_CLUSTER_LIMIT = 50;
const DISMISS_PAIR_LIMIT = 100;

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function groupHasUnmergedPlace(group: QueueCluster, committedIds: ReadonlySet<string>): boolean {
  return group.places.some((place) => !committedIds.has(place.id));
}

type BulkMergeResponse = {
  message?: string;
  success?: number;
  failed?: number;
  results?: Array<{ clusterId?: string; status?: string; error?: string }>;
};

function everyMergeResultSkipped(result: BulkMergeResponse): boolean {
  const results = result.results;
  return Array.isArray(results) && results.length > 0 && results.every((entry) => entry.status === 'skipped');
}

function pairLabel(pair: DismissedPairView): string {
  const left = pair.city1 ? `${pair.name1} (${pair.city1})` : pair.name1;
  const right = pair.city2 ? `${pair.name2} (${pair.city2})` : pair.name2;
  return `${left} ≠ ${right}`;
}

export function DuplicatesPageClient({
  initialData,
  possible = [],
  dismissed = [],
  merged = [],
  fetchedAt,
  fetchError,
}: DuplicatesPageClientProps) {
  const router = useRouter();
  const [review, setReview] = useOptimistic(initialData, clusterReducer);
  const [possibleGroups, setPossibleGroups] = useOptimistic(possible, clusterReducer);
  const [tab, setTab] = useState<QueueTab>('review');
  const [expandedClusterId, setExpandedClusterId] = useState<string | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [desktop, setDesktop] = useState(false);
  const openIntentRef = useRef<OpenGroupMergeIntent | null>(null);
  const committedMergeIdsRef = useRef<Set<string>>(new Set());
  const [committedMergeIds, setCommittedMergeIds] = useState<ReadonlySet<string>>(() => new Set());

  const reviewSorted = useMemo(() => sortQueueGroups(review), [review]);
  const possibleSorted = useMemo(() => sortQueueGroups(possibleGroups), [possibleGroups]);
  const certain = useMemo(
    () => unionGroupsSharingPlace(certainGroups(
      [...reviewSorted, ...possibleSorted].filter((cluster) => groupHasUnmergedPlace(cluster, committedMergeIds)),
    )),
    [committedMergeIds, reviewSorted, possibleSorted],
  );
  const activeGroups = tab === 'possible' ? possibleSorted : tab === 'review' ? reviewSorted : [];
  const scanError = rescanError ?? fetchError;
  const emptyCopy = emptyReviewCopy({ possibleCount: possibleSorted.length, merged });

  const groupsRef = useRef(activeGroups);
  groupsRef.current = activeGroups;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;
  const expandedRef = useRef(expandedClusterId);
  expandedRef.current = expandedClusterId;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  useEffect(() => {
    const present = new Set<string>();
    for (const cluster of [...initialData, ...possible]) {
      for (const place of cluster.places) present.add(place.id);
    }
    const current = committedMergeIdsRef.current;
    if (current.size === 0) return;
    const next = new Set([...current].filter((id) => present.has(id)));
    if (next.size === current.size) return;
    committedMergeIdsRef.current = next;
    setCommittedMergeIds(next);
  }, [initialData, possible]);

  const rememberCommittedPlaces = useCallback((groups: QueueCluster[]) => {
    const next = new Set(committedMergeIdsRef.current);
    for (const group of groups) {
      for (const place of group.places) next.add(place.id);
    }
    if (next.size === committedMergeIdsRef.current.size) return;
    committedMergeIdsRef.current = next;
    setCommittedMergeIds(next);
  }, []);

  const handleIntentChange = useCallback((intent: OpenGroupMergeIntent | null) => {
    openIntentRef.current = intent;
  }, []);

  const findCluster = useCallback((clusterId: string) => {
    return reviewSorted.find((cluster) => cluster.cluster_id === clusterId)
      ?? possibleSorted.find((cluster) => cluster.cluster_id === clusterId);
  }, [reviewSorted, possibleSorted]);

  const openCluster = findCluster(expandedClusterId ?? '');

  const announceChange = useCallback(() => {
    window.dispatchEvent(new Event('td:duplicates-changed'));
  }, []);

  const clearScanCache = useCallback(async () => {
    await fetch('/api/places/duplicates', { method: 'DELETE' });
    announceChange();
  }, [announceChange]);

  const dropCluster = useCallback((cluster: QueueCluster, type: ClusterAction['type']) => {
    const inPossible = possibleSorted.some((item) => item.cluster_id === cluster.cluster_id);
    startTransition(() => {
      if (inPossible) setPossibleGroups({ type, clusterId: cluster.cluster_id });
      else setReview({ type, clusterId: cluster.cluster_id });
    });
  }, [possibleSorted, setPossibleGroups, setReview]);

  const handleDismiss = useCallback(async (cluster: QueueCluster) => {
    setIsLoading(true);
    dropCluster(cluster, 'dismiss');
    try {
      const response = await fetch('/api/places/dismiss-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: dismissPairsForCluster(cluster) }),
      });
      if (!response.ok) throw new Error('Failed to dismiss cluster');
      setExpandedClusterId(undefined);
      await clearScanCache();
      router.refresh();
    } catch {
      notify.error('Failed to dismiss cluster');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }, [clearScanCache, dropCluster, router]);

  const handleMerge = useCallback(async (cluster: QueueCluster, intent?: OpenGroupMergeIntent) => {
    const targetId = intent?.targetId ?? recommendMergeTarget(cluster.places);
    const target = cluster.places.find((place) => place.id === targetId);
    const requestedSourceIds = intent?.sourceIds ?? cluster.places.filter((place) => place.id !== targetId).map((place) => place.id);
    const sourceIds = requestedSourceIds.filter((id) => !committedMergeIdsRef.current.has(id));
    if (!target || requestedSourceIds.length === 0) {
      notify.error('No target found for merge');
      return;
    }
    if (sourceIds.length === 0) return;

    setIsLoading(true);

    dropCluster(cluster, 'merge');
    try {
      const response = await fetch('/api/places/bulk-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [{
            targetId: target.id,
            sourceIds,
            confidence: cluster.avgConfidence,
            fieldOverrides: intent?.fieldOverrides,
          }],
        }),
      });
      if (!response.ok) throw new Error('Failed to merge cluster');
      const result = await response.json() as BulkMergeResponse;
      if (result.success && result.success > 0) {
        notify.success(`Merged ${sourceIds.length + 1} places`);
        setExpandedClusterId(undefined);
        await clearScanCache();
        router.refresh();
      } else if (everyMergeResultSkipped(result)) {
        setExpandedClusterId(undefined);
        await clearScanCache();
        router.refresh();
      } else {
        throw new Error('Merge failed');
      }
    } catch {
      notify.error('Failed to merge cluster');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }, [clearScanCache, dropCluster, router]);

  const handleMergePair = useCallback(async (
    cluster: QueueCluster,
    targetId: string,
    sourceId: string,
    fieldOverrides?: MergeFieldOverrides,
  ) => {
    if (committedMergeIdsRef.current.has(sourceId)) return;
    setIsLoading(true);
    const target = cluster.places.find((place) => place.id === targetId);
    const source = cluster.places.find((place) => place.id === sourceId);
    if (!target || !source) {
      notify.error('Invalid places for merge');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/places/bulk-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [{
            targetId: target.id,
            sourceIds: [source.id],
            confidence: cluster.avgConfidence,
            fieldOverrides,
          }],
        }),
      });
      const result = await response.json() as BulkMergeResponse;
      if (!response.ok) throw new Error(result.message || 'Failed to merge places');
      if (result.success && result.success > 0) {
        notify.success(`Merged "${source.name}" into "${target.name}"`);
        await clearScanCache();
        router.refresh();
      } else if (everyMergeResultSkipped(result)) {
        await clearScanCache();
        router.refresh();
      } else {
        notify.error(result.results?.[0]?.error || 'Merge failed');
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Failed to merge places');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }, [clearScanCache, router]);

  const handleMergeCertain = useCallback(async (groups: QueueCluster[]) => {
    const unions = unionGroupsSharingPlace(
      groups.filter((group) => groupHasUnmergedPlace(group, committedMergeIdsRef.current)),
    );
    if (unions.length === 0) return;
    setIsLoading(true);
    let success = 0;
    let failed = 0;
    let rejected = false;
    let committed = false;
    let threw = false;
    let allSkipped = true;
    try {
      for (const batch of chunkItems(unions, BULK_MERGE_CLUSTER_LIMIT)) {
        const response = await fetch('/api/places/bulk-merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clusters: batch.map((cluster) => {
              const targetId = recommendMergeTarget(cluster.places);
              return {
                targetId,
                sourceIds: cluster.places.filter((place) => place.id !== targetId).map((place) => place.id),
                confidence: cluster.avgConfidence,
              };
            }),
          }),
        });
        if (!response.ok) {
          rejected = true;
          allSkipped = false;
          continue;
        }
        const result = await response.json() as BulkMergeResponse;
        if (!everyMergeResultSkipped(result)) allSkipped = false;
        const succeeded = new Set(
          (result.results ?? [])
            .filter((entry) => entry.status === 'success' && entry.clusterId)
            .map((entry) => entry.clusterId as string),
        );
        const mergedGroups = batch.filter((cluster) => succeeded.has(recommendMergeTarget(cluster.places)));
        if (mergedGroups.length > 0) {
          rememberCommittedPlaces(mergedGroups);
          committed = true;
        }
        if (typeof result.success === 'number') success += result.success;
        if (typeof result.failed === 'number') failed += result.failed;
      }
    } catch (error) {
      threw = true;
      console.error(error);
    }
    if (success > 0) {
      notify.success(`Merged ${success} certain ${success === 1 ? 'group' : 'groups'}`);
    }
    if (failed > 0) notify.error(`Failed to merge ${failed} groups`);
    if (rejected || threw) notify.error('Failed to merge duplicates');
    if (success > 0 || (threw && committed) || (allSkipped && failed === 0 && !rejected && !threw)) {
      setExpandedClusterId(undefined);
      try {
        await clearScanCache();
      } catch (error) {
        console.error(error);
      }
      router.refresh();
    }
    setIsLoading(false);
  }, [clearScanCache, rememberCommittedPlaces, router]);

  const handleDismissGroups = useCallback(async (groups: QueueCluster[]) => {
    if (groups.length === 0) return;
    setIsLoading(true);
    const allPairs = groups.flatMap((cluster) => dismissPairsForCluster(cluster));
    let rejected = false;
    let wrote = false;
    let threw = false;
    try {
      for (const batch of chunkItems(allPairs, DISMISS_PAIR_LIMIT)) {
        if (batch.length === 0) continue;
        const response = await fetch('/api/places/dismiss-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairs: batch }),
        });
        if (!response.ok) {
          rejected = true;
          continue;
        }
        wrote = true;
      }
    } catch (error) {
      threw = true;
      console.error(error);
    }
    if (rejected || threw) notify.error('Failed to dismiss duplicates');
    if (wrote) {
      setExpandedClusterId(undefined);
      try {
        await clearScanCache();
      } catch (error) {
        console.error(error);
      }
      router.refresh();
    }
    setIsLoading(false);
  }, [clearScanCache, router]);

  const handleRescan = useCallback(async () => {
    setIsLoading(true);
    setRescanError(null);
    try {
      const cacheClearRes = await fetch('/api/places/duplicates', { method: 'DELETE' });
      if (!cacheClearRes.ok) throw new Error('Failed to clear scan cache');
      announceChange();
      router.refresh();
    } catch (error) {
      setRescanError(error instanceof Error ? error.message : 'Rescan failed');
      console.error('[Rescan] Failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [announceChange, router]);

  const handlePutBack = useCallback(async (pair: DismissedPairView) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/places/dismiss-duplicate', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: [{ placeId1: pair.placeId1, placeId2: pair.placeId2 }] }),
      });
      if (!response.ok) throw new Error('Failed to put the pair back');
      await clearScanCache();
      router.refresh();
    } catch {
      notify.error('Failed to put the pair back');
    } finally {
      setIsLoading(false);
    }
  }, [clearScanCache, router]);

  const switchTab = useCallback((next: QueueTab) => {
    setTab(next);
    setCurrentIndex(-1);
    setExpandedClusterId(undefined);
  }, []);

  const openAt = useCallback((index: number, cluster: QueueCluster) => {
    setCurrentIndex(index);
    setExpandedClusterId(cluster.cluster_id);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.role === 'combobox' ||
        document.activeElement?.closest('[role="menu"]')
      ) {
        return;
      }
      if (confirmRef.current) return;

      const list = groupsRef.current;
      switch (event.key) {
        case 'j':
        case 'k': {
          if (event.metaKey || event.ctrlKey || event.altKey) break;
          event.preventDefault();
          if (list.length === 0) return;
          const delta = event.key === 'j' ? 1 : -1;
          const prev = indexRef.current;
          if (prev < 0 && delta < 0) return;
          const next = Math.min(list.length - 1, Math.max(0, (prev < 0 ? -1 : prev) + delta));
          setCurrentIndex(next);
          if (isDesktop() && list[next]) setExpandedClusterId(list[next].cluster_id);
          break;
        }
        case 'Enter': {
          event.preventDefault();
          const cluster = list[indexRef.current];
          if (cluster) setExpandedClusterId(cluster.cluster_id);
          break;
        }
        case 'm': {
          if (event.metaKey || event.ctrlKey || event.altKey) break;
          event.preventDefault();
          const openId = expandedRef.current;
          if (!openId) return;
          const cluster = list.find((item) => item.cluster_id === openId)
            ?? reviewSorted.find((item) => item.cluster_id === openId)
            ?? possibleSorted.find((item) => item.cluster_id === openId);
          if (!cluster) return;
          const intent = openIntentRef.current?.clusterId === openId ? openIntentRef.current : undefined;
          handleMerge(cluster, intent);
          break;
        }
        case 'd': {
          if (event.metaKey || event.ctrlKey || event.altKey) break;
          event.preventDefault();
          const openId = expandedRef.current;
          if (!openId) return;
          const cluster = list.find((item) => item.cluster_id === openId)
            ?? reviewSorted.find((item) => item.cluster_id === openId)
            ?? possibleSorted.find((item) => item.cluster_id === openId);
          if (cluster) handleDismiss(cluster);
          break;
        }
        case 'Escape':
          event.preventDefault();
          setExpandedClusterId(undefined);
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleDismiss, handleMerge, possibleSorted, reviewSorted]);

  useEffect(() => {
    const currentElement = document.querySelector(`[data-cluster-index="${currentIndex}"]`);
    currentElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentIndex]);

  const dismissable = tab === 'review' || tab === 'possible' ? activeGroups : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Duplicates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Places that might be saved more than once. Merge them into one, or tell us they are different.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatChecked(fetchedAt)}</span>
          <Button size="sm" variant="outline" onClick={handleRescan} disabled={isLoading}>
            <RefreshCw className={cn('mr-1.5 h-3 w-3', isLoading && 'animate-spin')} />
            {isLoading ? 'Checking…' : 'Check again'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More"
              disabled={isLoading}
              className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2.5 shadow-xs disabled:pointer-events-none disabled:opacity-50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {desktop && (
                <DropdownMenuItem
                  disabled={certain.length === 0 || isLoading}
                  onSelect={() => setConfirm({ kind: 'merge-certain', groups: certain })}
                >
                  Merge certain groups ({certain.length})
                </DropdownMenuItem>
              )}
              {(tab === 'review' || tab === 'possible') && (
                <DropdownMenuItem
                  disabled={dismissable.length === 0 || isLoading}
                  onSelect={() => setConfirm({ kind: 'dismiss', groups: dismissable })}
                >
                  Dismiss all ({dismissable.length})
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {scanError && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Scan failed: {scanError}</span>
          </span>
          <Button size="sm" variant="outline" onClick={handleRescan} disabled={isLoading}>
            {isLoading ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}

      <div role="tablist" aria-label="Duplicate groups" className="flex gap-1 overflow-x-auto">
        {([
          ['review', 'To review', reviewSorted.length],
          ['possible', 'Possible', possibleSorted.length],
          ['dismissed', 'Not duplicates', dismissed.length],
          ['merged', 'Merged', merged.length],
        ] as const).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => switchTab(id)}
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1 text-sm',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <div className={cn('flex flex-col gap-2', expandedClusterId && tab !== 'dismissed' && tab !== 'merged' && 'hidden md:flex')}>
          {scanError ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500/60" />
              <h2 className="mb-2 text-lg font-medium">Could not load duplicates</h2>
              <p className="text-sm">{scanError}</p>
            </div>
          ) : tab === 'review' && reviewSorted.length === 0 ? (
            <div className="py-12 text-center">
              <h2 className="text-lg font-medium">{emptyCopy.title}</h2>
              {emptyCopy.lines.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {emptyCopy.lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              )}
            </div>
          ) : tab === 'possible' && possibleSorted.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No weaker matches.</p>
          ) : tab === 'dismissed' ? (
            dismissed.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No pairs marked not duplicates.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dismissed.map((pair) => (
                  <li key={`${pair.placeId1}:${pair.placeId2}`} className="rounded-lg border bg-card p-3">
                    <p className="font-medium">{pairLabel(pair)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Marked not duplicates on {formatMergedOn(pair.dismissedAt)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      disabled={isLoading}
                      onClick={() => handlePutBack(pair)}
                    >
                      Put back
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : tab === 'merged' ? (
            merged.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No merges yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {merged.map((entry) => (
                  <li key={entry.id} className="rounded-lg border bg-card p-3">
                    <p className="font-medium">{entry.keptName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatMergedOn(entry.performedAt)} · {entry.placeCount} places → 1
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : (
            activeGroups.map((cluster, index) => (
              <DuplicateQueueRow
                key={cluster.cluster_id}
                cluster={cluster}
                index={index}
                selected={index === currentIndex || cluster.cluster_id === expandedClusterId}
                onOpen={() => openAt(index, cluster)}
              />
            ))
          )}
        </div>

        <div className={cn(
          'min-w-0',
          tab === 'dismissed' || tab === 'merged' ? 'hidden' : expandedClusterId ? 'block' : 'hidden md:block',
        )}>
          {openCluster ? (
            <div>
              <button
                type="button"
                className="mb-3 text-sm text-muted-foreground md:hidden"
                onClick={() => setExpandedClusterId(undefined)}
              >
                ‹ Duplicates
              </button>
              <DuplicateExpandedView
                cluster={openCluster}
                onMerge={(intent) => handleMerge(openCluster, intent)}
                onMergePair={(targetId, sourceId, fieldOverrides) => handleMergePair(openCluster, targetId, sourceId, fieldOverrides)}
                onDismiss={() => handleDismiss(openCluster)}
                onIntentChange={handleIntentChange}
                isLoading={isLoading}
              />
            </div>
          ) : (
            <p className="hidden py-12 text-center text-sm text-muted-foreground md:block">
              Select a group to compare.
            </p>
          )}
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'dismiss'
                ? `Dismiss ${confirm.groups.length} ${confirm.groups.length === 1 ? 'group' : 'groups'}?`
                : `Merge ${confirm?.groups.length ?? 0} certain ${(confirm?.groups.length ?? 0) === 1 ? 'group' : 'groups'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'dismiss'
                ? `This marks ${distinctPlaceCount(confirm.groups)} places across ${confirm.groups.length} ${confirm.groups.length === 1 ? 'group' : 'groups'} as not duplicates.`
                : `This merges ${distinctPlaceCount(confirm?.groups ?? [])} places across ${confirm?.groups.length ?? 0} certain ${(confirm?.groups.length ?? 0) === 1 ? 'group' : 'groups'}. Places you are not keeping are archived.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isLoading || (confirm?.groups.length ?? 0) === 0}
              onClick={() => {
                const pending = confirm;
                setConfirm(null);
                if (!pending) return;
                if (pending.kind === 'merge-certain') handleMergeCertain(pending.groups);
                if (pending.kind === 'dismiss') handleDismissGroups(pending.groups);
              }}
            >
              {confirm?.kind === 'dismiss' ? 'Dismiss' : 'Merge'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="hidden gap-4 border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground md:flex md:justify-center">
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">j</kbd> / <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">k</kbd> Move selection</span>
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">Enter</kbd> Open</span>
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">m</kbd> Merge open group</span>
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">d</kbd> Dismiss open group</span>
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">Esc</kbd> Close</span>
      </div>
    </div>
  );
}
