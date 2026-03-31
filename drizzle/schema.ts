import { bigint, int, mysqlEnum, mysqlTable, text, timestamp, varchar, longtext, index } from "drizzle-orm/mysql-core";

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
 * User settings table — stores Meta API tokens and configuration per user.
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

/**
 * Disapproved ads table — persists fetched ad data so users don't need to re-fetch.
 * Each row represents one disapproved ad belonging to a user.
 * The full ad JSON is stored in LONGTEXT to handle large creative/feedback data.
 */
export const disapprovedAds = mysqlTable("disapproved_ads", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to users.id */
  userId: int("userId").notNull(),
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
]);

export type DisapprovedAdRow = typeof disapprovedAds.$inferSelect;
export type InsertDisapprovedAd = typeof disapprovedAds.$inferInsert;

/**
 * Fetch history — tracks when bulk fetches happened per user.
 * Used to show "last fetched at" and manage cache freshness.
 */
export const fetchHistory = mysqlTable("fetch_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
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
]);

export type FetchHistoryRow = typeof fetchHistory.$inferSelect;
export type InsertFetchHistory = typeof fetchHistory.$inferInsert;
