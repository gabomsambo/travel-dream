'use client';

import { formatDistanceToNow } from 'date-fns';
import { Trash } from 'lucide-react';
import { Button } from '@/components/ui-v2/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui-v2/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui-v2/table';
import type { ExportHistoryEntry } from '@/types/export';

interface ExportHistoryProps {
  history: ExportHistoryEntry[];
  onDeleteEntry: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatRelativeDate(isoString: string): string {
  try {
    return formatDistanceToNow(new Date(isoString), { addSuffix: true });
  } catch (error) {
    return 'Unknown date';
  }
}

function getScopeLabel(scope: ExportHistoryEntry['scope']): string {
  switch (scope.type) {
    case 'collection':
      return 'Collection';
    case 'library':
      return 'Library';
    case 'selected':
      return `Selected (${scope.placeIds.length})`;
    default:
      return 'Unknown';
  }
}

export function ExportHistory({ history, onDeleteEntry }: ExportHistoryProps) {
  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8">
            No exports yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="text-right">Records</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">
                  {entry.filename}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelativeDate(entry.exportedAt)}
                </TableCell>
                <TableCell>
                  {getScopeLabel(entry.scope)}
                </TableCell>
                <TableCell className="text-right">
                  {entry.recordCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {formatBytes(entry.fileSize)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDeleteEntry(entry.id)}
                    aria-label={`Delete ${entry.filename}`}
                  >
                    <Trash className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
