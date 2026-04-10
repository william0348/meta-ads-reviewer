import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// In-memory stores
let orgIdCounter = 1;
const orgs: Record<number, { id: number; name: string; createdBy: number }> = {};
const orgMembersStore: Array<{ id: number; orgId: number; userId: number; role: string; joinedAt: Date }> = [];
const orgSettingsStore: Record<number, any> = {};
const userSettingsStore: Record<number, any> = {};
let memberIdCounter = 1;
const usersStore: Array<{ id: number; name: string; email: string; openId: string; lastSignedIn: Date }> = [
  { id: 42, name: "Test User", email: "test@example.com", openId: "test-42", lastSignedIn: new Date() },
  { id: 100, name: "Other User", email: "other@example.com", openId: "other-100", lastSignedIn: new Date() },
  { id: 200, name: "Third User", email: "third@example.com", openId: "third-200", lastSignedIn: new Date() },
];

vi.mock("./db", () => ({
  createOrganization: vi.fn(async (name: string, createdBy: number) => {
    const id = orgIdCounter++;
    orgs[id] = { id, name, createdBy };
    orgMembersStore.push({ id: memberIdCounter++, orgId: id, userId: createdBy, role: 'owner', joinedAt: new Date() });
    return id;
  }),
  getOrganization: vi.fn(async (orgId: number) => orgs[orgId] || undefined),
  updateOrganizationName: vi.fn(async (orgId: number, name: string) => {
    if (orgs[orgId]) orgs[orgId].name = name;
  }),
  getUserOrg: vi.fn(async (userId: number) => {
    const m = orgMembersStore.find(m => m.userId === userId);
    if (!m) return null;
    return { ...m, orgName: orgs[m.orgId]?.name || '' };
  }),
  listOrgMembers: vi.fn(async (orgId: number) => {
    return orgMembersStore
      .filter(m => m.orgId === orgId)
      .map(m => {
        const u = usersStore.find(u => u.id === m.userId);
        return {
          memberId: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          userName: u?.name || null,
          userEmail: u?.email || null,
          userOpenId: u?.openId || '',
        };
      });
  }),
  addOrgMember: vi.fn(async (orgId: number, userId: number, role: string) => {
    const existing = orgMembersStore.find(m => m.orgId === orgId && m.userId === userId);
    if (existing) {
      existing.role = role;
    } else {
      orgMembersStore.push({ id: memberIdCounter++, orgId, userId, role, joinedAt: new Date() });
    }
  }),
  removeOrgMember: vi.fn(async (orgId: number, userId: number) => {
    const idx = orgMembersStore.findIndex(m => m.orgId === orgId && m.userId === userId);
    if (idx >= 0) orgMembersStore.splice(idx, 1);
  }),
  updateOrgMemberRole: vi.fn(async (orgId: number, userId: number, role: string) => {
    const m = orgMembersStore.find(m => m.orgId === orgId && m.userId === userId);
    if (m) m.role = role;
  }),
  listAllUsers: vi.fn(async () => usersStore),
  getUserByEmail: vi.fn(async (email: string) => usersStore.find(u => u.email === email) || undefined),
  getUserByName: vi.fn(async (name: string) => usersStore.find(u => u.name === name) || undefined),
  getEffectiveSettings: vi.fn(async (userId: number) => {
    const m = orgMembersStore.find(m => m.userId === userId);
    if (m) {
      const s = orgSettingsStore[m.orgId] || {};
      return {
        orgId: m.orgId,
        orgName: orgs[m.orgId]?.name || null,
        orgRole: m.role,
        settings: {
          accessToken: s.accessToken || null,
          tokenLabel: s.tokenLabel || null,
          bmIds: s.bmIds || null,
          accountGroups: s.accountGroups || null,
          manualAccounts: s.manualAccounts || null,
          excludedAccounts: s.excludedAccounts || null,
          accountNames: s.accountNames || null,
          bmCacheData: s.bmCacheData || null,
          autoAccounts: s.autoAccounts || null,
        },
      };
    }
    const s = userSettingsStore[userId] || {};
    return {
      orgId: null,
      orgName: null,
      orgRole: null,
      settings: {
        accessToken: s.accessToken || null,
        tokenLabel: s.tokenLabel || null,
        bmIds: s.bmIds || null,
        accountGroups: s.accountGroups || null,
        manualAccounts: s.manualAccounts || null,
        excludedAccounts: s.excludedAccounts || null,
        accountNames: s.accountNames || null,
        bmCacheData: s.bmCacheData || null,
        autoAccounts: s.autoAccounts || null,
      },
    };
  }),
  saveEffectiveSettings: vi.fn(async (userId: number, data: any) => {
    const m = orgMembersStore.find(m => m.userId === userId);
    if (m) {
      if (!orgSettingsStore[m.orgId]) orgSettingsStore[m.orgId] = {};
      Object.assign(orgSettingsStore[m.orgId], data);
      return { orgId: m.orgId };
    }
    if (!userSettingsStore[userId]) userSettingsStore[userId] = {};
    Object.assign(userSettingsStore[userId], data);
    return { orgId: null };
  }),
  // These are needed for ads router
  saveDisapprovedAds: vi.fn(async () => 0),
  loadDisapprovedAds: vi.fn(async () => []),
  updateSingleAd: vi.fn(async () => true),
  clearDisapprovedAds: vi.fn(async () => {}),
  recordFetchHistory: vi.fn(async () => {}),
  getLatestFetchHistory: vi.fn(async () => null),
  deleteAdsByIds: vi.fn(async () => {}),
  // Auth-related
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => {}),
  getDb: vi.fn(async () => null),
  getUserSettings: vi.fn(async () => null),
  upsertUserSettings: vi.fn(async () => {}),
  deleteUserSettings: vi.fn(async () => {}),
  getOrgSettings: vi.fn(async () => null),
  upsertOrgSettings: vi.fn(async () => {}),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 42, name = "Test User"): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `user${userId}@example.com`,
    name,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {} as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {} as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

const caller = (ctx: TrpcContext) => appRouter.createCaller(ctx);

describe("Organization Management", () => {
  beforeEach(() => {
    // Reset stores
    orgIdCounter = 1;
    memberIdCounter = 1;
    Object.keys(orgs).forEach(k => delete orgs[Number(k)]);
    orgMembersStore.length = 0;
    Object.keys(orgSettingsStore).forEach(k => delete orgSettingsStore[Number(k)]);
    Object.keys(userSettingsStore).forEach(k => delete userSettingsStore[Number(k)]);
  });

  it("should return null when user is not in any org", async () => {
    const ctx = createAuthContext();
    const result = await caller(ctx).org.my();
    expect(result).toBeNull();
  });

  it("should create an org and make user the owner", async () => {
    const ctx = createAuthContext();
    const result = await caller(ctx).org.create({ name: "Test Company" });
    expect(result.success).toBe(true);
    expect(result.orgId).toBe(1);

    const my = await caller(ctx).org.my();
    expect(my).not.toBeNull();
    expect(my!.orgName).toBe("Test Company");
    expect(my!.role).toBe("owner");
  });

  it("should not allow creating a second org when already in one", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "First Company" });
    await expect(caller(ctx).org.create({ name: "Second Company" })).rejects.toThrow("已經加入了一個公司");
  });

  it("should list org members", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    const members = await caller(ctx).org.members();
    expect(members.length).toBe(1);
    expect(members[0].role).toBe("owner");
  });

  it("should add a member to the org", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await caller(ctx).org.addMember({ userId: 100, role: "member" });
    const members = await caller(ctx).org.members();
    expect(members.length).toBe(2);
    expect(members.find(m => m.userId === 100)?.role).toBe("member");
  });

  it("should not allow non-admin to add members", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await caller(ctx).org.addMember({ userId: 100, role: "member" });

    // User 100 is a member, not admin
    const memberCtx = createAuthContext(100, "Other User");
    await expect(caller(memberCtx).org.addMember({ userId: 200, role: "member" })).rejects.toThrow("只有管理員可以新增成員");
  });

  it("should update org name (owner/admin only)", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Old Name" });
    await caller(ctx).org.updateName({ name: "New Name" });
    const my = await caller(ctx).org.my();
    expect(my!.orgName).toBe("New Name");
  });

  it("should remove a member", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await caller(ctx).org.addMember({ userId: 100, role: "member" });
    await caller(ctx).org.removeMember({ userId: 100 });
    const members = await caller(ctx).org.members();
    expect(members.length).toBe(1);
  });

  it("should not allow removing yourself", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await expect(caller(ctx).org.removeMember({ userId: 42 })).rejects.toThrow("不能移除自己");
  });

  it("should allow member to leave (non-owner)", async () => {
    const ownerCtx = createAuthContext();
    await caller(ownerCtx).org.create({ name: "Test Company" });
    await caller(ownerCtx).org.addMember({ userId: 100, role: "member" });

    const memberCtx = createAuthContext(100, "Other User");
    await caller(memberCtx).org.leave();
    const my = await caller(memberCtx).org.my();
    expect(my).toBeNull();
  });

  it("should not allow owner to leave", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await expect(caller(ctx).org.leave()).rejects.toThrow("擁有者不能退出公司");
  });

  it("should update member role (owner only)", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await caller(ctx).org.addMember({ userId: 100, role: "member" });
    await caller(ctx).org.updateMemberRole({ userId: 100, role: "admin" });
    const members = await caller(ctx).org.members();
    expect(members.find(m => m.userId === 100)?.role).toBe("admin");
  });

  it("should reject unauthenticated access", async () => {
    const ctx = createUnauthContext();
    await expect(caller(ctx).org.my()).rejects.toThrow();
  });
});

