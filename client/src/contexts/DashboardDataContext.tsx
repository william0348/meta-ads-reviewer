/**
 * DashboardDataContext — Global context for background data fetching.
 * 
 * This context persists across page navigation so that:
 * 1. Data loading continues in the background even when user navigates away
 * 2. When returning to Dashboard, previously loaded data is immediately available
 * 3. Auto-refresh can run on a configurable interval
 * 4. Fetched ads are persisted to the database for cross-session availability
 * 5. Individual ads can be refreshed without reloading all accounts
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import {
  fetchAdAccounts, fetchAllDisapprovedAds, parseReviewFeedback,
  extractPolicyViolations, fetchBmIdsForAccounts, fetchSingleAd,
  type DisapprovedAd, type BatchAppealResult,
} from "@/lib/metaApi";
import {
  getAccessToken, getManualAccounts, getAutoFetch,
  getCachedAds, setCachedAds, clearCachedAds, getCacheAge,
  getAccountGroups, getBmIdCache, setBmIdForAccount,
  getAccountNamesCache, setAccountNames, getExcludedAccounts,
  getCachedAutoAccounts,
} from "@/lib/store";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface BatchProgress {
  completed: number;
  total: number;
  batch: number;
  totalBatches: number;
}

export interface DashboardDataState {
  ads: DisapprovedAd[];
  loading: boolean;
  errors: { accountId: string; error: string }[];
  cacheAge: string | null;
  bmCache: Record<string, { bmId: string; bmName: string }>;
  accountNames: Record<string, string>;
  batchProgress: BatchProgress | null;
  lastFetchTime: number | null;
  autoRefreshInterval: number | null; // in minutes, null = disabled
  dbLoaded: boolean; // whether we've loaded from DB
  refreshingAdId: string | null; // ad currently being refreshed
}

export interface DashboardDataActions {
  fetchData: () => Promise<void>;
  clearCache: () => void;
  setAutoRefreshInterval: (minutes: number | null) => void;
  setAds: React.Dispatch<React.SetStateAction<DisapprovedAd[]>>;
  setErrors: React.Dispatch<React.SetStateAction<{ accountId: string; error: string }[]>>;
  refreshSingleAd: (adId: string) => Promise<DisapprovedAd | null>;
}

const DashboardDataContext = createContext<(DashboardDataState & DashboardDataActions) | null>(null);

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error("useDashboardData must be used within DashboardDataProvider");
  return ctx;
}

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [ads, setAds] = useState<DisapprovedAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ accountId: string; error: string }[]>([]);
  const [cacheAge, setCacheAgeStr] = useState<string | null>(null);
  const [bmCache, setBmCache] = useState<Record<string, { bmId: string; bmName: string }>>({});
  const [accountNames, setAccountNamesState] = useState<Record<string, string>>({});
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [refreshingAdId, setRefreshingAdId] = useState<string | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number | null>(() => {
    const saved = localStorage.getItem("meta_ads_auto_refresh");
    return saved ? parseInt(saved) : null;
  });

  const fetchingRef = useRef(false);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // tRPC mutations for DB persistence
  const saveAdsMutation = trpc.ads.save.useMutation();
  const clearAdsMutation = trpc.ads.clear.useMutation();
  const updateAdMutation = trpc.ads.updateOne.useMutation();
  const recordFetchMutation = trpc.ads.recordFetch.useMutation();

  // Load from DB on mount (primary source of truth)
  const { data: dbAds, isLoading: dbLoading, refetch: refetchDbAds } = trpc.ads.load.useQuery(
    undefined,
    { enabled: true, staleTime: Infinity, refetchOnWindowFocus: false }
  );

  // Load from DB when data arrives
  useEffect(() => {
    if (dbAds && !dbLoaded && !dbLoading) {
      if (dbAds.ads.length > 0) {
        try {
          // Get Active account IDs to filter out disabled accounts
          const activeAccounts = getCachedAutoAccounts();
          const activeAccountIds = new Set(
            activeAccounts.map(a => (a.account_id || a.id || '').replace(/^act_/, ''))
          );
          const excludedAccounts = new Set(getExcludedAccounts());
          const hasActiveFilter = activeAccountIds.size > 0;

          const allParsedAds: DisapprovedAd[] = dbAds.ads.map(row => {
            const adData = JSON.parse(row.adData) as DisapprovedAd;
            return {
              ...adData,
              parsed_review_feedback: adData.parsed_review_feedback ?? parseReviewFeedback(adData.ad_review_feedback),
              policy_violations: adData.policy_violations ?? extractPolicyViolations(adData.ad_review_feedback, adData.issues_info),
            };
          });

          // Filter: only keep ads from Active & non-excluded accounts
          const parsedAds = allParsedAds.filter(ad => {
            const accId = (ad.account_id || '').replace(/^act_/, '');
            if (excludedAccounts.has(accId)) return false;
            if (hasActiveFilter && !activeAccountIds.has(accId)) return false;
            return true;
          });

          const filteredCount = allParsedAds.length - parsedAds.length;
          setAds(parsedAds);
          // Also update localStorage cache for offline/quick access
          setCachedAds(parsedAds, []);
          setCacheAgeStr(getCacheAge() || '從資料庫載入');
          if (filteredCount > 0) {
            toast.success(`已從資料庫載入 ${parsedAds.length} 個被拒登廣告（已過濾 ${filteredCount} 個非 Active/已排除帳號的廣告）`);
          } else {
            toast.success(`已從資料庫載入 ${parsedAds.length} 個被拒登廣告`);
          }
        } catch (err) {
          console.error('[DB] Failed to parse saved ads:', err);
        }
      } else {
        // No DB data — fall back to localStorage cache
        const cached = getCachedAds();
        if (cached) {
          const lsActiveAccounts = getCachedAutoAccounts();
          const lsActiveIds = new Set(
            lsActiveAccounts.map(a => (a.account_id || a.id || '').replace(/^act_/, ''))
          );
          const lsExcluded = new Set(getExcludedAccounts());
          const lsHasFilter = lsActiveIds.size > 0;

          const reparsed = cached.ads
            .map((ad) => ({
              ...ad,
              parsed_review_feedback: ad.parsed_review_feedback ?? parseReviewFeedback(ad.ad_review_feedback),
              policy_violations: ad.policy_violations ?? extractPolicyViolations(ad.ad_review_feedback, ad.issues_info),
            }))
            .filter(ad => {
              const accId = (ad.account_id || '').replace(/^act_/, '');
              if (lsExcluded.has(accId)) return false;
              if (lsHasFilter && !lsActiveIds.has(accId)) return false;
              return true;
            });
          setAds(reparsed);
          setErrors(cached.errors);
          setCacheAgeStr(getCacheAge());
        }
      }
      setDbLoaded(true);
    }
  }, [dbAds, dbLoaded, dbLoading]);

  // Load BM cache and account names on mount
  useEffect(() => {
    setBmCache(getBmIdCache());
    setAccountNamesState(getAccountNamesCache());
  }, []);

  // Refresh cache age display every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCacheAgeStr(getCacheAge());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Save auto-refresh setting to localStorage
  useEffect(() => {
    if (autoRefreshInterval !== null) {
      localStorage.setItem("meta_ads_auto_refresh", String(autoRefreshInterval));
    } else {
      localStorage.removeItem("meta_ads_auto_refresh");
    }
  }, [autoRefreshInterval]);

  /**
   * Save ads to DB in background (non-blocking).
   */
  const saveAdsToDb = useCallback(async (adsToSave: DisapprovedAd[]) => {
    if (adsToSave.length === 0) return;
    try {
      // Convert ads to DB format — chunk to avoid payload size issues
      const chunkSize = 100;
      for (let i = 0; i < adsToSave.length; i += chunkSize) {
        const chunk = adsToSave.slice(i, i + chunkSize);
        const dbAds = chunk.map(ad => ({
          adId: ad.id,
          accountId: ad.account_id || '',
          adName: ad.name || undefined,
          effectiveStatus: ad.effective_status || undefined,
          adData: JSON.stringify(ad),
        }));
        await saveAdsMutation.mutateAsync({ ads: dbAds });
      }
      console.log(`[DB] Saved ${adsToSave.length} ads to database`);
    } catch (err) {
      console.warn('[DB] Failed to save ads to database:', err);
    }
  }, [saveAdsMutation]);

  const fetchData = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error("請先在設定頁面配置 Access Token");
      return;
    }

    // Prevent concurrent fetches
    if (fetchingRef.current) {
      toast.info("資料正在載入中，請稍候...");
      return;
    }

    fetchingRef.current = true;
    setLoading(true);
    setAds([]);
    setErrors([]);
    setBatchProgress(null);

    try {
      const accountIds: string[] = [];
      const autoFetch = getAutoFetch();
      const manualAccounts = getManualAccounts();
      const groupAccounts = getAccountGroups().flatMap((g) => g.accountIds);

      if (autoFetch) {
        try {
          const fetchedAccounts = await fetchAdAccounts(accessToken);
          // Only include Active accounts (account_status === 1)
          const activeAccounts = fetchedAccounts.filter((a) => a.account_status === 1);
          const skippedCount = fetchedAccounts.length - activeAccounts.length;
          accountIds.push(...activeAccounts.map((a) => a.id));
          if (skippedCount > 0) {
            toast.info(`已跳過 ${skippedCount} 個非 Active 帳號（僅抓取 Active 帳號的被拒登廣告）`);
          }
        } catch (err) {
          toast.error("無法取得廣告帳號列表：" + (err instanceof Error ? err.message : "未知錯誤"));
        }
      }

      // Add manual accounts
      for (const id of manualAccounts) {
        const formattedId = id.startsWith("act_") ? id : `act_${id}`;
        if (!accountIds.includes(formattedId)) {
          accountIds.push(formattedId);
        }
      }

      // Add group accounts
      for (const id of groupAccounts) {
        const formattedId = id.startsWith("act_") ? id : `act_${id}`;
        if (!accountIds.includes(formattedId)) {
          accountIds.push(formattedId);
        }
      }

      // Filter out excluded accounts
      const excludedAccounts = getExcludedAccounts();
      const filteredAccountIds = accountIds.filter(id => {
        const numId = id.replace(/^act_/, '');
        return !excludedAccounts.includes(numId);
      });

      if (filteredAccountIds.length === 0) {
        toast.error("沒有找到任何廣告帳號。請確認 Token 權限或手動新增帳號。（排除帳號：" + excludedAccounts.length + "）");
        setLoading(false);
        fetchingRef.current = false;
        return;
      }

      if (excludedAccounts.length > 0) {
        toast.info(`已排除 ${excludedAccounts.length} 個帳號，實際抓取 ${filteredAccountIds.length} 個帳號`);
      }

      const totalAccounts = filteredAccountIds.length;
      const batchSize = 20;
      const totalBatches = Math.ceil(totalAccounts / batchSize);
      toast.info(`背景載入中：從 ${totalAccounts} 個帳號搜尋被拒登廣告（共 ${totalBatches} 批）...`);

      // Use incremental loading — update UI after each batch
      const result = await fetchAllDisapprovedAds(accessToken, filteredAccountIds, (update) => {
        setBatchProgress({
          completed: update.completedAccounts,
          total: update.totalAccounts,
          batch: update.currentBatchIndex,
          totalBatches: update.totalBatches,
        });

        // Incrementally update displayed ads after each batch
        setAds((prev) => {
          const existingIds = new Set(prev.map(a => a.id));
          const newAds = update.batchAds.filter(a => !existingIds.has(a.id));
          return [...prev, ...newAds];
        });
        setErrors((prev) => [...prev, ...update.batchErrors]);

        // Update account names incrementally
        const names: Record<string, string> = {};
        for (const ad of update.batchAds) {
          if (ad.account_name && ad.account_id) {
            names[ad.account_id.replace(/^act_/, '')] = ad.account_name;
          }
        }
        if (Object.keys(names).length > 0) {
          setAccountNames(names);
          setAccountNamesState(getAccountNamesCache());
        }
      });

      // Final state
      setAds(result.ads);
      setErrors(result.errors);
      setBatchProgress(null);
      setLastFetchTime(Date.now());

      // Save to localStorage cache
      setCachedAds(result.ads, result.errors);
      setCacheAgeStr("剛剛");

      // Save to DB in background (non-blocking)
      saveAdsToDb(result.ads);

      // Record fetch history
      try {
        await recordFetchMutation.mutateAsync({
          accountCount: accountIds.length,
          adCount: result.ads.length,
          errorCount: result.errors.length,
          errors: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined,
        });
      } catch {
        console.warn('[DB] Failed to record fetch history');
      }

      // Update account names from all ads
      const names: Record<string, string> = {};
      for (const ad of result.ads) {
        if (ad.account_name && ad.account_id) {
          names[ad.account_id.replace(/^act_/, '')] = ad.account_name;
        }
      }
      if (Object.keys(names).length > 0) {
        setAccountNames(names);
        setAccountNamesState(getAccountNamesCache());
      }

      if (result.ads.length > 0) {
        toast.success(`背景載入完成！共找到 ${result.ads.length} 個被拒登廣告（已儲存至資料庫）`);
      } else {
        toast.info("沒有找到被拒登的廣告");
      }

      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} 個帳號發生錯誤`);
      }

      // Auto-fetch BM IDs
      const currentBmCache = getBmIdCache();
      const allAccountIdsForBm = Array.from(new Set(
        accountIds.map(id => id.replace(/^act_/, ''))
      ));
      const uncachedBmIds = allAccountIdsForBm.filter(id => !currentBmCache[id]);
      if (uncachedBmIds.length > 0 && accessToken) {
        try {
          const bmResults = await fetchBmIdsForAccounts(accessToken, uncachedBmIds);
          for (const [accountId, bm] of Object.entries(bmResults)) {
            setBmIdForAccount(accountId, bm.bmId, bm.bmName, {
              ownerBmId: bm.ownerBmId,
              ownerBmName: bm.ownerBmName,
              agencyBmId: bm.agencyBmId,
              agencyBmName: bm.agencyBmName,
            });
          }
          setBmCache(getBmIdCache());
          if (Object.keys(bmResults).length > 0) {
            toast.success(`自動取得 ${Object.keys(bmResults).length} 個帳號的 BM ID`);
          }
        } catch {
          console.warn('Auto BM ID fetch failed');
        }
      }
    } catch (err) {
      toast.error("發生錯誤：" + (err instanceof Error ? err.message : "未知錯誤"));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [saveAdsToDb, recordFetchMutation]);

  /**
   * Refresh a single ad's data from Meta API and update both local state and DB.
   */
  const refreshSingleAd = useCallback(async (adId: string): Promise<DisapprovedAd | null> => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error("請先設定 Access Token");
      return null;
    }

    setRefreshingAdId(adId);
    try {
      const updatedAd = await fetchSingleAd(accessToken, adId);
      if (!updatedAd) {
        toast.info("此廣告已不存在或無法取得");
        return null;
      }

      // Preserve account_id and account_name from existing ad
      const existingAd = ads.find(a => a.id === adId);
      if (existingAd) {
        updatedAd.account_id = existingAd.account_id;
        updatedAd.account_name = existingAd.account_name;
      }

      // Update local state
      setAds(prev => prev.map(ad => ad.id === adId ? updatedAd : ad));

      // Update localStorage cache
      const currentAds = ads.map(ad => ad.id === adId ? updatedAd : ad);
      setCachedAds(currentAds, errors);

      // Update DB
      try {
        await updateAdMutation.mutateAsync({
          adId: updatedAd.id,
          adName: updatedAd.name || undefined,
          effectiveStatus: updatedAd.effective_status || undefined,
          adData: JSON.stringify(updatedAd),
        });
      } catch {
        console.warn('[DB] Failed to update single ad in database');
      }

      toast.success(`廣告 ${adId} 已更新`);
      return updatedAd;
    } catch (err) {
      toast.error(`更新失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
      return null;
    } finally {
      setRefreshingAdId(null);
    }
  }, [ads, errors, updateAdMutation]);

  const clearCache = useCallback(() => {
    clearCachedAds();
    setAds([]);
    setErrors([]);
    setCacheAgeStr(null);
    setLastFetchTime(null);
    // Also clear DB
    clearAdsMutation.mutate(undefined, {
      onSuccess: () => console.log('[DB] Cleared ads from database'),
      onError: () => console.warn('[DB] Failed to clear ads from database'),
    });
    toast.success("快取已清除（含資料庫）");
  }, [clearAdsMutation]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    if (autoRefreshInterval && autoRefreshInterval > 0) {
      const intervalMs = autoRefreshInterval * 60 * 1000;
      autoRefreshTimerRef.current = setInterval(() => {
        if (!fetchingRef.current) {
          console.log(`[Auto-refresh] Triggering refresh (every ${autoRefreshInterval} min)`);
          fetchData();
        }
      }, intervalMs);
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefreshInterval, fetchData]);

  return (
    <DashboardDataContext.Provider
      value={{
        ads, loading, errors, cacheAge, bmCache, accountNames,
        batchProgress, lastFetchTime, autoRefreshInterval,
        dbLoaded, refreshingAdId,
        fetchData, clearCache, setAutoRefreshInterval, setAds, setErrors,
        refreshSingleAd,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}
