"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CoordinateInputProps {
  value: { lat: number; lon: number } | null
  onChange: (coords: { lat: number; lon: number } | null) => void
}

export function CoordinateInput({ value, onChange }: CoordinateInputProps) {
  const handleLatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value

    // Allow empty string to clear the field
    if (inputValue === '') {
      onChange(null)
      return
    }

    const lat = parseFloat(inputValue)
    if (!isNaN(lat)) {
      onChange({
        lat,
        lon: value?.lon || 0
      })
    }
  }

  const handleLonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value

    // Allow empty string to clear the field
    if (inputValue === '') {
      onChange(null)
      return
    }

    const lon = parseFloat(inputValue)
    if (!isNaN(lon)) {
      onChange({
        lat: value?.lat || 0,
        lon
      })
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label htmlFor="lat">Latitude</Label>
        <Input
          id="lat"
          type="number"
          step="0.000001"
          value={value?.lat ?? ''}
          onChange={handleLatChange}
          placeholder="37.7749"
        />
      </div>
      <div>
        <Label htmlFor="lon">Longitude</Label>
        <Input
          id="lon"
          type="number"
          step="0.000001"
          value={value?.lon ?? ''}
          onChange={handleLonChange}
          placeholder="-122.4194"
        />
      </div>
    </div>
  )
}
