/**
 * Dashboard Page — Disapproved Ads Overview
 * 
 * Design: Tactical Dashboard — Dark Data-Driven
 * Shows summary stats, then a filterable/searchable table of all disapproved ads.
 * Uses Space Grotesk for headings, Inter for body, IBM Plex Mono for data.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  XCircle,
  Loader2,
  ImageOff,
  Filter,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  fetchAdAccounts,
  fetchAllDisapprovedAds,
  type DisapprovedAd,
  type AdAccount,
} from "@/lib/metaApi";
import { getAccessToken, getManualAccounts, getAutoFetch } from "@/lib/store";

const EMPTY_STATE_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663317876169/6LULQWiHUSoenQBHuSwVJQ/empty-state-cwf6vqJEvx5iQ35TY32i3g.webp";

export default function Dashboard() {
  const [ads, setAds] = useState<DisapprovedAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [expandedAd, setExpandedAd] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ accountId: string; error: string }[]>([]);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);

  const accessToken = getAccessToken();
  const hasToken = !!accessToken;

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

      // Auto-fetch accounts from token
      if (autoFetch) {
        try {
          const fetchedAccounts = await fetchAdAccounts(accessToken);
          setAccounts(fetchedAccounts);
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

      if (accountIds.length === 0) {
        toast.error("沒有找到任何廣告帳號。請確認 Token 權限或手動新增帳號。");
        setLoading(false);
        return;
      }

      toast.info(`正在從 ${accountIds.length} 個帳號中搜尋被拒登廣告...`);

      const result = await fetchAllDisapprovedAds(accessToken, accountIds);
      setAds(result.ads);
      setErrors(result.errors);
      setLastFetched(new Date());

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

  // Filtered ads
  const filteredAds = useMemo(() => {
    let result = ads;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ad) =>
          ad.name?.toLowerCase().includes(q) ||
          ad.id?.includes(q) ||
          ad.campaign?.name?.toLowerCase().includes(q) ||
          ad.adset?.name?.toLowerCase().includes(q) ||
          ad.creative?.body?.toLowerCase().includes(q) ||
          ad.creative?.title?.toLowerCase().includes(q)
      );
    }

    if (accountFilter !== "all") {
      result = result.filter((ad) => ad.account_id === accountFilter);
    }

    return result;
  }, [ads, searchQuery, accountFilter]);

  // Unique account IDs from ads
  const uniqueAccountIds = useMemo(() => {
    return Array.from(new Set(ads.map((ad) => ad.account_id).filter(Boolean)));
  }, [ads]);

  // Export to CSV
  const exportCSV = () => {
    if (filteredAds.length === 0) return;
    const headers = ["Ad ID", "Ad Name", "Account ID", "Campaign", "Ad Set", "Review Feedback", "Created Time"];
    const rows = filteredAds.map((ad) => [
      ad.id,
      ad.name || "",
      ad.account_id || "",
      ad.campaign?.name || "",
      ad.adset?.name || "",
      ad.ad_review_feedback ? Object.entries(ad.ad_review_feedback).map(([k, v]) => `${k}: ${v}`).join("; ") : "",
      ad.created_time || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disapproved_ads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV 已匯出");
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
          <p className="text-sm text-muted-foreground mt-1">
            {lastFetched
              ? `最後更新：${lastFetched.toLocaleString("zh-TW")}`
              : "尚未載入資料"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
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
            className="gap-1.5 bg-sky text-white hover:bg-sky/90"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {loading ? "載入中..." : "重新載入"}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="被拒登廣告"
          value={ads.length}
          icon={<XCircle className="w-4 h-4" />}
          color="rose"
          delay={0}
        />
        <StatsCard
          label="受影響帳號"
          value={uniqueAccountIds.length}
          icon={<AlertTriangle className="w-4 h-4" />}
          color="amber"
          delay={0.05}
        />
        <StatsCard
          label="篩選結果"
          value={filteredAds.length}
          icon={<Filter className="w-4 h-4" />}
          color="sky"
          delay={0.1}
        />
        <StatsCard
          label="錯誤帳號"
          value={errors.length}
          icon={<AlertTriangle className="w-4 h-4" />}
          color="amber"
          delay={0.15}
        />
      </div>

      {/* No token warning */}
      {!hasToken && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="gradient-border p-6 text-center"
        >
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663317876169/6LULQWiHUSoenQBHuSwVJQ/settings-illustration-CMdVMxcTNvsNX9nia42yh2.webp"
            alt="Settings"
            className="w-24 h-24 mx-auto mb-4 opacity-60"
          />
          <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            尚未設定 Access Token
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            請前往設定頁面配置你的 Meta Marketing API Access Token
          </p>
          <Link href="/settings">
            <Button
              size="sm"
              className="bg-sky text-white hover:bg-sky/90"
            >
              前往設定
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Search and filter bar */}
      {hasToken && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜尋廣告名稱、ID、Campaign..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
          {uniqueAccountIds.length > 0 && (
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-full sm:w-56 bg-card border-border">
                <SelectValue placeholder="所有帳號" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有帳號</SelectItem>
                {uniqueAccountIds.map((id) => (
                  <SelectItem key={id} value={id || "unknown"}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Error list */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-amber/20 bg-amber/5 p-4 space-y-2">
          <h4 className="text-sm font-medium text-amber flex items-center gap-2">
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

      {/* Ads list */}
      {hasToken && ads.length === 0 && !loading && lastFetched && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <img
            src={EMPTY_STATE_IMG}
            alt="No disapproved ads"
            className="w-32 h-32 mx-auto mb-4 opacity-50"
          />
          <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
            沒有被拒登的廣告
          </h3>
          <p className="text-sm text-muted-foreground">
            所有帳號中目前沒有被拒登的廣告
          </p>
        </motion.div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-sky mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">正在從 Meta API 載入資料...</p>
        </div>
      )}

      {/* Ads table */}
      {filteredAds.length > 0 && (
        <div className="space-y-3">
          {filteredAds.map((ad, index) => (
            <AdCard
              key={ad.id}
              ad={ad}
              index={index}
              expanded={expandedAd === ad.id}
              onToggle={() => setExpandedAd(expandedAd === ad.id ? null : ad.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Stats Card ─── */
function StatsCard({
  label,
  value,
  icon,
  color,
  delay,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "rose" | "amber" | "sky" | "emerald";
  delay: number;
}) {
  const colorMap = {
    rose: "text-rose bg-rose/10 glow-red",
    amber: "text-amber bg-amber/10 glow-amber",
    sky: "text-sky bg-sky/10 glow-blue",
    emerald: "text-emerald bg-emerald/10 glow-green",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="gradient-border p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
      <p
        className="text-3xl font-bold tracking-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
    </motion.div>
  );
}

/* ─── Ad Card ─── */
function AdCard({
  ad,
  index,
  expanded,
  onToggle,
}: {
  ad: DisapprovedAd;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const feedbackEntries = ad.ad_review_feedback
    ? Object.entries(ad.ad_review_feedback)
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.25 }}
      className="gradient-border overflow-hidden"
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-md bg-muted flex-shrink-0 overflow-hidden">
          {ad.creative?.thumbnail_url ? (
            <img
              src={ad.creative.thumbnail_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
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
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
            <span>ID: {ad.id}</span>
            {ad.account_id && <span>帳號: {ad.account_id}</span>}
          </div>
        </div>

        {/* Expand icon */}
        <div className="text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border">
              {/* Campaign / AdSet info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                <InfoField label="Campaign" value={ad.campaign?.name} mono={false} />
                <InfoField label="Ad Set" value={ad.adset?.name} mono={false} />
                <InfoField label="Campaign ID" value={ad.campaign_id} mono />
                <InfoField label="Ad Set ID" value={ad.adset_id} mono />
                <InfoField label="建立時間" value={ad.created_time ? new Date(ad.created_time).toLocaleString("zh-TW") : undefined} mono={false} />
                <InfoField label="更新時間" value={ad.updated_time ? new Date(ad.updated_time).toLocaleString("zh-TW") : undefined} mono={false} />
              </div>

              {/* Creative info */}
              {ad.creative && (ad.creative.title || ad.creative.body) && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    廣告素材
                  </h4>
                  {ad.creative.title && (
                    <p className="text-sm font-medium">{ad.creative.title}</p>
                  )}
                  {ad.creative.body && (
                    <p className="text-sm text-muted-foreground">{ad.creative.body}</p>
                  )}
                </div>
              )}

              {/* Review feedback */}
              {feedbackEntries.length > 0 && (
                <div className="rounded-lg bg-rose/5 border border-rose/10 p-3 space-y-2">
                  <h4 className="text-xs font-medium text-rose uppercase tracking-wider flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" />
                    拒登原因
                  </h4>
                  {feedbackEntries.map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="text-muted-foreground font-mono text-xs">{key}:</span>
                      <p className="text-foreground mt-0.5">{String(value)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => window.open(`https://www.facebook.com/ads/manager/account/campaigns?act=${ad.account_id?.replace('act_', '')}&selected_ad_ids=${ad.id}`, '_blank')}
                >
                  <ExternalLink className="w-3 h-3" />
                  在 Ads Manager 中查看
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function InfoField({ label, value, mono }: { label: string; value?: string; mono: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <p className={`text-sm mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
