"use client"

import { useState } from "react"
import { TagInput as EmblorTagInput } from "emblor"
import { cn } from "@/lib/utils"

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  variant?: 'default' | 'purple' | 'blue' | 'orange' | 'green'
}

export function TagInput({
  value,
  onChange,
  placeholder = "Add tags...",
  variant = 'default',
}: TagInputProps) {
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)

  const handleChange = (newTags: string[]) => {
    // Normalize and deduplicate
    const normalized = newTags
      .map(tag => tag.trim())
      .filter((tag, index, arr) =>
        tag.length > 0 && arr.findIndex(t => t.toLowerCase() === tag.toLowerCase()) === index
      )
    onChange(normalized)
  }

  const variantClasses = {
    default: "border-gray-300",
    purple: "border-purple-300",
    blue: "border-blue-300",
    orange: "border-orange-300",
    green: "border-green-300",
  }

  return (
    <EmblorTagInput
      tags={value.map(tag => ({ id: tag, text: tag }))}
      setTags={(newTags) => {
        const tags = typeof newTags === 'function' ? newTags(value.map(tag => ({ id: tag, text: tag }))) : newTags
        handleChange(tags.map(t => t.text))
      }}
      activeTagIndex={activeTagIndex}
      setActiveTagIndex={setActiveTagIndex}
      placeholder={placeholder}
      className={cn("w-full", variantClasses[variant])}
      enableAutocomplete={false}
      restrictTagsToAutocompleteOptions={false}
      inlineTags={false}
      inputProps={{
        className: "rounded-md",
      }}
    />
  )
}
