/**
 * Dashboard Page — Disapproved Ads Overview
 *
 * Features:
 * - Background data fetching via DashboardDataContext (persists across navigation)
 * - Auto-refresh with configurable interval
 * - Group / Account multi-select filter
 * - Time range filter (default 30 days)
 * - Sort by 30-day spend
 * - Copyable IDs
 * - Properly parsed review_feedback
 * - Ad detail dialog (view-only) with appeal
 * - One-click appeal link via BM ID
 * - Batch select & appeal (re-review) via Graph API
 */

import { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle, Search, RefreshCw, ChevronDown, ChevronUp, XCircle, Loader2, ImageOff, Filter, Download, ArrowUpDown,
  Eye, Database, ExternalLink, Calendar, FolderOpen,
  CheckSquare, Square, RotateCcw, Timer, TimerOff, Smartphone, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  parseReviewFeedback,
  filterAdsByDateRange, buildAppealUrl,
  batchRequestAdReview, fetchAppNames,
  type DisapprovedAd, type BatchAppealResult,
} from "@/lib/metaApi";
import {
  getAccessToken, getAccountGroups, getCachedAutoAccounts, getBmIdCache,
  type AccountGroup,
} from "@/lib/store";
import CopyableId from "@/components/CopyableId";
import AdDetailDialog from "@/components/AdDetailDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDashboardData } from "@/contexts/DashboardDataContext";
import DashboardCharts from "@/components/DashboardCharts";

type SortMode = "newest" | "oldest" | "spend_desc" | "spend_asc" | "name" | "account_name";
type DateRange = "7d" | "14d" | "30d" | "60d" | "90d" | "all";
type StatusTab = "all" | "appealable" | "pending_review" | "approved" | "still_disapproved";

/** Classify an ad into a status tab category based on effective_status */
function classifyAdStatus(ad: DisapprovedAd): StatusTab {
  const es = (ad.effective_status || "").toUpperCase();
  if (es === "PENDING_REVIEW" || es === "IN_PROCESS") return "pending_review";
  if (es === "ACTIVE" || es === "PREAPPROVED") return "approved";
  // DISAPPROVED ads that were previously appealed (have been set to ACTIVE then back to DISAPPROVED)
  // We treat all DISAPPROVED as "appealable" by default — user can appeal again
  if (es === "DISAPPROVED" || es === "WITH_ISSUES") return "appealable";
  // For any other status (PAUSED, ARCHIVED, etc.), treat as still_disapproved
  return "still_disapproved";
}

