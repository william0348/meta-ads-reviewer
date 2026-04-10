import { bigint, int, mysqlEnum, mysqlTable, text, timestamp, varchar, longtext, index, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Organizations (companies) — groups of users sharing the same data.
 */
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  /** Display name of the organization */
  name: varchar("name", { length: 255 }).notNull(),
  /** User ID of the creator (owner) */
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * Organization members — maps users to organizations with roles.
 * role: owner (full control), admin (manage members + settings), member (read/write data)
 */
export const orgMembers = mysqlTable("org_members", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_org_user").on(table.orgId, table.userId),
  index("idx_user_org").on(table.userId),
]);

export type OrgMember = typeof orgMembers.$inferSelect;
export type InsertOrgMember = typeof orgMembers.$inferInsert;

/**
 * Organization settings — shared settings at the org level.
 * Each org has at most one row. All JSON fields use LONGTEXT for large data.
 */
export const orgSettings = mysqlTable("org_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to organizations.id */
  orgId: int("orgId").notNull().unique(),
  /** Meta Marketing API Access Token (shared across org) */
  accessToken: text("accessToken"),
  /** Optional label for the token */
  tokenLabel: varchar("tokenLabel", { length: 255 }),
  /** JSON array of BM ID entries: [{id, name}] */
  bmIds: text("bmIds"),
  /** JSON array of account groups: [{id, name, accountIds}] */
  accountGroups: text("accountGroups"),
  /** JSON array of manually added accounts: [{id, name}] */
  manualAccounts: text("manualAccounts"),
  /** JSON array of excluded account IDs: ["123456", "789012"] */
  excludedAccounts: text("excludedAccounts"),
  /** JSON object of account names: {"accountId": "Account Name"} */
  accountNames: longtext("accountNames"),
  /** JSON object of BM cache: {"accountId": {bmId, bmName, ownerBmId, ...}} */
  bmCacheData: longtext("bmCacheData"),
  /** JSON array of auto-fetched accounts: [{id, account_id, name, account_status, ...}] */
  autoAccounts: longtext("autoAccounts"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
export type InsertOrgSettings = typeof orgSettings.$inferInsert;

/**
 * User settings table — stores per-user settings (fallback when not in an org).
 * Each user has at most one row. All JSON fields use LONGTEXT for large data.
 */
export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to users.id */
  userId: int("userId").notNull().unique(),
  /** Meta Marketing API Access Token (encrypted or plain) */
  accessToken: text("accessToken"),
  /** Optional label for the token (e.g. "Production Token") */
  tokenLabel: varchar("tokenLabel", { length: 255 }),
  /** JSON array of BM ID entries: [{id, name}] */
  bmIds: text("bmIds"),
  /** JSON array of account groups: [{id, name, accountIds}] */
  accountGroups: text("accountGroups"),
  /** JSON array of manually added accounts: [{id, name}] */
  manualAccounts: text("manualAccounts"),
  /** JSON array of excluded account IDs: ["123456", "789012"] */
  excludedAccounts: text("excludedAccounts"),
  /** JSON object of account names: {"accountId": "Account Name"} */
  accountNames: longtext("accountNames"),
  /** JSON object of BM cache: {"accountId": {bmId, bmName, ownerBmId, ...}} */
  bmCacheData: longtext("bmCacheData"),
  /** JSON array of auto-fetched accounts: [{id, account_id, name, account_status, ...}] */
  autoAccounts: longtext("autoAccounts"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

/**
 * Disapproved ads table — persists fetched ad data.
 * orgId: if set, the ad belongs to an org (shared). If null, belongs to a user (personal).
 */
export const disapprovedAds = mysqlTable("disapproved_ads", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to users.id (who fetched it) */
  userId: int("userId").notNull(),
  /** Foreign key to organizations.id (null = personal) */
  orgId: int("orgId"),
  /** Meta ad ID (e.g. "23851234567890") */
  adId: varchar("adId", { length: 64 }).notNull(),
  /** Ad account ID without act_ prefix */
  accountId: varchar("accountId", { length: 64 }).notNull(),
  /** Ad name for quick display without parsing JSON */
  adName: text("adName"),
  /** effective_status from Meta API */
  effectiveStatus: varchar("effectiveStatus", { length: 64 }),
  /** Full ad data as JSON (DisapprovedAd type) */
  adData: longtext("adData").notNull(),
  /** When this ad was first fetched */
  firstFetchedAt: timestamp("firstFetchedAt").defaultNow().notNull(),
  /** When this ad was last refreshed from Meta API */
  lastRefreshedAt: timestamp("lastRefreshedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_user_account").on(table.userId, table.accountId),
  index("idx_user_ad").on(table.userId, table.adId),
  index("idx_org_account").on(table.orgId, table.accountId),
  index("idx_org_ad").on(table.orgId, table.adId),
]);

export type DisapprovedAdRow = typeof disapprovedAds.$inferSelect;
export type InsertDisapprovedAd = typeof disapprovedAds.$inferInsert;

/**
 * Fetch history — tracks when bulk fetches happened.
 * orgId: if set, the fetch was for an org. If null, personal.
 */
export const fetchHistory = mysqlTable("fetch_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  orgId: int("orgId"),
  /** Number of accounts fetched */
  accountCount: int("accountCount").notNull().default(0),
  /** Number of ads found */
  adCount: int("adCount").notNull().default(0),
  /** Number of errors during fetch */
  errorCount: int("errorCount").notNull().default(0),
  /** JSON array of error details */
  errors: longtext("errors"),
  /** Fetch timestamp (UTC ms) */
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_fetch").on(table.userId),
  index("idx_org_fetch").on(table.orgId),
]);

export type FetchHistoryRow = typeof fetchHistory.$inferSelect;
export type InsertFetchHistory = typeof fetchHistory.$inferInsert;
