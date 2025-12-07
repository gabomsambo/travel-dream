'use client';

import { useState, useCallback, useRef } from 'react';
import { useDebounce } from './use-debounce';

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
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

interface UseGooglePlacesReturn {
  suggestions: PlacePrediction[];
  isLoading: boolean;
  error: string | null;
  searchPlaces: (input: string) => void;
  getPlaceDetails: (placeId: string) => Promise<LocationData>;
  clearSuggestions: () => void;
  resetSession: () => void;
}

export function useGooglePlaces(): UseGooglePlacesReturn {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const sessionTokenRef = useRef<string>(crypto.randomUUID());

  const debouncedInput = useDebounce(searchInput, 300);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        input,
        sessionToken: sessionTokenRef.current,
      });

      const response = await fetch(`/api/google-places/autocomplete?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch suggestions');
      }

      setSuggestions(data.predictions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch suggestions');
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useState(() => {
    if (debouncedInput) {
      fetchSuggestions(debouncedInput);
    }
  });

  const searchPlaces = useCallback((input: string) => {
    setSearchInput(input);
    if (input.length < 2) {
      setSuggestions([]);
    } else {
      fetchSuggestions(input);
    }
  }, [fetchSuggestions]);

  const getPlaceDetails = useCallback(async (placeId: string): Promise<LocationData> => {
    const params = new URLSearchParams({
      placeId,
      sessionToken: sessionTokenRef.current,
    });

    const response = await fetch(`/api/google-places/details?${params}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch place details');
    }

    sessionTokenRef.current = crypto.randomUUID();

    return data as LocationData;
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setSearchInput('');
  }, []);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = crypto.randomUUID();
    setSuggestions([]);
    setSearchInput('');
    setError(null);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    searchPlaces,
    getPlaceDetails,
    clearSuggestions,
    resetSession,
  };
}
