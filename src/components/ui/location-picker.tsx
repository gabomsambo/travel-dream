'use client';

import * as React from 'react';
import { Check, MapPin, X, Loader2, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useGooglePlaces, LocationData, PlacePrediction } from '@/hooks/use-google-places';

export interface LocationPickerValue {
  googlePlaceId?: string | null;
  name?: string;
  address?: string | null;
  city?: string | null;
  admin?: string | null;
  country?: string | null;
  coords?: { lat: number; lon: number } | null;
  hours?: Record<string, string> | null;
}

interface LocationPickerProps {
  value?: LocationPickerValue;
  onChange: (location: LocationData | null) => void;
  placeholder?: string;
  disabled?: boolean;
  showVerificationBadge?: boolean;
}

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Search location...',
  disabled = false,
  showVerificationBadge = true,
}: LocationPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [isSelecting, setIsSelecting] = React.useState(false);

  const {
    suggestions,
    isLoading,
    error,
    searchPlaces,
    getPlaceDetails,
    clearSuggestions,
  } = useGooglePlaces();

  const handleSelect = async (prediction: PlacePrediction) => {
    setIsSelecting(true);
    try {
      const details = await getPlaceDetails(prediction.place_id);
      onChange(details);
      setInputValue(prediction.description);
      setOpen(false);
      clearSuggestions();
    } catch (err) {
      console.error('Failed to get place details:', err);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setInputValue('');
    clearSuggestions();
  };

  const displayValue = value?.address || value?.name || '';
  const isVerified = Boolean(value?.googlePlaceId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !displayValue && 'text-muted-foreground'
          )}
        >
          <MapPin className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <span className="flex-1 truncate">
            {displayValue || placeholder}
          </span>
          {showVerificationBadge && isVerified && (
            <BadgeCheck className="ml-2 h-4 w-4 text-green-500" />
          )}
          {displayValue && (
            <X
              className="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search places..."
            value={inputValue}
            onValueChange={(value) => {
              setInputValue(value);
              searchPlaces(value);
            }}
          />
          <CommandList>
            {isLoading || isSelecting ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {isSelecting ? 'Getting details...' : 'Searching...'}
                </span>
              </div>
            ) : error ? (
              <div className="py-6 text-center text-sm text-destructive">
                {error}
              </div>
            ) : suggestions.length === 0 && inputValue.length >= 2 ? (
              <CommandEmpty>No places found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {suggestions.map((prediction) => (
                  <CommandItem
                    key={prediction.place_id}
                    value={prediction.place_id}
                    onSelect={() => handleSelect(prediction)}
                    className="cursor-pointer"
                  >
                    <MapPin className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium">
                        {prediction.structured_formatting.main_text}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {prediction.structured_formatting.secondary_text}
                      </span>
                    </div>
                    {value?.googlePlaceId === prediction.place_id && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
