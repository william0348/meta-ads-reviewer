/**
 * Settings Page — Access Token Configuration
 * 
 * Design: Tactical Dashboard — Dark Data-Driven
 * Allows users to set/update their Meta Marketing API access token.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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

const SETTINGS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663317876169/6LULQWiHUSoenQBHuSwVJQ/settings-illustration-CMdVMxcTNvsNX9nia42yh2.webp";

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
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          設定
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置 Meta Marketing API 連線設定
        </p>
      </div>

      {/* Token section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="gradient-border p-5 space-y-5"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-sky" />
          </div>
          <div>
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
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
              className="pr-10 bg-muted/50 border-border font-mono text-sm"
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
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-emerald text-sm"
            >
              <Check className="w-4 h-4" />
              <span>Token 有效 {userName && `— ${userName}`}</span>
            </motion.div>
          )}
          {tokenStatus === "invalid" && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-rose text-sm"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Token 無效或已過期</span>
            </motion.div>
          )}

          <Button
            onClick={handleSaveToken}
            disabled={validating || !token.trim()}
            className="w-full bg-sky text-white hover:bg-sky/90 gap-1.5"
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
      </motion.div>

      {/* Auto-fetch toggle */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="gradient-border p-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald" />
            </div>
            <div>
              <Label className="text-sm font-medium">自動抓取廣告帳號</Label>
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
      </motion.div>

      {/* Info card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-lg border border-sky/20 bg-sky/5 p-4 space-y-3"
      >
        <h4 className="text-sm font-medium text-sky flex items-center gap-2">
          <Info className="w-4 h-4" />
          如何取得 Access Token
        </h4>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>前往 <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener" className="text-sky hover:underline">Graph API Explorer</a></li>
          <li>選擇你的 App，或使用 Meta App</li>
          <li>新增 <code className="text-xs bg-muted px-1 py-0.5 rounded">ads_read</code> 和 <code className="text-xs bg-muted px-1 py-0.5 rounded">ads_management</code> 權限</li>
          <li>點擊「Generate Access Token」</li>
          <li>複製 Token 並貼到上方欄位</li>
        </ol>
        <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Token 僅儲存在你的瀏覽器 localStorage 中，不會傳送到任何第三方伺服器。
        </p>
      </motion.div>

      {/* Danger zone */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-lg border border-rose/20 bg-rose/5 p-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-rose">清除所有設定</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              刪除 Access Token 和所有手動新增的帳號
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="border-rose/30 text-rose hover:bg-rose/10 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
