import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCollectionWithPlaces } from '@/lib/db-queries';
import { DayPlannerClient } from '@/components/day-planner/day-planner-client';

interface PlannerPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PlannerPageProps): Promise<Metadata> {
  const { id } = await params;
  const collection = await getCollectionWithPlaces(id);

  if (!collection) {
    return {
      title: 'Collection Not Found | Travel Dreams',
    };
  }

  return {
    title: `${collection.name} - Day Planner | Travel Dreams`,
    description: `Plan your itinerary for ${collection.name}`,
  };
}

export default async function PlannerPage({ params }: PlannerPageProps) {
  const { id } = await params;
  const collection = await getCollectionWithPlaces(id);

  if (!collection) {
    notFound();
  }

  const collectionWithTypedTransport = {
    ...collection,
    transportMode: (collection.transportMode || 'drive') as 'drive' | 'walk',
  };

  return <DayPlannerClient initialCollection={collectionWithTypedTransport} />;
}
