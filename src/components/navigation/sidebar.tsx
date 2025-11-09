"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/adapters/button"
import { Separator } from "@/components/adapters/separator"
import {
  Inbox,
  GitPullRequest,
  Library,
  FolderOpen,
  Settings,
  Download,
  Map,
  Copy
} from "lucide-react"

const navigation = {
  main: [
    { name: 'Inbox', href: '/inbox', icon: Inbox, shortcut: 'I' },
    { name: 'Review', href: '/review', icon: GitPullRequest, shortcut: 'R' },
    { name: 'Duplicates', href: '/duplicates', icon: Copy, shortcut: 'D' },
    { name: 'Library', href: '/library', icon: Library, shortcut: 'L' },
    { name: 'Collections', href: '/collections', icon: FolderOpen, shortcut: 'C' },
    { name: 'Map', href: '/map', icon: Map, shortcut: 'M' },
  ],
  secondary: [
    { name: 'Settings', href: '/settings', icon: Settings },
    { name: 'Export', href: '/export', icon: Download },
  ]
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col bg-background border-r">
      <div className="flex h-16 items-center px-6">
        <h1 className="text-lg font-semibold">Travel Dreams</h1>
      </div>
      
      <nav className="flex-1 space-y-1 px-3">
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
                <kbd className="ml-auto hidden text-xs opacity-50 sm:inline-block">
                  ⌘{item.shortcut}
                </kbd>
              </Button>
            </Link>
          )
        })}
        
        <Separator className="my-4" />
        
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
    </div>
  )
}
