/**
 * useSettingsSync — Syncs settings between localStorage and the database.
 * 
 * Settings are now org-aware: if the user belongs to an org, all settings
 * are stored at the org level (shared). Otherwise, they fall back to user-level.
 * The backend resolves this automatically via getEffectiveSettings / saveEffectiveSettings.
 *
 * On login: loads settings from DB → writes to localStorage
 * On save: writes to localStorage → syncs to DB (org or user)
 */

import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  setAccessToken,
  getAccessToken,
  getAccountGroups,
  setAccountGroups,
  getManualAccounts,
  setManualAccounts,
  setAccountNames,
  getAccountNamesCache,
  setBmIdForAccount,
  getBmIdCache,
  setCachedAutoAccounts,
  getCachedAutoAccounts,
  setExcludedAccounts,
  getExcludedAccounts,
  type AccountGroup,
  type BmIdEntry,
} from "@/lib/store";
import type { AdAccount } from "@/lib/metaApi";

export function useSettingsSync() {
  const { isAuthenticated, user } = useAuth();
  const hasLoadedFromDb = useRef(false);

  // Query: get effective settings (auto-resolves org vs user)
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Mutations
  const saveTokenMut = trpc.settings.saveToken.useMutation();
  const saveAllMut = trpc.settings.saveAll.useMutation();
  const saveAccountNamesMut = trpc.settings.saveAccountNames.useMutation();
  const saveBmCacheMut = trpc.settings.saveBmCache.useMutation();
  const saveAutoAccountsMut = trpc.settings.saveAutoAccounts.useMutation();

  // On first load after login: sync DB → localStorage
  useEffect(() => {
    if (!isAuthenticated || !settingsQuery.data || hasLoadedFromDb.current) return;
    hasLoadedFromDb.current = true;

    const data = settingsQuery.data;

    // Token: DB always takes priority when user is in an org (shared token)
    if (data.accessToken) {
      setAccessToken(data.accessToken);
    } else if (!data.accessToken && !getAccessToken()) {
      // No token anywhere
    }

    if (data.accountGroups && (data.orgId || getAccountGroups().length === 0)) {
      setAccountGroups(data.accountGroups as unknown as AccountGroup[]);
    }

    if (data.manualAccounts && (data.orgId || getManualAccounts().length === 0)) {
      setManualAccounts(data.manualAccounts as unknown as string[]);
    }

    // Sync excluded accounts from DB → localStorage
    if (data.excludedAccounts && Array.isArray(data.excludedAccounts) && data.excludedAccounts.length > 0) {
      setExcludedAccounts(data.excludedAccounts as string[]);
    }

    // Sync account names from DB → localStorage (merge, DB takes priority)
    if (data.accountNames && typeof data.accountNames === 'object' && Object.keys(data.accountNames).length > 0) {
      const dbNames = data.accountNames as Record<string, string>;
      setAccountNames(dbNames);
    }

    // Sync BM cache from DB → localStorage (merge, DB takes priority)
    if (data.bmCacheData && typeof data.bmCacheData === 'object' && Object.keys(data.bmCacheData).length > 0) {
      const dbBmCache = data.bmCacheData as Record<string, BmIdEntry>;
      for (const [accId, entry] of Object.entries(dbBmCache)) {
        if (entry.bmId) {
          setBmIdForAccount(accId, entry.bmId, entry.bmName || '', {
            ownerBmId: entry.ownerBmId,
            ownerBmName: entry.ownerBmName,
            agencyBmId: entry.agencyBmId,
            agencyBmName: entry.agencyBmName,
          });
        }
      }
    }

    // Sync auto accounts from DB → localStorage
    if (data.autoAccounts && Array.isArray(data.autoAccounts) && data.autoAccounts.length > 0) {
      setCachedAutoAccounts(data.autoAccounts as AdAccount[]);
    }
  }, [isAuthenticated, settingsQuery.data]);

  // Save token to DB (auto-resolves org vs user)
  const syncTokenToDb = useCallback(async (token: string) => {
    if (!isAuthenticated) return;
    try {
      await saveTokenMut.mutateAsync({ accessToken: token });
    } catch (e) {
      console.warn("[SettingsSync] Failed to save token to DB:", e);
    }
  }, [isAuthenticated, saveTokenMut]);

  // Save all settings to DB
  const syncAllToDb = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const token = getAccessToken();
      const groups = getAccountGroups();
      const manual = getManualAccounts();
      await saveAllMut.mutateAsync({
        accessToken: token || undefined,
        accountGroups: JSON.stringify(groups),
        manualAccounts: JSON.stringify(manual),
      });
    } catch (e) {
      console.warn("[SettingsSync] Failed to sync all settings to DB:", e);
    }
  }, [isAuthenticated, saveAllMut]);

  // Save account groups to DB
  const syncAccountGroupsToDb = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const groups = getAccountGroups();
      await saveAllMut.mutateAsync({
        accountGroups: JSON.stringify(groups),
      });
    } catch (e) {
      console.warn("[SettingsSync] Failed to sync account groups to DB:", e);
    }
  }, [isAuthenticated, saveAllMut]);

  // Save manual accounts to DB
  const syncManualAccountsToDb = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const manual = getManualAccounts();
      await saveAllMut.mutateAsync({
        manualAccounts: JSON.stringify(manual),
      });
    } catch (e) {
      console.warn("[SettingsSync] Failed to sync manual accounts to DB:", e);
    }
  }, [isAuthenticated, saveAllMut]);

  // Save account names to DB (merge)
  const syncAccountNamesToDb = useCallback(async (names?: Record<string, string>) => {
    if (!isAuthenticated) return;
    try {
      const data = names || getAccountNamesCache();
      if (Object.keys(data).length > 0) {
        await saveAccountNamesMut.mutateAsync({ accountNames: JSON.stringify(data) });
      }
    } catch (e) {
      console.warn("[SettingsSync] Failed to sync account names to DB:", e);
    }
  }, [isAuthenticated, saveAccountNamesMut]);

  // Save BM cache to DB (merge)
  const syncBmCacheToDb = useCallback(async (cache?: Record<string, BmIdEntry>) => {
    if (!isAuthenticated) return;
    try {
      const data = cache || getBmIdCache();
      if (Object.keys(data).length > 0) {
        await saveBmCacheMut.mutateAsync({ bmCache: JSON.stringify(data) });
      }
    } catch (e) {
      console.warn("[SettingsSync] Failed to sync BM cache to DB:", e);
    }
  }, [isAuthenticated, saveBmCacheMut]);

  // Save auto accounts to DB
  const syncAutoAccountsToDb = useCallback(async (accounts?: AdAccount[]) => {
    if (!isAuthenticated) return;
    try {
      const data = accounts || getCachedAutoAccounts();
      if (data.length > 0) {
        await saveAutoAccountsMut.mutateAsync({ autoAccounts: JSON.stringify(data) });
      }
    } catch (e) {
      console.warn("[SettingsSync] Failed to sync auto accounts to DB:", e);
    }
  }, [isAuthenticated, saveAutoAccountsMut]);

  return {
    isLoading: settingsQuery.isLoading,
    dbSettings: settingsQuery.data,
    /** The org ID if user is in an org, null otherwise */
    orgId: settingsQuery.data?.orgId ?? null,
    orgName: settingsQuery.data?.orgName ?? null,
    orgRole: settingsQuery.data?.orgRole ?? null,
    syncTokenToDb,
    syncAllToDb,
    syncAccountGroupsToDb,
    syncManualAccountsToDb,
    syncAccountNamesToDb,
    syncBmCacheToDb,
    syncAutoAccountsToDb,
    isAuthenticated,
  };
}
