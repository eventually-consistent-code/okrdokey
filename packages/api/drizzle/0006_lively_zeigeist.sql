CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `kr_links` (
	`id` text PRIMARY KEY NOT NULL,
	`key_result_id` text NOT NULL,
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
	FOREIGN KEY (`key_result_id`) REFERENCES `key_results`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kr_links_key_result_id_unique` ON `kr_links` (`key_result_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`key_result_id` text NOT NULL,
	`value` integer NOT NULL,
	`confidence` text NOT NULL,
	`note` text,
	`author_user_id` text,
	`source` text DEFAULT 'ui' NOT NULL,
	`api_token_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`key_result_id`) REFERENCES `key_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_check_ins`("id", "key_result_id", "value", "confidence", "note", "author_user_id", "source", "api_token_id", "created_at") SELECT "id", "key_result_id", "value", "confidence", "note", "author_user_id", 'ui', NULL, "created_at" FROM `check_ins`;--> statement-breakpoint
DROP TABLE `check_ins`;--> statement-breakpoint
ALTER TABLE `__new_check_ins` RENAME TO `check_ins`;--> statement-breakpoint
PRAGMA foreign_keys=ON;