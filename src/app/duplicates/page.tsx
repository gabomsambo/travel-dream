import { DuplicatesPageClient } from '@/components/duplicates/duplicates-page-client';

async function getDuplicateClusters() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/places/duplicates?mode=clusters&minConfidence=0.7&limit=100`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('Failed to fetch duplicates:', response.statusText, errorData);
      return [];
    }

    const data = await response.json();
    return data.clusters || [];
  } catch (error) {
    console.error('Error fetching duplicates:', error);
    return [];
  }
}

export default async function DuplicatesPage() {
  const clusters = await getDuplicateClusters();

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b p-4">
        <h1 className="text-2xl font-bold">Duplicate Detection</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and merge potential duplicate places
        </p>
      </div>
      <DuplicatesPageClient initialData={clusters} />
    </div>
  );
}
