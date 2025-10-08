"use client"

import { useState } from "react"
import { ExternalLink, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { PlaceWithRelations } from "@/types/database"

interface LinksSectionProps {
  place: PlaceWithRelations
}

export function LinksSection({ place }: LinksSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)

  const handleAddLink = async () => {
    if (!url.trim()) return

    setSaving(true)

    try {
      const response = await fetch(`/api/places/${place.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, type: "website" }),
      })

      if (!response.ok) throw new Error("Failed to add link")

      setUrl("")
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
      const response = await fetch(`/api/places/${place.id}/links/${linkId}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to delete link")

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
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>🔗 Links</CardTitle>
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? "outline" : "default"}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Link
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <div className="flex gap-2">
              <Button onClick={handleAddLink} disabled={saving}>
                {saving ? "Adding..." : "Add"}
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {place.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No links yet</p>
        ) : (
          <div className="space-y-2">
            {place.links.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFavicon(link.url) && (
                    <img
                      src={getFavicon(link.url)!}
                      alt="favicon"
                      className="w-4 h-4 flex-shrink-0"
                    />
                  )}
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline truncate flex-1"
                  >
                    {link.url}
                  </a>
                  <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(link.id)}
                  className="ml-2"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
