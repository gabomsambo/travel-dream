import { NextRequest, NextResponse } from 'next/server';
import { getCollectionById, getPlacesInCollection } from '@/lib/db-queries';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

function escapeCSV(value: string | null | undefined): string {
  const str = value || '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: collectionId } = await params;

    const collection = await getCollectionById(collectionId, user.id);
    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    const places = await getPlacesInCollection(collectionId, user.id);

    const headers = [
      'Name',
      'Description',
      'City',
      'Country',
      'Kind',
      'Latitude',
      'Longitude',
      'Tags',
      'Vibes',
      'Address',
      'Website',
      'Notes',
    ];

    const rows = places.map((place) => [
      escapeCSV(place.name),
      escapeCSV(place.description),
      escapeCSV(place.city),
      escapeCSV(place.country),
      escapeCSV(place.kind),
      place.coords?.lat?.toString() || '',
      place.coords?.lon?.toString() || '',
      escapeCSV(place.tags?.join('; ')),
      escapeCSV(place.vibes?.join('; ')),
      escapeCSV(place.address),
      escapeCSV(place.website),
      escapeCSV(place.notes),
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const fileName = `${collection.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_places.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error exporting CSV:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to export CSV',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
