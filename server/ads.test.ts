import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// In-memory stores
const mockAdsStore: any[] = [];
const mockFetchHistory: any[] = [];

vi.mock("./db", () => ({
  // Auth
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => {}),
  getDb: vi.fn(async () => null),

  // User settings
  getUserSettings: vi.fn(async () => null),
  upsertUserSettings: vi.fn(async () => {}),
  deleteUserSettings: vi.fn(async () => {}),

  // Org management (user not in any org for these tests)
  createOrganization: vi.fn(async () => 1),
  getOrganization: vi.fn(async () => undefined),
  updateOrganizationName: vi.fn(async () => {}),
  getUserOrg: vi.fn(async () => null),
  listOrgMembers: vi.fn(async () => []),
  addOrgMember: vi.fn(async () => {}),
  removeOrgMember: vi.fn(async () => {}),
  updateOrgMemberRole: vi.fn(async () => {}),
  getUserByEmail: vi.fn(async () => undefined),
  getUserByName: vi.fn(async () => undefined),
  listAllUsers: vi.fn(async () => []),

  // Org settings
  getOrgSettings: vi.fn(async () => null),
  upsertOrgSettings: vi.fn(async () => {}),

  // Effective settings
  getEffectiveSettings: vi.fn(async () => ({
    orgId: null,
    orgName: null,
    orgRole: null,
    settings: {
      accessToken: null, tokenLabel: null, bmIds: null,
      accountGroups: null, manualAccounts: null, excludedAccounts: null,
      accountNames: null, bmCacheData: null, autoAccounts: null,
    },
  })),
  saveEffectiveSettings: vi.fn(async () => ({ orgId: null })),

  // Ads (org-aware signatures: userId, data, orgId?)
  saveDisapprovedAds: vi.fn(async (_userId: number, ads: any[], _orgId?: number | null) => {
    for (const ad of ads) {
      const existing = mockAdsStore.findIndex((a) => a.adId === ad.adId);
      if (existing >= 0) {
        mockAdsStore[existing] = { ...mockAdsStore[existing], ...ad };
      } else {
        mockAdsStore.push({ ...ad, id: mockAdsStore.length + 1 });
      }
    }
    return ads.length;
  }),
  loadDisapprovedAds: vi.fn(async (_userId: number, _orgId?: number | null) => {
    return mockAdsStore.map((a) => ({
      ...a,
      firstFetchedAt: new Date(),
      lastRefreshedAt: new Date(),
    }));
  }),
  updateSingleAd: vi.fn(async (_userId: number, adId: string, data: any, _orgId?: number | null) => {
    const idx = mockAdsStore.findIndex((a) => a.adId === adId);
    if (idx >= 0) {
      mockAdsStore[idx] = { ...mockAdsStore[idx], ...data };
      return true;
    }
    return false;
  }),
  clearDisapprovedAds: vi.fn(async (_userId: number, _orgId?: number | null) => {
    mockAdsStore.length = 0;
  }),
  deleteAdsByIds: vi.fn(async (_userId: number, adIds: string[], _orgId?: number | null) => {
    for (const id of adIds) {
      const idx = mockAdsStore.findIndex((a) => a.adId === id);
      if (idx >= 0) mockAdsStore.splice(idx, 1);
    }
  }),
  recordFetchHistory: vi.fn(async (_userId: number, data: any, _orgId?: number | null) => {
    mockFetchHistory.push(data);
  }),
  getLatestFetchHistory: vi.fn(async (_userId: number, _orgId?: number | null) => {
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
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
