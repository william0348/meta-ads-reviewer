import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getUserSettings, upsertUserSettings,
  saveDisapprovedAds, loadDisapprovedAds, updateSingleAd,
  clearDisapprovedAds, recordFetchHistory, getLatestFetchHistory,
  createOrganization, getOrganization, updateOrganizationName,
  getUserOrg, listOrgMembers, addOrgMember, removeOrgMember, updateOrgMemberRole,
  getOrgSettings, upsertOrgSettings,
  getEffectiveSettings, saveEffectiveSettings,
  getUserByEmail, getUserByName, listAllUsers,
} from "./db";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Organization Management ───
  org: router({
    /** Get current user's org info (or null if not in any org) */
    my: protectedProcedure.query(async ({ ctx }) => {
      const membership = await getUserOrg(ctx.user.id);
      if (!membership) return null;
      return {
        orgId: membership.orgId,
        orgName: membership.orgName,
        role: membership.role,
        joinedAt: membership.joinedAt,
      };
    }),

    /** Create a new organization */
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is already in an org
        const existing = await getUserOrg(ctx.user.id);
        if (existing) {
          throw new Error('您已經加入了一個公司，請先退出後再建立新公司');
        }
        const orgId = await createOrganization(input.name, ctx.user.id);
        return { orgId, success: true };
      }),

    /** Update org name (owner/admin only) */
    updateName: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        if (!membership) throw new Error('您不在任何公司中');
        if (membership.role !== 'owner' && membership.role !== 'admin') {
          throw new Error('只有管理員可以修改公司名稱');
        }
        await updateOrganizationName(membership.orgId, input.name);
        return { success: true };
      }),

    /** List all members of the user's org */
    members: protectedProcedure.query(async ({ ctx }) => {
      const membership = await getUserOrg(ctx.user.id);
      if (!membership) return [];
      return listOrgMembers(membership.orgId);
    }),

    /** Add a member to the org (owner/admin only) */
    addMember: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['admin', 'member']).default('member'),
      }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        if (!membership) throw new Error('您不在任何公司中');
        if (membership.role !== 'owner' && membership.role !== 'admin') {
          throw new Error('只有管理員可以新增成員');
        }
        // Check if target user is already in another org
        const targetOrg = await getUserOrg(input.userId);
        if (targetOrg && targetOrg.orgId !== membership.orgId) {
          throw new Error('該用戶已加入其他公司');
        }
        await addOrgMember(membership.orgId, input.userId, input.role);
        return { success: true };
      }),

    /** Remove a member from the org (owner/admin only) */
    removeMember: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        if (!membership) throw new Error('您不在任何公司中');
        if (membership.role !== 'owner' && membership.role !== 'admin') {
          throw new Error('只有管理員可以移除成員');
        }
        if (input.userId === ctx.user.id) {
          throw new Error('不能移除自己，請使用退出功能');
        }
        await removeOrgMember(membership.orgId, input.userId);
        return { success: true };
      }),

    /** Update a member's role (owner only) */
    updateMemberRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['admin', 'member']),
      }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        if (!membership) throw new Error('您不在任何公司中');
        if (membership.role !== 'owner') {
          throw new Error('只有擁有者可以修改成員角色');
        }
        await updateOrgMemberRole(membership.orgId, input.userId, input.role);
        return { success: true };
      }),

    /** Leave the org (member/admin can leave, owner cannot) */
    leave: protectedProcedure.mutation(async ({ ctx }) => {
      const membership = await getUserOrg(ctx.user.id);
      if (!membership) throw new Error('您不在任何公司中');
      if (membership.role === 'owner') {
        throw new Error('擁有者不能退出公司，請先轉讓擁有權');
      }
      await removeOrgMember(membership.orgId, ctx.user.id);
      return { success: true };
    }),

    /** List all users in the system (for inviting) — owner/admin only */
    allUsers: protectedProcedure.query(async ({ ctx }) => {
      const membership = await getUserOrg(ctx.user.id);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        return [];
      }
      return listAllUsers();
    }),

    /** Search user by email or name for inviting */
    searchUser: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
          throw new Error('只有管理員可以搜尋用戶');
        }
        // Try email first, then name
        let user = await getUserByEmail(input.query);
        if (!user) user = await getUserByName(input.query);
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.email, openId: user.openId };
      }),
  }),

  // ─── Settings (auto-resolves org vs user) ───
  settings: router({
    /** Get effective settings (org-level if in org, otherwise user-level) */
    get: protectedProcedure.query(async ({ ctx }) => {
      const effective = await getEffectiveSettings(ctx.user.id);
      const s = effective.settings;
      return {
        orgId: effective.orgId,
        orgName: effective.orgName,
        orgRole: effective.orgRole,
        accessToken: s.accessToken,
        tokenLabel: s.tokenLabel,
        bmIds: s.bmIds ? JSON.parse(s.bmIds) : null,
        accountGroups: s.accountGroups ? JSON.parse(s.accountGroups) : null,
        manualAccounts: s.manualAccounts ? JSON.parse(s.manualAccounts) : null,
        excludedAccounts: s.excludedAccounts ? JSON.parse(s.excludedAccounts) : [],
        accountNames: s.accountNames ? JSON.parse(s.accountNames) : {},
        bmCacheData: s.bmCacheData ? JSON.parse(s.bmCacheData) : {},
        autoAccounts: s.autoAccounts ? JSON.parse(s.autoAccounts) : [],
      };
    }),

    /** Save/update the access token (to org or user) */
    saveToken: protectedProcedure
      .input(z.object({
        accessToken: z.string().min(1),
        tokenLabel: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveEffectiveSettings(ctx.user.id, {
          accessToken: input.accessToken,
          tokenLabel: input.tokenLabel ?? null,
        });
        return { success: true };
      }),

    /** Save/update BM IDs */
    saveBmIds: protectedProcedure
      .input(z.object({
        bmIds: z.array(z.object({
          id: z.string(),
          name: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveEffectiveSettings(ctx.user.id, {
          bmIds: JSON.stringify(input.bmIds),
        });
        return { success: true };
      }),

    /** Save/update account groups */
    saveAccountGroups: protectedProcedure
      .input(z.object({
        accountGroups: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveEffectiveSettings(ctx.user.id, {
          accountGroups: input.accountGroups,
        });
        return { success: true };
      }),

    /** Save/update manual accounts */
    saveManualAccounts: protectedProcedure
      .input(z.object({
        manualAccounts: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveEffectiveSettings(ctx.user.id, {
          manualAccounts: input.manualAccounts,
        });
        return { success: true };
      }),

    /** Save/update excluded accounts */
    saveExcludedAccounts: protectedProcedure
      .input(z.object({
        excludedAccounts: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveEffectiveSettings(ctx.user.id, {
          excludedAccounts: JSON.stringify(input.excludedAccounts),
        });
        return { success: true };
      }),

    /** Save all settings at once (bulk update) */
    saveAll: protectedProcedure
      .input(z.object({
        accessToken: z.string().optional(),
        tokenLabel: z.string().optional(),
        bmIds: z.string().optional(),
        accountGroups: z.string().optional(),
        manualAccounts: z.string().optional(),
        excludedAccounts: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const data: Record<string, string | null> = {};
        if (input.accessToken !== undefined) data.accessToken = input.accessToken;
        if (input.tokenLabel !== undefined) data.tokenLabel = input.tokenLabel;
        if (input.bmIds !== undefined) data.bmIds = input.bmIds;
        if (input.accountGroups !== undefined) data.accountGroups = input.accountGroups;
        if (input.manualAccounts !== undefined) data.manualAccounts = input.manualAccounts;
        if (input.excludedAccounts !== undefined) data.excludedAccounts = input.excludedAccounts;
        await saveEffectiveSettings(ctx.user.id, data);
        return { success: true };
      }),

    /** Save/update account names cache (merge strategy) */
    saveAccountNames: protectedProcedure
      .input(z.object({
        accountNames: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const effective = await getEffectiveSettings(ctx.user.id);
        let merged: Record<string, string> = {};
        if (effective.settings.accountNames) {
          try { merged = JSON.parse(effective.settings.accountNames); } catch {}
        }
        const incoming: Record<string, string> = JSON.parse(input.accountNames);
        for (const [id, name] of Object.entries(incoming)) {
          merged[id.replace(/^act_/, '')] = name;
        }
        await saveEffectiveSettings(ctx.user.id, {
          accountNames: JSON.stringify(merged),
        });
        return { success: true };
      }),

    /** Get account names */
    getAccountNames: protectedProcedure.query(async ({ ctx }) => {
      const effective = await getEffectiveSettings(ctx.user.id);
      if (!effective.settings.accountNames) return {};
      try { return JSON.parse(effective.settings.accountNames) as Record<string, string>; } catch { return {}; }
    }),

    /** Save/update BM cache (merge strategy) */
    saveBmCache: protectedProcedure
      .input(z.object({
        bmCache: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const effective = await getEffectiveSettings(ctx.user.id);
        let merged: Record<string, unknown> = {};
        if (effective.settings.bmCacheData) {
          try { merged = JSON.parse(effective.settings.bmCacheData); } catch {}
        }
        const incoming = JSON.parse(input.bmCache);
        for (const [id, entry] of Object.entries(incoming)) {
          merged[id.replace(/^act_/, '')] = entry;
        }
        await saveEffectiveSettings(ctx.user.id, {
          bmCacheData: JSON.stringify(merged),
        });
        return { success: true };
      }),

    /** Get BM cache */
    getBmCache: protectedProcedure.query(async ({ ctx }) => {
      const effective = await getEffectiveSettings(ctx.user.id);
      if (!effective.settings.bmCacheData) return {};
      try { return JSON.parse(effective.settings.bmCacheData); } catch { return {}; }
    }),

    /** Save/update auto accounts */
    saveAutoAccounts: protectedProcedure
      .input(z.object({
        autoAccounts: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveEffectiveSettings(ctx.user.id, {
          autoAccounts: input.autoAccounts,
        });
        return { success: true };
      }),

    /** Get auto accounts */
    getAutoAccounts: protectedProcedure.query(async ({ ctx }) => {
      const effective = await getEffectiveSettings(ctx.user.id);
      if (!effective.settings.autoAccounts) return [];
      try { return JSON.parse(effective.settings.autoAccounts); } catch { return []; }
    }),
  }),

  // ─── Disapproved Ads (Persistent Cache — org-aware) ───
  ads: router({
    /** Save a batch of disapproved ads to the database */
    save: protectedProcedure
      .input(z.object({
        ads: z.array(z.object({
          adId: z.string(),
          accountId: z.string(),
          adName: z.string().optional(),
          effectiveStatus: z.string().optional(),
          adData: z.string(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        const orgId = membership?.orgId ?? null;
        const count = await saveDisapprovedAds(ctx.user.id, input.ads, orgId);
        return { success: true, savedCount: count };
      }),

    /** Load all saved disapproved ads from the database */
    load: protectedProcedure.query(async ({ ctx }) => {
      const membership = await getUserOrg(ctx.user.id);
      const orgId = membership?.orgId ?? null;
      const rows = await loadDisapprovedAds(ctx.user.id, orgId);
      return {
        ads: rows.map(row => ({
          adId: row.adId,
          accountId: row.accountId,
          adName: row.adName,
          effectiveStatus: row.effectiveStatus,
          adData: row.adData,
          lastRefreshedAt: row.lastRefreshedAt,
        })),
      };
    }),

    /** Update a single ad after per-ad refresh */
    updateOne: protectedProcedure
      .input(z.object({
        adId: z.string(),
        adName: z.string().optional(),
        effectiveStatus: z.string().optional(),
        adData: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        const orgId = membership?.orgId ?? null;
        const ok = await updateSingleAd(ctx.user.id, input.adId, {
          adName: input.adName,
          effectiveStatus: input.effectiveStatus,
          adData: input.adData,
        }, orgId);
        return { success: ok };
      }),

    /** Clear all saved ads */
    clear: protectedProcedure.mutation(async ({ ctx }) => {
      const membership = await getUserOrg(ctx.user.id);
      const orgId = membership?.orgId ?? null;
      await clearDisapprovedAds(ctx.user.id, orgId);
      return { success: true };
    }),

    /** Record a fetch history entry */
    recordFetch: protectedProcedure
      .input(z.object({
        accountCount: z.number(),
        adCount: z.number(),
        errorCount: z.number(),
        errors: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrg(ctx.user.id);
        const orgId = membership?.orgId ?? null;
        await recordFetchHistory(ctx.user.id, input, orgId);
        return { success: true };
      }),

    /** Get the latest fetch history */
    lastFetch: protectedProcedure.query(async ({ ctx }) => {
      const membership = await getUserOrg(ctx.user.id);
      const orgId = membership?.orgId ?? null;
      const history = await getLatestFetchHistory(ctx.user.id, orgId);
      return history;
    }),
  }),
});

export type AppRouter = typeof appRouter;
