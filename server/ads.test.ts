import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
const mockAdsStore: any[] = [];
const mockFetchHistory: any[] = [];

vi.mock("./db", () => ({
  getUserSettings: vi.fn(async () => null),
  upsertUserSettings: vi.fn(async () => {}),
  deleteUserSettings: vi.fn(async () => {}),
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => {}),
  getDb: vi.fn(async () => null),
  saveDisapprovedAds: vi.fn(async (_userId: number, ads: any[]) => {
    for (const ad of ads) {
      const existing = mockAdsStore.findIndex(
        (a) => a.adId === ad.adId
      );
      if (existing >= 0) {
        mockAdsStore[existing] = { ...mockAdsStore[existing], ...ad };
      } else {
        mockAdsStore.push({ ...ad, id: mockAdsStore.length + 1 });
      }
    }
  }),
  loadDisapprovedAds: vi.fn(async (_userId: number) => {
    return mockAdsStore.map((a) => ({
      ...a,
      firstFetchedAt: new Date(),
      lastRefreshedAt: new Date(),
    }));
  }),
  updateSingleAd: vi.fn(async (_userId: number, adId: string, data: any) => {
    const idx = mockAdsStore.findIndex((a) => a.adId === adId);
    if (idx >= 0) {
      mockAdsStore[idx] = { ...mockAdsStore[idx], ...data };
      return true;
    }
    return false;
  }),
  clearDisapprovedAds: vi.fn(async () => {
    mockAdsStore.length = 0;
  }),
  recordFetchHistory: vi.fn(async (_userId: number, data: any) => {
    mockFetchHistory.push(data);
  }),
  getLatestFetchHistory: vi.fn(async (_userId: number) => {
    return mockFetchHistory.length > 0
      ? mockFetchHistory[mockFetchHistory.length - 1]
      : null;
  }),
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

describe("ads router", () => {
  beforeEach(() => {
    mockAdsStore.length = 0;
    mockFetchHistory.length = 0;
  });

  it("saves ads to the database", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ads.save({
      ads: [
        {
          adId: "123456",
          accountId: "act_111",
          adName: "Test Ad 1",
          effectiveStatus: "DISAPPROVED",
          adData: JSON.stringify({ id: "123456", name: "Test Ad 1" }),
        },
        {
          adId: "789012",
          accountId: "act_222",
          adName: "Test Ad 2",
          effectiveStatus: "PENDING_REVIEW",
          adData: JSON.stringify({ id: "789012", name: "Test Ad 2" }),
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(mockAdsStore.length).toBe(2);
  });

  it("loads ads from the database", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Save first
    await caller.ads.save({
      ads: [
        {
          adId: "123456",
          accountId: "act_111",
          adData: JSON.stringify({ id: "123456", name: "Test Ad" }),
        },
      ],
    });

    const result = await caller.ads.load();
    expect(result.ads.length).toBe(1);
    expect(result.ads[0].adId).toBe("123456");
  });

  it("updates a single ad", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Save first
    await caller.ads.save({
      ads: [
        {
          adId: "123456",
          accountId: "act_111",
          effectiveStatus: "DISAPPROVED",
          adData: JSON.stringify({ id: "123456", effective_status: "DISAPPROVED" }),
        },
      ],
    });

    // Update
    const result = await caller.ads.updateOne({
      adId: "123456",
      effectiveStatus: "PENDING_REVIEW",
      adData: JSON.stringify({ id: "123456", effective_status: "PENDING_REVIEW" }),
    });

    expect(result.success).toBe(true);
  });

  it("clears all ads", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.ads.save({
      ads: [
        {
          adId: "123456",
          accountId: "act_111",
          adData: JSON.stringify({ id: "123456" }),
        },
      ],
    });

    const result = await caller.ads.clear();
    expect(result.success).toBe(true);
  });

  it("records fetch history", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ads.recordFetch({
      accountCount: 10,
      adCount: 50,
      errorCount: 2,
      errors: JSON.stringify([{ accountId: "act_111", error: "timeout" }]),
    });

    expect(result.success).toBe(true);
    expect(mockFetchHistory.length).toBe(1);
  });

  it("retrieves last fetch history", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.ads.recordFetch({
      accountCount: 10,
      adCount: 50,
      errorCount: 0,
    });

    const result = await caller.ads.lastFetch();
    expect(result).toBeDefined();
    expect(result?.accountCount).toBe(10);
  });

  it("rejects unauthenticated access to ads.save", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.ads.save({
        ads: [
          {
            adId: "123456",
            accountId: "act_111",
            adData: JSON.stringify({}),
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated access to ads.load", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.ads.load()).rejects.toThrow();
  });
});
