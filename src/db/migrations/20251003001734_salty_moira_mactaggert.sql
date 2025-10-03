CREATE TABLE `dismissed_duplicates` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id_1` text NOT NULL,
	`place_id_2` text NOT NULL,
	`reason` text,
	`dismissed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `merge_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`source_ids` text NOT NULL,
	`merged_data` text,
	`source_snapshots` text,
	`confidence` real NOT NULL,
	`performed_by` text DEFAULT 'user' NOT NULL,
	`performed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`undone` integer DEFAULT false NOT NULL,
	`undon_at` text
);
--> statement-breakpoint
CREATE INDEX `dismissed_duplicates_pair_idx` ON `dismissed_duplicates` (`place_id_1`,`place_id_2`);--> statement-breakpoint
CREATE INDEX `merge_logs_target_idx` ON `merge_logs` (`target_id`);--> statement-breakpoint
CREATE INDEX `merge_logs_performed_at_idx` ON `merge_logs` (`performed_at`);--> statement-breakpoint
CREATE INDEX `merge_logs_undone_idx` ON `merge_logs` (`undone`);