describe("Org-level Settings Sharing", () => {
  beforeEach(() => {
    orgIdCounter = 1;
    memberIdCounter = 1;
    Object.keys(orgs).forEach(k => delete orgs[Number(k)]);
    orgMembersStore.length = 0;
    Object.keys(orgSettingsStore).forEach(k => delete orgSettingsStore[Number(k)]);
    Object.keys(userSettingsStore).forEach(k => delete userSettingsStore[Number(k)]);
  });

  it("settings.get should return orgId when user is in an org", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    const settings = await caller(ctx).settings.get();
    expect(settings.orgId).toBe(1);
    expect(settings.orgName).toBe("Test Company");
    expect(settings.orgRole).toBe("owner");
  });

  it("settings.get should return null orgId when user is not in an org", async () => {
    const ctx = createAuthContext();
    const settings = await caller(ctx).settings.get();
    expect(settings.orgId).toBeNull();
    expect(settings.orgName).toBeNull();
  });

  it("saveToken should save to org settings when user is in an org", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await caller(ctx).settings.saveToken({ accessToken: "org-token-123" });

    // Another member should see the same token
    await caller(ctx).org.addMember({ userId: 100, role: "member" });
    const memberCtx = createAuthContext(100, "Other User");
    const settings = await caller(memberCtx).settings.get();
    expect(settings.accessToken).toBe("org-token-123");
  });

  it("saveToken should save to user settings when not in an org", async () => {
    const ctx = createAuthContext();
    await caller(ctx).settings.saveToken({ accessToken: "user-token-456" });

    // Different user should NOT see this token
    const otherCtx = createAuthContext(100, "Other User");
    const settings = await caller(otherCtx).settings.get();
    expect(settings.accessToken).toBeNull();
  });

  it("saveAccountNames should merge at org level", async () => {
    const ctx = createAuthContext();
    await caller(ctx).org.create({ name: "Test Company" });
    await caller(ctx).settings.saveAccountNames({ accountNames: JSON.stringify({ "123": "Account A" }) });
    await caller(ctx).settings.saveAccountNames({ accountNames: JSON.stringify({ "456": "Account B" }) });

    const names = await caller(ctx).settings.getAccountNames();
    expect(names).toHaveProperty("123", "Account A");
    expect(names).toHaveProperty("456", "Account B");
  });
});
