CREATE TABLE `org_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `org_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_org_user` UNIQUE(`orgId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `org_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`accessToken` text,
	`tokenLabel` varchar(255),
	`bmIds` text,
	`accountGroups` text,
	`manualAccounts` text,
	`excludedAccounts` text,
	`accountNames` longtext,
	`bmCacheData` longtext,
	`autoAccounts` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `org_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `org_settings_orgId_unique` UNIQUE(`orgId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `disapproved_ads` ADD `orgId` int;--> statement-breakpoint
ALTER TABLE `fetch_history` ADD `orgId` int;--> statement-breakpoint
CREATE INDEX `idx_user_org` ON `org_members` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_org_account` ON `disapproved_ads` (`orgId`,`accountId`);--> statement-breakpoint
CREATE INDEX `idx_org_ad` ON `disapproved_ads` (`orgId`,`adId`);--> statement-breakpoint
CREATE INDEX `idx_org_fetch` ON `fetch_history` (`orgId`);