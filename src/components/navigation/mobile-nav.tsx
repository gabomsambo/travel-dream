"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { Button } from "@/components/adapters/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/adapters/sheet"
import { 
  Inbox, 
  GitPullRequest,
  Library, 
  FolderOpen, 
  Settings,
  Download,
  Map
} from "lucide-react"

const navigation = {
  main: [
    { name: 'Inbox', href: '/inbox', icon: Inbox, shortcut: 'I' },
    { name: 'Review', href: '/review', icon: GitPullRequest, shortcut: 'R' },
    { name: 'Library', href: '/library', icon: Library, shortcut: 'L' },
    { name: 'Collections', href: '/collections', icon: FolderOpen, shortcut: 'C' },
    { name: 'Map', href: '/map', icon: Map, shortcut: 'M' },
  ],
  secondary: [
    { name: 'Settings', href: '/settings', icon: Settings },
    { name: 'Export', href: '/export', icon: Download },
  ]
}

export function MobileNav() {
  const pathname = usePathname()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <SheetHeader>
          <SheetTitle>Travel Dreams</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col space-y-1 mt-6">
          {navigation.main.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  size="sm"
                >
                  <item.icon className="mr-3 h-4 w-4" />
                  {item.name}
                  <kbd className="ml-auto text-xs opacity-50">
                    ⌘{item.shortcut}
                  </kbd>
                </Button>
              </Link>
            )
          })}
          
          <div className="my-4 border-t" />
          
          {navigation.secondary.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  size="sm"
                >
                  <item.icon className="mr-3 h-4 w-4" />
                  {item.name}
                </Button>
              </Link>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
