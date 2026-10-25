import { cache } from 'react';
import { loadExplore } from './queries';

/** Per-request memo, so a page and anything else it renders share one pair of queries. */
export const loadExploreCached = cache(loadExplore);
