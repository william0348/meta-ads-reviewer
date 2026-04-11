/**
 * Rate Limit Status Indicator
 *
 * Displays real-time Meta API usage percentage and throttle status.
 * Color-coded: green (normal), yellow (>70%), red (>90%/throttled).
 * Shows per-account breakdown in expandable panel.
 */

import { useState, useEffect, useCallback } from "react";
import { Activity, ChevronDown, ChevronUp, AlertTriangle, Pause, Zap } from "lucide-react";
import { rateLimiter, type AccountUsage } from "@/lib/rateLimiter";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AccountStatus extends AccountUsage {
  maxUsagePct: number;
}

function getStatusColor(pct: number, isThrottled: boolean): string {
  if (isThrottled || pct >= 90) return "text-red-500";
  if (pct >= 70) return "text-amber-500";
  if (pct > 0) return "text-emerald-500";
  return "text-muted-foreground";
}

function getStatusBg(pct: number, isThrottled: boolean): string {
  if (isThrottled || pct >= 90) return "bg-red-500/10 border-red-500/30";
  if (pct >= 70) return "bg-amber-500/10 border-amber-500/30";
  if (pct > 0) return "bg-emerald-500/10 border-emerald-500/30";
  return "bg-muted/50 border-border";
}

function getProgressColor(pct: number, isThrottled: boolean): string {
  if (isThrottled || pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  if (pct > 0) return "bg-emerald-500";
  return "bg-muted-foreground/30";
}

function getStatusLabel(pct: number, isThrottled: boolean): string {
  if (isThrottled) return "限流中";
  if (pct >= 90) return "即將限流";
  if (pct >= 70) return "使用量偏高";
  if (pct > 0) return "正常";
  return "待機";
}

function getStatusIcon(pct: number, isThrottled: boolean) {
  if (isThrottled) return <Pause className="w-3 h-3" />;
  if (pct >= 90) return <AlertTriangle className="w-3 h-3" />;
  if (pct >= 70) return <Zap className="w-3 h-3" />;
  return <Activity className="w-3 h-3" />;
}

function formatAccountId(id: string): string {
  // Remove act_ prefix and show short form
  const clean = id.replace(/^act_/, "");
  if (clean.length > 10) return clean.slice(0, 6) + "..." + clean.slice(-4);
  return clean;
}

interface RateLimitIndicatorProps {
  /** Whether data is currently being fetched */
  isLoading?: boolean;
  /** Map of account ID → account name for display */
  accountNames?: Record<string, string>;
}

export default function RateLimitIndicator({ isLoading, accountNames }: RateLimitIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AccountStatus>>({});
  const [appUsage, setAppUsage] = useState({ callCount: 0, totalCputime: 0, totalTime: 0 });
  const [overallMax, setOverallMax] = useState(0);
  const [anyThrottled, setAnyThrottled] = useState(false);

  // Poll rate limiter status every 500ms during loading, 2s otherwise
  const updateStatus = useCallback(() => {
    const all = rateLimiter.getAllStatuses();
    setStatuses(all.accounts);
    setAppUsage(all.appUsage);

    const entries = Object.values(all.accounts);
    if (entries.length === 0) {
      setOverallMax(0);
      setAnyThrottled(false);
    } else {
      const maxPct = Math.max(...entries.map((e) => e.maxUsagePct));
      setOverallMax(maxPct);
      setAnyThrottled(entries.some((e) => e.isThrottled));
    }
  }, []);

  useEffect(() => {
    updateStatus();
    const interval = setInterval(updateStatus, isLoading ? 500 : 2000);
    return () => clearInterval(interval);
  }, [isLoading, updateStatus]);

  // Also subscribe to onStatusChange for immediate updates
  useEffect(() => {
    rateLimiter.onStatusChange = () => {
      updateStatus();
    };
    return () => {
      rateLimiter.onStatusChange = undefined;
    };
  }, [updateStatus]);

  const accountEntries = Object.values(statuses)
    .filter((s) => s.accountId !== "global")
    .sort((a, b) => b.maxUsagePct - a.maxUsagePct);

  const hasData = accountEntries.length > 0 || appUsage.callCount > 0;

  // Don't render if no data and not loading
  if (!hasData && !isLoading) return null;

  return (
    <div className={`rounded-lg border transition-colors duration-300 ${getStatusBg(overallMax, anyThrottled)}`}>
      {/* Compact summary bar */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80 transition-opacity"
            >
              <span className={`flex items-center gap-1.5 ${getStatusColor(overallMax, anyThrottled)}`}>
                {getStatusIcon(overallMax, anyThrottled)}
                <span className="font-medium">API</span>
              </span>

              {/* Mini progress bar */}
              <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden max-w-[120px]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressColor(overallMax, anyThrottled)}`}
                  style={{ width: `${Math.min(overallMax, 100)}%` }}
                />
              </div>

              <span className={`font-mono tabular-nums ${getStatusColor(overallMax, anyThrottled)}`}>
                {overallMax > 0 ? `${Math.round(overallMax)}%` : "--"}
              </span>

              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-4 border-0 ${getStatusColor(overallMax, anyThrottled)} ${
                  anyThrottled ? "animate-pulse" : ""
                }`}
              >
                {getStatusLabel(overallMax, anyThrottled)}
              </Badge>

              {accountEntries.length > 0 && (
                <span className="text-muted-foreground ml-auto flex items-center gap-0.5">
                  {accountEntries.length} 帳號
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-xs">
            <p>Meta API 使用量監控</p>
            <p className="text-muted-foreground">
              綠色: 正常 (&lt;70%) | 黃色: 偏高 (70-90%) | 紅色: 即將限流 (&gt;90%)
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Expanded per-account details */}
      {expanded && accountEntries.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          {/* App-level usage */}
          {appUsage.callCount > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground pb-1 border-b border-border/30">
              <Activity className="w-3 h-3" />
              <span>App 層級</span>
              <span className="ml-auto font-mono tabular-nums">
                呼叫: {appUsage.callCount}% | CPU: {appUsage.totalCputime}% | 時間: {appUsage.totalTime}%
              </span>
            </div>
          )}

          {/* Per-account rows */}
          {accountEntries.map((acct) => {
            const name = accountNames?.[acct.accountId] || accountNames?.[acct.accountId.replace(/^act_/, "")] || "";
            return (
              <div key={acct.accountId} className="flex items-center gap-2 text-[11px]">
                <span className={`flex-shrink-0 ${getStatusColor(acct.maxUsagePct, acct.isThrottled)}`}>
                  {getStatusIcon(acct.maxUsagePct, acct.isThrottled)}
                </span>
                <span className="truncate max-w-[140px] text-foreground/80" title={acct.accountId}>
                  {name || formatAccountId(acct.accountId)}
                </span>
                <div className="flex-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${getProgressColor(acct.maxUsagePct, acct.isThrottled)}`}
                    style={{ width: `${Math.min(acct.maxUsagePct, 100)}%` }}
                  />
                </div>
                <span className={`font-mono tabular-nums flex-shrink-0 w-8 text-right ${getStatusColor(acct.maxUsagePct, acct.isThrottled)}`}>
                  {Math.round(acct.maxUsagePct)}%
                </span>
                {acct.isThrottled && (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 animate-pulse">
                    限流
                  </Badge>
                )}
                {acct.adsApiAccessTier !== "unknown" && (
                  <span className="text-[9px] text-muted-foreground flex-shrink-0">
                    {acct.adsApiAccessTier}
                  </span>
                )}
              </div>
            );
          })}

          {/* Legend */}
          <div className="flex items-center gap-3 pt-1 border-t border-border/30 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> 正常
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> 偏高
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> 限流
            </span>
            <span className="ml-auto">
              最大值 = max(call_count, cpu_time, total_time, acc_util)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
