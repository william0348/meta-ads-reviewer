/**
 * DashboardDataContext — Global context for background data fetching.
 * 
 * This context persists across page navigation so that:
 * 1. Data loading continues in the background even when user navigates away
 * 2. When returning to Dashboard, previously loaded data is immediately available
 * 3. Auto-refresh can run on a configurable interval
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import {
  fetchAdAccounts, fetchAllDisapprovedAds, parseReviewFeedback,
  extractPolicyViolations, fetchBmIdsForAccounts,
  type DisapprovedAd, type BatchAppealResult,
} from "@/lib/metaApi";
import {
  getAccessToken, getManualAccounts, getAutoFetch,
  getCachedAds, setCachedAds, clearCachedAds, getCacheAge,
  getAccountGroups, getBmIdCache, setBmIdForAccount,
  getAccountNamesCache, setAccountNames,
} from "@/lib/store";
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
}

export interface DashboardDataActions {
  fetchData: () => Promise<void>;
  clearCache: () => void;
  setAutoRefreshInterval: (minutes: number | null) => void;
  setAds: React.Dispatch<React.SetStateAction<DisapprovedAd[]>>;
  setErrors: React.Dispatch<React.SetStateAction<{ accountId: string; error: string }[]>>;
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
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number | null>(() => {
    const saved = localStorage.getItem("meta_ads_auto_refresh");
    return saved ? parseInt(saved) : null;
  });

  const fetchingRef = useRef(false);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load cached data on mount
  useEffect(() => {
    const cached = getCachedAds();
    if (cached) {
      const reparsed = cached.ads.map((ad) => ({
        ...ad,
        parsed_review_feedback: ad.parsed_review_feedback ?? parseReviewFeedback(ad.ad_review_feedback),
        policy_violations: ad.policy_violations ?? extractPolicyViolations(ad.ad_review_feedback, ad.issues_info),
      }));
      setAds(reparsed);
      setErrors(cached.errors);
      setCacheAgeStr(getCacheAge());
    }
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
          accountIds.push(...fetchedAccounts.map((a) => a.id));
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

      if (accountIds.length === 0) {
        toast.error("沒有找到任何廣告帳號。請確認 Token 權限或手動新增帳號。");
        setLoading(false);
        fetchingRef.current = false;
        return;
      }

      const totalAccounts = accountIds.length;
      const batchSize = 20;
      const totalBatches = Math.ceil(totalAccounts / batchSize);
      toast.info(`背景載入中：從 ${totalAccounts} 個帳號搜尋被拒登廣告（共 ${totalBatches} 批）...`);

      // Use incremental loading — update UI after each batch
      const result = await fetchAllDisapprovedAds(accessToken, accountIds, (update) => {
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

      setCachedAds(result.ads, result.errors);
      setCacheAgeStr("剛剛");

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
        toast.success(`背景載入完成！共找到 ${result.ads.length} 個被拒登廣告`);
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
            setBmIdForAccount(accountId, bm.bmId, bm.bmName);
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
  }, []);

  const clearCache = useCallback(() => {
    clearCachedAds();
    setAds([]);
    setErrors([]);
    setCacheAgeStr(null);
    setLastFetchTime(null);
    toast.success("快取已清除");
  }, []);

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
        fetchData, clearCache, setAutoRefreshInterval, setAds, setErrors,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}