const STATUS_TABS: { value: StatusTab; label: string; color: string; bgColor: string; countColor: string }[] = [
  { value: "all", label: "全部", color: "text-foreground", bgColor: "bg-muted", countColor: "bg-muted-foreground/20 text-foreground" },
  { value: "appealable", label: "可提交審查", color: "text-rose-700 dark:text-rose-400", bgColor: "bg-rose-50 dark:bg-rose-950/30", countColor: "bg-rose-500 text-white" },
  { value: "pending_review", label: "審查中", color: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/30", countColor: "bg-amber-500 text-white" },
  { value: "approved", label: "已獲准", color: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/30", countColor: "bg-emerald-500 text-white" },
  { value: "still_disapproved", label: "維持禁止刊登", color: "text-gray-700 dark:text-gray-400", bgColor: "bg-gray-50 dark:bg-gray-950/30", countColor: "bg-red-600 text-white" },
];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7d", label: "拒登 7 天內" },
  { value: "14d", label: "拒登 14 天內" },
  { value: "30d", label: "拒登 30 天內" },
  { value: "60d", label: "拒登 60 天內" },
  { value: "90d", label: "拒登 90 天內" },
  { value: "all", label: "全部時間" },
];

const AUTO_REFRESH_OPTIONS: { value: string; label: string }[] = [
  { value: "off", label: "關閉自動刷新" },
  { value: "5", label: "每 5 分鐘" },
  { value: "15", label: "每 15 分鐘" },
  { value: "30", label: "每 30 分鐘" },
  { value: "60", label: "每 60 分鐘" },
];

function getDateRangeFromPreset(preset: DateRange): { start: Date; end: Date } | null {
  if (preset === "all") return null;
  const days = parseInt(preset);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export default function Dashboard() {
  // ── Global state from DashboardDataContext ──
  const {
    ads, loading, errors, cacheAge, bmCache, accountNames,
    batchProgress, autoRefreshInterval,
    fetchData, clearCache, setAutoRefreshInterval, setAds, setErrors,
  } = useDashboardData();

  // ── Local UI state ──
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("spend_desc");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [appFilter, setAppFilter] = useState("all");
  const [bmFilter, setBmFilter] = useState("all");
  const [expandedAd, setExpandedAd] = useState<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<DisapprovedAd | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [groups] = useState<AccountGroup[]>(() => getAccountGroups());

  // Batch selection & appeal state
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());
  const [isAppealing, setIsAppealing] = useState(false);
  const [appealProgress, setAppealProgress] = useState(0);
  const [appealTotal, setAppealTotal] = useState(0);
  const [showAppealConfirm, setShowAppealConfirm] = useState(false);
  const [appealResults, setAppealResults] = useState<BatchAppealResult[] | null>(null);

  // Pagination state
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  const accessToken = getAccessToken();
  const hasToken = !!accessToken;

  // Active account IDs from cached auto accounts
  const activeAccountIds = useMemo(() => {
    const cached = getCachedAutoAccounts();
    return new Set(cached.map((a) => a.id.replace(/^act_/, '')));
  }, [ads]); // re-derive when ads change (after fetch)

  // Unique account IDs from ads — only Active accounts
  const uniqueAccountIds = useMemo(() => {
    const allIds = Array.from(new Set(
      ads.map((ad) => (ad.account_id || '').replace(/^act_/, '')).filter(Boolean)
    ));
    // If we have active account info, filter to active only
    if (activeAccountIds.size > 0) {
      return allIds.filter((id) => activeAccountIds.has(id));
    }
    return allIds;
  }, [ads, activeAccountIds]);

  // Unique BM names from bmCache for BM filter
  const uniqueBmNames = useMemo(() => {
    const localBmCache = { ...getBmIdCache(), ...bmCache };
    const bmMap = new Map<string, { bmId: string; bmName: string; count: number }>();
    for (const ad of ads) {
      const accId = (ad.account_id || '').replace(/^act_/, '');
      const bm = localBmCache[accId];
      if (bm?.bmName) {
        const key = bm.bmId || bm.bmName;
        if (bmMap.has(key)) {
          bmMap.get(key)!.count++;
        } else {
          bmMap.set(key, { bmId: bm.bmId, bmName: bm.bmName, count: 1 });
        }
      }
    }
    return Array.from(bmMap.entries()).sort((a, b) => a[1].bmName.localeCompare(b[1].bmName));
  }, [ads, bmCache]);

  // Unique App IDs from ads
  const uniqueAppIds = useMemo(() => {
    const appIds = new Set<string>();
    let noAppCount = 0;
    for (const ad of ads) {
      if (ad.promoted_object_app_id) {
        appIds.add(ad.promoted_object_app_id);
      } else {
        noAppCount++;
      }
    }
    return { appIds: Array.from(appIds).sort(), noAppCount };
  }, [ads]);

  // Fetch App names for all unique App IDs
  const [appNames, setAppNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (uniqueAppIds.appIds.length === 0 || !accessToken) return;
    let cancelled = false;
    fetchAppNames(accessToken, uniqueAppIds.appIds).then((names) => {
      if (!cancelled) setAppNames(names);
    });
    return () => { cancelled = true; };
  }, [uniqueAppIds.appIds.join(','), accessToken]);

  // Get account IDs for group filter
  const groupFilterAccountIds = useMemo(() => {
    if (groupFilter === "all") return null;
    const group = groups.find((g) => g.id === groupFilter);
    return group ? group.accountIds : null;
  }, [groupFilter, groups]);

  // Date-filtered ads (before other filters, used for stats cards)
  const dateFilteredAds = useMemo(() => {
    const range = getDateRangeFromPreset(dateRange);
    if (!range) return ads;
    return filterAdsByDateRange(ads, range.start, range.end);
  }, [ads, dateRange]);

  // Unique account IDs from date-filtered ads (for stats card)
  const dateFilteredAccountIds = useMemo(() => {
    return new Set(
      dateFilteredAds.map((ad) => (ad.account_id || '').replace(/^act_/, '')).filter(Boolean)
    );
  }, [dateFilteredAds]);

  // Status tab counts (computed from date-filtered ads)
  const statusCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = {
      all: dateFilteredAds.length,
      appealable: 0,
      pending_review: 0,
      approved: 0,
      still_disapproved: 0,
    };
    for (const ad of dateFilteredAds) {
      const cat = classifyAdStatus(ad);
      counts[cat]++;
    }
    return counts;
  }, [dateFilteredAds]);

  // Filtered and sorted ads
  const filteredAds = useMemo(() => {
    let result = [...ads];

    // Status tab filter
    if (statusTab !== "all") {
      result = result.filter((ad) => classifyAdStatus(ad) === statusTab);
    }

    // Time range filter
    const range = getDateRangeFromPreset(dateRange);
    if (range) {
      result = filterAdsByDateRange(result, range.start, range.end);
    }

    // Group filter
    if (groupFilterAccountIds) {
      result = result.filter((ad) => {
        const adAccountId = ad.account_id?.replace(/^act_/, "");
        return adAccountId && groupFilterAccountIds.includes(adAccountId);
      });
    }

    // Account filter (normalize both sides to strip act_ prefix)
    if (accountFilter !== "all") {
      const normalizedFilter = accountFilter.replace(/^act_/, '');
      result = result.filter((ad) => {
        const adAccId = (ad.account_id || '').replace(/^act_/, '');
        return adAccId === normalizedFilter;
      });
    }

    // App ID filter
    if (appFilter !== "all") {
      if (appFilter === "__none__") {
        result = result.filter((ad) => !ad.promoted_object_app_id);
      } else {
        result = result.filter((ad) => ad.promoted_object_app_id === appFilter);
      }
    }

    // BM filter
    if (bmFilter !== "all") {
      const localBmCache = { ...getBmIdCache(), ...bmCache };
      result = result.filter((ad) => {
        const accId = (ad.account_id || '').replace(/^act_/, '');
        const bm = localBmCache[accId];
        return bm && (bm.bmId === bmFilter || bm.bmName === bmFilter);
      });
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ad) =>
          ad.name?.toLowerCase().includes(q) ||
          ad.id?.includes(q) ||
          ad.campaign?.name?.toLowerCase().includes(q) ||
          ad.adset?.name?.toLowerCase().includes(q) ||
          ad.creative?.body?.toLowerCase().includes(q) ||
          ad.creative?.title?.toLowerCase().includes(q) ||
          ad.account_id?.includes(q)
      );
    }

    // Sort
    switch (sortMode) {
      case "spend_desc":
        result.sort((a, b) => (b.spend_30d ?? 0) - (a.spend_30d ?? 0));
        break;
      case "spend_asc":
        result.sort((a, b) => (a.spend_30d ?? 0) - (b.spend_30d ?? 0));
        break;
      case "newest":
        result.sort((a, b) => new Date(b.updated_time || b.created_time).getTime() - new Date(a.updated_time || a.created_time).getTime());
        break;
      case "oldest":
        result.sort((a, b) => new Date(a.updated_time || a.created_time).getTime() - new Date(b.updated_time || b.created_time).getTime());
        break;
      case "name":
        result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      case "account_name":
        result.sort((a, b) => {
          const nameA = accountNames[a.account_id?.replace(/^act_/, '') || ''] || '';
          const nameB = accountNames[b.account_id?.replace(/^act_/, '') || ''] || '';
          return nameA.localeCompare(nameB);
        });
        break;
    }

    return result;
  }, [ads, statusTab, searchQuery, groupFilterAccountIds, accountFilter, appFilter, bmFilter, sortMode, dateRange, accountNames, bmCache]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusTab, searchQuery, groupFilter, accountFilter, appFilter, bmFilter, sortMode, dateRange]);

  // Paginated ads
  const totalPages = Math.max(1, Math.ceil(filteredAds.length / PAGE_SIZE));
  const paginatedAds = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAds.slice(start, start + PAGE_SIZE);
  }, [filteredAds, currentPage]);

  // Export to CSV
  const exportCSV = () => {
    if (filteredAds.length === 0) return;
    const headers = [
      "Ad ID", "Ad Name", "Account ID", "Campaign", "Campaign ID",
      "Ad Set", "Ad Set ID", "30d Spend", "Policy Violation", "Review Feedback", "Disapproved Date", "Created Time", "Appeal URL",
    ];
    const rows = filteredAds.map((ad) => {
      const accountId = ad.account_id?.replace(/^act_/, "") || "";
      const bm = bmCache[accountId];
      const appealUrl = bm ? buildAppealUrl(bm.bmId, accountId) : "";
      return [
        ad.id,
        ad.name || "",
        ad.account_id || "",
        ad.campaign?.name || "",
        ad.campaign_id || "",
        ad.adset?.name || "",
        ad.adset_id || "",
        ad.spend_30d?.toFixed(2) ?? "",
        (ad.policy_violations ?? []).join("; "),
        (ad.parsed_review_feedback ?? []).map((f) => `${f.key}: ${f.body}`).join("; "),
        ad.updated_time || "",
        ad.created_time || "",
        appealUrl,
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disapproved_ads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV 已匯出");
  };

  const openAdDetail = (ad: DisapprovedAd) => {
    setSelectedAd(ad);
    setDetailOpen(true);
  };

  // ── Batch selection helpers ──
  const toggleAdSelection = (adId: string) => {
    setSelectedAdIds((prev) => {
      const next = new Set(prev);
      if (next.has(adId)) next.delete(adId);
      else next.add(adId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    // Select/deselect only the current page's ads for performance
    const pageAdIds = paginatedAds.map((ad) => ad.id);
    const allPageSelected = pageAdIds.every((id) => selectedAdIds.has(id));
    if (allPageSelected) {
      setSelectedAdIds((prev) => {
        const next = new Set(prev);
        pageAdIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedAdIds((prev) => {
        const next = new Set(prev);
        pageAdIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleBatchAppeal = async () => {
    setShowAppealConfirm(false);
    if (!accessToken || selectedAdIds.size === 0) return;

    setIsAppealing(true);
    setAppealProgress(0);
    setAppealTotal(selectedAdIds.size);
    setAppealResults(null);

    try {
      const adIds = Array.from(selectedAdIds);
      const results = await batchRequestAdReview(accessToken, adIds, (completed, total) => {
        setAppealProgress(completed);
        setAppealTotal(total);
      });

      setAppealResults(results);
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      if (successCount > 0 && failCount === 0) {
        toast.success(`全部 ${successCount} 個廣告已成功提交重新審核`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`${successCount} 個成功，${failCount} 個失敗`);
      } else {
        toast.error(`全部 ${failCount} 個廣告提交失敗`);
      }

      setSelectedAdIds(new Set());
    } catch {
      toast.error("批次申訴過程發生錯誤");
    } finally {
      setIsAppealing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            被拒登廣告總覽
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {cacheAge && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Database className="w-3 h-3" />
                快取資料：{cacheAge}
              </span>
            )}
            {!cacheAge && (
              <span className="text-xs text-muted-foreground">尚未載入資料</span>
            )}
            {autoRefreshInterval && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <Timer className="w-3 h-3" />
                自動刷新：每 {autoRefreshInterval} 分鐘
              </span>
            )}
            {loading && (
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                <Loader2 className="w-3 h-3 animate-spin" />
                背景載入中...
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Auto-refresh control */}
          <Select
            value={autoRefreshInterval ? String(autoRefreshInterval) : "off"}
            onValueChange={(v) => setAutoRefreshInterval(v === "off" ? null : parseInt(v))}
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              {autoRefreshInterval ? (
                <Timer className="w-3 h-3 mr-1 text-emerald-600" />
              ) : (
                <TimerOff className="w-3 h-3 mr-1 text-muted-foreground" />
              )}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTO_REFRESH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cacheAge && (
            <Button
              variant="ghost" size="sm"
              onClick={clearCache}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <XCircle className="w-3 h-3" />
              清除快取
            </Button>
          )}
          <Button
            variant="outline" size="sm"
            onClick={exportCSV}
            disabled={filteredAds.length === 0}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            匯出 CSV
          </Button>
          <Button
            size="sm"
            onClick={fetchData}
            disabled={loading || !hasToken}
            className="gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {loading ? "載入中..." : "重新載入"}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard label="被拒登廣告" value={dateFilteredAds.length} icon={<XCircle className="w-4 h-4" />} color="rose" />
        <StatsCard label="受影響帳號" value={dateFilteredAccountIds.size} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <StatsCard label="篩選結果" value={filteredAds.length} icon={<Filter className="w-4 h-4" />} color="sky" />
        <StatsCard label="錯誤帳號" value={errors.length} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
      </div>

      {/* Cumulative Charts */}
      {dateFilteredAds.length > 0 && (
        <DashboardCharts ads={dateFilteredAds} />
      )}

      {/* Status Tab Bar */}
      {hasToken && ads.length > 0 && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const count = statusCounts[tab.value];
            const isActive = statusTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusTab(tab.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? `${tab.bgColor} ${tab.color} shadow-sm`
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                {tab.label}
                <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-bold ${
                  isActive ? tab.countColor : 'bg-muted-foreground/10 text-muted-foreground'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* No token warning */}
      {!hasToken && (
        <div className="gradient-border p-8 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
          <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            尚未設定 Access Token
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            請前往設定頁面配置你的 Meta Marketing API Access Token
          </p>
          <Link href="/settings">
            <Button size="sm">前往設定</Button>
          </Link>
        </div>
      )}

      {/* Filter bar */}
      {hasToken && (
        <div className="space-y-3">
          {/* Row 1: Search + Date Range */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜尋廣告名稱、ID、Campaign..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-full sm:w-40">
                <Calendar className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: Group + Account + Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            {groups.length > 0 && (
              <Select value={groupFilter} onValueChange={(v) => { setGroupFilter(v); setAccountFilter("all"); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <FolderOpen className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder="所有群組" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有群組</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                        {g.name} ({g.accountIds.length})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {uniqueAccountIds.length > 0 && (
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue placeholder="所有帳號" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有帳號 ({ads.length})</SelectItem>
                  {uniqueAccountIds
                    .filter((id) => {
                      if (!groupFilterAccountIds) return true;
                      return groupFilterAccountIds.includes(id!);
                    })
                    .sort((a, b) => {
                      const nameA = accountNames[a || ''] || `act_${a}`;
                      const nameB = accountNames[b || ''] || `act_${b}`;
                      return nameA.localeCompare(nameB);
                    })
                    .map((id) => {
                      const count = ads.filter((a) => (a.account_id || '').replace(/^act_/, '') === id).length;
                      const accName = accountNames[id || ''];
                      return (
                        <SelectItem key={id} value={id!}>
                          {accName ? `${accName} (${count})` : `act_${id} (${count})`}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            )}

            {uniqueAppIds.appIds.length > 0 && (
              <Select value={appFilter} onValueChange={setAppFilter}>
                <SelectTrigger className="w-full sm:w-64">
                  <Smartphone className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder="所有 App" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有 App ({ads.length})</SelectItem>
                  {uniqueAppIds.appIds.map((appId) => {
                    const count = ads.filter((a) => a.promoted_object_app_id === appId).length;
                    const name = appNames[appId];
                    const displayName = name && name !== appId ? `${name} (${appId})` : `App ${appId}`;
                    return (
                      <SelectItem key={appId} value={appId}>
                        {displayName} ({count})
                      </SelectItem>
                    );
                  })}
                  {uniqueAppIds.noAppCount > 0 && (
                    <SelectItem value="__none__">無 App ID ({uniqueAppIds.noAppCount})</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}

            {uniqueBmNames.length > 0 && (
              <Select value={bmFilter} onValueChange={setBmFilter}>
                <SelectTrigger className="w-full sm:w-52">
                  <Building2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder="所有 BM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有 BM ({ads.length})</SelectItem>
                  {uniqueBmNames.map(([key, { bmId, bmName, count }]) => (
                    <SelectItem key={key} value={key}>
                      {bmName} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="w-full sm:w-44">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spend_desc">花費高→低</SelectItem>
                <SelectItem value="spend_asc">花費低→高</SelectItem>
                <SelectItem value="newest">最新建立</SelectItem>
                <SelectItem value="oldest">最早建立</SelectItem>
                <SelectItem value="name">廣告名稱 A-Z</SelectItem>
                <SelectItem value="account_name">帳號名稱 A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Error list — categorized */}
      {errors.length > 0 && (() => {
        const permErrors = errors.filter(e => e.error.includes('權限不足') || e.error.includes('permission') || e.error.includes('Code: 200'));
        const otherErrors = errors.filter(e => !e.error.includes('權限不足') && !e.error.includes('permission') && !e.error.includes('Code: 200'));
        return (
          <div className="space-y-3">
            {permErrors.length > 0 && (
              <details className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <summary className="text-sm font-medium text-amber-600 flex items-center gap-2 cursor-pointer">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {permErrors.length} 個帳號權限不足（帳號擁有者未授權 ads_read）
                </summary>
                <div className="mt-2 space-y-1 pl-6">
                  {permErrors.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono">
                      {err.accountId}
                    </p>
                  ))}
                </div>
              </details>
            )}
            {otherErrors.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                <h4 className="text-sm font-medium text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {otherErrors.length} 個帳號發生錯誤
                </h4>
                {otherErrors.map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground font-mono">
                    {err.accountId}: {err.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Empty state */}
      {hasToken && ads.length === 0 && !loading && cacheAge === null && (
        <div className="text-center py-16">
          <RefreshCw className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
            點擊「重新載入」開始
          </h3>
          <p className="text-sm text-muted-foreground">
            載入後的資料會自動快取，下次開啟無需重新抓取
          </p>
        </div>
      )}

      {hasToken && ads.length === 0 && !loading && cacheAge !== null && (
        <div className="text-center py-16">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
            沒有被拒登的廣告
          </h3>
          <p className="text-sm text-muted-foreground">
            所有帳號中目前沒有被拒登的廣告
          </p>
        </div>
      )}

      {/* No results after filter */}
      {hasToken && ads.length > 0 && filteredAds.length === 0 && !loading && (
        <div className="text-center py-12">
          <Filter className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <h3 className="text-base font-semibold mb-1">沒有符合條件的廣告</h3>
          <p className="text-sm text-muted-foreground">
            嘗試調整篩選條件或時間範圍
          </p>
        </div>
      )}

      {/* Loading state with batch progress */}
      {loading && (
        <div className="space-y-4 py-8">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            {batchProgress ? (
              <>
                <p className="text-sm font-medium">
                  正在載入第 {batchProgress.batch} / {batchProgress.totalBatches} 批帳號...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  已處理 {batchProgress.completed} / {batchProgress.total} 個帳號
                  {ads.length > 0 && `，已找到 ${ads.length} 個拒登廣告`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">正在準備帳號列表...</p>
            )}
          </div>
          {batchProgress && (
            <div className="max-w-md mx-auto">
              <Progress value={(batchProgress.completed / batchProgress.total) * 100} />
            </div>
          )}
        </div>
      )}

      {/* Batch selection toolbar */}
      {filteredAds.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
            >
              {paginatedAds.length > 0 && paginatedAds.every((ad) => selectedAdIds.has(ad.id)) ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4 text-muted-foreground" />
              )}
              {paginatedAds.length > 0 && paginatedAds.every((ad) => selectedAdIds.has(ad.id))
                ? "取消本頁全選"
                : "本頁全選"}
            </button>
            {selectedAdIds.size > 0 && (
              <Badge variant="secondary" className="text-xs">
                已選取 {selectedAdIds.size} / {filteredAds.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedAdIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => setSelectedAdIds(new Set())}
                >
                  <XCircle className="w-3 h-3" />
                  清除選取
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={() => setShowAppealConfirm(true)}
                  disabled={isAppealing}
                >
                  {isAppealing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  批次申請重新審核 ({selectedAdIds.size})
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Appeal progress bar */}
      {isAppealing && (
        <div className="space-y-2 p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              正在批次提交重新審核...
            </span>
            <span className="text-muted-foreground">
              {appealProgress} / {appealTotal}
            </span>
          </div>
          <Progress value={appealTotal > 0 ? (appealProgress / appealTotal) * 100 : 0} />
        </div>
      )}

      {/* Appeal results summary */}
      {appealResults && !isAppealing && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              批次申訴結果
            </h4>
            <Button
              variant="ghost" size="sm" className="text-xs h-7"
              onClick={() => setAppealResults(null)}
            >
              關閉
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-center">
              <span className="text-[10px] text-emerald-600 tracking-wider block">成功</span>
              <p className="text-lg font-bold text-emerald-600">
                {appealResults.filter((r) => r.success).length}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-center">
              <span className="text-[10px] text-rose-600 tracking-wider block">失敗</span>
              <p className="text-lg font-bold text-rose-600">
                {appealResults.filter((r) => !r.success).length}
              </p>
            </div>
          </div>
          {appealResults.filter((r) => !r.success).length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <p className="text-xs text-muted-foreground font-medium">失敗詳情：</p>
              {appealResults.filter((r) => !r.success).map((r) => (
                <div key={r.adId} className="text-xs p-2 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                  <p className="font-mono font-medium text-rose-700 dark:text-rose-400">Ad: {r.adId}</p>
                  <p className="text-rose-600 dark:text-rose-300 mt-0.5 whitespace-pre-wrap">{r.error}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ads list (paginated) */}
      {filteredAds.length > 0 && (
        <div className="space-y-3">
          {/* Pagination info bar */}
          <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
            <span>
              顯示 {((currentPage - 1) * PAGE_SIZE) + 1} - {Math.min(currentPage * PAGE_SIZE, filteredAds.length)} / {filteredAds.length} 筆
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                >
                  首頁
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  上一頁
                </Button>
                <span className="px-2 text-xs font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  下一頁
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                >
                  末頁
                </Button>
              </div>
            )}
          </div>

          {paginatedAds.map((ad, index) => (
            <AdCard
              key={ad.id}
              ad={ad}
              index={(currentPage - 1) * PAGE_SIZE + index}
              expanded={expandedAd === ad.id}
              onToggle={() => setExpandedAd(expandedAd === ad.id ? null : ad.id)}
              onViewDetail={() => openAdDetail(ad)}
              bmCache={bmCache}
              accountNames={accountNames}
              appNames={appNames}
              selected={selectedAdIds.has(ad.id)}
              onToggleSelect={() => toggleAdSelection(ad.id)}
            />
          ))}

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-4">
              <Button
                variant="outline" size="sm" className="h-8 px-3 text-xs"
                disabled={currentPage <= 1}
                onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                上一頁
              </Button>
              {/* Page number buttons */}
              {(() => {
                const pages: number[] = [];
                const maxButtons = 7;
                let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
                let end = Math.min(totalPages, start + maxButtons - 1);
                if (end - start + 1 < maxButtons) {
                  start = Math.max(1, end - maxButtons + 1);
                }
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((p) => (
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0 text-xs"
                    onClick={() => { setCurrentPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  >
                    {p}
                  </Button>
                ));
              })()}
              <Button
                variant="outline" size="sm" className="h-8 px-3 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                下一頁
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Ad Detail Dialog */}
      <AdDetailDialog
        ad={selectedAd}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        bmCache={bmCache}
        appNames={appNames}
      />

      {/* Batch Appeal Confirmation Dialog */}
      <AlertDialog open={showAppealConfirm} onOpenChange={setShowAppealConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認批次申請重新審核</AlertDialogTitle>
            <AlertDialogDescription>
              即將對 <strong>{selectedAdIds.size}</strong> 個被拒登廣告提交重新審核申請。
              此操作會透過 Meta Graph API 將每個廣告的狀態設為 ACTIVE，
              觸發 Meta 的重新審核流程。
              <br /><br />
              <span className="text-amber-600">注意：每個 API 呼叫都會計入速率限制配額。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchAppeal}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              確認提交 ({selectedAdIds.size} 個廣告)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Stats Card ─── */
function StatsCard({
  label, value, icon, color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "rose" | "amber" | "sky" | "emerald";
}) {
  const colorMap = {
    rose: "text-rose-500 bg-rose-500/10",
    amber: "text-amber-500 bg-amber-500/10",
    sky: "text-blue-500 bg-blue-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
  };

  return (
    <div className="gradient-border p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium tracking-wider">
          {label}
        </span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
    </div>
  );
}

/* ─── Ad Card ─── */
function AdCard({
  ad, index, expanded, onToggle, onViewDetail, bmCache, accountNames, appNames,
  selected, onToggleSelect,
}: {
  ad: DisapprovedAd;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onViewDetail: () => void;
  bmCache: Record<string, { bmId: string; bmName: string; ownerBmId?: string; ownerBmName?: string; agencyBmId?: string; agencyBmName?: string }>;
  accountNames: Record<string, string>;
  appNames: Record<string, string>;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const feedbackItems = ad.parsed_review_feedback ?? parseReviewFeedback(ad.ad_review_feedback);
  const accountId = ad.account_id?.replace(/^act_/, "") || "";
  const bm = bmCache[accountId];
  const appealUrl = bm ? buildAppealUrl(bm.bmId, accountId) : null;
  // Fallback: generic Facebook business support URL when no BM ID
  const genericAppealUrl = `https://www.facebook.com/business/help/support`;

  return (
    <div className={`gradient-border overflow-hidden transition-colors ${selected ? 'ring-2 ring-primary/40' : ''}`}>
      {/* Header row */}
      <div className="w-full flex items-center gap-4 p-4 text-left hover:bg-accent/50 transition-colors">
        {/* Checkbox */}
        <div
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          <Checkbox checked={selected} className="cursor-pointer" />
        </div>
        {/* Clickable area for expand */}
        <button onClick={onToggle} className="flex items-center gap-4 flex-1 min-w-0 text-left cursor-pointer">
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-md bg-muted flex-shrink-0 overflow-hidden">
          {ad.creative?.thumbnail_url ? (
            <img
              src={ad.creative.thumbnail_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-medium truncate">{ad.name || "Unnamed Ad"}</span>
            {(() => {
              const es = (ad.effective_status || "").toUpperCase();
              if (es === "PENDING_REVIEW" || es === "IN_PROCESS") return (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 animate-pulse">
                  審查中
                </Badge>
              );
              if (es === "ACTIVE" || es === "PREAPPROVED") return (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-emerald-400 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50">
                  已獲准
                </Badge>
              );
              if (es === "WITH_ISSUES") return (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-orange-400 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50">
                  有問題
                </Badge>
              );
              return (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                  被拒登
                </Badge>
              );
            })()}
            {/* Policy violation badges */}
            {ad.policy_violations && ad.policy_violations.length > 0 && ad.policy_violations.map((v, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50">
                {v}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            <span className="font-mono">ID: {ad.id}</span>
            {ad.account_id && (
              <span className="font-mono">
                帳號: {accountId}
                {accountNames[accountId] && (
                  <span className="text-foreground font-medium font-sans ml-1">({accountNames[accountId]})</span>
                )}
              </span>
            )}
            {bm && (
              <span className="text-purple-600 dark:text-purple-400 font-sans">
                <Building2 className="w-3 h-3 inline mr-0.5" />
                {bm.agencyBmName ? (
                  <>
                    <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 px-1 rounded mr-0.5">Agency</span>
                    {bm.agencyBmName}
                    {bm.agencyBmId && <span className="font-mono text-[10px] ml-1 opacity-70">{bm.agencyBmId}</span>}
                  </>
                ) : (
                  <>
                    {bm.bmName}
                    {bm.bmId && <span className="font-mono text-[10px] ml-1 opacity-70">{bm.bmId}</span>}
                  </>
                )}
              </span>
            )}
            {ad.spend_30d !== undefined && ad.spend_30d > 0 && (
              <span className="text-amber-600 font-medium">30d: ${ad.spend_30d.toFixed(2)}</span>
            )}
            {ad.promoted_object_app_id && (
              <span className="font-mono text-blue-600 dark:text-blue-400">
                <Smartphone className="w-3 h-3 inline mr-0.5" />
                {appNames[ad.promoted_object_app_id] && appNames[ad.promoted_object_app_id] !== ad.promoted_object_app_id
                  ? `${appNames[ad.promoted_object_app_id]} (${ad.promoted_object_app_id})`
                  : `App: ${ad.promoted_object_app_id}`}
              </span>
            )}
          </div>
          {/* Show first feedback reason in collapsed view */}
          {feedbackItems.length > 0 && !expanded && (
            <p className="text-[11px] text-rose-500 mt-0.5 truncate">
              拒登：{feedbackItems[0].body.slice(0, 80)}{feedbackItems[0].body.length > 80 ? "..." : ""}
            </p>
          )}
        </div>

        {/* Expand icon */}
        <div className="text-muted-foreground shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border">
            {/* Ad Name */}
            {ad.name && (
              <div className="pt-4 px-1">
                <span className="text-[10px] text-muted-foreground tracking-wider">Ad Name</span>
                <p className="text-sm font-semibold mt-0.5">{ad.name}</p>
              </div>
            )}

            {/* Copyable IDs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pt-3 p-3 rounded-lg bg-muted/40">
              <CopyableId label="Ad ID" value={ad.id} />
              {ad.account_id && (
                <CopyableId label={accountNames[accountId] ? `帳號 (${accountNames[accountId]})` : "帳號"} value={ad.account_id.startsWith("act_") ? ad.account_id : `act_${ad.account_id}`} />
              )}
              {ad.campaign_id && <CopyableId label="Campaign ID" value={ad.campaign_id} />}
              {ad.adset_id && <CopyableId label="Ad Set ID" value={ad.adset_id} />}
            </div>

            {/* Campaign / AdSet info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ad.campaign?.name && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">Campaign</span>
                  <p className="text-sm font-medium mt-0.5">{ad.campaign.name}</p>
                </div>
              )}
              {ad.adset?.name && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">Ad Set</span>
                  <p className="text-sm font-medium mt-0.5">{ad.adset.name}</p>
                </div>
              )}
              {ad.created_time && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">建立時間</span>
                  <p className="text-sm mt-0.5">{new Date(ad.created_time).toLocaleString("zh-TW")}</p>
                </div>
              )}
              {ad.updated_time && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">拒登日期</span>
                  <p className="text-sm mt-0.5 text-rose-600 dark:text-rose-400 font-medium">{new Date(ad.updated_time).toLocaleString("zh-TW")}</p>
                </div>
              )}
            </div>

            {/* Spend info */}
            {ad.spend_30d !== undefined && ad.spend_30d > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <span className="text-[10px] text-muted-foreground tracking-wider block">30天花費</span>
                  <p className="text-sm font-semibold mt-0.5">${ad.spend_30d.toFixed(2)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <span className="text-[10px] text-muted-foreground tracking-wider block">曝光</span>
                  <p className="text-sm font-semibold mt-0.5">{(ad.impressions_30d ?? 0).toLocaleString()}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <span className="text-[10px] text-muted-foreground tracking-wider block">點擊</span>
                  <p className="text-sm font-semibold mt-0.5">{(ad.clicks_30d ?? 0).toLocaleString()}</p>
                </div>
              </div>
            )}

            {/* Creative info */}
            {ad.creative && (ad.creative.title || ad.creative.body) && (
              <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground tracking-wider">廣告素材</h4>
                {ad.creative.title && <p className="text-sm font-medium">{ad.creative.title}</p>}
                {ad.creative.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ad.creative.body}</p>}
              </div>
            )}

            {/* Policy violations */}
            {ad.policy_violations && ad.policy_violations.length > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-2">
                <h4 className="text-xs font-medium text-amber-700 dark:text-amber-400 tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Policy Violation
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {ad.policy_violations.map((v, i) => (
                    <Badge key={i} variant="outline" className="text-xs px-2 py-0.5 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30">
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Review feedback — detailed reasons */}
            {feedbackItems.length > 0 && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3 space-y-2">
                <h4 className="text-xs font-medium text-destructive tracking-wider flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  拒登詳細原因
                </h4>
                {feedbackItems.map((item, i) => (
                  <div key={i}>
                    <span className="text-[10px] font-mono text-destructive/70">{item.key}</span>
                    <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{item.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={onViewDetail}>
                <Eye className="w-3 h-3" />
                查看詳情
              </Button>

              {/* One-click appeal link — always show, with BM-specific URL if available */}
              <Button
                variant="outline" size="sm"
                className="gap-1.5 text-xs border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                onClick={() => window.open(appealUrl || genericAppealUrl, "_blank")}
              >
                <ExternalLink className="w-3 h-3" />
                前往 Facebook 申訴
              </Button>

              <Button
                variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() =>
                  window.open(
                    `https://www.facebook.com/ads/manager/account/campaigns?act=${accountId}&selected_ad_ids=${ad.id}`,
                    "_blank"
                  )
                }
              >
                <Eye className="w-3 h-3" />
                在 Ads Manager 中查看
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
