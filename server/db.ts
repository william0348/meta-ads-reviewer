import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, userSettings, type UserSettings, type InsertUserSettings,
  disapprovedAds, type DisapprovedAdRow, type InsertDisapprovedAd,
  fetchHistory, type InsertFetchHistory,
  organizations, type Organization, type InsertOrganization,
  orgMembers, type OrgMember, type InsertOrgMember,
  orgSettings, type OrgSettings, type InsertOrgSettings,
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

// ─── Organization CRUD ───

export async function createOrganization(name: string, createdBy: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(organizations).values({ name, createdBy });
  const orgId = Number(result[0].insertId);
  // Creator is automatically the owner
  await db.insert(orgMembers).values({ orgId, userId: createdBy, role: 'owner' });
  return orgId;
}

export async function getOrganization(orgId: number): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateOrganizationName(orgId: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(organizations).set({ name }).where(eq(organizations.id, orgId));
}

/** Get the org a user belongs to (first one found). Returns null if user is not in any org. */
export async function getUserOrg(userId: number): Promise<(OrgMember & { orgName: string }) | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    id: orgMembers.id,
    orgId: orgMembers.orgId,
    userId: orgMembers.userId,
    role: orgMembers.role,
    joinedAt: orgMembers.joinedAt,
    orgName: organizations.name,
  })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/** List all members of an org with user details. */
export async function listOrgMembers(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    memberId: orgMembers.id,
    userId: orgMembers.userId,
    role: orgMembers.role,
    joinedAt: orgMembers.joinedAt,
    userName: users.name,
    userEmail: users.email,
    userOpenId: users.openId,
  })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId));
}

export async function addOrgMember(orgId: number, userId: number, role: 'owner' | 'admin' | 'member' = 'member'): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(orgMembers).values({ orgId, userId, role }).onDuplicateKeyUpdate({
    set: { role },
  });
}

export async function removeOrgMember(orgId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
}

export async function updateOrgMemberRole(orgId: number, userId: number, role: 'owner' | 'admin' | 'member'): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(orgMembers).set({ role }).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
}

/** Find a user by email (for inviting). */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Find a user by name (for inviting). */
export async function getUserByName(name: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.name, name)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** List all users (for admin to pick from when inviting). */
export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    openId: users.openId,
    lastSignedIn: users.lastSignedIn,
  }).from(users);
}

// ─── Org Settings ───

export async function getOrgSettings(orgId: number): Promise<OrgSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertOrgSettings(
  orgId: number,
  data: Partial<Omit<InsertOrgSettings, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const existing = await getOrgSettings(orgId);
  if (existing) {
    const updateSet: Record<string, unknown> = {};
    if (data.accessToken !== undefined) updateSet.accessToken = data.accessToken;
    if (data.tokenLabel !== undefined) updateSet.tokenLabel = data.tokenLabel;
    if (data.bmIds !== undefined) updateSet.bmIds = data.bmIds;
    if (data.accountGroups !== undefined) updateSet.accountGroups = data.accountGroups;
    if (data.manualAccounts !== undefined) updateSet.manualAccounts = data.manualAccounts;
    if (data.excludedAccounts !== undefined) updateSet.excludedAccounts = data.excludedAccounts;
    if (data.accountNames !== undefined) updateSet.accountNames = data.accountNames;
    if (data.bmCacheData !== undefined) updateSet.bmCacheData = data.bmCacheData;
    if (data.autoAccounts !== undefined) updateSet.autoAccounts = data.autoAccounts;
    if (Object.keys(updateSet).length > 0) {
      await db.update(orgSettings).set(updateSet).where(eq(orgSettings.orgId, orgId));
    }
  } else {
    await db.insert(orgSettings).values({
      orgId,
      ...data,
    });
  }
}

// ─── User Settings (fallback for users not in an org) ───

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
    if (data.excludedAccounts !== undefined) updateSet.excludedAccounts = data.excludedAccounts;
    if (data.accountNames !== undefined) updateSet.accountNames = data.accountNames;
    if (data.bmCacheData !== undefined) updateSet.bmCacheData = data.bmCacheData;
    if (data.autoAccounts !== undefined) updateSet.autoAccounts = data.autoAccounts;
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

// ─── Unified Settings Helper ───
// Resolves whether to use org settings or user settings based on membership.

export async function getEffectiveSettings(userId: number): Promise<{
  orgId: number | null;
  orgName: string | null;
  orgRole: string | null;
  settings: {
    accessToken: string | null;
    tokenLabel: string | null;
    bmIds: string | null;
    accountGroups: string | null;
    manualAccounts: string | null;
    excludedAccounts: string | null;
    accountNames: string | null;
    bmCacheData: string | null;
    autoAccounts: string | null;
  };
}> {
  const membership = await getUserOrg(userId);
  if (membership) {
    const settings = await getOrgSettings(membership.orgId);
    return {
      orgId: membership.orgId,
      orgName: membership.orgName,
      orgRole: membership.role,
      settings: {
        accessToken: settings?.accessToken ?? null,
        tokenLabel: settings?.tokenLabel ?? null,
        bmIds: settings?.bmIds ?? null,
        accountGroups: settings?.accountGroups ?? null,
        manualAccounts: settings?.manualAccounts ?? null,
        excludedAccounts: settings?.excludedAccounts ?? null,
        accountNames: settings?.accountNames ?? null,
        bmCacheData: settings?.bmCacheData ?? null,
        autoAccounts: settings?.autoAccounts ?? null,
      },
    };
  }
  // Fallback to user settings
  const settings = await getUserSettings(userId);
  return {
    orgId: null,
    orgName: null,
    orgRole: null,
    settings: {
      accessToken: settings?.accessToken ?? null,
      tokenLabel: settings?.tokenLabel ?? null,
      bmIds: settings?.bmIds ?? null,
      accountGroups: settings?.accountGroups ?? null,
      manualAccounts: settings?.manualAccounts ?? null,
      excludedAccounts: settings?.excludedAccounts ?? null,
      accountNames: settings?.accountNames ?? null,
      bmCacheData: settings?.bmCacheData ?? null,
      autoAccounts: settings?.autoAccounts ?? null,
    },
  };
}

