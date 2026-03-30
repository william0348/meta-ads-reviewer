/**
 * useSettingsSync — Syncs user settings between localStorage and the database.
 * 
 * On login: loads settings from DB → writes to localStorage
 * On save: writes to localStorage → syncs to DB
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
  type AccountGroup,
} from "@/lib/store";

export function useSettingsSync() {
  const { isAuthenticated, user } = useAuth();
  const hasLoadedFromDb = useRef(false);

  // Query: get settings from DB
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Mutations
  const saveTokenMut = trpc.settings.saveToken.useMutation();
  const saveAllMut = trpc.settings.saveAll.useMutation();

  // On first load after login: sync DB → localStorage
  useEffect(() => {
    if (!isAuthenticated || !settingsQuery.data || hasLoadedFromDb.current) return;
    hasLoadedFromDb.current = true;

    const data = settingsQuery.data;

    // Only overwrite localStorage if DB has data and localStorage is empty
    if (data.accessToken && !getAccessToken()) {
      setAccessToken(data.accessToken);
    }

    if (data.accountGroups && getAccountGroups().length === 0) {
      setAccountGroups(data.accountGroups as unknown as AccountGroup[]);
    }

    if (data.manualAccounts && getManualAccounts().length === 0) {
      setManualAccounts(data.manualAccounts as unknown as string[]);
    }
  }, [isAuthenticated, settingsQuery.data]);

  // Save token to DB
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

  return {
    isLoading: settingsQuery.isLoading,
    dbSettings: settingsQuery.data,
    syncTokenToDb,
    syncAllToDb,
    syncAccountGroupsToDb,
    syncManualAccountsToDb,
    isAuthenticated,
  };
}
