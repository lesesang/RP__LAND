CREATE TABLE `attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`author_id` text NOT NULL,
	`character` text NOT NULL,
	`content` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`dice` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_entry` ON `comments` (`entry_id`,`created`);--> statement-breakpoint
CREATE TABLE `editors` (
	`entry_id` text NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_editors_pair` ON `editors` (`entry_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`author_id` text,
	`secret` text,
	`categories` text DEFAULT '[]' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entries_kind_date` ON `entries` (`kind`,`created`);--> statement-breakpoint
CREATE TABLE `grants` (
	`token` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `names` (
	`user_id` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_names_pair` ON `names` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);