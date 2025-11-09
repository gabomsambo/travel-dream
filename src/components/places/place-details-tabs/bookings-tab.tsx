"use client"

import { Calendar, Clock, Phone, Mail, Globe, ExternalLink } from "lucide-react"
import { Badge } from "@/components/adapters/badge"
import { Card } from "@/components/adapters/card"
import { Separator } from "@/components/adapters/separator"
import type { PlaceWithRelations } from "@/types/database"

interface BookingsTabProps {
  place: PlaceWithRelations
  onUpdate?: () => Promise<void>
}

export function BookingsTab({ place }: BookingsTabProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "confirmed":
        return "default"
      case "pending":
        return "secondary"
      case "cancelled":
        return "destructive"
      case "completed":
        return "outline"
      default:
        return "outline"
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const formatHours = (
    hours: Record<string, string> | null | undefined
  ): string => {
    if (!hours) return "Not available"
    const entries = Object.entries(hours)
    if (entries.length === 0) return "Not available"
    return entries.map(([day, time]) => `${day}: ${time}`).join(", ")
  }

  return (
    <div className="space-y-6">
      {place.reservations.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Reservations</h3>
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
                        <>
                          <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                          <span>{reservation.reservationTime}</span>
                        </>
                      )}
                    </div>

                    {reservation.confirmationNumber && (
                      <div className="text-sm text-muted-foreground">
                        Confirmation: {reservation.confirmationNumber}
                      </div>
                    )}

                    {reservation.partySize && (
                      <div className="text-sm text-muted-foreground">
                        Party size: {reservation.partySize}
                      </div>
                    )}

                    {reservation.bookingPlatform && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Via: </span>
                        {reservation.bookingUrl ? (
                          <a
                            href={reservation.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex
                              items-center gap-1"
                          >
                            {reservation.bookingPlatform}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span>{reservation.bookingPlatform}</span>
                        )}
                      </div>
                    )}

                    {reservation.specialRequests && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">
                          Special requests:{" "}
                        </span>
                        {reservation.specialRequests}
                      </div>
                    )}

                    {reservation.totalCost && (
                      <div className="text-sm font-medium">
                        Total: {reservation.totalCost}
                      </div>
                    )}

                    {reservation.notes && (
                      <div className="text-sm text-muted-foreground">
                        {reservation.notes}
                      </div>
                    )}
                  </div>

                  <Badge variant={getStatusVariant(reservation.status)}>
                    {reservation.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {place.reservations.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <Calendar className="mx-auto h-12 w-12 mb-2 opacity-30" />
          <p>No reservations yet</p>
        </div>
      )}

      <Separator />

      <div>
        <h3 className="font-semibold mb-3">Contact Information</h3>
        <div className="space-y-3">
          {place.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a
                href={`tel:${place.phone}`}
                className="text-blue-600 hover:underline"
              >
                {place.phone}
              </a>
            </div>
          )}

          {place.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${place.email}`}
                className="text-blue-600 hover:underline"
              >
                {place.email}
              </a>
            </div>
          )}

          {place.website && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <a
                href={place.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                {place.website}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {place.hours && (
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <div className="font-medium mb-1">Hours</div>
                <div className="text-muted-foreground">
                  {formatHours(place.hours)}
                </div>
              </div>
            </div>
          )}

          {!place.phone && !place.email && !place.website && !place.hours && (
            <p className="text-sm text-muted-foreground">
              No contact information available
            </p>
          )}
        </div>
      </div>

      {place.practicalInfo && (
        <>
          <Separator />
          <div>
            <h3 className="font-semibold mb-3">Practical Information</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {place.practicalInfo}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
