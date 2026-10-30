CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analyses_owner_created` ON `analyses` (`owner`,`created_at`);