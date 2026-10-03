import { cache } from 'react';
import { loadExplore } from './queries';

/** Per-request memo so the Explore layout and page share one pair of queries. */
export const loadExploreCached = cache(loadExplore);
