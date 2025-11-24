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
