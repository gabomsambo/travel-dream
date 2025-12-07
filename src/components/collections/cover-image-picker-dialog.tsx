'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/adapters/dialog";
import { Button } from "@/components/adapters/button";
import { Loader2, Upload, Image as ImageIcon, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AvailableImage {
  id: string;
  uri: string;
  thumbnailUri: string | null;
  placeId: string;
  placeName: string;
}

interface CoverImagePickerDialogProps {
  collectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCoverChange: (coverUrl: string | null) => void;
}

export function CoverImagePickerDialog({
  collectionId,
  open,
  onOpenChange,
  onCoverChange,
}: CoverImagePickerDialogProps) {
  const [images, setImages] = useState<AvailableImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [source, setSource] = useState<'collection' | 'all'>('collection');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch images based on source
  useEffect(() => {
    const fetchImages = async () => {
      if (!open) return;

      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/collections/${collectionId}/available-images?source=${source}`
        );
        if (!response.ok) throw new Error('Failed to fetch images');

        const data = await response.json();
        setImages(data.images || []);
      } catch (error) {
        console.error('Error fetching images:', error);
        toast.error('Failed to load images');
      } finally {
        setIsLoading(false);
      }
    };

    fetchImages();
  }, [collectionId, source, open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedImage(null);
      setSource('collection');
    }
  }, [open]);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Max 10MB');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/collections/${collectionId}/cover`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Upload failed');
      }

      const data = await response.json();
      toast.success('Cover image uploaded successfully');
      onCoverChange(data.coverImageUrl);
      onOpenChange(false);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleSelectExisting = async () => {
    if (!selectedImage) {
      toast.error('Please select an image');
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch(`/api/collections/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverImageUrl: selectedImage }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to set cover');
      }

      toast.success('Cover image set successfully');
      onCoverChange(selectedImage);
      onOpenChange(false);
    } catch (error) {
      console.error('Error setting cover:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to set cover');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose Cover Image</DialogTitle>
          <DialogDescription>
            Upload a new image or select from existing place photos
          </DialogDescription>
        </DialogHeader>

        {/* Upload Dropzone */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
            isUploading && "opacity-50 pointer-events-none"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Drop an image here or click to upload
              </span>
              <span className="text-xs text-muted-foreground/70">
                JPEG, PNG, WEBP, HEIC up to 10MB
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">Or select from existing</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Source Toggle */}
        <div className="flex gap-2">
          <Button
            variant={source === 'collection' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSource('collection')}
          >
            This Collection
          </Button>
          <Button
            variant={source === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSource('all')}
          >
            All Images
          </Button>
        </div>

        {/* Image Grid */}
        <div className="flex-1 overflow-y-auto min-h-[200px] -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
              <span className="text-sm">
                {source === 'collection'
                  ? 'No images in this collection yet'
                  : 'No images in your library'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((image) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImage(image.uri)}
                  className={cn(
                    "relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:opacity-90",
                    selectedImage === image.uri
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent hover:border-muted-foreground/25"
                  )}
                >
                  <img
                    src={image.thumbnailUri || image.uri}
                    alt={image.placeName}
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === image.uri && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="bg-primary rounded-full p-1">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <span className="text-xs text-white truncate block">
                      {image.placeName}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {selectedImage ? '1 image selected' : 'Select an image'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSelectExisting}
                disabled={isUploading || !selectedImage}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting...
                  </>
                ) : (
                  'Set as Cover'
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
