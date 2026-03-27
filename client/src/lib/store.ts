/**
 * Local Storage Store
 * Persists settings and cached data in browser localStorage.
 */

import type { DisapprovedAd } from './metaApi';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'meta_ads_reviewer_token',
  MANUAL_ACCOUNTS: 'meta_ads_reviewer_manual_accounts',
  AUTO_FETCH: 'meta_ads_reviewer_auto_fetch',
  API_VERSION: 'meta_ads_reviewer_api_version',
  CACHED_ADS: 'meta_ads_reviewer_cached_ads',
  CACHED_ADS_TIMESTAMP: 'meta_ads_reviewer_cached_ads_ts',
  CACHED_ERRORS: 'meta_ads_reviewer_cached_errors',
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
    // localStorage might be full; silently fail
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

// ── Clear All ──
export function clearAllSettings(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
