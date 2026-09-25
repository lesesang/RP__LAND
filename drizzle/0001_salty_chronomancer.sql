CREATE TABLE `maintenance` (
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE `comments` ADD `deleted` integer DEFAULT 0 NOT NULL;