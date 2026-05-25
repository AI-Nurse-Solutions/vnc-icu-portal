CREATE TABLE `admin_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`from_employee_id` int NOT NULL,
	`subject` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`is_read` boolean NOT NULL DEFAULT false,
	`read_at` timestamp,
	`reply_body` text,
	`replied_at` timestamp,
	`replied_by` int,
	`is_urgent` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_messages_id` PRIMARY KEY(`id`)
);
