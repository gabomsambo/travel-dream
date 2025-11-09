"use client"

import { useState } from 'react'
import { Search, Filter } from 'lucide-react'
import { Input } from "@/components/adapters/input"
import { Button } from "@/components/adapters/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/adapters/select"
import { PLACE_KINDS } from '@/types/database'

interface SearchFilters {
  query: string
  kind: string
  city: string
  country: string
  tags: string[]
}

interface SearchBarProps {
  onSearch?: (filters: SearchFilters) => void
  placeholder?: string
  showFilters?: boolean
}

export function SearchBar({ 
  onSearch,
  placeholder = "Search places, cities, tags...",
  showFilters = true 
}: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [city, setCity] = useState('all')
  const [country, setCountry] = useState('all')

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery)
    onSearch?.({
      query: newQuery,
      kind,
      city,
      country,
      tags: [] // TODO: implement tag filtering
    })
  }

  const handleFilterChange = (filterType: string, value: string) => {
    switch (filterType) {
      case 'kind':
        setKind(value)
        break
      case 'city':
        setCity(value)
        break
      case 'country':
        setCountry(value)
        break
    }
    
    onSearch?.({
      query,
      kind: filterType === 'kind' ? value : kind,
      city: filterType === 'city' ? value : city,
      country: filterType === 'country' ? value : country,
      tags: []
    })
  }

  return (
    <div className="flex items-center gap-2">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {showFilters && (
        <>
          {/* Kind Filter */}
          <Select value={kind} onValueChange={(value) => handleFilterChange('kind', value)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {PLACE_KINDS.map((k: string) => (
                <SelectItem key={k} value={k}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* City Filter */}
          <Select value={city} onValueChange={(value) => handleFilterChange('city', value)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              <SelectItem value="barcelona">Barcelona</SelectItem>
              <SelectItem value="madrid">Madrid</SelectItem>
              <SelectItem value="paris">Paris</SelectItem>
              <SelectItem value="london">London</SelectItem>
              {/* TODO: Populate from actual data */}
            </SelectContent>
          </Select>

          {/* Country Filter */}
          <Select value={country} onValueChange={(value) => handleFilterChange('country', value)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              <SelectItem value="ES">Spain</SelectItem>
              <SelectItem value="FR">France</SelectItem>
              <SelectItem value="GB">United Kingdom</SelectItem>
              <SelectItem value="IT">Italy</SelectItem>
              {/* TODO: Populate from actual data */}
            </SelectContent>
          </Select>

          {/* Advanced Filters Button */}
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  )
}
