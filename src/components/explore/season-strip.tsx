import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/lib/explore/best-time';

// Literal classes so Tailwind can see them (the codebase avoids inline styles).
const HEIGHTS = [
  'h-[8%]',
  'h-[10%]',
  'h-[20%]',
  'h-[30%]',
  'h-[40%]',
  'h-[50%]',
  'h-[60%]',
  'h-[70%]',
  'h-[80%]',
  'h-[90%]',
  'h-full',
];

/**
 * "When to go", from the user's own saves: one bar per month, height = how
 * many unvisited places here are in season. The current month is ringed. A
 * curve of all zeros renders nothing, so the strip never sits as a sea of
 * empty bars.
 */
export function SeasonStrip({
  curve,
  currentMonth,
  tone = 'light',
}: {
  curve: number[];
  currentMonth: number;
  tone?: 'light' | 'dark';
}) {
  const max = Math.max(1, ...curve);
  if (curve.every((c) => c === 0)) return null;
  const best = curve
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c === max)
    .map((x) => MONTH_NAMES[x.i].slice(0, 3));
  return (
    <figure className="space-y-2" aria-label={`Most of your saves here are in season in ${best.join(', ')}`}>
      <div className="flex h-12 items-end gap-1">
        {curve.map((c, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={cn(
                'w-full rounded-sm transition-all',
                HEIGHTS[Math.round((c / max) * 10)],
                tone === 'dark' ? 'bg-white/70' : 'bg-primary/70',
                c === 0 && (tone === 'dark' ? 'bg-white/15' : 'bg-muted'),
                i + 1 === currentMonth && 'ring-2 ring-offset-1 ring-offset-transparent',
                i + 1 === currentMonth && (tone === 'dark' ? 'ring-white' : 'ring-foreground'),
              )}
            />
          </div>
        ))}
      </div>
      <div className={cn('flex gap-1 text-[10px] font-medium', tone === 'dark' ? 'text-white/60' : 'text-muted-foreground')}>
        {MONTH_NAMES.map((m, i) => (
          <span
            key={m}
            className={cn('flex-1 text-center', i + 1 === currentMonth && (tone === 'dark' ? 'text-white' : 'text-foreground'))}
          >
            {m[0]}
          </span>
        ))}
      </div>
      <figcaption className={cn('text-xs', tone === 'dark' ? 'text-white/70' : 'text-muted-foreground')}>
        Best months for your saves:{' '}
        <span className={tone === 'dark' ? 'text-white' : 'text-foreground'}>{best.join(', ')}</span>
      </figcaption>
    </figure>
  );
}