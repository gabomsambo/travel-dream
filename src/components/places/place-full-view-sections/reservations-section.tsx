"use client"

import { useState } from "react"
import { Calendar, Plus, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/adapters/button"
import { Input } from "@/components/adapters/input"
import { Label } from "@/components/adapters/label"
import { Textarea } from "@/components/adapters/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/adapters/card"
import { Badge } from "@/components/adapters/badge"
import type { PlaceWithRelations } from "@/types/database"

interface ReservationsSectionProps {
  place: PlaceWithRelations
}

export function ReservationsSection({ place }: ReservationsSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    reservationDate: "",
    reservationTime: "",
    confirmationNumber: "",
    bookingPlatform: "",
    status: "confirmed",
    notes: "",
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const handleSave = async () => {
    try {
      const url = editingId
        ? `/api/places/${place.id}/reservations/${editingId}`
        : `/api/places/${place.id}/reservations`

      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) throw new Error("Failed to save")

      window.location.reload()
    } catch (error) {
      alert("Failed to save reservation")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this reservation?")) return

    try {
      const response = await fetch(`/api/places/${place.id}/reservations/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to delete")

      window.location.reload()
    } catch (error) {
      alert("Failed to delete reservation")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>📅 Reservations</CardTitle>
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? "outline" : "default"}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Reservation
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <Card className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reservationDate">Date</Label>
                <Input
                  id="reservationDate"
                  type="date"
                  value={formData.reservationDate}
                  onChange={(e) =>
                    setFormData({ ...formData, reservationDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="reservationTime">Time</Label>
                <Input
                  id="reservationTime"
                  type="time"
                  value={formData.reservationTime}
                  onChange={(e) =>
                    setFormData({ ...formData, reservationTime: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="confirmationNumber">Confirmation Number</Label>
                <Input
                  id="confirmationNumber"
                  value={formData.confirmationNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmationNumber: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="bookingPlatform">Booking Platform</Label>
                <Input
                  id="bookingPlatform"
                  value={formData.bookingPlatform}
                  onChange={(e) =>
                    setFormData({ ...formData, bookingPlatform: e.target.value })
                  }
                  placeholder="OpenTable, Resy, Airbnb, etc."
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave}>Save</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false)
                  setEditingId(null)
                  setFormData({
                    reservationDate: "",
                    reservationTime: "",
                    confirmationNumber: "",
                    bookingPlatform: "",
                    status: "confirmed",
                    notes: "",
                  })
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {place.reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reservations yet</p>
        ) : (
          <div className="space-y-2">
            {place.reservations.map((reservation) => (
              <Card key={reservation.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {formatDate(reservation.reservationDate)}
                      </span>
                      {reservation.reservationTime && (
                        <span className="text-sm text-muted-foreground">
                          at {reservation.reservationTime}
                        </span>
                      )}
                    </div>

                    {reservation.bookingPlatform && (
                      <div className="text-sm">
                        <Badge variant="outline">{reservation.bookingPlatform}</Badge>
                      </div>
                    )}

                    {reservation.confirmationNumber && (
                      <div className="text-sm text-muted-foreground">
                        Confirmation: {reservation.confirmationNumber}
                      </div>
                    )}

                    {reservation.notes && (
                      <div className="text-sm">{reservation.notes}</div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(reservation.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
