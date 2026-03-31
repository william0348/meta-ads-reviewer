CREATE TABLE `disapproved_ads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`adId` varchar(64) NOT NULL,
	`accountId` varchar(64) NOT NULL,
	`adName` text,
	`effectiveStatus` varchar(64),
	`adData` longtext NOT NULL,
	`firstFetchedAt` timestamp NOT NULL DEFAULT (now()),
	`lastRefreshedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `disapproved_ads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fetch_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountCount` int NOT NULL DEFAULT 0,
	`adCount` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`errors` longtext,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fetch_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_account` ON `disapproved_ads` (`userId`,`accountId`);--> statement-breakpoint
CREATE INDEX `idx_user_ad` ON `disapproved_ads` (`userId`,`adId`);--> statement-breakpoint
CREATE INDEX `idx_user_fetch` ON `fetch_history` (`userId`);