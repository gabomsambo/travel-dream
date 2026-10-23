"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useSession, signOut } from "next-auth/react"
import { Upload, Plus, LogOut } from "lucide-react"
import { Button } from "@/components/adapters/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { openUploadSheet } from "@/lib/upload-sheet"
import { ActivityBell } from "@/components/activity/activity-bell"
import { MobileNav } from "@/components/navigation/mobile-nav"
import { SearchBar } from "@/components/search/search-bar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/adapters/dropdown-menu"

const AddPlaceDialog = dynamic(
  () => import("@/components/places/add-place-dialog").then(mod => ({ default: mod.AddPlaceDialog })),
  { ssr: false }
)

function UserMenu() {
  const { data: session } = useSession()

  if (!session?.user) {
    return null
  }

  const userInitials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session.user.email?.charAt(0).toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-full p-0">
          {session.user.image ? (
            <img
              src={session.user.image}
              alt={session.user.name || "User"}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {userInitials}
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {session.user.name && (
              <p className="text-sm font-medium leading-none">{session.user.name}</p>
            )}
            <p className="text-xs leading-none text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Header() {
  const [addPlaceDialogOpen, setAddPlaceDialogOpen] = useState(false)

  const handleSearch = (filters: any) => {
    console.log('Search filters:', filters)
    // TODO: Implement global search functionality
  }

  return (
    <header className="flex h-16 min-w-0 items-center gap-2 border-b bg-background px-3 sm:gap-4 sm:px-6">
      <MobileNav />

      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <SearchBar
          onSearch={handleSearch}
          showFilters={false}
          placeholder="Search places, cities, tags... (⌘K for advanced)"
        />

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
            onClick={() => openUploadSheet()}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>

          <ThemeToggle />
          <ActivityBell />
          <UserMenu />
        </div>
      </div>

      {addPlaceDialogOpen && (
        <AddPlaceDialog
          open={addPlaceDialogOpen}
          onOpenChange={setAddPlaceDialogOpen}
        />
      )}

    </header>
  )
}
