import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { places } from './places';

export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey().$defaultFn(() => `rsv_${crypto.randomUUID()}`),
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),

  reservationDate: text('reservation_date').notNull(), // ISO date string
  reservationTime: text('reservation_time'), // "19:30" or "7:30 PM"
  confirmationNumber: text('confirmation_number'),
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'pending' | 'cancelled' | 'completed'
  partySize: integer('party_size'),

  bookingPlatform: text('booking_platform'), // 'OpenTable', 'Resy', 'Direct', 'Airbnb', etc.
  bookingUrl: text('booking_url'),

  specialRequests: text('special_requests'),
  totalCost: text('total_cost'), // Store as string with currency: "$125.00"
  notes: text('notes'),

  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  placeIdIdx: index('reservations_place_id_idx').on(table.placeId),
  dateIdx: index('reservations_date_idx').on(table.reservationDate),
  statusIdx: index('reservations_status_idx').on(table.status),
}));

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
