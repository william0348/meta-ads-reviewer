/**
 * Accounts & Groups Page
 * Manage ad accounts, organize them into groups.
 * BM IDs are automatically fetched when accounts are loaded.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Trash2, RefreshCw, Loader2,
  Building2, Hash, Globe, FolderPlus,
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
  getAccountNamesCache, setAccountNames, getCachedAutoAccounts, setCachedAutoAccounts,
  getExcludedAccounts, setExcludedAccounts,
  type AccountGroup,
} from "@/lib/store";
import CopyableId from "@/components/CopyableId";
import { trpc } from "@/lib/trpc";
import { EyeOff, Eye } from "lucide-react";

export default function Accounts() {
  const [autoAccounts, setAutoAccounts] = useState<AdAccount[]>([]);
  const [manualAccounts, setManualAccountsList] = useState<string[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [newAccountId, setNewAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [bmCache, setBmCache] = useState<Record<string, { bmId: string; bmName: string }>>({});

  // Group creation dialog
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupAccounts, setNewGroupAccounts] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());

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

  const [accountNames, setAccountNamesState] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'other' | 'excluded'>('all');

  // Excluded accounts
  const [excludedAccountIds, setExcludedAccountIds] = useState<string[]>([]);
  const saveExcludedMutation = trpc.settings.saveExcludedAccounts.useMutation();

  useEffect(() => {
    setManualAccountsList(getManualAccounts());
    setGroups(getAccountGroups());
    setBmCache(getBmIdCache());
    setAccountNamesState(getAccountNamesCache());
    setExcludedAccountIds(getExcludedAccounts());
    // Load cached auto accounts
    const cachedAuto = getCachedAutoAccounts();
    if (cachedAuto.length > 0) setAutoAccounts(cachedAuto);
  }, []);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  /**
   * Auto-fetch BM IDs for a list of account IDs.
   * Only fetches for accounts not already in cache.
   */
  const autoFetchBmIds = useCallback(async (accountIds: string[]) => {
    if (!accessToken || accountIds.length === 0) return;
    const currentCache = getBmIdCache();
    const uncachedIds = accountIds.filter((id) => !currentCache[id]);
    if (uncachedIds.length === 0) return;

    try {
      const results = await fetchBmIdsForAccounts(accessToken, uncachedIds);
      for (const [accountId, bm] of Object.entries(results)) {
        setBmIdForAccount(accountId, bm.bmId, bm.bmName);
      }
      setBmCache(getBmIdCache());
      if (Object.keys(results).length > 0) {
        toast.success(`自動取得 ${Object.keys(results).length} 個帳號的 BM ID`);
      }
    } catch {
      // Non-critical, silently fail
      console.warn("Auto BM ID fetch failed");
    }
  }, [accessToken]);

  const fetchAutoAccounts = useCallback(async () => {
    if (!accessToken) {
      toast.error("請先設定 Access Token");
      return;
    }
    setLoading(true);
    try {
      const allAccounts = await fetchAdAccounts(accessToken);
      // Only keep Active accounts (account_status === 1)
      const accounts = allAccounts.filter(acc => acc.account_status === 1);
      const skippedCount = allAccounts.length - accounts.length;
      setAutoAccounts(accounts);
      setCachedAutoAccounts(accounts);
      // Update account names cache
      const names: Record<string, string> = {};
      const accountIds: string[] = [];
      for (const acc of accounts) {
        const id = acc.account_id.replace(/^act_/, '');
        if (acc.name) names[id] = acc.name;
        accountIds.push(id);
      }
      if (Object.keys(names).length > 0) {
        setAccountNames(names);
        setAccountNamesState(getAccountNamesCache());
      }
      toast.success(`成功取得 ${accounts.length} 個 Active 廣告帳號${skippedCount > 0 ? `（已跳過 ${skippedCount} 個非 Active 帳號）` : ''}`);

      // Auto-fetch BM IDs for all accounts (including manual + group accounts)
      const manualIds = getManualAccounts();
      const groupIds = getAccountGroups().flatMap((g) => g.accountIds);
      const allIds = Array.from(new Set([...accountIds, ...manualIds, ...groupIds]));
      autoFetchBmIds(allIds);
    } catch (err) {
      toast.error("無法取得帳號：" + (err instanceof Error ? err.message : "未知錯誤"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, autoFetchBmIds]);

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

    // Auto-fetch BM ID for the newly added account
    autoFetchBmIds([cleaned]);
  };

  const handleRemoveAccount = (id: string) => {
    const updated = removeManualAccount(id);
    setManualAccountsList(updated);
    toast.success(`已移除帳號 ${id}`);
  };

  // Collect all available accounts for selection
  const allAvailableAccounts = (() => {
    const map = new Map<string, { id: string; name?: string; source: string }>();
    // Manual accounts
    manualAccounts.forEach((id) => {
      map.set(id, { id, name: undefined, source: '手動新增' });
    });
    // Auto-fetched accounts
    autoAccounts.forEach((acc) => {
      const numId = acc.account_id.replace(/^act_/, '');
      map.set(numId, { id: numId, name: acc.name, source: '自動取得' });
    });
    return Array.from(map.values());
  })();

  const toggleAccountSelection = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAccountIds.size === allAvailableAccounts.length) {
      setSelectedAccountIds(new Set());
    } else {
      setSelectedAccountIds(new Set(allAvailableAccounts.map((a) => a.id)));
    }
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) { toast.error("請輸入群組名稱"); return; }
    // Combine selected accounts + manually typed accounts
    const typedIds = newGroupAccounts
      .split(/[,\n\s]+/)
      .map((s) => s.trim().replace(/^act_/, ""))
      .filter((s) => /^\d+$/.test(s));
    const allIds = Array.from(new Set([...Array.from(selectedAccountIds), ...typedIds]));
    const updated = createAccountGroup(newGroupName.trim(), allIds);
    setGroups(updated);
    setShowGroupDialog(false);
    setNewGroupName("");
    setNewGroupAccounts("");
    setSelectedAccountIds(new Set());
    toast.success(`已建立群組「${newGroupName.trim()}」，包含 ${allIds.length} 個帳號`);

    // Auto-fetch BM IDs for newly grouped accounts
    autoFetchBmIds(allIds);
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

    // Auto-fetch BM ID for the newly added account
    autoFetchBmIds([cleaned]);
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

  // Toggle exclude/include for an account
  const handleToggleExclude = (accountId: string) => {
    const cleaned = accountId.replace(/^act_/, '');
    const newExcluded = excludedAccountIds.includes(cleaned)
      ? excludedAccountIds.filter(id => id !== cleaned)
      : [...excludedAccountIds, cleaned];
    setExcludedAccountIds(newExcluded);
    setExcludedAccounts(newExcluded);
    // Persist to DB
    saveExcludedMutation.mutate({ excludedAccounts: newExcluded });
    const isNowExcluded = newExcluded.includes(cleaned);
    toast.success(isNowExcluded ? `已排除帳號 act_${cleaned}` : `已恢復帳號 act_${cleaned}`);
  };

  // Account status stats
  const statusStats = (() => {
    const stats = { active: 0, disabled: 0, other: 0, excluded: 0 };
    for (const acc of autoAccounts) {
      const numId = acc.account_id.replace(/^act_/, '');
      if (excludedAccountIds.includes(numId)) {
        stats.excluded++;
        continue;
      }
      if (acc.account_status === 1) stats.active++;
      else if (acc.account_status === 2) stats.disabled++;
      else stats.other++;
    }
    return stats;
  })();

  // Filter auto accounts by status
  const filteredAutoAccounts = autoAccounts.filter(acc => {
    const numId = acc.account_id.replace(/^act_/, '');
    const isExcluded = excludedAccountIds.includes(numId);
    if (statusFilter === 'excluded') return isExcluded;
    // For non-excluded filters, hide excluded accounts
    if (isExcluded) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return acc.account_status === 1;
    if (statusFilter === 'disabled') return acc.account_status === 2;
    return acc.account_status !== 1 && acc.account_status !== 2; // 'other'
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            帳號管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理廣告帳號、建立群組（BM ID 自動取得）
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowGroupDialog(true)}
          className="gap-1.5"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          建立群組
        </Button>
      </div>

      {/* Account Groups */}
      {groups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground tracking-wider">
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
                      const accName = accountNames[accountId];
                      return (
                        <div key={accountId} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-3 min-w-0">
                            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <CopyableId value={`act_${accountId}`} label="" className="text-sm" />
                            {accName && (
                              <span className="text-xs font-medium truncate">{accName}</span>
                            )}
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
                      <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                        {/* Quick-select from existing accounts not yet in this group */}
                        {(() => {
                          const notInGroup = allAvailableAccounts.filter(
                            (a) => !group.accountIds.includes(a.id)
                          );
                          if (notInGroup.length === 0) return null;
                          return (
                            <div className="border border-border rounded-lg max-h-36 overflow-y-auto divide-y divide-border">
                              {notInGroup.map((acc) => (
                                <button
                                  key={acc.id}
                                  type="button"
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm"
                                  onClick={() => {
                                    const updated = addAccountToGroup(group.id, acc.id);
                                    setGroups(updated);
                                    toast.success(`已新增 act_${acc.id} 到群組`);
                                    // Auto-fetch BM ID
                                    autoFetchBmIds([acc.id]);
                                  }}
                                >
                                  <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="font-mono text-xs">act_{acc.id}</span>
                                  {acc.name && <span className="text-xs text-muted-foreground truncate">({acc.name})</span>}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        <div className="flex gap-2">
                          <Input
                            placeholder="或手動輸入帳號 ID"
                            value={addToGroupAccountId}
                            onChange={(e) => setAddToGroupAccountId(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddToGroup()}
                            className="h-8 text-sm font-mono"
                          />
                          <Button size="sm" className="h-8" onClick={handleAddToGroup}>新增</Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAddToGroupId(null); setAddToGroupAccountId(""); }}>取消</Button>
                        </div>
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
                透過 Access Token 自動取得所有關聯帳號（含 BM ID）
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
            {/* Status summary bar */}
            <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  statusFilter === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                全部
                <span className="tabular-nums">{autoAccounts.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  statusFilter === 'active'
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                }`}
              >
                Active
                <span className="tabular-nums">{statusStats.active}</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('disabled')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  statusFilter === 'disabled'
                    ? 'bg-rose-500 text-white border-rose-500'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20'
                }`}
              >
                Disabled
                <span className="tabular-nums">{statusStats.disabled}</span>
              </button>
              {statusStats.other > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('other')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    statusFilter === 'other'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
                  }`}
                >
                  Other
                  <span className="tabular-nums">{statusStats.other}</span>
                </button>
              )}
              {statusStats.excluded > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('excluded')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    statusFilter === 'excluded'
                      ? 'bg-gray-500 text-white border-gray-500'
                      : 'bg-gray-500/10 text-gray-500 border-gray-500/20 hover:bg-gray-500/20'
                  }`}
                >
                  <EyeOff className="w-3 h-3" />
                  已排除
                  <span className="tabular-nums">{statusStats.excluded}</span>
                </button>
              )}
            </div>
            {filteredAutoAccounts.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  {statusFilter === 'disabled' ? '沒有 Disabled 狀態的帳號' : `沒有符合「${statusFilter}」篩選條件的帳號`}
                </p>
              </div>
            )}
            {filteredAutoAccounts.map((account) => {
              const numId = account.account_id.replace(/^act_/, '');
              const bm = bmCache[numId] || bmCache[account.account_id];
              const appealUrl = getAppealUrl(numId);
              const isExcluded = excludedAccountIds.includes(numId);
              return (
                <div key={account.id} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isExcluded ? 'bg-muted/20 opacity-60' : 'bg-muted/30 hover:bg-muted/50'}`}>
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${isExcluded ? 'bg-gray-500/10' : 'bg-blue-500/10'}`}>
                    {isExcluded ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Building2 className="w-4 h-4 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${isExcluded ? 'line-through text-muted-foreground' : ''}`}>{account.name || "Unnamed Account"}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${getStatusColor(account.account_status)}`}>
                        {getAccountStatusLabel(account.account_status)}
                      </Badge>
                      {isExcluded && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-gray-500/10 text-gray-500 border-gray-500/20">
                          已排除
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <CopyableId value={account.id} label="" className="text-[11px]" />
                      {account.currency && <span>{account.currency}</span>}
                      {bm && (
                        <span className="truncate">
                          BM: {bm.bmName || bm.bmId}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon" variant="ghost"
                      className={`h-7 w-7 ${isExcluded ? 'text-emerald-500 hover:text-emerald-600' : 'text-muted-foreground hover:text-rose-500'}`}
                      onClick={() => handleToggleExclude(numId)}
                      title={isExcluded ? '恢復抓取此帳號' : '排除此帳號（不抓取廣告）'}
                    >
                      {isExcluded ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </Button>
                    {appealUrl && (
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => window.open(appealUrl, "_blank")}
                        title="前往申訴頁面"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
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
                    {accountNames[id] && (
                      <span className="text-xs font-medium text-foreground truncate">
                        {accountNames[id]}
                      </span>
                    )}
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
      <Dialog open={showGroupDialog} onOpenChange={(open) => {
        setShowGroupDialog(open);
        if (!open) { setSelectedAccountIds(new Set()); setNewGroupAccounts(""); setNewGroupName(""); }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>建立帳號群組</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div>
              <label className="text-sm font-medium mb-1.5 block">群組名稱</label>
              <Input
                placeholder="例如：台灣市場、遊戲廣告"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>

            {/* Select from existing accounts */}
            {allAvailableAccounts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">從已有帳號中選取</label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={toggleSelectAll}
                  >
                    {selectedAccountIds.size === allAvailableAccounts.length ? '取消全選' : '全選'}
                  </button>
                </div>
                <div className="border border-border rounded-lg max-h-52 overflow-y-auto divide-y divide-border">
                  {allAvailableAccounts.map((acc) => {
                    const isChecked = selectedAccountIds.has(acc.id);
                    const bm = bmCache[acc.id];
                    return (
                      <label
                        key={acc.id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/50 ${
                          isChecked ? 'bg-primary/5' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAccountSelection(acc.id)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono">act_{acc.id}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                              {acc.source}
                            </Badge>
                          </div>
                          {(acc.name || bm) && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {acc.name && <span>{acc.name}</span>}
                              {acc.name && bm && <span> · </span>}
                              {bm && <span>BM: {bm.bmName || bm.bmId}</span>}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  已選取 {selectedAccountIds.size} / {allAvailableAccounts.length} 個帳號
                </p>
              </div>
            )}

            {allAvailableAccounts.length === 0 && (
              <div className="text-center py-4 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground">尚未設定任何帳號</p>
                <p className="text-xs text-muted-foreground mt-1">請先在上方手動新增或自動取得帳號</p>
              </div>
            )}

            {/* Additional manual input */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">額外輸入帳號 ID（選填）</label>
              <textarea
                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={"輸入不在上方列表中的帳號 ID\n每行一個或用逗號分隔"}
                value={newGroupAccounts}
                onChange={(e) => setNewGroupAccounts(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupDialog(false)}>取消</Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
              建立群組{(selectedAccountIds.size > 0 || newGroupAccounts.trim()) && (
                <span className="ml-1">({selectedAccountIds.size + (newGroupAccounts.trim() ? newGroupAccounts.split(/[,\n\s]+/).filter((s) => /^\d+$/.test(s.trim().replace(/^act_/, ''))).length : 0)} 個帳號)</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
