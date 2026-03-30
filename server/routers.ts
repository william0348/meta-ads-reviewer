import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getUserSettings, upsertUserSettings } from "./db";
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
        };
      }
      return {
        accessToken: settings.accessToken,
        tokenLabel: settings.tokenLabel,
        bmIds: settings.bmIds ? JSON.parse(settings.bmIds) : null,
        accountGroups: settings.accountGroups ? JSON.parse(settings.accountGroups) : null,
        manualAccounts: settings.manualAccounts ? JSON.parse(settings.manualAccounts) : null,
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

    /** Save all settings at once (bulk update) */
    saveAll: protectedProcedure
      .input(z.object({
        accessToken: z.string().optional(),
        tokenLabel: z.string().optional(),
        bmIds: z.string().optional(),
        accountGroups: z.string().optional(),
        manualAccounts: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const data: Record<string, string | null> = {};
        if (input.accessToken !== undefined) data.accessToken = input.accessToken;
        if (input.tokenLabel !== undefined) data.tokenLabel = input.tokenLabel;
        if (input.bmIds !== undefined) data.bmIds = input.bmIds;
        if (input.accountGroups !== undefined) data.accountGroups = input.accountGroups;
        if (input.manualAccounts !== undefined) data.manualAccounts = input.manualAccounts;
        await upsertUserSettings(ctx.user.id, data);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
