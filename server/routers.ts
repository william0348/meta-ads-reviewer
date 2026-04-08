import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getUserSettings, upsertUserSettings,
  saveDisapprovedAds, loadDisapprovedAds, updateSingleAd,
  clearDisapprovedAds, recordFetchHistory, getLatestFetchHistory,
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

  // ─── User Settings (Meta API Token, BM IDs, Account Groups) ───
  settings: router({
    /** Get the current user's settings (token, BM IDs, account groups) */
    get: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getUserSettings(ctx.user.id);
      if (!settings) {
      return {
        accessToken: null,
        tokenLabel: null,
        bmIds: null,
        accountGroups: null,
        manualAccounts: null,
        excludedAccounts: [],
        accountNames: {},
        bmCacheData: {},
        autoAccounts: [],
      };
      }
      return {
        accessToken: settings.accessToken,
        tokenLabel: settings.tokenLabel,
        bmIds: settings.bmIds ? JSON.parse(settings.bmIds) : null,
        accountGroups: settings.accountGroups ? JSON.parse(settings.accountGroups) : null,
        manualAccounts: settings.manualAccounts ? JSON.parse(settings.manualAccounts) : null,
        excludedAccounts: settings.excludedAccounts ? JSON.parse(settings.excludedAccounts) : [],
        accountNames: settings.accountNames ? JSON.parse(settings.accountNames) : {},
        bmCacheData: settings.bmCacheData ? JSON.parse(settings.bmCacheData) : {},
        autoAccounts: settings.autoAccounts ? JSON.parse(settings.autoAccounts) : [],
      };
    }),

    /** Save/update the user's access token */
    saveToken: protectedProcedure
      .input(z.object({
        accessToken: z.string().min(1),
        tokenLabel: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserSettings(ctx.user.id, {
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
        await upsertUserSettings(ctx.user.id, {
          bmIds: JSON.stringify(input.bmIds),
        });
        return { success: true };
      }),

    /** Save/update account groups */
    saveAccountGroups: protectedProcedure
      .input(z.object({
        accountGroups: z.string(), // JSON string
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserSettings(ctx.user.id, {
          accountGroups: input.accountGroups,
        });
        return { success: true };
      }),

    /** Save/update manual accounts */
    saveManualAccounts: protectedProcedure
      .input(z.object({
        manualAccounts: z.string(), // JSON string
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserSettings(ctx.user.id, {
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
        await upsertUserSettings(ctx.user.id, {
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
        await upsertUserSettings(ctx.user.id, data);
        return { success: true };
      }),

    /** Save/update account names cache */
    saveAccountNames: protectedProcedure
      .input(z.object({
        accountNames: z.string(), // JSON string of Record<string, string>
      }))
      .mutation(async ({ ctx, input }) => {
        // Merge with existing account names in DB
        const existing = await getUserSettings(ctx.user.id);
        let merged: Record<string, string> = {};
        if (existing?.accountNames) {
          try { merged = JSON.parse(existing.accountNames); } catch {}
        }
        const incoming: Record<string, string> = JSON.parse(input.accountNames);
        for (const [id, name] of Object.entries(incoming)) {
          merged[id.replace(/^act_/, '')] = name;
        }
        await upsertUserSettings(ctx.user.id, {
          accountNames: JSON.stringify(merged),
        });
        return { success: true };
      }),

    /** Get account names from DB */
    getAccountNames: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getUserSettings(ctx.user.id);
      if (!settings?.accountNames) return {};
      try { return JSON.parse(settings.accountNames) as Record<string, string>; } catch { return {}; }
    }),

    /** Save/update BM cache */
    saveBmCache: protectedProcedure
      .input(z.object({
        bmCache: z.string(), // JSON string of Record<string, BmIdEntry>
      }))
      .mutation(async ({ ctx, input }) => {
        // Merge with existing BM cache in DB
        const existing = await getUserSettings(ctx.user.id);
        let merged: Record<string, unknown> = {};
        if (existing?.bmCacheData) {
          try { merged = JSON.parse(existing.bmCacheData); } catch {}
        }
        const incoming = JSON.parse(input.bmCache);
        for (const [id, entry] of Object.entries(incoming)) {
          merged[id.replace(/^act_/, '')] = entry;
        }
        await upsertUserSettings(ctx.user.id, {
          bmCacheData: JSON.stringify(merged),
        });
        return { success: true };
      }),

    /** Get BM cache from DB */
    getBmCache: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getUserSettings(ctx.user.id);
      if (!settings?.bmCacheData) return {};
      try { return JSON.parse(settings.bmCacheData); } catch { return {}; }
    }),

    /** Save/update auto accounts */
    saveAutoAccounts: protectedProcedure
      .input(z.object({
        autoAccounts: z.string(), // JSON string of AdAccount[]
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserSettings(ctx.user.id, {
          autoAccounts: input.autoAccounts,
        });
        return { success: true };
      }),

    /** Get auto accounts from DB */
    getAutoAccounts: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getUserSettings(ctx.user.id);
      if (!settings?.autoAccounts) return [];
      try { return JSON.parse(settings.autoAccounts); } catch { return []; }
    }),
  }),

  // ─── Disapproved Ads (Persistent Cache) ───
  ads: router({
    /** Save a batch of disapproved ads to the database */
    save: protectedProcedure
      .input(z.object({
        ads: z.array(z.object({
          adId: z.string(),
          accountId: z.string(),
          adName: z.string().optional(),
          effectiveStatus: z.string().optional(),
          adData: z.string(), // JSON string of full DisapprovedAd
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const count = await saveDisapprovedAds(ctx.user.id, input.ads);
        return { success: true, savedCount: count };
      }),

    /** Load all saved disapproved ads from the database */
    load: protectedProcedure.query(async ({ ctx }) => {
      const rows = await loadDisapprovedAds(ctx.user.id);
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
        adData: z.string(), // JSON string of full DisapprovedAd
      }))
      .mutation(async ({ ctx, input }) => {
        const ok = await updateSingleAd(ctx.user.id, input.adId, {
          adName: input.adName,
          effectiveStatus: input.effectiveStatus,
          adData: input.adData,
        });
        return { success: ok };
      }),

    /** Clear all saved ads for the current user */
    clear: protectedProcedure.mutation(async ({ ctx }) => {
      await clearDisapprovedAds(ctx.user.id);
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
        await recordFetchHistory(ctx.user.id, input);
        return { success: true };
      }),

    /** Get the latest fetch history */
    lastFetch: protectedProcedure.query(async ({ ctx }) => {
      const history = await getLatestFetchHistory(ctx.user.id);
      return history;
    }),
  }),
});

export type AppRouter = typeof appRouter;
