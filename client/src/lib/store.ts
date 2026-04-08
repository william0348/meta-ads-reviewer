/**
 * Local Storage Store
 * Persists settings, groups, accounts, and cached data in browser localStorage.
 */

import type { DisapprovedAd, AdAccount } from './metaApi';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'meta_ads_reviewer_token',
  MANUAL_ACCOUNTS: 'meta_ads_reviewer_manual_accounts',
  AUTO_FETCH: 'meta_ads_reviewer_auto_fetch',
  API_VERSION: 'meta_ads_reviewer_api_version',
  CACHED_ADS: 'meta_ads_reviewer_cached_ads',
  CACHED_ADS_TIMESTAMP: 'meta_ads_reviewer_cached_ads_ts',
  CACHED_ERRORS: 'meta_ads_reviewer_cached_errors',
  ACCOUNT_GROUPS: 'meta_ads_reviewer_groups',
  BM_ID_CACHE: 'meta_ads_reviewer_bm_ids',
  ACCOUNT_NAMES: 'meta_ads_reviewer_account_names',
  CACHED_AUTO_ACCOUNTS: 'meta_ads_reviewer_auto_accounts',
  EXCLUDED_ACCOUNTS: 'meta_ads_reviewer_excluded_accounts',
} as const;

// ── Access Token ──
export function getAccessToken(): string {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || '';
}
export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
}

// ── Manual Accounts ──
export function getManualAccounts(): string[] {
  const stored = localStorage.getItem(STORAGE_KEYS.MANUAL_ACCOUNTS);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}
export function setManualAccounts(accounts: string[]): void {
  localStorage.setItem(STORAGE_KEYS.MANUAL_ACCOUNTS, JSON.stringify(accounts));
}
export function addManualAccount(accountId: string): string[] {
  const accounts = getManualAccounts();
  const cleaned = accountId.trim().replace(/^act_/, '');
  if (cleaned && !accounts.includes(cleaned)) {
    accounts.push(cleaned);
    setManualAccounts(accounts);
  }
  return accounts;
}
export function removeManualAccount(accountId: string): string[] {
  const accounts = getManualAccounts().filter((id) => id !== accountId);
  setManualAccounts(accounts);
  return accounts;
}

// ── Auto Fetch ──
export function getAutoFetch(): boolean {
  const stored = localStorage.getItem(STORAGE_KEYS.AUTO_FETCH);
  return stored === null ? true : stored === 'true';
}
export function setAutoFetch(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.AUTO_FETCH, String(enabled));
}

// ── Account Groups ──
export interface AccountGroup {
  id: string;
  name: string;
  accountIds: string[]; // numeric ad account IDs (no act_ prefix)
  color: string; // hex color for visual identification
}

const GROUP_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export function getAccountGroups(): AccountGroup[] {
  const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNT_GROUPS);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}

export function setAccountGroups(groups: AccountGroup[]): void {
  localStorage.setItem(STORAGE_KEYS.ACCOUNT_GROUPS, JSON.stringify(groups));
}

export function createAccountGroup(name: string, accountIds: string[]): AccountGroup[] {
  const groups = getAccountGroups();
  const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const colorIndex = groups.length % GROUP_COLORS.length;
  groups.push({
    id,
    name,
    accountIds: accountIds.map((a) => a.replace(/^act_/, '')),
    color: GROUP_COLORS[colorIndex],
  });
  setAccountGroups(groups);
  return groups;
}

export function updateAccountGroup(groupId: string, updates: Partial<Omit<AccountGroup, 'id'>>): AccountGroup[] {
  const groups = getAccountGroups().map((g) =>
    g.id === groupId ? { ...g, ...updates } : g
  );
  setAccountGroups(groups);
  return groups;
}

export function deleteAccountGroup(groupId: string): AccountGroup[] {
  const groups = getAccountGroups().filter((g) => g.id !== groupId);
  setAccountGroups(groups);
  return groups;
}

export function addAccountToGroup(groupId: string, accountId: string): AccountGroup[] {
  const cleaned = accountId.replace(/^act_/, '');
  const groups = getAccountGroups().map((g) => {
    if (g.id === groupId && !g.accountIds.includes(cleaned)) {
      return { ...g, accountIds: [...g.accountIds, cleaned] };
    }
    return g;
  });
  setAccountGroups(groups);
  return groups;
}

export function removeAccountFromGroup(groupId: string, accountId: string): AccountGroup[] {
  const groups = getAccountGroups().map((g) => {
    if (g.id === groupId) {
      return { ...g, accountIds: g.accountIds.filter((id) => id !== accountId) };
    }
    return g;
  });
  setAccountGroups(groups);
  return groups;
}

// ── BM ID Cache ──
export interface BmIdEntry {
  accountId: string;
  bmId: string;       // Primary BM ID (agency if available, else owner)
  bmName: string;     // Primary BM Name
  ownerBmId?: string;
  ownerBmName?: string;
  agencyBmId?: string;
  agencyBmName?: string;
}

export function getBmIdCache(): Record<string, BmIdEntry> {
  const stored = localStorage.getItem(STORAGE_KEYS.BM_ID_CACHE);
  if (!stored) return {};
  try { return JSON.parse(stored); } catch { return {}; }
}

export function setBmIdForAccount(
  accountId: string,
  bmId: string,
  bmName: string,
  extra?: { ownerBmId?: string; ownerBmName?: string; agencyBmId?: string; agencyBmName?: string }
): void {
  const cache = getBmIdCache();
  cache[accountId] = {
    accountId, bmId, bmName,
    ...(extra?.ownerBmId ? { ownerBmId: extra.ownerBmId, ownerBmName: extra.ownerBmName } : {}),
    ...(extra?.agencyBmId ? { agencyBmId: extra.agencyBmId, agencyBmName: extra.agencyBmName } : {}),
  };
  localStorage.setItem(STORAGE_KEYS.BM_ID_CACHE, JSON.stringify(cache));
}

