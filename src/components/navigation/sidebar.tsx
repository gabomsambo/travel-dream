"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Button } from "@/components/adapters/button"
import { Separator } from "@/components/adapters/separator"
import {
  Inbox,
  Library,
  Archive,
  FolderOpen,
  Settings,
  Download,
  Map,
  Copy,
  CloudUpload,
  Compass
} from "lucide-react"

const navigation = {
  main: [
    { name: 'Inbox', href: '/inbox', icon: Inbox, shortcut: 'I' },
    { name: 'Mass Upload', href: '/mass-upload', icon: CloudUpload, shortcut: 'U' },
    { name: 'Duplicates', href: '/duplicates', icon: Copy, shortcut: 'D' },
    { name: 'Explore', href: '/explore', icon: Compass, shortcut: 'E' },
    { name: 'Library', href: '/library', icon: Library, shortcut: 'L' },
    { name: 'Archive', href: '/archive', icon: Archive, shortcut: '⇧A' },
    { name: 'Collections', href: '/collections', icon: FolderOpen, shortcut: 'C' },
    { name: 'Map', href: '/map', icon: Map, shortcut: 'M' },
  ],
  secondary: [
    { name: 'Settings', href: '/settings', icon: Settings },
    { name: 'Export', href: '/export', icon: Download },
  ]
}

function useToReviewCount(): number {
  const [count, setCount] = useState(0)
  const desktop = useMediaQuery('(min-width: 768px)', false)

  useEffect(() => {
    if (!desktop) return
    let cancelled = false
    const load = () => {
      fetch('/api/places/duplicates?mode=clusters&minConfidence=0.7&limit=1000&includeReasoning=false')
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { summary?: { totalClusters?: number } } | null) => {
          if (cancelled || !data) return
          const next = data.summary?.totalClusters
          setCount(typeof next === 'number' ? next : 0)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener('td:duplicates-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('td:duplicates-changed', load)
    }
  }, [desktop])

  return count
}

export function Sidebar() {
  const pathname = usePathname()
  const toReviewCount = useToReviewCount()

  return (
    <div className="flex h-full w-64 flex-col bg-background border-r">
      <div className="flex h-16 items-center px-6">
        <h1 className="text-lg font-semibold">Tabi Dreams</h1>
      </div>
      
      <nav className="flex-1 space-y-1 px-3">
        {navigation.main.map((item) => {
          const isActive = pathname === item.href || (item.href === '/explore' && pathname.startsWith('/explore/'))
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className="w-full justify-start"
                size="sm"
              >
                <item.icon className="mr-3 h-4 w-4" />
                {item.name}
                {item.href === '/duplicates' && toReviewCount > 0 && (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                    {toReviewCount}
                  </span>
                )}
                <kbd className="ml-auto hidden text-xs opacity-50 sm:inline-block">
                  ⌘{item.shortcut}
                </kbd>
              </Button>
            </Link>
          )
        })}
        
        <Separator className="my-4" />
        
        {navigation.secondary.map((item) => {
          const isActive = pathname === item.href || (item.href === '/explore' && pathname.startsWith('/explore/'))
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
