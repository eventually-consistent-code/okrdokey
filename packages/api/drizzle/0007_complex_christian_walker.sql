CREATE TABLE `kpi_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`kpi_id` text NOT NULL,
	`value` integer NOT NULL,
	`note` text,
	`author_user_id` text,
	`source` text DEFAULT 'ui' NOT NULL,
	`api_token_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`kpi_id`) REFERENCES `kpis`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kpis` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`unit` text,
	`direction` text NOT NULL,
	`threshold_low` integer,
	`threshold_high` integer,
	`current_value` integer DEFAULT 0 NOT NULL,
	`current_health` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_kr_links` (
	`id` text PRIMARY KEY NOT NULL,
	`key_result_id` text,
	`kpi_id` text,
	`provider` text NOT NULL,
	`config` text NOT NULL,
	`mode` text NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`etag` text,
	`sync_interval_minutes` integer DEFAULT 15 NOT NULL,
	`sync_due_at` integer NOT NULL,
	`last_synced_at` integer,
	`last_error` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`key_result_id`) REFERENCES `key_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kpi_id`) REFERENCES `kpis`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "metric_links_one_subject" CHECK(("__new_kr_links"."key_result_id" IS NULL) != ("__new_kr_links"."kpi_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_kr_links`("id", "key_result_id", "kpi_id", "provider", "config", "mode", "secret_ciphertext", "etag", "sync_interval_minutes", "sync_due_at", "last_synced_at", "last_error", "consecutive_failures", "created_at") SELECT "id", "key_result_id", NULL, "provider", "config", "mode", "secret_ciphertext", "etag", "sync_interval_minutes", "sync_due_at", "last_synced_at", "last_error", "consecutive_failures", "created_at" FROM `kr_links`;--> statement-breakpoint
DROP TABLE `kr_links`;--> statement-breakpoint
ALTER TABLE `__new_kr_links` RENAME TO `kr_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `kr_links_key_result_id_unique` ON `kr_links` (`key_result_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `kr_links_kpi_id_unique` ON `kr_links` (`kpi_id`);