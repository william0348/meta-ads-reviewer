import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
const mockStore: Record<number, any> = {};

vi.mock("./db", () => ({
  getUserSettings: vi.fn(async (userId: number) => mockStore[userId] || null),
  upsertUserSettings: vi.fn(async (userId: number, data: any) => {
    if (!mockStore[userId]) {
      mockStore[userId] = { id: 1, userId, createdAt: new Date(), updatedAt: new Date() };
    }
    Object.assign(mockStore[userId], data);
  }),
  deleteUserSettings: vi.fn(async (userId: number) => {
    delete mockStore[userId];
  }),
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => {}),
  getDb: vi.fn(async () => null),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "test-user-42",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("settings router", () => {
  beforeEach(() => {
    // Reset mock store
    for (const key of Object.keys(mockStore)) {
      delete mockStore[Number(key)];
    }
  });

  it("returns null settings for a new user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.get();

    // New user has no settings — returns null fields
    expect(result).toBeDefined();
  });

  it("saves an access token", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const saveResult = await caller.settings.saveToken({
      accessToken: "EAAtest123",
      tokenLabel: "Test Token",
    });

    expect(saveResult.success).toBe(true);
  });

  it("saves account groups as JSON string", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const groups = JSON.stringify([
      { id: "grp_1", name: "Group 1", accountIds: ["123", "456"] },
    ]);

    const result = await caller.settings.saveAccountGroups({
      accountGroups: groups,
    });

    expect(result.success).toBe(true);
  });

  it("saves manual accounts as JSON string", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const accounts = JSON.stringify(["111", "222", "333"]);

    const result = await caller.settings.saveManualAccounts({
      manualAccounts: accounts,
    });

    expect(result.success).toBe(true);
  });

  it("saves all settings at once", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.saveAll({
      accessToken: "EAAtest456",
      tokenLabel: "Bulk Token",
      accountGroups: JSON.stringify([]),
      manualAccounts: JSON.stringify(["999"]),
    });

    expect(result.success).toBe(true);
  });

  it("rejects unauthenticated access to settings.get", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.settings.get()).rejects.toThrow();
  });

  it("rejects unauthenticated access to settings.saveToken", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.settings.saveToken({ accessToken: "EAAtest" })
    ).rejects.toThrow();
  });

  // ─── Account Names ───
  it("saves and retrieves account names", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const names = { "123456": "My Account", "789012": "Other Account" };
    const saveResult = await caller.settings.saveAccountNames({
      accountNames: JSON.stringify(names),
    });
    expect(saveResult.success).toBe(true);

    const retrieved = await caller.settings.getAccountNames();
    expect(retrieved).toEqual(names);
  });

  it("merges account names on subsequent saves", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.settings.saveAccountNames({
      accountNames: JSON.stringify({ "111": "First" }),
    });
    await caller.settings.saveAccountNames({
      accountNames: JSON.stringify({ "222": "Second" }),
    });

    const retrieved = await caller.settings.getAccountNames();
    expect(retrieved).toEqual({ "111": "First", "222": "Second" });
  });

  // ─── BM Cache ───
  it("saves and retrieves BM cache", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const bmCache = {
      "123456": {
        accountId: "123456",
        bmId: "bm_001",
        bmName: "My BM",
        ownerBmId: "owner_001",
        ownerBmName: "Owner BM",
      },
    };
    const saveResult = await caller.settings.saveBmCache({
      bmCache: JSON.stringify(bmCache),
    });
    expect(saveResult.success).toBe(true);

    const retrieved = await caller.settings.getBmCache();
    expect(retrieved["123456"]).toBeDefined();
    expect(retrieved["123456"].bmId).toBe("bm_001");
    expect(retrieved["123456"].bmName).toBe("My BM");
  });

  it("merges BM cache on subsequent saves", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.settings.saveBmCache({
      bmCache: JSON.stringify({ "111": { accountId: "111", bmId: "bm_a", bmName: "BM A" } }),
    });
    await caller.settings.saveBmCache({
      bmCache: JSON.stringify({ "222": { accountId: "222", bmId: "bm_b", bmName: "BM B" } }),
    });

    const retrieved = await caller.settings.getBmCache();
    expect(retrieved["111"]).toBeDefined();
    expect(retrieved["222"]).toBeDefined();
  });

  // ─── Auto Accounts ───
  it("saves and retrieves auto accounts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const autoAccounts = [
      { id: "act_111", account_id: "111", name: "Account 1", account_status: 1 },
      { id: "act_222", account_id: "222", name: "Account 2", account_status: 1 },
    ];
    const saveResult = await caller.settings.saveAutoAccounts({
      autoAccounts: JSON.stringify(autoAccounts),
    });
    expect(saveResult.success).toBe(true);

    const retrieved = await caller.settings.getAutoAccounts();
    expect(retrieved).toHaveLength(2);
    expect(retrieved[0].name).toBe("Account 1");
  });

  // ─── settings.get returns new fields ───
  it("settings.get returns accountNames, bmCacheData, and autoAccounts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Save some data first
    await caller.settings.saveAccountNames({
      accountNames: JSON.stringify({ "111": "Test Account" }),
    });
    await caller.settings.saveBmCache({
      bmCache: JSON.stringify({ "111": { bmId: "bm_x", bmName: "BM X" } }),
    });
    await caller.settings.saveAutoAccounts({
      autoAccounts: JSON.stringify([{ id: "act_111", account_id: "111", name: "Test", account_status: 1 }]),
    });

    const settings = await caller.settings.get();
    expect(settings.accountNames).toEqual({ "111": "Test Account" });
    expect(settings.bmCacheData["111"]).toBeDefined();
    expect(settings.bmCacheData["111"].bmId).toBe("bm_x");
    expect(settings.autoAccounts).toHaveLength(1);
  });

  it("settings.get returns empty defaults for new user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const settings = await caller.settings.get();
    expect(settings.accountNames).toEqual({});
    expect(settings.bmCacheData).toEqual({});
    expect(settings.autoAccounts).toEqual([]);
  });
});
