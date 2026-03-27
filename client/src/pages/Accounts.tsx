/**
 * Accounts & Groups Page
 * Manage ad accounts, organize them into groups, and lookup BM IDs.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Trash2, RefreshCw, Loader2,
  Building2, Hash, Globe, FolderPlus, Palette,
  ChevronDown, ChevronRight, Edit2, Check, X, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  fetchAdAccounts, getAccountStatusLabel, fetchBmIdsForAccounts,
  type AdAccount,
} from "@/lib/metaApi";
import {
  getAccessToken, getManualAccounts, addManualAccount, removeManualAccount,
  getAutoFetch, getAccountGroups, createAccountGroup, updateAccountGroup,
  deleteAccountGroup, addAccountToGroup, removeAccountFromGroup,
  getBmIdCache, setBmIdForAccount, getAppealUrl,
  type AccountGroup,
} from "@/lib/store";
import CopyableId from "@/components/CopyableId";

export default function Accounts() {
  const [autoAccounts, setAutoAccounts] = useState<AdAccount[]>([]);
  const [manualAccounts, setManualAccountsList] = useState<string[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [newAccountId, setNewAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [bmLoading, setBmLoading] = useState(false);
  const [bmCache, setBmCache] = useState<Record<string, { bmId: string; bmName: string }>>({});

  // Group creation dialog
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupAccounts, setNewGroupAccounts] = useState("");

  // Group editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  // Expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Add account to group dialog
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null);
  const [addToGroupAccountId, setAddToGroupAccountId] = useState("");

  const accessToken = getAccessToken();
  const hasToken = !!accessToken;
  const autoFetchEnabled = getAutoFetch();

  useEffect(() => {
    setManualAccountsList(getManualAccounts());
    setGroups(getAccountGroups());
    setBmCache(getBmIdCache());
  }, []);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

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

  const handleFetchBmIds = useCallback(async () => {
    if (!accessToken) return;
    const allIds = [
      ...manualAccounts,
      ...groups.flatMap((g) => g.accountIds),
      ...autoAccounts.map((a) => a.account_id),
    ];
    const uniqueIds = Array.from(new Set(allIds)).filter((id) => !bmCache[id]);
    if (uniqueIds.length === 0) {
      toast.info("所有帳號的 BM ID 已快取");
      return;
    }
    setBmLoading(true);
    try {
      const results = await fetchBmIdsForAccounts(accessToken, uniqueIds);
      for (const [accountId, bm] of Object.entries(results)) {
        setBmIdForAccount(accountId, bm.bmId, bm.bmName);
      }
      setBmCache(getBmIdCache());
      toast.success(`成功取得 ${Object.keys(results).length} 個帳號的 BM ID`);
    } catch {
      toast.error("取得 BM ID 失敗");
    } finally {
      setBmLoading(false);
    }
  }, [accessToken, manualAccounts, groups, autoAccounts, bmCache]);

  const handleAddAccount = () => {
    const id = newAccountId.trim();
    if (!id) { toast.error("請輸入廣告帳號 ID"); return; }
    const cleaned = id.replace(/^act_/, "");
    if (!/^\d+$/.test(cleaned)) {
      toast.error("帳號 ID 格式不正確，應為數字");
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

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) { toast.error("請輸入群組名稱"); return; }
    const accountIds = newGroupAccounts
      .split(/[,\n\s]+/)
      .map((s) => s.trim().replace(/^act_/, ""))
      .filter((s) => /^\d+$/.test(s));
    const updated = createAccountGroup(newGroupName.trim(), accountIds);
    setGroups(updated);
    setShowGroupDialog(false);
    setNewGroupName("");
    setNewGroupAccounts("");
    toast.success(`已建立群組「${newGroupName.trim()}」`);
  };

  const handleDeleteGroup = (groupId: string) => {
    const updated = deleteAccountGroup(groupId);
    setGroups(updated);
    toast.success("已刪除群組");
  };

  const handleRenameGroup = (groupId: string) => {
    if (!editingGroupName.trim()) return;
    const updated = updateAccountGroup(groupId, { name: editingGroupName.trim() });
    setGroups(updated);
    setEditingGroupId(null);
    toast.success("已更新群組名稱");
  };

  const handleAddToGroup = () => {
    if (!addToGroupId || !addToGroupAccountId.trim()) return;
    const cleaned = addToGroupAccountId.trim().replace(/^act_/, "");
    if (!/^\d+$/.test(cleaned)) {
      toast.error("帳號 ID 格式不正確");
      return;
    }
    const updated = addAccountToGroup(addToGroupId, cleaned);
    setGroups(updated);
    setAddToGroupAccountId("");
    toast.success(`已新增帳號到群組`);
  };

  const handleRemoveFromGroup = (groupId: string, accountId: string) => {
    const updated = removeAccountFromGroup(groupId, accountId);
    setGroups(updated);
    toast.success("已從群組移除帳號");
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 1: return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case 2: return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      default: return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            帳號管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理廣告帳號、建立群組、查詢 BM ID
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetchBmIds}
            disabled={bmLoading || !hasToken}
            className="gap-1.5"
          >
            {bmLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
            取得 BM ID
          </Button>
          <Button
            size="sm"
            onClick={() => setShowGroupDialog(true)}
            className="gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            建立群組
          </Button>
        </div>
      </div>

      {/* Account Groups */}
      {groups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            帳號群組
          </h2>
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const isEditing = editingGroupId === group.id;
            const isAddingAccount = addToGroupId === group.id;

            return (
              <div key={group.id} className="gradient-border overflow-hidden">
                {/* Group header */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleGroupExpand(group.id)}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRenameGroup(group.id)}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRenameGroup(group.id)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingGroupId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold flex-1" style={{ fontFamily: "var(--font-display)" }}>
                        {group.name}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {group.accountIds.length} 個帳號
                      </Badge>
                    </>
                  )}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                      onClick={() => handleDeleteGroup(group.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>

                {/* Group content */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                    {group.accountIds.map((accountId) => {
                      const bm = bmCache[accountId];
                      const appealUrl = getAppealUrl(accountId);
                      return (
                        <div key={accountId} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-3 min-w-0">
                            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <CopyableId value={`act_${accountId}`} label="" className="text-sm" />
                            {bm && (
                              <span className="text-[11px] text-muted-foreground truncate">
                                BM: {bm.bmName || bm.bmId}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {appealUrl && (
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => window.open(appealUrl, "_blank")}
                                title="前往申訴頁面"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                              onClick={() => handleRemoveFromGroup(group.id, accountId)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {group.accountIds.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">此群組尚無帳號</p>
                    )}

                    {/* Add account to group */}
                    {isAddingAccount ? (
                      <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          placeholder="輸入帳號 ID"
                          value={addToGroupAccountId}
                          onChange={(e) => setAddToGroupAccountId(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddToGroup()}
                          className="h-8 text-sm font-mono"
                          autoFocus
                        />
                        <Button size="sm" className="h-8" onClick={handleAddToGroup}>新增</Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAddToGroupId(null); setAddToGroupAccountId(""); }}>取消</Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost" size="sm"
                        className="w-full mt-1 text-muted-foreground gap-1.5"
                        onClick={(e) => { e.stopPropagation(); setAddToGroupId(group.id); }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        新增帳號到此群組
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Auto-fetched accounts */}
      <div className="gradient-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                自動取得的帳號
              </h2>
              <p className="text-xs text-muted-foreground">
                透過 Access Token 自動取得所有關聯帳號
              </p>
            </div>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={fetchAutoAccounts}
            disabled={loading || !hasToken || !autoFetchEnabled}
            className="gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
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
            {autoAccounts.map((account) => {
              const bm = bmCache[account.account_id];
              const appealUrl = getAppealUrl(account.account_id);
              return (
                <div key={account.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{account.name || "Unnamed Account"}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${getStatusColor(account.account_status)}`}>
                        {getAccountStatusLabel(account.account_status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <CopyableId value={account.id} label="" className="text-[11px]" />
                      {account.currency && <span>{account.currency}</span>}
                      {bm && <span>BM: {bm.bmName || bm.bmId}</span>}
                    </div>
                  </div>
                  {appealUrl && (
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      onClick={() => window.open(appealUrl, "_blank")}
                      title="前往申訴頁面"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {autoAccounts.length === 0 && hasToken && autoFetchEnabled && !loading && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">點擊「取得帳號」來載入所有關聯帳號</p>
          </div>
        )}
      </div>

      {/* Manual accounts */}
      <div className="gradient-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Hash className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              手動新增帳號
            </h2>
            <p className="text-xs text-muted-foreground">
              輸入廣告帳號 ID 來手動新增要監控的帳號
            </p>
          </div>
        </div>

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
            className="bg-emerald-500 text-white hover:bg-emerald-600 gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            新增
          </Button>
        </div>

        {manualAccounts.length > 0 ? (
          <div className="space-y-2">
            {manualAccounts.map((id) => {
              const bm = bmCache[id];
              const appealUrl = getAppealUrl(id);
              return (
                <div key={id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <CopyableId value={`act_${id}`} label="" className="text-sm" />
                    {bm && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        BM: {bm.bmName || bm.bmId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {appealUrl && (
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => window.open(appealUrl, "_blank")}
                        title="前往申訴頁面"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => handleRemoveAccount(id)}
                      className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">尚未手動新增任何帳號</p>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          提示：可以輸入帶有或不帶有 act_ 前綴的帳號 ID
        </p>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>建立帳號群組</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">群組名稱</label>
              <Input
                placeholder="例如：台灣市場、遊戲廣告"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">廣告帳號 ID（選填）</label>
              <textarea
                className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={"每行一個帳號 ID，或用逗號分隔\n例如：\n123456789\n987654321"}
                value={newGroupAccounts}
                onChange={(e) => setNewGroupAccounts(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                可以之後再新增帳號到群組中
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupDialog(false)}>取消</Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>建立群組</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
