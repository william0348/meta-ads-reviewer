/**
 * AdDetailDialog — View-only ad detail dialog.
 * Shows ad creative preview, rejection reasons, and appeal actions.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import CopyableId from "./CopyableId";
import type { DisapprovedAd } from "@/lib/metaApi";
import { requestAdReview } from "@/lib/metaApi";
import { getAccessToken } from "@/lib/store";

export interface AdDetailDialogProps {
  ad: DisapprovedAd | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdUpdated?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function AdDetailDialog({ ad, open, onOpenChange, onAdUpdated, onRefresh, isRefreshing }: AdDetailDialogProps) {
  const [isAppealing, setIsAppealing] = useState(false);

  if (!ad) return null;

  const feedbackItems = ad.parsed_review_feedback ?? [];

  const handleRequestReview = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("請先設定 Access Token");
      return;
    }

    setIsAppealing(true);
    try {
      const result = await requestAdReview(token, ad.id);
      if (result.success) {
        toast.success("已成功提交重新審核申請");
        onAdUpdated?.();
      } else {
        toast.error(`申訴失敗: ${result.error}`);
      }
    } catch {
      toast.error("申訴過程發生錯誤");
    } finally {
      setIsAppealing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg">
            <span className="truncate">{ad.name || "Unnamed Ad"}</span>
            <Badge variant="destructive" className="shrink-0 text-xs">
              Disapproved
            </Badge>
            {ad.effective_status && ad.effective_status !== "DISAPPROVED" && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {ad.effective_status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* ── IDs Section ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 p-3 rounded-lg bg-muted/50">
            <CopyableId label="Ad ID" value={ad.id} />
            {ad.account_id && <CopyableId label="帳號" value={ad.account_id.startsWith('act_') ? ad.account_id : `act_${ad.account_id}`} />}
            {ad.campaign_id && <CopyableId label="Campaign ID" value={ad.campaign_id} />}
            {ad.adset_id && <CopyableId label="Ad Set ID" value={ad.adset_id} />}
            {ad.promoted_object_app_id && <CopyableId label="App ID" value={ad.promoted_object_app_id} />}
          </div>

          {/* ── Campaign / AdSet Names ── */}
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
          </div>

          {/* ── Spend Info ── */}
          {(ad.spend_30d !== undefined && ad.spend_30d > 0) && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                <span className="text-[10px] text-muted-foreground tracking-wider block">30天花費</span>
                <p className="text-sm font-semibold mt-0.5">${ad.spend_30d?.toFixed(2)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                <span className="text-[10px] text-muted-foreground tracking-wider block">曝光</span>
                <p className="text-sm font-semibold mt-0.5">{(ad.impressions_30d ?? 0).toLocaleString()}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                <span className="text-[10px] text-muted-foreground tracking-wider block">點擊</span>
                <p className="text-sm font-semibold mt-0.5">{(ad.clicks_30d ?? 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          <Separator />

          {/* ── Creative Preview (View Only) ── */}
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-muted-foreground mb-3">
              廣告素材
            </h3>

            {/* Thumbnail */}
            {ad.creative?.thumbnail_url && (
              <div className="mb-3 rounded-lg overflow-hidden border border-border bg-muted/30 max-w-sm">
                <img
                  src={ad.creative.thumbnail_url}
                  alt="Ad creative"
                  className="w-full h-auto"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            {!ad.creative?.thumbnail_url && (
              <div className="mb-3 w-full h-32 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/20 max-w-sm">
                <ImageOff className="w-8 h-8 text-muted-foreground" />
              </div>
            )}

            <div className="space-y-2 rounded-lg bg-muted/30 p-3">
              {ad.creative?.title && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">標題</span>
                  <p className="text-sm font-medium mt-0.5">{ad.creative.title}</p>
                </div>
              )}
              {ad.creative?.body && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">內文</span>
                  <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap">{ad.creative.body}</p>
                </div>
              )}
              {ad.creative?.link_url && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">連結</span>
                  <p className="text-sm text-primary mt-0.5 truncate">{ad.creative.link_url}</p>
                </div>
              )}
              {ad.creative?.call_to_action_type && (
                <div>
                  <span className="text-[10px] text-muted-foreground tracking-wider">CTA</span>
                  <p className="text-sm mt-0.5">{ad.creative.call_to_action_type}</p>
                </div>
              )}
              {!ad.creative?.title && !ad.creative?.body && !ad.creative?.link_url && (
                <p className="text-sm text-muted-foreground italic">無可用的素材資訊</p>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Policy Violations ── */}
          {ad.policy_violations && ad.policy_violations.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 space-y-2">
              <h3 className="text-sm font-semibold tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Policy Violation
              </h3>
              <div className="flex flex-wrap gap-2">
                {ad.policy_violations.map((v, i) => (
                  <Badge key={i} variant="outline" className="text-xs px-2.5 py-1 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30">
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* ── Review Feedback ── */}
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-destructive flex items-center gap-1.5 mb-3">
              <AlertTriangle className="w-4 h-4" />
              拒登詳細原因
            </h3>
            {feedbackItems.length > 0 ? (
              <div className="space-y-2">
                {feedbackItems.map((item, i) => (
                  <div key={i} className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                    <span className="text-[10px] font-mono text-destructive/70">{item.key}</span>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{item.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">無拒登原因資訊</p>
            )}
          </div>

          <Separator />

          {/* ── Time Info ── */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {ad.created_time && (
              <div>
                <span className="text-[10px] text-muted-foreground tracking-wider">建立時間</span>
                <p className="mt-0.5">{new Date(ad.created_time).toLocaleString("zh-TW")}</p>
              </div>
            )}
            {ad.updated_time && (
              <div>
                <span className="text-[10px] text-muted-foreground tracking-wider">拒登日期</span>
                <p className="mt-0.5 text-rose-600 dark:text-rose-400 font-medium">{new Date(ad.updated_time).toLocaleString("zh-TW")}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* ── Action Buttons ── */}
          <div className="flex flex-wrap gap-2">
            {/* Refresh single ad */}
            {onRefresh && (
              <Button
                onClick={onRefresh}
                disabled={isRefreshing}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? '更新中...' : '重新抓取此廣告'}
              </Button>
            )}

            <Button
              onClick={handleRequestReview}
              disabled={isAppealing}
              className="gap-1.5"
              size="sm"
            >
              {isAppealing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              申請重新審核
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                window.open(
                  `https://www.facebook.com/ads/manager/account/campaigns?act=${ad.account_id?.replace("act_", "")}&selected_ad_ids=${ad.id}`,
                  "_blank"
                )
              }
            >
              <ExternalLink className="w-3.5 h-3.5" />
              在 Ads Manager 中查看
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