export function getAppealUrl(accountId: string): string | null {
  const cache = getBmIdCache();
  const entry = cache[accountId];
  if (!entry?.bmId) return null;
  const numericAccountId = accountId.replace(/^act_/, '');
  return `https://www.facebook.com/business-support-home/${entry.bmId}/${numericAccountId}/`;
}

// ── Cached Ads Data ──
export interface CachedAdsData {
  ads: DisapprovedAd[];
  errors: { accountId: string; error: string }[];
  timestamp: number;
}

export function getCachedAds(): CachedAdsData | null {
  try {
    const adsStr = localStorage.getItem(STORAGE_KEYS.CACHED_ADS);
    const tsStr = localStorage.getItem(STORAGE_KEYS.CACHED_ADS_TIMESTAMP);
    const errStr = localStorage.getItem(STORAGE_KEYS.CACHED_ERRORS);
    if (!adsStr || !tsStr) return null;

    return {
      ads: JSON.parse(adsStr),
      errors: errStr ? JSON.parse(errStr) : [],
      timestamp: parseInt(tsStr, 10),
    };
  } catch {
    return null;
  }
}

export function setCachedAds(ads: DisapprovedAd[], errors: { accountId: string; error: string }[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_ADS, JSON.stringify(ads));
    localStorage.setItem(STORAGE_KEYS.CACHED_ERRORS, JSON.stringify(errors));
    localStorage.setItem(STORAGE_KEYS.CACHED_ADS_TIMESTAMP, String(Date.now()));
  } catch (e) {
    console.warn('Failed to cache ads data:', e);
  }
}

export function clearCachedAds(): void {
  localStorage.removeItem(STORAGE_KEYS.CACHED_ADS);
  localStorage.removeItem(STORAGE_KEYS.CACHED_ADS_TIMESTAMP);
  localStorage.removeItem(STORAGE_KEYS.CACHED_ERRORS);
}

export function getCacheAge(): string | null {
  const tsStr = localStorage.getItem(STORAGE_KEYS.CACHED_ADS_TIMESTAMP);
  if (!tsStr) return null;
  const ts = parseInt(tsStr, 10);
  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小時前`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} 天前`;
}

// Helper: get all unique account IDs (manual + from groups)
export function getAllAccountIds(): string[] {
  const manual = getManualAccounts();
  const groups = getAccountGroups();
  const fromGroups = groups.flatMap((g) => g.accountIds);
  return Array.from(new Set([...manual, ...fromGroups]));
}

// Helper: get account IDs for a specific group
export function getAccountIdsForGroup(groupId: string): string[] {
  const group = getAccountGroups().find((g) => g.id === groupId);
  return group ? group.accountIds : [];
}

// ── Account Names Cache ──
export function getAccountNamesCache(): Record<string, string> {
  const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNT_NAMES);
  if (!stored) return {};
  try { return JSON.parse(stored); } catch { return {}; }
}

export function setAccountName(accountId: string, name: string): void {
  const cache = getAccountNamesCache();
  const cleaned = accountId.replace(/^act_/, '');
  cache[cleaned] = name;
  localStorage.setItem(STORAGE_KEYS.ACCOUNT_NAMES, JSON.stringify(cache));
}

export function setAccountNames(names: Record<string, string>): void {
  const cache = getAccountNamesCache();
  for (const [id, name] of Object.entries(names)) {
    cache[id.replace(/^act_/, '')] = name;
  }
  localStorage.setItem(STORAGE_KEYS.ACCOUNT_NAMES, JSON.stringify(cache));
}

// ── Cached Auto Accounts ──

export function getCachedAutoAccounts(): AdAccount[] {
  const stored = localStorage.getItem(STORAGE_KEYS.CACHED_AUTO_ACCOUNTS);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}

export function setCachedAutoAccounts(accounts: AdAccount[]): void {
  localStorage.setItem(STORAGE_KEYS.CACHED_AUTO_ACCOUNTS, JSON.stringify(accounts));
  // Also update account names cache
  const names: Record<string, string> = {};
  for (const acc of accounts) {
    const id = acc.account_id.replace(/^act_/, '');
    if (acc.name) names[id] = acc.name;
  }
  if (Object.keys(names).length > 0) setAccountNames(names);
}

// ── Excluded Accounts ──
export function getExcludedAccounts(): string[] {
  const stored = localStorage.getItem(STORAGE_KEYS.EXCLUDED_ACCOUNTS);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}

export function setExcludedAccounts(accountIds: string[]): void {
  localStorage.setItem(STORAGE_KEYS.EXCLUDED_ACCOUNTS, JSON.stringify(accountIds));
}

export function toggleExcludedAccount(accountId: string): string[] {
  const excluded = getExcludedAccounts();
  const cleaned = accountId.replace(/^act_/, '');
  const idx = excluded.indexOf(cleaned);
  if (idx >= 0) {
    excluded.splice(idx, 1);
  } else {
    excluded.push(cleaned);
  }
  setExcludedAccounts(excluded);
  return excluded;
}

export function isAccountExcluded(accountId: string): boolean {
  const cleaned = accountId.replace(/^act_/, '');
  return getExcludedAccounts().includes(cleaned);
}

// ── Clear All ──
export function clearAllSettings(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
