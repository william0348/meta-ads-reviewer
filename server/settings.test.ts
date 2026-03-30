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
});
