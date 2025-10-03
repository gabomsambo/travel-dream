// Export all table schemas
export * from './sources-current'; // Use current schema that matches actual DB
export * from './places';
export * from './collections';
export * from './relations';
export * from './merge-logs';
export * from './dismissed-duplicates';

// Re-export tables for convenience
export { sourcesCurrentSchema as sources } from './sources-current';
export { places } from './places';
export { collections } from './collections';
export { sourcesToPlaces, placesToCollections } from './relations';
export { mergeLogs } from './merge-logs';
export { dismissedDuplicates } from './dismissed-duplicates';

// Export all relations for Drizzle
export {
  sourcesRelations,
  placesRelations,
  collectionsRelations,
  sourcesToPlacesRelations,
  placesToCollectionsRelations,
} from './relations';

// Export upload sessions
export { uploadSessions } from './sources';
