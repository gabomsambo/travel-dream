import type { Place } from '@/types/database';

export interface KMLGeneratorOptions {
  documentName: string;
  documentDescription?: string;
  groupByKind?: boolean;
  groupByCity?: boolean;
}

function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateDescription(place: Place): string {
  const parts: string[] = [];

  if (place.description) {
    parts.push(`<p>${escapeXml(place.description)}</p>`);
  }

  if (place.kind) {
    parts.push(`<p><strong>Type:</strong> ${escapeXml(place.kind)}</p>`);
  }

  if (place.city || place.country) {
    const location = [place.city, place.admin, place.country]
      .filter(Boolean)
      .join(', ');
    parts.push(`<p><strong>Location:</strong> ${escapeXml(location)}</p>`);
  }

  if (place.tags && place.tags.length > 0) {
    parts.push(`<p><strong>Tags:</strong> ${place.tags.map(escapeXml).join(', ')}</p>`);
  }

  if (place.vibes && place.vibes.length > 0) {
    parts.push(`<p><strong>Vibes:</strong> ${place.vibes.map(escapeXml).join(', ')}</p>`);
  }

  if (place.price_level) {
    parts.push(`<p><strong>Price:</strong> ${escapeXml(place.price_level)}</p>`);
  }

  if (place.notes) {
    parts.push(`<p><strong>Notes:</strong> ${escapeXml(place.notes)}</p>`);
  }

  return parts.join('\n');
}

function generatePlacemark(place: Place): string {
  const description = generateDescription(place);
  const coords = place.coords!;

  return `    <Placemark>
      <name>${escapeXml(place.name)}</name>
      <description><![CDATA[${description}]]></description>
      <ExtendedData>
        ${place.googlePlaceId ? `<Data name="googlePlaceId"><value>${escapeXml(place.googlePlaceId)}</value></Data>` : ''}
        <Data name="kind"><value>${escapeXml(place.kind)}</value></Data>
        ${place.city ? `<Data name="city"><value>${escapeXml(place.city)}</value></Data>` : ''}
        ${place.country ? `<Data name="country"><value>${escapeXml(place.country)}</value></Data>` : ''}
        ${place.id ? `<Data name="id"><value>${escapeXml(place.id)}</value></Data>` : ''}
      </ExtendedData>
      <Point>
        <coordinates>${coords.lon},${coords.lat},0</coordinates>
      </Point>
    </Placemark>`;
}

function groupPlacesByField(places: Place[], field: 'kind' | 'city'): Map<string, Place[]> {
  const groups = new Map<string, Place[]>();

  for (const place of places) {
    const key = place[field] || 'Other';
    const existing = groups.get(key) || [];
    existing.push(place);
    groups.set(key, existing);
  }

  return groups;
}

export async function generateKML(
  places: Place[],
  options: KMLGeneratorOptions
): Promise<string> {
  const placesWithCoords = places.filter(
    p => p.coords && typeof p.coords.lat === 'number' && typeof p.coords.lon === 'number'
  );

  if (placesWithCoords.length === 0) {
    throw new Error('No places with coordinates to export');
  }

  let content: string;

  if (options.groupByKind) {
    const groups = groupPlacesByField(placesWithCoords, 'kind');
    const folders = Array.from(groups.entries())
      .map(([name, groupPlaces]) => {
        const placemarks = groupPlaces.map(generatePlacemark).join('\n');
        return `    <Folder>
      <name>${escapeXml(name)}</name>
${placemarks}
    </Folder>`;
      })
      .join('\n');
    content = folders;
  } else if (options.groupByCity) {
    const groups = groupPlacesByField(placesWithCoords, 'city');
    const folders = Array.from(groups.entries())
      .map(([name, groupPlaces]) => {
        const placemarks = groupPlaces.map(generatePlacemark).join('\n');
        return `    <Folder>
      <name>${escapeXml(name)}</name>
${placemarks}
    </Folder>`;
      })
      .join('\n');
    content = folders;
  } else {
    content = placesWithCoords.map(generatePlacemark).join('\n');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(options.documentName)}</name>
    <description>${escapeXml(options.documentDescription || 'Exported from Travel Dreams')}</description>
${content}
  </Document>
</kml>`;
}
