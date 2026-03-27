/**
 * Accounts Page — Ad Account Management
 * 
 * Design: Tactical Dashboard — Dark Data-Driven
 * Two sections: auto-fetched accounts from token, and manually added account IDs.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Building2,
  Hash,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  fetchAdAccounts,
  getAccountStatusLabel,
  type AdAccount,
} from "@/lib/metaApi";
import {
  getAccessToken,
  getManualAccounts,
  addManualAccount,
  removeManualAccount,
  getAutoFetch,
} from "@/lib/store";

const ACCOUNTS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663317876169/6LULQWiHUSoenQBHuSwVJQ/accounts-illustration-ByyWNv75BRWNzWczZgUPD6.webp";

export default function Accounts() {
  const [autoAccounts, setAutoAccounts] = useState<AdAccount[]>([]);
  const [manualAccounts, setManualAccountsList] = useState<string[]>([]);
  const [newAccountId, setNewAccountId] = useState("");
  const [loading, setLoading] = useState(false);

  const accessToken = getAccessToken();
  const hasToken = !!accessToken;
  const autoFetchEnabled = getAutoFetch();

  useEffect(() => {
    setManualAccountsList(getManualAccounts());
  }, []);

  const fetchAutoAccounts = useCallback(async () => {
    if (!accessToken) {
      toast.error("請先設定 Access Token");
      return;
    }

    setLoading(true);
    try {
      const accounts = await fetchAdAccounts(accessToken);
      setAutoAccounts(accounts);
      toast.success(`成功取得 ${accounts.length} 個廣告帳號`);
    } catch (err) {
      toast.error("無法取得帳號：" + (err instanceof Error ? err.message : "未知錯誤"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const handleAddAccount = () => {
    const id = newAccountId.trim();
    if (!id) {
      toast.error("請輸入廣告帳號 ID");
      return;
    }

    // Validate format - should be numeric (with optional act_ prefix)
    const cleaned = id.replace(/^act_/, "");
    if (!/^\d+$/.test(cleaned)) {
      toast.error("帳號 ID 格式不正確，應為數字（例如：123456789）");
      return;
    }

    const updated = addManualAccount(id);
    setManualAccountsList(updated);
    setNewAccountId("");
    toast.success(`已新增帳號 ${cleaned}`);
  };

  const handleRemoveAccount = (id: string) => {
    const updated = removeManualAccount(id);
    setManualAccountsList(updated);
    toast.success(`已移除帳號 ${id}`);
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 1:
        return "bg-emerald/10 text-emerald border-emerald/20";
      case 2:
        return "bg-rose/10 text-rose border-rose/20";
      default:
        return "bg-amber/10 text-amber border-amber/20";
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          帳號管理
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理要監控的 Meta 廣告帳號
        </p>
      </div>

      {/* Auto-fetched accounts */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="gradient-border p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-sky" />
            </div>
            <div>
              <h2
                className="text-base font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                自動取得的帳號
              </h2>
              <p className="text-xs text-muted-foreground">
                透過 Access Token 自動取得所有關聯帳號
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAutoAccounts}
            disabled={loading || !hasToken || !autoFetchEnabled}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            取得帳號
          </Button>
        </div>

        {!hasToken && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">請先設定 Access Token</p>
          </div>
        )}

        {!autoFetchEnabled && hasToken && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">自動抓取已停用，請在設定中啟用</p>
          </div>
        )}

        {autoAccounts.length > 0 && (
          <div className="space-y-2">
            {autoAccounts.map((account, index) => (
              <motion.div
                key={account.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-sky/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-sky" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {account.name || "Unnamed Account"}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-4 ${getStatusColor(account.account_status)}`}
                    >
                      {getAccountStatusLabel(account.account_status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono mt-0.5">
                    <span>{account.id}</span>
                    {account.currency && <span>{account.currency}</span>}
                    {account.business_name && (
                      <span className="truncate">{account.business_name}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {autoAccounts.length === 0 && hasToken && autoFetchEnabled && !loading && (
          <div className="text-center py-6">
            <img
              src={ACCOUNTS_IMG}
              alt="Accounts"
              className="w-20 h-20 mx-auto mb-3 opacity-40"
            />
            <p className="text-sm text-muted-foreground">
              點擊「取得帳號」來載入所有關聯帳號
            </p>
          </div>
        )}
      </motion.div>

      {/* Manual accounts */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="gradient-border p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center">
            <Hash className="w-5 h-5 text-emerald" />
          </div>
          <div>
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              手動新增帳號
            </h2>
            <p className="text-xs text-muted-foreground">
              輸入廣告帳號 ID 來手動新增要監控的帳號
            </p>
          </div>
        </div>

        {/* Add account input */}
        <div className="flex gap-2">
          <Input
            placeholder="輸入廣告帳號 ID（例如：123456789）"
            value={newAccountId}
            onChange={(e) => setNewAccountId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddAccount()}
            className="bg-muted/50 border-border font-mono text-sm"
          />
          <Button
            onClick={handleAddAccount}
            disabled={!newAccountId.trim()}
            className="bg-emerald text-white hover:bg-emerald/90 gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            新增
          </Button>
        </div>

        {/* Manual accounts list */}
        <AnimatePresence mode="popLayout">
          {manualAccounts.length > 0 ? (
            <div className="space-y-2">
              {manualAccounts.map((id) => (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-md bg-emerald/10 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-emerald" />
                    </div>
                    <span className="text-sm font-mono">act_{id}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAccount(id)}
                    className="h-7 w-7 text-muted-foreground hover:text-rose"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                尚未手動新增任何帳號
              </p>
            </div>
          )}
        </AnimatePresence>

        <p className="text-[10px] text-muted-foreground">
          提示：可以輸入帶有或不帶有 act_ 前綴的帳號 ID
        </p>
      </motion.div>
    </div>
  );
}
