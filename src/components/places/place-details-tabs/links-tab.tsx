"use client"

import { useState } from "react"
import { ExternalLink, Plus, X, Link as LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PlaceWithRelations } from "@/types/database"

interface LinksTabProps {
  place: PlaceWithRelations
  onUpdate?: () => Promise<void>
}

export function LinksTab({ place }: LinksTabProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [url, setUrl] = useState("")
  const [type, setType] = useState<string>("website")
  const [platform, setPlatform] = useState<string>("")
  const [saving, setSaving] = useState(false)

  const handleAddLink = async () => {
    if (!url.trim()) return

    setSaving(true)

    try {
      const response = await fetch(`/api/places/${place.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, type, platform: platform || undefined }),
      })

      if (!response.ok) {
        throw new Error("Failed to add link")
      }

      setUrl("")
      setType("website")
      setPlatform("")
      setShowAddForm(false)
      window.location.reload()
    } catch (error) {
      alert("Failed to add link")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (linkId: string) => {
    if (!confirm("Delete this link?")) return

    try {
      const response = await fetch(
        `/api/places/${place.id}/links/${linkId}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        throw new Error("Failed to delete link")
      }

      window.location.reload()
    } catch (error) {
      alert("Failed to delete link")
    }
  }

  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    } catch {
      return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Saved Links</h3>
        <Button
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
          variant={showAddForm ? "outline" : "default"}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Link
        </Button>
      </div>

      {showAddForm && (
        <Card className="p-4 space-y-4">
          <div>
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="social">Social Media</SelectItem>
                  <SelectItem value="booking">Booking</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="article">Article</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="platform">Platform (optional)</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="platform">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="google_maps">Google Maps</SelectItem>
                  <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                  <SelectItem value="blog">Blog</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAddLink} disabled={saving || !url.trim()}>
              {saving ? "Adding..." : "Add Link"}
            </Button>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {place.links.length === 0 && !showAddForm && (
        <div className="text-center py-8 text-muted-foreground">
          <LinkIcon className="mx-auto h-12 w-12 mb-2 opacity-30" />
          <p>No links saved yet</p>
        </div>
      )}

      {place.links.length > 0 && (
        <div className="space-y-2">
          {place.links.map((link) => (
            <Card key={link.id} className="p-3">
              <div className="flex items-center gap-3">
                {getFavicon(link.url) && (
                  <img
                    src={getFavicon(link.url) || ""}
                    alt=""
                    className="w-6 h-6 flex-shrink-0"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm font-medium
                      hover:text-blue-600 transition-colors"
                  >
                    {link.title || link.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <p className="text-xs text-muted-foreground truncate">
                    {link.url}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {link.type && (
                    <Badge variant="outline" className="text-xs">
                      {link.type}
                    </Badge>
                  )}
                  {link.platform && (
                    <Badge variant="secondary" className="text-xs">
                      {link.platform}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-600"
                    onClick={() => handleDelete(link.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
