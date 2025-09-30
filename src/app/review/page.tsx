import { PageHeader } from "@/components/layout/page-header"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Check, X, AlertTriangle, Loader2, MapPin, Calendar, Star } from "lucide-react"
import { ReviewClient } from "@/components/review/review-client"
import { getPlacesByStatus } from "@/lib/db-queries"
import { Suspense } from "react"

export default async function ReviewPage() {
  // Get places that might have duplicates (status: inbox)
  const inboxPlaces = await getPlacesByStatus('inbox');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Duplicates"
        description="Review and merge potential duplicate places"
      />

      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading duplicates...</span>
        </div>
      }>
        <ReviewClient initialPlaces={inboxPlaces} />
      </Suspense>
    </div>
  )
}
