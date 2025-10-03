import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DuplicateConfidenceBadgeProps {
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
}

export function DuplicateConfidenceBadge({ confidence, size = 'md' }: DuplicateConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);

  const getColorClass = () => {
    if (confidence >= 0.9) return 'bg-green-500 text-white';
    if (confidence >= 0.75) return 'bg-yellow-500 text-black';
    if (confidence >= 0.6) return 'bg-orange-500 text-white';
    return 'bg-red-500 text-white';
  };

  const sizeClass = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  }[size];

  return (
    <Badge className={cn(getColorClass(), sizeClass)}>
      {percentage}%
    </Badge>
  );
}
