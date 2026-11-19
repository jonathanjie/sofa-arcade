CREATE TABLE `sofa_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`jon_seen` integer DEFAULT 0 NOT NULL,
	`lydia_seen` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sofa_rooms_expiry_idx` ON `sofa_rooms` (`expires_at`);