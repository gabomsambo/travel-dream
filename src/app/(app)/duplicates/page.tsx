import { DuplicatesPageClient } from '@/components/duplicates/duplicates-page-client';
import { auth } from '@/lib/auth';
import type { DismissedPairView, MergedGroupView, QueueCluster } from '@/lib/duplicate-certainty';
import { cookies } from 'next/headers';

type DuplicatesFetchResult =
  | {
    ok: true;
    clusters: QueueCluster[];
    possible: QueueCluster[];
    dismissed: DismissedPairView[];
    merged: MergedGroupView[];
    timestamp: string | null;
  }
  | { ok: false; error: string };

async function getDuplicateClusters(): Promise<DuplicatesFetchResult> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll()
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/places/duplicates?mode=clusters&minConfidence=0.7&limit=1000`, {
      cache: 'no-store',
      headers: {
        Cookie: cookieHeader,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.message || `HTTP ${response.status} ${response.statusText}`;
      console.error('Failed to fetch duplicates:', message, body);
      return { ok: false, error: message };
    }

    const data = await response.json();
    return {
      ok: true,
      clusters: data.clusters || [],
      possible: data.possible || [],
      dismissed: data.dismissed || [],
      merged: data.merged || [],
      timestamp: data.timestamp ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    console.error('Error fetching duplicates:', error);
    return { ok: false, error: message };
  }
}

export default async function DuplicatesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const result = await getDuplicateClusters();

  return (
    <DuplicatesPageClient
      initialData={result.ok ? result.clusters : []}
      possible={result.ok ? result.possible : []}
      dismissed={result.ok ? result.dismissed : []}
      merged={result.ok ? result.merged : []}
      fetchedAt={result.ok ? result.timestamp : null}
      fetchError={result.ok ? null : result.error}
    />
  );
}
