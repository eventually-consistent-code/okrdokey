CREATE TABLE `digest_schedules` (
	`team_id` text PRIMARY KEY NOT NULL,
	`cron_expr` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_due_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`recipient_count` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`delivered_at` integer,
	`delivery_failed_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `reminders` ADD `email_enabled` integer DEFAULT false NOT NULL;