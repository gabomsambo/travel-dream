"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Check, X, AlertTriangle, Loader2, MapPin, Calendar, Star, Merge } from "lucide-react"
import { toast } from "sonner"
import type { Place } from '@/types/database'
import type { DuplicateMatch } from '@/lib/duplicate-detection'

interface ReviewClientProps {
  initialPlaces: Place[]
}

interface DuplicateCluster {
  cluster_id: string
  places: Place[]
  avgConfidence: number
}

interface DuplicatePair {
  originalPlace: Place
  duplicate: DuplicateMatch
  id: string
}

export function ReviewClient({ initialPlaces }: ReviewClientProps) {
  const [duplicateClusters, setDuplicateClusters] = useState<DuplicateCluster[]>([])
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicatePair[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedPairs, setProcessedPairs] = useState(new Set<string>())

  // Transform clusters into reviewable pairs
  const reviewablePairs = useMemo(() => {
    const pairs: DuplicatePair[] = []

    duplicateClusters.forEach(cluster => {
      // Create pairs from clusters (first place vs others)
      if (cluster.places.length >= 2) {
        const [primary, ...others] = cluster.places
        others.forEach(place => {
          const pairId = `${primary.id}_${place.id}`
          if (!processedPairs.has(pairId)) {
            pairs.push({
              id: pairId,
              originalPlace: primary,
              duplicate: {
                place,
                confidence: cluster.avgConfidence,
                factors: {
                  nameScore: 0, // Would be calculated by API
                  locationScore: 0,
                  kindMatch: primary.kind === place.kind,
                  cityMatch: primary.city === place.city,
                  countryMatch: primary.country === place.country
                },
                reasoning: [`Part of cluster with ${cluster.avgConfidence.toFixed(1)}% confidence`]
              }
            })
          }
        })
      }
    })

    // Add individual duplicate pairs
    duplicatePairs.forEach(pair => {
      if (!processedPairs.has(pair.id)) {
        pairs.push(pair)
      }
    })

    return pairs.sort((a, b) => b.duplicate.confidence - a.duplicate.confidence)
  }, [duplicateClusters, duplicatePairs, processedPairs])

  // Fetch duplicates from API
  const fetchDuplicates = useCallback(async () => {
    if (initialPlaces.length === 0) {
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)

      // Fetch cluster data (groups of similar places)
      const clusterResponse = await fetch(
        `/api/places/duplicates?mode=clusters&status=inbox&minConfidence=0.7&limit=100`
      )

      if (!clusterResponse.ok) {
        throw new Error('Failed to fetch duplicate clusters')
      }

      const clusterData = await clusterResponse.json()
      if (clusterData.status === 'success') {
        setDuplicateClusters(clusterData.clusters || [])
      }

      // If we have places but no clusters, try batch detection for pairs
      if ((!clusterData.clusters || clusterData.clusters.length === 0) && initialPlaces.length > 0) {
        const batchResponse = await fetch(
          `/api/places/duplicates?mode=batch&status=inbox&minConfidence=0.6&limit=50`
        )

        if (batchResponse.ok) {
          const batchData = await batchResponse.json()
          if (batchData.status === 'success' && batchData.results) {
            const pairs: DuplicatePair[] = []

            Object.entries(batchData.results).forEach(([placeId, result]: [string, any]) => {
              result.duplicates?.forEach((duplicate: DuplicateMatch) => {
                const pairId = `${placeId}_${duplicate.place.id}`
                pairs.push({
                  id: pairId,
                  originalPlace: result.place,
                  duplicate
                })
              })
            })

            setDuplicatePairs(pairs)
          }
        }
      }

    } catch (error) {
      console.error('Error fetching duplicates:', error)
      toast.error('Failed to load duplicate detection results')
    } finally {
      setIsLoading(false)
    }
  }, [initialPlaces])

  // Merge two places
  const handleMergePlaces = useCallback(async (sourceId: string, targetId: string, pairId: string) => {
    setIsProcessing(true)

    try {
      const response = await fetch('/api/places/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId })
      })

      if (!response.ok) {
        throw new Error('Failed to merge places')
      }

      const result = await response.json()
      toast.success(`Successfully merged "${result.mergedPlace.name}"`)

      // Mark pair as processed
      setProcessedPairs(prev => new Set([...prev, pairId]))

    } catch (error) {
      console.error('Error merging places:', error)
      toast.error('Failed to merge places')
    } finally {
      setIsProcessing(false)
    }
  }, [])

  // Skip a duplicate pair
  const handleSkipPair = useCallback((pairId: string) => {
    setProcessedPairs(prev => new Set([...prev, pairId]))
    toast.info('Pair skipped')
  }, [])

  // Keep places separate (mark as not duplicates)
  const handleKeepSeparate = useCallback(async (pairId: string) => {
    // In a real implementation, this would mark the pair as "not duplicates"
    // to prevent them from appearing in future duplicate detection
    setProcessedPairs(prev => new Set([...prev, pairId]))
    toast.info('Marked as separate places')
  }, [])

  useEffect(() => {
    fetchDuplicates()
  }, [fetchDuplicates])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Detecting duplicates...</span>
      </div>
    )
  }

  if (reviewablePairs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-3 mb-4">
          <Check className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-muted-foreground mb-1">
          No duplicates to review
        </h3>
        <p className="text-sm text-muted-foreground">
          {initialPlaces.length === 0
            ? 'No places in inbox to check for duplicates'
            : 'All places have been reviewed or no duplicates were found'
          }
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge variant="secondary">
            {reviewablePairs.length} pairs to review
          </Badge>
          <Badge variant="outline">
            {reviewablePairs.filter(p => p.duplicate.confidence > 0.8).length} high confidence
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const highConfidencePairs = reviewablePairs.filter(p => p.duplicate.confidence > 0.8)
              highConfidencePairs.forEach(pair => {
                handleMergePlaces(pair.duplicate.place.id, pair.originalPlace.id, pair.id)
              })
            }}
            disabled={isProcessing}
          >
            <Check className="mr-2 h-4 w-4" />
            Merge All High Confidence
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reviewablePairs.forEach(pair => handleSkipPair(pair.id))
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Skip All
          </Button>
        </div>
      </div>

      {/* Duplicate Pairs */}
      <div className="space-y-4">
        {reviewablePairs.map((pair) => (
          <DuplicatePairCard
            key={pair.id}
            pair={pair}
            onMerge={(sourceId, targetId) => handleMergePlaces(sourceId, targetId, pair.id)}
            onSkip={() => handleSkipPair(pair.id)}
            onKeepSeparate={() => handleKeepSeparate(pair.id)}
            isProcessing={isProcessing}
          />
        ))}
      </div>
    </div>
  )
}

