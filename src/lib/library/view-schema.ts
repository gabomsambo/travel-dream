import { z } from 'zod';
import { canonicalQuery } from './filters';

/** Saved views are shelves; past this many they stop being a row you can scan. */
export const MAX_SAVED_VIEWS = 50;

export const SavedViewName = z.string().trim().min(1, 'Name the view').max(60, 'Keep the name under 60 characters');

/** The Library's own query string, stored in its canonical spelling (unknown keys dropped). */
export const SavedViewQuery = z.string().max(2000).transform((q) => canonicalQuery(q));
