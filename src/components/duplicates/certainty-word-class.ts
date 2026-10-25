import type { CertaintyWord } from '@/lib/duplicate-certainty'

/** Pill colors for a certainty word. Shared by the duplicates queue and Review. */
export const CERTAINTY_WORD_CLASS: Record<CertaintyWord, string> = {
  same: 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100',
  'very-likely': 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100',
  likely: 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-100 dark:ring-emerald-800',
  maybe: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
  possible: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
  'probably-not': 'bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100',
}
