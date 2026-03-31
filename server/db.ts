import { eq, and, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, userSettings, type UserSettings, type InsertUserSettings,
  disapprovedAds, type DisapprovedAdRow, type InsertDisapprovedAd,
  fetchHistory, type InsertFetchHistory,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── User Settings (Meta API Token, BM IDs, Account Groups) ───

export async function getUserSettings(userId: number): Promise<UserSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUserSettings(
  userId: number,
  data: Partial<Omit<InsertUserSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const existing = await getUserSettings(userId);
  if (existing) {
    const updateSet: Record<string, unknown> = {};
    if (data.accessToken !== undefined) updateSet.accessToken = data.accessToken;
    if (data.tokenLabel !== undefined) updateSet.tokenLabel = data.tokenLabel;
    if (data.bmIds !== undefined) updateSet.bmIds = data.bmIds;
    if (data.accountGroups !== undefined) updateSet.accountGroups = data.accountGroups;
    if (data.manualAccounts !== undefined) updateSet.manualAccounts = data.manualAccounts;
    if (Object.keys(updateSet).length > 0) {
      await db.update(userSettings).set(updateSet).where(eq(userSettings.userId, userId));
    }
  } else {
    await db.insert(userSettings).values({
      userId,
      ...data,
    });
  }
}

export async function deleteUserSettings(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
}

// ─── Disapproved Ads (Persistent Cache) ───

/**
 * Save or update a batch of disapproved ads for a user.
 * Uses upsert logic: if ad already exists for this user, update it.
 */
export async function saveDisapprovedAds(
  userId: number,
  ads: Array<{ adId: string; accountId: string; adName?: string; effectiveStatus?: string; adData: string }>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (ads.length === 0) return 0;

  let savedCount = 0;
  // Process in chunks of 50 to avoid query size limits
  const chunkSize = 50;
  for (let i = 0; i < ads.length; i += chunkSize) {
    const chunk = ads.slice(i, i + chunkSize);
    for (const ad of chunk) {
      await db.insert(disapprovedAds).values({
        userId,
        adId: ad.adId,
        accountId: ad.accountId.replace(/^act_/, ''),
        adName: ad.adName ?? null,
        effectiveStatus: ad.effectiveStatus ?? null,
        adData: ad.adData,
      }).onDuplicateKeyUpdate({
        set: {
          adName: ad.adName ?? null,
          effectiveStatus: ad.effectiveStatus ?? null,
          adData: ad.adData,
        },
      });
      savedCount++;
    }
  }
  return savedCount;
}

/**
 * Load all disapproved ads for a user.
 */
export async function loadDisapprovedAds(userId: number): Promise<DisapprovedAdRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(disapprovedAds).where(eq(disapprovedAds.userId, userId));
}

/**
 * Update a single ad's data (after per-ad refresh).
 */
export async function updateSingleAd(
  userId: number,
  adId: string,
  data: { adName?: string; effectiveStatus?: string; adData: string }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(disapprovedAds)
    .set({
      adName: data.adName ?? null,
      effectiveStatus: data.effectiveStatus ?? null,
      adData: data.adData,
    })
    .where(and(eq(disapprovedAds.userId, userId), eq(disapprovedAds.adId, adId)));
  return true;
}

/**
 * Delete all disapproved ads for a user (clear cache).
 */
export async function clearDisapprovedAds(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(disapprovedAds).where(eq(disapprovedAds.userId, userId));
}

/**
 * Delete specific ads by adId for a user.
 */
export async function deleteAdsByIds(userId: number, adIds: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (adIds.length === 0) return;
  await db.delete(disapprovedAds).where(
    and(eq(disapprovedAds.userId, userId), inArray(disapprovedAds.adId, adIds))
  );
}

// ─── Fetch History ───

export async function recordFetchHistory(
  userId: number,
  data: { accountCount: number; adCount: number; errorCount: number; errors?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(fetchHistory).values({
    userId,
    accountCount: data.accountCount,
    adCount: data.adCount,
    errorCount: data.errorCount,
    errors: data.errors ?? null,
  });
}

export async function getLatestFetchHistory(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(fetchHistory)
    .where(eq(fetchHistory.userId, userId))
    .orderBy(fetchHistory.fetchedAt)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}
