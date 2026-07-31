CREATE TABLE `ai_rate_counters` (
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `scope_id`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `team_ai_keys` (
	`team_id` text PRIMARY KEY NOT NULL,
	`key_ciphertext` text NOT NULL,
	`key_last4` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
