"use client"

import { useState } from "react"
import { Upload, Plus } from "lucide-react"
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { MobileNav } from "@/components/navigation/mobile-nav"
import { SearchBar } from "@/components/search/search-bar"
import { UploadDialog } from "@/components/upload/upload-dialog"
import { AddPlaceDialog } from "@/components/places/add-place-dialog"

export function Header() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [addPlaceDialogOpen, setAddPlaceDialogOpen] = useState(false)
  const [uploadCount, setUploadCount] = useState(0)

  const handleSearch = (filters: any) => {
    console.log('Search filters:', filters)
    // TODO: Implement global search functionality
  }

  const handleUploadComplete = (session: any) => {
    console.log('Upload session completed:', session)
    setUploadCount(prev => prev + (session?.completedCount || 0))
    // TODO: Refresh inbox or show notification
  }

  return (
    <header className="flex h-16 items-center gap-2 sm:gap-4 border-b bg-background px-3 sm:px-6">
      <MobileNav />
      
      <div className="flex flex-1 items-center gap-4">
        <SearchBar 
          onSearch={handleSearch}
          showFilters={false}
          placeholder="Search places, cities, tags... (⌘K for advanced)"
        />
        
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-2 px-2 sm:px-3"
            onClick={() => setAddPlaceDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Place</span>
          </Button>

          <Button
            size="sm"
            className="gap-2 px-2 sm:px-3"
            onClick={() => setUploadDialogOpen(true)}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
            {uploadCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {uploadCount}
              </Badge>
            )}
          </Button>

          <ThemeToggle />
        </div>
      </div>

      <AddPlaceDialog
        open={addPlaceDialogOpen}
        onOpenChange={setAddPlaceDialogOpen}
      />

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onComplete={handleUploadComplete}
      />
    </header>
  )
}
