"use client"

import { useState } from "react"
import { Upload, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { MobileNav } from "@/components/navigation/mobile-nav"
import { SearchBar } from "@/components/search/search-bar"
import { UploadDialog } from "@/components/upload/upload-dialog"

export function Header() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
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
    <header className="flex h-16 items-center gap-4 border-b bg-background px-6">
      <MobileNav />
      
      <div className="flex flex-1 items-center gap-4">
        <SearchBar 
          onSearch={handleSearch}
          showFilters={false}
          placeholder="Search places, cities, tags... (⌘K for advanced)"
        />
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setUploadDialogOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Upload Screenshots
            {uploadCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {uploadCount}
              </Badge>
            )}
          </Button>

          <ThemeToggle />
        </div>
      </div>

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onComplete={handleUploadComplete}
      />
    </header>
  )
}
