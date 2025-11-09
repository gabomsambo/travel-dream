"use client"

import { MapPin, Globe, CheckCircle, Calendar } from "lucide-react"
import { Card, CardContent } from "@/components/adapters/card"
import { cn } from "@/lib/utils"

export interface LibraryStatsCardsProps {
  stats: {
    total: number
    countries: number
    visited: number
    planned: number
  }
  className?: string
}

export function LibraryStatsCards({
  stats,
  className
}: LibraryStatsCardsProps) {
  const cards = [
    {
      label: "Total Places",
      value: stats.total,
      icon: MapPin,
      color: "text-blue-600"
    },
    {
      label: "Countries",
      value: stats.countries,
      icon: Globe,
      color: "text-green-600"
    },
    {
      label: "Visited",
      value: stats.visited,
      icon: CheckCircle,
      color: "text-purple-600"
    },
    {
      label: "Planned",
      value: stats.planned,
      icon: Calendar,
      color: "text-orange-600"
    }
  ]

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 md:grid-cols-4",
        className
      )}
    >
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn("rounded-lg bg-muted p-2", card.color)}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
