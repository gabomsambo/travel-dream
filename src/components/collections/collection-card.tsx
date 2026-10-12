'use client';

import { useState } from 'react';
import { FolderHeart, MapPin, Trash2, MoreVertical, ImageIcon, X } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import type { Collection } from '@/types/database';
import { useRouter } from 'next/navigation';
import { CoverPhotoCredit } from '@/components/attribution/cover-photo-credit';
import type { AttributionMeta } from '@/db/schema/attachments';
import { CoverImagePickerDialog } from './cover-image-picker-dialog';

export type CollectionCardPlace = {
  coverUrl?: string | null;
  coverAttribution?: AttributionMeta | null;
  coverSource?: string | null;
};

export type CoverCreditUpdate = {
  attribution: AttributionMeta | null;
  source: string | null;
} | null;

export type CollectionCardModel = Collection & {
  places?: CollectionCardPlace[];
  coverAttribution?: AttributionMeta | null;
  coverSource?: string | null;
};

interface CollectionCardProps {
  collection: CollectionCardModel;
  placeCount?: number;
  onDelete?: (collectionId: string) => void;
  onCoverChange?: (collectionId: string, coverUrl: string | null, credit?: CoverCreditUpdate) => void;
}

export function CollectionCard({
  collection,
  placeCount = 0,
  onDelete,
  onCoverChange,
}: CollectionCardProps) {
  const router = useRouter();
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  const fallbackPlace = collection.places?.[0];
  const coverUrl = collection.coverImageUrl || fallbackPlace?.coverUrl;
  const coverAttribution = collection.coverImageUrl
    ? (collection.coverAttribution ?? null)
    : (fallbackPlace?.coverAttribution ?? null);
  const coverSource = collection.coverImageUrl
    ? (collection.coverSource ?? null)
    : (fallbackPlace?.coverSource ?? null);

  const handleCardClick = () => {
    router.push(`/collections/${collection.id}`);
  };

  return (
    <Card
      className={cn(
        'group cursor-pointer overflow-hidden transition-all duration-300',
        'hover:shadow-2xl hover:-translate-y-2 rounded-2xl'
      )}
    >
      {/* Cover Image Section */}
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/40">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={collection.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            onClick={handleCardClick}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            onClick={handleCardClick}
          >
            <FolderHeart className="h-20 w-20 text-primary/40" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[1] flex items-end gap-2">
          <div className="min-w-0 flex-1 overflow-hidden">
            {coverUrl ? (
              <CoverPhotoCredit
                attribution={coverAttribution}
                source={coverSource}
                variant="on-photo"
              />
            ) : null}
          </div>
          <Badge className="shrink-0 bg-background/95 backdrop-blur-md shadow-lg">
            <MapPin className="h-3 w-3 mr-1.5" />
            {placeCount} {placeCount === 1 ? 'place' : 'places'}
          </Badge>
        </div>

        {/* Actions Dropdown (shows on hover) */}
        {onDelete && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-md"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCoverPicker(true);
                  }}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Add cover picture
                </DropdownMenuItem>
                {collection.coverImageUrl && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onCoverChange?.(collection.id, null);
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove cover
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(collection.id);
                  }}
                  className="text-destructive"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Collection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-6 space-y-3" onClick={handleCardClick}>
        <h3 className="font-semibold text-xl line-clamp-1">{collection.name}</h3>
        {collection.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {collection.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground/80 pt-1">
          Created{' '}
          {new Date(collection.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* Cover Image Picker Dialog */}
      <CoverImagePickerDialog
        collectionId={collection.id}
        open={showCoverPicker}
        onOpenChange={setShowCoverPicker}
        onCoverChange={(coverUrl, credit) => onCoverChange?.(collection.id, coverUrl, credit)}
      />
    </Card>
  );
}
