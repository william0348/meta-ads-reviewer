/**
 * Dashboard Page — Disapproved Ads Overview
 *
 * Features:
 * - Cached data in localStorage
 * - Group / Account multi-select filter
 * - Time range filter (default 30 days)
 * - Sort by 30-day spend
 * - Copyable IDs
 * - Properly parsed review_feedback
 * - Ad detail dialog with edit & appeal
 * - One-click appeal link via BM ID
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertTriangle, Search, RefreshCw, ChevronDown, ChevronUp,
  XCircle, Loader2, ImageOff, Filter, Download, ArrowUpDown,
  Eye, Database, ExternalLink, Calendar, FolderOpen,
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
  fetchAdAccounts, fetchAllDisapprovedAds, parseReviewFeedback,
  filterAdsByDateRange, getDefaultDateRange, buildAppealUrl,
  type DisapprovedAd, type AdAccount,
} from "@/lib/metaApi";
import {
  getAccessToken, getManualAccounts, getAutoFetch,
  getCachedAds, setCachedAds, clearCachedAds, getCacheAge,
  getAccountGroups, getAllAccountIds, getAccountIdsForGroup,
  getBmIdCache, getAppealUrl,
  type AccountGroup,
} from "@/lib/store";
import CopyableId from "@/components/CopyableId";
import AdDetailDialog from "@/components/AdDetailDialog";

type SortMode = "newest" | "oldest" | "spend_desc" | "spend_asc" | "name";
type DateRange = "7d" | "14d" | "30d" | "60d" | "90d" | "all";

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7d", label: "最近 7 天" },
  { value: "14d", label: "最近 14 天" },
  { value: "30d", label: "最近 30 天" },
  { value: "60d", label: "最近 60 天" },
  { value: "90d", label: "最近 90 天" },
  { value: "all", label: "全部時間" },
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
  const [ads, setAds] = useState<DisapprovedAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("spend_desc");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [expandedAd, setExpandedAd] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ accountId: string; error: string }[]>([]);
  const [cacheAge, setCacheAgeStr] = useState<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<DisapprovedAd | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [bmCache, setBmCache] = useState<Record<string, { bmId: string; bmName: string }>>({});

  const accessToken = getAccessToken();
  const hasToken = !!accessToken;

  // Load cached data and groups on mount
  useEffect(() => {
    const cached = getCachedAds();
    if (cached) {
      const reparsed = cached.ads.map((ad) => ({
        ...ad,
        parsed_review_feedback: ad.parsed_review_feedback ?? parseReviewFeedback(ad.ad_review_feedback),
      }));
      setAds(reparsed);
      setErrors(cached.errors);
      setCacheAgeStr(getCacheAge());
    }
    setGroups(getAccountGroups());
    setBmCache(getBmIdCache());
  }, []);

  // Refresh cache age display every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCacheAgeStr(getCacheAge());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = useCallback(async () => {
    if (!accessToken) {
      toast.error("請先在設定頁面配置 Access Token");
      return;
    }

    setLoading(true);
    setErrors([]);

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
        return;
      }

      toast.info(`正在從 ${accountIds.length} 個帳號中搜尋被拒登廣告...`);

      const result = await fetchAllDisapprovedAds(accessToken, accountIds);
      setAds(result.ads);
      setErrors(result.errors);

      setCachedAds(result.ads, result.errors);
      setCacheAgeStr("剛剛");

      if (result.ads.length > 0) {
        toast.success(`找到 ${result.ads.length} 個被拒登廣告`);
      } else {
        toast.info("沒有找到被拒登的廣告");
      }

      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} 個帳號發生錯誤`);
      }
    } catch (err) {
      toast.error("發生錯誤：" + (err instanceof Error ? err.message : "未知錯誤"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const handleClearCache = () => {
    clearCachedAds();
    setAds([]);
    setErrors([]);
    setCacheAgeStr(null);
    toast.success("快取已清除");
  };

  // Unique account IDs from ads
  const uniqueAccountIds = useMemo(() => {
    return Array.from(new Set(ads.map((ad) => ad.account_id).filter(Boolean))) as string[];
  }, [ads]);

  // Get account IDs for group filter
  const groupFilterAccountIds = useMemo(() => {
    if (groupFilter === "all") return null;
    const group = groups.find((g) => g.id === groupFilter);
    return group ? group.accountIds : null;
  }, [groupFilter, groups]);

  // Filtered and sorted ads
  const filteredAds = useMemo(() => {
    let result = [...ads];

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

    // Account filter
    if (accountFilter !== "all") {
      result = result.filter((ad) => ad.account_id === accountFilter);
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
        result.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());
        break;
      case "oldest":
        result.sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());
        break;
      case "name":
        result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
    }

    return result;
  }, [ads, searchQuery, groupFilterAccountIds, accountFilter, sortMode, dateRange]);

  // Export to CSV
  const exportCSV = () => {
    if (filteredAds.length === 0) return;
    const headers = [
      "Ad ID", "Ad Name", "Account ID", "Campaign", "Campaign ID",
      "Ad Set", "Ad Set ID", "30d Spend", "Review Feedback", "Created Time", "Appeal URL",
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
        (ad.parsed_review_feedback ?? []).map((f) => `${f.key}: ${f.body}`).join("; "),
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
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {cacheAge && (
            <Button
              variant="ghost" size="sm"
              onClick={handleClearCache}
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
        <StatsCard label="被拒登廣告" value={ads.length} icon={<XCircle className="w-4 h-4" />} color="rose" />
        <StatsCard label="受影響帳號" value={uniqueAccountIds.length} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <StatsCard label="篩選結果" value={filteredAds.length} icon={<Filter className="w-4 h-4" />} color="sky" />
        <StatsCard label="錯誤帳號" value={errors.length} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
      </div>

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
                    .map((id) => {
                      const count = ads.filter((a) => a.account_id === id).length;
                      return (
                        <SelectItem key={id} value={id!}>
                          act_{id} ({count})
                        </SelectItem>
                      );
                    })}
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
                <SelectItem value="name">名稱 A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Error list */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
          <h4 className="text-sm font-medium text-amber-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            部分帳號發生錯誤
          </h4>
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-muted-foreground font-mono">
              {err.accountId}: {err.error}
            </p>
          ))}
        </div>
      )}

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

      {/* Loading state */}
      {loading && (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">正在從 Meta API 載入資料...</p>
        </div>
      )}

      {/* Ads list */}
      {filteredAds.length > 0 && (
        <div className="space-y-3">
          {filteredAds.map((ad, index) => (
            <AdCard
              key={ad.id}
              ad={ad}
              index={index}
              expanded={expandedAd === ad.id}
              onToggle={() => setExpandedAd(expandedAd === ad.id ? null : ad.id)}
              onViewDetail={() => openAdDetail(ad)}
              bmCache={bmCache}
            />
          ))}
        </div>
      )}

      {/* Ad Detail Dialog */}
      <AdDetailDialog
        ad={selectedAd}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onAdUpdated={() => {
          toast.info("資料已變更，建議重新載入以取得最新狀態");
        }}
      />
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
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
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
  ad, index, expanded, onToggle, onViewDetail, bmCache,
}: {
  ad: DisapprovedAd;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onViewDetail: () => void;
  bmCache: Record<string, { bmId: string; bmName: string }>;
}) {
  const feedbackItems = ad.parsed_review_feedback ?? parseReviewFeedback(ad.ad_review_feedback);
  const accountId = ad.account_id?.replace(/^act_/, "") || "";
  const bm = bmCache[accountId];
  const appealUrl = bm ? buildAppealUrl(bm.bmId, accountId) : null;

  return (
    <div className="gradient-border overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-accent/50 transition-colors"
      >
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate">{ad.name || "Unnamed Ad"}</span>
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
              DISAPPROVED
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            <span className="font-mono">ID: {ad.id}</span>
            {ad.account_id && (
              <span className="font-mono">
                帳號: {ad.account_id.startsWith("act_") ? ad.account_id : `act_${ad.account_id}`}
              </span>
            )}
            {ad.spend_30d !== undefined && ad.spend_30d > 0 && (
              <span className="text-amber-600 font-medium">30d: ${ad.spend_30d.toFixed(2)}</span>
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
        <div className="text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border">
            {/* Copyable IDs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pt-4 p-3 rounded-lg bg-muted/40">
              <CopyableId label="Ad ID" value={ad.id} />
              {ad.account_id && (
                <CopyableId label="帳號" value={ad.account_id.startsWith("act_") ? ad.account_id : `act_${ad.account_id}`} />
              )}
              {ad.campaign_id && <CopyableId label="Campaign ID" value={ad.campaign_id} />}
              {ad.adset_id && <CopyableId label="Ad Set ID" value={ad.adset_id} />}
            </div>

            {/* Campaign / AdSet info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ad.campaign?.name && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Campaign</span>
                  <p className="text-sm font-medium mt-0.5">{ad.campaign.name}</p>
                </div>
              )}
              {ad.adset?.name && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Ad Set</span>
                  <p className="text-sm font-medium mt-0.5">{ad.adset.name}</p>
                </div>
              )}
              {ad.created_time && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">建立時間</span>
                  <p className="text-sm mt-0.5">{new Date(ad.created_time).toLocaleString("zh-TW")}</p>
                </div>
              )}
              {ad.updated_time && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">更新時間</span>
                  <p className="text-sm mt-0.5">{new Date(ad.updated_time).toLocaleString("zh-TW")}</p>
                </div>
              )}
            </div>

            {/* Spend info */}
            {ad.spend_30d !== undefined && ad.spend_30d > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">30天花費</span>
                  <p className="text-sm font-semibold mt-0.5">${ad.spend_30d.toFixed(2)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">曝光</span>
                  <p className="text-sm font-semibold mt-0.5">{(ad.impressions_30d ?? 0).toLocaleString()}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">點擊</span>
                  <p className="text-sm font-semibold mt-0.5">{(ad.clicks_30d ?? 0).toLocaleString()}</p>
                </div>
              </div>
            )}

            {/* Creative info */}
            {ad.creative && (ad.creative.title || ad.creative.body) && (
              <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">廣告素材</h4>
                {ad.creative.title && <p className="text-sm font-medium">{ad.creative.title}</p>}
                {ad.creative.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ad.creative.body}</p>}
              </div>
            )}

            {/* Review feedback — properly parsed */}
            {feedbackItems.length > 0 && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3 space-y-2">
                <h4 className="text-xs font-medium text-destructive uppercase tracking-wider flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  拒登原因
                </h4>
                {feedbackItems.map((item, i) => (
                  <div key={i}>
                    <span className="text-[10px] font-mono text-destructive/70 uppercase">{item.key}</span>
                    <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{item.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={onViewDetail}>
                <Eye className="w-3 h-3" />
                查看詳情 / 編輯 / 申訴
              </Button>

              {/* One-click appeal link */}
              {appealUrl && (
                <Button
                  variant="outline" size="sm"
                  className="gap-1.5 text-xs border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                  onClick={() => window.open(appealUrl, "_blank")}
                >
                  <ExternalLink className="w-3 h-3" />
                  前往 Facebook 申訴
                </Button>
              )}

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
