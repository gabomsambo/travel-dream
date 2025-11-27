'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DuplicateMatchReasoningProps {
  reasoning: string[];
  className?: string;
}

export function DuplicateMatchReasoning({ reasoning, className }: DuplicateMatchReasoningProps) {
  if (!reasoning || reasoning.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-1', className)}>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Why matched
      </h4>
      <ul className="space-y-1">
        {reasoning.map((reason, idx) => {
          const isLowSimilarity = reason.toLowerCase().includes('low similarity');
          const Icon = isLowSimilarity ? AlertCircle : CheckCircle2;
          const iconColor = isLowSimilarity ? 'text-amber-500' : 'text-green-500';

          return (
            <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', iconColor)} />
              <span>{reason}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
