import { NextRequest, NextResponse } from 'next/server';
import { parseAddressComponents } from '@/lib/address-parser';

interface PlaceDetailsResponse {
  result: {
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    opening_hours?: {
      weekday_text?: string[];
      periods?: Array<{
        open: { day: number; time: string };
        close?: { day: number; time: string };
      }>;
    };
  };
  status: string;
  error_message?: string;
}

export interface LocationData {
  googlePlaceId: string;
  name: string;
  address: string;
  city: string | null;
  admin: string | null;
  country: string | null;
  coords: { lat: number; lon: number };
  hours: Record<string, string> | null;
}

const DAY_MAP: Record<string, string> = {
  'Monday': 'monday',
  'Tuesday': 'tuesday',
  'Wednesday': 'wednesday',
  'Thursday': 'thursday',
  'Friday': 'friday',
  'Saturday': 'saturday',
  'Sunday': 'sunday',
};

function convertTo24Hour(hour: number, minute: string, period: string): string {
  let h = hour;
  if (period.toUpperCase() === 'PM' && hour !== 12) {
    h = hour + 12;
  } else if (period.toUpperCase() === 'AM' && hour === 12) {
    h = 0;
  }
  return `${h.toString().padStart(2, '0')}:${minute}`;
}

function transformGoogleHoursToAppFormat(
  openingHours?: PlaceDetailsResponse['result']['opening_hours']
): Record<string, string> | null {
  if (!openingHours?.weekday_text || openingHours.weekday_text.length === 0) {
    return null;
  }

  const hours: Record<string, string> = {};

  for (const dayText of openingHours.weekday_text) {
    // Format: "Monday: 9:00 AM - 5:00 PM" or "Monday: Closed"
    const match = dayText.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;

    const [, dayName, timeRange] = match;
    const dayKey = DAY_MAP[dayName];
    if (!dayKey) continue;

    if (timeRange.toLowerCase() === 'closed') {
      hours[dayKey] = 'closed';
    } else {
      // Convert "9:00 AM - 5:00 PM" to "09:00-17:00"
      // Handle various separators: -, –, —
      const timeMatch = timeRange.match(
        /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
      );
      if (timeMatch) {
        const [, h1, m1, p1, h2, m2, p2] = timeMatch;
        const start = convertTo24Hour(parseInt(h1), m1, p1);
        const end = convertTo24Hour(parseInt(h2), m2, p2);
        hours[dayKey] = `${start}-${end}`;
      }
    }
  }

  return Object.keys(hours).length > 0 ? hours : null;
}

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get('placeId');
  const sessionToken = request.nextUrl.searchParams.get('sessionToken');

  if (!placeId) {
    return NextResponse.json(
      { error: 'placeId is required' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY not configured');
    return NextResponse.json(
      { error: 'Google Places API not configured' },
      { status: 500 }
    );
  }

  const fields = [
    'place_id',
    'name',
    'formatted_address',
    'geometry',
    'address_components',
    'opening_hours',
  ].join(',');

  const params = new URLSearchParams({
    place_id: placeId,
    key: apiKey,
    fields,
  });

  if (sessionToken) {
    params.append('sessiontoken', sessionToken);
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params}`
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data: PlaceDetailsResponse = await response.json();

    if (data.status !== 'OK') {
      console.error('Google Places Details API error:', data.status, data.error_message);
      return NextResponse.json(
        { error: data.error_message || 'Place Details API error' },
        { status: 400 }
      );
    }

    const { result } = data;
    const parsed = parseAddressComponents(
      result.address_components,
      result.formatted_address
    );

    const locationData: LocationData = {
      googlePlaceId: result.place_id,
      name: result.name,
      address: result.formatted_address,
      city: parsed.city,
      admin: parsed.admin,
      country: parsed.country,
      coords: {
        lat: result.geometry.location.lat,
        lon: result.geometry.location.lng,
      },
      hours: transformGoogleHoursToAppFormat(result.opening_hours),
    };

    return NextResponse.json(locationData);
  } catch (error) {
    console.error('Error calling Google Places Details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch place details' },
      { status: 500 }
    );
  }
}
