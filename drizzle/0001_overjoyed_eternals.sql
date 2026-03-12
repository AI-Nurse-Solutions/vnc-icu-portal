CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actor_id` int,
	`action` varchar(64) NOT NULL,
	`target_type` varchar(64) NOT NULL,
	`target_id` varchar(64),
	`details` json,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blackout_dates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`reason` text,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blackout_dates_id` PRIMARY KEY(`id`),
	CONSTRAINT `blackout_dates_date_unique` UNIQUE(`date`)
);
--> statement-breakpoint
CREATE TABLE `config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` varchar(256) NOT NULL,
	`updated_by` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_id` PRIMARY KEY(`id`),
	CONSTRAINT `config_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_number` varchar(32) NOT NULL,
	`first_name` varchar(64) NOT NULL,
	`last_name` varchar(64) NOT NULL,
	`seniority_date` date NOT NULL,
	`shift` enum('AM','PM','NOC') NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('employee','manager','admin') NOT NULL DEFAULT 'employee',
	`auth_provider_id` varchar(128),
	`password_hash` varchar(256),
	`otp_code` varchar(6),
	`otp_expires_at` timestamp,
	`otp_attempts` int DEFAULT 0,
	`otp_locked_until` timestamp,
	`reset_token` varchar(128),
	`reset_token_expires_at` timestamp,
	`invite_token` varchar(128),
	`invite_token_expires_at` timestamp,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_employee_number_unique` UNIQUE(`employee_number`),
	CONSTRAINT `employees_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `request_dates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int NOT NULL,
	`date` date NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `request_dates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`request_type` enum('vacation','education') NOT NULL,
	`continuity_type` enum('continuous','intermittent') NOT NULL,
	`comment` text,
	`status` enum('pending','approved','denied','withdrawn') NOT NULL DEFAULT 'pending',
	`submitted_at` timestamp NOT NULL DEFAULT (now()),
	`decided_at` timestamp,
	`decided_by` int,
	`decision_note` text,
	`prior_status` enum('pending','approved','denied','withdrawn'),
	`withdrawn_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submission_deadlines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deadline_date` date NOT NULL,
	`coverage_start` date NOT NULL,
	`coverage_end` date NOT NULL,
	`year` int NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `submission_deadlines_id` PRIMARY KEY(`id`)
);
