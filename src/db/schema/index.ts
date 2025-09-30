// Export all table schemas
export * from './sources-current'; // Use current schema that matches actual DB
export * from './places';
export * from './collections';
export * from './relations';

// Re-export tables for convenience
export { sourcesCurrentSchema as sources } from './sources-current';
export { places } from './places';
export { collections } from './collections';
export { sourcesToPlaces, placesToCollections } from './relations';

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
