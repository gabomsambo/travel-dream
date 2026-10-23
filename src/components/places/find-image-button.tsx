'use client';

import { useState } from 'react';
import { Image as ImageIcon, Plus } from 'lucide-react';
import { Button } from '@/components/adapters/button';
import { FindImageDialog } from './find-image-dialog';
import { cn } from '@/lib/utils';

type ButtonVariant = React.ComponentProps<typeof Button>['variant'];
type ButtonSize = React.ComponentProps<typeof Button>['size'];

interface FindImageButtonProps {
  placeId: string;
  placeName: string;
  placeCity?: string | null;
  hasGooglePlaceId: boolean;
  onAttached?: () => void;
  variant?: 'default' | 'icon-only';
  buttonVariant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Visible label. Defaults to "Find Image". */
  label?: string;
  /** `always` makes the attached photo the cover. Defaults to first-photo-only. */
  primary?: 'if-first' | 'always';
}

export function FindImageButton({
  placeId,
  placeName,
  placeCity,
  hasGooglePlaceId,
  onAttached,
  variant = 'default',
  buttonVariant,
  size,
  className,
  label,
  primary,
}: FindImageButtonProps) {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === 'icon-only' ? (
      <Button
        type="button"
        variant={buttonVariant ?? 'secondary'}
        size={size ?? 'icon'}
        className={cn('h-8 px-2 gap-1 rounded-full shadow-md', className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Find an image"
      >
        <Plus className="size-6" />
        <ImageIcon className="size-6" />
        <span className="sr-only">{label ?? 'Find image'}</span>
      </Button>
    ) : (
      <Button
        type="button"
        variant={buttonVariant ?? 'outline'}
        size={size ?? 'sm'}
        className={cn('gap-2', className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ImageIcon className="h-4 w-4" />
        {label ?? 'Find Image'}
      </Button>
    );

  return (
    <>
      {trigger}
      <FindImageDialog
        placeId={placeId}
        placeName={placeName}
        placeCity={placeCity}
        hasGooglePlaceId={hasGooglePlaceId}
        open={open}
        onOpenChange={setOpen}
        onAttached={onAttached}
        primary={primary}
      />
    </>
  );
}
