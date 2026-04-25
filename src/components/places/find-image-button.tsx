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
}: FindImageButtonProps) {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === 'icon-only' ? (
      <Button
        type="button"
        variant={buttonVariant ?? 'secondary'}
        size={size ?? 'icon'}
        className={cn('h-8 w-8 rounded-full shadow-md', className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Find an image"
      >
        <Plus className="h-4 w-4" />
        <span className="sr-only">Find image</span>
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
        Find Image
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
      />
    </>
  );
}
