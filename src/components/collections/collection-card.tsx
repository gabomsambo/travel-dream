'use client';

import { FolderHeart, MapPin, Trash2, MoreVertical } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import type { Collection } from '@/types/database';
import { useRouter } from 'next/navigation';

interface CollectionCardProps {
  collection: Collection & { places?: Array<{ coverUrl?: string | null }> };
  placeCount?: number;
  onDelete?: (collectionId: string) => void;
}

export function CollectionCard({
  collection,
  placeCount = 0,
  onDelete,
}: CollectionCardProps) {
  const router = useRouter();

  const coverUrl = collection.places?.[0]?.coverUrl;

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

        {/* Place Count Badge */}
        <Badge className="absolute right-3 bottom-3 bg-background/95 backdrop-blur-md shadow-lg">
          <MapPin className="h-3 w-3 mr-1.5" />
          {placeCount} {placeCount === 1 ? 'place' : 'places'}
        </Badge>

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
    </Card>
  );
}
