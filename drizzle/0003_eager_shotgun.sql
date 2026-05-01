ALTER TABLE `employees` MODIFY COLUMN `role` enum('employee','manager','admin','super_admin') NOT NULL DEFAULT 'employee';--> statement-breakpoint
ALTER TABLE `requests` MODIFY COLUMN `priority` int NOT NULL DEFAULT 5;--> statement-breakpoint
ALTER TABLE `employees` ADD `category` enum('icu','ancillary') DEFAULT 'icu' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `is_verified` boolean DEFAULT false NOT NULL;