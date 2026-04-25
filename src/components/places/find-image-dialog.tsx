'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/adapters/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/adapters/input';
import { Button } from '@/components/adapters/button';
import { PhotoAttribution } from '@/components/attribution/photo-attribution';
import { cn } from '@/lib/utils';
import type { AttributionMeta } from '@/db/schema/attachments';

type Source = 'google_places' | 'wikimedia' | 'pexels';

interface SearchItem {
  source: Source;
  sourceId: string;
  thumbnailUrl: string | null;
  fullUrl: string | null;
  width: number | null;
  height: number | null;
  attribution: AttributionMeta;
  caption?: string;
}

interface SearchResponse {
  items: SearchItem[];
  nextPage: number | null;
}

interface TabState {
  hasOpened: boolean;
  query: string;
  items: SearchItem[];
  isLoading: boolean;
  error: string | null;
  missingEnv?: string;
}

const SOURCE_LABEL: Record<Source, string> = {
  google_places: 'Google Places',
  wikimedia: 'Wikimedia',
  pexels: 'Pexels',
};

interface FindImageDialogProps {
  placeId: string;
  placeName: string;
  placeCity?: string | null;
  hasGooglePlaceId: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttached?: () => void;
}

export function FindImageDialog({
  placeId,
  placeName,
  placeCity,
  hasGooglePlaceId,
  open,
  onOpenChange,
  onAttached,
}: FindImageDialogProps) {
  const seedQuery = `${placeName}${placeCity ? ' ' + placeCity : ''}`.trim();
  const initialTab: Source = hasGooglePlaceId ? 'google_places' : 'wikimedia';

  const [activeTab, setActiveTab] = useState<Source>(initialTab);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Record<Source, TabState>>({
    google_places: { hasOpened: false, query: seedQuery, items: [], isLoading: false, error: null },
    wikimedia:    { hasOpened: false, query: seedQuery, items: [], isLoading: false, error: null },
    pexels:       { hasOpened: false, query: seedQuery, items: [], isLoading: false, error: null },
  });

  // Reset on open transitions
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setTabs({
        google_places: { hasOpened: false, query: seedQuery, items: [], isLoading: false, error: null },
        wikimedia:    { hasOpened: false, query: seedQuery, items: [], isLoading: false, error: null },
        pexels:       { hasOpened: false, query: seedQuery, items: [], isLoading: false, error: null },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestIds = useRef<Record<Source, number>>({
    google_places: 0,
    wikimedia: 0,
    pexels: 0,
  });

  const runSearch = async (source: Source, query: string) => {
    const reqId = ++requestIds.current[source];
    setTabs((prev) => ({
      ...prev,
      [source]: { ...prev[source], isLoading: true, error: null, missingEnv: undefined },
    }));
    try {
      const params = new URLSearchParams({
        source,
        q: query,
        placeId,
      });
      const res = await fetch(`/api/photos/search?${params.toString()}`);
      if (reqId !== requestIds.current[source]) return; // stale; a newer request is in flight
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        setTabs((prev) => ({
          ...prev,
          [source]: {
            ...prev[source],
            isLoading: false,
            items: [],
            error: body?.error || 'Source not configured',
            missingEnv: body?.missingEnv,
          },
        }));
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as SearchResponse;
      if (reqId !== requestIds.current[source]) return;
      setTabs((prev) => ({
        ...prev,
        [source]: { ...prev[source], isLoading: false, items: data.items, error: null },
      }));
    } catch (err) {
      if (reqId !== requestIds.current[source]) return;
      setTabs((prev) => ({
        ...prev,
        [source]: {
          ...prev[source],
          isLoading: false,
          items: [],
          error: err instanceof Error ? err.message : 'Search failed',
        },
      }));
    }
  };

  // Lazy-load each tab on first activation
  useEffect(() => {
    if (!open) return;
    const state = tabs[activeTab];
    if (!state.hasOpened) {
      setTabs((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], hasOpened: true },
      }));
      runSearch(activeTab, state.query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  const handleQueryChange = (source: Source, value: string) => {
    setTabs((prev) => ({
      ...prev,
      [source]: { ...prev[source], query: value },
    }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length === 0) return;
      runSearch(source, value);
    }, 400);
  };

  const handleAttach = async (item: SearchItem) => {
    const itemKey = `${item.source}-${item.sourceId}`;
    setAttaching(itemKey);
    try {
      const res = await fetch(`/api/places/${placeId}/attachments/from-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: item.source,
          sourceId: item.sourceId,
          thumbnailUrl: item.thumbnailUrl,
          fullUrl: item.fullUrl,
          width: item.width,
          height: item.height,
          attribution: item.attribution,
          caption: item.caption,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Attach failed (${res.status})`);
      }
      toast.success(body.deduped ? 'Image already attached' : 'Image added');
      onAttached?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not add image', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAttaching(null);
    }
  };

  const renderTab = (source: Source) => {
    const state = tabs[source];
    return (
      <div className="flex flex-col gap-3">
        <Input
          value={state.query}
          onChange={(e) => handleQueryChange(source, e.target.value)}
          placeholder="Search query"
        />

        {state.error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {state.missingEnv ? (
              <>
                {SOURCE_LABEL[source]} is not configured yet (missing{' '}
                <code className="font-mono">{state.missingEnv}</code>). Try a different tab.
              </>
            ) : (
              state.error
            )}
          </div>
        )}

        {state.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : state.items.length === 0 && !state.error ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ImageIcon className="h-10 w-10 mb-2 opacity-50" />
            <span className="text-sm">No results</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {state.items.map((item) => {
              const itemKey = `${item.source}-${item.sourceId}`;
              const isAttaching = attaching === itemKey;
              return (
                <div key={itemKey} className="space-y-1">
                  <button
                    type="button"
                    disabled={!!attaching}
                    onClick={() => handleAttach(item)}
                    className={cn(
                      'relative aspect-square w-full rounded-lg overflow-hidden border-2 border-transparent hover:border-primary/50 transition-all bg-muted',
                      attaching && !isAttaching && 'opacity-50',
                      isAttaching && 'border-primary',
                    )}
                  >
                    {item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnailUrl}
                        alt={item.caption || 'Photo'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                    {isAttaching && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                  </button>
                  <PhotoAttribution attribution={item.attribution} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Find Image</DialogTitle>
          <DialogDescription>
            Pick a free, attributed photo for {placeName}.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as Source)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList>
            {hasGooglePlaceId && (
              <TabsTrigger value="google_places">Google Places</TabsTrigger>
            )}
            <TabsTrigger value="wikimedia">Wikimedia</TabsTrigger>
            <TabsTrigger value="pexels">Pexels</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-4">
            {hasGooglePlaceId && (
              <TabsContent value="google_places" className="mt-0">
                {renderTab('google_places')}
              </TabsContent>
            )}
            <TabsContent value="wikimedia" className="mt-0">
              {renderTab('wikimedia')}
            </TabsContent>
            <TabsContent value="pexels" className="mt-0">
              {renderTab('pexels')}
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={!!attaching}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