/** Save settings to the correct target (org or user). */
export async function saveEffectiveSettings(
  userId: number,
  data: Partial<{
    accessToken: string | null;
    tokenLabel: string | null;
    bmIds: string | null;
    accountGroups: string | null;
    manualAccounts: string | null;
    excludedAccounts: string | null;
    accountNames: string | null;
    bmCacheData: string | null;
    autoAccounts: string | null;
  }>
): Promise<{ orgId: number | null }> {
  const membership = await getUserOrg(userId);
  if (membership) {
    await upsertOrgSettings(membership.orgId, data);
    return { orgId: membership.orgId };
  }
  await upsertUserSettings(userId, data);
  return { orgId: null };
}

// ─── Disapproved Ads (Persistent Cache) ───

/**
 * Save or update a batch of disapproved ads.
 * If user is in an org, saves with orgId for shared access.
 */
export async function saveDisapprovedAds(
  userId: number,
  ads: Array<{ adId: string; accountId: string; adName?: string; effectiveStatus?: string; adData: string }>,
  orgId?: number | null
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (ads.length === 0) return 0;

  let savedCount = 0;
  const chunkSize = 50;
  for (let i = 0; i < ads.length; i += chunkSize) {
    const chunk = ads.slice(i, i + chunkSize);
    for (const ad of chunk) {
      await db.insert(disapprovedAds).values({
        userId,
        orgId: orgId ?? null,
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
          userId, // update who last refreshed
        },
      });
      savedCount++;
    }
  }
  return savedCount;
}

/**
 * Load all disapproved ads. If orgId is provided, loads org-level ads.
 * Otherwise loads user-level ads.
 */
export async function loadDisapprovedAds(userId: number, orgId?: number | null): Promise<DisapprovedAdRow[]> {
  const db = await getDb();
  if (!db) return [];
  if (orgId) {
    return db.select().from(disapprovedAds).where(eq(disapprovedAds.orgId, orgId));
  }
  return db.select().from(disapprovedAds).where(
    and(eq(disapprovedAds.userId, userId), isNull(disapprovedAds.orgId))
  );
}

/**
 * Update a single ad's data (after per-ad refresh).
 */
export async function updateSingleAd(
  userId: number,
  adId: string,
  data: { adName?: string; effectiveStatus?: string; adData: string },
  orgId?: number | null
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  if (orgId) {
    await db.update(disapprovedAds)
      .set({
        adName: data.adName ?? null,
        effectiveStatus: data.effectiveStatus ?? null,
        adData: data.adData,
        userId, // track who refreshed
      })
      .where(and(eq(disapprovedAds.orgId, orgId), eq(disapprovedAds.adId, adId)));
  } else {
    await db.update(disapprovedAds)
      .set({
        adName: data.adName ?? null,
        effectiveStatus: data.effectiveStatus ?? null,
        adData: data.adData,
      })
      .where(and(eq(disapprovedAds.userId, userId), eq(disapprovedAds.adId, adId)));
  }
  return true;
}

/**
 * Delete all disapproved ads for a user or org (clear cache).
 */
export async function clearDisapprovedAds(userId: number, orgId?: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (orgId) {
    await db.delete(disapprovedAds).where(eq(disapprovedAds.orgId, orgId));
  } else {
    await db.delete(disapprovedAds).where(
      and(eq(disapprovedAds.userId, userId), isNull(disapprovedAds.orgId))
    );
  }
}

/**
 * Delete specific ads by adId for a user or org.
 */
export async function deleteAdsByIds(userId: number, adIds: string[], orgId?: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (adIds.length === 0) return;
  if (orgId) {
    await db.delete(disapprovedAds).where(
      and(eq(disapprovedAds.orgId, orgId), inArray(disapprovedAds.adId, adIds))
    );
  } else {
    await db.delete(disapprovedAds).where(
      and(eq(disapprovedAds.userId, userId), isNull(disapprovedAds.orgId), inArray(disapprovedAds.adId, adIds))
    );
  }
}

// ─── Fetch History ───

export async function recordFetchHistory(
  userId: number,
  data: { accountCount: number; adCount: number; errorCount: number; errors?: string },
  orgId?: number | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(fetchHistory).values({
    userId,
    orgId: orgId ?? null,
    accountCount: data.accountCount,
    adCount: data.adCount,
    errorCount: data.errorCount,
    errors: data.errors ?? null,
  });
}

export async function getLatestFetchHistory(userId: number, orgId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  let result;
  if (orgId) {
    result = await db.select().from(fetchHistory)
      .where(eq(fetchHistory.orgId, orgId))
      .orderBy(desc(fetchHistory.fetchedAt))
      .limit(1);
  } else {
    result = await db.select().from(fetchHistory)
      .where(and(eq(fetchHistory.userId, userId), isNull(fetchHistory.orgId)))
      .orderBy(desc(fetchHistory.fetchedAt))
      .limit(1);
  }
  return result.length > 0 ? result[0] : null;
}
