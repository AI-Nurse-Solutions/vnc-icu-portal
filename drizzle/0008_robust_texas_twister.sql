CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('announcement','tip') NOT NULL DEFAULT 'announcement',
	`title` varchar(128) NOT NULL,
	`body` text NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
