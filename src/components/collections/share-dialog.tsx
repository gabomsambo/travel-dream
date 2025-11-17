'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/adapters/dialog";
import { Button } from "@/components/adapters/button";
import { Download, Map, Navigation, FileText, FileSpreadsheet, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Collection, Place } from '@/types/database';
import type { ExportFormat } from '@/types/export';

interface ShareDialogProps {
  collection: Collection & { places: Place[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ collection, open, onOpenChange }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(window.location.href);
    }
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleExport = async (format: ExportFormat) => {
    if (collection.places.length === 0) {
      toast.error('No places to export');
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: { type: 'collection', collectionId: collection.id },
          format,
          preset: 'standard',
          options: { includeCollectionMetadata: true }
        })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${collection.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${collection.places.length} places as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportGoogleMaps = () => {
    const placesWithCoords = collection.places.filter((p) => p.coords);

    if (placesWithCoords.length === 0) {
      toast.error('No places with coordinates');
      return;
    }

    if (placesWithCoords.length === 1) {
      const place = placesWithCoords[0];
      const url = `https://www.google.com/maps/search/?api=1&query=${place.coords!.lat},${place.coords!.lon}`;
      window.open(url, '_blank');
      return;
    }

    const waypoints = placesWithCoords
      .slice(1)
      .map((p) => `${p.coords!.lat},${p.coords!.lon}`)
      .join('|');

    const origin = `${placesWithCoords[0].coords!.lat},${placesWithCoords[0].coords!.lon}`;

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&waypoints=${waypoints}`;
    window.open(url, '_blank');
    toast.success('Opened in Google Maps');
  };

  const handleExportAppleMaps = () => {
    const placesWithCoords = collection.places.filter((p) => p.coords);

    if (placesWithCoords.length === 0) {
      toast.error('No places with coordinates');
      return;
    }

    const place = placesWithCoords[0];
    const url = `https://maps.apple.com?ll=${place.coords!.lat},${place.coords!.lon}&q=${encodeURIComponent(place.name)}`;

    window.open(url, '_blank');

    if (placesWithCoords.length > 1) {
      toast.info('Apple Maps opened with first location. Use CSV for all places.');
    } else {
      toast.success('Opened in Apple Maps');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Collection</DialogTitle>
          <DialogDescription>
            Share "{collection.name}" with others or export to different formats
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Share Link Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Share Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
              />
              <Button variant="outline" size="icon" onClick={handleCopyLink}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Export Options Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Export Options</label>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleExport('csv')}
                disabled={collection.places.length === 0 || isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Export as CSV (Google Sheets)
              </Button>

              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleExport('xlsx')}
                disabled={collection.places.length === 0 || isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                Export as Excel (XLSX)
              </Button>

              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleExport('pdf')}
                disabled={collection.places.length === 0 || isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Export as PDF (Printable)
              </Button>

              <Button
                variant="outline"
                className="justify-start"
                onClick={handleExportGoogleMaps}
                disabled={!collection.places.some((p) => p.coords)}
              >
                <Map className="h-4 w-4 mr-2" />
                Open in Google Maps
              </Button>

              <Button
                variant="outline"
                className="justify-start"
                onClick={handleExportAppleMaps}
                disabled={!collection.places.some((p) => p.coords)}
              >
                <Navigation className="h-4 w-4 mr-2" />
                Open in Apple Maps
              </Button>
            </div>
          </div>

          {/* Info */}
          {collection.places.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {collection.places.length} {collection.places.length === 1 ? 'place' : 'places'} in
              this collection
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
