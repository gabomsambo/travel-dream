'use client';

import { Trash2, FolderOpen, Calendar } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Collection } from '@/types/database';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';

interface CollectionCardProps {
  collection: Collection;
  placeCount?: number;
  onDelete?: (collectionId: string) => void;
}

export function CollectionCard({
  collection,
  placeCount = 0,
  onDelete,
}: CollectionCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
    router.push(`/collections/${collection.id}`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(collection.id);
    }
  };

  const truncateDescription = (text: string | null, maxLength: number = 120) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  return (
    <Card
      className={cn(
        'hover:shadow-lg transition-all duration-200 cursor-pointer relative group',
        'hover:border-primary/50'
      )}
      onClick={handleCardClick}
    >
      {/* Delete button - visible on hover */}
      {onDelete && (
        <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 shadow-sm"
            onClick={handleDelete}
            title="Delete collection"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg leading-tight truncate">
              {collection.name}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{placeCount} {placeCount === 1 ? 'place' : 'places'}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(collection.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      {collection.description && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {truncateDescription(collection.description)}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
