// Export all table schemas
export * from './auth'; // Auth.js tables
export * from './sources-current'; // Use current schema that matches actual DB
export * from './places';
export * from './collections';
export * from './relations';
export * from './merge-logs';
export * from './dismissed-duplicates';
export * from './attachments';
export * from './placeLinks';
export * from './reservations';

// Re-export tables for convenience
export { users, accounts, sessions, verificationTokens } from './auth';
export { sourcesCurrentSchema as sources } from './sources-current';
export { places } from './places';
export { collections } from './collections';
export { sourcesToPlaces, placesToCollections } from './relations';
export { mergeLogs } from './merge-logs';
export { dismissedDuplicates } from './dismissed-duplicates';
export { attachments } from './attachments';
export { placeLinks } from './placeLinks';
export { reservations } from './reservations';

// Export all relations for Drizzle
export {
  usersRelations,
  accountsRelations,
  sessionsRelations,
  sourcesRelations,
  placesRelations,
  collectionsRelations,
  sourcesToPlacesRelations,
  placesToCollectionsRelations,
  attachmentsRelations,
  placeLinksRelations,
  reservationsRelations,
} from './relations';

// Export upload sessions
export { uploadSessions } from './sources';
