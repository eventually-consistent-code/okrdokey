CREATE TABLE `share_tokens` (
	`team_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_tokens_token_unique` ON `share_tokens` (`token`);