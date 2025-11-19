"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui-v2/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui-v2/radio-group"
import { Label } from "@/components/ui-v2/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/adapters/select"
import type { ExportScope } from "@/types/export"
import type { Collection } from "@/types/database"

interface ScopeSelectorProps {
  scope: ExportScope
  onScopeChange: (scope: ExportScope) => void
  collections: Collection[]
  filterOptions: {
    kinds: string[]
    cities: string[]
    countries: string[]
    tags: string[]
    vibes: string[]
  }
}

export function ScopeSelector({
  scope,
  onScopeChange,
  collections,
  filterOptions,
}: ScopeSelectorProps) {
  const handleTypeChange = (value: string) => {
    if (value === "collection") {
      const firstCollectionId = collections[0]?.id || "__placeholder__"
      onScopeChange({
        type: "collection",
        collectionId: firstCollectionId,
      })
    } else if (value === "library") {
      onScopeChange({ type: "library" })
    } else if (value === "selected") {
      onScopeChange({ type: "selected", placeIds: [] })
    }
  }

  const handleCollectionChange = (collectionId: string) => {
    onScopeChange({ type: "collection", collectionId })
  }

  const handleFilterChange = (key: "city" | "country" | "kind", value: string) => {
    onScopeChange({
      type: "library",
      filters: {
        ...(scope.type === "library" ? scope.filters : {}),
        [key]: value === "__all__" ? undefined : value,
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export Scope</CardTitle>
        <CardDescription>
          Choose what data to include in your export
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={scope.type} onValueChange={handleTypeChange}>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="collection" id="scope-collection" />
            <Label htmlFor="scope-collection" className="font-normal cursor-pointer">
              Collection
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="library" id="scope-library" />
            <Label htmlFor="scope-library" className="font-normal cursor-pointer">
              Library
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="selected" id="scope-selected" />
            <Label htmlFor="scope-selected" className="font-normal cursor-pointer">
              Smart Selection
            </Label>
          </div>
        </RadioGroup>

        {scope.type === "collection" && (
          <div className="space-y-2">
            <Label htmlFor="collection-select">Select Collection</Label>
            <Select
              value={scope.collectionId || "__placeholder__"}
              onValueChange={handleCollectionChange}
            >
              <SelectTrigger id="collection-select">
                <SelectValue placeholder="Choose a collection" />
              </SelectTrigger>
              <SelectContent>
                {collections.length > 0 ? (
                  collections.map((collection) => (
                    <SelectItem key={collection.id} value={collection.id}>
                      {collection.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__placeholder__" disabled>
                    No collections available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {scope.type === "library" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="city-filter">Filter by City</Label>
              <Select
                value={scope.filters?.city || "__all__"}
                onValueChange={(value) => handleFilterChange("city", value)}
              >
                <SelectTrigger id="city-filter">
                  <SelectValue placeholder="All cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All cities</SelectItem>
                  {filterOptions.cities.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="country-filter">Filter by Country</Label>
              <Select
                value={scope.filters?.country || "__all__"}
                onValueChange={(value) => handleFilterChange("country", value)}
              >
                <SelectTrigger id="country-filter">
                  <SelectValue placeholder="All countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All countries</SelectItem>
                  {filterOptions.countries.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kind-filter">Filter by Type</Label>
              <Select
                value={scope.filters?.kind || "__all__"}
                onValueChange={(value) => handleFilterChange("kind", value)}
              >
                <SelectTrigger id="kind-filter">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All types</SelectItem>
                  {filterOptions.kinds.map((kind) => (
                    <SelectItem key={kind} value={kind} className="capitalize">
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {scope.type === "selected" && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Smart Selection - Coming soon
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Export places from your active selection in the library
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
