import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCollectionWithPlaces } from '@/lib/db-queries';
import { DayPlannerClient } from '@/components/day-planner/day-planner-client';
import { getCurrentUser } from '@/lib/auth-helpers';

interface PlannerPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PlannerPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return { title: 'Day Planner | Travel Dreams' };
  }
  const collection = await getCollectionWithPlaces(id, user.id);

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
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const { id } = await params;
  const collection = await getCollectionWithPlaces(id, user.id);

  if (!collection) {
    notFound();
  }

  const collectionWithTypedTransport = {
    ...collection,
    transportMode: (collection.transportMode || 'drive') as 'drive' | 'walk',
  };

  return <DayPlannerClient initialCollection={collectionWithTypedTransport} />;
}
