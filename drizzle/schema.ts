import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
