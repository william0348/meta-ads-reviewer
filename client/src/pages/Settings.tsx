/**
 * Settings Page — Access Token Configuration
 * 
 * Design: Light mode default, clean card-based layout
 * Allows users to set/update their Meta Marketing API access token.
 */

import { useState, useEffect } from "react";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  Loader2,
  AlertTriangle,
  Shield,
  Trash2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { validateToken } from "@/lib/metaApi";
import {
  getAccessToken,
  setAccessToken,
  getAutoFetch,
  setAutoFetch,
  clearAllSettings,
} from "@/lib/store";

export default function Settings() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [userName, setUserName] = useState<string | null>(null);
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(true);

  useEffect(() => {
    setToken(getAccessToken());
    setAutoFetchEnabled(getAutoFetch());
  }, []);

  const handleSaveToken = async () => {
    if (!token.trim()) {
      toast.error("請輸入 Access Token");
      return;
    }

    setValidating(true);
    setTokenStatus("idle");

    const result = await validateToken(token.trim());

    if (result.valid) {
      setAccessToken(token.trim());
      setTokenStatus("valid");
      setUserName(result.name || null);
      toast.success(`Token 驗證成功！使用者：${result.name}`);
    } else {
      setTokenStatus("invalid");
      toast.error(`Token 驗證失敗：${result.error}`);
    }

    setValidating(false);
  };

  const handleAutoFetchToggle = (checked: boolean) => {
    setAutoFetchEnabled(checked);
    setAutoFetch(checked);
    toast.success(checked ? "已啟用自動抓取帳號" : "已停用自動抓取帳號");
  };

  const handleClearAll = () => {
    if (confirm("確定要清除所有設定嗎？這將刪除 Access Token 和所有手動帳號。")) {
      clearAllSettings();
      setToken("");
      setTokenStatus("idle");
      setUserName(null);
      toast.success("所有設定已清除");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          設定
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置 Meta Marketing API 連線設定
        </p>
      </div>

      {/* Token section */}
      <div className="gradient-border p-5 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Access Token
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              輸入你的 Meta Marketing API Access Token。需要 ads_read 權限。
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              placeholder="EAAxxxxxxxx..."
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setTokenStatus("idle");
              }}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Token status */}
          {tokenStatus === "valid" && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
              <Check className="w-4 h-4" />
              <span>Token 有效 {userName && `— ${userName}`}</span>
            </div>
          )}
          {tokenStatus === "invalid" && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Token 無效或已過期</span>
            </div>
          )}

          <Button
            onClick={handleSaveToken}
            disabled={validating || !token.trim()}
            className="w-full gap-1.5"
          >
            {validating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                驗證中...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                驗證並儲存
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Auto-fetch toggle */}
      <div className="gradient-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <Label className="text-sm font-medium text-foreground">自動抓取廣告帳號</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                使用 Token 自動取得所有關聯的廣告帳號
              </p>
            </div>
          </div>
          <Switch
            checked={autoFetchEnabled}
            onCheckedChange={handleAutoFetchToggle}
          />
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 p-4 space-y-3">
        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Info className="w-4 h-4" />
          如何取得 Access Token
        </h4>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>前往 <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener" className="text-blue-600 dark:text-blue-400 hover:underline">Graph API Explorer</a></li>
          <li>選擇你的 App，或使用 Meta App</li>
          <li>新增 <code className="text-xs bg-muted px-1 py-0.5 rounded">ads_read</code> 和 <code className="text-xs bg-muted px-1 py-0.5 rounded">ads_management</code> 權限</li>
          <li>點擊「Generate Access Token」</li>
          <li>複製 Token 並貼到上方欄位</li>
        </ol>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Token 僅儲存在你的瀏覽器 localStorage 中，不會傳送到任何第三方伺服器。
        </p>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-red-600 dark:text-red-400">清除所有設定</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              刪除 Access Token 和所有手動新增的帳號
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除
          </Button>
        </div>
      </div>
    </div>
  );
}