interface DuplicatePairCardProps {
  pair: DuplicatePair
  onMerge: (sourceId: string, targetId: string) => void
  onSkip: () => void
  onKeepSeparate: () => void
  isProcessing: boolean
}

function DuplicatePairCard({ pair, onMerge, onSkip, onKeepSeparate, isProcessing }: DuplicatePairCardProps) {
  const { originalPlace, duplicate } = pair
  const confidence = duplicate.confidence

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <span className="font-medium">Potential Duplicate</span>
          <Badge variant={confidence > 0.8 ? "default" : "secondary"}>
            {Math.round(confidence * 100)}% match
          </Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 items-start">
        {/* Original Place */}
        <PlaceComparisonCard place={originalPlace} label="Original" />

        {/* Arrow */}
        <div className="flex justify-center items-center">
          <div className="flex flex-col items-center gap-2">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
            <div className="text-xs text-center text-muted-foreground">
              <div>Similar</div>
              <div className="font-medium">{Math.round(confidence * 100)}%</div>
            </div>
          </div>
        </div>

        {/* Duplicate Place */}
        <PlaceComparisonCard place={duplicate.place} label="Potential Duplicate" />
      </div>

      {/* Detailed Comparison */}
      <div className="mt-4 p-3 bg-muted/30 rounded-lg">
        <div className="text-sm space-y-1">
          <div className="font-medium text-muted-foreground">Match Factors:</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className={`flex items-center gap-1 ${duplicate.factors.kindMatch ? 'text-green-600' : 'text-red-500'}`}>
              {duplicate.factors.kindMatch ? '✓' : '✗'} Kind Match
            </div>
            <div className={`flex items-center gap-1 ${duplicate.factors.cityMatch ? 'text-green-600' : 'text-red-500'}`}>
              {duplicate.factors.cityMatch ? '✓' : '✗'} Same City
            </div>
            <div className={`flex items-center gap-1 ${duplicate.factors.countryMatch ? 'text-green-600' : 'text-red-500'}`}>
              {duplicate.factors.countryMatch ? '✓' : '✗'} Same Country
            </div>
            <div className="text-muted-foreground">
              Name: {Math.round(duplicate.factors.nameScore * 100)}%
            </div>
            <div className="text-muted-foreground">
              Location: {Math.round(duplicate.factors.locationScore * 100)}%
            </div>
          </div>
          {duplicate.reasoning && duplicate.reasoning.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <strong>Reasoning:</strong> {duplicate.reasoning.join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-2 mt-6">
        <Button
          variant="default"
          size="sm"
          onClick={() => onMerge(duplicate.place.id, originalPlace.id)}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Merge className="mr-2 h-4 w-4" />
          )}
          Merge Places
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onKeepSeparate}
          disabled={isProcessing}
        >
          Keep Separate
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={isProcessing}
        >
          <X className="mr-2 h-4 w-4" />
          Skip
        </Button>
      </div>
    </Card>
  )
}

interface PlaceComparisonCardProps {
  place: Place
  label: string
}

function PlaceComparisonCard({ place, label }: PlaceComparisonCardProps) {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            {label}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {Math.round((place.confidence || 0) * 100)}% confident
          </Badge>
        </div>

        <div>
          <h4 className="font-medium text-base leading-tight">{place.name}</h4>
          <p className="text-sm text-muted-foreground capitalize">{place.kind}</p>
        </div>

        <div className="space-y-2 text-sm">
          {place.city && place.country && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{place.city}, {place.country}</span>
            </div>
          )}

          {place.createdAt && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{new Date(place.createdAt).toLocaleDateString()}</span>
            </div>
          )}

          {place.ratingSelf && place.ratingSelf > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Star className="h-3 w-3" />
              <span>{place.ratingSelf}/5</span>
            </div>
          )}
        </div>

        {place.tags && place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {place.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{place.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {place.notes && (
          <div className="text-xs text-muted-foreground line-clamp-2">
            <strong>Notes:</strong> {place.notes}
          </div>
        )}
      </div>
    </Card>
  )
}