import { NextRequest, NextResponse } from 'next/server';

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface AutocompleteResponse {
  predictions: PlacePrediction[];
  status: string;
  error_message?: string;
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('input');
  const sessionToken = request.nextUrl.searchParams.get('sessionToken');

  if (!input || input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY not configured');
    return NextResponse.json(
      { error: 'Google Places API not configured' },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    input,
    key: apiKey,
    types: 'establishment|geocode',
  });

  if (sessionToken) {
    params.append('sessiontoken', sessionToken);
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data: AutocompleteResponse = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message);
      return NextResponse.json(
        { error: data.error_message || 'Places API error' },
        { status: 400 }
      );
    }

    const predictions = (data.predictions || []).map(p => ({
      place_id: p.place_id,
      description: p.description,
      structured_formatting: p.structured_formatting,
    }));

    return NextResponse.json({ predictions });
  } catch (error) {
    console.error('Error calling Google Places Autocomplete:', error);
    return NextResponse.json(
      { error: 'Failed to fetch place suggestions' },
      { status: 500 }
    );
  }
}
