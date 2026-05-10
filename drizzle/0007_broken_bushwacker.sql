CREATE TABLE `request_date_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int NOT NULL,
	`date` date NOT NULL,
	`decision` enum('approved','denied') NOT NULL,
	`decided_by` int NOT NULL,
	`note` text,
	`decided_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `request_date_decisions_id` PRIMARY KEY(`id`)
);
