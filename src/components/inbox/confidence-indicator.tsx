"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const confidenceBarVariants = cva(
  "relative h-2 w-full overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        sm: "h-1.5",
        default: "h-2",
        lg: "h-3",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const confidenceFillVariants = cva(
  "h-full transition-all duration-300 ease-in-out",
  {
    variants: {
      level: {
        high: "bg-green-500",     // 90%+
        medium: "bg-orange-500", // 80-89%
        low: "bg-yellow-500",    // 60-79%
        veryLow: "bg-red-500",   // <60%
      },
    },
    defaultVariants: {
      level: "veryLow",
    },
  }
)

const confidenceBadgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      level: {
        high: "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
        medium: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
        low: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
        veryLow: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
      },
    },
    defaultVariants: {
      level: "veryLow",
    },
  }
)

function getConfidenceLevel(confidence: number): "high" | "medium" | "low" | "veryLow" {
  if (confidence >= 0.9) return "high"
  if (confidence >= 0.8) return "medium"
  if (confidence >= 0.6) return "low"
  return "veryLow"
}

function getConfidenceLevelText(confidence: number): string {
  const level = getConfidenceLevel(confidence)
  switch (level) {
    case "high": return "High"
    case "medium": return "Medium"
    case "low": return "Low"
    case "veryLow": return "Very Low"
  }
}

interface ConfidenceSignals {
  nameExtraction?: number
  geoMatch?: number
  categoryDetection?: number
  languageConsistency?: number
  overall?: number
}

export interface ConfidenceIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof confidenceBarVariants> {
  confidence: number
  signals?: ConfidenceSignals
  showBadge?: boolean
  showTooltip?: boolean
  variant?: "bar" | "badge" | "both"
}

function ConfidenceBar({
  confidence,
  size,
  className,
  ...props
}: {
  confidence: number
  size?: VariantProps<typeof confidenceBarVariants>["size"]
  className?: string
}) {
  const level = getConfidenceLevel(confidence)
  const percentage = Math.round(confidence * 100)

  return (
    <div className={cn(confidenceBarVariants({ size }), className)} {...props}>
      <div
        className={cn(confidenceFillVariants({ level }))}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

function ConfidenceBadge({
  confidence,
  className,
  ...props
}: {
  confidence: number
  className?: string
}) {
  const level = getConfidenceLevel(confidence)
  const percentage = Math.round(confidence * 100)
  const levelText = getConfidenceLevelText(confidence)

  return (
    <div className={cn(confidenceBadgeVariants({ level }), className)} {...props}>
      {percentage}% {levelText}
    </div>
  )
}

function ConfidenceTooltipContent({
  confidence,
  signals
}: {
  confidence: number
  signals?: ConfidenceSignals
}) {
  const percentage = Math.round(confidence * 100)
  const level = getConfidenceLevelText(confidence)

  return (
    <div className="space-y-2">
      <div className="font-semibold">
        Confidence: {percentage}% ({level})
      </div>

      {signals && (
        <div className="space-y-1 text-sm">
          <div className="font-medium">Breakdown:</div>
          {signals.nameExtraction !== undefined && (
            <div className="flex justify-between">
              <span>Name extraction:</span>
              <span>{Math.round(signals.nameExtraction * 100)}%</span>
            </div>
          )}
          {signals.geoMatch !== undefined && (
            <div className="flex justify-between">
              <span>Location match:</span>
              <span>{Math.round(signals.geoMatch * 100)}%</span>
            </div>
          )}
          {signals.categoryDetection !== undefined && (
            <div className="flex justify-between">
              <span>Category detection:</span>
              <span>{Math.round(signals.categoryDetection * 100)}%</span>
            </div>
          )}
          {signals.languageConsistency !== undefined && (
            <div className="flex justify-between">
              <span>Language consistency:</span>
              <span>{Math.round(signals.languageConsistency * 100)}%</span>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-2">
        {confidence >= 0.9 && "Ready for automatic confirmation"}
        {confidence >= 0.8 && confidence < 0.9 && "Good confidence, quick review recommended"}
        {confidence >= 0.6 && confidence < 0.8 && "Moderate confidence, manual review needed"}
        {confidence < 0.6 && "Low confidence, careful review required"}
      </div>
    </div>
  )
}

export function ConfidenceIndicator({
  confidence,
  signals,
  showBadge = false,
  showTooltip = true,
  variant = "bar",
  size,
  className,
  ...props
}: ConfidenceIndicatorProps) {
  const content = (
    <div className={cn("space-y-1", className)} {...props}>
      {(variant === "bar" || variant === "both") && (
        <ConfidenceBar confidence={confidence} size={size} />
      )}
      {(variant === "badge" || variant === "both") && (
        <ConfidenceBadge confidence={confidence} />
      )}
      {showBadge && variant === "bar" && (
        <ConfidenceBadge confidence={confidence} />
      )}
    </div>
  )

  if (!showTooltip) {
    return content
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <ConfidenceTooltipContent confidence={confidence} signals={signals} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { ConfidenceBar, ConfidenceBadge, getConfidenceLevel, getConfidenceLevelText }