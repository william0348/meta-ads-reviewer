/**
 * Account Appeals Page
 * View disabled ad accounts, filter by App ID, and submit appeals.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  RefreshCw,
  Search,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  Smartphone,
  Send,
  Copy,
  ExternalLink,
  Filter,
} from 'lucide-react';
import {
  fetchAdAccounts,
  fetchAllAccountAppIds,
  fetchAppNames,
  requestAdAccountReview,
  getAccountStatusLabel,
  type AdAccount,
  type AccountAppealResult,
} from '@/lib/metaApi';
import {
  getAccessToken,
  getCachedAutoAccounts,
  setCachedAutoAccounts,
  getBmIdCache,
  getAppealUrl,
} from '@/lib/store';

// Status badge color helper
function getStatusColor(status: number): string {
  switch (status) {
    case 1: return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 2: return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
    case 7: return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 100: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

// Copyable ID component
function CopyableId({ label, value }: { label: string; value: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    toast.success(`已複製: ${value}`);
  };
  return (
    <span
      className="inline-flex items-center gap-1 cursor-pointer hover:text-blue-600 transition-colors"
      onClick={handleCopy}
      title="點擊複製"
    >
      <span className="text-muted-foreground text-xs">{label}:</span>
      <span className="font-mono text-xs">{value}</span>
      <Copy className="w-3 h-3 text-muted-foreground" />
    </span>
  );
}

export default function AccountAppeals() {
  const token = getAccessToken();

  // State
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'disabled' | 'pending_review' | 'other'>('disabled');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [accountAppIds, setAccountAppIds] = useState<Record<string, string[]>>({});
  const [appNames, setAppNames] = useState<Record<string, string>>({});
  const [loadingApps, setLoadingApps] = useState(false);
  const [appProgress, setAppProgress] = useState({ completed: 0, total: 0 });

  // Appeal state
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [appealBmId, setAppealBmId] = useState('');
  const [appealAppId, setAppealAppId] = useState('');
  const [appealing, setAppealing] = useState(false);
  const [appealResults, setAppealResults] = useState<AccountAppealResult[]>([]);

  // Load cached accounts on mount
  useEffect(() => {
    const cached = getCachedAutoAccounts();
    if (cached.length > 0) {
      setAccounts(cached);
    }
  }, []);

  // Auto-detect BM ID from cache
  useEffect(() => {
    if (!appealBmId) {
      const bmCache = getBmIdCache();
      const bmIds = Object.values(bmCache);
      if (bmIds.length > 0) {
        setAppealBmId(bmIds[0].bmId);
      }
    }
  }, [appealBmId]);

  // Fetch accounts from API
  const handleFetchAccounts = useCallback(async () => {
    if (!token) {
      toast.error('請先設定 Access Token');
      return;
    }
    setLoading(true);
    try {
      const fetched = await fetchAdAccounts(token);
      setAccounts(fetched);
      setCachedAutoAccounts(fetched);
      toast.success(`取得 ${fetched.length} 個帳號`);
    } catch (err: unknown) {
      toast.error(`取得帳號失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch App IDs for disabled accounts
  const handleFetchAppIds = useCallback(async () => {
    if (!token) return;
    const disabledAccounts = accounts.filter((a) => a.account_status === 2);
    if (disabledAccounts.length === 0) {
      toast.info('沒有停用的帳號');
      return;
    }
    setLoadingApps(true);
    setAppProgress({ completed: 0, total: disabledAccounts.length });
    try {
      const result = await fetchAllAccountAppIds(token, disabledAccounts, (completed, total) => {
        setAppProgress({ completed, total });
      });
      setAccountAppIds(result);

      // Collect all unique app IDs and fetch names
      const allAppIds = new Set<string>();
      for (const ids of Object.values(result)) {
        ids.forEach((id) => allAppIds.add(id));
      }
      if (allAppIds.size > 0) {
        const names = await fetchAppNames(token, Array.from(allAppIds));
        setAppNames(names);
      }

      toast.success(`已取得 ${disabledAccounts.length} 個停用帳號的 App 資訊`);
    } catch (err: unknown) {
      toast.error(`取得 App 資訊失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
    } finally {
      setLoadingApps(false);
    }
  }, [token, accounts]);

  // Fetch app names for unique app IDs when accountAppIds changes
  useEffect(() => {
    const allAppIds = new Set<string>();
    for (const ids of Object.values(accountAppIds)) {
      ids.forEach((id) => allAppIds.add(id));
    }
    if (allAppIds.size > 0 && token) {
      fetchAppNames(token, Array.from(allAppIds)).then(setAppNames);
    }
  }, [accountAppIds, token]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { all: accounts.length, disabled: 0, pending_review: 0, other: 0 };
    for (const acc of accounts) {
      if (acc.account_status === 2) counts.disabled++;
      else if (acc.account_status === 7 || acc.account_status === 100) counts.pending_review++;
      else if (acc.account_status !== 1) counts.other++;
    }
    return counts;
  }, [accounts]);

  // Unique App IDs from disabled accounts
  const uniqueAppIds = useMemo(() => {
    const ids = new Set<string>();
    for (const appIds of Object.values(accountAppIds)) {
      appIds.forEach((id) => ids.add(id));
    }
    return Array.from(ids).sort();
  }, [accountAppIds]);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    let filtered = accounts;

    // Status filter
    if (statusFilter === 'disabled') {
      filtered = filtered.filter((a) => a.account_status === 2);
    } else if (statusFilter === 'pending_review') {
      filtered = filtered.filter((a) => a.account_status === 7 || a.account_status === 100);
    } else if (statusFilter === 'other') {
      filtered = filtered.filter((a) => a.account_status !== 1 && a.account_status !== 2 && a.account_status !== 7 && a.account_status !== 100);
    }

    // App ID filter
    if (appFilter !== 'all') {
      filtered = filtered.filter((a) => {
        const apps = accountAppIds[a.account_id] || [];
        return apps.includes(appFilter);
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.account_id.includes(q) ||
          a.id.includes(q) ||
          (a.business_name || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [accounts, statusFilter, appFilter, searchQuery, accountAppIds]);

  // Select/deselect all
  const handleSelectAll = useCallback(() => {
    if (selectedAccounts.size === filteredAccounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(filteredAccounts.map((a) => a.account_id)));
    }
  }, [filteredAccounts, selectedAccounts]);

  const toggleAccount = useCallback((accountId: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  // Submit appeal
  const handleAppeal = useCallback(async () => {
    if (!token) {
      toast.error('請先設定 Access Token');
      return;
    }
    if (!appealBmId.trim()) {
      toast.error('請輸入 Business Manager ID');
      return;
    }
    if (!appealAppId.trim()) {
      toast.error('請輸入 App ID');
      return;
    }
    if (selectedAccounts.size === 0) {
      toast.error('請選擇要申訴的帳號');
      return;
    }

    setAppealing(true);
    setAppealResults([]);
    try {
      const accountIds = Array.from(selectedAccounts);
      // API max 50 per request, batch if needed
      const allResults: AccountAppealResult[] = [];
      for (let i = 0; i < accountIds.length; i += 50) {
        const batch = accountIds.slice(i, i + 50);
        const result = await requestAdAccountReview(token, appealBmId.trim(), batch, appealAppId.trim());
        if (result.error) {
          toast.error(`申訴失敗: ${result.error}`, { duration: 15000 });
          break;
        }
        allResults.push(...result.results);
      }

      setAppealResults(allResults);

      const successCount = allResults.filter((r) => r.status === 'appeal_creation_success').length;
      const failCount = allResults.length - successCount;

      if (successCount > 0) {
        toast.success(`申訴已提交 — 成功: ${successCount}${failCount > 0 ? `, 失敗: ${failCount}` : ''}`, { duration: 8000 });
      } else if (allResults.length > 0) {
        toast.error(`所有 ${failCount} 個帳號申訴失敗`, { duration: 10000 });
      }
    } catch (err: unknown) {
      toast.error(`申訴錯誤: ${err instanceof Error ? err.message : '未知錯誤'}`);
    } finally {
      setAppealing(false);
    }
  }, [token, appealBmId, appealAppId, selectedAccounts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-rose-500" />
            帳號申訴管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看停用帳號、依 App 篩選、批次提交申訴
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleFetchAccounts}
            disabled={loading || !token}
            variant="default"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            取得帳號
          </Button>
          <Button
            onClick={handleFetchAppIds}
            disabled={loadingApps || !token || accounts.length === 0}
            variant="outline"
          >
            {loadingApps ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {appProgress.completed}/{appProgress.total}
              </>
            ) : (
              <>
                <Smartphone className="w-4 h-4 mr-2" />
                取得 App 資訊
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className={`cursor-pointer transition-all ${statusFilter === 'all' ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}`}
          onClick={() => setStatusFilter('all')}
        >
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">全部帳號</div>
            <div className="text-2xl font-bold">{statusCounts.all}</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${statusFilter === 'disabled' ? 'ring-2 ring-rose-500' : 'hover:shadow-md'}`}
          onClick={() => setStatusFilter('disabled')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-sm text-rose-600">
              <XCircle className="w-4 h-4" />
              停用帳號
            </div>
            <div className="text-2xl font-bold text-rose-600">{statusCounts.disabled}</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${statusFilter === 'pending_review' ? 'ring-2 ring-amber-500' : 'hover:shadow-md'}`}
          onClick={() => setStatusFilter('pending_review')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-sm text-amber-600">
              <AlertTriangle className="w-4 h-4" />
              審核中
            </div>
            <div className="text-2xl font-bold text-amber-600">{statusCounts.pending_review}</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${statusFilter === 'other' ? 'ring-2 ring-gray-500' : 'hover:shadow-md'}`}
          onClick={() => setStatusFilter('other')}
        >
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">其他狀態</div>
            <div className="text-2xl font-bold">{statusCounts.other}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜尋帳號名稱、ID、Business Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {uniqueAppIds.length > 0 && (
          <Select value={appFilter} onValueChange={setAppFilter}>
            <SelectTrigger className="w-[280px]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                <SelectValue placeholder="所有 App" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5" />
                  所有 App
                </div>
              </SelectItem>
              {uniqueAppIds.map((appId) => (
                <SelectItem key={appId} value={appId}>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                    {appNames[appId] ? `${appNames[appId]} (${appId})` : appId}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Appeal Configuration */}
      {filteredAccounts.some((a) => a.account_status === 2) && (
        <Card className="border-rose-200 dark:border-rose-900/50">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2 text-rose-600">
              <Send className="w-4 h-4" />
              批次申訴設定
            </h3>
            <p className="text-xs text-muted-foreground">
              選擇下方的停用帳號，填入 Business Manager ID 和 App ID 後提交申訴。
              每次最多申訴 50 個帳號。需要 business_management 權限和管理員身份。
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Business Manager ID</label>
                <Input
                  placeholder="例如: 123456789012345"
                  value={appealBmId}
                  onChange={(e) => setAppealBmId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">App ID</label>
                <Input
                  placeholder="例如: 987654321098765"
                  value={appealAppId}
                  onChange={(e) => setAppealAppId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAppeal}
                  disabled={appealing || selectedAccounts.size === 0 || !appealBmId || !appealAppId}
                  variant="destructive"
                >
                  {appealing ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  申訴 ({selectedAccounts.size})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Appeal Results */}
      {appealResults.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="font-semibold text-sm">申訴結果</h3>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {appealResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg text-sm ${
                    result.status === 'appeal_creation_success'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.status === 'appeal_creation_success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                    <span className="font-mono">{result.entity_id}</span>
                    <Badge
                      variant="outline"
                      className={
                        result.status === 'appeal_creation_success'
                          ? 'text-emerald-600 border-emerald-300'
                          : 'text-rose-600 border-rose-300'
                      }
                    >
                      {result.status === 'appeal_creation_success'
                        ? '申訴成功'
                        : result.status === 'appeal_entity_invalid'
                        ? '不可申訴'
                        : '申訴失敗'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{result.reason}</p>
                  {result.appeal_case_id && (
                    <p className="text-xs text-blue-600 mt-1">Case ID: {result.appeal_case_id}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account List Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedAccounts.size > 0
              ? `已選 ${selectedAccounts.size} / ${filteredAccounts.length}`
              : `全選 (${filteredAccounts.length})`}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          顯示 {filteredAccounts.length} / {accounts.length} 個帳號
        </span>
      </div>

      {/* Account List */}
      {filteredAccounts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground font-medium">
              {accounts.length === 0
                ? '尚未取得帳號，請點擊「取得帳號」'
                : '沒有符合篩選條件的帳號'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredAccounts.map((account) => {
            const isSelected = selectedAccounts.has(account.account_id);
            const apps = accountAppIds[account.account_id] || [];
            const appealUrl = getAppealUrl(account.account_id);
            const appealResult = appealResults.find(
              (r) => r.entity_id === account.account_id || r.entity_id === account.id.replace('act_', '')
            );

            return (
              <Card
                key={account.id}
                className={`transition-all ${
                  isSelected ? 'ring-2 ring-blue-500 bg-blue-50/30 dark:bg-blue-900/10' : 'hover:shadow-md'
                } ${account.account_status === 2 ? 'border-rose-200 dark:border-rose-900/40' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className="pt-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleAccount(account.account_id)}
                      />
                    </div>

                    {/* Account Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{account.name}</span>
                        <Badge className={`text-xs ${getStatusColor(account.account_status)}`}>
                          {getAccountStatusLabel(account.account_status)}
                        </Badge>
                        {appealResult && (
                          <Badge
                            variant="outline"
                            className={
                              appealResult.status === 'appeal_creation_success'
                                ? 'text-emerald-600 border-emerald-300'
                                : 'text-rose-600 border-rose-300'
                            }
                          >
                            {appealResult.status === 'appeal_creation_success'
                              ? '已提交申訴'
                              : appealResult.status === 'appeal_entity_invalid'
                              ? '不可申訴'
                              : '申訴失敗'}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <CopyableId label="帳號 ID" value={account.account_id} />
                        <CopyableId label="act_ID" value={account.id} />
                        {account.business_name && (
                          <span className="text-xs text-muted-foreground">
                            BM: {account.business_name}
                          </span>
                        )}
                        {account.currency && (
                          <span className="text-xs text-muted-foreground">
                            {account.currency}
                          </span>
                        )}
                      </div>

                      {/* App IDs */}
                      {apps.length > 0 && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                          {apps.map((appId) => (
                            <Badge key={appId} variant="outline" className="text-xs text-blue-600 border-blue-200">
                              {appNames[appId] ? `${appNames[appId]} (${appId})` : appId}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {appealUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(appealUrl, '_blank')}
                          title="在 Facebook 上申訴"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />
                          FB 申訴
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
